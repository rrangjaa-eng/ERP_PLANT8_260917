import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, approvalInstances, approvalRoutes, approvalSteps } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import {
  ApprovalConflictError,
  approveDocument,
  getApprovalView,
  prepareSubmission,
  registerDocumentKind,
  resubmitDocument,
  submitDocument,
  withdrawDocument,
  type DocumentKindDef,
  type RouteConfig,
} from "@/domain/approvals";
import { LEAVE_DOCUMENT_KIND, submitLeave } from "@/domain/leave";
import { resubmitLeave } from "@/domain/leave/resubmit";
import { appendActionLog } from "@/repositories/action-log";
import { bumpInstanceVersion } from "@/repositories/approvals";
import { makePerson, NOW_2026 } from "./approvals-fixtures";

// 05-01(E1 · E2 · E4): 04.1 결재 엔진의 선택 필드 덧붙임. 테스트 전용 종류(이 파일에만 있는 키)로 회수 뒤 같은 문서
// 다시 제출 → 증빙 변경(version만 +1) → 옛 version 승인 거부 → 최종 승인 훅(같은 트랜잭션)까지 끝에서 끝까지 본다.
// 04.1 연차의 기본 동작이 바뀌지 않는 것도 여기서 본다.

// 호출 순서 기록 — withTransaction 콜백 진입을 "tx"로 적어 prepareFinalApproval이 트랜잭션 밖(앞)에서 불렸는지 본다.
const calls = vi.hoisted(() => ({ order: [] as string[] }));
vi.mock("@/lib/db-transaction", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db-transaction")>();
  const withTransaction: typeof actual.withTransaction = (fn) =>
    actual.withTransaction((tx) => {
      calls.order.push("tx");
      return fn(tx);
    });
  return { ...actual, withTransaction };
});

const FINAL_HOOK_ACTION = "test_final_hook";

type HookLog = { prepared: string[]; inTx: string[]; canResubmitArgs: Array<string | undefined>; failInTx: boolean };
const hooks: HookLog = { prepared: [], inTx: [], canResubmitArgs: [], failInTx: false };

function hookedKind(kind: string, route: RouteConfig): DocumentKindDef {
  return {
    kind,
    label: "테스트 확장",
    loadRouteConfig: () => Promise.resolve(route),
    href: (id) => `/test-ext/${id}`,
    describeDocuments: () => Promise.resolve(new Map()),
    resubmitFrom: ["rejected", "withdrawn"],
    canResubmit: (_viewer, documentId) => {
      hooks.canResubmitArgs.push(documentId);
      return Promise.resolve(true);
    },
    prepareFinalApproval: (_viewer, documentId) => {
      calls.order.push("prepare");
      hooks.prepared.push(documentId);
      return Promise.resolve({ marker: `P-${documentId}` });
    },
    onFinalApprovalInTx: async (viewer, documentId, tx, prepared) => {
      calls.order.push("inTx");
      hooks.inTx.push(documentId);
      if (hooks.failInTx) throw new Error("훅 실패 주입");
      await appendActionLog(
        viewer,
        {
          actorId: viewer.id,
          actorRoleId: viewer.roleId,
          actionType: FINAL_HOOK_ACTION,
          entity: "test_ext",
          entityId: documentId,
          documentId,
          detail: { prepared: prepared as Record<string, unknown> },
        },
        tx,
      );
    },
  };
}

const ONE_STEP_KIND = "test_ext_one_step";
const TWO_STEP_KIND = "test_ext_two_step";
registerDocumentKind(
  hookedKind(ONE_STEP_KIND, {
    selfApproval: "skip",
    steps: [{ enabled: true, roleId: TEAM_LEAD_ROLE_ID, scope: "drafter_team", orgUnitId: "" }],
  }),
);
registerDocumentKind(
  hookedKind(TWO_STEP_KIND, {
    selfApproval: "skip",
    steps: [
      { enabled: true, roleId: TEAM_LEAD_ROLE_ID, scope: "drafter_team", orgUnitId: "" },
      { enabled: true, roleId: CEO_ROLE_ID, scope: "company", orgUnitId: "" },
    ],
  }),
);

type Org = { drafter: Viewer; lead: Viewer; ceo: Viewer };

async function org(): Promise<Org> {
  return {
    drafter: await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀"),
    lead: await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀"),
    ceo: await makePerson("최대표", CEO_ROLE_ID, null),
  };
}

async function submitTestDocument(drafter: Viewer, kind: string): Promise<{ instanceId: string; documentId: string }> {
  const documentId = randomUUID();
  const prepared = await prepareSubmission(drafter, { kind, drafterId: drafter.id }, { now: NOW_2026 });
  const instance = await db.transaction((tx) => submitDocument(drafter, prepared, { documentId }, tx));
  return { instanceId: instance.id, documentId };
}

async function instanceOf(instanceId: string) {
  const [row] = await db.select().from(approvalInstances).where(eq(approvalInstances.id, instanceId));
  if (!row) throw new Error("인스턴스가 없습니다");
  return row;
}

async function actedStepCount(instanceId: string): Promise<number> {
  const rows = await db
    .select({ id: approvalSteps.id })
    .from(approvalSteps)
    .innerJoin(approvalRoutes, eq(approvalRoutes.id, approvalSteps.routeId))
    .where(and(eq(approvalRoutes.instanceId, instanceId), isNotNull(approvalSteps.actedBy)));
  return rows.length;
}

async function logCount(documentId: string, actionType?: string): Promise<number> {
  const rows = await db
    .select({ seq: actionLog.seq })
    .from(actionLog)
    .where(actionType ? and(eq(actionLog.documentId, documentId), eq(actionLog.actionType, actionType)) : eq(actionLog.documentId, documentId));
  return rows.length;
}

const SEOUL_HHMM = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

beforeEach(() => {
  calls.order.length = 0;
  hooks.prepared.length = 0;
  hooks.inTx.length = 0;
  hooks.canResubmitArgs.length = 0;
  hooks.failInTx = false;
});

describe("트레이서 — 회수 뒤 다시 제출 · 증빙 변경 · 최종 훅", () => {
  it("제출 → 회수 → 같은 문서 다시 제출(차수 2) → 증빙 변경 → 옛 version 거부 → 새 version 최종 승인 → 같은 tx 훅", async () => {
    const { drafter, lead } = await org();
    const { instanceId, documentId } = await submitTestDocument(drafter, ONE_STEP_KIND);
    expect(await instanceOf(instanceId)).toMatchObject({ status: "submitted", currentRound: 1, version: 1 });

    // 기안자 회수 → withdrawn.
    const withdrawn = await withdrawDocument(drafter, { instanceId, expectedVersion: 1 }, { now: NOW_2026 });
    expect(withdrawn.status).toBe("withdrawn");

    // 회수된 문서의 가능 행동에 다시 제출이 있고, canResubmit은 그 문서 id를 받았다(Round 4 D5).
    const drafterView = await getApprovalView(drafter, { kind: ONE_STEP_KIND, documentId }, { now: NOW_2026 });
    expect(drafterView?.actions).toContain("resubmit");
    expect(hooks.canResubmitArgs).toContain(documentId);

    // 같은 문서 id로 다시 제출 — 같은 인스턴스 · 차수 2 · submitted, 차수 1 단계 행은 남는다.
    const prepared = await prepareSubmission(drafter, { kind: ONE_STEP_KIND, drafterId: drafter.id }, { now: NOW_2026 });
    const resubmitted = await db.transaction((tx) =>
      resubmitDocument(drafter, prepared, { instanceId, expectedVersion: withdrawn.version }, tx),
    );
    expect(resubmitted).toMatchObject({ status: "submitted", round: 2 });
    const afterResubmit = await instanceOf(instanceId);
    expect(afterResubmit).toMatchObject({ id: instanceId, documentId, status: "submitted", currentRound: 2 });
    const routes = await db.select().from(approvalRoutes).where(eq(approvalRoutes.instanceId, instanceId));
    expect(routes.map((route) => route.round).sort()).toEqual([1, 2]);
    const round1 = routes.find((route) => route.round === 1);
    expect(round1).toBeDefined();
    expect(await db.select().from(approvalSteps).where(eq(approvalSteps.routeId, round1?.id ?? ""))).toHaveLength(1);

    // 팀장이 문서를 연다(version V).
    const leadView = await getApprovalView(lead, { kind: ONE_STEP_KIND, documentId }, { now: NOW_2026 });
    const seenVersion = leadView?.version ?? -1;
    expect(seenVersion).toBe(afterResubmit.version);

    // 기안자 쪽 증빙 변경 — 상태 그대로 · version + 1 · version_reason evidence.
    const bumped = await db.transaction((tx) =>
      bumpInstanceVersion(drafter, { instanceId, updatedBy: drafter.id, reason: "evidence" }, tx),
    );
    expect(bumped).toMatchObject({ status: "submitted", currentRound: 2, version: seenVersion + 1, versionReason: "evidence" });

    // 옛 version 승인 → 거부 · 증빙 변경 문구 · 단계 기록 0건.
    const refused = await approveDocument(lead, { instanceId, expectedVersion: seenVersion }, { now: NOW_2026 }).then(
      () => null,
      (error: unknown) => error,
    );
    expect(refused).toBeInstanceOf(ApprovalConflictError);
    const bumpedRow = await instanceOf(instanceId);
    expect((refused as Error).message).toBe(`박서연이 ${SEOUL_HHMM.format(bumpedRow.updatedAt)}에 증빙을 바꿈 · 새로 고침`);
    expect(await actedStepCount(instanceId)).toBe(0);

    // 새 version 승인 → 최종 승인 · version_reason null · 훅이 같은 tx로 쓴 표식 행 커밋.
    calls.order.length = 0;
    hooks.prepared.length = 0;
    const approved = await approveDocument(lead, { instanceId, expectedVersion: seenVersion + 1 }, { now: NOW_2026 });
    expect(approved).toMatchObject({ status: "approved", final: true });
    expect(await instanceOf(instanceId)).toMatchObject({ status: "approved", versionReason: null });
    expect(await logCount(documentId, FINAL_HOOK_ACTION)).toBe(1);
    // prepareFinalApproval은 트랜잭션 전에 그 문서 id로, onFinalApprovalInTx는 콜백 안에서.
    expect(hooks.prepared).toEqual([documentId]);
    expect(calls.order).toEqual(["prepare", "tx", "inTx"]);
  });
});

describe("훅 롤백 · 기본 동작 불변", () => {
  it("onFinalApprovalInTx가 던지면 상태 · version · 단계 기록 · 행동 로그가 호출 전과 같고, 주입 없이 다시 승인하면 성공", async () => {
    const { drafter, lead } = await org();
    const { instanceId, documentId } = await submitTestDocument(drafter, ONE_STEP_KIND);
    const before = await instanceOf(instanceId);
    const stepsBefore = await actedStepCount(instanceId);
    const logsBefore = await logCount(documentId);

    hooks.failInTx = true;
    await expect(approveDocument(lead, { instanceId, expectedVersion: before.version }, { now: NOW_2026 })).rejects.toThrow("훅 실패 주입");
    const after = await instanceOf(instanceId);
    expect({ status: after.status, version: after.version }).toEqual({ status: before.status, version: before.version });
    expect(await actedStepCount(instanceId)).toBe(stepsBefore);
    expect(await logCount(documentId)).toBe(logsBefore);

    hooks.failInTx = false;
    const approved = await approveDocument(lead, { instanceId, expectedVersion: before.version }, { now: NOW_2026 });
    expect(approved.status).toBe("approved");
    expect(await logCount(documentId, FINAL_HOOK_ACTION)).toBe(1);
  });

  it("최종이 아닌 승인(2단 결재선의 1단)에서는 onFinalApprovalInTx가 불리지 않는다", async () => {
    const { drafter, lead, ceo } = await org();
    const { instanceId, documentId } = await submitTestDocument(drafter, TWO_STEP_KIND);
    const first = await approveDocument(lead, { instanceId, expectedVersion: 1 }, { now: NOW_2026 });
    expect(first).toMatchObject({ status: "in_review", final: false });
    expect(hooks.inTx).toEqual([]);
    expect(await logCount(documentId, FINAL_HOOK_ACTION)).toBe(0);

    const second = await approveDocument(ceo, { instanceId, expectedVersion: first.version }, { now: NOW_2026 });
    expect(second.status).toBe("approved");
    expect(hooks.inTx).toEqual([documentId]);
  });

  it("resubmitFrom이 없는 종류(연차)는 회수 뒤 다시 신청이 거부되고 가능 행동에 다시 신청이 없다", async () => {
    const { drafter } = await org();
    const input = { kind: "full_day", startDate: "2026-09-21", endDate: "2026-09-23", half: "" };
    const submitted = await submitLeave(drafter, input, { now: NOW_2026 });
    const withdrawn = await withdrawDocument(drafter, { instanceId: submitted.instanceId, expectedVersion: 1 }, { now: NOW_2026 });
    expect(withdrawn.status).toBe("withdrawn");

    const view = await getApprovalView(drafter, { kind: LEAVE_DOCUMENT_KIND, documentId: submitted.leaveId }, { now: NOW_2026 });
    expect(view?.actions ?? []).not.toContain("resubmit");
    await expect(
      resubmitLeave(drafter, { leaveId: submitted.leaveId, expectedVersion: withdrawn.version, input }, { now: NOW_2026 }),
    ).rejects.toBeInstanceOf(ApprovalConflictError);
    expect(await instanceOf(submitted.instanceId)).toMatchObject({ status: "withdrawn", currentRound: 1 });
  });
});

describe("종류 키 리터럴 없음 — 등록된 종류 전부", () => {
  afterEach(() => {
    vi.doUnmock("@/domain/approvals/kinds");
  });

  it("document-kinds.ts가 import하는 등록 모듈이 실제로 등록한 종류 키가 domain/approvals/*.ts에 따옴표 리터럴로 0번 나온다", async () => {
    const root = process.cwd();
    const kindsSource = readFileSync(path.join(root, "app/(app)/document-kinds.ts"), "utf8");
    const modules = [...kindsSource.matchAll(/^import "(@\/domain\/[^"]+)";/gm)].map((match) => match[1] ?? "");
    expect(modules.length).toBeGreaterThan(0);

    // 격리 그래프에서 등록 모듈을 다시 적재하며 registerDocumentKind가 받은 kind를 모은다(레지스트리도 새로 생긴다).
    const registered: string[] = [];
    vi.resetModules();
    vi.doMock("@/domain/approvals/kinds", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/domain/approvals/kinds")>();
      return {
        ...actual,
        registerDocumentKind: (def: DocumentKindDef) => {
          registered.push(def.kind);
          actual.registerDocumentKind(def);
        },
      };
    });
    const isolatedClient = await import("@/db/client");
    try {
      for (const specifier of modules) await import(/* @vite-ignore */ specifier);
    } finally {
      await isolatedClient.closeDb();
      vi.resetModules();
    }
    expect(registered.length).toBeGreaterThanOrEqual(modules.length);

    const engineDir = path.join(root, "domain/approvals");
    const codeLines = readdirSync(engineDir)
      .filter((file) => file.endsWith(".ts"))
      .flatMap((file) => readFileSync(path.join(engineDir, file), "utf8").split("\n"))
      .filter((line) => {
        const trimmed = line.trim();
        return !trimmed.startsWith("//") && !trimmed.startsWith("*");
      });
    for (const kind of registered) {
      const quoted = [`"${kind}"`, `'${kind}'`, `\`${kind}\``];
      expect(codeLines.filter((line) => quoted.some((literal) => line.includes(literal))), kind).toEqual([]);
    }
  });
});
