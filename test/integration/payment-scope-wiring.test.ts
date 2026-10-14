import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { approvalInstances, expensePayments, expenses, files } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { ForbiddenError } from "@/domain/permissions/can";
import { approveDocument, listCurrentSteps } from "@/domain/approvals";
import { createExpenseFromLines, createTeamExpenseDraft, listExpenseFormOptions, saveExpenseDraft } from "@/domain/expenses";
import { voidEvidence } from "@/domain/evidence";
import { previewPayable } from "@/domain/payments";
import { completePaymentsBatch } from "@/domain/payments/batch";
import { listPaidPayments, paidViewAllowed } from "@/domain/payments/targets";
import { sumKrw } from "@/domain/money";
import { seoulToday } from "@/lib/dates";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertVendor } from "@/repositories/vendors";
import { makePerson, teamIdByName } from "./approvals-fixtures";
import { makeEvidenceManager, setupApprovedProject, setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "./fixtures/expenses";
import { makePaymentManager, setEvidenceRequired } from "./fixtures/payments";

// 06.5-09(D-6516 · 카드 ③ — 사용자 카드 10/13 23:29 KST 「지급 완료·발행 요청 목록 범위 — 전부 보기」): PR-E가 만든 읽기 경로의 보는 범위 회귀.
// 팀 A = 기획1팀(setupExpenseProject 프로젝트 · 팀 비용 귀속), 팀 B = 경영관리팀(setupApprovedProject — 다른 팀 PM).
// 결재는 기본 결재선 그대로 — 팀 B 문서의 1단(행사 담당 팀장)을 맡을 경영관리팀 팀장을 둔다.

beforeEach(async () => {
  await setEvidenceRequired(false);
});

async function versionOf(expenseId: string): Promise<number> {
  const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  return row.version;
}

// 결재선 단계마다 지금 담당 후보인 사람을 사람 묶음에서 골라 승인한다 — 기본 2단(경영관리본부)은 그 본부에 사람이 있으면 대표 폴백이
// 아니라 그 사람이라(팀 B 사람을 만들면 바뀐다) 결재자를 순서로 박지 않는다.
async function approveThrough(pool: readonly Viewer[], expenseId: string): Promise<void> {
  for (let step = 0; step < 5; step++) {
    const [instance] = await db
      .select()
      .from(approvalInstances)
      .where(and(eq(approvalInstances.documentKind, "expense"), eq(approvalInstances.documentId, expenseId)));
    if (!instance) throw new Error("결재 인스턴스 없음");
    if (instance.status === "approved") return;
    let holder: Viewer | undefined;
    for (const person of pool) {
      if ((await listCurrentSteps(person, { kind: "expense" })).get(instance.id)?.viewerIsCandidate) {
        holder = person;
        break;
      }
    }
    if (!holder) throw new Error(`지금 담당이 묶음에 없음: ${instance.status} ${JSON.stringify((await listCurrentSteps(SYSTEM_VIEWER, { kind: "expense" })).get(instance.id))} ${step}`);
    await approveDocument(holder, { instanceId: instance.id, expectedVersion: instance.version });
  }
  throw new Error("결재 통과 안 됨");
}

// 결재 통과 뒤 증빙을 무효 처리해 증빙 0(P4) — 06-15 픽스처(approvedExpenseWithoutEvidence)와 같은 길.
async function voidAll(expenseId: string): Promise<void> {
  const voider = await makeEvidenceManager("증빙무효", { attach: false, void: true });
  const alive = await db
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.ownerKind, "expense"), eq(files.ownerId, expenseId), isNull(files.removedAt), isNull(files.voidedAt)));
  for (const file of alive) await voidEvidence(voider, { fileId: file.id, reason: "다른 건 영수증" });
}

async function lineDoc(drafter: Viewer, approvers: readonly Viewer[], lineId: string): Promise<string> {
  const expenseId = (await createExpenseFromLines(drafter, { lineIds: [lineId] })).created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  const submitted = await submitReadyDraft(drafter, expenseId);
  if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
  await approveThrough(approvers, expenseId);
  await voidAll(expenseId);
  return expenseId;
}

async function teamCostDoc(drafter: Viewer, approvers: readonly Viewer[]): Promise<string> {
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: "회식집", normalizedName: `회식집-${randomUUID()}`, defaultEvidenceType: "tax_invoice" });
  const { expenseId } = await createTeamExpenseDraft(drafter, { idempotencyKey: randomUUID(), fields: { teamExpenseKind: "team_overhead", usageDate: seoulToday(), content: "팀 회식" } });
  const payment = (await listExpenseFormOptions(drafter)).payment[0]?.value ?? null;
  await saveExpenseDraft(drafter, {
    expenseId,
    expectedVersion: await versionOf(expenseId),
    fields: { vendorId: vendor.id, evidenceType: "tax_invoice", paymentMethod: payment, supply: { currency: "KRW", amount: 440_000, fxRate: 1 } },
  });
  const submitted = await submitReadyDraft(drafter, expenseId);
  if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
  await approveThrough(approvers, expenseId);
  await voidAll(expenseId);
  return expenseId;
}

async function makePayer(): Promise<Viewer> {
  const payer = await makePaymentManager();
  if (!payer.roleId) throw new Error("계급 없음");
  for (const infoItem of ["expense.value", "expense.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: payer.roleId, infoItem, visible: true });
  return payer;
}

// EP2-D2: 팀 범위 계급(기획1팀) + 지출결의 보기 + 지급 처리 쓰기 — 카드 ③의 「지급 권한자」 중 보는 범위가 팀인 사람.
async function makeTeamScopePayer(): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `팀지급-${randomUUID().slice(0, 8)}`, workScope: "team", viewScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.payments", action: "write", allowed: true });
  for (const infoItem of ["expense.value", "expense.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  return makePerson("팀지급", role.id, "기획1팀");
}

type PaidWorld = { fx: ExpenseFixture; docs: { projectA: string; projectB: string; teamCostA: string }; transfers: number[] };

// 이번 달 지급 완료 셋 — 팀 A 프로젝트 문서 · 팀 B 프로젝트 문서 · 팀 A 귀속 팀 비용 문서(프로젝트 없음).
async function paidWorld(): Promise<PaidWorld> {
  const fx = await setupExpenseProject();
  const otherTeamPm = await makePerson("타팀PM", DEFAULT_ROLE_ID, "경영관리팀");
  const mgmtLead = await makePerson("경영팀장", TEAM_LEAD_ROLE_ID, "경영관리팀");
  const projectB = await setupApprovedProject(`경영 행사 ${randomUUID().slice(0, 8)}`, await teamIdByName("경영관리팀"), otherTeamPm, fx.stageOneId);
  const approvers = [fx.lead, mgmtLead, otherTeamPm, fx.ceo];
  const docs = {
    projectA: await lineDoc(fx.pm, approvers, fx.lines.withVendor),
    projectB: await lineDoc(otherTeamPm, approvers, projectB.lineId),
    teamCostA: await teamCostDoc(fx.pm, approvers),
  };
  const payer = await makePayer();
  const payDate = seoulToday();
  const rows = [];
  for (const expenseId of Object.values(docs)) {
    const preview = await previewPayable(payer, { expenseId, payDate });
    if (preview.payableKrw === undefined || preview.payableKrw === null) throw new Error("지급 총액을 셈할 수 없는 문서");
    rows.push({ expenseId, expenseVersion: await versionOf(expenseId), expectedPayableKrw: preview.payableKrw });
  }
  const result = await completePaymentsBatch(payer, { payDate, rows });
  if (result.processed !== rows.length) throw new Error(`지급 안 됨: ${JSON.stringify(result.blocked)}`);
  const live = await db.select({ transferKrw: expensePayments.transferKrw }).from(expensePayments).where(isNull(expensePayments.cancelledAt));
  return { fx, docs, transfers: live.map((row) => row.transferKrw) };
}

function paidIds(list: Awaited<ReturnType<typeof listPaidPayments>>): string[] {
  return list.groups.flatMap((group) => group.rows.map((row) => row.id ?? "")).sort();
}

describe("보는 범위 배선 — PR-E 경로(06.5 D-6516)", () => {
  describe("지급 완료 목록(카드 ③ · EP1-12 · D1)", () => {
    it("팀 범위 + 지급 처리 쓰기 viewer — 팀 B 프로젝트 · 팀 비용까지 3건 · 합계 = 셋의 이체액 합 · 월 목록에 이번 달", async () => {
      const w = await paidWorld();
      const viewer = await makeTeamScopePayer();

      const list = await listPaidPayments(viewer, {});

      expect(paidIds(list)).toEqual(Object.values(w.docs).sort());
      expect(paidIds(list)).toContain(w.docs.teamCostA);
      expect(list.total).toEqual({ count: 3, sumKrw: sumKrw(w.transfers) });
      expect(list.months).toContain(seoulToday().slice(0, 7));
    }, 30_000);

    it("지출결의 보는 범위 전사(대표 · 지급 권한 없음) → 3건 · PM · 직원 → ForbiddenError", async () => {
      const w = await paidWorld();

      expect(paidIds(await listPaidPayments(w.fx.ceo, {}))).toEqual(Object.values(w.docs).sort());
      await expect(listPaidPayments(w.fx.pm, {})).rejects.toBeInstanceOf(ForbiddenError);
      await expect(listPaidPayments(w.fx.otherPm, {})).rejects.toBeInstanceOf(ForbiddenError);
    }, 30_000);

    it("paidViewAllowed(EP2-D1) — 지급 권한자(팀 범위) 참 · 전사 범위 비권한자 참 · PM 거짓 · 직원 거짓", async () => {
      const fx = await setupExpenseProject();
      const payer = await makeTeamScopePayer();

      expect(await paidViewAllowed(payer)).toBe(true);
      expect(await paidViewAllowed(fx.ceo)).toBe(true);
      expect(await paidViewAllowed(fx.pm)).toBe(false);
      expect(await paidViewAllowed(fx.otherPm)).toBe(false);
    });
  });
});
