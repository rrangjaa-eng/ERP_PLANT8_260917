import type { Viewer } from "@/domain/viewer";
import { visible as defaultVisible } from "@/domain/permissions/visible";
import { can as defaultCan } from "@/domain/permissions/can";
import { recordAction as defaultRecordAction, ACTION_TYPE_LABELS, type CoreActionType } from "@/domain/action-log/record";
import { project, type DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import {
  filterActionLog as defaultFilterActionLog,
  markActionLogRowsPruned as defaultPruneActionLogRows,
  type ActionLogRow,
} from "@/repositories/action-log";
import { findUserById as defaultFindUserById } from "@/repositories/users";
import { findRoleById as defaultFindRoleById } from "@/repositories/roles";
import { findVendorById as defaultFindVendorById } from "@/repositories/vendors";
import { findOrgUnitById as defaultFindOrgUnitById } from "@/repositories/org-units";
import { findTeamById as defaultFindTeamById } from "@/repositories/teams";
import { findCorpCardById as defaultFindCorpCardById } from "@/repositories/corp-cards";
import { findCodeItemById as defaultFindCodeItemById } from "@/repositories/code-tables";
import { ACTION_LOG_FILTER_KEYS, type ActionLogFilterKey } from "@/domain/action-log/filter-keys";

export { ACTION_LOG_FILTER_KEYS, type ActionLogFilterKey };

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

export type ActionLogFilter = {
  actorId?: string;
  from?: Date;
  to?: Date;
  actionType?: string;
  documentId?: string;
  includePruned?: boolean;
};

// 날짜 입력(YYYY-MM-DD, 화면의 date input)을 기간 경계 Date로 바꾼다 —
// 시작일은 그날 00:00:00.000, 종료일은 23:59:59.999(UTC, 이 리포의 다른
// 날짜형 컬럼과 같이 타임존 없이 처리). 화면(actions.ts)과 페이지가 같은
// 함수를 써서 경계 해석이 두 곳에서 갈라지지 않는다.
export function parseActionLogDateBoundary(dateStr: string | undefined, edge: "start" | "end"): Date | undefined {
  if (!dateStr) return undefined;
  const suffix = edge === "start" ? "T00:00:00.000Z" : "T23:59:59.999Z";
  const date = new Date(`${dateStr}${suffix}`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

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
  // 결함 2: 대상(entity/entityId)이 raw UUID 그대로 보이던 문제 — entity와
  // entityId는 절대 바꾸지 않고(append-only 원본 그대로 남긴다), 표시용
  // 이름을 이 필드에 따로 싣는다. 해석 불가(엔티티 종류를 모르거나, 노출표가
  // 막거나, 참조 대상이 이미 없는 경우)면 entityId를 그대로 담아 안전하게
  // 내려앉는다(기존 화면 동작과 같다 — 절대 빈 값으로 정보를 감추지 않는다).
  entityName: string | null;
  documentId: string | null;
  detail: Record<string, unknown>;
  prunedAt: Date | null;
};

type ActionLogDtoSource = ActionLogRow & {
  actorName: string | null;
  actorRoleName: string | null;
  actionTypeLabel: string;
  entityName: string | null;
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
    { key: "entityName", from: "entityName", infoItem: DETAIL_INFO_ITEM },
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

// 결함 2: entity/entityId 쌍을 사람이 읽는 이름으로 바꾼다. 각 엔티티 종류가
// 자기 마스터 데이터 화면에서 이미 쓰는 정보 항목으로 게이트한다 — action_log.
// detail을 볼 수 있어도 예를 들어 person.value가 안 보이는 계급에는 이름을
// 보여주지 않는다(과다 노출 금지, 플랜의 "정보 노출표를 다시 거친다" 요구).
// corp_card는 label, code_items는 value 필드를 이름 대신 쓴다 — 두 표에는
// VendorRow·OrgUnitRow 같은 "name" 컬럼이 없다.
type EntityNameResolver = {
  infoItem: string;
  find: (viewer: Viewer, id: string) => Promise<{ name: string } | null>;
};

async function findCorpCardName(viewer: Viewer, id: string): Promise<{ name: string } | null> {
  const row = await defaultFindCorpCardById(viewer, id);
  return row ? { name: row.label } : null;
}

async function findCodeItemName(viewer: Viewer, id: string): Promise<{ name: string } | null> {
  const row = await defaultFindCodeItemById(viewer, id);
  return row ? { name: row.value } : null;
}

const ENTITY_NAME_RESOLVERS: Record<string, EntityNameResolver> = {
  vendor: { infoItem: "vendor.value", find: defaultFindVendorById },
  org_unit: { infoItem: "org_unit.value", find: defaultFindOrgUnitById },
  team: { infoItem: "team.value", find: defaultFindTeamById },
  corp_card: { infoItem: "corp_card.value", find: findCorpCardName },
  code_items: { infoItem: "code_item.value", find: findCodeItemName },
  user: { infoItem: "person.value", find: defaultFindUserById },
  roles: { infoItem: "role.value", find: defaultFindRoleById },
};

// entity 종류별로 고유 entityId만 모아 한 번씩만 조회한다(행마다 조회하는
// N+1을 피한다 — 조회 횟수는 행 수가 아니라 "이 페이지에 나온 서로 다른
// (엔티티 종류, id)" 수에 비례한다). 노출표 판정도 엔티티 종류마다 한 번뿐이다.
async function resolveEntityNames(
  viewer: Viewer,
  rows: { entity: string | null; entityId: string | null }[],
  visibleFn: typeof defaultVisible,
): Promise<Map<string, Map<string, string>>> {
  const idsByEntity = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.entity || !row.entityId) continue;
    if (!(row.entity in ENTITY_NAME_RESOLVERS)) continue;
    const set = idsByEntity.get(row.entity) ?? new Set<string>();
    set.add(row.entityId);
    idsByEntity.set(row.entity, set);
  }

  const result = new Map<string, Map<string, string>>();
  await Promise.all(
    [...idsByEntity.entries()].map(async ([entity, ids]) => {
      const resolver = ENTITY_NAME_RESOLVERS[entity];
      if (!resolver) return;
      // 노출표가 막으면 이름을 만들지 않는다 — 호출부가 entityId로 그대로
      // 내려앉는다(over-disclosure보다 안전한 쪽).
      if (!(await visibleFn(viewer, resolver.infoItem))) return;
      result.set(entity, await resolveNames(viewer, [...ids], resolver.find));
    }),
  );
  return result;
}

// 결함 1: 정리(prune)·Excel 내보내기가 "어떤 필터로 조회했는지"를 detail에
// 기록할 때 filter.actorId에 내부 사용자 id를 그대로 담았다(record.ts의
// 원칙 — snake_case 내부 토큰을 그대로 보여주지 않는다 — 를 상세에도 적용).
// append-only라 저장된 행은 못 바꾸므로 읽을 때만 이름으로 옮겨 보여준다.
// actorNames에 없으면(탈퇴 등) id를 그대로 남긴다.
function extractFilterActorId(detail: Record<string, unknown>): string | null {
  const filter = detail["filter"];
  if (!filter || typeof filter !== "object") return null;
  const actorId = (filter as Record<string, unknown>)["actorId"];
  return typeof actorId === "string" ? actorId : null;
}

export function sanitizeActionLogDetailForDisplay(
  detail: Record<string, unknown>,
  actorNames: Map<string, string>,
): Record<string, unknown> {
  const filterActorId = extractFilterActorId(detail);
  if (!filterActorId) return detail;

  const filter = detail["filter"] as Record<string, unknown>;
  return {
    ...detail,
    filter: { ...filter, actorId: actorNames.get(filterActorId) ?? filterActorId },
  };
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
  // 결함 1: detail.filter.actorId(정리·내보내기가 필터로 고른 사람)도 같은
  // users 조회로 한 번에 해석한다 — actorId 목록에 합쳐서 조회 횟수를
  // 늘리지 않는다.
  const filterActorIds = sorted.map((row) => extractFilterActorId(row.detail as Record<string, unknown>));
  const [actorNames, roleNames, entityNames] = await Promise.all([
    resolveNames(viewer, [...sorted.map((row) => row.actorId), ...filterActorIds], findUserById),
    resolveNames(
      viewer,
      sorted.map((row) => row.actorRoleId),
      findRoleById,
    ),
    resolveEntityNames(viewer, sorted, visibleFn),
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
          entityName:
            row.entity && row.entityId ? (entityNames.get(row.entity)?.get(row.entityId) ?? row.entityId) : null,
          detail: sanitizeActionLogDetailForDisplay(row.detail as Record<string, unknown>, actorNames),
        },
        ACTION_LOG_DTO_SPEC,
      ),
    ),
  ) as Promise<ActionLogDto[]>;
}

export type PruneActionLogDeps = {
  can: typeof defaultCan;
  markActionLogRowsPruned: typeof defaultPruneActionLogRows;
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
// 담는다). markActionLogRowsPruned가 이미 정리된 행·정리 종류 행을 항상 제외해
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

  const pruneRows = deps?.markActionLogRowsPruned ?? defaultPruneActionLogRows;
  const count = await pruneRows(viewer, filter);

  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, {
    actionType: "action_log_prune",
    entity: "action_log",
    detail: { filter: serializableFilter(filter), count },
  });

  return { count };
}
