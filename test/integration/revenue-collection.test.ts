import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projects, revenueEntries, teams } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { createProject, loadProjectList } from "@/domain/projects";
import { collectionOverdueByProject, listRevenue } from "@/domain/revenue";
import { DTO_REGISTRY } from "@/domain/permissions/dto-registry";
import { getSettingValue } from "@/domain/settings/registry";
import { PROJECT_COLLECTION_DUE_DAYS, TAX_VAT_RATE } from "@/domain/settings/keys";
import { loadHolidayLookup } from "@/domain/holidays/calendar";
import { listCollectionRows } from "@/repositories/revenue-entries";

// 07-22(D-746 · D-735 · C-P2-11 · K23) — 수금 지연 읽기 함수 · 목록 · 상세 DTO를 실제 Postgres에서 본다.

type Line = { kind: "issue" | "payment"; date: string; amount: number; archived?: boolean };

async function makeProject(lines: Line[], opts: { pmUserId?: string; status?: string } = {}): Promise<{ id: string; name: string; pmUserId: string }> {
  const client = await insertVendor(SYSTEM_VIEWER, { name: `거래처-${randomUUID()}`, normalizedName: `거래처-${randomUUID()}` });
  const pmUserId =
    opts.pmUserId ??
    (await createAccount(SYSTEM_VIEWER, { email: `pm-${randomUUID()}@example.test`, name: "수금 PM", roleId: DEFAULT_ROLE_ID })).userId;
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  const name = `수금-${randomUUID().slice(0, 8)}`;
  const created = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: team.id, pmUserId, name });
  if (opts.status) await db.update(projects).set({ status: opts.status }).where(eq(projects.id, created.id));
  for (const line of lines) {
    await db.insert(revenueEntries).values({
      projectId: created.id,
      kind: line.kind,
      entryDate: line.date,
      amountCurrency: "KRW",
      amountFxRate: "1.0000",
      amountAmountKrw: line.amount,
      ...(line.archived ? { archivedAt: new Date(), archivedBy: "system" } : {}),
    });
  }
  return { id: created.id, name, pmUserId };
}

describe("collectionOverdueByProject", () => {
  it("프로젝트마다 순수 판정 결과 · 보관 줄은 빠진다", async () => {
    const overdue = await makeProject([{ kind: "issue", date: "2026-03-01", amount: 1_000_000 }]);
    // 보관된 입금 줄은 입금 합계에 들지 않는다 → 여전히 지연.
    const archivedPayment = await makeProject([
      { kind: "issue", date: "2026-03-01", amount: 1_000_000 },
      { kind: "payment", date: "2026-03-10", amount: 1_100_000, archived: true },
    ]);
    // 보관된 발행 줄은 발행에 들지 않는다 → 발행 없음.
    const archivedIssue = await makeProject([{ kind: "issue", date: "2026-03-01", amount: 1_000_000, archived: true }]);
    const paid = await makeProject([
      { kind: "issue", date: "2026-03-01", amount: 1_000_000 },
      { kind: "payment", date: "2026-03-10", amount: 1_100_000 },
    ]);
    const empty = await makeProject([]);

    const result = await collectionOverdueByProject(SYSTEM_VIEWER, [overdue.id, archivedPayment.id, archivedIssue.id, paid.id, empty.id], { today: "2026-05-01" });
    expect(result.get(overdue.id)).toEqual({ overdue: true, dueDate: "2026-04-30" });
    expect(result.get(archivedPayment.id)).toEqual({ overdue: true, dueDate: "2026-04-30" });
    expect(result.get(archivedIssue.id)).toEqual({ overdue: false, dueDate: null });
    expect(result.get(paid.id)).toEqual({ overdue: false, dueDate: null });
    expect(result.get(empty.id)).toEqual({ overdue: false, dueDate: null });

    // 예정일 당일은 지연이 아니다.
    expect((await collectionOverdueByProject(SYSTEM_VIEWER, [overdue.id], { today: "2026-04-30" })).get(overdue.id)).toEqual({ overdue: false, dueDate: "2026-04-30" });
  });

  it("설정 · 공휴일 · 저장소 읽기는 프로젝트 수와 무관하게 각 한 번 · 같은 날짜 세율 읽기도 한 번", async () => {
    const ids: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const made = await makeProject([
        { kind: "issue", date: "2026-03-01", amount: 1_000_000 },
        { kind: "payment", date: "2026-03-15", amount: 110_000 },
        { kind: "payment", date: "2026-03-15", amount: 220_000 },
      ]);
      ids.push(made.id);
    }
    const keysRead: string[] = [];
    const settings: typeof getSettingValue = (def, opts, registryDeps) => {
      keysRead.push(def.key);
      return getSettingValue(def, opts, registryDeps);
    };
    const holidays = vi.fn(loadHolidayLookup);
    const rows = vi.fn(listCollectionRows);
    const result = await collectionOverdueByProject(SYSTEM_VIEWER, ids, { today: "2026-05-01" }, { getSettingValue: settings, loadHolidayLookup: holidays, listCollectionRows: rows });

    for (const id of ids) expect(result.get(id)).toEqual({ overdue: true, dueDate: "2026-04-30" });
    expect(rows).toHaveBeenCalledTimes(1);
    expect(holidays).toHaveBeenCalledTimes(1);
    expect(keysRead.filter((key) => key === PROJECT_COLLECTION_DUE_DAYS.key)).toHaveLength(1);
    expect(keysRead.filter((key) => key === TAX_VAT_RATE.key)).toHaveLength(1);
  });

  it("공휴일 표 밖 해(2036)의 예정일은 주말만 당긴다 — 오류 없음", async () => {
    // 2036-01-01 + 60 = 2036-03-01(토) → 02-29(금).
    const far = await makeProject([{ kind: "issue", date: "2036-01-01", amount: 1_000 }]);
    const holidays = vi.fn(loadHolidayLookup);
    const result = await collectionOverdueByProject(SYSTEM_VIEWER, [far.id], { today: "2036-03-03" }, { loadHolidayLookup: holidays });
    expect(result.get(far.id)).toEqual({ overdue: true, dueDate: "2036-02-29" });
    expect(holidays).not.toHaveBeenCalled();
  });

  it("빈 id 목록이면 읽지 않고 빈 Map", async () => {
    const rows = vi.fn(listCollectionRows);
    expect((await collectionOverdueByProject(SYSTEM_VIEWER, [], {}, { listCollectionRows: rows })).size).toBe(0);
    expect(rows).not.toHaveBeenCalled();
  });
});

describe("입금 기준 — 상세 잔액 줄과 같은 공급가액", () => {
  it("발행 1,050,000 · 입금 1,100,000(공급가액 1,000,000) → 지연이고 상세 잔액 < 0 (원액 비교였다면 놓침)", async () => {
    const made = await makeProject([
      { kind: "issue", date: "2025-03-03", amount: 1_050_000 },
      { kind: "payment", date: "2025-03-20", amount: 1_100_000 },
    ]);
    const detail = await listRevenue(SYSTEM_VIEWER, made.id);
    expect(detail.balanceKrw).toBeLessThan(0);
    expect(detail.collectionOverdue).toBe(true);
    expect((await collectionOverdueByProject(SYSTEM_VIEWER, [made.id])).get(made.id)?.overdue).toBe(true);
  });

  it("상세 잔액 ≥ 0 픽스처는 모두 지연 아님", async () => {
    const fixtures = [
      [
        { kind: "issue", date: "2025-03-03", amount: 1_000_000 },
        { kind: "payment", date: "2025-03-20", amount: 1_100_000 },
      ],
      [
        { kind: "issue", date: "2025-03-03", amount: 500_000 },
        { kind: "issue", date: "2025-04-03", amount: -500_000 },
      ],
      [
        { kind: "issue", date: "2025-03-03", amount: 300_000 },
        { kind: "payment", date: "2025-03-20", amount: 550_000 },
      ],
    ] satisfies Line[][];
    for (const lines of fixtures) {
      const made = await makeProject(lines);
      const detail = await listRevenue(SYSTEM_VIEWER, made.id);
      expect(detail.balanceKrw).toBeGreaterThanOrEqual(0);
      expect(detail.collectionOverdue).toBe(false);
    }
  });
});

describe("목록 · 상세 DTO의 collectionOverdue 칸", () => {
  const listAt = (viewer: Viewer, search: string) =>
    loadProjectList(viewer, { year: "all", search }, { now: () => new Date("2026-06-01T03:00:00Z"), settle: () => Promise.resolve() });

  it("목록 DTO와 상세 매출 DTO가 같은 값 · 완료 프로젝트도 판정한다", async () => {
    const late = await makeProject([{ kind: "issue", date: "2026-03-01", amount: 1_000_000 }], { status: "completed" });
    const settled = await makeProject([
      { kind: "issue", date: "2026-03-01", amount: 1_000_000 },
      { kind: "payment", date: "2026-03-10", amount: 1_100_000 },
    ]);
    const lateRow = (await listAt(SYSTEM_VIEWER, late.name)).rows.find((row) => row.id === late.id);
    const settledRow = (await listAt(SYSTEM_VIEWER, settled.name)).rows.find((row) => row.id === settled.id);
    expect(lateRow?.collectionOverdue).toBe(true);
    expect(settledRow?.collectionOverdue).toBe(false);
    expect((await listRevenue(SYSTEM_VIEWER, late.id)).collectionOverdue).toBe(true);
    expect((await listRevenue(SYSTEM_VIEWER, settled.id)).collectionOverdue).toBe(false);
  });

  it("revenue.paid_amount를 못 보는 viewer는 칸이 빠진다(목록 · 상세) · 예산 칸은 어느 DTO에도 없다", async () => {
    const late = await makeProject([{ kind: "issue", date: "2025-03-01", amount: 1_000_000 }]);
    const pm: Viewer = { id: late.pmUserId, roleId: DEFAULT_ROLE_ID };
    const rows = (await listAt(pm, late.name)).rows;
    const row = rows.find((candidate) => candidate.id === late.id);
    expect(row).toBeDefined();
    expect(row && "collectionOverdue" in row).toBe(false);
    const detail = await listRevenue(pm, late.id);
    expect("collectionOverdue" in detail).toBe(false);

    const systemRow = (await listAt(SYSTEM_VIEWER, late.name)).rows.find((candidate) => candidate.id === late.id);
    for (const keys of [Object.keys(systemRow ?? {}), Object.keys(await listRevenue(SYSTEM_VIEWER, late.id))]) {
      expect(keys.filter((key) => /budget|예산/i.test(key))).toEqual([]);
    }
  });

  it("누수 스캔 대조 — 두 DTO의 collectionOverdue는 revenue.paid_amount로 등록돼 있다", () => {
    const infoItemOf = (dto: string) => DTO_REGISTRY.find((entry) => entry.name === dto)?.fields.find((field) => field.key === "collectionOverdue")?.infoItem;
    expect(infoItemOf("ProjectListItemDto")).toBe("revenue.paid_amount");
    expect(infoItemOf("RevenueDto")).toBe("revenue.paid_amount");
  });
});
