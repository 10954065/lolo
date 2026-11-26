import "server-only";
import { headers } from "next/headers";

export interface RequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
}

const MAX_UA_LENGTH = 200;

/** Client IP and user agent of the current request (Vercel sets x-forwarded-for / x-real-ip). */
export async function getRequestMeta(): Promise<RequestMeta> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ipAddress = forwarded || h.get("x-real-ip")?.trim() || null;
  const userAgent = h.get("user-agent")?.slice(0, MAX_UA_LENGTH) ?? null;
  return { ipAddress, userAgent };
}
