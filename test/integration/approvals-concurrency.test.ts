import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { approvalInstances, approvalRoutes, approvalSteps, leaveRequests } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, DIVISION_HEAD_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import {
  approveDocument,
  prepareSubmission,
  rejectDocument,
  withdrawDocument,
  ApprovalConflictError,
  NotCurrentHolderError,
} from "@/domain/approvals";
import { submitLeave, LEAVE_DOCUMENT_KIND } from "@/domain/leave";
import { resubmitLeave } from "@/domain/leave/resubmit";
import {
  APPROVAL_ROUTE_LEAVE_STEP1_ROLE_ID,
  APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID,
  APPROVAL_ROUTE_LEAVE_STEP4_ENABLED,
} from "@/domain/settings/keys";
import { applySettingsImport, upsertSimpleValue } from "@/repositories/settings";
import { appendActionLog } from "@/repositories/action-log";
import { handleServerError } from "@/lib/actions/handle-server-error";
import { log } from "@/lib/log";
import { countRows, makePerson, NOW_2026 } from "./approvals-fixtures";

// CEO-2: 트랜잭션 안에서는 tx를 받는 리포지토리 호출만 돈다 — 결재선 설정 · 번호
// 서식 · 조직 스냅숏 · 행동 로그 켜짐 여부는 트랜잭션 전에 읽고, 번호 할당이
// 마지막 쓰기다. 그래서 기본 풀(DB_POOL_MAX 5)보다 많은 제출이 겹쳐도 풀
// 고갈 교착 없이 전부 끝난다.
describe("연차 동시 제출 — 풀 5에서 6건(CEO-2)", () => {
  it("서로 다른 기안자 여섯 명의 동시 제출이 전부 끝나고 번호 여섯 개가 서로 다르다", async () => {
    expect(pool.options.max).toBe(5);
    await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    await makePerson("최대표", CEO_ROLE_ID, null);
    const drafters = [];
    for (let i = 0; i < 6; i++) drafters.push(await makePerson(`기안자${i}`, DEFAULT_ROLE_ID, "기획1팀"));

    const results = await Promise.all(
      drafters.map((drafter) =>
        submitLeave(drafter, { kind: "full_day", startDate: "2026-09-21", endDate: "2026-09-21", half: "" }, { now: NOW_2026 }),
      ),
    );

    const numbers = results.map((r) => r.number).sort();
    expect(numbers).toEqual(["LV26-0001", "LV26-0002", "LV26-0003", "LV26-0004", "LV26-0005", "LV26-0006"]);
  }, 20000);
});

// EXP-04 concurrency(Codex HIGH 스냅숏): 결재선 17키는 SELECT 한 문장으로 읽혀 한
// 제출의 단계 행은 한 커밋 시점의 설정 한 벌에서만 나온다.
describe("결재선 설정 스냅숏 — 한 제출 = 한 커밋 시점의 설정", () => {
  const STEP1 = APPROVAL_ROUTE_LEAVE_STEP1_ROLE_ID.key;
  const STEP2 = APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID.key;

  async function roles12(drafterId: string) {
    const prepared = await prepareSubmission({ id: drafterId, roleId: DEFAULT_ROLE_ID }, { kind: LEAVE_DOCUMENT_KIND, drafterId }, { now: NOW_2026 });
    const byIndex = new Map(prepared.steps.map((step) => [step.stepIndex, step.roleId]));
    return [byIndex.get(1), byIndex.get(2)];
  }

  it("결정적 — 두 키를 바꾸고 커밋 전에 멈춘 트랜잭션 동안은 둘 다 옛 값, 커밋 뒤에는 둘 다 새 값", async () => {
    const drafter = await makePerson("기안자", DEFAULT_ROLE_ID, "기획1팀");
    await makePerson("최대표", CEO_ROLE_ID, null);

    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let written!: () => void;
    const wrote = new Promise<void>((resolve) => {
      written = resolve;
    });
    const tx = db.transaction(async (t) => {
      await upsertSimpleValue(SYSTEM_VIEWER, STEP1, DEFAULT_ROLE_ID, null, t);
      await upsertSimpleValue(SYSTEM_VIEWER, STEP2, DEFAULT_ROLE_ID, null, t);
      written();
      await held;
    });
    await wrote;
    expect(await roles12(drafter.id)).toEqual([TEAM_LEAD_ROLE_ID, DIVISION_HEAD_ROLE_ID]);
    release();
    await tx;
    expect(await roles12(drafter.id)).toEqual([DEFAULT_ROLE_ID, DEFAULT_ROLE_ID]);
  });

  it("경주 — 두 키를 한 트랜잭션으로 번갈아 쓰는 가져오기와 30회 겹쳐도 섞인 쌍이 한 번도 없다", async () => {
    const drafter = await makePerson("기안자", DEFAULT_ROLE_ID, "기획1팀");
    await makePerson("최대표", CEO_ROLE_ID, null);
    const X = TEAM_LEAD_ROLE_ID;
    const Y = DEFAULT_ROLE_ID;
    await applySettingsImport(SYSTEM_VIEWER, {
      simple: [
        { key: STEP1, value: X, by: null },
        { key: STEP2, value: X, by: null },
      ],
      historized: [],
    });

    const pairs: (string | null | undefined)[][] = [];
    for (let i = 0; i < 30; i++) {
      const value = i % 2 === 0 ? Y : X;
      const [, pair] = await Promise.all([
        applySettingsImport(SYSTEM_VIEWER, {
          simple: [
            { key: STEP1, value, by: null },
            { key: STEP2, value, by: null },
          ],
          historized: [],
        }),
        roles12(drafter.id),
      ]);
      pairs.push(pair);
    }
    expect(pairs.filter(([a, b]) => a !== b)).toEqual([]);
  }, 30000);
});

// ── 04.1-02 Task 3: 동시 조작 — 두 순서 모두 하나만 성공하고 진 쪽은 누가 · 언제 · 무엇을 했는지 받는다 ──
// 경주 테스트는 「정확히 하나 성공」과 「기록 수」만 단언하고 어느 쪽이 이기는지는 단언하지 않는다.
// 진 쪽 문구는 DB 행의 updated_at(서울 HH:MM)으로 기대값을 만든다. 자동 재시도는 어디에도 없다.

const SEOUL_HHMM = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const NOT_HOLDER_TEXT = "지금 담당이 아님 · 새로 고침";
const FULL_DAY_T3 = { kind: "full_day", startDate: "2026-09-21", endDate: "2026-09-23", half: "" };
const RESUBMIT_T3 = { kind: "full_day", startDate: "2026-09-28", endDate: "2026-09-29", half: "" };
const T3 = { now: NOW_2026 };

async function instanceRow(instanceId: string) {
  const [row] = await db.select().from(approvalInstances).where(eq(approvalInstances.id, instanceId));
  if (!row) throw new Error("인스턴스 없음");
  return row;
}

async function detailText(instanceId: string, name: string, particle: "이" | "가", verb: string): Promise<string> {
  const row = await instanceRow(instanceId);
  return `${name}${particle} ${SEOUL_HHMM.format(row.updatedAt)}에 ${verb} · 새로 고침`;
}

async function stepRows(instanceId: string) {
  return db
    .select({ round: approvalRoutes.round, stepIndex: approvalSteps.stepIndex, actedBy: approvalSteps.actedBy, isFallback: approvalSteps.isFallback, action: approvalSteps.action })
    .from(approvalSteps)
    .innerJoin(approvalRoutes, eq(approvalRoutes.id, approvalSteps.routeId))
    .where(eq(approvalRoutes.instanceId, instanceId));
}

async function actedCountOf(instanceId: string): Promise<number> {
  return (await stepRows(instanceId)).filter((row) => row.actedBy !== null).length;
}

async function frozen(instanceId: string, leaveId: string) {
  const [leave] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, leaveId));
  const instance = await instanceRow(instanceId);
  return {
    status: instance.status,
    version: instance.version,
    round: instance.currentRound,
    routes: (await db.select().from(approvalRoutes).where(eq(approvalRoutes.instanceId, instanceId))).length,
    steps: await stepRows(instanceId),
    leave: leave ? [leave.kind, leave.startDate, leave.endDate, leave.half, leave.note, leave.number] : null,
  };
}

async function caught(promise: Promise<unknown>): Promise<Error> {
  return promise.then(
    () => {
      throw new Error("거부되어야 하는데 성공함");
    },
    (error: unknown) => error as Error,
  );
}

function expectNoDetail(message: string, names: string[]) {
  for (const name of names) expect(message).not.toContain(name);
  expect(message).not.toMatch(/\d{2}:\d{2}/);
  for (const word of ["승인함", "반려함", "회수함", "최종 승인됨", "다시 신청함"]) expect(message).not.toContain(word);
}

describe("승인 ↔ 회수 · 승인 ↔ 반려 — 두 순서(EXP-03 concurrency)", () => {
  async function org() {
    return {
      drafter: await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀"),
      lead: await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀"),
      lead2: await makePerson("정팀장", TEAM_LEAD_ROLE_ID, "기획1팀"),
      ceo: await makePerson("최대표", CEO_ROLE_ID, null),
    };
  }

  it("순서 A — 승인(v1) 뒤 회수(v1): 회수는 `김팀장이 HH:MM에 승인함`으로 거부, 상태 in_review", async () => {
    const o = await org();
    const doc = await submitLeave(o.drafter, FULL_DAY_T3, T3);
    await approveDocument(o.lead, { instanceId: doc.instanceId, expectedVersion: 1 }, T3);
    const error = await caught(withdrawDocument(o.drafter, { instanceId: doc.instanceId, expectedVersion: 1 }, T3));
    expect(error).toBeInstanceOf(ApprovalConflictError);
    expect(error.message).toBe(await detailText(doc.instanceId, "김팀장", "이", "승인함"));
    expect((await instanceRow(doc.instanceId)).status).toBe("in_review");
  });

  it("순서 B — 회수(v1) 뒤 승인(v1): 승인은 정확히 `박서연이 HH:MM에 회수함`으로 거부(지금 담당이 아님이 아니다), 상태 withdrawn, 처리 기록 0건", async () => {
    const o = await org();
    const doc = await submitLeave(o.drafter, FULL_DAY_T3, T3);
    await withdrawDocument(o.drafter, { instanceId: doc.instanceId, expectedVersion: 1 }, T3);
    const error = await caught(approveDocument(o.lead, { instanceId: doc.instanceId, expectedVersion: 1 }, T3));
    expect(error).toBeInstanceOf(ApprovalConflictError);
    expect(error.message).toBe(await detailText(doc.instanceId, "박서연", "이", "회수함"));
    expect((await instanceRow(doc.instanceId)).status).toBe("withdrawn");
    expect(await actedCountOf(doc.instanceId)).toBe(0);
  });

  it("승인 ↔ 반려 순서 A — 김팀장 승인(v1) 뒤 정팀장 반려(v1): `김팀장이 … 승인함`", async () => {
    const o = await org();
    const doc = await submitLeave(o.drafter, FULL_DAY_T3, T3);
    await approveDocument(o.lead, { instanceId: doc.instanceId, expectedVersion: 1 }, T3);
    const error = await caught(rejectDocument(o.lead2, { instanceId: doc.instanceId, expectedVersion: 1, reason: "일정 겹침" }, T3));
    expect(error.message).toBe(await detailText(doc.instanceId, "김팀장", "이", "승인함"));
    expect((await instanceRow(doc.instanceId)).status).toBe("in_review");
  });

  it("승인 ↔ 반려 순서 B — 정팀장 반려(v1) 뒤 김팀장 승인(v1): `정팀장이 … 반려함`, 상태 rejected", async () => {
    const o = await org();
    const doc = await submitLeave(o.drafter, FULL_DAY_T3, T3);
    await rejectDocument(o.lead2, { instanceId: doc.instanceId, expectedVersion: 1, reason: "일정 겹침" }, T3);
    const error = await caught(approveDocument(o.lead, { instanceId: doc.instanceId, expectedVersion: 1 }, T3));
    expect(error.message).toBe(await detailText(doc.instanceId, "정팀장", "이", "반려함"));
    expect((await instanceRow(doc.instanceId)).status).toBe("rejected");
    expect(await actedCountOf(doc.instanceId)).toBe(1);
  });

  it("경주 20회 — 승인과 회수를 동시에: 매번 정확히 하나만 성공 · 단계 기록 1건 이하", async () => {
    const o = await org();
    for (let i = 0; i < 20; i++) {
      const doc = await submitLeave(o.drafter, FULL_DAY_T3, T3);
      const results = await Promise.allSettled([
        approveDocument(o.lead, { instanceId: doc.instanceId, expectedVersion: 1 }, T3),
        withdrawDocument(o.drafter, { instanceId: doc.instanceId, expectedVersion: 1 }, T3),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      for (const result of results) {
        if (result.status === "rejected") expect(result.reason).toBeInstanceOf(ApprovalConflictError);
      }
      expect(await actedCountOf(doc.instanceId)).toBeLessThanOrEqual(1);
    }
  }, 60000);

  it("같은 단계 후보 둘의 동시 승인 — 하나만 기록, 진 쪽은 `{이긴 사람}이 HH:MM에 승인함`", async () => {
    const o = await org();
    const doc = await submitLeave(o.drafter, FULL_DAY_T3, T3);
    const results = await Promise.allSettled([
      approveDocument(o.lead, { instanceId: doc.instanceId, expectedVersion: 1 }, T3),
      approveDocument(o.lead2, { instanceId: doc.instanceId, expectedVersion: 1 }, T3),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const winner = results[0]?.status === "fulfilled" ? "김팀장" : "정팀장";
    const loser = results.find((result) => result.status === "rejected");
    expect(loser?.status === "rejected" ? (loser.reason as Error).message : "").toBe(await detailText(doc.instanceId, winner, "이", "승인함"));
    expect(await actedCountOf(doc.instanceId)).toBe(1);
  });

  it("같은 사람이 같은 version으로 두 번 승인 — 두 번째가 충돌, 단계 기록 1건", async () => {
    const o = await org();
    const doc = await submitLeave(o.drafter, FULL_DAY_T3, T3);
    await approveDocument(o.lead, { instanceId: doc.instanceId, expectedVersion: 1 }, T3);
    await expect(approveDocument(o.lead, { instanceId: doc.instanceId, expectedVersion: 1 }, T3)).rejects.toBeInstanceOf(ApprovalConflictError);
    expect(await actedCountOf(doc.instanceId)).toBe(1);
  });
});

describe("관련자만 상세 문구(ENG-6 · D1 · CX-W4)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("무관한 기획 PM의 옛 version 승인 · 반려 · 회수 · 다시 신청: 전부 `지금 담당이 아님` · handleServerError 통과 뒤 같은 값 · 상세 낱말 없음 · not_holder · 행 불변 — 최종 승인 뒤 옛 · 지금 version도 같다", async () => {
    const drafter = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
    const lead = await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    const ceo = await makePerson("최대표", CEO_ROLE_ID, null);
    const pm = await makePerson("무관PM", DEFAULT_ROLE_ID, "기획1팀");
    const doc = await submitLeave(drafter, FULL_DAY_T3, T3);
    await approveDocument(lead, { instanceId: doc.instanceId, expectedVersion: 1 }, T3);
    const before = await frozen(doc.instanceId, doc.leaveId);
    const infoSpy = vi.spyOn(log, "info");
    const stale = { instanceId: doc.instanceId, expectedVersion: 1 };

    const attempts: Promise<unknown>[] = [
      approveDocument(pm, stale, T3),
      rejectDocument(pm, { ...stale, reason: "일정 겹침" }, T3),
      withdrawDocument(pm, stale, T3),
      resubmitLeave(pm, { leaveId: doc.leaveId, expectedVersion: 1, input: RESUBMIT_T3 }, T3),
    ];
    for (const attempt of attempts) {
      const error = await caught(attempt);
      expect(error).toBeInstanceOf(NotCurrentHolderError);
      expect(error.message).toBe(NOT_HOLDER_TEXT);
      expect(handleServerError(error)).toBe(NOT_HOLDER_TEXT);
      expectNoDetail(error.message, ["김팀장", "박서연"]);
      expect(infoSpy).toHaveBeenLastCalledWith("approval.refused", expect.objectContaining({ viewerId: pm.id, reason: "not_holder" }));
    }
    expect(await frozen(doc.instanceId, doc.leaveId)).toEqual(before);

    await approveDocument(ceo, { instanceId: doc.instanceId, expectedVersion: 2 }, T3);
    for (const version of [1, 3]) {
      const error = await caught(withdrawDocument(pm, { instanceId: doc.instanceId, expectedVersion: version }, T3));
      expect(error.message).toBe(NOT_HOLDER_TEXT);
    }
    const drafterError = await caught(withdrawDocument(drafter, { instanceId: doc.instanceId, expectedVersion: 3 }, T3));
    expect(drafterError.message).toBe("최종 승인됨 · 새로 고침");
  });

  it("관련자 세 부류(기안자 · 처리자 · 지금 담당)는 옛 version에 상세 문구를 받는다", async () => {
    const drafter = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
    const lead = await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    const divHead = await makePerson("본부장", DIVISION_HEAD_ROLE_ID, "기획1팀");
    await makePerson("최대표", CEO_ROLE_ID, null);
    const doc = await submitLeave(drafter, FULL_DAY_T3, T3);
    await approveDocument(lead, { instanceId: doc.instanceId, expectedVersion: 1 }, T3);
    const expected = await detailText(doc.instanceId, "김팀장", "이", "승인함");
    for (const viewer of [drafter, lead, divHead]) {
      const error = await caught(approveDocument(viewer, { instanceId: doc.instanceId, expectedVersion: 1 }, T3));
      expect(error).toBeInstanceOf(ApprovalConflictError);
      expect(error.message).toBe(expected);
    }
    expect(await actedCountOf(doc.instanceId)).toBe(1);
  });

  it("(X-3) 단계 행 없는 지금 대표 폴백 후보도 관련자 — 상세 문구 · conflict, 무관한 PM은 not_holder", async () => {
    await upsertSimpleValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_STEP4_ENABLED.key, false, null);
    const drafter = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
    const lead = await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    const ceo1 = await makePerson("최대표", CEO_ROLE_ID, null);
    await makePerson("한대표", CEO_ROLE_ID, null);
    const pm = await makePerson("무관PM", DEFAULT_ROLE_ID, "기획1팀");
    const doc = await submitLeave(drafter, FULL_DAY_T3, T3);
    await approveDocument(lead, { instanceId: doc.instanceId, expectedVersion: 1 }, T3);
    expect((await stepRows(doc.instanceId)).some((row) => row.isFallback)).toBe(false);
    const infoSpy = vi.spyOn(log, "info");

    const error = await caught(approveDocument(ceo1, { instanceId: doc.instanceId, expectedVersion: 1 }, T3));
    expect(error).toBeInstanceOf(ApprovalConflictError);
    expect(error.message).toBe(await detailText(doc.instanceId, "김팀장", "이", "승인함"));
    expect(infoSpy).toHaveBeenLastCalledWith("approval.refused", expect.objectContaining({ viewerId: ceo1.id, reason: "conflict" }));
    expect(await actedCountOf(doc.instanceId)).toBe(1);
    expect((await instanceRow(doc.instanceId)).version).toBe(2);

    const pmError = await caught(approveDocument(pm, { instanceId: doc.instanceId, expectedVersion: 1 }, T3));
    expect(pmError.message).toBe(NOT_HOLDER_TEXT);
    expect(infoSpy).toHaveBeenLastCalledWith("approval.refused", expect.objectContaining({ viewerId: pm.id, reason: "not_holder" }));
  });
});

describe("원시 오류 없는 경합(CEO-6 · B-C1)", () => {
  it("대표 폴백 후보 둘의 동시 승인 — 하나만 성공, 진 쪽은 `{이긴 대표}가 HH:MM에 승인함`, 폴백 행 1개", async () => {
    await upsertSimpleValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_STEP4_ENABLED.key, false, null);
    const drafter = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
    const ceo1 = await makePerson("최대표", CEO_ROLE_ID, null);
    const ceo2 = await makePerson("한대표", CEO_ROLE_ID, null);
    const doc = await submitLeave(drafter, FULL_DAY_T3, T3);
    const results = await Promise.allSettled([
      approveDocument(ceo1, { instanceId: doc.instanceId, expectedVersion: 1 }, T3),
      approveDocument(ceo2, { instanceId: doc.instanceId, expectedVersion: 1 }, T3),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const winner = results[0]?.status === "fulfilled" ? "최대표" : "한대표";
    const loser = results.find((result) => result.status === "rejected");
    const loserError = loser?.status === "rejected" ? (loser.reason as Error) : new Error("진 쪽 없음");
    expect(loserError).toBeInstanceOf(ApprovalConflictError);
    expect(loserError.message).toBe(await detailText(doc.instanceId, winner, "가", "승인함"));
    expect((await stepRows(doc.instanceId)).filter((row) => row.isFallback)).toHaveLength(1);
  });

  it("다시 신청 두 번 동시 — 하나만 성공, 진 쪽은 정확히 `박서연이 HH:MM에 다시 신청함`, 차수 2 행 1개", async () => {
    const drafter = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
    const lead = await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    await makePerson("최대표", CEO_ROLE_ID, null);
    const doc = await submitLeave(drafter, FULL_DAY_T3, T3);
    const rejected = await rejectDocument(lead, { instanceId: doc.instanceId, expectedVersion: 1, reason: "일정 겹침" }, T3);
    const call = () => resubmitLeave(drafter, { leaveId: doc.leaveId, expectedVersion: rejected.version, input: RESUBMIT_T3 }, T3);
    const results = await Promise.allSettled([call(), call()]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const loser = results.find((result) => result.status === "rejected");
    const loserError = loser?.status === "rejected" ? (loser.reason as Error) : new Error("진 쪽 없음");
    expect(loserError).toBeInstanceOf(ApprovalConflictError);
    expect(loserError.message).toBe(await detailText(doc.instanceId, "박서연", "이", "다시 신청함"));
    const round2 = await db.select().from(approvalRoutes).where(eq(approvalRoutes.instanceId, doc.instanceId));
    expect(round2.filter((route) => route.round === 2)).toHaveLength(1);
  });
});

describe("반려 상태의 사건별 종결 문구(CX-B1)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("지금 version — 관련자(기안자 회수 · 팀장 승인 · 팀장 반려)는 `김팀장이 … 반려함` · final, 무관한 PM 넷은 not_holder, 행 불변 뒤 기안자 다시 신청 성공", async () => {
    const drafter = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
    const lead = await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    await makePerson("최대표", CEO_ROLE_ID, null);
    const pm = await makePerson("무관PM", DEFAULT_ROLE_ID, "기획1팀");
    const doc = await submitLeave(drafter, FULL_DAY_T3, T3);
    const rejected = await rejectDocument(lead, { instanceId: doc.instanceId, expectedVersion: 1, reason: "일정 겹침" }, T3);
    const current = { instanceId: doc.instanceId, expectedVersion: rejected.version };
    const before = await frozen(doc.instanceId, doc.leaveId);
    const expected = await detailText(doc.instanceId, "김팀장", "이", "반려함");
    const infoSpy = vi.spyOn(log, "info");

    for (const attempt of [
      withdrawDocument(drafter, current, T3),
      approveDocument(lead, current, T3),
      rejectDocument(lead, { ...current, reason: "다시 반려" }, T3),
    ]) {
      const error = await caught(attempt);
      expect(error).toBeInstanceOf(ApprovalConflictError);
      expect(error.message).toBe(expected);
      expect(infoSpy).toHaveBeenLastCalledWith("approval.refused", expect.objectContaining({ reason: "final" }));
    }
    for (const attempt of [
      approveDocument(pm, current, T3),
      rejectDocument(pm, { ...current, reason: "다시 반려" }, T3),
      withdrawDocument(pm, current, T3),
      resubmitLeave(pm, { leaveId: doc.leaveId, expectedVersion: rejected.version, input: RESUBMIT_T3 }, T3),
    ]) {
      const error = await caught(attempt);
      expect(error.message).toBe(NOT_HOLDER_TEXT);
      expectNoDetail(error.message, ["김팀장"]);
      expect(infoSpy).toHaveBeenLastCalledWith("approval.refused", expect.objectContaining({ viewerId: pm.id, reason: "not_holder" }));
    }
    expect(await frozen(doc.instanceId, doc.leaveId)).toEqual(before);

    const resubmitted = await resubmitLeave(drafter, { leaveId: doc.leaveId, expectedVersion: rejected.version, input: RESUBMIT_T3 }, T3);
    expect(resubmitted.round).toBe(2);
  });
});

// 인계 지적(04.1-01 SUMMARY Issues): 로그 실패 주입 사례는 던지면 어차피 롤백되므로 「로그 쓰기가 tx 밖으로
// 샌다」는 회귀를 잡지 못한다. 여기서는 로그 쓰기 직후 · 커밋 전에 **다른 커넥션**(풀의 db)에서 action_log를
// 센다 — 전이 tx 안에서 쓰였으면 아직 보이지 않아야 하고(READ COMMITTED), tx 없이 풀로 썼으면 즉시 보인다.
// 그래서 recordActionInTx가 tx를 넘기지 않거나 전이가 tx 대신 db를 넘기면 이 단언이 결정적으로 깨진다.
describe("행동 로그는 전이 tx 안에서만 쓰인다 — 외부 커넥션 가드(결정적)", () => {
  function guardedAppend(seen: number[]): typeof appendActionLog {
    return async (viewer, entry, tx) => {
      const row = await appendActionLog(viewer, entry, tx);
      seen.push(await countRows("action_log"));
      return row;
    };
  }

  it("제출 · 승인 · 반려 · 회수 · 다시 신청 — 로그 쓰기 직후 외부 커넥션에는 보이지 않고 커밋 뒤에만 보인다", async () => {
    const drafter = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
    const lead = await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    await makePerson("최대표", CEO_ROLE_ID, null);

    async function expectInTx(run: (append: typeof appendActionLog) => Promise<unknown>) {
      const seen: number[] = [];
      const before = await countRows("action_log");
      await run(guardedAppend(seen));
      expect(seen, "로그 쓰기 직후 외부 커넥션에서 본 action_log 행 수").toEqual([before]);
      expect(await countRows("action_log")).toBe(before + 1);
    }

    let submitted!: Awaited<ReturnType<typeof submitLeave>>;
    await expectInTx(async (append) => {
      submitted = await submitLeave(drafter, FULL_DAY_T3, { ...T3, appendActionLog: append });
    });
    await expectInTx((append) => approveDocument(lead, { instanceId: submitted.instanceId, expectedVersion: 1 }, { ...T3, appendActionLog: append }));
    await expectInTx((append) => withdrawDocument(drafter, { instanceId: submitted.instanceId, expectedVersion: 2 }, { ...T3, appendActionLog: append }));

    const doc = await submitLeave(drafter, FULL_DAY_T3, T3);
    await expectInTx((append) =>
      rejectDocument(lead, { instanceId: doc.instanceId, expectedVersion: 1, reason: "일정 겹침" }, { ...T3, appendActionLog: append }),
    );
    await expectInTx((append) =>
      resubmitLeave(drafter, { leaveId: doc.leaveId, expectedVersion: 2, input: RESUBMIT_T3 }, { ...T3, appendActionLog: append }),
    );
  });
});
