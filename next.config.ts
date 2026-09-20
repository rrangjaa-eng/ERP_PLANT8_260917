import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pg", "@google-cloud/cloud-sql-connector"],
  // E2E(Playwright)가 127.0.0.1:3100으로 접속한다 — Next 15+의 dev 리소스
  // cross-origin 보호가 기본으로 이를 막아 클라이언트 번들이 하이드레이션되지
  // 않고 폼이 네이티브 GET 제출로 대체되는 문제가 있었다.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // dev 전용 <nextjs-portal> 오버레이가 페이지 로드 뒤 첫 Tab 대상을 스킵 링크보다
  // 앞서 가로챈다(02-07 실측) — 프로덕션 빌드(webServer가 CI에서 쓰는 build+start)
  // 에는 존재하지 않는 인디케이터라 끈다고 동작이 달라지지 않는다. §10의 "첫 Tab =
  // 스킵 링크" 계약을 dev 서버로 도는 test/e2e/keyboard-nav.spec.ts가 검증할 수 있게
  // 하기 위한 변경(Rule 3, 02-07).
  devIndicators: false,
};

export default nextConfig;
