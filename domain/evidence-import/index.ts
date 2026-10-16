import { createHash } from "node:crypto";
import { recordAction } from "@/domain/action-log/record";
import { taxRuleSchema, type TaxRule } from "@/domain/code-tables/tax-rule";
import { flagSameApprovalOtherAmount, planAmbiguousGroups, resolveCardForLine } from "@/domain/evidence-import/cards";
import { EVIDENCE_IMPORT_MAX_BYTES, sizeRefusalHeadline } from "@/domain/evidence-import/limits";
import { EVIDENCE_FORMATS, finalizeAmounts as defaultFinalizeAmounts, parseWorkbook as defaultParseWorkbook, type ParseResult } from "@/domain/evidence-import/registry";
import type { EvidenceFormatKey, FinalLine, FormatRule, ParseSuccess, RefusalKind } from "@/domain/evidence-import/types";
import { loadTaxRates as defaultLoadTaxRates, type TaxRates } from "@/domain/money/tax";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { registerDto } from "@/domain/permissions/dto-registry";
import { project, type DtoSpec } from "@/domain/permissions/project";
import type { Viewer } from "@/domain/viewer";
import { withTransaction } from "@/lib/db-transaction";
import { listCodeItems } from "@/repositories/code-tables";
import { findCardsByLast4 } from "@/repositories/corp-cards";
import { findBatchIdBySha, insertBatch, setBatchCounts } from "@/repositories/evidence-import-batches";
import {
  findCardRecordsByApprovalNos,
  findExistingDedupeKeys,
  insertRecordsIgnoringDuplicates,
  type EvidenceRecordInsert,
} from "@/repositories/evidence-records";

// 06.1-04: 증빙 등록 서비스 — 엑셀 파일 하나 → 권한 · 크기 · 읽기(06.1-02) · 사전 조회 · 한 트랜잭션(묶음 + 기록 + 행동 로그) · 결과.
// 사용자가 고칠 수 있는 거절은 던지지 않고 결과 데이터 `refused`로 돌려준다(E2 — 06.1-05가 결과 행으로 그린다).
// 06-03 tx 규약: 권한 · 세율 · 코드표 · 같은 파일 · 이미 있는 열쇠 · 카드 · 앞 기록 조회는 트랜잭션 전, 트랜잭션 안은 tx 리포지토리와 순수 함수만.

export const EVIDENCE_IMPORT_BATCH_ENTITY = "evidence_import_batch";

const INTAKE_FORBIDDEN = "증빙 등록 권한 없음";
// 파일 칸이 File이 아닐 때 — 06.1-02 registry.ts의 「엑셀·CSV 아님」 거절과 같은 UI-SPEC 글자.
const NOT_A_FILE = "엑셀·CSV 파일 아님 · 내려받은 파일 그대로";
const MAX_FILE_NAME_CHARS = 255;
// GH-P1: 앞 파일과 겹친 같은 내용 줄의 열쇠 꼬리 `@{파일 sha256 앞 16자}`.
const GROUP_SHA_PREFIX_CHARS = 16;

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
  nameMismatchRest: number;
};

export type EvidenceImportSuccess = { refused: null } & EvidenceImportCounts & Partial<EvidenceImportResultDto>;
export type EvidenceImportResult = { refused: EvidenceImportRefusal } | EvidenceImportSuccess;

export type RegisterEvidenceDeps = {
  parseWorkbook: (bytes: Uint8Array) => ParseResult;
  finalizeAmounts: typeof defaultFinalizeAmounts;
  loadTaxRates: (asOf: string) => Promise<TaxRates>;
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

// 앞 파일 대조 · GH-P1이 묻는 열쇠(카드 서식) — 상쇄 쌍의 원거래 열쇠, 같은 파일이 아니면 줄 열쇠 전부와 홑 줄의 `{baseKey}#2`.
// 같은 파일을 다시 올리면 GH-P1을 돌리지 않는다 — 돌리면 처음 올릴 때 이미 등록한 무리를 `@` 열쇠로 또 만든다.
function keysToCheck(parsed: ParseSuccess, sameFile: boolean): string[] {
  const originals = parsed.offsetLines.map((pair) => pair.original.dedupeKey);
  if (sameFile) return originals;
  const lines = [...parsed.lines, ...parsed.offsetLines.map((pair) => pair.cancel)];
  return [...originals, ...lines.flatMap((line) => (line.sameKeyCount === 1 ? [line.dedupeKey, `${line.baseKey}#2`] : [line.dedupeKey]))];
}

// 카드 서식 줄의 사전 조회(트랜잭션 전): 끝 4자리 → 카드 후보 한 번 · 승인번호 → 앞 기록 한 번(A-10). 사유는 06.1-02 → A-10 →
// GH-P1 차례이고 먼저 선 사유를 덮지 않는다. 카드는 파일의 끝 4자리 · 카드사로만 정한다(등록자의 카드 관리 권한과 무관).
async function planCardLines(
  viewer: Viewer,
  rule: FormatRule,
  lines: readonly FinalLine[],
  existingKeys: ReadonlySet<string>,
  input: { sameFile: boolean; fileSha256: string },
): Promise<PlannedLine[]> {
  const candidates = await findCardsByLast4(viewer, presentValues(lines.map((line) => line.cardLast4)));
  const earlier = await findCardRecordsByApprovalNos(viewer, rule.key, presentValues(lines.map((line) => line.approvalNo)));
  const flagged = flagSameApprovalOtherAmount(lines, earlier);
  const grouped = input.sameFile ? flagged : planAmbiguousGroups(flagged, existingKeys, input.fileSha256.slice(0, GROUP_SHA_PREFIX_CHARS));
  return grouped.map((line) => ({ ...line, corpCardId: resolveCardForLine(line, rule, candidates) }));
}

function recordOf(line: PlannedLine, format: EvidenceFormatKey, batchId: string, viewer: Viewer): EvidenceRecordInsert {
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
    vendorId: null,
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

  const fileSha256 = createHash("sha256").update(input.bytes).digest("hex");
  const sameFile = (await findBatchIdBySha(viewer, fileSha256)) !== null;
  const card = rule.keyKind === "card";
  // 앞 파일 대조(사용자 결정 2026-10-16): 파일 안 상쇄 쌍의 원거래가 앞 파일로 이미 등록돼 있으면 취소 줄을 등록해 합을 0으로
  // 맞춘다 — 원거래가 없으면 둘 다 등록하지 않는다(06.1-02가 뺀 그대로). 이미 있는 열쇠는 GH-P1과 한 번에 읽는다.
  const existingKeys = card ? await findExistingDedupeKeys(viewer, keysToCheck(parsed, sameFile)) : new Set<string>();
  const cancels = parsed.offsetLines.filter((pair) => existingKeys.has(pair.original.dedupeKey)).map((pair) => pair.cancel);
  const lines = (deps?.finalizeAmounts ?? defaultFinalizeAmounts)([...parsed.lines, ...cancels], ratesByDate, rulesByType);
  const planned = card
    ? await planCardLines(viewer, rule, lines, existingKeys, { sameFile, fileSha256 })
    : lines.map((line) => ({ ...line, corpCardId: null }));
  const originalName = originalNameOf(input.fileName);
  const rowCount = parsed.lines.length + parsed.offsetLines.length * 2;
  const offsetPairs = parsed.offsetPairs - cancels.length;

  const written = await withTransaction(async (tx) => {
    const batch = await insertBatch(viewer, { format: parsed.format, originalName, fileSha256, rowCount, uploadedBy: viewer.id }, tx);
    const rows = planned.map((line) => recordOf(line, parsed.format, batch.id, viewer));
    const insertedKeys = new Set((await insertRecordsIgnoringDuplicates(viewer, rows, tx)).map((row) => row.dedupeKey));
    const inserted = rows.filter((row) => insertedKeys.has(row.dedupeKey));
    const counts = {
      rowCount,
      registered: inserted.length,
      // 취소 줄을 등록한 쌍의 원거래 줄은 앞 파일로 이미 등록된 줄이다.
      skippedDuplicate: rows.length - inserted.length + cancels.length,
      offsetPairs,
      cardUnknown: card ? inserted.filter((row) => row.corpCardId === null).length : 0,
      needsCheck: inserted.filter((row) => row.needsCheck !== null).length,
    };
    await setBatchCounts(viewer, batch.id, { registeredCount: counts.registered, skippedDuplicateCount: counts.skippedDuplicate }, tx);
    await recordAction(viewer, { actionType: "document_create", entity: EVIDENCE_IMPORT_BATCH_ENTITY, entityId: batch.id, detail: counts }, { tx });
    return { batchId: batch.id, ...counts };
  });

  const projected = await project(viewer, { nameMismatchLines: [] }, EVIDENCE_IMPORT_RESULT_DTO_SPEC);
  return {
    refused: null,
    batchId: written.batchId,
    registered: written.registered,
    skippedDuplicate: written.skippedDuplicate,
    sameFile,
    offsetPairs: written.offsetPairs,
    vendorCreated: 0,
    vendorRestored: 0,
    cardUnknown: written.cardUnknown,
    needsCheck: written.needsCheck,
    nameMismatchRest: 0,
    ...projected,
  };
}
