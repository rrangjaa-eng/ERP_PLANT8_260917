import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { ForbiddenError } from "@/domain/permissions/can";
import { createCorpCard } from "@/domain/corp-cards";
import { createOrgUnit, createTeam } from "@/domain/org";
import { and, eq } from "drizzle-orm";
import { Client } from "pg";
import { db } from "@/db/client";
import { corpCardUsages, expenses, projects, purchaseRequests, quoteLines } from "@/db/schema";
import { gate, GateBlockedError } from "@/domain/rules/gate";
import { createProject, CompletedProjectError } from "@/domain/projects";
import { getCurrentQuoteRevision, listQuoteLines, saveQuoteLines } from "@/domain/quotes/lines";
import { createRevisionFromCurrent } from "@/domain/quotes/revisions";
import { closeExpense, createExpenseFromLines } from "@/domain/expenses";
import { rejectDocument } from "@/domain/approvals";
import { addHistorizedValue } from "@/domain/settings/registry";
import { TAX_VAT_RATE } from "@/domain/settings/keys";
import { withTransaction } from "@/lib/db-transaction";
import {
  currentLineForFixedLink,
  DroppedQuoteLineError,
  lineCardSideFacts,
  lockProjectForLinkWrite,
  searchLinesForCardLink,
  StaleQuoteRevisionError,
} from "@/domain/corp-card-usages/link-targets";
import { findLineLinks } from "@/repositories/quote-line-links";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { addApprovedRevision, setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "./fixtures/expenses";
import {
  cardOptionsForUsage,
  CardUsageRejectedError,
  cardUsageFormDefaults,
  cardUsageFormOptions,
  createCardUsage,
  precheckCardUsage,
  previewCardAmounts,
  searchMerchantsForCard,
  type CardUsageInput,
} from "@/domain/corp-card-usages";
import { insertRole } from "@/repositories/roles";
import { insertVendor } from "@/repositories/vendors";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { seoulToday } from "@/lib/dates";
import { makePerson } from "./approvals-fixtures";

// 06-05(EXP-07 · U-2): 카드 사용 통합 파일 — 06-07 · 06-09 · 06-12가 `describe`를 더한다.

function uniqueLast4(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function makeTeam(): Promise<{ id: string; name: string }> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `카드본부-${randomUUID()}` });
  const name = `카드팀-${randomUUID()}`;
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name });
  return { id: team.id, name };
}

// 대리 등록 권한자(cards.proxy write) — 업무 범위는 팀(전사 범위로 넓히지 않는다). 새 계급이라 팀 · 카드 사용 정보 노출을 켠다(시드 직원 계급과 같게).
async function makeProxyRegistrant(teamName: string): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `카드대리-${randomUUID().slice(0, 8)}`, workScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "cards.proxy", action: "write", allowed: true });
  for (const infoItem of ["team.value", "card_usage.value", "card_usage.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  return makePerson("경영관리", role.id, teamName);
}

async function makeCard(input: { kind: "personal" | "team" | "shared"; holderUserId?: string; teamId?: string }): Promise<string> {
  const card = await createCorpCard(SYSTEM_VIEWER, { issuer: `카드사-${randomUUID().slice(0, 6)}`, numberLast4: uniqueLast4(), label: `${input.kind} 카드`, ...input });
  if (!card.id) throw new Error("카드 id 없음");
  return card.id;
}

function usageInput(corpCardId: string): CardUsageInput {
  return {
    corpCardId,
    usedOn: seoulToday(),
    merchantVendorId: null,
    total: { currency: "KRW", amount: 10_000, fxRate: 1 },
    evidenceTypeCode: "card_receipt",
    linkKind: "team_cost",
    memo: null,
  };
}

describe("공용 카드 사용 자격", () => {
  it("공용 카드 + cards.proxy write 없음 → precheckCardUsage 거부", async () => {
    const team = await makeTeam();
    const staff = await makePerson("직원", DEFAULT_ROLE_ID, team.name);
    const sharedId = await makeCard({ kind: "shared" });

    await expect(precheckCardUsage(staff, usageInput(sharedId))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("공용 카드 + cards.proxy write → 통과(사용한 사람 = 등록자 · 팀 = 그 사람의 사용일 소속)", async () => {
    const team = await makeTeam();
    const proxy = await makeProxyRegistrant(team.name);
    const sharedId = await makeCard({ kind: "shared" });

    const pre = await precheckCardUsage(proxy, usageInput(sharedId));
    expect(pre.card).toMatchObject({ id: sharedId, kind: "shared" });
    expect(pre.usedByUserId).toBe(proxy.id);
    expect(pre.teamId).toBe(team.id);
  });

  it("cardOptionsForUsage — 직원은 자기 카드 + 사용일 소속 팀 카드(공용 0장), cards.proxy write는 + 활성 공용 카드", async () => {
    const team = await makeTeam();
    const otherTeam = await makeTeam();
    const staff = await makePerson("직원", DEFAULT_ROLE_ID, team.name);
    const proxy = await makeProxyRegistrant(team.name);
    const ownId = await makeCard({ kind: "personal", holderUserId: staff.id });
    const teamCardId = await makeCard({ kind: "team", teamId: team.id });
    const otherTeamCardId = await makeCard({ kind: "team", teamId: otherTeam.id });
    const sharedId = await makeCard({ kind: "shared" });

    const staffOptions = await cardOptionsForUsage(staff, seoulToday());
    const staffIds = staffOptions.map((option) => option.id);
    expect(staffIds).toEqual(expect.arrayContaining([ownId, teamCardId]));
    expect(staffIds).not.toContain(otherTeamCardId);
    expect(staffOptions.filter((option) => option.kind === "shared")).toHaveLength(0);

    const proxyIds = (await cardOptionsForUsage(proxy, seoulToday())).map((option) => option.id);
    expect(proxyIds).toEqual(expect.arrayContaining([teamCardId, sharedId]));
    expect(proxyIds).not.toContain(ownId);
  });
});

describe("사용일 상한(Q6)", () => {
  it("precheckCardUsage 직접 호출도 내일(KST) 사용일을 거부하고 오늘은 통과한다", async () => {
    const team = await makeTeam();
    const staff = await makePerson("직원", DEFAULT_ROLE_ID, team.name);
    const cardId = await makeCard({ kind: "personal", holderUserId: staff.id });
    const today = seoulToday();
    const tomorrow = seoulToday(new Date(Date.now() + 24 * 60 * 60 * 1000));

    await expect(precheckCardUsage(staff, { ...usageInput(cardId), usedOn: tomorrow })).rejects.toThrow("사용일 미래 · 오늘까지 날짜로");
    await expect(precheckCardUsage(staff, { ...usageInput(cardId), usedOn: today })).resolves.toMatchObject({ usedByUserId: staff.id });
  });
});

describe("결제 합계 정규화(P3-1)", () => {
  it("KRW에 환율이 실려 와도 원화 = 결제 합계로 저장한다(환율배 행 없음)", async () => {
    const team = await makeTeam();
    const staff = await makePerson("직원", DEFAULT_ROLE_ID, team.name);
    const cardId = await makeCard({ kind: "personal", holderUserId: staff.id });
    const input: CardUsageInput = { ...usageInput(cardId), total: { currency: "KRW", amount: 10_000, fxRate: 100 } };

    const pre = await precheckCardUsage(staff, input);
    const created = await createCardUsage(staff, input, pre);

    const [row] = await db.select().from(corpCardUsages).where(eq(corpCardUsages.id, created.id));
    expect(row).toMatchObject({ totalCurrency: "KRW", totalForeignAmount: null, totalFxRate: "1.0000", totalAmountKrw: 10_000 });
    expect(created.totalKrw).toBe(10_000);
  });

  it("원화 환산이 0 이하인 결제 합계 · KRW 소수는 precheck가 거부한다", async () => {
    const team = await makeTeam();
    const staff = await makePerson("직원", DEFAULT_ROLE_ID, team.name);
    const cardId = await makeCard({ kind: "personal", holderUserId: staff.id });

    await expect(precheckCardUsage(staff, { ...usageInput(cardId), total: { currency: "USD", amount: 0.01, fxRate: 1 } })).rejects.toThrow("결제 합계 0 이하 · 금액 고치기");
    await expect(precheckCardUsage(staff, { ...usageInput(cardId), total: { currency: "KRW", amount: 0.4, fxRate: 1 } })).rejects.toThrow();
    await expect(precheckCardUsage(staff, { ...usageInput(cardId), total: { currency: "KRW", amount: 1000.5, fxRate: 1 } })).rejects.toThrow();
  });
});

describe("등록 서버 거부(P3-2)", () => {
  it("다른 사람의 개인 카드로 본인 등록 → ForbiddenError(카드 자격 없음)", async () => {
    const team = await makeTeam();
    const staff = await makePerson("직원", DEFAULT_ROLE_ID, team.name);
    const other = await makePerson("다른직원", DEFAULT_ROLE_ID, team.name);
    const othersCardId = await makeCard({ kind: "personal", holderUserId: other.id });

    const rejected = precheckCardUsage(staff, usageInput(othersCardId));
    await expect(rejected).rejects.toBeInstanceOf(ForbiddenError);
    await expect(rejected).rejects.toThrow("카드 자격 없음 · 카드 고르기");
  });

  it("카드 규칙 밖 증빙 종류(원천징수 기타소득) → CardUsageRejectedError", async () => {
    const team = await makeTeam();
    const staff = await makePerson("직원", DEFAULT_ROLE_ID, team.name);
    const cardId = await makeCard({ kind: "personal", holderUserId: staff.id });

    const rejected = precheckCardUsage(staff, { ...usageInput(cardId), evidenceTypeCode: "other_income" });
    await expect(rejected).rejects.toBeInstanceOf(CardUsageRejectedError);
    await expect(rejected).rejects.toThrow("증빙 종류 기타소득 카드에 없음 · 증빙 종류 고르기");
  });

  it("연결 없음(linkKind null) → 서버 거부", async () => {
    const team = await makeTeam();
    const staff = await makePerson("직원", DEFAULT_ROLE_ID, team.name);
    const cardId = await makeCard({ kind: "personal", holderUserId: staff.id });

    const rejected = precheckCardUsage(staff, { ...usageInput(cardId), linkKind: null });
    await expect(rejected).rejects.toBeInstanceOf(CardUsageRejectedError);
    await expect(rejected).rejects.toThrow("연결 없음 · 연결 고르기");
  });
});

describe("사용일 소속은 투영 전 발령에서(P3-7)", () => {
  it("계급의 team.value 노출이 꺼져도 소속 팀원은 팀 카드로 등록할 수 있다", async () => {
    const team = await makeTeam();
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `팀숨김-${randomUUID().slice(0, 8)}`, workScope: "team" });
    for (const infoItem of ["card_usage.value", "card_usage.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "team.value", visible: false });
    const member = await makePerson("팀숨김직원", role.id, team.name);
    const teamCardId = await makeCard({ kind: "team", teamId: team.id });

    expect((await cardOptionsForUsage(member, seoulToday())).map((option) => option.id)).toContain(teamCardId);
    const pre = await precheckCardUsage(member, usageInput(teamCardId));
    expect(pre.teamId).toBe(team.id);
    // 「소속 없음」 막힘은 발령 유무로 — 이름이 가려져도 소속은 있다.
    expect(await previewCardAmounts(member, { usedOn: seoulToday(), total: null, evidenceTypeCode: null })).toMatchObject({ teamAssigned: true });
    expect(await cardUsageFormOptions(member, seoulToday())).toMatchObject({ teamAssigned: true });
  });
});

describe("가맹점 고르기는 카드 자격으로(P3-6)", () => {
  it("expenses write가 없어도 쓸 카드가 있으면 가맹점을 찾고, 쓸 카드가 없으면 거부한다", async () => {
    const team = await makeTeam();
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `카드만-${randomUUID().slice(0, 8)}`, workScope: "team" });
    for (const infoItem of ["team.value", "card_usage.value", "card_usage.amount", "vendor.value"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "write", allowed: false });
    const holder = await makePerson("카드만직원", role.id, team.name);
    const noCard = await makePerson("카드없는직원", role.id, team.name);
    await makeCard({ kind: "personal", holderUserId: holder.id });
    const vendorName = `가맹점-${randomUUID().slice(0, 8)}`;
    await insertVendor(SYSTEM_VIEWER, { name: vendorName, normalizedName: vendorName });

    const found = await searchMerchantsForCard(holder, { query: vendorName });
    expect(found.rows.map((row) => row.name)).toEqual([vendorName]);
    await expect(searchMerchantsForCard(noCard, { query: vendorName })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

// ── 06-07: 견적 줄 · 견적 외 비용 연결 ────────────────────────────────────────

type CardFx = { pm: Viewer; cardId: string; projectId: string; revisionId: string; lines: string[] };

// 카드 소지자가 담당 PM인 수주중 프로젝트(1차 미승인) · 줄마다 실행가. 카드 증빙 `카드 전표`(규칙 없음)라 공급가 = 결제 합계.
async function cardProject(executions: readonly number[] = [1_000_000]): Promise<CardFx> {
  const team = await makeTeam();
  const pm = await makePerson("박서연", DEFAULT_ROLE_ID, team.name);
  const cardId = await makeCard({ kind: "personal", holderUserId: pm.id });
  const client = await insertVendor(SYSTEM_VIEWER, { name: `클라이언트-${randomUUID()}`, normalizedName: `클라이언트-${randomUUID()}` });
  const project = await createProject(pm, { clientId: client.id, teamId: team.id, pmUserId: pm.id, name: `카드연결-${randomUUID().slice(0, 8)}`, startDate: "2026-09-01", endDate: "2026-12-31" });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("1차 차수 없음");
  const subcategory = (await firstSelectableSubcategory()).value;
  const ids = executions.map(() => randomUUID());
  await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
    rows: executions.map((amount, index) => ({
      id: ids[index] ?? randomUUID(),
      isNew: true as const,
      subcategory,
      itemName: `줄${index + 1}`,
      vendorId: null,
      unitPrice: { currency: "KRW" as const, amount: amount + 500_000, fxRate: 1 },
      execution: { currency: "KRW" as const, amount, fxRate: 1 },
    })),
  });
  return { pm, cardId, projectId: project.id, revisionId: revision.id, lines: ids };
}

function lineInput(fx: CardFx, lineId: string, supply: number): CardUsageInput {
  return { ...usageInput(fx.cardId), total: { currency: "KRW", amount: supply, fxRate: 1 }, linkKind: "quote_line", lineId };
}

async function cardOnLine(fx: CardFx, lineId: string, supply: number): Promise<string> {
  const input = lineInput(fx, lineId, supply);
  return (await createCardUsage(fx.pm, input, await precheckCardUsage(fx.pm, input))).id;
}

async function outOfQuote(fx: CardFx, supply: number, itemName: string | null, merchantVendorId: string | null = null): Promise<string> {
  const input: CardUsageInput = { ...usageInput(fx.cardId), merchantVendorId, total: { currency: "KRW", amount: supply, fxRate: 1 }, linkKind: "out_of_quote", projectId: fx.projectId, itemName };
  return (await createCardUsage(fx.pm, input, await precheckCardUsage(fx.pm, input))).id;
}

async function requestOn(fx: CardFx, lineId: string, estimateKrw: number): Promise<string> {
  const [row] = await db
    .insert(purchaseRequests)
    .values({ number: `26001-C${randomUUID().slice(0, 8)}`, linkKind: "quote_line", projectId: fx.projectId, quoteLineId: lineId, requestedBy: fx.pm.id, itemName: "현수막", estimateAmountKrw: estimateKrw })
    .returning({ id: purchaseRequests.id });
  if (!row) throw new Error("구매 요청 없음");
  return row.id;
}

async function cancelRequest(fx: CardFx, requestId: string): Promise<void> {
  await db.update(purchaseRequests).set({ status: "cancelled", cancelledAt: new Date(), cancelledBy: fx.pm.id, cancelReason: "취소" }).where(eq(purchaseRequests.id, requestId));
}

async function archiveUsage(usageId: string, by: string): Promise<void> {
  await db.update(corpCardUsages).set({ archivedAt: new Date(), archivedBy: by }).where(eq(corpCardUsages.id, usageId));
}

async function setStatus(projectId: string, status: string): Promise<void> {
  await db.update(projects).set({ status }).where(eq(projects.id, projectId));
}

async function nextRevision(fx: CardFx): Promise<{ revisionId: string; copyOf: (lineId: string) => Promise<string> }> {
  const latest = await getCurrentQuoteRevision(SYSTEM_VIEWER, fx.projectId);
  if (!latest) throw new Error("차수 없음");
  const created = await createRevisionFromCurrent(fx.pm, { projectId: fx.projectId, fromRevisionId: latest.id });
  return {
    revisionId: created.revisionId,
    copyOf: async (lineId) => {
      const [row] = await db.select({ id: quoteLines.id }).from(quoteLines).where(and(eq(quoteLines.revisionId, created.revisionId), eq(quoteLines.copiedFromLineId, lineId)));
      if (!row) throw new Error("복사된 줄 없음");
      return row.id;
    },
  };
}

// 04 줄 저장으로 한 줄의 실행가를 바꾼다(기존 줄 갱신 — version 실음).
async function saveExecution(revisionId: string, lineId: string, amount: number): Promise<void> {
  const [row] = await db.select().from(quoteLines).where(eq(quoteLines.id, lineId));
  if (!row) throw new Error("줄 없음");
  await saveQuoteLines(SYSTEM_VIEWER, revisionId, {
    rows: [
      {
        id: row.id,
        version: row.version,
        subcategory: row.subcategory,
        itemName: row.itemName,
        unitPrice: { currency: "KRW", amount: row.unitPriceAmountKrw, fxRate: 1 },
        execution: { currency: "KRW", amount, fxRate: 1 },
      },
    ],
  });
}

async function usageCount(): Promise<number> {
  return (await db.select({ id: corpCardUsages.id }).from(corpCardUsages)).length;
}

async function lineCount(revisionId: string): Promise<number> {
  return (await db.select({ id: quoteLines.id }).from(quoteLines).where(eq(quoteLines.revisionId, revisionId))).length;
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("거부되지 않음");
}

describe("견적 줄 연결 — 트레이서(06-07)", () => {
  it("견적 줄 연결 카드 사용 → link_kind quote_line · quote_line_id · team_id 없음", async () => {
    const fx = await cardProject();
    const id = await cardOnLine(fx, fx.lines[0] ?? "", 400_000);
    const [row] = await db.select().from(corpCardUsages).where(eq(corpCardUsages.id, id));
    expect(row).toMatchObject({ linkKind: "quote_line", quoteLineId: fx.lines[0], teamId: null, supplyKrw: 400_000 });
  });

  it("같은 쪽 여러 건 허용 — 한 줄에 카드 사용 두 건", async () => {
    const fx = await cardProject();
    await cardOnLine(fx, fx.lines[0] ?? "", 300_000);
    await cardOnLine(fx, fx.lines[0] ?? "", 300_000);
    expect(await usageCount()).toBe(2);
  });

  it("조정 줄 · 취소 줄 lineId 직접 → 거부", async () => {
    const fx = await cardProject([1_000_000, 1_000_000]);
    await db.update(quoteLines).set({ lineStatus: "cancelled" }).where(eq(quoteLines.id, fx.lines[0] ?? ""));
    await db.update(quoteLines).set({ lineKind: "adjustment" }).where(eq(quoteLines.id, fx.lines[1] ?? ""));
    await expect(cardOnLine(fx, fx.lines[0] ?? "", 1_000)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(cardOnLine(fx, fx.lines[1] ?? "", 1_000)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await usageCount()).toBe(0);
  });
});

describe("실행가 상한(Q3)", () => {
  it("실행가 1,000,000 · 다른 카드 600,000 → 400,001 거부 문구", async () => {
    const fx = await cardProject();
    await cardOnLine(fx, fx.lines[0] ?? "", 600_000);
    const error = await caught(cardOnLine(fx, fx.lines[0] ?? "", 400_001));
    expect(error).toBeInstanceOf(GateBlockedError);
    expect((error as Error).message).toBe("실행가 초과 · 남은 실행가 400,000 · 다른 줄 고르기");
  });

  it("같은 상태에서 400,000 → 저장(경계값)", async () => {
    const fx = await cardProject();
    await cardOnLine(fx, fx.lines[0] ?? "", 600_000);
    await cardOnLine(fx, fx.lines[0] ?? "", 400_000);
    expect(await usageCount()).toBe(2);
  });

  it("앞 600,000 건을 보관한 뒤 → 1,000,000까지 저장(H-4)", async () => {
    const fx = await cardProject();
    const first = await cardOnLine(fx, fx.lines[0] ?? "", 600_000);
    await archiveUsage(first, fx.pm.id);
    await cardOnLine(fx, fx.lines[0] ?? "", 1_000_000);
    expect(await usageCount()).toBe(2);
  });

  it("카드 600,000 + `신청됨` 요청 100,000 → 300,001 거부 · 300,000 저장", async () => {
    const fx = await cardProject();
    await cardOnLine(fx, fx.lines[0] ?? "", 600_000);
    await requestOn(fx, fx.lines[0] ?? "", 100_000);
    expect(((await caught(cardOnLine(fx, fx.lines[0] ?? "", 300_001))) as Error).message).toBe("실행가 초과 · 남은 실행가 300,000 · 다른 줄 고르기");
    await cardOnLine(fx, fx.lines[0] ?? "", 300_000);
    expect(await usageCount()).toBe(2);
  });

  it("그 요청을 취소하면 자리가 돌아온다 — 400,000 저장", async () => {
    const fx = await cardProject();
    await cardOnLine(fx, fx.lines[0] ?? "", 600_000);
    const request = await requestOn(fx, fx.lines[0] ?? "", 100_000);
    await cancelRequest(fx, request);
    await cardOnLine(fx, fx.lines[0] ?? "", 400_000);
    expect(await usageCount()).toBe(2);
  });
});

describe("반대쪽 지출결의(D-609 · C10)", () => {
  async function staffCard(fx: ExpenseFixture): Promise<string> {
    return makeCard({ kind: "personal", holderUserId: fx.pm.id });
  }

  function expenseLineInput(cardId: string, lineId: string): CardUsageInput {
    return { ...usageInput(cardId), linkKind: "quote_line", lineId };
  }

  it("번호 있는 지출결의가 이어진 줄 → `지출결의 {번호} 연결됨 · 다른 줄 고르기`", async () => {
    const fx = await setupExpenseProject();
    const cardId = await staffCard(fx);
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const submitted = await submitReadyDraft(fx.pm, created.created[0]?.expenseId ?? "");
    if (submitted.kind !== "submitted") throw new Error("제출되지 않음");
    const input = expenseLineInput(cardId, fx.lines.withVendor);
    const error = await caught(createCardUsage(fx.pm, input, await precheckCardUsage(fx.pm, input)));
    expect((error as Error).message).toBe(`지출결의 ${submitted.number} 연결됨 · 다른 줄 고르기`);
  });

  it("반려(종결 전) 지출결의 → 카드 거부", async () => {
    const fx = await setupExpenseProject();
    const cardId = await staffCard(fx);
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const submitted = await submitReadyDraft(fx.pm, created.created[0]?.expenseId ?? "");
    if (submitted.kind !== "submitted") throw new Error("제출되지 않음");
    await rejectDocument(fx.lead, { instanceId: submitted.instanceId, expectedVersion: submitted.version, reason: "금액 확인" });
    const input = expenseLineInput(cardId, fx.lines.withVendor);
    await expect(createCardUsage(fx.pm, input, await precheckCardUsage(fx.pm, input))).rejects.toBeInstanceOf(GateBlockedError);
  });

  it("06-28 종결 뒤 → 카드 저장", async () => {
    const fx = await setupExpenseProject();
    const cardId = await staffCard(fx);
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const expenseId = created.created[0]?.expenseId ?? "";
    const submitted = await submitReadyDraft(fx.pm, expenseId);
    if (submitted.kind !== "submitted") throw new Error("제출되지 않음");
    await rejectDocument(fx.lead, { instanceId: submitted.instanceId, expectedVersion: submitted.version, reason: "금액 확인" });
    const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
    await closeExpense(fx.pm, { expenseId, expectedVersion: row?.version ?? 0, reason: "업체 취소" });
    const input = expenseLineInput(cardId, fx.lines.withVendor);
    await createCardUsage(fx.pm, input, await precheckCardUsage(fx.pm, input));
    expect(await usageCount()).toBe(1);
  });
});

describe("견적 외 비용(O-8 · X-6)", () => {
  it("저장 한 번에 줄 1개(out_of_quote · 견적가 0 · 실행가 = 공급가 · 항목) + 카드 사용 1개", async () => {
    const fx = await cardProject();
    const id = await outOfQuote(fx, 1_127_273, "현장 다과");
    const [usage] = await db.select().from(corpCardUsages).where(eq(corpCardUsages.id, id));
    const [line] = await db.select().from(quoteLines).where(eq(quoteLines.id, usage?.quoteLineId ?? ""));
    expect(usage).toMatchObject({ linkKind: "quote_line", teamId: null });
    expect(line).toMatchObject({ revisionId: fx.revisionId, lineKind: "out_of_quote", itemName: "현장 다과", quoteAmountKrw: 0, executionAmountKrw: 1_127_273 });
  });

  it("항목이 비면 가맹점 이름", async () => {
    const fx = await cardProject();
    const merchant = await insertVendor(SYSTEM_VIEWER, { name: `편의점-${randomUUID().slice(0, 6)}`, normalizedName: `편의점-${randomUUID()}` });
    const id = await outOfQuote(fx, 10_000, null, merchant.id);
    const [usage] = await db.select().from(corpCardUsages).where(eq(corpCardUsages.id, id));
    const [line] = await db.select().from(quoteLines).where(eq(quoteLines.id, usage?.quoteLineId ?? ""));
    expect(line?.itemName).toBe(merchant.name);
  });

  it("카드 사용 INSERT가 실패하면 줄 수가 늘지 않는다(한 트랜잭션)", async () => {
    const fx = await cardProject();
    const before = await lineCount(fx.revisionId);
    const input: CardUsageInput = { ...usageInput(fx.cardId), linkKind: "out_of_quote", projectId: fx.projectId, itemName: "현장 다과" };
    const pre = await precheckCardUsage(fx.pm, input);
    await expect(createCardUsage(fx.pm, input, { ...pre, card: { ...pre.card, id: randomUUID() } })).rejects.toThrow();
    expect(await lineCount(fx.revisionId)).toBe(before);
    expect(await usageCount()).toBe(0);
  });

  it("정산 프로젝트의 견적 외 비용 → 저장(project.line-edit 통과 — 견적 칸 0)", async () => {
    const fx = await cardProject();
    await setStatus(fx.projectId, "settling");
    await outOfQuote(fx, 50_000, "추가 인력");
    expect(await usageCount()).toBe(1);
  });

  it("사전 조회 뒤 새 차수 → `견적 새 차수 · 새로 고침` · 줄 수 · 카드 사용 수 그대로", async () => {
    const fx = await cardProject();
    const input: CardUsageInput = { ...usageInput(fx.cardId), linkKind: "out_of_quote", projectId: fx.projectId, itemName: "현장 다과" };
    const pre = await precheckCardUsage(fx.pm, input);
    const second = await nextRevision(fx);
    const before = await lineCount(second.revisionId);
    const error = await caught(createCardUsage(fx.pm, input, pre));
    expect((error as Error).message).toBe("견적 새 차수 · 새로 고침");
    expect(await lineCount(second.revisionId)).toBe(before);
    expect(await lineCount(fx.revisionId)).toBe(1);
    expect(await usageCount()).toBe(0);
  });

  it("완료 프로젝트의 견적 줄 · 견적 외 비용 → 직원 CompletedProjectError", async () => {
    const fx = await cardProject();
    await setStatus(fx.projectId, "completed");
    await expect(precheckCardUsage(fx.pm, lineInput(fx, fx.lines[0] ?? "", 1_000))).rejects.toBeInstanceOf(CompletedProjectError);
    await expect(
      precheckCardUsage(fx.pm, { ...usageInput(fx.cardId), linkKind: "out_of_quote", projectId: fx.projectId, itemName: "다과" }),
    ).rejects.toBeInstanceOf(CompletedProjectError);
  });
});

describe("계보(X-1)", () => {
  it("L1 카드 600,000 → 차수 2 → findLineLinks([L2]) 카드 1건 · 현재 줄 L2 · side expense 막힘", async () => {
    const fx = await cardProject();
    const l1 = fx.lines[0] ?? "";
    await cardOnLine(fx, l1, 600_000);
    const second = await nextRevision(fx);
    const l2 = await second.copyOf(l1);
    const links = (await findLineLinks(fx.pm, [l2])).get(l2);
    expect(links?.cardUsages).toHaveLength(1);
    expect(links?.currentLineId).toBe(l2);
    await expect(gate(null, "card.dual-link-block", { side: "expense", links })).resolves.toEqual({ allowed: false, reason: "카드 사용 1건 연결됨 · 지출결의는 다른 줄" });
  });

  it("L1 카드 600,000이 L2 상한에 든다 — 400,001 거부 · 400,000 저장", async () => {
    const fx = await cardProject();
    const l1 = fx.lines[0] ?? "";
    await cardOnLine(fx, l1, 600_000);
    const l2 = await (await nextRevision(fx)).copyOf(l1);
    expect(((await caught(cardOnLine(fx, l2, 400_001))) as Error).message).toBe("실행가 초과 · 남은 실행가 400,000 · 다른 줄 고르기");
    await cardOnLine(fx, l2, 400_000);
    expect(await usageCount()).toBe(2);
  });

  it("L1 지출결의 → 차수 2 → S10에서 L2 고를 수 없음 · L2 카드 거부", async () => {
    const fx = await setupExpenseProject();
    const cardId = await makeCard({ kind: "personal", holderUserId: fx.pm.id });
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const submitted = await submitReadyDraft(fx.pm, created.created[0]?.expenseId ?? "");
    if (submitted.kind !== "submitted") throw new Error("제출되지 않음");
    const second = await addApprovedRevision(fx, []);
    const l2 = second.lineIds.get("무대 제작") ?? "";
    const found = await searchLinesForCardLink(fx.pm, { projectId: fx.projectId, query: "", currentLineId: null });
    const row = found.rows.find((candidate) => candidate.id === l2);
    expect(row?.selectable).toBe(false);
    expect(row?.reason).toMatch(new RegExp(`^지출결의 ${submitted.number} `));
    const input: CardUsageInput = { ...usageInput(cardId), linkKind: "quote_line", lineId: l2 };
    expect(((await caught(createCardUsage(fx.pm, input, await precheckCardUsage(fx.pm, input)))) as Error).message).toBe(`지출결의 ${submitted.number} 연결됨 · 다른 줄 고르기`);
  });

  it("L1 `신청됨` 요청 → 차수 2 → L2 남은 실행가에서 요청 예상 공급가가 빠진다", async () => {
    const fx = await cardProject();
    const l1 = fx.lines[0] ?? "";
    await requestOn(fx, l1, 100_000);
    const l2 = await (await nextRevision(fx)).copyOf(l1);
    const found = await searchLinesForCardLink(fx.pm, { projectId: fx.projectId, query: "", currentLineId: null });
    expect(found.rows.find((row) => row.id === l2)).toMatchObject({ remainingKrw: 900_000, hint: "남은 실행가 900,000 · 구매 요청 1건 100,000" });
    expect(((await caught(cardOnLine(fx, l2, 900_001))) as Error).message).toBe("실행가 초과 · 남은 실행가 900,000 · 다른 줄 고르기");
  });
});

describe("상한 바탕 = 사슬의 현재 줄(N-1) · 빠진 줄(N-2)", () => {
  it("L1 → 차수 2 L2 실행가 1,500,000 → currentExecution 1,500,000 · currentLineForFixedLink(L1) = L2 · L2 카드 1,400,000 저장", async () => {
    const fx = await cardProject();
    const l1 = fx.lines[0] ?? "";
    const second = await nextRevision(fx);
    const l2 = await second.copyOf(l1);
    await saveExecution(second.revisionId, l2, 1_500_000);
    const links = (await findLineLinks(fx.pm, [l1])).get(l1);
    expect(links?.currentLineId).toBe(l2);
    expect(links?.currentExecution?.amountKrw).toBe(1_500_000);
    const current = await withTransaction(async (tx) => {
      await lockProjectForLinkWrite(fx.pm, { projectId: fx.projectId }, tx);
      return currentLineForFixedLink(fx.pm, { projectId: fx.projectId, lineId: l1 }, tx);
    });
    expect(current).toBe(l2);
    await cardOnLine(fx, l2, 1_400_000);
    expect(await usageCount()).toBe(1);
  });

  it("차수 1에서 보관한 줄 L9 → 차수 2 → currentLineId null · currentExecution null · `견적 줄 빠짐 · 새로 고침`", async () => {
    const fx = await cardProject([1_000_000, 500_000]);
    const l9 = fx.lines[1] ?? "";
    await saveQuoteLines(SYSTEM_VIEWER, fx.revisionId, { rows: [], archivedLineIds: [l9] });
    await nextRevision(fx);
    const links = (await findLineLinks(fx.pm, [l9])).get(l9);
    expect(links?.currentLineId).toBeNull();
    expect(links?.currentExecution).toBeNull();
    const error = await caught(
      withTransaction(async (tx) => {
        await lockProjectForLinkWrite(fx.pm, { projectId: fx.projectId }, tx);
        return currentLineForFixedLink(fx.pm, { projectId: fx.projectId, lineId: l9 }, tx);
      }),
    );
    expect(error).toBeInstanceOf(DroppedQuoteLineError);
    expect((error as Error).message).toBe("견적 줄 빠짐 · 새로 고침");
  });

  it("차수 2의 현재 줄 L2를 보관(SQL 직접) → currentLineForFixedLink(L1) 같은 거부 · findLineLinks([L1]) currentLineId null", async () => {
    const fx = await cardProject();
    const l1 = fx.lines[0] ?? "";
    const l2 = await (await nextRevision(fx)).copyOf(l1);
    await db.update(quoteLines).set({ archivedAt: new Date(), archivedBy: fx.pm.id }).where(eq(quoteLines.id, l2));
    expect((await findLineLinks(fx.pm, [l1])).get(l1)?.currentLineId).toBeNull();
    await expect(
      withTransaction(async (tx) => {
        await lockProjectForLinkWrite(fx.pm, { projectId: fx.projectId }, tx);
        return currentLineForFixedLink(fx.pm, { projectId: fx.projectId, lineId: l1 }, tx);
      }),
    ).rejects.toBeInstanceOf(DroppedQuoteLineError);
  });
});

describe("줄 보관 붙잡기(N-3)", () => {
  it("카드 사용이 이어진 줄을 04 저장으로 보관 → `연결 문서 있음 · 삭제 대신 취소` · 줄 그대로", async () => {
    const fx = await cardProject();
    const line = fx.lines[0] ?? "";
    await cardOnLine(fx, line, 900_000);
    await expect(saveQuoteLines(SYSTEM_VIEWER, fx.revisionId, { rows: [], archivedLineIds: [line] })).rejects.toThrow("연결 문서 있음 · 삭제 대신 취소");
    const [row] = await db.select({ archivedAt: quoteLines.archivedAt }).from(quoteLines).where(eq(quoteLines.id, line));
    expect(row?.archivedAt).toBeNull();
  });

  it("그 카드 사용을 보관한 뒤 → 줄 보관 통과", async () => {
    const fx = await cardProject();
    const line = fx.lines[0] ?? "";
    await archiveUsage(await cardOnLine(fx, line, 900_000), fx.pm.id);
    await saveQuoteLines(SYSTEM_VIEWER, fx.revisionId, { rows: [], archivedLineIds: [line] });
    const [row] = await db.select({ archivedAt: quoteLines.archivedAt }).from(quoteLines).where(eq(quoteLines.id, line));
    expect(row?.archivedAt).not.toBeNull();
  });

  it("`신청됨` 요청만 이어진 줄 → 같은 거부", async () => {
    const fx = await cardProject();
    await requestOn(fx, fx.lines[0] ?? "", 100_000);
    await expect(saveQuoteLines(SYSTEM_VIEWER, fx.revisionId, { rows: [], archivedLineIds: [fx.lines[0] ?? ""] })).rejects.toThrow("연결 문서 있음 · 삭제 대신 취소");
  });

  it("요청을 취소하면 → 줄 보관 통과", async () => {
    const fx = await cardProject();
    await cancelRequest(fx, await requestOn(fx, fx.lines[0] ?? "", 100_000));
    await saveQuoteLines(SYSTEM_VIEWER, fx.revisionId, { rows: [], archivedLineIds: [fx.lines[0] ?? ""] });
    expect(await lineCount(fx.revisionId)).toBe(1);
  });

  it("차수 1 L1에 카드 → 차수 2 L2 보관 → 거부(계보)", async () => {
    const fx = await cardProject();
    const l1 = fx.lines[0] ?? "";
    await cardOnLine(fx, l1, 600_000);
    const second = await nextRevision(fx);
    const l2 = await second.copyOf(l1);
    await expect(saveQuoteLines(SYSTEM_VIEWER, second.revisionId, { rows: [], archivedLineIds: [l2] })).rejects.toThrow("연결 문서 있음 · 삭제 대신 취소");
  });
});

describe("실행가 초과 읽기(N-3 내리기)", () => {
  const LIST_CTX = { status: "bidding", canWrite: true } as const;

  it("카드 900,000 · 실행가를 500,000으로 내리기 → 저장 통과 · executionOverKrw 400,000 · hasCardSideLinks", async () => {
    const fx = await cardProject();
    const line = fx.lines[0] ?? "";
    await cardOnLine(fx, line, 900_000);
    await saveExecution(fx.revisionId, line, 500_000);
    const lines = await listQuoteLines(fx.pm, fx.revisionId, { ...LIST_CTX, cardSideFacts: await lineCardSideFacts(fx.pm, { revisionId: fx.revisionId }) });
    expect(lines.find((row) => row.id === line)).toMatchObject({ executionOverKrw: 400_000, hasCardSideLinks: true });
  });

  it("실행가 900,000(초과 없음) → executionOverKrw null", async () => {
    const fx = await cardProject();
    const line = fx.lines[0] ?? "";
    await cardOnLine(fx, line, 900_000);
    await saveExecution(fx.revisionId, line, 900_000);
    const lines = await listQuoteLines(fx.pm, fx.revisionId, { ...LIST_CTX, cardSideFacts: await lineCardSideFacts(fx.pm, { revisionId: fx.revisionId }) });
    expect(lines.find((row) => row.id === line)).toMatchObject({ executionOverKrw: null, hasCardSideLinks: true });
  });

  it("연결 없는 줄 → hasCardSideLinks 거짓 · executionOverKrw null", async () => {
    const fx = await cardProject();
    const lines = await listQuoteLines(fx.pm, fx.revisionId, { ...LIST_CTX, cardSideFacts: await lineCardSideFacts(fx.pm, { revisionId: fx.revisionId }) });
    expect(lines[0]).toMatchObject({ executionOverKrw: null, hasCardSideLinks: false });
  });

  it("quote.amount가 없는 계급 → DTO에 executionOverKrw 키 없음", async () => {
    const fx = await cardProject();
    await cardOnLine(fx, fx.lines[0] ?? "", 900_000);
    await saveExecution(fx.revisionId, fx.lines[0] ?? "", 500_000);
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `금액숨김-${randomUUID().slice(0, 8)}`, workScope: "company" });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "project.value", visible: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "quote.amount", visible: false });
    const viewer = await makePerson("금액숨김", role.id, null);
    const lines = await listQuoteLines(viewer, fx.revisionId, { ...LIST_CTX, cardSideFacts: await lineCardSideFacts(viewer, { revisionId: fx.revisionId }) });
    expect(lines[0]).not.toHaveProperty("executionOverKrw");
    expect(lines[0]).toHaveProperty("hasCardSideLinks", true);
  });
});

describe("경합(X-2)", () => {
  it("정산 프로젝트 · precheck 통과 → 풀 밖 클라이언트가 프로젝트 행을 잡고 완료로 커밋 → CompletedProjectError · 카드 사용 0", async () => {
    const fx = await cardProject();
    await setStatus(fx.projectId, "settling");
    const input = lineInput(fx, fx.lines[0] ?? "", 100_000);
    const pre = await precheckCardUsage(fx.pm, input);
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT id FROM projects WHERE id = $1 FOR UPDATE", [fx.projectId]);
      await client.query("UPDATE projects SET status = 'completed' WHERE id = $1", [fx.projectId]);
      const creating = caught(createCardUsage(fx.pm, input, pre));
      await new Promise((resolve) => setTimeout(resolve, 300));
      await client.query("COMMIT");
      expect(await creating).toBeInstanceOf(CompletedProjectError);
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      await client.end();
    }
    expect(await usageCount()).toBe(0);
  });

  it("precheck 뒤 새 차수 → 옛 pre.revisionId로 등록 → `견적 새 차수 · 새로 고침` · 카드 사용 0", async () => {
    const fx = await cardProject();
    const input = lineInput(fx, fx.lines[0] ?? "", 100_000);
    const pre = await precheckCardUsage(fx.pm, input);
    await nextRevision(fx);
    const error = await caught(createCardUsage(fx.pm, input, pre));
    expect(error).toBeInstanceOf(StaleQuoteRevisionError);
    expect((error as Error).message).toBe("견적 새 차수 · 새로 고침");
    expect(await usageCount()).toBe(0);
  });
});

describe("06-05에서 넘어온 거부 · 저장값", () => {
  it("팀 비용 · 사용일 소속 없음 → 거부", async () => {
    const lonely = await makePerson("무소속", DEFAULT_ROLE_ID, null);
    const cardId = await makeCard({ kind: "personal", holderUserId: lonely.id });
    await expect(precheckCardUsage(lonely, usageInput(cardId))).rejects.toThrow("소속 없음 · 소속 발령은 관리자");
  });

  it("외화 저장값 네 칸(통화 · 외화 금액 · 환율 · 원화 환산액)", async () => {
    const team = await makeTeam();
    const staff = await makePerson("직원", DEFAULT_ROLE_ID, team.name);
    const cardId = await makeCard({ kind: "personal", holderUserId: staff.id });
    const input: CardUsageInput = { ...usageInput(cardId), total: { currency: "USD", amount: 900, fxRate: 1474.89 } };
    const created = await createCardUsage(staff, input, await precheckCardUsage(staff, input));
    const [row] = await db.select().from(corpCardUsages).where(eq(corpCardUsages.id, created.id));
    expect(row).toMatchObject({ totalCurrency: "USD", totalForeignAmount: "900.00", totalFxRate: "1474.8900", totalAmountKrw: 1_327_401 });
  });

  it("(CROSS R-2) 세율 기준일 = 사용일 — 오늘부터 0.2 이력이 있어도 지난달 사용일은 0.1로 역산", async () => {
    const team = await makeTeam();
    const staff = await makePerson("직원", DEFAULT_ROLE_ID, team.name);
    const cardId = await makeCard({ kind: "personal", holderUserId: staff.id });
    await addHistorizedValue(SYSTEM_VIEWER, TAX_VAT_RATE, { effectiveFrom: seoulToday(), value: 0.2 });
    const lastMonth = seoulToday(new Date(Date.now() - 35 * 24 * 60 * 60 * 1000));
    const input: CardUsageInput = { ...usageInput(cardId), usedOn: lastMonth, total: { currency: "KRW", amount: 1_100_000, fxRate: 1 }, evidenceTypeCode: "tax_invoice" };
    const created = await createCardUsage(staff, input, await precheckCardUsage(staff, input));
    const [row] = await db.select().from(corpCardUsages).where(eq(corpCardUsages.id, created.id));
    expect(row).toMatchObject({ supplyKrw: 1_000_000, vatKrw: 100_000 });
  });
});

describe("새 건 연결 기본값(M-4)", () => {
  it("직전 = P의 견적 줄 → 견적 줄 · P · 줄 빔", async () => {
    const fx = await cardProject();
    await cardOnLine(fx, fx.lines[0] ?? "", 1_000);
    const defaults = await cardUsageFormDefaults(fx.pm, seoulToday(), {});
    expect(defaults).toMatchObject({ linkKind: "quote_line", project: { id: fx.projectId }, line: null });
  });

  it("직전 = P의 견적 외 비용 → 견적 외 비용 · P", async () => {
    const fx = await cardProject();
    await outOfQuote(fx, 1_000, "다과");
    expect(await cardUsageFormDefaults(fx.pm, seoulToday(), {})).toMatchObject({ linkKind: "out_of_quote", project: { id: fx.projectId } });
  });

  it("직전 P가 지금 완료 → 종류만", async () => {
    const fx = await cardProject();
    await cardOnLine(fx, fx.lines[0] ?? "", 1_000);
    await setStatus(fx.projectId, "completed");
    expect(await cardUsageFormDefaults(fx.pm, seoulToday(), {})).toMatchObject({ linkKind: "quote_line", project: null, line: null });
  });

  it("가장 최근 건이 보관됨 → 그 앞의 보관 안 된 건 기준", async () => {
    const fx = await cardProject();
    await cardOnLine(fx, fx.lines[0] ?? "", 1_000);
    const team = await createCardUsage(fx.pm, usageInput(fx.cardId), await precheckCardUsage(fx.pm, usageInput(fx.cardId)));
    await archiveUsage(team.id, fx.pm.id);
    expect(await cardUsageFormDefaults(fx.pm, seoulToday(), {})).toMatchObject({ linkKind: "quote_line", project: { id: fx.projectId } });
  });

  it("entry.lineId = 고를 수 있는 줄 L → 견적 줄 · L의 프로젝트 · L", async () => {
    const fx = await cardProject();
    const defaults = await cardUsageFormDefaults(fx.pm, seoulToday(), { lineId: fx.lines[0] });
    expect(defaults).toMatchObject({ linkKind: "quote_line", project: { id: fx.projectId }, line: { id: fx.lines[0], remainingKrw: 1_000_000 } });
  });

  it("entry.lineId = 반대쪽 줄 → 진입을 버리고 직전 기준", async () => {
    const fx = await setupExpenseProject();
    const cardId = await makeCard({ kind: "personal", holderUserId: fx.pm.id });
    await createCardUsage(fx.pm, usageInput(cardId), await precheckCardUsage(fx.pm, usageInput(cardId)));
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    await submitReadyDraft(fx.pm, created.created[0]?.expenseId ?? "");
    expect(await cardUsageFormDefaults(fx.pm, seoulToday(), { lineId: fx.lines.withVendor })).toMatchObject({ linkKind: "team_cost", project: null, line: null });
  });

  it("entry.projectId = 고를 수 있는 프로젝트 Q → 견적 줄 · Q · 줄 빔", async () => {
    const fx = await cardProject();
    expect(await cardUsageFormDefaults(fx.pm, seoulToday(), { projectId: fx.projectId })).toMatchObject({ linkKind: "quote_line", project: { id: fx.projectId }, line: null });
  });

  it("entry.projectId = 완료 프로젝트 → 진입을 버리고 직전 기준", async () => {
    const fx = await cardProject();
    await setStatus(fx.projectId, "completed");
    expect(await cardUsageFormDefaults(fx.pm, seoulToday(), { projectId: fx.projectId })).toMatchObject({ linkKind: null, project: null, line: null });
  });
});

describe("보관 건 제외(H-4)", () => {
  it("카드 사용 한 건만 이어진 줄에서 그 건을 보관 → findLineLinks 0건 · side expense 통과 · S10 2행 복귀", async () => {
    const fx = await cardProject();
    const line = fx.lines[0] ?? "";
    const usage = await cardOnLine(fx, line, 600_000);
    const before = await searchLinesForCardLink(fx.pm, { projectId: fx.projectId, query: "", currentLineId: null });
    expect(before.rows[0]?.hint).toBe("남은 실행가 400,000 · 카드 사용 1건 600,000");
    await archiveUsage(usage, fx.pm.id);
    const links = (await findLineLinks(fx.pm, [line])).get(line);
    expect(links?.cardUsages).toHaveLength(0);
    await expect(gate(null, "card.dual-link-block", { side: "expense", links })).resolves.toEqual({ allowed: true });
    const after = await searchLinesForCardLink(fx.pm, { projectId: fx.projectId, query: "", currentLineId: null });
    expect(after.rows[0]).toMatchObject({ remainingKrw: 1_000_000, hint: "남은 실행가 1,000,000" });
  });
});
