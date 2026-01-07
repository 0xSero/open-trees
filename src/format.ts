const MAX_DETAIL_LENGTH = 200;

const pad = (value: string, width: number) => value.padEnd(width, " ");

const sanitizeCell = (value: string) => value.replaceAll("|", "\\|");

const trimDetail = (value: string) => {
  if (value.length <= MAX_DETAIL_LENGTH) return value;
  return `${value.slice(0, MAX_DETAIL_LENGTH)}...`;
};

const quoteArg = (value: string) => {
  if (value === "") return '""';
  if (/[^A-Za-z0-9._\/-]/.test(value)) {
    return JSON.stringify(value);
  }
  return value;
};

export const formatCommand = (parts: string[]) => parts.map(quoteArg).join(" ");

export const renderTable = (headers: string[], rows: string[][]) => {
  const sanitizedHeaders = headers.map(sanitizeCell);
  const sanitizedRows = rows.map((row) => row.map((cell) => sanitizeCell(cell)));
  const widths = sanitizedHeaders.map((header, index) => {
    const rowWidths = sanitizedRows.map((row) => (row[index] ?? "").length);
    return Math.max(header.length, ...rowWidths, 3);
  });

  const headerLine = `| ${sanitizedHeaders
    .map((header, index) => pad(header, widths[index]))
    .join(" | ")} |`;
  const dividerLine = `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`;
  const rowLines = sanitizedRows.map(
    (row) => `| ${row.map((cell, index) => pad(cell, widths[index])).join(" | ")} |`,
  );

  return [headerLine, dividerLine, ...rowLines].join("\n");
};

export const formatError = (
  title: string,
  options: { hint?: string; command?: string; details?: string } = {},
) => {
  const lines = [`Error: ${title}`];

  if (options.hint) lines.push(`Hint: ${options.hint}`);
  if (options.command) lines.push(`Command: ${options.command}`);
  if (options.details) lines.push(`Details: ${trimDetail(options.details)}`);

  return lines.join("\n");
};
