export const DEFAULT_MAPPING = {
  format: 'chat',
  task_id_field: 'task_id',
  messages_field: 'messages',
  prompt_field: 'prompt',
  result_field: 'result',
};

export function getMapping() {
  try {
    const raw = localStorage.getItem('fieldMapping');
    return raw ? { ...DEFAULT_MAPPING, ...JSON.parse(raw) } : { ...DEFAULT_MAPPING };
  } catch {
    return { ...DEFAULT_MAPPING };
  }
}

export function saveMapping(mapping) {
  localStorage.setItem('fieldMapping', JSON.stringify(mapping));
}
