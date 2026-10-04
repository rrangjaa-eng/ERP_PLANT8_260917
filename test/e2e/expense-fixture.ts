import { randomUUID } from "node:crypto";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createProject } from "@/domain/projects";
import { changeProjectStatus } from "@/domain/projects/status";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { setCustomerApproval } from "@/domain/quotes/revisions";
import { approvalBasis } from "@/repositories/quote-revisions";
import { insertVendor } from "@/repositories/vendors";
import { seoulToday } from "@/lib/dates";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { setupLeaveOrg, type Person } from "./leave-org";

// 05-05 지출결의 E2E 공용 픽스처 — 04.1 결재 E2E 준비(`setupLeaveOrg`: 전용 본부 · 팀 · 기안 PM · 팀장 · 대표)에 진행 중 프로젝트
// (1차 차수 고객 승인 끝) · 거래처 · 견적 줄 여럿을 도메인 함수로 얹는다(SQL 직접 삽입 없음). 줄마다 쓰는 테스트가 따로라 서로 겹치지 않는다.

export type ExpenseE2E = {
  pm: Person;
  lead: Person;
  ceo: Person;
  projectId: string;
  projectNumber: string;
  projectName: string;
  vendorName: string;
  // 줄 이름 → id. 이름은 문서 제목 · 결재함 문서 칸에 그대로 나온다.
  lines: Record<LineKey, { id: string; itemName: string }>;
};

export type LineKey = "tracer" | "hold" | "retry" | "phone" | "noVendor" | "cancelled";

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
  };
  const line = (itemName: string, vendorId: string | null, extra: { lineStatus?: "cancelled" } = {}) => ({
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
    ceo: org.ceo,
    projectId: project.id,
    projectNumber: project.number,
    projectName,
    vendorName,
    lines: Object.fromEntries((Object.keys(names) as LineKey[]).map((key) => [key, { id: idOf(names[key]), itemName: names[key] }])) as ExpenseE2E["lines"],
  };
}
