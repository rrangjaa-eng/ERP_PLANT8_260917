import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { corpCardUsages, uploadIntents } from "@/db/schema";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createCorpCard } from "@/domain/corp-cards";
import { createOrgUnit, createTeam } from "@/domain/org";
import {
  createCardUsage,
  listCardUsages,
  precheckCardUsage,
  type CardUsageInput,
} from "@/domain/corp-card-usages";
import { completeEvidenceUpload, getOwnedEvidence, listEvidence, removeEvidence, requestEvidenceUpload } from "@/domain/evidence";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { seoulToday } from "@/lib/dates";
import { makePerson } from "./approvals-fixtures";
import { createMemoryStorage, type MemoryStorage } from "./fakes/memory-storage";

// 06-25(EVID-01 카드 몫 · C4 · C5): 카드 전표 — 05 domain/evidence 주인 표의 `corp_card_usage` 줄.
// 권리는 06-09 cardUsageRights(등록한 사람 · 대리 등록 권한자) + 보관 아님, 읽기는 S8 목록 범위(보관 무관 — E-46).

const KIND = "corp_card_usage";

function sha(): string {
  return randomBytes(32).toString("hex");
}

function uniqueLast4(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function makeTeam(): Promise<{ id: string; name: string }> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `전표본부-${randomUUID()}` });
  const name = `전표팀-${randomUUID()}`;
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name });
  return { id: team.id, name };
}

async function makeCard(input: { kind: "personal" | "team" | "shared"; holderUserId?: string; teamId?: string }): Promise<string> {
  const card = await createCorpCard(SYSTEM_VIEWER, { issuer: `카드사-${randomUUID().slice(0, 6)}`, numberLast4: uniqueLast4(), label: `${input.kind} 카드`, ...input });
  if (!card.id) throw new Error("카드 id 없음");
  return card.id;
}

// 대리 등록 권한자(cards.proxy write) — 팀 업무 범위지만 목록 범위는 cards.proxy로 전부.
async function makeProxy(teamName: string): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `전표대리-${randomUUID().slice(0, 8)}`, workScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "cards.proxy", action: "write", allowed: true });
  for (const infoItem of ["team.value", "card_usage.value", "card_usage.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  return makePerson("경영관리", role.id, teamName);
}

function usageInput(corpCardId: string, memo: string | null = null): CardUsageInput {
  return {
    corpCardId,
    usedOn: seoulToday(),
    merchantVendorId: null,
    total: { currency: "KRW", amount: 33_000, fxRate: 1 },
    evidenceTypeCode: "card_receipt",
    linkKind: "team_cost",
    memo,
  };
}

type Fx = { team: { id: string; name: string }; staff: Viewer; mate: Viewer; stranger: Viewer; proxy: Viewer; cardId: string; usageId: string };

// 직원(등록한 사람) · 같은 팀 다른 직원 · 다른 팀 직원 · 대리 등록 권한자 + 팀 카드 위의 카드 사용 한 건.
async function setupUsage(): Promise<Fx> {
  const team = await makeTeam();
  const otherTeam = await makeTeam();
  const staff = await makePerson("직원", DEFAULT_ROLE_ID, team.name);
  const mate = await makePerson("동료", DEFAULT_ROLE_ID, team.name);
  const stranger = await makePerson("타팀", DEFAULT_ROLE_ID, otherTeam.name);
  const proxy = await makeProxy(team.name);
  const cardId = await makeCard({ kind: "team", teamId: team.id });
  const input = usageInput(cardId);
  const created = await createCardUsage(staff, input, await precheckCardUsage(staff, input));
  return { team, staff, mate, stranger, proxy, cardId, usageId: created.id };
}

async function upload(viewer: Viewer, ownerId: string, storage: MemoryStorage = createMemoryStorage(), file: { sha256?: string; name?: string } = {}) {
  const declared = { size: 180_000, contentType: "image/png", sha256: file.sha256 ?? sha(), name: file.name ?? "카드 전표.png" };
  const intent = await requestEvidenceUpload(viewer, { ownerKind: KIND, ownerId, ...declared }, { storage });
  storage.put(intent.url, { size: declared.size, contentType: declared.contentType, sha256: declared.sha256 });
  return completeEvidenceUpload(viewer, { intentId: intent.intentId }, { storage });
}

function declare(file: { sha256?: string } = {}) {
  return { size: 10, contentType: "image/png", sha256: file.sha256 ?? sha(), name: "전표.png" };
}

async function usageRow(id: string) {
  const [row] = await db.select().from(corpCardUsages).where(eq(corpCardUsages.id, id));
  if (!row) throw new Error("카드 사용 없음");
  return row;
}

async function listRow(viewer: Viewer, id: string) {
  const list = await listCardUsages(viewer, { month: seoulToday().slice(0, 7) }, seoulToday());
  return list.rows.find((row) => row.id === id);
}

describe("카드 전표 주인 권리", () => {
  it("등록한 직원이 전표를 붙이면 listEvidence 1 · 목록 hasCardSlip이 거짓에서 참이 된다", async () => {
    const fx = await setupUsage();
    expect((await listRow(fx.staff, fx.usageId))?.hasCardSlip).toBe(false);

    const file = await upload(fx.staff, fx.usageId);

    const listed = await listEvidence(fx.staff, { ownerKind: KIND, ownerId: fx.usageId });
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ id: file.id, originalName: "카드 전표.png", ownerKind: KIND, ownerId: fx.usageId });
    expect((await listRow(fx.staff, fx.usageId))?.hasCardSlip).toBe(true);
  });

  it("전표를 붙이고 떼도 결제 합계 · 공급가 · 부가세 · 연결 · version이 그대로다", async () => {
    const fx = await setupUsage();
    const before = await usageRow(fx.usageId);

    const file = await upload(fx.staff, fx.usageId);
    await removeEvidence(fx.staff, { fileId: file.id });
    await upload(fx.staff, fx.usageId);

    const after = await usageRow(fx.usageId);
    expect(after.version).toBe(before.version);
    expect(after.updatedAt).toEqual(before.updatedAt);
    for (const key of ["totalAmountKrw", "supplyKrw", "vatKrw", "linkKind", "quoteLineId", "teamId", "memo"] as const) expect(after[key]).toEqual(before[key]);
  });

  it("권리 여섯 갈래 — 등록한 사람 · 대리 등록 권한자는 쓰기, 같은 팀 다른 직원은 읽기만, 범위 밖은 없는 건", async () => {
    const fx = await setupUsage();

    expect((await getOwnedEvidence(fx.staff, { ownerKind: KIND, ownerId: fx.usageId })).actions.canAdd).toBe(true);
    expect((await getOwnedEvidence(fx.proxy, { ownerKind: KIND, ownerId: fx.usageId })).actions.canAdd).toBe(true);
    const mate = await getOwnedEvidence(fx.mate, { ownerKind: KIND, ownerId: fx.usageId });
    expect(mate.actions.canAdd).toBe(false);
    expect(mate.maxMb).toBeGreaterThan(0);

    // 같은 팀 카드의 다른 직원 — 읽을 수는 있고(S8 범위) 쓸 수는 없다. 서버 액션을 직접 불러도 거부.
    await expect(requestEvidenceUpload(fx.mate, { ownerKind: KIND, ownerId: fx.usageId, ...declare() })).rejects.toThrow("카드 사용 수정 권리 없음");
    // 범위 밖 — 없는 건과 같은 거부, 파일 목록 · 응답에 아무것도 싣지 않는다.
    await upload(fx.staff, fx.usageId);
    const outsider = await getOwnedEvidence(fx.stranger, { ownerKind: KIND, ownerId: fx.usageId });
    expect(outsider.files).toEqual([]);
    expect(outsider.actions.canAdd).toBe(false);
    expect(await listEvidence(fx.stranger, { ownerKind: KIND, ownerId: fx.usageId })).toEqual([]);
    await expect(requestEvidenceUpload(fx.stranger, { ownerKind: KIND, ownerId: fx.usageId, ...declare() })).rejects.toThrow("다른 저장이 먼저 됨 · 새로 고침");
  });
});

describe("첫 저장 — 주인 없는 업로드 없음", () => {
  it("없는 카드 사용 번호로 올리기 요청하면 거부되고 올리기 의도 행이 하나도 생기지 않는다", async () => {
    const fx = await setupUsage();
    const before = await db.select().from(uploadIntents).where(eq(uploadIntents.createdBy, fx.staff.id));

    await expect(requestEvidenceUpload(fx.staff, { ownerKind: KIND, ownerId: randomUUID(), ...declare() })).rejects.toThrow("다른 저장이 먼저 됨 · 새로 고침");

    const after = await db.select().from(uploadIntents).where(eq(uploadIntents.createdBy, fx.staff.id));
    expect(after).toHaveLength(before.length);
  });
});
