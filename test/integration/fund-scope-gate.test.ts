import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { orgUnits, settingsSimple } from "@/db/schema";
import { cardUsageReadScope } from "@/domain/corp-card-usages";
import { fileVisibilityFor } from "@/domain/evidence/private-files";
import { listIssueRequests } from "@/domain/issue-requests";
import { listAllPaymentTargets, paidViewAllowed } from "@/domain/payments/targets";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { readFundDivision } from "@/domain/permissions/fund-gate";
import { FUND_DIVISION_SETTING_KEY, FUND_SCOPED_MENUS } from "@/domain/permissions/fund-scope";
import { evidenceScopeFor, rowScopeFor } from "@/domain/permissions/scope-for";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { visible } from "@/domain/permissions/visible";
import { BudgetForbiddenError, listBudgetRows } from "@/domain/projects/budget";
import { listPurchaseRequests } from "@/domain/purchase-requests";
import { ForbiddenError as QuoteForbiddenError, prepareQuoteLineSave } from "@/domain/quotes/lines";
import { ForbiddenError as RevenueForbiddenError } from "@/domain/revenue";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertIssueRequest } from "@/repositories/revenue-issue-requests";
import { findSimpleValue, upsertSimpleValue } from "@/repositories/settings";
import { orgUnitIdByName } from "./approvals-fixtures";
import { buildFundWorld, grantAllFundKeys, grantFundKeys, makeFundPerson, makeFundRole, setDivisionColumn } from "./fixtures/fund-scope";
import { purchaseProject, request } from "./fixtures/purchase-requests";

// 07.3-01 트레이서(D-7301 · D-7310 · D-7311 · D-7313): 설정 → 시드 → 소속 본부 → 자금 게이트 → can() → 증빙 범위.
describe("자금 게이트 트레이서 (07.3-01)", () => {
  it("시드 뒤 자금 본부 설정은 경영관리본부 uuid다", async () => {
    const mgmt = await orgUnitIdByName("경영관리본부");
    expect((await findSimpleValue(SYSTEM_VIEWER, FUND_DIVISION_SETTING_KEY))?.value).toBe(mgmt);
    expect(await readFundDivision(SYSTEM_VIEWER)).toEqual({ id: mgmt, name: "경영관리본부" });
  });

  it("같은 team 계급이어도 경영관리팀 사람은 증빙 등록을 쓰고 기획1팀 사람은 못 쓴다 — 증빙 범위도 같은 답", async () => {
    const roleId = await makeFundRole("team");
    await grantFundKeys(roleId, ["evidence.intake"]);
    await grantFundKeys(roleId, ["evidence"], "view");
    const mgmt = await makeFundPerson("경영관리 사원", roleId, "경영관리팀");
    const planning = await makeFundPerson("기획 사원", roleId, "기획1팀");

    expect(await can(mgmt, "evidence.intake", "write")).toBe(true);
    expect(await evidenceScopeFor(mgmt)).toEqual({ rows: "all" });

    expect(await can(planning, "evidence.intake", "write")).toBe(false);
    expect((await evidenceScopeFor(planning)).rows).toBe("published");
  });

  it("시스템 관리자는 소속 없이도 증빙 등록을 쓴다(회사 전체 계급 면제)", async () => {
    const admin = await makeFundPerson("관리자", SYSADMIN_ROLE_ID, null);
    expect(await can(admin, "evidence.intake", "write")).toBe(true);
  });
});

const ACTIONS = ["view", "write"] as const;

// 07.3-01 Task 2: 짝 시험 — 경영관리 소속 통과 / 기획본부 같은 계급 실패 / 회사 전체 계급 불변.
describe("자금 키 8개 짝 표 (D-7301 · D-7311 · D-7313)", () => {
  it("FUND_SCOPED_MENUS × 보기 · 쓰기 — 경영관리 둘 참 · 기획 둘 거짓 · 대표 · 시스템 관리자 참", async () => {
    const w = await buildFundWorld();
    const table: Record<string, Record<string, boolean>> = {};
    const expected: Record<string, Record<string, boolean>> = {};
    for (const menu of FUND_SCOPED_MENUS) {
      for (const action of ACTIONS) {
        const key = `${menu}:${action}`;
        table[key] = {
          mgmtHead: await can(w.mgmtHead, menu, action),
          mgmtStaff: await can(w.mgmtStaff, menu, action),
          planningHead: await can(w.planningHead, menu, action),
          planningStaff: await can(w.planningStaff, menu, action),
          ceo: await can(w.ceo, menu, action),
          sysadmin: await can(w.sysadmin, menu, action),
        };
        expected[key] = { mgmtHead: true, mgmtStaff: true, planningHead: false, planningStaff: false, ceo: true, sysadmin: true };
      }
    }
    expect(table).toEqual(expected);
  });

  it("8개 밖 키는 소속과 무관하다 — 시드 값 · 픽스처 값 그대로(D-7304 · D-7308 · D-7303)", async () => {
    const w = await buildFundWorld();
    await grantFundKeys(DEFAULT_ROLE_ID, ["cards.proxy", "certs.qr"]);
    await grantFundKeys(DEFAULT_ROLE_ID, ["evidence"], "view");
    const keys = [
      ["projects", "view"],
      ["expenses", "view"],
      ["expenses", "write"],
      ["leave", "write"],
      ["cards.proxy", "write"],
      ["evidence", "view"],
      ["certs.qr", "write"],
    ] as const;
    for (const [menu, action] of keys) {
      expect([menu, action, await can(w.mgmtStaff, menu, action), await can(w.planningStaff, menu, action)]).toEqual([menu, action, true, true]);
    }
  });

  it("오늘 팀이 있으면 본부 칸이 경영관리본부여도 거짓이다(팀이 이긴다)", async () => {
    const w = await buildFundWorld();
    await setDivisionColumn(w.planningStaff.id, await orgUnitIdByName("경영관리본부"));
    expect(await can(w.planningStaff, "expenses.payments", "write")).toBe(false);
  });

  it("관리자가 만든 company 계급은 소속 없이도 · 설정이 비어도 참이다", async () => {
    const roleId = await makeFundRole("company");
    await grantAllFundKeys(roleId);
    const person = await makeFundPerson("전사 담당", roleId, null);
    expect(await can(person, "expenses.payments", "write")).toBe(true);
    await db.delete(settingsSimple).where(eq(settingsSimple.key, FUND_DIVISION_SETTING_KEY));
    expect(await can(person, "projects.adjustment", "write")).toBe(true);
  });
});

describe("자금 본부 설정 fail-closed (D-7310)", () => {
  it("설정 행을 지우면 경영관리 둘도 거짓 · 대표는 참", async () => {
    const w = await buildFundWorld();
    await db.delete(settingsSimple).where(eq(settingsSimple.key, FUND_DIVISION_SETTING_KEY));
    expect([await can(w.mgmtStaff, "evidence.intake", "write"), await can(w.mgmtHead, "evidence.intake", "write"), await can(w.ceo, "evidence.intake", "write")]).toEqual([
      false,
      false,
      true,
    ]);
  });

  it("설정이 uuid가 아니면 거짓이다", async () => {
    const w = await buildFundWorld();
    await upsertSimpleValue(SYSTEM_VIEWER, FUND_DIVISION_SETTING_KEY, "경영관리본부", null);
    expect(await can(w.mgmtStaff, "expenses.payments", "write")).toBe(false);
  });

  it("경영관리본부를 보관하면 거짓이다", async () => {
    const w = await buildFundWorld();
    await db.update(orgUnits).set({ archivedAt: new Date() }).where(eq(orgUnits.name, "경영관리본부"));
    expect(await can(w.mgmtStaff, "expenses.payments", "write")).toBe(false);
    expect(await can(w.mgmtHead, "projects.budget", "view")).toBe(false);
  });
});

// D-7312: 도메인 함수도 같은 답 — 기획 쪽은 지금 권한 없음과 같은 모양(같은 오류 · 같은 문구)으로 막힌다.
describe("도메인 표본 (D-7312)", () => {
  async function denial(promise: Promise<unknown>): Promise<{ type: string; message: string }> {
    const error = await promise.then(
      () => null,
      (reason: unknown) => reason,
    );
    if (!(error instanceof Error)) throw new Error("막히지 않았다");
    return { type: error.constructor.name, message: error.message };
  }

  it("예산 현황 읽기 — 경영관리는 통과 · 기획은 권한 없음과 같은 거절", async () => {
    const w = await buildFundWorld();
    const noKey = await makeFundPerson("키 없음", await makeFundRole("team"), "기획1팀");
    await expect(listBudgetRows(w.mgmtStaff, { status: "all" })).resolves.toBeDefined();
    await expect(listBudgetRows(w.planningStaff, { status: "all" })).rejects.toBeInstanceOf(BudgetForbiddenError);
    expect(await denial(listBudgetRows(w.planningStaff, { status: "all" }))).toEqual(await denial(listBudgetRows(noKey, { status: "all" })));
  });

  it("견적 조정 줄 저장 준비 — 조정 쓰기만 가진 경영관리는 통과 · 기획은 권한 없음과 같은 거절", async () => {
    const fx = await purchaseProject();
    const roleId = await makeFundRole("team");
    await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "projects", action: "view", allowed: true });
    await grantFundKeys(roleId, ["projects.adjustment"]);
    await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "quote.amount", visible: true });
    const mgmt = await makeFundPerson("경영관리 조정", roleId, "경영관리팀");
    const planning = await makeFundPerson("기획 조정", roleId, "기획1팀");
    const noKeyRole = await makeFundRole("team");
    await upsertPermission(SYSTEM_VIEWER, { roleId: noKeyRole, menu: "projects", action: "view", allowed: true });
    const noKey = await makeFundPerson("키 없음", noKeyRole, "기획1팀");

    await expect(prepareQuoteLineSave(mgmt, fx.revisionId)).resolves.toMatchObject({ canAdjust: true, canWrite: false });
    await expect(prepareQuoteLineSave(planning, fx.revisionId)).rejects.toBeInstanceOf(QuoteForbiddenError);
    expect(await denial(prepareQuoteLineSave(planning, fx.revisionId))).toEqual(await denial(prepareQuoteLineSave(noKey, fx.revisionId)));
  });

  it("지급 대상 목록 — 경영관리는 통과 · 기획은 권한 없음과 같은 거절", async () => {
    const w = await buildFundWorld();
    const noKey = await makeFundPerson("키 없음", await makeFundRole("team"), "기획1팀");
    await expect(listAllPaymentTargets(w.mgmtStaff, {})).resolves.toBeInstanceOf(Array);
    await expect(listAllPaymentTargets(w.planningStaff, {})).rejects.toBeInstanceOf(ForbiddenError);
    expect(await denial(listAllPaymentTargets(w.planningStaff, {}))).toEqual(await denial(listAllPaymentTargets(noKey, {})));
  });
});

// D-7314: 자금 담당은 프로젝트 · 지출결의를 회사 전체로 본다 — 정보 노출표(visible)는 그대로.
describe("D-7314 보는 범위 확대", () => {
  it("경영관리 사원 지출결의 all · 기획 사원 limited team · 경영관리 책임자 프로젝트 all · 기획 책임자 limited org_unit", async () => {
    const w = await buildFundWorld();
    expect((await rowScopeFor(w.mgmtStaff, "expense")).rows).toBe("all");
    expect(await rowScopeFor(w.planningStaff, "expense")).toMatchObject({ rows: "limited", by: { kind: "team" } });
    expect((await rowScopeFor(w.mgmtHead, "project")).rows).toBe("all");
    expect(await rowScopeFor(w.planningHead, "project")).toMatchObject({ rows: "limited", by: { kind: "org_unit" } });
  });

  it("경영관리 사원에게 증빙 등록만 남기면 지출결의는 넓히지 않는다(키 매핑)", async () => {
    await grantFundKeys(DEFAULT_ROLE_ID, ["evidence.intake"]);
    const mgmt = await makeFundPerson("경영관리 사원", DEFAULT_ROLE_ID, "경영관리팀");
    expect(await can(mgmt, "evidence.intake", "write")).toBe(true);
    expect(await rowScopeFor(mgmt, "expense")).toMatchObject({ rows: "limited", by: { kind: "team" } });
  });

  it("넓어진 사람도 staffDefault 거짓 손익 항목(pnl.amount)은 visible() 거짓 그대로다", async () => {
    const w = await buildFundWorld();
    expect((await rowScopeFor(w.mgmtStaff, "project")).rows).toBe("all");
    expect(await visible(w.mgmtStaff, "pnl.amount")).toBe(false);
  });
});

// D-E1(사용자 카드 2026-10-27 19:46 KST 「5곳도 같이 넓힘」): rows all을 권한 대용으로 쓰는 다섯 곳은 확대를 그대로 따른다 — 코드는 그대로, 곳마다 짝 한 쌍.
describe("D-7314 파급", () => {
  async function pair(keys: readonly string[], action: "view" | "write"): Promise<{ mgmt: Viewer; planning: Viewer }> {
    await grantFundKeys(DEFAULT_ROLE_ID, keys, action);
    return {
      mgmt: await makeFundPerson("경영관리 사원", DEFAULT_ROLE_ID, "경영관리팀"),
      planning: await makeFundPerson("기획 사원", DEFAULT_ROLE_ID, "기획1팀"),
    };
  }

  it("예산 현황 보기만 → 카드 사용 범위 all(corp-card-usages listAccess) · 기획은 own", async () => {
    const { mgmt, planning } = await pair(["projects.budget"], "view");
    expect(await cardUsageReadScope(mgmt)).toEqual({ kind: "all" });
    expect((await cardUsageReadScope(planning)).kind).toBe("own");
  });

  it("예산 현황 보기만 → 구매 요청 listAccess all(남의 팀 요청이 범위 안) · 기획은 자기 요청만", async () => {
    const fx = await purchaseProject();
    await request(fx, fx.onlineLine);
    const { mgmt, planning } = await pair(["projects.budget"], "view");
    expect((await listPurchaseRequests(mgmt, { status: "all" })).anyInScope).toBe(true);
    expect((await listPurchaseRequests(planning, { status: "all" })).anyInScope).toBe(false);
  });

  it("증빙 무효 쓰기만 → 지급 완료 보기 참(paidAllowedBy) · 기획은 거짓", async () => {
    const { mgmt, planning } = await pair(["expenses.evidence_void"], "write");
    expect(await paidViewAllowed(mgmt)).toBe(true);
    expect(await paidViewAllowed(planning)).toBe(false);
  });

  it("증빙 무효 쓰기만 → 비공개 증빙 파일 scopeAll 참(private-files) · 기획은 거짓", async () => {
    const { mgmt, planning } = await pair(["expenses.evidence_void"], "write");
    const othersPrivate = { uploadedBy: randomUUID(), privateToOwner: true };
    expect((await fileVisibilityFor(mgmt, { ownerKind: "expense", evidenceType: null })).visible(othersPrivate)).toBe(true);
    expect((await fileVisibilityFor(planning, { ownerKind: "expense", evidenceType: null })).visible(othersPrivate)).toBe(false);
  });

  it("매출 정산 보기만 → 발행 요청 목록 all(issue-requests) · 기획은 projects.revenue 게이트로 ForbiddenError", async () => {
    const fx = await purchaseProject();
    await insertIssueRequest(
      SYSTEM_VIEWER,
      { id: randomUUID(), projectId: fx.projectId, requestedBy: fx.pm.id, desiredIssueDate: "2026-11-10", amountCurrency: "KRW", amountForeignAmount: null, amountFxRate: "1.0000", amountAmountKrw: 10_000_000, memo: null },
      db,
    );
    const { mgmt, planning } = await pair(["projects.revenue"], "view");
    expect((await listIssueRequests(mgmt, { status: "all" })).totals.count).toBe(1);
    await expect(listIssueRequests(planning, { status: "all" })).rejects.toBeInstanceOf(RevenueForbiddenError);
  });
});
