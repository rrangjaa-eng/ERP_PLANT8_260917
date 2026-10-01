import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { createOrgUnit, createTeam } from "@/domain/org";
import { ForbiddenError, listProjectFormReferences } from "@/domain/projects/references";

// quick 261001-85g(ADMN-03) — 등록 폼 선택지(거래처 · 팀 · 사람)도 정보 노출표를 지난다.
// 공유 DB라 전체 배열 비교는 하지 않고 픽스처 id 포함 여부로 본다(빈 배열만 toEqual([])).
type Shown = Partial<Record<"vendor.value" | "team.value" | "person.value", boolean>>;

async function makeRole(shown: Shown, withProjectsView = true): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `선택지 계급-${randomUUID()}`, workScope: "company" });
  if (withProjectsView) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
  for (const [infoItem, visible] of Object.entries(shown)) {
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible });
  }
  const { userId } = await createAccount(SYSTEM_VIEWER, {
    email: `refs-${randomUUID()}@example.test`,
    name: `선택지 사람-${randomUUID()}`,
    roleId: role.id,
  });
  return { id: userId, roleId: role.id };
}

async function makeFixtures() {
  const vendorName = `거래처-${randomUUID()}`;
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: vendorName, normalizedName: vendorName });
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `팀-${randomUUID()}` });
  const personName = `사람-${randomUUID()}`;
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `refs-p-${randomUUID()}@example.test`, name: personName, roleId: "role-pm" });
  return { vendor: { id: vendor.id, name: vendorName }, team: { id: team.id, name: team.name }, person: { id: userId, name: personName } };
}

const ALL_SHOWN: Shown = { "vendor.value": true, "team.value": true, "person.value": true };

describe("프로젝트 등록 폼 선택지의 정보 노출표 투영(ADMN-03, 실제 Postgres)", () => {
  it("(v1) 세 항목이 모두 보이면 거래처 · 팀 · 사람이 id · name 두 키로 온다", async () => {
    const fx = await makeFixtures();
    const references = await listProjectFormReferences(await makeRole(ALL_SHOWN));
    expect(references.clients.find((row) => row.id === fx.vendor.id)).toEqual(fx.vendor);
    expect(references.vendors.find((row) => row.id === fx.vendor.id)).toEqual(fx.vendor);
    expect(references.teams.find((row) => row.id === fx.team.id)).toEqual(fx.team);
    expect(references.pmUsers.find((row) => row.id === fx.person.id)).toEqual(fx.person);
    expect(references.vendorShown).toBe(true);
  });

  it("(v1b) 노출 판정은 항목마다 한 번 — 투영도 같은 판정을 쓴다", async () => {
    await makeFixtures();
    const viewer = await makeRole(ALL_SHOWN);
    const calls: string[] = [];
    await listProjectFormReferences(viewer, {
      visible: (_viewer, item) => {
        calls.push(item);
        return Promise.resolve(true);
      },
    });
    expect(calls.sort()).toEqual(["person.value", "team.value", "vendor.value"]);
  });

  it("(v2) vendor.value가 꺼지면 clients · vendors가 비고 팀 · 사람은 그대로다", async () => {
    const fx = await makeFixtures();
    const references = await listProjectFormReferences(await makeRole({ ...ALL_SHOWN, "vendor.value": false }));
    expect(references.clients).toEqual([]);
    expect(references.vendors).toEqual([]);
    // 견적 표는 이 값으로 거래처 열을 그리지 않는다(사용자 결정 2026-10-01 — 가려진 정보의 열은 그리지 않는다).
    expect(references.vendorShown).toBe(false);
    expect(references.teams.map((row) => row.id)).toContain(fx.team.id);
    expect(references.pmUsers.map((row) => row.id)).toContain(fx.person.id);
  });

  it("(v3) team.value가 꺼지면 teams만 빈다", async () => {
    const fx = await makeFixtures();
    const references = await listProjectFormReferences(await makeRole({ ...ALL_SHOWN, "team.value": false }));
    expect(references.teams).toEqual([]);
    expect(references.clients.map((row) => row.id)).toContain(fx.vendor.id);
    expect(references.pmUsers.map((row) => row.id)).toContain(fx.person.id);
  });

  it("(v4) person.value가 꺼지면 pmUsers만 빈다", async () => {
    const fx = await makeFixtures();
    const references = await listProjectFormReferences(await makeRole({ ...ALL_SHOWN, "person.value": false }));
    expect(references.pmUsers).toEqual([]);
    expect(references.clients.map((row) => row.id)).toContain(fx.vendor.id);
    expect(references.teams.map((row) => row.id)).toContain(fx.team.id);
  });

  it("(v5) 노출표 행이 없는 새 계급은 거래처 · 팀 · 사람이 모두 비고 소분류는 그대로 온다", async () => {
    await makeFixtures();
    const shownAll = await listProjectFormReferences(await makeRole(ALL_SHOWN));
    const references = await listProjectFormReferences(await makeRole({}));
    expect(references.clients).toEqual([]);
    expect(references.vendors).toEqual([]);
    expect(references.teams).toEqual([]);
    expect(references.pmUsers).toEqual([]);
    expect(references.subcategories).toEqual(shownAll.subcategories);
  });

  it("(v6) projects 보기가 없으면 ForbiddenError다", async () => {
    await expect(listProjectFormReferences(await makeRole(ALL_SHOWN, false))).rejects.toBeInstanceOf(ForbiddenError);
  });
});
