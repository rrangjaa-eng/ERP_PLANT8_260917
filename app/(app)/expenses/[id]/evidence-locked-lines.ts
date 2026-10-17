// 06.1-06(PA-LOCKCODE · Round 2 eng B-P2): 문서 「증빙」 섹션 잠김 줄 글자 — 지시문 없는 공용 모듈(클라이언트 지시 파일의 내보냄은 서버 컴포넌트에서
// 문자열로 쓸 수 없다). 05 둘은 evidence-attachments.tsx에서 글자 그대로 옮겼고, 06.1 둘은 S7 결재 중 · 승인 갈래다. 코드는 domain
// evidenceRecordRights가 정한다(EvidenceRecordLockLine).

// 결재 중 기안자에게 「하나 더」 자리에 보이는 잠김 한 줄(사용자 결정 2026-10-04 — 결재 중 증빙은 경영관리가 붙인다).
export const EVIDENCE_DRAFTER_LOCKED_LINE = "결재 중 · 증빙은 경영관리";
// 06-11(U-4) — 완료 프로젝트의 승인 문서는 기안자에게 닫힌다(붙이기 권한자만). 같은 잠김 줄 자리.
export const EVIDENCE_COMPLETED_PROJECT_LINE = "완료 프로젝트 · 증빙은 경영관리";
export const EVIDENCE_IN_REVIEW_NO_DETACH_LINE = "결재 중 · 떼기 없음";
export const EVIDENCE_APPROVED_VOID_ONLY_LINE = "승인됨 · 떼기는 증빙 무효 담당";

export type EvidenceLockLineCode = "in_review_author" | "in_review_no_detach" | "approved_void_only" | "completed_project_author";

export const EVIDENCE_LOCK_LINE_TEXT: Record<EvidenceLockLineCode, string> = {
  in_review_author: EVIDENCE_DRAFTER_LOCKED_LINE,
  completed_project_author: EVIDENCE_COMPLETED_PROJECT_LINE,
  in_review_no_detach: EVIDENCE_IN_REVIEW_NO_DETACH_LINE,
  approved_void_only: EVIDENCE_APPROVED_VOID_ONLY_LINE,
};
