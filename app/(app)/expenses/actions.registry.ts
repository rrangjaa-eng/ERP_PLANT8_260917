// 05-05: 지출결의 액션 등록 — actions.ts("use server", server-only 의존 체인)와 분리(03-03 선례). 메뉴 · 동작은 누수 스캔 분류다.
// 판정(권한 · 보임 · 기안자)은 domain이 한다.
import { registerAction } from "@/lib/actions/registry";
// 골라내기 행 DTO(PickVendorOptionDto 등) 등록을 일으킨다 — 누수 스캔이 dtoName을 이 등록부에서 찾는다.
import "@/domain/expenses/pick";

// 만들어진 문서 id · 막힌 줄 이유만 돌려준다(DTO 없음).
registerAction({ name: "createExpenseFromLinesAction", menu: "expenses", action: "write", dtoName: null });

// 저장된 버전 · 저장 시각만 돌려준다(DTO 없음).
registerAction({ name: "saveExpenseDraftAction", menu: "expenses", action: "write", dtoName: null });

// 미리보기 — 도메인이 expensePreview로 투영한 계산 한 줄 · 막힘 이유 · 칸 오류(쓰기 없음).
registerAction({ name: "previewExpenseAction", menu: "expenses", action: "write", dtoName: "expensePreview" });

// 토스트 재료(다음 담당 이름)를 ApprovalActionResultDto로 투영해 돌려준다.
registerAction({ name: "submitExpenseAction", menu: "expenses", action: "write", dtoName: "ApprovalActionResultDto" });

// 05-09 회수(토스트 되돌리기 · 문서 화면 회수) — 결재 상태 낱말만 돌려준다(DTO 없음).
registerAction({ name: "withdrawExpenseAction", menu: "expenses", action: "write", dtoName: null });

// 서명 PUT 주소 · 헤더 · 의도 id만 돌려준다(DTO 없음).
registerAction({ name: "requestEvidenceUploadAction", menu: "expenses", action: "write", dtoName: null });

// 완료된 증빙 파일 DTO(도메인이 투영해 돌려준 것)를 그대로 돌려준다.
registerAction({ name: "completeEvidenceUploadAction", menu: "expenses", action: "write", dtoName: "evidenceFile" });

registerAction({ name: "removeEvidenceAction", menu: "expenses", action: "write", dtoName: null });

// 05-09 증빙 무효 처리 — 성공 표시만 돌려준다(DTO 없음). 판정은 expenses.evidence_void 쓰기 ∧ 문서 보임(도메인).
registerAction({ name: "voidEvidenceAction", menu: "expenses.evidence_void", action: "write", dtoName: null });

// 서명 GET 주소만 돌려준다(DTO 없음) — 판정은 문서 보임(도메인).
registerAction({ name: "createEvidenceViewUrlAction", menu: "expenses", action: "view", dtoName: null });

// 05-07 팀 비용 첫 저장 — 만들어진 문서 id · version만 돌려준다(DTO 없음).
registerAction({ name: "createTeamExpenseDraftAction", menu: "expenses", action: "write", dtoName: null });

// 새 version · 증빙 종류 코드만 돌려준다(DTO 없음).
registerAction({ name: "changeExpenseVendorAction", menu: "expenses", action: "write", dtoName: null });

// 골라내기 거래처 행 — 도메인이 PickVendorOptionDto로 투영한 결과.
registerAction({ name: "searchVendorsForPickAction", menu: "expenses", action: "write", dtoName: "PickVendorOptionDto" });

// 새 문서 화면의 사용일 → 소속 팀 이름 · 칸 오류(도메인이 expenseNewDefaults로 투영, 쓰기 없음).
registerAction({ name: "previewNewExpenseAction", menu: "expenses", action: "write", dtoName: "expenseNewDefaults" });

// 골라내기 견적 줄 행 — 도메인이 PickLineOptionDto(· 그룹은 PickLineGroupDto)로 투영한 결과.
registerAction({ name: "searchLinesForPickAction", menu: "expenses", action: "write", dtoName: "PickLineOptionDto" });

// 새 version 또는 이동할 문서 id만 돌려준다(DTO 없음).
registerAction({ name: "changeExpenseLineAction", menu: "expenses", action: "write", dtoName: null });

// 05-09 작성 중 삭제 · 되돌리기 — 문서 id만 돌려준다(DTO 없음).
registerAction({ name: "deleteExpenseDraftAction", menu: "expenses", action: "write", dtoName: null });
registerAction({ name: "restoreExpenseDraftAction", menu: "expenses", action: "write", dtoName: null });
