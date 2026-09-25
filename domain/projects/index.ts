import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { visible as defaultVisible } from "@/domain/permissions/visible";
import { scopeFor } from "@/domain/permissions/scope-for";
import { project, type DtoSpec } from "@/domain/permissions/project";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { registerDto } from "@/domain/permissions/dto-registry";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { buildCustomFieldsSchema, type FieldDefType } from "@/domain/custom-fields/build-schema";
import { allocateDocumentNumber, loadDocumentNumberFormat } from "@/domain/document-numbering";
import { withTransaction } from "@/lib/db-transaction";
import { kstYear } from "@/lib/kst-date";
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

export type ProjectListItemWithGroup = ProjectListItemDto & { groupLabel: string };

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

export const PROJECT_LIST_DEFAULT_LIMIT = 50;
// T-04-32 — 「더 보기」 개수 파라미터 상한. 이보다 큰 값이 와도 상한으로
// 떨어뜨린다 — 한 요청이 전체 행을 끌어오지 못하게 한다.
export const PROJECT_LIST_MAX_LIMIT = 1000;

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

export type ListProjectsOptions = {
  filter?: ProjectListFilter;
  sort?: { key?: string; direction?: string };
  limit?: number;
};

// PROJ-01 — 04-05 Task 1 ②: 필터(상태·팀·연도·검색어)·정렬·페이지 인자를
// 받아 목록을 돌려준다. 그룹 나누기(종료일 월, 기간 미정)는 여기서
// 끝난다 — 화면은 `groupLabel`을 읽기만 한다.
export async function listProjects(
  viewer: Viewer,
  opts?: ListProjectsOptions,
): Promise<ProjectListItemWithGroup[]> {
  const scope = await scopeFor(viewer, PROJECT_ENTITY);
  const sort = normalizeSort(opts?.sort);
  const limit = Math.min(Math.max(opts?.limit ?? PROJECT_LIST_DEFAULT_LIMIT, 1), PROJECT_LIST_MAX_LIMIT);
  const rows = await repoListProjectsPage(viewer, { scope, filter: opts?.filter ?? {}, sort, limit });
  const dtos = (await Promise.all(
    rows.map((row) => project(viewer, row, PROJECT_LIST_DTO_SPEC)),
  )) as ProjectListItemDto[];
  return dtos.map((dto) => ({ ...dto, groupLabel: monthGroupLabel(dto.endDate) }));
}

export type ProjectAggregateDto = {
  count: number;
  quoteAmountKrw?: number;
  executionAmountKrw?: number;
  profitKrw?: number;
};

// 04-05 Task 1 ①: 집계 — 목록과 같은 필터를 쓰는 별도의 쿼리 한 번(T-04-28).
// 견적·실행가·차익 셋을 개별 판정하지 않고 표 단위(quote.amount) 하나로
// 게이트한다 — 04-02 발행·입금 선례와 같은 결.
export async function aggregateProjects(
  viewer: Viewer,
  filter?: ProjectListFilter,
): Promise<ProjectAggregateDto> {
  const scope = await scopeFor(viewer, PROJECT_ENTITY);
  const agg = await repoAggregateProjects(viewer, { scope, filter: filter ?? {} });
  const canSeeAmount = await defaultVisible(viewer, "quote.amount");
  if (!canSeeAmount) return { count: agg.count };
  return {
    count: agg.count,
    quoteAmountKrw: agg.quoteAmountKrw,
    executionAmountKrw: agg.executionAmountKrw,
    profitKrw: agg.profitKrw,
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

// 04-11(A-07 · 엔지 리뷰 A P3): 목록 요청의 자동 정산 입구 — 요청당 한 번, 목록·합계를
// 나란히 읽기 전에 부른다. listProjects·aggregateProjects는 판정하지 않는다(두 호출이
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
    errors.push({ field: error.reason === "fx-rate" ? "preEstimateFxRate" : "preEstimateAmount", reason: error.message });
    return { errors, preEstimate: null };
  }
}

const COPY_SOURCE_RULE = "project.copy-source";
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

  const customFields = await validatedCustomFields(viewer, input.customFields);
  // C-17: 번호 연도는 KST — 1월 1일 00:00~09:00(KST) 등록도 새해 번호다.
  const year = kstYear(deps?.now?.() ?? new Date());
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
        contractCurrency: "KRW",
        contractForeignAmount: null,
        contractFxRate: "1.0000",
        contractAmountKrw: 0,
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
