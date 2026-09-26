import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { assertCertFeatureEnabled } from "@/lib/certs/feature-guard";
import { loadIntake } from "@/domain/certs/intake";
import { ClosedResult, IntakeFlow } from "./intake-flow";
import styles from "./intake.module.css";

// 한 요청 안에서 generateMetadata와 페이지가 같은 읽기를 한 번만 한다.
const loadIntakeOnce = cache(loadIntake);

// 첫 진입 제목도 단계별 제목 규칙을 따른다 — 닫힌 링크는 「링크 닫힘」(DOM 감사 F6).
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const result = await loadIntakeOnce(token);
  return {
    title: `${result.kind === "closed" ? "링크 닫힘" : result.kind === "notFound" ? "링크 없음" : "이름 고르기"} · 기타소득 지급 확인`,
    robots: { index: false, follow: false },
  };
}

export const dynamic = "force-dynamic";

export default async function CertIntakePage({ params }: { params: Promise<{ token: string }> }) {
  await assertCertFeatureEnabled();
  const { token } = await params;
  const result = await loadIntakeOnce(token);

  if (result.kind === "notFound") notFound();

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
        rows={result.rows}
        managerName={result.managerName}
        contactPhone={result.contactPhone}
      />
    </main>
  );
}
