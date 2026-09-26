import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { assertCertFeatureEnabled } from "@/lib/certs/feature-guard";
import { loadIntake } from "@/domain/certs/intake";
import { ClosedResult, IntakeFlow } from "./intake-flow";
import styles from "./intake.module.css";

export const metadata: Metadata = {
  title: "이름 고르기 · 기타소득 지급 확인",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function CertIntakePage({ params }: { params: Promise<{ token: string }> }) {
  await assertCertFeatureEnabled();
  const { token } = await params;
  const result = await loadIntake(token);

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
