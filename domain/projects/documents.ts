import type { Viewer } from "@/domain/viewer";
import type { DbOrTx } from "@/repositories/document-counters";
import { can } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";
import { projectMany, type DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import { denyWrite } from "@/domain/rules/deny-write";
import { getSettingValue } from "@/domain/settings/registry";
import { EVIDENCE_MAX_SIZE_MB } from "@/domain/settings/keys";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { kstToday } from "@/lib/kst-date";
import { projectRowScope } from "@/domain/projects/visibility";
import { actorCoversProjectTeam } from "@/domain/projects/status";
import { periodEditRights } from "@/domain/projects/period";
import { PROJECT_STATUSES } from "@/domain/projects/status-transitions";
import { findProjectInScope, lockProjectForWrite, type ProjectRow } from "@/repositories/projects";
import {
  findProjectDocumentById,
  hasProjectDocument,
  listProjectDocumentFiles,
  type ProjectDocumentKind,
  type ProjectDocumentRow,
} from "@/repositories/project-documents";

// 07-18(W6) — 화면(app/)이 repositories를 직접 부르지 못하므로 한 겹 감싼다. 호출부(프로젝트 상세)는 프로젝트를 범위 안에서 읽은 뒤에 부른다.
export async function projectHasPurchaseOrder(viewer: Viewer, projectId: string): Promise<boolean> {
  return hasProjectDocument(viewer, projectId, "purchase_order");
}

// ── 프로젝트 서류 주인(07-22 · W3 · SC-20) ──────────────────────────────────────────────────────────────────
// 05 domain/evidence의 주인 표 `project_document` 줄이 부른다(이 파일은 evidence 도메인을 import하지 않는다 — 순환). 파일 하나 = 서류 행 하나
// (files.owner_id = project_documents.id). 읽기 = 프로젝트 행 범위 ∧ quote.amount 노출(발주서에 견적 금액이 적힘 — 사용자 결정 10/23, 견적 차수 증빙과 같은 기준), 쓰기 = 읽기 ∧ 07-18 정보 면 저장 권리(periodEditRights — 담당 PM · 팀장, 완료 아님)
// ∧ 서류 · 프로젝트 보관 아님. 지우기 = 05 증빙 지우기(파일 removed_at) — 살아 있는 파일이 없는 서류 행은 목록 · hasProjectDocument가 세지 않는다.

export const PROJECT_DOCUMENT_KIND = "project_document";

const PROJECT_NOT_FOUND = "존재하지 않는 프로젝트";
const FORBIDDEN_RULE = "project.document.forbidden";
const FORBIDDEN_MESSAGE = "프로젝트 서류 권한 없음";
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ProjectDocumentOwner = {
  id: string;
  drafterId: "";
  number: null;
  status: "open" | "closed";
  updatedAt: Date;
  version: number;
  projectId: string;
  instance: null;
  closed: false;
  projectCompleted: boolean;
  project: ProjectRow;
};

function toOwner(doc: ProjectDocumentRow, project: ProjectRow): ProjectDocumentOwner {
  return {
    id: doc.id,
    drafterId: "",
    number: null,
    status: doc.removedAt === null && project.archivedAt === null ? "open" : "closed",
    updatedAt: doc.createdAt,
    version: 0,
    projectId: project.id,
    instance: null,
    closed: false,
    projectCompleted: project.status === "completed",
    project,
  };
}

// 범위 안 프로젝트(보관은 includeArchived일 때만) — 트랜잭션 밖 풀 읽기.
async function findVisibleProject(viewer: Viewer, projectId: string): Promise<ProjectRow | null> {
  if (!UUID_SHAPE.test(projectId)) return null;
  const scope = await projectRowScope(viewer);
  if (scope.rows === "none") return null;
  const project = await findProjectInScope(viewer, scope, projectId);
  return project && (project.archivedAt === null || scope.includeArchived) ? project : null;
}

// tx가 없으면 풀 읽기(범위 밖 = 없음), 있으면 서류 행 → 프로젝트 행 잠금(07-18 정보 면 저장과 같은 프로젝트 행 — 범위 판정은 트랜잭션 전 rights).
export async function projectDocumentOwner(viewer: Viewer, documentId: string, tx?: DbOrTx): Promise<ProjectDocumentOwner | null> {
  if (!UUID_SHAPE.test(documentId)) return null;
  const doc = await findProjectDocumentById(viewer, documentId, tx);
  if (!doc) return null;
  const project = tx ? await lockProjectForWrite(viewer, doc.projectId, tx) : await findVisibleProject(viewer, doc.projectId);
  return project ? toOwner(doc, project) : null;
}

// 07-18 정보 면 저장 권리 — 상세 page.tsx와 같은 사실(projects 쓰기 · projects.period 쓰기 · 업무 범위가 팀을 덮음). 완료 · 보관은 닫힘.
async function canEditProject(viewer: Viewer, project: ProjectRow): Promise<boolean> {
  const status = PROJECT_STATUSES.find((value) => value === project.status);
  if (!status || project.archivedAt !== null) return false;
  const [canWrite, canEditPeriod, actorCoversTeam] = await Promise.all([
    can(viewer, "projects", "write"),
    can(viewer, "projects.period", "write"),
    actorCoversProjectTeam(viewer, project, { todayKst: kstToday(new Date()) }),
  ]);
  return periodEditRights({ status, isAssignedPm: project.pmUserId === viewer.id, canWrite, canEditPeriod, actorCoversTeam }) !== "none";
}

// 서류 읽기 = 범위 안 프로젝트 ∧ quote.amount 노출 — 목록 · 붙이기 시작 · 증빙 주인 표(받기 · 지우기)가 같은 판정을 쓴다.
async function findReadableProject(viewer: Viewer, projectId: string): Promise<ProjectRow | null> {
  return (await visible(viewer, "quote.amount")) ? findVisibleProject(viewer, projectId) : null;
}

export async function projectDocumentRights(viewer: Viewer, owner: ProjectDocumentOwner): Promise<{ read: boolean; write: boolean }> {
  if (!(await visible(viewer, "quote.amount"))) return { read: false, write: false };
  return { read: true, write: projectDocumentWriteOpen(owner) && (await canEditProject(viewer, owner.project)) };
}

// 잠근 뒤 다시 보는 순수 판정 — 서류 · 프로젝트가 살아 있고 프로젝트가 완료가 아니다(정보 면 권리가 완료에서 닫힌다).
export function projectDocumentWriteOpen(owner: ProjectDocumentOwner): boolean {
  return owner.status === "open" && !owner.projectCompleted;
}

export function projectDocumentNotFound(): UserFacingError {
  return new UserFacingError(PROJECT_NOT_FOUND);
}

export function denyProjectDocumentWrite(viewer: Viewer, projectId: string): never {
  return denyWrite(viewer, FORBIDDEN_RULE, { projectId }, new UserFacingError(FORBIDDEN_MESSAGE));
}

// 붙이기 시작 전 판정(document-upload.ts) — 못 보면 없는 프로젝트, 보지만 못 쓰면 거부.
export async function assertProjectDocumentWritable(viewer: Viewer, projectId: string): Promise<ProjectRow> {
  const project = await findReadableProject(viewer, projectId);
  if (!project) throw projectDocumentNotFound();
  if (!(await canEditProject(viewer, project))) denyProjectDocumentWrite(viewer, project.id);
  return project;
}

// ── 목록 ──────────────────────────────────────────────────────────────

export type ProjectDocumentDto = {
  fileId: string;
  kind: ProjectDocumentKind;
  name: string;
  sizeBytes: number;
  uploaderName: string | null;
  createdAt: string;
};

const PROJECT_DOCUMENT_DTO_SPEC: DtoSpec<ProjectDocumentDto, ProjectDocumentDto> = {
  fields: [
    { key: "fileId", from: "fileId", infoItem: "project.value" },
    { key: "kind", from: "kind", infoItem: "project.value" },
    { key: "name", from: "name", infoItem: "project.value" },
    { key: "sizeBytes", from: "sizeBytes", infoItem: "project.value" },
    { key: "uploaderName", from: "uploaderName", infoItem: "project.value" },
    { key: "createdAt", from: "createdAt", infoItem: "project.value" },
  ],
};

registerDto({ name: "projectDocument", fields: PROJECT_DOCUMENT_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });

export type ProjectDocumentList = { canWrite: boolean; maxMb: number; documents: Partial<ProjectDocumentDto>[] };

// 상세 「서류」 섹션 — 살아 있는 파일이 있는 서류만, 올린 순. 서류를 읽을 수 없으면(프로젝트 범위 밖 · quote.amount 없음) null → 섹션 없음.
export async function listProjectDocuments(viewer: Viewer, projectId: string): Promise<ProjectDocumentList | null> {
  const project = await findReadableProject(viewer, projectId);
  if (!project) return null;
  const [rows, canWrite, maxMb] = await Promise.all([listProjectDocumentFiles(viewer, project.id), canEditProject(viewer, project), getSettingValue(EVIDENCE_MAX_SIZE_MB)]);
  const documents = await projectMany(
    viewer,
    rows.map((row) => ({ fileId: row.fileId, kind: row.kind, name: row.name, sizeBytes: row.sizeBytes, uploaderName: row.uploaderName, createdAt: row.createdAt.toISOString() })),
    PROJECT_DOCUMENT_DTO_SPEC,
  );
  return { canWrite, maxMb, documents };
}
