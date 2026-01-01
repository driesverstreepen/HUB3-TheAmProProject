import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  const appMode = (process.env.APP_MODE || process.env.NEXT_PUBLIC_APP_MODE || "hub3").trim().toLowerCase();
  const pathname = request.nextUrl.pathname || "";
  const allowAmproInHub3 =
    (process.env.ENABLE_AMPRO_ROUTES || "").toLowerCase() === "true" ||
    process.env.NODE_ENV !== "production";

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

  // Strict route separation for separate deployments.
  // AmPro deployment: only allow /ampro and /api/ampro.
  if (appMode === "ampro" && !isPublicAsset(String(pathname))) {
    if (pathname === "/") {
      const url = request.nextUrl.clone();
      url.pathname = "/ampro";
      return NextResponse.redirect(url);
    }

    if (!(pathname.startsWith("/ampro") || pathname.startsWith("/api/ampro"))) {
      if (pathname.startsWith("/api")) {
        return new NextResponse("Not Found", { status: 404 });
      }
      const url = request.nextUrl.clone();
      url.pathname = "/ampro";
      return NextResponse.redirect(url);
    }
  }

  // HUB3 deployment: hide AmPro routes.
  if (
    appMode !== "ampro" &&
    !allowAmproInHub3 &&
    (pathname.startsWith("/ampro") || pathname.startsWith("/api/ampro"))
  ) {
    return new NextResponse("Not Found", { status: 404 });
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl =
    appMode === "ampro"
      ? process.env.NEXT_PUBLIC_AMPRO_SUPABASE_URL
      : process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey =
    appMode === "ampro"
      ? process.env.NEXT_PUBLIC_AMPRO_SUPABASE_ANON_KEY
      : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
