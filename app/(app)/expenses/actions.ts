"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authedActionClient } from "@/lib/actions/client";
import "@/app/(app)/document-kinds";
import { currentHolderNames, projectActionResult } from "@/domain/approvals";
import { EXPENSE_DOCUMENT_KIND, createExpenseFromLines, previewExpense, saveExpenseDraft, submitExpense } from "@/domain/expenses";
import {
  completeEvidenceUpload,
  createEvidenceViewUrl,
  EvidenceUploadRefusedError,
  removeEvidence,
  requestEvidenceUpload,
} from "@/domain/evidence";
import { CURRENCIES } from "@/domain/money/currency";
import { formatKstTime } from "@/domain/holidays/business-day";
import { log } from "@/lib/log";
import "./actions.registry";

// 05-05: 지출결의 액션 일곱. 전부 `authedActionClient` + zod, 도메인 함수 하나씩만 부른다. 입력 zod에 세액 · 지급 총액 · 원화 칸은 없다 —
// 사람이 적는 금액은 공급가액(통화 · 금액 · 환율) 하나이고 원화 환산 · 세금은 서버가 계산한다. 판정(권한 · 보임 · 게이트)은 도메인이 한다.

const expenseIdSchema = z.string().uuid();

export const createExpenseFromLinesAction = authedActionClient
  .schema(z.object({ lineIds: z.array(z.string().uuid()).min(1).max(100) }))
  .action(async ({ parsedInput, ctx }) => {
    const result = await createExpenseFromLines(ctx.viewer, parsedInput);
    revalidatePath("/expenses");
    return { created: result.created, blocked: result.blocked };
  });

const draftFieldsInput = z
  .object({
    vendorId: z.string().uuid().nullable(),
    evidenceType: z.string().min(1).max(100).nullable(),
    paymentMethod: z.string().min(1).max(100).nullable(),
    supply: z.object({ currency: z.enum(CURRENCIES), amount: z.number().min(0), fxRate: z.number() }).strict().nullable(),
    scheduledPaymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식 오류 · 2026-09-19처럼").nullable(),
    note: z.string().max(480, "비고 480자 넘음 · 줄여 적기").nullable(),
    installment: z.boolean(),
  })
  .strict()
  .partial();

export const saveExpenseDraftAction = authedActionClient
  .schema(z.object({ expenseId: expenseIdSchema, expectedVersion: z.number().int().min(1), fields: draftFieldsInput }))
  .action(async ({ parsedInput, ctx }) => {
    const saved = await saveExpenseDraft(ctx.viewer, parsedInput);
    revalidatePath(`/expenses/${parsedInput.expenseId}`);
    return { version: saved.version, savedAt: formatKstTime(new Date()) };
  });

// 05-06 미리보기 — 저장 전 칸 값으로 계산 한 줄 · 제출 막힘 첫 이유 · 칸 오류를 받는다(쓰기 없음). 입력은 임시 저장과 같은 칸 값이다.
export const previewExpenseAction = authedActionClient
  .schema(z.object({ expenseId: expenseIdSchema, fields: draftFieldsInput }))
  .action(async ({ parsedInput, ctx }) => {
    const preview = await previewExpense(ctx.viewer, parsedInput);
    return { taxLine: preview.taxLine ?? null, block: preview.block ?? null, fieldErrors: preview.fieldErrors ?? {} };
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
    // 제출은 이미 커밋됐다 — 토스트 재료(다음 담당 이름) 읽기가 실패해도 성공으로 돌려준다(연차 신청과 같은 규칙).
    const at = formatKstTime(new Date());
    try {
      const nextHolderNames = await currentHolderNames(ctx.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: submitted.expenseId });
      return {
        kind: "submitted" as const,
        number: submitted.number,
        at,
        result: await projectActionResult(ctx.viewer, { documentId: submitted.expenseId, final: false, nextHolderNames }),
      };
    } catch (error) {
      log.warn("expense.submit_toast_material_failed", { expenseId: submitted.expenseId, error: error instanceof Error ? error.message : String(error) });
      return { kind: "submitted" as const, number: submitted.number, at, result: { documentId: submitted.expenseId, final: false } };
    }
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

export const createEvidenceViewUrlAction = authedActionClient
  .schema(z.object({ fileId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const view = await createEvidenceViewUrl(ctx.viewer, parsedInput);
    return { url: view?.url ?? null };
  });
