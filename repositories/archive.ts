import { and, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { alias, type AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { roles, codeItems, orgUnits, teams, corpCards, users, vendors, quoteLines } from "@/db/schema";
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
import { findQuoteLineById, setQuoteLineArchived } from "@/repositories/quote-lines";
import { findHolidayById, listArchivedHolidays } from "@/repositories/holidays";
import { findFieldDefinitionById, listArchivedFieldDefinitions, setFieldDefinitionArchived } from "@/repositories/field-definitions";
import { FIELD_DEFINITION_TARGETS } from "@/domain/custom-fields/targets";
import { findEntriesByIds as findReserveEntriesByIds, setEntryArchived as setReserveEntryArchived, listArchivedEntryNames as listArchivedReserveEntryNames } from "@/repositories/reserve-entries";

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
  // 공휴일만 — 복원 가능 판정(소급 금지)에 쓰는 날짜. 화면 DTO에는 싣지 않는다.
  date?: string;
  // 공휴일만 — 그 날짜에 활성 공휴일(대체일 제외)이 있으면 참(복원 불가). 화면 DTO에는 싣지 않는다.
  dateTaken?: boolean;
  // 거래처만 — 같은 숫자 사업자번호의 살아 있는 거래처가 있으면 참(복원 불가). 화면 DTO에는 싣지 않는다.
  businessNoTaken?: boolean;
};

export type ArchivableEntry = {
  entity: string;
  label: string;
  setArchived(viewer: Viewer, id: string, value: boolean): Promise<boolean>;
  findById(viewer: Viewer, id: string): Promise<ArchivableRow | null>;
  isProtected?(row: ArchivableRow): boolean;
  // 03-07: 이 표의 보관된 행 전부. listArchivedAcrossEntities가 이 클로저를
  // 순회해 합친다 — 새 표 목록을 별도로 만들지 않는다.
  listArchived(viewer: Viewer): Promise<ArchivedItem[]>;
  // 04.5-04(UI-SPEC O21): 보관함 권한에 더해 요구하는 메뉴 — 보관 · 복원은 이 메뉴의 write, 보관함 목록은 view.
  requiredMenu?: string;
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
      return setRoleArchived(viewer, id, value);
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
      return setCodeItemArchived(viewer, id, value);
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
      return setOrgUnitArchived(viewer, id, value);
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
      return setTeamArchived(viewer, id, value);
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
      return setCorpCardArchived(viewer, id, value);
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
      return setUserArchived(viewer, id, value);
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
      return setVendorArchived(viewer, id, value);
    },
    async findById(viewer, id) {
      return findVendorById(viewer, id);
    },
    async listArchived() {
      const live = alias(vendors, "live_vendors");
      const digits = (column: AnyPgColumn) => sql`regexp_replace(${column}, '[^0-9]', '', 'g')`;
      const rows = await db
        .select({
          id: vendors.id,
          name: vendors.name,
          archivedAt: vendors.archivedAt,
          archivedBy: vendors.archivedBy,
          businessNoTaken: sql<boolean>`${digits(vendors.businessNo)} <> '' and exists (${db
            .select({ one: sql`1` })
            .from(live)
            .where(and(isNull(live.archivedAt), ne(live.id, vendors.id), sql`${digits(live.businessNo)} = ${digits(vendors.businessNo)}`))})`,
        })
        .from(vendors)
        .where(isNotNull(vendors.archivedAt));
      return rows.map((row) => ({ entity: "vendor", label: "거래처", id: row.id, name: row.name, archivedAt: row.archivedAt as Date, archivedBy: row.archivedBy, businessNoTaken: row.businessNoTaken }));
    },
  },
  // 04-12(D-56 · A-04) — 견적 줄 삭제는 보관이다(저장 트랜잭션 안에서 domain/quotes/lines가 보관한다).
  // 복원은 이 항목의 setArchived를 타지 않는다 — domain/archive의 DOMAIN_RESTORERS가 restoreQuoteLine에 맡긴다.
  {
    entity: "quote_line",
    label: "견적 줄",
    async setArchived(viewer, id, value) {
      return setQuoteLineArchived(viewer, id, value);
    },
    async findById(viewer, id) {
      return findQuoteLineById(viewer, id);
    },
    async listArchived() {
      const rows = await db
        .select({ id: quoteLines.id, name: quoteLines.itemName, archivedAt: quoteLines.archivedAt, archivedBy: quoteLines.archivedBy })
        .from(quoteLines)
        .where(isNotNull(quoteLines.archivedAt));
      return rows.map((row) => ({ entity: "quote_line", label: "견적 줄", id: row.id, name: row.name, archivedAt: row.archivedAt as Date, archivedBy: row.archivedBy }));
    },
  },
  // 04-07(B-04 · OV-2) — 리저브 줄. 보관은 잔액 판정을 지나는 domain/reserves의 saveReserves(archived)로만 한다 —
  // 범용 archive()는 잔액을 보지 않으므로 늘 보호 행이다. 복원은 DOMAIN_RESTORERS가 restoreReserve에 맡긴다.
  {
    entity: "reserve_entry",
    label: "리저브",
    async setArchived(viewer, id, value) {
      // 보호 행이라 범용 경로가 부르지 않는다. 리저브 setter는 무조건 갱신이라 바뀐 것으로 본다.
      await setReserveEntryArchived(viewer, id, value);
      return true;
    },
    async findById(viewer, id) {
      const [row] = await findReserveEntriesByIds(viewer, [id]);
      return row ?? null;
    },
    isProtected() {
      return true;
    },
    async listArchived(viewer) {
      const rows = await listArchivedReserveEntryNames(viewer);
      return rows.map((row) => ({ entity: "reserve_entry", label: "리저브", ...row }));
    },
  },
  // quick 261001-hfi(ADMN-12 · D-01) — 공휴일. 보관은 대체일 재계산을 지나는 domain/holidays의 deleteHoliday로만 한다 —
  // 범용 archive()는 재계산을 하지 않으므로 늘 보호 행이다. 복원은 DOMAIN_RESTORERS가 restoreHoliday에 맡긴다.
  {
    entity: "holiday",
    label: "공휴일",
    // 보관 · 복원 모두 재계산 · 소급 금지를 지나는 domain/holidays로만 — 범용 경로가 잘못 불리면 바로 던진다.
    setArchived() {
      return Promise.reject(new Error("공휴일 보관 · 복원은 domain/holidays로만"));
    },
    async findById(viewer, id) {
      return findHolidayById(viewer, id);
    },
    isProtected() {
      return true;
    },
    async listArchived(viewer) {
      const rows = await listArchivedHolidays(viewer);
      return rows.map((row) => ({ entity: "holiday", label: "공휴일", ...row }));
    },
  },
  // 04.5-04(D10-12 · O21) — 화면 항목(칸 정의). 대상 상수 밖(프로젝트 · 견적 줄) 정의는 「없음」으로 본다(O13).
  {
    entity: "field_definitions",
    label: "화면 항목",
    requiredMenu: "admin.field-definitions",
    async setArchived(viewer, id, value) {
      return setFieldDefinitionArchived(viewer, id, value);
    },
    async findById(viewer, id) {
      const row = await findFieldDefinitionById(viewer, id);
      if (!row || !FIELD_DEFINITION_TARGETS.some((target) => target === row.entity)) return null;
      return row;
    },
    async listArchived(viewer) {
      const rows = await listArchivedFieldDefinitions(viewer, FIELD_DEFINITION_TARGETS);
      return rows.map((row) => ({ entity: "field_definitions", label: "화면 항목", id: row.id, name: row.label, archivedAt: row.archivedAt, archivedBy: row.archivedBy }));
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
