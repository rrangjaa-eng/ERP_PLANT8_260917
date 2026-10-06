import { randomUUID } from "node:crypto";
import { expect, type Browser, type Page } from "@playwright/test";
import { createExpenseFromLines } from "@/domain/expenses";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createProject } from "@/domain/projects";
import { changeProjectStatus } from "@/domain/projects/status";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { setCustomerApproval } from "@/domain/quotes/revisions";
import { approvalBasis } from "@/repositories/quote-revisions";
import { insertVendor } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { createOrgUnit, createTeam } from "@/domain/org";
import { seoulToday } from "@/lib/dates";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { loginPage, makePerson, setupLeaveOrg, waitForHydration, type Person } from "./leave-org";

// 05-05 지출결의 E2E 공용 픽스처 — 04.1 결재 E2E 준비(`setupLeaveOrg`: 전용 본부 · 팀 · 기안 PM · 팀장 · 대표)에 진행 중 프로젝트
// (1차 차수 고객 승인 끝) · 거래처 · 견적 줄 여럿을 도메인 함수로 얹는다(SQL 직접 삽입 없음). 줄마다 쓰는 테스트가 따로라 서로 겹치지 않는다.

export type ExpenseE2E = {
  pm: Person;
  lead: Person;
  // 결재선은 연차와 같은 넷(팀장 → 본부장 → 경영 → 대표) — 사이 둘도 문서 화면에서 승인해야 대표가 문서를 볼 수 있다.
  divisionHead: Person;
  mgmt: Person;
  ceo: Person;
  projectId: string;
  projectNumber: string;
  projectName: string;
  vendorName: string;
  // 줄 이름 → id. 이름은 문서 제목 · 결재함 문서 칸에 그대로 나온다.
  lines: Record<LineKey, { id: string; itemName: string }>;
};

// worst = 폰 시트 최악 줄(두 줄로 꺾이는 긴 항목명 · 두 줄 비고) — 05-05 Task 2 DOM 감사가 쓴다.
export type LineKey = "tracer" | "hold" | "retry" | "phone" | "noVendor" | "cancelled" | "worst" | "closed";

const EXECUTION_KRW = 12_400_000;

export async function setupExpenseE2E(): Promise<ExpenseE2E> {
  const today = seoulToday();
  const year = today.slice(0, 4);
  const suffix = randomUUID().slice(0, 6);
  const org = await setupLeaveOrg(today);

  const client = await insertVendor(SYSTEM_VIEWER, { name: `E2E클라이언트-${suffix}`, normalizedName: `e2e클라이언트-${suffix}` });
  const vendorName = `E2E스테이지-${suffix}`;
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: vendorName, normalizedName: `e2e스테이지-${suffix}`, defaultEvidenceType: "tax_invoice" });

  const projectName = `E2E지출-${suffix}`;
  const project = await createProject(org.drafter.viewer, {
    clientId: client.id,
    teamId: org.teamId,
    pmUserId: org.drafter.viewer.id,
    name: projectName,
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision || !project.id || !project.number) throw new Error("프로젝트 · 1차 차수가 없습니다");

  const subcategory = (await firstSelectableSubcategory()).value;
  const names: Record<LineKey, string> = {
    tracer: `무대 제작-${suffix}`,
    hold: `조명 설치-${suffix}`,
    retry: `음향 설치-${suffix}`,
    phone: `영상 제작-${suffix}`,
    noVendor: `현장 인력-${suffix}`,
    cancelled: `취소된 줄-${suffix}`,
    worst: `무대 철거 및 원상복구 현장 인력 추가 투입 비용 정산 항목-${suffix}`,
    closed: `제출된 줄-${suffix}`,
  };
  const line = (itemName: string, vendorId: string | null, extra: { lineStatus?: "cancelled"; note?: string } = {}) => ({
    id: randomUUID(),
    isNew: true as const,
    subcategory,
    itemName,
    vendorId,
    unitPrice: { currency: "KRW" as const, amount: EXECUTION_KRW + 1_000_000, fxRate: 1 },
    execution: { currency: "KRW" as const, amount: EXECUTION_KRW, fxRate: 1 },
    ...extra,
  });
  const saved = await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
    rows: [
      line(names.tracer, vendor.id),
      line(names.hold, vendor.id),
      line(names.retry, vendor.id),
      line(names.phone, vendor.id),
      line(names.noVendor, null),
      line(names.cancelled, vendor.id, { lineStatus: "cancelled" }),
      line(names.worst, vendor.id, { note: "현장 사정으로 철거 일정이 이틀 밀려 인력 추가 투입 · 원상복구 범위는 계약서 별첨 3항 기준으로 정산" }),
      line(names.closed, vendor.id),
    ],
  });
  const idOf = (itemName: string) => {
    const found = saved.lines.find((row) => row.itemName === itemName)?.id;
    if (!found) throw new Error(`견적 줄 없음: ${itemName}`);
    return found;
  };

  await changeProjectStatus(org.teamLead.viewer, project.id, { from: "bidding", to: "in_progress" });
  const basis = await approvalBasis(SYSTEM_VIEWER, revision.id);
  await setCustomerApproval(org.drafter.viewer, revision.id, { approvedOn: today, seenTotalKrw: basis.totalKrw, contentToken: basis.contentToken });

  return {
    pm: org.drafter,
    lead: org.teamLead,
    divisionHead: org.divisionHead,
    mgmt: org.mgmt,
    ceo: org.ceo,
    projectId: project.id,
    projectNumber: project.number,
    projectName,
    vendorName,
    lines: Object.fromEntries((Object.keys(names) as LineKey[]).map((key) => [key, { id: idOf(names[key]), itemName: names[key] }])) as ExpenseE2E["lines"],
  };
}

// 05-09 — 테스트 계급 「경영관리」(관리자가 권한표에서 켜는 계급): 전사 업무 범위 · 지출결의 보기 + 결재 중 증빙 붙이기 · 증빙 무효 처리 쓰기.
// 전용 본부 · 팀에 발령한다(경영관리본부 밖 — 결재선 단계 담당이 아니다).
export async function makeEvidenceManagerE2E(): Promise<Person> {
  const suffix = randomUUID().slice(0, 8);
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E경영관리-${suffix}`, workScope: "company" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.evidence_attach", action: "write", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.evidence_void", action: "write", allowed: true });
  // 관리자가 새 계급을 만들면 노출표도 켠다 — 문서 화면 · 증빙 파일 DTO가 지나는 정보 항목.
  for (const infoItem of ["expense.value", "expense.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E지원본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E지원팀-${suffix}` });
  return makePerson("경영지원", role.id, team.id, `${seoulToday().slice(0, 4)}-01-01`);
}

// 증빙 중복 검사는 파일 해시가 같으면 다른 문서의 파일도 막는다(05-04) — 한 번에 도는 스펙 안에서 같은 그림을 두 번 올리면 둘째가 `이미 첨부된 파일`이 된다.
// 트레이서만 고정 그림 `test/e2e/assets/receipt-3000x2000.jpg`(브라우저 캔버스 3000×2000 · JPEG 품질 0.8)를 쓰고, 나머지는 호출마다 글자가 다른 같은 크기 그림을 캔버스로 만들어 해시가 겹치지 않게 한다.
export async function uniqueReceipt(page: Page): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
  const tag = randomUUID();
  const base64 = await page.evaluate(async (label) => {
    const canvas = document.createElement("canvas");
    canvas.width = 3000;
    canvas.height = 2000;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("캔버스를 만들 수 없다");
    ctx.fillStyle = "#eef2f1";
    ctx.fillRect(0, 0, 3000, 2000);
    ctx.fillStyle = "#1f2d29";
    ctx.font = "bold 90px sans-serif";
    ctx.fillText(label, 100, 300);
    for (let i = 0; i < 8; i += 1) ctx.fillText(`ITEM ${i + 1}      12,400,000`, 100, 520 + i * 160);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    if (!blob) throw new Error("JPEG를 만들 수 없다");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }, tag);
  return { name: `receipt-${tag.slice(0, 8)}.jpg`, mimeType: "image/jpeg", buffer: Buffer.from(base64, "base64") };
}

// 줄 하나의 작성 중 문서를 만들어 폼에서 사진 한 장을 붙여 제출한다(문이 닫히는 줄 · 제출된 문서가 필요한 스펙). 문서 id를 돌려준다.
export async function submitLineExpense(browser: Browser, baseURL: string | undefined, fx: ExpenseE2E, key: LineKey): Promise<string> {
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines[key].id] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  const page = await loginPage(browser, baseURL, fx.pm);
  await page.goto(`/expenses/${expenseId}`);
  await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
  await page.getByTestId("attachments-input").setInputFiles(await uniqueReceipt(page));
  await expect(page.locator('[data-ui="attachments"] li').getByText(/^\d+KB · \d{2}-\d{2}$/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /^지출결의 제출/ }).click();
  await expect(page).toHaveURL(new RegExp(`/expenses/${expenseId}\\?submitted=1$`));
  await page.context().close();
  return expenseId;
}
