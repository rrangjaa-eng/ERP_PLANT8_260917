import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { assertCertFeatureEnabled } from "@/lib/certs/feature-guard";
import { loadIntake } from "@/domain/certs/intake";
import { formatContactPhone } from "@/domain/certs/format";
import { IntakeFlow } from "./intake-flow";
import styles from "./intake.module.css";

export const metadata: Metadata = {
  title: "이름 고르기 · 기타소득 지급 확인",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function closedReasonText(reason: "expired" | "all_submitted" | "manual"): string {
  if (reason === "all_submitted") return "모든 자리가 제출을 마쳤습니다";
  if (reason === "manual") return "담당자가 링크를 닫았습니다";
  return "링크 유효 시간이 지났습니다";
}

export default async function CertIntakePage({ params }: { params: Promise<{ token: string }> }) {
  await assertCertFeatureEnabled();
  const { token } = await params;
  const result = await loadIntake(token);

  if (result.kind === "notFound") notFound();

  if (result.kind === "closed") {
    return (
      <main className={styles.main}>
        <h1 className={styles.title}>이 링크는 닫혔습니다</h1>
        <p>{closedReasonText(result.reason)}</p>
        <p>
          확인이 필요하면 담당자 {result.managerName} · PLANT8 경영관리 {formatContactPhone(result.contactPhone)}에
          전화해 주세요
        </p>
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
