// 06.1-05(D-6112 · SP-6101): 증빙 기록 한 줄의 상태 낱말과 2행. 판정은 서버의 이 함수 하나만 한다 — 화면은 낱말을 받아 그린다.
// 한 값 규칙: 보관됨 > 카드 미등록 > 확인 필요 > 붙음 > 미공개 > 팀 공개 > 본부 공개의 첫 값 하나(`취소` 자리 없음 — 06.1-01에
// `canceled` 칸이 없다). 낱말은 리터럴 타입이라 StatusTag의 status(StatusWord)에 그대로 들어간다 — 색은 status-map.ts 한 표가 정한다.

export type EvidenceRecordWord = "보관됨" | "카드 미등록" | "확인 필요" | "붙음" | "미공개" | "팀 공개" | "본부 공개";
export type EvidenceRecordVisibility = "private" | "team" | "division";

export type EvidenceRecordStatusInput = {
  archived: boolean;
  /** 카드 서식(06.1-02 `keyKind: "card"`) 줄인가. */
  isCardFormat: boolean;
  corpCardId: string | null;
  /** `{카드사} {끝 4자리}` — 카드 미등록 2행. */
  cardLabel: string | null;
  /** 확인 필요 사유 글(06.1-04가 저장한 그대로) 또는 null. */
  needsCheck: string | null;
  /** 살아 있는 붙임이 있나(`detached_at IS NULL`). */
  attached: boolean;
  /** 합계가 음수인 줄(수정 · 부분 취소 — DA-9). */
  negative: boolean;
  visibility: EvidenceRecordVisibility;
  /** 팀 공개 줄의 팀 이름. */
  teamName: string | null;
  /** 본부 공개 줄에 저장된 본부의 이름(저장 당시 설정 — DA-11). */
  divisionName: string | null;
  /** 증빙 종류가 「올린 사람 · 경영관리만 보기」(코드 항목 `private_to_owner` — G15)면 그 종류 이름, 아니면 null. */
  privateTypeName: string | null;
};

export type EvidenceRecordStatus = { word: EvidenceRecordWord; detail: string | null };

export function evidenceRecordStatus(input: EvidenceRecordStatusInput): EvidenceRecordStatus {
  if (input.archived) return { word: "보관됨", detail: null };
  if (input.isCardFormat && input.corpCardId === null) {
    return { word: "카드 미등록", detail: input.cardLabel === null ? "카드 등록은 관리자" : `${input.cardLabel} · 카드 등록은 관리자` };
  }
  if (input.needsCheck !== null) return { word: "확인 필요", detail: input.needsCheck };
  // 붙음 2행(문서 번호 링크)은 06.1-06이 붙임 화면과 함께 채운다.
  if (input.attached) return { word: "붙음", detail: null };
  // 음수 줄 · 경영관리만 종류는 저장값과 무관하게 미공개다 — 공개할 수 없는 줄이라 2행이 다음 행동(음수) 또는 까닭(G15)을 말한다.
  if (input.negative) return { word: "미공개", detail: "음수 · 원거래 문서에 붙이기" };
  if (input.privateTypeName !== null) return { word: "미공개", detail: `${input.privateTypeName} · 경영관리만` };
  switch (input.visibility) {
    case "private":
      return { word: "미공개", detail: null };
    case "team":
      return { word: "팀 공개", detail: input.teamName };
    case "division":
      return { word: "본부 공개", detail: input.divisionName === null ? null : `${input.divisionName} 공개` };
    default: {
      const unreachable: never = input.visibility;
      void unreachable;
      return { word: "미공개", detail: null };
    }
  }
}

export type EvidenceVisibilityCell = "edit" | "locked" | "readonly";

// 공개 칸을 고칠 수 있나(UI-SPEC S2 · DA-9 · RP-15 ⑴). 확인 필요 · 카드 미등록은 잠긴 셀(이유는 상태 2행이 말한다 — 풀리면 다시 고친다),
// 붙음 · 음수 · 경영관리만 종류 · 보관은 공개할 수 없어 `—`다. 서버 저장 검사(publishEvidenceRecords)도 이 함수로 가른다.
export function evidenceVisibilityCell(input: EvidenceRecordStatusInput): EvidenceVisibilityCell {
  if (input.archived) return "readonly";
  if (input.isCardFormat && input.corpCardId === null) return "locked";
  if (input.needsCheck !== null) return "locked";
  if (input.attached || input.negative || input.privateTypeName !== null) return "readonly";
  return "edit";
}

export type EvidenceRowAction = "archive" | "restore" | null;

// 행 행동(DA-7 · E41 · PA-NEG-ARC) — 보관 줄은 되살리기, 안 붙은 줄(음수 · 잠긴 줄 포함)은 보관, 붙은 줄은 없음(`떼기`는 06.1-06 —
// 둘은 붙음 여부로 갈려 한 행에 같이 서지 않는다). 확인 필요 · 카드 미등록 낱말이 붙음을 덮어도 판정은 붙음 칸으로 한다.
// 서버 보관 · 되살림 검사(archiveEvidenceRecord · restoreEvidenceRecord)도 이 함수로 가른다.
export function evidenceRowAction(input: EvidenceRecordStatusInput): EvidenceRowAction {
  if (input.archived) return "restore";
  return input.attached ? null : "archive";
}

// 공개 칸에 보이는 글자 — 저장된 값의 라벨(UI-SPEC S2 「셀에 보이는 글자는 고른 라벨」). 본부 공개 줄은 저장 당시 본부 이름이다(DA-11 하위 —
// 설정이 바뀌어도 그 줄은 옛 본부에 남는다). 화면은 이 글자를 받아 그리고 이름을 이어 붙이지 않는다.
export function evidenceVisibilityLabel(input: EvidenceRecordStatusInput): string {
  switch (input.visibility) {
    case "private":
      return "미공개";
    case "team":
      return `${input.teamName ?? "팀"} 공개`;
    case "division":
      return `${input.divisionName ?? "본부"} 공개`;
    default: {
      const unreachable: never = input.visibility;
      void unreachable;
      return "미공개";
    }
  }
}

// DA-8 · E42 — 목록 2행 · 패널의 종류 글자(종류 라벨 함수는 이 하나). 당초 승인번호가 있는 세금계산서 · 계산서 줄은 수정 문서라 글자만
// `수정세금계산서` · `수정계산서`로 바꾼다(새 태그 · 색 없음, `[종류 ▾]` 값은 그대로 — 수정세금계산서는 세금계산서에 든다).
const AMENDED_KIND_LABELS: Readonly<Record<string, string>> = { tax_invoice: "수정세금계산서", invoice: "수정계산서" };

export function evidenceKindLabel(input: { evidenceType: string; typeLabel: string | null; originalApprovalNo: string | null }): string | null {
  if (input.originalApprovalNo !== null) return AMENDED_KIND_LABELS[input.evidenceType] ?? input.typeLabel;
  return input.typeLabel;
}
