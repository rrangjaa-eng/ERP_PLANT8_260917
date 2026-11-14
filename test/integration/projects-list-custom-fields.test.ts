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

// 07.5-04(D-7508 · D-7510 · D-7522 · T-07.5-04-01/03/04/05) — 프로젝트 목록 검색 · 목록 DTO가 이 사람에게 보이는 활성 칸 집합 하나로만 돈다.
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
    expect(seenByA.result.rows[0]?.customFields).toEqual({ [place.key]: `${t}코엑스 C홀` });

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

  it("칸을 끈 계급의 목록 행 직렬화에는 그 칸 키 · 값이 없다(DTO 칸별 거름 — D-7508)", async () => {
    const a = await makeViewer();
    const b = await makeViewer();
    const place = await seedCustomFieldDefinition("project", { label: "행사 장소", type: "text" }, { visibleRoleIds: [roleOf(a)] });
    const t = tag();
    const p1 = await makeProject(`${t}-이름`, { [place.key]: `${t}코엑스` });

    const seenByB = await listed(b, { search: t });
    expect(seenByB.ids).toEqual([p1]);
    expect(seenByB.result.rows[0]?.customFields).toEqual({});
    expect(JSON.stringify(seenByB.result)).not.toContain(`${t}코엑스`);
    expect(JSON.stringify(seenByB.result)).not.toContain(place.key);
    expect(seenByB.result.customColumns).toEqual([]);
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
