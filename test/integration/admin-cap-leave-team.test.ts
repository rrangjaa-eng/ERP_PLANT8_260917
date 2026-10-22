import { describe, expect, it } from "vitest";
import type { Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { RoleGrantForbiddenError } from "@/domain/permissions/grant-ceiling";
import { addLeaveAdjustment } from "@/domain/leave/balance-service";
import { assignTeam } from "@/domain/org";
import { listMemberships } from "@/repositories/team-memberships";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { countRows, makePerson, NOW_2026 } from "./approvals-fixtures";
import { makeAdmin, makeDelegatedRole, makeOrgTeam } from "./admin-cap-fixtures";

// 07-17 R15 서버 쪽 — 화면이 상한 밖 대상의 「연차 조정 추가」 · 「새 이력 추가」를 숨기지만, 액션을 직접 부르면
// 서버도 대상 계급 상한(assertCanGrantRoles)으로 거부해야 한다. 같은 모듈의 계급 변경 · 잠금 풀기 · 초기화와 같은 관문.

const GRANT_FORBIDDEN = "계급 지정 권한 없음 · 시스템 관리자";

async function refusal<E extends Error>(promise: Promise<unknown>, type: new (...args: never[]) => E): Promise<E> {
  const error = await promise.then(
    () => new Error("거부되어야 하는데 성공함"),
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(type);
  return error as E;
}

// 위임 계급 M = PM 칸 · 범위 복사 + admin.people 보기 · 쓰기.
async function delegate(): Promise<Viewer> {
  const roleM = await makeDelegatedRole({ copyFrom: [DEFAULT_ROLE_ID] });
  return makePerson("위임 D", roleM, null);
}

const adjustment = (userId: string) => ({ userId, bucket: "annual", fiscalYear: 2026, amountDays: -1, reason: "무단 결근" });

describe("연차 조정 추가의 대상 상한(07-17 R15)", () => {
  it("위임자가 상한 밖(시스템 관리자) 대상에 조정을 넣으면 거부 · 조정 행 그대로", async () => {
    const d = await delegate();
    const a = await makeAdmin("관리자 A");
    const rowsBefore = await countRows("leave_adjustments");

    const error = await refusal(addLeaveAdjustment(d, adjustment(a.id), { now: NOW_2026 }), RoleGrantForbiddenError);

    expect(error.message).toBe(GRANT_FORBIDDEN);
    expect(await countRows("leave_adjustments")).toBe(rowsBefore);
  });

  it("위임자가 상한 안(PM) 대상에 조정을 넣으면 성공", async () => {
    const d = await delegate();
    const p = await makePerson("대상 P", DEFAULT_ROLE_ID, null);
    const rowsBefore = await countRows("leave_adjustments");

    await addLeaveAdjustment(d, adjustment(p.id), { now: NOW_2026 });

    expect(await countRows("leave_adjustments")).toBe(rowsBefore + 1);
  });
});

describe("팀 발령의 대상 상한(07-17 R15)", () => {
  it("위임자가 상한 밖(시스템 관리자) 대상을 발령하면 거부 · 발령 그대로", async () => {
    const d = await delegate();
    const a = await makeAdmin("관리자 A");
    const { teamId } = await makeOrgTeam();

    const error = await refusal(
      assignTeam(d, { userId: a.id, teamId, effectiveFrom: "2026-09-01" }, { now: () => NOW_2026 }),
      RoleGrantForbiddenError,
    );

    expect(error.message).toBe(GRANT_FORBIDDEN);
    expect(await listMemberships(SYSTEM_VIEWER, a.id)).toEqual([]);
  });

  it("위임자가 상한 안(PM) 대상을 발령하면 성공", async () => {
    const d = await delegate();
    const p = await makePerson("대상 P", DEFAULT_ROLE_ID, null);
    const { teamId } = await makeOrgTeam();

    await assignTeam(d, { userId: p.id, teamId, effectiveFrom: "2026-09-01" }, { now: () => NOW_2026 });

    expect((await listMemberships(SYSTEM_VIEWER, p.id)).map((row) => row.teamId)).toEqual([teamId]);
  });
});
