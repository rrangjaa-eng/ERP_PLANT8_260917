// 리저브 저장 계약 중 화면(클라이언트 컴포넌트)과 서버가 함께 쓰는 값. 이 파일에 다른 import를 두지 않는다 —
// domain/reserves/index.ts는 repositories(→ db/client.ts → pg)를 거쳐가는 서버 전용 의존 체인을 갖고 있고,
// app/(app)/pnl/reserves/actions.ts는 "use server"라 async 함수만 내보낼 수 있다
// (domain/code-tables/description-max.ts와 같은 이유로 분리한 잎(leaf) 모듈).

// 04-07 GAP 3 계약 — 보관 요청이 이미 보관된 줄이면 서버가 이 이유로 거부하고, 화면은 목표 달성으로 본다(Codex #3).
export const RESERVE_ARCHIVED_ROW_REASON = "보관된 줄 · 새로 고침";

// 리뷰 R8 · Codex #4 — 한 저장의 줄 상한(rows · archived 각각). 거래처 행을 잠근 채 줄마다 쓰므로 큰 요청이 잠금을 오래
// 잡지 않게 한다. 리저브에는 따로 정한 줄 상한이 없어 견적 차수당 줄 상한(quote_line.max_per_revision) 기본값과 맞춘다.
export const RESERVE_SAVE_MAX_ROWS = 300;

// 서버 가장자리의 상한 거부 이유 — 화면은 검증 오류 트리에서 이 글자를 그대로 받는다.
export const RESERVE_SAVE_CAP_REASON = `저장 전부 거부 · 저장당 ${RESERVE_SAVE_MAX_ROWS}줄 상한`;
