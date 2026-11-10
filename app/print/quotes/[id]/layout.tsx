import type { ReactNode } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadQuoteForPrint } from "./load";

// 07.4-01 D-7408 꼴: 열람 판정은 스트리밍 전에 여기서 끝낸다. 볼 수 없는 id(404 변종)에는 제목을 내지 않아 기본 제목이 남는다.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const quote = await loadQuoteForPrint(id);
  if (!quote) return {};
  return { title: `Quotation ${quote.ref}` };
}

export default async function QuotePrintLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  if ((await loadQuoteForPrint(id)) === null) notFound();
  return children;
}
