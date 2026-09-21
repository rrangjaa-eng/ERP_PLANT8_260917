import { isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { roles, codeItems, orgUnits, teams, corpCards, users, vendors } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import {
  findRoleById,
  setRoleArchived,
} from "@/repositories/roles";
import {
  findCodeItemById,
  setCodeItemArchived,
} from "@/repositories/code-tables";
import {
  findOrgUnitById,
  setOrgUnitArchived,
} from "@/repositories/org-units";
import { findTeamById, setTeamArchived } from "@/repositories/teams";
import {
  findCorpCardById,
  setCorpCardArchived,
} from "@/repositories/corp-cards";
import { findUserById, setUserArchived } from "@/repositories/users";
import { findVendorById, setVendorArchived } from "@/repositories/vendors";

// archive()/restore()(domain/archive/index.ts)가 필요로 하는 최소 행 모양.
// isSeed는 roles 전용(시드 계급 보관 거부 판정) — 다른 표는 없어도 된다.
export type ArchivableRow = { archivedAt: Date | null; isSeed?: boolean };

// 03-07: 보관함 화면(listArchivedAcrossEntities)이 쓰는 최소 행 모양 —
// 표시 이름 · 식별자 · 이름 · 보관 시각 · 보관한 사람.
export type ArchivedItem = {
  entity: string;
  label: string;
  id: string;
  name: string;
  archivedAt: Date;
  archivedBy: string | null;
};

export type ArchivableEntry = {
  entity: string;
  label: string;
  setArchived(viewer: Viewer, id: string, value: boolean): Promise<void>;
  findById(viewer: Viewer, id: string): Promise<ArchivableRow | null>;
  isProtected?(row: ArchivableRow): boolean;
  // 03-07: 이 표의 보관된 행 전부. listArchivedAcrossEntities가 이 클로저를
  // 순회해 합친다 — 새 표 목록을 별도로 만들지 않는다.
  listArchived(viewer: Viewer): Promise<ArchivedItem[]>;
};

// 보관 대상 표의 단일 정본 — 새 마스터 표가 생기면 이 배열에 한 줄을 더하면
// archive()·restore()·보관함 화면(03-07)이 전부 따라온다. 03-05(본부·팀·법인카드·
// 사람)·03-06(거래처)이 항목을 더했고, 03-07은 새 표를 더하지 않는다(이
// 상수 위에 listArchivedAcrossEntities만 얹는다).
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
    async listArchived() {
      const rows = await db
        .select({ id: roles.id, name: roles.name, archivedAt: roles.archivedAt, archivedBy: roles.archivedBy })
        .from(roles)
        .where(isNotNull(roles.archivedAt));
      return rows.map((row) => ({ entity: "roles", label: "계급", id: row.id, name: row.name, archivedAt: row.archivedAt as Date, archivedBy: row.archivedBy }));
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
    async listArchived() {
      const rows = await db
        .select({ id: codeItems.id, name: codeItems.label, archivedAt: codeItems.archivedAt, archivedBy: codeItems.archivedBy })
        .from(codeItems)
        .where(isNotNull(codeItems.archivedAt));
      return rows.map((row) => ({ entity: "code_items", label: "코드표", id: row.id, name: row.name, archivedAt: row.archivedAt as Date, archivedBy: row.archivedBy }));
    },
  },
  {
    entity: "org_unit",
    label: "본부",
    async setArchived(viewer, id, value) {
      await setOrgUnitArchived(viewer, id, value);
    },
    async findById(viewer, id) {
      return findOrgUnitById(viewer, id);
    },
    async listArchived() {
      const rows = await db
        .select({ id: orgUnits.id, name: orgUnits.name, archivedAt: orgUnits.archivedAt, archivedBy: orgUnits.archivedBy })
        .from(orgUnits)
        .where(isNotNull(orgUnits.archivedAt));
      return rows.map((row) => ({ entity: "org_unit", label: "본부", id: row.id, name: row.name, archivedAt: row.archivedAt as Date, archivedBy: row.archivedBy }));
    },
  },
  {
    entity: "team",
    label: "팀",
    async setArchived(viewer, id, value) {
      await setTeamArchived(viewer, id, value);
    },
    async findById(viewer, id) {
      return findTeamById(viewer, id);
    },
    async listArchived() {
      const rows = await db
        .select({ id: teams.id, name: teams.name, archivedAt: teams.archivedAt, archivedBy: teams.archivedBy })
        .from(teams)
        .where(isNotNull(teams.archivedAt));
      return rows.map((row) => ({ entity: "team", label: "팀", id: row.id, name: row.name, archivedAt: row.archivedAt as Date, archivedBy: row.archivedBy }));
    },
  },
  {
    entity: "corp_card",
    label: "법인카드",
    async setArchived(viewer, id, value) {
      await setCorpCardArchived(viewer, id, value);
    },
    async findById(viewer, id) {
      return findCorpCardById(viewer, id);
    },
    async listArchived() {
      const rows = await db
        .select({ id: corpCards.id, name: corpCards.label, archivedAt: corpCards.archivedAt, archivedBy: corpCards.archivedBy })
        .from(corpCards)
        .where(isNotNull(corpCards.archivedAt));
      return rows.map((row) => ({ entity: "corp_card", label: "법인카드", id: row.id, name: row.name, archivedAt: row.archivedAt as Date, archivedBy: row.archivedBy }));
    },
  },
  {
    entity: "user",
    label: "사람",
    async setArchived(viewer, id, value) {
      await setUserArchived(viewer, id, value);
    },
    async findById(viewer, id) {
      return findUserById(viewer, id);
    },
    async listArchived() {
      const rows = await db
        .select({ id: users.id, name: users.name, archivedAt: users.archivedAt, archivedBy: users.archivedBy })
        .from(users)
        .where(isNotNull(users.archivedAt));
      return rows.map((row) => ({ entity: "user", label: "사람", id: row.id, name: row.name, archivedAt: row.archivedAt as Date, archivedBy: row.archivedBy }));
    },
  },
  {
    entity: "vendor",
    label: "거래처",
    async setArchived(viewer, id, value) {
      await setVendorArchived(viewer, id, value);
    },
    async findById(viewer, id) {
      return findVendorById(viewer, id);
    },
    async listArchived() {
      const rows = await db
        .select({ id: vendors.id, name: vendors.name, archivedAt: vendors.archivedAt, archivedBy: vendors.archivedBy })
        .from(vendors)
        .where(isNotNull(vendors.archivedAt));
      return rows.map((row) => ({ entity: "vendor", label: "거래처", id: row.id, name: row.name, archivedAt: row.archivedAt as Date, archivedBy: row.archivedBy }));
    },
  },
];

// 03-07: 여러 표를 한 화면에서 훑는 조회 — ARCHIVABLE_TABLES를 순회해 각
// 표의 listArchived 결과를 하나의 배열로 합친다. 정렬은 보관 시각
// 내림차순, 같으면 entity 이름 다음 식별자(id) — 결정적이라 두 번 조회해도
// 같은 순서가 나온다.
export async function listArchivedAcrossEntities(viewer: Viewer): Promise<ArchivedItem[]> {
  const lists = await Promise.all(ARCHIVABLE_TABLES.map((entry) => entry.listArchived(viewer)));
  return lists.flat().sort((a, b) => {
    const diff = b.archivedAt.getTime() - a.archivedAt.getTime();
    if (diff !== 0) return diff;
    const entityCompare = a.entity.localeCompare(b.entity);
    if (entityCompare !== 0) return entityCompare;
    return a.id.localeCompare(b.id);
  });
}
