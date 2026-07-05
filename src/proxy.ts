import { NextResponse } from "next/server";
import { auth } from "@/auth";

const appRoutePrefixes = [
  "/dashboard",
  "/seo",
  "/ads",
  "/logo",
  "/product-photo",
  "/assets",
  "/credits",
  "/settings",
];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const role = req.auth?.user?.role;

  const isAdminRoute = pathname.startsWith("/admin");
  const isAppRoute = appRoutePrefixes.some((prefix) => pathname.startsWith(prefix));

  if (!isLoggedIn && (isAdminRoute || isAppRoute)) {
    const loginUrl = new URL("/login", req.nextUrl);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isLoggedIn && isAdminRoute && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/seo/:path*",
    "/ads/:path*",
    "/logo/:path*",
    "/product-photo/:path*",
    "/assets/:path*",
    "/credits/:path*",
    "/settings/:path*",
    "/admin/:path*",
  ],
};
