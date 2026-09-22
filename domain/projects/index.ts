import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { scopeFor } from "@/domain/permissions/scope-for";
import { project, type DtoSpec } from "@/domain/permissions/project";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { registerDto } from "@/domain/permissions/dto-registry";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { buildCustomFieldsSchema, type FieldDefType } from "@/domain/custom-fields/build-schema";
import { allocateDocumentNumber } from "@/domain/document-numbering";
import { withTransaction } from "@/lib/db-transaction";
import {
  listProjects as repoListProjects,
  findProjectById as repoFindProjectById,
  insertProject as repoInsertProject,
  type ProjectRow,
} from "@/repositories/projects";
import { insertQuoteRevision as repoInsertQuoteRevision } from "@/repositories/quote-revisions";
import { listFieldDefinitions as repoListFieldDefinitions } from "@/repositories/field-definitions";

export class ForbiddenError extends UserFacingError {}
// D-47 완료(정산) 뒤 잠김의 domain 가드 자리 — `domain/vendors`의
// ArchivedVendorError와 같은 결(vendors.ts:295-302 패턴). 이 플랜은
// createProject/조회만 두고, 프로젝트 수정·상태 전환은 04-06이 이 클래스를
// 실제로 throw하는 함수(updateProject 등)를 채운다.
export class CompletedProjectError extends UserFacingError {}

const PROJECTS_MENU = "projects";
const PROJECT_ENTITY = "project";
const PROJECT_NUMBER_COUNTER_KEY = "project";

// PROJ-01: 프로젝트 Dto. 이 플랜은 사전 견적(총 매출 예상가) Money 묶음을
// 등록 폼에서 다루지 않는다(트레이서 슬라이스 — 04-02/04-05가 매출 칸을
// 더한다) — DTO에서도 아직 노출하지 않는다.
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
};

export const PROJECT_DTO_SPEC: DtoSpec<ProjectRow, ProjectDto> = {
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

export async function listProjects(viewer: Viewer): Promise<ProjectDto[]> {
  const scope = await scopeFor(viewer, PROJECT_ENTITY);
  const rows = await repoListProjects(viewer, { scope });
  return Promise.all(rows.map((row) => project(viewer, row, PROJECT_DTO_SPEC))) as Promise<ProjectDto[]>;
}

export async function findProject(viewer: Viewer, id: string): Promise<ProjectDto | null> {
  const scope = await scopeFor(viewer, PROJECT_ENTITY);
  if (scope.rows === "none") return null;

  const row = await repoFindProjectById(viewer, id);
  if (!row) return null;
  if (row.archivedAt !== null && !scope.includeArchived) return null;

  return (await project(viewer, row, PROJECT_DTO_SPEC)) as ProjectDto;
}

export type ProjectInput = {
  clientId: string;
  teamId: string;
  pmUserId: string;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  customFields?: Record<string, unknown>;
};

export type ProjectWriteDeps = {
  can: typeof defaultCan;
  recordAction: typeof defaultRecordAction;
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

  const customFields = await validatedCustomFields(viewer, input.customFields);
  const year = new Date().getFullYear();

  const created = await withTransaction(async (tx) => {
    const { number } = await allocateDocumentNumber(viewer, { counterKey: PROJECT_NUMBER_COUNTER_KEY, year }, tx);
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
        preEstimateCurrency: "KRW",
        preEstimateForeignAmount: null,
        preEstimateFxRate: "1.0000",
        preEstimateAmountKrw: 0,
        contractCurrency: "KRW",
        contractForeignAmount: null,
        contractFxRate: "1.0000",
        contractAmountKrw: 0,
        customFields,
      },
      tx,
    );
    await repoInsertQuoteRevision(viewer, { projectId: row.id, seq: 1 }, tx);
    return row;
  });

  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, { actionType: "document_create", entity: PROJECT_ENTITY, entityId: created.id });

  return (await project(viewer, created, PROJECT_DTO_SPEC)) as ProjectDto;
}
