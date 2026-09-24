// ADMN-02: 정보 항목 레지스트리 — 노출표 격자의 열 정본(03-03이 확장한다).
// staffDefault는 기본 계급(role-pm)의 시드 값이다 — 새 기능 정보의 기본값은
// 거짓(숨김)이고, 이 플랜이 등록하는 항목은 인트라넷 수준(기본 참) 둘과
// 새 기능(기본 거짓) 하나다.
export type InfoItemDef = { key: string; label: string; staffDefault: boolean };

export const INFO_ITEMS: InfoItemDef[] = [
  { key: "code_item.value", label: "코드표 값", staffDefault: true },
  { key: "code_item.label", label: "코드표 이름", staffDefault: true },
  { key: "action_log.detail", label: "행동 로그 상세", staffDefault: false },
  // ADMN-02(REQUIREMENTS.md 106행)가 이름 붙인 새 기능 정보 6종 — 기획본부
  // 기본값은 전부 숨김("새 기능 정보는 기본 숨김"). 앞 다섯은 Phase 9~10의
  // DTO가 붙을 자리이고 마지막(계좌번호 마스킹 해제)은 03-06이 쓴다. 항목만
  // 있고 아직 DTO가 없는 것은 문제가 아니다 — ADMN-03이 요구하는 방향은
  // "DTO가 항목에 매핑되지 않으면 실패"이고 그 역방향이 아니다.
  { key: "pnl.amount", label: "손익 숫자", staffDefault: false },
  { key: "team.cost", label: "팀 비용", staffDefault: false },
  { key: "target.amount", label: "목표", staffDefault: false },
  { key: "incentive.amount", label: "인센티브", staffDefault: false },
  { key: "vendor.amount", label: "거래처 금액", staffDefault: false },
  { key: "vendor.account_number_unmasked", label: "거래처 계좌번호 마스킹 해제", staffDefault: false },
  // MAST-02·MAST-03(03-05): 사람·계급·조직·법인카드 마스터 정보. 인트라넷
  // 수준의 구조적 정보라 기본값은 참(code_item.value와 같은 결).
  { key: "person.value", label: "사람 정보", staffDefault: true },
  { key: "role.value", label: "계급 정보", staffDefault: true },
  { key: "org_unit.value", label: "본부 정보", staffDefault: true },
  { key: "team.value", label: "팀 정보", staffDefault: true },
  { key: "team_assignment.value", label: "팀 소속 발령 이력", staffDefault: true },
  { key: "corp_card.value", label: "법인카드 정보", staffDefault: true },
  // MAST-01(03-06): 거래처 구조 정보 — 이름·사업자 번호·뒤 4자리 등 마스킹
  // 해제 이전 단계의 마스터 정보. 인트라넷 수준의 구조적 정보라 기본값은
  // 참(person.value 등과 같은 결). 계좌번호 마스킹 해제(위 항목)와는 별도로
  // 게이트한다 — 뒤 4자리는 이미 목록에 보이는 정보라 별도 항목일 필요가
  // 없지만, 마스킹 해제(평문)는 위의 vendor.account_number_unmasked가
  // 전담한다.
  { key: "vendor.value", label: "거래처 정보", staffDefault: true },
  // Phase 4(04-01, Rule 2): 프로젝트 구조 정보(번호·이름·클라이언트·담당
  // PM·팀·상태·기간 등) — vendor.value·person.value와 같은 결로 인트라넷
  // 수준 구조 정보라 기본값 참. 플랜이 명시한 항목은 quote.amount 하나뿐이나
  // ProjectDto 전체가 걸릴 정보 항목이 없으면 project(viewer, row, spec)
  // 투영이 모든 계급에서 0필드를 돌려주는 조용한 결함이 된다(정보 노출표
  // 행이 없으면 visible()은 기본 거부) — 구조적으로 필요해 함께 등록한다.
  { key: "project.value", label: "프로젝트 정보", staffDefault: true },
  // PROJ-02: 견적·실행가·차익 열. 기획 PM이 매일 다루는 자기 프로젝트의
  // 숫자라 기본값 참(위 vendor.amount처럼 대표 전용으로 막지 않는다) —
  // 손익 숫자(pnl.amount)와는 다른 항목이다(견적 줄 = 계획값, 손익 = 확정
  // 비용 기준 결과값, Phase 9).
  { key: "quote.amount", label: "견적·실행가·차익", staffDefault: true },
  // 04-02(D-57·T-04-09): 매출 섹션의 발행·입금 두 표. 기획본부 기본값은
  // 숨김("새 기능 정보는 기본 숨김") — 발행·입금은 계약 금액과 달리
  // 경영관리 전용 정보다. domain/revenue가 이 항목이 불통과면 DTO 배열
  // 필드 자체를 싣지 않는다(빈 배열이 아니라 필드 부재, project()의
  // 기본 동작).
  { key: "revenue.issued_amount", label: "매출 발행액", staffDefault: false },
  { key: "revenue.paid_amount", label: "매출 입금액", staffDefault: false },
  // ADMN-12(03-07): 보관함 목록 항목 — 여러 마스터 표를 섞어 보여주는
  // 화면이라 특정 표 전용 항목(예: vendor.value)으로는 게이트할 수 없다.
  // 관리자 전용 화면이라 기본값은 거짓(새 기능 정보는 기본 숨김).
  { key: "archive.value", label: "보관함 정보", staffDefault: false },
];
