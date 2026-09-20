// ADMN-02: 정보 항목 레지스트리 — 노출표 격자의 열 정본(03-03이 확장한다).
// staffDefault는 기본 계급(role-pm)의 시드 값이다 — 새 기능 정보의 기본값은
// 거짓(숨김)이고, 이 플랜이 등록하는 항목은 인트라넷 수준(기본 참) 둘과
// 새 기능(기본 거짓) 하나다.
export type InfoItemDef = { key: string; label: string; staffDefault: boolean };

export const INFO_ITEMS: InfoItemDef[] = [
  { key: "code_item.value", label: "코드표 값", staffDefault: true },
  { key: "code_item.label", label: "코드표 이름", staffDefault: true },
  { key: "action_log.detail", label: "행동 로그 상세", staffDefault: false },
];
