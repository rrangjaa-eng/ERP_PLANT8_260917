---
phase: 06-payment-evidence-cards
plan: 35
subsystem: purchase-requests-ui
tags: [purchase-request, customer-approval-gate, quote-table, link-picker, status-change, design-gate]
gap_closure: true
gap_ids: [G-06-D]
requirements: [EXP-10]
status: complete
plan_head_before: cef6a55a06da34f3c65c0c5e04908223b1b8b6fb
commits: 3

requires:
  - phase: 06-34
    provides: searchLinesForPurchaseLink projectBlockedReason (서버 판정)
provides:
  - 견적 줄 표의 온라인구매 줄 `구매 요청` 문(셀 · Ctrl+E · 폰 행 시트)이 표 전체 게이트 tableGateReason을 따른다
  - 구매 요청 패널 줄 고르기 바닥 줄 이유 = 서버 projectBlockedReason 우선, 없으면 `온라인구매 줄 없음`
  - 상태 바꾸기 확인 승인 줄 `{n}차 고객 승인 전 · 진행부터 지출결의 · 구매 요청 멈춤`
affects: [PR-G2 게이트 (/review + /design-review -> /qa)]

actuals:
  tokens: 9000
  tasks: 2
  commits: 3

key-files:
  created:
    - docs/design/checks/2026-10-15-06-35-purchase-approval-entry.md
  modified:
    - app/(app)/projects/[id]/quote-table.tsx
    - app/(app)/cards/link-picker.tsx
    - app/(app)/projects/[id]/status-change.tsx
    - test/e2e/purchase-requests.spec.ts
    - test/e2e/project-lifecycle.spec.ts

key-decisions:
  - "카드 ① 2026-10-14 14:20 KST 「구매 요청만」 -> 화면 입구도 닫는다(06-34 서버 · 06-35 화면)"
  - "화면은 판정을 새로 하지 않는다 — tableGateReason · projectBlockedReason 서버 값만 읽는다"
---

# Phase 6 Plan 35: 구매 요청 입구 고객 승인 전 닫기 (G-06-D 화면) Summary

고객 승인 전 프로젝트에서 견적 줄 표의 `구매 요청` 문을 지출결의 문과 같은 표 전체 게이트로 닫고(표 위 한 줄이 이유), 줄 고르기 바닥 줄이 서버의 프로젝트 전체 이유를 말하며, 상태 바꾸기 확인 승인 줄이 구매 요청도 멈춘다고 말한다.

## 닫은 것

- **G-06-D 화면 입구** (결정 출처: 카드 ① 2026-10-14 14:20 KST 「구매 요청만」).
- `quote-table.tsx` — (a) `Ctrl+E`의 `opensPurchase`에 `&& !lineDoors.tableGateReason` (b) 행동 열 셀 구매 갈래 첫 줄 `if (lineDoors.tableGateReason) return null` (c) 폰 행 시트 구매 갈래 첫 줄에 지출결의 갈래와 같은 `styles.doorNote` 이유 한 줄. 세 자리에 `G-06-D` 주석.
- `link-picker.tsx` — 구매 모드 결과의 `projectBlockedReason`(문자열일 때)을 `noneSelectableReason`으로, 없으면 `온라인구매 줄 없음`. 카드 모드 문구 `이을 수 있는 줄 없음` 그대로.
- `status-change.tsx` — 승인 줄 꼬리 `진행부터 지출결의 · 구매 요청 멈춤`.
- 새 CSS · 토큰 · 컴포넌트 0. `quote-line-status.spec.ts` · `ui/` · SYSTEM.md · tokens.css · `domain/` · 카드 사용 폼 변경 0(범위 diff 빈 출력).

## 커밋

| Task | 커밋 | 내용 |
|------|------|------|
| 1 (tracer) | edfe1b0 | 표 문 · 줄 고르기 바닥 줄 · E2E `[G-06-D]` · 점검표 |
| 2 | 5df7820 | 상태 바꾸기 승인 줄 · project-lifecycle 단언 두 곳 · 점검표 Task 2 줄 |

`commits: 3`은 `plan_head_before..HEAD` 측정값이다. 이 중 06148a7(`fix(06-34)` row-scope 단위 테스트)은 오케스트레이터가 같은 브랜치에 넣은 것이고 이 플랜의 커밋은 2건이다.

## RED 기록

- Task 1 (`--grep "G-06-D"`): `Error: expect(locator).toHaveCount(expected) failed` — 온라인구매 줄 행 `getByRole('link', { name: '구매 요청' })` `Expected: 0 / Received: 1` (표 위 `1차 고객 승인 전 · 고객 승인 표시` 줄은 이미 보임 — 문만 열려 있음).
- Task 2 (`project-lifecycle`): `expect(locator).toBeVisible() failed` — `getByText('1차 고객 승인 전 · 진행부터 지출결의 · 구매 요청 멈춤')` `element(s) not found` 2건(진행으로 바꾸기 · 진행으로 되돌리기), 17 passed.

## 검증 (새로 돌린 결과)

| 명령 | 결과 |
|------|------|
| E2E desktop `purchase-requests` (CI=true, G-06-D 포함) | 21 passed, 18 skipped(기존 스킵), 종료 0 |
| E2E desktop `project-lifecycle` + `quote-line-status` + `purchase-requests-finish` | 34 passed, 18 skipped, 종료 0 |
| E2E mobile-375 `mobile-purchase-requests-finish` | 3 passed, 종료 0 |
| `pnpm lint` · `pnpm typecheck` · `pnpm build` | 각 종료 0 |

수락 grep: `G-06-D` quote-table 3 · `opensPurchase = .*tableGateReason` 1 · link-picker `projectBlockedReason` 2 · `"온라인구매 줄 없음"` 1 · 옛 문구 `진행부터 지출결의 멈춤` 0건 · 점검표 `- [ ]` 0. 단언 삭제 없음(`expect(` purchase-requests 109 -> 121, project-lifecycle 131 -> 131, `.skip(` 추가 없음).

## 가정

- A-1 완료 프로젝트에서도 구매 요청 문이 닫힌다(표 전체 게이트 `완료 · 견적 줄 잠김` 공유). A-2 상태 바꾸기 문구 변경은 카드 ① 결정의 반영. A-3 힌트 줄 `지출결의·구매 요청 Ctrl+E`는 그대로. 엣지 프로브 EXP-10 미분류 그대로.

## 독립 DOM 감사 요청 (실행자가 하지 않음 — 오케스트레이터가 별도 Sonnet 에이전트로)

`CI=true` 프로덕션 빌드 + 로컬 `erp_test`, E2E `[G-06-D]` 준비와 같은 방식(`setupExpenseE2E` + 온라인 거래처 이름 + `setCustomerApproval(pm, rev, null)`)으로 진행 · 고객 승인 전 프로젝트를 만들어 **375 · 320 · 768 · 1280** 폭마다 DOM으로 잰다(스크린샷 육안 금지):

1. 표 위 줄 글자 = `1차 고객 승인 전 · 고객 승인 표시`
2. 온라인구매 줄 행의 `구매 요청` 링크 · 버튼 0개 (폰 375 · 320은 행 시트 행동 자리에 같은 이유 한 줄)
3. `/cards/purchases?new=1` -> 견적 줄 -> 프로젝트 바꾸기 -> 견적 줄 바꾸기: 행 `aria-disabled="true"` · 2행 이유 · 바닥 줄 글자 = 같은 문구 · `이 줄로` aria-disabled
4. 문서 `scrollWidth = clientWidth` (가로 넘침 0)
5. 상태 바꾸기 확인(진행으로 바꾸기 · 진행으로 되돌리기) 승인 줄 글자 · 줄 수

결과 표(폭 x ①~⑤) 링크: (감사 후 PR 본문 또는 `/review` 기록 링크 기입). 측정 스크립트는 scratchpad에만.

## Deviations from Plan

**1. 실행 위치:** 플랜의 worktree · 브랜치 `claude/06-gap-g2` 대신 오케스트레이터가 지정한 현재 브랜치 `claude/phase-06-gaps-exec-qpq217`에서 실행(06-34와 같음).

**2. [Rule 3 - 타입] `link-picker.tsx` 좁히기 방식:** 플랜은 `"projectBlockedReason" in data`로 좁히라 했으나 단독 `in` 좁히기는 `{}` 타입이 되어 typecheck가 실패했다. `typeof data.projectBlockedReason === "string"` 확인을 더했다(동작 같음).

**3. 06-34 Task 2가 남긴 E2E 실패 사례:** 06-34 SUMMARY에 남은 E2E 실패 사례가 없어(회귀 통과) 준비 수정은 없었다.

## Known Stubs

None.

## Threat Flags

None. T-06-35-01~03 구현대로: 화면은 표시만, 막는 것은 06-34 서버 tx. 화면 판정 코드 추가 없음(`tableGateReason` · `projectBlockedReason` 서버 값만 읽음).

## Self-Check: PASSED

- FOUND: quote-table.tsx · link-picker.tsx · status-change.tsx · purchase-requests.spec.ts · project-lifecycle.spec.ts · 점검표 2026-10-15-06-35-purchase-approval-entry.md
- FOUND commits: edfe1b0 · 5df7820
- `.claude/gates/phase-06.log` 미스테이징(여전히 ` M`)
