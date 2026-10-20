"use server";

import { z } from "zod";
import { authedActionClient } from "@/lib/actions/client";
import { registerEvidenceUpload } from "@/domain/evidence-import";
import { EVIDENCE_IMPORT_MAX_ROWS } from "@/domain/evidence-import/limits";
import {
  EVIDENCE_PAGE_SIZE,
  EvidenceArchiveConflictError,
  archiveEvidenceRecord,
  getEvidenceBatch,
  listEvidenceRecordsByIds,
  publishEvidenceRecords,
  getEvidenceDetail,
  restoreEvidenceRecord,
} from "@/domain/evidence-records";
import { EvidenceAmountConflictError, clearRecordNeedsCheck, previewEvidenceAmount, updateEvidenceAmount } from "@/domain/evidence-records/amount";
import { SaveRejectedError } from "@/domain/quotes/lines";
import "./actions.registry";

// 06.1-04: 파일 하나 = 액션 하나(Q1 · E10). 판별 · 크기 · 권한 · 등록은 전부 domain이 한다 — 여기서는 FormData만 받는다.
// 06.1-05: 성공이면 결과 행 1행의 서식 이름을 함께 싣는다(06.1-02 서식 규칙 라벨 — 브라우저는 서식 표를 import하지 않는다).
export const registerEvidenceFileAction = authedActionClient
  .schema(z.instanceof(FormData))
  .action(async ({ parsedInput, ctx }) => {
    const result = await registerEvidenceUpload(ctx.viewer, parsedInput.get("file"));
    if (result.refused) return result;
    const batch = await getEvidenceBatch(ctx.viewer, result.batchId);
    return { ...result, formatLabel: batch?.formatLabel ?? null };
  });

// 06.1-05(Round 2 P2-B1): 공개 범위 저장 — 공개 값 · 팀마다 한 묶음, 줄은 `[id, version]`만(줄마다 객체면 2,100줄 남짓에서 본문 256KB를
// 넘는다). 본부 공개의 본부는 서버가 설정 값으로 정한다 — 이 입력에 그 칸이 없다(C3 · E20).
const publishGroupSchema = z.object({
  visibility: z.enum(["private", "team", "division"]),
  teamId: z.string().uuid().optional(),
  items: z.array(z.tuple([z.string().uuid(), z.number().int()])),
});

// O-6106: `refresh` = 저장한 줄 중 화면 한 쪽에 보이는 줄(최대 50) — 같은 범위로 다시 읽어 돌려준다. 목록은 다시 받지 않는다
// (저장된 줄은 다음 불러오기 전까지 자리에 남고 상태 글자만 바뀐다 — `할 일` 보기에서 줄이 빠지며 표가 뛰지 않게, UI-SPEC S2 「저장」).
const publishInputSchema = z.object({ groups: z.array(publishGroupSchema), refresh: z.array(z.string().uuid()).max(EVIDENCE_PAGE_SIZE).optional() }).superRefine((input, ctx) => {
  const ids = input.groups.flatMap((group) => group.items.map(([id]) => id));
  if (ids.length > EVIDENCE_IMPORT_MAX_ROWS) ctx.addIssue({ code: "custom", message: `${EVIDENCE_IMPORT_MAX_ROWS} 이하만 가능 · 값 확인` });
  // 같은 줄을 두 묶음에 실은 요청은 화면이 만들지 않는다 — 요청 전체 거부.
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "입력값 오류 · 값 확인" });
});

export type EvidenceRejectedCell = { rowId: string | undefined; reason: string };

export const publishEvidenceRecordsAction = authedActionClient.schema(publishInputSchema).action(async ({ parsedInput, ctx }) => {
  try {
    const result = await publishEvidenceRecords(ctx.viewer, {
      groups: parsedInput.groups.map((group) => ({ visibility: group.visibility, ...(group.teamId ? { teamId: group.teamId } : {}), items: group.items })),
    });
    return { saved: result, rows: await listEvidenceRecordsByIds(ctx.viewer, parsedInput.refresh ?? []) };
  } catch (error) {
    // 전부-아니면-전무 거부 — 칸 좌표(줄 id)와 이유를 돌려준다(트랜잭션은 이미 되돌렸다). 합계 행 글자는 화면이 칸 수로 쓴다(DA-18).
    if (!(error instanceof SaveRejectedError)) throw error;
    const cells: EvidenceRejectedCell[] = error.formatErrors.map((cell) => ({ rowId: cell.rowId, reason: cell.reason }));
    return { rejected: { cells } };
  }
});

// 06.1-05(DA-7 · E41) — 보관 · 되살림 한 줄. 충돌(낡은 version · 그사이 붙음 · 이미 그 상태)은 오류가 아니라 결과다 — 화면이 그 글자와
// `새로 고침`을 결과 줄에 세운다(PA-ARC-FAIL). 되돌리기는 보관이 돌려준 version으로 되살림을 부른다. 05 `restoreEvidenceAction`(지운 파일
// 되돌리기)과 이름이 다르다 — 레지스트리는 같은 이름을 거부한다.
const archiveInputSchema = z.object({ id: z.string().uuid(), version: z.number().int() });

export const archiveEvidenceRecordAction = authedActionClient.schema(archiveInputSchema).action(async ({ parsedInput, ctx }) => {
  try {
    return { record: await archiveEvidenceRecord(ctx.viewer, parsedInput) };
  } catch (error) {
    if (!(error instanceof EvidenceArchiveConflictError)) throw error;
    return { conflict: error.message };
  }
});

export const restoreEvidenceRecordAction = authedActionClient.schema(archiveInputSchema).action(async ({ parsedInput, ctx }) => {
  try {
    return { record: await restoreEvidenceRecord(ctx.viewer, parsedInput) };
  } catch (error) {
    if (!(error instanceof EvidenceArchiveConflictError)) throw error;
    return { conflict: error.message };
  }
});

// 06.1-07(S3 증빙 패널) — 단건 상세 · 공급가 미리 보기 · 금액 저장 · 확인 필요 풀기. 세액 · 합계는 서버가 공급가에서 셈한다(PA-AMT) —
// 입력에 그 칸이 없다. 낡은 version은 오류가 아니라 결과(`conflict` 글자)다 — 패널이 그 줄 꼬리 `새로 고침`으로 다시 불러온다(DA-23 · B-R1).
const detailInputSchema = z.object({ id: z.string().uuid() });

export const getEvidenceDetailAction = authedActionClient.schema(detailInputSchema).action(async ({ parsedInput, ctx }) => ({
  detail: await getEvidenceDetail(ctx.viewer, parsedInput.id),
}));

const previewEvidenceAmountInput = z.object({ id: z.string().uuid(), supplyKrw: z.number().int() });

export const previewEvidenceAmountAction = authedActionClient
  .schema(previewEvidenceAmountInput)
  .action(async ({ parsedInput, ctx }) => previewEvidenceAmount(ctx.viewer, parsedInput));

const updateEvidenceAmountInput = z.object({
  id: z.string().uuid(),
  version: z.number().int(),
  supplyKrw: z.number().int(),
});

export const updateEvidenceAmountAction = authedActionClient.schema(updateEvidenceAmountInput).action(async ({ parsedInput, ctx }) => {
  try {
    return { record: await updateEvidenceAmount(ctx.viewer, parsedInput) };
  } catch (error) {
    if (!(error instanceof EvidenceAmountConflictError)) throw error;
    return { conflict: error.message };
  }
});

const clearRecordNeedsCheckInput = z.object({ id: z.string().uuid(), version: z.number().int(), supplyKrw: z.number().int().optional() });

export const clearRecordNeedsCheckAction = authedActionClient.schema(clearRecordNeedsCheckInput).action(async ({ parsedInput, ctx }) => {
  try {
    return { record: await clearRecordNeedsCheck(ctx.viewer, parsedInput) };
  } catch (error) {
    if (!(error instanceof EvidenceAmountConflictError)) throw error;
    return { conflict: error.message };
  }
});
