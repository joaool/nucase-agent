interface Props {
  columns: string[];
  rows: Record<string, unknown>[];
}

// Column-name words that should render fully uppercase (acronyms) rather
// than just title-cased, e.g. counterparty_iban -> "Counterparty IBAN".
const HEADER_ACRONYMS = new Set(["iban", "snc"]);

function formatHeader(column: string) {
  return column
    .split("_")
    .map((word) =>
      HEADER_ACRONYMS.has(word.toLowerCase())
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(" ");
}

function formatCell(value: unknown) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return value.toLocaleString();
  return String(value);
}

// Long free-text fields (e.g. a contract's full text) would otherwise blow
// out the row width instead of wrapping or scrolling nicely — truncate with
// an ellipsis and expose the full value as a native tooltip on hover.
const LONG_TEXT_THRESHOLD = 60;

function renderCell(value: unknown) {
  const formatted = formatCell(value);
  if (formatted.length > LONG_TEXT_THRESHOLD) {
    return (
      <span className="block max-w-[360px] truncate" title={formatted}>
        {formatted}
      </span>
    );
  }
  return formatted;
}

export function DataTable({ columns, rows }: Props) {
  if (columns.length === 0) {
    return (
      <div className="p-10 text-center text-[13px] text-muted">No data configured for this table yet.</div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                className="sticky top-0 whitespace-nowrap border-b border-subtle bg-panel px-4 py-2.5 text-left font-medium text-secondary"
              >
                {formatHeader(col)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="p-10 text-center text-[13px] text-muted" colSpan={columns.length}>
                No rows yet.
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i} className="hover:bg-elevated-hover">
                {columns.map((col) => (
                  <td key={col} className="whitespace-nowrap border-b border-subtle px-4 py-[9px] text-primary">
                    {renderCell(row[col])}
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
