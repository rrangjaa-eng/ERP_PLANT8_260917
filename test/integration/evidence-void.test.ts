import { describe, expect, it } from "vitest";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, files, permissionMatrix } from "@/db/schema";
import { approveDocument, REJECT_REASON_EMPTY_MESSAGE, RejectReasonError } from "@/domain/approvals";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { EVIDENCE_VOID_ONLY_APPROVED, getEvidenceActions, listEvidence, removeEvidence, voidEvidence } from "@/domain/evidence";
import { listEvidenceVoidSignals } from "@/domain/evidence/signals";
import { ForbiddenError } from "@/domain/permissions/can";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, DIVISION_HEAD_ROLE_ID, SYSADMIN_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { countActiveByOwner } from "@/repositories/files";
import { createMemoryStorage } from "./fakes/memory-storage";
import { attachEvidence, makeEvidenceManager, setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "./fixtures/expenses";

// 05-09 Task 3 ②③ — 승인 뒤 증빙 무효 처리(사용자 결정 2026-09-26 PR #89 · G2 마지막 파일 · G3 해제 없음 · D9 동시 처리 문구)와
// 무효 뒤 기안자 신호의 원천(G1). 테스트 계급 「경영관리」는 픽스처가 도메인 · 리포지토리 함수로 만든다(SQL 직접 삽입 없음).

async function submittedDoc(fx: ExpenseFixture, extraFiles = 0) {
  const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
  const expenseId = created.created[0]?.expenseId ?? "";
  for (let i = 0; i < extraFiles; i++) await attachEvidence(fx.pm, expenseId);
  const submitted = await submitReadyDraft(fx.pm, expenseId);
  if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
  return { expenseId, instanceId: submitted.instanceId };
}

// 팀장 → (2 · 3단 빈 자리 건너뜀) → 대표 승인 = 최종 승인. 살아 있는 증빙 = 1 + extraFiles.
async function approvedDoc(fx: ExpenseFixture, extraFiles = 0) {
  const doc = await submittedDoc(fx, extraFiles);
  const first = await approveDocument(fx.lead, { instanceId: doc.instanceId, expectedVersion: 1 });
  await approveDocument(fx.ceo, { instanceId: doc.instanceId, expectedVersion: first.version });
  return doc;
}

async function fileRows(expenseId: string) {
  return db.select().from(files).where(and(eq(files.ownerKind, "expense"), eq(files.ownerId, expenseId))).orderBy(asc(files.createdAt), asc(files.id));
}

async function firstFile(expenseId: string) {
  const [row] = await fileRows(expenseId);
  if (!row) throw new Error("파일 없음");
  return row;
}

async function caught(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error("거부되지 않았다");
}

describe("승인 뒤 증빙 무효 처리", () => {
  it("권한자가 승인 문서의 파일을 무효 처리 — 행 · 객체 그대로 · 무효 세 칸 · 로그(사유 길이만) · 살아 있는 수에서 빠짐 · 목록에 voidedAt · 처리자", async () => {
    const fx = await setupExpenseProject();
    const manager = await makeEvidenceManager();
    const { expenseId } = await approvedDoc(fx, 1);
    const target = await firstFile(expenseId);

    await voidEvidence(manager, { fileId: target.id, reason: "다른 건 영수증" });

    const rows = await fileRows(expenseId);
    expect(rows).toHaveLength(2);
    const voided = rows.find((row) => row.id === target.id);
    expect(voided).toMatchObject({ objectKey: target.objectKey, removedAt: null, voidedBy: manager.id, voidReason: "다른 건 영수증" });
    expect(voided?.voidedAt).toBeInstanceOf(Date);
    expect(await countActiveByOwner(manager, "expense", expenseId)).toBe(1);

    const logs = await db.select().from(actionLog).where(eq(actionLog.documentId, expenseId));
    const voidLogs = logs.filter((log) => log.actionType === "document_update" && (log.detail as { change?: string }).change === "evidence_void");
    expect(voidLogs).toHaveLength(1);
    expect(voidLogs[0]).toMatchObject({ actorId: manager.id });
    expect(voidLogs[0]?.detail).toEqual({ change: "evidence_void", fileId: target.id, reasonLength: 7 });
    expect(JSON.stringify(voidLogs[0]?.detail)).not.toContain("다른 건");

    const listed = await listEvidence(fx.pm, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: expenseId });
    const listedVoid = listed.find((file) => file.id === target.id);
    expect(listedVoid?.voidedAt).toBeInstanceOf(Date);
    expect(listedVoid).toMatchObject({ voidReason: "다른 건 영수증", voidedByName: "경영지원" });
  });

  it("권한 없는 사람(기안자 · 팀장 · 대표)은 거부 · 행 불변", async () => {
    const fx = await setupExpenseProject();
    const { expenseId } = await approvedDoc(fx);
    const target = await firstFile(expenseId);
    for (const viewer of [fx.pm, fx.lead, fx.ceo]) {
      expect(await caught(voidEvidence(viewer, { fileId: target.id, reason: "다른 건" }))).toBeInstanceOf(ForbiddenError);
    }
    expect((await firstFile(expenseId)).voidedAt).toBeNull();
  });

  it("사유 빈 칸 · 공백만은 04.1 반려 사유 검증과 같은 오류 · 행 불변", async () => {
    const fx = await setupExpenseProject();
    const manager = await makeEvidenceManager();
    const { expenseId } = await approvedDoc(fx);
    const target = await firstFile(expenseId);
    for (const reason of ["", "   "]) {
      const error = await caught(voidEvidence(manager, { fileId: target.id, reason }));
      expect(error).toBeInstanceOf(RejectReasonError);
      expect(error.message).toBe(REJECT_REASON_EMPTY_MESSAGE);
    }
    expect((await firstFile(expenseId)).voidedAt).toBeNull();
  });

  it("이미 무효인 파일은 `{처리자}이/가 HH:MM에 무효 처리함 · 새로 고침`으로 거부 · 행 불변", async () => {
    const fx = await setupExpenseProject();
    const manager = await makeEvidenceManager();
    const other = await makeEvidenceManager("경영나래");
    const { expenseId } = await approvedDoc(fx, 1);
    const target = await firstFile(expenseId);
    await voidEvidence(manager, { fileId: target.id, reason: "다른 건 영수증" });
    const before = await firstFile(expenseId);

    const error = await caught(voidEvidence(other, { fileId: target.id, reason: "중복" }));
    expect(error.message).toMatch(/^경영지원(이|가) \d{2}:\d{2}에 무효 처리함 · 새로 고침$/);
    expect(error.message.startsWith("경영지원이 ")).toBe(true);
    expect(await firstFile(expenseId)).toEqual(before);
  });

  it("결재 중 문서의 파일은 무효 처리하지 못한다 · 승인 문서의 파일도 권한자가 지우지 못한다", async () => {
    const fx = await setupExpenseProject();
    const manager = await makeEvidenceManager();
    const pending = await submittedDoc(fx);
    const pendingFile = await firstFile(pending.expenseId);
    const error = await caught(voidEvidence(manager, { fileId: pendingFile.id, reason: "다른 건" }));
    expect(error.message).toBe(EVIDENCE_VOID_ONLY_APPROVED);
    expect((await firstFile(pending.expenseId)).voidedAt).toBeNull();

    const approved = await approvedDoc(await setupExpenseProject());
    const approvedFile = await firstFile(approved.expenseId);
    await expect(removeEvidence(manager, { fileId: approvedFile.id })).rejects.toThrow();
    expect((await firstFile(approved.expenseId)).removedAt).toBeNull();
  });

  it("(G2) 살아 있는 증빙이 1개뿐이어도 무효 처리된다 — 살아 있는 0 · 행 그대로 · 로그 1건", async () => {
    const fx = await setupExpenseProject();
    const manager = await makeEvidenceManager();
    const { expenseId } = await approvedDoc(fx);
    const target = await firstFile(expenseId);
    await voidEvidence(manager, { fileId: target.id, reason: "다른 건 영수증" });
    expect(await countActiveByOwner(manager, "expense", expenseId)).toBe(0);
    expect(await fileRows(expenseId)).toHaveLength(1);
    const logs = await db.select().from(actionLog).where(eq(actionLog.documentId, expenseId));
    expect(logs.filter((log) => (log.detail as { change?: string }).change === "evidence_void")).toHaveLength(1);
  });

  it("(G3) 무효 뒤 같은 sha256 파일을 기안자가 다시 올린다 — 중복 거부 없이 새 행 · 옛 무효 행 그대로", async () => {
    const fx = await setupExpenseProject();
    const manager = await makeEvidenceManager();
    const { expenseId } = await approvedDoc(fx);
    const target = await firstFile(expenseId);
    await voidEvidence(manager, { fileId: target.id, reason: "잘못 무효" });

    const again = await attachEvidence(fx.pm, expenseId, createMemoryStorage(), { sha256: target.sha256 });
    const rows = await fileRows(expenseId);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === again.id)).toMatchObject({ sha256: target.sha256, voidedAt: null, removedAt: null });
    expect(rows.find((row) => row.id === target.id)?.voidedAt).toBeInstanceOf(Date);
  });

  it("문서 DTO evidenceActions — 승인 문서: 권한자 = 살아 있는 파일마다 무효 처리 · 삭제 0, 기안자 = 하나 더 · 삭제 0 · 무효 0", async () => {
    const fx = await setupExpenseProject();
    const manager = await makeEvidenceManager();
    const { expenseId } = await approvedDoc(fx, 1);
    const [a, b] = await fileRows(expenseId);
    await voidEvidence(manager, { fileId: a?.id ?? "", reason: "다른 건" });

    expect(await getEvidenceActions(manager, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: expenseId })).toEqual({
      canAdd: false,
      deletableFileIds: [],
      voidableFileIds: [b?.id],
      drafterLocked: false,
    });
    expect(await getEvidenceActions(fx.pm, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: expenseId })).toEqual({
      canAdd: true,
      deletableFileIds: [],
      voidableFileIds: [],
      drafterLocked: false,
    });
  });

  it("시드 직후 expenses.evidence_void · expenses.evidence_attach를 가진 시드 계급은 시스템 관리자 하나다", async () => {
    const seedRoles = [SYSADMIN_ROLE_ID, CEO_ROLE_ID, DIVISION_HEAD_ROLE_ID, TEAM_LEAD_ROLE_ID, DEFAULT_ROLE_ID];
    for (const menu of ["expenses.evidence_void", "expenses.evidence_attach"]) {
      const rows = await db
        .select({ roleId: permissionMatrix.roleId })
        .from(permissionMatrix)
        .where(and(eq(permissionMatrix.menu, menu), eq(permissionMatrix.action, "write"), eq(permissionMatrix.allowed, true), inArray(permissionMatrix.roleId, seedRoles)));
      expect(rows.map((row) => row.roleId), menu).toEqual([SYSADMIN_ROLE_ID]);
    }
  });
});

describe("무효 뒤 신호", () => {
  it("(G1) 무효가 살아 있는 파일보다 늦으면 포함 · 새 증빙 뒤 빠짐 · 다시 무효 뒤 포함 · 살아 있는 0 포함 · 무효 없음 · 지운 파일만 제외 · 빈 입력", async () => {
    const fx = await setupExpenseProject();
    const manager = await makeEvidenceManager();
    const signals = (ownerIds: string[]) => listEvidenceVoidSignals(fx.pm, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerIds });

    // A — 살아 있는 1(무효보다 먼저 올림) + 무효 1.
    const a = await approvedDoc(fx, 1);
    const [a1, a2] = await fileRows(a.expenseId);
    await voidEvidence(manager, { fileId: a2?.id ?? "", reason: "다른 건" });
    // B — 마지막 파일까지 무효(G2).
    const b = await approvedDoc(await setupExpenseProject());
    await voidEvidence(manager, { fileId: (await firstFile(b.expenseId)).id, reason: "다른 건" });
    // C — 무효 없음.
    const c = await approvedDoc(await setupExpenseProject());
    // D — 작성 중에 올렸다 지운 파일만.
    const dFx = await setupExpenseProject();
    const dCreated = await createExpenseFromLines(dFx.pm, { lineIds: [dFx.lines.withVendor] });
    const dId = dCreated.created[0]?.expenseId ?? "";
    const dFile = await attachEvidence(dFx.pm, dId);
    await removeEvidence(dFx.pm, { fileId: dFile.id });

    expect((await signals([a.expenseId, b.expenseId, c.expenseId, dId])).sort()).toEqual([a.expenseId, b.expenseId].sort());

    // A에 새 증빙 → 빠짐.
    await attachEvidence(fx.pm, a.expenseId);
    expect(await signals([a.expenseId])).toEqual([]);
    // A의 다른 파일(a1)을 또 무효 → 가장 늦은 무효 > 가장 늦은 살아 있는 파일 → 다시 포함.
    await voidEvidence(manager, { fileId: a1?.id ?? "", reason: "다른 건" });
    expect(await signals([a.expenseId])).toEqual([a.expenseId]);

    expect(await signals([])).toEqual([]);
  });
});
