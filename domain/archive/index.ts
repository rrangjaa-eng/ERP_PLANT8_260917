import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { project, type DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import {
  ARCHIVABLE_TABLES,
  listArchivedAcrossEntities as defaultListArchivedAcrossEntities,
  type ArchivedItem,
} from "@/repositories/archive";
import { findUserById as defaultFindUserById } from "@/repositories/users";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { restoreQuoteLine } from "@/domain/quotes/lines";

// ADMN-12: "지우지 않는다" — archived_at/archived_by 규약의 유일한 진입점.
// 물리 삭제 문장은 이 리포 어디에도 넣지 않는다 — DB 레벨 권한 회수(REVOKE)는
// 이 페이즈 범위 밖이다(운영 DB 권한 변경은 배포 절차 변경을 부르며, 코드에
// 물리 삭제 호출이 0건인 것으로 이 페이즈의 계약은 성립한다).
export class ForbiddenError extends UserFacingError {}
export class UnknownArchivableEntityError extends UserFacingError {}
export class ProtectedRowError extends UserFacingError {}
export class ArchivableRowNotFoundError extends UserFacingError {}

export type ArchiveDeps = {
  can: typeof defaultCan;
  recordAction: typeof defaultRecordAction;
};

const ARCHIVE_MENU = "admin.archive";

function findEntry(entity: string) {
  const entry = ARCHIVABLE_TABLES.find((candidate) => candidate.entity === entity);
  if (!entry) {
    throw new UnknownArchivableEntityError(`등록되지 않은 entity: ${entity}`);
  }
  return entry;
}

async function assertCanWrite(viewer: Viewer, deps?: Partial<ArchiveDeps>): Promise<void> {
  const canFn = deps?.can ?? defaultCan;
  const allowed = await canFn(viewer, ARCHIVE_MENU, "write");
  if (!allowed) {
    throw new ForbiddenError("보관함 쓰기 권한 없음");
  }
}

// 보관은 대상 행의 보관 시각이 이미 있으면 그 값을 유지한 채 성공으로
// 돌아온다(멱등 — repositories의 조건부 UPDATE가 보장). 시드 계급은 거부한다
// (isProtected).
export async function archive(
  viewer: Viewer,
  entity: string,
  id: string,
  deps?: Partial<ArchiveDeps>,
): Promise<void> {
  await assertCanWrite(viewer, deps);
  const entry = findEntry(entity);

  const row = await entry.findById(viewer, id);
  if (!row) throw new ArchivableRowNotFoundError("대상 찾을 수 없음");
  if (entry.isProtected?.(row)) {
    throw new ProtectedRowError("보호된 항목은 보관할 수 없음");
  }

  await entry.setArchived(viewer, id, true);

  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, { actionType: "archive", entity, entityId: id });
}

// 04-12(A-19 · OV-2) — 도메인 규칙이 있는 엔티티의 복원은 도메인 함수에 통째로 맡긴다(잠금·게이트·보관 해제·로그를
// 한 트랜잭션에서). 범용 setArchived 경로는 이 표에 없는 엔티티만 탄다(리저브는 04-07 · 그룹 B가 더한다).
const DOMAIN_RESTORERS: Partial<Record<string, (viewer: Viewer, id: string, deps?: Partial<ArchiveDeps>) => Promise<void>>> = {
  quote_line: (viewer, id, deps) => restoreQuoteLine(viewer, id, { recordAction: deps?.recordAction }),
};

export async function restore(
  viewer: Viewer,
  entity: string,
  id: string,
  deps?: Partial<ArchiveDeps>,
): Promise<void> {
  await assertCanWrite(viewer, deps);
  const domainRestorer = DOMAIN_RESTORERS[entity];
  if (domainRestorer) return domainRestorer(viewer, id, deps);
  const entry = findEntry(entity);

  const row = await entry.findById(viewer, id);
  if (!row) throw new ArchivableRowNotFoundError("대상 찾을 수 없음");

  await entry.setArchived(viewer, id, false);

  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, { actionType: "restore", entity, entityId: id });
}

// 03-07: 보관함 화면의 domain 진입점 — 새 정보 항목("archive.value")으로
// 게이트한다(기존 정보 항목은 각 마스터 표 전용이라 여러 표를 섞은 목록에
// 맞는 항목이 없었다 — Rule 2, 누락된 핵심 배선).
const ARCHIVE_INFO_ITEM = "archive.value";

export type ArchiveEntryDto = {
  entity: string;
  label: string;
  id: string;
  name: string;
  archivedAt: Date;
  archivedBy: string | null;
};

export const ARCHIVE_ENTRY_DTO_SPEC: DtoSpec<ArchivedItem, ArchiveEntryDto> = {
  fields: [
    { key: "entity", from: "entity", infoItem: ARCHIVE_INFO_ITEM },
    { key: "label", from: "label", infoItem: ARCHIVE_INFO_ITEM },
    { key: "id", from: "id", infoItem: ARCHIVE_INFO_ITEM },
    { key: "name", from: "name", infoItem: ARCHIVE_INFO_ITEM },
    { key: "archivedAt", from: "archivedAt", infoItem: ARCHIVE_INFO_ITEM },
    { key: "archivedBy", from: "archivedBy", infoItem: ARCHIVE_INFO_ITEM },
  ],
};

registerDto({
  name: "ArchiveEntryDto",
  fields: ARCHIVE_ENTRY_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

export type ListArchiveDeps = {
  can: typeof defaultCan;
  listArchivedAcrossEntities: typeof defaultListArchivedAcrossEntities;
  findUserById: typeof defaultFindUserById;
};

// 보관함 메뉴 보기 권한 확인 → 여러 표를 훑는 조회(repositories/archive의
// ARCHIVABLE_TABLES 순회) → 보관한 사람 id를 이름으로 합성 → 투영. 새 표
// 목록을 이 함수가 만들지 않는다 — 정본은 ARCHIVABLE_TABLES 하나다.
// archivedBy는 raw id가 아니라 이름으로 화면에 낸다(내부 식별자를 그대로
// 사용자에게 보이지 않는다 — 지난 웨이브 UI 감사가 잡은 결함과 같은 종류를
// 미리 막는다).
export async function listArchive(viewer: Viewer, deps?: Partial<ListArchiveDeps>): Promise<ArchiveEntryDto[]> {
  const canFn = deps?.can ?? defaultCan;
  if (!(await canFn(viewer, ARCHIVE_MENU, "view"))) {
    throw new ForbiddenError("보관함 열람 권한 없음");
  }

  const listFn = deps?.listArchivedAcrossEntities ?? defaultListArchivedAcrossEntities;
  const rows = await listFn(viewer);

  const findUserById = deps?.findUserById ?? defaultFindUserById;
  const archivedByIds = [...new Set(rows.map((row) => row.archivedBy).filter((id): id is string => id !== null))];
  const namesById = new Map(
    await Promise.all(
      archivedByIds.map(async (id) => [id, (await findUserById(viewer, id))?.name ?? id] as const),
    ),
  );

  return Promise.all(
    rows.map((row) =>
      project(
        viewer,
        { ...row, archivedBy: row.archivedBy ? (namesById.get(row.archivedBy) ?? row.archivedBy) : null },
        ARCHIVE_ENTRY_DTO_SPEC,
      ),
    ),
  ) as Promise<ArchiveEntryDto[]>;
}
