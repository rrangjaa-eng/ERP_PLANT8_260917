import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { approvalInstances, approvalRoutes, approvalSteps, expenses, files } from "@/db/schema";
import { ApprovalConflictError, approveDocument, rejectDocument } from "@/domain/approvals";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND, ExpenseNotFoundError, saveExpenseDraft, submitExpense, withdrawExpense } from "@/domain/expenses";
import { listExpenses } from "@/domain/expenses/list";
import {
  completeEvidenceUpload,
  EVIDENCE_LOCKED_IN_REVIEW,
  EVIDENCE_REMOVE_LOCKED_APPROVED,
  EvidenceLockedError,
  getEvidenceActions,
  removeEvidence,
  requestEvidenceUpload,
} from "@/domain/evidence";
import { TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { makePerson } from "./approvals-fixtures";
import { createMemoryStorage } from "./fakes/memory-storage";
import { attachEvidence, makeEvidenceManager, setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "./fixtures/expenses";

// 05-09 Task 3 — 결재 중 증빙 규칙(사용자 결정 2026-10-04 — 260907 :79 복귀): 결재 중에는 아무도 증빙을 떼지 못하고, 붙이는 것은
// `expenses.evidence_attach` 쓰기 권한자(경영관리)만 한다. 기안자는 승인 뒤에 붙인다(삭제는 무효 처리로). 붙이면 같은 tx에서
// 인스턴스 version이 올라(E4) 그 전에 문서를 연 결재자의 승인이 `{붙인 사람}이 HH:MM에 증빙을 바꿈 · 새로 고침`으로 막힌다.
// 결재 동시 조작 두 순서(승인↔회수 · 승인↔반려 · 권한자 추가↔승인)를 지출결의로 다시 증명한다. 경합은 sleep 없이 afterLock · 순서 고정.

const SEOUL_HHMM = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

afterEach(() => {
  vi.useRealTimers();
});

async function submittedDoc(fx: ExpenseFixture, extraFiles = 0) {
  const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
  const expenseId = created.created[0]?.expenseId ?? "";
  for (let i = 0; i < extraFiles; i++) await attachEvidence(fx.pm, expenseId);
  const submitted = await submitReadyDraft(fx.pm, expenseId);
  if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
  return { expenseId, instanceId: submitted.instanceId, number: submitted.number };
}

async function instanceRow(instanceId: string) {
  const [row] = await db.select().from(approvalInstances).where(eq(approvalInstances.id, instanceId));
  if (!row) throw new Error("인스턴스 없음");
  return row;
}

async function liveFiles(expenseId: string) {
  return db.select().from(files).where(and(eq(files.ownerKind, "expense"), eq(files.ownerId, expenseId)));
}

async function actedCount(instanceId: string) {
  const rows = await db
    .select({ id: approvalSteps.id })
    .from(approvalSteps)
    .innerJoin(approvalRoutes, eq(approvalRoutes.id, approvalSteps.routeId))
    .where(and(eq(approvalRoutes.instanceId, instanceId), isNotNull(approvalSteps.actedAt)));
  return rows.length;
}

async function caught(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error("거부되지 않았다");
}

async function hhmmOf(instanceId: string) {
  return SEOUL_HHMM.format((await instanceRow(instanceId)).updatedAt);
}

describe("결재 중 증빙 붙이기 — 경영관리 권한자만", () => {
  it("권한자 추가 → 파일 행 +1 · 상태 불변 · version +1 · version_reason evidence · 바꾼 사람 = 붙인 사람", async () => {
    const fx = await setupExpenseProject();
    const manager = await makeEvidenceManager();
    const doc = await submittedDoc(fx);
    const before = await instanceRow(doc.instanceId);

    await attachEvidence(manager, doc.expenseId);

    expect(await liveFiles(doc.expenseId)).toHaveLength(2);
    const after = await instanceRow(doc.instanceId);
    expect(after).toMatchObject({ status: before.status, currentRound: 1, version: before.version + 1, versionReason: "evidence", updatedBy: manager.id });
  });

  it("기안자의 결재 중 추가는 `결재 중 · 증빙 잠김` · 권한 없는 결재자 · 무관자 · 무효 처리 권한만 있는 사람은 없는 문서 · 행 · version 불변", async () => {
    const fx = await setupExpenseProject();
    const voidOnly = await makeEvidenceManager("경영보라", { attach: false });
    const doc = await submittedDoc(fx);
    const storage = createMemoryStorage();
    const declared = { ownerKind: "expense", ownerId: doc.expenseId, size: 1000, contentType: "image/jpeg", sha256: "a".repeat(64), name: "추가.jpg" };

    const drafterError = await caught(requestEvidenceUpload(fx.pm, declared, { storage }));
    expect(drafterError).toBeInstanceOf(EvidenceLockedError);
    expect(drafterError.message).toBe(EVIDENCE_LOCKED_IN_REVIEW);
    for (const viewer of [fx.lead, fx.otherPm, voidOnly]) {
      expect(await caught(requestEvidenceUpload(viewer, declared, { storage }))).toBeInstanceOf(ExpenseNotFoundError);
    }
    expect(await liveFiles(doc.expenseId)).toHaveLength(1);
    expect((await instanceRow(doc.instanceId)).version).toBe(1);
  });

  it("evidenceActions — 결재 중: 권한자 = 하나 더 · 삭제 0, 기안자 = 잠김 한 줄 · 하나 더 0 · 삭제 0, 결재자 = 크게 보기만", async () => {
    const fx = await setupExpenseProject();
    const manager = await makeEvidenceManager();
    const doc = await submittedDoc(fx, 1);
    const kind = { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: doc.expenseId };
    expect(await getEvidenceActions(manager, kind)).toEqual({ canAdd: true, deletableFileIds: [], voidableFileIds: [], drafterLocked: false });
    expect(await getEvidenceActions(fx.pm, kind)).toEqual({ canAdd: false, deletableFileIds: [], voidableFileIds: [], drafterLocked: true });
    expect(await getEvidenceActions(fx.lead, kind)).toEqual({ canAdd: false, deletableFileIds: [], voidableFileIds: [], drafterLocked: false });
  });
});

describe("결재 중 삭제 거부", () => {
  it("결재 중 삭제 거부 — 기안자(`결재 중 · 증빙 잠김`) · 권한자(없는 문서) 모두, 파일이 둘이어도 · 행 · version 불변", async () => {
    const fx = await setupExpenseProject();
    const manager = await makeEvidenceManager();
    const doc = await submittedDoc(fx, 1);
    const [first, second] = await liveFiles(doc.expenseId);

    const drafterError = await caught(removeEvidence(fx.pm, { fileId: first?.id ?? "" }));
    expect(drafterError).toBeInstanceOf(EvidenceLockedError);
    expect(drafterError.message).toBe(EVIDENCE_LOCKED_IN_REVIEW);
    expect(await caught(removeEvidence(manager, { fileId: second?.id ?? "" }))).toBeInstanceOf(ExpenseNotFoundError);

    expect((await liveFiles(doc.expenseId)).every((row) => row.removedAt === null)).toBe(true);
    expect((await instanceRow(doc.instanceId)).version).toBe(1);
  });
});

describe("승인 뒤 — 기안자는 더하기만", () => {
  it("승인 뒤 기안자 추가 → version +1 · 상태 approved 그대로, 파일이 둘이어도 삭제는 거부 · deletableFileIds 빈 배열", async () => {
    const fx = await setupExpenseProject();
    const doc = await submittedDoc(fx);
    const first = await approveDocument(fx.lead, { instanceId: doc.instanceId, expectedVersion: 1 });
    const final = await approveDocument(fx.ceo, { instanceId: doc.instanceId, expectedVersion: first.version });

    await attachEvidence(fx.pm, doc.expenseId);
    expect(await instanceRow(doc.instanceId)).toMatchObject({ status: "approved", version: final.version + 1, versionReason: "evidence" });

    const rows = await liveFiles(doc.expenseId);
    expect(rows).toHaveLength(2);
    const error = await caught(removeEvidence(fx.pm, { fileId: rows[0]?.id ?? "" }));
    expect(error).toBeInstanceOf(EvidenceLockedError);
    expect(error.message).toBe(EVIDENCE_REMOVE_LOCKED_APPROVED);
    expect((await liveFiles(doc.expenseId)).every((row) => row.removedAt === null)).toBe(true);
    expect((await instanceRow(doc.instanceId)).version).toBe(final.version + 1);
    expect((await getEvidenceActions(fx.pm, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: doc.expenseId })).deletableFileIds).toEqual([]);
  });

  it("(05-08 검토 #6) 승인 뒤 증빙을 더해도 목록의 승인 날짜는 최종 승인 시각 그대로다", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-18T03:00:00Z"));
    const fx = await setupExpenseProject();
    const doc = await submittedDoc(fx);
    const first = await approveDocument(fx.lead, { instanceId: doc.instanceId, expectedVersion: 1 });
    await approveDocument(fx.ceo, { instanceId: doc.instanceId, expectedVersion: first.version });
    vi.useRealTimers();

    const dateOf = async () =>
      (await listExpenses(fx.pm, { status: "all" })).groups.flatMap((group) => group.rows).find((row) => row.id === doc.expenseId)?.statusDate;
    expect(await dateOf()).toBe("09-18");
    await attachEvidence(fx.pm, doc.expenseId);
    expect((await instanceRow(doc.instanceId)).versionReason).toBe("evidence");
    expect(await dateOf()).toBe("09-18");
  });
});

describe("권한자 추가 ↔ 승인 두 순서", () => {
  it("① 팀장이 version을 읽은 뒤 권한자가 붙이면 팀장의 옛 version 승인은 `{붙인 사람}이 HH:MM에 증빙을 바꿈 · 새로 고침` · 단계 기록 0 → 새로 읽고 승인하면 성공", async () => {
    const fx = await setupExpenseProject();
    const manager = await makeEvidenceManager();
    const doc = await submittedDoc(fx);
    const seen = (await instanceRow(doc.instanceId)).version;

    await attachEvidence(manager, doc.expenseId);
    const error = await caught(approveDocument(fx.lead, { instanceId: doc.instanceId, expectedVersion: seen }));
    expect(error).toBeInstanceOf(ApprovalConflictError);
    expect(error.message).toBe(`경영지원이 ${await hhmmOf(doc.instanceId)}에 증빙을 바꿈 · 새로 고침`);
    expect(await actedCount(doc.instanceId)).toBe(0);

    await approveDocument(fx.lead, { instanceId: doc.instanceId, expectedVersion: (await instanceRow(doc.instanceId)).version });
    expect(await actedCount(doc.instanceId)).toBe(1);
  });

  it("② 승인이 먼저 커밋(afterLock — 권한자가 지출결의 행을 잡은 사이) → 증빙 추가도 성공 · 상태 · 단계 기록은 승인 결과 그대로", async () => {
    const fx = await setupExpenseProject();
    const manager = await makeEvidenceManager();
    const doc = await submittedDoc(fx);
    const storage = createMemoryStorage();
    const declared = { size: 1000, contentType: "image/jpeg", sha256: "b".repeat(64), name: "추가.jpg" };
    const intent = await requestEvidenceUpload(manager, { ownerKind: "expense", ownerId: doc.expenseId, ...declared }, { storage });
    storage.put(intent.url, { size: declared.size, contentType: declared.contentType, sha256: declared.sha256 });

    await completeEvidenceUpload(manager, { intentId: intent.intentId }, {
      storage,
      afterLock: async () => {
        await approveDocument(fx.lead, { instanceId: doc.instanceId, expectedVersion: 1 });
      },
    });

    expect(await liveFiles(doc.expenseId)).toHaveLength(2);
    expect(await instanceRow(doc.instanceId)).toMatchObject({ status: "in_review", version: 3, versionReason: "evidence" });
    expect(await actedCount(doc.instanceId)).toBe(1);
  });
});

describe("승인 ↔ 회수 · 승인 ↔ 반려 두 순서(지출결의)", () => {
  it("승인 먼저 → 문서 화면 회수(옛 version)는 `{팀장}이 HH:MM에 승인함`, 회수 먼저 → 승인(옛 version)은 `{기안자}이 HH:MM에 회수함` · 기록 0", async () => {
    const fx = await setupExpenseProject();
    const a = await submittedDoc(fx);
    await approveDocument(fx.lead, { instanceId: a.instanceId, expectedVersion: 1 });
    const withdrawError = await caught(withdrawExpense(fx.pm, { expenseId: a.expenseId, expectedInstanceVersion: 1 }));
    expect(withdrawError).toBeInstanceOf(ApprovalConflictError);
    expect(withdrawError.message).toBe(`김도윤이 ${await hhmmOf(a.instanceId)}에 승인함 · 새로 고침`);
    expect((await instanceRow(a.instanceId)).status).toBe("in_review");

    const fxB = await setupExpenseProject();
    const b = await submittedDoc(fxB);
    await withdrawExpense(fxB.pm, { expenseId: b.expenseId, expectedInstanceVersion: 1 });
    const approveError = await caught(approveDocument(fxB.lead, { instanceId: b.instanceId, expectedVersion: 1 }));
    expect(approveError).toBeInstanceOf(ApprovalConflictError);
    expect(approveError.message).toBe(`박서연이 ${await hhmmOf(b.instanceId)}에 회수함 · 새로 고침`);
    expect((await instanceRow(b.instanceId)).status).toBe("withdrawn");
    expect(await actedCount(b.instanceId)).toBe(0);
  });

  it("1단 후보 둘 — 한 명 승인 먼저면 반려가, 반려 먼저면 승인이 04.1 문구로 진다 · 기록 1", async () => {
    const fx = await setupExpenseProject();
    const lead2 = await makePerson("정팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    const a = await submittedDoc(fx);
    await approveDocument(fx.lead, { instanceId: a.instanceId, expectedVersion: 1 });
    const rejectError = await caught(rejectDocument(lead2, { instanceId: a.instanceId, expectedVersion: 1, reason: "금액 확인" }));
    expect(rejectError).toBeInstanceOf(ApprovalConflictError);
    expect(rejectError.message).toBe(`김도윤이 ${await hhmmOf(a.instanceId)}에 승인함 · 새로 고침`);
    expect(await actedCount(a.instanceId)).toBe(1);

    const fxB = await setupExpenseProject();
    const lead2B = await makePerson("정팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    const b = await submittedDoc(fxB);
    await rejectDocument(lead2B, { instanceId: b.instanceId, expectedVersion: 1, reason: "금액 확인" });
    const approveError = await caught(approveDocument(fxB.lead, { instanceId: b.instanceId, expectedVersion: 1 }));
    expect(approveError).toBeInstanceOf(ApprovalConflictError);
    expect(approveError.message).toBe(`정팀장이 ${await hhmmOf(b.instanceId)}에 반려함 · 새로 고침`);
    expect((await instanceRow(b.instanceId)).status).toBe("rejected");
    expect(await actedCount(b.instanceId)).toBe(1);
  });
});

describe("권한자 추가 뒤 되돌리기 · 다시 제출(P3-7) · 반려 뒤 기안자 정리(사용자 결정 Q2)", () => {
  it("권한자가 붙여 version +1 → 기안자 되돌리기(round: 1) 성공 → 회수 상태에서 하나 더 · 공급가액 고침 → 같은 번호 · 차수 2", async () => {
    const fx = await setupExpenseProject();
    const manager = await makeEvidenceManager();
    const doc = await submittedDoc(fx);
    await attachEvidence(manager, doc.expenseId);
    expect((await instanceRow(doc.instanceId)).version).toBe(2);

    await withdrawExpense(fx.pm, { expenseId: doc.expenseId, undo: true, round: 1 });
    expect((await instanceRow(doc.instanceId)).status).toBe("withdrawn");

    await attachEvidence(fx.pm, doc.expenseId);
    const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, doc.expenseId));
    const saved = await saveExpenseDraft(fx.pm, { expenseId: doc.expenseId, expectedVersion: row?.version ?? 0, fields: { supply: { currency: "KRW", amount: 12_000_000, fxRate: 1 } } });
    const again = await submitExpense(fx.pm, { expenseId: doc.expenseId, expectedVersion: saved.version });
    expect(again).toMatchObject({ kind: "submitted", number: doc.number, instanceId: doc.instanceId, round: 2 });
    expect(await liveFiles(doc.expenseId)).toHaveLength(3);
  });

  it("반려 뒤 기안자는 경영관리가 붙인 파일도 뗄 수 있다", async () => {
    const fx = await setupExpenseProject();
    const manager = await makeEvidenceManager();
    const doc = await submittedDoc(fx);
    const added = await attachEvidence(manager, doc.expenseId);
    await rejectDocument(fx.lead, { instanceId: doc.instanceId, expectedVersion: (await instanceRow(doc.instanceId)).version, reason: "금액 확인" });

    await removeEvidence(fx.pm, { fileId: added.id });
    expect((await liveFiles(doc.expenseId)).find((file) => file.id === added.id)?.removedAt).toBeInstanceOf(Date);
  });
});
