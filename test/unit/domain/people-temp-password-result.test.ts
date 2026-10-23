import { describe, expect, it, vi } from "vitest";
import { ForbiddenError, resetPersonPassword, UserNotFoundError } from "@/domain/people";
import type { Viewer } from "@/domain/viewer";
import type { DbOrTx } from "@/repositories/document-counters";

// 07-17 D-P2-7: 비밀번호 초기화 결과는 행 DTO가 아니라 일회성 비밀이다 — `admin.people` 쓰기 + 상한 안 + 자기 제외로만
// 나가고(정보 노출표로 가릴 값이 아님) `registerDto`에 오르지 않는다. 결과 키는 정확히 `tempPassword` 하나.
// 액션 등록 분류(dtoName null)는 test/unit/app/people-reset-password-registry.test.ts(domain 시험은 app을 들이지 않는다).
const viewer: Viewer = { id: "admin-1", roleId: "role-sysadmin" };

// 사람 키 잠금(07-17 독립 검토 L1)은 통합 시험(admin-cap-person-lock)이 본다 — 여기서는 tx 표지만 넘긴다.
const TX = {} as DbOrTx;
const withPersonLock = <T>(_viewer: Viewer, _id: string, fn: (tx: DbOrTx) => Promise<T>) => fn(TX);

function deps(overrides: Partial<{ can: boolean; target: null | { id: string; email: string; roleId: string | null; archivedAt: Date | null; resignationDate: string | null } }> = {}) {
  const target =
    overrides.target === undefined
      ? { id: "target-1", email: "kim@example.test", roleId: "role-employee", archivedAt: null, resignationDate: null }
      : overrides.target;
  return {
    can: vi.fn(() => Promise.resolve(overrides.can ?? true)),
    withPersonLock,
    loadTarget: vi.fn(() => Promise.resolve(target)),
    assertCanGrantRoles: vi.fn(() => Promise.resolve()),
    resetPassword: vi.fn(() => Promise.resolve({ userId: "target-1", tempPassword: "Tmp-7Q2x-9kLm" })),
  };
}

describe("resetPersonPassword — 결과 분류(D-P2-7)", () => {
  it("결과 키는 정확히 tempPassword 하나(userId 등 다른 값 없음)", async () => {
    const d = deps();
    const result = await resetPersonPassword(viewer, "target-1", d);
    expect(Object.keys(result)).toEqual(["tempPassword"]);
    expect(result.tempPassword).toBe("Tmp-7Q2x-9kLm");
    expect(d.resetPassword).toHaveBeenCalledWith(viewer, "kim@example.test");
    expect(d.assertCanGrantRoles).toHaveBeenCalledWith(viewer, ["role-employee"], TX);
  });

  it("쓰기 권한이 없으면 ForbiddenError, 대상도 읽지 않는다", async () => {
    const d = deps({ can: false });
    await expect(resetPersonPassword(viewer, "target-1", d)).rejects.toBeInstanceOf(ForbiddenError);
    expect(d.loadTarget).not.toHaveBeenCalled();
    expect(d.resetPassword).not.toHaveBeenCalled();
  });

  it("자기 자신은 ForbiddenError(자기 제외)", async () => {
    const d = deps({ target: { id: "admin-1", email: "admin@example.test", roleId: "role-sysadmin", archivedAt: null, resignationDate: null } });
    await expect(resetPersonPassword(viewer, "admin-1", d)).rejects.toBeInstanceOf(ForbiddenError);
    expect(d.resetPassword).not.toHaveBeenCalled();
  });

  it("대상이 없으면 UserNotFoundError", async () => {
    const d = deps({ target: null });
    await expect(resetPersonPassword(viewer, "missing", d)).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it("상한 밖이면 거부가 그대로 나가고 초기화하지 않는다", async () => {
    const d = deps();
    d.assertCanGrantRoles.mockImplementation(() => Promise.reject(new ForbiddenError("계급 지정 권한 없음 · 시스템 관리자")));
    await expect(resetPersonPassword(viewer, "target-1", d)).rejects.toThrow("계급 지정 권한 없음");
    expect(d.resetPassword).not.toHaveBeenCalled();
  });
});

// 07-17 독립 검토 L2: 보관된 사람은 화면이 `비밀번호 초기화`를 그리지 않는다 — 서버도 거부(비밀번호 · 기록 오염 방지).
describe("resetPersonPassword — 보관된 사람 거부(07-17 L2)", () => {
  it("보관된 대상이면 ForbiddenError, 초기화하지 않는다", async () => {
    const d = deps();
    d.loadTarget.mockResolvedValue({ id: "target-1", email: "kim@example.test", roleId: "role-employee", archivedAt: new Date("2026-10-01T00:00:00Z"), resignationDate: null });
    await expect(resetPersonPassword(viewer, "target-1", d)).rejects.toBeInstanceOf(ForbiddenError);
    expect(d.resetPassword).not.toHaveBeenCalled();
  });
});

// 사용자 결정(2026-10-23 01:12 KST): 퇴직한 사람의 비밀번호 초기화를 막는다 — 260907 409 「퇴사한 사원의 비밀번호는 정할 수
// 없습니다」와 같은 판정. 「퇴직」은 `isRetiredOn`(퇴직일 < 오늘 KST, 당일까지 재직) — 잠금 풀기 거부(D-728)와 같은 경계.
describe("resetPersonPassword — 퇴직한 사람 거부(사용자 결정 2026-10-23)", () => {
  const now = () => new Date("2026-10-22T03:00:00Z"); // KST 12:00 · 오늘 2026-10-22
  const retiredTarget = (resignationDate: string | null) => ({
    id: "target-1",
    email: "kim@example.test",
    roleId: "role-employee",
    archivedAt: null,
    resignationDate,
  });

  it("퇴직일이 지난 대상이면 ForbiddenError, 초기화하지 않는다", async () => {
    const d = { ...deps(), now };
    d.loadTarget.mockResolvedValue(retiredTarget("2026-10-21"));
    await expect(resetPersonPassword(viewer, "target-1", d)).rejects.toThrow("퇴직한 사람 · 비밀번호 초기화 없음");
    expect(d.resetPassword).not.toHaveBeenCalled();
  });

  it("퇴직일이 오늘인 대상은 초기화된다(경계 — 당일까지 재직)", async () => {
    const d = { ...deps(), now };
    d.loadTarget.mockResolvedValue(retiredTarget("2026-10-22"));
    await expect(resetPersonPassword(viewer, "target-1", d)).resolves.toEqual({ tempPassword: "Tmp-7Q2x-9kLm" });
    expect(d.resetPassword).toHaveBeenCalledTimes(1);
  });
});
