---
phase: 07-schedule-notify-audit
plan: 18
subsystem: projects-detail-ui
tags: [project-info-panel, customer-approval, side-panel, profit-summary, line-door-reasons, e2e]
requires: [07-11, 07-12, 07-01]
provides:
  - 프로젝트 상세 정보 면(접힌 줄 / 펼침 / 고치기 한 묶음 / 두 단계 Esc)
  - 고객 승인 섹션 + 승인 표시 옆 패널(근거 필수 · 메모 선택)
  - 손익 섹션(수익 · 비율, 계산 불가 배지)
  - 견적 줄 문 칸 이유 낱말(SC-22)
affects: [project-detail, quote-revisions, expenses-door]
tech-stack:
  added: []
  patterns: [PanelForm 옆 패널, 서버가 만든 control 객체로 렌더 조건 결정, domain 래퍼로 repositories 접근]
key-files:
  created:
    - repositories/project-documents.ts
    - domain/projects/documents.ts
    - domain/projects/profit-summary.ts
    - test/integration/customer-approval-basis.test.ts
    - test/integration/project-ledger-po.test.ts
    - test/unit/domain/project-profit-summary.test.ts
    - test/e2e/mobile-quote-doors.spec.ts
    - test/e2e/project-info-helpers.ts
    - test/e2e/project-info-panel.spec.ts
    - docs/design/checks/2026-10-22-07-18-project-info-panel.md
  modified:
    - app/(app)/projects/[id]/quote-table.tsx
    - app/(app)/projects/[id]/revision-dialogs.tsx
    - app/(app)/projects/[id]/page.tsx
    - app/(app)/projects/[id]/project-detail.module.css
    - app/(app)/projects/actions.ts
    - domain/quotes/revisions.ts
    - repositories/quote-revisions.ts
    - ui/status-tag/status-map.ts
decisions:
  - 승인일 칸을 없애고 오늘(KST)로 둔다(SC-19) — 사용자가 하지 않아도 될 결정
  - 승인 근거(approvalBasis)는 새 승인에 필수, 옛 승인(근거 NULL)은 그대로 `승인됨`
  - 발주서 파일 없음은 경고 글자일 뿐 저장을 막지 않는다
  - 손익은 최소 계산(취소 줄 제외 Σ차익, 견적 합계 0이면 계산 불가)
metrics:
  duration: 약 2세션(컨텍스트 압축 1회)
  completed: 2026-10-22
status: complete
commits: 4
plan_head_before: 8876c29c719ce90ee7ecdb3e65fe1b7b8d1e842c
actuals:
  tokens: 130000
  tasks: 3
  commits: 4
---

# Phase 07 Plan 18: 프로젝트 상세 정보 면 Summary

정보 면(접힘 / 펼침 / `고치기` 한 묶음 / 두 단계 Esc)에 고객 승인 섹션 · 승인 표시 옆 패널(근거 필수) · 손익 섹션 · 견적 줄 문 칸 이유 낱말을 더했다.

## 커밋

| Task | 커밋 | 내용 |
| --- | --- | --- |
| 1 | 89c00ff8 | 정보 면 트레이서 — 접힘 · 고치기 · PO 번호 |
| 2 | 6aeeea1b | 고치기 한 묶음 · 두 단계 Esc · PO 금액 이름 |
| 3 | 5f2eaf78 | 고객 승인 섹션 · 승인 표시 패널 · 손익 · 문 칸 이유 |
| 3 후속 | 1368fbd5 | 견적이 바뀜 새로 고침 대기 안정화(테스트) |

## 검증

- RED: `customer-approval-basis.test.ts` · `project-profit-summary.test.ts` · `project-ledger-po.test.ts`를 구현 전에 실패시킨 뒤 GREEN. 화면 E2E(`project-info-panel.spec.ts` Task 3 · `mobile-quote-doors.spec.ts`)는 화면을 만든 뒤에 썼다(도메인만 RED 먼저).
- `pnpm typecheck` 0 오류 · `pnpm lint`(eslint + stylelint) 0 오류 · `pnpm lint:sql` 0 건 · `pnpm build` exit 0.
- 단위 전체 5309 통과 · 바꾼 통합 11파일 519 통과.
- E2E `CI=true` 14개 스펙 묶음 278 통과 / 2 실패 -> 둘 다 단독 재실행 녹색(견적이 바뀜 새로 고침 대기는 스펙 수정 후 3회 반복 녹색, 폰 Tab 순서는 부하 흔들림으로 4회 반복 녹색).
- 수용 grep: 원가율 · budget 0건 / 문 낱말 4종 존재 / `수주 전` 0 / `권한 없음` 리터럴 0 / `approvalBasis` 8 / `repositories/project-documents.ts` 존재 / `expenseLineDoor` 주석 참조 1.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 도메인이 approvalBasis를 필수로 받아 호출 테스트 · 스크립트를 옮김**
- Issue: `setCustomerApproval` 입력에 근거가 필수가 되어 기존 호출 27곳이 타입 오류
- Fix: 통합 8파일 · E2E fixture · `scripts/demo-data.ts` · `scripts/codex-design-review/seeds.ts`에 `approvalBasis: "verbal"` 추가(plan files_modified 밖)
- Commit: 5f2eaf78

**2. [Rule 1 - Bug] React Compiler "Cannot access refs during render"**
- Issue: 포커스 도우미 선언 순서
- Fix: `focusWhenReady`를 rAF 기반으로 `focusOutsideError`보다 앞에 선언

**3. [Rule 3 - Blocking] app -> repositories 경계 위반**
- Fix: `domain/projects/documents.ts` 래퍼(`projectHasPurchaseOrder`)

**4. [Rule 2 - Missing] 상태 배지 낱말 `계산 불가`가 status-map에 없음**
- Fix: `ui/status-tag/status-map.ts`에 `muted`로 추가 + 단위 테스트 줄 추가

**5. [Rule 1 - Test] 옛 승인 다이얼로그 흐름을 쓰던 E2E를 패널 흐름으로 이관**
- quote-revisions(고객 승인 표시와 취소 12건) · revenue-section · pre-settle-check · quote-edit-scope(l2f) 이관. 승인일 칸 테스트는 `근거 선택` 필수 테스트로 교체. l2f는 토스트 4초 자동 소멸과 겹치지 않게 순서를 재배치.

### 계획과 다르게 정한 것

- 손익 섹션: 기존 PNL 도메인이 없어 `summarizeProjectProfit`(취소 줄 제외 Σ차익 / 견적 합계, 소수 1자리)로 최소 구현. 표시 조건은 pnl 보기 + quote.amount.
- 승인 근거를 도메인에서 필수로 강제(새 승인). 화면에서 `근거 선택`이 서버 호출 전에 막는다.

## Auth Gates

없음.

## Known Stubs

없음. (손익은 실제 견적 줄로 계산하며 하드코딩 값 없음.)

## Threat Flags

없음 — 새 엔드포인트 · 스키마 변경 없음(승인 근거 · 메모는 기존 컬럼, 서류 조회는 읽기 전용).

## Open Questions (계획 권고안을 택한 곳)

1. 손익 정의: 수익 = Σ(견적 - 실행) 취소 줄 제외, 비율 = 수익 / 견적 합계. 지출결의 실적 반영(실현 손익)은 이월.
2. 승인 근거가 없는 옛 승인은 근거 칸을 `승인됨`만 보인다(소급 입력 없음).
3. 폰 행에는 문 버튼을 더하지 않고 행 탭 시트로만 문 행동을 제공(계획 확정 3번).
4. 화면 사진(1280 · 390)은 만들지 않았다 - 독립 DOM 감사 보고서가 맡는다(CLAUDE.md §6).

## Skills invoked

superpowers:test-driven-development · plant8:design-gate · superpowers:systematic-debugging · superpowers:verification-before-completion

## Self-Check: PASSED

- FOUND: repositories/project-documents.ts, domain/projects/documents.ts, domain/projects/profit-summary.ts, test/e2e/mobile-quote-doors.spec.ts, test/integration/customer-approval-basis.test.ts
- FOUND commits: 89c00ff8, 6aeeea1b, 5f2eaf78, 1368fbd5 (`git log`로 확인)

## 사후 고침

독립 DOM 감사(`audit/07-18-dom-audit.md`)와 260907 비교 지적을 반영했다. 호출한 스킬: superpowers:test-driven-development · plant8:design-gate · superpowers:systematic-debugging · superpowers:verification-before-completion.

1. `계산 불가` 배지 버튼 폰 터치 44×44(`--touch-min`), `aria-controls` 대상(이유 줄)을 닫혀 있어도 `hidden`으로 DOM에 둠 (감사 P2·P3-5).
2. 정보 면 PO 금액 · 손익 값을 공용 `Num`으로 (감사 P3-2). 손익 비율 글자는 목록과 같은 `formatPercent`(소수 1자리 버림, `20.0%`).
3. 승인 패널 빈 제출의 `근거 선택`을 칸 아래 한 곳으로, 근거 select `aria-required` (감사 P3-3). 기본값은 비어 있는 그대로.
4. 승인일 칸 복원(260907 회귀): 기본 오늘 KST, 비었거나 형식이 틀리면 1차 막힘 + 이유 한 줄, `approvedOn`으로 전송. 위 결정 줄 「승인일 칸을 없애고 오늘로 둔다」는 이 고침으로 뒤집혔다. E2E(quote-revisions)를 승인일 흐름으로 교체.
5. 손익 정의를 목록과 하나로(260907 불일치): `repositories/projects.ts getProjectProfitRow`가 목록과 같은 `rowMoneyExpressions`를 한 프로젝트에 적용, `domain/projects/profit-summary.ts`는 기준 ≤ 0이면 `계산 불가`(견적 기준 `견적 없음` · 발행 기준 `발행액 없음`)만 판정. 이 SUMMARY 위쪽의 「취소 줄 제외 Σ차익 / 견적 합계」 손익 정의는 대체됐다. 통합 테스트가 정산+발행 줄 · 견적 기준 · 미발행 정산 · 기준 0에서 목록과 상세 일치를 확인.
6. DOM 감사 보고서를 플랜 경로 `audit/07-18-dom-audit.md`로 복사(감사 P3-6).

열린 질문: 승인 근거 select를 260907처럼 발주서 기본값으로 둘지(지금은 비어 있음, 바꾸지 않음).
