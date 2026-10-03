import { cache } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { clientIp } from "@/lib/client-ip";
import { privacyLoginHref } from "@/lib/login-next";
import { getSessionId, requireSession } from "@/lib/viewer";
import { assertCertFeatureEnabled } from "@/lib/certs/feature-guard";
import { touchPrivacySession } from "@/domain/certs/privacy-session";
import { getSubmissionForReview } from "@/domain/certs/review";
import { formatSubmittedAtKst } from "@/domain/certs/format";
import type { DetailScreenProps } from "@/ui/detail-screen/DetailScreen";
import { ReviewForm } from "./review-form";
import { PrivacyIdleLogout } from "./privacy-idle-logout";
import styles from "./review.module.css";

export const dynamic = "force-dynamic";

// 04.3-07 — I4 확인증 확인 · 정정(경영관리 전용). 순서: 기능 게이트(C1 — 로그인한 사람은 권한과
// 무관하게 404) → 세션 → 개인정보취급자 비활동 판정(볼 수 없는 사람은 시계를 건드리지 않고 404 ·
// 만료면 로그인) → 조회(project 투영 — 값이 안 보이면 404)와 끌 수 없는 cert_view 기록(04.3-14 — 접속지 IP).
// 메타데이터와 본문이 한 번만 돌도록 요청 단위 cache로 묶는다 — 조회 기록도 요청당 한 줄이다.
const loadReview = cache(async (id: string) => {
  await assertCertFeatureEnabled();
  const { viewer } = await requireSession();

  // 끊기면 로그인 화면에 이유 줄 · 다시 로그인하면 이 I4로(04.3-14 U5 a).
  const sessionId = await getSessionId();
  if (!sessionId) redirect(privacyLoginHref(reviewPath(id)));

  const judgedAt = new Date();
  const touched = await touchPrivacySession(viewer, sessionId, judgedAt);
  if (touched.kind === "notAllowed") notFound();
  if (touched.kind === "expired") redirect(privacyLoginHref(reviewPath(id)));

  const result = await getSubmissionForReview(viewer, id, { ip: clientIp(await headers()) });
  if (result.kind === "notFound") notFound();
  // 무입력 화면 이동의 한도(분)는 비활동 판정이 읽은 값 그대로(설정을 한 번 더 읽지 않는다 — U4 a). 판정 시각은 이 렌더의
  // 표지다 — 라우터 캐시로 다시 붙은 화면을 알아본다(검토 Y1).
  return { ...result, idleMinutes: touched.idleMinutes, judgedAt: judgedAt.getTime() };
});

function reviewPath(id: string): string {
  return `/certs/submissions/${id}`;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  await loadReview(id);
  // 수령자 이름은 문서 제목에 싣지 않는다 — 공용 PC의 브라우저 기록 · 탭에 남는다.
  return { title: "확인증 확인" };
}

export default async function CertSubmissionReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const review = await loadReview(id);
  const submission = review.submission;

  // DetailScreen 머리의 메타 한 줄(`{확인증 번호} · {제출 시각} 제출`) — 한 줄은 짧게 둔다(긴 설명문으로 읽히지 않게). 행사 이름 · 제외 정보는
  // 라벨·값 목록 줄로 간다(폼 안 KvList). 틀은 폼이 그린다 — 상태 · 행동(2차)이 폼 상태에 달려 있다(프로젝트 상세 `QuoteLedger`와 같은 꼴).
  const frame = {
    title: `기타소득 확인증 — ${submission.name ?? ""}`,
    meta: [submission.certNo ?? "—", `${submission.submittedAt ? formatSubmittedAtKst(submission.submittedAt) : "—"} 제출`].join(" · "),
  } satisfies Pick<DetailScreenProps, "title" | "meta">;
  // 04.3-17 제외된 I4(DR-1) — 제외 시각 · 제외한 사람(`MM-dd HH:mm · {이름}`).
  const excludedNote = review.excluded ? `${formatSubmittedAtKst(review.excluded.at).slice(5)} · ${review.excluded.byName ?? "—"}` : null;

  return (
    <div className={styles.root}>
      <PrivacyIdleLogout idleMinutes={review.idleMinutes} judgedAt={review.judgedAt} returnPath={reviewPath(id)} />
      <div className={styles.screen}>
        <ReviewForm
          key={submission.version}
          submissionId={id}
          frame={frame}
          eventName={submission.eventName ?? "—"}
          excludedNote={excludedNote}
          version={submission.version ?? 1}
          name={submission.name ?? ""}
          rrnMasked={submission.rrnMasked ?? ""}
          phone={submission.phone ?? ""}
          quantity={submission.quantity ?? 1}
          prizeName={submission.prizeName ?? ""}
          submittedAt={submission.submittedAt ?? new Date(0).toISOString()}
          canExclude={review.canExclude}
          excluded={review.excluded !== null}
          rrnCleared={review.rrnCleared}
          address={submission.delivery === "parcel" ? (submission.address ?? "") : null}
          prizeLine={`${submission.prizeName ?? ""} ${submission.quantity ?? ""}개 · ${
            submission.delivery === "parcel" ? "택배" : "현장 수령"
          }`}
          consentLine={`확인함 · ${submission.consentAt ? formatSubmittedAtKst(submission.consentAt) : "—"}`}
          signatureDataUrl={submission.signatureDataUrl ?? null}
          canReveal={review.canReveal}
          canCorrect={review.canCorrect}
          purgeTarget={review.purgeTarget}
        />
      </div>
      <p className={styles.printLine}>이 화면은 인쇄하지 않습니다 · 머리의 「인쇄」 버튼으로 확인증을 열어 주세요</p>
    </div>
  );
}
