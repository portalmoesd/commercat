import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that require authentication
const PROTECTED_ROUTES = ["/chat", "/orders", "/settings", "/admin"];

// Routes that should redirect to /chat if already authenticated
const AUTH_ROUTES = ["/login", "/signup"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check for Supabase auth session cookie
  // @supabase/ssr stores cookies with the pattern: sb-{ref}-auth-token
  // It may also chunk them: sb-{ref}-auth-token.0, sb-{ref}-auth-token.1, etc.
  const allCookies = request.cookies.getAll();
  const hasSession = allCookies.some(
    (cookie) =>
      cookie.name.includes("auth-token") ||
      cookie.name.includes("access-token") ||
      cookie.name.includes("refresh-token")
  );

  // Redirect unauthenticated users away from protected routes
  const isProtected = PROTECTED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );
  if (isProtected && !hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users away from auth pages
  const isAuthRoute = AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );
  if (isAuthRoute && hasSession) {
    return NextResponse.redirect(new URL("/chat", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/chat/:path*",
    "/orders/:path*",
    "/settings/:path*",
    "/admin/:path*",
    "/login",
    "/signup",
  ],
};
