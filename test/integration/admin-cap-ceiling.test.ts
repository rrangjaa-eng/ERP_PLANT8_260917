import { describe, expect, it } from "vitest";
import type { Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { RoleGrantForbiddenError } from "@/domain/permissions/grant-ceiling";
import { changePersonRole } from "@/domain/people";
import { makePerson, NOW_2026 } from "./approvals-fixtures";
import { countLogs, makeAdmin, makeDelegatedRole, roleOf } from "./admin-cap-fixtures";

// 06.4-02: 계급 변경 · 등록의 권한 상한 — 서비스 직접 호출. 행위자는 실제 users 행(SYSTEM_VIEWER 사례만 예외).

const deps = { now: () => NOW_2026 };
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

describe("계급 변경 권한 상한(06.4 D-6401 · D-6402)", () => {
  it("위임자가 PM을 시스템 관리자로 올리면 상한 거부 · 계급 · 로그 그대로", async () => {
    const d = await delegate();
    const p = await makePerson("대상 P", DEFAULT_ROLE_ID, null);
    const logsBefore = await countLogs("permission_change", "user", p.id);

    const error = await refusal(changePersonRole(d, p.id, SYSADMIN_ROLE_ID, deps), RoleGrantForbiddenError);

    expect(error.message).toBe(GRANT_FORBIDDEN);
    expect(await roleOf(p.id)).toBe(DEFAULT_ROLE_ID);
    expect(await countLogs("permission_change", "user", p.id)).toBe(logsBefore);
  });

  it("위임자가 시스템 관리자를 PM으로 내리면 지금 계급이 상한 밖이라 거부", async () => {
    const d = await delegate();
    const a = await makeAdmin("관리자 A");
    await makeAdmin("관리자 A2");

    const error = await refusal(changePersonRole(d, a.id, DEFAULT_ROLE_ID, deps), RoleGrantForbiddenError);

    expect(error.message).toBe(GRANT_FORBIDDEN);
    expect(await roleOf(a.id)).toBe(SYSADMIN_ROLE_ID);
  });

  it("위임자가 PM에게 PM을 주면 성공 · 로그 한 줄", async () => {
    const d = await delegate();
    const p2 = await makePerson("대상 P2", DEFAULT_ROLE_ID, null);

    await changePersonRole(d, p2.id, DEFAULT_ROLE_ID, deps);

    expect(await countLogs("permission_change", "user", p2.id)).toBe(1);
  });
});
