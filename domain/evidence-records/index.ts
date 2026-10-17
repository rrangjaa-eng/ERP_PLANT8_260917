import { z } from "zod";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { EVIDENCE_IMPORT_MAX_ROWS } from "@/domain/evidence-import/limits";
import { EVIDENCE_FORMATS } from "@/domain/evidence-import/registry";
import type { FormatRule } from "@/domain/evidence-import/types";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { registerDto } from "@/domain/permissions/dto-registry";
import { projectMany, type DtoSpec } from "@/domain/permissions/project";
import { evidenceScopeFor } from "@/domain/permissions/scope-for";
import { SaveRejectedError, type CellFormatError } from "@/domain/quotes/lines";
import { EVIDENCE_VISIBILITY_DIVISION_ORG_UNIT } from "@/domain/settings/keys";
import { getSettingValue, SettingNotFoundError } from "@/domain/settings/registry";
import {
  evidenceRecordStatus,
  evidenceVisibilityCell,
  evidenceVisibilityLabel,
  type EvidenceRecordStatusInput,
  type EvidenceRecordVisibility,
  type EvidenceRecordWord,
  type EvidenceVisibilityCell,
} from "@/domain/evidence-records/status";
import type { Viewer } from "@/domain/viewer";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { withTransaction } from "@/lib/db-transaction";
import { seoulToday } from "@/lib/dates";
import { kstDateTimeOf } from "@/lib/kst-date";
import {
  EVIDENCE_VISIBILITY_UPDATE_CHUNK,
  findBatchSummary,
  findRecordForScope,
  listProposalTargets,
  listRecordsForScope,
  lockRecordsForUpdate,
  updateVisibilitiesIfVersionMatch as defaultUpdateVisibilities,
  type EvidenceProposalTarget,
  type EvidenceRecordFilters,
  type EvidenceRecordListRow,
  type EvidenceVisibilityUpdate,
  type LockedEvidenceRecord,
} from "@/repositories/evidence-records";
import { findOrgUnitById } from "@/repositories/org-units";
import { findMembershipsAtDate } from "@/repositories/team-memberships";
import { findTeamsByIds } from "@/repositories/teams";

// 06.1-05: 증빙 기록(06.1 일괄 등록이 만든 줄) 목록 · 단건 · 공개 범위 저장. 이름은 `…Record(s)`다 — 05의 `domain/evidence`
// (`listEvidence` · `restoreEvidence` — 문서에 붙은 파일)와 겹치지 않는다(RP-6). 행 범위는 06.1-01 evidenceScopeFor를 요청마다
// 한 번(트랜잭션 밖) 읽어 리포지토리 where절이 집행한다 — 화면은 거르지 않는다.

export type { EvidenceRecordVisibility, EvidenceRecordWord, EvidenceVisibilityCell } from "@/domain/evidence-records/status";

const INTAKE_FORBIDDEN = "증빙 등록 권한 없음";
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

export type EvidenceRecordList = {
  rows: EvidenceRecordView[];
  proposals: EvidenceProposal[];
  /** 설정 「증빙 본부 공개 대상」 — 값이 없으면 null(본부 선택지를 숨긴다 — PA-DIV-UNSET). */
  division: EvidenceDivision | null;
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
    typeLabel: row.typeLabel,
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

function repositoryFilters(): EvidenceRecordFilters {
  return { cardFormats: CARD_FORMATS };
}

export async function listEvidenceRecords(viewer: Viewer): Promise<EvidenceRecordList> {
  const scope = await evidenceScopeFor(viewer);
  const filters = repositoryFilters();
  const rows = await listRecordsForScope(viewer, scope, filters, { limit: EVIDENCE_PAGE_SIZE, offset: 0 });
  const division = await readDivision(viewer);
  // 제안은 공개 범위를 저장할 수 있는 사람(등록 권한 = 범위 all)에게만 — 보기 범위(published)의 줄은 이미 공개된 줄이다.
  const proposals = scope.rows === "all" ? await proposalsFor(viewer, await listProposalTargets(viewer, scope, filters, EVIDENCE_IMPORT_MAX_ROWS), division) : [];
  return { rows: await projectMany(viewer, rows.map(sourceOf), EVIDENCE_RECORD_DTO_SPEC), proposals, division };
}

const UUID = z.string().uuid();

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

// 줄 검사 — 거부 이유(오류 셀 글자) 또는 null. 낡은 version은 그 줄의 지금 상태 낱말이 이유다(06.1-03 낱말 — 새 문구 없음).
function rejectReason(row: LockedEvidenceRecord, item: PublishItem): string | null {
  if (row.version !== item.version) return evidenceRecordStatus(lockedStatusInput(row)).word;
  return null;
}

function chunked<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let at = 0; at < items.length; at += size) chunks.push(items.slice(at, at + size));
  return chunks;
}

// 공개 범위 저장 — 전부-아니면-전무(E32). 권한 · 설정 본부 읽기는 트랜잭션 전(06-03 규약), 트랜잭션 안에서는 id 오름차순 잠금 → 줄 검사
// → 500줄씩 version 조건부 갱신 → 행동 로그(건수만). 한 줄이라도 거부면 오류 칸을 모아 SaveRejectedError로 던져 롤백한다.
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
      const reason = row ? rejectReason(row, item) : INVALID_REQUEST;
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
    const counts = { saved: count, private: 0, team: 0, division: 0 };
    for (const row of updates) counts[row.visibility]++;
    await recordAction(viewer, { actionType: "document_update", entity: "evidence_record", detail: counts }, { tx });
    return count;
  });
  return { saved, savedAt: kstDateTimeOf(savedAt).slice(11) };
}
