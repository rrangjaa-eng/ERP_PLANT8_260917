// 리저브 저장 계약 중 화면(클라이언트 컴포넌트)과 서버가 함께 쓰는 값. 이 파일에 다른 import를 두지 않는다 —
// domain/reserves/index.ts는 repositories(→ db/client.ts → pg)를 거쳐가는 서버 전용 의존 체인을 갖고 있고,
// app/(app)/pnl/reserves/actions.ts는 "use server"라 async 함수만 내보낼 수 있다
// (domain/code-tables/description-max.ts와 같은 이유로 분리한 잎(leaf) 모듈).

// 04-07 GAP 3 계약 — 보관 요청이 이미 보관된 줄이면 서버가 이 이유로 거부하고, 화면은 목표 달성으로 본다(Codex #3).
export const RESERVE_ARCHIVED_ROW_REASON = "보관된 줄 · 새로 고침";
