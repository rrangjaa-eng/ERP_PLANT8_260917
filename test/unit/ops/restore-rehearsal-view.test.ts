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

// page.tsx가 값 행을 조립하는 규칙(세그먼트 생략 포함)을 글자로 옮겨 UI-SPEC 문구 표와 대조한다.
function line(record: RestoreRehearsalRecord): string {
  const view = formatRestoreRehearsal(record);
  return [view.head, view.backupId === null ? null : `백업 ${view.backupId}`, view.duration]
    .filter((segment) => segment !== null)
    .join(" · ");
}

const RUN_URL = "https://github.com/o/r/actions/runs/42";
const FOUR_MINUTES = { startedAt: new Date("2026-09-23T18:10:00Z"), finishedAt: new Date("2026-09-23T18:14:00Z") };

describe("formatRestoreRehearsal — 실패 문구와 세그먼트 규칙(UI-SPEC 문구 표)", () => {
  it("실패(검증) + 백업 id + 4분 + URL → 단계가 결과 바로 뒤, 실행 URL 그대로", () => {
    const view = formatRestoreRehearsal(
      record({ succeeded: false, failedStage: "verify", runUrl: RUN_URL, ...FOUR_MINUTES }),
    );
    expect(view.head).toBe("실패 · 검증 · 스테이징 · 2026-09-24 03:14");
    expect(view.runUrl).toBe(RUN_URL);
    expect(line(record({ succeeded: false, failedStage: "verify", runUrl: RUN_URL, ...FOUR_MINUTES }))).toBe(
      "실패 · 검증 · 스테이징 · 2026-09-24 03:14 · 백업 1758684000000 · 4분",
    );
  });

  it("실패(복원) + 백업 id 없음 → 백업 세그먼트 통째로 생략, 실행 URL 있음", () => {
    const failed = record({ succeeded: false, failedStage: "restore", backupId: null, runUrl: RUN_URL, ...FOUR_MINUTES });
    expect(formatRestoreRehearsal(failed).backupId).toBeNull();
    expect(formatRestoreRehearsal(failed).runUrl).toBe(RUN_URL);
    expect(line(failed)).toBe("실패 · 복원 · 스테이징 · 2026-09-24 03:14 · 4분");
  });

  it("실패(정리) → 정리", () => {
    expect(formatRestoreRehearsal(record({ succeeded: false, failedStage: "cleanup", runUrl: RUN_URL })).head).toBe(
      "실패 · 정리 · 스테이징 · 2026-09-24 03:14",
    );
  });

  it("복합 실패로 저장된 cleanup + 9분 → 단계는 하나만, 저장된 값 그대로", () => {
    const failed = record({
      succeeded: false,
      failedStage: "cleanup",
      runUrl: RUN_URL,
      startedAt: new Date("2026-09-23T18:05:00Z"),
      finishedAt: new Date("2026-09-23T18:14:00Z"),
    });
    expect(line(failed)).toBe("실패 · 정리 · 스테이징 · 2026-09-24 03:14 · 백업 1758684000000 · 9분");
    expect(formatRestoreRehearsal(failed).runUrl).toBe(RUN_URL);
  });

  it.each([
    [59, "1분 미만"],
    [60, "1분"],
    [119, "1분"],
  ])("소요 %i초 → %s", (seconds, expected) => {
    const finishedAt = new Date("2026-09-23T18:14:00Z");
    const startedAt = new Date(finishedAt.getTime() - seconds * 1000);
    expect(formatRestoreRehearsal(record({ startedAt, finishedAt })).duration).toBe(expected);
  });

  it("원본 production → 프로덕션", () => {
    expect(formatRestoreRehearsal(record({ source: "production" })).head).toBe("성공 · 프로덕션 · 2026-09-24 03:14");
  });

  it("성공이면 실행 URL이 있어도 링크를 두지 않는다", () => {
    expect(formatRestoreRehearsal(record({ runUrl: RUN_URL })).runUrl).toBeNull();
  });

  it("실패인데 실행 URL이 NULL이면(방어적 렌더) 실행 기록 세그먼트 없이 문구가 끝난다", () => {
    const failed = record({ succeeded: false, failedStage: "verify", runUrl: null, ...FOUR_MINUTES });
    expect(line(failed)).toBe("실패 · 검증 · 스테이징 · 2026-09-24 03:14 · 백업 1758684000000 · 4분");
    expect(formatRestoreRehearsal(failed).runUrl).toBeNull();
  });
});
