import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";

// 06.1-05 — loading.tsx가 페이지를 Suspense로 감싸 스트리밍하면 페이지 안의 notFound()는 이미 200으로 나간 응답 안에서 찾을 수 없음
// 화면만 그린다. 같은 판정(`evidence.intake` 쓰기)을 스트리밍 앞(레이아웃)에서 한 번 더 해 상태 코드를 404로 둔다(리저브 대장 layout.tsx 선례).
export default async function EvidenceLayout({ children }: { children: ReactNode }) {
  const { viewer } = await requireSession();
  if (!(await can(viewer, "evidence.intake", "write"))) notFound();
  return children;
}
