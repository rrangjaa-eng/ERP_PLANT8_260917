import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { getSystemStatus, type SystemStatus } from "@/domain/system-status";
import { can } from "@/domain/permissions/can";
import { env } from "@/lib/env";
import { Banner } from "@/ui/banner/Banner";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { KvList } from "@/ui/kv-list/KvList";
import { PageHeader } from "@/ui/page-header/PageHeader";
import styles from "./system-status.module.css";

// D-18: 캐시·별도 저장 없음 — 화면 로드마다 pg_stat_activity·Cloud SQL Admin API를
// 직접 조회한다.
export const dynamic = "force-dynamic";

// §6-8 「알림 발송」 값(18A).
function notifyValue(notify: SystemStatus["notify"]) {
  if (notify.kind === "none") return "기록 없음 — 첫 알림 발송 전";
  if (notify.kind === "unavailable") return <StatusTag kind="muted">확인 불가</StatusTag>;
  return (
    <span className={styles.num}>
      {notify.businessDay
        ? `${notify.at} · 알림 ${notify.sent}건 · 중복 건너뜀 ${notify.skipped}건 · 남음 ${notify.remaining}건`
        : `${notify.at} · 비영업일 · 보내지 않음`}
    </span>
  );
}

// §6-8 「이메일」 값 = 설정 부분 + 결과 꼬리(D-4217 · Codex #18). 꼬리는 설정과 무관하게 붙는다.
function emailValue(email: SystemStatus["email"], outcome: SystemStatus["emailOutcome"]) {
  const setting =
    email.kind === "configured" ? `사용 중 · ${email.from}` : <StatusTag kind="muted">미설정</StatusTag>;
  if (outcome.kind === "unavailable") {
    return (
      <>
        {setting} · <StatusTag kind="muted">확인 불가</StatusTag>
      </>
    );
  }
  return (
    <>
      {setting}
      {outcome.failed > 0 ? (
        <span className={styles.num}>
          {" · "}
          <span className={styles.failed}>실패 {outcome.failed}건</span> ({outcome.failedAt})
        </span>
      ) : null}
      {outcome.unknown > 0 ? (
        <span className={styles.num}>
          {" · "}결과 불명 {outcome.unknown}건 ({outcome.unknownSince})
        </span>
      ) : null}
    </>
  );
}

// D-17·D-36(03-02): 권한표의 시스템 상태 보기 권한이 있는 계급만 본다. 서버
// 컴포넌트의 notFound() + domain의 NotAdminError 이중 방어(T-1-15) — 권한
// 없는 계급은 404. 아래 세 줄(캐시 지시자·미인증 리다이렉트·404)은 D-29
// 재구성 대상이 아니다 — 손대지 않는다(02-06 Task 3 read_first).
export default async function SystemStatusPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await can(session.viewer, "admin.system-status", "view"))) notFound();

  const status = await getSystemStatus(session.viewer);
  const bannerPercent = Math.round(env.STATUS_CONN_BANNER_RATIO * 100);
  const showConnBanner = !("unavailable" in status.db) && status.db.banner;

  return (
    <>
      {/* SYSTEM.md §6-8 B③/D④: 커넥션 한도 경고는 §7-11 경고 배너, 화면 제목 위. */}
      {showConnBanner ? <Banner kind="warning">DB 커넥션이 한도의 {bannerPercent}%를 넘었습니다.</Banner> : null}

      <PageHeader title="시스템 상태" />

      {/* §6-8 B①: 라벨·값 목록(dl, §7-8 시트 상세와 같은 골격). */}
      <div className="single-column">
        <KvList
          items={[
            {
              label: "배포 버전",
              value: (
                <>
                  {status.version.sha.slice(0, 8)} · {status.version.deployedAt ?? "없음"} · {status.version.env}
                </>
              ),
            },
            {
              label: "DB 커넥션",
              // §6-8 B②: 확인 불가는 §7-5 상태 태그(muted)로 표시한다.
              value:
                "unavailable" in status.db ? (
                  <StatusTag kind="muted">확인 불가</StatusTag>
                ) : (
                  <>
                    {status.db.connections} / {status.db.maxConnections}
                  </>
                ),
            },
            {
              label: "마지막 백업",
              value:
                status.backup.kind === "ok" ? (
                  <>
                    {status.backup.status} · {status.backup.endTime ?? "종료 시각 없음"}
                  </>
                ) : status.backup.kind === "none" ? (
                  "백업 없음 — 첫 자동 백업 전"
                ) : (
                  <StatusTag kind="muted">확인 불가</StatusTag>
                ),
            },
            { label: "알림 발송", value: notifyValue(status.notify) },
            { label: "이메일", value: emailValue(status.email, status.emailOutcome) },
          ]}
        />
      </div>
    </>
  );
}
