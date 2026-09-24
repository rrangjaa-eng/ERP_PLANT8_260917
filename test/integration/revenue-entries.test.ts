import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { revenueEntries, teams } from "@/db/schema";
import { eq } from "drizzle-orm";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import type { Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { createProject } from "@/domain/projects";
import { listRevenue, saveRevenue } from "@/domain/revenue";
import { saveProjectLedger } from "@/domain/projects/ledger";
import { TAX_VAT_RATE, FX_RECENT_RATE_USD } from "@/domain/settings/keys";
import { getSettingValue } from "@/domain/settings/registry";

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

  it("(d) 기획본부(PM) DTO 키 집합에 발행·입금 배열 필드가 없다 — 빈 배열이 아니라 필드 부재", async () => {
    const { project, pmUserId } = await setupProject();
    const finance = await createFinanceViewer();
    await saveRevenue(finance, project.id, {
      issuedEntries: [{ entryDate: "2026-09-01", amount: { currency: "KRW", amount: 1_000_000, fxRate: 1 } }],
    });

    const pmDto = await listRevenue(pmViewer(pmUserId), project.id);
    expect(Object.keys(pmDto)).not.toContain("issuedEntries");
    expect(Object.keys(pmDto)).not.toContain("paidEntries");
    expect(Object.keys(pmDto)).not.toContain("balanceKrw");
    expect(pmDto.contract).toBeTruthy();

    const financeDto = await listRevenue(finance, project.id);
    expect(Object.keys(financeDto)).toContain("issuedEntries");
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

    const pmAccount = await createAccount(SYSTEM_VIEWER, {
      email: `pm2-${randomUUID()}@example.test`,
      name: "통합테스트 PM2",
      roleId: DEFAULT_ROLE_ID,
    });
    const pm = pmViewer(pmAccount.userId);

    // 계약 금액을 USD로 저장하고 환율을 적는다(fxRateTouched: true).
    await saveRevenue(pm, project.id, {
      contract: { currency: "USD", amount: 1000, fxRate: 1400.5 },
      contractFxRateTouched: true,
    });
    const afterTouch = await getSettingValue(FX_RECENT_RATE_USD);
    expect(afterTouch).toBe(1400.5);

    // 다른 값으로 다시 저장하되 이번엔 fxRateTouched: false — 사람이 환율
    // 칸을 건드리지 않은 저장이라 설정이 그 값으로 갱신되지 않는다(값이
    // 같았다면 갱신 여부를 구분할 수 없으므로 일부러 다른 값을 쓴다).
    await saveRevenue(pm, project.id, {
      contract: { currency: "USD", amount: 2000, fxRate: 1500.0 },
      contractFxRateTouched: false,
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

  it("경영관리 viewer로는 계약 금액 저장이 거부된다(projects write 없음)", async () => {
    const { project } = await setupProject();
    const finance = await createFinanceViewer();
    await expect(
      saveRevenue(finance, project.id, { contract: { currency: "KRW", amount: 1_000_000, fxRate: 1 } }),
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
    const { userId: noAccessUserId } = await createAccount(SYSTEM_VIEWER, {
      email: `noaccess-${randomUUID()}@example.test`,
      name: "통합테스트 권한없음",
      roleId: "role-ceo",
    });
    const noAccess: Viewer = { id: noAccessUserId, roleId: "role-ceo" };

    await expect(listRevenue(noAccess, project.id)).rejects.toThrow();
    await expect(saveProjectLedger(noAccess, project.id, { revenue: {} })).rejects.toThrow();
  });
});
