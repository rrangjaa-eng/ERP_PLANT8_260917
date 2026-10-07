import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { auth } from "@/lib/auth";
import { CLIENT_IP_HEADER } from "@/lib/client-ip";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { createCodeItem } from "@/domain/code-tables";
import { listCodeItems as repoListCodeItems } from "@/repositories/code-tables";
import { createVendor } from "@/domain/vendors";
import { createAccount } from "@/domain/auth/accounts";
import { archivePerson } from "@/domain/people";
import { findHolidayByDate } from "@/repositories/holidays";
import { archive, restore, listArchive, ForbiddenError, ProtectedRowError } from "@/domain/archive";
import { ARCHIVABLE_TABLES, listArchivedAcrossEntities as defaultListArchivedAcrossEntities } from "@/repositories/archive";
import { addHoliday, deleteHoliday } from "@/domain/holidays/admin";
import { queryActionLog } from "@/domain/action-log";
import { db } from "@/db/client";
import { holidays, vendors } from "@/db/schema";
import { eq } from "drizzle-orm";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";

let ipCounter = 0;
function nextTestIp(): string {
  ipCounter += 1;
  return `192.0.2.${100 + ipCounter}`;
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@example.test`;
}

describe("보관함 (ADMN-12, 실제 Postgres)", () => {
  it("여러 표의 보관 항목이 한 조회에 나오고, 두 번 조회해도 같은 순서다(결정적 정렬)", async () => {
    const tableKey = "project_status"; // quick 261002-3mx — 허용 코드표만 추가된다
    const codeItem = await createCodeItem(SYSTEM_VIEWER, { tableKey, value: "a", label: "A" });
    const { vendor } = await createVendor(SYSTEM_VIEWER, { name: `거래처-${randomUUID()}` });

    await archive(SYSTEM_VIEWER, "code_items", codeItem.id);
    await archive(SYSTEM_VIEWER, "vendor", vendor.id);

    const first = await listArchive(SYSTEM_VIEWER);
    const second = await listArchive(SYSTEM_VIEWER);

    expect(first.some((item) => item.entity === "code_items" && item.id === codeItem.id)).toBe(true);
    expect(first.some((item) => item.entity === "vendor" && item.id === vendor.id)).toBe(true);
    expect(second.map((item) => `${item.entity}:${item.id}`)).toEqual(first.map((item) => `${item.entity}:${item.id}`));
  });

  it("복원 후 원래 표의 기본 목록에 다시 나타난다", async () => {
    const tableKey = "project_status"; // quick 261002-3mx — 허용 코드표만 추가된다
    const codeItem = await createCodeItem(SYSTEM_VIEWER, { tableKey, value: "a", label: "A" });

    await archive(SYSTEM_VIEWER, "code_items", codeItem.id);
    const hiddenList = await repoListCodeItems(SYSTEM_VIEWER, { tableKey, scope: { rows: "all", includeArchived: false }, includeInactive: true });
    expect(hiddenList.some((item) => item.id === codeItem.id)).toBe(false);

    await restore(SYSTEM_VIEWER, "code_items", codeItem.id);
    const restoredList = await repoListCodeItems(SYSTEM_VIEWER, { tableKey, scope: { rows: "all", includeArchived: false }, includeInactive: true });
    expect(restoredList.some((item) => item.id === codeItem.id)).toBe(true);
  });

  it("이미 복원된 항목을 다시 복원해도 상태가 바뀌지 않는다(멱등)", async () => {
    const tableKey = "project_status"; // quick 261002-3mx — 허용 코드표만 추가된다
    const codeItem = await createCodeItem(SYSTEM_VIEWER, { tableKey, value: "a", label: "A" });
    await archive(SYSTEM_VIEWER, "code_items", codeItem.id);
    await restore(SYSTEM_VIEWER, "code_items", codeItem.id);

    // 두 번째 복원도 예외 없이 성공하고, 여전히 기본 목록에 있다.
    await restore(SYSTEM_VIEWER, "code_items", codeItem.id);
    const list = await repoListCodeItems(SYSTEM_VIEWER, { tableKey, scope: { rows: "all", includeArchived: false }, includeInactive: true });
    expect(list.some((item) => item.id === codeItem.id)).toBe(true);
  });

  it("보관과 복원이 동시에 오면 최종 상태가 둘 중 하나로 확정되고 중간 상태가 남지 않는다", async () => {
    const tableKey = "project_status"; // quick 261002-3mx — 허용 코드표만 추가된다
    const codeItem = await createCodeItem(SYSTEM_VIEWER, { tableKey, value: "a", label: "A" });

    const results = await Promise.allSettled([
      archive(SYSTEM_VIEWER, "code_items", codeItem.id),
      restore(SYSTEM_VIEWER, "code_items", codeItem.id),
    ]);
    // 조건부 UPDATE라 둘 다 성공(멱등 경로)하거나 순서에 따라 둘 다 no-op일
    // 수 있다 — 예외로 끝나지 않는 것이 계약이다.
    for (const result of results) expect(result.status).toBe("fulfilled");

    const archived = await listArchive(SYSTEM_VIEWER);
    const inList = await repoListCodeItems(SYSTEM_VIEWER, { tableKey, scope: { rows: "all", includeArchived: false }, includeInactive: true });
    const isArchived = archived.some((item) => item.entity === "code_items" && item.id === codeItem.id);
    const isVisible = inList.some((item) => item.id === codeItem.id);
    // 둘 중 정확히 하나만 참이다 — 중간(둘 다 참 또는 둘 다 거짓) 상태가 없다.
    expect(isArchived).toBe(!isVisible);
  });

  it("보관함 권한이 없는 계급의 조회가 거부된다", async () => {
    const pmViewer = { id: `pm-${randomUUID()}`, roleId: DEFAULT_ROLE_ID };
    await expect(listArchive(pmViewer)).rejects.toBeInstanceOf(ForbiddenError);
  });

  // DEF-1 — 행마다 빈 투영({})이 되어 보관함 화면이 500(new Date(undefined))이던 결함.
  it("보관함 메뉴는 있지만 보관함 정보(archive.value)가 숨김인 계급은 빈 목록을 받는다(DEF-1)", async () => {
    const { vendor } = await createVendor(SYSTEM_VIEWER, { name: `거래처-${randomUUID()}` });
    await archive(SYSTEM_VIEWER, "vendor", vendor.id);

    const roleId = `role-${randomUUID()}`;
    await insertRole(SYSTEM_VIEWER, { id: roleId, name: `계급 ${roleId.slice(5, 13)}` });
    await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "admin.archive", action: "view", allowed: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "archive.value", visible: false });
    const hiddenViewer = { id: `archive-hidden-${randomUUID()}`, roleId };

    await expect(listArchive(hiddenViewer)).resolves.toEqual([]);
  });

  // DEF-1 후속(Codex P2) — 처음 판정 뒤 조회 중에 archive.value가 꺼져도 행 투영이 빈 객체({})가 되면 안 된다.
  it("조회 중 보관함 정보(archive.value)가 꺼져도 처음 판정대로 모든 행이 채워진다(DEF-1 경쟁)", async () => {
    const { vendor } = await createVendor(SYSTEM_VIEWER, { name: `거래처-${randomUUID()}` });
    await archive(SYSTEM_VIEWER, "vendor", vendor.id);

    const roleId = `role-${randomUUID()}`;
    await insertRole(SYSTEM_VIEWER, { id: roleId, name: `계급 ${roleId.slice(5, 13)}` });
    await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "admin.archive", action: "view", allowed: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "archive.value", visible: true });
    const viewer = { id: `archive-race-${randomUUID()}`, roleId };

    const rows = await listArchive(viewer, {
      listArchivedAcrossEntities: async (v) => {
        await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "archive.value", visible: false });
        return defaultListArchivedAcrossEntities(v);
      },
    });

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => typeof row.id === "string")).toBe(true);
  });

  it("보관·복원이 각각 행동 로그에 남는다", async () => {
    const tableKey = "project_status"; // quick 261002-3mx — 허용 코드표만 추가된다
    const codeItem = await createCodeItem(SYSTEM_VIEWER, { tableKey, value: "a", label: "A" });

    await archive(SYSTEM_VIEWER, "code_items", codeItem.id);
    const archiveLogs = await queryActionLog(SYSTEM_VIEWER, { actionType: "archive" });
    expect(archiveLogs.some((log) => log.entity === "code_items" && log.entityId === codeItem.id)).toBe(true);

    await restore(SYSTEM_VIEWER, "code_items", codeItem.id);
    const restoreLogs = await queryActionLog(SYSTEM_VIEWER, { actionType: "restore" });
    expect(restoreLogs.some((log) => log.entity === "code_items" && log.entityId === codeItem.id)).toBe(true);
  });

  it("시드 계급의 보관이 거부된다(03-01의 규칙이 보관함 화면 경로에서도 성립)", async () => {
    await expect(archive(SYSTEM_VIEWER, "roles", SYSADMIN_ROLE_ID)).rejects.toThrow();
  });

  it("사람을 보관하면 세션이 0개가 되고 sign-in이 잘못된 비밀번호와 상태·본문이 깊게 같은 응답으로 거부되며, 복원 뒤에는 성공한다", async () => {
    const email = uniqueEmail("archive-person");
    const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name: "보관 테스트" });

    // 로그인해 실제 세션을 하나 만든다.
    await auth.api.signInEmail({
      body: { email, password: tempPassword },
      headers: new Headers({ [CLIENT_IP_HEADER]: nextTestIp() }),
    });

    const ctxBefore = await auth.$context;
    const sessionsBefore = await ctxBefore.internalAdapter.listSessions(userId);
    expect(sessionsBefore.length).toBeGreaterThan(0);

    await archivePerson(SYSTEM_VIEWER, userId);

    const ctxAfter = await auth.$context;
    const sessionsAfter = await ctxAfter.internalAdapter.listSessions(userId);
    expect(sessionsAfter.length).toBe(0);

    // 살아 있는 다른 계정에 잘못된 비밀번호로 로그인해 "진짜" 자격 증명
    // 오류 응답을 얻는다 — 리터럴 문구가 아니라 이 실제 응답과 깊은 비교한다.
    const liveEmail = uniqueEmail("archive-control");
    await createAccount(SYSTEM_VIEWER, { email: liveEmail, name: "대조군" });
    let controlError: { status: unknown; statusCode: unknown; body: unknown } | undefined;
    try {
      await auth.api.signInEmail({
        body: { email: liveEmail, password: "definitely-wrong-password" },
        headers: new Headers({ [CLIENT_IP_HEADER]: nextTestIp() }),
      });
    } catch (e) {
      controlError = e as { status: unknown; statusCode: unknown; body: unknown };
    }
    expect(controlError).toBeDefined();

    let archivedError: { status: unknown; statusCode: unknown; body: unknown } | undefined;
    try {
      await auth.api.signInEmail({
        body: { email, password: tempPassword },
        headers: new Headers({ [CLIENT_IP_HEADER]: nextTestIp() }),
      });
    } catch (e) {
      archivedError = e as { status: unknown; statusCode: unknown; body: unknown };
    }
    expect(archivedError).toBeDefined();

    expect(archivedError?.status).toEqual(controlError?.status);
    expect(archivedError?.statusCode).toEqual(controlError?.statusCode);
    expect(archivedError?.body).toEqual(controlError?.body);

    // 복원하면 다시 로그인된다.
    await restore(SYSTEM_VIEWER, "user", userId);
    const afterRestore = await auth.api.signInEmail({
      body: { email, password: tempPassword },
      headers: new Headers({ [CLIENT_IP_HEADER]: nextTestIp() }),
    });
    expect(afterRestore.token).toBeTruthy();
  });

  // ADMN-12(quick 261001-hfi D-01): 공휴일 삭제는 보관이고, 복원은 보관함에서도 한다.
  // 날짜는 실행일과 무관하게 내일 이후여야 하므로 먼 미래(2034 — 음력 표 범위 안)를 쓴다.
  it("공휴일: 범용 보관은 거부되고(재계산을 지나는 삭제로만), 보관함 목록에 「공휴일」 · `{날짜} {이름}`으로 나오며, 복원은 보관함 쓰기 권한을 보고 공휴일 복원에 맡긴다", async () => {
    const { userId } = await createAccount(SYSTEM_VIEWER, { email: uniqueEmail("archive-holiday"), name: "공휴일 관리자", roleId: SYSADMIN_ROLE_ID });
    const admin = { id: userId, roleId: SYSADMIN_ROLE_ID };
    const added = await addHoliday(admin, { date: "2034-06-07", kind: "election", name: "보궐선거" });

    await expect(archive(admin, "holiday", added.id)).rejects.toBeInstanceOf(ProtectedRowError);
    // /review M1 — 범용 setArchived는 재계산 · 소급 금지를 건너뛰므로 직접 불려도 던진다(행은 그대로).
    const holidayEntry = ARCHIVABLE_TABLES.find((entry) => entry.entity === "holiday");
    await expect(holidayEntry?.setArchived(admin, added.id, true)).rejects.toThrow();
    expect(await findHolidayByDate(SYSTEM_VIEWER, "2034-06-07")).toMatchObject({ id: added.id, archivedAt: null });

    await deleteHoliday(admin, added.id);
    const listed = await listArchive(admin);
    expect(listed).toContainEqual(
      expect.objectContaining({ entity: "holiday", label: "공휴일", id: added.id, name: "2034-06-07 보궐선거", archivedBy: "공휴일 관리자" }),
    );

    const pmViewer = { id: `pm-${randomUUID()}`, roleId: DEFAULT_ROLE_ID };
    await expect(restore(pmViewer, "holiday", added.id)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await findHolidayByDate(SYSTEM_VIEWER, "2034-06-07")).toBeNull();

    await restore(admin, "holiday", added.id);
    expect(await findHolidayByDate(SYSTEM_VIEWER, "2034-06-07")).toMatchObject({ id: added.id, archivedAt: null });
    const restoreLogs = await queryActionLog(SYSTEM_VIEWER, { actionType: "holiday_change" });
    expect(restoreLogs.some((log) => log.entityId === added.id && (log.detail as { op?: string }).op === "restore")).toBe(true);
    expect((await listArchive(admin)).some((item) => item.entity === "holiday" && item.id === added.id)).toBe(false);
  });
  // 독립 검토 지적(#138) — 복원할 수 없는 공휴일 행은 「복원」을 내놓지 않는다(§7 할 수 없는 선택지는 숨김).
  // 지난 날짜(소급 금지)와 공휴일 쓰기 권한이 없는 보관함 쓰기 권한자가 그 경우다.
  it("공휴일: 지난 날짜 행과 공휴일 쓰기 권한이 없는 사람에게는 restorable이 거짓이고, 그 사람의 복원은 거부된다", async () => {
    const { userId } = await createAccount(SYSTEM_VIEWER, { email: uniqueEmail("archive-holiday-restorable"), name: "공휴일 관리자", roleId: SYSADMIN_ROLE_ID });
    const admin = { id: userId, roleId: SYSADMIN_ROLE_ID };
    const future = await addHoliday(admin, { date: "2034-07-07", kind: "election", name: "복원 판정 선거" });
    await deleteHoliday(admin, future.id);
    const [past] = await db
      .insert(holidays)
      .values({ date: "2001-07-07", kind: "temporary", name: "지난 보관", archivedAt: new Date(), archivedBy: null })
      .returning({ id: holidays.id });

    const listed = await listArchive(admin);
    expect(listed.find((item) => item.id === future.id)).toMatchObject({ restorable: true });
    expect(listed.find((item) => item.id === past?.id)).toMatchObject({ restorable: false });
    // 오늘 경계는 KST 날짜로 — 그 날짜 00:00 KST부터는 「오늘」이라 복원 불가(restoreHoliday의 `<= today`와 같다).
    const atKstMidnight = await listArchive(admin, { now: new Date("2034-07-06T15:00:00Z") });
    expect(atKstMidnight.find((item) => item.id === future.id)).toMatchObject({ restorable: false });
    const justBefore = await listArchive(admin, { now: new Date("2034-07-06T14:59:59Z") });
    expect(justBefore.find((item) => item.id === future.id)).toMatchObject({ restorable: true });

    const roleId = `role-${randomUUID()}`;
    await insertRole(SYSTEM_VIEWER, { id: roleId, name: `계급 ${roleId.slice(5, 13)}` });
    for (const action of ["view", "write"] as const) await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "admin.archive", action, allowed: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "archive.value", visible: true });
    const archiveOnly = { id: `archive-only-${randomUUID()}`, roleId };

    expect((await listArchive(archiveOnly)).find((item) => item.id === future.id)).toMatchObject({ restorable: false });
    await expect(restore(archiveOnly, "holiday", future.id)).rejects.toThrow("공휴일 복원 권한 없음");
    expect(await findHolidayByDate(SYSTEM_VIEWER, "2034-07-07")).toBeNull();
  });

  it("거래처 복원 — 같은 숫자 사업자번호의 살아 있는 거래처가 있으면 복원 불가 문구로 막고 보관 그대로다", async () => {
    const base = String(Math.floor(100_000_000 + Math.random() * 900_000_000));
    const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
    const sum = weights.reduce((acc, weight, i) => acc + Number(base[i]) * weight, 0) + Math.floor((Number(base[8]) * 5) / 10);
    const digits = base + String((10 - (sum % 10)) % 10);
    const no = `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
    const { vendor: a } = await createVendor(SYSTEM_VIEWER, { name: `거래처-${randomUUID()}`, businessNo: no });
    await archive(SYSTEM_VIEWER, "vendor", a.id);
    // 색인 전(PR A)에는 같은 번호의 살아 있는 행을 선검사 없이 직접 넣는다.
    const takerName = `거래처-${randomUUID()}`;
    const [taker] = await db.insert(vendors).values({ name: takerName, normalizedName: takerName, businessNo: no.replaceAll("-", "") }).returning();
    await expect(restore(SYSTEM_VIEWER, "vendor", a.id)).rejects.toThrow(`같은 사업자번호 거래처 있음 · ${takerName} · 복원 불가`);
    const [row] = await db.select().from(vendors).where(eq(vendors.id, a.id));
    expect(row?.archivedAt).not.toBeNull();
    await db.delete(vendors).where(eq(vendors.id, taker?.id ?? ""));
  });

  // quick 261002-4jn(회고 #3) — 낡은 화면 · 동시 복원의 뒤 사람은 성공이 아니라 「이미 복원됨」을 받는다.
  it("이미 활성인 항목의 복원은 { restored: false }이고 복원 로그를 남기지 않는다", async () => {
    const { vendor } = await createVendor(SYSTEM_VIEWER, { name: `거래처-${randomUUID()}` });
    await archive(SYSTEM_VIEWER, "vendor", vendor.id);

    expect(await restore(SYSTEM_VIEWER, "vendor", vendor.id)).toEqual({ restored: true });
    expect(await restore(SYSTEM_VIEWER, "vendor", vendor.id)).toEqual({ restored: false });
    const logs = await queryActionLog(SYSTEM_VIEWER, { actionType: "restore" });
    expect(logs.filter((log) => log.entity === "vendor" && log.entityId === vendor.id)).toHaveLength(1);
  });

  // PR #149 리뷰 — 범용 경로는 조건부 갱신이 실제로 바꾼 행이 있는지로 「복원됨」과 로그를 정한다.
  it("범용 setArchived는 실제로 바꾼 행이 있을 때만 참을 돌려준다", async () => {
    const { vendor } = await createVendor(SYSTEM_VIEWER, { name: `거래처-${randomUUID()}` });
    const entry = ARCHIVABLE_TABLES.find((item) => item.entity === "vendor");
    if (!entry) throw new Error("vendor 항목 없음");

    expect(await entry.setArchived(SYSTEM_VIEWER, vendor.id, true)).toBe(true);
    expect(await entry.setArchived(SYSTEM_VIEWER, vendor.id, true)).toBe(false);
    expect(await entry.setArchived(SYSTEM_VIEWER, vendor.id, false)).toBe(true);
    expect(await entry.setArchived(SYSTEM_VIEWER, vendor.id, false)).toBe(false);
  });

  it("읽을 땐 보관이었지만 갱신 직전 다른 요청이 복원했으면 { restored: false }이고 로그가 없다", async () => {
    // 동시 복원의 뒤 요청 — findById는 보관 행을 보지만 조건부 갱신은 바꿀 행이 없다.
    const raceEntry = {
      entity: `race-${randomUUID()}`,
      label: "경합",
      setArchived: () => Promise.resolve(false),
      findById: (_viewer: unknown, id: string) => Promise.resolve({ id, archivedAt: new Date() }),
      listArchived: () => Promise.resolve([]),
    };
    ARCHIVABLE_TABLES.push(raceEntry);
    try {
      const logged: unknown[] = [];
      const result = await restore(SYSTEM_VIEWER, raceEntry.entity, randomUUID(), { recordAction: (_viewer, input) => { logged.push(input); return Promise.resolve(); } });
      expect(result).toEqual({ restored: false });
      expect(logged).toHaveLength(0);
    } finally {
      ARCHIVABLE_TABLES.splice(ARCHIVABLE_TABLES.indexOf(raceEntry), 1);
    }
  });

  it("공휴일: 두 번째 복원은 { restored: false }, 동시 복원은 정확히 하나만 참", async () => {
    const { userId } = await createAccount(SYSTEM_VIEWER, { email: uniqueEmail("archive-holiday-twice"), name: "공휴일 관리자", roleId: SYSADMIN_ROLE_ID });
    const admin = { id: userId, roleId: SYSADMIN_ROLE_ID };
    const sequential = await addHoliday(admin, { date: "2034-08-08", kind: "election", name: "두 번 복원 선거" });
    await deleteHoliday(admin, sequential.id);
    expect(await restore(admin, "holiday", sequential.id)).toEqual({ restored: true });
    expect(await restore(admin, "holiday", sequential.id)).toEqual({ restored: false });
    const logs = await queryActionLog(SYSTEM_VIEWER, { actionType: "holiday_change" });
    expect(logs.filter((log) => log.entityId === sequential.id && (log.detail as { op?: string }).op === "restore")).toHaveLength(1);

    const concurrent = await addHoliday(admin, { date: "2034-08-09", kind: "election", name: "동시 복원 선거" });
    await deleteHoliday(admin, concurrent.id);
    const results = await Promise.all([restore(admin, "holiday", concurrent.id), restore(admin, "holiday", concurrent.id)]);
    expect(results.filter((result) => result.restored)).toHaveLength(1);
  });

  // /review(#149) 적대 검토 — 도메인 복원기가 있는 항목은 활성 행이라도 그 복원기의 권한 · 형식 판정을 먼저 지난다.
  it("도메인 복원기 항목: 권한 없는 사람은 활성 행에도 거부되고, 형식이 틀린 id는 사용자 오류로 끝난다", async () => {
    const { userId } = await createAccount(SYSTEM_VIEWER, { email: uniqueEmail("archive-holiday-active"), name: "공휴일 관리자", roleId: SYSADMIN_ROLE_ID });
    const admin = { id: userId, roleId: SYSADMIN_ROLE_ID };
    const active = await addHoliday(admin, { date: "2034-08-14", kind: "election", name: "활성 선거" });

    const roleId = `role-${randomUUID()}`;
    await insertRole(SYSTEM_VIEWER, { id: roleId, name: `계급 ${roleId.slice(5, 13)}` });
    for (const action of ["view", "write"] as const) await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "admin.archive", action, allowed: true });
    const archiveOnly = { id: `archive-only-${randomUUID()}`, roleId };

    await expect(restore(archiveOnly, "holiday", active.id)).rejects.toThrow("공휴일 복원 권한 없음");
    await expect(restore(SYSTEM_VIEWER, "reserve_entry", "not-a-uuid")).rejects.toBeInstanceOf(UserFacingError);
  });

  // quick 261002-4jn(회고 #4) — 그 날짜에 다른 공휴일(대체일 제외)이 있으면 복원은 거부되므로 「복원」을 내놓지 않는다.
  it("공휴일: 같은 날짜에 활성 공휴일이 있으면 restorable이 거짓이고, 대체일만 있으면 참", async () => {
    const { userId } = await createAccount(SYSTEM_VIEWER, { email: uniqueEmail("archive-holiday-taken"), name: "공휴일 관리자", roleId: SYSADMIN_ROLE_ID });
    const admin = { id: userId, roleId: SYSADMIN_ROLE_ID };
    const taken = await addHoliday(admin, { date: "2034-08-10", kind: "election", name: "보관된 선거" });
    await deleteHoliday(admin, taken.id);
    await addHoliday(admin, { date: "2034-08-10", kind: "election", name: "새 선거" });
    const bySubstitute = await addHoliday(admin, { date: "2034-08-11", kind: "election", name: "대체일 날 선거" });
    await deleteHoliday(admin, bySubstitute.id);
    await db.insert(holidays).values({ date: "2034-08-11", kind: "substitute", name: "대체공휴일", originYear: 2034 });

    const listed = await listArchive(admin);
    expect(listed.find((item) => item.id === taken.id)).toMatchObject({ restorable: false });
    expect(listed.find((item) => item.id === bySubstitute.id)).toMatchObject({ restorable: true });
    await expect(restore(admin, "holiday", taken.id)).rejects.toThrow("이미 공휴일");
  });
});
