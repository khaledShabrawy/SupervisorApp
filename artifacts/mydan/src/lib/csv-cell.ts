/** Preserve real numbers; neutralize spreadsheet formulas in every text column, including headers. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value !== 'number' && (/^[\s\uFEFF]*[=+@-]/u.test(text) || /^[\t\r\n]/.test(text))) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
