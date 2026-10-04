// 05-05: 지출결의 액션 등록 — actions.ts("use server", server-only 의존 체인)와 분리(03-03 선례). 메뉴 · 동작은 누수 스캔 분류다.
// 판정(권한 · 보임 · 기안자)은 domain이 한다.
import { registerAction } from "@/lib/actions/registry";

// 만들어진 문서 id · 막힌 줄 이유만 돌려준다(DTO 없음).
registerAction({ name: "createExpenseFromLinesAction", menu: "expenses", action: "write", dtoName: null });

// 저장된 버전 · 저장 시각만 돌려준다(DTO 없음).
registerAction({ name: "saveExpenseDraftAction", menu: "expenses", action: "write", dtoName: null });

// 토스트 재료(다음 담당 이름)를 ApprovalActionResultDto로 투영해 돌려준다.
registerAction({ name: "submitExpenseAction", menu: "expenses", action: "write", dtoName: "ApprovalActionResultDto" });

// 서명 PUT 주소 · 헤더 · 의도 id만 돌려준다(DTO 없음).
registerAction({ name: "requestEvidenceUploadAction", menu: "expenses", action: "write", dtoName: null });

// 완료된 증빙 파일 DTO(도메인이 투영해 돌려준 것)를 그대로 돌려준다.
registerAction({ name: "completeEvidenceUploadAction", menu: "expenses", action: "write", dtoName: "evidenceFile" });

registerAction({ name: "removeEvidenceAction", menu: "expenses", action: "write", dtoName: null });

// 서명 GET 주소만 돌려준다(DTO 없음) — 판정은 문서 보임(도메인).
registerAction({ name: "createEvidenceViewUrlAction", menu: "expenses", action: "view", dtoName: null });
