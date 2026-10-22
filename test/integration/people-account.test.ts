import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, users } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { ForbiddenError } from "@/domain/people";
import { getPersonPayoutAccount, revealPersonAccountNumber, updatePersonPayoutAccount } from "@/domain/people/account";
import { AccountFieldsError } from "@/domain/vendors/account-fields";
import { RoleGrantForbiddenError } from "@/domain/permissions/grant-ceiling";
import { makeAdmin, makeDelegatedRole } from "./admin-cap-fixtures";
import { makePerson } from "./approvals-fixtures";

async function makeEmployee(): Promise<string> {
  const id = `payout-${randomUUID()}`;
  await db.insert(users).values({ id, name: "김직원", email: `${randomUUID()}@test.local`, roleId: DEFAULT_ROLE_ID });
  return id;
}

async function readRow(userId: string) {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return row;
}

async function logsFor(userId: string) {
  const rows = await db.select().from(actionLog).where(eq(actionLog.entityId, userId));
  return rows.filter((row) => row.entity === "user");
}

// 게이트 = expenses.payments 쓰기 ∧ admin.people 보기. 한쪽만 참인 계정을 `can` 주입으로 만든다.
function canOnly(allowed: { payments: boolean; people: boolean }) {
  return (_viewer: unknown, menu: string, action: string) =>
    Promise.resolve(
      menu === "expenses.payments" && action === "write" ? allowed.payments : menu === "admin.people" && action === "view" ? allowed.people : false,
    );
}

describe("직원 지급 계좌(06.5 D-6505 · D-6506)", () => {
  it("게이트 권한자가 저장하면 암호문 · 끝 4자리로 저장되고, 읽기는 마스킹 재료만 · 기록에 값이 없다", async () => {
    const userId = await makeEmployee();
    const plaintext = "110-123-456789";
    await updatePersonPayoutAccount(SYSTEM_VIEWER, userId, {
      accountBank: "신한",
      accountHolder: "김직원",
      accountNumber: plaintext,
    });

    const row = await readRow(userId);
    expect(row?.accountNumberEncrypted).not.toBeNull();
    expect(row?.accountNumberEncrypted).not.toContain(plaintext);
    expect(row?.accountNumberEncrypted).not.toContain("456789");
    expect(row?.accountNumberLast4).toBe("6789");

    expect(await getPersonPayoutAccount(SYSTEM_VIEWER, userId)).toEqual({
      bank: "신한",
      holder: "김직원",
      last4: "6789",
      hasNumber: true,
    });

    const logs = await logsFor(userId);
    expect(logs.map((log) => log.actionType)).toEqual(["document_update"]);
    const detail = JSON.stringify(logs[0]?.detail);
    expect(detail).toBe(JSON.stringify({ field: "payout_account" }));
    expect(detail).not.toMatch(/\d{2,}/);
  });

  it.each([
    { payments: false, people: true },
    { payments: true, people: false },
  ])("권한 한쪽만(%o) — 읽기는 null, 저장은 ForbiddenError이고 DB 그대로", async (allowed) => {
    const userId = await makeEmployee();
    const can = canOnly(allowed);
    expect(await getPersonPayoutAccount(SYSTEM_VIEWER, userId, { can })).toBeNull();
    await expect(
      updatePersonPayoutAccount(SYSTEM_VIEWER, userId, { accountBank: "신한", accountHolder: "김직원", accountNumber: "110-1" }, { can }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const row = await readRow(userId);
    expect(row?.accountBank).toBeNull();
    expect(row?.accountNumberEncrypted).toBeNull();
  });

  // 리뷰 P2-1: 게이트에 person.value가 AND — 꺼진 계정은 읽기 · 저장 · 해제가 한 게이트로 막힌다(패널이 빈 은행 · 예금주로 지우는 경로 없음).
  it("person.value 꺼진 게이트 보유자 — 읽기 null, 저장 ForbiddenError(DB 그대로), 해제 ForbiddenError(기록 없음)", async () => {
    const userId = await makeEmployee();
    await updatePersonPayoutAccount(SYSTEM_VIEWER, userId, { accountBank: "신한", accountHolder: "김직원", accountNumber: "110-123-456789" });
    const visible = (_viewer: unknown, item: string) => Promise.resolve(item !== "person.value");
    expect(await getPersonPayoutAccount(SYSTEM_VIEWER, userId, { visible })).toBeNull();
    await expect(
      updatePersonPayoutAccount(SYSTEM_VIEWER, userId, { accountBank: "", accountHolder: "", accountNumber: "220-1" }, { visible }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const row = await readRow(userId);
    expect(row?.accountBank).toBe("신한");
    expect(row?.accountHolder).toBe("김직원");
    expect(row?.accountNumberLast4).toBe("6789");
    await expect(revealPersonAccountNumber(SYSTEM_VIEWER, userId, { visible })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await logsFor(userId)).filter((log) => log.actionType === "mask_reveal")).toEqual([]);
  });

  // 리뷰 P2-2: 계좌 값과 document_update 기록은 같은 tx — 기록이 실패하면 계좌도 바뀌지 않는다.
  it("저장 기록이 실패하면 계좌도 그대로다(값과 기록이 같은 tx)", async () => {
    const userId = await makeEmployee();
    const appendActionLog = () => Promise.reject(new Error("기록 실패"));
    await expect(
      updatePersonPayoutAccount(
        SYSTEM_VIEWER,
        userId,
        { accountBank: "신한", accountHolder: "김직원", accountNumber: "110-123-456789" },
        { appendActionLog },
      ),
    ).rejects.toThrow("기록 실패");
    const row = await readRow(userId);
    expect(row?.accountBank).toBeNull();
    expect(row?.accountHolder).toBeNull();
    expect(row?.accountNumberEncrypted).toBeNull();
    expect(await logsFor(userId)).toEqual([]);
  });

  it("은행 + 번호 + 빈 예금주 → AccountFieldsError(예금주 칸)이고 DB 그대로", async () => {
    const userId = await makeEmployee();
    let caught: unknown;
    try {
      await updatePersonPayoutAccount(SYSTEM_VIEWER, userId, { accountBank: "신한", accountHolder: "", accountNumber: "110-123-456789" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AccountFieldsError);
    expect((caught as AccountFieldsError).fieldErrors.accountHolder).toBe("예금주 없음 · 예금주 적기");
    const row = await readRow(userId);
    expect(row?.accountBank).toBeNull();
    expect(row?.accountNumberEncrypted).toBeNull();
    expect(await logsFor(userId)).toEqual([]);
  });

  it("번호 보기 — 게이트 + 해제 항목이면 평문을 돌려주고 mask_reveal(entity user) 한 행이 남는다", async () => {
    const userId = await makeEmployee();
    await updatePersonPayoutAccount(SYSTEM_VIEWER, userId, { accountBank: "신한", accountHolder: "김직원", accountNumber: "110-123-456789" });
    expect(await revealPersonAccountNumber(SYSTEM_VIEWER, userId)).toBe("110-123-456789");
    const reveals = (await logsFor(userId)).filter((log) => log.actionType === "mask_reveal");
    expect(reveals).toHaveLength(1);
    expect(JSON.stringify(reveals[0]?.detail)).not.toContain("456789");
  });

  it("번호 보기 — 기록이 실패하면 평문을 돌려주지 않는다(기록 먼저)", async () => {
    const userId = await makeEmployee();
    await updatePersonPayoutAccount(SYSTEM_VIEWER, userId, { accountBank: "신한", accountHolder: "김직원", accountNumber: "110-123-456789" });
    const recordAction = () => Promise.reject(new Error("기록 실패"));
    await expect(revealPersonAccountNumber(SYSTEM_VIEWER, userId, { recordAction })).rejects.toThrow("기록 실패");
  });

  it("번호 보기 — 게이트 참 + 해제 항목 거짓, 게이트 거짓 + 해제 항목 참은 둘 다 ForbiddenError", async () => {
    const userId = await makeEmployee();
    await updatePersonPayoutAccount(SYSTEM_VIEWER, userId, { accountBank: "신한", accountHolder: "김직원", accountNumber: "110-123-456789" });
    const hidden = () => Promise.resolve(false);
    const shown = () => Promise.resolve(true);
    await expect(revealPersonAccountNumber(SYSTEM_VIEWER, userId, { visible: hidden })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      revealPersonAccountNumber(SYSTEM_VIEWER, userId, { visible: shown, can: canOnly({ payments: false, people: true }) }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect((await logsFor(userId)).filter((log) => log.actionType === "mask_reveal")).toEqual([]);
  });

  it("번호 보기 — 번호 없는 사람은 빈 문자열이고 기록이 없다", async () => {
    const userId = await makeEmployee();
    expect(await revealPersonAccountNumber(SYSTEM_VIEWER, userId)).toBe("");
    expect(await logsFor(userId)).toEqual([]);
  });

  it("지우기(null) — 암호문 · 끝 4자리만 null, 은행 · 예금주는 남는다", async () => {
    const userId = await makeEmployee();
    await updatePersonPayoutAccount(SYSTEM_VIEWER, userId, { accountBank: "신한", accountHolder: "김직원", accountNumber: "110-123-456789" });
    await updatePersonPayoutAccount(SYSTEM_VIEWER, userId, { accountBank: "신한", accountHolder: "김직원", accountNumber: null });
    const row = await readRow(userId);
    expect(row?.accountNumberEncrypted).toBeNull();
    expect(row?.accountNumberLast4).toBeNull();
    expect(row?.accountBank).toBe("신한");
    expect(row?.accountHolder).toBe("김직원");
  });

  it("keep(번호 생략) + 예금주 비우기 — 은행 · 저장된 번호가 있으면 AccountFieldsError", async () => {
    const userId = await makeEmployee();
    await updatePersonPayoutAccount(SYSTEM_VIEWER, userId, { accountBank: "신한", accountHolder: "김직원", accountNumber: "110-123-456789" });
    await expect(updatePersonPayoutAccount(SYSTEM_VIEWER, userId, { accountBank: "신한", accountHolder: "" })).rejects.toBeInstanceOf(
      AccountFieldsError,
    );
    expect((await readRow(userId))?.accountHolder).toBe("김직원");
  });

  it("EP3-B14 — 저장이 users_account_holder_required_check(23514)에 걸리면 예금주 칸 오류로 바꾼다", async () => {
    const userId = await makeEmployee();
    const checkViolation = Object.assign(new Error("check"), { code: "23514", constraint: "users_account_holder_required_check" });
    const updateUserPayoutAccount = () => Promise.reject(checkViolation);
    let caught: unknown;
    try {
      await updatePersonPayoutAccount(
        SYSTEM_VIEWER,
        userId,
        { accountBank: "신한", accountHolder: "김직원", accountNumber: "110-123-456789" },
        { updateUserPayoutAccount },
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AccountFieldsError);
    expect((caught as AccountFieldsError).fieldErrors).toEqual({ accountHolder: "예금주 없음 · 예금주 적기" });
  });

  it("은행 코드 · 예금주 길이 — 칸을 넣은 저장에서 같은 문구로 거절", async () => {
    const userId = await makeEmployee();
    let caught: unknown;
    try {
      await updatePersonPayoutAccount(SYSTEM_VIEWER, userId, { accountBank: "없는은행", accountHolder: "가나다라마바사아자차카" });
    } catch (error) {
      caught = error;
    }
    expect((caught as AccountFieldsError).fieldErrors).toEqual({
      accountBank: "은행 코드 없음 · 은행 이름 고치기",
      accountHolder: "예금주 길이 초과 · 예금주 줄이기",
    });
  });
});


// 사용자 결정(2026-10-23 01:12 KST): 지급 계좌 변경도 대상 계급 상한(assertCanGrantRoles)을 본다 — 지급 게이트(expenses.payments
// 쓰기 · admin.people 보기 · person.value)를 가진 지급 담당이라도 상한 밖(시스템 관리자)의 지급처는 바꾸지 못한다(07-17 L5 · P3-4).
describe("지급 계좌 변경의 대상 상한(사용자 결정 2026-10-23)", () => {
  // 지급 담당 계급 = PM 칸 · 범위 복사 + 지급 게이트 셋.
  async function paymentsStaff() {
    const roleId = await makeDelegatedRole({
      copyFrom: [DEFAULT_ROLE_ID],
      menus: [
        { menu: "expenses.payments", action: "write" },
        { menu: "admin.people", action: "view" },
      ],
      infoItems: ["person.value"],
    });
    return makePerson("지급 담당", roleId, null);
  }

  it("지급 담당이 상한 밖(시스템 관리자) 대상의 계좌를 바꾸면 거부 · 계좌 · 기록 그대로", async () => {
    const staff = await paymentsStaff();
    const admin = await makeAdmin("관리자 A");
    const outcome = await updatePersonPayoutAccount(staff, admin.id, {
      accountBank: "신한",
      accountHolder: "관리자",
      accountNumber: "110-123-456789",
    }).then(
      () => new Error("거부되어야 하는데 성공함"),
      (caught: unknown) => caught,
    );
    expect(outcome).toBeInstanceOf(RoleGrantForbiddenError);
    const row = await readRow(admin.id);
    expect(row?.accountBank).toBeNull();
    expect(row?.accountNumberEncrypted).toBeNull();
    expect(await logsFor(admin.id)).toEqual([]);
  });

  it("지급 담당이 상한 안(PM) 대상의 계좌를 바꾸면 성공", async () => {
    const staff = await paymentsStaff();
    const target = await makePerson("대상 P", DEFAULT_ROLE_ID, null);
    await updatePersonPayoutAccount(staff, target.id, { accountBank: "신한", accountHolder: "대상", accountNumber: "110-123-456789" });
    const row = await readRow(target.id);
    expect(row?.accountBank).toBe("신한");
    expect(row?.accountNumberLast4).toBe("6789");
  });
});
