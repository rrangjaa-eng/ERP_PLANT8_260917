import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { db } from "@/db/client";
import { projects, quoteLines, settingsSimple, teams } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { approvalBasis } from "@/repositories/quote-revisions";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision } from "@/domain/quotes/lines";
import { setCustomerApproval } from "@/domain/quotes/revisions";
import { readQuoteXlsxUpload } from "@/domain/quotes/import-xlsx-upload";
import { parseQuoteWorkbook } from "@/domain/quotes/import-xlsx";
import { readWorkbookRows } from "@/lib/xlsx-server";
import { kstToday } from "@/lib/kst-date";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { buildQuoteXlsx, buildQuoteXlsxWithFarCell, companySheet, HEADER } from "@/test/support/quote-xlsx";

// 07.2-14 Task 2 — 견적 엑셀 올리기 읽기 서비스(액션 본체)의 경계: 크기 · 형식 · zip 상한 · 권리 · 승인 · 정산 · 줄 상한. 저장 0.

const CAP_KEY = "quote_line.max_per_revision";

async function makeViewer(write: boolean): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `엑셀 올리기 계급-${randomUUID()}` });
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `xlsx-${randomUUID()}@example.test`, name: "엑셀 PM", roleId: role.id });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "write", allowed: write });
  for (const infoItem of ["project.value", "quote.amount"]) {
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  }
  return { id: userId, roleId: role.id };
}

async function setup(write = true) {
  const pm = await makeViewer(write);
  const client = await insertVendor(SYSTEM_VIEWER, { name: `거래처-${randomUUID()}`, normalizedName: `거래처-${randomUUID()}` });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  const project = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: team.id, pmUserId: pm.id, name: `엑셀 올리기-${randomUUID()}` });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("1차 차수가 없습니다");
  const subcategory = await firstSelectableSubcategory();
  return { pm, projectId: project.id, revisionId: revision.id, subcategory: subcategory.value };
}

const xlsxFile = (bytes: Uint8Array) => new File([new Uint8Array(bytes)], "견적.xlsx");
const goodFile = () => xlsxFile(buildQuoteXlsx([companySheet()]));

async function insertActiveLine(revisionId: string, subcategory: string, sortOrder: number) {
  await db.insert(quoteLines).values({
    revisionId,
    sortOrder,
    subcategory,
    itemName: `기존 ${sortOrder}`,
    unitPriceAmountKrw: 100_000,
    executionAmountKrw: 40_000,
    quoteAmountKrw: 100_000,
    profitKrw: 60_000,
  });
}

describe("readQuoteXlsxUpload", () => {
  it("현재 미승인 차수 + 쓰기 권리 → 줄을 읽어 돌려주고 저장은 0", async () => {
    const { pm, projectId, revisionId } = await setup();
    const result = await readQuoteXlsxUpload(pm, { projectId, file: goodFile() });
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.lines).toHaveLength(5);
    expect(await db.select().from(quoteLines).where(eq(quoteLines.revisionId, revisionId))).toHaveLength(0);
  });

  it("먼 칸 하나 든 작은 xlsx(XFD 열 · 1048576행) → 메모리를 펼치지 않고 상한 안에서 줄을 읽는다 (Codex P1)", async () => {
    const { pm, projectId } = await setup();
    for (const far of ["column", "row"] as const) {
      const file = xlsxFile(buildQuoteXlsxWithFarCell(companySheet(), far));
      expect(file.size).toBeLessThan(100_000);
      // 파일 만들기(1048576행 칸 쓰기)가 5초쯤 걸려 시험 한도를 늘렸고, 시간은 읽기만 잰다.
      const started = Date.now();
      const result = await readQuoteXlsxUpload(pm, { projectId, file });
      expect(Date.now() - started).toBeLessThan(5_000);
      expect(result.kind).toBe("ok");
      if (result.kind === "ok") expect(result.lines).toHaveLength(5);
    }
  }, 60_000);

  it("1MB 초과 → {N}MB · 1MB 초과 · 줄여 다시", async () => {
    const { pm, projectId } = await setup();
    const big = new File([new Uint8Array(1_200_000)], "큼.xlsx");
    expect(await readQuoteXlsxUpload(pm, { projectId, file: big })).toEqual({ kind: "rejected", message: "1.2MB · 1MB 초과 · 줄여 다시" });
  });

  it("xlsx 아님(이름만 바꾼 csv) · 파일 칸이 File이 아님 → 엑셀이 아님", async () => {
    const { pm, projectId } = await setup();
    const csv = new File([new TextEncoder().encode("ITEM,QTY\nA,1\n")], "견적.xlsx");
    const refused = { kind: "rejected", message: "엑셀이 아님 · .xlsx로 다시" };
    expect(await readQuoteXlsxUpload(pm, { projectId, file: csv })).toEqual(refused);
    expect(await readQuoteXlsxUpload(pm, { projectId, file: null })).toEqual(refused);
  });

  it("zip 항목 수 상한(200) 초과 → 거부(압축 폭탄 막이)", async () => {
    const { pm, projectId } = await setup();
    const book = XLSX.utils.book_new();
    for (let i = 0; i < 210; i++) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["x"]]), `S${i}`);
    const bytes = new Uint8Array(XLSX.write(book, { bookType: "xlsx", type: "array" }) as ArrayBuffer);
    expect(await readQuoteXlsxUpload(pm, { projectId, file: xlsxFile(bytes) })).toEqual({ kind: "rejected", message: "엑셀이 아님 · .xlsx로 다시" });
  });

  it("머리글이 없는 파일 → 필요한 열 이름 목록과 함께 거절", async () => {
    const { pm, projectId } = await setup();
    const file = xlsxFile(buildQuoteXlsx([{ name: "A", rows: [["가", "나"], [1, 2]] }]));
    expect(await readQuoteXlsxUpload(pm, { projectId, file })).toEqual({ kind: "rejected", message: "열 이름 없음 · 항목 · 수량 · 단가 또는 금액" });
  });

  it("시트가 여럿이면 needsSheet · 지정하면 ok", async () => {
    const { pm, projectId } = await setup();
    const file = xlsxFile(buildQuoteXlsx([companySheet("A"), { name: "B", rows: [[...HEADER], ["x", 1, 1000, 1, 1000, null]] }]));
    const first = await readQuoteXlsxUpload(pm, { projectId, file });
    expect(first.kind).toBe("needsSheet");
    const second = await readQuoteXlsxUpload(pm, { projectId, file, sheet: "B" });
    expect(second.kind === "ok" && second.lines.length).toBe(1);
  });

  it("쓰기 권리 없음 → 거부", async () => {
    const { pm, projectId } = await setup(false);
    await expect(readQuoteXlsxUpload(pm, { projectId, file: goodFile() })).rejects.toThrow("견적 줄 저장 권한 없음");
  });

  it("범위 밖 프로젝트 id(없는 id) → 거부", async () => {
    const { pm } = await setup();
    await expect(readQuoteXlsxUpload(pm, { projectId: randomUUID(), file: goodFile() })).rejects.toThrow("존재하지 않는 차수");
  });

  it("현재 차수가 고객 승인됨 → 거부(승인 잠금 글자)", async () => {
    const { pm, projectId, revisionId, subcategory } = await setup();
    await insertActiveLine(revisionId, subcategory, 0);
    const basis = await approvalBasis(SYSTEM_VIEWER, revisionId);
    await setCustomerApproval(pm, revisionId, { approvalBasis: "verbal", approvedOn: kstToday(new Date()), seenTotalKrw: basis.totalKrw, contentToken: basis.contentToken });
    await expect(readQuoteXlsxUpload(pm, { projectId, file: goodFile() })).rejects.toThrow("1차 고객 승인됨 · 고치려면 새 차수");
  });

  it("정산 · 완료 프로젝트 → 거부", async () => {
    for (const [status, text] of [["settling", "정산 · 실행가와 새 줄만"], ["completed", "완료 · 견적 줄 잠김"]] as const) {
      const { pm, projectId } = await setup();
      await db.update(projects).set({ status }).where(eq(projects.id, projectId));
      await expect(readQuoteXlsxUpload(pm, { projectId, file: goodFile() })).rejects.toThrow(text);
    }
  });

  it("줄 상한 − 활성 줄 수보다 많으면 거절(저장 때 전부 거부되지 않게)", async () => {
    const { pm, projectId, revisionId, subcategory } = await setup();
    await insertActiveLine(revisionId, subcategory, 0);
    await insertActiveLine(revisionId, subcategory, 1);
    const [before] = await db.select().from(settingsSimple).where(eq(settingsSimple.key, CAP_KEY));
    await db.insert(settingsSimple).values({ key: CAP_KEY, value: 6 }).onConflictDoUpdate({ target: settingsSimple.key, set: { value: 6 } });
    try {
      expect(await readQuoteXlsxUpload(pm, { projectId, file: goodFile() })).toEqual({ kind: "rejected", message: "6줄 초과 · 6줄까지" });
    } finally {
      if (before) await db.update(settingsSimple).set({ value: before.value }).where(eq(settingsSimple.key, CAP_KEY));
      else await db.delete(settingsSimple).where(eq(settingsSimple.key, CAP_KEY));
    }
  });
});

describe("실제 xlsx 바이트 한 바퀴", () => {
  it("buildQuoteXlsx → readWorkbookRows → parseQuoteWorkbook — 숫자 셀 double과 F.O.C 글자 셀", () => {
    const book = readWorkbookRows(buildQuoteXlsx([companySheet("견적서"), { name: "참고", rows: [["메모"], ["그냥 글"]] }]));
    const result = parseQuoteWorkbook(book, { maxLines: 300 });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.sheet).toBe("견적서");
    expect(result.lines.map((line) => line.itemName)).toEqual(["Main stage", "Backwall", "Staff", "Gift", "Agency Commission"]);
    expect(result.lines[3]).toMatchObject({ unitPrice: 0, clientRemark: "F.O.C · 단가 150,000" });
    expect(result.checksumDiff).toBeNull();
  });
});

describe("고객 견본은 저장소에 들어가지 않는다 (T-07.2-14-04)", () => {
  it("fixture는 생성 도구뿐", async () => {
    const { execFileSync } = await import("node:child_process");
    expect(execFileSync("git", ["ls-files", "--", "*ample-Quo*"], { encoding: "utf8" }).trim()).toBe("");
  });
});
