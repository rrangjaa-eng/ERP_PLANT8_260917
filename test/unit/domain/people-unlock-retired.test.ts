import { describe, expect, it, vi } from "vitest";
import { ForbiddenError, isRetiredOn, unlockPerson, UserNotFoundError } from "@/domain/people";
import type { Viewer } from "@/domain/viewer";
import type { DbOrTx } from "@/repositories/document-counters";

// 07-17 R11(eng-review F-06) · D-728: 퇴직자 잠금 풀기 거부는 domain `unlockPerson` 안에 있다(액션 층이 아님).
// 「퇴직」은 `isRetiredOn` 하나 — 07-09 D-743(퇴직일 당일까지 로그인 허용, 다음 날부터 막음)과 같은 날 비교.
const viewer: Viewer = { id: "admin-1", roleId: "role-sysadmin" };
const TODAY = "2026-10-22";
const now = () => new Date("2026-10-22T03:00:00Z"); // KST 12:00

// 사람 키 잠금(07-17 독립 검토 L1)은 통합 시험(admin-cap-person-lock)이 본다 — 여기서는 tx 표지만 넘긴다.
const TX = {} as DbOrTx;
const withPersonLock = <T>(_viewer: Viewer, _id: string, fn: (tx: DbOrTx) => Promise<T>) => fn(TX);

function target(resignationDate: string | null) {
  return { id: "target-1", email: "kim@example.test", roleId: "role-employee", resignationDate, archivedAt: null };
}

function deps(resignationDate: string | null) {
  return {
    can: vi.fn(() => Promise.resolve(true)),
    withPersonLock,
    loadTarget: vi.fn(() => Promise.resolve(target(resignationDate))),
    assertCanGrantRoles: vi.fn(() => Promise.resolve()),
    unlockAccount: vi.fn(() => Promise.resolve({ resolved: 3 })),
    now,
  };
}

describe("isRetiredOn — 퇴직 술어(D-743과 같은 경계)", () => {
  it("퇴직일 없음 → 재직", () => {
    expect(isRetiredOn(null, TODAY)).toBe(false);
  });
  it("퇴직일 = 오늘 → 아직 재직(당일까지 로그인 허용)", () => {
    expect(isRetiredOn(TODAY, TODAY)).toBe(false);
  });
  it("퇴직일 = 어제 → 퇴직", () => {
    expect(isRetiredOn("2026-10-21", TODAY)).toBe(true);
  });
  it("퇴직일 = 내일(예정) → 재직", () => {
    expect(isRetiredOn("2026-10-23", TODAY)).toBe(false);
  });
});

describe("unlockPerson — 퇴직자 거부(D-728 · R11)", () => {
  it("퇴직 대상이면 ForbiddenError, unlockAccount를 부르지 않는다", async () => {
    const d = deps("2026-10-21");
    await expect(unlockPerson(viewer, "target-1", d)).rejects.toBeInstanceOf(ForbiddenError);
    expect(d.unlockAccount).not.toHaveBeenCalled();
  });

  it("퇴직일이 오늘인 대상은 풀린다(경계 — 07-09 D-743과 같은 날)", async () => {
    const d = deps(TODAY);
    await unlockPerson(viewer, "target-1", d);
    expect(d.unlockAccount).toHaveBeenCalledTimes(1);
    expect(d.unlockAccount).toHaveBeenCalledWith(viewer, "kim@example.test");
  });

  it("재직 대상은 상한 판정 뒤 unlockAccount 한 번", async () => {
    const d = deps(null);
    await unlockPerson(viewer, "target-1", d);
    expect(d.assertCanGrantRoles).toHaveBeenCalledWith(viewer, ["role-employee"], TX);
    expect(d.unlockAccount).toHaveBeenCalledTimes(1);
  });

  it("admin.people 쓰기 없으면 ForbiddenError, 대상을 읽지도 풀지도 않는다", async () => {
    const d = deps(null);
    d.can.mockResolvedValue(false);
    await expect(unlockPerson(viewer, "target-1", d)).rejects.toBeInstanceOf(ForbiddenError);
    expect(d.loadTarget).not.toHaveBeenCalled();
    expect(d.unlockAccount).not.toHaveBeenCalled();
  });

  it("상한 밖 대상이면 상한 판정 오류 그대로, unlockAccount를 부르지 않는다", async () => {
    const d = deps(null);
    const ceiling = new ForbiddenError("계급 지정 권한 없음 · 시스템 관리자");
    d.assertCanGrantRoles.mockRejectedValue(ceiling);
    await expect(unlockPerson(viewer, "target-1", d)).rejects.toBe(ceiling);
    expect(d.unlockAccount).not.toHaveBeenCalled();
  });

  it("대상 없음 → UserNotFoundError", async () => {
    const d = deps(null);
    d.loadTarget.mockResolvedValue(null as never);
    await expect(unlockPerson(viewer, "missing", d)).rejects.toBeInstanceOf(UserNotFoundError);
    expect(d.unlockAccount).not.toHaveBeenCalled();
  });
});

// 07-17 독립 검토 L2: 보관된 사람은 화면이 `잠금 풀기`를 그리지 않는다 — 서버도 같은 판정(page.tsx 주석 「서버 unlockPerson이 같은 판정」).
describe("unlockPerson — 보관된 사람 거부(07-17 L2)", () => {
  it("보관된 대상이면 ForbiddenError, unlockAccount를 부르지 않는다", async () => {
    const d = deps(null);
    d.loadTarget.mockResolvedValue({ ...target(null), archivedAt: new Date("2026-10-01T00:00:00Z") } as never);
    await expect(unlockPerson(viewer, "target-1", d)).rejects.toBeInstanceOf(ForbiddenError);
    expect(d.unlockAccount).not.toHaveBeenCalled();
  });
});
