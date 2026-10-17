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
