import { randomUUID } from "node:crypto";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createProject } from "@/domain/projects";
import { changeProjectStatus } from "@/domain/projects/status";
import { applyAutoSettlement } from "@/domain/projects/auto-transition";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { saveProjectLedger } from "@/domain/projects/ledger";
import { approveDocument, rejectDocument } from "@/domain/approvals";
import { SETTLEMENT_DOCUMENT_KIND, submitSettlement } from "@/domain/settlements";
import { findApprovalGraphByDocument } from "@/repositories/approvals";
import { insertVendor } from "@/repositories/vendors";
import { createCorpCard } from "@/domain/corp-cards";
import { createCardUsage, precheckCardUsage, type CardUsageInput } from "@/domain/corp-card-usages";
import { saveRevenue } from "@/domain/revenue";
import type { Viewer } from "@/domain/viewer";
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
  period: { startDate: string; endDate: string };
};

export async function setupSettlementE2E(): Promise<SettlementE2E> {
  const today = seoulToday();
  const lastYear = Number(today.slice(0, 4)) - 1;
  const suffix = randomUUID().slice(0, 6);
  const org = await setupLeaveOrg(today);
  const client = await insertVendor(SYSTEM_VIEWER, { name: `E2E정산클라이언트-${suffix}`, normalizedName: `e2e정산클라이언트-${suffix}` });
  const projectName = `E2E정산-${suffix}`;
  const period = { startDate: `${lastYear}-11-01`, endDate: `${lastYear}-12-31` };
  const project = await createProject(org.drafter.viewer, {
    clientId: client.id,
    teamId: org.teamId,
    pmUserId: org.drafter.viewer.id,
    name: projectName,
    ...period,
  });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision || !project.id || !project.number) throw new Error("프로젝트 · 1차 차수가 없습니다");
  const subcategory = (await firstSelectableSubcategory()).value;
  const saved = await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
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
  // 06-19 E-2 — 완료 전 점검이 기안을 막지 않게 줄마다 카드 사용 1건 + 매출 발행 줄 1건(통합 픽스처와 같은 순서 · 강행 키 없음).
  for (const line of saved.lines) await cardUsageOn(org.drafter.viewer, line.id);
  await saveRevenue(SYSTEM_VIEWER, project.id, {
    issuedEntries: [{ id: randomUUID(), isNew: true, entryDate: period.endDate, amount: { currency: "KRW", amount: 1_000_000, fxRate: 1 } }],
  });
  const settled = await applyAutoSettlement({ projectIds: [project.id] });
  if (!settled.includes(project.id)) throw new Error("자동 정산이 되지 않았습니다");
  return { pm: org.drafter, lead: org.teamLead, ceo: org.ceo, projectId: project.id, projectNumber: project.number, projectName, period };
}

// 카드는 호출마다 새로 만든다 — 발급사 · 뒤 4자리 UNIQUE(X-a). 금액은 줄 실행가보다 작다.
async function cardUsageOn(holder: Viewer, lineId: string): Promise<void> {
  const tag = randomUUID().slice(0, 8);
  const card = await createCorpCard(SYSTEM_VIEWER, {
    issuer: `E2E정산카드사-${tag}`,
    numberLast4: String(1000 + Math.floor(Math.random() * 9000)),
    label: `E2E정산카드-${tag}`,
    kind: "personal",
    holderUserId: holder.id,
  });
  if (!card.id) throw new Error("카드 id 없음");
  const input: CardUsageInput = {
    corpCardId: card.id,
    usedOn: seoulToday(),
    merchantVendorId: null,
    total: { currency: "KRW", amount: 100_000, fxRate: 1 },
    evidenceTypeCode: "invoice",
    linkKind: "quote_line",
    lineId,
    memo: null,
  };
  await createCardUsage(holder, input, await precheckCardUsage(holder, input));
}

// 담당 PM이 정산 결재를 올린다(도메인 함수 — 화면 단계를 줄이는 준비).
export async function submitSettlementE2E(fx: SettlementE2E): Promise<void> {
  const result = await submitSettlement(fx.pm.viewer, { projectId: fx.projectId });
  if (result.kind !== "submitted") throw new Error("정산 결재가 올라가지 않았습니다");
}

async function currentInstance(fx: SettlementE2E): Promise<{ instanceId: string; version: number }> {
  const graph = await findApprovalGraphByDocument(SYSTEM_VIEWER, { documentKind: SETTLEMENT_DOCUMENT_KIND, documentId: fx.projectId });
  if (!graph) throw new Error("정산 결재 인스턴스가 없습니다");
  return { instanceId: graph.instance.id, version: graph.instance.version };
}

export async function approveSettlementE2E(fx: SettlementE2E): Promise<void> {
  const { instanceId, version } = await currentInstance(fx);
  await approveDocument(fx.ceo.viewer, { instanceId, expectedVersion: version });
}

export async function rejectSettlementE2E(fx: SettlementE2E, reason: string): Promise<void> {
  const { instanceId, version } = await currentInstance(fx);
  await rejectDocument(fx.ceo.viewer, { instanceId, expectedVersion: version, reason });
}

// D-80 — 팀장이 종료일을 미래로 늘려 정산 프로젝트를 진행으로 되돌린다(실제 기간 저장 경로).
export async function moveToInProgressE2E(fx: SettlementE2E): Promise<void> {
  await saveProjectLedger(fx.lead.viewer, fx.projectId, {
    seenStatus: "settling",
    period: { startDate: fx.period.startDate, endDate: "2099-12-31", baseline: fx.period },
  });
}
