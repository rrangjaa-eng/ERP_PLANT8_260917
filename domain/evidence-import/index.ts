import { createHash } from "node:crypto";
import { recordAction, type CoreActionType } from "@/domain/action-log/record";
import { taxRuleSchema, type TaxRule } from "@/domain/code-tables/tax-rule";
import { CARD_USAGE_ENTITY, cardOverwriteSplit, cardUsageOverwriteBlocks, loadCardOverwriteBasis, type CardOverwriteBasis } from "@/domain/corp-card-usages";
import { CANCEL_REGISTERED_CHECK, flagSameApprovalOtherAmount, issuerText, planAmbiguousGroups, resolveCardForLine } from "@/domain/evidence-import/cards";
import { ownersWithEvidence } from "@/domain/evidence/has-evidence";
import { fileWinsPatch, planReconcile, type FileWinsPatch, type ReconcileCandidate, type ReconcileLine, type ReconcileMatch } from "@/domain/evidence-records/reconcile";
import { EVIDENCE_IMPORT_MAX_BYTES, sizeRefusalHeadline } from "@/domain/evidence-import/limits";
import { EVIDENCE_FORMATS, finalizeAmounts as defaultFinalizeAmounts, parseWorkbook as defaultParseWorkbook, type ParseResult } from "@/domain/evidence-import/registry";
import type { EvidenceFormatKey, FinalLine, FormatRule, ParseSuccess, RefusalKind } from "@/domain/evidence-import/types";
import { ensureVendorsForLines, type EnsureVendorsDeps } from "@/domain/evidence-import/vendor-autocreate";
import { loadTaxRates as defaultLoadTaxRates, type TaxRates } from "@/domain/money/tax";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { registerDto } from "@/domain/permissions/dto-registry";
import { project, type DtoSpec } from "@/domain/permissions/project";
import type { Viewer } from "@/domain/viewer";
import { BUSINESS_NO_UNIQUE_INDEX } from "@/domain/vendors";
import { withTransaction } from "@/lib/db-transaction";
import { isUniqueViolation } from "@/lib/pg-errors";
import { listCodeItems } from "@/repositories/code-tables";
import { applyFileWins, findReconcileCandidates, lockCardUsagesForUpdate, type ReconcileCandidateRow } from "@/repositories/corp-card-usages";
import { findCardsByLast4 } from "@/repositories/corp-cards";
import type { DbOrTx } from "@/repositories/document-counters";
import { findBatchIdBySha, insertBatch, lockEvidenceCardImport, setBatchCounts } from "@/repositories/evidence-import-batches";
import {
  findCardRecordsByApprovalNos,
  findArchivedDedupeKeys,
  findExistingDedupeKeys,
  flagRecordsNeedsCheckByDedupeKeys,
  insertRecordsIgnoringDuplicates,
  type EvidenceRecordInsert,
} from "@/repositories/evidence-records";
import { insertLinks, listLiveLinksWithRecords } from "@/repositories/evidence-record-links";
import { findLineLinks, lockQuoteLines } from "@/repositories/quote-line-links";
import { lockVendorAutocreate } from "@/repositories/vendors";

// 06.1-04: 증빙 등록 서비스 — 엑셀 파일 하나 → 권한 · 크기 · 읽기(06.1-02) · 사전 조회 · 한 트랜잭션(묶음 + 기록 + 행동 로그) · 결과.
// 사용자가 고칠 수 있는 거절은 던지지 않고 결과 데이터 `refused`로 돌려준다(E2 — 06.1-05가 결과 행으로 그린다).
// 06-03 tx 규약: 권한 · 세율 · 코드표 · 같은 파일 조회는 트랜잭션 전, 트랜잭션 안은 tx 리포지토리와 순수 함수만(카드 서식의 잠금 뒤 이미
// 있는 열쇠 · 카드 · 앞 기록 조회 — GH-P1 PR #252, 거래처 서식의 잠금 뒤 이미 등록 열쇠 · 거래처 조회도 tx — vendor-autocreate.ts).

export const EVIDENCE_IMPORT_BATCH_ENTITY = "evidence_import_batch";

const INTAKE_FORBIDDEN = "증빙 등록 권한 없음";
// 파일 칸이 File이 아닐 때 — 06.1-02 registry.ts의 「엑셀·CSV 아님」 거절과 같은 UI-SPEC 글자.
const NOT_A_FILE = "엑셀·CSV 파일 아님 · 내려받은 파일 그대로";
const MAX_FILE_NAME_CHARS = 255;
// GH-P1: 앞 파일과 겹친 같은 내용 줄의 열쇠 꼬리 `@{파일 sha256 앞 16자}`.
const GROUP_SHA_PREFIX_CHARS = 16;
// 이름 다름 결과 줄 — 06.1-02 줄 오류 거절과 같은 앞 5줄 + 나머지 수.
const SHOWN_NAME_MISMATCH = 5;

export type EvidenceImportRefusal = { kind: RefusalKind; headline: string; lines: string[]; restCount: number };

// 노출표를 거치는 칸 — 이름 다름 줄(사업자번호 · 파일 이름 · 등록 이름)은 증빙 내용이다.
export type EvidenceImportResultDto = { nameMismatchLines: string[] };

export const EVIDENCE_IMPORT_RESULT_DTO_SPEC: DtoSpec<Partial<EvidenceImportResultDto>, EvidenceImportResultDto> = {
  fields: [{ key: "nameMismatchLines", from: "nameMismatchLines", infoItem: "evidence.value" }],
};

registerDto({
  name: "EvidenceImportResultDto",
  fields: EVIDENCE_IMPORT_RESULT_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

// 건수 칸은 노출표 밖 구조 값이다(06.1-05 결과 행 조각과 하나씩 맞는다 — G12 · G17). 한 줄이 여러 조각에 셀 수 있다.
export type EvidenceImportCounts = {
  batchId: string;
  /** 이 묶음에서 새로 INSERT된 줄 전체(붙음 · 카드 미등록 · 확인 필요 포함). */
  registered: number;
  skippedDuplicate: number;
  sameFile: boolean;
  /** 파일 안에서 서로 지워 등록하지 않은 상쇄 쌍(E38). */
  offsetPairs: number;
  vendorCreated: number;
  vendorRestored: number;
  /** 새 줄 중 카드를 정하지 못한 카드 서식 줄. */
  cardUnknown: number;
  /** 새 줄 중 `needs_check`가 선 줄. */
  needsCheck: number;
  /** 06.1-09: 새 카드 줄 중 대사로 카드 사용에 붙은 줄(1 · 2단계). */
  cardMatched: number;
  /** 06.1-09: 새 카드 줄 중 카드는 정해졌는데 붙지 않은 줄 — 목록 「짝 없음」 상태와 같은 셈(확인 필요 · 음수 줄 포함). */
  cardUnmatched: number;
  nameMismatchRest: number;
};

export type EvidenceImportSuccess = { refused: null } & EvidenceImportCounts & Partial<EvidenceImportResultDto>;
export type EvidenceImportResult = { refused: EvidenceImportRefusal } | EvidenceImportSuccess;

export type RegisterEvidenceDeps = {
  parseWorkbook: (bytes: Uint8Array) => ParseResult;
  finalizeAmounts: typeof defaultFinalizeAmounts;
  loadTaxRates: (asOf: string) => Promise<TaxRates>;
  findVendorsByBusinessNoDigitsList: EnsureVendorsDeps["findVendorsByBusinessNoDigitsList"];
  /** 06.1-09 경합 시험 자리 — 견적 줄 잠금 뒤(N-8) · 카드 사용 잠금 뒤(E32) · 덮기 직전(0행). */
  afterLineLock: () => Promise<void>;
  afterLock: () => Promise<void>;
  beforeApply: (tx: DbOrTx) => Promise<void>;
  isActionTypeEnabled: (actionType: CoreActionType) => Promise<boolean>;
};

async function assertCanIntake(viewer: Viewer): Promise<void> {
  if (!(await can(viewer, "evidence.intake", "write"))) throw new ForbiddenError(INTAKE_FORBIDDEN);
}

function sizeRefusal(bytes: number): EvidenceImportRefusal {
  return { kind: "size", headline: sizeRefusalHeadline(bytes), lines: [], restCount: 0 };
}

function formatRuleOf(key: EvidenceFormatKey): FormatRule {
  const rule = EVIDENCE_FORMATS.find((format) => format.key === key);
  if (!rule) throw new Error(`등록 배열에 없는 서식 — ${key}`);
  return rule;
}

// 브라우저가 붙이는 경로(C:\fakepath\…) 앞부분을 떼고 255자(코드 포인트)로 자른다.
function originalNameOf(fileName: string): string {
  const base = fileName.split(/[\\/]/).at(-1) ?? "";
  return Array.from(base).slice(0, MAX_FILE_NAME_CHARS).join("");
}

// Round 2 P2-A5: 증빙 종류 코드표의 세금 규칙 맵 — domain/payments/index.ts loadPaymentShared와 같은 읽기(보관 · 비활성 포함).
async function loadEvidenceTaxRules(viewer: Viewer): Promise<Map<string, TaxRule>> {
  const items = await listCodeItems(viewer, { tableKey: "evidence_type", scope: { rows: "all", includeArchived: true }, includeInactive: true });
  const rules = new Map<string, TaxRule>();
  for (const item of items) {
    const parsed = taxRuleSchema.safeParse(item.taxRule);
    if (parsed.success) rules.set(item.value, parsed.data);
  }
  return rules;
}

// 등록 직전 줄 — 금액 · 사유 · 열쇠가 정해지고 카드가 붙은(또는 카드 미등록인) 줄.
type PlannedLine = FinalLine & { corpCardId: string | null };

function presentValues(values: readonly (string | null)[]): string[] {
  return [...new Set(values.filter((value): value is string => value !== null))];
}

// 앞 파일 대조 · GH-P1이 묻는 열쇠(카드 서식) — 상쇄 쌍 두 줄의 열쇠, 같은 파일이 아니면 줄 열쇠 전부와 홑 줄의 `{baseKey}#2`.
// 같은 파일을 다시 올리면 GH-P1을 돌리지 않는다 — 돌리면 처음 올릴 때 이미 등록한 무리를 `@` 열쇠로 또 만든다.
function keysToCheck(parsed: ParseSuccess, sameFile: boolean): string[] {
  const pairLines = parsed.offsetLines.flatMap((pair) => [pair.original, pair.cancel]);
  if (sameFile) return pairLines.map((line) => line.dedupeKey);
  return [...parsed.lines, ...pairLines].flatMap((line) => (line.sameKeyCount === 1 ? [line.dedupeKey, `${line.baseKey}#2`] : [line.dedupeKey]));
}

// 카드 서식 줄의 조회(트랜잭션 안 · 카드 등록 잠금 뒤): 끝 4자리 → 카드 후보 한 번 · 승인번호 → 앞 기록 한 번(A-10). 사유는 06.1-02 → A-10 →
// GH-P1 차례이고 먼저 선 사유를 덮지 않는다. 카드는 파일의 끝 4자리 · 카드사로만 정한다(등록자의 카드 관리 권한과 무관).
async function planCardLines(
  viewer: Viewer,
  rule: FormatRule,
  lines: readonly FinalLine[],
  existingKeys: ReadonlySet<string>,
  input: { sameFile: boolean; fileSha256: string },
  tx: DbOrTx,
): Promise<PlannedLine[]> {
  const candidates = await findCardsByLast4(viewer, presentValues(lines.map((line) => line.cardLast4)), tx);
  const earlier = await findCardRecordsByApprovalNos(viewer, rule.key, presentValues(lines.map((line) => line.approvalNo)), tx);
  const flagged = flagSameApprovalOtherAmount(lines, earlier);
  const grouped = input.sameFile ? flagged : planAmbiguousGroups(flagged, existingKeys, input.fileSha256.slice(0, GROUP_SHA_PREFIX_CHARS));
  return grouped.map((line) => ({ ...line, corpCardId: resolveCardForLine(line, rule, candidates) }));
}

function recordOf(line: PlannedLine & { vendorId: string | null }, format: EvidenceFormatKey, batchId: string, viewer: Viewer): EvidenceRecordInsert {
  return {
    batchId,
    format,
    evidenceType: line.evidenceType,
    approvalNo: line.approvalNo,
    dedupeKey: line.dedupeKey,
    issuedOn: line.issuedOn,
    supplyKrw: line.supplyKrw,
    vatKrw: line.vatKrw,
    totalKrw: line.totalKrw,
    vendorId: line.vendorId,
    businessNoDigits: line.businessNoDigits,
    nameOnDocument: line.nameOnDocument,
    merchant: line.merchant,
    corpCardId: line.corpCardId,
    cardLast4: line.cardLast4,
    needsCheck: line.needsCheck,
    originalApprovalNo: line.originalApprovalNo,
    createdBy: viewer.id,
  };
}

// ── 06.1-09 카드 대사(EVID-10 · E28 · E32 · D-6111 · 카드 R3) ─────────────────────────────────────

const CARD_FORMAT_KEYS: ReadonlySet<string> = new Set(EVIDENCE_FORMATS.filter((format) => format.keyKind === "card").map((format) => format.key));

type InsertedCardRecord = { id: string; row: EvidenceRecordInsert };
type ReconcileFacts = { candidates: ReconcileCandidateRow[]; inputs: ReconcileCandidate[] };
type ReconcileResult = { matched: number; unmatched: number };

function sameIssuerOf(rule: FormatRule, issuer: string): boolean {
  const text = issuerText(issuer);
  return rule.issuerAliases.some((alias) => text.includes(issuerText(alias)));
}

// 카드 명세(카드 서식 기록)가 이미 붙은 카드 사용 — 계획과 잠근 뒤 재확인이 같은 판독을 쓴다(N-6 — 영수증 기록 · 05 파일은 세지 않는다).
async function cardStatementOwners(viewer: Viewer, usageIds: readonly string[], tx: DbOrTx): Promise<Set<string>> {
  const links = await listLiveLinksWithRecords(viewer, { ownerKind: "corp_card_usage", ownerIds: usageIds }, tx);
  return new Set(links.filter((link) => CARD_FORMAT_KEYS.has(link.format)).map((link) => link.ownerId));
}

async function reconcileFacts(viewer: Viewer, rule: FormatRule, lines: readonly ReconcileLine[], tx: DbOrTx): Promise<ReconcileFacts> {
  const targets = lines.filter((line) => line.corpCardId !== null && line.totalKrw >= 0 && line.needsCheck === null);
  const candidates = await findReconcileCandidates(
    viewer,
    {
      cardIds: presentValues(targets.map((line) => line.corpCardId)),
      approvalNos: presentValues(targets.map((line) => line.approvalNo)),
      usedOns: [...new Set(targets.map((line) => line.usedOn))],
    },
    tx,
  );
  const ids = candidates.map((row) => row.id);
  // PA-HASEV: 증빙 있음 = 카드 사용의 05 전표 파일 · 살아 있는 붙임 ∪ 원 구매 요청의 증빙.
  const withEvidence = await ownersWithEvidence(viewer, { ownerKind: "corp_card_usage", ownerIds: ids }, tx);
  const requestIds = presentValues(candidates.map((row) => row.purchaseRequestId));
  const requestsWithEvidence = await ownersWithEvidence(viewer, { ownerKind: "purchase_request", ownerIds: requestIds }, tx);
  const statements = await cardStatementOwners(viewer, ids, tx);
  const inputs = candidates.map((row) => ({
    id: row.id,
    version: row.version,
    corpCardId: row.corpCardId,
    sameIssuer: sameIssuerOf(rule, row.cardIssuer),
    approvalNo: row.approvalNo,
    usedOn: row.usedOn,
    totalKrw: row.totalAmountKrw,
    hasEvidence: withEvidence.has(row.id) || (row.purchaseRequestId !== null && requestsWithEvidence.has(row.purchaseRequestId)),
    cardStatementAttached: statements.has(row.id),
  }));
  return { candidates, inputs };
}

type PlannedPair = { match: ReconcileMatch; candidate: ReconcileCandidateRow; record: InsertedCardRecord; patch: FileWinsPatch };

function patchChanges(pair: PlannedPair): boolean {
  return pair.patch.total !== null || pair.patch.card !== null;
}

// 등록 트랜잭션 안(기록 INSERT 뒤). 잠금 순서: (카드 등록 잠금 →) 견적 줄(id 순 한 호출 · N-8) → 카드 사용(id 순 한 호출). 프로젝트 행은 잠그지 않는다(T-061-907).
// 잠근 뒤 version · 견적 줄 · 붙임이 계획과 다르면 그 짝은 짝 없음이다(E32). 덮기 막힘(holder · fixed · completed · cap)도 짝 없음 — 붙임 · 덮기 · 기록 0.
async function reconcileCardRecords(
  viewer: Viewer,
  rule: FormatRule,
  records: readonly InsertedCardRecord[],
  basis: CardOverwriteBasis,
  deps: Partial<RegisterEvidenceDeps> | undefined,
  tx: DbOrTx,
): Promise<ReconcileResult> {
  const placed = records.filter((record) => record.row.corpCardId !== null);
  const lines: ReconcileLine[] = placed.map((record) => ({
    recordId: record.id,
    corpCardId: record.row.corpCardId,
    approvalNo: record.row.approvalNo,
    usedOn: record.row.issuedOn,
    totalKrw: record.row.totalKrw,
    needsCheck: record.row.needsCheck,
  }));
  if (lines.length === 0) return { matched: 0, unmatched: 0 };
  const facts = await reconcileFacts(viewer, rule, lines, tx);
  const plan = planReconcile(lines, facts.inputs);
  const candidateOf = new Map(facts.candidates.map((row) => [row.id, row]));
  const recordOf = new Map(placed.map((record) => [record.id, record]));
  let pairs: PlannedPair[] = plan.matches.flatMap((match) => {
    const candidate = candidateOf.get(match.usageId);
    const record = recordOf.get(match.recordId);
    if (!candidate || !record || !record.row.corpCardId) return [];
    const patch = fileWinsPatch(
      { totalKrw: candidate.totalAmountKrw, corpCardId: candidate.corpCardId, cardLast4: candidate.cardLast4 },
      { totalKrw: record.row.totalKrw, corpCardId: record.row.corpCardId, cardLast4: record.row.cardLast4 ?? "", approvalNo: record.row.approvalNo },
    );
    return [{ match, candidate, record, patch }];
  });

  // N-8: 합계가 바뀌는 견적 줄 연결 짝의 줄(저장된 줄 + 사슬의 현재 줄)을 카드 사용보다 먼저 잠근다 — 06 createCardUsage가 같은 현재 줄을 잡는다.
  const lineIds = presentValues(pairs.filter((pair) => pair.patch.total !== null).map((pair) => pair.candidate.quoteLineId));
  if (lineIds.length > 0) {
    const chains = await findLineLinks(viewer, lineIds, tx);
    const lockIds = [...new Set([...lineIds, ...presentValues([...chains.values()].map((links) => links.currentLineId))])];
    await lockQuoteLines(viewer, lockIds, tx);
    await deps?.afterLineLock?.();
  }
  const locked = new Map((await lockCardUsagesForUpdate(viewer, pairs.map((pair) => pair.candidate.id), tx)).map((row) => [row.id, row]));
  await deps?.afterLock?.();
  const statements = await cardStatementOwners(viewer, [...locked.keys()], tx);
  pairs = pairs.filter((pair) => {
    const row = locked.get(pair.candidate.id);
    if (!row || row.archivedAt !== null || row.version !== pair.match.version || row.quoteLineId !== pair.candidate.quoteLineId) return false;
    return pair.match.step === 1 ? !statements.has(row.id) : row.liveLinks === 0;
  });

  const blocks = await cardUsageOverwriteBlocks(
    viewer,
    pairs.filter(patchChanges).map((pair) => ({ usageId: pair.candidate.id, totalKrw: pair.patch.total?.after ?? null, corpCardId: pair.patch.card?.after.id ?? null })),
    basis,
    tx,
  );
  pairs = pairs.filter((pair) => !blocks.has(pair.candidate.id));
  await deps?.beforeApply?.(tx);

  const applied: PlannedPair[] = [];
  for (const pair of pairs) {
    const fillsApproval = pair.patch.approvalNo !== null && pair.patch.approvalNo !== pair.candidate.approvalNo;
    if (!patchChanges(pair) && !fillsApproval) {
      applied.push(pair);
      continue;
    }
    const split = pair.patch.total ? cardOverwriteSplit(basis, { evidenceTypeCode: pair.candidate.evidenceTypeCode, usedOn: pair.candidate.usedOn, totalKrw: pair.patch.total.after }) : null;
    const version = await applyFileWins(
      viewer,
      {
        id: pair.candidate.id,
        version: pair.match.version,
        corpCardId: pair.patch.card?.after.id ?? pair.candidate.corpCardId,
        approvalNo: pair.patch.approvalNo ?? pair.candidate.approvalNo,
        total: split ? { totalKrw: split.totalKrw, supplyKrw: split.supplyKrw, vatKrw: split.vatKrw } : null,
      },
      tx,
    );
    if (version === null) continue;
    applied.push(pair);
    if (!patchChanges(pair)) continue;
    // D-6111 · RP-2: 덮은 전 · 후는 끌 수 없는 증빙 기록 금액 변경 종류로(06 공급가액 고침 종류와 섞지 않는다).
    await recordAction(
      viewer,
      {
        actionType: "evidence_record_amount_change",
        entity: CARD_USAGE_ENTITY,
        entityId: pair.candidate.id,
        detail: {
          before: { totalKrw: pair.candidate.totalAmountKrw, supplyKrw: pair.candidate.supplyKrw, vatKrw: pair.candidate.vatKrw },
          after: split ? { totalKrw: split.totalKrw, supplyKrw: split.supplyKrw, vatKrw: split.vatKrw } : { totalKrw: pair.candidate.totalAmountKrw, supplyKrw: pair.candidate.supplyKrw, vatKrw: pair.candidate.vatKrw },
          cardLast4Before: pair.candidate.cardLast4,
          cardLast4After: pair.patch.card?.after.last4 ?? pair.candidate.cardLast4,
          evidenceRecordId: pair.record.id,
        },
      },
      { tx, isActionTypeEnabled: deps?.isActionTypeEnabled },
    );
  }
  await insertLinks(
    viewer,
    applied.map((pair) => ({ recordId: pair.record.id, ownerKind: "corp_card_usage", ownerId: pair.candidate.id, attachMode: "reconcile" })),
    tx,
  );
  return { matched: applied.length, unmatched: placed.length - applied.length };
}

// 서버 액션의 파일 칸 하나(FormData `file`) → 등록. 크기는 바이트를 읽기 전에 File.size로 잰다(액션 본문 크기 미들웨어는
// JSON 길이만 잰다 — lib/actions/payload-size.ts). 첫 방어선은 06.1-05 브라우저 사전 검사다.
export async function registerEvidenceUpload(viewer: Viewer, file: unknown, deps?: Partial<RegisterEvidenceDeps>): Promise<EvidenceImportResult> {
  await assertCanIntake(viewer);
  if (!(file instanceof File)) return { refused: { kind: "not-excel", headline: NOT_A_FILE, lines: [], restCount: 0 } };
  if (file.size > EVIDENCE_IMPORT_MAX_BYTES) return { refused: sizeRefusal(file.size) };
  return registerEvidenceFile(viewer, { bytes: new Uint8Array(await file.arrayBuffer()), fileName: file.name }, deps);
}

export async function registerEvidenceFile(
  viewer: Viewer,
  input: { bytes: Uint8Array; fileName: string },
  deps?: Partial<RegisterEvidenceDeps>,
): Promise<EvidenceImportResult> {
  await assertCanIntake(viewer);
  if (input.bytes.length > EVIDENCE_IMPORT_MAX_BYTES) return { refused: sizeRefusal(input.bytes.length) };
  const parsed = (deps?.parseWorkbook ?? defaultParseWorkbook)(input.bytes);
  if (!parsed.ok) return { refused: { kind: parsed.kind, headline: parsed.headline, lines: parsed.lines, restCount: parsed.restCount } };
  const rule = formatRuleOf(parsed.format);

  // E8: 06.1-02의 두 단계 — 역산 날짜마다 세율 한 번(같은 날짜는 한 번) + 증빙 종류 세금 규칙 맵 한 번 → 금액 확정.
  const loadRates = deps?.loadTaxRates ?? defaultLoadTaxRates;
  const ratesByDate = new Map<string, TaxRates>();
  for (const date of parsed.rateDates) ratesByDate.set(date, await loadRates(date));
  const rulesByType = await loadEvidenceTaxRules(viewer);

  // 06.1-09 대사 덮기 재료(세율 · 증빙 종류 규칙)는 트랜잭션 전에 읽는다(06-03) — deps.loadTaxRates의 날짜 셈과 섞지 않는다.
  const overwriteBasis = rule.keyKind === "card" ? await loadCardOverwriteBasis(viewer, [...new Set([...parsed.lines, ...parsed.offsetLines.flatMap((pair) => [pair.original, pair.cancel])].map((line) => line.issuedOn))]) : null;
  const fileSha256 = createHash("sha256").update(input.bytes).digest("hex");
  const sameFile = (await findBatchIdBySha(viewer, fileSha256)) !== null;
  const card = rule.keyKind === "card";
  // 앞 파일 대조(사용자 결정 2026-10-16 · 양쪽 대칭): 파일 안 상쇄 쌍의 한쪽(원거래든 취소든)만 앞 파일로 이미 등록돼 있으면 다른
  // 쪽을 등록해 합을 0으로 맞추고, 둘 다 등록돼 있으면 둘 다 이미 등록, 둘 다 없으면 둘 다 등록하지 않고 상쇄 쌍으로 센다(06.1-02가
  // 뺀 그대로). 이미 있는 열쇠는 GH-P1과 한 번에 읽는다. 등록된 한쪽이 보관돼 있으면 그 쌍은 맞추지 않는다(둘 다 등록하지 않음 —
  // 다른 쪽만 살아 합이 −T가 된다). 보관 기록도 같은 줄의 재등록은 그대로 막는다(열쇠를 차지한다).
  // GH-P1(PR #252): 이 판정은 카드 등록 잠금 뒤 tx로 읽는다 — 트랜잭션 전에 읽으면 원거래만 든 파일과 쌍 파일이 겹칠 때 둘 다 서로의
  // 줄을 못 봐 원거래만 살아 남는다. 카드 서식이 아니면 열쇠를 묻지 않는다(조회 없음 · 그대로).
  const planLines = async (tx: DbOrTx) => {
    const existingKeys = card ? await findExistingDedupeKeys(viewer, keysToCheck(parsed, sameFile), tx) : new Set<string>();
    const offsetKeys = parsed.offsetLines.flatMap((pair) => [pair.original.dedupeKey, pair.cancel.dedupeKey]).filter((key) => existingKeys.has(key));
    const archivedKeys = await findArchivedDedupeKeys(viewer, offsetKeys, tx);
    const settledPairs = parsed.offsetLines.filter((pair) => {
      const registered = [pair.original, pair.cancel].filter((line) => existingKeys.has(line.dedupeKey));
      return registered.length === 2 || (registered.length === 1 && registered.every((line) => !archivedKeys.has(line.dedupeKey)));
    });
    const missingHalves = settledPairs.flatMap((pair) => [pair.original, pair.cancel].filter((line) => !existingKeys.has(line.dedupeKey)));
    // P2-1(사용자 결정 2026-10-17 「지금 막기」): 맞춘 쌍의 원거래는 확인 필요 — 앞 파일로 등록된 원거래는 취소 줄이 실제로 들어간 뒤
    // UPDATE로(write), 앞 파일의 취소에 맞춰 새로 넣는 원거래는 사유 차례(06.1-02 → A-10 → GH-P1)의 끝에 세운다. 새로 넣는 원거래의
    // 열쇠는 앞 파일에 없어 GH-P1이 `@`로 바꾸지 않는다.
    const cancelOfRegisteredOriginal = new Map(
      settledPairs.filter((pair) => existingKeys.has(pair.original.dedupeKey) && !existingKeys.has(pair.cancel.dedupeKey)).map((pair) => [pair.cancel.dedupeKey, pair.original.dedupeKey]),
    );
    const newOriginalKeys = new Set(settledPairs.filter((pair) => existingKeys.has(pair.cancel.dedupeKey) && !existingKeys.has(pair.original.dedupeKey)).map((pair) => pair.original.dedupeKey));
    const lines = (deps?.finalizeAmounts ?? defaultFinalizeAmounts)([...parsed.lines, ...missingHalves], ratesByDate, rulesByType);
    const planned: PlannedLine[] = (
      card ? await planCardLines(viewer, rule, lines, existingKeys, { sameFile, fileSha256 }, tx) : lines.map((line) => ({ ...line, corpCardId: null }))
    ).map((line) => (newOriginalKeys.has(line.dedupeKey) ? { ...line, needsCheck: line.needsCheck ?? CANCEL_REGISTERED_CHECK } : line));
    return {
      planned,
      cancelOfRegisteredOriginal,
      settledAlready: settledPairs.length * 2 - missingHalves.length,
      offsetPairs: parsed.offsetPairs - settledPairs.length,
    };
  };
  const originalName = originalNameOf(input.fileName);
  const rowCount = parsed.lines.length + parsed.offsetLines.length * 2;

  const write = () =>
    withTransaction(async (tx) => {
      // GH-P1: 카드 서식은 카드 등록 잠금이 첫 줄이고 줄 판정(planLines)은 그 뒤에 tx로 읽는다.
      if (card) await lockEvidenceCardImport(viewer, tx);
      // (eng B-P3) 거래처를 만드는 서식은 거래처 잠금이 첫 줄이고, 이미 등록된 줄은 그 뒤에 걸러 새 줄만 거래처 단계로 보낸다(E11) —
      // 잠금 앞에서 거르면 기다리는 사이 다른 등록이 커밋한 줄이 「새 줄」로 남아 그 사이 보관된 거래처를 되살린다.
      if (rule.createsVendor) await lockVendorAutocreate(viewer, tx);
      const { planned, cancelOfRegisteredOriginal, settledAlready, offsetPairs } = await planLines(tx);
      const already = rule.createsVendor ? await findExistingDedupeKeys(viewer, planned.map((line) => line.dedupeKey), tx) : new Set<string>();
      // 묶음을 먼저 만들어 거래처 로그 detail에 묶음 id를 담는다(D-6114).
      const batch = await insertBatch(viewer, { format: parsed.format, originalName, fileSha256, rowCount, uploadedBy: viewer.id }, tx);
      const linked = await ensureVendorsForLines(viewer, planned.filter((line) => !already.has(line.dedupeKey)), rule, batch.id, tx, deps);
      const rows = linked.lines.map((line) => recordOf(line, parsed.format, batch.id, viewer));
      const insertedIds = new Map((await insertRecordsIgnoringDuplicates(viewer, rows, tx)).map((row) => [row.dedupeKey, row.id]));
      const insertedKeys = new Set(insertedIds.keys());
      const inserted = rows.filter((row) => insertedKeys.has(row.dedupeKey));
      const flaggedOriginals = [...cancelOfRegisteredOriginal].filter(([cancelKey]) => insertedKeys.has(cancelKey)).map(([, originalKey]) => originalKey);
      await flagRecordsNeedsCheckByDedupeKeys(viewer, flaggedOriginals, CANCEL_REGISTERED_CHECK, tx);
      const reconciled = overwriteBasis
        ? await reconcileCardRecords(viewer, rule, inserted.flatMap((row) => { const id = insertedIds.get(row.dedupeKey); return id ? [{ id, row }] : []; }), overwriteBasis, deps, tx)
        : { matched: 0, unmatched: 0 };
      const counts = {
        rowCount,
        registered: inserted.length,
        // 걸러 낸 줄 · INSERT가 건너뛴 줄은 이미 등록 — 앞 파일과 맞춘 상쇄 쌍에서 앞 파일로 이미 등록된 줄도 이미 등록이다.
        skippedDuplicate: planned.length - inserted.length + settledAlready,
        offsetPairs,
        vendorCreated: linked.created,
        vendorRestored: linked.restored,
        cardUnknown: card ? inserted.filter((row) => row.corpCardId === null).length : 0,
        needsCheck: inserted.filter((row) => row.needsCheck !== null).length,
        cardMatched: reconciled.matched,
        cardUnmatched: reconciled.unmatched,
      };
      await setBatchCounts(viewer, batch.id, { registeredCount: counts.registered, skippedDuplicateCount: counts.skippedDuplicate }, tx);
      await recordAction(viewer, { actionType: "document_create", entity: EVIDENCE_IMPORT_BATCH_ENTITY, entityId: batch.id, detail: counts }, { tx });
      return { batchId: batch.id, ...counts, nameMismatchLines: linked.nameMismatchLines };
    });
  // RP-7: 관리 화면 저장은 거래처 잠금을 쓰지 않아 조회와 생성 · 되살림 사이에 같은 번호가 살아날 수 있다 — 유일 색인 위반이면
  // 트랜잭션을 통째로 한 번 다시 돈다(앞 시도는 롤백됐다 · 트랜잭션 전 조회 값은 그대로 쓰고 줄 판정은 tx로 다시 읽는다). 두 번째 위반은 그대로 던진다.
  const written = await write().catch((error: unknown) => {
    if (!isUniqueViolation(error, BUSINESS_NO_UNIQUE_INDEX)) throw error;
    return write();
  });

  const shownMismatch = written.nameMismatchLines.slice(0, SHOWN_NAME_MISMATCH);
  const projected = await project(viewer, { nameMismatchLines: shownMismatch }, EVIDENCE_IMPORT_RESULT_DTO_SPEC);
  return {
    refused: null,
    batchId: written.batchId,
    registered: written.registered,
    skippedDuplicate: written.skippedDuplicate,
    sameFile,
    offsetPairs: written.offsetPairs,
    vendorCreated: written.vendorCreated,
    vendorRestored: written.vendorRestored,
    cardUnknown: written.cardUnknown,
    needsCheck: written.needsCheck,
    cardMatched: written.cardMatched,
    cardUnmatched: written.cardUnmatched,
    nameMismatchRest: written.nameMismatchLines.length - shownMismatch.length,
    ...projected,
  };
}
