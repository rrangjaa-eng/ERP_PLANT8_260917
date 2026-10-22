import { rowScopeFor } from "@/domain/permissions/scope-for";
import type { Viewer } from "@/domain/viewer";
import { findEvidenceTypeByValue } from "@/repositories/code-tables";

// 06.1-14(G15 · RP-15 ⑵ · T-061-142): 증빙 종류 코드표 항목의 「올린 사람 · 경영관리만 보기」(`code_items.private_to_owner` — 06.1-01)가
// 켜진 종류를 문서 증빙 종류로 가진 지출결의의 05 파일은 올린 사람과 전사 보는 범위만 본다. 260907 server/src/receipts.ts:280-285 ·
// :356-360(전사 범위는 그래도 본다) · purchases.ts:2676-2677(증빙을 보이는 모든 길). 06.1 증빙 기록 쪽 ⑴은 06.1-05가 덮는다.
// 보는 범위는 06.2 서술자 `rowScopeFor(viewer, "expense")` 하나만 쓴다(새 범위 판정 0 · 요청 memo가 문서 여럿을 한 번으로 묶는다).

/** 문서 화면 「증빙」 잠김 줄(UI-SPEC Copywriting G15) — 05 잠김 줄 자리의 한 줄. */
export function privateEvidenceLine(typeName: string): string {
  return `${typeName} · 경영관리만`;
}

/** 결재 시트 잠김 행(재검토 2회차 카드 G-N2 추천안 ① — 사용자 확정) — 건수 · 파일 이름 없음. */
export const PRIVATE_EVIDENCE_SHEET_NOTICE = "비공개 증빙 · 경영관리만";

export function privateFileVisible(input: { privateType: boolean; uploadedBy: string | null; viewerId: string; scopeAll: boolean }): boolean {
  if (!input.privateType) return true;
  if (input.uploadedBy !== null && input.uploadedBy === input.viewerId) return true;
  return input.scopeAll;
}

/** 증빙 종류 코드 항목의 이름 · 속성(보관 · 꺼짐 포함 — 코드 항목 보관 · 사용 끔은 새 선택만 막는다). 종류가 없으면 null. */
export async function privateEvidenceTypeOf(viewer: Viewer, evidenceType: string | null): Promise<{ privateToOwner: boolean; label: string } | null> {
  if (!evidenceType) return null;
  const item = await findEvidenceTypeByValue(viewer, evidenceType);
  return item ? { privateToOwner: item.privateToOwner, label: item.label } : null;
}

export type FileVisibility = {
  /** 파일 행마다 — 05 파일은 `uploadedBy`와 파일 칸 `privateToOwner`, 붙은 기록은 uploadedBy null(올린 사람 갈래 없음 — PA-G15-LINKED). 칸은 필수(cso 대체 L-1). */
  visible(file: { uploadedBy: string | null; privateToOwner: boolean }): boolean;
  /** 숨길 수 있는 종류면 그 이름(잠김 줄 글자), 아니면 null. */
  privateTypeName: string | null;
};

const ALL_VISIBLE: FileVisibility = { visible: () => true, privateTypeName: null };

/**
 * 주인 종류 · 문서 증빙 종류 값으로 한 번 — 결재 시트가 문서 여럿을 종류 값마다 한 번으로 거른다(Round 2 P1-6).
 * 지출결의가 아닌 주인(차수 승인 · 리저브 · 카드 전표)은 늘 「다 보임」이다(05 동작 그대로 · 재검토 2회차 eng P3).
 */
export async function fileVisibilityFor(viewer: Viewer, input: { ownerKind: string; evidenceType: string | null }): Promise<FileVisibility> {
  if (input.ownerKind !== "expense") return ALL_VISIBLE;
  const type = await privateEvidenceTypeOf(viewer, input.evidenceType);
  const typePrivate = type?.privateToOwner === true;
  const scopeAll = (await rowScopeFor(viewer, "expense")).rows === "all";
  return {
    // 07-27(R20 · AQ-15): 보임 = 파일 칸 OR 지금 문서 종류 — 비공개 종류로 올린 파일은 종류를 공개로 바꿔도 같은 규칙으로 숨는다.
    visible: (file) => privateFileVisible({ privateType: typePrivate || file.privateToOwner === true, uploadedBy: file.uploadedBy, viewerId: viewer.id, scopeAll }),
    privateTypeName: type?.privateToOwner ? type.label : null,
  };
}
