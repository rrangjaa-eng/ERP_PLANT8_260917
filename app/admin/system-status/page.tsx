import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { getSystemStatus } from "@/domain/system-status";
import { env } from "@/lib/env";

// D-18: 캐시·별도 저장 없음 — 화면 로드마다 pg_stat_activity·Cloud SQL Admin API를
// 직접 조회한다.
export const dynamic = "force-dynamic";

// D-17: 관리자만 본다. 서버 컴포넌트의 notFound() + domain의 NotAdminError
// 이중 방어(T-1-15) — 직원은 404.
export default async function SystemStatusPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.viewer.isAdmin) notFound();

  const status = await getSystemStatus(session.viewer);
  const bannerPercent = Math.round(env.STATUS_CONN_BANNER_RATIO * 100);

  return (
    <main>
      <h1>시스템 상태</h1>

      <section>
        <h2>배포 버전</h2>
        <p>SHA: {status.version.sha.slice(0, 8)}</p>
        <p>배포 시각: {status.version.deployedAt ?? "없음"}</p>
        <p>환경: {status.version.env}</p>
      </section>

      <section>
        <h2>DB 커넥션</h2>
        {"unavailable" in status.db ? (
          <p>확인 불가</p>
        ) : (
          <p>
            {status.db.connections} / {status.db.maxConnections}
          </p>
        )}
      </section>

      <section>
        <h2>마지막 백업</h2>
        {status.backup.kind === "ok" ? (
          <p>
            {status.backup.status} · {status.backup.endTime ?? "종료 시각 없음"}
          </p>
        ) : status.backup.kind === "none" ? (
          <p>백업 없음 — 첫 자동 백업 전</p>
        ) : (
          <p>확인 불가</p>
        )}
      </section>

      {!("unavailable" in status.db) && status.db.banner ? (
        <p role="alert">DB 커넥션이 한도의 {bannerPercent}%를 넘었습니다.</p>
      ) : null}
    </main>
  );
}
