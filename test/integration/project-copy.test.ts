import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, codeItems, projects, quoteLines, quoteRevisions, revenueEntries, teams } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { createProject, getProjectCopySource, ProjectInputRejectedError, type ProjectInput } from "@/domain/projects";
import { rememberFxRate } from "@/domain/money/currency";
import { getSettingValue } from "@/domain/settings/registry";
import { FX_RECENT_RATE_USD } from "@/domain/settings/keys";
import { getCurrentQuoteRevision } from "@/domain/quotes/lines";
import { log } from "@/lib/log";

// 04-15(D-70 · PROJ-05 · CEO 리뷰 B-32 · 사용자 D19-10 · D19-3 · B-26) — 프로젝트 복사 등록. 복사는 기본 정보와 견적 줄
// 구조(견적 줄 · 견적 외 비용, 보관 · 취소 제외)까지만이고 돈 기록(매출 · 조정 · 계보 · 기간 · 총 매출 예상가)은 따라오지 않는다.

type Menu = { menu: string; action: "view" | "write" };

const writerMenus: Menu[] = [
  { menu: "projects", action: "view" },
  { menu: "projects", action: "write" },
];

async function makeViewer(menus: Menu[], infoItems: string[] = ["project.value", "quote.amount"]): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `복사 계급-${randomUUID()}` });
  const { userId } = await createAccount(SYSTEM_VIEWER, {
    email: `copy-${randomUUID()}@example.test`,
    name: "복사 테스트 사람",
    roleId: role.id,
  });
  for (const entry of menus) {
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: entry.menu, action: entry.action, allowed: true });
  }
  for (const infoItem of infoItems) {
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  }
  return { id: userId, roleId: role.id };
}

type LineInsert = typeof quoteLines.$inferInsert;

async function insertLine(revisionId: string, patch: Partial<LineInsert> = {}) {
  const [row] = await db
    .insert(quoteLines)
    .values({
      revisionId,
      subcategory: "기타",
      itemName: `항목-${randomUUID()}`,
      unitPriceAmountKrw: 100_000,
      executionAmountKrw: 40_000,
      quoteAmountKrw: 100_000,
      profitKrw: 60_000,
      ...patch,
    })
    .returning();
  if (!row) throw new Error("줄 삽입 실패");
  return row;
}

// 원본: 1차(옛 줄 하나) → 2차(고객 승인) 현재 차수에 견적 줄 둘 · 견적 외 비용 하나 · 조정 하나 · 보관된 줄 하나 · 취소
// 상태 견적 줄 하나. 기간 · 총 매출 예상가 · 발행 줄이 있다.
async function setupOriginal() {
  const pm = await makeViewer(writerMenus);
  const client = await insertVendor(SYSTEM_VIEWER, { name: `거래처-${randomUUID()}`, normalizedName: `거래처-${randomUUID()}` });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  const [subcategory] = await db.select().from(codeItems).where(eq(codeItems.tableKey, "quote_subcategory")).limit(1);
  if (!subcategory) throw new Error("시드된 quote_subcategory 코드 항목이 없습니다");
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: `공급처-${randomUUID()}`, normalizedName: `공급처-${randomUUID()}` });

  const original = await createProject(SYSTEM_VIEWER, {
    clientId: client.id,
    teamId: team.id,
    pmUserId: pm.id,
    name: `원본-${randomUUID()}`,
    startDate: "2026-09-01",
    endDate: "2026-09-30",
  });
  await db
    .update(projects)
    .set({ preEstimateCurrency: "KRW", preEstimateFxRate: "1.0000", preEstimateAmountKrw: 50_000_000 })
    .where(eq(projects.id, original.id));
  const firstRevision = await getCurrentQuoteRevision(SYSTEM_VIEWER, original.id);
  if (!firstRevision) throw new Error("1차 차수가 없습니다");
  await insertLine(firstRevision.id, { itemName: "옛 차수 줄" });
  const [secondRevision] = await db
    .insert(quoteRevisions)
    .values({ projectId: original.id, seq: 2, customerApprovedAt: new Date(), customerApprovedBy: pm.id })
    .returning();
  if (!secondRevision) throw new Error("2차 삽입 실패");

  const quoteA = await insertLine(secondRevision.id, {
    sortOrder: 0,
    subcategory: subcategory.value,
    itemName: "무대 설치",
    vendorId: vendor.id,
    quantity: "2",
    unitPriceAmountKrw: 300_000,
    quoteAmountKrw: 600_000,
    executionAmountKrw: 250_000,
    profitKrw: 350_000,
    note: "원본 비고",
    customFields: { memo: "원본 값" },
    version: 5,
  });
  const quoteB = await insertLine(secondRevision.id, { sortOrder: 1, itemName: "음향 장비" });
  const outOfQuote = await insertLine(secondRevision.id, {
    sortOrder: 2,
    lineKind: "out_of_quote",
    subcategory: "out_of_quote",
    itemName: "현장 식대",
    unitPriceAmountKrw: 0,
    quoteAmountKrw: 0,
    profitKrw: -40_000,
  });
  await insertLine(secondRevision.id, {
    lineKind: "adjustment",
    subcategory: "adjustment",
    itemName: "원가 보정",
    unitPriceAmountKrw: 0,
    quoteAmountKrw: 0,
    executionAmountKrw: 10_000,
    profitKrw: -10_000,
  });
  await insertLine(secondRevision.id, { itemName: "보관된 줄", archivedAt: new Date(), archivedBy: pm.id });
  await insertLine(secondRevision.id, {
    itemName: "취소된 줄",
    lineStatus: "cancelled",
    quoteAmountKrw: 0,
    profitKrw: -40_000,
  });
  await db.insert(revenueEntries).values({
    projectId: original.id,
    kind: "issue",
    entryDate: "2026-09-10",
    amountCurrency: "KRW",
    amountFxRate: "1.0000",
    amountAmountKrw: 1_000_000,
  });

  return { pm, client, team, original, secondRevision, copied: [quoteA, quoteB, outOfQuote] };
}

async function snapshotProject(projectId: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  const revisions = await db.select().from(quoteRevisions).where(eq(quoteRevisions.projectId, projectId)).orderBy(asc(quoteRevisions.seq));
  const lines = [];
  for (const revision of revisions) {
    lines.push(...(await db.select().from(quoteLines).where(eq(quoteLines.revisionId, revision.id)).orderBy(asc(quoteLines.id))));
  }
  const revenue = await db.select().from(revenueEntries).where(eq(revenueEntries.projectId, projectId)).orderBy(asc(revenueEntries.id));
  return { project, revisions, lines, revenue };
}

function deniedWarnings(calls: readonly (readonly unknown[])[]): unknown[] {
  return calls.filter((call) => call[0] === "write.denied");
}

const COPY_SOURCE_MISSING = "복사할 프로젝트 없음 · 새로 고침";

describe("프로젝트 복사 등록(04-15 Task 1 · D-70, 실제 Postgres)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("(c1) 원본 현재 차수의 견적 줄 둘 + 견적 외 비용만 새 1차로 — 계보 없음 · version 1 · 업무 칸 그대로, 조정 · 보관 · 취소 줄과 기간 · 총 매출 예상가 · 매출은 따라오지 않는다", async () => {
    const { pm, client, team, original, copied } = await setupOriginal();

    const created = await createProject(pm, {
      clientId: client.id,
      teamId: team.id,
      pmUserId: pm.id,
      name: `복사본-${randomUUID()}`,
      copyFromProjectId: original.id,
    });

    expect(created.status).toBe("bidding");
    expect(created.number).not.toBe(original.number);
    expect(created.startDate).toBeNull();
    expect(created.endDate).toBeNull();

    const [row] = await db.select().from(projects).where(eq(projects.id, created.id));
    expect(row?.preEstimateAmountKrw).toBe(0);
    expect(row?.preEstimateCurrency).toBe("KRW");

    const revisions = await db.select().from(quoteRevisions).where(eq(quoteRevisions.projectId, created.id));
    expect(revisions).toHaveLength(1);
    expect(revisions[0]?.seq).toBe(1);
    expect(revisions[0]?.customerApprovedAt).toBeNull();

    const lines = await db.select().from(quoteLines).where(eq(quoteLines.revisionId, revisions[0]!.id)).orderBy(asc(quoteLines.sortOrder));
    expect(lines.map((line) => line.itemName)).toEqual(["무대 설치", "음향 장비", "현장 식대"]);
    expect(lines.map((line) => line.lineKind)).toEqual(["quote", "quote", "out_of_quote"]);
    for (const line of lines) {
      expect(line.copiedFromLineId).toBeNull();
      expect(line.version).toBe(1);
      expect(line.archivedAt).toBeNull();
      expect(line.lineStatus).not.toBe("cancelled");
    }
    const [first] = lines;
    const [source] = copied;
    expect(first?.vendorId).toBe(source?.vendorId);
    expect(first?.quantity).toBe(source?.quantity);
    expect(first?.subcategory).toBe(source?.subcategory);
    expect(first?.unitPriceAmountKrw).toBe(600_000 / 2);
    expect(first?.quoteAmountKrw).toBe(600_000);
    expect(first?.executionAmountKrw).toBe(250_000);
    expect(first?.profitKrw).toBe(350_000);
    expect(first?.note).toBe("원본 비고");
    expect(first?.customFields).toEqual({ memo: "원본 값" });
    expect(first?.lineStatus).toBe(source?.lineStatus);

    const revenue = await db.select().from(revenueEntries).where(eq(revenueEntries.projectId, created.id));
    expect(revenue).toHaveLength(0);

    const [logged] = await db
      .select()
      .from(actionLog)
      .where(and(eq(actionLog.entityId, created.id), eq(actionLog.actionType, "document_create")));
    expect(logged?.detail).toMatchObject({ copiedFromProjectId: original.id, copiedLineCount: 3 });
  });

  it("(c2) 복사 뒤에도 원본의 프로젝트 · 차수 · 줄 · 매출이 한 칸도 바뀌지 않는다(DB 재조회)", async () => {
    const { pm, client, team, original } = await setupOriginal();
    const before = await snapshotProject(original.id);

    await createProject(pm, { clientId: client.id, teamId: team.id, pmUserId: pm.id, name: `복사본-${randomUUID()}`, copyFromProjectId: original.id });

    expect(await snapshotProject(original.id)).toEqual(before);
  });

  it("(c3) 출처 한 줄의 {k}(getProjectCopySource 줄 수)가 실제 복사된 줄 수와 같고, 기본 정보 넷을 돌려준다", async () => {
    const { pm, client, team, original } = await setupOriginal();

    const source = await getProjectCopySource(pm, original.id);
    expect(source).toEqual({
      number: original.number,
      name: original.name,
      clientId: client.id,
      teamId: team.id,
      pmUserId: pm.id,
      lineCount: 3,
    });

    const created = await createProject(pm, { clientId: client.id, teamId: team.id, pmUserId: pm.id, name: `복사본-${randomUUID()}`, copyFromProjectId: original.id });
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, created.id);
    const lines = await db.select().from(quoteLines).where(eq(quoteLines.revisionId, revision!.id));
    expect(lines).toHaveLength(source!.lineCount);
  });

  it("(c4) 보는 사람의 행 범위 밖 원본은 거부되고 write.denied 경고가 한 번(출처 id, 금액 없음) · 프로젝트 행이 생기지 않고 미리 채우기도 없다", async () => {
    const { client, team, original } = await setupOriginal();
    const outsider = await makeViewer([{ menu: "projects", action: "write" }]);
    const warn = vi.spyOn(log, "warn");
    const name = `범위밖-${randomUUID()}`;

    await expect(
      createProject(outsider, { clientId: client.id, teamId: team.id, pmUserId: outsider.id, name, copyFromProjectId: original.id }),
    ).rejects.toThrow(COPY_SOURCE_MISSING);

    const denied = deniedWarnings(warn.mock.calls);
    expect(denied).toHaveLength(1);
    const payload = (denied[0] as unknown[])[1] as Record<string, unknown>;
    expect(payload).toMatchObject({ viewerId: outsider.id, rule: "project.copy-source", sourceProjectId: original.id });
    expect(Object.keys(payload).some((key) => /amount|krw/i.test(key))).toBe(false);
    expect(await db.select().from(projects).where(eq(projects.name, name))).toHaveLength(0);
    expect(await getProjectCopySource(outsider, original.id)).toBeNull();
  });

  it("(c5) 보관된 원본 · 없는 id · uuid 모양이 아닌 id도 같은 문구로 거부되고 미리 채우기가 없다", async () => {
    const { pm, client, team, original } = await setupOriginal();
    await db.update(projects).set({ archivedAt: new Date(), archivedBy: pm.id }).where(eq(projects.id, original.id));

    for (const copyFromProjectId of [original.id, randomUUID(), "not-a-uuid"]) {
      const name = `거부-${randomUUID()}`;
      await expect(
        createProject(pm, { clientId: client.id, teamId: team.id, pmUserId: pm.id, name, copyFromProjectId }),
      ).rejects.toThrow(COPY_SOURCE_MISSING);
      expect(await db.select().from(projects).where(eq(projects.name, name))).toHaveLength(0);
      expect(await getProjectCopySource(pm, copyFromProjectId)).toBeNull();
    }
  });
});

// 04-15 Task 2(D-52 · D-71 · CEO 리뷰 B-17 · 엔지 리뷰 B §1 · §2 · PR #38 「날짜 순서」) — 등록 폼의 총 매출 예상가와 등록 기간 검증.
describe("등록의 총 매출 예상가 · 기간 검증(04-15 Task 2, 실제 Postgres)", () => {
  async function setupRegistration() {
    const pm = await makeViewer(writerMenus);
    const client = await insertVendor(SYSTEM_VIEWER, { name: `거래처-${randomUUID()}`, normalizedName: `거래처-${randomUUID()}` });
    const [team] = await db.select().from(teams).limit(1);
    if (!team) throw new Error("시드된 팀이 없습니다");
    const base = (): ProjectInput => ({ clientId: client.id, teamId: team.id, pmUserId: pm.id, name: `등록-${randomUUID()}` });
    return { pm, base };
  }

  async function rowOf(projectId: string) {
    const [row] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!row) throw new Error("프로젝트 행이 없습니다");
    return row;
  }

  async function expectRejected(pm: Viewer, input: ProjectInput, field: string, reason: string) {
    const error = await createProject(pm, input).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ProjectInputRejectedError);
    expect((error as ProjectInputRejectedError).errors).toEqual([{ field, reason }]);
    expect(await db.select().from(projects).where(eq(projects.name, input.name))).toHaveLength(0);
  }

  it("(p1) KRW 120,000,000 → 원화 120000000 · KRW · 환율 1로 저장된다", async () => {
    const { pm, base } = await setupRegistration();
    const created = await createProject(pm, { ...base(), preEstimate: { currency: "KRW", amount: 120_000_000, fxRate: 1 } });
    const row = await rowOf(created.id);
    expect(row.preEstimateAmountKrw).toBe(120_000_000);
    expect(row.preEstimateCurrency).toBe("KRW");
    expect(row.preEstimateFxRate).toBe("1.0000");
    expect(row.preEstimateForeignAmount).toBeNull();
  });

  it("(p2) KRW에 환율 1,350을 실은 위조 요청도 원화 120,000,000 · 환율 1로 저장된다(B-17)", async () => {
    const { pm, base } = await setupRegistration();
    const created = await createProject(pm, { ...base(), preEstimate: { currency: "KRW", amount: 120_000_000, fxRate: 1350 } });
    const row = await rowOf(created.id);
    expect(row.preEstimateAmountKrw).toBe(120_000_000);
    expect(row.preEstimateFxRate).toBe("1.0000");
  });

  it("(p3) USD 100,000 · 환율 1,350 → 외화 · 환율 · 원화 환산액 저장, 환율을 고친 저장만 fx.recent_rate.USD를 갱신한다", async () => {
    const { pm, base } = await setupRegistration();
    await rememberFxRate("USD", 1111);

    const untouched = await createProject(pm, { ...base(), preEstimate: { currency: "USD", amount: 100_000, fxRate: 1400 } });
    expect((await rowOf(untouched.id)).preEstimateAmountKrw).toBe(140_000_000);
    expect(await getSettingValue(FX_RECENT_RATE_USD)).toBe(1111);

    const created = await createProject(pm, {
      ...base(),
      preEstimate: { currency: "USD", amount: 100_000, fxRate: 1350 },
      preEstimateFxRateTouched: true,
    });
    const row = await rowOf(created.id);
    expect(row.preEstimateCurrency).toBe("USD");
    expect(row.preEstimateForeignAmount).toBe("100000.00");
    expect(row.preEstimateFxRate).toBe("1350.0000");
    expect(row.preEstimateAmountKrw).toBe(135_000_000);
    expect(await getSettingValue(FX_RECENT_RATE_USD)).toBe(1350);
  });

  it("(p4) USD 환율 0 · 음수 금액 · 원화 환산 상한 넘김은 그 칸의 한국어 이유로 거부되고 행이 없다 — 거부된 환율 고친 USD 등록은 최근 환율을 바꾸지 않는다", async () => {
    const { pm, base } = await setupRegistration();
    await rememberFxRate("USD", 1111);

    await expectRejected(
      pm,
      { ...base(), preEstimate: { currency: "USD", amount: 100, fxRate: 0 }, preEstimateFxRateTouched: true },
      "preEstimateFxRate",
      "환율 0 이하 · 환율 수정",
    );
    await expectRejected(pm, { ...base(), preEstimate: { currency: "KRW", amount: -1, fxRate: 1 } }, "preEstimateAmount", "총 매출 예상가는 0 이상 · 금액 수정");
    await expectRejected(
      pm,
      { ...base(), preEstimate: { currency: "KRW", amount: 1_000_000_000_000, fxRate: 1 } },
      "preEstimateAmount",
      "금액이 상한을 넘습니다 · 999,999,999,999원 이하",
    );
    await expectRejected(
      pm,
      { ...base(), preEstimate: { currency: "USD", amount: 1_000_000_000, fxRate: 1350 }, preEstimateFxRateTouched: true },
      "preEstimateAmount",
      "금액이 상한을 넘습니다 · 999,999,999,999원 이하",
    );
    await expectRejected(
      pm,
      { ...base(), preEstimate: { currency: "USD", amount: 100, fxRate: 1350.12345 }, preEstimateFxRateTouched: true },
      "preEstimateFxRate",
      "환율은 소수 4자리까지",
    );
    await expectRejected(
      pm,
      { ...base(), preEstimate: { currency: "USD", amount: 1, fxRate: 100_000_000 }, preEstimateFxRateTouched: true },
      "preEstimateFxRate",
      "환율 상한 초과 · 환율 수정",
    );
    expect(await getSettingValue(FX_RECENT_RATE_USD)).toBe(1111);
  });

  it("(p5) 등록의 종료일이 시작일보다 앞이거나 날짜가 아니면 04-22와 같은 문구의 칸 오류로 거부되고 행이 없다(PR #38 「날짜 순서」)", async () => {
    const { pm, base } = await setupRegistration();
    await expectRejected(pm, { ...base(), startDate: "2026-09-20", endDate: "2026-09-10" }, "endDate", "종료일이 시작일보다 빠름 · 종료일 수정");
    await expectRejected(pm, { ...base(), startDate: "2026-02-30" }, "startDate", "날짜 형식 오류 · 2026-09-18처럼");
  });

  it("(p6) 총 매출 예상가를 비우면 04-01 기본 저장(원화 0 · KRW · 환율 1)과 같다(B-37)", async () => {
    const { pm, base } = await setupRegistration();
    const created = await createProject(pm, base());
    const row = await rowOf(created.id);
    expect(row.preEstimateAmountKrw).toBe(0);
    expect(row.preEstimateCurrency).toBe("KRW");
    expect(row.preEstimateFxRate).toBe("1.0000");
    expect(row.preEstimateForeignAmount).toBeNull();
  });
});
