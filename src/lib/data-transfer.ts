const EXCLUDED_KEYS = new Set(["etoro-api-keys"]);

export function exportLocalStorage(): string {
  const data: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || EXCLUDED_KEYS.has(key)) continue;
    data[key] = localStorage.getItem(key)!;
  }
  return JSON.stringify(data, null, 2);
}

export function importLocalStorage(raw: string): { imported: number } {
  const data = JSON.parse(raw) as Record<string, unknown>;
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("Invalid format: expected a JSON object");
  }
  let imported = 0;
  for (const [key, value] of Object.entries(data)) {
    if (EXCLUDED_KEYS.has(key)) continue;
    if (typeof value !== "string") continue;
    localStorage.setItem(key, value);
    imported++;
  }
  return { imported };
}
