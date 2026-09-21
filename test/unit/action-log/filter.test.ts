import { describe, expect, it } from "vitest";
import {
  isWithinActionLogPeriod,
  compareActionLogOrder,
  matchesActionLogFilter,
  type ActionLogFilterableRow,
} from "@/domain/action-log";

function row(overrides: Partial<ActionLogFilterableRow> = {}): ActionLogFilterableRow {
  return {
    seq: 1,
    occurredAt: new Date("2026-09-20T12:00:00.000Z"),
    actorId: "user-1",
    actionType: "document_create",
    documentId: "doc-1",
    prunedAt: null,
    ...overrides,
  };
}

describe("isWithinActionLogPeriod (기간 경계, 양끝 포함)", () => {
  const from = new Date("2026-09-20T00:00:00.000Z");
  const to = new Date("2026-09-20T23:59:59.999Z");

  it("시작 시각과 정확히 같으면 포함된다", () => {
    expect(isWithinActionLogPeriod(from, from, to)).toBe(true);
  });

  it("끝 시각과 정확히 같으면 포함된다", () => {
    expect(isWithinActionLogPeriod(to, from, to)).toBe(true);
  });

  it("끝보다 1밀리초 뒤는 제외된다", () => {
    const after = new Date(to.getTime() + 1);
    expect(isWithinActionLogPeriod(after, from, to)).toBe(false);
  });

  it("시작보다 1밀리초 전은 제외된다", () => {
    const before = new Date(from.getTime() - 1);
    expect(isWithinActionLogPeriod(before, from, to)).toBe(false);
  });

  it("from·to가 없으면 항상 포함된다", () => {
    expect(isWithinActionLogPeriod(new Date("2000-01-01"))).toBe(true);
  });
});

describe("compareActionLogOrder (발생 시각 내림차순, 동률은 seq 내림차순 — 결정적)", () => {
  it("발생 시각이 다르면 최신이 앞이다", () => {
    const older = { occurredAt: new Date("2026-09-20T10:00:00.000Z"), seq: 5 };
    const newer = { occurredAt: new Date("2026-09-20T11:00:00.000Z"), seq: 1 };
    expect(compareActionLogOrder(newer, older)).toBeLessThan(0);
    expect(compareActionLogOrder(older, newer)).toBeGreaterThan(0);
  });

  it("발생 시각이 같으면 seq가 큰(나중에 삽입된) 쪽이 앞이다 — 두 번 정렬해도 같은 순서", () => {
    const same = new Date("2026-09-20T10:00:00.000Z");
    const a = { occurredAt: same, seq: 10 };
    const b = { occurredAt: same, seq: 20 };
    const sortedOnce = [a, b].sort(compareActionLogOrder).map((x) => x.seq);
    const sortedTwice = [a, b].sort(compareActionLogOrder).map((x) => x.seq);
    expect(sortedOnce).toEqual([20, 10]);
    expect(sortedTwice).toEqual(sortedOnce);
  });
});

describe("matchesActionLogFilter (필터 축 조합 = 교집합)", () => {
  it("필터가 없으면(정리 제외 기본) 정리 안 된 모든 행이 통과한다", () => {
    expect(matchesActionLogFilter(row(), {})).toBe(true);
    expect(matchesActionLogFilter(row({ prunedAt: new Date() }), {})).toBe(false);
  });

  it("사람·행동 종류·문서 세 축을 모두 만족해야 통과한다(교집합)", () => {
    const target = row({ actorId: "user-2", actionType: "document_submit", documentId: "doc-9" });
    expect(
      matchesActionLogFilter(target, { actorId: "user-2", actionType: "document_submit", documentId: "doc-9" }),
    ).toBe(true);
    // 세 축 중 하나라도 어긋나면 실패한다.
    expect(
      matchesActionLogFilter(target, { actorId: "user-2", actionType: "document_submit", documentId: "doc-1" }),
    ).toBe(false);
    expect(
      matchesActionLogFilter(target, { actorId: "user-3", actionType: "document_submit", documentId: "doc-9" }),
    ).toBe(false);
  });

  it("기간 필터와 다른 축이 함께 걸리면 둘 다 만족해야 한다", () => {
    const target = row({ occurredAt: new Date("2026-09-20T12:00:00.000Z"), actionType: "login" });
    expect(
      matchesActionLogFilter(target, {
        actionType: "login",
        from: new Date("2026-09-20T00:00:00.000Z"),
        to: new Date("2026-09-20T23:59:59.999Z"),
      }),
    ).toBe(true);
    expect(
      matchesActionLogFilter(target, {
        actionType: "login",
        from: new Date("2026-09-21T00:00:00.000Z"),
      }),
    ).toBe(false);
  });

  it("includePruned가 참이면 정리된 행도 통과한다", () => {
    expect(matchesActionLogFilter(row({ prunedAt: new Date() }), { includePruned: true })).toBe(true);
  });
});
