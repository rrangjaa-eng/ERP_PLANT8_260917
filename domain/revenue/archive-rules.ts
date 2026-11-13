// 07.6-01 매출 줄 지우기 · 되돌리기 순수 상수 — 서버 판정(domain/revenue/archive.ts)과 화면 타이머 · 표 위 잠김 줄이 같은 값을 읽는다(design r1 G4).
// D-7612(사용자 카드 확정 11/4 22:24 KST 「막기」 완료잠금)의 답이 「허용」으로 바뀌면 두 COMPLETED 상수와 그 호출만 뺀다.

// A1(domain/projects/members.ts RESTORE_WINDOW_MS 선례) — 지운 사람만 지운 뒤 10분 안에 되돌린다.
export const UNDO_WINDOW_MS = 10 * 60_000;
// 다음 한 수까지(SYSTEM.md 「다음 한 수」) — 「관리자」는 역할 낱말(계급 이름을 글자에 박지 않는다).
export const UNDO_EXPIRED = "삭제 뒤 10분 지남 · 복원은 관리자";
export const COMPLETED_DELETE_LOCK = "완료 프로젝트 · 삭제 불가";
export const COMPLETED_RESTORE_LOCK = "완료 프로젝트 · 복원 불가";
