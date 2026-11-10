import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, projects, quoteLines, quoteRevisions, teams } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { approvalBasis } from "@/repositories/quote-revisions";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, ForbiddenError } from "@/domain/quotes/lines";
import { canPrintQuoteRevision, getQuoteClientPrint } from "@/domain/quotes/client-print";
import { listRevisionSummaries } from "@/domain/quotes/revisions";
import { recordDocumentPrint } from "@/domain/print/record";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { makePerson } from "./approvals-fixtures";
import { grantFundKeys, makeFundRole } from "./fixtures/fund-scope";

// 07.2-10 PU3 · PU4(D-7221 · D-7226 · D-7227 · D-7229) — 고객 견적서 인쇄 읽기 · 보냄 기록. 읽기 권리 = 금액 노출 + 프로젝트 쓰기(쓰기 용도 행 범위),
// 열기만으로는 기록 0, 출력 기록은 한 트랜잭션에서 차수 printed_at · printed_by + 공용 document_print 한 행이다.

type Menu = { menu: string; action: "view" | "write" };

async function makeViewer(menus: Menu[], infoItems: string[] = ["project.value", "quote.amount"]): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `인쇄 계급-${randomUUID()}`, viewScope: "company" });
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `qp-${randomUUID()}@example.test`, name: "인쇄 테스트 사람", roleId: role.id });
  for (const entry of menus) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: entry.menu, action: entry.action, allowed: true });
  for (const infoItem of infoItems) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  return { id: userId, roleId: role.id };
}

const writerMenus: Menu[] = [
  { menu: "projects", action: "view" },
  { menu: "projects", action: "write" },
];

async function setupProject(teamName?: string) {
  const pm = await makeViewer(writerMenus);
  const client = await insertVendor(SYSTEM_VIEWER, { name: `고객사-${randomUUID()}`, normalizedName: `고객사-${randomUUID()}` });
  const teamRows = await db.select().from(teams);
  const team = teamName ? teamRows.find((row) => row.name === teamName) : teamRows.find((row) => row.name !== "기획1팀");
  if (!team) throw new Error("시드된 팀이 없습니다");
  const project = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: team.id, pmUserId: pm.id, name: `인쇄-${randomUUID()}` });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("1차 차수가 없습니다");
  return { project, revisionId: revision.id, pm, clientName: client.name };
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

async function printRows(documentId: string) {
  return db.select().from(actionLog).where(and(eq(actionLog.actionType, "document_print"), eq(actionLog.documentId, documentId)));
}

async function revisionRow(revisionId: string) {
  const [row] = await db.select().from(quoteRevisions).where(eq(quoteRevisions.id, revisionId));
  if (!row) throw new Error("차수가 없습니다");
  return row;
}

async function filled() {
  const fx = await setupProject();
  await insertLine(fx.revisionId, { itemName: "무대 설치", sortOrder: 0, quantity: "2.00", days: "3.00", unitPriceAmountKrw: 100_000, quoteAmountKrw: 600_000, clientRemark: "고객 비고 글자", note: "내부 비고 글자", executionAmountKrw: 333_333 });
  await insertLine(fx.revisionId, { itemName: "진행요원", sortOrder: 1, subcategory: "staffing", quoteAmountKrw: 250_000, unitPriceAmountKrw: 250_000 });
  await insertLine(fx.revisionId, { itemName: "카드 쓴 견적 외", sortOrder: 2, lineKind: "out_of_quote", quoteAmountKrw: 0, unitPriceAmountKrw: 0, executionAmountKrw: 70_000 });
  await insertLine(fx.revisionId, { itemName: "조정 줄", sortOrder: 3, lineKind: "adjustment", subcategory: "adjustment", quoteAmountKrw: 0, unitPriceAmountKrw: 0, executionAmountKrw: -5_000 });
  await insertLine(fx.revisionId, { itemName: "취소 줄", sortOrder: 4, lineStatus: "cancelled", quoteAmountKrw: 0 });
  await insertLine(fx.revisionId, { itemName: "대행 수수료", sortOrder: 5, lineKind: "commission", subcategory: "commission", unitPriceAmountKrw: 85_000, quoteAmountKrw: 85_000, executionAmountKrw: 0 });
  return fx;
}

describe("getQuoteClientPrint — 고객용 투영 읽기", () => {
  it("금액 노출 + 프로젝트 쓰기 권리자는 견적 줄 · 수수료 줄만 받고 내부 칸은 한 글자도 없다", async () => {
    const fx = await filled();
    const dto = await getQuoteClientPrint(fx.pm, fx.revisionId);
    expect(dto).not.toBeNull();
    expect(dto?.ref).toBe(`${fx.project.number}-1`);
    expect(dto?.projectId).toBe(fx.project.id);
    expect(dto?.clientName).toBe(fx.clientName);
    expect(dto?.lines.map((line) => line.item)).toEqual(["무대 설치", "진행요원"]);
    expect(dto?.commissionLines.map((line) => line.item)).toEqual(["대행 수수료"]);
    expect(dto?.lines[0]).toMatchObject({ quantity: 2, days: 3, unitPriceKrw: 100_000, amountKrw: 600_000, remark: "고객 비고 글자" });
    const text = JSON.stringify(dto);
    for (const hidden of ["내부 비고 글자", "333333", "카드 쓴 견적 외", "조정 줄", "취소 줄", "vendor", "execution", "profit"]) expect(text, hidden).not.toContain(hidden);
  });

  it("Grand Total은 같은 차수 승인 합계(approvalBasis.totalKrw)와 같다", async () => {
    const fx = await filled();
    const dto = await getQuoteClientPrint(fx.pm, fx.revisionId);
    const basis = await approvalBasis(SYSTEM_VIEWER, fx.revisionId);
    expect(dto?.grandTotalKrw).toBe(935_000);
    expect(dto?.grandTotalKrw).toBe(basis.totalKrw);
  });

  it("금액을 볼 수 없는 계정은 ForbiddenError다", async () => {
    const fx = await filled();
    const noAmount = await makeViewer(writerMenus, ["project.value"]);
    await expect(getQuoteClientPrint(noAmount, fx.revisionId)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("프로젝트 읽기만 가진 계정(쓰기 없음)은 null이고 요약 printable도 거짓이다", async () => {
    const fx = await filled();
    const readOnly = await makeViewer([{ menu: "projects", action: "view" }]);
    expect(await getQuoteClientPrint(readOnly, fx.revisionId)).toBeNull();
    expect(await canPrintQuoteRevision(readOnly, fx.revisionId)).toBe(false);
    const summaries = await listRevisionSummaries(readOnly, fx.project.id);
    expect(summaries[0]?.printable).toBe(false);
  });

  it("자금 키로 보기만 넓어진 계정은 원래 쓰기 범위 밖 팀 프로젝트에서 null이고 기록도 거부된다", async () => {
    const fx = await filled();
    const roleId = await makeFundRole("team");
    await grantFundKeys(roleId, ["projects"], "write");
    await grantFundKeys(roleId, ["projects.revenue"], "view");
    for (const infoItem of ["project.value", "quote.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem, visible: true });
    const outsider = await makePerson("자금 보기 계정", roleId, "기획1팀");
    const projectTeam = (await db.select().from(teams).where(eq(teams.id, fx.project.teamId)))[0]?.name;
    expect(projectTeam).not.toBe("기획1팀");
    expect(await getQuoteClientPrint(outsider, fx.revisionId)).toBeNull();
    await expect(recordDocumentPrint(outsider, { kind: "quote", id: fx.revisionId })).rejects.toBeInstanceOf(UserFacingError);
    expect((await revisionRow(fx.revisionId)).printedAt).toBeNull();
    expect(await printRows(fx.revisionId)).toHaveLength(0);
  });

  it("같은 행 범위여도 메뉴 읽기만 가진 계정(담당 팀 사원)은 null · printable 거짓 · 기록 거부", async () => {
    const fx = await setupProject("기획1팀");
    await insertLine(fx.revisionId, { itemName: "무대" });
    const roleId = await makeFundRole("team");
    await grantFundKeys(roleId, ["projects"], "view");
    for (const infoItem of ["project.value", "quote.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem, visible: true });
    const staff = await makePerson("담당 팀 사원", roleId, "기획1팀");
    expect(await getQuoteClientPrint(staff, fx.revisionId)).toBeNull();
    expect((await listRevisionSummaries(staff, fx.project.id))[0]?.printable).toBe(false);
    await expect(recordDocumentPrint(staff, { kind: "quote", id: fx.revisionId })).rejects.toBeInstanceOf(UserFacingError);
    expect(await printRows(fx.revisionId)).toHaveLength(0);
  });

  it("완료 프로젝트 · 보관된 프로젝트는 null이고 요약 printable이 거짓이다(결정 j)", async () => {
    const completed = await filled();
    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, completed.project.id));
    expect(await getQuoteClientPrint(completed.pm, completed.revisionId)).toBeNull();
    expect((await listRevisionSummaries(completed.pm, completed.project.id))[0]?.printable).toBe(false);

    const archived = await filled();
    await db.update(projects).set({ archivedAt: new Date() }).where(eq(projects.id, archived.project.id));
    expect(await getQuoteClientPrint(archived.pm, archived.revisionId)).toBeNull();
  });

  it("보관된 프로젝트 + 보관 보기 권리자(includeArchived)도 null · printable 거짓이다", async () => {
    const fx = await filled();
    const viewer = await makeViewer([...writerMenus, { menu: "admin.archive", action: "view" }]);
    await db.update(projects).set({ pmUserId: viewer.id }).where(eq(projects.id, fx.project.id));
    expect(await getQuoteClientPrint(viewer, fx.revisionId)).not.toBeNull();
    await db.update(projects).set({ archivedAt: new Date() }).where(eq(projects.id, fx.project.id));
    expect(await getQuoteClientPrint(viewer, fx.revisionId)).toBeNull();
    expect(await canPrintQuoteRevision(viewer, fx.revisionId)).toBe(false);
  });

  it("요약 printable은 getQuoteClientPrint 결과 유무와 같다 · 열기만으로는 기록 0", async () => {
    const fx = await filled();
    const summaries = await listRevisionSummaries(fx.pm, fx.project.id);
    expect(summaries[0]?.printable).toBe((await getQuoteClientPrint(fx.pm, fx.revisionId)) !== null);
    expect(summaries[0]?.printedOn).toBeNull();
    expect((await revisionRow(fx.revisionId)).printedAt).toBeNull();
    expect(await printRows(fx.revisionId)).toHaveLength(0);
  });

  it("UUID 모양이 아니거나 없는 차수는 null이다", async () => {
    const fx = await filled();
    expect(await getQuoteClientPrint(fx.pm, "not-a-uuid")).toBeNull();
    expect(await getQuoteClientPrint(fx.pm, randomUUID())).toBeNull();
  });
});

describe("recordDocumentPrint({ kind: quote }) — 보냄 기록", () => {
  it("출력 기록은 차수 printed_at · printed_by를 채우고 document_print 한 행(detail kind quote · number)을 남긴다", async () => {
    const fx = await filled();
    await recordDocumentPrint(fx.pm, { kind: "quote", id: fx.revisionId });
    const revision = await revisionRow(fx.revisionId);
    expect(revision.printedAt).not.toBeNull();
    expect(revision.printedBy).toBe(fx.pm.id);
    const rows = await printRows(fx.revisionId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorId: fx.pm.id, entity: "quote_revision", entityId: fx.revisionId, documentId: fx.revisionId });
    expect(rows[0]?.detail).toEqual({ kind: "quote", number: `${fx.project.number}-1` });
    const summary = (await listRevisionSummaries(fx.pm, fx.project.id))[0];
    expect(summary?.printedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("5초 안 두 번은 한 행이고 printed_at은 첫 값 그대로다 · 창이 0이면 두 행이고 printed_at이 갱신된다", async () => {
    const fx = await filled();
    await recordDocumentPrint(fx.pm, { kind: "quote", id: fx.revisionId });
    const first = (await revisionRow(fx.revisionId)).printedAt;
    await recordDocumentPrint(fx.pm, { kind: "quote", id: fx.revisionId });
    expect(await printRows(fx.revisionId)).toHaveLength(1);
    expect((await revisionRow(fx.revisionId)).printedAt?.getTime()).toBe(first?.getTime());

    await recordDocumentPrint(fx.pm, { kind: "quote", id: fx.revisionId }, { windowSeconds: 0 });
    expect(await printRows(fx.revisionId)).toHaveLength(2);
    expect((await revisionRow(fx.revisionId)).printedAt?.getTime()).toBeGreaterThan(first?.getTime() ?? 0);
  });

  it("금액 못 보는 계정 · 완료 프로젝트는 UserFacingError이고 printed_at null · 0행이다", async () => {
    const fx = await filled();
    const noAmount = await makeViewer(writerMenus, ["project.value"]);
    await expect(recordDocumentPrint(noAmount, { kind: "quote", id: fx.revisionId })).rejects.toBeInstanceOf(UserFacingError);
    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, fx.project.id));
    await expect(recordDocumentPrint(fx.pm, { kind: "quote", id: fx.revisionId })).rejects.toBeInstanceOf(UserFacingError);
    expect((await revisionRow(fx.revisionId)).printedAt).toBeNull();
    expect(await printRows(fx.revisionId)).toHaveLength(0);
  });

  it("보냄 뒤에도 차수 편집은 막히지 않는다 — 상태 칸을 늘리지 않는다(승인 낱말 그대로)", async () => {
    const fx = await filled();
    await recordDocumentPrint(fx.pm, { kind: "quote", id: fx.revisionId });
    const summary = (await listRevisionSummaries(fx.pm, fx.project.id))[0];
    expect(summary?.statusWord).toBe("현재");
  });
});
