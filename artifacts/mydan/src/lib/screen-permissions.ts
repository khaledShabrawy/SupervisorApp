/** Screen access requires an explicit grant, including legacy accounts. */
export function isScreenAllowed(rows: { screen_key: string; is_enabled: boolean }[], key: string): boolean {
  return rows.find((r) => r.screen_key === key)?.is_enabled === true;
}
