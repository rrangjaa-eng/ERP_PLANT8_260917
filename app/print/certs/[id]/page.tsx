import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { clientIp } from "@/lib/client-ip";
import { privacyLoginHref } from "@/lib/login-next";
import { PrivacyIdleLogout } from "@/app/(app)/certs/submissions/[id]/privacy-idle-logout";
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
// 404)와 끌 수 없는 cert_view {via: "print"} 기록(04.3-14 U3 a — 기록 실패면 인쇄 오류 경계). 문서 제목은 고정 「확인증 인쇄」이고 성공 화면(print-sheet)이 정한다 — 번호를 넣는 동적 제목은 같은 순서를
// 따로 밟아야 해서 두지 않고(E3-30), 페이지가 제목을 내보내면 404 변종에도 남는다(독립 DOM 감사 L3).

export default async function CertPrintPage({ params }: { params: Promise<{ id: string }> }) {
  await assertCertFeatureEnabled();
  const { viewer } = await requireSession();

  // 끊기면 로그인 화면에 이유 줄 · 다시 로그인하면 이 인쇄 화면으로(04.3-14 U5 a).
  const { id } = await params;
  const printPath = `/print/certs/${id}`;
  const sessionId = await getSessionId();
  if (!sessionId) redirect(privacyLoginHref(printPath));
  const touched = await touchPrivacySession(viewer, sessionId);
  if (touched.kind === "notAllowed") notFound();
  if (touched.kind === "expired") redirect(privacyLoginHref(printPath));

  const result = await getCertificatePrint(viewer, id, { ip: clientIp(await headers()) });
  if (result.kind === "notFound") notFound();
  const print = result.print;

  // 무입력 한도면 화면이 스스로 로그인으로 — 되돌아갈 곳은 그 확인증의 I4(U4 a · G8 a).
  return (
    <>
      <PrivacyIdleLogout idleMinutes={touched.idleMinutes} returnPath={printPath} />
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
    </>
  );
}
