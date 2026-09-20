import type { Viewer } from "@/domain/viewer";
import { findRoleById, setRoleArchived } from "@/repositories/roles";
import { findCodeItemById, setCodeItemArchived } from "@/repositories/code-tables";

// archive()/restore()(domain/archive/index.ts)가 필요로 하는 최소 행 모양.
// isSeed는 roles 전용(시드 계급 보관 거부 판정) — 다른 표는 없어도 된다.
export type ArchivableRow = { archivedAt: Date | null; isSeed?: boolean };

export type ArchivableEntry = {
  entity: string;
  label: string;
  setArchived(viewer: Viewer, id: string, value: boolean): Promise<void>;
  findById(viewer: Viewer, id: string): Promise<ArchivableRow | null>;
  isProtected?(row: ArchivableRow): boolean;
};

// 보관 대상 표의 단일 정본 — 새 마스터 표가 생기면 이 배열에 한 줄을 더하면
// archive()·restore()·보관함 화면(03-07)이 전부 따라온다. 03-05(본부·팀·법인카드·
// 사람)·03-06(거래처)이 항목을 더한다.
export const ARCHIVABLE_TABLES: ArchivableEntry[] = [
  {
    entity: "roles",
    label: "계급",
    async setArchived(viewer, id, value) {
      await setRoleArchived(viewer, id, value);
    },
    async findById(viewer, id) {
      return findRoleById(viewer, id);
    },
    // 시드 5종은 보관 요청이 거부된다 — 계급이 0개가 되는 상태를 막는다.
    isProtected(row) {
      return Boolean(row.isSeed);
    },
  },
  {
    entity: "code_items",
    label: "코드표",
    async setArchived(viewer, id, value) {
      await setCodeItemArchived(viewer, id, value);
    },
    async findById(viewer, id) {
      return findCodeItemById(viewer, id);
    },
  },
];
