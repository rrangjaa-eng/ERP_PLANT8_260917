---
phase: 06-payment-evidence-cards
plan: 38
subsystem: design-docs
tags: [docs, design-system, surface, page-form, decisions]
gap_closure: true
gap_ids: [G-06-F]
status: complete
plan_head_before: c4696b71ed7ec5f53d746f3094c1f780f29131b6
commits: 2
requirements: [EXP-13]

requires:
  - phase: 06.5-payment-followup
    provides: 06.5-07 · 06.5-10 (SYSTEM.md · DECISIONS.md 선행 변경, main c4696b7)
provides:
  - DECISIONS.md 2026-10-16 항목 「페이지 배치 폼은 바탕 위 한 열 · 흰 면은 입력 칸과 옆 패널 폼(06-38 · G-06-F · Codex N1 A)」
  - SYSTEM.md §0 한 줄 원칙 · §1-4 `면` 줄이 같은 규칙을 말함
affects: [이후 /design-review · 화면 플랜]

actuals:
  tokens: 4500
  tasks: 2
  commits: 2

key-files:
  created:
    - docs/design/checks/2026-10-16-06-38-page-form-surface.md
  modified:
    - docs/design/DECISIONS.md
    - docs/design/SYSTEM.md

key-decisions:
  - "카드 ③ 2026-10-14 14:20 KST 「지금 모양 유지」(Codex N1 A): 페이지 배치 폼은 --surface-canvas 위 한 열, 흰 면은 입력 칸 · 옆 패널 폼(모달 · 시트 포함) · 표 · 패널"

duration: ~15min
completed: 2026-10-16
---

# Phase 06 Plan 38: 페이지 배치 폼 면 규칙 정본화 Summary

G-06-F 닫음: SYSTEM.md §0 한 줄 원칙과 §1-4 `--surface-base` 줄을 지금 화면(페이지 폼 = 바탕 위 한 열, 흰 면은 입력 칸)에 맞추고 DECISIONS.md에 카드 ③ 출처와 함께 기록. 코드 · 화면 · 토큰 변경 0.

## 커밋

| Task | 커밋 | 제목 |
|---|---|---|
| 1 (tracer) | 2480b5e | docs(06-38): page forms sit on the canvas as one column |
| 2 | d1e53b2 | docs(06-38): align surface-base role with page form layout |

DECISIONS.md 항목은 파일 끝에 덧붙였다(06-37 PR이 같은 끝에 항목을 더하므로 origin/main 머지 때 두 항목을 모두 남긴다).

## 검증

- `grep -c "페이지 배치 폼" docs/design/SYSTEM.md` = 2 (§0 · §1-4) · `grep -c "G-06-F" docs/design/DECISIONS.md` = 1
- §0 인용 줄 grep 1 · §1-4 `| 면 |` 줄 `surface-base.*페이지 배치 폼` grep 1
- `pnpm exec vitest run --project unit test/unit/ui`: 53 files · 706 tests passed (커밋 1 상태 · 커밋 2 상태 각각)
- `git diff --numstat c4696b7..HEAD`: SYSTEM.md `2 2`, DECISIONS.md `8 0`, 점검표 `29 0` — 바뀐 파일은 `docs/design/*.md`뿐
- 점검표 `- [ ]` 0개

## 일관성 검사

`grep -n "폼은 흰 면\|폼 면\|폼·패널\|표·폼" docs/design/SYSTEM.md` 결과 0건(수정 뒤) — 페이지 배치 폼이 흰 면 위에 있다고 말하는 다른 문장 없음. §6-3 · §7-15 · §7-20과 정면 어긋남 없음.

## 가정

- A-1: `tokens.css` :57 주석(`/* 표·폼·패널·모달 면 */`)은 고치지 않았다(옆 패널 폼 · 모달 폼이 그 면을 쓰므로 거짓 아님, 고치면 화면 영향 PR). 다음 화면 묶음에서 같이 다듬을 수 있다.
- A-2: 「옆 패널 폼」에는 모달 · 폰 시트 안 폼이 든다.
- 엣지 프로브: EXP-13 미분류 유지(화면 동작 변경 0).

## Deviations from Plan

None - plan executed exactly as written. (실행자 메모: 두 태스크의 편집을 한 번에 만든 뒤 §1-4 줄을 되돌려 태스크 순서대로 두 커밋으로 나눴다.)

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

- FOUND: docs/design/checks/2026-10-16-06-38-page-form-surface.md
- FOUND: 2480b5e · d1e53b2 (git log)
