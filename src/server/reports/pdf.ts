import "server-only";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";

/** Simple, dependency-free tabular PDF reports (A4) in MOBA branding. */
export interface PdfSection {
  heading?: string;
  paragraphs?: string[];
  table?: { headers: string[]; rows: string[][]; widths: number[] };
}

const PAGE = { width: 595.28, height: 841.89, margin: 42 };
const RED = rgb(0.71, 0.09, 0.12);
const NAVY = rgb(0.08, 0.13, 0.24);
const GREY = rgb(0.4, 0.42, 0.47);

/** Standard fonts only support WinAnsi; replace anything else so generation never fails. */
function safe(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = safe(text).split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export async function buildPdfReport(title: string, subtitle: string, sections: PdfSection[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(safe(title));
  doc.setProducer("MOBA 2017 Digital Election Management System");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const contentWidth = PAGE.width - PAGE.margin * 2;
  let page: PDFPage = doc.addPage([PAGE.width, PAGE.height]);
  let y = 0;

  const header = () => {
    page.drawRectangle({ x: 0, y: PAGE.height - 56, width: PAGE.width, height: 56, color: RED });
    page.drawText("MOBA", { x: PAGE.margin, y: PAGE.height - 34, size: 20, font: bold, color: rgb(1, 1, 1) });
    page.drawText("Mfantsipim Old Boys Association, 2017 Year Group", {
      x: PAGE.margin + 70,
      y: PAGE.height - 31,
      size: 9,
      font,
      color: rgb(1, 0.92, 0.92),
    });
    y = PAGE.height - 80;
  };
  const ensure = (needed: number) => {
    if (y - needed < PAGE.margin + 20) {
      page = doc.addPage([PAGE.width, PAGE.height]);
      header();
    }
  };
  const text = (value: string, size: number, f: PDFFont, color = NAVY) => {
    for (const line of wrap(value, f, size, contentWidth)) {
      ensure(size + 4);
      page.drawText(line, { x: PAGE.margin, y, size, font: f, color });
      y -= size + 4;
    }
  };

  header();
  text(title, 16, bold);
  text(subtitle, 9, font, GREY);
  y -= 6;

  for (const section of sections) {
    if (section.heading) {
      y -= 6;
      text(section.heading, 12, bold, RED);
    }
    for (const p of section.paragraphs ?? []) text(p, 9.5, font);
    if (section.table) {
      const { headers, rows, widths } = section.table;
      const total = widths.reduce((a, b) => a + b, 0);
      const cols = widths.map((w) => (w / total) * contentWidth);
      const drawRow = (cells: string[], f: PDFFont, isShaded: boolean) => {
        const wrapped = cells.map((c, i) => wrap(c, f, 8.5, cols[i] - 6));
        const height = Math.max(...wrapped.map((w) => w.length)) * 11 + 4;
        ensure(height);
        if (isShaded) {
          page.drawRectangle({ x: PAGE.margin, y: y - height + 9, width: contentWidth, height, color: rgb(0.95, 0.95, 0.96) });
        }
        let x = PAGE.margin;
        wrapped.forEach((lines, i) => {
          lines.forEach((line, li) => page.drawText(line, { x: x + 3, y: y - li * 11, size: 8.5, font: f, color: NAVY }));
          x += cols[i];
        });
        y -= height;
      };
      y -= 2;
      drawRow(headers, bold, true);
      rows.forEach((r, i) => drawRow(r, font, i % 2 === 1));
      y -= 6;
    }
  }

  const pages = doc.getPages();
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 16);
  pages.forEach((p, i) =>
    p.drawText(`Generated ${stamp} UTC. Page ${i + 1} of ${pages.length}`, { x: PAGE.margin, y: 24, size: 7.5, font, color: GREY }),
  );
  return doc.save();
}

export function pdfResponse(fileName: string, bytes: Uint8Array): Response {
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName.replace(/[^a-z0-9._-]/gi, "_")}"`,
      "Cache-Control": "no-store",
    },
  });
}
