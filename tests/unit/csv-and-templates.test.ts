import { describe, expect, it } from "vitest";
import { escapeHtml, renderEmail, renderSubject } from "@/server/email/templates";
import { csvCell, toCsv } from "@/server/reports/csv";
import { parseMemberCsv } from "@/server/services/imports";

describe("CSV export", () => {
  it("neutralises spreadsheet formulas", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvCell("+233241234567")).toBe("'+233241234567");
    expect(csvCell("-5")).toBe("'-5");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  it("quotes commas, quotes and newlines and writes a UTF-8 BOM", () => {
    const out = toCsv(["a", "b"], [["x, y", 'say "hi"'], [null, new Date("2026-01-01T00:00:00Z")]]);
    expect(out.startsWith("﻿")).toBe(true);
    expect(out).toContain('"x, y","say ""hi"""');
    expect(out).toContain(",2026-01-01T00:00:00.000Z");
  });
});

describe("member CSV parsing", () => {
  it("accepts flexible headers and normalises values", () => {
    const rows = parseMemberCsv(
      "﻿Full Name,Email Address,Phone Number,Member ID,Sex\r\nKwame Asante, KWAME@Example.com ,+233 24 000 0001,M-1,m\r\n",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("valid");
    expect(rows[0].normalized).toEqual({
      fullName: "Kwame Asante",
      email: "kwame@example.com",
      phone: "+233 24 000 0001",
      membershipNumber: "M-1",
      gender: "Male",
    });
  });

  it("flags invalid rows and duplicates within the file", () => {
    const rows = parseMemberCsv(
      "full_name,email,membership_number\nA,not-an-email,\nKofi Mensah,kofi@example.com,X1\nKofi Again,KOFI@example.com,X2\nOther,other@example.com,x1\n",
    );
    expect(rows.map((r) => r.status)).toEqual(["invalid", "valid", "duplicate", "duplicate"]);
    expect(rows[2].errors[0]).toMatch(/duplicate of row 3/);
    expect(rows[3].errors[0]).toMatch(/membershipNumber: duplicate of row 3/);
  });

  it("rejects files without the required columns or without rows", () => {
    expect(() => parseMemberCsv("name,phone\nA,1\n")).toThrow(/full_name and email/);
    expect(() => parseMemberCsv("full_name,email\n")).toThrow(/no member rows/);
  });
});

describe("email templates", () => {
  it("escapes every variable", () => {
    expect(escapeHtml(`<script>alert("x")</script>&'`)).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;");
    const email = renderEmail("member_approved", { recipientName: "<b>Kofi</b>" });
    expect(email.html).toContain("Dear &lt;b&gt;Kofi&lt;/b&gt;,");
    expect(email.html).not.toContain("<b>Kofi</b>");
  });

  it("puts the temporary password only in the rendered body, never in the subject", () => {
    const vars = { recipientName: "Ama", loginEmail: "ama@example.com", loginUrl: "https://vote.example.org/login", expiresAt: "x" };
    const email = renderEmail("credentials", vars, { temporaryPassword: "Abc234def567" });
    expect(email.text).toContain("Abc234def567");
    expect(renderSubject("credentials", vars)).not.toContain("Abc234def567");
  });

  it("only allows http(s) links in buttons", () => {
    const email = renderEmail("results_published", { electionTitle: "T", resultsUrl: "javascript:alert(1)" });
    expect(email.html).not.toContain("javascript:");
  });

  it("never mentions choices in the vote confirmation", () => {
    const email = renderEmail("vote_confirmation", { electionTitle: "2026 Executive Elections", votedAt: "now" });
    expect(email.text).toMatch(/does not contain your choices/);
  });
});
