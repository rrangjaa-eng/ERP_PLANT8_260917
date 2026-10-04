import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { assignTeam } from "@/domain/org";
import {
  createTeamExpenseDraft,
  ExpenseFieldError,
  getExpense,
  listExpenseFormOptions,
  previewExpense,
  saveExpenseDraft,
} from "@/domain/expenses";
import { insertVendor } from "@/repositories/vendors";
import { makePerson, teamIdByName } from "./approvals-fixtures";
import { attachEvidence, submitReadyDraft } from "./fixtures/expenses";

// 05-07 Task 1(EXP-08) — 프로젝트 없는 팀 비용 지출결의: 첫 저장 idempotency · 사용일 소속 팀 귀속(저장 때 고정) · 소속 없음 칸 오류 ·
// 번호 `T{연도 2자리}-{순번 4자리}`(카운터 expense_team · period = 제출일 서울 연도) · 제출 막힘 ⑥ 묶음에 종류 · 내용.

const NO_TEAM_ERROR = "사용일에 소속 팀 없음 · 사용일 고치기";
const SEPT = new Date("2026-09-26T03:00:00Z");

async function setup() {
  const pm = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
  await makePerson("김도윤", TEAM_LEAD_ROLE_ID, "기획1팀");
  await makePerson("최대표", CEO_ROLE_ID, null);
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: "회식집", normalizedName: `회식집-${randomUUID()}`, defaultEvidenceType: "tax_invoice" });
  return { pm, vendorId: vendor.id };
}

async function rowOf(id: string) {
  const [row] = await db.select().from(expenses).where(eq(expenses.id, id));
  if (!row) throw new Error("지출결의 행 없음");
  return row;
}

async function fillAndSubmit(pm: Viewer, vendorId: string, expenseId: string, now: Date) {
  const options = await listExpenseFormOptions(pm);
  const payment = options.payment[0]?.value;
  if (!payment) throw new Error("지급 방식 코드 없음");
  const version = (await rowOf(expenseId)).version;
  await saveExpenseDraft(pm, {
    expenseId,
    expectedVersion: version,
    fields: { vendorId, evidenceType: "tax_invoice", paymentMethod: payment, supply: { currency: "KRW", amount: 440_000, fxRate: 1 } },
  });
  return submitReadyDraft(pm, expenseId, { now });
}

describe("팀 비용 첫 저장 · 귀속", () => {
  it("같은 idempotency key로 두 번 저장해도 문서는 하나이고 귀속 팀은 사용일 소속(기획1팀)이다", async () => {
    const { pm } = await setup();
    const key = randomUUID();
    const input = { idempotencyKey: key, fields: { teamExpenseKind: "team_overhead" as const, usageDate: "2026-09-26", content: "팀 회식" } };
    const first = await createTeamExpenseDraft(pm, input, { now: SEPT });
    const second = await createTeamExpenseDraft(pm, input, { now: SEPT });
    expect(second.expenseId).toBe(first.expenseId);
    const rows = await db.select().from(expenses).where(eq(expenses.idempotencyKey, key));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      drafterId: pm.id,
      projectId: null,
      quoteLineId: null,
      teamExpenseKind: "team_overhead",
      usageDate: "2026-09-26",
      content: "팀 회식",
      attributedTeamId: await teamIdByName("기획1팀"),
      number: null,
    });
  });

  it("사용일을 비우고 열면 서울 오늘이 사용일이다", async () => {
    const { pm } = await setup();
    const { expenseId } = await createTeamExpenseDraft(pm, { idempotencyKey: randomUUID(), fields: {} }, { now: SEPT });
    expect(await rowOf(expenseId)).toMatchObject({ usageDate: "2026-09-26", teamExpenseKind: null, content: null });
  });

  it("사용일을 발령일 뒤로 바꿔 저장하면 귀속이 그날 소속으로 다시 오고, 소속 없는 날짜는 사용일 칸 오류다", async () => {
    const { pm } = await setup();
    await assignTeam(SYSTEM_VIEWER, { userId: pm.id, teamId: await teamIdByName("경영관리팀"), effectiveFrom: "2026-09-20" });
    const { expenseId } = await createTeamExpenseDraft(pm, { idempotencyKey: randomUUID(), fields: { usageDate: "2026-09-10" } }, { now: SEPT });
    expect((await rowOf(expenseId)).attributedTeamId).toBe(await teamIdByName("기획1팀"));

    await saveExpenseDraft(pm, { expenseId, expectedVersion: 1, fields: { usageDate: "2026-09-26" } });
    expect(await rowOf(expenseId)).toMatchObject({ usageDate: "2026-09-26", attributedTeamId: await teamIdByName("경영관리팀") });

    const before = await rowOf(expenseId);
    const failure = await saveExpenseDraft(pm, { expenseId, expectedVersion: before.version, fields: { usageDate: "2025-12-31" } }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ExpenseFieldError);
    expect(failure).toMatchObject({ field: "usageDate", message: NO_TEAM_ERROR });
    expect(await rowOf(expenseId)).toMatchObject({ version: before.version, usageDate: "2026-09-26" });

    const created = await createTeamExpenseDraft(pm, { idempotencyKey: randomUUID(), fields: { usageDate: "2025-12-31" } }, { now: SEPT }).catch((error: unknown) => error);
    expect(created).toMatchObject({ field: "usageDate", message: NO_TEAM_ERROR });
  });

  it("문서 DTO가 팀 이름 · 종류 라벨 · 사용일 · 내용을 싣는다", async () => {
    const { pm } = await setup();
    const { expenseId } = await createTeamExpenseDraft(
      pm,
      { idempotencyKey: randomUUID(), fields: { teamExpenseKind: "lost_bid", usageDate: "2026-09-26", content: "시안 제작" } },
      { now: SEPT },
    );
    expect(await getExpense(pm, { expenseId })).toMatchObject({
      projectId: null,
      quoteLineId: null,
      teamName: "기획1팀",
      teamExpenseKind: "lost_bid",
      teamExpenseKindLabel: "미수주 비용",
      usageDate: "2026-09-26",
      content: "시안 제작",
    });
  });
});

describe("팀 비용 제출 · 번호 T26-0001", () => {
  it("프로젝트 없이 제출되고 번호는 T26-0001 · T26-0002, 서울 2027-01-01 제출은 T27-0001이며 제출 뒤 발령은 귀속 팀을 바꾸지 않는다", async () => {
    const { pm, vendorId } = await setup();
    const create = () =>
      createTeamExpenseDraft(pm, { idempotencyKey: randomUUID(), fields: { teamExpenseKind: "team_overhead", usageDate: "2026-09-26", content: "팀 회식" } }, { now: SEPT });

    const first = (await create()).expenseId;
    const submitted = await fillAndSubmit(pm, vendorId, first, SEPT);
    expect(submitted).toMatchObject({ kind: "submitted", number: "T26-0001" });
    expect(await rowOf(first)).toMatchObject({ number: "T26-0001", projectId: null, attributedTeamId: await teamIdByName("기획1팀") });

    await assignTeam(SYSTEM_VIEWER, { userId: pm.id, teamId: await teamIdByName("경영관리팀"), effectiveFrom: "2026-09-27" });
    expect((await rowOf(first)).attributedTeamId).toBe(await teamIdByName("기획1팀"));
    const doc = await getExpense(pm, { expenseId: first });
    expect(doc).toMatchObject({ number: "T26-0001", teamName: "기획1팀" });

    const second = (await create()).expenseId;
    expect(await fillAndSubmit(pm, vendorId, second, SEPT)).toMatchObject({ number: "T26-0002" });

    const third = (await createTeamExpenseDraft(pm, { idempotencyKey: randomUUID(), fields: { teamExpenseKind: "lost_bid", usageDate: "2026-12-31", content: "신년 준비" } }, { now: SEPT })).expenseId;
    expect(await fillAndSubmit(pm, vendorId, third, new Date("2026-12-31T15:30:00Z"))).toMatchObject({ number: "T27-0001" });
  });

  it("종류 · 내용이 비면 ⑥ 묶음 `종류, 내용 2칸 비어 있음 · 종류 고르기`로 막히고 ①~④는 적용되지 않는다", async () => {
    const { pm, vendorId } = await setup();
    const { expenseId } = await createTeamExpenseDraft(pm, { idempotencyKey: randomUUID(), fields: { usageDate: "2026-09-26" } }, { now: SEPT });
    const options = await listExpenseFormOptions(pm);
    await saveExpenseDraft(pm, {
      expenseId,
      expectedVersion: 1,
      fields: { vendorId, evidenceType: "tax_invoice", paymentMethod: options.payment[0]?.value ?? null, supply: { currency: "KRW", amount: 440_000, fxRate: 1 } },
    });
    await attachEvidence(pm, expenseId);
    const preview = await previewExpense(pm, { expenseId, fields: {} });
    expect(preview.block).toMatchObject({ reason: "종류, 내용 2칸 비어 있음 · 종류 고르기", target: "teamExpenseKind" });

    const kindOnly = await previewExpense(pm, { expenseId, fields: { teamExpenseKind: "team_overhead" } });
    expect(kindOnly.block).toMatchObject({ reason: "내용 비어 있음 · 내용 적기", target: "content" });
    const filled = await previewExpense(pm, { expenseId, fields: { teamExpenseKind: "team_overhead", content: "팀 회식" } });
    expect(filled.block).toBeNull();
  });
});
