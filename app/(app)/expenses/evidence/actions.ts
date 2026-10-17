"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authedActionClient } from "@/lib/actions/client";
import { registerEvidenceUpload } from "@/domain/evidence-import";
import { EVIDENCE_IMPORT_MAX_ROWS } from "@/domain/evidence-import/limits";
import { getEvidenceBatch, publishEvidenceRecords } from "@/domain/evidence-records";
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

const publishInputSchema = z.object({ groups: z.array(publishGroupSchema) }).superRefine((input, ctx) => {
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
    revalidatePath("/expenses/evidence");
    return { saved: result };
  } catch (error) {
    // 전부-아니면-전무 거부 — 칸 좌표(줄 id)와 이유를 돌려준다(트랜잭션은 이미 되돌렸다).
    if (!(error instanceof SaveRejectedError)) throw error;
    const cells: EvidenceRejectedCell[] = error.formatErrors.map((cell) => ({ rowId: cell.rowId, reason: cell.reason }));
    return { rejected: { summary: error.summary, cells } };
  }
});
