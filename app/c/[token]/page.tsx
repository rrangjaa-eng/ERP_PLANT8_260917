import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { assertCertFeatureEnabled } from "@/lib/certs/feature-guard";
import { loadIntake } from "@/domain/certs/intake";
import { ClosedResult, IntakeFlow, NoPrizeResult, NotYetOpenResult } from "./intake-flow";
import styles from "./intake.module.css";

// 한 요청 안에서 generateMetadata와 페이지가 같은 읽기를 한 번만 한다.
const loadIntakeOnce = cache(loadIntake);

// 첫 진입 제목도 단계별 제목 규칙을 따른다 — 닫힌 링크는 「링크 닫힘」(DOM 감사 F6), 열린 링크는 경품 수와
// 상관없이 「경품 고르기」(UD-5 a)이되 보낼 경품이 0이면 E6-d 「경품 없음」(DR-10).
function titleOf(result: Awaited<ReturnType<typeof loadIntake>>): string {
  if (result.kind === "open") return result.prizes.length === 0 ? "경품 없음" : "경품 고르기";
  if (result.kind === "closed") return "링크 닫힘";
  if (result.kind === "notYetOpen") return "열리기 전";
  return "링크 없음";
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const result = await loadIntakeOnce(token);
  return {
    title: `${titleOf(result)} · 기타소득 지급 확인`,
    robots: { index: false, follow: false },
  };
}

export const dynamic = "force-dynamic";

export default async function CertIntakePage({ params }: { params: Promise<{ token: string }> }) {
  await assertCertFeatureEnabled();
  const { token } = await params;
  const result = await loadIntakeOnce(token);

  if (result.kind === "notFound") notFound();

  // E6-e 열리기 전(당첨일 00:00 KST 전 — E8 b) — 경품 목록 없이 부제 · 두 줄만(응답에 경품 이름이 없다).
  if (result.kind === "notYetOpen") {
    return (
      <main className={styles.main}>
        <h1 className={styles.title}>기타소득 지급 확인</h1>
        <NotYetOpenResult
          eventName={result.eventName}
          wonOn={result.wonOn}
          managerName={result.managerName}
          contactPhone={result.contactPhone}
          focusOnMount
        />
      </main>
    );
  }

  if (result.kind === "closed") {
    return (
      <main className={styles.main}>
        <h1 className={styles.title}>기타소득 지급 확인</h1>
        <ClosedResult
          reason={result.reason}
          at={result.at}
          managerName={result.managerName}
          contactPhone={result.contactPhone}
          focusOnMount
        />
      </main>
    );
  }

  if (result.prizes.length === 0) {
    return (
      <main className={styles.main}>
        <h1 className={styles.title}>기타소득 지급 확인</h1>
        <NoPrizeResult managerName={result.managerName} contactPhone={result.contactPhone} focusOnMount />
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <IntakeFlow
        token={token}
        eventName={result.eventName}
        wonOn={result.wonOn}
        prizes={result.prizes}
        terms={result.terms}
        managerName={result.managerName}
        contactPhone={result.contactPhone}
      />
    </main>
  );
}
