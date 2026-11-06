/** Export untrusted text as a literal cell rather than a spreadsheet formula. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  // Preserve numeric values; neutralize formula prefixes even after whitespace/control characters.
  if (typeof value !== 'number' && /^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}
