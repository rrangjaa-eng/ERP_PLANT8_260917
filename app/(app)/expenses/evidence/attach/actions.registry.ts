// D-38(03-03 선례): 액션 레지스트리 등록을 actions.ts("use server", server-only 의존 체인)와 분리한다.
// 06.1-06 — 하위 경로 attach/에 관례 이름(actions.ts · actions.registry.ts)으로 둔다: 가드 시험(action-registry-completeness ·
// leak-scan-coverage)이 이 두 이름만 훑는다(Round 2 eng D-P2).
import { registerAction } from "@/lib/actions/registry";

// 붙일 문서 후보(S4 — EvidenceAttachCandidateDto · 금액 = evidence.amount).
registerAction({ name: "listAttachCandidatesAction", menu: "evidence.intake", action: "write", dtoName: "EvidenceAttachCandidateDto" });
// 붙이기 · 떼기 — 결과는 생김 · 뗌 여부뿐(행 DTO 없음). 승인 뒤 무효 처리 권리(expenses.evidence_void)는 domain이 판정한다.
registerAction({ name: "attachEvidenceRecordAction", menu: "evidence.intake", action: "write", dtoName: null });
registerAction({ name: "detachEvidenceRecordAction", menu: "evidence.intake", action: "write", dtoName: null });
// 떼기 미리 보기(PA-PREVIEW — EvidenceDetachPreviewDto · 금액 = evidence.amount).
registerAction({ name: "previewDetachAction", menu: "evidence.intake", action: "write", dtoName: "EvidenceDetachPreviewDto" });

// 06.1-08 증빙 고르기 S5 — 풀(EvidencePoolItemDto · 금액 = evidence.amount)은 모드 판정을 domain이 한다(작성자는 evidence 보기 + 05 권리표, 경영관리는 intake).
registerAction({ name: "listEvidencePoolAction", menu: "evidence", action: "view", dtoName: "EvidencePoolItemDto" });
registerAction({ name: "attachEvidenceAsAuthorAction", menu: "evidence", action: "view", dtoName: null });
registerAction({ name: "attachEvidenceBatchAction", menu: "evidence.intake", action: "write", dtoName: null });

// 06.1-08 작성자 자기 떼기 · 미리 보기 — 증빙 보기 + 05 규칙표 위 작성자 칸은 domain이 판정한다.
registerAction({ name: "detachOwnEvidenceAction", menu: "evidence", action: "view", dtoName: null });
registerAction({ name: "previewOwnDetachAction", menu: "evidence", action: "view", dtoName: "EvidenceDetachPreviewDto" });
