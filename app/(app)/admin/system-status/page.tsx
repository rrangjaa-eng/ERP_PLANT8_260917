import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import type { ReactNode } from "react";
import {
  emailFailureBannerFrom,
  emailFailureBannerText,
  getSystemStatus,
  type SystemStatus,
} from "@/domain/system-status";
import { can } from "@/domain/permissions/can";
import { env } from "@/lib/env";
import { Banner } from "@/ui/banner/Banner";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { Num } from "@/ui/num/Num";
import { KvList } from "@/ui/kv-list/KvList";
import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { formatRestoreRehearsal } from "./restore-rehearsal-view";
import styles from "./system-status.module.css";

// D-18: 캐시·별도 저장 없음 — 화면 로드마다 pg_stat_activity·Cloud SQL Admin API를
// 직접 조회한다.
export const dynamic = "force-dynamic";

// §6-8 「알림 발송」 값(18A).
function notifyValue(notify: SystemStatus["notify"]) {
  if (notify.kind === "none") return "기록 없음 — 첫 알림 발송 전";
  if (notify.kind === "unavailable") return <StatusTag status="확인 불가" />;
  return (
    <>
      <Num value={notify.at} />
      {notify.businessDay ? (
        <>
          {" · 알림 "}
          <Num value={notify.sent} unit="count" />
          {"건 · 중복 건너뜀 "}
          <Num value={notify.skipped} unit="count" />
          {"건 · 남음 "}
          <Num value={notify.remaining} unit="count" />건
        </>
      ) : (
        " · 비영업일 · 보내지 않음"
      )}
    </>
  );
}

// §6-8 「이메일」 값 = 설정 부분 + 결과 꼬리(D-4217 · Codex #18). 꼬리는 설정과 무관하게 붙는다.
function emailValue(email: SystemStatus["email"], outcome: SystemStatus["emailOutcome"]) {
  const setting =
    email.kind === "configured" ? `사용 중 · ${email.from}` : <StatusTag status="미설정" />;
  if (outcome.kind === "unavailable") {
    return (
      <>
        {setting} · <StatusTag status="확인 불가" />
      </>
    );
  }
  return (
    <>
      {setting}
      {outcome.failed > 0 ? (
        <>
          {" · "}
          <span className={styles.failed}>
            실패 <Num value={outcome.failed} unit="count" />건
          </span>{" "}
          (<Num value={outcome.failedAt} />)
        </>
      ) : null}
      {outcome.unknown > 0 ? (
        <>
          {" · "}
          {"결과 불명 "}
          <Num value={outcome.unknown} unit="count" />
          {"건 ("}
          <Num value={outcome.unknownSince} />)
        </>
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
  // UI-SPEC S3: DB 커넥션 경고가 먼저, 없을 때만 B2(이미 읽은 결과로 — 두 번 조회하지 않는다).
  const emailBanner = showConnBanner ? null : emailFailureBannerFrom(status.emailOutcome);

  return (
    <>
      {/* SYSTEM.md §6-8 B③/D④: 커넥션 한도 경고는 §7-11 경고 배너, 화면 제목 위. */}
      {showConnBanner ? (
        <Banner kind="warning">DB 커넥션이 한도의 {bannerPercent}%를 넘었습니다.</Banner>
      ) : emailBanner ? (
        <Banner kind="warning">{emailFailureBannerText(emailBanner)}</Banner>
      ) : null}

      <DetailScreen title="시스템 상태">
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
                    <StatusTag status="확인 불가" />
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
                    <StatusTag status="확인 불가" />
                  ),
              },
              {
                // 04.4-01(D8-08): 「마지막 백업」 바로 다음 줄.
                label: "복원 리허설",
                value: restoreRehearsalValue(status.restoreRehearsal),
              },
              { label: "알림 발송", value: notifyValue(status.notify) },
              { label: "이메일", value: emailValue(status.email, status.emailOutcome) },
            ]}
          />
        </div>
      </DetailScreen>
    </>
  );
}

function restoreRehearsalValue(restoreRehearsal: SystemStatus["restoreRehearsal"]): ReactNode {
  if (restoreRehearsal.kind === "none") return "리허설 기록 없음 — 첫 리허설 전";
  if (restoreRehearsal.kind === "unavailable") return <StatusTag status="확인 불가" />;
  const view = formatRestoreRehearsal(restoreRehearsal.record);
  // 앞 낱말(결과 · 원본)은 줄바꿈이 되고, 뒤 일시만 숫자 칸 모양(줄바꿈 없음)이다.
  const headSplit = view.head.lastIndexOf(" · ") + 3;
  // 백업 id·실행 링크는 값이 없으면 앞의 구분자까지 통째로 뺀다(UI-SPEC #7).
  return (
    <>
      {view.head.slice(0, headSplit)}
      <Num value={view.head.slice(headSplit)} />
      {view.backupId === null ? null : (
        <>
          {" · 백업 "}
          <Num value={view.backupId} />
        </>
      )}
      {" · "}
      {view.duration}
      {view.runUrl === null ? null : (
        <>
          {" · "}
          <a href={view.runUrl} className={styles.runLink} target="_blank" rel="noopener noreferrer">
            실행 기록<span className="sr-only"> (새 탭)</span>
          </a>
        </>
      )}
    </>
  );
}
