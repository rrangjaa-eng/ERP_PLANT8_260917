import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { roles } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createRole } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { archive } from "@/domain/archive";
import { registerPerson, ValidationError } from "@/domain/people";
import { findUserById } from "@/repositories/users";
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
