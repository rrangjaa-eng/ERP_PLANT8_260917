import type { Metadata } from "next";
import "./globals.css";
import { SessionRefresh } from "./session-refresh";

export const metadata: Metadata = {
  title: "PLANT8 ERP",
  description: "PLANT8 ERP — 프로젝트·지출결의·법인카드·손익 관리",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <body>
        <SessionRefresh />
        {children}
      </body>
    </html>
  );
}
