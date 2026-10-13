import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { approvalInstances, corpCardUsages, expenseEvidenceReviews, expenses, files, uploadIntents } from "@/db/schema";
import { approveDocument } from "@/domain/approvals";
import { createExpenseFromLines, deleteExpenseDraft, restoreExpenseDraft } from "@/domain/expenses";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createCorpCard } from "@/domain/corp-cards";
import { createOrgUnit, createTeam } from "@/domain/org";
import {
  createCardUsage,
  deleteCardUsage,
  listCardUsages,
  precheckCardUsage,
  precheckCardUsageRemoval,
  precheckCardUsageUpdate,
  restoreCardUsage,
  updateCardUsage,
  type CardUsageInput,
} from "@/domain/corp-card-usages";
import { completeEvidenceUpload, getOwnedEvidence, listEvidence, removeEvidence, requestEvidenceUpload, restoreEvidence } from "@/domain/evidence";
import { duplicateScopeKinds, EVIDENCE_DUPLICATE_HIDDEN, EVIDENCE_DUPLICATE_SAME_OWNER, evidenceDuplicateElsewhere } from "@/domain/evidence/upload-checks";
import { insertFile } from "@/repositories/files";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { seoulToday } from "@/lib/dates";
import { makePerson } from "./approvals-fixtures";
import { createMemoryStorage, type MemoryStorage } from "./fakes/memory-storage";
import { attachEvidence, setupExpenseProject, submitReadyDraft } from "./fixtures/expenses";

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

// ---- Task 3 · 규칙 마감 ----

async function archive(viewer: Viewer, id: string) {
  const row = await usageRow(id);
  return deleteCardUsage(viewer, { id, version: row.version }, await precheckCardUsageRemoval(viewer, { id }));
}

async function restoreUsage(viewer: Viewer, id: string) {
  const row = await usageRow(id);
  return restoreCardUsage(viewer, { id, version: row.version }, await precheckCardUsageRemoval(viewer, { id }));
}

// 다른 주인의 살아 있는 파일을 도메인을 거치지 않고 심는다(주인 id는 실제 행이 아니어도 된다).
function plant(viewer: Viewer, ownerKind: string, sha256: string, ownerId: string = randomUUID()) {
  return db.transaction((tx) =>
    insertFile(viewer, { id: randomUUID(), ownerKind, ownerId, objectKey: `evidence/${randomUUID()}`, sha256, sizeBytes: 1000, contentType: "image/png", originalName: "x.png", uploadedBy: viewer.id }, tx),
  );
}

async function aliveRows(ownerKind: string, ownerId: string) {
  return db.select().from(files).where(and(eq(files.ownerKind, ownerKind), eq(files.ownerId, ownerId), isNull(files.removedAt), isNull(files.voidedAt)));
}

async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error("거부되지 않았다");
}

async function secondUsage(fx: Fx): Promise<string> {
  const input = usageInput(fx.cardId, "둘째");
  return (await createCardUsage(fx.staff, input, await precheckCardUsage(fx.staff, input))).id;
}

describe("카드 전표 중복 — 지출결의와 한 종류", () => {
  it("duplicateScopeKinds — 지출결의 ↔ 카드 전표는 한 묶음, 차수 승인 · 리저브 줄은 자기 종류만", () => {
    expect([...duplicateScopeKinds("expense")].sort()).toEqual(["corp_card_usage", "expense"]);
    expect([...duplicateScopeKinds("corp_card_usage")].sort()).toEqual(["corp_card_usage", "expense"]);
    expect(duplicateScopeKinds("quote_revision")).toEqual(["quote_revision"]);
    expect(duplicateScopeKinds("reserve_entry")).toEqual(["reserve_entry"]);
  });

  it("지출결의 증빙과 같은 파일 — 그 지출결의를 읽을 수 있으면 번호가 응답에 있고, 읽을 수 없으면 번호 문자열이 없다", async () => {
    const fx = await setupUsage();
    const ex = await setupExpenseProject();
    const draft = (await createExpenseFromLines(ex.pm, { lineIds: [ex.lines.withVendor] })).created[0]?.expenseId ?? "";
    const shared = sha();
    await attachEvidence(ex.pm, draft, createMemoryStorage(), { sha256: shared });
    const submitted = await submitReadyDraft(ex.pm, draft);
    if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
    const [expense] = await db.select({ number: expenses.number }).from(expenses).where(eq(expenses.id, draft));
    const number = expense?.number ?? "";
    expect(number).not.toBe("");

    // 지출결의 기안자가 자기 개인 카드 사용에 같은 파일 → 번호 있는 문구
    const ownCard = await makeCard({ kind: "personal", holderUserId: ex.pm.id });
    const ownInput = usageInput(ownCard);
    const own = await createCardUsage(ex.pm, ownInput, await precheckCardUsage(ex.pm, ownInput));
    const withNumber = await rejection(requestEvidenceUpload(ex.pm, { ownerKind: KIND, ownerId: own.id, ...declare({ sha256: shared }) }));
    expect(withNumber.message).toBe(evidenceDuplicateElsewhere(number));

    // 그 지출결의를 읽을 수 없는 카드 등록자 → 번호 없는 문구
    const hidden = await rejection(requestEvidenceUpload(fx.staff, { ownerKind: KIND, ownerId: fx.usageId, ...declare({ sha256: shared }) }));
    expect(hidden.message).toBe(EVIDENCE_DUPLICATE_HIDDEN);
    expect(hidden.message).not.toContain(number);
  });

  it("카드 전표와 같은 파일 — 지출결의 증빙 업로드는 번호 없는 문구로 막힌다", async () => {
    const fx = await setupUsage();
    const ex = await setupExpenseProject();
    const draft = (await createExpenseFromLines(ex.pm, { lineIds: [ex.lines.withVendor] })).created[0]?.expenseId ?? "";
    const shared = sha();
    await upload(fx.staff, fx.usageId, createMemoryStorage(), { sha256: shared });

    const error = await rejection(attachEvidence(ex.pm, draft, createMemoryStorage(), { sha256: shared }));

    expect(error.message).toBe(EVIDENCE_DUPLICATE_HIDDEN);
  });

  it("다른 카드 사용 전표와 같은 파일은 번호 없는 문구, 같은 카드 사용이면 같은 주인 문구", async () => {
    const fx = await setupUsage();
    const other = await secondUsage(fx);
    const shared = sha();
    await upload(fx.staff, fx.usageId, createMemoryStorage(), { sha256: shared });

    expect((await rejection(requestEvidenceUpload(fx.staff, { ownerKind: KIND, ownerId: other, ...declare({ sha256: shared }) }))).message).toBe(EVIDENCE_DUPLICATE_HIDDEN);
    expect((await rejection(requestEvidenceUpload(fx.staff, { ownerKind: KIND, ownerId: fx.usageId, ...declare({ sha256: shared }) }))).message).toBe(EVIDENCE_DUPLICATE_SAME_OWNER);
  });

  it("차수 승인 · 리저브 줄 증빙에만 있는 같은 파일은 카드 전표 업로드가 통과한다", async () => {
    const fx = await setupUsage();
    const shared = sha();
    await plant(fx.staff, "quote_revision", shared);
    await plant(fx.staff, "reserve_entry", shared);

    const file = await upload(fx.staff, fx.usageId, createMemoryStorage(), { sha256: shared });

    expect(file.ownerId).toBe(fx.usageId);
  });
});

describe("보관 · 되돌리기", () => {
  it("보관한 A와 같은 파일로 새 카드 사용 B에 업로드가 통과한다 · 보관된 A에 직접 업로드 · 삭제는 거부", async () => {
    const fx = await setupUsage();
    const b = await secondUsage(fx);
    const shared = sha();
    const onA = await upload(fx.staff, fx.usageId, createMemoryStorage(), { sha256: shared });
    await archive(fx.staff, fx.usageId);

    const onB = await upload(fx.staff, b, createMemoryStorage(), { sha256: shared });

    expect(onB.ownerId).toBe(b);
    await expect(requestEvidenceUpload(fx.staff, { ownerKind: KIND, ownerId: fx.usageId, ...declare() })).rejects.toThrow("카드 사용 수정 권리 없음");
    await expect(removeEvidence(fx.staff, { fileId: onA.id })).rejects.toThrow("카드 사용 수정 권리 없음");
    expect(await aliveRows(KIND, fx.usageId)).toHaveLength(1);
  });

  it("[T-06-201] 겹친 채 A를 되돌리면 거부되고 A는 보관된 채 · B의 전표는 그대로, 겹침이 없으면 되돌아가며 hasCardSlip 참", async () => {
    const fx = await setupUsage();
    const b = await secondUsage(fx);
    const shared = sha();
    await upload(fx.staff, fx.usageId, createMemoryStorage(), { sha256: shared });
    await archive(fx.staff, fx.usageId);
    await upload(fx.staff, b, createMemoryStorage(), { sha256: shared });

    const refused = await rejection(restoreUsage(fx.staff, fx.usageId));

    expect(refused.message).toBe(EVIDENCE_DUPLICATE_HIDDEN);
    expect((await usageRow(fx.usageId)).archivedAt).not.toBeNull();
    expect(await aliveRows(KIND, b)).toHaveLength(1);

    // 겹침을 없애면(B의 전표를 떼면) 되돌리기가 통과한다.
    const bFile = (await aliveRows(KIND, b))[0];
    await removeEvidence(fx.staff, { fileId: bFile?.id ?? "" });
    await restoreUsage(fx.staff, fx.usageId);
    expect((await usageRow(fx.usageId)).archivedAt).toBeNull();
    expect(await aliveRows(KIND, fx.usageId)).toHaveLength(1);
    expect((await listRow(fx.staff, fx.usageId))?.hasCardSlip).toBe(true);
  });

  it("[E-46] 보관 뒤 완료 재시도 = 같은 파일 · 새 행 0", async () => {
    const fx = await setupUsage();
    const storage = createMemoryStorage();
    const declared = { size: 180_000, contentType: "image/png", sha256: sha(), name: "전표.png" };
    const intent = await requestEvidenceUpload(fx.staff, { ownerKind: KIND, ownerId: fx.usageId, ...declared }, { storage });
    storage.put(intent.url, { size: declared.size, contentType: declared.contentType, sha256: declared.sha256 });
    const first = await completeEvidenceUpload(fx.staff, { intentId: intent.intentId }, { storage });
    await archive(fx.staff, fx.usageId);
    const before = (await db.select().from(files).where(eq(files.ownerId, fx.usageId))).length;

    const retried = await completeEvidenceUpload(fx.staff, { intentId: intent.intentId }, { storage });

    expect(retried.id).toBe(first.id);
    expect((await db.select().from(files).where(eq(files.ownerId, fx.usageId))).length).toBe(before);

    // S8 범위 밖 계정이 남의 완료된 의도 id로 부르면 DTO 없음(의도의 만든 사람이 아님)
    await expect(completeEvidenceUpload(fx.stranger, { intentId: intent.intentId }, { storage })).rejects.toThrow();
  });

  it("[drift ⑸] 초안 되돌리기 — 카드 전표에 붙은 같은 영수증은 되살리지 않는다", async () => {
    const fx = await setupUsage();
    const ex = await setupExpenseProject();
    const draft = (await createExpenseFromLines(ex.pm, { lineIds: [ex.lines.withVendor] })).created[0]?.expenseId ?? "";
    const takenSha = sha();
    await attachEvidence(ex.pm, draft, createMemoryStorage(), { sha256: takenSha });
    const [draftRow] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, draft));
    await deleteExpenseDraft(ex.pm, { expenseId: draft, expectedVersion: draftRow?.version ?? 1 });
    // 초안 파일은 지운 상태 — 같은 영수증을 카드 사용 패널 경로로 올리면 통과한다.
    await upload(fx.staff, fx.usageId, createMemoryStorage(), { sha256: takenSha });

    await restoreExpenseDraft(ex.pm, { expenseId: draft });

    expect(await aliveRows("expense", draft)).toHaveLength(0);
    expect(await aliveRows(KIND, fx.usageId)).toHaveLength(1);
  });

  it("[drift ⑸] 같은 순서라도 카드 사용을 보관했으면 초안 되돌리기가 영수증을 되살린다(보관 건은 묶음에서 빠진다)", async () => {
    const fx = await setupUsage();
    const ex = await setupExpenseProject();
    const draft = (await createExpenseFromLines(ex.pm, { lineIds: [ex.lines.withVendor] })).created[0]?.expenseId ?? "";
    const takenSha = sha();
    await attachEvidence(ex.pm, draft, createMemoryStorage(), { sha256: takenSha });
    const [draftRow] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, draft));
    await deleteExpenseDraft(ex.pm, { expenseId: draft, expectedVersion: draftRow?.version ?? 1 });
    await upload(fx.staff, fx.usageId, createMemoryStorage(), { sha256: takenSha });
    await archive(fx.staff, fx.usageId);

    await restoreExpenseDraft(ex.pm, { expenseId: draft });

    expect(await aliveRows("expense", draft)).toHaveLength(1);
  });

  it("보관된 건의 전표를 읽을 수는 있다 — 범위 안 직원의 파일 목록 · 범위 밖은 빈 값", async () => {
    const fx = await setupUsage();
    await upload(fx.staff, fx.usageId);
    // 목록 행에는 파일 목록 키가 없고 불리언 하나만 있다.
    expect(await usageListKeys(fx.staff)).not.toContain("files");
    expect(await usageListKeys(fx.staff)).toContain("hasCardSlip");
    await archive(fx.staff, fx.usageId);

    const mate = await getOwnedEvidence(fx.mate, { ownerKind: KIND, ownerId: fx.usageId });
    expect(mate.files).toHaveLength(1);
    expect(mate.actions.canAdd).toBe(false);
    const outsider = await getOwnedEvidence(fx.stranger, { ownerKind: KIND, ownerId: fx.usageId });
    expect(outsider.files).toEqual([]);
  });
});

async function usageListKeys(viewer: Viewer): Promise<string[]> {
  const list = await listCardUsages(viewer, { month: seoulToday().slice(0, 7) }, seoulToday());
  return Object.keys(list.rows[0] ?? {});
}

describe("카드 전표는 값을 바꾸지 않는다", () => {
  it("전표를 붙인 뒤 첨부 전에 받은 version으로 같은 패널을 저장해도 성공한다", async () => {
    const fx = await setupUsage();
    const before = await usageRow(fx.usageId);
    await upload(fx.staff, fx.usageId);

    const input = { ...usageInput(fx.cardId, "수정 메모"), id: fx.usageId, version: before.version };
    await updateCardUsage(fx.staff, input, await precheckCardUsageUpdate(fx.staff, input));

    const after = await usageRow(fx.usageId);
    expect(after.version).toBe(before.version + 1);
    expect(after.memo).toBe("수정 메모");
  });

  it("[X-2] 결재 통과 · 결재 중 지출결의를 둔 채 카드 전표 첨부 · 삭제 · 되돌리기 — 지출결의 · 인스턴스 version · 확인 기록 수 그대로", async () => {
    const fx = await setupUsage();
    const ex = await setupExpenseProject();
    const ex2 = await setupExpenseProject();
    const approvedId = (await createExpenseFromLines(ex.pm, { lineIds: [ex.lines.withVendor] })).created[0]?.expenseId ?? "";
    const approvedSubmit = await submitReadyDraft(ex.pm, approvedId);
    if (approvedSubmit.kind !== "submitted") throw new Error("제출 안 됨");
    const step = await approveDocument(ex.lead, { instanceId: approvedSubmit.instanceId, expectedVersion: 1 });
    await approveDocument(ex.ceo, { instanceId: approvedSubmit.instanceId, expectedVersion: step.version });
    const inReviewId = (await createExpenseFromLines(ex2.pm, { lineIds: [ex2.lines.withVendor] })).created[0]?.expenseId ?? "";
    const inReviewSubmit = await submitReadyDraft(ex2.pm, inReviewId);
    if (inReviewSubmit.kind !== "submitted") throw new Error("제출 안 됨");

    const snapshot = async () => {
      const out: Record<string, unknown> = {};
      for (const [name, id, instanceId] of [["approved", approvedId, approvedSubmit.instanceId], ["inReview", inReviewId, inReviewSubmit.instanceId]] as const) {
        const [expense] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, id));
        const [instance] = await db.select({ version: approvalInstances.version }).from(approvalInstances).where(eq(approvalInstances.id, instanceId));
        const reviews = await db.select({ id: expenseEvidenceReviews.id }).from(expenseEvidenceReviews).where(eq(expenseEvidenceReviews.expenseId, id));
        out[name] = { expense: expense?.version, instance: instance?.version, reviews: reviews.length };
      }
      return out;
    };
    const before = await snapshot();

    const file = await upload(fx.staff, fx.usageId);
    await removeEvidence(fx.staff, { fileId: file.id });
    await restoreEvidence(fx.staff, { fileId: file.id });
    await upload(fx.staff, fx.usageId);
    await archive(fx.staff, fx.usageId);
    await restoreUsage(fx.staff, fx.usageId);

    expect(await snapshot()).toEqual(before);
  });
});
