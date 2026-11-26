import { Resend } from "resend";
import { env } from "@/server/env";
import { logger } from "@/server/logger";
import { applyProviderEvent } from "@/server/services/email-queue";

interface ResendEvent {
  type: string;
  data?: { email_id?: string; bounce?: { message?: string } };
}

/**
 * Resend delivery webhooks (Svix-signed). Updates email_jobs to DELIVERED / BOUNCED /
 * COMPLAINED / FAILED so the administrator and committee can see real delivery status.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = env().RESEND_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "Webhook not configured" }, { status: 503 });

  const payload = await request.text();
  let event: ResendEvent;
  try {
    event = new Resend(env().RESEND_API_KEY ?? "re_unused").webhooks.verify({
      payload,
      headers: {
        id: request.headers.get("svix-id") ?? "",
        timestamp: request.headers.get("svix-timestamp") ?? "",
        signature: request.headers.get("svix-signature") ?? "",
      },
      webhookSecret: secret,
    }) as ResendEvent;
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  const emailId = event.data?.email_id;
  if (!emailId) return Response.json({ ok: true, ignored: true });
  try {
    const isMatched = await applyProviderEvent(event.type, emailId, event.data?.bounce?.message);
    return Response.json({ ok: true, matched: isMatched });
  } catch (error) {
    logger.error("resend webhook processing failed", error, { type: event.type });
    return Response.json({ error: "Processing failed" }, { status: 500 });
  }
}
