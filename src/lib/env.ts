import { z } from "zod";

const optionalString = z.string().min(1).optional();

const encryptionKey = z
  .string()
  .refine((value) => Buffer.from(value, "base64").length === 32, {
    message: "must be 32 bytes encoded in base64 (openssl rand -base64 32)",
  });

export const envSchema = z.object({
  // App
  APP_URL: z.url(),
  ALLOWED_EMAIL: z.email(),
  TOKEN_ENCRYPTION_KEY: encryptionKey,
  CRON_SECRET: z.string().min(16),
  REPORT_TIMEZONE: z.string().min(1).default("America/Mexico_City"),

  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Google / YouTube (required from T05)
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  YOUTUBE_MONETARY: z.stringbool().default(false),

  // Meta (required from T08)
  META_APP_ID: optionalString,
  META_APP_SECRET: optionalString,
  META_GRAPH_VERSION: z
    .string()
    .regex(/^v\d+\.\d+$/, "must look like v26.0")
    .default("v26.0"),
  META_LOGIN_CONFIG_ID: optionalString,
  META_WEBHOOK_VERIFY_TOKEN: optionalString,

  // TikTok (required from T13)
  TIKTOK_CLIENT_KEY: optionalString,
  TIKTOK_CLIENT_SECRET: optionalString,

  // Alerts (T16)
  RESEND_API_KEY: optionalString,
  /** Contact shown on the public privacy page (optional; not the login email unless you want it public). */
  CONTACT_EMAIL: z.email().optional(),
  ALERT_EMAIL_TO: z.email().optional(),
  /** Sender for alert emails; Resend's test sender only delivers to the Resend account owner. */
  ALERT_EMAIL_FROM: z.string().min(3).default("Metrix <onboarding@resend.dev>"),
});

export type Env = z.infer<typeof envSchema>;

type EnvSource = Record<string, string | undefined>;

/**
 * Validates environment variables. Empty strings count as missing.
 * Error messages name the variables but never include their values.
 */
export function parseEnv(source: EnvSource): Env {
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ""),
  );

  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment variables (see .env.example):\n${problems}`,
    );
  }
  return result.data;
}

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
