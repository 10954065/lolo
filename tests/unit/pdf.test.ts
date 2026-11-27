import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildPdfReport } from "@/server/reports/pdf";

describe("PDF reports", () => {
  it("produces a valid multi-page PDF and tolerates characters outside Latin-1", async () => {
    const rows = Array.from({ length: 120 }, (_, i) => [`Member “${i}” — Kwabena Ɔsei`, "MOBA-17", "Not voted"]);
    const bytes = await buildPdfReport("Participation — Test", "Subtitle", [
      { heading: "Table", table: { headers: ["Member", "No.", "Voted"], widths: [4, 2, 3], rows } },
    ]);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });
});
