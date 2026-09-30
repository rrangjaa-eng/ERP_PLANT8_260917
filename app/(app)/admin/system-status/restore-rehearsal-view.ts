import type { RestoreRehearsalRecord } from "@/domain/ops/restore-rehearsal";

// UI-SPEC 「복원 리허설 값 행」: 결과 · 원본 · 일시(종료 시각, KST) · 백업 id · 소요 시간.
export type RestoreRehearsalView = {
  head: string;
  backupId: string | null;
  duration: string;
  runUrl: string | null;
};

const SOURCE_LABEL: Record<RestoreRehearsalRecord["source"], string> = {
  staging: "스테이징",
  production: "프로덕션",
};

const KST_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  // hour12:false는 ICU 판에 따라 자정을 "24"로 줄 수 있다 — h23으로 00–23을 고정한다.
  hourCycle: "h23",
});

// 로캘 문자열 형식에 기대지 않고 파츠를 직접 조립한다 — `YYYY-MM-DD HH:MM`.
function formatKst(date: Date): string {
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    KST_PARTS.formatToParts(date).find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}

const STAGE_LABEL: Record<NonNullable<RestoreRehearsalRecord["failedStage"]>, string> = {
  restore: "복원",
  verify: "검증",
  cleanup: "정리",
};

function formatDuration(record: RestoreRehearsalRecord): string {
  const seconds = (record.finishedAt.getTime() - record.startedAt.getTime()) / 1000;
  return seconds < 60 ? "1분 미만" : `${Math.floor(seconds / 60)}분`;
}

// 검증을 통과한 기록만 받는다(domain/ops/restore-rehearsal의 읽기 검증). 화면은 저장된
// 단계를 그대로 보이고 재계산하지 않는다. 실행 링크는 실패이고 URL이 있을 때만.
export function formatRestoreRehearsal(record: RestoreRehearsalRecord): RestoreRehearsalView {
  const result = record.failedStage === null ? "성공" : `실패 · ${STAGE_LABEL[record.failedStage]}`;
  return {
    head: `${result} · ${SOURCE_LABEL[record.source]} · ${formatKst(record.finishedAt)}`,
    backupId: record.backupId,
    duration: formatDuration(record),
    runUrl: record.succeeded ? null : record.runUrl,
  };
}
