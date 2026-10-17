import { and, asc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type DbOrTx } from "@/db/client";
import { actionLog, evidenceRecordLinks, evidenceRecords, expenses, purchaseRequests, users } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// 06.1-07(S3 증빙 패널): 증빙 기록 한 줄의 금액 · 확인 필요 조건부 갱신과 이력 읽기. 06.1-05 repositories/evidence-records.ts는 같은 웨이브의
// 06.1-08이 고치는 파일이라 이 플랜 몫은 여기 둔다. 이 모듈은 domain을 import하지 않는다(타입만).

export type RecordAmounts = { supplyKrw: number; vatKrw: number; totalKrw: number };

// 금액 셋 — 트랜잭션 안에서는 증빙 행을 잠근 뒤 같은 tx로(전 값 = 행동 로그 detail.before), 밖에서는 합계 판독(합계 고정 규칙의 입력)으로 부른다.
export async function readRecordAmounts(viewer: Viewer, id: string, tx: DbOrTx = db): Promise<RecordAmounts | null> {
  void viewer;
  const [row] = await tx
    .select({ supplyKrw: evidenceRecords.supplyKrw, vatKrw: evidenceRecords.vatKrw, totalKrw: evidenceRecords.totalKrw })
    .from(evidenceRecords)
    .where(eq(evidenceRecords.id, id))
    .limit(1);
  return row ?? null;
}

// 공급가 · 세액 한 줄 — id · version이 같은 줄만 바꾸고 바꿨으면 참(거짓 = 낡음). 합계 칸은 쓰지 않는다(파일 값 고정 — PA-AMT, CHECK 합계 = 공급가 + 세액은
// domain이 diffKrw로 지킨다). clearNeedsCheck면 같은 문장에서 확인 필요 칸도 비운다(DA-13 — 금액 고침과 확인 필요 풀기가 한쪽만 반영되는 길 없음).
// updated_at(timestamp)은 충돌 글자 HH:mm의 한국 시각 변환을 위해 UTC로 담는다(06.1-05 updateVisibilitiesIfVersionMatch와 같은 꼴).
export async function updateAmountIfVersionMatches(
  viewer: Viewer,
  input: { id: string; version: number; supplyKrw: number; vatKrw: number; clearNeedsCheck?: boolean },
  tx: DbOrTx,
): Promise<boolean> {
  void viewer;
  const rows = await tx
    .update(evidenceRecords)
    .set({
      supplyKrw: input.supplyKrw,
      vatKrw: input.vatKrw,
      ...(input.clearNeedsCheck ? { needsCheck: null } : {}),
      version: sql`${evidenceRecords.version} + 1`,
      updatedAt: sql`(now() at time zone 'UTC')`,
    })
    .where(and(eq(evidenceRecords.id, input.id), eq(evidenceRecords.version, input.version)))
    .returning({ id: evidenceRecords.id });
  return rows.length > 0;
}

// 확인 필요 풀기(RP-6 · PA-CONFIRM) — 확인 필요 칸만 비운다(공개 범위 · 거래처 연결 칸 그대로 — 「풀기 = 거래처 없이 씀」). 이미 빈 줄은 0행(낡음).
export async function clearNeedsCheckIfVersionMatches(viewer: Viewer, input: { id: string; version: number }, tx: DbOrTx): Promise<boolean> {
  void viewer;
  const rows = await tx
    .update(evidenceRecords)
    .set({ needsCheck: null, version: sql`${evidenceRecords.version} + 1`, updatedAt: sql`(now() at time zone 'UTC')` })
    .where(and(eq(evidenceRecords.id, input.id), eq(evidenceRecords.version, input.version), sql`${evidenceRecords.needsCheck} is not null`))
    .returning({ id: evidenceRecords.id });
  return rows.length > 0;
}

export type RecordRegistration = { createdAt: Date; createdByName: string | null };

export type RecordLinkHistoryRow = {
  ownerKind: string;
  /** 지출결의 · 구매 요청 번호 — 번호 없는 임시 지출결의 · 카드 사용은 null. */
  ownerNumber: string | null;
  attachedAt: Date;
  attachedByName: string | null;
  detachedAt: Date | null;
  detachedByName: string | null;
  detachReason: string | null;
};

export type RecordAmountChangeRow = { occurredAt: Date; actorName: string | null; detail: unknown };

export type RecordHistory = { registration: RecordRegistration | null; links: RecordLinkHistoryRow[]; amountChanges: RecordAmountChangeRow[] };

const creators = alias(users, "evidence_detail_creators");
const attachers = alias(users, "evidence_detail_attachers");
const detachers = alias(users, "evidence_detail_detachers");
const actors = alias(users, "evidence_detail_actors");

const EVIDENCE_RECORD_AMOUNT_CHANGE = "evidence_record_amount_change";

// 이력(DB-15 · PA-HISTORY) — 등록 한 줄 · 붙임 행 전부(뗀 것 포함 · 사람 이름 조인) · 이 기록의 금액 변경 로그. 금액 변경 로그는 document_id = 기록 id ·
// 종류 조건으로 읽는다(action_log_document_idx). 행동 로그 「정리」는 표시만 남기고 줄을 지우지 않으므로 정리 표시와 무관하게 읽는다(Round 2 eng B-P3).
// 기록 범위 판정은 부르는 domain이 먼저 한다.
export async function listRecordHistory(viewer: Viewer, id: string): Promise<RecordHistory> {
  void viewer;
  const [registration] = await db
    .select({ createdAt: evidenceRecords.createdAt, createdByName: creators.name })
    .from(evidenceRecords)
    .leftJoin(creators, eq(creators.id, evidenceRecords.createdBy))
    .where(eq(evidenceRecords.id, id))
    .limit(1);
  const links = await db
    .select({
      ownerKind: evidenceRecordLinks.ownerKind,
      ownerNumber: sql<string | null>`case ${evidenceRecordLinks.ownerKind} when 'expense' then ${expenses.number} when 'purchase_request' then ${purchaseRequests.number} else null end`,
      attachedAt: evidenceRecordLinks.attachedAt,
      attachedByName: attachers.name,
      detachedAt: evidenceRecordLinks.detachedAt,
      detachedByName: detachers.name,
      detachReason: evidenceRecordLinks.detachReason,
    })
    .from(evidenceRecordLinks)
    .leftJoin(expenses, and(eq(evidenceRecordLinks.ownerKind, "expense"), eq(expenses.id, evidenceRecordLinks.ownerId)))
    .leftJoin(purchaseRequests, and(eq(evidenceRecordLinks.ownerKind, "purchase_request"), eq(purchaseRequests.id, evidenceRecordLinks.ownerId)))
    .leftJoin(attachers, eq(attachers.id, evidenceRecordLinks.attachedBy))
    .leftJoin(detachers, eq(detachers.id, evidenceRecordLinks.detachedBy))
    .where(eq(evidenceRecordLinks.evidenceRecordId, id))
    .orderBy(asc(evidenceRecordLinks.attachedAt), asc(evidenceRecordLinks.id));
  const amountChanges = await db
    .select({ occurredAt: actionLog.occurredAt, actorName: actors.name, detail: actionLog.detail })
    .from(actionLog)
    .leftJoin(actors, eq(actors.id, actionLog.actorId))
    .where(and(eq(actionLog.documentId, id), eq(actionLog.actionType, EVIDENCE_RECORD_AMOUNT_CHANGE)))
    .orderBy(asc(actionLog.seq));
  return { registration: registration ?? null, links, amountChanges };
}
