---
phase: 07-schedule-notify-audit
plan: 28
subsystem: 지출결의 폼 `상세` 칸 (SC-02 ④ · N8 · J13)
tags: [EXP-11, J13, N8, screen]
status: complete
requires:
  - 07-16 (지출결의 폼 희망 지급일 · 사유 — 같은 폼 파일)
provides:
  - gate.ts EXPENSE_REQUIRED_FIELDS `상세`(target note) · NOTE_REQUIRED(`상세 · 입력`) · ExpenseSubmitFacts.note
  - 라벨 `상세` — 폼 · 지출결의 상세 화면 · 결재 상세 행 · 로딩 뼈대 · 길이 문구
  - test/integration/fixtures/expenses.ts ensureDetail (공용 제출 준비 도우미)
affects:
  - 07-23 (expense-form.tsx 뒤 수정), 07-14 · 07-27 새 제출 시험(공용 픽스처로만 제출하면 순서 무관)
key-files:
  created:
    - test/unit/expenses/detail-required.test.ts
    - test/unit/app/expense-loading-detail-label.test.ts
    - test/e2e/expense-detail-required.spec.ts
    - test/e2e/expense-detail-widths.spec.ts
    - docs/design/checks/2026-10-22-07-28-expense-detail.md
  modified:
    - domain/expenses/gate.ts, index.ts, detail.ts, draft-fields.ts
    - app/(app)/expenses/[id]/expense-form.tsx, expense-document.tsx, loading.tsx
decisions:
  - "폼 미리보기(previewFields)가 입력 중인 상세를 싣고 previewKey에는 `상세가 비었는가` 불리언만 넣는다 — 타이핑마다 서버를 부르지 않고, 비움 ↔ 채움이 바뀔 때만 1차 막힘이 다시 판정된다"
  - "제출 막힘 칸 오류 `상세 · 입력`은 gate.ts NOTE_REQUIRED 상수 하나(폼 · 테스트가 같은 글자)"
  - "상세 필수는 팀 비용 문서에도 건다 — 폼이 두 갈래 모두 상세 칸을 그린다(team 조건 밖)"
metrics:
  duration: ~75min
  completed: 2026-10-22
actuals:
  tokens: 25000
  tasks: 3
  commits: 3
plan_head_before: 996242248e91d6e74860ef44113c97fc5f0ab325
---

# Phase 07 Plan 28: 상세 필수 Summary

지출결의 「비고」를 `상세`로 바꾸고(폼 · 상세 화면 · 결재 상세 행 · 로딩 뼈대 · 길이 문구) 제출 때 필수로 만들었다 — 서버 `submitExpense`와 화면 제출 막힘이 같은 `firstExpenseSubmitBlock` 한 길이고, 임시 저장은 비어도 된다. 브랜치는 오케스트레이터 지시의 `claude/07-28-pay-followups`(플랜 문서의 `claude/07-28-expense-detail`과 이름만 다름).

## Tasks

| Task | 내용 | 커밋 |
| ---- | ---- | ---- |
| 1 | 트레이서 — gate.ts `note` 필수 · 제출 사실 · 폼 라벨/칸 오류/포커스/미리보기 · 단위 · E2E · 점검표 | f6199251 |
| 2 | 나머지 라벨 자리(상세 화면 · 결재 상세 행 · 로딩 · 길이 문구) · 폭 실측 E2E | d2a46836 |
| 3 | 기존 제출 시험 준비(공용 픽스처 · 직접 제출 · 화면 제출 흐름) · 선택자/라벨 문자열 · 서버 직접 거부 사례 | 7da66259 |

## 호출한 스킬
- superpowers:test-driven-development — 코드 전. 단위 RED(7 실패 → 구현 → 9 통과), Task 2 단위 RED(5 실패 → 통과). **E2E 트레이서는 RED를 따로 돌리지 않았다**(단위 RED 뒤 폼을 먼저 고쳤고, E2E는 처음 돌린 실행이 이미 폼 구현 위에서였다) — 단, 첫 실행 실패 두 번(`aria-disabled` 클릭 · 미리보기 누락)은 실제 결함 신호였다
- plant8:design-gate — 화면 파일(expense-form.tsx) 전. 점검표 `docs/design/checks/2026-10-22-07-28-expense-detail.md` 모든 항목 `[x]` + 근거
- superpowers:systematic-debugging — E2E 실패 추적 전 2번(아래 Deviations 1 · 2)
- superpowers:verification-before-completion — 커밋 전(Task 1) · 보고 전

## 검증(마지막 실행 기준)
- `pnpm typecheck` 0 · eslint(바뀐 ts/tsx) 0 · `pnpm lint:sql` 0
- 단위: test/unit/app · domain · expenses — 125 파일 1831 통과
- 통합(erp_w0728_int_test): 플랜 17 파일 + payments 3 + next-turn — 1차 12 파일 실패(준비 단계) → 고친 뒤 12 파일 255 통과, 나머지 11 파일은 1차에서 통과, lifecycle 22 통과(서버 직접 거부 사례 포함)
- E2E CI=true(프로덕션 빌드, erp_w0728_test): desktop `expense-detail-required` · `expense-detail-widths` · `expense-new` · `expense-form` · `expense-hope-date` · `quote-line-status` · `evidence-waive-prepaid` · `evidence-lifecycle` 59 통과(2 실패는 team 초안 준비 → 고친 뒤 expense-form 재실행 통과), 보조 desktop 묶음(`expense-a11y` · `expense-undo-resubmit` · `expense-view-scope` · `management-flow` · `pm-settlement-flow` · `pre-settle-check` · `expense-submit-mobile-approval`) 고친 뒤 74 + 13 통과, desktop-evidence `evidence-pick` · `evidence-pick-audit` 19 통과 · `evidence-attach-audit` 5 통과, mobile-375 `mobile-expense-form` · `mobile-expense-wave11` 21 통과
- 폭 실측(expense-detail-widths, 375 · 320 · 768 · 1280): `#note`가 details/hidden 밖, 오른쪽 가장자리 359 · 304 · 604 · 604 ≤ 화면 폭, 제출 막힘 뒤 `#note-error` 높이 21 · 잘림 없음 · 문서 가로 스크롤 없음
- 기존 단언 불변: 바뀐 기존 `expect(` 줄은 라벨 문자열 3줄(`expense-new` 2 · `lifecycle valueOf` 1)뿐. 새 단언은 `expense-approval-lifecycle`의 서버 직접 거부 사례(plan 예외)

## 라벨 · 선택자만 바꾼 시험(준비/문자열)
- 라벨/선택자: `expense-form.spec`(getByLabel 2) · `expense-new.spec`(4) · `evidence-pick.spec`(2) · `evidence-pick-audit.spec`(1) · `expense-hope-date.spec`(2) · 단위 `draft-fields` · `detail-rows` · 통합 `expense-approval-lifecycle`(LABEL_ORDER · valueOf) · **`next-turn.test.ts`(LABEL_ORDER — 플랜 목록 밖)**. `getByLabel("비고")`는 `getByLabel("상세", { exact: true })`로(비정확 일치 충돌 방지)
- 준비(note 한 줄): 위 픽스처 둘(`submitReadyDraft`→ensureDetail · `createInReviewExpenseFixture`/`createDraftExpenseFixture`) · E2E `submitLineExpense` · 통합 11(dual-link · evidence-file-only-filter · evidence-presence · evidence-upload · evidence-waive-prepaid · expense-close · expense-participant-write · expense-submit-concurrency · payments/pay-week-targets · pre-settle-check · quote-line-links) · E2E `evidence-lifecycle` · `evidence-pick` · `evidence-pick-audit` · `evidence-waive-prepaid` · `quote-line-status` · `expense-form` · `expense-new`(UI에서 상세 입력)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 미리보기가 입력 중인 상세를 읽지 않았다**
- **Found during:** Task 1 E2E (상세를 적어도 1차가 계속 `상세 비어 있음`)
- **Issue:** `previewFields()`에 `note`가 없고 `previewKey`에도 없어 서버 미리보기가 저장된 값만 봤다
- **Fix:** `previewFields`에 `note`, `previewKey`에 `note.trim() !== ""` 불리언
- **Files:** `app/(app)/expenses/[id]/expense-form.tsx` · **Commit:** f6199251

**2. [Rule 3] 1차가 aria-disabled라 Playwright 클릭이 대기 — `{ force: true }`** (기존 시험과 같은 방식)

**3. [Rule 3] 플랜 목록 밖 파일을 고쳤다** — 플랜의 `rg` 목록이 UI로 제출하는 기존 스펙 일곱 개와 통합 시험 둘을 빠뜨렸다(실행해서 실제 실패로 확인). 단언 변경 없이 준비 한 줄/라벨 문자열만: `test/e2e/expense-a11y` · `expense-undo-resubmit` · `expense-view-scope` · `management-flow` · `pm-settlement-flow` · `pre-settle-check` · `expense-submit-mobile-approval`(제출 1요청 단언 때문에 폼 입력 대신 `ensureDetail` + reload로 미리 저장) · 통합 `next-turn.test.ts` · `test/unit/domain/expenses/submit-gate.test.ts`(facts에 note 필수 필드). 플랜 Task 3 ⑤는 「밖 파일이면 멈춰 알린다」지만 기존 파일(다른 플랜의 새 시험 아님)이고 안 고치면 main CI가 빨개져 진행했다 — **오케스트레이터가 ready 전 `git diff --name-only origin/main`을 files_modified와 대조할 때 이 파일들을 알고 있어야 한다**
- 그 밖에 플랜 목록에 있으나 바꾸지 않은 파일: `test/e2e/helpers/evidence.ts`(지출결의를 만들지 않는 파일), 통합 `evidence-attach` · `evidence-detach` · `evidence-amount` · `evidence-author-attach`·`approvals-route-project-team`·`expense-approval-concurrency`(픽스처로 이미 채워 통과 — 파일 변경 없음)

**4. [Rule 3] 신규 파일 두 개** — `test/unit/app/expense-loading-detail-label.test.ts`(로딩 뼈대 라벨 — E2E로는 순간 화면이라 렌더 단위로) · `test/e2e/expense-detail-widths.spec.ts`(폰 펼침 backstop을 CI에서 돌릴 수 있는 DOM 실측 시험)

**5. 독립 DOM 감사 보고서 미작성(`.planning/…/audit/07-28-dom-audit.md`)** — 이 실행 환경에는 별도 에이전트를 띄울 도구가 없고 `.planning/` 손 편집 금지라 보고서를 만들지 않았다. 대신 위 `expense-detail-widths.spec.ts`가 4폭 실측을 단언한다. **독립 판정 에이전트(gsd-ui-auditor, model 명시) 감사는 오케스트레이터가 해야 한다.**

**6. 커밋 트레일러 · 브랜치** — W3-RULES의 `Co-Authored-By: Claude Opus 5.5 (1M context)` 두 줄을 썼다. 훅 규칙 R의 에이전트 브랜치 이름 검사는 지시받은 브랜치 `claude/07-28-pay-followups`에 해당하지 않아 적용하지 않았다.

### 사용자 결정 반영
- AQ-10 완화(희망일이 지난 문서는 날짜를 바꿀 때만 검사, 사용자 결정 2026-10-23): 07-16 브랜치에 이미 구현돼 있음(`requestedPaymentErrors`의 `check.stored` · `REQUESTED_DATE_PASSED`) — 이 플랜은 건드리지 않았고 `expense-hope-date` 둘째 사례가 그 계약(비고→상세만 고친 임시 저장은 된다 · 제출은 `희망일 지남`)으로 통과.

## Known Stubs
없음.

## 열린 질문(권장안으로 진행)
- 제출 막힘이 상세 하나일 때 칸 오류 문구: `상세 · 입력`(UI-SPEC 확정, 권장) vs 1차 옆 이유와 같은 `상세 비어 있음 · 상세 입력`(칸 라벨과 중복) — 권장안 유지
- 상세를 여러 줄 칸으로(07-REVIEWS 보류 항목) — 이 플랜은 이름 · 필수만

## 후속(범위 밖 발견, 고치지 않음)
- 주석/시험 이름에 남은 「비고」 낱말(`actions.ts:58` · `pick-line.tsx:25` · 시험 `it(...)` 제목들)은 플랜대로 두었다
- `test/integration/evidence-attach.test.ts` `SQL 순위 대조`가 병렬 부하에서 5s 한도 근처(07-16 요약과 동일) — 이번 실행에서는 통과

## Threat Flags
없음 (새 엔드포인트 · 권한 경로 없음 — T-07-28-01 · 02는 서버 직접 거부 통합 사례와 trim 단위 사례로 완화).

## Self-Check: PASSED
- 파일: test/unit/expenses/detail-required.test.ts · test/unit/app/expense-loading-detail-label.test.ts · test/e2e/expense-detail-required.spec.ts · test/e2e/expense-detail-widths.spec.ts · docs/design/checks/2026-10-22-07-28-expense-detail.md — 존재
- 커밋: f6199251 · d2a46836 · 7da66259 — git log에 있음
