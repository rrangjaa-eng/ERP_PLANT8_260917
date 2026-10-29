import { and, eq, exists, gte, ilike, inArray, isNull, isNotNull, ne, or, sql, type SQL } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { permissionMatrix, users } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import type { Scope } from "@/domain/permissions/scope-for";

export type UserRow = InferSelectModel<typeof users>;

export async function findUserByEmail(viewer: Viewer, email: string): Promise<UserRow | null> {
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return row ?? null;
}

export async function findUserById(viewer: Viewer, id: string, tx: DbOrTx = db): Promise<UserRow | null> {
  const [row] = await tx.select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}

// 07.1-07(D-7122) · PR #303 검토 P2-3: 증빙 범위 판정에 드는 사람의 본부 칸 하나만 읽는다 — 판정마다 암호화 계좌가 든 사람 행 전체를 싣지 않는다.
export async function findUserDivision(viewer: Viewer, id: string): Promise<{ divisionId: string | null } | null> {
  void viewer;
  const [row] = await db.select({ divisionId: users.divisionId }).from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}

// 05 /review A7 — 여러 사람 이름(id → 이름)을 한 쿼리로.
export async function findUserNamesByIds(viewer: Viewer, ids: string[]): Promise<Map<string, string>> {
  void viewer;
  if (ids.length === 0) return new Map();
  const rows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids));
  return new Map(rows.map((row) => [row.id, row.name]));
}

export async function setPasswordTemporary(viewer: Viewer, userId: string, value: boolean): Promise<void> {
  await db.update(users).set({ passwordIsTemporary: value }).where(eq(users.id, userId));
}

// D8-07: 첫 로그인 시각은 한 번만 쓴다 — 이미 값이 있으면 조건부 UPDATE가 아무것도 바꾸지 않는다.
export async function setFirstLoginAtIfUnset(viewer: Viewer, userId: string, at: Date): Promise<void> {
  await db
    .update(users)
    .set({ firstLoginAt: at })
    .where(and(eq(users.id, userId), isNull(users.firstLoginAt)));
}

// Phase 3(03-05): Phase 1이 남긴 자리표시를 실제 행 필터로 채운다. scope.rows가
// "none"이면 쿼리를 생략한다(보기 권한이 없는 viewer). includeArchived는
// scopeFor(viewer, "user")의 보관함 보기 권한 판정 결과를 그대로 받는다 — 이
// 함수 자체는 권한을 다시 확인하지 않는다(리포지토리는 서술자를 where절로
// 번역만 한다).
export async function listUsers(
  viewer: Viewer,
  opts: { scope: Scope; includeArchived: boolean },
): Promise<UserRow[]> {
  if (opts.scope.rows === "none") return [];
  return db
    .select()
    .from(users)
    .where(opts.includeArchived ? undefined : isNull(users.archivedAt))
    .orderBy(users.name);
}

// 07-21(R10 · R17): 「활성 사람」 조각 하나 — 보관 안 됨 ∧ 퇴직일 없음 또는 asOf 이후(07-15 countActiveMembersOfRole과 같은 조건).
// 계급 · 팀 · 본부 소속 수(화면 숫자 · 보관 거부)와 사람 목록 필터가 같은 조각을 쓴다.
export function activeUserCondition(viewer: Viewer, asOf: string): SQL {
  void viewer;
  return and(isNull(users.archivedAt), or(isNull(users.resignationDate), gte(users.resignationDate, asOf))) as SQL;
}

// 07-17 SC-11 · T-07-17-04: 검색어의 ILIKE 와일드카드(`%` · `_`)와 이스케이프 글자(`\`)는 글자 그대로 — 값은 바인딩 매개변수다.
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

// 07-17 SC-11(U1 · U6): 사람 목록 한 쪽 — listUsers와 같은 행 필터 · 정렬(이름, 같으면 id로 쪽 경계 고정)에 이름 · 이메일 검색과
// id 집합(잠김 거르기) 조건을 더한다. 범위 밖 쪽 번호는 마지막 쪽으로 맞춘다. 검색은 호출자가 보이는 칸만 켠다(T-07-17-03).
export async function listUsersPage(
  viewer: Viewer,
  opts: {
    scope: Scope;
    includeArchived: boolean;
    search: { q: string; name: boolean; email: boolean } | null;
    ids: readonly string[] | null;
    /** 07-21: 소속 필터 — 그날 활성 사람만(activeUserCondition) · 계급이면 그 계급. 팀 · 본부 소속은 호출자가 ids로 넘긴다. */
    member?: { asOf: string; roleId: string | null } | null;
    page: number;
    pageSize: number;
  },
): Promise<{ rows: UserRow[]; total: number; page: number }> {
  void viewer;
  if (opts.scope.rows === "none" || (opts.ids !== null && opts.ids.length === 0)) return { rows: [], total: 0, page: 1 };
  const conditions: SQL[] = [];
  if (!opts.includeArchived) conditions.push(isNull(users.archivedAt));
  if (opts.search && (opts.search.name || opts.search.email)) {
    const pattern = `%${escapeLike(opts.search.q)}%`;
    const match = or(
      opts.search.name ? ilike(users.name, pattern) : undefined,
      opts.search.email ? ilike(users.email, pattern) : undefined,
    );
    if (match) conditions.push(match);
  }
  if (opts.ids !== null) conditions.push(inArray(users.id, [...opts.ids]));
  if (opts.member) {
    conditions.push(activeUserCondition(viewer, opts.member.asOf));
    if (opts.member.roleId !== null) conditions.push(eq(users.roleId, opts.member.roleId));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [counted] = await db.select({ count: sql<number>`count(*)::int` }).from(users).where(where);
  const total = counted?.count ?? 0;
  const page = Math.min(Math.max(1, Math.trunc(opts.page)), Math.max(1, Math.ceil(total / opts.pageSize)));
  const rows = await db
    .select()
    .from(users)
    .where(where)
    .orderBy(users.name, users.id)
    .limit(opts.pageSize)
    .offset((page - 1) * opts.pageSize);
  return { rows, total, page };
}

// 07-17 SC-11: 잠긴 이메일(소문자) 묶음의 사람 — 잠긴 수 · 잠김 거르기가 퇴직 · 보관을 빼려고 읽는다(부록 ND 대소문자 무시).
export async function findUsersByLowerEmails(viewer: Viewer, emails: readonly string[]): Promise<UserRow[]> {
  void viewer;
  if (emails.length === 0) return [];
  return db.select().from(users).where(inArray(sql`lower(${users.email})`, [...emails]));
}

export async function updateUserRole(viewer: Viewer, userId: string, roleId: string, tx: DbOrTx = db): Promise<void> {
  await tx.update(users).set({ roleId, updatedAt: new Date() }).where(eq(users.id, userId));
}

// 07.1-14(D-7127): 팀 없는 사람의 본부 칸 — 판정(팀 없음 · 보관 아님)은 도메인이 잠금 뒤 tx로 한다.
export async function updateUserDivision(viewer: Viewer, userId: string, divisionId: string | null, tx: DbOrTx = db): Promise<void> {
  await tx.update(users).set({ divisionId, updatedAt: new Date() }).where(eq(users.id, userId));
}

// 보관·복원 둘 다 조건부 UPDATE로 멱등·경합 안전을 확보한다(repositories/roles.ts와 같은 패턴).
export async function setUserArchived(viewer: Viewer, userId: string, value: boolean, tx: DbOrTx = db): Promise<boolean> {
  // 조건부 갱신이 실제로 바꾼 행이 있으면 참 — 범용 복원이 「이미 복원됨」 · 로그를 이 결과로 정한다(PR #149).
  const rows = value
    ? await tx
        .update(users)
        .set({ archivedAt: new Date(), archivedBy: viewer.id })
        .where(and(eq(users.id, userId), isNull(users.archivedAt)))
        .returning({ id: users.id })
    : await tx
        .update(users)
        .set({ archivedAt: null, archivedBy: null })
        .where(and(eq(users.id, userId), isNotNull(users.archivedAt)))
        .returning({ id: users.id });
  return rows.length > 0;
}

// 04.1-03(D-96 · D-97): 입사일·퇴직일 갱신. 판정(권한 · 형식 · 역전)은 domain/people이
// 하고, 동시 수정으로 역전되면 users CHECK(23514)가 막는다(호출자가 판별).
export async function updateUserHireDate(viewer: Viewer, userId: string, hireDate: string | null, tx: DbOrTx = db): Promise<void> {
  void viewer;
  await tx.update(users).set({ hireDate, updatedAt: new Date() }).where(eq(users.id, userId));
}

export async function updateUserResignationDate(
  viewer: Viewer,
  userId: string,
  resignationDate: string | null,
  tx: DbOrTx = db,
): Promise<void> {
  void viewer;
  await tx.update(users).set({ resignationDate, updatedAt: new Date() }).where(eq(users.id, userId));
}

// F24: 퇴직자 쓰기 잠금 재조회 — 쓰기 tx 안에서 사람 행을 FOR SHARE로 잡아 tx 끝까지 퇴직일이 바뀌지 않게 한다.
export async function findUserResignationForShare(
  viewer: Viewer,
  userId: string,
  tx: DbOrTx,
): Promise<{ resignationDate: string | null } | null> {
  void viewer;
  const [row] = await tx
    .select({ resignationDate: users.resignationDate })
    .from(users)
    .where(eq(users.id, userId))
    .for("share");
  return row ?? null;
}

// 06.4(D-6403 · O2): 재직 관리자 = 보관 안 됨 ∧ 퇴직일 안 지남 ∧ `admin.permissions` 쓰기 계급. 계급 보관(roles.archived_at)은
// `can()`이 보지 않으므로 여기서도 보지 않는다.
export async function countActiveAdmins(
  viewer: Viewer,
  opts: { asOf: string; excludeUserId?: string; excludeRoleId?: string; onlyUserId?: string; unscheduledOnly?: boolean },
  tx: DbOrTx = db,
): Promise<number> {
  void viewer;
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(
      and(
        isNull(users.archivedAt),
        // 06.4 D-6412(K-B3, 기본값(사용자 미확인)): 퇴직 예정 관리자는 남은 쪽에 세지 않는다 — 두 번 저장으로 예정 0명이 되는
        // 길(Codex B3)을 닫는다. 260907도 `left_date is null`만 셌다(`O: server/src/people.ts:735-737`).
        opts.unscheduledOnly
          ? isNull(users.resignationDate)
          : or(isNull(users.resignationDate), gte(users.resignationDate, opts.asOf)),
        exists(
          tx
            .select({ one: permissionMatrix.roleId })
            .from(permissionMatrix)
            .where(
              and(
                eq(permissionMatrix.roleId, users.roleId),
                eq(permissionMatrix.menu, "admin.permissions"),
                eq(permissionMatrix.action, "write"),
                eq(permissionMatrix.allowed, true),
              ),
            ),
        ),
        opts.excludeUserId === undefined ? undefined : ne(users.id, opts.excludeUserId),
        opts.excludeRoleId === undefined ? undefined : ne(users.roleId, opts.excludeRoleId),
        opts.onlyUserId === undefined ? undefined : eq(users.id, opts.onlyUserId),
      ),
    );
  return row?.n ?? 0;
}

// 06.5-04(D-6505): 직원 지급 계좌 — 판정(두 권한 게이트 · 예금주 필요 · 암호화)은 domain/people/account가 한다.
// 행 전체가 아니라 계좌 칸만 읽는다.
export type UserPayoutAccountRow = {
  accountBank: string | null;
  accountHolder: string | null;
  accountNumberEncrypted: string | null;
  accountNumberLast4: string | null;
};

export async function findUserPayoutAccount(viewer: Viewer, userId: string, tx: DbOrTx = db): Promise<UserPayoutAccountRow | null> {
  void viewer;
  const [row] = await tx
    .select({
      accountBank: users.accountBank,
      accountHolder: users.accountHolder,
      accountNumberEncrypted: users.accountNumberEncrypted,
      accountNumberLast4: users.accountNumberLast4,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

// 06.5 D-6517: 지급 대상 · 지급 보기의 직원 지급처 계좌 칸 — id 묶음 한 번. 평문(암호문)은 읽지 않는다(해제는 revealPersonAccountNumber 하나).
export type UserPayoutAccountByIdRow = { userId: string; bank: string | null; holder: string | null; last4: string | null };

export async function findUserPayoutAccountsByIds(viewer: Viewer, userIds: readonly string[]): Promise<UserPayoutAccountByIdRow[]> {
  void viewer;
  if (userIds.length === 0) return [];
  return db
    .select({ userId: users.id, bank: users.accountBank, holder: users.accountHolder, last4: users.accountNumberLast4 })
    .from(users)
    .where(inArray(users.id, [...userIds]));
}

// 암호문 키가 values에 없으면(keep) 두 번호 칸을 set에 넣지 않는다. 동시 저장으로 예금주 없는 계좌가 되면
// users_account_holder_required_check(23514)가 막는다(호출자가 판별).
export async function updateUserPayoutAccount(
  viewer: Viewer,
  userId: string,
  values: {
    accountBank: string | null;
    accountHolder: string | null;
    accountNumberEncrypted?: string | null;
    accountNumberLast4?: string | null;
  },
  tx: DbOrTx = db,
): Promise<void> {
  void viewer;
  await tx
    .update(users)
    .set({
      accountBank: values.accountBank,
      accountHolder: values.accountHolder,
      ...("accountNumberEncrypted" in values
        ? { accountNumberEncrypted: values.accountNumberEncrypted, accountNumberLast4: values.accountNumberLast4 ?? null }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}
