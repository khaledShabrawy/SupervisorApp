type Report = Record<string, any> | null | undefined;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const percentage = (value: unknown): number | null => finite(value) && value >= 0 && value <= 100 ? value : null;

/** Historical synthetic client results are not measurements and must not enter analytics. */
export function isMeasuredAudit(report: Report): boolean {
  return report?.engine !== 'smart-vision-engine';
}

export function shelfMetrics(report: Report) {
  if (!isMeasuredAudit(report)) return { ourFacings: null, competitorFacings: null, share: null };
  const our = report?.target_brand_metrics?.facings ?? report?.our_facings;
  const legacyCompetitors = report?.competitors_metrics;
  const competitor = Array.isArray(legacyCompetitors) && legacyCompetitors.every(c => finite(c.facings) && c.facings >= 0)
    ? legacyCompetitors.reduce((sum, c) => sum + c.facings, 0)
    : report?.competitor_facings;
  const ourFacings = finite(our) && our >= 0 ? our : null;
  const competitorFacings = finite(competitor) && competitor >= 0 ? competitor : null;
  const explicit = percentage(report?.target_brand_metrics?.share_of_shelf_percentage);
  const share = explicit ?? (ourFacings !== null && competitorFacings !== null && ourFacings + competitorFacings > 0
    ? ourFacings / (ourFacings + competitorFacings) * 100 : null);
  return { ourFacings, competitorFacings, share };
}
