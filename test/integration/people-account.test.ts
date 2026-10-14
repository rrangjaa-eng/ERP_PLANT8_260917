import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, users } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { ForbiddenError } from "@/domain/people";
import { getPersonPayoutAccount, updatePersonPayoutAccount } from "@/domain/people/account";
import { AccountFieldsError } from "@/domain/vendors/account-fields";

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
});
