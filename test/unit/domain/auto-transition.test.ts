import { describe, expect, it, vi } from "vitest";
import type { DbOrTx } from "@/repositories/document-counters";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import type { RecordActionEntry } from "@/domain/action-log/record";
import type { ProjectRow } from "@/repositories/projects";
import { isEndDatePassed } from "@/domain/projects/status";
import { projectResponsibles } from "@/domain/projects/responsibles";
import {
  applyAutoSettlement,
  effectiveOnFor,
  loadProjectForGate,
  type AutoSettlementDeps,
  type ProjectGateDeps,
} from "@/domain/projects/auto-transition";

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

  const settle: AutoSettlementDeps["settle"] = (_viewer, input) => {
    const targets = working.filter(
      (project) =>
        project.status === input.from &&
        project.endDate !== null &&
        project.endDate < input.todayKst &&
        (input.projectIds === undefined || input.projectIds.includes(project.id)),
    );
    for (const project of targets) project.status = input.to;
    return Promise.resolve(
      targets.map((project) => ({ id: project.id, endDate: project.endDate ?? "", lastChangeAt: project.lastChangeAt })),
    );
  };

  const recordAction: AutoSettlementDeps["recordAction"] = (viewer, entry) => {
    workingLogs.push({ viewer, entry });
    return Promise.resolve();
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

// ── 쓰기 입구(04-11 Task 2 · A-33 · OV-5) ──────────────────────────────────────
// 잠근 행을 같은 tx에서 판정한다. 실패는 삼키지 않는다(fail-closed).
function lockedRow(overrides: Partial<ProjectRow>): ProjectRow {
  return {
    id: "p",
    status: "in_progress",
    endDate: "2026-09-17",
    archivedAt: null,
    ...overrides,
  } as ProjectRow;
}

function gateDeps(row: ProjectRow | null, latest: { occurredAt: Date } | null = null) {
  const calls: string[] = [];
  const logged: LoggedAction[] = [];
  const deps: Partial<ProjectGateDeps> = {
    lockProject: (_viewer, id, tx) => {
      calls.push(`lock:${id}:${tx === FAKE_TX}`);
      return Promise.resolve(row);
    },
    updateStatus: (_viewer, id, input, tx) => {
      calls.push(`update:${id}:${input.expectedStatus}->${input.status}:${tx === FAKE_TX}`);
      return Promise.resolve(row ? { ...row, status: input.status } : null);
    },
    findLatestAction: (_viewer, query, tx) => {
      calls.push(`latest:${query.entityId}:${tx === FAKE_TX}`);
      return Promise.resolve(latest as Awaited<ReturnType<ProjectGateDeps["findLatestAction"]>>);
    },
    recordAction: (viewer, entry, recordDeps) => {
      calls.push(`log:${recordDeps?.tx === FAKE_TX}`);
      logged.push({ viewer, entry });
      return Promise.resolve();
    },
  };
  return { deps, calls, logged };
}

describe("loadProjectForGate — 잠금 안 선판정 (A-33 · OV-5)", () => {
  const viewer: Viewer = { id: "lead", roleId: "role-team-lead" };

  it("잠근 행이 지난 진행이면 같은 tx에서 정산으로 바꾸고 시스템 로그를 남긴 뒤 정산 행을 돌려준다", async () => {
    const { deps, calls, logged } = gateDeps(lockedRow({}), { occurredAt: new Date("2026-09-01T00:00:00Z") });
    const afterLock = vi.fn(() => {
      calls.push("afterLock");
      return Promise.resolve();
    });

    const row = await loadProjectForGate(viewer, "p", { now: () => AFTER_MIDNIGHT, tx: FAKE_TX, afterLock }, deps);

    expect(row?.status).toBe("settling");
    expect(calls).toEqual(["lock:p:true", "afterLock", "update:p:in_progress->settling:true", "latest:p:true", "log:true"]);
    expect(logged).toEqual([
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
  });

  it("판정 대상이 아니면(종료일 = 오늘 · 수주중 · 종료일 없음 · 보관) 잠근 행을 그대로 돌려주고 쓰지 않는다", async () => {
    for (const overrides of [
      { endDate: "2026-09-18" },
      { status: "bidding", endDate: "2026-09-01" },
      { endDate: null },
      { archivedAt: new Date("2026-09-01T00:00:00Z") },
    ]) {
      const locked = lockedRow(overrides);
      const { deps, calls, logged } = gateDeps(locked);
      const row = await loadProjectForGate(viewer, "p", { now: () => AFTER_MIDNIGHT, tx: FAKE_TX }, deps);
      expect(row).toBe(locked);
      expect(calls).toEqual(["lock:p:true"]);
      expect(logged).toEqual([]);
    }
  });

  it("없는 id는 null이다", async () => {
    const { deps } = gateDeps(null);
    expect(await loadProjectForGate(viewer, "missing", { now: () => AFTER_MIDNIGHT, tx: FAKE_TX }, deps)).toBeNull();
  });

  it("로그 쓰기가 던지면 그대로 던진다(fail-closed)", async () => {
    const { deps } = gateDeps(lockedRow({}));
    await expect(
      loadProjectForGate(
        viewer,
        "p",
        { now: () => AFTER_MIDNIGHT, tx: FAKE_TX },
        { ...deps, recordAction: () => Promise.reject(new Error("로그 쓰기 실패")) },
      ),
    ).rejects.toThrow("로그 쓰기 실패");
  });

  it("조건부 UPDATE가 0행이면 로그를 남기지 않고 던진다(fail-closed)", async () => {
    const { deps, logged } = gateDeps(lockedRow({}));
    await expect(
      loadProjectForGate(
        viewer,
        "p",
        { now: () => AFTER_MIDNIGHT, tx: FAKE_TX },
        { ...deps, updateStatus: () => Promise.resolve(null) },
      ),
    ).rejects.toThrow();
    expect(logged).toEqual([]);
  });
});

// ── 종료일 지남(D-81) · 담당자 이름 출처(04-11 Task 3 · 사용자 D20) ────────────────
// 「종료일 = 오늘」 경계는 여기(단위)에서만 본다(A-18 — E2E는 오늘에서 떨어진 날짜만).
describe("isEndDatePassed — 결정표 (D-81)", () => {
  const todayKst = "2026-09-18";
  const cases: { status: string; endDate: string | null; expected: boolean }[] = [
    { status: "bidding", endDate: "2026-09-17", expected: true },
    { status: "bidding", endDate: "2026-09-18", expected: false },
    { status: "bidding", endDate: "2026-09-19", expected: false },
    { status: "bidding", endDate: null, expected: false },
    { status: "in_progress", endDate: "2026-09-01", expected: false },
    { status: "settling", endDate: "2026-09-01", expected: false },
    { status: "completed", endDate: "2026-09-01", expected: false },
    { status: "lost", endDate: "2026-09-01", expected: false },
  ];
  for (const { status, endDate, expected } of cases) {
    it(`${status} · 종료일 ${endDate ?? "없음"} · 오늘 ${todayKst} → ${expected}`, () => {
      expect(isEndDatePassed({ status, endDate, todayKst })).toBe(expected);
    });
  }
});

describe("projectResponsibles — 팀장 = 업무 범위 team + projects.status 쓰기 후보의 이름순 첫 사람 (D20)", () => {
  const viewer: Viewer = { id: "pm", roleId: "role-pm" };
  const project = { teamId: "team-a", pmUserId: "pm-user" };

  function deps(candidates: { userId: string; name: string }[]) {
    const queries: { teamId: string; date: string }[] = [];
    return {
      queries,
      deps: {
        now: () => AFTER_MIDNIGHT,
        teamLeadCandidatesAtDate: (_viewer: Viewer, input: { teamId: string; date: string }) => {
          queries.push(input);
          return Promise.resolve(candidates);
        },
        findPmName: (_viewer: Viewer, userId: string) => Promise.resolve(userId === "pm-user" ? "박서연" : null),
      },
    };
  }

  it("후보가 둘이면 이름순 첫 사람이고, 후보 쿼리는 프로젝트 팀 · 오늘(KST)로 한 번이다", async () => {
    const { deps: stub, queries } = deps([
      { userId: "u2", name: "한지민" },
      { userId: "u1", name: "김도윤" },
    ]);

    expect(await projectResponsibles(viewer, project, stub)).toEqual({ pmName: "박서연", teamLeadName: "김도윤" });
    expect(queries).toEqual([{ teamId: "team-a", date: "2026-09-18" }]);
  });

  it("같은 팀에 업무 범위 company 계급만 있어 후보가 없으면 teamLeadName은 null이다", async () => {
    const { deps: stub } = deps([]);
    expect(await projectResponsibles(viewer, project, stub)).toEqual({ pmName: "박서연", teamLeadName: null });
  });
});
