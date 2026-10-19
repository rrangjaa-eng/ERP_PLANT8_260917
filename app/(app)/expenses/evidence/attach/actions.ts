"use server";

import { z } from "zod";
import { authedActionClient } from "@/lib/actions/client";
import { ATTACH_BATCH_MAX, attachEvidenceAsAuthor, attachEvidenceBatch, attachEvidenceRecord, detachEvidenceRecord, detachOwnEvidence, listAttachCandidates, previewDetach } from "@/domain/evidence-records/attach";
import { listEvidencePool } from "@/domain/evidence-records/pool";
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

// 06.1-08(RP-4 · RP-5): 증빙 고르기 S5. 풀 · 여러 장 붙이기 모두 작성자 · 범위 · 상태는 서버가 다시 읽는다 — 입력은 id 배열(1 ~ 상한) · 문서 종류 · 문서 id · 검색어뿐.
const ownerSchema = { ownerKind: z.enum(["expense", "purchase_request"]), ownerId: z.string().uuid() };
const batchSchema = z.object({ evidenceIds: z.array(z.string().uuid()).min(1).max(ATTACH_BATCH_MAX), ...ownerSchema });

export const listEvidencePoolAction = authedActionClient
  .schema(z.object({ ...ownerSchema, query: z.string().max(100).optional() }))
  .action(async ({ parsedInput, ctx }) => listEvidencePool(ctx.viewer, { owner: { kind: parsedInput.ownerKind, id: parsedInput.ownerId }, q: parsedInput.query ?? null }));

export const attachEvidenceAsAuthorAction = authedActionClient
  .schema(batchSchema)
  .action(async ({ parsedInput, ctx }) => attachEvidenceAsAuthor(ctx.viewer, { evidenceIds: parsedInput.evidenceIds, owner: { kind: parsedInput.ownerKind, id: parsedInput.ownerId } }));

export const attachEvidenceBatchAction = authedActionClient
  .schema(batchSchema)
  .action(async ({ parsedInput, ctx }) => attachEvidenceBatch(ctx.viewer, { evidenceIds: parsedInput.evidenceIds, owner: { kind: parsedInput.ownerKind, id: parsedInput.ownerId } }));

// 06.1-08 A9: 작성자 자기 떼기 — 자기 author 붙임 · 편집 가능 상태만(domain이 판정). 미리 보기는 06.1-06 previewDetach(작성자 갈래 포함).
export const detachOwnEvidenceAction = authedActionClient
  .schema(z.object({ linkId: z.string().uuid(), reason: z.string().max(500) }))
  .action(async ({ parsedInput, ctx }) => detachOwnEvidence(ctx.viewer, parsedInput));

export const previewOwnDetachAction = authedActionClient
  .schema(z.object({ linkId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => previewDetach(ctx.viewer, parsedInput));
