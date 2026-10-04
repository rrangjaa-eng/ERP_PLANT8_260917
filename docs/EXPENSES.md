# 지출결의 · 증빙 계약(Phase 5 → Phase 6)

> 150줄 상한(테스트로 고정: `test/unit/docs-limits.test.ts`). ARCHITECTURE.md가 줄 예산이 없어 지출결의 계약을
> 별도 문서로 둔다(사용자 결정 U3 A — ARCHITECTURE §4-6 끝에서 이 문서를 가리킨다). 계약 · 잠금 순서 예외 절은 05-13이 더한다.

## 번호

- 꼴: `{프로젝트 번호}{구분자}{순번}` — 예 `26001-0004`(사용자 결정 2026-09-26 #6). 발급된 번호는 다시 매기지 않는다.
- 카운터: `document_counters`의 `counterKey = "expense"`, **period = 프로젝트 번호**다 — 연도 규약(ARCHITECTURE §4-6
  「`period`는 서기 연도 네 자리」)의 첫 예외. 프로젝트마다 순번이 1부터 시작한다.
- 팀 비용(프로젝트 없는 지출결의)은 `expense_team` · period = 연도(05-07).
- 서식 키: `document_number.expense.separator`(기본 `-`) · `.seq_digits`(4) · `.seq_start`(1) — 단순값. 이미 매긴 번호는
  그대로다. 표시 순번 = 카운터 + 시작값 − 1, 자릿수를 넘친 순번은 자르지 않는다(`expenseNumberFormat`).
- 번호는 제출 트랜잭션의 **마지막 쓰기**다(`allocateExpenseNumber` → `setExpenseNumber`) — 카운터 행 잠금을 가장 짧게.
  서식 세 키는 트랜잭션 전에 SELECT 한 번으로 읽는다(`loadExpenseNumberFormat` — 잠근 tx 안 전역 풀 읽기 금지).
- 작성 중 문서는 번호가 없다(`number IS NULL`). 번호가 있는 문서는 공급가액이 0보다 크다(CHECK, EXP-14).
