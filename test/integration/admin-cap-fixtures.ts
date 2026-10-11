import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createRole, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { upsertPermission } from "@/repositories/permissions";
import { makePerson } from "./approvals-fixtures";

// 06.4 관리자 상한 통합 테스트 공용 픽스처 — 사람 · 계급은 도메인 · 리포지토리 함수로만 만든다.

export async function makeAdmin(name: string): Promise<Viewer> {
  return makePerson(name, SYSADMIN_ROLE_ID, null);
}

// 커스텀 관리자급 계급 — admin.permissions 보기 · 쓰기만 허용.
export async function makeAdminRole(name: string): Promise<string> {
  const role = await createRole(SYSTEM_VIEWER, { name: `${name}-${randomUUID()}` });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "admin.permissions", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "admin.permissions", action: "write", allowed: true });
  return role.id;
}

// 자리 키(hashtextextended(key, 0))의 advisory 미획득 대기 수 — leave-overlap.test.ts의 waitingOn과 같은 SQL.
export async function waitingOnKey(key: string): Promise<number> {
  const hashed = sql`hashtextextended(${key}, 0)`;
  const result = await db.execute<{ n: string }>(sql`
    select count(*)::text as n from pg_locks
    where locktype = 'advisory' and not granted and objsubid = 1
      and classid::bigint = ((${hashed}) >> 32) & 4294967295
      and objid::bigint = (${hashed}) & 4294967295`);
  return Number(result.rows[0]?.n ?? 0);
}

// 키를 쥔 트랜잭션을 연다 — 쥔 뒤 돌아오고, release()가 문을 열고 홀더 트랜잭션 끝을 기다린다.
export async function holdKey(key: string): Promise<{ release: () => Promise<void> }> {
  let open: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  let held: () => void = () => {};
  const holding = new Promise<void>((resolve) => {
    held = resolve;
  });
  const holder = db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
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
