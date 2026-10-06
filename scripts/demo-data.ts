import { pathToFileURL } from "node:url";
import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, inArray, isNotNull, like, or, sql } from "drizzle-orm";
import { closeDb, db } from "@/db/client";
import {
  approvalInstances,
  approvalRoutes,
  approvalSteps,
  corpCardUsages,
  corpCards,
  expenseEvidenceReviews,
  expensePayments,
  expenses,
  files,
  notificationLog,
  projects,
  purchaseRequests,
  quoteLines,
  quoteRevisions,
  reserveEntries,
  revenueEntries,
  revenueIssueRequests,
  settlementApprovals,
  teamMemberships,
  uploadIntents,
  users,
  vendors,
} from "@/db/schema";
import { archive } from "@/domain/archive";
import { createAccount } from "@/domain/auth/accounts";
import { createCorpCard } from "@/domain/corp-cards";
import { createExpenseFromLines, createTeamExpenseDraft, saveExpenseDraft, submitExpense } from "@/domain/expenses";
import { assignTeam, listTeams } from "@/domain/org";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { createProject } from "@/domain/projects";
import { applyAutoSettlement } from "@/domain/projects/auto-transition";
import { changeProjectStatus } from "@/domain/projects/status";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { setCustomerApproval } from "@/domain/quotes/revisions";
import { saveRevenue } from "@/domain/revenue";
import { createVendor } from "@/domain/vendors";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { addDays } from "@/lib/kst-date";
import { seoulToday } from "@/lib/dates";
import { approvalBasis } from "@/repositories/quote-revisions";
import { insertFile } from "@/repositories/files";
import { listCodeItems } from "@/repositories/code-tables";
import { QUOTE_SUBCATEGORY_TABLE_KEY } from "@/domain/projects/references";

// 스테이징 목록 · 상세 화면 확인용 견본 데이터 CLI(seed | purge) — 기존 CLI 번들(dist/cli)의 한 진입점이라 seed Cloud Run Job을 args만 바꿔
// 실행한다. 모든 쓰기는 domain 서비스 함수를 호출만 한다(권한 · 게이트 · 번호 · 결재선 그대로). 견본은 표시 이름 「[테스트] 」 접두어와
// 견본 사용자 이메일(demo-…@plant8-demo.test)로만 고른다 — purge도 같은 기준으로만 지운다.
// Job에는 암호화 키 · 증빙 버킷이 없다 — 거래처 계좌번호(암호화 칸)와 실제 증빙 객체 업로드는 쓰지 않는다. 증빙 파일은 행만 넣는다(객체 없음).
// 임시 비밀번호는 버린다 — 출력 · 로그에 없다(견본 사용자는 로그인에 쓰지 않는다).

export const DEMO_NAME_PREFIX = "[테스트] ";
export const DEMO_EMAIL_LIKE = "demo-%@plant8-demo.test";
const DEMO_EMAIL_DOMAIN_LIKE = "%@plant8-demo.test";

const named = (name: string) => `${DEMO_NAME_PREFIX}${name}`;

type PersonKey = "pm1" | "pm2" | "lead" | "divisionHead" | "mgmt" | "ceo";
const PEOPLE: readonly { key: PersonKey; name: string; roleId: string; team: "기획1팀" | "경영관리팀" }[] = [
  { key: "pm1", name: "김민준", roleId: DEFAULT_ROLE_ID, team: "기획1팀" },
  { key: "pm2", name: "이서연", roleId: DEFAULT_ROLE_ID, team: "기획1팀" },
  { key: "lead", name: "박도윤", roleId: TEAM_LEAD_ROLE_ID, team: "기획1팀" },
  { key: "divisionHead", name: "최지우", roleId: "role-division-head", team: "기획1팀" },
  // 경영관리 담당 — 시드 계급에 경영관리 계급이 없어 기획 PM 계급으로 경영관리팀에 둔다(결재선 3단은 소속 본부로 찾는다).
  { key: "mgmt", name: "정하은", roleId: DEFAULT_ROLE_ID, team: "경영관리팀" },
  { key: "ceo", name: "강현우", roleId: CEO_ROLE_ID, team: "기획1팀" },
];

// 계좌번호는 넣지 않는다(암호화 키 없음). 사업자번호는 형식만 맞는 가짜.
const DEMO_CLIENTS = [
  { name: "한빛전자", businessNo: "214-86-10231" },
  { name: "그린웨이 푸드", businessNo: "107-81-52044" },
  { name: "모아모빌리티", businessNo: "120-87-33518" },
] as const;
const DEMO_PARTNERS = [
  { name: "스테이지웍스 (무대)", businessNo: "211-88-47720", accountBank: "국민은행", accountHolder: "스테이지웍스" },
  { name: "대성프린팅 (인쇄)", businessNo: "129-86-20917", accountBank: "신한은행", accountHolder: "대성프린팅" },
  { name: "휴먼스태프 (인력)", businessNo: "105-87-66302", accountBank: "우리은행", accountHolder: "휴먼스태프" },
] as const;

type LineSpec = { itemName: string; partner: 0 | 1 | 2; subcategory: "stage_construction" | "print_production" | "staffing" | "etc"; quantity: number; unitPrice: number; execution: number };
type ProjectSpec = {
  key: "bidding" | "pop" | "launch" | "settling";
  name: string;
  client: 0 | 1 | 2;
  pm: "pm1" | "pm2";
  start: number;
  end: number;
  lines: readonly LineSpec[];
};

// start · end는 오늘 기준 일수 — 정산 프로젝트는 종료일이 지나 있어 자동 정산 판정으로 정산이 된다.
const PROJECTS: readonly ProjectSpec[] = [
  {
    key: "bidding",
    name: "2026 겨울 시즌 프로모션 제안",
    client: 1,
    pm: "pm2",
    start: 45,
    end: 75,
    lines: [
      { itemName: "팝업 부스 설계·시공", partner: 0, subcategory: "stage_construction", quantity: 1, unitPrice: 18_000_000, execution: 14_400_000 },
      { itemName: "현장 안내 인력", partner: 2, subcategory: "staffing", quantity: 6, unitPrice: 250_000, execution: 1_200_000 },
      { itemName: "리플릿 제작", partner: 1, subcategory: "print_production", quantity: 3000, unitPrice: 800, execution: 1_900_000 },
    ],
  },
  {
    key: "pop",
    name: "2026 가을 신제품 팝업스토어",
    client: 0,
    pm: "pm1",
    start: -30,
    end: 60,
    lines: [
      { itemName: "팝업스토어 무대·시공", partner: 0, subcategory: "stage_construction", quantity: 1, unitPrice: 42_000_000, execution: 33_600_000 },
      { itemName: "현수막·배너 제작", partner: 1, subcategory: "print_production", quantity: 20, unitPrice: 150_000, execution: 2_400_000 },
      { itemName: "현장 진행 인력", partner: 2, subcategory: "staffing", quantity: 10, unitPrice: 280_000, execution: 2_200_000 },
      { itemName: "철거·원상복구", partner: 0, subcategory: "etc", quantity: 1, unitPrice: 5_500_000, execution: 4_400_000 },
    ],
  },
  {
    key: "launch",
    name: "신규 전기차 론칭 쇼케이스",
    client: 2,
    pm: "pm2",
    start: -10,
    end: 40,
    lines: [
      { itemName: "쇼케이스 무대 제작", partner: 0, subcategory: "stage_construction", quantity: 1, unitPrice: 56_000_000, execution: 44_800_000 },
      { itemName: "초청장·도록 인쇄", partner: 1, subcategory: "print_production", quantity: 500, unitPrice: 6_000, execution: 2_400_000 },
      { itemName: "MC·진행요원", partner: 2, subcategory: "staffing", quantity: 12, unitPrice: 300_000, execution: 2_880_000 },
      { itemName: "VIP 응대 인력", partner: 2, subcategory: "staffing", quantity: 4, unitPrice: 350_000, execution: 1_120_000 },
      { itemName: "행사 보험·기타 경비", partner: 0, subcategory: "etc", quantity: 1, unitPrice: 2_000_000, execution: 1_500_000 },
    ],
  },
  {
    key: "settling",
    name: "2026 여름 페스티벌 브랜드존",
    client: 1,
    pm: "pm1",
    start: -90,
    end: -10,
    lines: [
      { itemName: "브랜드존 부스 시공", partner: 0, subcategory: "stage_construction", quantity: 1, unitPrice: 28_000_000, execution: 22_400_000 },
      { itemName: "샘플링 인력", partner: 2, subcategory: "staffing", quantity: 8, unitPrice: 260_000, execution: 1_760_000 },
      { itemName: "굿즈 제작", partner: 1, subcategory: "print_production", quantity: 1000, unitPrice: 3_500, execution: 2_800_000 },
    ],
  },
];

export type DemoSeedResult = { seeded: boolean; counts: Record<string, number> };
export type DemoPurgeResult = { purged: boolean; counts: Record<string, number> };

async function teamIdByName(name: string): Promise<string> {
  const team = (await listTeams(SYSTEM_VIEWER)).find((candidate) => candidate.name === name);
  if (!team) throw new Error(`시드된 팀이 없습니다: ${name} — 먼저 마스터 시드(seed-master)를 실행하세요`);
  return team.id;
}

async function approveRevision(viewer: Viewer, revisionId: string, approvedOn: string): Promise<void> {
  const basis = await approvalBasis(SYSTEM_VIEWER, revisionId);
  await setCustomerApproval(viewer, revisionId, { approvedOn, seenTotalKrw: basis.totalKrw, contentToken: basis.contentToken });
}

// 증빙 파일은 행만 넣는다 — 저장소 객체가 없어 화면의 「증빙 열기」는 동작하지 않는다(제출 게이트의 증빙 1개 이상만 채운다).
async function attachDemoEvidence(viewer: Viewer, expenseId: string): Promise<void> {
  await insertFile(
    viewer,
    {
      ownerKind: "expense",
      ownerId: expenseId,
      objectKey: `demo/${randomUUID()}.pdf`,
      sha256: randomBytes(32).toString("hex"),
      sizeBytes: 184_320,
      contentType: "application/pdf",
      originalName: named("견본증빙.pdf"),
      uploadedBy: viewer.id,
    },
    db,
  );
}

async function draftExpense(viewer: Viewer, lineId: string, note: string, scheduledPaymentDate: string): Promise<{ expenseId: string; version: number }> {
  const created = await createExpenseFromLines(viewer, { lineIds: [lineId] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error(`견본 지출결의를 만들지 못했습니다: ${created.blocked.map((item) => item.reason).join(" / ")}`);
  const saved = await saveExpenseDraft(viewer, {
    expenseId,
    expectedVersion: 1,
    fields: { evidenceType: "tax_invoice", paymentMethod: "bank_transfer", scheduledPaymentDate, note },
  });
  return { expenseId, version: saved.version };
}

export async function seedDemoData(): Promise<DemoSeedResult> {
  const existing = await db.select({ id: users.id }).from(users).where(and(like(users.email, DEMO_EMAIL_LIKE), sql`${users.archivedAt} IS NULL`)).limit(1);
  if (existing.length > 0) return { seeded: false, counts: {} };

  const today = seoulToday();
  const teamIds = { 기획1팀: await teamIdByName("기획1팀"), 경영관리팀: await teamIdByName("경영관리팀") };

  // 사람 — 결재선(팀장 → 본부장 → 경영 → 대표)이 서도록 시드 조직에 발령한다. 임시 비밀번호는 받지 않고 버린다.
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const people = {} as Record<PersonKey, Viewer>;
  for (const person of PEOPLE) {
    const { userId } = await createAccount(SYSTEM_VIEWER, { email: `demo-${person.key}@plant8-demo.test`, name: named(person.name), roleId: person.roleId });
    await assignTeam(SYSTEM_VIEWER, { userId, teamId: teamIds[person.team], effectiveFrom: yearStart });
    people[person.key] = { id: userId, roleId: person.roleId };
  }

  // 거래처 — 클라이언트와 협력사를 따로 둔다(구분 칸이 생기면 여기서 채운다).
  const clientIds: string[] = [];
  for (const client of DEMO_CLIENTS) {
    clientIds.push((await createVendor(SYSTEM_VIEWER, { name: named(client.name), businessNo: client.businessNo })).vendor.id);
  }
  const partnerIds: string[] = [];
  for (const partner of DEMO_PARTNERS) {
    partnerIds.push(
      (await createVendor(SYSTEM_VIEWER, { name: named(partner.name), businessNo: partner.businessNo, accountBank: partner.accountBank, accountHolder: partner.accountHolder, defaultEvidenceType: "tax_invoice" })).vendor.id,
    );
  }

  const subcategoryValues = new Set(
    (await listCodeItems(SYSTEM_VIEWER, { tableKey: QUOTE_SUBCATEGORY_TABLE_KEY, scope: { rows: "all", includeArchived: false }, includeInactive: false })).map((item) => item.value),
  );

  const projectIds = {} as Record<ProjectSpec["key"], string>;
  const lineIds = {} as Record<ProjectSpec["key"], string[]>;
  let quoteLineCount = 0;
  for (const spec of PROJECTS) {
    const pm = people[spec.pm];
    const project = await createProject(pm, {
      clientId: clientIds[spec.client] as string,
      teamId: teamIds.기획1팀,
      pmUserId: pm.id,
      name: named(spec.name),
      startDate: addDays(today, spec.start),
      endDate: addDays(today, spec.end),
    });
    if (!project.id) throw new Error("견본 프로젝트를 만들지 못했습니다");
    projectIds[spec.key] = project.id;
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
    if (!revision) throw new Error("견본 프로젝트의 1차 차수가 없습니다");

    const saved = await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
      rows: spec.lines.map((line) => {
        if (!subcategoryValues.has(line.subcategory)) throw new Error(`견적 소분류 코드가 없습니다: ${line.subcategory}`);
        return {
          id: randomUUID(),
          isNew: true as const,
          subcategory: line.subcategory,
          itemName: line.itemName,
          vendorId: partnerIds[line.partner] as string,
          quantity: line.quantity,
          unitPrice: { currency: "KRW" as const, amount: line.unitPrice, fxRate: 1 },
          execution: { currency: "KRW" as const, amount: line.execution, fxRate: 1 },
        };
      }),
    });
    quoteLineCount += saved.lines.length;
    lineIds[spec.key] = spec.lines.map((line) => saved.lines.find((row) => row.itemName === line.itemName)?.id ?? "");

    if (spec.key !== "bidding") {
      await changeProjectStatus(people.lead, project.id, { from: "bidding", to: "in_progress" });
      await approveRevision(pm, revision.id, addDays(today, Math.min(spec.start + 5, 0)));
    }
    if (spec.key === "settling") await applyAutoSettlement({ projectIds: [project.id] });
  }

  // 매출 — 진행 프로젝트에 발행, 한 건은 수금까지.
  await saveRevenue(SYSTEM_VIEWER, projectIds.pop, {
    issuedEntries: [
      { id: randomUUID(), isNew: true, entryDate: addDays(today, -20), amount: { currency: "KRW", amount: 25_000_000, fxRate: 1 }, note: "선금 발행" },
      { id: randomUUID(), isNew: true, entryDate: addDays(today, -3), amount: { currency: "KRW", amount: 20_000_000, fxRate: 1 }, note: "중도금 발행" },
    ],
    paidEntries: [{ id: randomUUID(), isNew: true, entryDate: addDays(today, -8), amount: { currency: "KRW", amount: 25_000_000, fxRate: 1 }, note: "선금 입금" }],
  });
  await saveRevenue(SYSTEM_VIEWER, projectIds.launch, {
    issuedEntries: [{ id: randomUUID(), isNew: true, entryDate: addDays(today, -5), amount: { currency: "KRW", amount: 30_000_000, fxRate: 1 }, note: "선금 발행" }],
  });

  // 법인카드 — 사람 1 · 팀 1.
  await createCorpCard(SYSTEM_VIEWER, { issuer: "삼성카드", numberLast4: "7701", label: named("김민준 법인카드"), holderUserId: people.pm1.id });
  await createCorpCard(SYSTEM_VIEWER, { issuer: "신한카드", numberLast4: "7702", label: named("기획1팀 공용카드"), teamId: teamIds.기획1팀 });

  // 지출결의 — 작성 중 2 · 제출 3(결재 대기) · 팀 비용 작성 중 1.
  const popLines = lineIds.pop;
  const launchLines = lineIds.launch;
  await draftExpense(people.pm1, popLines[1] as string, "현수막 · 배너 제작비", addDays(today, 14));
  await draftExpense(people.pm2, launchLines[1] as string, "초청장 · 도록 인쇄비", addDays(today, 10));
  const submissions: { viewer: Viewer; lineId: string; note: string }[] = [
    { viewer: people.pm1, lineId: popLines[0] as string, note: "무대 · 시공 대금" },
    { viewer: people.pm1, lineId: popLines[2] as string, note: "현장 진행 인력 용역비" },
    { viewer: people.pm2, lineId: launchLines[2] as string, note: "MC · 진행요원 용역비" },
  ];
  for (const item of submissions) {
    const draft = await draftExpense(item.viewer, item.lineId, item.note, addDays(today, 7));
    await attachDemoEvidence(item.viewer, draft.expenseId);
    const submitted = await submitExpense(item.viewer, { expenseId: draft.expenseId, expectedVersion: draft.version });
    if (submitted.kind !== "submitted") throw new Error("견본 지출결의 제출 결과가 예상과 다릅니다");
  }
  await createTeamExpenseDraft(people.pm1, {
    idempotencyKey: randomUUID(),
    fields: {
      teamExpenseKind: "team_overhead",
      content: named("기획1팀 9월 팀 회식비"),
      supply: { currency: "KRW", amount: 480_000, fxRate: 1 },
      evidenceType: "tax_invoice",
      paymentMethod: "bank_transfer",
      usageDate: today,
    },
  });

  return {
    seeded: true,
    counts: { users: PEOPLE.length, vendors: clientIds.length + partnerIds.length, projects: PROJECTS.length, quoteLines: quoteLineCount, revenue: 4, corpCards: 2, expenses: 6 },
  };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// 견본 사업 데이터를 FK 순서대로 한 트랜잭션에서 물리 삭제한다. 견본 사용자는 행동 로그 · 결재 처리 이력 등 FK가 남아 지우지 않고 보관한다.
export async function purgeDemoData(): Promise<DemoPurgeResult> {
  const demoUserIds = (await db.select({ id: users.id }).from(users).where(like(users.email, DEMO_EMAIL_DOMAIN_LIKE))).map((row) => row.id);
  const counts: Record<string, number> = {};
  const record = (key: string, result: { rowCount: number | null }) => {
    counts[key] = (counts[key] ?? 0) + (result.rowCount ?? 0);
  };

  await db.transaction(async (tx: Tx) => {
    const projectIds = (await tx.select({ id: projects.id }).from(projects).where(like(projects.name, `${DEMO_NAME_PREFIX}%`))).map((row) => row.id);
    const vendorIds = (await tx.select({ id: vendors.id }).from(vendors).where(like(vendors.name, `${DEMO_NAME_PREFIX}%`))).map((row) => row.id);
    const cardIds = (await tx.select({ id: corpCards.id }).from(corpCards).where(like(corpCards.label, `${DEMO_NAME_PREFIX}%`))).map((row) => row.id);
    const revisionIds = (await tx.select({ id: quoteRevisions.id }).from(quoteRevisions).where(inArray(quoteRevisions.projectId, projectIds))).map((row) => row.id);
    const lineIds = (await tx.select({ id: quoteLines.id }).from(quoteLines).where(inArray(quoteLines.revisionId, revisionIds))).map((row) => row.id);
    const expenseIds = (
      await tx
        .select({ id: expenses.id })
        .from(expenses)
        .where(or(inArray(expenses.projectId, projectIds), inArray(expenses.drafterId, demoUserIds), inArray(expenses.quoteLineId, lineIds)))
    ).map((row) => row.id);
    const settlementIds = (await tx.select({ id: settlementApprovals.id }).from(settlementApprovals).where(inArray(settlementApprovals.projectId, projectIds))).map((row) => row.id);
    const usageIds = (
      await tx
        .select({ id: corpCardUsages.id })
        .from(corpCardUsages)
        .where(or(inArray(corpCardUsages.corpCardId, cardIds), inArray(corpCardUsages.quoteLineId, lineIds)))
    ).map((row) => row.id);
    const reserveIds = (
      await tx
        .select({ id: reserveEntries.id })
        .from(reserveEntries)
        .where(or(inArray(reserveEntries.projectId, projectIds), inArray(reserveEntries.clientId, vendorIds)))
    ).map((row) => row.id);

    // 결재 — 인스턴스 → 차수 → 단계 순으로 아래부터 지운다.
    const instanceIds = (
      await tx.select({ id: approvalInstances.id }).from(approvalInstances).where(inArray(approvalInstances.documentId, [...expenseIds, ...settlementIds, ...projectIds]))
    ).map((row) => row.id);
    const routeIds = (await tx.select({ id: approvalRoutes.id }).from(approvalRoutes).where(inArray(approvalRoutes.instanceId, instanceIds))).map((row) => row.id);
    record("approvalSteps", await tx.delete(approvalSteps).where(inArray(approvalSteps.routeId, routeIds)));
    record("approvalRoutes", await tx.delete(approvalRoutes).where(inArray(approvalRoutes.instanceId, instanceIds)));
    record("approvalInstances", await tx.delete(approvalInstances).where(inArray(approvalInstances.id, instanceIds)));

    record("expensePayments", await tx.delete(expensePayments).where(inArray(expensePayments.expenseId, expenseIds)));
    record("expenseEvidenceReviews", await tx.delete(expenseEvidenceReviews).where(inArray(expenseEvidenceReviews.expenseId, expenseIds)));
    const fileOwnerIds = [...expenseIds, ...revisionIds, ...usageIds, ...reserveIds];
    record("files", await tx.delete(files).where(inArray(files.ownerId, fileOwnerIds)));
    record("uploadIntents", await tx.delete(uploadIntents).where(inArray(uploadIntents.ownerId, fileOwnerIds)));
    record("expenses", await tx.delete(expenses).where(inArray(expenses.id, expenseIds)));

    record("corpCardUsages", await tx.delete(corpCardUsages).where(inArray(corpCardUsages.id, usageIds)));
    record("purchaseRequests", await tx.delete(purchaseRequests).where(or(inArray(purchaseRequests.projectId, projectIds), inArray(purchaseRequests.quoteLineId, lineIds))));
    record("revenueIssueRequests", await tx.delete(revenueIssueRequests).where(inArray(revenueIssueRequests.projectId, projectIds)));
    record("revenueEntries", await tx.delete(revenueEntries).where(and(inArray(revenueEntries.projectId, projectIds), eq(revenueEntries.kind, "payment"))));
    record("revenueEntries", await tx.delete(revenueEntries).where(inArray(revenueEntries.projectId, projectIds)));
    record("reserveEntries", await tx.delete(reserveEntries).where(inArray(reserveEntries.id, reserveIds)));
    record("settlementApprovals", await tx.delete(settlementApprovals).where(inArray(settlementApprovals.projectId, projectIds)));

    // 복사 줄 연결을 먼저 끊고(자기 참조 FK) 줄 → 차수 → 프로젝트.
    await tx.update(quoteLines).set({ copiedFromLineId: null }).where(and(inArray(quoteLines.revisionId, revisionIds), isNotNull(quoteLines.copiedFromLineId)));
    record("quoteLines", await tx.delete(quoteLines).where(inArray(quoteLines.revisionId, revisionIds)));
    record("quoteRevisions", await tx.delete(quoteRevisions).where(inArray(quoteRevisions.id, revisionIds)));
    record("projects", await tx.delete(projects).where(inArray(projects.id, projectIds)));

    record("corpCards", await tx.delete(corpCards).where(inArray(corpCards.id, cardIds)));
    record("vendors", await tx.delete(vendors).where(inArray(vendors.id, vendorIds)));

    record("notifications", await tx.delete(notificationLog).where(inArray(notificationLog.recipientId, demoUserIds)));
    record("teamMemberships", await tx.delete(teamMemberships).where(inArray(teamMemberships.userId, demoUserIds)));
  });

  // 견본 사용자 — 보관(로그인 불가)하고 이메일을 비워 다시 seed할 수 있게 한다(이메일 unique).
  let archivedUsers = 0;
  for (const userId of demoUserIds) {
    const [row] = await db.select({ archivedAt: users.archivedAt, email: users.email }).from(users).where(eq(users.id, userId));
    if (!row) continue;
    if (row.archivedAt === null) {
      await archive(SYSTEM_VIEWER, "user", userId);
      archivedUsers += 1;
    }
    if (row.email.startsWith("demo-")) await db.update(users).set({ email: `archived-${userId}@plant8-demo.test` }).where(eq(users.id, userId));
  }
  counts.archivedUsers = archivedUsers;

  const businessRows = Object.entries(counts).some(([key, value]) => key !== "archivedUsers" && value > 0);
  return { purged: businessRows || archivedUsers > 0, counts };
}

const USAGE = "사용법: demo-data.mjs seed|purge";

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const [command] = argv;
  if (command !== "seed" && command !== "purge") throw new Error(`${USAGE} (받은 값: ${command ?? "없음"})`);
  const appEnv = process.env.APP_ENV ?? "local";
  if (appEnv !== "local" && appEnv !== "staging") throw new Error(`운영 환경(APP_ENV=${appEnv})에서는 견본 데이터를 쓸 수 없습니다`);

  if (command === "seed") {
    try {
      const result = await seedDemoData();
      if (!result.seeded) {
        console.log("demo seed skipped: already seeded");
        return;
      }
      const c = result.counts;
      console.log(
        `demo seed complete: users=${c.users} vendors=${c.vendors} projects=${c.projects} quoteLines=${c.quoteLines} revenue=${c.revenue} corpCards=${c.corpCards} expenses=${c.expenses}`,
      );
    } catch (error) {
      throw new Error(`${error instanceof Error ? error.message : String(error)} — 견본이 일부만 만들어졌을 수 있습니다. purge 뒤 다시 seed하세요`);
    }
    return;
  }

  const result = await purgeDemoData();
  if (!result.purged) {
    console.log("demo purge skipped: nothing to purge");
    return;
  }
  console.log(`demo purge complete: ${Object.entries(result.counts).map(([key, value]) => `${key}=${value}`).join(" ")}`);
}

// 테스트가 이 파일을 import해도 실행되지 않게: 직접 실행될 때만 main()을 부른다(seed-master.ts와 같은 결).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main()
    .then(async () => {
      await closeDb();
      process.exit(0);
    })
    .catch(async (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      await closeDb().catch(() => undefined);
      process.exit(1);
    });
}
