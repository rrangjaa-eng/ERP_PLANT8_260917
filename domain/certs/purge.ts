import { certRrnPurgeTarget } from "@/domain/certs/prize-value";
import { recordAction, type RecordActionDeps } from "@/domain/action-log/record";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { kstDayStart, kstYear } from "@/lib/kst-date";
import { withTransaction } from "@/lib/db-transaction";
import { getSignatureStore, type SignatureStore } from "@/lib/storage/signature-store";
import {
  clearClosedEventIpHashes,
  clearSignatureKey,
  clearSubmissionPersonalFields,
  countClosedEventIpHashes,
  listPendingSignatureFiles,
  listPurgeCandidates,
  listRrnPurgeCandidates,
} from "@/repositories/cert-purge";
import { deleteSignatureUploadIntent, listStaleSignatureUploadIntents } from "@/repositories/cert-submissions";

// CERT-02 — 확인증 파기. 기한이 지난 개인정보 칸만 비우고 행은 남긴다(세무 기록). DB를 먼저 비우고 서명 파일은
// 커밋 뒤에 지운다 — 파일 삭제가 끝날 때까지 signature_key가 삭제 대기 표시로 남아 다음 실행이 다시 지운다.
// 기능 플래그를 보지 않는다(꺼도 보존 기간이 지난 개인정보는 지워진다). 오류 · 로그에 개인정보 · 객체 키를 넣지 않는다.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const ORPHAN_AFTER_HOURS = 24;

// 제출한 해(KST) 종료 + 법인세 신고기한(법인세법 제116조① · 국세기본법 제85조의3② — 12월 결산은 다음 해 3월 31일) 다음 날 + 보존 기간 — (제출 KST 연도 + 1 + 보존 연수)-04-01 00:00 KST.
export function certPurgeDeadline(submittedAt: Date, retentionYears: number): Date {
  return kstDayStart(`${kstYear(submittedAt) + 1 + retentionYears}-04-01`);
}

export type CertPurgeResult = {
  submissions: number;
  filesDeleted: number;
  filesPending: number;
  orphansDeleted: number;
  ipCleared: number;
  rrnCleared: number;
};

export type CertPurgeDeps = {
  signatureStore: SignatureStore;
  appendActionLog: RecordActionDeps["appendActionLog"];
};

// 미리 보기(apply: false)는 같은 여섯 칸에 「지울 개수」를 돌려주고 아무것도 바꾸지 않는다(filesPending은 0).
export async function runCertPurge(
  input: { now: Date; apply: boolean },
  deps?: Partial<CertPurgeDeps>,
): Promise<CertPurgeResult> {
  const { now, apply } = input;

  const retentionDue = (await listPurgeCandidates(SYSTEM_VIEWER, new Date(now.getTime() - 365 * DAY_MS))).filter(
    (row) => now.getTime() >= certPurgeDeadline(row.submittedAt, row.retentionYears).getTime(),
  );
  const retentionDueIds = new Set(retentionDue.map((row) => row.id));

  // CS-2 a — 법인세 신고기한(법인세법 제116조① · 국세기본법 제85조의3②) 다음 날(제출 연도 다음 해 4월 1일) 이상 · 실행 시점 가액 × 수량 ≤ 50,000. 같은 실행에서
  // 보존 기한 파기 대상인 줄은 어차피 전부 비워지므로 뺀다.
  const rrnDue = (await listRrnPurgeCandidates(SYSTEM_VIEWER, kstDayStart(`${kstYear(now)}-01-01`))).filter(
    (row) =>
      !retentionDueIds.has(row.id) &&
      now.getTime() >= certPurgeDeadline(row.submittedAt, 0).getTime() &&
      certRrnPurgeTarget(row.unitValueKrw, row.quantity),
  );

  const orphanKeys = await listStaleSignatureUploadIntents(SYSTEM_VIEWER, new Date(now.getTime() - ORPHAN_AFTER_HOURS * HOUR_MS));
  const closedBefore = new Date(now.getTime() - DAY_MS);

  if (!apply) {
    const pendingFiles = await listPendingSignatureFiles(SYSTEM_VIEWER);
    // 삭제 대기이면서 보존 기한에도 닿은 줄은 한 번만 센다 — 제출 id 합집합.
    const fileIds = new Set([...pendingFiles.map((file) => file.id), ...retentionDue.filter((row) => row.hasSignature).map((row) => row.id)]);
    return {
      submissions: retentionDue.length,
      filesDeleted: fileIds.size,
      filesPending: 0,
      orphansDeleted: orphanKeys.length,
      ipCleared: await countClosedEventIpHashes(SYSTEM_VIEWER, closedBefore),
      rrnCleared: rrnDue.length,
    };
  }

  // 칸 비우기와 행동 로그는 한 트랜잭션 — 로그 쓰기가 실패하면 비우기도 되돌아간다(C6).
  const counts = await withTransaction(async (tx) => {
    const ipCleared = await clearClosedEventIpHashes(SYSTEM_VIEWER, closedBefore, tx);
    const purged = await clearSubmissionPersonalFields(
      SYSTEM_VIEWER,
      retentionDue.map((row) => row.id),
      { mode: "purge", at: now },
      tx,
    );
    const rrn = await clearSubmissionPersonalFields(
      SYSTEM_VIEWER,
      rrnDue.map((row) => row.id),
      { mode: "belowThreshold", at: now },
      tx,
    );
    await recordAction(
      SYSTEM_VIEWER,
      {
        actionType: "cert_purge",
        entity: "cert_submission",
        detail: { submissions: purged.cleared, filesQueued: purged.withSignature, rrnCleared: rrn.cleared },
      },
      { tx, appendActionLog: deps?.appendActionLog },
    );
    return { ipCleared, submissions: purged.cleared, rrnCleared: rrn.cleared };
  });

  const store = deps?.signatureStore ?? getSignatureStore();
  let filesDeleted = 0;
  let filesPending = 0;

  for (const file of await listPendingSignatureFiles(SYSTEM_VIEWER)) {
    try {
      await store.delete(file.signatureKey);
      await clearSignatureKey(SYSTEM_VIEWER, file.id, file.signatureKey);
      filesDeleted += 1;
    } catch {
      filesPending += 1;
    }
  }

  let orphansDeleted = 0;
  for (const key of orphanKeys) {
    try {
      await store.delete(key);
      await deleteSignatureUploadIntent(SYSTEM_VIEWER, key);
      orphansDeleted += 1;
    } catch {
      filesPending += 1;
    }
  }

  return { ...counts, filesDeleted, filesPending, orphansDeleted };
}
