"use server";

import { z } from "zod";
import { isAllowedEmail, safeNextPath } from "@/lib/auth/access";
import { createClient } from "@/lib/db/server";
import { getEnv } from "@/lib/env";

export type LoginState =
  | { status: "idle" }
  | { status: "sent" }
  | { status: "error"; message: string };

const formSchema = z.object({
  email: z.email(),
  next: z.string().optional(),
});

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = formSchema.safeParse({
    email: formData.get("email"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    return { status: "error", message: "Escribe un correo válido." };
  }

  const env = getEnv();
  const { email, next } = parsed.data;

  // Only the allowed email gets a link (and a Supabase user). Everyone else sees
  // the same confirmation so the allowed address is not revealed.
  if (!isAllowedEmail(email, env.ALLOWED_EMAIL)) {
    return { status: "sent" };
  }

  const redirectTo = new URL("/auth/confirm", env.APP_URL);
  redirectTo.searchParams.set("next", safeNextPath(next));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo.toString(), shouldCreateUser: true },
  });

  if (error) {
    const rateLimited = error.status === 429 || error.code === "over_email_send_rate_limit";
    return {
      status: "error",
      message: rateLimited
        ? "Se enviaron demasiados enlaces. Espera unos minutos y vuelve a intentarlo."
        : "No se pudo enviar el enlace. Inténtalo de nuevo.",
    };
  }

  return { status: "sent" };
}
