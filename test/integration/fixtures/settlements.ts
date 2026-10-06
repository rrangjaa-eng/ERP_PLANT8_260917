import { randomUUID } from "node:crypto";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { insertVendor } from "@/repositories/vendors";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { changeProjectStatus } from "@/domain/projects/status";
import { applyAutoSettlement } from "@/domain/projects/auto-transition";
import { saveProjectLedger } from "@/domain/projects/ledger";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { makePerson, teamIdByName } from "../approvals-fixtures";

// 05-11 정산 결재 통합 픽스처 — 사람 · 프로젝트 · 견적 줄 · 상태는 도메인 함수로만 만든다(SQL 직접 삽입 없음).
// 기획1팀: 담당 PM 박서연 · 팀장 김도윤, 대표 최대표(팀 없음). 프로젝트는 종료일이 지난 진행이라 자동 정산(applyAutoSettlement)으로 정산이 된다.
// 견적 줄 = 원화 줄 하나 + 외화(USD) 줄 하나 — 정산 결재 두 합(G4)의 기대값은 아래 상수에서 테스트가 더해 만든다.

export type SettlementPeople = { pm: Viewer; lead: Viewer; ceo: Viewer };

export type SettlementFixture = SettlementPeople & {
  projectId: string;
  projectNumber: string;
  projectName: string;
};

export const SETTLEMENT_LINES = {
  krw: { quantity: 1, unitPrice: { currency: "KRW" as const, amount: 13_400_000, fxRate: 1 }, execution: { currency: "KRW" as const, amount: 12_400_000, fxRate: 1 } },
  usd: { quantity: 1, unitPrice: { currency: "USD" as const, amount: 10_000, fxRate: 1_350 }, execution: { currency: "USD" as const, amount: 8_000, fxRate: 1_350 } },
};

const PERIOD = { startDate: "2026-01-05", endDate: "2026-03-31" };

export async function makeSettlementPeople(): Promise<SettlementPeople> {
  return {
    pm: await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀"),
    lead: await makePerson("김도윤", TEAM_LEAD_ROLE_ID, "기획1팀"),
    ceo: await makePerson("최대표", CEO_ROLE_ID, null),
  };
}

export async function setupSettlementProject(people?: SettlementPeople, name = "가을 팝업"): Promise<SettlementFixture> {
  const who = people ?? (await makeSettlementPeople());
  const client = await insertVendor(SYSTEM_VIEWER, { name: `클라이언트-${randomUUID()}`, normalizedName: `클라이언트-${randomUUID()}` });
  const project = await createProject(who.pm, {
    clientId: client.id,
    teamId: await teamIdByName("기획1팀"),
    pmUserId: who.pm.id,
    name,
    startDate: PERIOD.startDate,
    endDate: PERIOD.endDate,
  });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision || !project.id || !project.number) throw new Error("프로젝트 · 1차 차수가 없습니다");

  const subcategory = (await firstSelectableSubcategory()).value;
  await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
    rows: [
      { id: randomUUID(), isNew: true as const, subcategory, itemName: "무대 제작", vendorId: null, ...SETTLEMENT_LINES.krw },
      { id: randomUUID(), isNew: true as const, subcategory, itemName: "해외 영상", vendorId: null, ...SETTLEMENT_LINES.usd },
    ],
  });

  await changeProjectStatus(who.lead, project.id, { from: "bidding", to: "in_progress" });
  const settled = await applyAutoSettlement({ projectIds: [project.id] });
  if (!settled.includes(project.id)) throw new Error("자동 정산이 되지 않았습니다");

  return { ...who, projectId: project.id, projectNumber: project.number, projectName: name };
}

// D-80 — 정산 중 팀장이 종료일을 오늘 뒤로 바꾸면 프로젝트가 진행으로 돌아간다(정산의 기간 권리는 팀장, PM은 없음). 리포지토리로 상태만
// 바꾸면 종료일이 지난 진행이라 다음 잠금 읽기가 다시 정산으로 되돌린다 — 실제 경로(saveProjectLedger)로 만든다.
export async function extendToInProgress(fx: SettlementFixture, deps?: Parameters<typeof saveProjectLedger>[3]) {
  return saveProjectLedger(fx.lead, fx.projectId, { seenStatus: "settling", period: { ...PERIOD, endDate: "2099-12-31", baseline: PERIOD } }, deps);
}
