import type { ReactNode } from 'react';

export interface TableColumn<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
}

interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  emptyMessage?: string;
}

export default function Table<T extends Record<string, unknown>>({
  columns,
  rows,
  getRowKey,
  emptyMessage = 'No records found.',
}: TableProps<T>) {
  return (
    <div className="overflow-x-auto rounded-md border border-brand-cream-dark">
      <table className="w-full text-sm font-body text-left">
        <thead className="bg-brand-cream text-brand-brown-dark">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="px-4 py-2.5 font-heading font-semibold text-xs uppercase tracking-wide">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-cream-dark">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-6 text-center text-brand-brown-light">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={getRowKey(row)} className="hover:bg-brand-cream/50">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-2.5 text-body">
                    {col.render ? col.render(row) : String(row[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
