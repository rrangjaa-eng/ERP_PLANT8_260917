import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { fieldDefinitions, projects, teams } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { insertVendor } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { createProject, loadProjectList } from "@/domain/projects";
import { seedCustomFieldDefinition } from "@/test/support/custom-fields";

// 07.5-04(D-7510 · D-7522 · T-07.5-04-01/03/04/05) — 프로젝트 목록 검색 · 거르개가 이 사람에게 보이는 활성 칸 집합 하나로만 돈다.
// 목록에는 추가 칸 열이 없다(사용자 결정 2026-11-14 23:43 KST — 값은 상세 정보 면) — 목록 결과에는 추가 칸 값이 실리지 않는다.
// 계급마다 임시 계급을 만든다(시드 계급에 노출 행을 만들지 않는다). 매 시험 전 표가 비워진다(setup.ts).

async function makeViewer(infoItems: string[] = ["project.value"]): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-plcf-${randomUUID()}`, name: `목록 추가 칸-${randomUUID()}`, workScope: "company", viewScope: "company" });
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `plcf-${randomUUID()}@example.test`, name: "목록 추가 칸 사람", roleId: role.id });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
  for (const infoItem of infoItems) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  return { id: userId, roleId: role.id };
}

function roleOf(viewer: Viewer): string {
  if (!viewer.roleId) throw new Error("계급 없음");
  return viewer.roleId;
}

function tag(): string {
  return randomUUID().slice(0, 8);
}

async function makeProject(name: string, customFields: Record<string, unknown> = {}): Promise<string> {
  const client = await insertVendor(SYSTEM_VIEWER, { name: `고객사-${randomUUID()}`, normalizedName: `고객사-${randomUUID()}` });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  const { userId: pmUserId } = await createAccount(SYSTEM_VIEWER, { email: `plcf-pm-${randomUUID()}@example.test`, name: "목록 PM", roleId: DEFAULT_ROLE_ID });
  const created = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: team.id, pmUserId, name });
  // 종료일이 있어 귀속 「in」 — 합계 줄 건수(totals.count)와 목록 행 수를 같은 집합으로 비교한다.
  await db.update(projects).set({ customFields, endDate: "2026-06-30" }).where(eq(projects.id, created.id));
  return created.id;
}

async function setArchived(key: string, archived: boolean): Promise<void> {
  await db
    .update(fieldDefinitions)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(fieldDefinitions.entity, "project"), eq(fieldDefinitions.key, key)));
}

async function listed(viewer: Viewer, query: Parameters<typeof loadProjectList>[1]) {
  const result = await loadProjectList(viewer, { year: "all", ...query });
  return { ids: result.rows.map((row) => row.id).sort(), total: result.total, count: result.totals.count, result };
}

describe("프로젝트 목록 검색 — 추가 칸 텍스트 값(D-7522)", () => {
  it("보이는 계급은 칸 값으로 찾고, 칸을 끈 계급 · project.value가 꺼진 계급 · 보관 칸 값으로는 행이 걸리지 않으며 목록 · 합계가 같은 집합이다", async () => {
    const a = await makeViewer();
    const b = await makeViewer();
    const c = await makeViewer();
    const place = await seedCustomFieldDefinition("project", { label: "행사 장소", type: "text" }, { visibleRoleIds: [roleOf(a), roleOf(c)] });
    const t = tag();
    const p1 = await makeProject(`이름-${tag()}`, { [place.key]: `${t}코엑스 C홀` });
    await makeProject(`이름-${tag()}`);

    const seenByA = await listed(a, { search: `${t}코엑스` });
    expect(seenByA.ids).toEqual([p1]);
    expect(seenByA.total).toBe(1);
    expect(seenByA.count).toBe(1);
    expect(seenByA.result.rows[0]).not.toHaveProperty("customFields");
    expect(JSON.stringify(seenByA.result)).not.toContain("C홀");

    const seenByB = await listed(b, { search: `${t}코엑스` });
    expect(seenByB.ids).toEqual([]);
    expect(seenByB.count).toBe(0);

    await upsertVisibility(SYSTEM_VIEWER, { roleId: roleOf(c), infoItem: "project.value", visible: false });
    expect((await listed(c, { search: `${t}코엑스` })).ids).toEqual([]);

    await setArchived(place.key, true);
    expect((await listed(a, { search: `${t}코엑스` })).ids).toEqual([]);
    await setArchived(place.key, false);
    expect((await listed(a, { search: `${t}코엑스` })).ids).toEqual([p1]);
  });

  // Opus 검토 S-1 — 보이는 텍스트 칸이 하나라도 있는 계급에서 숨은 칸 키가 검색 키 집합에 섞이지 않는다(칸별 보임 · 혼합 경우).
  it("텍스트 칸 X는 보이고 Y는 숨은 계급: Y 값으로 찾으면 0행, X 값으로 찾으면 그 행만", async () => {
    const a = await makeViewer();
    const b = await makeViewer();
    const x = await seedCustomFieldDefinition("project", { label: "행사 장소", type: "text", sortOrder: 1 }, { visibleRoleIds: [roleOf(a), roleOf(b)] });
    const y = await seedCustomFieldDefinition("project", { label: "내부 메모", type: "text", sortOrder: 2 }, { visibleRoleIds: [roleOf(a)] });
    const t = tag();
    const p1 = await makeProject(`이름-${tag()}`, { [x.key]: `${t}코엑스`, [y.key]: `${t}숨은메모` });
    await makeProject(`이름-${tag()}`);

    const hiddenSearch = await listed(b, { search: `${t}숨은메모` });
    expect(hiddenSearch.ids).toEqual([]);
    expect(hiddenSearch.total).toBe(0);
    expect(hiddenSearch.count).toBe(0);

    const visibleSearch = await listed(b, { search: `${t}코엑스` });
    expect(visibleSearch.ids).toEqual([p1]);
    expect(visibleSearch.count).toBe(1);

    expect((await listed(a, { search: `${t}숨은메모` })).ids).toEqual([p1]);
  });

  it("목록 결과 직렬화에는 추가 칸 값이 없다 — 보이는 계급도 행에 customFields가 없고, 칸을 끈 계급에는 그 칸 키도 없다", async () => {
    const a = await makeViewer();
    const b = await makeViewer();
    const place = await seedCustomFieldDefinition("project", { label: "행사 장소", type: "text" }, { visibleRoleIds: [roleOf(a)] });
    const t = tag();
    const p1 = await makeProject(`${t}-이름`, { [place.key]: `${t}코엑스` });

    const seenByA = await listed(a, { search: t });
    expect(seenByA.ids).toEqual([p1]);
    expect(seenByA.result.rows[0]).not.toHaveProperty("customFields");
    expect(seenByA.result).not.toHaveProperty("customColumns");
    expect(JSON.stringify(seenByA.result)).not.toContain(`${t}코엑스`);

    const seenByB = await listed(b, { search: t });
    expect(seenByB.ids).toEqual([p1]);
    expect(seenByB.result.rows[0]).not.toHaveProperty("customFields");
    expect(JSON.stringify(seenByB.result)).not.toContain(`${t}코엑스`);
    expect(JSON.stringify(seenByB.result)).not.toContain(place.key);
  });

  it("`%` · `_`는 글자 그대로 찾는다 — 「50%」로 찾으면 「50%할인」만, 「500」은 안 걸린다", async () => {
    const a = await makeViewer();
    const place = await seedCustomFieldDefinition("project", { label: "메모", type: "text" }, { visibleRoleIds: [roleOf(a)] });
    const t = tag();
    const pct = await makeProject(`이름-${tag()}`, { [place.key]: `${t}50%할인` });
    await makeProject(`이름-${tag()}`, { [place.key]: `${t}500` });
    const under = await makeProject(`이름-${tag()}`, { [place.key]: `${t}a_b` });
    await makeProject(`이름-${tag()}`, { [place.key]: `${t}axb` });

    expect((await listed(a, { search: `${t}50%` })).ids).toEqual([pct]);
    expect((await listed(a, { search: `${t}a_b` })).ids).toEqual([under]);
  });

  it("숫자 · 날짜 칸 값은 검색에 걸리지 않고, 추가 칸 0개 계급의 결과는 이름 · 번호 · 거래처로 찾은 결과와 같다", async () => {
    const a = await makeViewer();
    const none = await makeViewer();
    const count = await seedCustomFieldDefinition("project", { label: "인원", type: "number" }, { visibleRoleIds: [roleOf(a)] });
    const day = await seedCustomFieldDefinition("project", { label: "행사일", type: "date" }, { visibleRoleIds: [roleOf(a)] });
    const memo = await seedCustomFieldDefinition("project", { label: "메모", type: "text" }, { visibleRoleIds: [roleOf(a)] });
    const t = tag();
    const byName = await makeProject(`${t}-이름`, { [memo.key]: "다른값" });
    await makeProject(`이름-${tag()}`, { [memo.key]: `${t}-값`, [count.key]: 98765, [day.key]: "2031-04-05" });

    expect((await listed(none, { search: t })).ids).toEqual([byName]);
    expect((await listed(a, { search: "98765" })).ids).toEqual([]);
    expect((await listed(a, { search: "2031-04-05" })).ids).toEqual([]);
    const both = await listed(a, { search: t });
    expect(both.ids).toHaveLength(2);
    expect(both.count).toBe(2);
  });
});

describe("프로젝트 목록 선택 칸 거르개(D-7510 · T-07.5-04-02)", () => {
  async function selectField(roleIds: string[], sortOrder = 1, label = "지역") {
    const field = await seedCustomFieldDefinition("project", { label, type: "select", options: ["서울", "서울 강남", "부산", "대구"], sortOrder }, { visibleRoleIds: roleIds });
    // 대구는 보관 선택지 — 활성 선택지에서 빼고 보관 목록으로
    await db
      .update(fieldDefinitions)
      .set({ options: ["서울", "서울 강남", "부산"], archivedOptions: ["대구"] })
      .where(and(eq(fieldDefinitions.entity, "project"), eq(fieldDefinitions.key, field.key)));
    return field;
  }

  it("값이 정확히 같은 행만 고르고(「서울 강남」 · 「서울 」 안 걸림) 목록 · 합계가 같은 집합이며, 받아들인 값만 돌려준다", async () => {
    const a = await makeViewer();
    const field = await selectField([roleOf(a)]);
    const t = tag();
    const seoul = await makeProject(`${t}-서울`, { [field.key]: "서울" });
    await makeProject(`${t}-강남`, { [field.key]: "서울 강남" });
    await makeProject(`${t}-공백`, { [field.key]: "서울 " });

    const filtered = await listed(a, { search: t, custom: { [field.key]: "서울" } });
    expect(filtered.ids).toEqual([seoul]);
    expect(filtered.total).toBe(1);
    expect(filtered.count).toBe(1);
    expect(filtered.result.customFilterValues).toEqual({ [field.key]: "서울" });
    expect(filtered.result.customFilterDefs).toEqual([{ key: field.key, label: "지역", options: ["서울", "서울 강남", "부산"] }]);
    expect(filtered.result.hasFilter).toBe(true);
  });

  it("보관 선택지 값 · 활성 선택지 밖 값 · 빈 값 · 모르는 키 · 안 보이는 칸 · 보관 칸 파라미터는 거르개 없음(거르개 없을 때와 같은 행)이다", async () => {
    const a = await makeViewer();
    const other = await makeViewer();
    const field = await selectField([roleOf(a)]);
    const hidden = await selectField([roleOf(other)], 2, "숨은 지역");
    const t = tag();
    await makeProject(`${t}-서울`, { [field.key]: "서울", [hidden.key]: "서울" });
    const daegu = await makeProject(`${t}-대구`, { [field.key]: "대구", [hidden.key]: "부산" });
    await makeProject(`${t}-없음`);
    const all = (await listed(a, { search: t })).ids;
    expect(all).toHaveLength(3);
    expect(all).toContain(daegu);

    for (const custom of [
      { [field.key]: "대구" },
      { [field.key]: "제주" },
      { [field.key]: "" },
      { cf_nothere0: "서울" },
      { [hidden.key]: "서울" },
    ]) {
      const ignored = await listed(a, { search: t, custom });
      expect(ignored.ids, JSON.stringify(custom)).toEqual(all);
      expect(ignored.count).toBe(3);
      expect(ignored.result.customFilterValues).toEqual({});
      expect(ignored.result.hasFilter).toBe(true);
    }

    await setArchived(field.key, true);
    const archived = await listed(a, { search: t, custom: { [field.key]: "서울" } });
    expect(archived.ids).toEqual(all);
    expect(archived.result.customFilterDefs).toEqual([]);
  });

  it("기본 보기(올해)에서 맞는 행이 없는 활성 선택지 값은 0건이고 필터 중 EMPTY(filtered) · 「필터 지우기」 판정이다 — 거르개만으로 필터다", async () => {
    const a = await makeViewer();
    const field = await selectField([roleOf(a)]);
    const t = tag();
    await makeProject(`${t}-서울`, { [field.key]: "서울" });
    // 프로젝트 종료일(2026-06-30)이 들어가는 연도를 기본 보기로 — 연도 값은 필터로 세지 않는다.
    const now = () => new Date("2026-09-26T00:00:00Z");

    const none = await loadProjectList(a, { custom: { [field.key]: "부산" } }, { now });
    expect(none.rows).toEqual([]);
    expect(none.emptyKind).toBe("filtered");
    expect(none.hasFilter).toBe(true);
    const plain = await loadProjectList(a, {}, { now });
    expect(plain.hasFilter).toBe(false);
  });

  it("경계: 선택 칸 셋이면 앞 2개만 거르개(3번째는 무시) · 칸 넷이면 4번째 텍스트 칸도 검색에 걸린다", async () => {
    const a = await makeViewer();
    const first = await selectField([roleOf(a)], 1, "구분 1");
    const second = await selectField([roleOf(a)], 2, "구분 2");
    const third = await selectField([roleOf(a)], 3, "구분 3");
    const fourth = await seedCustomFieldDefinition("project", { label: "메모", type: "text", sortOrder: 4 }, { visibleRoleIds: [roleOf(a)] });
    const t = tag();
    const seoul = await makeProject(`${t}-서울`, { [first.key]: "서울", [second.key]: "서울", [third.key]: "서울", [fourth.key]: `${t}메모값` });
    await makeProject(`${t}-부산`, { [first.key]: "부산", [second.key]: "부산", [third.key]: "부산" });

    const both = await listed(a, { search: t, custom: { [first.key]: "서울", [second.key]: "서울" } });
    expect(both.ids).toEqual([seoul]);
    expect(both.result.customFilterDefs.map((def) => def.key)).toEqual([first.key, second.key]);

    const thirdOnly = await listed(a, { search: t, custom: { [third.key]: "서울" } });
    expect(thirdOnly.ids).toHaveLength(2);
    expect(thirdOnly.result.customFilterValues).toEqual({});

    expect((await listed(a, { search: `${t}메모` })).ids).toEqual([seoul]);
  });
});
