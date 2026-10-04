// UI-SPEC 「공용 컴포넌트 계약」 상태 배지(SC 9 · T-04.6-23) — 낱말 → 색 한 표. 호출부는 낱말만 넘기고 색은 이 표가 정한다.
// 같은 낱말이 블록마다 다른 색을 갖지 않는다(SYSTEM §7-5 의미 목록). 표에 없는 낱말은 타입 오류다.
export type StatusKind = "danger" | "warning" | "accent" | "success" | "muted";

export const STATUS_KIND = {
  // danger — 막힘 · 증빙 없음 · 반려 (+ 담당 없음: 결재선에 담당자가 비어 막힌 단계)
  막힘: "danger",
  "증빙 없음": "danger",
  반려: "danger",
  "담당 없음": "danger",
  // warning — 오늘 · 마감 임박 · 마감 중 · 정산
  오늘: "warning",
  "마감 임박": "warning",
  "마감 중": "warning",
  정산: "warning",
  // accent — 내 차례 · 결재 중 · 편집 중 · 진행 · 현재 · 내 결재 (+ 결재: 내 차례 블록의 결재 태그, `{단계} 결재 중`은 아래 StatusWord)
  "내 차례": "accent",
  결재: "accent",
  "결재 중": "accent",
  "편집 중": "accent",
  진행: "accent",
  현재: "accent",
  "내 결재": "accent",
  "지출결의 중": "accent",
  // success — 승인 · 연결 · 저장됨 · 완료 (+ 확정 · 적용 중: 공휴일·값 이력)
  승인: "success",
  연결: "success",
  저장됨: "success",
  완료: "success",
  확정: "success",
  "적용 중": "success",
  "본인 승인": "success",
  // muted — 대기 · 미착수 · 임시 · 미수주 · 취소 · 회수 · 첫 로그인 전 · 임시 비밀번호 사용 중
  //        (+ 지금 호출부: 수주중 · 보관됨 · 숨김 · 비활성 · 후보 · 예정 · 확인 불가 · 미설정)
  대기: "muted",
  미착수: "muted",
  임시: "muted",
  미수주: "muted",
  취소: "muted",
  회수: "muted",
  "첫 로그인 전": "muted",
  "임시 비밀번호 사용 중": "muted",
  "작성 중": "muted",
  수주중: "muted",
  보관됨: "muted",
  숨김: "muted",
  비활성: "muted",
  후보: "muted",
  예정: "muted",
  "확인 불가": "muted",
  미설정: "muted",
  // 확인증(Round 2 Q8 — #88 SYSTEM §7-5 의미 목록): 접수 중 accent · 제출됨 success · 신청됨 · 접수 전 · 닫힘 · 대조 제외 muted
  "접수 중": "accent",
  제출됨: "success",
  신청됨: "muted",
  "접수 전": "muted",
  닫힘: "muted",
  "대조 제외": "muted",
} as const satisfies Record<string, StatusKind>;

/** 표의 낱말 + 단계 이름이 붙은 `{단계} 결재 중`(accent). */
export type StatusWord = keyof typeof STATUS_KIND | `${string} 결재 중`;

export function statusKind(word: StatusWord): StatusKind {
  if (word in STATUS_KIND) return STATUS_KIND[word as keyof typeof STATUS_KIND];
  return "accent";
}
