---
phase: 05-expense-approval-leave
plan: 06
subsystem: expenses-tax-gate
tags: [tax, withholding, vat, company-borne, gross-up, tax-snapshot, tax-drift, preview, rules-gate, expense.submit, aria-disabled]

requires:
  - phase: 05-03
    provides: computeExpenseTax 전신 · 세율 스냅숏 열 · submitExpense 트랜잭션 · evaluateExpenseSubmit(③④⑥⑦)
  - phase: 05-05
    provides: 지출결의 폼(Form layout="page") · 문서 화면 · submitBlockReason(D2 올리는 중) · EvidenceAttachments
  - phase: 05-15
    provides: taxLineText(규칙 넷 · 외화 · 계산 불가 한 줄 — 재사용, 복제 없음)
provides:
  - pickTaxDates 기준일 사슬(D-101 — 코드 항목 basisDate → 설정 tax.basis_date.*) · applyTaxRule 한 번 · formatRatePercent
  - taxDriftText({text, parts}) — 저장 스냅숏 값 대 지금 재계산 값(이력 행 재조회 없음) · 문서 DTO taxDrift
  - previewExpense / previewExpenseAction(쓰기 없음) — taxLine · block{reason,target,href} · fieldErrors · DTO expensePreview 등록
  - listExpenseFormOptions — 지출결의 쓰기 권한으로 증빙 종류 · 지급 방식 선택지
  - 규칙 expense.submit(①~⑨, register.ts 덧붙임) · domain/expenses/gate.ts 순서 표 하나(buildExpenseSubmitContext · nextActionTarget · firstExpenseSubmitBlock)
  - 폼 즉시 재계산 · 1차 aria-disabled + 서버 첫 이유 · 다음 한 수 3차 · 첫 포커스 = 대상 · 비활성 1차 누름 = 대상 포커스
affects: [05-07, 05-09, 05-10, 06-EVID-03, 11-CERT-04]

actuals:
  tokens: 18551
  tasks: 2
  commits: 4
plan_head_before: 17a0a41bbc3e79a030930b4e35ccb89d67ae8204

tech-stack:
  added: []
  patterns:
    - "제출 막힘 순서는 domain/expenses/gate.ts stepsOf 한 곳 — 규칙 expense.submit과 nextActionTarget이 같은 표를 읽고, ① · ⑤는 gate()로 기존 규칙을 부른다"
    - "미리보기 · 제출이 같은 사실 묶음(loadSubmitFacts) — 설정 · 담당 PM 이름은 트랜잭션 전, 차수 · 줄 · 문 · 증빙 수는 tx로"
    - "계산 한 줄은 값 줄 — <p>(Form.Hint)가 아닌 같은 모양 span(.taxLine). design-principles 「긴 설명」 검사는 <p>만 센다"

key-files:
  created: ["app/(app)/expenses/[id]/tax-parts.tsx", test/integration/expense-tax-snapshot.test.ts, test/unit/domain/expenses/submit-gate.test.ts, test/e2e/expense-form.spec.ts, docs/design/checks/2026-10-04-05-06-expense-tax-line-block.md]
  modified: [domain/expenses/tax.ts, domain/expenses/gate.ts, domain/expenses/index.ts, domain/expenses/dto.ts, domain/rules/register.ts, domain/money/index.ts, domain/settings/keys.ts, "app/(app)/expenses/actions.ts", "app/(app)/expenses/actions.registry.ts", "app/(app)/expenses/[id]/expense-form.tsx", "app/(app)/expenses/[id]/expense-document.tsx", "app/(app)/expenses/[id]/expense.module.css", "app/(app)/expenses/[id]/page.tsx", "app/(app)/expenses/[id]/evidence-attachments.tsx", test/integration/expense-submit-concurrency.test.ts, test/unit/domain/expenses/tax.test.ts, test/unit/domain/money.test.ts]

key-decisions:
  - "회사 대납 기본값 22% · gross-up — keys.ts `default: 0.22,` · `TAX_COMPANY_BORNE_METHOD` `default: \"gross_up\",`(사용자 결정 2026-09-26 #7)"
  - "domain/expenses/index.ts 남은 실행가 검사(`남은 실행가 … 넘음 · 공급가액 고치기`)는 줄 그대로 — 게이트 뒤에 남김(사용자 결정 2026-10-04, 고정 상한 없음)"
  - "다음 한 수 3차는 이유의 마지막 ` · ` 뒤 낱말을 그 자리에서 3차로 바꾼다 — Button.nextStep 대신 05-05 제출 줄 이유 자리(.blockedLine)에 그려 폰 레이아웃(버튼 아래 한 줄)을 유지"

requirements-completed: [UX-06, EXP-14, ADMN-04]

coverage:
  - id: D1
    description: "세금 호출자 — 기준일 사슬 · 규칙별 계산(사업소득 3.3% · 기타소득 8.8% · 회사 대납 22% gross-up 846,154) · 계산 불가"
    requirement: EXP-15
    verification:
      - kind: unit
        ref: "test/unit/domain/expenses/tax.test.ts · money.test.ts · money-tax.test.ts · test/unit/settings (160)"
        status: pass
    human_judgment: false
  - id: D2
    description: "세율 스냅숏(세율 · 이력 행 id · 적용일) · 저장값 한 줄 · 세율 바뀜 · 예정 세율 취소 뒤에도 문서 그대로 · 미리보기 쓰기 없음 · PM 선택지"
    requirement: EXP-15
    verification:
      - kind: integration
        ref: "test/integration/expense-tax-snapshot.test.ts (6)"
        status: pass
    human_judgment: false
  - id: D3
    description: "폼 즉시 재계산 — 오는 동안 이전 줄 --text-faint, 숫자 조각만 700, 제출 문서 같은 한 줄 · 세율 바뀜 없음"
    requirement: EXP-15
    verification:
      - kind: e2e
        ref: "test/e2e/expense-form.spec.ts › 계산 한 줄 즉시 재계산 (S5) (CI=true desktop)"
        status: pass
    human_judgment: false
  - id: D4
    description: "규칙 expense.submit ①~⑨ 첫 이유 순서 · ① · ⑤ 글자 = 기존 규칙 · ⑥ 묶음 · nextActionTarget"
    requirement: UX-06
    verification:
      - kind: unit
        ref: "test/unit/domain/expenses/submit-gate.test.ts · rules-gate.test.ts (87)"
        status: pass
    human_judgment: false
  - id: D5
    description: "미리보기 통과 뒤 고객 승인 취소 → 제출이 tx 안에서 ① 글자로 거부(T-05-601)"
    requirement: EXP-14
    verification:
      - kind: integration
        ref: "test/integration/expense-submit-concurrency.test.ts › 미리보기 뒤 조건 변경 (RED 확인: tx 재판정 빼면 submitted)"
        status: pass
    human_judgment: false
  - id: D6
    description: "폼 막힘 이유 — 1차 aria-disabled(disabled 속성 없음) · 이유 글자 · 첫 포커스 첨부 영역 · 누름 · Ctrl+Enter 요청 0건 · 올리면 풀림 · 빈 칸 3차 포커스"
    requirement: UX-06
    verification:
      - kind: e2e
        ref: "test/e2e/expense-form.spec.ts › 막힘 이유 (S6) · expense-submit-mobile-approval · mobile-expense-form · design-principles (desktop + mobile-375, 57 pass)"
        status: pass
    human_judgment: false

duration: 85min
completed: 2026-10-04
status: complete
---

# Phase 05 Plan 06: 세금 호출자 · 즉시 재계산 · 세율 바뀜 · 제출 막힘 규칙 Summary

**지출결의 세금은 기준일 사슬 하나로 applyTaxRule을 한 번 불러 계산하고(회사 대납 22% gross-up), 폼은 칸을 바꾸면 서버 미리보기로 한 줄 · 막힘 이유를 다시 받으며, 제출은 규칙 `expense.submit`(①~⑨, 순서 표 하나)로 미리보기와 트랜잭션 안에서 같은 판정을 한다.**

## Performance
- **Duration:** 85min (15:07Z → 16:32Z)
- **Tasks:** 2 · **Files modified:** 22

## Task Commits
1. **Task 1 (tracer): 세금 호출자 · 미리보기 · 즉시 재계산 · 스냅숏 · 세율 바뀜** — `8be97af3` (test RED) · `2bc5e175` (feat)
2. **Task 2: 제출 막힘 규칙 expense.submit** — `3ff2461a` (test RED) · `57c7324b` (feat)

## Deviations from Plan

### 사용자 결정에 따른 변경
- 고정 금액 상한 — 이 플랜은 고정 상한을 요구하지 않아 만들지 않았다. 남은 실행가 검사는 줄 그대로(게이트 뒤).

### Auto-fixed Issues
1. **[Rule 1 - Bug] PM이 증빙 종류 · 지급 방식을 바꿀 수 없었다(05-05)** — `domain/code-tables.listCodeItems`가 코드표 메뉴 범위를 봐 PM에게 저장값 하나만 줬다. `listExpenseFormOptions`(지출결의 쓰기 권한) + page.tsx 교체, 통합 사례. `2bc5e175`
2. **[Rule 1 - Bug] 계산 한 줄이 design-principles 「긴 설명」으로 잡힘** — `Form.Hint`는 `<p>`라 44자 값 줄이 설명 문단으로 셌다. 같은 모양 span(`.taxLine`)으로 — 플랜의 「Form.Hint」 문구와 다름. `2bc5e175`
3. **[Rule 1 - Bug] 파일 완료 직후 지난 ⑧이 제출을 막음** — 서버가 files를 다시 보내기 전까지 미리보기 ⑧이 남아 05-05 트레이서(올리자마자 Ctrl+Enter)가 깨졌다. `EvidenceAttachments.onAdded`로 완료 순간 ⑧을 풀고, 제출 중에는 미리보기를 보내지 않는다. `57c7324b`

### 그 밖의 차이
- `taxDriftText` · DTO `taxDrift`는 string이 아니라 `{ text, parts }`(숫자 조각 Num 700을 위해). 문서 화면 · 폼이 새 파일 `tax-parts.tsx`를 같이 쓴다 — acceptance `grep -c "@/ui/num/Num" expense-form.tsx` ≥1은 글자 그대로는 0(Num은 tax-parts.tsx 안).
- 다음 한 수 3차는 `Button.nextStep` prop이 아니라 05-05 이유 자리에서 이유 끝 낱말을 3차로 바꿔 그린다(폰 제출 줄 레이아웃 유지 — wave 6 검토 판). ③ 견적 줄 바꾸기(05-07) · ⑤ 거래처(폼에 칸 없음) · ② · ⑨ · 담당 PM 아닌 ①은 3차 없이 글자만.
- 미리보기 DTO block에 `href`(① 담당 PM → `/projects/{id}`, ④ → `/expenses/{최근 문서}`)를 더했다. ⑨는 게이트 안으로 들어가 남은 실행가 검사보다 먼저 판정된다(둘 다 막힘).
- `app/(app)/expenses/actions.ts`의 `@/domain/money/currency` import(CURRENCIES)는 이 플랜 전부터 있다 — acceptance 「app이 domain/money를 import하지 않음」의 1건은 계산 아님.
- Task 2 E2E RED는 따로 빌드해 돌리지 않았다(단위 · 통합 RED는 실패를 보고 구현).

## Issues Encountered
- `--project=mobile-375`는 `desktop` 의존이라 파일 필터를 줘도 전체(984)가 돈다 — 건드린 스펙은 `--no-deps`로.
- 전체 실행에서 본 `safari-width-headroom`(설정 화면 `증빙 크기 한도`)은 범위 밖 — deferred-items.md.

## Next Phase Readiness
- 05-07: 팀 비용은 `ExpenseSubmitFacts.teamCost`(종류 · 내용이 ⑥ 묶음 앞)와 `line: null`(①~④ 건너뜀)만 채우면 된다. `loadSubmitFacts`의 `teamCost: null`과 프로젝트 행 필수(`submitExpense` · `previewExpense`)를 팀 비용 갈래로 넓힐 것. 폼 칸 id `teamExpenseKind` · `content`를 `TARGET_FIELD`에 더하면 3차 포커스가 붙는다.
- 05-10: 결재 시트의 세율 바뀜 줄(detail.ts 주석)은 그대로 05-10 몫.
- 회사 대납 5만 원 이하 면제는 Phase 11(CERT-04).

## Self-Check: PASSED
- 커밋 8be97af3 · 2bc5e175 · 3ff2461a · 57c7324b 존재, 만든 파일 5개 존재. 전체 단위 249 파일 · 3846 통과.
