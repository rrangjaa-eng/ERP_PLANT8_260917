import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { ForbiddenError } from "@/domain/permissions/can";
import { createCorpCard } from "@/domain/corp-cards";
import { createOrgUnit, createTeam } from "@/domain/org";
import { db } from "@/db/client";
import { actionLog, corpCardUsages, corpCards, projects, purchaseRequests, quoteLines, users } from "@/db/schema";
import { GateBlockedError } from "@/domain/rules/gate";
import { CompletedProjectError, createProject } from "@/domain/projects";
import { createExpenseFromLines } from "@/domain/expenses";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { createRevisionFromCurrent } from "@/domain/quotes/revisions";
import { DroppedQuoteLineError, searchLinesForCardLink, searchProjectsForCardLink } from "@/domain/corp-card-usages/link-targets";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import {
  cardOptionsForUsage,
  cardUsageFormDefaults,
  createCardUsage,
  deleteCardUsage,
  listCardUsages,
  listProjectCardUsages,
  loadCardUsageForEdit,
  precheckCardUsage,
  precheckCardUsageRemoval,
  precheckCardUsageUpdate,
  restoreCardUsage,
  updateCardUsage,
  usedByCandidates,
  type CardUsageInput,
  type CardUsageUpdateInput,
} from "@/domain/corp-card-usages";
import { insertRole } from "@/repositories/roles";
import { insertVendor } from "@/repositories/vendors";
import { insertMembership } from "@/repositories/team-memberships";
import { insertCardUsage } from "@/repositories/corp-card-usages";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { seoulToday } from "@/lib/dates";
import { makePerson } from "./approvals-fixtures";
import { setupExpenseProject, submitReadyDraft } from "./fixtures/expenses";

// 06-09(EXP-16 · EXP-07 · O-11 · B-1 · Q3 · E-9): 대리 등록 · 사용한 사람 · 수정 · 삭제 · 되돌리기.

const VISIBLE = ["team.value", "card_usage.value", "card_usage.amount", "project.value", "quote.amount"];

function uniqueLast4(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function makeTeam(): Promise<{ id: string; name: string }> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `대리본부-${randomUUID()}` });
  const name = `대리팀-${randomUUID()}`;
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name });
  return { id: team.id, name };
}

// 새 계급 — 메뉴 권한 목록과 노출을 그대로 준다(업무 범위는 팀).
async function makeRole(menus: readonly { menu: string; action: "view" | "write" }[]): Promise<string> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `대리-${randomUUID().slice(0, 8)}`, workScope: "team" });
  for (const grant of menus) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: grant.menu, action: grant.action, allowed: true });
  for (const infoItem of VISIBLE) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  return role.id;
}

// 경영관리(대리 등록 권한자) — cards.proxy write + 프로젝트 보기.
async function makeProxy(teamName: string, name = "경영관리"): Promise<Viewer> {
  return makePerson(name, await makeRole([{ menu: "cards.proxy", action: "write" }, { menu: "projects", action: "view" }]), teamName);
}

async function makeCard(input: { kind: "personal" | "team" | "shared"; holderUserId?: string; teamId?: string }, label = `${input.kind} 카드`): Promise<string> {
  const card = await createCorpCard(SYSTEM_VIEWER, { issuer: `카드사-${randomUUID().slice(0, 6)}`, numberLast4: uniqueLast4(), label, ...input });
  if (!card.id) throw new Error("카드 id 없음");
  return card.id;
}

type Fx = { team: { id: string; name: string }; pm: Viewer; proxy: Viewer; cardId: string; projectId: string; revisionId: string; lines: string[] };

// PM 소지 개인 카드 · PM 담당 수주중 프로젝트(줄마다 실행가) · 같은 팀 경영관리. 증빙 `계산서`(규칙 없음) → 공급가 = 결제 합계.
async function setup(executions: readonly number[] = [1_000_000]): Promise<Fx> {
  const team = await makeTeam();
  const pm = await makePerson("박서연", DEFAULT_ROLE_ID, team.name);
  const proxy = await makeProxy(team.name);
  const cardId = await makeCard({ kind: "personal", holderUserId: pm.id });
  const client = await insertVendor(SYSTEM_VIEWER, { name: `클라이언트-${randomUUID()}`, normalizedName: `클라이언트-${randomUUID()}` });
  const project = await createProject(pm, { clientId: client.id, teamId: team.id, pmUserId: pm.id, name: `대리-${randomUUID().slice(0, 8)}`, startDate: "2026-09-01", endDate: "2026-12-31" });
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
  return { team, pm, proxy, cardId, projectId: project.id, revisionId: revision.id, lines: ids };
}

function lineInput(cardId: string, lineId: string, total: number): CardUsageInput {
  return {
    corpCardId: cardId,
    usedOn: seoulToday(),
    merchantVendorId: null,
    total: { currency: "KRW", amount: total, fxRate: 1 },
    evidenceTypeCode: "invoice",
    linkKind: "quote_line",
    lineId,
    memo: null,
  };
}

async function create(viewer: Viewer, input: CardUsageInput): Promise<string> {
  return (await createCardUsage(viewer, input, await precheckCardUsage(viewer, input))).id;
}

async function rowOf(id: string) {
  const [row] = await db.select().from(corpCardUsages).where(eq(corpCardUsages.id, id));
  if (!row) throw new Error("카드 사용 없음");
  return row;
}

async function update(viewer: Viewer, input: CardUsageUpdateInput) {
  return updateCardUsage(viewer, input, await precheckCardUsageUpdate(viewer, input));
}

async function editInput(id: string, base: CardUsageInput, total: number): Promise<CardUsageUpdateInput> {
  const row = await rowOf(id);
  return { ...base, id, version: row.version, total: { currency: "KRW", amount: total, fxRate: 1 } };
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("거부되지 않음");
}

async function nextRevision(fx: Fx): Promise<{ revisionId: string; copyOf: (lineId: string) => Promise<string> }> {
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

async function logsOf(actorId: string, actionType: string): Promise<string[]> {
  const rows = await db
    .select({ entityId: actionLog.entityId })
    .from(actionLog)
    .where(and(eq(actionLog.actorId, actorId), eq(actionLog.actionType, actionType), eq(actionLog.entity, "corp_card_usage")));
  return rows.map((row) => row.entityId ?? "");
}

// ── Task 1 ──────────────────────────────────────────────────────────────────

describe("대리 등록(EXP-16 · D-608)", () => {
  it("cards.proxy write · 남의 개인 카드 · 견적 줄 → registeredVia proxy · 사용한 사람 = 소지자 · 같은 tx document_create", async () => {
    const fx = await setup();
    const input = lineInput(fx.cardId, fx.lines[0] ?? "", 300_000);
    const pre = await precheckCardUsage(fx.proxy, input);
    expect(pre.registeredVia).toBe("proxy");
    expect(pre.usedByUserId).toBe(fx.pm.id);
    const created = await createCardUsage(fx.proxy, input, pre);
    const row = await rowOf(created.id);
    expect(row).toMatchObject({ registeredVia: "proxy", registeredBy: fx.proxy.id, usedByUserId: fx.pm.id, quoteLineId: fx.lines[0] });
    expect(await logsOf(fx.proxy.id, "document_create")).toEqual([created.id]);
  });

  it("cards.proxy 없음 · 남의 카드 → ForbiddenError · 카드 사용 0", async () => {
    const fx = await setup();
    const staff = await makePerson("직원", DEFAULT_ROLE_ID, fx.team.name);
    await expect(precheckCardUsage(staff, lineInput(fx.cardId, fx.lines[0] ?? "", 1_000))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("지급(expenses.payments) · 구매(cards.purchases) write만 있는 계정 · 남의 카드 → ForbiddenError(대신 통과하지 않는다)", async () => {
    const fx = await setup();
    const payer = await makePerson(
      "지급구매",
      await makeRole([
        { menu: "expenses.payments", action: "write" },
        { menu: "cards.purchases", action: "write" },
        { menu: "projects", action: "view" },
      ]),
      fx.team.name,
    );
    await expect(precheckCardUsage(payer, lineInput(fx.cardId, fx.lines[0] ?? "", 1_000))).rejects.toBeInstanceOf(ForbiddenError);
    const teamCost: CardUsageInput = { ...lineInput(fx.cardId, "", 1_000), linkKind: "team_cost" };
    await expect(precheckCardUsage(payer, teamCost)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("cardOptionsForUsage — 권한자는 활성 카드 전부(남의 개인 · 남의 팀 · 공용) · proxyHint(개인 = 소지자 이름 · 남의 팀 = 팀 이름 · 공용 · 본인 자격 = 없음)", async () => {
    const fx = await setup();
    const other = await makeTeam();
    const otherTeamCard = await makeCard({ kind: "team", teamId: other.id });
    const ownTeamCard = await makeCard({ kind: "team", teamId: fx.team.id });
    const shared = await makeCard({ kind: "shared" });
    const options = await cardOptionsForUsage(fx.proxy, seoulToday());
    const hintOf = (id: string) => options.find((option) => option.id === id)?.proxyHint;
    expect(hintOf(fx.cardId)).toBe("경영관리 등록 · 카드 소지자 박서연");
    expect(hintOf(otherTeamCard)).toBe(`경영관리 등록 · 카드 소지자 ${other.name}`);
    expect(hintOf(ownTeamCard)).toBeNull();
    expect(hintOf(shared)).toBeNull();
    // 직원은 그대로 — 자기 카드 · 팀 카드만, 힌트 없음.
    const staffOptions = await cardOptionsForUsage(fx.pm, seoulToday());
    expect(staffOptions.map((option) => option.id)).not.toContain(otherTeamCard);
    expect(staffOptions.every((option) => option.proxyHint === null)).toBe(true);
  });

  it("cardOptionsForUsage choosesUser — 권한자: 남의 개인 · 팀 · 공용 카드 참(팀 비용 = 사용한 사람의 팀) · 본인 개인 카드 거짓 / 직원: 전부 거짓", async () => {
    const fx = await setup();
    const own = await makeCard({ kind: "personal", holderUserId: fx.proxy.id });
    const teamCard = await makeCard({ kind: "team", teamId: fx.team.id });
    const shared = await makeCard({ kind: "shared" });
    const options = await cardOptionsForUsage(fx.proxy, seoulToday());
    const choosesOf = (id: string) => options.find((option) => option.id === id)?.choosesUser;
    expect([choosesOf(fx.cardId), choosesOf(teamCard), choosesOf(shared), choosesOf(own)]).toEqual([true, true, true, false]);
    expect((await cardOptionsForUsage(fx.pm, seoulToday())).every((option) => option.choosesUser === false)).toBe(true);
  });

  it("공용 카드 · 권한자 → registeredVia self(소지자 없음)", async () => {
    const fx = await setup();
    const shared = await makeCard({ kind: "shared" });
    const pre = await precheckCardUsage(fx.proxy, { ...lineInput(shared, "", 1_000), linkKind: "team_cost" });
    expect(pre.registeredVia).toBe("self");
  });

  it("목록 — 등록 칸 재료 registeredVia proxy · 행 rights(권한자 = 셋 다 참 · PM = 셋 다 거짓 — 남이 등록한 건)", async () => {
    const fx = await setup();
    await create(fx.proxy, lineInput(fx.cardId, fx.lines[0] ?? "", 300_000));
    const month = seoulToday().slice(0, 7);
    const [proxyRow] = (await listCardUsages(fx.proxy, { month }, seoulToday())).rows;
    expect(proxyRow?.registeredVia).toBe("proxy");
    expect(proxyRow?.rights).toEqual({ edit: true, changeLink: true, delete: true });
    const [pmRow] = (await listCardUsages(fx.pm, { month }, seoulToday())).rows;
    expect(pmRow?.rights).toEqual({ edit: false, changeLink: false, delete: false });
  });
});

describe("수정(B-1 · Q3 · D-609)", () => {
  it("등록자 · 연결 그대로 · 결제 합계 변경 → 재역산 저장 · document_update · version +1", async () => {
    const fx = await setup();
    const base = lineInput(fx.cardId, fx.lines[0] ?? "", 300_000);
    const id = await create(fx.pm, base);
    const before = await rowOf(id);
    await update(fx.pm, await editInput(id, base, 450_000));
    const after = await rowOf(id);
    expect(after).toMatchObject({ totalAmountKrw: 450_000, supplyKrw: 450_000, vatKrw: 0, version: before.version + 1, quoteLineId: fx.lines[0] });
    expect(await logsOf(fx.pm.id, "document_update")).toEqual([id]);
  });

  it("권리 없음(남이 등록 · 권한자 아님) → ForbiddenError · 행 그대로", async () => {
    const fx = await setup();
    const base = lineInput(fx.cardId, fx.lines[0] ?? "", 300_000);
    const id = await create(fx.proxy, base);
    const error = await caught(precheckCardUsageUpdate(fx.pm, await editInput(id, base, 400_000)));
    expect(error).toBeInstanceOf(ForbiddenError);
    expect((await rowOf(id)).totalAmountKrw).toBe(300_000);
  });

  it("카드 값이 저장된 것과 다름 → 거부", async () => {
    const fx = await setup();
    const base = lineInput(fx.cardId, fx.lines[0] ?? "", 300_000);
    const id = await create(fx.pm, base);
    const otherCard = await makeCard({ kind: "team", teamId: fx.team.id });
    await expect(precheckCardUsageUpdate(fx.pm, { ...(await editInput(id, base, 300_000)), corpCardId: otherCard })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("낡은 version → `다른 저장이 먼저 됨 · 새로 고침` · 행 그대로", async () => {
    const fx = await setup();
    const base = lineInput(fx.cardId, fx.lines[0] ?? "", 300_000);
    const id = await create(fx.pm, base);
    const stale = await editInput(id, base, 310_000);
    await update(fx.pm, await editInput(id, base, 320_000));
    const error = await caught(update(fx.pm, stale));
    expect((error as Error).message).toBe("다른 저장이 먼저 됨 · 새로 고침");
    expect((await rowOf(id)).totalAmountKrw).toBe(320_000);
  });

  it("loadCardUsageForEdit — 권리 있는 사람은 건 + rights, 권리 없는 사람 · 없는 건은 null", async () => {
    const fx = await setup();
    const id = await create(fx.proxy, lineInput(fx.cardId, fx.lines[0] ?? "", 300_000));
    const loaded = await loadCardUsageForEdit(fx.proxy, id);
    expect(loaded?.usage.id).toBe(id);
    expect(loaded?.rights.edit).toBe(true);
    expect(await loadCardUsageForEdit(fx.pm, id)).toBeNull();
    expect(await loadCardUsageForEdit(fx.proxy, randomUUID())).toBeNull();
  });
});

describe("연결 그대로 수정의 상한 바탕(N-1 · N-2)", () => {
  it("L1 건(600,000) → 차수 2 L2 실행가 1,500,000 → 1,200,000으로 수정 → 저장(L2 상한)", async () => {
    const fx = await setup();
    const l1 = fx.lines[0] ?? "";
    const base = lineInput(fx.cardId, l1, 600_000);
    const id = await create(fx.pm, base);
    const second = await nextRevision(fx);
    await saveExecution(second.revisionId, await second.copyOf(l1), 1_500_000);
    await update(fx.pm, await editInput(id, base, 1_200_000));
    expect((await rowOf(id)).supplyKrw).toBe(1_200_000);
  });

  it("L2 실행가를 700,000으로 내림 → 700,001 거부 `실행가 초과 · 남은 실행가 700,000 · 다른 줄 고르기` · 700,000 저장", async () => {
    const fx = await setup();
    const l1 = fx.lines[0] ?? "";
    const base = lineInput(fx.cardId, l1, 600_000);
    const id = await create(fx.pm, base);
    const second = await nextRevision(fx);
    await saveExecution(second.revisionId, await second.copyOf(l1), 700_000);
    const error = await caught(update(fx.pm, await editInput(id, base, 700_001)));
    expect(error).toBeInstanceOf(GateBlockedError);
    expect((error as Error).message).toBe("실행가 초과 · 남은 실행가 700,000 · 다른 줄 고르기");
    await update(fx.pm, await editInput(id, base, 700_000));
    expect((await rowOf(id)).supplyKrw).toBe(700_000);
  });

  it("L2를 보관(SQL 직접) → L1 건 수정 → `견적 줄 빠짐 · 새로 고침` · 건 그대로", async () => {
    const fx = await setup();
    const l1 = fx.lines[0] ?? "";
    const base = lineInput(fx.cardId, l1, 600_000);
    const id = await create(fx.pm, base);
    const l2 = await (await nextRevision(fx)).copyOf(l1);
    await db.update(quoteLines).set({ archivedAt: new Date(), archivedBy: fx.pm.id }).where(eq(quoteLines.id, l2));
    const before = await rowOf(id);
    const error = await caught(update(fx.pm, await editInput(id, base, 500_000)));
    expect(error).toBeInstanceOf(DroppedQuoteLineError);
    expect(await rowOf(id)).toMatchObject({ supplyKrw: 600_000, version: before.version });
  });
});

// ── Task 2 ──────────────────────────────────────────────────────────────────

const USED_ON = "2026-09-15";

async function setStatus(projectId: string, status: string): Promise<void> {
  await db.update(projects).set({ status }).where(eq(projects.id, projectId));
}

async function setEmployment(userId: string, values: { hireDate?: string; resignationDate?: string }): Promise<void> {
  await db.update(users).set(values).where(eq(users.id, userId));
}

async function lineCount(revisionId: string): Promise<number> {
  return (await db.select({ id: quoteLines.id }).from(quoteLines).where(eq(quoteLines.revisionId, revisionId))).length;
}

async function usagesOnCard(cardId: string): Promise<number> {
  return (await db.select({ id: corpCardUsages.id }).from(corpCardUsages).where(eq(corpCardUsages.corpCardId, cardId))).length;
}

function teamCostInput(cardId: string, total: number, usedByUserId: string | null, usedOn = seoulToday()): CardUsageInput {
  return { ...lineInput(cardId, "", total), usedOn, linkKind: "team_cost", usedByUserId };
}

function outOfQuoteInput(cardId: string, projectId: string, total: number): CardUsageInput {
  return { ...lineInput(cardId, "", total), linkKind: "out_of_quote", projectId, itemName: "현장 다과" };
}

// 같은 팀 · 같은 PM의 두 번째 프로젝트(줄 하나).
async function secondProject(fx: Fx, execution = 1_000_000): Promise<{ projectId: string; revisionId: string; lineId: string }> {
  const client = await insertVendor(SYSTEM_VIEWER, { name: `클라이언트-${randomUUID()}`, normalizedName: `클라이언트-${randomUUID()}` });
  const project = await createProject(fx.pm, { clientId: client.id, teamId: fx.team.id, pmUserId: fx.pm.id, name: `대리2-${randomUUID().slice(0, 8)}`, startDate: "2026-09-01", endDate: "2026-12-31" });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("1차 차수 없음");
  const lineId = randomUUID();
  await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
    rows: [
      {
        id: lineId,
        isNew: true as const,
        subcategory: (await firstSelectableSubcategory()).value,
        itemName: "둘째 줄",
        vendorId: null,
        unitPrice: { currency: "KRW" as const, amount: execution + 500_000, fxRate: 1 },
        execution: { currency: "KRW" as const, amount: execution, fxRate: 1 },
      },
    ],
  });
  return { projectId: project.id, revisionId: revision.id, lineId };
}

describe("사용한 사람(EXP-07 · Q5)", () => {
  it("대리 등록 권한 없음 → usedByCandidates ForbiddenError", async () => {
    const fx = await setup();
    await expect(usedByCandidates(fx.pm, { cardId: fx.cardId, usedOn: USED_ON })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("개인 카드 → [소지자]", async () => {
    const fx = await setup();
    const candidates = await usedByCandidates(fx.proxy, { cardId: fx.cardId, usedOn: USED_ON });
    expect(candidates.map((candidate) => candidate.id)).toEqual([fx.pm.id]);
    expect(candidates[0]?.team).toEqual({ id: fx.team.id, name: fx.team.name });
  });

  it("팀 카드 → 사용일에 그 팀 소속이던 사람 전부(지금 다른 팀 `지금 {팀}` · 퇴사 `퇴사`) · 사용일 뒤 전입 · 입사 제외 · 팀 = 사용일 팀", async () => {
    const fx = await setup();
    const team = await makeTeam();
    const other = await makeTeam();
    const stayed = await makePerson("가윤", DEFAULT_ROLE_ID, team.name);
    const moved = await makePerson("나래", DEFAULT_ROLE_ID, team.name);
    await insertMembership(SYSTEM_VIEWER, { userId: moved.id, teamId: other.id, effectiveFrom: "2026-09-20" });
    const resigned = await makePerson("다온", DEFAULT_ROLE_ID, team.name);
    await setEmployment(resigned.id, { resignationDate: "2026-09-25" });
    const joinedLater = await makePerson("라희", DEFAULT_ROLE_ID, null);
    await insertMembership(SYSTEM_VIEWER, { userId: joinedLater.id, teamId: team.id, effectiveFrom: "2026-09-20" });
    const hiredLater = await makePerson("마루", DEFAULT_ROLE_ID, team.name);
    await setEmployment(hiredLater.id, { hireDate: "2026-09-20" });
    const teamCard = await makeCard({ kind: "team", teamId: team.id });

    const candidates = await usedByCandidates(fx.proxy, { cardId: teamCard, usedOn: USED_ON });
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    expect([...byId.keys()].sort()).toEqual([stayed.id, moved.id, resigned.id].sort());
    expect(byId.get(stayed.id)?.note).toBeNull();
    expect(byId.get(moved.id)?.note).toBe(`지금 ${other.name}`);
    expect(byId.get(resigned.id)?.note).toBe("퇴사");
    expect(candidates.every((candidate) => candidate.team?.id === team.id && candidate.team.name === team.name)).toBe(true);
  });

  it("공용 카드 → 사용일 재직자 전부(사용일 뒤 입사 · 사용일 전 퇴사 제외) · 소속 없으면 team null", async () => {
    const fx = await setup();
    const team = await makeTeam();
    const member = await makePerson("가윤", DEFAULT_ROLE_ID, team.name);
    const noTeam = await makePerson("바다", DEFAULT_ROLE_ID, null);
    const hiredLater = await makePerson("마루", DEFAULT_ROLE_ID, team.name);
    await setEmployment(hiredLater.id, { hireDate: "2026-09-20" });
    const leftBefore = await makePerson("사랑", DEFAULT_ROLE_ID, team.name);
    await setEmployment(leftBefore.id, { resignationDate: "2026-09-10" });
    const shared = await makeCard({ kind: "shared" });

    const candidates = await usedByCandidates(fx.proxy, { cardId: shared, usedOn: USED_ON });
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    expect(byId.get(member.id)?.team).toEqual({ id: team.id, name: team.name });
    expect(byId.get(noTeam.id)?.team).toBeNull();
    expect(byId.has(hiredLater.id)).toBe(false);
    expect(byId.has(leftBefore.id)).toBe(false);
  });

  it("저장 — 후보 밖 사람(조작 요청) → ForbiddenError `사용한 사람 후보 아님 · 사용한 사람 고르기` · 카드 사용 0", async () => {
    const fx = await setup();
    const team = await makeTeam();
    await makePerson("가윤", DEFAULT_ROLE_ID, team.name);
    const outsider = await makePerson("라희", DEFAULT_ROLE_ID, fx.team.name);
    const teamCard = await makeCard({ kind: "team", teamId: team.id });
    const error = await caught(precheckCardUsage(fx.proxy, teamCostInput(teamCard, 50_000, outsider.id, USED_ON)));
    expect(error).toBeInstanceOf(ForbiddenError);
    expect((error as Error).message).toBe("사용한 사람 후보 아님 · 사용한 사람 고르기");
    expect(await usagesOnCard(teamCard)).toBe(0);
  });

  it("저장 — 팀 비용 · 사용한 사람 사용일 소속 없음 → `{이름} {MM-DD} 소속 없음 · 소속 발령은 관리자`", async () => {
    const fx = await setup();
    const noTeam = await makePerson("바다", DEFAULT_ROLE_ID, null);
    const shared = await makeCard({ kind: "shared" });
    const error = await caught(precheckCardUsage(fx.proxy, teamCostInput(shared, 50_000, noTeam.id, USED_ON)));
    expect((error as Error).message).toBe("바다 09-15 소속 없음 · 소속 발령은 관리자");
  });

  it("저장 — 팀 카드 · 지금 다른 팀으로 간 사람 → 팀 = 사용일 소속 · 공용 카드 → 그 사람의 사용일 팀", async () => {
    const fx = await setup();
    const team = await makeTeam();
    const other = await makeTeam();
    const moved = await makePerson("나래", DEFAULT_ROLE_ID, team.name);
    await insertMembership(SYSTEM_VIEWER, { userId: moved.id, teamId: other.id, effectiveFrom: "2026-09-20" });
    const teamCard = await makeCard({ kind: "team", teamId: team.id });
    const viaTeam = await create(fx.proxy, teamCostInput(teamCard, 50_000, moved.id, USED_ON));
    expect(await rowOf(viaTeam)).toMatchObject({ linkKind: "team_cost", teamId: team.id, usedByUserId: moved.id, registeredVia: "proxy" });
    const shared = await makeCard({ kind: "shared" });
    const viaShared = await create(fx.proxy, teamCostInput(shared, 50_000, moved.id, USED_ON));
    expect(await rowOf(viaShared)).toMatchObject({ teamId: team.id, usedByUserId: moved.id });
  });

  it("수정 — 후보 밖 사람으로 바꾸기 → ForbiddenError · 행 그대로", async () => {
    const fx = await setup();
    const team = await makeTeam();
    const member = await makePerson("가윤", DEFAULT_ROLE_ID, team.name);
    const outsider = await makePerson("라희", DEFAULT_ROLE_ID, fx.team.name);
    const teamCard = await makeCard({ kind: "team", teamId: team.id });
    const base = teamCostInput(teamCard, 50_000, member.id, USED_ON);
    const id = await create(fx.proxy, base);
    const edit = { ...(await editInput(id, base, 60_000)), usedByUserId: outsider.id };
    await expect(precheckCardUsageUpdate(fx.proxy, edit)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await rowOf(id)).toMatchObject({ usedByUserId: member.id, totalAmountKrw: 50_000 });
  });
});

describe("완료 프로젝트(D-47 · U-4 · Q-B)", () => {
  it("권한자 · 견적 외 비용 → project.line-edit ③ 갈래로 저장(새 줄 + 카드 사용 · document_create 한 줄)", async () => {
    const fx = await setup();
    await setStatus(fx.projectId, "completed");
    const before = await lineCount(fx.revisionId);
    const input = outOfQuoteInput(fx.cardId, fx.projectId, 70_000);
    const pre = await precheckCardUsage(fx.proxy, input);
    expect(pre.outOfQuote?.completedOutOfQuote).toBe(true);
    const created = await createCardUsage(fx.proxy, input, pre);
    expect(await lineCount(fx.revisionId)).toBe(before + 1);
    const row = await rowOf(created.id);
    const [line] = await db.select().from(quoteLines).where(eq(quoteLines.id, row.quoteLineId ?? ""));
    expect(line).toMatchObject({ lineKind: "out_of_quote", itemName: "현장 다과" });
    expect(await logsOf(fx.proxy.id, "document_create")).toEqual([created.id]);
  });

  it("권한자 · 완료 프로젝트 견적 줄 → CompletedProjectError", async () => {
    const fx = await setup();
    await setStatus(fx.projectId, "completed");
    await expect(precheckCardUsage(fx.proxy, lineInput(fx.cardId, fx.lines[0] ?? "", 10_000))).rejects.toBeInstanceOf(CompletedProjectError);
  });

  it("비권한자 · 견적 외 비용 → CompletedProjectError", async () => {
    const fx = await setup();
    await setStatus(fx.projectId, "completed");
    await expect(precheckCardUsage(fx.pm, outOfQuoteInput(fx.cardId, fx.projectId, 10_000))).rejects.toBeInstanceOf(CompletedProjectError);
  });

  it("비권한자 경합 — 사전 조회 때 settling → 몸통 전에 completed → `완료 · 견적 줄 잠김` · 줄 · 카드 사용 0", async () => {
    const fx = await setup();
    await setStatus(fx.projectId, "settling");
    const input = outOfQuoteInput(fx.cardId, fx.projectId, 10_000);
    const pre = await precheckCardUsage(fx.pm, input);
    const before = await lineCount(fx.revisionId);
    await setStatus(fx.projectId, "completed");
    const error = await caught(createCardUsage(fx.pm, input, pre));
    expect(error).toBeInstanceOf(GateBlockedError);
    expect((error as Error).message).toBe("완료 · 견적 줄 잠김");
    expect(await lineCount(fx.revisionId)).toBe(before);
    expect(await usagesOnCard(fx.cardId)).toBe(0);
  });

  it("searchProjectsForCardLink — 권한자 완료 프로젝트 selectable · 2행 `완료 · 견적 줄 잠김` / 비권한자 selectable 거짓", async () => {
    const fx = await setup();
    await setStatus(fx.projectId, "completed");
    const [project] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, fx.projectId));
    const query = project?.name ?? "";
    const proxyRow = (await searchProjectsForCardLink(fx.proxy, { query })).rows.find((row) => row.id === fx.projectId);
    expect(proxyRow).toMatchObject({ selectable: true, note: "완료 · 견적 줄 잠김" });
    const pmRow = (await searchProjectsForCardLink(fx.pm, { query })).rows.find((row) => row.id === fx.projectId);
    expect(pmRow).toMatchObject({ selectable: false, note: "완료 · 견적 줄 잠김" });
  });

  it("searchLinesForCardLink — 완료 프로젝트 줄 전부 selectable 거짓(권한자도) + `완료 · 견적 줄 잠김`", async () => {
    const fx = await setup([500_000, 700_000]);
    await setStatus(fx.projectId, "completed");
    const found = await searchLinesForCardLink(fx.proxy, { projectId: fx.projectId, query: "" });
    expect(found.rows).toHaveLength(2);
    expect(found.rows.every((row) => row.selectable === false)).toBe(true);
    // 이유 칸은 지출결의 금액 노출(expense.amount)까지 볼 때만 — 기본 계급(PM)으로 글자를 본다.
    const reasons = (await searchLinesForCardLink(fx.pm, { projectId: fx.projectId, query: "" })).rows.map((row) => row.reason);
    expect(reasons).toEqual(["완료 · 견적 줄 잠김", "완료 · 견적 줄 잠김"]);
  });
});

describe("수정 연결 변경(B-1 · E-9)", () => {
  it("줄 A → 지출결의가 이어진 줄 B → `지출결의 {번호} 연결됨 · 다른 줄 고르기` · 행 그대로", async () => {
    const fx = await setupExpenseProject();
    const cardId = await makeCard({ kind: "personal", holderUserId: fx.pm.id });
    const base = lineInput(cardId, fx.lines.noVendor, 100_000);
    const id = await create(fx.pm, base);
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const submitted = await submitReadyDraft(fx.pm, created.created[0]?.expenseId ?? "");
    if (submitted.kind !== "submitted") throw new Error("제출되지 않음");
    const edit: CardUsageUpdateInput = { ...(await editInput(id, base, 100_000)), linkKind: "quote_line", lineId: fx.lines.withVendor };
    const error = await caught(update(fx.pm, edit));
    expect((error as Error).message).toBe(`지출결의 ${submitted.number} 연결됨 · 다른 줄 고르기`);
    expect((await rowOf(id)).quoteLineId).toBe(fx.lines.noVendor);
  });

  it("줄 A → 견적 외 비용 → 같은 tx에 새 줄 + 연결 이동 / 실패(낡은 version)면 줄 수 그대로", async () => {
    const fx = await setup();
    const base = lineInput(fx.cardId, fx.lines[0] ?? "", 300_000);
    const id = await create(fx.pm, base);
    const before = await lineCount(fx.revisionId);
    const moveTo = async (version: number) => update(fx.pm, { ...outOfQuoteInput(fx.cardId, fx.projectId, 300_000), id, version });
    const stale = (await rowOf(id)).version;
    await update(fx.pm, await editInput(id, base, 310_000));
    await expect(moveTo(stale)).rejects.toThrow("다른 저장이 먼저 됨 · 새로 고침");
    expect(await lineCount(fx.revisionId)).toBe(before);
    await moveTo((await rowOf(id)).version);
    expect(await lineCount(fx.revisionId)).toBe(before + 1);
    const row = await rowOf(id);
    const [line] = await db.select().from(quoteLines).where(eq(quoteLines.id, row.quoteLineId ?? ""));
    expect(line).toMatchObject({ lineKind: "out_of_quote", executionAmountKrw: 300_000 });
  });

  it("줄 → 팀 비용 → 팀 = 사용한 사람의 사용일 소속 · 줄 비움", async () => {
    const fx = await setup();
    const base = lineInput(fx.cardId, fx.lines[0] ?? "", 300_000);
    const id = await create(fx.proxy, base);
    await update(fx.proxy, { ...(await editInput(id, base, 300_000)), linkKind: "team_cost" });
    expect(await rowOf(id)).toMatchObject({ linkKind: "team_cost", quoteLineId: null, teamId: fx.team.id, usedByUserId: fx.pm.id });
  });

  it("구매 완료로 생긴 건의 연결 변경 → ForbiddenError", async () => {
    const fx = await setup([500_000, 500_000]);
    const [request] = await db
      .insert(purchaseRequests)
      .values({ number: `26001-C${randomUUID().slice(0, 8)}`, linkKind: "quote_line", projectId: fx.projectId, quoteLineId: fx.lines[0] ?? "", requestedBy: fx.pm.id, itemName: "현수막", estimateAmountKrw: 40_000 })
      .returning({ id: purchaseRequests.id });
    const row = await insertCardUsage(
      fx.pm,
      {
        corpCardId: fx.cardId,
        usedOn: seoulToday(),
        merchantVendorId: null,
        totalCurrency: "KRW",
        totalForeignAmount: null,
        totalFxRate: "1",
        totalAmountKrw: 40_000,
        supplyKrw: 40_000,
        vatKrw: 0,
        evidenceTypeCode: "invoice",
        linkKind: "quote_line",
        quoteLineId: fx.lines[0] ?? "",
        teamId: null,
        usedByUserId: fx.pm.id,
        registeredBy: fx.pm.id,
        registeredVia: "purchase",
        purchaseRequestId: request?.id ?? null,
        memo: null,
      },
      db,
    );
    const edit: CardUsageUpdateInput = { ...lineInput(fx.cardId, fx.lines[1] ?? "", 40_000), id: row.id, version: row.version };
    await expect(precheckCardUsageUpdate(fx.proxy, edit)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("(E-9) settling 프로젝트 줄 건 → 팀 비용 사전 조회 → 완료로 커밋 → 등록자(권한자 아님) → CompletedProjectError · 행 · version 그대로", async () => {
    const fx = await setup();
    await setStatus(fx.projectId, "settling");
    const base = lineInput(fx.cardId, fx.lines[0] ?? "", 300_000);
    const id = await create(fx.pm, base);
    const before = await rowOf(id);
    const edit: CardUsageUpdateInput = { ...(await editInput(id, base, 300_000)), linkKind: "team_cost" };
    const pre = await precheckCardUsageUpdate(fx.pm, edit);
    await setStatus(fx.projectId, "completed");
    await expect(updateCardUsage(fx.pm, edit, pre)).rejects.toBeInstanceOf(CompletedProjectError);
    expect(await rowOf(id)).toMatchObject({ linkKind: "quote_line", quoteLineId: fx.lines[0], version: before.version });
  });

  it("(E-9) 같은 순서 · 권한자 → 저장(U-4)", async () => {
    const fx = await setup();
    await setStatus(fx.projectId, "settling");
    const base = lineInput(fx.cardId, fx.lines[0] ?? "", 300_000);
    const id = await create(fx.proxy, base);
    const edit: CardUsageUpdateInput = { ...(await editInput(id, base, 300_000)), linkKind: "team_cost" };
    const pre = await precheckCardUsageUpdate(fx.proxy, edit);
    await setStatus(fx.projectId, "completed");
    await updateCardUsage(fx.proxy, edit, pre);
    expect(await rowOf(id)).toMatchObject({ linkKind: "team_cost", teamId: fx.team.id });
  });

  it("(E-9) 줄 A(P1) → 줄 B(P2) → pre.lockProjects 프로젝트 id 오름차순 두 항목(옛 쪽 allowCompleted = 권한자 · 새 쪽 revisionId · allowCompleted 거짓)", async () => {
    const fx = await setup();
    const p2 = await secondProject(fx);
    const base = lineInput(fx.cardId, fx.lines[0] ?? "", 300_000);
    const id = await create(fx.pm, base);
    const pre = await precheckCardUsageUpdate(fx.pm, await editInput(id, lineInput(fx.cardId, p2.lineId, 300_000), 300_000));
    const expected = [
      { projectId: fx.projectId, allowCompleted: false },
      { projectId: p2.projectId, revisionId: p2.revisionId, allowCompleted: false },
    ].sort((a, b) => (a.projectId < b.projectId ? -1 : 1));
    expect(pre.lockProjects).toEqual(expected);
    await updateCardUsage(fx.pm, await editInput(id, lineInput(fx.cardId, p2.lineId, 300_000), 300_000), pre);
    expect((await rowOf(id)).quoteLineId).toBe(p2.lineId);
  });

  it("(E-9) 같은 프로젝트의 줄 A → 줄 B → 새 쪽 한 항목", async () => {
    const fx = await setup([500_000, 500_000]);
    const base = lineInput(fx.cardId, fx.lines[0] ?? "", 300_000);
    const id = await create(fx.pm, base);
    const pre = await precheckCardUsageUpdate(fx.pm, await editInput(id, lineInput(fx.cardId, fx.lines[1] ?? "", 300_000), 300_000));
    expect(pre.lockProjects).toEqual([{ projectId: fx.projectId, revisionId: fx.revisionId, allowCompleted: false }]);
  });
});

describe("Q3 수정(카드 「빼기」)", () => {
  async function capFixture() {
    const fx = await setup([1_000_000]);
    const line = fx.lines[0] ?? "";
    await create(fx.pm, lineInput(fx.cardId, line, 600_000));
    const base = lineInput(fx.cardId, line, 300_000);
    const id = await create(fx.pm, base);
    return { fx, line, base, id };
  }

  it("다른 카드 600,000 · 이 건 300,000 → 400,000으로 → 저장(이 건 제외 남은 실행가 400,000)", async () => {
    const { fx, base, id } = await capFixture();
    await update(fx.pm, await editInput(id, base, 400_000));
    expect((await rowOf(id)).supplyKrw).toBe(400_000);
  });

  it("400,001 → `실행가 초과 · 남은 실행가 400,000 · 다른 줄 고르기`", async () => {
    const { fx, base, id } = await capFixture();
    const error = await caught(update(fx.pm, await editInput(id, base, 400_001)));
    expect((error as Error).message).toBe("실행가 초과 · 남은 실행가 400,000 · 다른 줄 고르기");
  });

  it("같은 줄 `신청됨` 구매 요청(예상 공급가 100,000) → 300,000까지 · 300,001 거부", async () => {
    const { fx, line, base, id } = await capFixture();
    await db
      .insert(purchaseRequests)
      .values({ number: `26001-C${randomUUID().slice(0, 8)}`, linkKind: "quote_line", projectId: fx.projectId, quoteLineId: line, requestedBy: fx.pm.id, itemName: "현수막", estimateAmountKrw: 110_000 });
    const error = await caught(update(fx.pm, await editInput(id, base, 300_001)));
    expect((error as Error).message).toBe("실행가 초과 · 남은 실행가 300,000 · 다른 줄 고르기");
    await update(fx.pm, await editInput(id, base, 300_000));
    expect((await rowOf(id)).supplyKrw).toBe(300_000);
  });

  it("견적 외 비용 줄에 이은 건의 금액 올리기 → 같은 상한으로 막힘", async () => {
    const fx = await setup();
    const id = await create(fx.pm, outOfQuoteInput(fx.cardId, fx.projectId, 200_000));
    const lineId = (await rowOf(id)).quoteLineId ?? "";
    const error = await caught(update(fx.pm, await editInput(id, lineInput(fx.cardId, lineId, 200_000), 200_001)));
    expect((error as Error).message).toBe("실행가 초과 · 남은 실행가 200,000 · 다른 줄 고르기");
  });
});

describe("수정 모드 막힘", () => {
  it("저장된 증빙 종류가 지금 카드 옵션에 없음 → `증빙 종류 {이름} 카드에 없음 · 증빙 종류 고르기`", async () => {
    const fx = await setup();
    const base = lineInput(fx.cardId, fx.lines[0] ?? "", 100_000);
    const id = await create(fx.pm, base);
    await db.update(corpCardUsages).set({ evidenceTypeCode: "other_income" }).where(eq(corpCardUsages.id, id));
    const error = await caught(precheckCardUsageUpdate(fx.pm, { ...(await editInput(id, base, 100_000)), evidenceTypeCode: "other_income" }));
    expect((error as Error).message).toBe("증빙 종류 기타소득 카드에 없음 · 증빙 종류 고르기");
  });

  it("사용일 내일 → 거부(Q6)", async () => {
    const fx = await setup();
    const base = lineInput(fx.cardId, fx.lines[0] ?? "", 100_000);
    const id = await create(fx.pm, base);
    const tomorrow = seoulToday(new Date(Date.now() + 24 * 60 * 60 * 1000));
    await expect(precheckCardUsageUpdate(fx.pm, { ...(await editInput(id, base, 100_000)), usedOn: tomorrow })).rejects.toThrow();
    expect((await rowOf(id)).usedOn).toBe(seoulToday());
  });
});

describe("[M-4] 새 건 기본값 — 대리 등록", () => {
  it("권한자가 직전에 남의 개인 카드 C로 등록 → 기본 카드 = C · 옵션 힌트", async () => {
    const fx = await setup();
    await create(fx.proxy, lineInput(fx.cardId, fx.lines[0] ?? "", 10_000));
    const defaults = await cardUsageFormDefaults(fx.proxy, seoulToday());
    expect(defaults.corpCardId).toBe(fx.cardId);
    const option = (await cardOptionsForUsage(fx.proxy, seoulToday())).find((candidate) => candidate.id === fx.cardId);
    expect(option?.proxyHint).toBe("경영관리 등록 · 카드 소지자 박서연");
  });

  it("C가 비활성 → 카드 비움(옵션 여럿)", async () => {
    const fx = await setup();
    await create(fx.proxy, lineInput(fx.cardId, fx.lines[0] ?? "", 10_000));
    await db.update(corpCards).set({ active: false }).where(eq(corpCards.id, fx.cardId));
    expect((await cardUsageFormDefaults(fx.proxy, seoulToday())).corpCardId).toBeNull();
  });

  it("직전 연결 = 완료 프로젝트 P의 견적 외 비용 · 권한자 → 연결 `견적 외 비용` · P 남음", async () => {
    const fx = await setup();
    await setStatus(fx.projectId, "completed");
    await create(fx.proxy, outOfQuoteInput(fx.cardId, fx.projectId, 10_000));
    const defaults = await cardUsageFormDefaults(fx.proxy, seoulToday());
    expect(defaults.linkKind).toBe("out_of_quote");
    expect(defaults.project?.id).toBe(fx.projectId);
  });

  it("비권한자 · 등록 뒤 P 완료 → 종류만, 프로젝트 빔", async () => {
    const fx = await setup();
    await create(fx.pm, outOfQuoteInput(fx.cardId, fx.projectId, 10_000));
    await setStatus(fx.projectId, "completed");
    const defaults = await cardUsageFormDefaults(fx.pm, seoulToday());
    expect(defaults.linkKind).toBe("out_of_quote");
    expect(defaults.project).toBeNull();
  });
});

// ── Task 3 ──────────────────────────────────────────────────────────────────

async function removal(viewer: Viewer, id: string) {
  const row = await rowOf(id);
  return { input: { id, version: row.version }, pre: await precheckCardUsageRemoval(viewer, { id }) };
}

async function remove(viewer: Viewer, id: string) {
  const { input, pre } = await removal(viewer, id);
  return deleteCardUsage(viewer, input, pre);
}

async function restore(viewer: Viewer, id: string) {
  const { input, pre } = await removal(viewer, id);
  return restoreCardUsage(viewer, input, pre);
}

async function purchaseRow(fx: Fx, lineId: string): Promise<string> {
  const [request] = await db
    .insert(purchaseRequests)
    .values({ number: `26001-C${randomUUID().slice(0, 8)}`, linkKind: "quote_line", projectId: fx.projectId, quoteLineId: lineId, requestedBy: fx.pm.id, itemName: "현수막", estimateAmountKrw: 40_000 })
    .returning({ id: purchaseRequests.id });
  const row = await insertCardUsage(
    fx.pm,
    {
      corpCardId: fx.cardId,
      usedOn: seoulToday(),
      merchantVendorId: null,
      totalCurrency: "KRW",
      totalForeignAmount: null,
      totalFxRate: "1",
      totalAmountKrw: 40_000,
      supplyKrw: 40_000,
      vatKrw: 0,
      evidenceTypeCode: "invoice",
      linkKind: "quote_line",
      quoteLineId: lineId,
      teamId: null,
      usedByUserId: fx.pm.id,
      registeredBy: fx.pm.id,
      registeredVia: "purchase",
      purchaseRequestId: request?.id ?? null,
      memo: null,
    },
    db,
  );
  return row.id;
}

describe("삭제 = 보관(D-609 · ADMN-12)", () => {
  it("권리 없음(남이 등록 · 권한자 아님) → ForbiddenError", async () => {
    const fx = await setup();
    const id = await create(fx.proxy, lineInput(fx.cardId, fx.lines[0] ?? "", 100_000));
    await expect(precheckCardUsageRemoval(fx.pm, { id })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("구매 완료 건 → ForbiddenError(삭제 없음)", async () => {
    const fx = await setup();
    const id = await purchaseRow(fx, fx.lines[0] ?? "");
    await expect(precheckCardUsageRemoval(fx.pm, { id })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(precheckCardUsageRemoval(fx.proxy, { id })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("완료 프로젝트 줄 · 등록자(권한자 아님) → ForbiddenError", async () => {
    const fx = await setup();
    const id = await create(fx.pm, lineInput(fx.cardId, fx.lines[0] ?? "", 100_000));
    await setStatus(fx.projectId, "completed");
    await expect(precheckCardUsageRemoval(fx.pm, { id })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("정상 → 보관(archived_by = 요청자 · 표의 행 수 그대로) · version +1 · 같은 tx document_delete · 목록 · S10 남은 실행가에서 빠짐", async () => {
    const fx = await setup();
    const line = fx.lines[0] ?? "";
    const id = await create(fx.pm, lineInput(fx.cardId, line, 300_000));
    const before = await rowOf(id);
    const result = await remove(fx.proxy, id);
    const after = await rowOf(id);
    expect(after.archivedAt).not.toBeNull();
    expect(after.archivedBy).toBe(fx.proxy.id);
    expect(after.version).toBe(before.version + 1);
    expect(result).toEqual({ version: before.version + 1, totalKrw: 300_000 });
    expect(await usagesOnCard(fx.cardId)).toBe(1);
    expect(await logsOf(fx.proxy.id, "document_delete")).toEqual([id]);
    const month = seoulToday().slice(0, 7);
    expect((await listCardUsages(fx.pm, { month }, seoulToday())).rows.map((row) => row.id)).not.toContain(id);
    expect((await listProjectCardUsages(fx.pm, fx.projectId)).rows).toHaveLength(0);
    const found = await searchLinesForCardLink(fx.pm, { projectId: fx.projectId, query: "" });
    expect(found.rows.find((row) => row.id === line)?.remainingKrw).toBe(1_000_000);
  });

  it("낡은 version → `다른 저장이 먼저 됨 · 새로 고침` · 보관 안 됨", async () => {
    const fx = await setup();
    const base = lineInput(fx.cardId, fx.lines[0] ?? "", 100_000);
    const id = await create(fx.pm, base);
    const { input, pre } = await removal(fx.pm, id);
    await update(fx.pm, await editInput(id, base, 110_000));
    await expect(deleteCardUsage(fx.pm, input, pre)).rejects.toThrow("다른 저장이 먼저 됨 · 새로 고침");
    expect((await rowOf(id)).archivedAt).toBeNull();
  });

  it("(E-9) settling 사전 조회 → 완료로 커밋 → 등록자(권한자 아님) 삭제 → CompletedProjectError · 보관 안 됨 · version 그대로 · 로그 0", async () => {
    const fx = await setup();
    await setStatus(fx.projectId, "settling");
    const id = await create(fx.pm, lineInput(fx.cardId, fx.lines[0] ?? "", 100_000));
    const { input, pre } = await removal(fx.pm, id);
    await setStatus(fx.projectId, "completed");
    await expect(deleteCardUsage(fx.pm, input, pre)).rejects.toBeInstanceOf(CompletedProjectError);
    expect(await rowOf(id)).toMatchObject({ archivedAt: null, version: input.version });
    expect(await logsOf(fx.pm.id, "document_delete")).toEqual([]);
  });

  it("(E-9) 같은 순서 · 권한자 → 보관(U-4)", async () => {
    const fx = await setup();
    await setStatus(fx.projectId, "settling");
    const id = await create(fx.proxy, lineInput(fx.cardId, fx.lines[0] ?? "", 100_000));
    const { input, pre } = await removal(fx.proxy, id);
    await setStatus(fx.projectId, "completed");
    await deleteCardUsage(fx.proxy, input, pre);
    expect((await rowOf(id)).archivedAt).not.toBeNull();
  });
});

describe("되돌리기 = 보관 해제(게이트 재통과 — T-06-192)", () => {
  it("권리 없음 → ForbiddenError · 보관 그대로", async () => {
    const fx = await setup();
    const id = await create(fx.proxy, lineInput(fx.cardId, fx.lines[0] ?? "", 100_000));
    await remove(fx.proxy, id);
    await expect(precheckCardUsageRemoval(fx.pm, { id })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await rowOf(id)).archivedAt).not.toBeNull();
  });

  it("낡은 version → 거부 · 보관 그대로", async () => {
    const fx = await setup();
    const id = await create(fx.pm, { ...lineInput(fx.cardId, "", 100_000), linkKind: "team_cost" });
    const { input, pre } = await removal(fx.pm, id);
    await deleteCardUsage(fx.pm, input, pre);
    await expect(restoreCardUsage(fx.pm, input, pre)).rejects.toThrow("다른 저장이 먼저 됨 · 새로 고침");
    expect((await rowOf(id)).archivedAt).not.toBeNull();
  });

  it("지운 사이 그 줄에 지출결의 → `지출결의 {번호} 연결됨 · 다른 줄 고르기` · 보관 그대로", async () => {
    const fx = await setupExpenseProject();
    const cardId = await makeCard({ kind: "personal", holderUserId: fx.pm.id });
    const id = await create(fx.pm, lineInput(cardId, fx.lines.withVendor, 100_000));
    await remove(fx.pm, id);
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const submitted = await submitReadyDraft(fx.pm, created.created[0]?.expenseId ?? "");
    if (submitted.kind !== "submitted") throw new Error("제출되지 않음");
    const error = await caught(restore(fx.pm, id));
    expect((error as Error).message).toBe(`지출결의 ${submitted.number} 연결됨 · 다른 줄 고르기`);
    expect((await rowOf(id)).archivedAt).not.toBeNull();
  });

  it("지운 사이 다른 카드 사용이 남은 실행가를 먹음 → `실행가 초과 · 남은 실행가 500,000 · 다른 줄 고르기`", async () => {
    const fx = await setup();
    const line = fx.lines[0] ?? "";
    const id = await create(fx.pm, lineInput(fx.cardId, line, 600_000));
    await remove(fx.pm, id);
    await create(fx.pm, lineInput(fx.cardId, line, 500_000));
    const error = await caught(restore(fx.pm, id));
    expect(error).toBeInstanceOf(GateBlockedError);
    expect((error as Error).message).toBe("실행가 초과 · 남은 실행가 500,000 · 다른 줄 고르기");
    expect((await rowOf(id)).archivedAt).not.toBeNull();
  });

  it("지운 사이 `신청됨` 구매 요청(예상 공급가 500,000)이 남은 실행가를 먹음 → 거부", async () => {
    const fx = await setup();
    const line = fx.lines[0] ?? "";
    const id = await create(fx.pm, lineInput(fx.cardId, line, 600_000));
    await remove(fx.pm, id);
    await db
      .insert(purchaseRequests)
      .values({ number: `26001-C${randomUUID().slice(0, 8)}`, linkKind: "quote_line", projectId: fx.projectId, quoteLineId: line, requestedBy: fx.pm.id, itemName: "현수막", estimateAmountKrw: 550_000 });
    expect(((await caught(restore(fx.pm, id))) as Error).message).toBe("실행가 초과 · 남은 실행가 500,000 · 다른 줄 고르기");
  });

  it("팀 비용 건 · 정상 → 보관 칸 비움 + 같은 tx restore 로그 · 목록에 돌아옴", async () => {
    const fx = await setup();
    const id = await create(fx.pm, { ...lineInput(fx.cardId, "", 100_000), linkKind: "team_cost" });
    await remove(fx.pm, id);
    await restore(fx.pm, id);
    expect(await rowOf(id)).toMatchObject({ archivedAt: null, archivedBy: null });
    expect(await logsOf(fx.pm.id, "restore")).toEqual([id]);
    const month = seoulToday().slice(0, 7);
    expect((await listCardUsages(fx.pm, { month }, seoulToday())).rows.map((row) => row.id)).toContain(id);
  });

  it("(X-2) 사전 조회 뒤 프로젝트 완료 · 등록자(권한자 아님) 되돌리기 → CompletedProjectError · 보관 그대로", async () => {
    const fx = await setup();
    await setStatus(fx.projectId, "settling");
    const id = await create(fx.pm, lineInput(fx.cardId, fx.lines[0] ?? "", 100_000));
    await remove(fx.pm, id);
    const { input, pre } = await removal(fx.pm, id);
    await setStatus(fx.projectId, "completed");
    await expect(restoreCardUsage(fx.pm, input, pre)).rejects.toBeInstanceOf(CompletedProjectError);
    expect((await rowOf(id)).archivedAt).not.toBeNull();
  });

  it("(X-1) L1 건 300,000 삭제 → 차수 2(L1 → L2) · L2에 다른 카드 800,000 → L1 건 되돌리기 → `실행가 초과 · 남은 실행가 200,000 · 다른 줄 고르기`", async () => {
    const fx = await setup();
    const l1 = fx.lines[0] ?? "";
    const id = await create(fx.pm, lineInput(fx.cardId, l1, 300_000));
    await remove(fx.pm, id);
    const l2 = await (await nextRevision(fx)).copyOf(l1);
    await create(fx.pm, lineInput(fx.cardId, l2, 800_000));
    expect(((await caught(restore(fx.pm, id))) as Error).message).toBe("실행가 초과 · 남은 실행가 200,000 · 다른 줄 고르기");
  });

  it("(N-1) L1 건 900,000 삭제 → 차수 2 L2 실행가 800,000 → 되돌리기 `실행가 초과 · 남은 실행가 800,000 · 다른 줄 고르기`", async () => {
    const fx = await setup();
    const l1 = fx.lines[0] ?? "";
    const id = await create(fx.pm, lineInput(fx.cardId, l1, 900_000));
    await remove(fx.pm, id);
    const second = await nextRevision(fx);
    await saveExecution(second.revisionId, await second.copyOf(l1), 800_000);
    expect(((await caught(restore(fx.pm, id))) as Error).message).toBe("실행가 초과 · 남은 실행가 800,000 · 다른 줄 고르기");
  });

  it("(N-1) 같은데 L2 실행가 1,200,000 → 되돌리기 통과", async () => {
    const fx = await setup();
    const l1 = fx.lines[0] ?? "";
    const id = await create(fx.pm, lineInput(fx.cardId, l1, 900_000));
    await remove(fx.pm, id);
    const second = await nextRevision(fx);
    await saveExecution(second.revisionId, await second.copyOf(l1), 1_200_000);
    await restore(fx.pm, id);
    expect((await rowOf(id)).archivedAt).toBeNull();
  });

  it("(N-2) 지운 뒤 L2 보관(SQL 직접) → 되돌리기 `견적 줄 빠짐 · 새로 고침` · 보관 그대로", async () => {
    const fx = await setup();
    const l1 = fx.lines[0] ?? "";
    const id = await create(fx.pm, lineInput(fx.cardId, l1, 300_000));
    await remove(fx.pm, id);
    const l2 = await (await nextRevision(fx)).copyOf(l1);
    await db.update(quoteLines).set({ archivedAt: new Date(), archivedBy: fx.pm.id }).where(eq(quoteLines.id, l2));
    const error = await caught(restore(fx.pm, id));
    expect(error).toBeInstanceOf(DroppedQuoteLineError);
    expect((await rowOf(id)).archivedAt).not.toBeNull();
  });
});

describe("목록 rights(O-11)", () => {
  it("구매 완료 건 → 수정만(연결 변경 · 삭제 거짓) · S15 행에도 같은 rights", async () => {
    const fx = await setup();
    const id = await purchaseRow(fx, fx.lines[0] ?? "");
    const month = seoulToday().slice(0, 7);
    const row = (await listCardUsages(fx.pm, { month }, seoulToday())).rows.find((candidate) => candidate.id === id);
    expect(row?.rights).toEqual({ edit: true, changeLink: false, delete: false });
    expect(row?.version).toBe(1);
    const projectRow = (await listProjectCardUsages(fx.pm, fx.projectId)).rows.find((candidate) => candidate.id === id);
    expect(projectRow?.rights).toEqual({ edit: true, changeLink: false, delete: false });
  });

  it("S15 — 남이 등록한 건 · 권한자 아님 → rights 셋 다 거짓", async () => {
    const fx = await setup();
    const id = await create(fx.proxy, lineInput(fx.cardId, fx.lines[0] ?? "", 100_000));
    const projectRow = (await listProjectCardUsages(fx.pm, fx.projectId)).rows.find((candidate) => candidate.id === id);
    expect(projectRow?.rights).toEqual({ edit: false, changeLink: false, delete: false });
  });
});
