export function toggleListValue(current: string, preset: string): string {
  const parts = current
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.includes(preset)) {
    return parts.filter((p) => p !== preset).join(", ");
  }
  return [...parts, preset].join(", ");
}
