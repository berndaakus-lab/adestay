import { z } from "zod";

/**
 * Environment configuration (docs/DEPLOYMENT_AND_OPERATIONS.md §2).
 * Read lazily so `next build` works without Supabase keys; a missing key fails at first use
 * with a clear message instead of a vague network error.
 */
const publicSupabaseSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({ message: "NEXT_PUBLIC_SUPABASE_URL must be the project URL" }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20, "NEXT_PUBLIC_SUPABASE_ANON_KEY is missing"),
});

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export function getPublicSupabaseEnv() {
  const parsed = publicSupabaseSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!parsed.success) {
    throw new ConfigurationError(
      `Supabase is not configured: ${parsed.error.issues.map((i) => i.message).join("; ")}. ` +
        "Set the variables in Vercel, or in .env.local for local development.",
    );
  }
  return { url: parsed.data.NEXT_PUBLIC_SUPABASE_URL, anonKey: parsed.data.NEXT_PUBLIC_SUPABASE_ANON_KEY };
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** Staff/platform host. Until the root domain is chosen (D-1), plain localhost is the app host. */
export function getAppHost(): string {
  return process.env.NEXT_PUBLIC_APP_HOST || "localhost";
}
