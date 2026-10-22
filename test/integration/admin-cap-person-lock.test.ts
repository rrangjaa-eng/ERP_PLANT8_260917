import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { Viewer } from "@/domain/viewer";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { RoleGrantForbiddenError } from "@/domain/permissions/grant-ceiling";
import { addLeaveAdjustment } from "@/domain/leave/balance-service";
import { resetPersonPassword, unlockPerson } from "@/domain/people";
import { lockoutConfig, windowStart } from "@/domain/auth/lockout";
import { countOpenFailures, recordAttempt } from "@/repositories/login-attempts";
import { findUserById, updateUserRole } from "@/repositories/users";
import { countRows, makePerson, NOW_2026 } from "./approvals-fixtures";
import { makeDelegatedRole, waitingOnKey } from "./admin-cap-fixtures";

// 07-17 독립 검토 L1: 잠금 풀기 · 비밀번호 초기화 · 연차 조정의 대상 상한은 사람 키(seat:person:) 잠금 뒤 재조회로 본다 —
// 계급 변경(changePersonRole)이 같은 키를 쥔 채 대상을 관리자로 올리는 동안 들어온 요청은 그 커밋을 기다렸다가 새 계급으로
// 거부된다(assignTeam · cancelFutureAssignment와 같은 순서). 잠금 밖에서 읽으면 올리기 전 계급으로 통과한다(TOCTOU).

const GRANT_FORBIDDEN = "계급 지정 권한 없음 · 시스템 관리자";
const personKey = (userId: string) => `seat:person:${userId}`;

async function delegate(): Promise<Viewer> {
  const roleM = await makeDelegatedRole({ copyFrom: [DEFAULT_ROLE_ID] });
  return makePerson("위임 D", roleM, null);
}

async function lockLogin(email: string): Promise<void> {
  const { threshold } = await lockoutConfig();
  for (let i = 0; i < threshold; i += 1) await recordAttempt(SYSTEM_VIEWER, { email, success: false, ip: null });
}

async function openFailures(email: string): Promise<number> {
  const { windowMinutes } = await lockoutConfig();
  return countOpenFailures(SYSTEM_VIEWER, email, windowStart(new Date(), windowMinutes));
}

async function passwordResets(userId: string): Promise<number> {
  const result = await db.execute<{ n: string }>(
    sql`select count(*)::text as n from action_log where action_type = 'password_reset' and entity_id = ${userId}`,
  );
  return Number(result.rows[0]?.n ?? 0);
}

// 계급 변경처럼 사람 키를 쥐고 대상을 시스템 관리자로 올린 채 커밋을 미룬다.
async function promoteHolding(userId: string): Promise<{ commit: () => Promise<void> }> {
  let open: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  let held: () => void = () => {};
  const holding = new Promise<void>((resolve) => {
    held = resolve;
  });
  const holder = db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${personKey(userId)}, 0))`);
    await updateUserRole(SYSTEM_VIEWER, userId, SYSADMIN_ROLE_ID, tx);
    held();
    await gate;
  });
  await holding;
  return {
    commit: async () => {
      open();
      await holder;
    },
  };
}

// 요청을 띄우고 사람 키에서 기다리기 시작할 때까지(최대 3초 — 잠금 밖이면 기다리지 않고 끝난다) 둔 뒤 올리기를 커밋한다.
async function raceWithPromotion(userId: string, request: () => Promise<unknown>): Promise<unknown> {
  const promotion = await promoteHolding(userId);
  const settled = request().then(
    () => new Error("거부되어야 하는데 성공함"),
    (caught: unknown) => caught,
  );
  for (let tries = 0; tries < 60 && (await waitingOnKey(personKey(userId))) < 1; tries++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await promotion.commit();
  return settled;
}

describe("사람 키 잠금 뒤 상한 재판정(07-17 독립 검토 L1)", () => {
  it("잠금 풀기 — 같은 순간 관리자로 올라간 대상은 거부 · 잠김 그대로", async () => {
    const d = await delegate();
    const p = await makePerson("대상 P", DEFAULT_ROLE_ID, null);
    const email = (await findUserById(SYSTEM_VIEWER, p.id))?.email ?? "";
    await lockLogin(email);
    const failures = await openFailures(email);

    const error = await raceWithPromotion(p.id, () => unlockPerson(d, p.id));

    expect(error).toBeInstanceOf(RoleGrantForbiddenError);
    expect((error as Error).message).toBe(GRANT_FORBIDDEN);
    expect(await openFailures(email)).toBe(failures);
  });

  it("비밀번호 초기화 — 같은 순간 관리자로 올라간 대상은 거부 · 초기화 기록 없음", async () => {
    const d = await delegate();
    const p = await makePerson("대상 P", DEFAULT_ROLE_ID, null);

    const error = await raceWithPromotion(p.id, () => resetPersonPassword(d, p.id));

    expect(error).toBeInstanceOf(RoleGrantForbiddenError);
    expect((error as Error).message).toBe(GRANT_FORBIDDEN);
    expect(await passwordResets(p.id)).toBe(0);
  });

  it("연차 조정 — 같은 순간 관리자로 올라간 대상은 거부 · 조정 행 그대로", async () => {
    const d = await delegate();
    const p = await makePerson("대상 P", DEFAULT_ROLE_ID, null);
    const rowsBefore = await countRows("leave_adjustments");

    const error = await raceWithPromotion(p.id, () =>
      addLeaveAdjustment(d, { userId: p.id, bucket: "annual", fiscalYear: 2026, amountDays: -1, reason: "무단 결근" }, { now: NOW_2026 }),
    );

    expect(error).toBeInstanceOf(RoleGrantForbiddenError);
    expect((error as Error).message).toBe(GRANT_FORBIDDEN);
    expect(await countRows("leave_adjustments")).toBe(rowsBefore);
  });
});

async function unlockRecords(userId: string): Promise<number> {
  const result = await db.execute<{ n: string }>(
    sql`select count(*)::text as n from action_log where action_type = 'account_unlock' and entity_id = ${userId}`,
  );
  return Number(result.rows[0]?.n ?? 0);
}

// 07-17 독립 검토 L3: 지금 잠기지 않은 사람의 잠금 풀기는 아무것도 하지 않는다 — 「해소 0건」 기록 · 임계 미만 실패 지우기가 없고,
// 두 관리자가 같은 사람을 동시에 풀면 사람 키에서 줄 서서 하나만 푼다(화면도 그 하나만 성공 줄).
describe("잠기지 않은 사람의 잠금 풀기(07-17 독립 검토 L3)", () => {
  it("임계 미만 실패만 있는 사람 — 풀지 않음 · 기록 없음 · 실패 수 그대로", async () => {
    const p = await makePerson("대상 P", DEFAULT_ROLE_ID, null);
    const email = (await findUserById(SYSTEM_VIEWER, p.id))?.email ?? "";
    await recordAttempt(SYSTEM_VIEWER, { email, success: false, ip: null });

    expect(await unlockPerson(SYSTEM_VIEWER, p.id)).toEqual({ unlocked: false });

    expect(await unlockRecords(p.id)).toBe(0);
    expect(await openFailures(email)).toBe(1);
  });

  it("잠긴 사람을 둘이 동시에 풀면 하나만 풀고 기록도 하나", async () => {
    const p = await makePerson("대상 P", DEFAULT_ROLE_ID, null);
    const email = (await findUserById(SYSTEM_VIEWER, p.id))?.email ?? "";
    await lockLogin(email);

    const results = await Promise.all([unlockPerson(SYSTEM_VIEWER, p.id), unlockPerson(SYSTEM_VIEWER, p.id)]);

    expect(results.map((result) => result.unlocked).sort()).toEqual([false, true]);
    expect(await unlockRecords(p.id)).toBe(1);
    expect(await openFailures(email)).toBe(0);
  });
});
