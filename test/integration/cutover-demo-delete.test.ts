import { randomBytes, randomUUID } from "node:crypto";
import { eq, inArray, ne } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import {
  actionLog,
  documentCounters,
  expenseDateChangeRequests,
  expenseEvidenceReviews,
  files,
  leaveRequests,
  notificationLog,
  projectBudgetEntries,
  projectDocuments,
  projectMembers,
  projects,
  quoteLines,
  settingsSimple,
  settlementApprovals,
  uploadIntents,
} from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createVendor } from "@/domain/vendors";
import { createProject } from "@/domain/projects";
import { createCorpCard } from "@/domain/corp-cards";
import { createExpenseFromLines } from "@/domain/expenses";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { DELETE_ORDER, FILE_TABLES, KEEP_FILE_OWNER_KINDS, KEEP_TABLES } from "@/domain/cutover/tables";
import { insertProject } from "@/repositories/projects";
import { insertQuoteRevision, insertRevision } from "@/repositories/quote-revisions";
import { copyQuoteLines, insertQuoteLineIfAbsent, insertSourcedAdjustmentLine } from "@/repositories/quote-lines";
import { insertRevenueEntry } from "@/repositories/revenue-entries";
import { insertIssueRequest } from "@/repositories/revenue-issue-requests";
import { insertEntry } from "@/repositories/reserve-entries";
import { insertCardUsage } from "@/repositories/corp-card-usages";
import { insertPayment } from "@/repositories/expense-payments";
import { insertPurchaseRequest } from "@/repositories/purchase-requests";
import { seedDemoData } from "@/scripts/demo-data";
import { SETTING_DEFS } from "@/domain/settings/keys";
import { applyCutover, CutoverRefusedError, dryRunCutover, type CutoverDeps } from "@/domain/cutover";
import { CUTOVER_MARKER_KEY } from "@/repositories/cutover";
import { upsertDocumentCounter } from "@/repositories/document-counters";
import { seoulToday } from "@/lib/dates";
import { countRows, makePerson, teamIdByName } from "./approvals-fixtures";
import { insertLinkFixture, insertRecordFixture } from "./fixtures/evidence";

// 08-02(D8-05 · D8-09): 전환 도구 — dry-run(건수 · 확인 문자열) → apply(한 트랜잭션: 비우기 · 카운터 초기화 · 표시 · 행동 로그).
// 백업 조회는 주입한다(실제 GCP 없음).

const NOW = new Date();
const freshBackup = (minutesAgo: number, status = "SUCCESSFUL") =>
  (() => Promise.resolve({ kind: "ok" as const, status, endTime: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString() })) satisfies CutoverDeps["getLastBackup"];
const deps = (getLastBackup: CutoverDeps["getLastBackup"] = freshBackup(10)): CutoverDeps => ({ getLastBackup });

async function makeProject(pm?: Viewer) {
  const person = pm ?? (await makePerson(`PM-${randomUUID().slice(0, 6)}`, "role-pm", "기획1팀"));
  const client = await createVendor(SYSTEM_VIEWER, { name: `클라이언트-${randomUUID().slice(0, 6)}` });
  const project = await createProject(person, {
    clientId: client.vendor.id,
    teamId: await teamIdByName("기획1팀"),
    pmUserId: person.id,
    name: `전환 시험 ${randomUUID().slice(0, 6)}`,
    startDate: "2026-09-01",
    endDate: "2026-12-31",
  });
  return { person, project };
}

async function marker(): Promise<unknown> {
  const [row] = await db.select().from(settingsSimple).where(eq(settingsSimple.key, CUTOVER_MARKER_KEY));
  return row?.value ?? null;
}

async function cutoverApplyLogs(): Promise<number> {
  return (await db.select().from(actionLog).where(eq(actionLog.actionType, "cutover_apply"))).length;
}

describe("전환 도구 — 프로젝트 한 줄 트레이서(08-02 Task 1)", () => {
  it("D3 = A: cutover.at은 설정 레지스트리(SETTING_DEFS)에 없다", () => {
    expect(SETTING_DEFS.filter((def) => def.key === CUTOVER_MARKER_KEY)).toEqual([]);
  });

  it("dry-run은 건수와 확인 문자열만 돌려주고 아무 행도 바꾸지 않는다", async () => {
    await makeProject();
    const before = { projects: await countRows("projects"), revisions: await countRows("quote_revisions"), counters: await countRows("document_counters") };

    const result = await dryRunCutover(SYSTEM_VIEWER);

    if (!("token" in result)) throw new Error("전환 전 dry-run이 건수를 돌려주지 않았다");
    expect(result.mode).toBe("dry-run");
    expect(result.counts.projects).toBeGreaterThanOrEqual(1);
    expect(result.token).toMatch(/^[0-9]+-[0-9a-f]{8}$/);
    expect(result.token.startsWith(`${result.total}-`)).toBe(true);
    expect({ projects: await countRows("projects"), revisions: await countRows("quote_revisions"), counters: await countRows("document_counters") }).toEqual(before);
    expect(await marker()).toBeNull();
  });

  it("apply는 업무 표를 비우고 cert 아닌 카운터를 지우고 표시 · 행동 로그를 남긴다", async () => {
    const { project: demoProject } = await makeProject();
    expect(demoProject.source).toBe("demo");
    await upsertDocumentCounter(SYSTEM_VIEWER, { counterKey: "cert", period: "2026", value: 7 });
    const actionLogBefore = await countRows("action_log");
    const dry = await dryRunCutover(SYSTEM_VIEWER);
    if (!("token" in dry)) throw new Error("dry-run 건수 없음");

    const result = await applyCutover(SYSTEM_VIEWER, { confirm: dry.token, now: NOW, runUrl: null }, deps());

    expect(result.mode).toBe("apply");
    expect(result.token).toBe(dry.token);
    expect(await countRows("projects")).toBe(0);
    expect(await countRows("quote_revisions")).toBe(0);
    expect(await countRows("quote_lines")).toBe(0);
    expect((await db.select().from(documentCounters).where(ne(documentCounters.counterKey, "cert"))).length).toBe(0);
    expect((await db.select().from(documentCounters).where(eq(documentCounters.counterKey, "cert")))[0]?.value).toBe(7);
    const stored = await marker();
    expect(typeof stored).toBe("string");
    expect(stored).toMatch(/\+09:00$/);
    expect(await cutoverApplyLogs()).toBe(1);
    expect(await countRows("action_log")).toBeGreaterThanOrEqual(actionLogBefore + 1);
  });

  it("apply 뒤 새 프로젝트는 source 'live' · 번호는 서울 연도 두 자리 + 001이다", async () => {
    const { person } = await makeProject();
    const dry = await dryRunCutover(SYSTEM_VIEWER);
    if (!("token" in dry)) throw new Error("dry-run 건수 없음");
    await applyCutover(SYSTEM_VIEWER, { confirm: dry.token, now: NOW, runUrl: null }, deps());

    const { project } = await makeProject(person);

    expect(project.source).toBe("live");
    expect(project.number).toBe(`${seoulToday().slice(2, 4)}001`);
  });

  it.each([
    ["4시간 전 성공", freshBackup(240)],
    ["실패한 백업", freshBackup(10, "FAILED")],
    ["백업 없음", () => Promise.resolve({ kind: "none" as const })],
    ["조회 불가", () => Promise.resolve({ kind: "unavailable" as const, reason: "not-configured" })],
  ])("백업 가드 — %s이면 backup_not_fresh로 거부하고 아무 행도 바꾸지 않는다", async (_label, getLastBackup) => {
    await makeProject();
    const dry = await dryRunCutover(SYSTEM_VIEWER);
    if (!("token" in dry)) throw new Error("dry-run 건수 없음");
    const projectsBefore = await countRows("projects");

    const error = await applyCutover(SYSTEM_VIEWER, { confirm: dry.token, now: NOW, runUrl: null }, deps(getLastBackup)).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CutoverRefusedError);
    expect((error as CutoverRefusedError).reason).toBe("backup_not_fresh");
    expect((error as CutoverRefusedError).backup?.kind).toBeDefined();
    expect(await countRows("projects")).toBe(projectsBefore);
    expect(await marker()).toBeNull();
    expect(await cutoverApplyLogs()).toBe(0);
  });

  it("apply 전 새 프로젝트는 source 'demo'다", async () => {
    const { project } = await makeProject();
    const [row] = await db.select({ source: projects.source }).from(projects).where(eq(projects.id, project.id));
    expect(row?.source).toBe("demo");
  });
});

// ── Task 2: 모든 업무 기록 표 · 12개 쓰기 지점 ──

type WriterCtx = { admin: Viewer; vendorId: string; cardId: string; teamId: string };

async function writerCtx(): Promise<WriterCtx> {
  const admin = await makePerson(`관리-${randomUUID().slice(0, 6)}`, SYSADMIN_ROLE_ID, "기획1팀");
  const vendor = await createVendor(SYSTEM_VIEWER, { name: `거래처-${randomUUID().slice(0, 6)}` });
  const card = await createCorpCard(SYSTEM_VIEWER, { issuer: "시험카드사", numberLast4: "4321", label: `카드-${randomUUID().slice(0, 6)}`, kind: "personal", holderUserId: admin.id });
  return { admin, vendorId: vendor.vendor.id, cardId: card.id, teamId: await teamIdByName("기획1팀") };
}

function lineValues(revisionId: string, sortOrder: number) {
  return {
    revisionId,
    sortOrder,
    subcategory: "운영",
    itemName: `전환 시험 줄 ${sortOrder}`,
    quantity: "1",
    unitPriceCurrency: "KRW",
    unitPriceForeignAmount: null,
    unitPriceFxRate: "1",
    unitPriceAmountKrw: 100_000,
    executionCurrency: "KRW",
    executionForeignAmount: null,
    executionFxRate: "1",
    executionAmountKrw: 50_000,
    quoteAmountKrw: 100_000,
    profitKrw: 50_000,
    lineStatus: "not_started",
  };
}

// 저장소 쓰기 지점 12곳을 한 번씩 부른다 — 돌려주는 sources는 그 행이 실제로 받은 source.
async function writeEverySourceTable(ctx: WriterCtx) {
  const { admin } = ctx;
  const suffix = randomUUID().slice(0, 8);
  const sources: Record<string, string | undefined> = {};

  const project = await insertProject(admin, {
    number: `T${suffix}`,
    clientId: ctx.vendorId,
    teamId: ctx.teamId,
    pmUserId: admin.id,
    name: `쓰기 지점 ${suffix}`,
    status: "bidding",
    preEstimateCurrency: "KRW",
    preEstimateForeignAmount: null,
    preEstimateFxRate: "1",
    preEstimateAmountKrw: 0,
  });
  sources.insertProject = project.source;
  const rev1 = await insertQuoteRevision(admin, { projectId: project.id, seq: 1 });
  sources.insertQuoteRevision = rev1.source;
  const line = await insertQuoteLineIfAbsent(admin, { ...lineValues(rev1.id, 1), vendorId: ctx.vendorId });
  if (!line) throw new Error("견적 줄을 넣지 못했다");
  sources.insertQuoteLineIfAbsent = line.source;
  const created = await createExpenseFromLines(admin, { lineIds: [line.id], fields: { note: "전환 시험" } });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error(`지출결의를 만들지 못했다: ${JSON.stringify(created.blocked)}`);

  await db.transaction(async (tx) => {
    const rev2 = await insertRevision(admin, { projectId: project.id, seq: 2 }, tx);
    sources.insertRevision = rev2.source;
    await copyQuoteLines(admin, { fromRevisionId: rev1.id, toRevisionId: rev2.id, withLineage: true }, tx);
    const copied = await tx.select({ source: quoteLines.source }).from(quoteLines).where(eq(quoteLines.revisionId, rev2.id));
    sources.copyQuoteLines = copied.length > 0 && copied.every((row) => row.source === copied[0]?.source) ? copied[0]?.source : `mixed:${copied.length}`;
    const adjustment = await insertSourcedAdjustmentLine(admin, { ...lineValues(rev1.id, 2), sourceExpenseId: expenseId }, tx);
    sources.insertSourcedAdjustmentLine = adjustment.source;
    const revenue = await insertRevenueEntry(admin, { projectId: project.id, kind: "issue", entryDate: "2026-10-01", amountCurrency: "KRW", amountForeignAmount: null, amountFxRate: "1", amountAmountKrw: 1_000 }, tx);
    sources.insertRevenueEntry = revenue?.source;
    const issue = await insertIssueRequest(admin, { projectId: project.id, desiredIssueDate: "2026-10-02", amountAmountKrw: 1_000, requestedBy: admin.id }, tx);
    sources.insertIssueRequest = issue?.source;
    const reserve = await insertEntry(
      admin,
      { id: randomUUID(), clientId: ctx.vendorId, entryDate: "2026-10-01", direction: "deposit", amountCurrency: "KRW", amountForeignAmount: null, amountFxRate: "1", amountAmountKrw: 1_000, projectId: null, evidenceType: null, taxInvoiceNumber: null, note: null },
      tx,
    );
    sources.insertReserveEntry = reserve?.source;
    const usage = await insertCardUsage(
      admin,
      { number: `C${suffix}`, corpCardId: ctx.cardId, usedOn: "2026-10-01", totalAmountKrw: 1_100, supplyKrw: 1_000, vatKrw: 100, evidenceTypeCode: "card", linkKind: "team_cost", teamId: ctx.teamId, usedByUserId: admin.id, registeredBy: admin.id, registeredVia: "self" },
      tx,
    );
    sources.insertCardUsage = usage.source;
    const payment = await insertPayment(admin, { expenseId, payDate: "2026-10-05", transferKrw: 0, payableKrw: 0, diffKrw: 0, paymentMethod: "transfer", processedBy: admin.id }, tx);
    sources.insertPayment = payment.source;
    const request = await insertPurchaseRequest(admin, { number: `P${suffix}`, linkKind: "team_cost", requestedBy: admin.id, itemName: "전환 시험 구매", estimateAmountKrw: 0 }, tx);
    sources.insertPurchaseRequest = request.source;
  });
  return { sources, projectId: project.id, expenseId };
}

function fileRow(ownerKind: string, ownerId: string, uploadedBy: string) {
  return {
    ownerKind,
    ownerId,
    objectKey: `evidence/${randomUUID()}`,
    sha256: randomBytes(32).toString("hex"),
    sizeBytes: 10,
    contentType: "application/pdf",
    originalName: "시험.pdf",
    uploadedBy,
  };
}

// source 칸이 없는 삭제 표 · 파일 표에 최소 행(지킬 파일 종류 둘 포함).
async function fillNonSourceTables(ctx: WriterCtx, written: { projectId: string; expenseId: string }) {
  const by = ctx.admin.id;
  const { projectId, expenseId } = written;
  const recordId = await insertRecordFixture(ctx.admin);
  await insertLinkFixture({ recordId, ownerId: expenseId, attachedBy: by });
  await db.insert(expenseDateChangeRequests).values({ expenseId, requestedBy: by, newDate: "2026-10-03", reason: "날짜 바꿈" });
  await db.insert(expenseEvidenceReviews).values({ expenseId, status: "confirmed", reviewedBy: by });
  await db.insert(files).values([fileRow("expense", expenseId, by), fileRow("vendor_document", randomUUID(), by), fileRow("company_logo", randomUUID(), by)]);
  await db.insert(uploadIntents).values({
    ownerKind: "expense",
    ownerId: expenseId,
    objectKey: `incoming/${randomUUID()}`,
    declaredSize: 10,
    declaredContentType: "application/pdf",
    declaredSha256: randomBytes(32).toString("hex"),
    originalName: "시험.pdf",
    createdBy: by,
    expiresAt: new Date(Date.now() + 3_600_000),
  });
  await db.insert(settlementApprovals).values({ projectId, drafterId: by });
  await db.insert(projectMembers).values({ projectId, userId: by, addedBy: by });
  await db.insert(projectDocuments).values({ projectId, kind: "other", createdBy: by });
  await db.insert(projectBudgetEntries).values({ projectId, reason: "manual", deltaKrw: 1, memo: "시험", createdBy: by });
  await db.insert(leaveRequests).values({ drafterId: by, kind: "full_day", startDate: "2026-10-06", endDate: "2026-10-06", daysQuarters: 4, fiscalYear: 2026 });
  await db.insert(notificationLog).values({ conditionKind: "cutover_test", entity: "expense", entityId: expenseId, recipientId: by, referenceDate: "2026-10-01", message: "시험" });
}

describe("전환 apply — 모든 업무 기록 표(08-02 Task 2)", () => {
  it("삭제 분류 표가 전부 1행 이상인 상태에서 apply하면 전부 비고 유지 표 · 지킬 파일 · cert 카운터는 그대로 · action_log +1", async () => {
    await seedDemoData();
    const ctx = await writerCtx();
    const written = await writeEverySourceTable(ctx);
    expect(Object.values(written.sources).every((source) => source === "demo")).toBe(true);
    await fillNonSourceTables(ctx, written);
    for (const table of [...DELETE_ORDER, ...FILE_TABLES]) expect(await countRows(table), table).toBeGreaterThan(0);

    await upsertDocumentCounter(SYSTEM_VIEWER, { counterKey: "cert", period: "2026", value: 7 });
    const keptTables = KEEP_TABLES.filter((table) => table !== "settings_simple");
    const countAll = async () => Object.fromEntries(await Promise.all(keptTables.map(async (table) => [table, await countRows(table)] as const)));
    const keepBefore = await countAll();
    const keptFilesBefore = (await db.select().from(files).where(inArray(files.ownerKind, [...KEEP_FILE_OWNER_KINDS]))).length;
    const settingsBefore = await countRows("settings_simple");
    const actionLogBefore = await countRows("action_log");
    const dry = await dryRunCutover(SYSTEM_VIEWER);
    if (!("token" in dry)) throw new Error("dry-run 건수 없음");

    await applyCutover(SYSTEM_VIEWER, { confirm: dry.token, now: NOW, runUrl: null }, deps());

    for (const table of DELETE_ORDER) expect(await countRows(table), table).toBe(0);
    expect(await countRows("upload_intents")).toBe(0);
    const remainingFiles = await db.select({ ownerKind: files.ownerKind }).from(files);
    expect(keptFilesBefore).toBeGreaterThanOrEqual(2);
    expect(remainingFiles.length).toBe(keptFilesBefore);
    expect(remainingFiles.every((row) => (KEEP_FILE_OWNER_KINDS as readonly string[]).includes(row.ownerKind))).toBe(true);
    expect(await countAll()).toEqual(keepBefore);
    expect(await countRows("settings_simple")).toBe(settingsBefore + 1);
    expect(await countRows("action_log")).toBe(actionLogBefore + 1);
    expect((await db.select().from(documentCounters).where(eq(documentCounters.counterKey, "cert")))[0]?.value).toBe(7);
  }, 240_000);

  it("apply 뒤 저장소 쓰기 지점 12곳이 전부 source 'live'로 쓴다(복사한 줄 포함)", async () => {
    const ctx = await writerCtx();
    const dry = await dryRunCutover(SYSTEM_VIEWER);
    if (!("token" in dry)) throw new Error("dry-run 건수 없음");
    await applyCutover(SYSTEM_VIEWER, { confirm: dry.token, now: NOW, runUrl: null }, deps());

    const { sources } = await writeEverySourceTable(ctx);

    expect(Object.keys(sources)).toHaveLength(12);
    expect(sources).toEqual(Object.fromEntries(Object.keys(sources).map((key) => [key, "live"])));
  }, 120_000);
});
