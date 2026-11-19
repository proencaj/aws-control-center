import { NextResponse, type NextRequest } from "next/server";
const region = /^[a-z]{2}(-[a-z]+)+-\d$/;
const REGION_COOKIE = "region";

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.endsWith("/data") || request.nextUrl.pathname === "/ecs/options")
    return NextResponse.next();
  const selected = request.nextUrl.searchParams.get("region");
  if (!selected || !region.test(selected) || request.cookies.get(REGION_COOKIE)?.value === selected)
    return NextResponse.next();

  const response = NextResponse.redirect(request.nextUrl);
  response.cookies.set(REGION_COOKIE, selected, { path: "/", sameSite: "lax" });
  return response;
}

export const config = {
  matcher: ["/", "/ec2/:path*", "/ecs/:path*", "/logs-monitor/:path*", "/logs-explorer/:path*"],
};
