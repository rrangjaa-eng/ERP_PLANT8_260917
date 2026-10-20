import { evidenceRecordRights, readEvidenceOwner, type EvidenceRecordLockLine } from "@/domain/evidence";
import { privateEvidenceTypeOf, privateFileVisible } from "@/domain/evidence/private-files";
import { evidenceKindLabel } from "@/domain/evidence-records/status";
import { codeLabelsOf, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { can } from "@/domain/permissions/can";
import { evidenceScopeFor, rowScopeFor } from "@/domain/permissions/scope-for";
import { registerDto } from "@/domain/permissions/dto-registry";
import { projectMany, type DtoSpec } from "@/domain/permissions/project";
import { canSeePurchaseRequest, purchaseRequestReadScope } from "@/domain/purchase-requests";
import type { Viewer } from "@/domain/viewer";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { kstDateOf } from "@/lib/kst-date";
import { listLinkedEvidenceRows, listLiveLinksWithRecords, type LinkedEvidenceRow } from "@/repositories/evidence-record-links";
import { filterPurchaseRequestIdsInScope } from "@/repositories/purchase-requests";

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
  /** 06.1-08 — 이 행의 `떼기`가 작성자 본인 길(자기 author 붙임)이다. 화면이 작성자 액션을 고르는 데만 쓴다. */
  ownDetach: boolean;
  /** 확인 필요 사유(PR-C 카드 결정 — 뒤 파일 취소가 붙은 원거래에 세운 사유 등) · 없으면 null. */
  needsCheck: string | null;
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
    { key: "ownDetach", from: "ownDetach", infoItem: "evidence.value" },
    { key: "needsCheck", from: "needsCheck", infoItem: "evidence.value" },
  ],
};

registerDto({ name: "EvidenceLinkedItemDto", fields: EVIDENCE_LINKED_ITEM_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });

export type LinkedEvidence = {
  items: Partial<EvidenceLinkedItemDto>[];
  /** 섹션당 하나 이하 — 글자는 app(evidence-locked-lines)이 그린다. */
  lockLine: EvidenceRecordLockLine | null;
};

const PURCHASE_REQUEST_NOT_FOUND = "없는 구매 요청 · 새로 고침";

// 06.1-14(G15 · PA-G15-LINKED · T-061-148): 기록 자신의 증빙 종류가 「올린 사람 · 경영관리만 보기」면 전사 보는 범위 · 증빙 행 범위 all만 본다
// (기록은 경영관리가 등록하고 작성자는 공개 풀에서 그 종류를 못 고른다 — 06.1-05 ⑴). 올린 사람 갈래가 없다.
async function visibleRows<Row extends { evidenceType: string }>(viewer: Viewer, rows: readonly Row[]): Promise<Row[]> {
  const types = new Map<string, boolean>();
  for (const type of new Set(rows.map((row) => row.evidenceType))) {
    types.set(type, (await privateEvidenceTypeOf(viewer, type))?.privateToOwner === true);
  }
  if (![...types.values()].some(Boolean)) return [...rows];
  const [rowScope, evidenceScope] = await Promise.all([rowScopeFor(viewer, "expense"), evidenceScopeFor(viewer)]);
  const scopeAll = rowScope.rows === "all" || evidenceScope.rows === "all";
  return rows.filter((row) => privateFileVisible({ privateType: types.get(row.evidenceType) === true, uploadedBy: null, viewerId: viewer.id, scopeAll }));
}

function itemOf(row: LinkedEvidenceRow, typeNames: ReadonlyMap<string, string>, action: EvidenceLinkedItemDto["action"], ownDetach = false): EvidenceLinkedItemDto {
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
    ownDetach,
    needsCheck: row.needsCheck,
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
    const items = (await visibleRows(viewer, rows)).map((row) => itemOf(row, typeNames, intake ? "detach" : null));
    return { items: await projectMany(viewer, items, EVIDENCE_LINKED_ITEM_DTO_SPEC), lockLine: null };
  }
  const state = await readEvidenceOwner(viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: owner.id });
  const [rows, typeNames, intake, attachKey, voidKey, expensesWrite] = await Promise.all([
    listLinkedEvidenceRows(viewer, { ownerKind: "expense", ownerId: state.id }),
    codeLabelsOf(viewer, "evidence_type"),
    can(viewer, "evidence.intake", "write"),
    can(viewer, "expenses.evidence_attach", "write"),
    can(viewer, "expenses.evidence_void", "write"),
    can(viewer, "expenses", "write"),
  ]);
  // 떼기 권리는 지급 여부와 무관하다(paid는 붙이기 R1 갈래만 쓴다). 작성자 칸은 자기 author 붙임에만 — 남의 붙임 · 경영관리 붙임은 늘 아니다(A9).
  const rights = evidenceRecordRights(state, { intake, attachKey, voidKey, isDrafter: state.drafterId === viewer.id, paid: false, expensesWrite });
  const items = (await visibleRows(viewer, rows)).map((row) => {
    if (rights.detach !== "none") return itemOf(row, typeNames, rights.detach);
    const own = rights.authorDetach && row.attachMode === "author" && row.attachedBy === viewer.id;
    return itemOf(row, typeNames, own ? "detach" : null, own);
  });
  return { items: await projectMany(viewer, items, EVIDENCE_LINKED_ITEM_DTO_SPEC), lockLine: rights.lockLine };
}

// 06.1-08(PA-PRLINE): 구매 요청 목록 쪽마다 한 번 — 요청마다 첫 붙은 증빙(붙인 순). 범위 밖 id는 06 목록 범위로 버린다(새 범위 판정 없음).
export async function listLinkedEvidenceForOwners(viewer: Viewer, input: { kind: "purchase_request"; ids: readonly string[] }): Promise<Record<string, Partial<EvidenceLinkedItemDto>>> {
  if (input.ids.length === 0) return {};
  const ids = await filterPurchaseRequestIdsInScope(viewer, { ids: input.ids, scope: await purchaseRequestReadScope(viewer) });
  const [rows, typeNames] = await Promise.all([listLiveLinksWithRecords(viewer, { ownerKind: input.kind, ownerIds: ids }), codeLabelsOf(viewer, "evidence_type")]);
  const first = new Map<string, EvidenceLinkedItemDto>();
  for (const row of (await visibleRows(viewer, rows)).sort((a, b) => a.attachedAt.getTime() - b.attachedAt.getTime())) {
    if (!first.has(row.ownerId)) first.set(row.ownerId, itemOf({ ...row, attachedByName: null }, typeNames, null));
  }
  const entries = [...first.entries()];
  const projected = await projectMany(viewer, entries.map(([, item]) => item), EVIDENCE_LINKED_ITEM_DTO_SPEC);
  return Object.fromEntries(entries.map(([ownerId], index) => [ownerId, projected[index] ?? {}]));
}
