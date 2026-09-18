import { NextResponse, type NextRequest } from "next/server";
import { clientIp, CLIENT_IP_HEADER } from "@/lib/client-ip";

// Next.js 16 proxy 파일(구 middleware.ts). /api/auth/*로 오는 로그인 요청의
// x-client-ip를 clientIp(req.headers)로 항상 덮어써서, better-auth·잠금 훅이
// 위조 불가능한 단일 헤더만 읽게 한다(Eng Issue 1). 클라이언트가 보낸
// x-client-ip는 무조건 무시한다.
export function proxy(req: NextRequest): NextResponse {
  const headers = new Headers(req.headers);
  headers.set(CLIENT_IP_HEADER, clientIp(req.headers) ?? "127.0.0.1");
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/api/auth/:path*"],
};
