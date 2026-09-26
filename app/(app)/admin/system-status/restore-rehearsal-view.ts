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

export function formatRestoreRehearsal(record: RestoreRehearsalRecord): RestoreRehearsalView {
  const minutes = Math.floor((record.finishedAt.getTime() - record.startedAt.getTime()) / 60_000);
  return {
    head: `성공 · ${SOURCE_LABEL[record.source]} · ${formatKst(record.finishedAt)}`,
    backupId: record.backupId,
    duration: `${minutes}분`,
    runUrl: null,
  };
}
