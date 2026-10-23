// 알림 엔진 상수 — 종류 파일이 등록부(condition-kinds.ts)를 값으로 import하지 않게 잎 모듈에 둔다(순환 방지). 등록부가 다시 내보낸다.

// D-716: 사건 종류의 고정 되돌아보기 창(달력일) — 한국 최장 연휴 + 주말을 덮는다. 지난 tick 시각을 창으로 쓰지 않는다(C-P1-1).
export const NOTIFY_EVENT_LOOKBACK_DAYS = 14;
// 종류 쿼리 하나가 한 tick에 읽는 평가량 상한(C-P2-13) — 걸리면 종류가 notify.condition_capped 경고를 남긴다.
export const NOTIFY_KIND_EVAL_MAX = 1000;
