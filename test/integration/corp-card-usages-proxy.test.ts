import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { ForbiddenError } from "@/domain/permissions/can";
import { createCorpCard } from "@/domain/corp-cards";
import { createOrgUnit, createTeam } from "@/domain/org";
import { db } from "@/db/client";
import { actionLog, corpCardUsages, quoteLines } from "@/db/schema";
import { GateBlockedError } from "@/domain/rules/gate";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { createRevisionFromCurrent } from "@/domain/quotes/revisions";
import { DroppedQuoteLineError } from "@/domain/corp-card-usages/link-targets";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import {
  cardOptionsForUsage,
  createCardUsage,
  listCardUsages,
  loadCardUsageForEdit,
  precheckCardUsage,
  precheckCardUsageUpdate,
  updateCardUsage,
  type CardUsageInput,
  type CardUsageUpdateInput,
} from "@/domain/corp-card-usages";
import { insertRole } from "@/repositories/roles";
import { insertVendor } from "@/repositories/vendors";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { seoulToday } from "@/lib/dates";
import { makePerson } from "./approvals-fixtures";

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

