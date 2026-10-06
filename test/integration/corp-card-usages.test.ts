import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { ForbiddenError } from "@/domain/permissions/can";
import { createCorpCard } from "@/domain/corp-cards";
import { createOrgUnit, createTeam } from "@/domain/org";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { corpCardUsages } from "@/db/schema";
import { cardOptionsForUsage, CardUsageRejectedError, createCardUsage, precheckCardUsage, type CardUsageInput } from "@/domain/corp-card-usages";
import { insertRole } from "@/repositories/roles";
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
