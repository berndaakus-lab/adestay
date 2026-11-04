import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicSupabaseEnv } from "@/lib/server/env";

/** True when the request carries a Supabase auth cookie (sb-<project>-auth-token...). */
export function hasSupabaseSession(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
}

/**
 * Continues the request with the given (sanitised) headers and refreshes the Supabase session
 * if it is close to expiry, writing rotated cookies to both the request (for this render) and
 * the response (for the browser). @supabase/ssr pattern adapted to keep our internal headers.
 */
export async function nextWithSessionRefresh(request: NextRequest, headers: Headers): Promise<NextResponse> {
  let response = NextResponse.next({ request: { headers } });
  if (!hasSupabaseSession(request)) return response;

  const { url, anonKey } = getPublicSupabaseEnv();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        const cookieHeader = request.headers.get("cookie");
        if (cookieHeader) headers.set("cookie", cookieHeader);
        response = NextResponse.next({ request: { headers } });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  // Validates the JWT (and refreshes it when needed). Do not add logic between client creation
  // and this call: a stale session could otherwise log users out at random.
  await supabase.auth.getClaims();
  response.headers.set("cache-control", "private, no-store");
  return response;
}
