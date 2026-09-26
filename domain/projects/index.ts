import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { scopeFor } from "@/domain/permissions/scope-for";
import { project, projectMany, type DtoSpec } from "@/domain/permissions/project";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { registerDto } from "@/domain/permissions/dto-registry";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { buildCustomFieldsSchema, type FieldDefType } from "@/domain/custom-fields/build-schema";
import { allocateDocumentNumber, loadDocumentNumberFormat } from "@/domain/document-numbering";
import { withTransaction } from "@/lib/db-transaction";
import { kstToday, kstYear } from "@/lib/kst-date";
import { log } from "@/lib/log";
import {
  attributionLabel,
  exclusionText,
  resolveListPage,
  resolveListRange,
  totalsTitle,
  type ListPeriodErrors,
} from "@/domain/projects/list-view";
import { applyAutoSettlement, type AutoSettlementDeps } from "@/domain/projects/auto-transition";
import { moneyFromRow, moneyToColumns, normalizeMoneyInput, MoneyInputError, type Currency, type Money, type MoneyInput } from "@/domain/money";
import { validatePreEstimateChange } from "@/domain/projects/pre-estimate";
import { validateNewProjectPeriod } from "@/domain/projects/period";
import { rememberFxAfterCommit } from "@/domain/quotes/lines";
import {
  listProjectsPage as repoListProjectsPage,
  aggregateProjects as repoAggregateProjects,
  findProjectById as repoFindProjectById,
  insertProject as repoInsertProject,
  PROJECT_SORT_KEYS,
  type ProjectListFilter,
  type ProjectListRow,
  type ProjectSort,
  type ProjectSortKey,
  type ProjectRow,
} from "@/repositories/projects";

// app 계층은 repositories를 직접 import할 수 없다(boundaries) — 목록
// 화면(page.tsx)이 정렬 키 허용 목록을 검증하려면 domain을 거쳐야 한다.
export { PROJECT_SORT_KEYS };
export type { ProjectSortKey };
import {
  insertQuoteRevision as repoInsertQuoteRevision,
  findLatestQuoteRevision as repoFindLatestQuoteRevision,
} from "@/repositories/quote-revisions";
import { copyQuoteLines as repoCopyQuoteLines, countCopyableLines as repoCountCopyableLines } from "@/repositories/quote-lines";
import { denyWrite } from "@/domain/rules/deny-write";
import { coversProjectTeam, loadActorTeamScope } from "@/domain/projects/status";
import { findMembershipAtDate } from "@/repositories/team-memberships";
import { listFieldDefinitions as repoListFieldDefinitions } from "@/repositories/field-definitions";

export class ForbiddenError extends UserFacingError {}
// D-47 완료(정산) 뒤 잠김의 domain 가드 자리 — `domain/vendors`의
// ArchivedVendorError와 같은 결(vendors.ts:295-302 패턴). 이 플랜은
// createProject/조회만 두고, 프로젝트 수정·상태 전환은 04-06이 이 클래스를
// 실제로 throw하는 함수(updateProject 등)를 채운다.
export class CompletedProjectError extends UserFacingError {}
// 04-15(D-70 · 사용자 D19-3 · B-26) — 복사 출처가 없거나 보는 사람의 행 범위 밖이거나 보관됐다. 셋을 가르지 않는다
// (볼 수 없는 프로젝트의 존재를 드러내지 않는다).
export class CopySourceMissingError extends UserFacingError {}

const PROJECTS_MENU = "projects";
const PROJECT_ENTITY = "project";
const PROJECT_NUMBER_COUNTER_KEY = "project";

// PROJ-01: 프로젝트 Dto. 이 플랜은 사전 견적(총 매출 예상가) Money 묶음을
// 등록 폼에서 다루지 않는다(트레이서 슬라이스 — 04-02/04-05가 매출 칸을
// 더한다). DTO 노출은 04-44가 더했다(preEstimate).
export type ProjectDto = {
  id: string;
  number: string;
  clientId: string;
  teamId: string;
  pmUserId: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  source: string;
  customFields: Record<string, unknown>;
  version: number;
  archivedAt: Date | null;
  createdAt: Date;
  // 04-44(DR-28 · 계약 8) — 총 매출 예상가. 견적 금액과 같은 정보 항목이라 볼 수 없으면 키가 없다.
  preEstimate?: Money;
};

// 04-44 — 행의 pre_estimate_* 네 칸을 Money 하나로 묶은 투영 원본.
type ProjectDtoSource = ProjectRow & { preEstimate: Money };

function withPreEstimate(row: ProjectRow): ProjectDtoSource {
  return {
    ...row,
    preEstimate: moneyFromRow({
      currency: row.preEstimateCurrency,
      foreignAmount: row.preEstimateForeignAmount,
      fxRate: row.preEstimateFxRate,
      amountKrw: row.preEstimateAmountKrw,
    }),
  };
}

export const PROJECT_DTO_SPEC: DtoSpec<ProjectDtoSource, ProjectDto> = {
  fields: [
    { key: "id", from: "id", infoItem: "project.value" },
    { key: "number", from: "number", infoItem: "project.value" },
    { key: "clientId", from: "clientId", infoItem: "project.value" },
    { key: "teamId", from: "teamId", infoItem: "project.value" },
    { key: "pmUserId", from: "pmUserId", infoItem: "project.value" },
    { key: "name", from: "name", infoItem: "project.value" },
    { key: "status", from: "status", infoItem: "project.value" },
    { key: "startDate", from: "startDate", infoItem: "project.value" },
    { key: "endDate", from: "endDate", infoItem: "project.value" },
    { key: "source", from: "source", infoItem: "project.value" },
    { key: "customFields", from: "customFields", infoItem: "project.value" },
    { key: "version", from: "version", infoItem: "project.value" },
    { key: "archivedAt", from: "archivedAt", infoItem: "project.value" },
    { key: "createdAt", from: "createdAt", infoItem: "project.value" },
    { key: "preEstimate", from: "preEstimate", infoItem: "quote.amount" },
  ],
};

registerDto({
  name: "ProjectDto",
  fields: PROJECT_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

async function validatedCustomFields(
  viewer: Viewer,
  input: Record<string, unknown> | undefined,
): Promise<Record<string, unknown>> {
  const defs = await repoListFieldDefinitions(viewer, PROJECT_ENTITY);
  const schema = buildCustomFieldsSchema(
    defs.map((def) => ({
      key: def.key,
      type: def.type as FieldDefType,
      options: Array.isArray(def.options) ? (def.options as string[]) : undefined,
      required: def.required,
    })),
  );
  return schema.parse(input ?? {}) as Record<string, unknown>;
}

// 04-05 — 목록 항목 Dto. 프로젝트 구조 정보(project.value, staffDefault
// true)와 견적·실행가·차익(quote.amount, 계급별 서버 부재) 두 정보 항목이
// 섞인다 — 후자 셋은 project()가 필드 단위로 판정해 DTO 키 자체를 뺀다
// (빈 값이 아니라 필드 부재, S1 must_have).
export type ProjectListItemDto = {
  id: string;
  number: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  clientName: string;
  teamName: string;
  pmUserName: string;
  quoteAmountKrw?: number;
  executionAmountKrw?: number;
  profitKrw?: number;
};

// 04-17(D-90) — attributionLabel: 보기 범위 밖에서 끝나는 행의 기간 칸 2행(`2027 귀속`), 범위 안이면 null.
export type ProjectListItemWithGroup = ProjectListItemDto & { groupLabel: string; attributionLabel: string | null };

const PROJECT_LIST_DTO_SPEC: DtoSpec<ProjectListRow, ProjectListItemDto> = {
  fields: [
    { key: "id", from: "id", infoItem: "project.value" },
    { key: "number", from: "number", infoItem: "project.value" },
    { key: "name", from: "name", infoItem: "project.value" },
    { key: "status", from: "status", infoItem: "project.value" },
    { key: "startDate", from: "startDate", infoItem: "project.value" },
    { key: "endDate", from: "endDate", infoItem: "project.value" },
    { key: "clientName", from: "clientName", infoItem: "project.value" },
    { key: "teamName", from: "teamName", infoItem: "project.value" },
    { key: "pmUserName", from: "pmUserName", infoItem: "project.value" },
    { key: "quoteAmountKrw", from: "quoteAmountKrw", infoItem: "quote.amount" },
    { key: "executionAmountKrw", from: "executionAmountKrw", infoItem: "quote.amount" },
    { key: "profitKrw", from: "profitKrw", infoItem: "quote.amount" },
  ],
};

registerDto({
  name: "ProjectListItemDto",
  fields: PROJECT_LIST_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

function normalizeSort(sort?: { key?: string; direction?: string }): ProjectSort {
  const requestedKey = sort?.key;
  const key: ProjectSortKey = (PROJECT_SORT_KEYS as readonly string[]).includes(requestedKey ?? "")
    ? (requestedKey as ProjectSortKey)
    : "endDate";
  const direction = sort?.direction === "desc" ? "desc" : "asc";
  return { key, direction };
}

// 종료일 기준 월, 없으면 「기간 미정」 — 리포지토리 정렬이 이미 이 그룹을
// 맨 아래·월 단위로 묶어 보내므로 여기서는 라벨만 파생한다(월 계산은
// 하되 재정렬은 하지 않는다 — 화면 컴포넌트에는 이 계산조차 없다).
function monthGroupLabel(endDate: string | null): string {
  return endDate ? endDate.slice(0, 7) : "기간 미정";
}

// 04-17(D-88 · CEO C-14 · ENG-D3 ②) — 표 위 합계 줄 DTO. 견적·실행가는 quote.amount, 매출은 revenue.issued_amount,
// 수익금·수익률은 두 항목을 **모두** 볼 때만 싣는다(발행 기준 수익금 + 실행가 = 발행 합계 역산 차단 — all-of 명세).
export type ProjectListTotals = {
  title: string;
  /** 합계에 든(귀속이 범위 안인) 행 수. */
  count: number;
  exclusionText: string | null;
  revenueKrw?: number;
  quoteAmountKrw?: number;
  executionAmountKrw?: number;
  profitKrw?: number;
  /** Σ수익금 ÷ Σ기준 — Σ기준 ≤ 0이면 null. */
  profitRate?: number | null;
};

type ProjectListTotalsSource = Required<ProjectListTotals>;

const PROFIT_INFO_ITEMS = ["quote.amount", "revenue.issued_amount"] as const;

const PROJECT_LIST_TOTALS_DTO_SPEC: DtoSpec<ProjectListTotalsSource, ProjectListTotals> = {
  fields: [
    { key: "title", from: "title", infoItem: "project.value" },
    { key: "count", from: "count", infoItem: "project.value" },
    { key: "exclusionText", from: "exclusionText", infoItem: "project.value" },
    { key: "revenueKrw", from: "revenueKrw", infoItem: "revenue.issued_amount" },
    { key: "quoteAmountKrw", from: "quoteAmountKrw", infoItem: "quote.amount" },
    { key: "executionAmountKrw", from: "executionAmountKrw", infoItem: "quote.amount" },
    { key: "profitKrw", from: "profitKrw", infoItem: PROFIT_INFO_ITEMS },
    { key: "profitRate", from: "profitRate", infoItem: PROFIT_INFO_ITEMS },
  ],
};

registerDto({
  name: "ProjectListTotals",
  fields: PROJECT_LIST_TOTALS_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

export type ProjectListQuery = {
  status?: string;
  /** 상태 필터의 코드표 라벨 — 합계 제목 괄호에 쓴다. */
  statusLabel?: string;
  teamId?: string;
  /** 없으면 올해(KST), `all`이면 범위 없음(D-89). */
  year?: number | "all";
  search?: string;
  /** 04-48 — 기간 필터 두 칸(URL 값 그대로, 서버가 parseListPeriod로 판정한다). */
  from?: string;
  to?: string;
  sort?: { key?: string; direction?: string };
  /** URL의 쪽 번호 그대로 — 숫자 아님·1 미만·범위 밖은 clampPage가 보정한다(D-91). */
  page?: string | number;
};

export type ProjectListResult = {
  year: number | "all";
  rows: ProjectListItemWithGroup[];
  totals: ProjectListTotals;
  /** 표에 보이는 전체 행 수(귀속 구간 전부). */
  total: number;
  /** 보정된 쪽 번호와 쪽 수(50건씩). */
  page: number;
  pageCount: number;
  /** 04-48(UX-04) — 기간 칸별 서버 판정 오류. 하나라도 있으면 기간 필터를 적용하지 않았다. */
  periodErrors: ListPeriodErrors;
};

export type ProjectListDeps = {
  now: () => Date;
  scope: typeof scopeFor;
  settle: (viewer: Viewer) => Promise<void>;
  repo: { aggregate: typeof repoAggregateProjects; listPage: typeof repoListProjectsPage };
};

// 드리즐이 PG 오류를 cause로 감싼다 — 운영 로그에는 PG 코드만(필터 값·금액 없음).
function pgErrorCode(error: unknown): string | null {
  const cause = error instanceof Error ? (error as { cause?: unknown }).cause : undefined;
  const code = (error as { code?: unknown } | null)?.code ?? (cause as { code?: unknown } | undefined)?.code;
  return typeof code === "string" ? code : null;
}

// 04-17(PROJ-01 · D-88~D-90 · CEO C-09 · A-07 · 엔지 리뷰 C §1 P1) — 목록 화면의 유일한 입구. 자동 전환 판정을 먼저
// 한 번(04-11, 실패해도 저장된 상태로 계속) → 집계 → 쪽 수·쪽 보정(D-91) → 그 쪽 목록 순으로 읽고(0건이면 목록을 읽지
// 않는다), 행은 projectMany 투영만 넘긴다.
export async function loadProjectList(
  viewer: Viewer,
  query: ProjectListQuery,
  deps?: Partial<ProjectListDeps>,
): Promise<ProjectListResult> {
  const now = deps?.now ?? (() => new Date());
  const repo = deps?.repo ?? { aggregate: repoAggregateProjects, listPage: repoListProjectsPage };

  await (deps?.settle ?? settleForProjectList)(viewer);
  const scope = await (deps?.scope ?? scopeFor)(viewer, PROJECT_ENTITY);

  const year = query.year ?? kstYear(now());
  const range = resolveListRange({ year });
  const filter: ProjectListFilter = {
    status: query.status,
    teamId: query.teamId,
    search: query.search,
    ...(range ? { range: { start: range.start, end: range.end } } : {}),
  };
  const sort = normalizeSort(query.sort);

  let buckets: Awaited<ReturnType<typeof repoAggregateProjects>>;
  let rows: ProjectListRow[] = [];
  let paging: ReturnType<typeof resolveListPage>;
  try {
    buckets = await repo.aggregate(viewer, { scope, filter });
    paging = resolveListPage(buckets, query.page);
    if (paging.total > 0) {
      rows = await repo.listPage(viewer, { scope, filter, sort, offset: paging.offset, limit: paging.limit });
    }
  } catch (error) {
    log.error("project.list_failed", { code: pgErrorCode(error) });
    throw error;
  }

  const inBucket = buckets.find((bucket) => bucket.bucket === "in");
  const undetermined = buckets.find((bucket) => bucket.bucket === "undetermined")?.count ?? 0;
  const outside = buckets.filter((bucket) => bucket.bucket !== "in" && bucket.bucket !== "undetermined");
  const exclusion =
    range?.kind === "period"
      ? exclusionText({ kind: "period", outside: outside.reduce((sum, bucket) => sum + bucket.count, 0), undetermined })
      : exclusionText({
          kind: "year",
          byYear: Object.fromEntries(outside.map((bucket) => [Number(bucket.bucket), bucket.count])),
          undetermined,
        });
  const count = inBucket?.count ?? 0;
  const totals = (await project(
    viewer,
    {
      title: totalsTitle({ statusLabel: query.statusLabel, range, count }),
      count,
      exclusionText: exclusion,
      revenueKrw: inBucket?.revenueKrw ?? 0,
      quoteAmountKrw: inBucket?.quoteAmountKrw ?? 0,
      executionAmountKrw: inBucket?.executionAmountKrw ?? 0,
      profitKrw: inBucket?.profitKrw ?? 0,
      profitRate: inBucket?.profitRate ?? null,
    },
    PROJECT_LIST_TOTALS_DTO_SPEC,
  )) as ProjectListTotals;

  const dtos = (await projectMany(viewer, rows, PROJECT_LIST_DTO_SPEC)) as ProjectListItemDto[];
  return {
    year,
    rows: dtos.map((dto) => ({
      ...dto,
      groupLabel: monthGroupLabel(dto.endDate),
      attributionLabel: attributionLabel({ endDate: dto.endDate ?? null, range }),
    })),
    totals,
    total: paging.total,
    page: paging.page,
    pageCount: paging.pageCount,
    periodErrors: {},
  };
}

// 프로젝트 id는 uuid다 — 모양이 아니면 쿼리 전에 「없음」(22P02로 오류 화면이 되지 않게, PR #38 /qa).
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 04-11(D-76 · 엔지 리뷰 A P3): 행 범위와 id 모양을 확인한 뒤에만 자동 정산을 판정한다 —
// 보기 권한 없는 요청과 틀린 URL id는 쓰기도 실패 로그도 만들지 않는다. 판정 실패는
// applyAutoSettlement가 로그만 남기고 삼킨다(읽기는 저장된 상태로 계속된다).
export async function findProject(
  viewer: Viewer,
  id: string,
  deps?: { autoSettlement?: Partial<AutoSettlementDeps> },
): Promise<ProjectDto | null> {
  const scope = await scopeFor(viewer, PROJECT_ENTITY);
  if (scope.rows === "none") return null;
  if (!UUID_SHAPE.test(id)) return null;

  await applyAutoSettlement({ projectIds: [id] }, deps?.autoSettlement);

  const row = await repoFindProjectById(viewer, id);
  if (!row) return null;
  if (row.archivedAt !== null && !scope.includeArchived) return null;

  return (await project(viewer, withPreEstimate(row), PROJECT_DTO_SPEC)) as ProjectDto;
}

// 04-11(A-07 · 엔지 리뷰 A P3): 목록 요청의 자동 정산 입구 — 요청당 한 번, loadProjectList가
// 집계·목록을 읽기 전에 부른다. 리포지토리 목록·집계는 판정하지 않는다(두 읽기가
// SKIP LOCKED로 서로를 건너뛰면 목록과 합계의 정산 건수가 어긋난다). 보기 권한이 없으면
// 아무것도 하지 않는다.
export async function settleForProjectList(viewer: Viewer, deps?: Partial<AutoSettlementDeps>): Promise<void> {
  const scope = await scopeFor(viewer, PROJECT_ENTITY);
  if (scope.rows === "none") return;
  await applyAutoSettlement({}, deps);
}

export type ProjectInput = {
  clientId: string;
  teamId: string;
  pmUserId: string;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  customFields?: Record<string, unknown>;
  // 04-15(D-70) — 복사 등록의 출처 프로젝트 id. 현재 차수의 견적 줄 구조만 새 1차로 온다.
  copyFromProjectId?: string;
  // 04-15(D-52 · D-71) — 총 매출 예상가(사전 견적). 없으면 04-01 기본 저장(원화 0 · KRW · 환율 1).
  preEstimate?: { currency: Currency; amount: number; fxRate: number | null };
  // 환율 칸을 실제로 고쳤을 때만 최근 환율 설정을 갱신한다(T-04-11).
  preEstimateFxRateTouched?: boolean;
};

// 04-15(B-17 · PR #38) — 등록 입력의 칸 오류. 화면이 칸 아래 Form.Error와 1차 옆 한 줄로 그린다.
export type ProjectInputFieldError = {
  field: "startDate" | "endDate" | "preEstimateAmount" | "preEstimateFxRate";
  reason: string;
};

export class ProjectInputRejectedError extends UserFacingError {
  constructor(readonly errors: ProjectInputFieldError[]) {
    super(errors[0]?.reason ?? "등록하지 못했습니다");
  }
}

// 기간은 04-22 판정, 총 매출 예상가는 04-44 칸 판정(부호 · 숫자) 뒤 04-40 금액 입력 한 규칙(KRW 환율 1 · USD 환율 > 0 ·
// 정수 범위) — 이 파일에 따로 검사하지 않는다. 통과하면 저장할 금액을 돌려준다.
function validateProjectInput(input: ProjectInput): { errors: ProjectInputFieldError[]; preEstimate: MoneyInput | null } {
  const errors: ProjectInputFieldError[] = validateNewProjectPeriod({ start: input.startDate ?? null, end: input.endDate ?? null }).map(
    (error) => ({ field: error.field === "start" ? "startDate" : "endDate", reason: error.reason }),
  );
  if (!input.preEstimate) return { errors, preEstimate: null };
  const fieldErrors = validatePreEstimateChange(input.preEstimate);
  if (fieldErrors.length > 0) {
    for (const error of fieldErrors) {
      errors.push({ field: error.field === "amount" ? "preEstimateAmount" : "preEstimateFxRate", reason: error.reason });
    }
    return { errors, preEstimate: null };
  }
  try {
    const preEstimate = normalizeMoneyInput({ ...input.preEstimate, fxRate: input.preEstimate.fxRate ?? 1 });
    return { errors, preEstimate };
  } catch (error) {
    if (!(error instanceof MoneyInputError)) throw error;
    errors.push({ field: error.field === "fxRate" ? "preEstimateFxRate" : "preEstimateAmount", reason: error.message });
    return { errors, preEstimate: null };
  }
}

const COPY_SOURCE_RULE = "project.copy-source";
const CREATE_TEAM_SCOPE_RULE = "project.create-team-scope";
const COPY_SOURCE_MISSING = "복사할 프로젝트 없음 · 새로 고침";

// 04-15 — 복사 출처는 보는 사람의 행 범위 안 · 보관 안 된 프로젝트만. 보관함을 볼 수 있어도 보관된 프로젝트는 출처가 아니다.
async function findCopySourceRow(viewer: Viewer, id: string): Promise<ProjectRow | null> {
  const scope = await scopeFor(viewer, PROJECT_ENTITY);
  if (scope.rows === "none" || !UUID_SHAPE.test(id)) return null;
  const row = await repoFindProjectById(viewer, id);
  if (!row || row.archivedAt !== null) return null;
  return row;
}

export type ProjectCopySource = {
  number: string;
  name: string;
  clientId: string;
  teamId: string;
  pmUserId: string;
  /** 복사될 줄 수 — 현재 차수의 견적 줄 · 견적 외 비용(보관 · 취소 제외, 복사와 같은 기준). */
  lineCount: number;
};

// 04-15(D-70 · S2) — 복사 등록 폼의 미리 채우기와 출처 한 줄 `{번호} {프로젝트명}에서 복사 · {k}줄`. 범위 밖이면 null.
export async function getProjectCopySource(viewer: Viewer, id: string): Promise<ProjectCopySource | null> {
  const row = await findCopySourceRow(viewer, id);
  if (!row) return null;
  const revision = await repoFindLatestQuoteRevision(viewer, row.id);
  const lineCount = revision ? await repoCountCopyableLines(viewer, revision.id, undefined, { excludeCancelled: true }) : 0;
  return { number: row.number, name: row.name, clientId: row.clientId, teamId: row.teamId, pmUserId: row.pmUserId, lineCount };
}

export type ProjectWriteDeps = {
  can: typeof defaultCan;
  recordAction: typeof defaultRecordAction;
  now: () => Date;
};

// PROJ-01·D-42·D-53: 등록 — 권한 확인 → custom_fields 검증 → 같은
// 트랜잭션 안에서 번호 부여(document_counters 행 잠금) + projects INSERT +
// quote_revisions 1차 INSERT(빈 차수 금지) → recordAction. 상태는 항상
// 수주중(bidding)이고 번호·상태 둘 다 폼 입력이 아니다(서버가 정한다).
export async function createProject(
  viewer: Viewer,
  input: ProjectInput,
  deps?: Partial<ProjectWriteDeps>,
): Promise<ProjectDto> {
  const canFn = deps?.can ?? defaultCan;
  if (!(await canFn(viewer, PROJECTS_MENU, "write"))) {
    throw new ForbiddenError("프로젝트 등록 권한이 없습니다.");
  }

  const { errors: inputErrors, preEstimate } = validateProjectInput(input);
  if (inputErrors.length > 0) throw new ProjectInputRejectedError(inputErrors);
  const preEstimateColumns = preEstimate ? moneyToColumns(preEstimate) : null;

  const now = deps?.now?.() ?? new Date();
  // 보안 감사 — 팀 업무 범위 계급은 내 팀 프로젝트만, 오늘(KST) 내 팀 사람을 PM으로만 등록한다(status.ts 전환과 같은 판정).
  const todayKst = kstToday(now);
  const teamScope = await loadActorTeamScope(viewer, { todayKst });
  if (!coversProjectTeam(teamScope, input.teamId)) {
    denyWrite(viewer, CREATE_TEAM_SCOPE_RULE, {}, new ForbiddenError("내 팀 프로젝트만 등록할 수 있습니다."));
  }
  if (teamScope.workScope === "team" && (await findMembershipAtDate(viewer, input.pmUserId, todayKst))?.teamId !== input.teamId) {
    denyWrite(viewer, CREATE_TEAM_SCOPE_RULE, {}, new ForbiddenError("담당 PM은 내 팀 사람만 고를 수 있습니다."));
  }

  const customFields = await validatedCustomFields(viewer, input.customFields);
  // C-17: 번호 연도는 KST — 1월 1일 00:00~09:00(KST) 등록도 새해 번호다.
  const year = kstYear(now);
  // 서식 설정은 트랜잭션을 열기 전에 읽는다 — 풀 소진 애플리케이션 교착을
  // 막는다(domain/document-numbering/index.ts의 allocateDocumentNumber 주석 참고).
  const format = await loadDocumentNumberFormat(PROJECT_NUMBER_COUNTER_KEY);

  // 04-15(04-32 규칙) — 복사 출처 판정은 번호 부여 트랜잭션 앞에서 한다(잠금 안에서 전역 db를 부르지 않는다).
  const copySourceId = input.copyFromProjectId;
  if (copySourceId !== undefined && !(await findCopySourceRow(viewer, copySourceId))) {
    denyWrite(viewer, COPY_SOURCE_RULE, { sourceProjectId: copySourceId }, new CopySourceMissingError(COPY_SOURCE_MISSING));
  }

  const { row: created, copiedLineCount } = await withTransaction(async (tx) => {
    const { number } = await allocateDocumentNumber(
      viewer,
      { counterKey: PROJECT_NUMBER_COUNTER_KEY, year, format },
      tx,
    );
    const row = await repoInsertProject(
      viewer,
      {
        number,
        clientId: input.clientId,
        teamId: input.teamId,
        pmUserId: input.pmUserId,
        name: input.name,
        status: "bidding",
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        preEstimateCurrency: preEstimateColumns?.currency ?? "KRW",
        preEstimateForeignAmount: preEstimateColumns?.foreignAmount ?? null,
        preEstimateFxRate: preEstimateColumns?.fxRate ?? "1.0000",
        preEstimateAmountKrw: preEstimateColumns?.amountKrw ?? 0,
        customFields,
      },
      tx,
    );
    const firstRevision = await repoInsertQuoteRevision(viewer, { projectId: row.id, seq: 1 }, tx);
    // 04-15(D-70 · B-32) — 출처 현재 차수의 견적 줄 구조를 새 1차로(04-14 복사 한 문장, 계보 없음 · 취소 줄 제외).
    let copied: number | null = null;
    if (copySourceId !== undefined) {
      const sourceRevision = await repoFindLatestQuoteRevision(viewer, copySourceId, tx);
      copied = sourceRevision
        ? await repoCopyQuoteLines(
            viewer,
            { fromRevisionId: sourceRevision.id, toRevisionId: firstRevision.id, withLineage: false, excludeCancelled: true },
            tx,
          )
        : 0;
    }
    return { row, copiedLineCount: copied };
  });

  // D-71 · 04-32 규칙 — 최근 환율은 등록 트랜잭션이 커밋된 뒤 한 번만(거부 · 롤백된 등록은 여기 오지 않는다).
  if (input.preEstimateFxRateTouched && preEstimate && preEstimate.currency !== "KRW") {
    await rememberFxAfterCommit([{ currency: preEstimate.currency, rate: preEstimate.fxRate }]);
  }

  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, {
    actionType: "document_create",
    entity: PROJECT_ENTITY,
    entityId: created.id,
    ...(copiedLineCount !== null ? { detail: { copiedFromProjectId: copySourceId, copiedLineCount } } : {}),
  });

  return (await project(viewer, withPreEstimate(created), PROJECT_DTO_SPEC)) as ProjectDto;
}
