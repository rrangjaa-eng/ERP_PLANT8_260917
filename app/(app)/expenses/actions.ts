"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authedActionClient } from "@/lib/actions/client";
import "@/app/(app)/document-kinds";
import { currentHolderNames, projectActionResult } from "@/domain/approvals";
import {
  EXPENSE_DOCUMENT_KIND,
  changeExpenseLine,
  changeExpensePayeeUser,
  changeExpenseVendor,
  closeExpense,
  createExpenseFromLines,
  deleteExpenseDraft,
  createTeamExpenseDraft,
  getNewExpenseDefaults,
  previewExpense,
  restoreExpenseDraft,
  saveExpenseDraft,
  submitExpense,
  withdrawExpense,
} from "@/domain/expenses";
import { DATE_FORMAT_ERROR, EXPENSE_TEXT_MAX, expenseDraftFieldsSchema } from "@/domain/expenses/draft-fields";
import { completePaymentsBatch } from "@/domain/payments/batch";
import { exportBankTransferFile, summarizeTransferPayees } from "@/domain/payments/bank-transfer";
import { getEvidenceConfirmView, sumSelectedTransfers } from "@/domain/payments/targets";
import { DIFF_REASON_REQUIRED } from "@/domain/payments/action-row";
import { isCalendarDate } from "@/lib/dates";
import { searchLinesForPick, searchPayeeUsersForPick, searchVendorsForPick } from "@/domain/expenses/pick";
import {
  completeEvidenceUpload,
  createEvidenceViewUrl,
  EvidenceUploadRefusedError,
  getOwnedEvidence,
  removeEvidence,
  requestEvidenceUpload,
  restoreEvidence,
  voidEvidence,
} from "@/domain/evidence";
import { CARD_USAGE_ENTITY } from "@/domain/corp-card-usages";
import { APPROVAL_EVIDENCE_KIND } from "@/domain/quotes/revisions";
import { RESERVE_EVIDENCE_KIND } from "@/domain/reserves";
import { QUOTE_LINE_MAX_PER_REVISION_DEFAULT } from "@/domain/settings/keys";
import { formatKstTime } from "@/domain/holidays/business-day";
import { log } from "@/lib/log";
import "./actions.registry";

// 05-05: 지출결의 액션. 전부 `authedActionClient` + zod, 도메인 함수 하나씩만 부른다. 입력 zod에 세액 · 지급 총액 · 원화 칸은 없다 —
// 사람이 적는 금액은 공급가액(통화 · 금액 · 환율) 하나이고 원화 환산 · 세금은 서버가 계산한다. 판정(권한 · 보임 · 게이트)은 도메인이 한다.

const expenseIdSchema = z.string().uuid();

// 칸 값 스키마는 도메인과 하나다(05 /review A12 — 칸 오류 문구 · 상한이 같은 곳에서 온다).
const draftFieldsInput = expenseDraftFieldsSchema;

// 줄 수 상한 = 차수 줄 상한 기본값 — 견적 줄 표 Ctrl+A → Ctrl+E가 한 차수의 줄 전부를 보낸다(05-08 검토 #5).
// 05-16 fields — `/expenses/new`에서 줄을 고르기 전에 적어 둔 비고 · 지급 예정일 · 지급 방식(임시 저장과 같은 검증). 견적 줄 표는 보내지 않는다.
export const createExpenseFromLinesAction = authedActionClient
  .schema(
    z.object({
      lineIds: z.array(z.string().uuid()).min(1).max(QUOTE_LINE_MAX_PER_REVISION_DEFAULT),
      fields: draftFieldsInput.pick({ note: true, scheduledPaymentDate: true, paymentMethod: true }).optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const result = await createExpenseFromLines(ctx.viewer, parsedInput);
    revalidatePath("/expenses");
    return { created: result.created, blocked: result.blocked };
  });

export const saveExpenseDraftAction = authedActionClient
  .schema(z.object({ expenseId: expenseIdSchema, expectedVersion: z.number().int().min(1), fields: draftFieldsInput }))
  .action(async ({ parsedInput, ctx }) => {
    const saved = await saveExpenseDraft(ctx.viewer, parsedInput);
    revalidatePath(`/expenses/${parsedInput.expenseId}`);
    return { version: saved.version, savedAt: formatKstTime(new Date()) };
  });

// 05-07 `/expenses/new`의 첫 저장 — 폼이 열릴 때 만든 idempotency key로 두 번 눌러도 문서 하나. 칸 값은 임시 저장과 같다.
export const createTeamExpenseDraftAction = authedActionClient
  .schema(z.object({ idempotencyKey: z.string().uuid(), fields: draftFieldsInput }))
  .action(async ({ parsedInput, ctx }) => {
    const created = await createTeamExpenseDraft(ctx.viewer, parsedInput);
    revalidatePath("/expenses");
    return { expenseId: created.expenseId, version: created.version };
  });

// 05-07 거래처 바꾸기 — 증빙 종류는 그 거래처 기본값으로(없으면 그대로). 새 version · 증빙 종류 코드만 돌려준다.
export const changeExpenseVendorAction = authedActionClient
  .schema(z.object({ expenseId: expenseIdSchema, vendorId: z.string().uuid(), expectedVersion: z.number().int().min(1) }))
  .action(async ({ parsedInput, ctx }) => {
    const changed = await changeExpenseVendor(ctx.viewer, parsedInput);
    revalidatePath(`/expenses/${parsedInput.expenseId}`);
    return { version: changed.version, evidenceType: changed.evidenceType };
  });

// 05-07 골라내기 거래처 검색 — 서버 조회(행은 PickVendorOptionDto 투영).
export const searchVendorsForPickAction = authedActionClient
  .schema(z.object({ query: z.string().max(100) }))
  .action(async ({ parsedInput, ctx }) => searchVendorsForPick(ctx.viewer, parsedInput));

// 06.5 V12(D-6517): 지급처 고르기의 직원 후보 — 서버 조회(행은 PickPayeeUserOptionDto 투영). 거래처 검색과 같은 검색어 하나로 함께 부른다.
export const searchPayeeUsersForPickAction = authedActionClient
  .schema(z.object({ query: z.string().max(100) }))
  .action(async ({ parsedInput, ctx }) => searchPayeeUsersForPick(ctx.viewer, parsedInput));

// 06.5 D-6517: 지급처를 직원으로 바꾸기 — 새 version만 돌려준다(증빙 종류는 건드리지 않는다).
export const changeExpensePayeeUserAction = authedActionClient
  .schema(z.object({ expenseId: expenseIdSchema, userId: z.string().min(1).max(100), expectedVersion: z.number().int().min(1) }))
  .action(async ({ parsedInput, ctx }) => {
    const changed = await changeExpensePayeeUser(ctx.viewer, parsedInput);
    revalidatePath(`/expenses/${parsedInput.expenseId}`);
    return { version: changed.version };
  });

// 05-07 골라내기 견적 줄 검색 — change = 그 문서 프로젝트의 줄 전부, pick = 내 담당 프로젝트(검색어가 있으면 쓰기 범위 전체). 행 · 그룹은 투영 DTO다.
export const searchLinesForPickAction = authedActionClient
  .schema(z.object({ mode: z.enum(["change", "pick"]), expenseId: expenseIdSchema.optional(), query: z.string().max(100).optional() }))
  .action(async ({ parsedInput, ctx }) => searchLinesForPick(ctx.viewer, parsedInput));

// 05-07 견적 줄 바꾸기 — 새 version이거나, 그 줄에 내 다른 작성 중 문서가 있으면 그 문서 id(`redirectTo`)를 돌려준다.
export const changeExpenseLineAction = authedActionClient
  .schema(z.object({ expenseId: expenseIdSchema, lineId: z.string().uuid(), expectedVersion: z.number().int().min(1) }))
  .action(async ({ parsedInput, ctx }) => {
    const changed = await changeExpenseLine(ctx.viewer, parsedInput);
    revalidatePath(`/expenses/${parsedInput.expenseId}`);
    return changed;
  });

// 05-07 새 문서(아직 문서 없음)의 사용일 → 그날 내 소속 팀 이름 · 사용일 칸 오류. 미리보기와 같은 문구를 같은 판정으로 준다.
export const previewNewExpenseAction = authedActionClient
  .schema(z.object({ usageDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
  .action(async ({ parsedInput, ctx }) => {
    const defaults = await getNewExpenseDefaults(ctx.viewer, { usageDate: parsedInput.usageDate });
    return { teamName: defaults?.teamName ?? null, usageDateError: defaults?.usageDateError ?? null };
  });

// 05-06 미리보기 — 저장 전 칸 값으로 계산 한 줄 · 제출 막힘 첫 이유 · 칸 오류를 받는다(쓰기 없음). 입력은 임시 저장과 같은 칸 값이다.
export const previewExpenseAction = authedActionClient
  .schema(z.object({ expenseId: expenseIdSchema, fields: draftFieldsInput }))
  .action(async ({ parsedInput, ctx }) => {
    const preview = await previewExpense(ctx.viewer, parsedInput);
    return { taxLine: preview.taxLine ?? null, block: preview.block ?? null, fieldErrors: preview.fieldErrors ?? {}, teamName: preview.teamName ?? null };
  });

// 제출 — 같은 문서 두 번 제출(폰 두 번 탭 · 응답 유실 뒤 재시도)은 오류가 아니라 결과(`already_submitted`)다. 화면이 문서 화면으로
// 다시 그려지고 `이미 제출됨 · {번호}` 토스트를 띄운다(`다른 곳에서 저장됨` 충돌 문구를 보이지 않는다).
export const submitExpenseAction = authedActionClient
  .schema(z.object({ expenseId: expenseIdSchema, expectedVersion: z.number().int().min(1) }))
  .action(async ({ parsedInput, ctx }) => {
    const submitted = await submitExpense(ctx.viewer, parsedInput);
    revalidatePath("/expenses");
    revalidatePath(`/expenses/${submitted.expenseId}`);
    if (submitted.kind === "already_submitted") return { kind: "already_submitted" as const, expenseId: submitted.expenseId, number: submitted.number };
    // 제출은 이미 커밋됐다 — 토스트 재료(다음 담당 이름) 읽기가 실패해도 성공으로 돌려준다(연차 신청과 같은 규칙). 차수는 토스트 `되돌리기`가 가진다(05-09).
    const at = formatKstTime(new Date());
    try {
      const nextHolderNames = await currentHolderNames(ctx.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: submitted.expenseId });
      return {
        kind: "submitted" as const,
        number: submitted.number,
        round: submitted.round,
        at,
        result: await projectActionResult(ctx.viewer, { documentId: submitted.expenseId, final: false, nextHolderNames }),
      };
    } catch (error) {
      log.warn("expense.submit_toast_material_failed", { expenseId: submitted.expenseId, error: error instanceof Error ? error.message : String(error) });
      return { kind: "submitted" as const, number: submitted.number, round: submitted.round, at, result: { documentId: submitted.expenseId, final: false } };
    }
  });

// 05-09 회수 — 입력은 두 모양만: 토스트 되돌리기(차수만 — 인스턴스 version 없음) · 문서 화면 회수(화면이 본 인스턴스 version).
// 거부(늦은 되돌리기 · 04.1 충돌)는 UserFacingError 문구 그대로 serverError로 간다.
export const withdrawExpenseAction = authedActionClient
  .schema(
    z.union([
      z.object({ expenseId: expenseIdSchema, undo: z.literal(true), round: z.number().int().min(1) }).strict(),
      z.object({ expenseId: expenseIdSchema, expectedInstanceVersion: z.number().int().min(1) }).strict(),
    ]),
  )
  .action(async ({ parsedInput, ctx }) => {
    const withdrawn = await withdrawExpense(ctx.viewer, parsedInput);
    revalidatePath("/expenses");
    revalidatePath(`/expenses/${parsedInput.expenseId}`);
    return { status: withdrawn.status };
  });

// 06-28(S23) 반려 · 회수 지출결의 종결 — 사유 길이 · 행위자 · 상태 판정은 도메인. 새 문서 version만 돌려준다.
export const closeExpenseAction = authedActionClient
  .schema(z.object({ expenseId: expenseIdSchema, expectedVersion: z.number().int().min(1), reason: z.string() }).strict())
  .action(async ({ parsedInput, ctx }) => {
    const closed = await closeExpense(ctx.viewer, parsedInput);
    revalidatePath("/expenses");
    revalidatePath(`/expenses/${parsedInput.expenseId}`);
    return { version: closed.version };
  });

export const requestEvidenceUploadAction = authedActionClient
  .schema(
    z.object({
      expenseId: expenseIdSchema,
      size: z.number().int().min(0),
      contentType: z.string().min(1).max(100),
      sha256: z.string().max(64),
      name: z.string().min(1).max(255),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const { expenseId, ...declaration } = parsedInput;
    const intent = await requestEvidenceUpload(ctx.viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: expenseId, ...declaration });
    return { intentId: intent.intentId, url: intent.url, method: intent.method, headers: intent.headers };
  });

// 06-16(D-56) 차수 승인 증빙 — 05 증빙 액션 집에 둔 주인별 요청 · 펼침 읽기. 완료 통보 · 삭제 · 보기는 위 05 액션을 그대로 쓴다.
// 권리(담당 PM · projects 쓰기 · 표시 켜짐 · quote.amount)는 domain 주인 표가 차수 행으로 다시 읽어 판정한다 — 넘어온 id만 믿지 않는다.
export const requestRevisionEvidenceUploadAction = authedActionClient
  .schema(
    z.object({
      revisionId: z.string().uuid(),
      size: z.number().int().min(0),
      contentType: z.string().min(1).max(100),
      sha256: z.string().max(64),
      name: z.string().min(1).max(255),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const { revisionId, ...declaration } = parsedInput;
    const intent = await requestEvidenceUpload(ctx.viewer, { ownerKind: APPROVAL_EVIDENCE_KIND, ownerId: revisionId, ...declaration });
    return { intentId: intent.intentId, url: intent.url, method: intent.method, headers: intent.headers };
  });

export const getRevisionEvidenceAction = authedActionClient
  .schema(z.object({ revisionId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => getOwnedEvidence(ctx.viewer, { ownerKind: APPROVAL_EVIDENCE_KIND, ownerId: parsedInput.revisionId }));

// 06-16(D-60) 리저브 줄 증빙 — 차수 승인 증빙과 같은 모양. 권리(pnl 쓰기 · 보기 + reserve.amount · 보관 아님)는 domain 주인 표가 줄 행으로 다시 읽어 판정한다.
export const requestReserveEvidenceUploadAction = authedActionClient
  .schema(
    z.object({
      entryId: z.string().uuid(),
      size: z.number().int().min(0),
      contentType: z.string().min(1).max(100),
      sha256: z.string().max(64),
      name: z.string().min(1).max(255),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const { entryId, ...declaration } = parsedInput;
    const intent = await requestEvidenceUpload(ctx.viewer, { ownerKind: RESERVE_EVIDENCE_KIND, ownerId: entryId, ...declaration });
    return { intentId: intent.intentId, url: intent.url, method: intent.method, headers: intent.headers };
  });

export const getReserveEvidenceAction = authedActionClient
  .schema(z.object({ entryId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => getOwnedEvidence(ctx.viewer, { ownerKind: RESERVE_EVIDENCE_KIND, ownerId: parsedInput.entryId }));

// 06-25(EVID-01 카드 몫) 카드 전표 — 차수 승인 증빙과 같은 모양. 권리(06-09 수정 권리 + 보관 아님 · 읽기 = S8 목록 범위)는 domain 주인 표가 카드 사용 행으로 다시 읽어 판정한다.
// 완료 통보 · 삭제 · 보기는 위 05 액션 그대로다. 저장된 카드 사용 id만 받는다 — 주인 없는 업로드는 없다.
export const requestCardSlipUploadAction = authedActionClient
  .schema(
    z.object({
      cardUsageId: z.string().uuid(),
      size: z.number().int().min(0),
      contentType: z.string().min(1).max(100),
      sha256: z.string().max(64),
      name: z.string().min(1).max(255),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const { cardUsageId, ...declaration } = parsedInput;
    const intent = await requestEvidenceUpload(ctx.viewer, { ownerKind: CARD_USAGE_ENTITY, ownerId: cardUsageId, ...declaration });
    return { intentId: intent.intentId, url: intent.url, method: intent.method, headers: intent.headers };
  });

// 06-16(F10) 지운 파일 되돌리기 — 새 두 주인 종류만(판정은 domain 규칙: 쓰기 권리 · 잠근 뒤 열림 · 중복 묶음). 성공 표시만 돌려준다.
export const restoreEvidenceAction = authedActionClient
  .schema(z.object({ fileId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await restoreEvidence(ctx.viewer, parsedInput);
    return { restored: true as const };
  });

// 완료 통보 거부는 오류가 아니라 결과다 — 화면이 `다시 올리기`의 갈래(`complete` · `restart`)를 알아야 한다.
export const completeEvidenceUploadAction = authedActionClient
  .schema(z.object({ intentId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    try {
      const file = await completeEvidenceUpload(ctx.viewer, parsedInput);
      revalidatePath("/expenses");
      return { file };
    } catch (error) {
      if (error instanceof EvidenceUploadRefusedError) return { failed: true as const, message: error.message, retry: error.retry };
      throw error;
    }
  });

export const removeEvidenceAction = authedActionClient
  .schema(z.object({ fileId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await removeEvidence(ctx.viewer, parsedInput);
    revalidatePath("/expenses");
    return { removed: true as const };
  });

// 05-09 승인 뒤 증빙 무효 처리 — 성공 표시만 돌려준다(화면은 router.refresh로 무효 행을 다시 그린다 · 토스트 없음).
export const voidEvidenceAction = authedActionClient
  .schema(z.object({ fileId: z.string().uuid(), reason: z.string().max(2000) }).strict())
  .action(async ({ parsedInput, ctx }) => {
    await voidEvidence(ctx.viewer, parsedInput);
    revalidatePath("/expenses");
    return { voided: true as const };
  });

export const createEvidenceViewUrlAction = authedActionClient
  .schema(z.object({ fileId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const view = await createEvidenceViewUrl(ctx.viewer, parsedInput);
    return { url: view?.url ?? null };
  });

// 05-09 작성 중 삭제 · 되돌리기(복원) — 문서 id만 돌려준다(복원은 그 사이 같은 줄에 생긴 새 작성 중 문서 id일 수 있다).
export const deleteExpenseDraftAction = authedActionClient
  .schema(z.object({ expenseId: expenseIdSchema, expectedVersion: z.number().int().min(1) }).strict())
  .action(async ({ parsedInput, ctx }) => {
    const deleted = await deleteExpenseDraft(ctx.viewer, parsedInput);
    revalidatePath("/expenses");
    return { expenseId: deleted.expenseId };
  });

export const restoreExpenseDraftAction = authedActionClient
  .schema(z.object({ expenseId: expenseIdSchema }).strict())
  .action(async ({ parsedInput, ctx }) => {
    const restored = await restoreExpenseDraft(ctx.viewer, parsedInput);
    revalidatePath("/expenses");
    revalidatePath(`/expenses/${restored.expenseId}`);
    return { expenseId: restored.expenseId };
  });

// 06-15(S2 · AS1) — 일괄 지급. 입력은 모달을 연 순간의 스냅숏(행 id · version · 기대 지급 총액 · 이체액 · 차이 사유)과 지급일 하나(O-3).
// 지급 총액 · 역산 칸은 받지 않는다 — expectedPayableKrw는 낡았는지 가리는 비교값이다. 지급일은 05 isCalendarDate · DATE_FORMAT_ERROR(E-20 —
// 달력에 없는 날짜 · 0000년이 DB까지 가지 않는다), 미래 날짜는 허용(Q6). 행 수 1~200(T-06-75). 판정(권한 · 보임 · 게이트)은 도메인.
// 06.5-06(EP2-C6): 행 스냅숏 스키마 — 일괄 지급과 이체 파일이 같이 쓴다.
const paymentSnapshotRowSchema = z
  .object({
    expenseId: expenseIdSchema,
    expenseVersion: z.number().int().positive(),
    expectedPayableKrw: z.number().int().nonnegative(),
    transferKrw: z.number().int().positive().optional(),
    diffReason: z.string().max(EXPENSE_TEXT_MAX).optional(),
  })
  // 06-17(D-605 · 「Error — 차이 사유 칸」) — 이체액이 스냅숏의 지급 총액과 다르면 사유가 필수(같음 비교 — 금액 셈 없음). 그 행 칸 오류로 돌아간다.
  .refine((row) => row.transferKrw === undefined || row.transferKrw === row.expectedPayableKrw || (row.diffReason ?? "").trim() !== "", {
    message: DIFF_REASON_REQUIRED,
    path: ["diffReason"],
  });

const batchPaymentSchema = z.object({
  payDate: z.string().refine(isCalendarDate, DATE_FORMAT_ERROR),
  rows: z.array(paymentSnapshotRowSchema).min(1).max(200),
});

export const completePaymentsBatchAction = authedActionClient.schema(batchPaymentSchema).action(async ({ parsedInput, ctx }) => {
  const result = await completePaymentsBatch(ctx.viewer, parsedInput);
  revalidatePath("/expenses");
  return result;
});

// 06.5-06(D-6504 · UI-SPEC V5): 신한 대량이체 파일 — 입력은 일괄 지급과 같은 행 스냅숏(1~200). 판정 · 기록 · 직렬화는 도메인.
// 파일 바이트(base64)는 응답에만 싣고 화면은 내려받은 뒤 버린다. 지급 상태를 바꾸지 않아 revalidate 없음.
export const exportBankTransferFileAction = authedActionClient
  .schema(z.object({ rows: z.array(paymentSnapshotRowSchema).min(1).max(200) }))
  .action(async ({ parsedInput, ctx }) => exportBankTransferFile(ctx.viewer, parsedInput));

// 06.5-06(V14 · SP-65-7): `지급 완료` 대화상자를 열 때 따로 읽는 지급처 소계 — 확정 액션과 별개(실패해도 지급을 막지 않는다 · R-5). 읽기 전용.
export const previewTransferPayeesAction = authedActionClient
  .schema(z.object({ rows: z.array(paymentSnapshotRowSchema).min(1).max(200) }))
  .action(async ({ parsedInput, ctx }) => summarizeTransferPayees(ctx.viewer, parsedInput));

// 06-17(S1 「합계 줄」 · O-18) — 고른 건 이체액 합 · 행별 차이 · 고른 행 상태(rowStates). 입력은 합계 번호 · 고른 행 id · 고친 이체액 · 모달이 마지막으로 쓴
// 지급일뿐 — 지급 총액 · version은 서버가 다시 읽는다. 행 수 상한은 처리 요청과 같은 200. 읽기 전용이라 revalidate 없음.
const sumSelectedTransfersSchema = z.object({
  seq: z.number().int().nonnegative(),
  rows: z
    .array(z.object({ id: expenseIdSchema, transferKrw: z.number().int().positive().optional() }))
    .min(1)
    .max(200),
  payDate: z.string().refine(isCalendarDate, DATE_FORMAT_ERROR).optional(),
});

export const sumSelectedTransfersAction = authedActionClient
  .schema(sumSelectedTransfersSchema)
  .action(async ({ parsedInput, ctx }) => sumSelectedTransfers(ctx.viewer, parsedInput));

// 06-17(UI-SPEC S1 「제자리 증빙 확인」 · DR-4): 확인 모달 보기 — 파일 행 · 증빙 금액 · 서버 계산 한 줄 · 지금 version · 증빙 지문 · 초과 한 줄(Q-F).
// 확인 자체는 06-06 confirmEvidenceAction(금액 없는 갈래)을 그대로 쓴다 — 새 확인 액션 없음.
const evidenceConfirmViewSchema = z.object({ expenseId: z.string().uuid(), rowVersion: z.number().int().nonnegative() });

export const getEvidenceConfirmViewAction = authedActionClient
  .schema(evidenceConfirmViewSchema)
  .action(async ({ parsedInput, ctx }) => getEvidenceConfirmView(ctx.viewer, parsedInput));
