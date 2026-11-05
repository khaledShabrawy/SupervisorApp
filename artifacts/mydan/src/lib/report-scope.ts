// Historical BI views may still return sales columns. They are outside Mydan's active product scope.
export function isOperationalReportColumn(column: string): boolean {
  if (/^price_tag_/.test(column)) return true; // Shelf evidence, not monetary pricing.
  return !/(^|_)(orders?|sales|prices?|amounts?|revenue|invoices?|payments?|collections?|returns?)(_|$)/i.test(column)
    && !/طلب|مبيع|سعر|مبلغ|فاتور|تحصيل|إيراد|مدفوع/.test(column);
}
export function operationalReportRows<T extends Record<string,unknown>>(rows: T[]): Record<string,unknown>[] {
  return rows.map(row=>Object.fromEntries(Object.entries(row).filter(([column])=>isOperationalReportColumn(column))));
}
