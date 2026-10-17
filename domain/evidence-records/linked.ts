import { evidenceRecordRights, readEvidenceOwner, type EvidenceRecordLockLine } from "@/domain/evidence";
import { evidenceKindLabel } from "@/domain/evidence-records/status";
import { codeLabelsOf, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { can } from "@/domain/permissions/can";
import { registerDto } from "@/domain/permissions/dto-registry";
import { projectMany, type DtoSpec } from "@/domain/permissions/project";
import { canSeePurchaseRequest } from "@/domain/purchase-requests";
import type { Viewer } from "@/domain/viewer";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { kstDateOf } from "@/lib/kst-date";
import { listLinkedEvidenceRows, type LinkedEvidenceRow } from "@/repositories/evidence-record-links";

// 06.1-06(E21): 문서 「증빙」 섹션의 붙은 증빙 기록 읽기 행. 문서 읽기 판정(지출결의 05 canSee · 구매 요청 06 listAccess 범위)을 통과하지 못하면
// 그 판정의 거부 그대로(행 0이 아니라 거부). 행 끝 행동 · 잠김 줄은 05 규칙표 위 evidenceRecordRights 한 함수가 정한다(S7).

export type EvidenceLinkedItemDto = {
  linkId: string;
  recordId: string;
  typeLabel: string | null;
  counterparty: string | null;
  issuedOn: string;
  totalKrw: number;
  attachMode: string;
  /** 작성자 붙임(attach_mode = author)만 — 2행 `{이름} 고름 · {MM-DD}`(DB-7). 그 밖은 null. */
  pickedBy: string | null;
  pickedOn: string | null;
  /** 행 끝 위험 행동 — 반려 · 회수 `detach`(떼기) · 승인 `void`(무효 처리) · 없음 null. */
  action: "detach" | "void" | null;
};

export const EVIDENCE_LINKED_ITEM_DTO_SPEC: DtoSpec<EvidenceLinkedItemDto, EvidenceLinkedItemDto> = {
  fields: [
    { key: "linkId", from: "linkId", infoItem: "evidence.value" },
    { key: "recordId", from: "recordId", infoItem: "evidence.value" },
    { key: "typeLabel", from: "typeLabel", infoItem: "evidence.value" },
    { key: "counterparty", from: "counterparty", infoItem: "evidence.value" },
    { key: "issuedOn", from: "issuedOn", infoItem: "evidence.value" },
    { key: "totalKrw", from: "totalKrw", infoItem: "evidence.amount" },
    { key: "attachMode", from: "attachMode", infoItem: "evidence.value" },
    { key: "pickedBy", from: "pickedBy", infoItem: "evidence.value" },
    { key: "pickedOn", from: "pickedOn", infoItem: "evidence.value" },
    { key: "action", from: "action", infoItem: "evidence.value" },
  ],
};

registerDto({ name: "EvidenceLinkedItemDto", fields: EVIDENCE_LINKED_ITEM_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });

export type LinkedEvidence = {
  items: Partial<EvidenceLinkedItemDto>[];
  /** 섹션당 하나 이하 — 글자는 app(evidence-locked-lines)이 그린다. */
  lockLine: EvidenceRecordLockLine | null;
};

const PURCHASE_REQUEST_NOT_FOUND = "없는 구매 요청 · 새로 고침";

function itemOf(row: LinkedEvidenceRow, typeNames: ReadonlyMap<string, string>, action: EvidenceLinkedItemDto["action"]): EvidenceLinkedItemDto {
  const author = row.attachMode === "author";
  return {
    linkId: row.linkId,
    recordId: row.recordId,
    typeLabel: evidenceKindLabel({ evidenceType: row.evidenceType, typeLabel: typeNames.get(row.evidenceType) ?? null, originalApprovalNo: null }),
    counterparty: row.merchant ?? row.nameOnDocument,
    issuedOn: row.issuedOn,
    totalKrw: row.totalKrw,
    attachMode: row.attachMode,
    pickedBy: author ? row.attachedByName : null,
    pickedOn: author ? kstDateOf(row.attachedAt).slice(5) : null,
    action,
  };
}

export async function listLinkedEvidence(viewer: Viewer, owner: { kind: "expense" | "purchase_request"; id: string }): Promise<LinkedEvidence> {
  if (owner.kind === "purchase_request") {
    if (!(await canSeePurchaseRequest(viewer, { id: owner.id }))) throw new UserFacingError(PURCHASE_REQUEST_NOT_FOUND);
    const [rows, typeNames, intake] = await Promise.all([
      listLinkedEvidenceRows(viewer, { ownerKind: "purchase_request", ownerId: owner.id }),
      codeLabelsOf(viewer, "evidence_type"),
      can(viewer, "evidence.intake", "write"),
    ]);
    const items = rows.map((row) => itemOf(row, typeNames, intake ? "detach" : null));
    return { items: await projectMany(viewer, items, EVIDENCE_LINKED_ITEM_DTO_SPEC), lockLine: null };
  }
  const state = await readEvidenceOwner(viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: owner.id });
  const [rows, typeNames, intake, attachKey, voidKey] = await Promise.all([
    listLinkedEvidenceRows(viewer, { ownerKind: "expense", ownerId: state.id }),
    codeLabelsOf(viewer, "evidence_type"),
    can(viewer, "evidence.intake", "write"),
    can(viewer, "expenses.evidence_attach", "write"),
    can(viewer, "expenses.evidence_void", "write"),
  ]);
  // 떼기 권리는 지급 여부와 무관하다(paid는 붙이기 R1 갈래만 쓴다).
  const rights = evidenceRecordRights(state, { intake, attachKey, voidKey, isDrafter: state.drafterId === viewer.id, paid: false });
  const action = rights.detach === "none" ? null : rights.detach;
  const items = rows.map((row) => itemOf(row, typeNames, action));
  return { items: await projectMany(viewer, items, EVIDENCE_LINKED_ITEM_DTO_SPEC), lockLine: rights.lockLine };
}
