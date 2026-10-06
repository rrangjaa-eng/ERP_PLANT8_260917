---
phase: 05-expense-approval-leave
plan: 02
subsystem: design-system
tags: [design-docs, SYSTEM.md, DECISIONS.md, status-words, pick-dialog, attachments, void-row]

requires:
  - phase: 04.6
    provides: SYSTEM.md 역할 토큰 이름 · 스킨 A 판 문서(B3 · B7 흡수)
provides:
  - "DECISIONS 2026-09-26 B1 · B2 · B4 · B5 · B6 · B8 · B9 일곱 항목(내용 · 이유 · 버린 대안 · 결정자 줄)"
  - "SYSTEM §6-1(B9) · §6-3(B1) · §7-3(B4 바 · 차) · §7-5(B2 · B8) · §7-7(#87 정렬) · §7-10(B6 · B8) · §7-17-1 골라내기(B5) 개정"
affects: [05-01, 05-05, 05-07, 05-09, 05-10, 06]

actuals:
  tokens: 11500
  tasks: 3
  commits: 6
plan_head_before: d8a6a7fea745cd0ebe7547b7e2c3ec6b2224fd9b

tech-stack:
  added: []
  patterns:
    - "DECISIONS 먼저 → SYSTEM 다음 커밋 쌍(CLAUDE.md §6)"
    - "SYSTEM 개정 절 끝에 (DECISIONS 2026-09-26 B{n}) 참조"

key-files:
  created: []
  modified:
    - docs/design/DECISIONS.md
    - docs/design/SYSTEM.md

key-decisions:
  - "골라내기 소절 머리글은 `#### 7-17-1`(### 아님) — 기존 가드 `### 7-17` 머리글 정확히 한 줄을 지키기 위해"
  - "B3 · B7은 04.6 흡수라 DECISIONS 항목 · SYSTEM 개정 없음"

requirements-completed: [UX-06, UX-03]

coverage:
  - id: D1
    description: "DECISIONS B1 · B2 · B4 · B5 · B6 · B8 · B9 일곱 항목이 SYSTEM 개정 커밋보다 먼저 커밋됨(B8은 2026-09-18 #7 취소선 충돌 기록 포함)"
    requirement: "UX-06"
    verification:
      - kind: other
        ref: "git log --format=%s d8a6a7fe..HEAD — record B2 · B1/B4-B6 · B8/B9가 각 apply보다 먼저"
        status: pass
    human_judgment: false
  - id: D2
    description: "SYSTEM.md가 B1 · B2 · B4 · B5 · B6 · B8 · B9를 규칙으로 적용(낱말 넷+무효 · 계산 한 줄 · 행 행동 열 · 골라내기 · 업로드 표시 · 무효 행 · 결재함 즉시 승인 범위)"
    requirement: "UX-03"
    verification:
      - kind: unit
        ref: "test/unit/design-system-docs.test.ts + test/unit/docs-limits.test.ts + test/unit/ui/system-md-compliance.test.ts (197 passed)"
        status: pass
      - kind: other
        ref: "plan acceptance greps (골라내기 · 올리는 중 · 문서를 만든 뒤 · sheet-max-h · B 참조 수)"
        status: pass
    human_judgment: false
  - id: D3
    description: "문서 문구의 디자인 적절성(무효 행 취소선 · 정산 즉시 승인 예외 — 사용자 결정을 옮긴 것이라 문구 판단은 사람)"
    verification: []
    human_judgment: true
    rationale: "문서 개정 — 사용자 결정 U1 · 확정 #3을 옮긴 문장의 충실도는 자동 단언이 없다"

duration: ~25min
completed: 2026-10-04
status: complete
---

# Phase 05 Plan 02: 디자인 기준 개정(B1 · B2 · B4 · B5 · B6 · B8 · B9) Summary

**UI-SPEC 개정 제안 열린 일곱 항목을 DECISIONS에 먼저 기록하고 SYSTEM.md §6-1 · §6-3 · §7-3 · §7-5 · §7-7 · §7-10 · §7-17-1에 적용 — 코드 · 토큰 변경 0.**

## Performance

- **Tasks:** 3 (트레이서 B2 → B1 · B4~B6 → B8 · B9) / **Files modified:** 2 / **Commits:** 6 (항목마다 DECISIONS → SYSTEM 쌍)

## Accomplishments
- B2 낱말 넷(`작성 중` · `본인 승인` · `지출결의 중` · `반려`)과 B8 `무효`가 §7-5 의미 목록에 있고 견적 줄 파생 우선순위 `취소 > 반려 > 지출결의 중 > 미착수`가 적혀 `status-map.ts` 줄을 더하는 05-01 · 05-05 · 05-09보다 먼저 선다
- §6-3: 칸 순서 · 분할 지급 · 팀 비용 · 늦은 문서 생성 · 토스트 되돌리기 = 즉시 회수, `· 서버 계산` 꼬리 삭제, ERROR 예시 `제출 실패 · 지급 예정일 1칸`(§7-7 내 차례 `불러오기 실패 · 다시 시도`)
- §7-3: (바) `문서를 만든 뒤 그 화면으로 가는 줄 행동`(3차 · 같은 `action` 자리 · 실패 한 줄도 그 안) · (차) 행 행동 열 · 표 위 한 줄 ④
- §7-10: `올리는 중…` · 오류 문구 넷 · `지우기`/`삭제` 구분 · `증빙 올리는 중 · 잠시 뒤 제출` · `beforeunload` · `다시 올리기` 서버 갈래 · 무효 행(태그 → 취소선 → 2행 · `aria-describedby` · `--touch-min` · `--s-4`)
- §7-17-1 골라내기 `ui/pick-dialog`(검색 · listbox · 현재 줄 `--focus-w` · 2행 이유 · `--sheet-max-h`), §6-1 결재함 `승인` 즉시를 정산 결재까지(CLAUDE.md §7 의식적 예외)

## Task Commits
1. B2: `fdac1bb9` (record) → `0bd0610e` (apply)
2. B1 · B4 · B5 · B6: `7b2f4a0f` (record) → `79f63a52` (apply)
3. B8 · B9: `c9a94135` (record) → `fc135b05` (apply)

## Decisions Made
- 골라내기 소절을 `#### 7-17-1`로 둠(아래 편차). B8 충돌: 취소선은 첨부 무효 행에만, 2026-09-18 #7의 결재선 규칙은 유지(DECISIONS B8에 기록)

## Deviations from Plan

**1. [Rule 3 - Blocker] 골라내기 머리글 레벨**
- **Found during:** Task 2 — 기존 가드 `test/unit/design-system-docs.test.ts`("`### 7-17` 머리글이 정확히 한 줄")가 `### 7-17-1`을 두 번째 줄로 셌다
- **Fix:** 머리글을 `#### 7-17-1. 골라내기`로(SYSTEM에 `####` 첫 사용). 가드 · 번호 체계 불변
- **Verification:** 22개 SYSTEM/DECISIONS 관련 단위 파일 594 passed
- **Committed in:** `79f63a52`

**2. [Rule 1 - 일관성] §6-3 「바꾸기」 현재 줄 `왼쪽 2px --accent` → `--focus-w 두께 --accent`**(B5와 같은 값 · §7-17-1 참조) — `79f63a52`

**Total deviations:** 2 auto-fixed. **Impact:** 문서 구조 외 없음, 새 토큰 0.

## Acceptance 기록
- `grep -n "서버 계산"` 남은 줄: SYSTEM 483행(「서버 계산 값은 입력 바로 아래 한 줄」 — 계산 주체를 말하는 머리 문구, 한 줄 원문 꼬리는 삭제) · `Form.Hint` 설명 줄(서버 계산 값의 자리 — §7-15) → 판정: 원문 꼬리 아님, 유지
- `값은 남아 있습니다` 0 · `제출 실패 · 지급 예정일 1칸` 1 · `불러오기 실패 · 다시 시도` 2 · `DECISIONS 2026-09-26 B` 참조 B1 4 · B2 1 · B4 3 · B5 2 · B6 4 · B8 2 · B9 1 · B3/B7 참조 0
- (바) 문단: `3차` 3 · `문서를 만든 뒤` 1 · `1차 전폭` 0 / §7-10: `aria-describedby` · `--s-4` 있음 / §7-5: `무효` 있음
- DECISIONS B8 본문에 `2026-09-18`과 `취소선` 공존. `tokens.css` diff 0 · 두 문서 밖 diff 0

## Issues Encountered
None

## Next Phase Readiness
05-01(웨이브 2)이 §7-5 기록(B2) 위에서 `본인 승인`을 `status-map.ts`에 더할 수 있다. `status-map.ts` · `CURRENT_CALL_SITES` 줄은 05-01(`본인 승인`) · 05-05(`작성 중` · `지출결의 중`) · 05-09(`무효`)가 더한다.

## Self-Check: PASSED
- 두 문서 존재 · 커밋 6개 `git log`에서 확인 · 문서 가드 단위 3파일 197 passed
