import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  const appMode = "ampro";
  const pathname = request.nextUrl.pathname || "";

  const isPublicAsset = (p: string) => {
    return (
      p.startsWith("/_next") ||
      p.startsWith("/icons") ||
      p.startsWith("/images") ||
      p.startsWith("/favicon") ||
      p === "/manifest.webmanifest" ||
      p === "/robots.txt" ||
      p === "/sitemap.xml"
    );
  };

  // AmPro-only workspace historically only allowed /ampro routes.
  // Permit the public landing pages at `/` and `/start` so unauthenticated
  // visitors can reach the new start/welcome flow.
  if (!isPublicAsset(String(pathname))) {
    // Allow root and /start to pass through to the app
    if (pathname === "/" || pathname === "/start") {
      // continue to normal handling
    } else if (!(pathname.startsWith("/ampro") || pathname.startsWith("/api/ampro"))) {
      if (pathname.startsWith("/api")) {
        return new NextResponse("Not Found", { status: 404 });
      }
      const url = request.nextUrl.clone();
      url.pathname = "/ampro";
      return NextResponse.redirect(url);
    }
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "").trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      `Your project's URL and Key are required to create a Supabase client. Missing/empty: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY. (APP_MODE=${appMode})`,
    );
  }

  const supabase = createServerClient(
    supabaseUrl!,
    supabaseAnonKey!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    },
  );

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect /teacher and /teacher/dashboard to /dashboard.
  // Other /teacher/* pages (courses, timesheets, payrolls, etc.) are active.
  try {
    const p = String(pathname);
    const isTeacherRoot = p === '/teacher' || p === '/teacher/';
    const isTeacherDashboard = p === '/teacher/dashboard' || p.startsWith('/teacher/dashboard/');

    if (isTeacherRoot || isTeacherDashboard) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
    // Redirect debug/troubleshooting login page to dashboard so it's not publicly reachable
    if (String(pathname).startsWith("/debug-auth")) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  } catch (e) {
    // ignore
  }
  // Optional: Add any auth-based redirects here if needed
  // For now, we just refresh the session and continue

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
