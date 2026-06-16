use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldMapping {
    pub task_id_field: String,
    pub messages_field: String,
    pub prompt_field: String,
    pub result_field: String,
}

impl Default for FieldMapping {
    fn default() -> Self {
        Self {
            task_id_field: "task_id".to_string(),
            messages_field: "messages".to_string(),
            prompt_field: "prompt".to_string(),
            result_field: "result".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntryIndex {
    pub line_number: usize,
    pub task_id: String,
    pub message_count: usize,
    pub byte_offset: u64,
    pub byte_length: u64,
    pub preview: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileStats {
    pub total_entries: usize,
    pub file_size: u64,
    pub avg_message_count: f32,
    pub parse_errors: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub line_number: usize,
    pub task_id: String,
    pub matched_text: String,
}

pub fn build_index(path: &Path, mapping: &FieldMapping) -> Result<Vec<EntryIndex>, String> {
    let file = File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;
    let mut reader = BufReader::new(file);
    let mut entries = Vec::new();
    let mut byte_offset: u64 = 0;
    let mut line_number: usize = 0;
    let mut line_raw = String::new();

    loop {
        line_raw.clear();
        let bytes_read = reader
            .read_line(&mut line_raw)
            .map_err(|e| format!("Read error at line {}: {}", line_number + 1, e))?;
        if bytes_read == 0 {
            break; // EOF
        }
        line_number += 1;

        // use actual bytes read (handles \n, \r\n correctly)
        let byte_length = bytes_read as u64;

        // Trim line endings for JSON parsing
        let line = line_raw.trim_end_matches(|c: char| c == '\n' || c == '\r');

        if line.is_empty() {
            byte_offset += byte_length;
            continue;
        }

        match serde_json::from_str::<serde_json::Value>(line) {
            Ok(value) => {
                // task_id: support both string and integer
                let task_id = if let Some(s) = value.get(&mapping.task_id_field).and_then(|v| v.as_str()) {
                    s.to_string()
                } else if let Some(n) = value.get(&mapping.task_id_field).and_then(|v| v.as_i64()) {
                    n.to_string()
                } else {
                    String::new()
                };

                // Format A: {task_id, messages: [{role, content}...]}
                // Format B: {task_id, prompt, result}
                let (message_count, preview) = if let Some(msgs) = value.get(&mapping.messages_field).and_then(|v| v.as_array()) {
                    let count = msgs.len();
                    let first_user = msgs.iter().find(|m| {
                        m.get("role").and_then(|r| r.as_str()) == Some("user")
                    });
                    let prev = first_user
                        .and_then(|m| m.get("content"))
                        .and_then(|c| c.as_str())
                        .map(|s| s.chars().take(100).collect::<String>())
                        .unwrap_or_default();
                    (count, prev)
                } else if value.get(&mapping.prompt_field).is_some() || value.get(&mapping.result_field).is_some() {
                    // prompt/result format: count prompt+result as 2 messages
                    let mut count = 0;
                    if value.get(&mapping.prompt_field).is_some() { count += 1; }
                    if value.get(&mapping.result_field).is_some() { count += 1; }
                    let prev = value.get(&mapping.prompt_field)
                        .and_then(|v| v.as_str())
                        .map(|s| s.chars().take(100).collect::<String>())
                        .or_else(|| {
                            value.get(&mapping.result_field)
                                .and_then(|v| v.as_str())
                                .map(|s| s.chars().take(100).collect::<String>())
                        })
                        .unwrap_or_default();
                    (count, prev)
                } else {
                    // Fallback: try result field for preview
                    let prev = value.get(&mapping.result_field)
                        .and_then(|v| v.as_str())
                        .map(|s| s.chars().take(100).collect::<String>())
                        .unwrap_or_default();
                    (0, prev)
                };

                entries.push(EntryIndex {
                    line_number,
                    task_id,
                    message_count,
                    byte_offset,
                    byte_length,
                    preview,
                });
            }
            Err(_) => {
                entries.push(EntryIndex {
                    line_number,
                    task_id: "[PARSE ERROR]".to_string(),
                    message_count: 0,
                    byte_offset,
                    byte_length,
                    preview: line.chars().take(100).collect(),
                });
            }
        }

        byte_offset += byte_length;
    }

    Ok(entries)
}

pub fn read_entry(path: &Path, offset: u64, length: u64) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;
    file.seek(SeekFrom::Start(offset))
        .map_err(|e| format!("Seek error: {}", e))?;

    let mut buffer = Vec::with_capacity(length as usize);
    file.take(length).read_to_end(&mut buffer)
        .map_err(|e| format!("Read error: {}", e))?;

    // Trim trailing newline
    if buffer.last() == Some(&b'\n') {
        buffer.pop();
    }
    if buffer.last() == Some(&b'\r') {
        buffer.pop();
    }

    String::from_utf8(buffer).map_err(|e| format!("UTF-8 decode error: {}", e))
}

pub fn get_file_stats(path: &Path, entries: &[EntryIndex]) -> Result<FileStats, String> {
    let metadata = std::fs::metadata(path).map_err(|e| format!("Metadata error: {}", e))?;

    let total_entries = entries.len();
    let parse_errors = entries
        .iter()
        .filter(|e| e.task_id == "[PARSE ERROR]")
        .count();
    let valid_entries = total_entries - parse_errors;
    let total_messages: usize = entries.iter().map(|e| e.message_count).sum();
    let avg_message_count = if valid_entries > 0 {
        total_messages as f32 / valid_entries as f32
    } else {
        0.0
    };

    Ok(FileStats {
        total_entries,
        file_size: metadata.len(),
        avg_message_count,
        parse_errors,
    })
}

pub fn search_entries(
    path: &Path,
    entries: &[EntryIndex],
    query: &str,
    limit: usize,
) -> Result<Vec<SearchResult>, String> {
    let query_lower = query.to_lowercase();
    let mut results = Vec::new();
    let mut need_deep = Vec::new();

    // First pass: check previews (no I/O)
    for entry in entries {
        if entry.preview.to_lowercase().contains(&query_lower)
            || entry.task_id.to_lowercase().contains(&query_lower)
        {
            results.push(SearchResult {
                line_number: entry.line_number,
                task_id: entry.task_id.clone(),
                matched_text: entry.preview.clone(),
            });
            if results.len() >= limit {
                return Ok(results);
            }
        } else {
            need_deep.push(entry);
        }
    }

    // Second pass: sequential reads for remaining entries
    if !need_deep.is_empty() {
        let mut file = File::open(path)
            .map_err(|e| format!("Failed to open file for search: {}", e))?;
        let mut buffer = vec![0u8; 0];

        for entry in need_deep {
            file.seek(SeekFrom::Start(entry.byte_offset))
                .map_err(|e| format!("Seek error: {}", e))?;

            buffer.resize(entry.byte_length as usize, 0);
            file.read_exact(&mut buffer)
                .map_err(|e| format!("Read error: {}", e))?;

            // Trim trailing newline
            let mut len = buffer.len();
            if len > 0 && buffer[len - 1] == b'\n' { len -= 1; }
            if len > 0 && buffer[len - 1] == b'\r' { len -= 1; }

            let text = std::str::from_utf8(&buffer[..len]).unwrap_or("");
            let text_lower = text.to_lowercase();

            if text_lower.contains(&query_lower) {
                let chars: Vec<char> = text.chars().collect();
                let total_chars = chars.len();
                let query_chars = query.chars().count();
                // Find match position in char indices via the lowercase version
                let lower_chars: Vec<char> = text_lower.chars().collect();
                let char_start = lower_chars
                    .windows(query_chars)
                    .position(|w| w.iter().collect::<String>() == query_lower)
                    .unwrap_or(0);
                let context_start = char_start.saturating_sub(30);
                let context_end = (char_start + query_chars + 30).min(total_chars);
                let matched_text: String = chars[context_start..context_end].iter().collect();
                results.push(SearchResult {
                    line_number: entry.line_number,
                    task_id: entry.task_id.clone(),
                    matched_text,
                });
                if results.len() >= limit {
                    return Ok(results);
                }
            }
        }
    }

    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn write_temp_file(name: &str, content: &str) -> String {
        let dir = std::env::temp_dir();
        let path = dir.join(format!("prism_test_{}_{}.jsonl", name, std::process::id()));
        let mut f = File::create(&path).unwrap();
        f.write_all(content.as_bytes()).unwrap();
        path.to_str().unwrap().to_string()
    }

    // ── build_index ──────────────────────────────────────────

    #[test]
    fn build_index_chat_format() {
        let jsonl = "{\"task_id\":\"t1\",\"messages\":[{\"role\":\"user\",\"content\":\"hello\"},{\"role\":\"assistant\",\"content\":\"hi\"}]}\n{\"task_id\":\"t2\",\"messages\":[{\"role\":\"user\",\"content\":\"what is rust?\"}]}\n";
        let path = write_temp_file("chat_format", jsonl);
        let mapping = FieldMapping::default();
        let entries = build_index(Path::new(&path), &mapping).unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].task_id, "t1");
        assert_eq!(entries[0].message_count, 2);
        assert_eq!(entries[0].preview, "hello");
        assert_eq!(entries[1].task_id, "t2");
        assert_eq!(entries[1].message_count, 1);
        assert_eq!(entries[1].preview, "what is rust?");
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn build_index_prompt_result_format() {
        let jsonl = "{\"task_id\":\"t3\",\"prompt\":\"explain async\",\"result\":\"async is ...\"}\n";
        let path = write_temp_file("prompt_result", jsonl);
        let mapping = FieldMapping::default();
        let entries = build_index(Path::new(&path), &mapping).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].message_count, 2); // prompt + result
        assert_eq!(entries[0].preview, "explain async");
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn build_index_skips_empty_lines() {
        let jsonl = "\n{\"task_id\":\"t1\",\"messages\":[{\"role\":\"user\",\"content\":\"a\"}]}\n\n{\"task_id\":\"t2\",\"messages\":[{\"role\":\"user\",\"content\":\"b\"}]}\n";
        let path = write_temp_file("empty_lines", jsonl);
        let mapping = FieldMapping::default();
        let entries = build_index(Path::new(&path), &mapping).unwrap();
        assert_eq!(entries.len(), 2);
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn build_index_parse_error_tolerance() {
        let jsonl = "{\"task_id\":\"t1\",\"messages\":[{\"role\":\"user\",\"content\":\"ok\"}]}\nthis is not valid json\n{\"task_id\":\"t2\",\"messages\":[{\"role\":\"user\",\"content\":\"also ok\"}]}\n";
        let path = write_temp_file("parse_error", jsonl);
        let mapping = FieldMapping::default();
        let entries = build_index(Path::new(&path), &mapping).unwrap();
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[1].task_id, "[PARSE ERROR]");
        assert_eq!(entries[0].task_id, "t1");
        assert_eq!(entries[2].task_id, "t2");
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn build_index_task_id_integer() {
        let jsonl = "{\"task_id\":123,\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}\n";
        let path = write_temp_file("int_id", jsonl);
        let mapping = FieldMapping::default();
        let entries = build_index(Path::new(&path), &mapping).unwrap();
        assert_eq!(entries[0].task_id, "123");
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn build_index_crlf_line_endings() {
        // Build file with explicit \r\n bytes
        let json_line = "{\"task_id\":\"t1\",\"messages\":[{\"role\":\"user\",\"content\":\"hello\"}]}";
        let content = format!("{}\r\n", json_line);
        let path = write_temp_file("crlf", &content);
        let mapping = FieldMapping::default();
        let entries = build_index(Path::new(&path), &mapping).unwrap();
        assert_eq!(entries.len(), 1, "expected 1 entry, got {}: {:?}", entries.len(), entries.iter().map(|e| &e.task_id).collect::<Vec<_>>());
        assert_eq!(entries[0].task_id, "t1");
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn build_index_custom_field_mapping() {
        let jsonl = "{\"id\":\"abc\",\"msgs\":[{\"role\":\"user\",\"content\":\"test\"}]}\n";
        let path = write_temp_file("custom_map", jsonl);
        let mapping = FieldMapping {
            task_id_field: "id".to_string(),
            messages_field: "msgs".to_string(),
            ..Default::default()
        };
        let entries = build_index(Path::new(&path), &mapping).unwrap();
        assert_eq!(entries[0].task_id, "abc");
        assert_eq!(entries[0].message_count, 1);
        std::fs::remove_file(&path).ok();
    }

    // ── read_entry ───────────────────────────────────────────

    #[test]
    fn read_entry_basic() {
        let jsonl = "{\"task_id\":\"t1\",\"messages\":[{\"role\":\"user\",\"content\":\"hello\"}]}\n";
        let path = write_temp_file("read_basic", jsonl);
        let mapping = FieldMapping::default();
        let entries = build_index(Path::new(&path), &mapping).unwrap();
        let entry = &entries[0];
        let raw = read_entry(Path::new(&path), entry.byte_offset, entry.byte_length).unwrap();
        assert!(raw.starts_with("{\"task_id\""));
        assert!(!raw.ends_with('\n'));
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn read_entry_trims_newline() {
        let jsonl = "{\"a\":1}\n{\"b\":2}\n";
        let path = write_temp_file("read_trim", jsonl);
        let mapping = FieldMapping {
            task_id_field: "a".to_string(),
            ..Default::default()
        };
        let entries = build_index(Path::new(&path), &mapping).unwrap();
        // second entry
        let raw = read_entry(
            Path::new(&path),
            entries[1].byte_offset,
            entries[1].byte_length,
        )
        .unwrap();
        assert_eq!(raw, "{\"b\":2}");
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn read_entry_trims_crlf() {
        let json_line = "{\"a\":1}";
        let content = format!("{}\r\n", json_line);
        let path = write_temp_file("read_crlf", &content);
        let mapping = FieldMapping::default();
        let entries = build_index(Path::new(&path), &mapping).unwrap();
        let raw = read_entry(Path::new(&path), entries[0].byte_offset, entries[0].byte_length).unwrap();
        assert_eq!(raw, json_line);
        std::fs::remove_file(&path).ok();
    }

    // ── get_file_stats ───────────────────────────────────────

    #[test]
    fn get_file_stats_normal() {
        let jsonl = "{\"task_id\":\"t1\",\"messages\":[{\"role\":\"user\",\"content\":\"hello\"}]}\n{\"task_id\":\"t2\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"},{\"role\":\"assistant\",\"content\":\"hey\"}]}\n";
        let path = write_temp_file("stats_normal", jsonl);
        let mapping = FieldMapping::default();
        let entries = build_index(Path::new(&path), &mapping).unwrap();
        let stats = get_file_stats(Path::new(&path), &entries).unwrap();
        assert_eq!(stats.total_entries, 2);
        assert!(stats.file_size > 0);
        assert_eq!(stats.parse_errors, 0);
        assert!((stats.avg_message_count - 1.5).abs() < 0.01);
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn get_file_stats_empty_file() {
        let jsonl = "\n";
        let path = write_temp_file("stats_empty", jsonl);
        let mapping = FieldMapping::default();
        let entries = build_index(Path::new(&path), &mapping).unwrap();
        assert_eq!(entries.len(), 0);
        let stats = get_file_stats(Path::new(&path), &entries).unwrap();
        assert_eq!(stats.total_entries, 0);
        assert_eq!(stats.avg_message_count, 0.0);
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn get_file_stats_with_parse_errors() {
        let jsonl = "{\"task_id\":\"t1\",\"messages\":[]}\nbad json here\n{\"task_id\":\"t2\",\"messages\":[]}\n";
        let path = write_temp_file("stats_errors", jsonl);
        let mapping = FieldMapping::default();
        let entries = build_index(Path::new(&path), &mapping).unwrap();
        let stats = get_file_stats(Path::new(&path), &entries).unwrap();
        assert_eq!(stats.total_entries, 3);
        assert_eq!(stats.parse_errors, 1);
        std::fs::remove_file(&path).ok();
    }

    // ── search_entries ───────────────────────────────────────

    #[test]
    fn search_hit_in_preview() {
        let jsonl = "{\"task_id\":\"task-apple\",\"messages\":[{\"role\":\"user\",\"content\":\"learn about fruit\"}]}\n";
        let path = write_temp_file("search_preview", jsonl);
        let mapping = FieldMapping::default();
        let entries = build_index(Path::new(&path), &mapping).unwrap();
        let results = search_entries(Path::new(&path), &entries, "apple", 100).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].task_id, "task-apple");
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn search_deep_hit() {
        let jsonl = "{\"task_id\":\"t1\",\"messages\":[{\"role\":\"assistant\",\"content\":\"the answer is forty-two\"}]}\n";
        let path = write_temp_file("search_deep", jsonl);
        let mapping = FieldMapping::default();
        let entries = build_index(Path::new(&path), &mapping).unwrap();
        // "forty-two" is in assistant content, not in preview (preview looks for user.first)
        assert!(!entries[0].preview.contains("forty"));
        let results = search_entries(Path::new(&path), &entries, "forty-two", 100).unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].matched_text.contains("forty-two"));
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn search_no_match() {
        let jsonl = "{\"task_id\":\"t1\",\"messages\":[{\"role\":\"user\",\"content\":\"hello\"}]}\n";
        let path = write_temp_file("search_none", jsonl);
        let mapping = FieldMapping::default();
        let entries = build_index(Path::new(&path), &mapping).unwrap();
        let results = search_entries(Path::new(&path), &entries, "zzz_nonexistent", 100).unwrap();
        assert_eq!(results.len(), 0);
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn search_hit_in_task_id() {
        let jsonl = "{\"task_id\":\"important-task-42\",\"messages\":[{\"role\":\"user\",\"content\":\"x\"}]}\n";
        let path = write_temp_file("search_taskid", jsonl);
        let mapping = FieldMapping::default();
        let entries = build_index(Path::new(&path), &mapping).unwrap();
        let results = search_entries(Path::new(&path), &entries, "important", 100).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].task_id, "important-task-42");
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn search_case_insensitive() {
        let jsonl = "{\"task_id\":\"t1\",\"messages\":[{\"role\":\"user\",\"content\":\"Hello WORLD\"}]}\n";
        let path = write_temp_file("search_case", jsonl);
        let mapping = FieldMapping::default();
        let entries = build_index(Path::new(&path), &mapping).unwrap();
        let results = search_entries(Path::new(&path), &entries, "world", 100).unwrap();
        assert_eq!(results.len(), 1);
        std::fs::remove_file(&path).ok();
    }
}
