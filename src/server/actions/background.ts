import "server-only";
import { after } from "next/server";
import { logger } from "@/server/logger";
import { dispatchDueEmails } from "@/server/services/email-queue";

/** Send queued emails after the response is sent (Vercel keeps the function alive via waitUntil). */
export function dispatchEmailsLater(): void {
  after(async () => {
    try {
      await dispatchDueEmails();
    } catch (error) {
      logger.error("background email dispatch failed", error);
    }
  });
}
