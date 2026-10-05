"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authedActionClient } from "@/lib/actions/client";
import "@/app/(app)/document-kinds";
import { currentHolderNames, projectActionResult } from "@/domain/approvals";
import {
  EXPENSE_DOCUMENT_KIND,
  TEAM_EXPENSE_KINDS,
  changeExpenseLine,
  changeExpenseVendor,
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
import { searchLinesForPick, searchVendorsForPick } from "@/domain/expenses/pick";
import {
  completeEvidenceUpload,
  createEvidenceViewUrl,
  EvidenceUploadRefusedError,
  removeEvidence,
  requestEvidenceUpload,
  voidEvidence,
} from "@/domain/evidence";
import { CURRENCIES } from "@/domain/money/currency";
import { QUOTE_LINE_MAX_PER_REVISION_DEFAULT } from "@/domain/settings/keys";
import { formatKstTime } from "@/domain/holidays/business-day";
import { log } from "@/lib/log";
import "./actions.registry";

// 05-05: 지출결의 액션 일곱. 전부 `authedActionClient` + zod, 도메인 함수 하나씩만 부른다. 입력 zod에 세액 · 지급 총액 · 원화 칸은 없다 —
// 사람이 적는 금액은 공급가액(통화 · 금액 · 환율) 하나이고 원화 환산 · 세금은 서버가 계산한다. 판정(권한 · 보임 · 게이트)은 도메인이 한다.

const expenseIdSchema = z.string().uuid();

const draftFieldsInput = z
  .object({
    vendorId: z.string().uuid().nullable(),
    evidenceType: z.string().min(1).max(100).nullable(),
    paymentMethod: z.string().min(1).max(100).nullable(),
    supply: z.object({ currency: z.enum(CURRENCIES), amount: z.number().min(0), fxRate: z.number() }).strict().nullable(),
    scheduledPaymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식 오류 · 2026-09-19처럼").nullable(),
    note: z.string().max(480, "비고 480자 넘음 · 줄여 적기").nullable(),
    installment: z.boolean(),
    // 05-07 팀 비용 칸 — 팀 id는 칸이 없다(귀속 팀은 서버가 사용일 소속으로만 정한다).
    teamExpenseKind: z.enum(TEAM_EXPENSE_KINDS).nullable(),
    usageDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식 오류 · 2026-09-19처럼"),
    content: z.string().max(480, "내용 480자 넘음 · 줄여 적기").nullable(),
  })
  .strict()
  .partial();

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
