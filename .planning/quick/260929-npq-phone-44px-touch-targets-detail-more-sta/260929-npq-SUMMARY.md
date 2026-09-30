---
phase: quick-260929-npq
plan: 01
subsystem: ui
tags: [phone, touch-target, css, e2e, design-gate]
status: complete
requires: []
provides:
  - "폰(<700) 상세 머리 줄 「상태 바꾸기」·「더보기」 44×44"
  - "폰 프로젝트 목록 정렬 머리글 링크 44 높이 · 셀 채움"
  - "test/e2e/mobile-touch-targets.spec.ts (RED→GREEN 가드)"
affects: [projects detail, projects list, ui/table]
key-files:
  created:
    - test/e2e/mobile-touch-targets.spec.ts
  modified:
    - app/(app)/projects/[id]/project-detail.module.css
    - app/(app)/projects/[id]/quote-table.tsx
    - app/(app)/projects/[id]/status-change.tsx
    - ui/table/Table.module.css
    - docs/design/checks/2026-09-29-04-폰-터치-44.md
decisions:
  - "두 버튼 모두 min-height/min-width var(--touch-min)로 보이는 높이 44 (목록 「필터」 선례)"
  - "정렬 머리글은 공유 Table 폰 미디어 쿼리에서 링크를 셀 높이만큼 확장(음수 margin) — 필터 시트로 옮기지 않음"
metrics:
  completed: 2026-09-29
commits: 2
plan_head_before: 720ac9ef9a6d8ef733f0f8e562db2268e0e41703
actuals:
  tokens: 14000
  tasks: 2
  commits: 2
---

# Quick 260929-npq: 폰 44px 터치 목표 Summary

폰(<700) 미디어 쿼리 안에서만 상세 머리 줄 「상태 바꾸기」·「더보기」를 `--touch-min`(44)으로, 목록 정렬 머리글 링크를 셀 높이(44)로 채웠고 E2E로 고정했다.

## Commits
- RED `2a7fc616` test: pin phone 44px touch targets for project detail and list sort headers (스펙 파일 하나)
- GREEN `43dd5de4` fix: phone 44px touch targets for detail header buttons and list sort headers (CSS 둘 · TSX 둘 · 점검표)

## 측정값 (CI=true 프로덕션 빌드, boundingBox)

| 대상 | RED(수정 전) | GREEN(수정 후) |
|---|---|---|
| 「상태 바꾸기」 @375·320 | 높이 40 (폭 79.36) | 79.36×44 |
| 「더보기」(머리 줄) @375·320 | 높이 40 | 56.45×44 |
| 정렬 링크 「프로젝트명」 @375 / @320 | 높이 19.19, 셀−링크 21 | 189.58×44 / 157×44, 셀 45 (셀−링크 1) |
| 정렬 링크 「견적」 @375 / @320 | 높이 19.19 · 폭 20.30 · 셀−링크 21 | 65.69×44 / 52.73×44, 셀 45 |
| PC 1280·700 「상태 바꾸기」 | 32 | 32 (불변) |
| PC 1280·700 정렬 링크 | 19.19 | 19.19 (불변) |

RED 실패 단언(정확): `상태 바꾸기 @375/@320 높이` Received 40 · `더보기 @375/@320 높이` Received 40 · `프로젝트명/견적 @375/@320 링크 높이` Received 19.1875 · `견적 @375/@320 링크 폭` Received 20.296875 · `프로젝트명/견적 @375/@320 셀−링크 높이` Received 21 (기대 ≤ 2.5). 폰 A·B 실패, PC C 통과, 가로 넘침 단언은 수정 전에도 통과.

## 실행한 명령
- `CI=true pnpm exec playwright test test/e2e/mobile-touch-targets.spec.ts --no-deps` — RED: 2 failed / 1 passed. GREEN: 3 passed.
- `pnpm lint` exit 0 · `pnpm typecheck` exit 0 · `pnpm build` exit 0 (GREEN 전, 커밋 직전에 lint·typecheck 재실행 exit 0)
- 관련 기존 스펙(CI=true, 하나씩, --no-deps): project-lifecycle 12 passed · projects-list 31 passed · mobile-320-no-overflow 3 passed

## Deviations from Plan

**1. [Rule 1 - Bug in plan/test locator] 「더보기」 로케이터를 main 안으로 좁히고 PM 계정으로 분리**
- **Found during:** Task 1 RED 확인 (첫 실행에서 「더보기」 높이 단언이 통과)
- **Issue:** `getByRole("button", {name:"더보기"})`가 폰 하단 탭(BottomTabs, h=44)의 「더보기」를 잡았다. 또 팀장 계정에는 머리 줄 「더보기」(복사·차수 묶음)가 그려지지 않는다(프로젝트 쓰기 권한 있는 담당 PM에게만).
- **Fix:** 두 버튼 로케이터를 `page.getByRole("main")`로 좁히고, 폰 테스트(A)는 팀장으로 「상태 바꾸기」, 같은 테스트 안에서 PM으로 재로그인해 「더보기」를 잰다. PC 테스트(C)도 PM으로 「프로젝트 복사」 링크 가시 확인 뒤 「더보기」 숨김을 단언. 테스트는 계획대로 3개(폰 2 · PC 1) 유지.
- **Files modified:** test/e2e/mobile-touch-targets.spec.ts
- **Commit:** 2a7fc616

기타 계획 이탈 없음. PC 정렬 링크 상수는 실측 19.19로 넣음(`toBeCloseTo(…, 0)`).

## Deferred / follow-up (범위 밖, 고치지 않음)
폰에서 여전히 `--control-h` 40인 같은 부류 버튼(UI-REVIEW가 재지 않음 — 사용자 판단 필요):
- 「일괄 저장」(1차, 편집 뒤 표시)
- 「복사해 새 차수」(「더보기」로 펼친 묶음)
- 「프로젝트 복사」(같은 묶음, 링크)

## Known Stubs
없음.

## Threat Flags
없음 — CSS 치수·className·테스트 시드만.

## Self-Check: PASSED
- 스펙·CSS·TSX·점검표 파일 존재 확인, 커밋 2a7fc616 · 43dd5de4 존재, `git rev-list --count 720ac9e..HEAD` = 2, 작업 트리는 미커밋 PLAN/SUMMARY 외 깨끗.

## 오케스트레이터 확인 (세션 01NcV5r8)
- git diff 2a7fc616..43dd5de4 직접 검토: 폰 미디어 쿼리 안 규칙 3개 + className 2줄 + import 1줄, PC 규칙 변경 0.
- RED 직접 재현: CSS·TSX 4파일을 2a7fc616로 되돌려 CI=true build → 스펙 A·B 실패(버튼 40 · 정렬 링크 19.1875 · 셀−링크 21) → HEAD로 복원.
- GREEN 직접 재실행(43dd5de4, CI=true): 3 passed · lint 0 · typecheck 0.
- 독립 DOM 감사(별도 Sonnet 에이전트, CI=true 빌드·erp_test, 375·320·700·699·1024·1280 실측, 스크린샷 없음): PASS 24 · FAIL 0. 정렬 링크 44(셀 45) · 견적 우측 정렬 유지(오른쪽 여백 8 = 셀 패딩) · 가로 넘침 0 · Tab 포커스 링 2px 잘림 없음 · 상태 바꾸기 79×44 · 더보기 56×44 · 두 버튼 한 줄 겹침 0 · min-height = --touch-min 44 · PC 32/19.19 그대로 · 699/700 경계 정상.
- INFO(결함 아님, 고치지 않음): 폰 정렬 링크 포커스 링(2px+offset 2px)이 첫 본문 행에 약 3px 겹침(잘림 없음) · 「더보기」로 펼친 묶음 버튼 40(위 Deferred와 같음).
