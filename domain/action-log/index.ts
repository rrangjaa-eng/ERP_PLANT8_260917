import type { Viewer } from "@/domain/viewer";
import { visible as defaultVisible } from "@/domain/permissions/visible";
import { can as defaultCan } from "@/domain/permissions/can";
import { recordAction as defaultRecordAction, ACTION_TYPE_LABELS, type CoreActionType } from "@/domain/action-log/record";
import { project, type DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import {
  filterActionLog as defaultFilterActionLog,
  pruneActionLogRows as defaultPruneActionLogRows,
  type ActionLogRow,
} from "@/repositories/action-log";
import { findUserById as defaultFindUserById } from "@/repositories/users";
import { findRoleById as defaultFindRoleById } from "@/repositories/roles";

// ADMN-10·OPS-05: 행동 로그 조회·필터·정리. 기록은 03-01의 record.ts가
// 계속 담당한다 — 두 파일로 나누어 기록 경로와 조회 경로가 서로를 오염시키지
// 않게 한다(플랜 원문).
export class ForbiddenError extends UserFacingError {}

const ACTION_LOG_MENU = "admin.action-log";
// read_first(domain/permissions/visible.ts·info-items.ts): 행동 로그 상세가
// 이미 등록된 유일한 정보 항목이고 "열람 판정이 그 항목을 쓴다" — 전체 조회
// 접근 게이트와 상세 필드 투영 게이트가 같은 항목을 쓴다(둘을 나누는 새
// 정보 항목을 이 플랜이 만들지 않는다).
const DETAIL_INFO_ITEM = "action_log.detail";

// 필터 축 넷(사람·기간·행동 종류·문서) + 정리 포함 3차 토글. 화면·액션이 이
// 상수를 쓰고 키 문자열을 각자 적지 않는다.
export const ACTION_LOG_FILTER_KEYS = ["actorId", "from", "to", "actionType", "documentId", "includePruned"] as const;
export type ActionLogFilterKey = (typeof ACTION_LOG_FILTER_KEYS)[number];

export type ActionLogFilter = {
  actorId?: string;
  from?: Date;
  to?: Date;
  actionType?: string;
  documentId?: string;
  includePruned?: boolean;
};

// 순수 함수 — 기간 경계 판정(양끝 포함: >= 시작, <= 끝). 리포지토리의
// gte/lte where절과 같은 계약을 DB 없이 단위 테스트로 고정한다.
export function isWithinActionLogPeriod(occurredAt: Date, from?: Date, to?: Date): boolean {
  if (from && occurredAt.getTime() < from.getTime()) return false;
  if (to && occurredAt.getTime() > to.getTime()) return false;
  return true;
}

export type ActionLogSortable = { occurredAt: Date; seq: number };

// 순수 함수 — 발생 시각 내림차순(최신 순), 같으면 seq(단조 증가 기본키)
// 내림차순. 두 키를 항상 함께 써서 두 번 정렬해도 같은 순서가 나온다.
export function compareActionLogOrder(a: ActionLogSortable, b: ActionLogSortable): number {
  const diff = b.occurredAt.getTime() - a.occurredAt.getTime();
  if (diff !== 0) return diff;
  return b.seq - a.seq;
}

export type ActionLogFilterableRow = ActionLogSortable & {
  actorId: string | null;
  actionType: string;
  documentId: string | null;
  prunedAt: Date | null;
};

// 순수 함수 — 필터 축 조합의 교집합 판정. 리포지토리의 SQL where절과 같은
// 계약이고, queryActionLog가 SQL 결과를 이 함수로 다시 확인한다(이중 방어 —
// corp-cards의 XOR 판정과 같은 결).
export function matchesActionLogFilter(row: ActionLogFilterableRow, filter: ActionLogFilter): boolean {
  if (filter.actorId && row.actorId !== filter.actorId) return false;
  if (filter.actionType && row.actionType !== filter.actionType) return false;
  if (filter.documentId && row.documentId !== filter.documentId) return false;
  if (!isWithinActionLogPeriod(row.occurredAt, filter.from, filter.to)) return false;
  if (!filter.includePruned && row.prunedAt !== null) return false;
  return true;
}

// 행동 로그 DTO — 화면·내보내기가 공유한다. 행위자·행위자 계급은 id뿐 아니라
// 이름까지 합성한다(사람이 "누가"를 바로 읽을 수 있게). 필드 전부가 같은
// 정보 항목(DETAIL_INFO_ITEM)으로 게이트된다 — 위 read_first 설명대로.
export type ActionLogDto = {
  seq: number;
  occurredAt: Date;
  actorId: string | null;
  actorName: string | null;
  actorRoleId: string | null;
  actorRoleName: string | null;
  actionType: string;
  actionTypeLabel: string;
  entity: string | null;
  entityId: string | null;
  documentId: string | null;
  detail: Record<string, unknown>;
  prunedAt: Date | null;
};

type ActionLogDtoSource = ActionLogRow & {
  actorName: string | null;
  actorRoleName: string | null;
  actionTypeLabel: string;
};

export const ACTION_LOG_DTO_SPEC: DtoSpec<ActionLogDtoSource, ActionLogDto> = {
  fields: [
    { key: "seq", from: "seq", infoItem: DETAIL_INFO_ITEM },
    { key: "occurredAt", from: "occurredAt", infoItem: DETAIL_INFO_ITEM },
    { key: "actorId", from: "actorId", infoItem: DETAIL_INFO_ITEM },
    { key: "actorName", from: "actorName", infoItem: DETAIL_INFO_ITEM },
    { key: "actorRoleId", from: "actorRoleId", infoItem: DETAIL_INFO_ITEM },
    { key: "actorRoleName", from: "actorRoleName", infoItem: DETAIL_INFO_ITEM },
    { key: "actionType", from: "actionType", infoItem: DETAIL_INFO_ITEM },
    { key: "actionTypeLabel", from: "actionTypeLabel", infoItem: DETAIL_INFO_ITEM },
    { key: "entity", from: "entity", infoItem: DETAIL_INFO_ITEM },
    { key: "entityId", from: "entityId", infoItem: DETAIL_INFO_ITEM },
    { key: "documentId", from: "documentId", infoItem: DETAIL_INFO_ITEM },
    { key: "detail", from: "detail", infoItem: DETAIL_INFO_ITEM },
    { key: "prunedAt", from: "prunedAt", infoItem: DETAIL_INFO_ITEM },
  ],
};

registerDto({
  name: "ActionLogDto",
  fields: ACTION_LOG_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

export type QueryActionLogDeps = {
  visible: typeof defaultVisible;
  filterActionLog: typeof defaultFilterActionLog;
  findUserById: typeof defaultFindUserById;
  findRoleById: typeof defaultFindRoleById;
};

async function resolveNames(
  viewer: Viewer,
  ids: (string | null)[],
  find: (viewer: Viewer, id: string) => Promise<{ name: string } | null>,
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => id !== null))];
  const pairs = await Promise.all(unique.map(async (id) => [id, (await find(viewer, id))?.name ?? id] as const));
  return new Map(pairs);
}

// 열람 판정을 먼저 한다 — 행동 로그 상세는 정보 노출표 항목이므로 노출
// 판정이 거짓이면 ForbiddenError. 통과하면 리포지토리 조회 → 이름 합성 →
// 투영. 기간 필터는 양끝 포함이고 그 의미가 위 isWithinActionLogPeriod
// 주석에 있다. 정렬은 발생 시각과 단조 증가 기본키 두 키를 항상 함께 쓴다.
export async function queryActionLog(
  viewer: Viewer,
  filter: ActionLogFilter = {},
  deps?: Partial<QueryActionLogDeps>,
): Promise<ActionLogDto[]> {
  const visibleFn = deps?.visible ?? defaultVisible;
  if (!(await visibleFn(viewer, DETAIL_INFO_ITEM))) {
    throw new ForbiddenError("행동 로그 열람 권한이 없습니다.");
  }

  const filterActionLog = deps?.filterActionLog ?? defaultFilterActionLog;
  const rows = await filterActionLog(viewer, filter);

  // 이중 방어 — SQL where절과 같은 계약을 순수 함수로 다시 확인한다.
  const filtered = rows.filter((row) => matchesActionLogFilter(row, filter));
  const sorted = [...filtered].sort(compareActionLogOrder);

  const findUserById = deps?.findUserById ?? defaultFindUserById;
  const findRoleById = deps?.findRoleById ?? defaultFindRoleById;
  const [actorNames, roleNames] = await Promise.all([
    resolveNames(
      viewer,
      sorted.map((row) => row.actorId),
      findUserById,
    ),
    resolveNames(
      viewer,
      sorted.map((row) => row.actorRoleId),
      findRoleById,
    ),
  ]);

  return Promise.all(
    sorted.map((row) =>
      project(
        viewer,
        {
          ...row,
          actorName: row.actorId ? (actorNames.get(row.actorId) ?? row.actorId) : null,
          actorRoleName: row.actorRoleId ? (roleNames.get(row.actorRoleId) ?? row.actorRoleId) : null,
          actionTypeLabel: ACTION_TYPE_LABELS[row.actionType as CoreActionType] ?? row.actionType,
        },
        ACTION_LOG_DTO_SPEC,
      ),
    ),
  ) as Promise<ActionLogDto[]>;
}

export type PruneActionLogDeps = {
  can: typeof defaultCan;
  pruneActionLogRows: typeof defaultPruneActionLogRows;
  recordAction: typeof defaultRecordAction;
};

export type PruneActionLogResult = { count: number };

function serializableFilter(filter: ActionLogFilter): Record<string, unknown> {
  return {
    actorId: filter.actorId ?? null,
    from: filter.from ? filter.from.toISOString() : null,
    to: filter.to ? filter.to.toISOString() : null,
    actionType: filter.actionType ?? null,
    documentId: filter.documentId ?? null,
  };
}

// 행동 로그 메뉴 쓰기 권한 확인 → 대상 행에 정리 표시를 남긴다(물리 삭제
// 없음) → 정리 자체를 기록한다(정리 종류로, 필터와 정리된 건수를 상세에
// 담는다). pruneActionLogRows가 이미 정리된 행·정리 종류 행을 항상 제외해
// 두 번의 정리로도 첫 정리 기록이 남는다.
export async function pruneActionLog(
  viewer: Viewer,
  filter: ActionLogFilter,
  deps?: Partial<PruneActionLogDeps>,
): Promise<PruneActionLogResult> {
  const canFn = deps?.can ?? defaultCan;
  if (!(await canFn(viewer, ACTION_LOG_MENU, "write"))) {
    throw new ForbiddenError("행동 로그 정리 권한이 없습니다.");
  }

  const pruneRows = deps?.pruneActionLogRows ?? defaultPruneActionLogRows;
  const count = await pruneRows(viewer, filter);

  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, {
    actionType: "action_log_prune",
    entity: "action_log",
    detail: { filter: serializableFilter(filter), count },
  });

  return { count };
}
