import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config";

// /review — 공개 확인증 화면(/c/*)은 동의·서명·제출을 받는다. 다른 사이트가
// iframe으로 감싸 누르게 하지 못하게 한다(클릭재킹).
describe("확인증 공개 경로 헤더", () => {
  it("/c/*는 프레임에 담기지 않는다(X-Frame-Options DENY · frame-ancestors 'none')", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const cert = rules.find((r) => r.source === "/c/:path*");
    const byKey = new Map((cert?.headers ?? []).map((h) => [h.key, h.value]));
    expect(byKey.get("X-Frame-Options")).toBe("DENY");
    expect(byKey.get("Content-Security-Policy")).toBe("frame-ancestors 'none'");
  });
});
