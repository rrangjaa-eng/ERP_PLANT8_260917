import type { DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";

// 05-04(EVID-01): 증빙 파일 DTO — 주인이 지출결의이므로 칸은 expense.value(Phase 6이 주인 종류를 더하면 그 종류의 항목).
// 객체 키 · sha256 · 올린 사람 id는 싣지 않는다(보기 주소는 createEvidenceViewUrl이 그때그때 만든다).

export type EvidenceFileDto = {
  id: string;
  ownerKind: string;
  ownerId: string;
  originalName: string;
  sizeBytes: number;
  contentType: string;
  createdAt: Date;
  voidedAt: Date | null;
  voidReason: string | null;
  voidedByName: string | null;
};

export const EVIDENCE_FILE_DTO_SPEC: DtoSpec<EvidenceFileDto, EvidenceFileDto> = {
  fields: [
    { key: "id", from: "id", infoItem: "expense.value" },
    { key: "ownerKind", from: "ownerKind", infoItem: "expense.value" },
    { key: "ownerId", from: "ownerId", infoItem: "expense.value" },
    { key: "originalName", from: "originalName", infoItem: "expense.value" },
    { key: "sizeBytes", from: "sizeBytes", infoItem: "expense.value" },
    { key: "contentType", from: "contentType", infoItem: "expense.value" },
    { key: "createdAt", from: "createdAt", infoItem: "expense.value" },
    { key: "voidedAt", from: "voidedAt", infoItem: "expense.value" },
    { key: "voidReason", from: "voidReason", infoItem: "expense.value" },
    { key: "voidedByName", from: "voidedByName", infoItem: "expense.value" },
  ],
};

registerDto({ name: "evidenceFile", fields: EVIDENCE_FILE_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });
