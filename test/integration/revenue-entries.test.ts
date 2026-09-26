import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { db, pool } from "@/db/client";
import { codeItems, quoteLines, revenueEntries, teams } from "@/db/schema";
import { eq } from "drizzle-orm";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import type { Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertRole } from "@/repositories/roles";
import { createProject } from "@/domain/projects";
import { listRevenue, saveRevenue } from "@/domain/revenue";
import { saveProjectLedger } from "@/domain/projects/ledger";
import { TAX_VAT_RATE, FX_RECENT_RATE_USD } from "@/domain/settings/keys";
import { addHistorizedValue, getSettingValue } from "@/domain/settings/registry";
import { approvalBasis } from "@/repositories/quote-revisions";
import { getCurrentQuoteRevision } from "@/domain/quotes/lines";
import { createRevisionFromCurrent, setCustomerApproval } from "@/domain/quotes/revisions";
import { kstToday } from "@/lib/kst-date";
import { saveProjectLedgerAction } from "@/app/(app)/projects/actions";

// 04-41 — 액션(스키마 → 원장 합성 저장)을 직접 부르는 케이스용 세션 · revalidatePath · 합성 저장 호출 기록.
// 합성 저장은 실제 구현을 그대로 감싸기만 한다(동작 불변 — 이 파일의 다른 케이스도 실제 경로를 탄다).
vi.mock("@/lib/viewer", async () => {
  const { SYSTEM_VIEWER: viewer } = await import("@/domain/viewer");
  return { getSession: () => Promise.resolve({ viewer, user: { id: viewer.id } }) };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/domain/projects/ledger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domain/projects/ledger")>();
  return { ...actual, saveProjectLedger: vi.fn(actual.saveProjectLedger) };
});

async function setupProject() {
  const client = await insertVendor(SYSTEM_VIEWER, {
    name: `거래처-${randomUUID()}`,
    normalizedName: `거래처-${randomUUID()}`,
  });
  const { userId: pmUserId } = await createAccount(SYSTEM_VIEWER, {
    email: `pm-${randomUUID()}@example.test`,
    name: "통합테스트 PM",
    roleId: DEFAULT_ROLE_ID,
  });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");

  const project = await createProject(SYSTEM_VIEWER, {
    clientId: client.id,
    teamId: team.id,
    pmUserId,
    name: `프로젝트-${randomUUID()}`,
  });

  return { project, pmUserId };
}

// 04-02 — "경영관리" 페르소나: SEED_ROLES 5종에 없는 조직상 역할이라
// role-ceo에 이 테스트가 명시로 권한을 부여한다(visibility.test.ts와 같은
// 결 — role-ceo는 domain/seed가 sysadmin·pm 둘만 채우므로 기본 권한이
// 전혀 없다).
async function createFinanceViewer(): Promise<Viewer> {
  const { userId } = await createAccount(SYSTEM_VIEWER, {
    email: `finance-${randomUUID()}@example.test`,
    name: "통합테스트 경영관리",
    roleId: "role-ceo",
  });
  await upsertPermission(SYSTEM_VIEWER, { roleId: "role-ceo", menu: "projects", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: "role-ceo", menu: "projects.revenue", action: "write", allowed: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: "role-ceo", infoItem: "project.value", visible: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: "role-ceo", infoItem: "revenue.issued_amount", visible: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: "role-ceo", infoItem: "revenue.paid_amount", visible: true });
  return { id: userId, roleId: "role-ceo" };
}

const pmViewer = (userId: string): Viewer => ({ id: userId, roleId: DEFAULT_ROLE_ID });

describe("domain/revenue saveRevenue/listRevenue (Phase 4, 실제 Postgres)", () => {
  it("(a) 입금 줄에 통장 합계를 저장하면 공급가액 역산값이 함께 계산되어 나온다", async () => {
    const { project } = await setupProject();
    const finance = await createFinanceViewer();

    const result = await saveRevenue(finance, project.id, {
      paidEntries: [{ entryDate: "2026-09-01", amount: { currency: "KRW", amount: 52_800_000, fxRate: 1 } }],
    });

    expect(result?.paidEntries).toHaveLength(1);
    expect(result?.paidEntries?.[0]?.computedGrossKrw).toBe(48_000_000);
  });

  it("(b) 역산 뒤 재계산 합계가 입력과 어긋나면 차이가 DTO에 실리고, 저장된 합계는 입력값 그대로다", async () => {
    const { project } = await setupProject();
    const finance = await createFinanceViewer();

    // 부가세 10%로 나눈 나머지가 있는 금액 — round 절사(설정 기본값)로
    // 역산해도 재계산 합계가 입력과 정확히 같지 않을 수 있다
    // (test/unit/domain/money.test.ts의 grossFromTotal이 truncate로 같은
    // 구조를 고정한다 — 여기서는 실제 Postgres 설정값을 읽는 경로를 증명).
    const totalKrw = 100_001;
    const vatRate = await getSettingValue(TAX_VAT_RATE, { asOf: new Date("2026-09-01") });

    const result = await saveRevenue(finance, project.id, {
      paidEntries: [{ entryDate: "2026-09-01", amount: { currency: "KRW", amount: totalKrw, fxRate: 1 } }],
    });

    const entry = result?.paidEntries?.[0];
    expect(entry).toBeTruthy();
    const expectedGross = Math.round(totalKrw / (1 + vatRate));
    expect(entry?.computedGrossKrw).toBe(expectedGross);

    // 서버가 조용히 맞추지 않는다 — DB에 저장된 amount_amount_krw는 입력값 그대로다.
    const [row] = await db.select().from(revenueEntries).where(eq(revenueEntries.id, entry!.id));
    expect(row?.amountAmountKrw).toBe(totalKrw);
  });

  it("(c) 입금 합계 < 발행 합계면 미수, > 발행 합계면 초과 입금이 balanceKrw에 나온다", async () => {
    const { project } = await setupProject();
    const finance = await createFinanceViewer();

    await saveRevenue(finance, project.id, {
      issuedEntries: [{ entryDate: "2026-09-01", amount: { currency: "KRW", amount: 10_000_000, fxRate: 1 } }],
    });
    const shortfall = await saveRevenue(finance, project.id, {
      paidEntries: [{ entryDate: "2026-09-05", amount: { currency: "KRW", amount: 5_500_000, fxRate: 1 } }],
    });
    // 공급가 역산 5,000,000 - 발행 10,000,000 = -5,000,000(미수)
    expect(shortfall?.balanceKrw).toBeLessThan(0);

    const overpay = await saveRevenue(finance, project.id, {
      paidEntries: [{ entryDate: "2026-09-06", amount: { currency: "KRW", amount: 16_500_000, fxRate: 1 } }],
    });
    // 누적 입금 공급가 = 5,000,000 + 15,000,000 = 20,000,000 > 발행 10,000,000 → 초과
    expect(overpay?.balanceKrw).toBeGreaterThan(0);
  });

  // 04-16(D-85 · B-28 · T-04-83) — PM은 발행 줄과 서버가 계산한 발행 합계를 받고, 입금 줄과 입금에서 파생된 값(입금 합계 ·
  // 잔액 = 미수·초과 입금)은 필드 자체가 없다 — 발행액 − 미수 = 입금액 역산 통로를 남기지 않는다.
  it("(d) 기획본부(PM) DTO 키 집합 — 발행 줄·발행 합계는 있고, 입금 줄과 입금 파생 필드는 없다(빈 배열이 아니라 필드 부재)", async () => {
    const { project, pmUserId } = await setupProject();
    const finance = await createFinanceViewer();
    await saveRevenue(finance, project.id, {
      issuedEntries: [{ entryDate: "2026-09-01", amount: { currency: "KRW", amount: 1_000_000, fxRate: 1 } }],
      paidEntries: [{ entryDate: "2026-09-05", amount: { currency: "KRW", amount: 550_000, fxRate: 1 } }],
    });

    const pmDto = await listRevenue(pmViewer(pmUserId), project.id);
    expect(Object.keys(pmDto).sort()).toEqual(["contract", "issuedEntries", "issuedTotalKrw"]);
    expect(pmDto.issuedEntries).toHaveLength(1);
    expect(pmDto.issuedTotalKrw).toBe(1_000_000);

    const financeDto = await listRevenue(finance, project.id);
    expect(Object.keys(financeDto)).toEqual(expect.arrayContaining(["issuedEntries", "paidEntries", "issuedTotalKrw", "paidGrossTotalKrw", "balanceKrw"]));
  });

  it("(e) 음수 금액 줄(환불·할인)이 저장된다(EXP-14)", async () => {
    const { project } = await setupProject();
    const finance = await createFinanceViewer();

    const result = await saveRevenue(finance, project.id, {
      issuedEntries: [{ entryDate: "2026-09-01", amount: { currency: "KRW", amount: -300_000, fxRate: 1 } }],
    });
    expect(result?.issuedEntries?.[0]?.amount.amountKrw).toBe(-300_000);
  });

  it("(f) 환율을 적은 저장 뒤 최근 환율 설정 값이 갱신되고, 건드리지 않은 저장 뒤에는 갱신되지 않는다", async () => {
    const { project } = await setupProject();
    const finance = await createFinanceViewer();

    // 04-41 — 계약 금액 쓰기 경로가 없어져 발행 줄(USD)로 같은 규칙을 본다(fxRateTouched: true).
    await saveRevenue(finance, project.id, {
      issuedEntries: [{ entryDate: "2026-09-01", amount: { currency: "USD", amount: 1000, fxRate: 1400.5 }, fxRateTouched: true }],
    });
    const afterTouch = await getSettingValue(FX_RECENT_RATE_USD);
    expect(afterTouch).toBe(1400.5);

    // 다른 값으로 다시 저장하되 이번엔 fxRateTouched: false — 사람이 환율
    // 칸을 건드리지 않은 저장이라 설정이 그 값으로 갱신되지 않는다(값이
    // 같았다면 갱신 여부를 구분할 수 없으므로 일부러 다른 값을 쓴다).
    await saveRevenue(finance, project.id, {
      issuedEntries: [{ entryDate: "2026-09-02", amount: { currency: "USD", amount: 2000, fxRate: 1500.0 }, fxRateTouched: false }],
    });
    const afterUntouched = await getSettingValue(FX_RECENT_RATE_USD);
    expect(afterUntouched).toBe(1400.5);
  });

  it("기획본부 계급의 viewer로는 발행·입금 줄 저장이 거부된다(projects.revenue write 없음)", async () => {
    const { project, pmUserId } = await setupProject();
    await expect(
      saveRevenue(pmViewer(pmUserId), project.id, {
        issuedEntries: [{ entryDate: "2026-09-01", amount: { currency: "KRW", amount: 1000, fxRate: 1 } }],
      }),
    ).rejects.toThrow();
  });

  it("이미 바뀐 매출 줄을 옛 버전으로 저장하면 거부되고 값은 그대로다", async () => {
    const { project } = await setupProject();
    const finance = await createFinanceViewer();
    const first = await saveRevenue(finance, project.id, { paidEntries: [{ entryDate: "2026-09-01", amount: { currency: "KRW", amount: 1000, fxRate: 1 } }] });
    const entry = first?.paidEntries?.[0];
    if (!entry) throw new Error("매출 줄 저장 실패");
    await saveRevenue(finance, project.id, { paidEntries: [{ id: entry.id, version: entry.version, entryDate: "2026-09-01", amount: { currency: "KRW", amount: 2000, fxRate: 1 } }] });

    await expect(
      saveRevenue(finance, project.id, { paidEntries: [{ id: entry.id, version: entry.version, entryDate: "2026-09-01", amount: { currency: "KRW", amount: 3000, fxRate: 1 } }] }),
    ).rejects.toThrow("먼저 이 줄");
    const [row] = await db.select().from(revenueEntries).where(eq(revenueEntries.id, entry.id));
    expect(Number(row?.amountAmountKrw)).toBe(2000);
  });

  it("기존 매출 줄을 버전 없이 저장하면 거부된다", async () => {
    const { project } = await setupProject();
    const finance = await createFinanceViewer();
    const first = await saveRevenue(finance, project.id, { paidEntries: [{ entryDate: "2026-09-01", amount: { currency: "KRW", amount: 1000, fxRate: 1 } }] });
    const entry = first?.paidEntries?.[0];
    if (!entry) throw new Error("매출 줄 저장 실패");

    await expect(
      saveRevenue(finance, project.id, { paidEntries: [{ id: entry.id, entryDate: "2026-09-01", amount: { currency: "KRW", amount: 3000, fxRate: 1 } }] }),
    ).rejects.toThrow("버전 정보");
  });

  it("projects view 권한이 없는 viewer는 listRevenue가 거부되고 saveProjectLedger(revenue:{})도 거부된다", async () => {
    const { project } = await setupProject();
    // 04-20부터 시드가 대표에게 projects 보기를 켠다 — 권한 행이 전혀 없는 새 계급을 쓴다.
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `권한 없는 계급-${randomUUID()}` });
    const { userId: noAccessUserId } = await createAccount(SYSTEM_VIEWER, {
      email: `noaccess-${randomUUID()}@example.test`,
      name: "통합테스트 권한없음",
      roleId: role.id,
    });
    const noAccess: Viewer = { id: noAccessUserId, roleId: role.id };

    await expect(listRevenue(noAccess, project.id)).rejects.toThrow();
    await expect(saveProjectLedger(noAccess, project.id, { seenStatus: "bidding", revenue: {} })).rejects.toThrow();
  });
});

// 04-16(D-84 · B-18 · B-19 · B-27 · GAP 4) — 계약 금액은 입력이 아니라 고객 승인된 **현재 차수**의 견적 합계(보관 제외)다.
// 부가세 기준일은 승인일(KST 날짜)이다. 현재 차수가 미승인이면 이전 승인 차수로 대신하지 않는다.
describe("파생 계약 금액 — 고객 승인된 현재 차수 합계 (04-16 Task 1)", () => {
  type LineInsert = typeof quoteLines.$inferInsert;

  async function quoteSubcategory(): Promise<string> {
    const [row] = await db.select().from(codeItems).where(eq(codeItems.tableKey, "quote_subcategory")).limit(1);
    if (!row) throw new Error("시드된 quote_subcategory 코드 항목이 없습니다");
    return row.value;
  }

  async function insertLine(revisionId: string, quoteAmountKrw: number, patch: Partial<LineInsert> = {}) {
    await db.insert(quoteLines).values({
      revisionId,
      subcategory: await quoteSubcategory(),
      itemName: `항목-${randomUUID()}`,
      unitPriceAmountKrw: quoteAmountKrw,
      executionAmountKrw: 0,
      quoteAmountKrw,
      profitKrw: quoteAmountKrw,
      ...patch,
    });
  }

  async function firstRevisionId(projectId: string): Promise<string> {
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, projectId);
    if (!revision) throw new Error("1차 차수가 없습니다");
    return revision.id;
  }

  async function approve(pm: Viewer, revisionId: string, approvedOn = kstToday(new Date())) {
    const basis = await approvalBasis(SYSTEM_VIEWER, revisionId);
    await setCustomerApproval(pm, revisionId, { approvedOn, seenTotalKrw: basis.totalKrw, contentToken: basis.contentToken });
  }

  // 1차에 견적 줄 둘(30,000,000 + 18,000,000) · 견적 외 비용 · 조정 줄을 두고 2차를 만든 뒤, 2차에 줄 하나를 더해 승인 전에 보관한다.
  async function setupSecondRevision() {
    const { project, pmUserId } = await setupProject();
    const pm = pmViewer(pmUserId);
    const first = await firstRevisionId(project.id);
    await insertLine(first, 30_000_000, { sortOrder: 0 });
    await insertLine(first, 18_000_000, { sortOrder: 1 });
    await insertLine(first, 0, { sortOrder: 2, lineKind: "out_of_quote", executionAmountKrw: 700_000, profitKrw: -700_000 });
    await insertLine(first, 0, { sortOrder: 3, lineKind: "adjustment", executionAmountKrw: 300_000, profitKrw: -300_000 });
    const { revisionId } = await createRevisionFromCurrent(pm, { projectId: project.id, fromRevisionId: first });
    await insertLine(revisionId, 5_000_000, { sortOrder: 9, archivedAt: new Date(), archivedBy: SYSTEM_VIEWER.id });
    return { project, pm, revisionId };
  }

  it("승인된 현재 차수(2차) — 견적 합계 · 부가세 · 합계가 숫자이고 출처가 `2차 고객 승인 합계`다(견적 외 비용·조정·보관 줄 제외)", async () => {
    const { project, pm, revisionId } = await setupSecondRevision();
    await approve(pm, revisionId);

    const dto = await listRevenue(pm, project.id);

    expect(dto.contract).toEqual({
      amountKrw: 48_000_000,
      vatKrw: 4_800_000,
      totalKrw: 52_800_000,
      vatRateLabel: "10%",
      sourceLabel: "2차 고객 승인 합계",
      pendingLabel: null,
    });
    expect(typeof dto.contract?.amountKrw).toBe("number");
    expect(typeof dto.contract?.vatKrw).toBe("number");
    expect(typeof dto.contract?.totalKrw).toBe("number");
  });

  it("(B-18) 견적 합계 3,000,000,000 — SUM이 숫자로 와서 부가세·합계가 숫자 덧셈이다", async () => {
    const { project, pmUserId } = await setupProject();
    const pm = pmViewer(pmUserId);
    const first = await firstRevisionId(project.id);
    await insertLine(first, 1_500_000_000, { sortOrder: 0 });
    await insertLine(first, 1_500_000_000, { sortOrder: 1 });
    await approve(pm, first);

    const dto = await listRevenue(pm, project.id);

    expect(dto.contract?.amountKrw).toBe(3_000_000_000);
    expect(dto.contract?.vatKrw).toBe(300_000_000);
    expect(dto.contract?.totalKrw).toBe(3_300_000_000);
    expect(dto.contract?.sourceLabel).toBe("1차 고객 승인 합계");
  });

  it("(금지 항목) 새 차수(3차)를 만들어 현재가 미승인이면 `3차 고객 승인 전` — 2차 승인 합계로 대신하지 않는다", async () => {
    const { project, pm, revisionId } = await setupSecondRevision();
    await approve(pm, revisionId);
    await createRevisionFromCurrent(pm, { projectId: project.id, fromRevisionId: revisionId });

    const dto = await listRevenue(pm, project.id);

    expect(dto.contract).toEqual({
      amountKrw: null,
      vatKrw: null,
      totalKrw: null,
      vatRateLabel: null,
      sourceLabel: null,
      pendingLabel: "3차 고객 승인 전",
    });
  });

  it("(B-27) 부가세 기준일은 승인일이다 — 승인 뒤 시행되는 새 세율은 이미 승인된 계약의 부가세를 바꾸지 않는다", async () => {
    const { project, pmUserId } = await setupProject();
    const pm = pmViewer(pmUserId);
    const first = await firstRevisionId(project.id);
    await insertLine(first, 48_000_000);
    await approve(pm, first, "2026-01-10");
    await addHistorizedValue(SYSTEM_VIEWER, TAX_VAT_RATE, { effectiveFrom: "2026-06-01", value: 0.2 });

    const dto = await listRevenue(pm, project.id);

    const approvalRate = await getSettingValue(TAX_VAT_RATE, { asOf: new Date("2026-01-10") });
    expect(dto.contract?.vatKrw).toBe(Math.round(48_000_000 * approvalRate));
    expect(dto.contract?.vatKrw).not.toBe(9_600_000);
  });

  it("(GAP 4 경계일) 새 세율 시행일 당일 승인은 새 세율로 계산된다 — 저장된 순간(전날 UTC 15:00)을 그대로 쓰지 않는다", async () => {
    const { project, pmUserId } = await setupProject();
    const pm = pmViewer(pmUserId);
    const first = await firstRevisionId(project.id);
    await insertLine(first, 48_000_000);
    await addHistorizedValue(SYSTEM_VIEWER, TAX_VAT_RATE, { effectiveFrom: "2026-09-19", value: 0.2 });
    await approve(pm, first, "2026-09-19");

    const dto = await listRevenue(pm, project.id);

    expect(dto.contract?.vatKrw).toBe(9_600_000);
    expect(dto.contract?.totalKrw).toBe(57_600_000);
    expect(dto.contract?.vatRateLabel).toBe("20%");
  });

  it("(B-19) quote.amount를 숨기고 project.value만 보이는 계급에게는 contract 키가 없다", async () => {
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `견적 숨김 계급-${randomUUID()}` });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "project.value", visible: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "quote.amount", visible: false });
    const { userId } = await createAccount(SYSTEM_VIEWER, { email: `noquote-${randomUUID()}@example.test`, name: "견적 숨김", roleId: role.id });
    const { project, pmUserId } = await setupProject();
    const first = await firstRevisionId(project.id);
    await insertLine(first, 48_000_000);
    await approve(pmViewer(pmUserId), first);

    const dto = await listRevenue({ id: userId, roleId: role.id }, project.id);

    expect(Object.keys(dto)).not.toContain("contract");
  });
});

// 04-41(D-84 · 사용자 D9 · T-04-84) — 계약 금액은 04-16의 파생값 하나다. 옛 클라이언트가 계약 필드를 실어 보내도
// 스키마가 버려 아무것도 저장되지 않고, 계약을 쓰는 이름이 코드 어디에도 남지 않는다.
describe("계약 금액 쓰기 경로 없음(04-41)", () => {
  // 옛 화면이 보내던 모양 — 변수로 두어 타입이 모르는 키를 싣는다(액션 입력은 zod가 파싱한다).
  function legacyInput(projectId: string) {
    return {
      projectId,
      seenStatus: "bidding" as const,
      revenue: {
        contract: { currency: "KRW" as const, amount: 50_000_000, fxRate: 1 },
        contractFxRateTouched: true,
        issuedEntries: [{ entryDate: "2026-09-01", amount: { currency: "KRW" as const, amount: 1_000_000, fxRate: 1 } }],
      },
    };
  }

  it("옛 계약 필드를 실은 일괄 저장은 발행 줄만 저장하고 프로젝트 행에 계약 값이 남지 않으며, 계약 금액은 파생값 그대로다", async () => {
    const { project } = await setupProject();
    const before = await listRevenue(SYSTEM_VIEWER, project.id);

    const input = legacyInput(project.id);
    const result = await saveProjectLedgerAction(input);
    expect(result?.serverError).toBeUndefined();
    expect(result?.validationErrors).toBeUndefined();

    const entries = await db.select().from(revenueEntries).where(eq(revenueEntries.projectId, project.id));
    expect(entries.map((entry) => [entry.kind, entry.amountAmountKrw])).toEqual([["issue", 1_000_000]]);

    // 컬럼이 남아 있는 동안(Task 2 전)은 기본값 그대로, 컬럼을 지운 뒤에는 키 자체가 없다 — 어느 쪽이든 50,000,000은 없다.
    const { rows } = await pool.query<Record<string, unknown>>("SELECT * FROM projects WHERE id = $1", [project.id]);
    const row = rows[0] ?? {};
    expect(row.contract_amount_krw ?? 0).toBe(0);
    expect(row.contract_foreign_amount ?? null).toBeNull();
    expect(row.contract_currency ?? "KRW").toBe("KRW");

    const after = await listRevenue(SYSTEM_VIEWER, project.id);
    expect(after.contract).toEqual(before.contract);
    expect(after.contract?.pendingLabel).toBe("1차 고객 승인 전");
  });

  it("액션 스키마가 옛 계약 필드를 버린다 — 합성 저장이 받은 revenue에 contract·contractFxRateTouched 키가 없다(거부가 아니라 무시)", async () => {
    const { project } = await setupProject();
    const ledger = vi.mocked(saveProjectLedger);
    ledger.mockClear();

    const result = await saveProjectLedgerAction(legacyInput(project.id));
    expect(result?.validationErrors).toBeUndefined();

    expect(ledger).toHaveBeenCalledTimes(1);
    const revenue = ledger.mock.calls[0]?.[2].revenue;
    expect(revenue).toBeDefined();
    expect(Object.keys(revenue ?? {}).sort()).toEqual(["issuedEntries"]);
  });

  it("참조 스캔 — app/·domain/·repositories/·db/schema/의 .ts·.tsx에 계약 컬럼·쓰기 함수 이름이 0건", () => {
    const names = [
      "contract_amount_krw",
      "contract_currency",
      "contract_fx_rate",
      "contract_foreign_amount",
      "contractAmountKrw",
      "contractCurrency",
      "contractFxRate",
      "contractForeignAmount",
      "updateProjectContract",
      "contractFxRateTouched",
    ];
    const root = process.cwd();
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(name)) files.push(full);
      }
    };
    for (const dir of ["app", "domain", "repositories", "db/schema"]) walk(path.join(root, dir));
    expect(files.length).toBeGreaterThan(50);

    const hits = files.flatMap((file) => {
      const text = readFileSync(file, "utf8");
      return names.filter((name) => text.includes(name)).map((name) => `${path.relative(root, file)}: ${name}`);
    });
    expect(hits).toEqual([]);
  });
});
