import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createTeamExpenseDraft, createExpenseFromLines, listExpenseFormOptions, saveExpenseDraft } from "@/domain/expenses";
import { listExpenses, normalizeListQuery, searchFieldsFor } from "@/domain/expenses/list";
import { seoulToday } from "@/lib/dates";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertVendor } from "@/repositories/vendors";
import { makePerson } from "./approvals-fixtures";
import { setupExpenseProject, submitReadyDraft, testVendorAccount, type ExpenseFixture } from "./fixtures/expenses";

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
