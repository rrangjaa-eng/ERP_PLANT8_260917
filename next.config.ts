import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pg", "@google-cloud/cloud-sql-connector"],
  // E2E(Playwright)가 127.0.0.1:3100으로 접속한다 — Next 15+의 dev 리소스
  // cross-origin 보호가 기본으로 이를 막아 클라이언트 번들이 하이드레이션되지
  // 않고 폼이 네이티브 GET 제출로 대체되는 문제가 있었다.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
