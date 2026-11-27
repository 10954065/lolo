/**
 * MOBA 2017 branded transactional email templates.
 * Every variable is HTML-escaped. Templates never contain ballot choices or receipts.
 */
export const EMAIL_TEMPLATES = [
  "registration_confirmation",
  "member_approved",
  "credentials",
  "password_changed",
  "password_reset",
  "election_announcement",
  "election_opening",
  "election_reminder",
  "election_closing",
  "vote_confirmation",
  "results_published",
] as const;
export type EmailTemplate = (typeof EMAIL_TEMPLATES)[number];

export const TEMPLATE_LABELS: Record<EmailTemplate, string> = {
  registration_confirmation: "Registration confirmation",
  member_approved: "Membership approved",
  credentials: "Login credentials",
  password_changed: "Password changed",
  password_reset: "Password reset",
  election_announcement: "Election announcement",
  election_opening: "Voting opened",
  election_reminder: "Voting reminder",
  election_closing: "Voting closed",
  vote_confirmation: "Participation confirmation",
  results_published: "Results published",
};

export type TemplateVars = Record<string, string>;

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const BRAND_RED = "#B5171E";
const NAVY = "#14213D";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Only http(s) links may appear in emails. */
function safeHref(href: string): string {
  return /^https?:\/\//i.test(href) ? href : "#";
}

interface Block {
  kind: "p" | "button" | "code" | "note" | "facts";
  text?: string;
  href?: string;
  facts?: Array<[string, string]>;
}

function renderBlockHtml(b: Block): string {
  switch (b.kind) {
    case "p":
      return `<p style="margin:0 0 16px;line-height:1.6;color:#1f2937;font-size:15px">${escapeHtml(b.text ?? "").replaceAll("\n", "<br>")}</p>`;
    case "note":
      return `<p style="margin:0 0 16px;line-height:1.5;color:#4b5563;font-size:13px;background:#f3f4f6;border-left:3px solid ${BRAND_RED};padding:10px 12px">${escapeHtml(b.text ?? "")}</p>`;
    case "code":
      return `<p style="margin:0 0 16px"><span style="display:inline-block;font-family:Consolas,Menlo,monospace;font-size:20px;letter-spacing:2px;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:6px;padding:10px 16px;color:${NAVY}">${escapeHtml(b.text ?? "")}</span></p>`;
    case "button":
      return `<p style="margin:8px 0 24px"><a href="${escapeHtml(safeHref(b.href ?? ""))}" style="display:inline-block;background:${BRAND_RED};color:#ffffff;text-decoration:none;font-weight:600;border-radius:8px;padding:12px 22px;font-size:15px">${escapeHtml(b.text ?? "")}</a></p>`;
    case "facts":
      return `<table role="presentation" style="margin:0 0 16px;border-collapse:collapse;font-size:14px">${(b.facts ?? [])
        .map(
          ([k, val]) =>
            `<tr><td style="padding:4px 16px 4px 0;color:#6b7280;vertical-align:top">${escapeHtml(k)}</td><td style="padding:4px 0;color:#111827;font-weight:600">${escapeHtml(val)}</td></tr>`,
        )
        .join("")}</table>`;
  }
}

function renderBlockText(b: Block): string {
  if (b.kind === "button") return `${b.text}: ${safeHref(b.href ?? "")}`;
  if (b.kind === "facts") return (b.facts ?? []).map(([k, val]) => `${k}: ${val}`).join("\n");
  return b.text ?? "";
}

function layout(title: string, greeting: string, blocks: Block[], orgName: string): Omit<RenderedEmail, "subject"> {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:Segoe UI,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" style="background:#f5f6f8;padding:24px 0"><tr><td align="center">
<table role="presentation" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
<tr><td style="background:${BRAND_RED};padding:20px 28px">
<div style="color:#ffffff;font-size:26px;font-weight:800;letter-spacing:0.5px">MOBA</div>
<div style="color:#fde8e9;font-size:12px;margin-top:2px">Mfantsipim Old Boys Association &middot; ${escapeHtml(orgName)} Elections</div>
</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:20px;color:${NAVY}">${escapeHtml(title)}</h1>
<p style="margin:0 0 16px;line-height:1.6;color:#1f2937;font-size:15px">${escapeHtml(greeting)}</p>
${blocks.map(renderBlockHtml).join("\n")}
</td></tr>
<tr><td style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5">
This is an automated message from the ${escapeHtml(orgName)} Digital Election Management System. Never reply with your password.<br>
Platform developed by Sunleon Router Enterprise.
</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${title}\n\n${greeting}\n\n${blocks.map(renderBlockText).join("\n\n")}\n\n${orgName} Digital Election Management System`;
  return { html, text };
}

const val = (vars: TemplateVars, key: string): string => vars[key] ?? "";

type TemplateFn = (vars: TemplateVars, secrets: TemplateVars) => { title: string; subject: string; blocks: Block[] };

const TEMPLATES: Record<EmailTemplate, TemplateFn> = {
  registration_confirmation: (vars) => ({
    title: "You have been registered",
    subject: "Your MOBA 2017 election registration",
    blocks: [
      {
        kind: "p",
        text: "Your details have been added to the MOBA 2017 election register. The election administrator will review and approve your registration.",
      },
      {
        kind: "p",
        text: "Once you are approved and an election is approaching, you will receive your personal login details by email.",
      },
      { kind: "facts", facts: [["Registered email", val(vars, "email")]] },
    ],
  }),
  member_approved: () => ({
    title: "Your membership has been approved",
    subject: "MOBA 2017 elections: membership approved",
    blocks: [
      {
        kind: "p",
        text: "Your registration has been approved. You can now be included on the voter roll for MOBA 2017 elections.",
      },
      { kind: "p", text: "Your personal login details will be sent in a separate email before voting opens." },
    ],
  }),
  credentials: (vars, secrets) => ({
    title: "Your election login details",
    subject: "Your MOBA 2017 election login details",
    blocks: [
      {
        kind: "p",
        text: "Here are your personal login details for the MOBA 2017 election platform. Keep them private and do not forward this email.",
      },
      {
        kind: "facts",
        facts: [
          ["Email", val(vars, "loginEmail")],
          ["Valid until", val(vars, "expiresAt")],
        ],
      },
      { kind: "p", text: "Temporary password:" },
      { kind: "code", text: val(secrets, "temporaryPassword") },
      { kind: "button", text: "Sign in", href: val(vars, "loginUrl") },
      {
        kind: "note",
        text: "You will be asked to choose your own password the first time you sign in. The temporary password stops working after the date above. Election officials will never ask you for your password.",
      },
    ],
  }),
  password_changed: (vars) => ({
    title: "Your password was changed",
    subject: "MOBA 2017 elections: password changed",
    blocks: [
      { kind: "p", text: `Your password was changed on ${val(vars, "changedAt")}.` },
      { kind: "note", text: "If you did not do this, contact the election administrator immediately." },
    ],
  }),
  password_reset: (vars, secrets) => ({
    title: "Reset your password",
    subject: "MOBA 2017 elections: password reset",
    blocks: [
      { kind: "p", text: "We received a request to reset the password for your election account." },
      { kind: "button", text: "Choose a new password", href: val(secrets, "resetUrl") },
      {
        kind: "note",
        text: `This link can be used once and expires in ${val(vars, "expiresInMinutes")} minutes. If you did not request a reset, ignore this email. Your password will not change.`,
      },
    ],
  }),
  election_announcement: (vars) => ({
    title: val(vars, "announcementTitle") || "Election announcement",
    subject: `MOBA 2017: ${val(vars, "announcementTitle") || "Election announcement"}`,
    blocks: [
      { kind: "p", text: val(vars, "announcementBody") },
      ...(val(vars, "electionUrl")
        ? [{ kind: "button" as const, text: "View election", href: val(vars, "electionUrl") }]
        : []),
    ],
  }),
  election_opening: (vars) => ({
    title: `Voting is now open: ${val(vars, "electionTitle")}`,
    subject: `Voting is open: ${val(vars, "electionTitle")}`,
    blocks: [
      {
        kind: "p",
        text: "Voting is now open. Sign in with your personal login details to review the candidates and cast your ballot.",
      },
      { kind: "facts", facts: [["Voting closes", val(vars, "closesAt")]] },
      { kind: "button", text: "Go to the ballot", href: val(vars, "electionUrl") },
      { kind: "note", text: "Your vote is secret. Nobody, including the administrators, can see how you voted." },
    ],
  }),
  election_reminder: (vars) => ({
    title: `Reminder: ${val(vars, "electionTitle")}`,
    subject: `Reminder: please vote in ${val(vars, "electionTitle")}`,
    blocks: [
      { kind: "p", text: "Our records show you have not yet voted. There is still time." },
      { kind: "facts", facts: [["Voting closes", val(vars, "closesAt")]] },
      { kind: "button", text: "Vote now", href: val(vars, "electionUrl") },
    ],
  }),
  election_closing: (vars) => ({
    title: `Voting has closed: ${val(vars, "electionTitle")}`,
    subject: `Voting closed: ${val(vars, "electionTitle")}`,
    blocks: [
      { kind: "p", text: "Voting has now closed. Thank you to everyone who took part." },
      {
        kind: "p",
        text: "Results will be published on the platform once the System Administrator has authorised publication.",
      },
    ],
  }),
  vote_confirmation: (vars) => ({
    title: "Your participation has been recorded",
    subject: `You voted in ${val(vars, "electionTitle")}`,
    blocks: [
      { kind: "p", text: `This confirms that you took part in ${val(vars, "electionTitle")}.` },
      { kind: "facts", facts: [["Recorded at", val(vars, "votedAt")]] },
      {
        kind: "note",
        text: "For your privacy this email does not contain your choices or your ballot receipt. Your ballot cannot be changed.",
      },
    ],
  }),
  results_published: (vars) => ({
    title: `Results published: ${val(vars, "electionTitle")}`,
    subject: `Results: ${val(vars, "electionTitle")}`,
    blocks: [
      { kind: "p", text: "The official results have been published." },
      { kind: "button", text: "View results", href: val(vars, "resultsUrl") },
    ],
  }),
};

export function renderEmail(
  template: EmailTemplate,
  vars: TemplateVars,
  secrets: TemplateVars = {},
  orgName = "MOBA 2017",
): RenderedEmail {
  const def = TEMPLATES[template](vars, secrets);
  const greeting = vars.recipientName ? `Dear ${vars.recipientName},` : "Hello,";
  return { subject: def.subject, ...layout(def.title, greeting, def.blocks, orgName) };
}

/** Subject only (no secrets needed) — stored on the outbox row at enqueue time. */
export function renderSubject(template: EmailTemplate, vars: TemplateVars): string {
  return TEMPLATES[template](vars, {}).subject;
}
