---
phase: 05-expense-approval-leave
plan: 07
subsystem: expenses
tags: [expense, team-cost, pick-dialog, vendor-pick, line-pick, f6, numbering]
requires: [05-05, 05-06]
provides:
  - "/expenses/new 팀 비용 지출결의 (첫 저장 · 귀속 팀 확정 · T26 번호)"
  - "ui/pick-dialog 골라내기 (거래처 · 견적 줄 변형)"
  - "changeExpenseVendor · changeExpenseLine(F6) · searchVendorsForPick · searchLinesForPick"
affects: [05-09]
requirements-completed: [EXP-08, EXP-02, UX-06]
status: complete
plan_head_before: 75b1b2d09d135318ba9619927bcea2c2b82ead97
commits: 7
actuals:
  tokens: 41566
  tasks: 2
  commits: 7
coverage:
  unit: "250 files / 3862 tests passed"
  integration: "9 files / 2790 tests passed (leak-scan 포함)"
  e2e_desktop: "24 passed"
  e2e_mobile_375: "18 passed"
  design_checks: "7 passed"
duration: "약 72분 (커밋 기준 18:03Z-19:13Z)"
completed: 2026-10-04
---

# Phase 05 Plan 07: 팀 비용 지출결의와 골라내기 Summary

팀 비용 지출결의(`/expenses/new`, 프로젝트 미연결, 기안자 팀을 사용일 기준으로 저장 시 확정, `T26-0001` 번호)와 거래처 · 견적 줄 골라내기 모달(`ui/pick-dialog`), 줄 바꾸기 F6 서버 판정을 한 묶음으로 올렸다.

## 한 일
- **Task 1 (tracer)**: `createTeamExpenseDraft` · `changeExpenseVendor` · 팀 제출/번호(`document_number.expense_team.*` 설정 5키), `getNewExpenseDefaults`, `/expenses/new` RSC + `ExpenseForm newDoc`(첫 저장 지연: 증빙 올리기 · 제출 때 저장 후 `router.replace`), 팀 문서 읽기 행(프로젝트 `프로젝트 미연결 · {종류}`, 팀, 사용일, 내용), 거래처 골라내기.
- **Task 2**: `searchLinesForPick`(change/pick 두 모드, 프로젝트 그룹, 게이트 막힌 그룹 접힘 + 사유), `changeExpenseLine`(F6: 번호 있는 문서는 같은 프로젝트 줄만, 같은 줄 no-op, 이미 그 줄에 내 초안이 있으면 `redirectTo`, 팀 칸 비움), 폼 `바꾸기` · `견적 줄 고르기`와 막힘 ③ · ⑤ 다음 한 수 연결.

## 커밋
- 4d3b24ca test: 팀 비용 첫 저장 · 귀속 · T26 번호 통합 테스트 (RED)
- 0997c412 feat: 팀 비용 지출결의 도메인과 거래처 골라내기 서버 판정 (GREEN)
- 774b64ba feat: 팀 비용 지출결의 화면과 거래처 골라내기
- 079f4224 test: RED 견적 줄 골라내기 · 줄 바꾸기 서버 판정
- 93bd7d11 feat: 견적 줄 골라내기 검색과 줄 바꾸기 서버 판정 (GREEN)
- c2bcd9c9 feat: 견적 줄 바꾸기 · 고르기 골라내기와 막힘 ③ 다음 한 수 연결
- 93736255 chore: PickDialog 머리 주석에서 확인 모달 컴포넌트 이름 제거

## 사용자 지시(10/5 00:55)에 따라 추천안 적용
- 거래처 `바꾸기`는 팀 문서에만 그린다(견적 줄 문서의 거래처는 줄이 정한다).
- 새 문서 모드에서 `증빙 올리기` / Ctrl+U는 첫 저장을 겸한다. 파일 업로드는 `/expenses/{id}`로 이동한 뒤 한다.
- 머리 줄 `지출결의 — {팀} · {내용}`은 정적이다(내용 입력 중 실시간 갱신 없음).
- 줄 바꾸기는 폼을 다시 띄운다(key) — ~~저장 안 한 비고 · 날짜 편집은 사라진다.~~ [웨이브 9 D1로 대체: 저장된 문서는 줄 바꾸기 전에 저장 안 한 칸을 먼저 저장해 남는다(§7 확인 창 대신 되돌리기·사용자 결정 최소, 사용자 지시(10/5 00:55)에 따라 추천안 적용). `/expenses/new`는 만들어진 문서 버전을 알 수 없어 지워질 칸(팀 비용 칸 · 비고 · 지급 예정일)을 결과 줄에 이름으로 말한다.]
- 목록 화면 `/expenses`는 스텁이라 `새 지출결의` 링크를 만들지 않았다.
- `teamAtDate`는 제출 트랜잭션 밖에서 부른다(귀속 팀은 저장 시 확정, 제출은 저장된 값 사용).
- `견적 줄 고르기` 버튼은 Task 1 커밋에서 연결 없는 버튼이었고 Task 2에서 연결했다.

## Deviations from Plan
**1. [Rule 1 - Bug] 거래처 행 번호 칸 빈자리** — 스크린샷에서 발견, `.numbered` 클래스로 번호 있는 행에만 칸을 세움. (c2bcd9c9 전 단계 수정)
**2. [Rule 3 - Blocking] `NEW_DOC_BLOCK` RSC 참조 문제** — client 파일 상수를 서버 컴포넌트가 import하면 참조가 되므로 `submit-block.ts`로 이동.
**3. [Rule 1 - Bug] PickDialog Enter · aria-disabled 행** — 선택 불가 행에서 Enter가 고르지 않도록, 검색 갱신 뒤 포커스 복원 effect 추가.
**4. [Rule 3] lint/guard 대응** — `font-variant-numeric`(stylelint) · `metaKey`(shortcut-notation) · `set-state-in-effect` 제거, PickDialog 주석의 확인 모달 컴포넌트명 제거(93736255).
**5. 서식 잡음** — 프로젝트 prettier 설정이 없어 `expense-form.tsx`가 재들여쓰기됨(`--print-width 180`). 검토는 `git diff -w`로.

## Known Stubs
None.

## Threat Flags
None — 새 엔드포인트는 모두 next-safe-action(`registerAction` + DTO 투영 + leak-scan 통과), F6 서버 판정은 서버에서만 한다.

## Notes for next plans
- 05-09: 편집 범위 확대와 F6 통합 케이스(`changeExpenseLine` 번호 있는 문서 경계)를 이어서 다룬다.
- `/expenses` 목록에 `새 지출결의` 진입 링크가 아직 없다.
- 견적 줄 7개 건수 안내는 거래처 없음 줄도 센다(고를 수 있는 줄 수와 다르게 표기).

## Self-Check: PASSED
핵심 파일 10개와 커밋 7개(`git rev-list --count 75b1b2d0..HEAD` = 7) 존재 확인.
