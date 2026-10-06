import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { ForbiddenError } from "@/domain/permissions/can";
import { createCorpCard } from "@/domain/corp-cards";
import { createOrgUnit, createTeam } from "@/domain/org";
import { cardOptionsForUsage, precheckCardUsage, type CardUsageInput } from "@/domain/corp-card-usages";
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
