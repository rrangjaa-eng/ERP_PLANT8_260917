import { cache } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSessionId, requireSession } from "@/lib/viewer";
import { assertCertFeatureEnabled } from "@/lib/certs/feature-guard";
import { touchPrivacySession } from "@/domain/certs/privacy-session";
import { getSubmissionForReview } from "@/domain/certs/review";
import { formatSubmittedAtKst } from "@/domain/certs/format";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { ReviewForm } from "./review-form";
import styles from "./review.module.css";

export const dynamic = "force-dynamic";

// 04.3-07 — I4 확인증 확인 · 정정(경영관리 전용). 순서: 기능 게이트(C1 — 로그인한 사람은 권한과
// 무관하게 404) → 세션 → 개인정보취급자 비활동 판정(볼 수 없는 사람은 시계를 건드리지 않고 404 ·
// 만료면 로그인) → 조회(project 투영 — 값이 안 보이면 404). 메타데이터와 본문이 한 번만 돌도록 요청
// 단위 cache로 묶는다.
const loadReview = cache(async (id: string) => {
  await assertCertFeatureEnabled();
  const { viewer } = await requireSession();

  const sessionId = await getSessionId();
  if (!sessionId) redirect("/login");
  const touched = await touchPrivacySession(viewer, sessionId);
  if (touched.kind === "notAllowed") notFound();
  if (touched.kind === "expired") redirect("/login");

  const result = await getSubmissionForReview(viewer, id);
  if (result.kind === "notFound") notFound();
  return result;
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const review = await loadReview(id);
  return { title: `확인증 확인 · ${review.submission.name ?? ""}` };
}

export default async function CertSubmissionReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const review = await loadReview(id);
  const submission = review.submission;

  const subtitle = [
    submission.certNo ?? "—",
    submission.eventName ?? "—",
    `${submission.submittedAt ? formatSubmittedAtKst(submission.submittedAt) : "—"} 제출`,
  ].join(" · ");

  return (
    <div className={styles.root}>
      <div className={styles.screen}>
        <div className={styles.header}>
          <div className={styles.titleBlock}>
            <PageHeader title={`기타소득 확인증 — ${submission.name ?? ""}`} subtitle={subtitle} />
          </div>
          <StatusTag kind="success" variant="tag">
            제출됨
          </StatusTag>
        </div>
        <ReviewForm
          key={submission.version}
          submissionId={id}
          version={submission.version ?? 1}
          name={submission.name ?? ""}
          registeredName={submission.registeredName ?? null}
          rrnMasked={submission.rrnMasked ?? ""}
          phone={submission.phone ?? ""}
          address={submission.delivery === "parcel" ? (submission.address ?? "") : null}
          prizeLine={`${submission.prizeName ?? ""} ${submission.quantity ?? ""}개 · ${
            submission.delivery === "parcel" ? "택배" : "현장 수령"
          }`}
          consentLine={`동의함 · ${submission.consentAt ? formatSubmittedAtKst(submission.consentAt) : "—"}`}
          signatureDataUrl={submission.signatureDataUrl ?? null}
          canReveal={review.canReveal}
          canCorrect={review.canCorrect}
          idleMinutes={review.idleMinutes}
        />
      </div>
      <p className={styles.printLine}>이 화면은 인쇄하지 않습니다 · 머리의 「인쇄」 버튼으로 확인증을 열어 주세요</p>
    </div>
  );
}
