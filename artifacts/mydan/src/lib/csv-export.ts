import { csvCell } from './csv-cell';
/**
 * Export data to CSV with UTF-8 BOM for seamless Microsoft Excel Arabic rendering.
 */
export type CsvColumn<T = any> = {
  header: string;
  key?: keyof T | string;
  accessor?: (row: T) => any;
};

export function exportToCsv<T = any>(
  filename: string,
  columns: CsvColumn<T>[],
  data: T[]
) {

  const headerRow = columns.map((c) => csvCell(c.header)).join(',');
  const dataRows = data.map((row) =>
    columns
      .map((col) => {
        const val = col.accessor ? col.accessor(row) : col.key ? (row as any)[col.key] : '';
        return csvCell(val);
      })
      .join(',')
  );

  // Prepend UTF-8 Byte Order Mark (\uFEFF) so Excel recognizes UTF-8 Arabic correctly
  const csvContent = '\uFEFF' + [headerRow, ...dataRows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
