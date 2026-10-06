// 06-03: 지출결의 문서 화면 지급 액션 등록 — actions.ts("use server", server-only 의존 체인)와 분리(03-03 선례).
// 메뉴 · 동작은 누수 스캔 분류다. 판정(expenses.payments write · 결재 게이트)은 domain이 한다.
import { registerAction } from "@/lib/actions/registry";
// 지급 섹션 DTO(paymentView) 등록을 일으킨다 — 누수 스캔이 DTO 이름을 이 등록부에서 찾는다.
import "@/domain/payments";

// 새 문서 version만 돌려준다(DTO 없음) — 화면은 응답 뒤 다시 읽어 「지출결의 상태 → 1차」 표를 새로 정한다.
registerAction({ name: "completeExpensePaymentAction", menu: "expenses.payments", action: "write", dtoName: null });
// 06-04: 지급 총액 미리보기 — 지급 총액 · 차이(expense.amount)를 payablePreview DTO로 투영해 돌려준다(읽기 · 로그 없음).
registerAction({ name: "previewPayableAction", menu: "expenses.payments", action: "write", dtoName: "payablePreview" });
