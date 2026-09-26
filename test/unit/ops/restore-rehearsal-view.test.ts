import { describe, expect, it } from "vitest";
import { formatRestoreRehearsal } from "@/app/(app)/admin/system-status/restore-rehearsal-view";
import type { RestoreRehearsalRecord } from "@/domain/ops/restore-rehearsal";

// UI-SPEC 「복원 리허설 값 행」 문구 표가 정본이다 — 기대 문구는 그 표에서 글자 그대로 옮겼다.
function record(overrides: Partial<RestoreRehearsalRecord> = {}): RestoreRehearsalRecord {
  return {
    source: "staging",
    succeeded: true,
    failedStage: null,
    backupId: "1758684000000",
    startedAt: new Date("2026-09-23T18:02:00Z"),
    finishedAt: new Date("2026-09-23T18:14:00Z"),
    runUrl: null,
    ...overrides,
  };
}

describe("formatRestoreRehearsal — 성공 기록(트레이서 모양)", () => {
  it("성공 + 백업 id + 12분 → head · 백업 id · 소요 시간, 링크 없음", () => {
    expect(formatRestoreRehearsal(record())).toEqual({
      head: "성공 · 스테이징 · 2026-09-24 03:14",
      backupId: "1758684000000",
      duration: "12분",
      runUrl: null,
    });
  });

  it("일시는 종료 시각의 KST 날짜다 — UTC 15:30은 다음 날 00:30", () => {
    const view = formatRestoreRehearsal(
      record({
        startedAt: new Date("2026-09-23T15:20:00Z"),
        finishedAt: new Date("2026-09-23T15:30:00Z"),
      }),
    );
    expect(view.head).toBe("성공 · 스테이징 · 2026-09-24 00:30");
  });
});
