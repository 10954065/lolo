import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import { Resend } from "resend";
import { env, isProduction } from "@/server/env";
import type { RenderedEmail } from "./templates";

export interface OutgoingEmail extends RenderedEmail {
  to: string;
}

export interface EmailTransport {
  readonly name: string;
  send(message: OutgoingEmail, options: { idempotencyKey: string }): Promise<{ providerMessageId: string | null }>;
}

class ResendTransport implements EmailTransport {
  readonly name = "resend";
  private readonly client: Resend;

  constructor(apiKey: string) {
    this.client = new Resend(apiKey);
  }

  async send(message: OutgoingEmail, options: { idempotencyKey: string }) {
    const e = env();
    const { data, error } = await this.client.emails.send(
      {
        from: e.EMAIL_FROM,
        to: [message.to],
        replyTo: e.EMAIL_REPLY_TO,
        subject: message.subject,
        html: message.html,
        text: message.text,
      },
      { idempotencyKey: options.idempotencyKey },
    );
    if (error) throw new Error(`Resend error: ${error.name}: ${error.message}`.slice(0, 300));
    return { providerMessageId: data?.id ?? null };
  }
}

/** Development only: writes each email to ./.mail-outbox (git-ignored). Refused in production. */
class FileTransport implements EmailTransport {
  readonly name = "file";

  async send(message: OutgoingEmail, options: { idempotencyKey: string }) {
    if (isProduction() && !env().APP_URL.startsWith("http://localhost")) {
      throw new Error("File email transport is disabled in production.");
    }
    // Relative to the working directory; deliberately not built from process.cwd() so the
    // bundler does not trace the whole project into the serverless function.
    const dir = process.env.MAIL_OUTBOX_DIR ?? ".mail-outbox";
    await mkdir(dir, { recursive: true });
    const safeTo = message.to.replace(/[^a-z0-9@._-]/gi, "_");
    const stamp = new Date().toISOString().replaceAll(":", "-");
    const base = `${dir}/${stamp}_${safeTo}_${options.idempotencyKey.slice(0, 8)}`;
    await writeFile(`${base}.html`, message.html, "utf8");
    await writeFile(`${base}.txt`, `To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}`, "utf8");
    return { providerMessageId: `file:${options.idempotencyKey}` };
  }
}

let override: EmailTransport | null = null;

/** Tests only: route all email through an in-memory transport. */
export function setEmailTransportForTests(transport: EmailTransport | null): void {
  override = transport;
}

export function getEmailTransport(): EmailTransport {
  if (override) return override;
  const e = env();
  if (e.emailTransport === "resend") {
    if (!e.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured.");
    return new ResendTransport(e.RESEND_API_KEY);
  }
  return new FileTransport();
}
