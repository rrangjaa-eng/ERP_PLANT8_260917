import { describe, expect, it, vi } from "vitest";
import { UserFacingError } from "@/lib/actions/user-facing-error";

// 06.4 /review: 보관함 복원 액션은 원인을 토스트에 실을 복원 거부(공휴일 · 거래처 · 사람 쓰기 없음 · 없는 사람 · 권한 상한 · 자리)를
// 루트 검증 오류(`_errors`)로 바꾸고, 그 밖의 오류는 서버 오류로 둔다. 도메인 모듈은 db를 끌고 오므로 오류 클래스만 같은 이름으로 목.
const errors = vi.hoisted(() => ({ restoreError: { current: null as Error | null } }));

vi.mock("@/lib/viewer", () => ({ getSession: () => Promise.resolve({ viewer: { id: "viewer" }, user: { id: "viewer" } }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/app/(app)/admin/archive/actions.registry", () => ({}));
vi.mock("@/domain/archive", async () => {
  const { UserFacingError: Facing } = await import("@/lib/actions/user-facing-error");
  return {
    VendorBusinessNoTakenError: class VendorBusinessNoTakenError extends Facing {},
    CorpCardLast4TakenError: class CorpCardLast4TakenError extends Facing {},
    restore: () => (errors.restoreError.current ? Promise.reject(errors.restoreError.current) : Promise.resolve({ restored: true })),
  };
});
vi.mock("@/domain/holidays/admin", async () => {
  const { UserFacingError: Facing } = await import("@/lib/actions/user-facing-error");
  return { HolidayNotRestorableError: class HolidayNotRestorableError extends Facing {} };
});
vi.mock("@/domain/people/restore", async () => {
  const { UserFacingError: Facing } = await import("@/lib/actions/user-facing-error");
  return {
    PersonRestoreForbiddenError: class PersonRestoreForbiddenError extends Facing {},
    PersonNotRestorableError: class PersonNotRestorableError extends Facing {},
  };
});
vi.mock("@/domain/permissions/grant-ceiling", async () => {
  const { UserFacingError: Facing } = await import("@/lib/actions/user-facing-error");
  return { RoleGrantForbiddenError: class RoleGrantForbiddenError extends Facing {} };
});
vi.mock("@/domain/people/seat-rules", async () => {
  const { UserFacingError: Facing } = await import("@/lib/actions/user-facing-error");
  return { SeatTakenError: class SeatTakenError extends Facing {} };
});

const { restoreArchivedAction } = await import("@/app/(app)/admin/archive/actions");
const { VendorBusinessNoTakenError, CorpCardLast4TakenError } = await import("@/domain/archive");
const { HolidayNotRestorableError } = await import("@/domain/holidays/admin");
const { PersonRestoreForbiddenError, PersonNotRestorableError } = await import("@/domain/people/restore");
const { RoleGrantForbiddenError } = await import("@/domain/permissions/grant-ceiling");
const { SeatTakenError } = await import("@/domain/people/seat-rules");

const INPUT = { entity: "user", id: "u-1" };

describe("보관함 복원 액션 — 거부 원인 매핑", () => {
  it.each([
    ["공휴일", new HolidayNotRestorableError("지난 공휴일 · 복원 불가")],
    ["거래처", new VendorBusinessNoTakenError("같은 사업자번호 거래처 있음 · 복원 불가")],
    ["법인카드", new CorpCardLast4TakenError("같은 발급사와 뒤 4자리 카드 있음 · 복원 불가")],
    ["사람 쓰기 없음", new PersonRestoreForbiddenError("사람 복원 권한 없음 · 시스템 관리자 · 복원 불가")],
    ["없는 사람", new PersonNotRestorableError("없는 사람 · 복원 불가")],
    ["권한 상한", new RoleGrantForbiddenError("계급 지정 권한 없음 · 시스템 관리자 · 복원 불가")],
    ["자리", new SeatTakenError("팀장 있음 · 가나 · 복원 불가")],
  ])("%s 거부는 문구를 루트 검증 오류로 돌려준다", async (_label, error) => {
    errors.restoreError.current = error;
    const result = await restoreArchivedAction(INPUT);
    expect(result?.validationErrors).toEqual({ _errors: [error.message] });
    expect(result?.serverError).toBeUndefined();
  });

  it("매핑 밖 오류는 루트 검증 오류가 아니라 서버 오류다", async () => {
    errors.restoreError.current = new UserFacingError("보관함 쓰기 권한 없음");
    const result = await restoreArchivedAction(INPUT);
    expect(result?.validationErrors).toBeUndefined();
    expect(result?.serverError).toBe("보관함 쓰기 권한 없음");
  });

  it("복원되면 { restored: true }", async () => {
    errors.restoreError.current = null;
    const result = await restoreArchivedAction(INPUT);
    expect(result?.data).toEqual({ restored: true });
  });
});
