import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { expenses, teams, users } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createTeamExpenseDraft, createExpenseFromLines, listExpenseFormOptions, saveExpenseDraft } from "@/domain/expenses";
import { listExpenses, normalizeListQuery, searchFieldsFor } from "@/domain/expenses/list";
import { approveDocument } from "@/domain/approvals";
import { ForbiddenError } from "@/domain/permissions/can";
import { previewPayable } from "@/domain/payments";
import { completePaymentsBatch } from "@/domain/payments/batch";
import { listPaidPayments, listPaymentTargets } from "@/domain/payments/targets";
import { changeExpensePayeeUser } from "@/domain/expenses";
import { seoulToday } from "@/lib/dates";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertVendor } from "@/repositories/vendors";
import { makePerson, orgUnitIdByName, teamIdByName } from "./approvals-fixtures";
import { createTeam } from "@/domain/org";
import { DIVISION_HEAD_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { setupExpenseProject, submitReadyDraft, testVendorAccount, type ExpenseFixture } from "./fixtures/expenses";
import { approvedExpenseWithoutEvidence, makePaymentManager, setEvidenceRequired } from "./fixtures/payments";

// 06.5-08 Task 1(D-6508 · G20 · EP1-13 · EP2-D5 · D2): 지출결의 목록 검색 `q` — 보는 범위와 AND, 열마다 DTO 정보 항목(expense.value · person.value),
// 0건이어도 hasAny · drafterColumn은 검색과 무관. 팀 이름은 대상이 아니다(ND-9).

const NOW = new Date();

async function teamDoc(viewer: Viewer, input: { vendorId?: string; payeeUserId?: string; content: string }): Promise<{ expenseId: string; number: string }> {
  const { expenseId } = await createTeamExpenseDraft(viewer, {
    idempotencyKey: randomUUID(),
    fields: { teamExpenseKind: "team_overhead", usageDate: seoulToday(), content: input.content },
  });
  const payment = (await listExpenseFormOptions(viewer)).payment[0]?.value ?? null;
  await saveExpenseDraft(viewer, {
    expectedVersion: 1,
    expenseId,
    fields: {
      ...(input.vendorId ? { vendorId: input.vendorId } : {}),
      ...(input.payeeUserId ? { payeeUserId: input.payeeUserId } : {}),
      evidenceType: "tax_invoice",
      paymentMethod: payment,
      supply: { currency: "KRW", amount: 440_000, fxRate: 1 },
    },
  });
  const submitted = await submitReadyDraft(viewer, expenseId, { now: NOW });
  if (submitted.kind !== "submitted") throw new Error("제출 실패");
  return { expenseId, number: submitted.number };
}

type World = {
  fx: ExpenseFixture;
  line: { expenseId: string; number: string };
  vendorDoc: { expenseId: string; number: string };
  payeeDoc: { expenseId: string; number: string };
};

// 박서연이 세 문서를 낸다 — 견적 줄 문서(거래처 `스테이지원` · 프로젝트 `가을 팝업` · 항목 `무대 제작`) · 팀 비용(거래처 `더테이블`) · 팀 비용(직원 지급처 `김직원`).
async function world(): Promise<World> {
  const fx = await setupExpenseProject();
  const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
  const lineId = created.created[0]?.expenseId ?? "";
  const lineSubmitted = await submitReadyDraft(fx.pm, lineId, { now: NOW });
  if (lineSubmitted.kind !== "submitted") throw new Error("제출 실패");
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: "더테이블", normalizedName: `더테이블-${randomUUID()}`, defaultEvidenceType: "tax_invoice", ...testVendorAccount() });
  const staff = await makePerson("김직원", DEFAULT_ROLE_ID, "기획1팀");
  await db.update(users).set(testVendorAccount()).where(eq(users.id, staff.id));
  return {
    fx,
    line: { expenseId: lineId, number: lineSubmitted.number },
    vendorDoc: await teamDoc(fx.pm, { vendorId: vendor.id, content: "팀 회식" }),
    payeeDoc: await teamDoc(fx.pm, { payeeUserId: staff.id, content: "직원 정산" }),
  };
}

// 보는 범위 전사 + 지출결의 보기. 정보 항목은 인자대로(정보 노출 행이 없으면 꺼짐).
async function searcher(info: { value: boolean; amount: boolean; person: boolean }): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `검색-${randomUUID().slice(0, 8)}`, workScope: "company", viewScope: "company" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "view", allowed: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "expense.value", visible: info.value });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "expense.amount", visible: info.amount });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "person.value", visible: info.person });
  return makePerson(`검색자-${randomUUID().slice(0, 4)}`, role.id, null);
}

async function search(viewer: Viewer, q: string | null) {
  return listExpenses(viewer, { status: "all", q }, { today: seoulToday() });
}

function ids(list: Awaited<ReturnType<typeof search>>): string[] {
  return list.groups.flatMap((group) => group.rows.map((row) => row.id ?? "")).sort();
}

describe("지출결의 목록 검색(06.5 D-6508)", () => {
  it("번호 · 거래처 이름 · 직원 지급처 이름 · 프로젝트 이름 · 항목 · 기안자 이름으로 찾고, 앞뒤 공백은 같으며, 건수 · 합계가 검색을 따른다", async () => {
    const w = await world();
    const viewer = await searcher({ value: true, amount: true, person: true });

    expect(ids(await search(viewer, w.line.number))).toEqual([w.line.expenseId]);
    expect(ids(await search(viewer, `  ${w.line.number} `))).toEqual([w.line.expenseId]);
    expect(ids(await search(viewer, "스테이지"))).toEqual([w.line.expenseId]);
    expect(ids(await search(viewer, "더테이블"))).toEqual([w.vendorDoc.expenseId]);
    expect(ids(await search(viewer, "김직원"))).toEqual([w.payeeDoc.expenseId]);
    expect(ids(await search(viewer, "가을 팝업"))).toEqual([w.line.expenseId]);
    expect(ids(await search(viewer, "무대 제작"))).toEqual([w.line.expenseId]);
    expect(ids(await search(viewer, "팀 회식"))).toEqual([w.vendorDoc.expenseId]);
    // 목록 보기는 기안자 열이 있다(D2) — 기안자 이름은 세 문서 모두.
    expect(ids(await search(viewer, "박서연"))).toEqual([w.line.expenseId, w.vendorDoc.expenseId, w.payeeDoc.expenseId].sort());

    const one = await search(viewer, "더테이블");
    expect(one.total?.count).toBe(1);
    expect(one.total?.sumKrw).toBe(one.groups[0]?.rows[0]?.supply?.amount);
    expect((await search(viewer, null)).total?.count).toBe(3);
    expect(one.page.total).toBe(1);
  }, 60_000);

  it("내용(content)은 팀 비용 행에서만 찾는다 — 프로젝트 지출결의의 내용은 목록에 안 보이므로 걸리지 않는다(/review P3-1)", async () => {
    const w = await world();
    const viewer = await searcher({ value: true, amount: true, person: true });
    const term = `숨은내용-${randomUUID().slice(0, 8)}`;
    await db.update(expenses).set({ content: term }).where(eq(expenses.id, w.line.expenseId));
    expect(ids(await search(viewer, term))).toEqual([]);
    await db.update(expenses).set({ content: term }).where(eq(expenses.id, w.vendorDoc.expenseId));
    expect(ids(await search(viewer, term))).toEqual([w.vendorDoc.expenseId]);
  }, 60_000);

  it("검색어의 %·_·\\는 와일드카드가 아니라 글자로 찾는다(Codex P2)", async () => {
    const w = await world();
    const viewer = await searcher({ value: true, amount: true, person: true });
    await db.update(expenses).set({ content: "할인 A%B_C\\D" }).where(eq(expenses.id, w.vendorDoc.expenseId));
    await db.update(expenses).set({ content: "할인 AxByCzD" }).where(eq(expenses.id, w.payeeDoc.expenseId));

    expect(ids(await search(viewer, "_"))).toEqual([w.vendorDoc.expenseId]);
    expect(ids(await search(viewer, "%"))).toEqual([w.vendorDoc.expenseId]);
    expect(ids(await search(viewer, "A%B"))).toEqual([w.vendorDoc.expenseId]);
    expect(ids(await search(viewer, "B_C"))).toEqual([w.vendorDoc.expenseId]);
    expect(ids(await search(viewer, "C\\D"))).toEqual([w.vendorDoc.expenseId]);
  }, 60_000);

  it("보는 범위 밖 문서는 번호를 정확히 넣어도 0건이다(T-06.5-61)", async () => {
    const w = await world();
    const vendor = await insertVendor(SYSTEM_VIEWER, { name: "타팀거래처", normalizedName: `타팀-${randomUUID()}`, defaultEvidenceType: "tax_invoice", ...testVendorAccount() });
    const otherTeamPm = await makePerson("타팀PM", DEFAULT_ROLE_ID, "경영관리팀");
    const otherTeamDoc = await teamDoc(otherTeamPm, { vendorId: vendor.id, content: "타팀 비용" });
    // 보는 범위 팀(기획1팀) + 지출결의 보기 — 기획1팀 문서는 보이고 경영관리팀 문서는 범위 밖이다.
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `팀검색-${randomUUID().slice(0, 8)}`, workScope: "team", viewScope: "team" });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "view", allowed: true });
    for (const infoItem of ["expense.value", "expense.amount", "person.value"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
    const viewer = await makePerson("팀검색자", role.id, "기획1팀");

    expect(ids(await search(viewer, w.vendorDoc.number))).toEqual([w.vendorDoc.expenseId]);
    const outside = await search(viewer, otherTeamDoc.number);
    expect(ids(outside)).toEqual([]);
    expect(outside.total?.count).toBe(0);
    expect(ids(await search(viewer, "타팀거래처"))).toEqual([]);
    expect(outside.hasAny).toBe(true);
  }, 60_000);

  it("expense.value 꺼짐 · expense.amount 켜짐 → 번호 · 거래처로 0건이고 합계 줄 값은 있다 / 반대 조합은 번호로 찾고 합계는 null이다(EP2-D5)", async () => {
    const w = await world();
    const amountOnly = await searcher({ value: false, amount: true, person: true });
    const valueOnly = await searcher({ value: true, amount: false, person: true });

    const hidden = await search(amountOnly, w.vendorDoc.number);
    expect(hidden.page.total).toBe(0);
    expect(hidden.total).not.toBeNull();
    expect((await search(amountOnly, "더테이블")).page.total).toBe(0);

    const shown = await search(valueOnly, w.vendorDoc.number);
    expect(ids(shown)).toEqual([w.vendorDoc.expenseId]);
    expect(shown.total).toBeNull();
  }, 60_000);

  it("person.value 꺼짐 → 직원 지급처 이름으로 0건이고 같은 문서를 번호로는 찾는다(EP2-D5)", async () => {
    const w = await world();
    const noPerson = await searcher({ value: true, amount: true, person: false });

    expect(ids(await search(noPerson, "김직원"))).toEqual([]);
    expect(ids(await search(noPerson, w.payeeDoc.number))).toEqual([w.payeeDoc.expenseId]);
  }, 60_000);

  it("0건 검색이어도 hasAny는 참이고 기안 열 여부는 검색 없을 때와 같다(EP1-13)", async () => {
    const w = await world();
    const viewer = await searcher({ value: true, amount: true, person: true });

    const base = await search(viewer, null);
    const none = await search(viewer, "없는검색어");
    expect(ids(none)).toEqual([]);
    expect(none.hasAny).toBe(true);
    expect(none.drafterColumn).toBe(base.drafterColumn);
    const own = await search(w.fx.pm, "없는검색어");
    expect(own.hasAny).toBe(true);
    expect(own.drafterColumn).toBe((await search(w.fx.pm, null)).drafterColumn);
  }, 60_000);

  it("팀 이름으로는 찾지 못하고(ND-9) 101자 검색어도 오류 없이 처리한다(EP3-D6)", async () => {
    const w = await world();
    const viewer = await searcher({ value: true, amount: true, person: true });

    expect(ids(await search(viewer, "기획1팀"))).toEqual([]);
    expect(ids(await search(viewer, "a".repeat(101)))).toEqual([]);
    expect(w.vendorDoc.number.length).toBeGreaterThan(0);
  }, 60_000);
});

describe("검색어 정규화 · 보기별 검색 열(EP3-D6 · D2)", () => {
  it("normalizeListQuery — 앞뒤 공백 제거 · 빈 값은 null · 100자 초과는 앞 100자", () => {
    expect(normalizeListQuery("  0004 ")).toBe("0004");
    expect(normalizeListQuery("   ")).toBeNull();
    expect(normalizeListQuery("")).toBeNull();
    expect(normalizeListQuery(null)).toBeNull();
    expect(normalizeListQuery(undefined)).toBeNull();
    expect(normalizeListQuery("a".repeat(101))).toBe("a".repeat(100));
  });

  it("searchFieldsFor — 목록만 기안자 이름을 담고, expense.value · person.value가 꺼지면 그 열이 빠진다", () => {
    const all = { expenseValue: true, personValue: true };
    expect(searchFieldsFor("list", all)).toEqual(["number", "content", "projectName", "lineItem", "vendorName", "drafterName", "payeeUserName"]);
    expect(searchFieldsFor("paymentTargets", all)).not.toContain("drafterName");
    expect(searchFieldsFor("paid", all)).not.toContain("drafterName");
    expect(searchFieldsFor("list", { expenseValue: false, personValue: true })).toEqual(["payeeUserName"]);
    expect(searchFieldsFor("list", { expenseValue: true, personValue: false })).not.toContain("payeeUserName");
    expect(searchFieldsFor("list", { expenseValue: false, personValue: false })).toEqual([]);
  });
});

// ── Task 2: 지급 대상 · 지급 완료 보기(같은 조건 함수) ─────────────────────────────────

async function approvedLineDoc(fx: ExpenseFixture, lineId: string, payeeUserId?: string): Promise<{ expenseId: string; number: string; version: number }> {
  const expenseId = (await createExpenseFromLines(fx.pm, { lineIds: [lineId] })).created[0]?.expenseId ?? "";
  if (payeeUserId) await changeExpensePayeeUser(fx.pm, { expenseId, userId: payeeUserId, expectedVersion: 1 });
  const submitted = await submitReadyDraft(fx.pm, expenseId, { now: NOW });
  if (submitted.kind !== "submitted") throw new Error("제출 실패");
  const first = await approveDocument(fx.lead, { instanceId: submitted.instanceId, expectedVersion: submitted.version });
  const final = await approveDocument(fx.ceo, { instanceId: submitted.instanceId, expectedVersion: first.version });
  if (final.status !== "approved") throw new Error(`결재 통과 안 됨: ${final.status}`);
  const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  return { expenseId, number: submitted.number, version: row?.version ?? 0 };
}

async function payer(info: { value: boolean; amount: boolean; person: boolean }, team: string | null = null): Promise<Viewer> {
  const base = await makePaymentManager(`지급자-${randomUUID().slice(0, 4)}`);
  if (!base.roleId) throw new Error("계급 없음");
  await upsertVisibility(SYSTEM_VIEWER, { roleId: base.roleId, infoItem: "expense.value", visible: info.value });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: base.roleId, infoItem: "expense.amount", visible: info.amount });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: base.roleId, infoItem: "person.value", visible: info.person });
  if (!team) return base;
  // 보는 범위 팀 — 다른 팀 문서는 범위 밖이다.
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `팀지급-${randomUUID().slice(0, 8)}`, workScope: "team", viewScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.payments", action: "write", allowed: true });
  for (const infoItem of ["expense.value", "expense.amount", "person.value"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  return makePerson(`팀지급-${randomUUID().slice(0, 4)}`, role.id, team);
}

function targetIds(list: Awaited<ReturnType<typeof listPaymentTargets>>): string[] {
  return list.groups.flatMap((group) => group.rows.map((row) => row.id ?? "")).sort();
}

describe("지급 대상 · 지급 완료 검색(06.5 D-6508 · Task 2)", () => {
  // 문서 A(프로젝트 문서 · 거래처 스테이지원) · 문서 B(직원 지급처 김직원) 둘 다 결재 통과. 문서 A는 오늘 지급 완료로 만든다.
  async function paidWorld() {
    await setEvidenceRequired(false);
    const fx = await setupExpenseProject();
    const staff = await makePerson("김직원", DEFAULT_ROLE_ID, "기획1팀");
    await db.update(users).set(testVendorAccount()).where(eq(users.id, staff.id));
    const a = await approvedExpenseWithoutEvidence(fx, fx.lines.withVendor);
    const b = await approvedLineDoc(fx, fx.lines.split, staff.id);
    return { fx, a, b };
  }

  async function payDocA(w: Awaited<ReturnType<typeof paidWorld>>): Promise<void> {
    const manager = await payer({ value: true, amount: true, person: true });
    const payDate = seoulToday();
    const preview = await previewPayable(manager, { expenseId: w.a.expenseId, payDate });
    if (preview.payableKrw === undefined || preview.payableKrw === null) throw new Error("지급 총액을 셈할 수 없는 문서");
    const result = await completePaymentsBatch(manager, { payDate, rows: [{ expenseId: w.a.expenseId, expenseVersion: w.a.version, expectedPayableKrw: preview.payableKrw }] });
    if (result.processed !== 1) throw new Error(`지급 안 됨: ${JSON.stringify(result.blocked)}`);
  }

  it("지급 대상: 번호 · 거래처 · 직원 지급처로 그 문서만, 건수 · 합계가 따르고 0건 검색이어도 hasAny는 참이다(EP1-13)", async () => {
    const w = await paidWorld();
    const manager = await payer({ value: true, amount: true, person: true });

    expect(targetIds(await listPaymentTargets(manager, { q: w.a.number }))).toEqual([w.a.expenseId]);
    expect(targetIds(await listPaymentTargets(manager, { q: ` ${w.b.number} ` }))).toEqual([w.b.expenseId]);
    expect(targetIds(await listPaymentTargets(manager, { q: "스테이지" }))).toEqual([w.a.expenseId]);
    expect(targetIds(await listPaymentTargets(manager, { q: "김직원" }))).toEqual([w.b.expenseId]);
    const one = await listPaymentTargets(manager, { q: w.a.number });
    expect(one.total?.count).toBe(1);
    expect((await listPaymentTargets(manager, {})).total?.count).toBe(2);

    const none = await listPaymentTargets(manager, { q: "없는검색어" });
    expect(targetIds(none)).toEqual([]);
    expect(none.hasAny).toBe(true);
  }, 90_000);

  it("지급 대상: 보는 범위 밖 문서는 번호를 정확히 넣어도 0건이다(T-06.5-61)", async () => {
    const w = await paidWorld();
    const outsider = await payer({ value: true, amount: true, person: true }, "경영관리팀");

    expect(targetIds(await listPaymentTargets(outsider, { q: w.a.number }))).toEqual([]);
    expect(targetIds(await listPaymentTargets(await payer({ value: true, amount: true, person: true }), { q: w.a.number }))).toEqual([w.a.expenseId]);
  }, 90_000);

  it("지급 대상: person.value 꺼진 지급 권한자는 직원 지급처 이름으로 0건이고 같은 문서를 번호로는 찾는다(EP2-D5)", async () => {
    const w = await paidWorld();
    const noPerson = await payer({ value: true, amount: true, person: false });

    expect(targetIds(await listPaymentTargets(noPerson, { q: "김직원" }))).toEqual([]);
    expect(targetIds(await listPaymentTargets(noPerson, { q: w.b.number }))).toEqual([w.b.expenseId]);
  }, 90_000);

  it("기안자 이름에만 맞는 검색어는 지급 대상 · 지급 완료 0건, 같은 검색어로 목록 보기는 그 문서다(D2)", async () => {
    const w = await paidWorld();
    await payDocA(w);
    const manager = await payer({ value: true, amount: true, person: true });

    expect(targetIds(await listPaymentTargets(manager, { q: "박서연" }))).toEqual([]);
    expect((await listPaidPayments(manager, { q: "박서연" })).total?.count).toBe(0);
    expect(ids(await search(manager, "박서연"))).toContain(w.b.expenseId);
  }, 90_000);

  it("지급 완료: 허용 viewer는 q로 그 지급만 보고, 거부 계급은 q가 있어도 ForbiddenError다(D1)", async () => {
    const w = await paidWorld();
    await payDocA(w);
    const manager = await payer({ value: true, amount: true, person: true });

    const found = await listPaidPayments(manager, { q: w.a.number });
    expect(found.groups.flatMap((group) => group.rows.map((row) => row.id))).toEqual([w.a.expenseId]);
    expect(found.total?.count).toBe(1);
    expect((await listPaidPayments(manager, { q: "스테이지" })).total?.count).toBe(1);
    expect((await listPaidPayments(manager, { q: w.b.number })).total?.count).toBe(0);
    expect((await listPaidPayments(manager, {})).total?.count).toBe(1);
    await expect(listPaidPayments(w.fx.pm, { q: w.a.number })).rejects.toBeInstanceOf(ForbiddenError);
  }, 90_000);
});

// 07.1-09 PF4 · C-36(E-P1-08): 팀(docTeamId) · 월(등록 시각 서울 월) · 내 것만 — 목록 공용 조건 하나가 합계 · 쪽 · 승인 정렬에 같이 걸리고, 보는 범위 안에서만 줄인다.
describe("지출결의 목록 거르개 — 팀 · 월 · 내 것만 (07.1-09)", () => {
  async function filterWorld() {
    const w = await world();
    const planning = await orgUnitIdByName("기획본부");
    const otherTeam = (await createTeam(SYSTEM_VIEWER, { orgUnitId: planning, name: `거름팀-${randomUUID().slice(0, 6)}` })).id;
    // 팀 비용 문서(프로젝트 없음)는 귀속 팀이 문서의 팀이다 — vendorDoc만 다른 팀으로 옮긴다. 등록 시각: 서울 10-01 00:30(UTC 09-30) · 서울 09-30 23:30 · 11월.
    await db.update(expenses).set({ attributedTeamId: otherTeam, createdAt: new Date("2025-09-30T15:30:00Z") }).where(eq(expenses.id, w.vendorDoc.expenseId));
    await db.update(expenses).set({ createdAt: new Date("2025-09-30T14:30:00Z") }).where(eq(expenses.id, w.line.expenseId));
    await db.update(expenses).set({ createdAt: new Date("2025-11-15T03:00:00Z") }).where(eq(expenses.id, w.payeeDoc.expenseId));
    const viewer = await searcher({ value: true, amount: true, person: true });
    return { w, otherTeam, viewer };
  }

  const mine = (list: Awaited<ReturnType<typeof search>>, w: World) => ids(list).filter((id) => [w.line.expenseId, w.vendorDoc.expenseId, w.payeeDoc.expenseId].includes(id));

  it("팀 = 문서의 팀 — 팀 비용은 귀속 팀, 프로젝트 문서는 프로젝트 팀(기안자 발령 팀이 아니다)", async () => {
    const { w, otherTeam, viewer } = await filterWorld();
    expect(mine(await listExpenses(viewer, { status: "all", team: otherTeam }, { today: seoulToday() }), w)).toEqual([w.vendorDoc.expenseId]);
    const plan1 = await teamIdByName("기획1팀");
    expect(mine(await listExpenses(viewer, { status: "all", team: plan1 }, { today: seoulToday() }), w)).toEqual([w.line.expenseId, w.payeeDoc.expenseId].sort());
  }, 60_000);

  it("옵션에 없는 팀 값은 거름도 무시한다 — 팀 select가 있는 범위에서는 select 표시(팀 전체)와 결과가 같다", async () => {
    const { w, viewer } = await filterWorld();
    const all = await listExpenses(viewer, { status: "all" }, { today: seoulToday() });
    expect(mine(all, w).length).toBe(3);
    expect(mine(await listExpenses(viewer, { status: "all", team: randomUUID() }, { today: seoulToday() }), w)).toEqual(mine(all, w));
    expect(mine(await listExpenses(viewer, { status: "all", team: "abc" }, { today: seoulToday() }), w)).toEqual(mine(all, w));
  }, 60_000);

  it("월 = 등록 시각의 서울 월 — 서울 10-01 00:30(UTC 09-30)은 10월, 진행 중 · 승인 문서도 들어간다", async () => {
    const { w, viewer } = await filterWorld();
    const inMonth = (month: string) => listExpenses(viewer, { status: "all", month }, { today: seoulToday() });
    expect(mine(await inMonth("2025-10"), w)).toEqual([w.vendorDoc.expenseId]);
    expect(mine(await inMonth("2025-09"), w)).toEqual([w.line.expenseId]);
    expect(mine(await inMonth("2025-11"), w)).toEqual([w.payeeDoc.expenseId]);
  }, 60_000);

  it("옵션에 없는 월 값은 거름도 무시한다 — 월 select 표시(월 전체)와 결과가 같다", async () => {
    const { w, viewer } = await filterWorld();
    const all = await listExpenses(viewer, { status: "all" }, { today: seoulToday() });
    expect(all.months).not.toContain("2020-01");
    const offOption = await listExpenses(viewer, { status: "all", month: "2020-01" }, { today: seoulToday() });
    expect(mine(offOption, w)).toEqual(mine(all, w));
    expect(offOption.total?.count).toBe(all.total?.count);
  }, 60_000);

  it("내 것만 = 기안자가 나인 행 · 셋 조합 · 합계 줄이 거른 전체와 같다 · 거른 결과가 0이어도 hasAny는 참", async () => {
    const { w, viewer } = await filterWorld();
    await db.update(expenses).set({ drafterId: viewer.id }).where(eq(expenses.id, w.payeeDoc.expenseId));
    const mineOnly = await listExpenses(viewer, { status: "all", mine: true }, { today: seoulToday() });
    expect(mine(mineOnly, w)).toEqual([w.payeeDoc.expenseId]);
    expect(mineOnly.total?.count).toBe(mineOnly.groups.reduce((sum, group) => sum + group.rows.length, 0));
    const combined = await listExpenses(viewer, { status: "all", mine: true, month: "2025-11", team: await teamIdByName("기획1팀"), q: w.payeeDoc.number }, { today: seoulToday() });
    expect(ids(combined)).toEqual([w.payeeDoc.expenseId]);
    expect(combined.total?.count).toBe(1);
    const none = await listExpenses(viewer, { status: "all", mine: true, month: "2025-10" }, { today: seoulToday() });
    expect(ids(none)).toEqual([]);
    expect(none.hasAny).toBe(true);
    expect(none.total?.count).toBe(0);
  }, 60_000);

  it("승인 보기 예정일 정렬도 같은 거름 — 거른 밖 문서 id가 섞이지 않는다", async () => {
    const { w, otherTeam, viewer } = await filterWorld();
    const list = await listExpenses(viewer, { status: "approved", team: otherTeam, month: "2025-10" }, { today: seoulToday() });
    expect(mine(list, w)).toEqual([]);
    expect(list.total?.count).toBe(0);
  }, 60_000);

  it("보는 범위 밖 팀 id · 모르는 팀 · uuid 모양이 아닌 팀은 0건(오류 아님), 형식이 틀린 월은 거름 무시", async () => {
    const { w } = await filterWorld();
    const lead = await makePerson(`팀장-${randomUUID().slice(0, 4)}`, TEAM_LEAD_ROLE_ID, "기획1팀");
    const outside = await teamIdByName("경영관리팀");
    expect(ids(await listExpenses(lead, { status: "all", team: outside }, { today: seoulToday() }))).toEqual([]);
    expect(ids(await listExpenses(lead, { status: "all", team: randomUUID() }, { today: seoulToday() }))).toEqual([]);
    expect(ids(await listExpenses(lead, { status: "all", team: "abc" }, { today: seoulToday() }))).toEqual([]);
    const all = await listExpenses(lead, { status: "all" }, { today: seoulToday() });
    expect(ids(await listExpenses(lead, { status: "all", month: "2026-13" }, { today: seoulToday() }))).toEqual(ids(all));
    expect(mine(all, w).length).toBeGreaterThan(0);
  }, 60_000);

  it("팀 옵션 — 전사 범위는 보관 안 된 팀 전부, 팀장 · 본인 범위는 빈 목록, 본부 범위는 그 본부의 활성 팀(둘 미만이면 빈 목록)", async () => {
    const { otherTeam, viewer } = await filterWorld();
    const archived = (await createTeam(SYSTEM_VIEWER, { orgUnitId: await orgUnitIdByName("기획본부"), name: `보관팀-${randomUUID().slice(0, 6)}` })).id;
    await db.update(teams).set({ archivedAt: new Date() }).where(eq(teams.id, archived));
    const company = (await listExpenses(viewer, { status: "all" }, { today: seoulToday() })).teams.map((option) => option.value);
    expect(company).toContain(otherTeam);
    expect(company).not.toContain(archived);
    const lead = await makePerson(`팀장-${randomUUID().slice(0, 4)}`, TEAM_LEAD_ROLE_ID, "기획1팀");
    expect((await listExpenses(lead, { status: "all" }, { today: seoulToday() })).teams).toEqual([]);
    const own = await makePerson(`본인-${randomUUID().slice(0, 4)}`, DEFAULT_ROLE_ID, "기획1팀");
    expect((await listExpenses(own, { status: "all" }, { today: seoulToday() })).teams).toEqual([]);
    const head = await makePerson(`본부장-${randomUUID().slice(0, 4)}`, DIVISION_HEAD_ROLE_ID, "기획1팀");
    const divisionTeams = (await listExpenses(head, { status: "all" }, { today: seoulToday() })).teams.map((option) => option.value);
    expect(divisionTeams).toContain(otherTeam);
    expect(divisionTeams).toContain(await teamIdByName("기획1팀"));
    expect(divisionTeams).not.toContain(archived);
    expect(divisionTeams).not.toContain(await teamIdByName("경영관리팀"));
  }, 60_000);

  it("월 옵션 — 보는 범위 안 문서의 등록 월만(서울), 최신 먼저", async () => {
    const { viewer, w } = await filterWorld();
    const months = (await listExpenses(viewer, { status: "all" }, { today: seoulToday() })).months;
    expect(months).toEqual(expect.arrayContaining(["2025-11", "2025-10", "2025-09"]));
    expect([...months].sort().reverse()).toEqual(months);
    const outsider = await makePerson(`밖-${randomUUID().slice(0, 4)}`, DEFAULT_ROLE_ID, "경영관리팀");
    expect((await listExpenses(outsider, { status: "all" }, { today: seoulToday() })).months).not.toContain("2025-11");
    expect(w.line.expenseId).toBeTruthy();
  }, 60_000);
});
