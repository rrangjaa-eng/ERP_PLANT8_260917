import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { getPerson, listPeople, listPeoplePage } from "@/domain/people";
import { lockoutConfig } from "@/domain/auth/lockout";
import { recordAttempt } from "@/repositories/login-attempts";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";

// 07-17 Task 2(U1 · U2 · U6 · T-07-17-03 · T-07-17-04): 사람 목록 쪽 나눔 50 · 이름 · 이메일 검색(ILIKE 이스케이프) ·
// 잠김 거르기 · 잠긴 수(퇴직 · 보관 제외) · 열 노출은 쪽 행이 아니라 노출표 기준.

async function insertPeople(rows: { name: string; email?: string; resignationDate?: string; archived?: boolean }[]): Promise<{ id: string; email: string }[]> {
  const values = rows.map((row) => ({
    id: randomUUID(),
    name: row.name,
    email: row.email ?? `pp-${randomUUID()}@example.test`,
    resignationDate: row.resignationDate ?? null,
    archivedAt: row.archived ? new Date() : null,
  }));
  await db.insert(users).values(values);
  return values.map((value) => ({ id: value.id, email: value.email }));
}

async function lock(email: string): Promise<void> {
  const { threshold } = await lockoutConfig();
  for (let i = 0; i < threshold; i += 1) await recordAttempt(SYSTEM_VIEWER, { email, success: false, ip: null });
}

describe("listPeoplePage — 쪽 · 검색 · 잠김(실제 Postgres)", () => {
  it("120명 → 1쪽 50 · 3쪽 20 · 전체 120, 범위 밖 쪽은 마지막 쪽", async () => {
    const token = `쪽${randomUUID().slice(0, 6)}`;
    await insertPeople(Array.from({ length: 120 }, (_, i) => ({ name: `${token}-${String(i).padStart(3, "0")}` })));
    const first = await listPeoplePage(SYSTEM_VIEWER, { q: token, page: 1 });
    expect(first.total).toBe(120);
    expect(first.pageSize).toBe(50);
    expect(first.pageCount).toBe(3);
    expect(first.rows).toHaveLength(50);
    const third = await listPeoplePage(SYSTEM_VIEWER, { q: token, page: 3 });
    expect(third.rows).toHaveLength(20);
    expect(third.rows[19]?.name).toBe(`${token}-119`);
    const beyond = await listPeoplePage(SYSTEM_VIEWER, { q: token, page: 9 });
    expect(beyond.page).toBe(3);
    expect(beyond.rows.map((row) => row.id)).toEqual(third.rows.map((row) => row.id));
  });

  it("검색은 이름 또는 이메일 포함, `%` · `_`는 글자 그대로", async () => {
    const token = `검${randomUUID().slice(0, 6)}`;
    const [byName, byEmail, percent, underscore] = await insertPeople([
      { name: `${token} 김가나` },
      { name: `${token} 다라`, email: `kimmail-${token}@example.test` },
      { name: `${token} 100%달성` },
      { name: `${token} a_b` },
      { name: `${token} 기타` },
    ]);
    const kim = await listPeoplePage(SYSTEM_VIEWER, { q: "김가나" });
    expect(kim.rows.map((row) => row.id)).toEqual([byName!.id]);
    const mail = await listPeoplePage(SYSTEM_VIEWER, { q: `kimmail-${token}` });
    expect(mail.rows.map((row) => row.id)).toEqual([byEmail!.id]);
    const pct = await listPeoplePage(SYSTEM_VIEWER, { q: "%" });
    expect(pct.rows.map((row) => row.id)).toEqual([percent!.id]);
    const und = await listPeoplePage(SYSTEM_VIEWER, { q: "a_b" });
    expect(und.rows.map((row) => row.id)).toEqual([underscore!.id]);
    const under = await listPeoplePage(SYSTEM_VIEWER, { q: `${token} a_` });
    expect(under.rows.map((row) => row.id)).toEqual([underscore!.id]);
  });

  it("U2 — 잠긴 퇴직자 1 + 잠긴 재직자 2 + 잠긴 보관 1 → lockedCount 2 · locked 거르기 2행(필터와 무관한 수)", async () => {
    const token = `잠${randomUUID().slice(0, 6)}`;
    const [retiree, liveA, liveB, archived, free] = await insertPeople([
      { name: `${token}-퇴직`, resignationDate: "2020-01-01" },
      { name: `${token}-가` },
      { name: `${token}-나` },
      { name: `${token}-보관`, archived: true },
      { name: `${token}-다` },
    ]);
    for (const person of [retiree, liveA, liveB, archived]) await lock(person!.email);
    const all = await listPeoplePage(SYSTEM_VIEWER, { q: token });
    expect(all.lockedCount).toBe(2);
    expect(all.rows.find((row) => row.id === free!.id)?.locked).toBe(false);
    const locked = await listPeoplePage(SYSTEM_VIEWER, { q: token, locked: true });
    expect(locked.rows.map((row) => row.id).sort()).toEqual([liveA!.id, liveB!.id].sort());
    // 잠긴 수는 검색 · 쪽과 무관한 권한 범위 전체.
    const other = await listPeoplePage(SYSTEM_VIEWER, { q: `없는${token}` });
    expect(other.lockedCount).toBe(2);
    expect(other.rows).toHaveLength(0);
  });

  it("이메일 대소문자가 다른 실패 행도 잠김(부록 ND)", async () => {
    const [person] = await insertPeople([{ name: `대소${randomUUID().slice(0, 6)}` }]);
    await lock(person!.email.toUpperCase());
    const page = await listPeoplePage(SYSTEM_VIEWER, { locked: true });
    expect(page.rows.map((row) => row.id)).toContain(person!.id);
  });

  it("잠김은 사람 화면만 싣는다 — 상세는 withLock일 때만, listPeople · 기본 getPerson은 잠김을 묻지 않아 키가 없다", async () => {
    const [person] = await insertPeople([{ name: `잠상${randomUUID().slice(0, 6)}` }]);
    await lock(person!.email);
    const detail = await getPerson(SYSTEM_VIEWER, person!.id, { withLock: true });
    expect(detail?.person.locked).toBe(true);
    const plain = await getPerson(SYSTEM_VIEWER, person!.id);
    expect(plain && "locked" in plain.person).toBe(false);
    const listed = (await listPeople(SYSTEM_VIEWER)).find((row) => row.id === person!.id);
    expect(listed && "locked" in listed).toBe(false);
  });

  it("정렬은 지금 목록(listPeople)과 같다", async () => {
    const token = `정${randomUUID().slice(0, 6)}`;
    await insertPeople([{ name: `${token}-다` }, { name: `${token}-가` }, { name: `${token}-나` }]);
    const page = await listPeoplePage(SYSTEM_VIEWER, { q: token });
    const legacy = (await listPeople(SYSTEM_VIEWER)).filter((row) => row.name?.startsWith(token));
    expect(page.rows.map((row) => row.id)).toEqual(legacy.map((row) => row.id));
  });

  it("열 노출은 쪽 행이 아니라 노출표 기준 — 결과 0행이어도 같은 열, 가린 계급은 키 없음", async () => {
    await insertPeople([{ name: `열${randomUUID().slice(0, 6)}` }]);
    const empty = await listPeoplePage(SYSTEM_VIEWER, { q: `없음${randomUUID()}` });
    expect(empty.rows).toHaveLength(0);
    expect(empty.visibleKeys.has("name")).toBe(true);
    expect(empty.visibleKeys.has("email")).toBe(true);

    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `값 가림-${randomUUID()}` });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "admin.people", action: "view", allowed: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "person.value", visible: false });
    const viewer: Viewer = { id: `viewer-${randomUUID()}`, roleId: role.id };
    const hidden = await listPeoplePage(viewer, {});
    expect(hidden.visibleKeys.has("name")).toBe(false);
    expect(hidden.visibleKeys.has("locked")).toBe(false);
  });

  it("T-07-17-03 — 이름 · 이메일 · 잠김을 못 보는 계급에게 검색 · 잠김 거르기 · 잠긴 수가 그 값을 드러내지 않는다", async () => {
    const token = `가림${randomUUID().slice(0, 6)}`;
    const [target] = await insertPeople([{ name: `${token}-대상` }, { name: `${token}-다른` }]);
    await lock(target!.email);
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `값 가림-${randomUUID()}` });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "admin.people", action: "view", allowed: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "person.value", visible: false });
    const viewer: Viewer = { id: `viewer-${randomUUID()}`, roleId: role.id };
    const everyone = await listPeoplePage(viewer, {});
    const searched = await listPeoplePage(viewer, { q: `${token}-대상` });
    expect(searched.total).toBe(everyone.total);
    const locked = await listPeoplePage(viewer, { locked: true });
    expect(locked.total).toBe(everyone.total);
    expect(locked.lockedCount).toBe(0);
  });
});
