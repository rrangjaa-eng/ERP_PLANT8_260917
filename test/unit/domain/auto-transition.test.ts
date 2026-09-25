import { describe, expect, it, vi } from "vitest";
import type { DbOrTx } from "@/db/client";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import type { RecordActionEntry } from "@/domain/action-log/record";
import { applyAutoSettlement, effectiveOnFor, type AutoSettlementDeps } from "@/domain/projects/auto-transition";

// 04-11(D-76 · CEO A-01·A-08·A-15) — 진행 → 정산 자동 전환의 도메인 판정. DB 없이
// 트랜잭션(커밋·롤백)·리포지토리·로그를 메모리 가짜로 두고, 날짜 경계·멱등·발효일·
// 실패 격리를 단언한다. 실제 SQL(SKIP LOCKED · 보관·종료일 없음 제외)은 통합 테스트가 본다.

type FakeProject = { id: string; status: string; endDate: string | null; lastChangeAt: Date | null };
type LoggedAction = { viewer: Viewer; entry: RecordActionEntry };

const FAKE_TX = {} as DbOrTx;

function makeStore(initial: FakeProject[]) {
  let committed = initial.map((project) => ({ ...project }));
  let committedLogs: LoggedAction[] = [];
  let working: FakeProject[] = [];
  let workingLogs: LoggedAction[] = [];

  // 콜백이 던지면 작업본을 버린다(롤백) — withTransaction과 같은 계약.
  const transaction: AutoSettlementDeps["transaction"] = async (fn) => {
    working = committed.map((project) => ({ ...project }));
    workingLogs = [...committedLogs];
    const result = await fn(FAKE_TX);
    committed = working;
    committedLogs = workingLogs;
    return result;
  };

  const settle: AutoSettlementDeps["settle"] = async (_viewer, input) => {
    const targets = working.filter(
      (project) =>
        project.status === input.from &&
        project.endDate !== null &&
        project.endDate < input.todayKst &&
        (input.projectIds === undefined || input.projectIds.includes(project.id)),
    );
    for (const project of targets) project.status = input.to;
    return targets.map((project) => ({ id: project.id, endDate: project.endDate ?? "", lastChangeAt: project.lastChangeAt }));
  };

  const recordAction: AutoSettlementDeps["recordAction"] = async (viewer, entry) => {
    workingLogs.push({ viewer, entry });
  };

  return {
    transaction,
    settle,
    recordAction,
    status: (id: string) => committed.find((project) => project.id === id)?.status,
    logs: () => committedLogs,
  };
}

function quietLogger() {
  return { info: vi.fn(), error: vi.fn() };
}

const BEFORE_MIDNIGHT = new Date("2026-09-17T14:59:59Z"); // KST 09-17 23:59:59
const AFTER_MIDNIGHT = new Date("2026-09-17T15:00:00Z"); // KST 09-18 00:00:00

describe("applyAutoSettlement — KST 자정 경계 · 로그 · 멱등 (D-76)", () => {
  it("종료일 9/17 진행은 KST 9/17 23:59:59에는 그대로이고 로그가 없다", async () => {
    const store = makeStore([{ id: "p", status: "in_progress", endDate: "2026-09-17", lastChangeAt: null }]);
    const logger = quietLogger();

    const changed = await applyAutoSettlement({ projectIds: ["p"] }, { ...store, logger, now: () => BEFORE_MIDNIGHT });

    expect(changed).toEqual([]);
    expect(store.status("p")).toBe("in_progress");
    expect(store.logs()).toEqual([]);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("KST 9/18 00:00부터 정산이고 시스템 행위자 로그 한 줄(trigger end_date_passed · 발효일 9/18)", async () => {
    const store = makeStore([{ id: "p", status: "in_progress", endDate: "2026-09-17", lastChangeAt: null }]);
    const logger = quietLogger();

    const changed = await applyAutoSettlement({ projectIds: ["p"] }, { ...store, logger, now: () => AFTER_MIDNIGHT });

    expect(changed).toEqual(["p"]);
    expect(store.status("p")).toBe("settling");
    expect(store.logs()).toEqual([
      {
        viewer: SYSTEM_VIEWER,
        entry: {
          actionType: "status_change",
          entity: "project",
          entityId: "p",
          detail: { from: "in_progress", to: "settling", trigger: "end_date_passed", effectiveOn: "2026-09-18" },
        },
      },
    ]);
    expect(logger.info).toHaveBeenCalledWith("project.auto_settle", { count: 1 });
  });

  it("같은 날 두 번 부르면 두 번째는 바뀐 것이 없고 로그는 여전히 한 줄이다", async () => {
    const store = makeStore([{ id: "p", status: "in_progress", endDate: "2026-09-17", lastChangeAt: null }]);
    const deps = { ...store, logger: quietLogger(), now: () => AFTER_MIDNIGHT };

    await applyAutoSettlement({ projectIds: ["p"] }, deps);
    const second = await applyAutoSettlement({ projectIds: ["p"] }, deps);

    expect(second).toEqual([]);
    expect(store.logs()).toHaveLength(1);
  });

  it("진행 밖 상태(수주중 · 미수주 · 정산 · 완료)는 종료일이 지나도 바뀌지 않는다", async () => {
    const others = ["bidding", "lost", "settling", "completed"];
    const store = makeStore(
      others.map((status) => ({ id: status, status, endDate: "2026-09-01", lastChangeAt: null })),
    );

    const changed = await applyAutoSettlement({}, { ...store, logger: quietLogger(), now: () => AFTER_MIDNIGHT });

    expect(changed).toEqual([]);
    for (const status of others) expect(store.status(status)).toBe(status);
    expect(store.logs()).toEqual([]);
  });

  it("발효일은 종료일 + 1과 직전 상태 변경일(KST) 중 늦은 날이다 — 9/23 KST에 진행으로 바꾼 종료일 9/10은 9/23", async () => {
    // 2026-09-22T16:00Z = KST 9/23 01:00 — UTC 날짜(9/22)가 아니라 KST 날짜를 쓴다.
    const store = makeStore([
      { id: "p", status: "in_progress", endDate: "2026-09-10", lastChangeAt: new Date("2026-09-22T16:00:00Z") },
    ]);

    await applyAutoSettlement(
      { projectIds: ["p"] },
      { ...store, logger: quietLogger(), now: () => new Date("2026-09-24T01:00:00Z") },
    );

    expect(store.logs()[0]?.entry.detail).toEqual({
      from: "in_progress",
      to: "settling",
      trigger: "end_date_passed",
      effectiveOn: "2026-09-23",
    });
  });
});

describe("applyAutoSettlement — 로그 실패는 상태와 함께 롤백되고 읽기를 막지 않는다 (A-01 · A-15)", () => {
  it("recordAction이 던지면 상태는 진행 그대로, 함수는 던지지 않고 []이며 project.auto_settle_failed가 한 번이다", async () => {
    const store = makeStore([{ id: "p", status: "in_progress", endDate: "2026-09-17", lastChangeAt: null }]);
    const logger = quietLogger();

    const changed = await applyAutoSettlement(
      { projectIds: ["p"] },
      {
        ...store,
        logger,
        now: () => AFTER_MIDNIGHT,
        recordAction: () => Promise.reject(new Error("로그 쓰기 실패")),
      },
    );

    expect(changed).toEqual([]);
    expect(store.status("p")).toBe("in_progress");
    expect(store.logs()).toEqual([]);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith("project.auto_settle_failed", { projectIds: ["p"], reason: "Error" });
    expect(logger.info).not.toHaveBeenCalled();
  });
});

describe("effectiveOnFor — max(종료일 + 1, 직전 변경일) (A-08)", () => {
  it("직전 변경일이 종료일 + 1보다 늦으면 직전 변경일", () => {
    expect(effectiveOnFor({ endDate: "2026-09-10", lastChangeOn: "2026-09-23" })).toBe("2026-09-23");
  });

  it("직전 변경일이 이르면 종료일 + 1", () => {
    expect(effectiveOnFor({ endDate: "2026-09-17", lastChangeOn: "2026-09-01" })).toBe("2026-09-18");
  });

  it("직전 변경 기록이 없으면 종료일 + 1(월말 넘김 포함)", () => {
    expect(effectiveOnFor({ endDate: "2026-09-30", lastChangeOn: null })).toBe("2026-10-01");
  });
});
