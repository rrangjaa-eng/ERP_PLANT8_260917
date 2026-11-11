import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db, pool } from "@/db/client";
import { approvalRoutes, approvalSteps } from "@/db/schema";
import { createExpenseFromLines } from "@/domain/expenses";
import { documentIdOf, notificationHref, type HrefRow } from "@/domain/notify/href";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { approveDocument } from "@/domain/approvals";
import { submitLeave } from "@/domain/leave";
import { requestLeaveCancel } from "@/domain/leave/cancel";
import { setSettingValue } from "@/domain/settings/registry";
import { CERT_ENABLED } from "@/domain/settings/keys";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createCertEvent } from "@/test/e2e/helpers/cert";
import { createAccount } from "@/domain/auth/accounts";
import { createIntakeViewer } from "../fixtures/evidence";
import { setupExpenseProject, submitReadyDraft } from "../fixtures/expenses";
import { makePaymentManager } from "../fixtures/payments";
import { makePerson, NOW_2026 } from "../approvals-fixtures";

// 07-14 N25 착지 함수 — 갈래별 URL, 볼 수 없으면 undefined, entityId 첫 `:` 앞 = 문서 id(C-P3-3), 갈래별 묶음 조회(N+1 없음).

const PAY_TARGETS = `/expenses?status=${encodeURIComponent("지급 대상")}`;
const ORPHANS = "/expenses/evidence?state=published";

async function stranger() {
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `href-${randomUUID()}@example.test`, name: "무관", roleId: DEFAULT_ROLE_ID });
  return { id: userId, roleId: DEFAULT_ROLE_ID };
}

async function submitted() {
  const fx = await setupExpenseProject();
  const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("지출결의 없음");
  const doc = await submitReadyDraft(fx.pm, expenseId);
  if (doc.kind !== "submitted") throw new Error("제출 안 됨");
  const [step] = await db
    .select({ id: approvalSteps.id })
    .from(approvalSteps)
    .innerJoin(approvalRoutes, eq(approvalRoutes.id, approvalSteps.routeId))
    .where(and(eq(approvalRoutes.instanceId, doc.instanceId), isNull(approvalSteps.actedAt)))
    .orderBy(approvalSteps.stepIndex)
    .limit(1);
  if (!step) throw new Error("단계 없음");
  return { fx, expenseId, stepId: step.id };
}

describe("documentIdOf", () => {
  it("첫 `:` 앞이 문서 id — 없으면 전체", () => {
    expect(documentIdOf("p-1")).toBe("p-1");
    expect(documentIdOf("p-1:2026-10-30")).toBe("p-1");
    expect(documentIdOf("e-1:s-1:x")).toBe("e-1");
  });
});

describe("notificationHref — 갈래별 (N25 · T-07-14-01)", () => {
  it("지출결의 · 결재 결과 · 결재 단계 · 프로젝트(두 꼴) — 볼 수 있으면 URL, 남이면 undefined", async () => {
    const { fx, expenseId, stepId } = await submitted();
    const rows: HrefRow[] = [
      { entity: "expense", entityId: `${expenseId}:2026-10-22` },
      { entity: "expense-result", entityId: `${expenseId}:${randomUUID()}` },
      { entity: "approval-step", entityId: stepId },
      { entity: "project", entityId: fx.projectId },
      { entity: "project", entityId: `${fx.projectId}:2026-10-30` },
      { entity: "card-usage", entityId: randomUUID() },
    ];
    const expense = `/expenses/${expenseId}`;
    const project = `/projects/${fx.projectId}`;
    expect(await notificationHref(fx.pm, rows)).toEqual([expense, expense, expense, project, project, undefined]);
    // 결재 단계 후보(팀장)는 그 문서를 본다.
    expect((await notificationHref(fx.lead, rows)).slice(0, 3)).toEqual([expense, expense, expense]);
    expect(await notificationHref(await stranger(), rows)).toEqual([undefined, undefined, undefined, undefined, undefined, undefined]);
    // 계급 없는 viewer는 모두 없음.
    expect(await notificationHref({ id: fx.pm.id, roleId: null }, rows)).toEqual(rows.map(() => undefined));
  });

  it("지급 주는 지급 처리 권한자(경영관리)만 · 임자 없는 증빙은 증빙 등록 권한자만", async () => {
    const payer = await makePaymentManager();
    const intake = await createIntakeViewer();
    const outsider = await stranger();
    const rows: HrefRow[] = [
      { entity: "pay-week", entityId: "2026-10-23" },
      { entity: "evidence-orphans", entityId: "2026-10-22" },
    ];
    expect(await notificationHref(payer, rows)).toEqual([PAY_TARGETS, undefined]);
    expect(await notificationHref(intake, rows)).toEqual([undefined, ORPHANS]);
    expect(await notificationHref(outsider, rows)).toEqual([undefined, undefined]);
  });

  it("확인증 행사 — 그 행사를 볼 수 있는 신청자에게만 행사 화면", async () => {
    await setSettingValue(SYSTEM_VIEWER, CERT_ENABLED, true);
    const owner = await stranger();
    const other = await stranger();
    const made = await createCertEvent({ createdBy: owner.id });
    const rows: HrefRow[] = [{ entity: "cert_event", entityId: made.eventId }];
    expect(await notificationHref(owner, rows)).toEqual([`/certs/events/${made.eventId}`]);
    expect(await notificationHref(other, rows)).toEqual([undefined]);
  });

  it("행 50개(갈래마다 여러 문서)도 질의 수가 갈래마다 한 묶음 — 행 수와 무관하다", async () => {
    const one = await submitted();
    const many = [await submitted(), await submitted(), await submitted()];
    const viewer = one.fx.pm;
    const rowsOf = (docs: Array<Awaited<ReturnType<typeof submitted>>>): HrefRow[] =>
      docs.flatMap((doc) => [
        { entity: "expense", entityId: doc.expenseId },
        { entity: "approval-step", entityId: doc.stepId },
        { entity: "project", entityId: doc.fx.projectId },
        { entity: "pay-week", entityId: "2026-10-23" },
        { entity: "evidence-orphans", entityId: "2026-10-22" },
      ]);
    const count = async (rows: HrefRow[]) => {
      const spy = vi.spyOn(pool, "query");
      try {
        await notificationHref(viewer, rows);
        return spy.mock.calls.length;
      } finally {
        spy.mockRestore();
      }
    };
    const small = await count(rowsOf([one]));
    const big = rowsOf([one, ...many]);
    const fifty = [...big, ...big, ...big].slice(0, 50);
    expect(fifty).toHaveLength(50);
    expect(await count(fifty)).toBe(small);
  });

  it("(07.2-15 Codex PR #335) 연차 취소 결재 단계 → 원 연차 문서 `/leave/{원 연차 id}` · 무관한 사람은 undefined", async () => {
    const deps = { now: NOW_2026 };
    const drafter = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
    const lead = await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    const ceo = await makePerson("최대표", CEO_ROLE_ID, null);
    const leave = await submitLeave(drafter, { kind: "full_day", startDate: "2026-09-21", endDate: "2026-09-21", half: "" }, deps);
    await approveDocument(lead, { instanceId: leave.instanceId, expectedVersion: 1 }, deps);
    await approveDocument(ceo, { instanceId: leave.instanceId, expectedVersion: 2 }, deps);
    const cancel = await requestLeaveCancel(drafter, { leaveId: leave.leaveId, reason: "일정 바뀜" }, deps);
    const [step] = await db
      .select({ id: approvalSteps.id })
      .from(approvalSteps)
      .innerJoin(approvalRoutes, eq(approvalRoutes.id, approvalSteps.routeId))
      .where(eq(approvalRoutes.instanceId, cancel.instanceId));
    if (!step) throw new Error("취소 단계 없음");
    const rows: HrefRow[] = [{ entity: "approval-step", entityId: step.id }];
    expect(await notificationHref(lead, rows)).toEqual([`/leave/${leave.leaveId}`]);
    expect(await notificationHref(await stranger(), rows)).toEqual([undefined]);
  });
});
