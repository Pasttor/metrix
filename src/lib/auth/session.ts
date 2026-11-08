import "server-only";
import { getSessionEmail } from "@/lib/db/server";
import { getEnv } from "@/lib/env";
import { isAllowedEmail } from "./access";

/** For API routes (the proxy leaves /api public): true only for the allowed user. */
export async function isAuthorizedUser(): Promise<boolean> {
  return isAllowedEmail(await getSessionEmail(), getEnv().ALLOWED_EMAIL);
}
