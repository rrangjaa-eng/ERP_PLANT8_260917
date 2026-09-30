import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSessionId, requireSession } from "@/lib/viewer";
import { assertCertFeatureEnabled } from "@/lib/certs/feature-guard";
import { touchPrivacySession } from "@/domain/certs/privacy-session";
import { getCertificatePrint } from "@/domain/certs/review";
import { formatSubmittedAtKst } from "@/domain/certs/format";
import { PrintSheet } from "./print-sheet";

export const dynamic = "force-dynamic";

// 04.3-11 — P1 확인증 인쇄물(셸 밖 · (app) 레이아웃의 requireSession이 앞서지 않는다). 순서: 기능 게이트(C1 —
// 로그인 전 요청도 404, 레이아웃과 페이지는 병렬로 렌더되므로 페이지도 첫 판정으로 본다) → 세션 → 개인정보취급자
// 비활동 판정(볼 수 없는 사람은 시계를 건드리지 않고 404 · 만료면 로그인) → 조회(project 투영 — 값이 안 보이면
// 404). 문서 제목은 고정이다 — 번호를 넣는 동적 제목 함수는 같은 순서를 따로 밟아야 해서 두지 않는다(E3-30).
export const metadata: Metadata = { title: "확인증 인쇄" };

export default async function CertPrintPage({ params }: { params: Promise<{ id: string }> }) {
  await assertCertFeatureEnabled();
  const { viewer } = await requireSession();

  const sessionId = await getSessionId();
  if (!sessionId) redirect("/login");
  const touched = await touchPrivacySession(viewer, sessionId);
  if (touched.kind === "notAllowed") notFound();
  if (touched.kind === "expired") redirect("/login");

  const { id } = await params;
  const result = await getCertificatePrint(viewer, id);
  if (result.kind === "notFound") notFound();
  const print = result.print;

  return (
    <PrintSheet
      printedAt={result.printedAt}
      certNo={print.certNo ?? "—"}
      eventName={print.eventName ?? "—"}
      wonOn={print.wonOn ?? "—"}
      prizeLine={`${print.prizeName ?? "—"} ${print.quantity ?? ""}개`}
      name={print.name ?? "—"}
      rrnMasked={print.rrnMasked ?? "—"}
      address={print.address ?? "—"}
      phone={print.phone ?? "—"}
      submittedAt={print.submittedAt ? formatSubmittedAtKst(print.submittedAt) : "—"}
      signatureDataUrl={print.signatureDataUrl ?? null}
    />
  );
}
