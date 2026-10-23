import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { notificationLog, notificationRules, projects, revenueEntries, teams, users } from "@/db/schema";
import { CONDITION_KINDS, type ConditionKind } from "@/domain/notify/condition-kinds";
import { collectionOverdueKind, createCollectionOverdueKind } from "@/domain/notify/kinds/collection-overdue";
import { notificationHref } from "@/domain/notify/href";
import { runTick } from "@/domain/notify/tick";
import { createAccount } from "@/domain/auth/accounts";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createProject } from "@/domain/projects";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { log } from "@/lib/log";
import { findVisibility, upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertRole } from "@/repositories/roles";
import { insertVendor } from "@/repositories/vendors";

// 07-22 Task 3(N22 · D-716 · D-748 · G-61 · AQ-33): 조건 종류 `수금 지연` — 시드 끔 · 담당 PM · 사건 키 `{프로젝트}:{예정일}` 한 번 ·
// 받는 사람 계급이 revenue.paid_amount를 볼 때만(tick 거르개). 판정은 배지와 같은 collectionOverdueByProject 한 벌.
// 발행 08-28(금) + 60일 = 10-27(화) 예정 → 10-28(수)부터 지연. 10-28 · 10-29 · 11-02는 영업일.

const KIND = "collection-overdue";

function at(date: string): () => Date {
  return () => new Date(`${date}T09:00:00+09:00`);
}

async function tick(date: string, kinds: readonly ConditionKind[] = [collectionOverdueKind], extra?: Parameters<typeof runTick>[0]) {
  await runTick({ conditionKinds: kinds, now: at(date), emailSender: null, ...extra });
}

async function rowsOf(user: Viewer) {
  const rows = await db.select().from(notificationLog).where(eq(notificationLog.recipientId, user.id)).orderBy(notificationLog.id);
  return rows.filter((row) => row.conditionKind === KIND);
}

async function enable(extraRoleIds: string[] = []) {
  await db
    .insert(notificationRules)
    .values({ kind: KIND, enabled: true, extraRoleIds, enabledAt: new Date("2026-09-01T00:00:00+09:00") })
    .onConflictDoUpdate({ target: notificationRules.kind, set: { enabled: true, extraRoleIds } });
}

// 입금 항목을 보는 계급(paid = true) 또는 못 보는 계급.
async function makeRole(paid: boolean): Promise<string> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `수금-${randomUUID().slice(0, 8)}`, workScope: "company", viewScope: "company" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
  if (paid) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "revenue.paid_amount", visible: true });
  return role.id;
}

async function makeUser(roleId: string, name = "수금 PM"): Promise<Viewer> {
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `co-${randomUUID()}@example.test`, name, roleId });
  return { id: userId, roleId };
}

async function makeProject(pm: Viewer, name = `수금-${randomUUID().slice(0, 8)}`): Promise<{ id: string; name: string }> {
  const client = await insertVendor(SYSTEM_VIEWER, { name: `거래처-${randomUUID()}`, normalizedName: `거래처-${randomUUID()}` });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  const project = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: team.id, pmUserId: pm.id, name });
  return { id: project.id, name };
}

async function entry(projectId: string, kind: "issue" | "payment", entryDate: string, amount: number) {
  await db.insert(revenueEntries).values({ projectId, kind, entryDate, amountCurrency: "KRW", amountFxRate: "1.0000", amountAmountKrw: amount });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("등록부 (SC-07 순서 · AQ-33 · R13)", () => {
  it("SC-07 순서 목록에서 등록된 것만 남긴 목록과 같고 수금 지연이 맨 뒤(바로 앞 임자 없는 증빙)", () => {
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
    expect(names.at(-1)).toBe(KIND);
    expect(names.at(-2)).toBe("orphan-evidence");
  });

  it("기본 끔 · 달력일 · 받는 사람 담당 PM · 일수 칸 없음 · 사다리 없음 · 받는 사람 정보 항목 revenue.paid_amount", () => {
    expect(collectionOverdueKind).toMatchObject({ label: "수금 지연", dateUnit: "calendar", defaults: { enabled: false, emailEnabled: true }, defaultRecipientLabel: "담당 PM", recipientInfoItem: "revenue.paid_amount" });
    expect(collectionOverdueKind.defaults.days).toBeUndefined();
    expect(collectionOverdueKind.daysRange).toBeUndefined();
    expect(collectionOverdueKind.ladder).toBeFalsy();
  });

  it("행 링크 = 프로젝트 상세(사건 키의 첫 `:` 앞 · 볼 수 있을 때만)", async () => {
    const pm = await makeUser(await makeRole(true));
    const project = await makeProject(pm);
    const stranger = await makeUser(DEFAULT_ROLE_ID, "남");
    const rows = [{ entity: "project", entityId: `${project.id}:2026-10-27` }];
    expect(await notificationHref(pm, rows)).toEqual([`/projects/${project.id}`]);
    expect(await notificationHref(stranger, rows)).toEqual([undefined]);
  });
});

describe("수금 지연 알림", () => {
  it("규칙 없으면(끔) 0", async () => {
    const pm = await makeUser(await makeRole(true));
    const project = await makeProject(pm);
    await entry(project.id, "issue", "2026-08-28", 1_000_000);
    await tick("2026-10-28");
    expect(await rowsOf(pm)).toHaveLength(0);
  });

  it("켬 — 담당 PM에게 한 행(금액 없음) · 같은 날 두 번 · 다음 날도 같은 예정일이면 한 행", async () => {
    const pm = await makeUser(await makeRole(true));
    const project = await makeProject(pm, "가을 수금");
    await entry(project.id, "issue", "2026-08-28", 1_000_000);
    await enable();
    await tick("2026-10-27");
    expect(await rowsOf(pm)).toHaveLength(0);
    await tick("2026-10-28");
    await tick("2026-10-28");
    await tick("2026-10-29");
    const rows = await rowsOf(pm);
    expect(rows.map((row) => [row.entity, row.entityId, row.round, row.referenceDate, row.message])).toEqual([
      ["project", `${project.id}:2026-10-27`, 1, "2026-10-27", "수금 지연 · 가을 수금 · 예정 10-27"],
    ]);
    expect(rows[0]?.message).not.toMatch(/\d{1,3}(,\d{3})+/);
  });

  it("입금으로 풀리면 행이 늘지 않고, 다음 발행 줄이 새로 지연이면 새 예정일로 한 행", async () => {
    const pm = await makeUser(await makeRole(true));
    const project = await makeProject(pm);
    await entry(project.id, "issue", "2026-08-28", 1_000_000);
    await enable();
    await tick("2026-10-28");
    await entry(project.id, "payment", "2026-10-28", 1_100_000);
    await tick("2026-10-29");
    expect(await rowsOf(pm)).toHaveLength(1);
    await entry(project.id, "issue", "2026-08-31", 500_000);
    await tick("2026-11-02");
    expect((await rowsOf(pm)).map((row) => row.entityId)).toEqual([`${project.id}:2026-10-27`, `${project.id}:2026-10-30`]);
  });

  it("완료 프로젝트도 대상 · 보관 프로젝트 · 퇴사한 담당 PM은 행 없음", async () => {
    const role = await makeRole(true);
    const donePm = await makeUser(role);
    const done = await makeProject(donePm);
    await db.update(projects).set({ status: "completed", startDate: "2026-08-01", endDate: "2026-08-31" }).where(eq(projects.id, done.id));
    await entry(done.id, "issue", "2026-08-28", 1_000_000);
    const archivedPm = await makeUser(role);
    const archived = await makeProject(archivedPm);
    await entry(archived.id, "issue", "2026-08-28", 1_000_000);
    await db.update(projects).set({ archivedAt: new Date(), archivedBy: "system" }).where(eq(projects.id, archived.id));
    const goner = await makeUser(role);
    const left = await makeProject(goner);
    await entry(left.id, "issue", "2026-08-28", 1_000_000);
    await db.update(users).set({ resignationDate: "2026-10-01" }).where(eq(users.id, goner.id));
    await enable();
    await tick("2026-10-28");
    expect((await rowsOf(donePm)).map((row) => row.entityId)).toEqual([`${done.id}:2026-10-27`]);
    expect(await rowsOf(archivedPm)).toHaveLength(0);
    expect(await rowsOf(goner)).toHaveLength(0);
  });
});

describe("받는 사람 정보 항목 거르개 (G-61 · D-748)", () => {
  it("담당 PM 계급이 revenue.paid_amount를 못 보면 행 0", async () => {
    const pm = await makeUser(DEFAULT_ROLE_ID);
    const project = await makeProject(pm);
    await entry(project.id, "issue", "2026-08-28", 1_000_000);
    await enable();
    await tick("2026-10-28");
    expect(await rowsOf(pm)).toHaveLength(0);
  });

  it("받는 계급 추가에 revenue.paid_amount를 못 보는 계급 · 보는 계급을 함께 → 보는 계급 사용자만 · 계급마다 판정 한 번", async () => {
    const blindRole = await makeRole(false);
    const seeingRole = await makeRole(true);
    const blind = await makeUser(blindRole, "못 보는 사람");
    const seeing = await makeUser(seeingRole, "보는 사람");
    const seeing2 = await makeUser(seeingRole, "보는 사람 둘");
    const pm = await makeUser(DEFAULT_ROLE_ID);
    const first = await makeProject(pm);
    const second = await makeProject(pm);
    await entry(first.id, "issue", "2026-08-28", 1_000_000);
    await entry(second.id, "issue", "2026-08-28", 2_000_000);
    await enable([blindRole, seeingRole]);
    const calls: string[] = [];
    await tick("2026-10-28", [collectionOverdueKind], {
      findVisibility: (viewer, roleId, infoItem, tx) => {
        calls.push(`${roleId}|${infoItem}`);
        return findVisibility(viewer, roleId, infoItem, tx);
      },
    });
    expect(await rowsOf(pm)).toHaveLength(0);
    expect(await rowsOf(blind)).toHaveLength(0);
    expect((await rowsOf(seeing)).map((row) => row.entityId).sort()).toEqual([`${first.id}:2026-10-27`, `${second.id}:2026-10-27`].sort());
    expect(await rowsOf(seeing2)).toHaveLength(2);
    // 계급 셋(담당 PM 계급 · 못 보는 계급 · 보는 계급) × revenue.paid_amount — 각각 한 번.
    expect(calls.filter((call) => call.endsWith("|revenue.paid_amount")).sort()).toEqual(
      [`${DEFAULT_ROLE_ID}|revenue.paid_amount`, `${blindRole}|revenue.paid_amount`, `${seeingRole}|revenue.paid_amount`].sort(),
    );
  });
});

describe("평가량 상한", () => {
  it("후보가 NOTIFY_KIND_EVAL_MAX를 넘으면 상한까지만 판정하고 notify.condition_capped 경고 한 번", async () => {
    const warn = vi.spyOn(log, "warn");
    const judged: number[] = [];
    const kind = createCollectionOverdueKind({
      max: 3,
      listCandidates: () =>
        Promise.resolve(Array.from({ length: 4 }, (_, index) => ({ id: randomUUID(), name: `p${index}`, pmUserId: `u${index}`, pmRoleId: DEFAULT_ROLE_ID }))),
      overdueByProject: (_viewer, ids) => {
        judged.push(ids.length);
        return Promise.resolve(new Map());
      },
    });
    await kind.evaluate({ today: "2026-10-28" });
    expect(judged).toEqual([3]);
    expect(warn.mock.calls.filter(([event]) => event === "notify.condition_capped")).toEqual([["notify.condition_capped", { kind: KIND, max: 3 }]]);
  });
});
