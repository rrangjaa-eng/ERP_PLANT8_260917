import type { ReactNode } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadLeaveForPrint } from "./load";

// 07.4-02 D-7408: 열람 판정은 스트리밍 전에 여기서 끝낸다 — 페이지의 notFound()는 스트리밍이 시작된 뒤라 상태가 200으로 굳는다.
// 세션이 없으면 undefined(페이지가 로그인으로 보낸다). 볼 수 없는 id(404 변종)에는 제목을 내지 않아 기본 제목이 남는다.
// 번호가 투영으로 빠지면(`{}`) 「연차 신청서」만 낸다.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const leave = await loadLeaveForPrint(id);
  if (!leave) return {};
  return { title: typeof leave.number === "string" && leave.number !== "" ? `연차 신청서 ${leave.number}` : "연차 신청서" };
}

export default async function LeavePrintLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  if ((await loadLeaveForPrint(id)) === null) notFound();
  return children;
}
