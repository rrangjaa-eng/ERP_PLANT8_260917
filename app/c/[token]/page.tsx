import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { assertCertFeatureEnabled } from "@/lib/certs/feature-guard";
import { loadIntake } from "@/domain/certs/intake";
import { ClosedResult, IntakeFlow } from "./intake-flow";
import styles from "./intake.module.css";

// 한 요청 안에서 generateMetadata와 페이지가 같은 읽기를 한 번만 한다.
const loadIntakeOnce = cache(loadIntake);

// 첫 진입 제목도 단계별 제목 규칙을 따른다 — 닫힌 링크는 「링크 닫힘」(DOM 감사 F6), 열린 링크는 경품 수와
// 상관없이 「경품 고르기」(UD-5 a). 열리기 전(notYetOpen)은 04.3-16이 E6-e를 그리기 전까지 「링크 없음」(아래).
function titleOf(kind: Awaited<ReturnType<typeof loadIntake>>["kind"]): string {
  if (kind === "open") return "경품 고르기";
  if (kind === "closed") return "링크 닫힘";
  return "링크 없음";
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const result = await loadIntakeOnce(token);
  return {
    title: `${titleOf(result.kind)} · 기타소득 지급 확인`,
    robots: { index: false, follow: false },
  };
}

export const dynamic = "force-dynamic";

export default async function CertIntakePage({ params }: { params: Promise<{ token: string }> }) {
  await assertCertFeatureEnabled();
  const { token } = await params;
  const result = await loadIntakeOnce(token);

  // notYetOpen(당첨일 00:00 KST 전 — E8 b)은 04.3-16이 E6-e 계약 화면을 그리기 전까지 E6-c 모양으로 임시로
  // 그린다(같은 PR이라 배포되지 않는다 — E32).
  if (result.kind === "notFound" || result.kind === "notYetOpen") notFound();

  if (result.kind === "closed") {
    return (
      <main className={styles.main}>
        <h1 className={styles.title}>기타소득 지급 확인</h1>
        <ClosedResult
          reason={result.reason}
          at={result.at}
          managerName={result.managerName}
          contactPhone={result.contactPhone}
        />
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
