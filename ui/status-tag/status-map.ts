// UI-SPEC 「공용 컴포넌트 계약」 상태 배지(SC 9 · T-04.6-23) — 낱말 → 색 한 표. 호출부는 낱말만 넘기고 색은 이 표가 정한다.
// 같은 낱말이 블록마다 다른 색을 갖지 않는다(SYSTEM §7-5 의미 목록). 표에 없는 낱말은 타입 오류다.
export type StatusKind = "danger" | "warning" | "accent" | "success" | "muted";

export const STATUS_KIND = {
  // danger — 막힘 · 증빙 없음 · 반려 (+ 담당 없음: 결재선에 담당자가 비어 막힌 단계)
  막힘: "danger",
  "증빙 없음": "danger",
  // 06.1 SP-6101: 증빙 기록 — 카드 사용에 짝이 없는 줄
  "카드 미등록": "danger",
  반려: "danger",
  "담당 없음": "danger",
  // 06-19 S18: 완료 전 점검 — 선결제 뒤 증빙이 없는 미결 지출결의(D-611)
  "선결제 · 증빙 없음": "danger",
  // warning — 오늘 · 마감 임박 · 마감 중 · 정산
  오늘: "warning",
  "마감 임박": "warning",
  "마감 중": "warning",
  정산: "warning",
  // 06.1 SP-6101: 증빙 기록 파일 줄 사유(지출결의 증빙 상태 `확인 전`과 다른 표)
  "확인 필요": "warning",
  // 06 SP-2: 선결제(증빙 없이 먼저 지급 — 지급 게이트 예외)
  선결제: "warning",
  // accent — 내 차례 · 결재 중 · 편집 중 · 진행 · 현재 · 내 결재 (+ 결재: 내 차례 블록의 결재 태그, `{단계} 결재 중`은 아래 StatusWord)
  "내 차례": "accent",
  결재: "accent",
  "결재 중": "accent",
  "편집 중": "accent",
  진행: "accent",
  현재: "accent",
  "내 결재": "accent",
  "지출결의 중": "accent",
  // 06 SP-2: 구매 요청 중(카드 쪽 견적 줄 — `지출결의 중`과 같은 꼴, text 변형만) · 확인 전(증빙 있음, 경영관리 확인 전)
  "구매 요청 중": "accent",
  "확인 전": "accent",
  // 06.1 SP-6101: 증빙 기록 낱말 — 서버가 한 값 규칙(보관됨 > 카드 미등록 > 확인 필요 > 붙음 > 미공개 > 팀 공개 > 본부 공개)으로 고른다
  미공개: "accent",
  // success — 승인 · 연결 · 저장됨 · 완료 (+ 확정 · 적용 중: 공휴일·값 이력)
  승인: "success",
  연결: "success",
  저장됨: "success",
  완료: "success",
  확정: "success",
  "적용 중": "success",
  "본인 승인": "success",
  // 06 SP-2: 지급 완료 · 카드 사용(견적 줄 파생·지급 표) · 확인됨(증빙) · 구매 완료 · 발행됨
  "지급 완료": "success",
  "카드 사용": "success",
  확인됨: "success",
  "구매 완료": "success",
  발행됨: "success",
  붙음: "success",
  // muted — 대기 · 미착수 · 임시 · 미수주 · 취소 · 회수 · 첫 로그인 전 · 임시 비밀번호 사용 중
  //        (+ 지금 호출부: 수주중 · 보관됨 · 숨김 · 비활성 · 후보 · 예정 · 확인 불가 · 미설정)
  //        (+ 종결: 반려 · 회수 지출결의를 끝냄 — S23 · 06-28)
  대기: "muted",
  미착수: "muted",
  임시: "muted",
  미수주: "muted",
  취소: "muted",
  회수: "muted",
  종결: "muted",
  무효: "muted",
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
  // 06 SP-2: 면제(경영관리가 증빙을 면제함)
  면제: "muted",
  // 06.1 SP-6101: 공개 범위 낱말 둘(증빙 기록 — 위 한 값 규칙의 끝 둘)
  "팀 공개": "muted",
  "본부 공개": "muted",
  // 06.2 SP-62-2: 퇴직한 참여자 · 참여자 표 첫 행 담당 PM — 이름 뒤 글자 태그
  퇴직: "muted",
  "담당 PM": "muted",
  // 07 개정 1 (D-704 · J8): 결재 마감을 넘겨 다음 지급 가능 금요일로 민 건에만 — 기한 안 마지막 영업일로 잡은 건에는 쓰지 않는다(D-741)
  "마감 지나 밀림": "warning",
  // 07 개정 1 (J3): 지급 예정일을 사람이 직접 지정한 건
  "수동 지정": "muted",
  // 07 개정 1 (V9): 거래처 계좌가 지급 지정 뒤 바뀐 건
  "계좌 바뀜": "warning",
  // 07 개정 1 (U1): 사람 로그인 잠김 — 옛 명단 자리(확인증) `잠김`과 다른 뜻
  잠김: "danger",
  // 07 개정 1 (W5): 한도 · 예산 초과
  초과: "danger",
  // 07 개정 1 (N22): 수금 기일을 넘긴 건
  "수금 지연": "warning",
} as const satisfies Record<string, StatusKind>;

/** 표의 낱말 + 단계 이름이 붙은 `{단계} 결재 중`(accent) + 조직 화면 중복 개수(warning). */
export type StatusWord = keyof typeof STATUS_KIND | `${string} 결재 중` | `팀장 ${number}명` | `책임자 ${number}명`;

export function statusKind(word: StatusWord): StatusKind {
  if (word in STATUS_KIND) return STATUS_KIND[word as keyof typeof STATUS_KIND];
  // 06.4 SP-64-1: 조직 화면 팀장 · 책임자 중복 개수 — 조치가 필요하지만 막힘은 아님(warning)
  if (/^(팀장|책임자) \d+명$/.test(word)) return "warning";
  return "accent";
}
