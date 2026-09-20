import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { ARCHIVABLE_TABLES } from "@/repositories/archive";
import { UserFacingError } from "@/lib/actions/user-facing-error";

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
    throw new UnknownArchivableEntityError(`등록되지 않은 entity입니다: ${entity}`);
  }
  return entry;
}

async function assertCanWrite(viewer: Viewer, deps?: Partial<ArchiveDeps>): Promise<void> {
  const canFn = deps?.can ?? defaultCan;
  const allowed = await canFn(viewer, ARCHIVE_MENU, "write");
  if (!allowed) {
    throw new ForbiddenError("보관함 쓰기 권한이 없습니다.");
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
  if (!row) throw new ArchivableRowNotFoundError("대상을 찾을 수 없습니다.");
  if (entry.isProtected?.(row)) {
    throw new ProtectedRowError("보호된 항목은 보관할 수 없습니다.");
  }

  await entry.setArchived(viewer, id, true);

  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, { actionType: "archive", entity, entityId: id });
}

export async function restore(
  viewer: Viewer,
  entity: string,
  id: string,
  deps?: Partial<ArchiveDeps>,
): Promise<void> {
  await assertCanWrite(viewer, deps);
  const entry = findEntry(entity);

  const row = await entry.findById(viewer, id);
  if (!row) throw new ArchivableRowNotFoundError("대상을 찾을 수 없습니다.");

  await entry.setArchived(viewer, id, false);

  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, { actionType: "restore", entity, entityId: id });
}
