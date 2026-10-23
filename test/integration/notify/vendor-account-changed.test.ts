import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { notificationLog, notificationRules, users, vendorAccountChanges } from "@/db/schema";
import { CONDITION_KINDS, type ConditionKind } from "@/domain/notify/condition-kinds";
import { vendorAccountChangedKind } from "@/domain/notify/kinds/vendor-account-changed";
import { runTick } from "@/domain/notify/tick";
import { createAccount } from "@/domain/auth/accounts";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertPermission } from "@/repositories/permissions";
import { insertRole } from "@/repositories/roles";
import { insertVendor, setVendorArchived } from "@/repositories/vendors";

// 07-23 Task 3(N14 · D-716 · SC-07): 조건 종류 `계좌 바뀜` — 시드 끔 · 받는 사람 경영관리(지급 처리 쓰기 활성 사용자) · 사건 종류(ctx.since 창 —
// 고정 14일 하한 또는 규칙 켠 시각) · 사건 키 `{거래처}:{KST 날짜}`라 거래처마다 하루 한 번. 문장 `계좌 바뀜 · {거래처}`(숫자 · 금액 없음).

const KIND = "vendor-account-changed";

function at(date: string): () => Date {
  return () => new Date(`${date}T09:00:00+09:00`);
}

async function tick(date: string, kinds: readonly ConditionKind[] = [vendorAccountChangedKind]) {
  await runTick({ conditionKinds: kinds, now: at(date), emailSender: null });
}

async function rowsOf(user: Viewer) {
  const rows = await db.select().from(notificationLog).where(eq(notificationLog.recipientId, user.id)).orderBy(notificationLog.id);
  return rows.filter((row) => row.conditionKind === KIND);
}

async function enable(enabledAt = "2026-10-01T00:00:00+09:00") {
  await db
    .insert(notificationRules)
    .values({ kind: KIND, enabled: true, enabledAt: new Date(enabledAt) })
    .onConflictDoUpdate({ target: notificationRules.kind, set: { enabled: true, enabledAt: new Date(enabledAt) } });
}

async function disable() {
  await db.delete(notificationRules).where(eq(notificationRules.kind, KIND));
}

// 지급 처리 쓰기(경영관리) 또는 지출결의 쓰기만 가진 계급의 활성 사용자.
async function makeUser(payments: boolean, name = "경영"): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `계좌-${randomUUID().slice(0, 8)}`, workScope: "company", viewScope: "company" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: payments ? "expenses.payments" : "expenses", action: "write", allowed: true });
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `va-${randomUUID()}@example.test`, name, roleId: role.id });
  return { id: userId, roleId: role.id };
}

async function makeVendor(name = `계좌거래처-${randomUUID().slice(0, 8)}`): Promise<{ id: string; name: string }> {
  const row = await insertVendor(SYSTEM_VIEWER, { name, normalizedName: name, kind: "supplier" });
  return { id: row.id, name };
}

// 계좌 변경 기록 한 줄(07-23 Task 1이 거래처 저장 트랜잭션에서 남기는 줄) — 시각을 정해 넣는다.
async function change(vendorId: string, by: Viewer, changedAt: string) {
  await db.insert(vendorAccountChanges).values({ vendorId, beforeLast4: "1111", afterLast4: "2222", changedBy: by.id, changedAt: new Date(changedAt), source: "admin" });
}

describe("등록부 (SC-07 순서 · R13)", () => {
  it("SC-07 순서 목록에서 등록된 것만 남긴 목록과 같고 계좌 바뀜은 견적 재촉 바로 뒤 · 임자 없는 증빙 바로 앞", () => {
    const sc07 = [
      "project-end-no-expense",
      "pay-week-alert",
      "approval-waiting",
      "paid-no-evidence",
      "prepaid-evidence",
      "proxy-registered",
      "expense-result",
      "pre-cutoff-unapproved",
      "settle-nudge",
      "rejected-idle",
      "quote-nudge",
      "vendor-account-changed",
      "orphan-evidence",
      "collection-overdue",
    ];
    const names = CONDITION_KINDS.map((kind) => kind.kind);
    expect(names).toEqual(sc07.filter((name) => names.includes(name)));
    const index = names.indexOf(KIND);
    expect(names[index - 1]).toBe("quote-nudge");
    expect(names[index + 1]).toBe("orphan-evidence");
    expect(names.at(-1)).toBe("collection-overdue");
  });

  it("기본 끔 · 메일 켬 · 달력일 · 받는 사람 경영관리 · 일수 칸 · 사다리 · 받는 사람 정보 항목 없음", () => {
    expect(vendorAccountChangedKind).toMatchObject({ label: "계좌 바뀜", dateUnit: "calendar", defaults: { enabled: false, emailEnabled: true }, defaultRecipientLabel: "경영관리" });
    expect(vendorAccountChangedKind.defaults.days).toBeUndefined();
    expect(vendorAccountChangedKind.daysRange).toBeUndefined();
    expect(vendorAccountChangedKind.ladder).toBeFalsy();
    expect(vendorAccountChangedKind.recipientInfoItem).toBeUndefined();
  });
});

describe("계좌 바뀜 알림", () => {
  it("규칙 없으면(끔) 0", async () => {
    await disable();
    const manager = await makeUser(true);
    const vendor = await makeVendor();
    await change(vendor.id, manager, "2026-10-27T10:00:00+09:00");
    await tick("2026-10-28");
    expect(await rowsOf(manager)).toHaveLength(0);
  });

  it("켜면 경영관리에게 `계좌 바뀜 · {거래처}` 한 행 — 같은 거래처 같은 날 두 번은 한 행 · 다음 tick에 같은 변경은 새 행 없음", async () => {
    await enable();
    const manager = await makeUser(true);
    const vendor = await makeVendor();
    await change(vendor.id, manager, "2026-10-27T10:00:00+09:00");
    await change(vendor.id, manager, "2026-10-27T15:00:00+09:00");
    await tick("2026-10-28");
    const rows = await rowsOf(manager);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entity: "vendor", entityId: `${vendor.id}:2026-10-27`, message: `계좌 바뀜 · ${vendor.name}` });
    // 계좌 숫자(뒤 4자리) · 금액 없이 거래처 이름만.
    expect(rows[0]?.message).toBe(`계좌 바뀜 · ${vendor.name}`);
    await tick("2026-10-29");
    expect(await rowsOf(manager)).toHaveLength(1);
  });

  it("다음 날 다시 바뀌면 새 행(KST 날짜 — 자정 넘김)", async () => {
    await enable();
    const manager = await makeUser(true);
    const vendor = await makeVendor();
    await change(vendor.id, manager, "2026-10-27T23:30:00+09:00");
    await tick("2026-10-28");
    await change(vendor.id, manager, "2026-10-28T00:30:00+09:00");
    await tick("2026-10-29");
    const rows = await rowsOf(manager);
    expect(rows.map((row) => row.entityId)).toEqual([`${vendor.id}:2026-10-27`, `${vendor.id}:2026-10-28`]);
  });

  it("규칙 켜기 전 변경 · 14일 창 밖 변경 · 보관 거래처는 0", async () => {
    await enable("2026-10-27T12:00:00+09:00");
    const manager = await makeUser(true);
    const before = await makeVendor();
    await change(before.id, manager, "2026-10-27T10:00:00+09:00");
    await tick("2026-10-28");
    expect(await rowsOf(manager)).toHaveLength(0);
    await db.delete(vendorAccountChanges).where(eq(vendorAccountChanges.vendorId, before.id));
    await enable("2026-10-01T00:00:00+09:00");
    const old = await makeVendor();
    await change(old.id, manager, "2026-10-05T10:00:00+09:00");
    const archived = await makeVendor();
    await change(archived.id, manager, "2026-10-27T10:00:00+09:00");
    await setVendorArchived(SYSTEM_VIEWER, archived.id, true);
    await tick("2026-10-28");
    expect(await rowsOf(manager)).toHaveLength(0);
  });

  it("퇴직한 경영관리 · 지급 권한 없는 사람은 0행", async () => {
    await enable();
    const goner = await makeUser(true, "퇴직");
    await db.update(users).set({ resignationDate: "2026-10-01" }).where(eq(users.id, goner.id));
    const staff = await makeUser(false, "직원");
    const manager = await makeUser(true);
    const vendor = await makeVendor();
    await change(vendor.id, manager, "2026-10-27T10:00:00+09:00");
    await tick("2026-10-28");
    expect(await rowsOf(goner)).toHaveLength(0);
    expect(await rowsOf(staff)).toHaveLength(0);
    expect(await rowsOf(manager)).toHaveLength(1);
  });
});
