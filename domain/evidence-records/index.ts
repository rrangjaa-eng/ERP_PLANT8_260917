import { z } from "zod";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { EVIDENCE_IMPORT_MAX_ROWS } from "@/domain/evidence-import/limits";
import { EVIDENCE_FORMATS } from "@/domain/evidence-import/registry";
import type { FormatRule } from "@/domain/evidence-import/types";
import { formatKstTime } from "@/domain/holidays/business-day";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { registerDto } from "@/domain/permissions/dto-registry";
import { projectMany, type DtoSpec } from "@/domain/permissions/project";
import { evidenceScopeFor } from "@/domain/permissions/scope-for";
import { SaveRejectedError, type CellFormatError } from "@/domain/quotes/lines";
import { EVIDENCE_VISIBILITY_DIVISION_ORG_UNIT } from "@/domain/settings/keys";
import { getSettingValue, SettingNotFoundError } from "@/domain/settings/registry";
import { visible } from "@/domain/permissions/visible";
import {
  evidenceKindLabel,
  evidenceRecordStatus,
  evidenceRowAction,
  evidenceVisibilityCell,
  evidenceVisibilityLabel,
  type EvidenceRecordStatusInput,
  type EvidenceRecordVisibility,
  type EvidenceRecordWord,
  type EvidenceRowAction,
  type EvidenceVisibilityCell,
} from "@/domain/evidence-records/status";
import type { Viewer } from "@/domain/viewer";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { withTransaction } from "@/lib/db-transaction";
import { seoulToday } from "@/lib/dates";
import { kstDateTimeOf } from "@/lib/kst-date";
import { clampPage, pageCountFrom } from "@/lib/paging";
import {
  EVIDENCE_VISIBILITY_UPDATE_CHUNK,
  countAndSumForScope,
  findBatchSummary,
  findRecordForScope,
  hasAnyRecordForScope,
  listProposalTargets,
  listRecordsByIdsForScope,
  listRecordsForScope,
  lockRecordsForUpdate,
  setRecordArchivedIfVersionMatches,
  updateVisibilitiesIfVersionMatch as defaultUpdateVisibilities,
  type EvidenceProposalTarget,
  type EvidenceRecordFilters,
  type EvidenceRecordListRow,
  type EvidenceRecordState,
  type EvidenceVisibilityUpdate,
  type LockedEvidenceRecord,
} from "@/repositories/evidence-records";
import type { DbOrTx } from "@/repositories/document-counters";
import { findOrgUnitById } from "@/repositories/org-units";
import { findMembershipsAtDate } from "@/repositories/team-memberships";
import { findTeamsByIds, listTeams, type TeamRow } from "@/repositories/teams";

// 06.1-05: 증빙 기록(06.1 일괄 등록이 만든 줄) 목록 · 단건 · 공개 범위 저장. 이름은 `…Record(s)`다 — 05의 `domain/evidence`
// (`listEvidence` · `restoreEvidence` — 문서에 붙은 파일)와 겹치지 않는다(RP-6). 행 범위는 06.1-01 evidenceScopeFor를 요청마다
// 한 번(트랜잭션 밖) 읽어 리포지토리 where절이 집행한다 — 화면은 거르지 않는다.

export type { EvidenceRecordVisibility, EvidenceRecordWord, EvidenceRowAction, EvidenceVisibilityCell } from "@/domain/evidence-records/status";

export const INTAKE_FORBIDDEN = "증빙 등록 권한 없음";
// 화면이 만들 수 없는 요청(같은 줄 두 번 · 없는 줄 · 본부 설정 없음의 본부 공개 — PA-DIV-UNSET)은 줄 오류 없이 요청 전체를 거부한다.
// 글자는 입력 검증의 일반 문구(lib/actions/zod-error-message.ts) 그대로다.
const INVALID_REQUEST = "입력값 오류 · 값 확인";
export const EVIDENCE_PAGE_SIZE = 50;

// 06.1-02 서식 규칙 — 서식 이름(결과 · 목록 1행) · 카드 서식(keyKind) · 카드사 이름(별칭 첫 값).
const FORMAT_RULES = new Map<string, FormatRule>(EVIDENCE_FORMATS.map((rule) => [rule.key, rule]));
const CARD_FORMATS: readonly string[] = EVIDENCE_FORMATS.filter((rule) => rule.keyKind === "card").map((rule) => rule.key);

export type EvidenceRecordDto = {
  id: string;
  version: number;
  batchId: string;
  format: string;
  formatLabel: string;
  evidenceType: string;
  typeLabel: string | null;
  issuedOn: string;
  /** 1행 — 카드 줄은 가맹점, 그 밖은 문서에 적힌 거래처 이름. */
  counterparty: string | null;
  businessNo: string | null;
  /** `{카드사} {끝 4자리}` — 카드 번호는 끝 4자리만(T-061-45). */
  cardLabel: string | null;
  supplyKrw: number;
  vatKrw: number;
  totalKrw: number;
  visibility: EvidenceRecordVisibility;
  visibleTeamId: string | null;
  /** 공개 칸에 보이는 글자 — `미공개` · `{팀} 공개` · `{저장 당시 본부} 공개`. */
  visibilityLabel: string;
  statusWord: EvidenceRecordWord;
  statusDetail: string | null;
  visibilityCell: EvidenceVisibilityCell;
  /** 행 행동 열의 3차(DA-7) — 서버 판정. 화면은 이 값대로 `보관` · `되살리기`를 그리거나 그리지 않는다. */
  rowAction: EvidenceRowAction;
};

// 금액 셋 = 증빙 금액, 나머지 = 증빙 내용(팀 · 본부 이름이 든 상태 2행도 증빙 기록의 공개 칸이다).
export const EVIDENCE_RECORD_DTO_SPEC: DtoSpec<EvidenceRecordDto, EvidenceRecordDto> = {
  fields: [
    { key: "id", from: "id", infoItem: "evidence.value" },
    { key: "version", from: "version", infoItem: "evidence.value" },
    { key: "batchId", from: "batchId", infoItem: "evidence.value" },
    { key: "format", from: "format", infoItem: "evidence.value" },
    { key: "formatLabel", from: "formatLabel", infoItem: "evidence.value" },
    { key: "evidenceType", from: "evidenceType", infoItem: "evidence.value" },
    { key: "typeLabel", from: "typeLabel", infoItem: "evidence.value" },
    { key: "issuedOn", from: "issuedOn", infoItem: "evidence.value" },
    { key: "counterparty", from: "counterparty", infoItem: "evidence.value" },
    { key: "businessNo", from: "businessNo", infoItem: "evidence.value" },
    { key: "cardLabel", from: "cardLabel", infoItem: "evidence.value" },
    { key: "supplyKrw", from: "supplyKrw", infoItem: "evidence.amount" },
    { key: "vatKrw", from: "vatKrw", infoItem: "evidence.amount" },
    { key: "totalKrw", from: "totalKrw", infoItem: "evidence.amount" },
    { key: "visibility", from: "visibility", infoItem: "evidence.value" },
    { key: "visibleTeamId", from: "visibleTeamId", infoItem: "evidence.value" },
    { key: "visibilityLabel", from: "visibilityLabel", infoItem: "evidence.value" },
    { key: "statusWord", from: "statusWord", infoItem: "evidence.value" },
    { key: "statusDetail", from: "statusDetail", infoItem: "evidence.value" },
    { key: "visibilityCell", from: "visibilityCell", infoItem: "evidence.value" },
    { key: "rowAction", from: "rowAction", infoItem: "evidence.value" },
  ],
};

registerDto({
  name: "EvidenceRecordDto",
  fields: EVIDENCE_RECORD_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

export type EvidenceRecordView = Partial<EvidenceRecordDto>;

/** 서버 제안(C1) — 화면은 dirty 면으로 그리고 사람이 바꾼 칸과 따로 둔다(DA-4). */
export type EvidenceProposal = { id: string; version: number; visibility: "team" | "division"; teamId?: string; label: string };

export type EvidenceDivision = { id: string; name: string };

export type { EvidenceRecordState } from "@/repositories/evidence-records";

// 필터 줄 select 셋(UI-SPEC S2 「`[상태 ▾]` 값」 · 종류 · 기간). 값은 쿼리(`?state=&type=&period=&batch=`)라 새로 고침 · 뒤로에 남는다.
// 상태는 첫 값이 기본(`할 일` — DA-10), 종류 값은 증빙 종류 코드값(라벨로 가르지 않는다 — 수정세금계산서는 세금계산서에 든다, DA-8).
export const EVIDENCE_STATE_FILTERS: readonly { value: EvidenceRecordState; label: string }[] = [
  { value: "todo", label: "할 일" },
  { value: "private", label: "미공개" },
  { value: "published", label: "공개" },
  { value: "attached", label: "붙음" },
  { value: "unmatched", label: "짝 없는 카드 줄" },
  { value: "needs-check", label: "확인 필요" },
  { value: "card-unknown", label: "카드 미등록" },
  { value: "archived", label: "보관됨" },
  { value: "all", label: "전체" },
];

export const EVIDENCE_TYPE_FILTERS: readonly { value: string; label: string }[] = [
  { value: "", label: "전체" },
  { value: "tax_invoice", label: "세금계산서" },
  { value: "invoice", label: "계산서" },
  { value: "cash_receipt", label: "현금영수증" },
  { value: "card_receipt", label: "카드" },
];

export type EvidencePeriod = "all" | "this-month" | "last-month";

// O-6105: 기본 전체 — `할 일` 기본 필터가 이미 범위를 좁힌다.
export const EVIDENCE_PERIOD_FILTERS: readonly { value: EvidencePeriod; label: string }[] = [
  { value: "this-month", label: "이번 달" },
  { value: "last-month", label: "지난달" },
  { value: "all", label: "전체" },
];

/** 쿼리 그대로(검증 전) — 모르는 값은 기본값으로 읽는다. */
export type EvidenceListQuery = { state?: string; type?: string; period?: string; batch?: string; page?: string };

export type EvidenceListFilters = { state: EvidenceRecordState; type: string; period: EvidencePeriod; batch: string | null };

/** 필터 기본값 — 모르는 쿼리 값은 이것으로 읽고, 화면은 이 값과 같은 쿼리를 주소에서 뺀다. */
export const EVIDENCE_LIST_DEFAULTS: EvidenceListFilters = { state: "todo", type: "", period: "all", batch: null };

export type EvidenceRecordList = {
  rows: EvidenceRecordView[];
  proposals: EvidenceProposal[];
  /** 설정 「증빙 본부 공개 대상」 — 값이 없으면 null(본부 선택지를 숨긴다 — PA-DIV-UNSET). */
  division: EvidenceDivision | null;
  /** 읽은 필터 값(모르는 값은 기본값으로 고친 뒤). */
  filters: EvidenceListFilters;
  /** 범위 안에 줄이 하나라도 있나(보관 포함) — 없으면 빈 상태 `등록한 증빙이 없습니다` · 필터 줄 없음. */
  hasAny: boolean;
  /** 합계 행 — 필터 결과 전체(쪽과 무관). 금액은 `evidence.amount`를 볼 때만. */
  total: { count: number; amounts: { supplyKrw: number; vatKrw: number; totalKrw: number } | null };
  /** 서식 그룹 줄 `{서식 이름} · {건수}` — 필터 결과 기준. */
  groups: { format: string; label: string; count: number }[];
  page: { page: number; pageCount: number; pageSize: number; total: number };
  /** batch 표시(DA-19) `{파일 이름}` — 등록 권한자(범위 all)에게만. */
  batch: { id: string; fileName: string } | null;
};

function isCardFormat(format: string): boolean {
  return FORMAT_RULES.get(format)?.keyKind === "card";
}

function cardLabelOf(format: string, cardLast4: string | null): string | null {
  const issuer = FORMAT_RULES.get(format)?.issuerAliases[0];
  if (!issuer || cardLast4 === null) return null;
  return `${issuer} ${cardLast4}`;
}

function businessNoOf(digits: string | null): string | null {
  if (digits === null || digits.length !== 10) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

function asVisibility(value: string): EvidenceRecordVisibility {
  return value === "team" || value === "division" ? value : "private";
}

function statusInputOf(row: EvidenceRecordListRow): EvidenceRecordStatusInput {
  return {
    archived: row.archivedAt !== null,
    isCardFormat: isCardFormat(row.format),
    corpCardId: row.corpCardId,
    cardLabel: cardLabelOf(row.format, row.cardLast4),
    needsCheck: row.needsCheck,
    attached: row.attached,
    negative: row.totalKrw < 0,
    visibility: asVisibility(row.visibility),
    teamName: row.teamName,
    divisionName: row.orgUnitName,
    privateTypeName: row.privateToOwner ? row.typeLabel : null,
  };
}

function sourceOf(row: EvidenceRecordListRow): EvidenceRecordDto {
  const input = statusInputOf(row);
  const status = evidenceRecordStatus(input);
  return {
    id: row.id,
    version: row.version,
    batchId: row.batchId,
    format: row.format,
    formatLabel: FORMAT_RULES.get(row.format)?.label ?? row.format,
    evidenceType: row.evidenceType,
    typeLabel: evidenceKindLabel({ evidenceType: row.evidenceType, typeLabel: row.typeLabel, originalApprovalNo: row.originalApprovalNo }),
    issuedOn: row.issuedOn,
    counterparty: row.merchant ?? row.nameOnDocument,
    businessNo: businessNoOf(row.businessNoDigits),
    cardLabel: input.cardLabel,
    supplyKrw: row.supplyKrw,
    vatKrw: row.vatKrw,
    totalKrw: row.totalKrw,
    visibility: input.visibility,
    visibleTeamId: row.visibleTeamId,
    visibilityLabel: evidenceVisibilityLabel(input),
    statusWord: status.word,
    statusDetail: status.detail,
    visibilityCell: evidenceVisibilityCell(input),
    rowAction: evidenceRowAction(input),
  };
}

// 설정 본부 — 트랜잭션 밖 읽기. 값이 없으면 null(PA-DIV-UNSET).
async function readDivision(viewer: Viewer): Promise<EvidenceDivision | null> {
  let id: string;
  try {
    id = await getSettingValue(EVIDENCE_VISIBILITY_DIVISION_ORG_UNIT);
  } catch (error) {
    if (error instanceof SettingNotFoundError) return null;
    throw error;
  }
  const unit = await findOrgUnitById(viewer, id);
  return unit ? { id: unit.id, name: unit.name } : null;
}

// O-6102 · C1: 카드 줄 = 카드의 팀, 없으면 소지자의 오늘 발령 팀 → 팀 공개 / 그 밖(또는 보관 · 없는 팀) = 설정 본부 공개.
// 일괄 읽기(D P3-7) — 카드는 제안 대상 질의의 왼쪽 조인, 발령은 findMembershipsAtDate 한 번, 팀은 findTeamsByIds 한 번.
async function proposalsFor(viewer: Viewer, targets: readonly EvidenceProposalTarget[], division: EvidenceDivision | null): Promise<EvidenceProposal[]> {
  const holderIds = [...new Set(targets.flatMap((target) => (target.cardTeamId === null && target.cardHolderUserId !== null ? [target.cardHolderUserId] : [])))];
  const memberships = await findMembershipsAtDate(viewer, holderIds, seoulToday());
  const holderTeam = new Map(memberships.map((membership) => [membership.userId, membership.teamId]));
  const teamIds = [...new Set([...targets.flatMap((target) => (target.cardTeamId === null ? [] : [target.cardTeamId])), ...holderTeam.values()])];
  const liveTeams = new Map((await findTeamsByIds(viewer, teamIds)).filter((team) => team.archivedAt === null).map((team) => [team.id, team]));
  return targets.flatMap((target): EvidenceProposal[] => {
    const teamId = target.cardTeamId ?? (target.cardHolderUserId === null ? undefined : holderTeam.get(target.cardHolderUserId));
    const team = teamId === undefined ? undefined : liveTeams.get(teamId);
    if (team) return [{ id: target.id, version: target.version, visibility: "team", teamId: team.id, label: `${team.name} 공개` }];
    if (division) return [{ id: target.id, version: target.version, visibility: "division", label: `${division.name} 공개` }];
    return [];
  });
}

const UUID = z.string().uuid();

function monthStart(year: number, month: number): string {
  const index = year * 12 + (month - 1);
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}-01`;
}

// 기간 — 한국 날짜(seoulToday)의 달 경계, 반열린 구간 [그달 1일, 다음 달 1일).
function issuedRangeOf(period: EvidencePeriod, today: string): EvidenceRecordFilters["issuedOn"] {
  if (period === "all") return null;
  const [year, month] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const start = period === "this-month" ? month : month - 1;
  return { from: monthStart(year, start), before: monthStart(year, start + 1) };
}

function oneOf<T extends string>(options: readonly { value: T }[], raw: string | undefined, fallback: T): T {
  return options.find((option) => option.value === raw)?.value ?? fallback;
}

function readFilters(query: EvidenceListQuery): EvidenceListFilters {
  return {
    state: oneOf(EVIDENCE_STATE_FILTERS, query.state, EVIDENCE_LIST_DEFAULTS.state),
    type: oneOf(EVIDENCE_TYPE_FILTERS, query.type, EVIDENCE_LIST_DEFAULTS.type),
    period: oneOf(EVIDENCE_PERIOD_FILTERS, query.period, EVIDENCE_LIST_DEFAULTS.period),
    batch: query.batch !== undefined && UUID.safeParse(query.batch).success ? query.batch : null,
  };
}

function repositoryFilters(filters: EvidenceListFilters): EvidenceRecordFilters {
  return {
    cardFormats: CARD_FORMATS,
    state: filters.state,
    evidenceType: filters.type === "" ? null : filters.type,
    issuedOn: issuedRangeOf(filters.period, seoulToday()),
    batchId: filters.batch,
  };
}

// 목록 한 쪽(50건) + 필터 결과 전체의 합계 · 서식 그룹 건수 · 제안. 행 범위는 evidenceScopeFor 한 번(트랜잭션 밖)을 리포지토리 where가 집행한다.
export async function listEvidenceRecords(viewer: Viewer, query: EvidenceListQuery = {}): Promise<EvidenceRecordList> {
  const scope = await evidenceScopeFor(viewer);
  const filters = readFilters(query);
  const repoFilters = repositoryFilters(filters);
  const [formatTotals, amountShown] = await Promise.all([countAndSumForScope(viewer, scope, repoFilters), visible(viewer, "evidence.amount")]);
  const count = formatTotals.reduce((sum, row) => sum + row.count, 0);
  const pageCount = pageCountFrom(count, EVIDENCE_PAGE_SIZE);
  const page = clampPage(query.page, pageCount);
  const [rows, division, hasAny, batch] = await Promise.all([
    count === 0 ? Promise.resolve([]) : listRecordsForScope(viewer, scope, repoFilters, { limit: EVIDENCE_PAGE_SIZE, offset: (page - 1) * EVIDENCE_PAGE_SIZE }),
    readDivision(viewer),
    count > 0 ? Promise.resolve(true) : hasAnyRecordForScope(viewer, scope),
    // 묶음(등록 묶음의 원래 파일 이름)은 등록 권한자(범위 all)만 본다.
    scope.rows === "all" && filters.batch !== null ? findBatchSummary(viewer, filters.batch) : Promise.resolve(null),
  ]);
  // 제안은 공개 범위를 저장할 수 있는 사람(등록 권한 = 범위 all)에게만 — 보기 범위(published)의 줄은 이미 공개된 줄이다.
  const proposals = scope.rows === "all" ? await proposalsFor(viewer, await listProposalTargets(viewer, scope, repoFilters, EVIDENCE_IMPORT_MAX_ROWS), division) : [];
  const sum = (key: "supplyKrw" | "vatKrw" | "totalKrw") => formatTotals.reduce((total, row) => total + row[key], 0);
  return {
    rows: await projectMany(viewer, rows.map(sourceOf), EVIDENCE_RECORD_DTO_SPEC),
    proposals,
    division,
    filters,
    hasAny,
    total: { count, amounts: amountShown ? { supplyKrw: sum("supplyKrw"), vatKrw: sum("vatKrw"), totalKrw: sum("totalKrw") } : null },
    groups: formatTotals.map((row) => ({ format: row.format, label: FORMAT_RULES.get(row.format)?.label ?? row.format, count: row.count })),
    page: { page, pageCount, pageSize: EVIDENCE_PAGE_SIZE, total: count },
    batch: batch ? { id: batch.id, fileName: batch.originalName } : null,
  };
}

// P-3 · DA-10: 지출결의 목록 필터 줄 끝 `증빙 {N}`의 N — 기본 보기 `할 일`과 같은 집합(확인 필요 포함 · 보관 · 카드 미등록 제외).
// 등록 권한(evidence.intake 쓰기)이 없으면 null(링크 없음).
export async function countTodoEvidence(viewer: Viewer): Promise<number | null> {
  if (!(await can(viewer, "evidence.intake", "write"))) return null;
  const totals = await countAndSumForScope(viewer, { rows: "all" }, repositoryFilters(EVIDENCE_LIST_DEFAULTS));
  return totals.reduce((sum, row) => sum + row.count, 0);
}

// O-6106: 저장한 줄(한 쪽 안 — 최대 50줄)을 같은 범위로 다시 읽는다. 형식 오류 id는 뺀다.
export async function listEvidenceRecordsByIds(viewer: Viewer, ids: readonly string[]): Promise<EvidenceRecordView[]> {
  const valid = ids.filter((id) => UUID.safeParse(id).success).slice(0, EVIDENCE_PAGE_SIZE);
  if (valid.length === 0) return [];
  const rows = await listRecordsByIdsForScope(viewer, await evidenceScopeFor(viewer), valid);
  return projectMany(viewer, rows.map(sourceOf), EVIDENCE_RECORD_DTO_SPEC);
}

// 단건 — 목록과 같은 범위. 범위 밖 · 없는 id는 null(호출부가 404). 06.1-06 · 07 · 08이 이 함수만 부른다.
export async function getEvidenceRecord(viewer: Viewer, id: string): Promise<EvidenceRecordView | null> {
  if (!UUID.safeParse(id).success) return null;
  const row = await findRecordForScope(viewer, await evidenceScopeFor(viewer), id);
  if (!row) return null;
  const [view] = await projectMany(viewer, [sourceOf(row)], EVIDENCE_RECORD_DTO_SPEC);
  return view ?? null;
}

export type EvidenceBatchSummary = { id: string; fileName: string; formatLabel: string };

// 등록 묶음의 파일 이름 · 서식 이름(결과 행 1행 · batch 표시). 묶음은 등록 권한자(범위 all)만 본다 — 그 밖 · 없는 id는 null.
export async function getEvidenceBatch(viewer: Viewer, batchId: string): Promise<EvidenceBatchSummary | null> {
  if (!UUID.safeParse(batchId).success) return null;
  if ((await evidenceScopeFor(viewer)).rows !== "all") return null;
  const batch = await findBatchSummary(viewer, batchId);
  return batch ? { id: batch.id, fileName: batch.originalName, formatLabel: FORMAT_RULES.get(batch.format)?.label ?? batch.format } : null;
}

/** 공개 범위 저장 요청 한 묶음(Round 2 P2-B1) — 공개 값 · 팀마다 `[id, version]` 목록. 본부 id는 받지 않는다(설정 값만 — C3). */
export type EvidencePublishGroup = { visibility: EvidenceRecordVisibility; teamId?: string; items: Array<readonly [string, number]> };

export type EvidencePublishResult = { saved: number; savedAt: string };

export type PublishEvidenceDeps = {
  updateVisibilitiesIfVersionMatch: typeof defaultUpdateVisibilities;
  recordAction: typeof defaultRecordAction;
};

type PublishItem = { id: string; version: number; visibility: EvidenceRecordVisibility; teamId: string | null };

function flattenGroups(groups: readonly EvidencePublishGroup[]): PublishItem[] {
  return groups.flatMap((group) => group.items.map(([id, version]) => ({ id, version, visibility: group.visibility, teamId: group.teamId ?? null })));
}

function lockedStatusInput(row: LockedEvidenceRecord): EvidenceRecordStatusInput {
  return {
    archived: row.archivedAt !== null,
    isCardFormat: isCardFormat(row.format),
    corpCardId: row.corpCardId,
    cardLabel: null,
    needsCheck: row.needsCheck,
    attached: row.attached,
    negative: row.totalKrw < 0,
    visibility: asVisibility(row.visibility),
    teamName: null,
    divisionName: null,
    privateTypeName: row.privateTypeName,
  };
}

// 줄 검사 — 거부 이유(오류 셀 글자) 또는 null. 낡은 version · 잠긴 셀 · 공개할 수 없는 줄은 그 줄의 지금 상태 낱말이 이유다(06.1-03 낱말 —
// 새 문구 없음, E32 · P2-2 — 화면이 막아도 조작한 요청은 여기서 거부). 경영관리만 종류 줄(G15)은 미공개만 받고 그 밖은 상태 2행이 이유다
// (RP-15 ⑴). 팀은 트랜잭션 전에 읽은 것으로 가른다(E20 · A-6 — 없는 팀 id가 FK 위반 500으로 새지 않게).
function rejectReason(row: LockedEvidenceRecord, item: PublishItem, teamsById: ReadonlyMap<string, TeamRow>): string | null {
  const input = lockedStatusInput(row);
  const status = evidenceRecordStatus(input);
  if (row.version !== item.version) return status.word;
  const cell = evidenceVisibilityCell(input);
  if (cell === "locked") return status.word;
  if (cell === "readonly") {
    const privateTypeOnly = !input.archived && !input.attached && !input.negative && input.privateTypeName !== null;
    if (!privateTypeOnly) return status.word;
    return item.visibility === "private" ? null : status.detail;
  }
  if (item.visibility !== "team") return null;
  if (item.teamId === null) return "팀 없음";
  const team = teamsById.get(item.teamId);
  if (!team) return "없는 팀 · —";
  if (team.archivedAt !== null) return `없는 팀 · ${team.name}`;
  return null;
}

function chunked<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let at = 0; at < items.length; at += size) chunks.push(items.slice(at, at + size));
  return chunks;
}

// 공개 범위 저장 — 전부-아니면-전무(E32). 권한 · 설정 본부 읽기는 트랜잭션 전(06-03 규약), 트랜잭션 안에서는 id 오름차순 잠금 → 줄 검사
// → 500줄씩 version 조건부 갱신 → 행동 로그(건수 · 범위별 줄 id). 한 줄이라도 거부면 오류 칸을 모아 SaveRejectedError로 던져 롤백한다.
export async function publishEvidenceRecords(
  viewer: Viewer,
  input: { groups: readonly EvidencePublishGroup[] },
  deps?: Partial<PublishEvidenceDeps>,
): Promise<EvidencePublishResult> {
  if (!(await can(viewer, "evidence.intake", "write"))) throw new ForbiddenError(INTAKE_FORBIDDEN);
  const items = flattenGroups(input.groups);
  if (items.length > EVIDENCE_IMPORT_MAX_ROWS || new Set(items.map((item) => item.id)).size !== items.length) throw new UserFacingError(INVALID_REQUEST);
  if (items.some((item) => !UUID.safeParse(item.id).success)) throw new UserFacingError(INVALID_REQUEST);
  const division = items.some((item) => item.visibility === "division") ? await readDivision(viewer) : null;
  if (items.some((item) => item.visibility === "division") && division === null) throw new UserFacingError(INVALID_REQUEST);
  const teamIds = [...new Set(items.flatMap((item) => (item.visibility === "team" && item.teamId !== null && UUID.safeParse(item.teamId).success ? [item.teamId] : [])))];
  const teamsById = new Map((await findTeamsByIds(viewer, teamIds)).map((team) => [team.id, team]));
  const update = deps?.updateVisibilitiesIfVersionMatch ?? defaultUpdateVisibilities;
  const recordAction = deps?.recordAction ?? defaultRecordAction;
  const savedAt = new Date();

  const saved = await withTransaction(async (tx) => {
    const locked = await lockRecordsForUpdate(viewer, [...items.map((item) => item.id)].sort(), tx);
    if (locked.length !== items.length) throw new UserFacingError(INVALID_REQUEST);
    const byId = new Map(locked.map((row) => [row.id, row]));
    const errors: CellFormatError[] = [];
    const updates: EvidenceVisibilityUpdate[] = [];
    items.forEach((item, rowIndex) => {
      const row = byId.get(item.id);
      const reason = row ? rejectReason(row, item, teamsById) : INVALID_REQUEST;
      if (reason !== null) {
        errors.push({ rowIndex, rowId: item.id, field: "visibility", label: "공개", reason });
        return;
      }
      updates.push({
        id: item.id,
        version: item.version,
        visibility: item.visibility,
        teamId: item.visibility === "team" ? item.teamId : null,
        orgUnitId: item.visibility === "division" ? (division?.id ?? null) : null,
      });
    });
    if (errors.length > 0) throw new SaveRejectedError([], errors);

    let count = 0;
    for (const chunk of chunked(updates, EVIDENCE_VISIBILITY_UPDATE_CHUNK)) {
      const changed = new Set(await update(viewer, chunk, tx));
      // 잠근 뒤라 다를 수 없지만, 줄 수가 모자라면 충돌로 보고 통째로 되돌린다.
      const missed = chunk.filter((row) => !changed.has(row.id));
      if (missed.length > 0) {
        throw new SaveRejectedError(
          [],
          missed.map((row) => ({ rowIndex: items.findIndex((item) => item.id === row.id), rowId: row.id, field: "visibility", label: "공개", reason: INVALID_REQUEST })),
        );
      }
      count += changed.size;
    }
    // 건수와 함께 어느 줄을 어느 팀 · 본부에 열었는지(줄 id) — 공개 범위를 바꾼 흔적을 되짚을 수 있게(/cso B2).
    const counts = { saved: count, private: 0, team: 0, division: 0 };
    const records: { private: string[]; team: Record<string, string[]>; division: Record<string, string[]> } = { private: [], team: {}, division: {} };
    for (const row of updates) {
      counts[row.visibility]++;
      if (row.visibility === "private") records.private.push(row.id);
      else {
        const scopeId = (row.visibility === "team" ? row.teamId : row.orgUnitId) ?? "";
        const byScope = records[row.visibility];
        (byScope[scopeId] ??= []).push(row.id);
      }
    }
    await recordAction(viewer, { actionType: "document_update", entity: "evidence_record", detail: { ...counts, records } }, { tx });
    return count;
  });
  return { saved, savedAt: kstDateTimeOf(savedAt).slice(11) };
}

export type EvidenceTeamOption = { id: string; name: string };

// 공개 칸 묶음 「다른 팀」(DA-1 · E20) — 보관 아닌 팀 전부(조직 순). 공개 칸은 증빙 등록 쓰기만 고치므로 그 권한이 없으면 빈 목록이다
// (조직 메뉴의 행 범위와 무관 — 경영관리가 조직 메뉴 없이도 고른다).
export async function listEvidenceTeamOptions(viewer: Viewer): Promise<EvidenceTeamOption[]> {
  if (!(await can(viewer, "evidence.intake", "write"))) return [];
  return (await listTeams(viewer, { scope: { rows: "all", includeArchived: false } })).map((team) => ({ id: team.id, name: team.name }));
}

export type EvidenceArchiveInput = { id: string; version: number };

/** 보관 · 되살림 거부(낡은 version · 그사이 붙음 · 이미 그 상태 — PA-ARC-FAIL). 글자는 화면 결과 줄에 그대로 선다(DA-23 문구). */
export class EvidenceArchiveConflictError extends UserFacingError {}

// 보관 · 되살림(DA-7 · E41 · C2) — 확인 창 없이 바로 하고 화면이 되돌리기를 준다. 붙이기(06.1-06)도 같은 증빙 행을 잠그므로 살아 있는
// 붙임 검사는 잠근 뒤에 한다. 되돌리기는 보관이 돌려준 version으로 되살림을 부른다.
async function setEvidenceArchived(viewer: Viewer, input: EvidenceArchiveInput, actionType: "archive" | "restore"): Promise<EvidenceArchiveInput> {
  if (!(await can(viewer, "evidence.intake", "write"))) throw new ForbiddenError(INTAKE_FORBIDDEN);
  if (!UUID.safeParse(input.id).success || !Number.isInteger(input.version)) throw new UserFacingError(INVALID_REQUEST);
  const archived = actionType === "archive";
  return withTransaction(async (tx) => {
    const [row] = await lockRecordsForUpdate(viewer, [input.id], tx);
    if (!row) throw new UserFacingError(INVALID_REQUEST);
    const conflict = new EvidenceArchiveConflictError(`다른 사람이 ${formatKstTime(row.updatedAt)}에 바꿈 · 새로 고침`);
    if (row.version !== input.version || evidenceRowAction(lockedStatusInput(row)) !== actionType) throw conflict;
    if (!(await setRecordArchivedIfVersionMatches(viewer, { id: input.id, version: input.version, archived }, tx))) throw conflict;
    // 보관이 닫고 되살림이 다시 여는 범위(/cso B2).
    const detail = { visibility: row.visibility, teamId: row.visibleTeamId, orgUnitId: row.visibleOrgUnitId };
    await defaultRecordAction(viewer, { actionType, entity: "evidence_record", entityId: input.id, detail }, { tx });
    return { id: input.id, version: input.version + 1 };
  });
}

export function archiveEvidenceRecord(viewer: Viewer, input: EvidenceArchiveInput): Promise<EvidenceArchiveInput> {
  return setEvidenceArchived(viewer, input, "archive");
}

export function restoreEvidenceRecord(viewer: Viewer, input: EvidenceArchiveInput): Promise<EvidenceArchiveInput> {
  return setEvidenceArchived(viewer, input, "restore");
}

// ── 06.1-06 붙이기 판정용 기록 사실(DTO 아님 — domain 안에서만) ─────────────────────────────────────────────────
// 후보 점수 · 짝 판정 · 부제에 쓰는 기록 칸과 지금 상태 낱말. 목록과 같은 범위(evidenceScopeFor — 트랜잭션 밖 한 번). 금액은 같음 판정 ·
// 부제(evidence.amount를 볼 수 있을 때만)에만 쓴다.
export type EvidenceRecordFacts = {
  id: string;
  evidenceType: string;
  typeLabel: string | null;
  counterparty: string | null;
  businessNoDigits: string | null;
  supplyKrw: number;
  totalKrw: number;
  issuedOn: string;
  statusWord: EvidenceRecordWord;
};

export async function readEvidenceRecordFacts(viewer: Viewer, id: string): Promise<EvidenceRecordFacts | null> {
  if (!UUID.safeParse(id).success) return null;
  const row = await findRecordForScope(viewer, await evidenceScopeFor(viewer), id);
  if (!row) return null;
  const source = sourceOf(row);
  return {
    id: row.id,
    evidenceType: row.evidenceType,
    typeLabel: source.typeLabel,
    counterparty: source.counterparty,
    businessNoDigits: row.businessNoDigits,
    supplyKrw: row.supplyKrw,
    totalKrw: row.totalKrw,
    issuedOn: row.issuedOn,
    statusWord: source.statusWord,
  };
}

// 붙일 수 없는 상태 낱말 → 거부 글자(DA-13 — S2 행 `붙이기`의 비활성 이유와 같은 글자). 붙음은 붙임 행으로 따로 판정한다.
const ATTACH_BLOCKED_BY_WORD: Partial<Record<EvidenceRecordWord, string>> = {
  보관됨: "보관됨",
  "카드 미등록": "카드 미등록 · 카드 등록은 관리자",
  "확인 필요": "확인 필요 · 패널에서 확인 필요 풀기",
};

export function evidenceAttachBlockOf(word: EvidenceRecordWord): string | null {
  return ATTACH_BLOCKED_BY_WORD[word] ?? null;
}

// 트랜잭션 안 증빙 행 잠금(lockRecordsForUpdate) 뒤 지금 상태 낱말 — 없는 행은 null. 잠금 뒤 재검사(C-F12 — 사전 판독 뒤 보관 · 확인 필요 ·
// 카드 미등록으로 바뀐 줄을 막는다). 확인 필요는 기록 칸(needs_check)을 읽으므로 뒤 파일 취소가 원래 줄을 확인 필요로 바꾸면 여기서 막힌다.
export async function lockEvidenceRecordState(viewer: Viewer, id: string, tx: DbOrTx): Promise<EvidenceRecordWord | null> {
  const [row] = await lockRecordsForUpdate(viewer, [id], tx);
  return row ? evidenceRecordStatus(lockedStatusInput(row)).word : null;
}
