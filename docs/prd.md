# JSONL Formatter & Markdown Preview — Desktop App

## 项目概述

一个基于 **Tauri** 的桌面端应用，集成 JSON 格式化和 Markdown 实时预览功能。专为处理包含对话数据（如 LLM 训练数据、评测数据）的 JSONL 文件而设计。用户下载运行后可通过原生文件选择器打开 dataset 文件。

---

## 数据结构分析

```jsonl
{
  "mid": "/R0VUF1ucLVRWQhMK5ErLg==",
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "... (含 Markdown + 代码块)"}
  ]
}
```

**特征：**
- 每行一个 JSON 对象
- `mid` 为唯一标识
- `messages` 为对话消息数组
- `content` 字段可能包含大量 Markdown 文本和代码块（HTML/CSS/JS）
- 单条记录可能非常长（~78KB+）

---

## 系统架构

```
┌────────────────────────────────────────────────────────────────┐
│                    Tauri Desktop Shell                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   WebView (Frontend)                      │  │
│  │  ┌────────┬───────────────────────────┬───────────────┐  │  │
│  │  │Sidebar │      Main Content         │   Preview     │  │  │
│  │  │(条目列表)│   (JSON/Chat/Raw)         │  (Markdown)   │  │  │
│  │  └────────┴───────────────────────────┴───────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │               Rust Backend (Tauri Core)                   │  │
│  │  • 文件系统 I/O（流式读取大文件）                              │  │
│  │  • JSONL 解析引擎（Rust 高性能）                             │  │
│  │  • 原生文件对话框                                            │  │
│  │  • 窗口管理 & 系统托盘                                       │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### 技术选型

| 层级 | 技术 | 理由 |
|------|------|------|
| 桌面框架 | Tauri 2.x | 体积小(~5MB)、启动快、原生文件系统访问、安全沙箱 |
| 后端语言 | Rust | 高性能文件解析、内存安全、Tauri 原生支持 |
| 前端框架 | Vanilla HTML/CSS/JS | 简单直接、无额外构建复杂度 |
| JSON 高亮 | 自定义语法高亮 | 可折叠节点、类型着色 |
| Markdown 渲染 | marked.js (bundled) | 轻量、标准兼容 |
| 代码高亮 | highlight.js (bundled) | 多语言支持 |
| 样式 | Tailwind CSS (bundled) | 快速开发、美观 |
| 构建工具 | Vite | Tauri 官方推荐前端构建 |

---

## Tauri 后端设计（Rust）

### Tauri Commands

```rust
// 打开文件选择对话框，返回文件路径
#[tauri::command]
async fn open_file_dialog() -> Result<String, String>

// 流式读取 JSONL 文件，返回条目索引（id, mid, 消息数, 偏移量）
#[tauri::command]
async fn load_jsonl(path: String) -> Result<Vec<EntryIndex>, String>

// 按索引获取单条完整记录
#[tauri::command]
async fn get_entry(path: String, offset: u64, length: u64) -> Result<String, String>

// 获取文件统计信息
#[tauri::command]
async fn get_file_stats(path: String) -> Result<FileStats, String>

// 搜索匹配的条目
#[tauri::command]
async fn search_entries(path: String, query: String) -> Result<Vec<SearchResult>, String>

// 最近打开的文件列表
#[tauri::command]
async fn get_recent_files() -> Result<Vec<RecentFile>, String>
```

### 数据结构

```rust
struct EntryIndex {
    line_number: usize,
    mid: String,
    message_count: usize,
    byte_offset: u64,
    byte_length: u64,
    preview: String,  // 截取前 100 字符作为预览
}

struct FileStats {
    total_entries: usize,
    file_size: u64,
    avg_message_count: f32,
    role_distribution: HashMap<String, usize>,
    parse_errors: Vec<ParseError>,
}

struct RecentFile {
    path: String,
    name: String,
    last_opened: String,
    entry_count: usize,
}
```

### 文件解析策略

1. **首次加载** — Rust 端流式扫描文件，逐行记录 byte offset 和 length，提取 `mid` 和消息数
2. **按需加载** — 前端请求某条时，Rust 通过 offset seek 读取，无需加载全文件到内存
3. **错误容忍** — 无效 JSON 行标记为 error entry，不中断解析
4. **大文件支持** — 100MB+ 文件秒开（只读索引），单条按需加载

---

## 前端功能模块设计

### 模块 1：文件管理

| 功能 | 描述 |
|------|------|
| 原生文件选择器 | 通过 Tauri dialog 调起系统文件选择 |
| 最近文件列表 | 记录并展示最近打开的文件 |
| 拖拽打开 | 拖拽 `.jsonl` 文件到窗口打开 |
| 文件监听 | 监听文件变化自动刷新（可选） |

### 模块 2：JSONL 导航

| 功能 | 描述 |
|------|------|
| 条目列表 | 左侧显示所有条目，展示 `mid` 和消息数量 |
| 快速跳转 | 输入行号或 mid 直接跳转 |
| 搜索过滤 | 全文搜索 / 按字段过滤（Rust 端执行） |
| 虚拟滚动 | 大文件流畅滚动（只渲染可见区域） |
| 键盘快捷键 | `↑/↓` 切换条目，`Enter` 选中 |

### 模块 3：JSON Formatter

| 功能 | 描述 |
|------|------|
| 语法高亮 | 键/值按类型着色（string=绿色, number=蓝色, boolean=紫色, null=灰色） |
| 可折叠树 | 点击 `{}`/`[]` 折叠/展开嵌套结构 |
| 缩进控制 | 2/4 空格切换 |
| 行号显示 | 每行显示行号 |
| 路径面包屑 | 点击节点显示 JSONPath（如 `$.messages[0].content`） |
| 值类型标签 | 在值旁显示类型 badge |
| 大文本截断 | content 超过 500 字符时截断 + "展开" 按钮 |
| 原始/格式化切换 | 切换原始单行 JSON 和格式化视图 |
| 复制功能 | 复制整个 JSON / 复制选中节点 / 复制 JSONPath |
| 节点搜索 | 在当前 JSON 树中搜索 key 或 value |

### 模块 4：Markdown Preview

| 功能 | 描述 |
|------|------|
| 实时渲染 | 将 `content` 字段中的 Markdown 渲染为 HTML |
| 代码块高亮 | 支持 html/css/js/python/json 等语言语法高亮 |
| 代码块操作 | 每个代码块有"复制"和"在新窗口打开(HTML)"按钮 |
| HTML 预览 | HTML 代码块可通过 iframe sandbox 实时预览 |
| 消息分角色展示 | system/user/assistant 消息分区显示，不同背景色区分 |
| Markdown 原文切换 | 一键切换渲染视图和原始 Markdown 文本 |
| 图片渲染 | 支持 base64 图片和远程图片 |
| 表格渲染 | 支持 GFM 表格 |
| LaTeX 公式 | 支持 `$...$` 行内和 `$$...$$` 块级公式（KaTeX） |
| Mermaid 图表 | 支持 mermaid 代码块渲染为图表 |

### 模块 5：对话视图

| 功能 | 描述 |
|------|------|
| 聊天气泡模式 | 以对话气泡形式展示 messages |
| 角色头像/颜色 | system=灰色, user=蓝色, assistant=绿色 |
| 消息折叠 | 长消息可折叠，默认展示前 N 行 |
| 消息统计 | 显示每条消息的 token 数量估算和字符数 |
| 原始内容查看 | 每条消息可切换"渲染/原始"视图 |
| reasoning_content | 若存在 `reasoning_content` 字段，以可折叠块展示思考过程 |

### 模块 6：工具功能

| 功能 | 描述 |
|------|------|
| 统计面板 | 总条目数、平均消息数、平均 content 长度、角色分布 |
| 导出功能 | 导出选中条目为 JSON / 导出所有 Markdown / 导出 HTML 预览 |
| 主题切换 | 亮色/暗色/跟随系统 |
| 字体大小 | 可调节显示字体 |
| 窗口管理 | 多窗口打开不同文件 |
| 快捷键面板 | `?` 显示所有快捷键 |

---

## UI 布局详细设计

### 整体布局（三栏式）

```
┌─────────────────────────────────────────────────────────────────┐
│ [📁打开] [最近文件▼]  JSONL Preview    [搜索框]   [主题] [设置]  │
├────────────┬────────────────────────────┬───────────────────────┤
│            │  ┌─[JSON]─[Chat]─[Raw]─┐  │                       │
│  条目 #1   │  │                      │  │   Markdown Preview    │
│  条目 #2 ◀─│  │   JSON Formatter     │  │                       │
│  条目 #3   │  │   or Chat View       │  │   [渲染视图]           │
│  ...       │  │   or Raw Text        │  │   - system msg        │
│            │  │                      │  │   - user msg          │
│ ─────────  │  │                      │  │   - assistant msg     │
│ 搜索/过滤   │  └──────────────────────┘  │     └─ code blocks   │
│            │                            │     └─ HTML preview   │
├────────────┴────────────────────────────┴───────────────────────┤
│ 条目: 1/156 │ 大小: 78KB │ 消息: 3 │ tokens: ~2.4K │ UTF-8     │
└─────────────────────────────────────────────────────────────────┘
```

### 窗口配置

| 属性 | 值 |
|------|-----|
| 默认尺寸 | 1400 x 900 |
| 最小尺寸 | 900 x 600 |
| 标题栏 | 自定义（macOS 沉浸式，Windows 保留原生） |
| 菜单栏 | 文件 / 编辑 / 视图 / 帮助 |

---

## 交互设计

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Cmd/Ctrl+O` | 打开文件 |
| `Cmd/Ctrl+W` | 关闭当前文件 |
| `↑` / `↓` | 上/下一条记录 |
| `←` / `→` | 折叠/展开 JSON 节点 |
| `Cmd/Ctrl+F` | 搜索 |
| `Cmd/Ctrl+G` | 跳转到行 |
| `Cmd/Ctrl+C` | 复制选中内容 |
| `Cmd/Ctrl+Shift+C` | 复制当前 JSONPath |
| `Tab` | 切换面板焦点 |
| `1/2/3` | 切换 JSON/Chat/Raw 视图 |
| `Cmd/Ctrl+T` | 切换主题 |
| `?` | 显示快捷键帮助 |

### 拖拽分隔线

- 三个面板之间的分隔线可拖拽调节宽度
- 双击分隔线恢复默认比例
- 面板最小宽度：200px

---

## 性能优化策略

| 场景 | 策略 |
|------|------|
| 大文件 (>100MB) | Rust 端索引 + 按需 seek 读取 |
| 条目列表 | 虚拟滚动（只渲染可见行） |
| 长 JSON 节点 | 延迟渲染深层嵌套 |
| 大量 content | 分段渲染 Markdown |
| 多代码块 | highlight.js 按需加载语言包 |
| 频繁切换 | LRU 缓存已解析/已渲染的条目 |
| 搜索 | Rust 端多线程并行搜索 |

---

## 项目结构

```
md-preview/
├── src-tauri/                 # Tauri Rust 后端
│   ├── Cargo.toml
│   ├── tauri.conf.json        # Tauri 配置（窗口、权限等）
│   ├── src/
│   │   ├── main.rs            # 入口
│   │   ├── commands.rs        # Tauri commands（文件操作、解析）
│   │   ├── parser.rs          # JSONL 流式解析器
│   │   └── search.rs          # 搜索引擎
│   └── icons/                 # 应用图标
├── src/                       # 前端代码
│   ├── index.html             # 主页面
│   ├── main.js                # 前端入口
│   ├── styles/
│   │   └── main.css           # Tailwind + 自定义样式
│   ├── components/
│   │   ├── sidebar.js         # 条目导航列表
│   │   ├── json-formatter.js  # JSON 格式化器
│   │   ├── markdown-preview.js # Markdown 渲染器
│   │   ├── chat-view.js       # 对话视图
│   │   ├── toolbar.js         # 顶部工具栏
│   │   └── statusbar.js       # 底部状态栏
│   └── utils/
│       ├── virtual-scroll.js  # 虚拟滚动
│       ├── theme.js           # 主题管理
│       └── shortcuts.js       # 快捷键管理
├── dataset/
│   └── sample.jsonl           # 示例数据
├── docs/
│   └── prd.md                 # 本文档
├── package.json               # 前端依赖
├── vite.config.js             # Vite 配置
└── README.md
```

---

## 外部依赖

### 前端（npm）

| 包 | 用途 |
|----|------|
| @tauri-apps/api | Tauri 前端 API |
| marked | Markdown → HTML |
| highlight.js | 代码块语法高亮 |
| katex | LaTeX 公式渲染 |
| mermaid | 图表渲染 |

### 后端（Cargo）

| Crate | 用途 |
|-------|------|
| tauri | 桌面应用框架 |
| serde / serde_json | JSON 序列化 |
| tokio | 异步运行时 |
| memmap2 | 内存映射大文件 |

---

## 构建与分发

| 平台 | 产物 | 大小（预估） |
|------|------|------------|
| macOS | `.dmg` / `.app` | ~8MB |
| Windows | `.msi` / `.exe` | ~6MB |
| Linux | `.deb` / `.AppImage` | ~7MB |

构建命令：
```bash
# 开发模式
npm run tauri dev

# 构建发布包
npm run tauri build
```

---

## 实现优先级

### P0（核心功能 - 必须实现）

1. Tauri 项目脚手架 + 窗口基础
2. 原生文件选择器打开 JSONL 文件
3. Rust 端流式解析 + 索引构建
4. 条目导航列表（虚拟滚动）
5. JSON Formatter（语法高亮 + 折叠）
6. Markdown 渲染（含代码高亮）
7. 对话视图（角色区分）
8. 代码块复制
9. 暗色主题

### P1（重要功能 - 优先实现）

1. HTML 代码块 iframe 预览
2. 搜索过滤（Rust 端）
3. 最近文件列表
4. 快捷键支持
5. 面板宽度拖拽
6. 亮色主题切换
7. 状态栏统计
8. 拖拽文件打开

### P2（增强功能 - 后续迭代）

1. LaTeX 公式（KaTeX）
2. Mermaid 图表
3. 导出功能
4. 多窗口
5. reasoning_content 展示
6. 文件变化自动刷新
7. 字体大小调节
8. 系统托盘 / 全局快捷键

---

## 设计风格

- **主色调：** 深色背景 (#0f172a) + 绿色强调色 (#22c55e)
- **卡片风格：** 毛玻璃效果 (glass morphism)
- **字体：** 代码使用等宽字体 (JetBrains Mono)，UI 使用 Inter/system-ui
- **圆角：** 统一 8px/12px
- **动效：** 折叠展开 transition，面板切换 fade，hover 高亮
- **原生体验：** macOS 沉浸式标题栏，遵循各平台 HIG
