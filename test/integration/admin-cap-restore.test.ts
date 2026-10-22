import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { recordAction } from "@/domain/action-log/record";
import { registerPerson } from "@/domain/people";
import { createCodeItem } from "@/domain/code-tables";
import { queryActionLog } from "@/repositories/action-log";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID, DIVISION_HEAD_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { RoleGrantForbiddenError } from "@/domain/permissions/grant-ceiling";
import { archive, ForbiddenError as ArchiveForbiddenError, listArchive, restore } from "@/domain/archive";
import { PersonNotRestorableError, PersonRestoreForbiddenError } from "@/domain/people/restore";
import { SeatTakenError } from "@/domain/people/seat-rules";
import { findUserByEmail, findUserById, updateUserResignationDate } from "@/repositories/users";
import { ARCHIVABLE_TABLES } from "@/repositories/archive";
import { findTeamById } from "@/repositories/teams";
import { findOrgUnitById } from "@/repositories/org-units";
import { insertFieldDefinition } from "@/repositories/field-definitions";
import { findCodeItemById } from "@/repositories/code-tables";
import { makePerson, NOW_2026 } from "./approvals-fixtures";
import { addTeam, countLogs, makeAdmin, makeDelegatedRole, makeOrgTeam, makeSeated, uniqueName } from "./admin-cap-fixtures";

// 06.4-03: 보관함 「복원」으로 사람을 되살릴 때 사람 쓰기 · 권한 상한 · 자리를 다시 본다(D-6406 · G36).
// 거부 문구는 06.4-02 「문구 표(D3)」 복원 열 — 끝이 ` · 복원 불가`라 보관함 토스트가 이름을 자르지 않는다(N1).

const deps = { now: () => NOW_2026 };
const TAIL = " · 복원 불가";

async function refusal<E extends Error>(promise: Promise<unknown>, type: new (...args: never[]) => E): Promise<E> {
  const error = await promise.then(
    () => new Error("거부되어야 하는데 성공함"),
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(type);
  return error as E;
}

async function nameOf(userId: string): Promise<string> {
  const row = await findUserById(SYSTEM_VIEWER, userId);
  if (!row) throw new Error(`사람이 없습니다: ${userId}`);
  return row.name;
}

async function archivedAtOf(userId: string): Promise<Date | null> {
  return (await findUserById(SYSTEM_VIEWER, userId))?.archivedAt ?? null;
}

// 보관함 쓰기만 가진 계급 K, PM 복사 + 사람 · 보관함 쓰기 위임 계급 M.
async function archiveOnlyViewer() {
  const roleK = await makeDelegatedRole({
    name: "보관함 담당",
    copyFrom: [],
    infoItems: ["archive.value"],
    menus: [
      { menu: "admin.archive", action: "view" },
      { menu: "admin.archive", action: "write" },
    ],
  });
  return makePerson(uniqueName("보관함 담당 V"), roleK, null);
}

async function delegatedViewer() {
  const roleM = await makeDelegatedRole({
    name: "인사 위임",
    copyFrom: [DEFAULT_ROLE_ID],
    menus: [
      { menu: "admin.people", action: "view" },
      { menu: "admin.people", action: "write" },
      { menu: "admin.archive", action: "view" },
      { menu: "admin.archive", action: "write" },
    ],
  });
  return makePerson(uniqueName("위임 D"), roleM, null);
}

async function archivedPm() {
  const p = await makeSeated(uniqueName("PM P"), DEFAULT_ROLE_ID, null);
  await archive(SYSTEM_VIEWER, "user", p.id, deps);
  return p;
}

describe("사람 복원(06.4 D-6406 · G36)", () => {
  it("사람 쓰기 없이 보관함 쓰기만 있으면 거부 · 보관 · 로그 그대로", async () => {
    const v = await archiveOnlyViewer();
    const p = await archivedPm();
    const logsBefore = await countLogs("restore", "user", p.id);

    const error = await refusal(restore(v, "user", p.id, deps), PersonRestoreForbiddenError);

    expect(error.message).toBe("사람 복원 권한 없음 · 시스템 관리자 · 복원 불가");
    expect(await archivedAtOf(p.id)).not.toBeNull();
    expect(await countLogs("restore", "user", p.id)).toBe(logsBefore);
  });

  it("위임받은 사람은 보관된 시스템 관리자를 되살리지 못하고, PM은 되살린다 · SYSTEM은 관리자도 되살린다", async () => {
    const d = await delegatedViewer();
    const a = await makeAdmin(uniqueName("관리자 A"));
    await archive(SYSTEM_VIEWER, "user", a.id, deps);
    const p = await archivedPm();

    const error = await refusal(restore(d, "user", a.id, deps), RoleGrantForbiddenError);
    expect(error.message).toBe("계급 지정 권한 없음 · 시스템 관리자" + TAIL);
    expect(await archivedAtOf(a.id)).not.toBeNull();

    expect(await restore(d, "user", p.id, deps)).toEqual({ restored: true });
    expect(await archivedAtOf(p.id)).toBeNull();
    expect(await countLogs("restore", "user", p.id)).toBe(1);

    expect(await restore(SYSTEM_VIEWER, "user", a.id, deps)).toEqual({ restored: true });
    expect(await archivedAtOf(a.id)).toBeNull();
  });

  it("보관된 팀장의 팀에 그새 팀장이 있으면 거부 · 문구에 그 이름 · 못 보면 담당 · 비운 뒤엔 복원", async () => {
    const admin = await makeAdmin("관리자");
    const { teamId } = await makeOrgTeam();
    const l = await makeSeated(uniqueName("팀장L"), TEAM_LEAD_ROLE_ID, teamId);
    await archive(SYSTEM_VIEWER, "user", l.id, deps);
    const z = await makeSeated(uniqueName("팀장Z"), TEAM_LEAD_ROLE_ID, teamId);

    const error = await refusal(restore(admin, "user", l.id, deps), SeatTakenError);
    expect(error.message).toBe(`팀장 있음 · ${await nameOf(z.id)}` + TAIL);
    expect(await archivedAtOf(l.id)).not.toBeNull();

    const hidden = await refusal(restore(admin, "user", l.id, { ...deps, visible: () => Promise.resolve(false) }), SeatTakenError);
    expect(hidden.message).toBe("팀장 있음 · 시스템 관리자" + TAIL);

    await archive(SYSTEM_VIEWER, "user", z.id, deps);
    expect(await restore(admin, "user", l.id, deps)).toEqual({ restored: true });
    expect(await archivedAtOf(l.id)).toBeNull();
  });

  it("보관된 본부 책임자의 본부에 그새 책임자가 있으면 거부 · 문구에 그 이름", async () => {
    const admin = await makeAdmin("관리자");
    const { orgUnitId, teamId } = await makeOrgTeam();
    const t2 = await addTeam(orgUnitId);
    const h = await makeSeated(uniqueName("책임자H"), DIVISION_HEAD_ROLE_ID, teamId);
    await archive(SYSTEM_VIEWER, "user", h.id, deps);
    const h2 = await makeSeated(uniqueName("책임자H2"), DIVISION_HEAD_ROLE_ID, t2);

    const error = await refusal(restore(admin, "user", h.id, deps), SeatTakenError);

    expect(error.message).toBe(`본부 책임자 있음 · ${await nameOf(h2.id)}` + TAIL);
    expect(await archivedAtOf(h.id)).not.toBeNull();
  });

  it("퇴직일이 지난 팀장은 팀에 다른 팀장이 있어도 복원된다(자리 구간이 퇴직일에서 잘림)", async () => {
    const admin = await makeAdmin("관리자");
    const { teamId } = await makeOrgTeam();
    const l = await makeSeated(uniqueName("팀장L"), TEAM_LEAD_ROLE_ID, teamId);
    await updateUserResignationDate(SYSTEM_VIEWER, l.id, "2026-09-01");
    await archive(SYSTEM_VIEWER, "user", l.id, deps);
    await makeSeated(uniqueName("팀장Z"), TEAM_LEAD_ROLE_ID, teamId);

    expect(await restore(admin, "user", l.id, deps)).toEqual({ restored: true });
    expect(await archivedAtOf(l.id)).toBeNull();
  });

  it("SYSTEM_VIEWER도 자리 검사는 면제되지 않는다(O4 · R5)", async () => {
    const { teamId } = await makeOrgTeam();
    const l = await makeSeated(uniqueName("팀장L"), TEAM_LEAD_ROLE_ID, teamId);
    await archive(SYSTEM_VIEWER, "user", l.id, deps);
    const z = await makeSeated(uniqueName("팀장Z"), TEAM_LEAD_ROLE_ID, teamId);

    const error = await refusal(restore(SYSTEM_VIEWER, "user", l.id, deps), SeatTakenError);

    expect(error.message).toBe(`팀장 있음 · ${await nameOf(z.id)}` + TAIL);
    expect(await archivedAtOf(l.id)).not.toBeNull();
  });

  it("이미 활성인 사람은 { restored: false } · 로그 없음, 없는 사람은 없는 사람 · 복원 불가", async () => {
    const admin = await makeAdmin("관리자");
    const p = await makeSeated(uniqueName("PM P"), DEFAULT_ROLE_ID, null);

    expect(await restore(admin, "user", p.id, deps)).toEqual({ restored: false });
    expect(await countLogs("restore", "user", p.id)).toBe(0);

    const error = await refusal(restore(admin, "user", randomUUID(), deps), PersonNotRestorableError);
    expect(error.message).toBe("없는 사람 · 복원 불가");
  });
});

// 06.4 /review: 팀 · 본부를 보관한 사이 그 자리에 둘째 보유자가 생길 수 있다(자리 검사는 보관된 팀 · 본부를 보지 않는다).
// 되살리면 한 자리에 둘이 되므로 복원을 막는다 — 사람 복원과 같은 문구 꼴(` · 복원 불가`).
describe("팀 · 본부 복원 자리 재검사(06.4)", () => {
  async function archivedTeamAtOf(teamId: string): Promise<Date | null> {
    return (await findTeamById(SYSTEM_VIEWER, teamId))?.archivedAt ?? null;
  }

  it("보관된 팀에 그새 팀장이 하나 더 생겼으면 팀 복원 거부 · 보관 · 로그 그대로 · 비운 뒤엔 복원", async () => {
    const admin = await makeAdmin("관리자");
    const { teamId } = await makeOrgTeam();
    const l = await makeSeated(uniqueName("팀장L"), TEAM_LEAD_ROLE_ID, teamId);
    await archive(SYSTEM_VIEWER, "team", teamId, deps);
    const z = await makeSeated(uniqueName("팀장Z"), TEAM_LEAD_ROLE_ID, teamId);
    const logsBefore = await countLogs("restore", "team", teamId);

    const error = await refusal(restore(admin, "team", teamId, deps), SeatTakenError);

    const first = [await nameOf(l.id), await nameOf(z.id)].sort()[0];
    expect(error.message).toBe(`팀장 있음 · ${first}` + TAIL);
    expect(await archivedTeamAtOf(teamId)).not.toBeNull();
    expect(await countLogs("restore", "team", teamId)).toBe(logsBefore);

    await archive(SYSTEM_VIEWER, "user", z.id, deps);
    expect(await restore(admin, "team", teamId, deps)).toEqual({ restored: true });
    expect(await archivedTeamAtOf(teamId)).toBeNull();
  });

  it("되살릴 팀의 본부 책임자가 본부의 다른 책임자와 겹치면 팀 복원 거부", async () => {
    const admin = await makeAdmin("관리자");
    const { orgUnitId, teamId } = await makeOrgTeam();
    const t2 = await addTeam(orgUnitId);
    await makeSeated(uniqueName("책임자H"), DIVISION_HEAD_ROLE_ID, teamId);
    await archive(SYSTEM_VIEWER, "team", t2, deps);
    await makeSeated(uniqueName("책임자H2"), DIVISION_HEAD_ROLE_ID, t2);

    const error = await refusal(restore(admin, "team", t2, deps), SeatTakenError);

    expect(error.message.startsWith("본부 책임자 있음 · ")).toBe(true);
    expect(error.message.endsWith(TAIL)).toBe(true);
    expect(await archivedTeamAtOf(t2)).not.toBeNull();
  });

  it("본부에 이미 겹친 책임자 둘이 있어도 책임자 없는 팀은 복원된다 · 셋째 책임자를 데려오는 팀은 거부", async () => {
    const admin = await makeAdmin("관리자");
    const { orgUnitId, teamId } = await makeOrgTeam();
    const t2 = await addTeam(orgUnitId);
    const t3 = await addTeam(orgUnitId);
    const t4 = await addTeam(orgUnitId);
    await makeSeated(uniqueName("책임자H"), DIVISION_HEAD_ROLE_ID, teamId);
    await makeSeated(uniqueName("책임자H2"), DIVISION_HEAD_ROLE_ID, t2);
    await makeSeated(uniqueName("PM P"), DEFAULT_ROLE_ID, t3);
    await archive(SYSTEM_VIEWER, "team", t3, deps);
    await archive(SYSTEM_VIEWER, "team", t4, deps);
    await makeSeated(uniqueName("책임자H3"), DIVISION_HEAD_ROLE_ID, t4);

    expect(await restore(admin, "team", t3, deps)).toEqual({ restored: true });
    expect(await archivedTeamAtOf(t3)).toBeNull();

    const error = await refusal(restore(admin, "team", t4, deps), SeatTakenError);
    expect(error.message.startsWith("본부 책임자 있음 · ")).toBe(true);
    expect(error.message.endsWith(TAIL)).toBe(true);
    expect(await archivedTeamAtOf(t4)).not.toBeNull();
  });

  it("보관된 본부에 그새 책임자가 하나 더 생겼으면 본부 복원 거부 · 이름을 못 보면 담당", async () => {
    const admin = await makeAdmin("관리자");
    const { orgUnitId, teamId } = await makeOrgTeam();
    const t2 = await addTeam(orgUnitId);
    await makeSeated(uniqueName("책임자H"), DIVISION_HEAD_ROLE_ID, teamId);
    await archive(SYSTEM_VIEWER, "org_unit", orgUnitId, deps);
    await makeSeated(uniqueName("책임자H2"), DIVISION_HEAD_ROLE_ID, t2);

    const error = await refusal(restore(admin, "org_unit", orgUnitId, { ...deps, visible: () => Promise.resolve(false) }), SeatTakenError);

    expect(error.message).toBe("본부 책임자 있음 · 시스템 관리자" + TAIL);
    expect((await findOrgUnitById(SYSTEM_VIEWER, orgUnitId))?.archivedAt).not.toBeNull();
  });
});

// 06.4 /review(사용자 결정): 사람 보관도 복원처럼 보관함 쓰기에 더해 사람 쓰기를 요구한다 — 등록 보상(SYSTEM_VIEWER)은 그대로.
describe("사람 보관 권한(06.4)", () => {
  it("사람 쓰기 없이 보관함 쓰기만 있으면 사람 보관 거부 · 보관 · 로그 그대로", async () => {
    const v = await archiveOnlyViewer();
    const p = await makeSeated(uniqueName("PM P"), DEFAULT_ROLE_ID, null);

    const error = await refusal(archive(v, "user", p.id, deps), ArchiveForbiddenError);

    expect(error.message).toBe("사람 보관 권한 없음 · 시스템 관리자");
    expect(await archivedAtOf(p.id)).toBeNull();
    expect(await countLogs("archive", "user", p.id)).toBe(0);
  });

  it("사람 · 보관함 쓰기가 둘 다 있으면 보관된다", async () => {
    const d = await delegatedViewer();
    const p = await makeSeated(uniqueName("PM P"), DEFAULT_ROLE_ID, null);

    await archive(d, "user", p.id, deps);

    expect(await archivedAtOf(p.id)).not.toBeNull();
  });
});

describe("보관함 목록 사람 복원 가능(06.4 D-6406)", () => {
  it("사람 쓰기 없는 사람에게는 사람 행 「복원」이 없고, 관리자에게는 있다 · 다른 항목은 그대로", async () => {
    const admin = await makeAdmin("관리자");
    const v = await archiveOnlyViewer();
    const p = await archivedPm();
    const codeItem = await createCodeItem(SYSTEM_VIEWER, { tableKey: "project_status", value: "a", label: "A" });
    await archive(SYSTEM_VIEWER, "code_items", codeItem.id, deps);

    const restorableOf = async (viewer: typeof admin, id: string) => (await listArchive(viewer)).find((row) => row.id === id)?.restorable;

    expect(await restorableOf(v, p.id)).toBe(false);
    expect(await restorableOf(admin, p.id)).toBe(true);
    expect(await restorableOf(v, codeItem.id)).toBe(true);
    expect(await restorableOf(admin, codeItem.id)).toBe(true);
  });
});

describe("등록 보상 보관 로그 tx(06.4)", () => {
  it("발령 단계가 실패하면 새 계정을 보관하고, 보관 로그 래퍼가 tx를 넘긴다", async () => {
    const admin = await makeAdmin("관리자");
    const { teamId } = await makeOrgTeam();
    const email = `${randomUUID()}@example.test`;
    const options: unknown[] = [];

    const error = await refusal(
      registerPerson(
        admin,
        { name: uniqueName("새 사람"), email, roleId: DEFAULT_ROLE_ID, teamId, effectiveFrom: "2026-09-01" },
        {
          now: deps.now,
          assignTeam: () => Promise.reject(new Error("발령 인프라 오류")),
          recordAction: (viewer, entry, recordOptions) => {
            options.push(recordOptions);
            return recordAction(viewer, entry, recordOptions);
          },
        },
      ),
      UserFacingError,
    );
    expect(error.message).toBe("발령 실패 · 계정은 발급됨 — 보관함에서 복원 후 발령 추가");

    const created = await findUserByEmail(SYSTEM_VIEWER, email);
    expect(created?.archivedAt).not.toBeNull();
    const logs = (await queryActionLog(SYSTEM_VIEWER, { actionType: "archive" })).filter((row) => row.entity === "user" && row.entityId === created?.id);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.detail).toEqual({ reason: "register_person_rollback", requestedBy: admin.id });
    expect(options).toHaveLength(1);
    expect(options[0]).toEqual(expect.objectContaining({ tx: expect.anything() as unknown }));
  });
});

// 07-03(R11 · T-07-03-03) — 보관함이 아는 종류마다 「보관함 쓰기가 없으면 복원 거부 · 로그 그대로」를 한 줄씩 건다.
// 종류 목록은 ARCHIVABLE_TABLES에서 읽으므로 새 종류가 생기면 이 시험이 자동으로 그 종류를 덮는다.
// 이 사례는 restore() 첫 줄의 보관함 쓰기 게이트만 본다 — 종류별 게이트는 아래 「종류별 복원 게이트」.
// 사람 종류의 상한(계급 지정 권한)은 위 「사람 복원」 두 번째 사례, 사람 쓰기 게이트는 첫 사례,
// 팀 · 본부 자리 재검사는 「팀 · 본부 복원 자리 재검사」가 본다.
describe("보관함 쓰기 게이트 — 보관함 쓰기 없는 위임자 (07-03 R11)", () => {
  it("보관함 쓰기 권한 없으면 모든 종류 복원 거부 · 로그 그대로", async () => {
    const roleP = await makeDelegatedRole({
      name: "사람만 위임",
      copyFrom: [DEFAULT_ROLE_ID],
      menus: [
        { menu: "admin.people", action: "view" },
        { menu: "admin.people", action: "write" },
      ],
    });
    const viewer = await makePerson(uniqueName("사람만 V"), roleP, null);

    expect(ARCHIVABLE_TABLES.length).toBeGreaterThan(0);
    for (const entry of ARCHIVABLE_TABLES) {
      const id = randomUUID();
      const error = await refusal(restore(viewer, entry.entity, id, deps), ArchiveForbiddenError);
      expect(error.message, entry.entity).toBe("보관함 쓰기 권한 없음");
      expect(await countLogs("restore", entry.entity, id), entry.entity).toBe(0);
    }
  });
});

// 07-03 R11(사용자 결정 2026-10-22 「지금 설계 유지」): 사람은 계급 지정 상한, 팀 · 본부는 자리 재검사(위 사례들),
// 나머지는 보관함 쓰기 + 종류별 requiredMenu 쓰기(assertCanWriteEntry). 여기서는 requiredMenu를 실제로 보관된 행으로 본다.
// requiredMenu가 붙은 종류가 늘면 아래 표에 보관된 행 만드는 법을 더해야 첫 단언이 초록이 된다.
const ARCHIVED_ROW_OF_GATED_KIND: Record<string, () => Promise<string>> = {
  field_definitions: async () => {
    const id = `fd-vendor-${randomUUID()}`;
    await insertFieldDefinition(SYSTEM_VIEWER, { id, entity: "vendor", key: `v_${randomUUID().slice(0, 8)}`, type: "text" });
    await archive(SYSTEM_VIEWER, "field_definitions", id, deps);
    return id;
  },
};

describe("종류별 복원 게이트 — 보관함 쓰기만 있는 위임자 (07-03 R11)", () => {
  it("추가 권한 조건이 있는 종류마다 그 메뉴 쓰기가 없으면 보관된 행 복원 거부 · 보관 · 로그 그대로", async () => {
    const gated = ARCHIVABLE_TABLES.filter((entry) => entry.requiredMenu);
    expect(gated.map((entry) => entry.entity).sort()).toEqual(Object.keys(ARCHIVED_ROW_OF_GATED_KIND).sort());
    const v = await archiveOnlyViewer();

    for (const entry of gated) {
      const makeArchived = ARCHIVED_ROW_OF_GATED_KIND[entry.entity];
      if (!makeArchived) throw new Error(`보관된 행 만드는 법이 없습니다: ${entry.entity}`);
      const id = await makeArchived();
      expect((await entry.findById(SYSTEM_VIEWER, id))?.archivedAt, entry.entity).not.toBeNull();

      const error = await refusal(restore(v, entry.entity, id, deps), ArchiveForbiddenError);

      expect(error.message, entry.entity).toBe("보관함 쓰기 권한 없음");
      expect((await entry.findById(SYSTEM_VIEWER, id))?.archivedAt, entry.entity).not.toBeNull();
      expect(await countLogs("restore", entry.entity, id), entry.entity).toBe(0);
    }
  });

  it("추가 권한 조건이 없는 종류(코드표)는 보관함 쓰기만으로 복원된다", async () => {
    const v = await archiveOnlyViewer();
    const codeItem = await createCodeItem(SYSTEM_VIEWER, { tableKey: "project_status", value: `r11-${randomUUID().slice(0, 8)}`, label: "R11" });
    await archive(SYSTEM_VIEWER, "code_items", codeItem.id, deps);

    expect(await restore(v, "code_items", codeItem.id, deps)).toEqual({ restored: true });
    expect((await findCodeItemById(SYSTEM_VIEWER, codeItem.id))?.archivedAt).toBeNull();
    expect(await countLogs("restore", "code_items", codeItem.id)).toBe(1);
  });
});
