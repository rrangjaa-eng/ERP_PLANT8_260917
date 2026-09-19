import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { getSystemStatus } from "@/domain/system-status";
import { env } from "@/lib/env";
import { Banner } from "@/ui/banner/Banner";
import { StatusTag } from "@/ui/status-tag/StatusTag";

// D-18: 캐시·별도 저장 없음 — 화면 로드마다 pg_stat_activity·Cloud SQL Admin API를
// 직접 조회한다.
export const dynamic = "force-dynamic";

// D-17: 관리자만 본다. 서버 컴포넌트의 notFound() + domain의 NotAdminError
// 이중 방어(T-1-15) — 직원은 404. 아래 세 줄(캐시 지시자·미인증 리다이렉트·404)은
// D-29 재구성 대상이 아니다 — 손대지 않는다(02-06 Task 3 read_first).
export default async function SystemStatusPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.viewer.isAdmin) notFound();

  const status = await getSystemStatus(session.viewer);
  const bannerPercent = Math.round(env.STATUS_CONN_BANNER_RATIO * 100);
  const showConnBanner = !("unavailable" in status.db) && status.db.banner;

  return (
    <>
      {/* SYSTEM.md §6-8 B③/D④: 커넥션 한도 경고는 §7-11 경고 배너, 화면 제목 위. */}
      {showConnBanner ? <Banner kind="warning">DB 커넥션이 한도의 {bannerPercent}%를 넘었습니다.</Banner> : null}

      <h1>시스템 상태</h1>

      {/* §6-8 B①: 라벨·값 목록(dl, §7-8 시트 상세와 같은 골격). */}
      <dl>
        <dt>배포 버전</dt>
        <dd>
          {status.version.sha.slice(0, 8)} · {status.version.deployedAt ?? "없음"} · {status.version.env}
        </dd>

        <dt>DB 커넥션</dt>
        <dd>
          {/* §6-8 B②: 확인 불가는 §7-5 상태 태그(muted)로 표시한다. */}
          {"unavailable" in status.db ? (
            <StatusTag kind="muted">확인 불가</StatusTag>
          ) : (
            <>
              {status.db.connections} / {status.db.maxConnections}
            </>
          )}
        </dd>

        <dt>마지막 백업</dt>
        <dd>
          {status.backup.kind === "ok" ? (
            <>
              {status.backup.status} · {status.backup.endTime ?? "종료 시각 없음"}
            </>
          ) : status.backup.kind === "none" ? (
            "백업 없음 — 첫 자동 백업 전"
          ) : (
            <StatusTag kind="muted">확인 불가</StatusTag>
          )}
        </dd>
      </dl>
    </>
  );
}
