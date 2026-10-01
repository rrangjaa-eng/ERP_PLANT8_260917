import { and, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { certEvents, certPrizes, certSubmissions } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// 파기 전용 · 권한 판정 없음 · domain/certs/purge.ts만 SYSTEM_VIEWER로 부른다(칸 비우기는 04.3-17 「대조 제외」도 부른다).
// 행을 지우는 문장이 없다 — 개인정보 칸만 UPDATE로 비운다(세무 기록 보존, domain/archive/index.ts 불변식).

export type PurgeCandidateRow = {
  id: string;
  submittedAt: Date;
  retentionYears: number;
  hasSignature: boolean;
};

// 보존 기한 파기의 거친 후보 — 아직 파기되지 않았고 제출 시각이 submittedBefore보다 이른 줄. 정확한 기한 판정은 domain.
export async function listPurgeCandidates(viewer: Viewer, submittedBefore: Date): Promise<PurgeCandidateRow[]> {
  void viewer;
  const rows = await db
    .select({
      id: certSubmissions.id,
      submittedAt: certSubmissions.submittedAt,
      retentionYears: certSubmissions.retentionYears,
      signatureKey: certSubmissions.signatureKey,
    })
    .from(certSubmissions)
    .where(and(isNull(certSubmissions.purgedAt), lt(certSubmissions.submittedAt, submittedBefore)));
  return rows.map(({ signatureKey, ...rest }) => ({ ...rest, hasSignature: signatureKey !== null }));
}

export type RrnPurgeCandidateRow = {
  id: string;
  submittedAt: Date;
  quantity: number;
  unitValueKrw: number;
};

// CS-2 a 후보 — 파기되지 않았고 주민등록번호 칸이 남은 줄(대조 제외로 이미 비운 줄은 저절로 빠진다)에
// 실행 시점 경품 가액을 붙인다. 정확한 판정(기한 · 가액 × 수량)은 domain.
export async function listRrnPurgeCandidates(viewer: Viewer, submittedBefore: Date): Promise<RrnPurgeCandidateRow[]> {
  void viewer;
  return db
    .select({
      id: certSubmissions.id,
      submittedAt: certSubmissions.submittedAt,
      quantity: certSubmissions.quantity,
      unitValueKrw: certPrizes.unitValueKrw,
    })
    .from(certSubmissions)
    .innerJoin(certPrizes, eq(certPrizes.id, certSubmissions.prizeId))
    .where(
      and(
        isNull(certSubmissions.purgedAt),
        isNotNull(certSubmissions.rrnEncrypted),
        lt(certSubmissions.submittedAt, submittedBefore),
      ),
    );
}

export type ClearMode = "purge" | "exclude" | "belowThreshold";

export type ClearResult = { cleared: number; withSignature: number };

// 칸 비우기 하나를 세 모드로 — purge: 이름 · 주민 암호문 · 가린 값 · 연락처 · 주소 · IP 가명을 비우고 purged_at을 채운다 ·
// exclude(대조 제외): 이름 · purged_at만 두고 나머지를 비운다 · belowThreshold(CS-2 a): 주민 암호문 · 가린 값만 비운다.
// signature_key는 어느 모드도 건드리지 않는다 — 삭제 대기 표시로 남아 파일 삭제가 끝난 뒤 비운다.
// 파기되지 않은 줄에만 쓰고(조건부 UPDATE), 전체 보기의 FOR SHARE 잠금이 있으면 그 커밋까지 기다린다.
export async function clearSubmissionPersonalFields(
  viewer: Viewer,
  submissionIds: string[],
  options: { mode: ClearMode; at: Date },
  tx: DbOrTx,
): Promise<ClearResult> {
  void viewer;
  if (submissionIds.length === 0) return { cleared: 0, withSignature: 0 };

  const { mode, at } = options;
  const common = { version: sql`${certSubmissions.version} + 1`, updatedAt: at };
  const values =
    mode === "purge"
      ? {
          ...common,
          name: null,
          rrnEncrypted: null,
          rrnMasked: null,
          phone: null,
          address: null,
          submitIpHash: null,
          purgedAt: at,
        }
      : mode === "exclude"
        ? { ...common, rrnEncrypted: null, rrnMasked: null, phone: null, address: null, submitIpHash: null }
        : { ...common, rrnEncrypted: null, rrnMasked: null };
  const guard =
    mode === "belowThreshold"
      ? and(isNull(certSubmissions.purgedAt), isNotNull(certSubmissions.rrnEncrypted))
      : isNull(certSubmissions.purgedAt);

  const rows = await tx
    .update(certSubmissions)
    .set(values)
    .where(and(inArray(certSubmissions.id, submissionIds), guard))
    .returning({ signatureKey: certSubmissions.signatureKey });
  return { cleared: rows.length, withSignature: rows.filter((row) => row.signatureKey !== null).length };
}

// 닫힌 지 1일 넘은 행사(담당자가 닫은 시각 또는 마감이 closedBefore보다 이른 행사)의 제출에 남은 속도 제한용 IP 가명.
const closedEventIds = (closedBefore: Date) =>
  db
    .select({ id: certEvents.id })
    .from(certEvents)
    .where(or(lt(certEvents.closedAt, closedBefore), lt(certEvents.expiresAt, closedBefore)));

export async function countClosedEventIpHashes(viewer: Viewer, closedBefore: Date): Promise<number> {
  void viewer;
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(certSubmissions)
    .where(and(isNotNull(certSubmissions.submitIpHash), inArray(certSubmissions.eventId, closedEventIds(closedBefore))));
  return row?.count ?? 0;
}

export async function clearClosedEventIpHashes(viewer: Viewer, closedBefore: Date, tx: DbOrTx): Promise<number> {
  void viewer;
  const rows = await tx
    .update(certSubmissions)
    .set({ submitIpHash: null })
    .where(and(isNotNull(certSubmissions.submitIpHash), inArray(certSubmissions.eventId, closedEventIds(closedBefore))))
    .returning({ id: certSubmissions.id });
  return rows.length;
}

export type PendingSignatureFile = { id: string; signatureKey: string };

// 삭제 대기 파일 — 파기됐거나 대조 제외된 줄에 아직 signature_key가 남은 것(이번 실행 것 + 지난 실패분).
export async function listPendingSignatureFiles(viewer: Viewer): Promise<PendingSignatureFile[]> {
  void viewer;
  const rows = await db
    .select({ id: certSubmissions.id, signatureKey: certSubmissions.signatureKey })
    .from(certSubmissions)
    .where(
      and(
        isNotNull(certSubmissions.signatureKey),
        or(isNotNull(certSubmissions.purgedAt), isNotNull(certSubmissions.excludedAt)),
      ),
    );
  return rows.flatMap((row) => (row.signatureKey === null ? [] : [{ id: row.id, signatureKey: row.signatureKey }]));
}

// 파일을 지운 뒤 삭제 대기 표시를 비운다 — 다른 실행이 이미 비웠거나 키가 달라졌으면 건드리지 않는다.
export async function clearSignatureKey(viewer: Viewer, submissionId: string, signatureKey: string): Promise<void> {
  void viewer;
  await db
    .update(certSubmissions)
    .set({ signatureKey: null })
    .where(
      and(
        eq(certSubmissions.id, submissionId),
        eq(certSubmissions.signatureKey, signatureKey),
        or(isNotNull(certSubmissions.purgedAt), isNotNull(certSubmissions.excludedAt)),
      ),
    );
}
