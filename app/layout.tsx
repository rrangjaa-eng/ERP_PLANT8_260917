import type { Metadata } from "next";
import "./globals.css";
// D-21: 디자인 토큰을 상대 경로로 직접 import한다 — 복사본을 만들지 않는다.
import "../docs/design/tokens.css";
import { SessionRefresh } from "./session-refresh";

export const metadata: Metadata = {
  title: "PLANT8 ERP",
  description: "PLANT8 ERP — 프로젝트·지출결의·법인카드·손익 관리",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        {/* D-32: Pretendard 동적 서브셋 — 리포에 커밋된 자체 호스팅 파일, CDN 없음.
            next/font는 92분할 동적 서브셋 + unicode-range 구조를 그대로 못 옮겨
            수동 link가 필요하다(D-32 확정 절차). */}
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link rel="stylesheet" href="/fonts/pretendard/pretendard-dynamic-subset.css" />
      </head>
      <body>
        <SessionRefresh />
        {children}
      </body>
    </html>
  );
}
