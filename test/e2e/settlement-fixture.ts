import { randomUUID } from "node:crypto";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createProject } from "@/domain/projects";
import { changeProjectStatus } from "@/domain/projects/status";
import { applyAutoSettlement } from "@/domain/projects/auto-transition";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { insertVendor } from "@/repositories/vendors";
import { seoulToday } from "@/lib/dates";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { setupLeaveOrg, type Person } from "./leave-org";

// 05-11 정산 결재 E2E 공용 픽스처 — 04.1 결재 E2E 준비(`setupLeaveOrg`: 전용 본부 · 팀 · 기안 PM · 팀장 · 대표)에 정산 상태 프로젝트를 도메인
// 함수로 얹는다(SQL 직접 삽입 없음). 종료일이 지난해 말인 진행 프로젝트를 자동 정산(applyAutoSettlement)으로 정산으로 만든다.
// 견적 줄 = 원화 줄 하나 + 외화(USD) 줄 하나(두 합 G4).

export type SettlementE2E = {
  pm: Person;
  lead: Person;
  ceo: Person;
  projectId: string;
  projectNumber: string;
  projectName: string;
};

export async function setupSettlementE2E(): Promise<SettlementE2E> {
  const today = seoulToday();
  const lastYear = Number(today.slice(0, 4)) - 1;
  const suffix = randomUUID().slice(0, 6);
  const org = await setupLeaveOrg(today);
  const client = await insertVendor(SYSTEM_VIEWER, { name: `E2E정산클라이언트-${suffix}`, normalizedName: `e2e정산클라이언트-${suffix}` });
  const projectName = `E2E정산-${suffix}`;
  const project = await createProject(org.drafter.viewer, {
    clientId: client.id,
    teamId: org.teamId,
    pmUserId: org.drafter.viewer.id,
    name: projectName,
    startDate: `${lastYear}-11-01`,
    endDate: `${lastYear}-12-31`,
  });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision || !project.id || !project.number) throw new Error("프로젝트 · 1차 차수가 없습니다");
  const subcategory = (await firstSelectableSubcategory()).value;
  await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
    rows: [
      {
        id: randomUUID(),
        isNew: true as const,
        subcategory,
        itemName: `무대 제작-${suffix}`,
        vendorId: null,
        unitPrice: { currency: "KRW" as const, amount: 13_400_000, fxRate: 1 },
        execution: { currency: "KRW" as const, amount: 12_400_000, fxRate: 1 },
      },
      {
        id: randomUUID(),
        isNew: true as const,
        subcategory,
        itemName: `해외 영상-${suffix}`,
        vendorId: null,
        unitPrice: { currency: "USD" as const, amount: 10_000, fxRate: 1_350 },
        execution: { currency: "USD" as const, amount: 8_000, fxRate: 1_350 },
      },
    ],
  });
  await changeProjectStatus(org.teamLead.viewer, project.id, { from: "bidding", to: "in_progress" });
  const settled = await applyAutoSettlement({ projectIds: [project.id] });
  if (!settled.includes(project.id)) throw new Error("자동 정산이 되지 않았습니다");
  return { pm: org.drafter, lead: org.teamLead, ceo: org.ceo, projectId: project.id, projectNumber: project.number, projectName };
}
