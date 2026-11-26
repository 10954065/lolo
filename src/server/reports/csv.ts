/**
 * CSV export with spreadsheet formula-injection protection (OWASP "CSV Injection"):
 * cells beginning with = + - @ TAB or CR are prefixed with an apostrophe.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function toCsv(headers: readonly string[], rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  const lines = [headers.map(csvCell).join(","), ...rows.map((row) => row.map(csvCell).join(","))];
  // BOM so Excel opens UTF-8 (e.g. names with accents) correctly.
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function csvResponse(fileName: string, body: string): Response {
  const safeName = fileName.replace(/[^a-z0-9._-]/gi, "_");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "no-store",
    },
  });
}
