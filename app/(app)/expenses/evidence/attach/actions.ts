"use server";

import { z } from "zod";
import { authedActionClient } from "@/lib/actions/client";
import { attachEvidenceRecord, detachEvidenceRecord, listAttachCandidates, previewDetach } from "@/domain/evidence-records/attach";
import "./actions.registry";

// 06.1-06(RP-4 · RP-6): 증빙 기록 붙이기 · 떼기. 권한 · 범위 · 상태 · 짝 판정은 전부 domain이 한다 — 입력은 id와 검색어 · 사유뿐이다
// (금액 · version 칸 없음 — 문서 금액은 붙이기가 바꾸지 않는다, D-6520).
export const listAttachCandidatesAction = authedActionClient
  .schema(z.object({ recordId: z.string().uuid(), query: z.string().max(100).optional() }))
  .action(async ({ parsedInput, ctx }) => listAttachCandidates(ctx.viewer, { recordId: parsedInput.recordId, query: parsedInput.query ?? null }));

export const attachEvidenceRecordAction = authedActionClient
  .schema(z.object({ recordId: z.string().uuid(), ownerKind: z.enum(["expense", "purchase_request"]), ownerId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) =>
    attachEvidenceRecord(ctx.viewer, { recordId: parsedInput.recordId, owner: { kind: parsedInput.ownerKind, id: parsedInput.ownerId } }),
  );

export const detachEvidenceRecordAction = authedActionClient
  .schema(z.object({ linkId: z.string().uuid(), reason: z.string().max(500) }))
  .action(async ({ parsedInput, ctx }) => detachEvidenceRecord(ctx.viewer, parsedInput));

export const previewDetachAction = authedActionClient
  .schema(z.object({ linkId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => previewDetach(ctx.viewer, parsedInput));
