import { registerDto } from "@/domain/permissions/dto-registry";
import type { DtoSpec } from "@/domain/permissions/project";

// 05-11(D-98 · S10 (나)): 정산 결재 문서 DTO — 프로젝트 사실은 `project.value`, 기안 · 결재 사실은 `approval.value`, 판단 근거 두 합은
// 견적 표 금액 열과 같은 `quote.amount`(새 정보 항목 없음 — G4). 손익 행은 없다(PNL-01 · Phase 9, D11).
export type SettlementDocumentDto = {
  id: string;
  projectId: string;
  projectName: string;
  projectNumber: string;
  projectStatus: string;
  startDate: string | null;
  endDate: string | null;
  pmName: string | null;
  quoteTotalKrw: number;
  executionTotalKrw: number;
  drafterName: string;
  createdAt: Date;
  statusWord: string;
  instanceId: string | null;
};

// 투영 원본 — 두 합은 viewer가 견적 줄 금액을 볼 때만 실린다(못 보면 키째 없다).
export type SettlementDocumentSource = Omit<SettlementDocumentDto, "quoteTotalKrw" | "executionTotalKrw"> &
  Partial<Pick<SettlementDocumentDto, "quoteTotalKrw" | "executionTotalKrw">>;

export const SETTLEMENT_DOCUMENT_DTO_SPEC: DtoSpec<SettlementDocumentSource, SettlementDocumentDto> = {
  fields: [
    { key: "id", from: "id", infoItem: "approval.value" },
    { key: "projectId", from: "projectId", infoItem: "project.value" },
    { key: "projectName", from: "projectName", infoItem: "project.value" },
    { key: "projectNumber", from: "projectNumber", infoItem: "project.value" },
    { key: "projectStatus", from: "projectStatus", infoItem: "project.value" },
    { key: "startDate", from: "startDate", infoItem: "project.value" },
    { key: "endDate", from: "endDate", infoItem: "project.value" },
    { key: "pmName", from: "pmName", infoItem: "project.value" },
    { key: "quoteTotalKrw", from: "quoteTotalKrw", infoItem: "quote.amount" },
    { key: "executionTotalKrw", from: "executionTotalKrw", infoItem: "quote.amount" },
    { key: "drafterName", from: "drafterName", infoItem: "approval.value" },
    { key: "createdAt", from: "createdAt", infoItem: "approval.value" },
    { key: "statusWord", from: "statusWord", infoItem: "approval.value" },
    { key: "instanceId", from: "instanceId", infoItem: "approval.value" },
  ],
};

registerDto({ name: "settlementDocument", fields: SETTLEMENT_DOCUMENT_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });
