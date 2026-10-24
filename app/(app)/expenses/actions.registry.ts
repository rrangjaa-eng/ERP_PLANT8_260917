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

// 06-28 종결 — 새 version만 돌려준다(DTO 없음). 판정(기안자 · 지급 권한자 · 보임)은 domain.
registerAction({ name: "closeExpenseAction", menu: "expenses", action: "write", dtoName: null });

// 서명 PUT 주소 · 헤더 · 의도 id만 돌려준다(DTO 없음).
registerAction({ name: "requestEvidenceUploadAction", menu: "expenses", action: "write", dtoName: null });

// 완료된 증빙 파일 DTO(도메인이 투영해 돌려준 것)를 그대로 돌려준다.
// 06-16(D-56) 차수 승인 증빙 — 요청은 서명 PUT 주소만(DTO 없음), 펼침 읽기는 증빙 파일 명세(evidenceFile)를 지난 목록을 싣는다(projects 보기 — 판정은 domain).
registerAction({ name: "requestRevisionEvidenceUploadAction", menu: "projects", action: "write", dtoName: null });
registerAction({ name: "getRevisionEvidenceAction", menu: "projects", action: "view", dtoName: "evidenceFile" });

// 06-16(D-60) 리저브 줄 증빙 — 차수 승인 증빙과 같은 모양(메뉴는 pnl). 되살리기는 05 removeEvidenceAction의 짝(판정은 domain 규칙).
registerAction({ name: "requestReserveEvidenceUploadAction", menu: "pnl", action: "write", dtoName: null });
registerAction({ name: "getReserveEvidenceAction", menu: "pnl", action: "view", dtoName: "evidenceFile" });
// 06-25 카드 전표 — 서명 PUT 주소만 돌려준다(DTO 없음). 문은 카드 사용 수정 권리(domain 주인 표)이고 메뉴 값은 06-05 카드 사용 액션과 같은 레지스트리 메타데이터.
registerAction({ name: "requestCardSlipUploadAction", menu: "cards", action: "write", dtoName: null });
registerAction({ name: "restoreEvidenceAction", menu: "expenses", action: "write", dtoName: null });

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

// 06.5 V12: 지급처 고르기 직원 행 — 도메인이 PickPayeeUserOptionDto로 투영한 결과.
registerAction({ name: "searchPayeeUsersForPickAction", menu: "expenses", action: "write", dtoName: "PickPayeeUserOptionDto" });

// 06.5 D-6517: 새 version만 돌려준다(DTO 없음 — changeExpenseVendorAction과 같은 결).
registerAction({ name: "changeExpensePayeeUserAction", menu: "expenses", action: "write", dtoName: null });

// 새 문서 화면의 사용일 → 소속 팀 이름 · 칸 오류(도메인이 expenseNewDefaults로 투영, 쓰기 없음).
registerAction({ name: "previewNewExpenseAction", menu: "expenses", action: "write", dtoName: "expenseNewDefaults" });

// 골라내기 견적 줄 행 — 도메인이 PickLineOptionDto(· 그룹은 PickLineGroupDto)로 투영한 결과.
registerAction({ name: "searchLinesForPickAction", menu: "expenses", action: "write", dtoName: "PickLineOptionDto" });

// 새 version 또는 이동할 문서 id만 돌려준다(DTO 없음).
registerAction({ name: "changeExpenseLineAction", menu: "expenses", action: "write", dtoName: null });

// 05-09 작성 중 삭제 · 되돌리기 — 문서 id만 돌려준다(DTO 없음).
registerAction({ name: "deleteExpenseDraftAction", menu: "expenses", action: "write", dtoName: null });
registerAction({ name: "restoreExpenseDraftAction", menu: "expenses", action: "write", dtoName: null });

// 06-15 일괄 지급 — 행 결과는 id · 이유 글자 · 새 지급 총액 숫자 하나 · 고를 수 있음뿐(DTO 없음). 지급 권한자 전용.
registerAction({ name: "completePaymentsBatchAction", menu: "expenses.payments", action: "write", dtoName: null });
// 06.5-06 신한 이체 파일 — 응답은 파일 바이트 · 줄 수 · 막힘 글자(DTO 행 아님). 파일 칸의 정보 항목은 내보내기 축(BankTransferRowDto)이 검사한다.
registerAction({ name: "exportBankTransferFileAction", menu: "expenses.payments", action: "write", dtoName: null });
// 06.5-06 지급 완료 대화상자 지급처 소계(V14) — 합은 expense.amount, 나머지는 expense.value(TransferPayeeSubtotalDto).
registerAction({ name: "previewTransferPayeesAction", menu: "expenses.payments", action: "write", dtoName: "TransferPayeeSubtotalDto" });
// 06-17 고른 건 이체액 합 · 행별 차이 · 고른 행 상태 — rowStates의 지급 총액 · version은 06-15 행 명세(paymentTargetRow)의 정보 항목을 지난다.
registerAction({ name: "sumSelectedTransfersAction", menu: "expenses.payments", action: "write", dtoName: "paymentTargetRow" });
// 06-17 제자리 증빙 확인 모달 보기 — 파일 행은 05 증빙 파일 명세(evidenceFile)의 정보 항목, 금액 칸은 expense.amount(06-06 paymentView와 같다).
registerAction({ name: "getEvidenceConfirmViewAction", menu: "expenses.payments", action: "write", dtoName: "evidenceFile" });
// 07-16 이번 주로 · 되돌리기 — 건마다 id · 이전 예정일 · 새 version · 거부 사유 글자만 돌려준다(DTO 없음). 지급 권한자 전용(판정은 07-06 도메인).
registerAction({ name: "moveToThisWeekAction", menu: "expenses.payments", action: "write", dtoName: null });
registerAction({ name: "revertScheduledPayDatesAction", menu: "expenses.payments", action: "write", dtoName: null });
// 07-23 SC-18 · K20: 일하는 자리 거래처 등록 · 이미 있는 거래처 고르기 — 지출결의 쓰기 권한자, 결과 거래처는 VendorDto 투영(vendor.value).
registerAction({ name: "registerVendorFromWorkAction", menu: "expenses", action: "write", dtoName: "VendorDto" });
registerAction({ name: "pickExistingVendorFromWorkAction", menu: "expenses", action: "write", dtoName: "VendorDto" });
