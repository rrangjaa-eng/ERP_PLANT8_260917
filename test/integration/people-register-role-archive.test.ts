import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { roles } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createRole, DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { archive } from "@/domain/archive";
import { registerPerson, ValidationError } from "@/domain/people";
import { findUserById } from "@/repositories/users";
import { createOrgUnit, createTeam } from "@/domain/org";
import { setOrgUnitArchived } from "@/repositories/org-units";
import { users } from "@/db/schema";
import { recordAction } from "@/domain/action-log/record";
import { NOW_2026 } from "./approvals-fixtures";
import { makeAdmin, uniqueName } from "./admin-cap-fixtures";

// 07-21 게이트(/cso P3-a): 사람 등록의 계정 생성(better-auth, 다른 연결)이 계급 보관과 겹쳐도 보관된 계급의 활성 사람이 남지 않는다.

const deps = { now: () => NOW_2026 };

async function refusal<E extends Error>(promise: Promise<unknown>, type: new (...args: never[]) => E): Promise<E> {
  const error = await promise.then(
    () => new Error("거부되어야 하는데 성공함"),
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(type);
  return error as E;
}

async function newRole(): Promise<string> {
  return (await createRole(SYSTEM_VIEWER, { name: `계급-${randomUUID()}` })).id;
}

// 계급 보관이 계급 행을 FOR UPDATE로 잡고(소속 0명으로 센 뒤) 아직 커밋하지 않은 상태를 만든다.
async function holdRoleArchiving(roleId: string): Promise<{ release: () => Promise<void> }> {
  let open: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  let held: () => void = () => {};
  const holding = new Promise<void>((resolve) => {
    held = resolve;
  });
  const holder = db.transaction(async (tx) => {
    await tx.select({ id: roles.id }).from(roles).where(eq(roles.id, roleId)).for("update");
    await tx.update(roles).set({ archivedAt: new Date() }).where(eq(roles.id, roleId));
    held();
    await gate;
  });
  await holding;
  return {
    release: async () => {
      open();
      await holder;
    },
  };
}

async function waitForRowLockWaiters(count: number): Promise<void> {
  for (let tries = 0; tries < 100; tries++) {
    const result = await db.execute<{ n: string }>(
      sql`select count(*)::text as n from pg_stat_activity where wait_event_type = 'Lock' and wait_event in ('tuple', 'transactionid')`,
    );
    if (Number(result.rows[0]?.n ?? 0) >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("행 잠금 대기를 보지 못함");
}

describe("사람 등록 ∥ 계급 보관(07-21 게이트 /cso P3-a)", () => {
  it("검사 뒤 · 계정 생성 전에 계급이 보관되면 등록 거부 · 만든 계정은 보관(보상)", async () => {
    const admin = await makeAdmin("관리자");
    const roleId = await newRole();
    const box: { createdId?: string } = {};

    const error = await refusal(
      registerPerson(
        admin,
        { name: uniqueName("등록"), email: `${randomUUID()}@example.test`, roleId },
        {
          createAccount: async (viewer, input) => {
            await archive(admin, "roles", roleId, deps);
            const created = await createAccount(viewer, input);
            box.createdId = created.userId;
            return created;
          },
          now: deps.now,
        },
      ),
      ValidationError,
    );

    expect(error.message).toBe(`존재하지 않거나 보관된 계급: ${roleId}`);
    expect(box.createdId).toBeDefined();
    expect((await findUserById(SYSTEM_VIEWER, box.createdId ?? ""))?.archivedAt).not.toBeNull();
  });

  it("계정 생성 직후 계급 보관이 계급 행을 잡고 있으면 기다렸다가 보관을 보고 거부한다(FOR SHARE)", async () => {
    const admin = await makeAdmin("관리자");
    const roleId = await newRole();
    const box: { createdId?: string; held?: { release: () => Promise<void> } } = {};

    const registering = registerPerson(
      admin,
      { name: uniqueName("등록"), email: `${randomUUID()}@example.test`, roleId },
      {
        createAccount: async (viewer, input) => {
          const created = await createAccount(viewer, input);
          box.createdId = created.userId;
          box.held = await holdRoleArchiving(roleId);
          return created;
        },
        now: deps.now,
      },
    ).then(
      () => null,
      (caught: unknown) => caught,
    );
    try {
      await waitForRowLockWaiters(1);
    } finally {
      await box.held?.release();
    }

    const error = await registering;
    expect(error).toBeInstanceOf(ValidationError);
    expect((await findUserById(SYSTEM_VIEWER, box.createdId ?? ""))?.archivedAt).not.toBeNull();
  });
});

// 07.1-14(D-7127): 새로 만들기 폼의 본부 칸 — 팀이 없을 때만 받는다. 화면은 팀과 본부를 함께 보내지 않지만 서버가 막는다.
describe("사람 등록 — 팀 없는 사람의 본부(07.1-14 D-7127)", () => {
  async function newDivision(): Promise<string> {
    return (await createOrgUnit(SYSTEM_VIEWER, { name: `등록본부-${randomUUID().slice(0, 8)}` })).id;
  }

  async function userCount(): Promise<number> {
    return db.$count(users);
  }

  it("팀 없이 본부 B로 만들면 본부 칸이 B다", async () => {
    const division = await newDivision();
    const { userId } = await registerPerson(
      SYSTEM_VIEWER,
      { name: "등록본부P", email: `${randomUUID()}@test.local`, roleId: DEFAULT_ROLE_ID, divisionId: division },
      deps,
    );
    expect((await findUserById(SYSTEM_VIEWER, userId))?.divisionId).toBe(division);
  });

  it("팀과 본부를 함께 보내면 계정 생성 전에 거부 「팀 있음 · 본부는 팀에서」", async () => {
    const division = await newDivision();
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: division, name: `등록팀-${randomUUID().slice(0, 8)}` });
    const before = await userCount();
    const error = await refusal(
      registerPerson(
        SYSTEM_VIEWER,
        { name: "등록둘다", email: `${randomUUID()}@test.local`, roleId: DEFAULT_ROLE_ID, teamId: team.id, effectiveFrom: "2026-01-01", divisionId: division },
        deps,
      ),
      ValidationError,
    );
    expect(error.message).toBe("팀 있음 · 본부는 팀에서");
    expect(await userCount()).toBe(before);
  });

  it("보관된 본부 · 없는 본부면 계정 생성 전에 거부 「보관된 본부 · 다른 본부」", async () => {
    const division = await newDivision();
    await setOrgUnitArchived(SYSTEM_VIEWER, division, true);
    const before = await userCount();
    for (const divisionId of [division, randomUUID()]) {
      const error = await refusal(
        registerPerson(SYSTEM_VIEWER, { name: "등록보관", email: `${randomUUID()}@test.local`, roleId: DEFAULT_ROLE_ID, divisionId }, deps),
        ValidationError,
      );
      expect(error.message).toBe("보관된 본부 · 다른 본부");
    }
    expect(await userCount()).toBe(before);
  });

  // 게이트 #323 P2-1: 검사 뒤 본부 저장이 실패하면(그새 본부 보관 등) 발령 · 입사일 실패와 같은 꼴로 계정 보관을 알린다 — 원래 오류를
  // 그대로 던지면 다른 본부로 다시 등록할 때 이메일 중복에 걸려 이유를 모른다.
  it("본부 저장이 실패하면 계정을 보관하고 「본부 저장 실패 · 계정은 발급됨 — 보관함에서 복원 후 사람 상세에서 본부 넣기」", async () => {
    const division = await newDivision();
    const email = `${randomUUID()}@test.local`;
    const failingDivisionLog: typeof recordAction = async (viewer, entry, options) => {
      const changes = (entry.detail as { changes?: Record<string, unknown> } | undefined)?.changes;
      if (entry.actionType === "permission_change" && changes?.division !== undefined) {
        throw new ValidationError("보관된 본부 · 다른 본부");
      }
      return recordAction(viewer, entry, options);
    };

    await expect(
      registerPerson(
        SYSTEM_VIEWER,
        { name: "등록본부실패", email, roleId: DEFAULT_ROLE_ID, divisionId: division },
        { ...deps, recordAction: failingDivisionLog },
      ),
    ).rejects.toThrow("본부 저장 실패 · 계정은 발급됨 — 보관함에서 복원 후 사람 상세에서 본부 넣기");

    const [row] = await db.select().from(users).where(eq(users.email, email));
    expect(row?.archivedAt).not.toBeNull();
    expect(row?.divisionId).toBeNull();
  });
});
