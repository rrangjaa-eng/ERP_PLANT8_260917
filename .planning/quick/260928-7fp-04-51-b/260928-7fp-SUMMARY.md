---
phase: quick-260928-7fp
plan: 01
subsystem: document-numbering
tags: [document-counter, settings, decision-2b, tdd]
status: complete
requires: []
provides:
  - "setSimpleSettingValue 결정 ②(b) 판정 — 올해 카운터 발급 ≥ 1 그리고 새 시작값 < 현재 시작값일 때만 거부"
affects:
  - "app/(app)/admin/settings/actions.ts (호출부·시그니처 불변, 거부 메시지 한 조각)"
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified:
    - test/integration/document-numbering.test.ts
    - domain/document-numbering/index.ts
decisions:
  - "04-51 결정 ② 임계값 (b) 적용: 낮출 때만 거부, 같은 값·올리는 값 통과, 메시지 「순번 시작값이 이미 매긴 번호(최대)와 겹침」 한 조각(사용자 2026-09-28, PR #85 댓글 5861849715)"
metrics:
  completed: 2026-09-28
  tasks: 2
  files: 2
commits: 3
plan_head_before: 7bd5496
actuals:
  tokens: 4000
  tasks: 2
  commits: 3
---

# Quick 260928-7fp: 04-51 결정 ②(b) 순번 시작값 임계값 Summary

순번 시작값 저장은 이제 올해 발급이 있고 시작값을 낮출 때만 한 조각 명사형 메시지로 거부된다. 같은 값이나 올리는 값은 통과한다(이미 매긴 최대 이하로 올려도 통과). 카운터 행 잠금, 권한 판정 순서, 한 트랜잭션 저장 구조는 바꾸지 않았다.

## Commits

| Task | Commit | 내용 |
|------|--------|------|
| 1 (RED) | 9e286b2 | test: expect seq start rejection only when lowering (decision 2b) |
| 2 (GREEN) | 3fc1bf6 | fix: reject seq start change only when lowering it (decision 2b) |
| 리뷰 후속 | 1db3896 | chore: correct seq start comments for decision 2b |

## RED 실측 (Task 1, 커밋 전)

26개 중 정확히 5개가 실패했다. 5개 모두 동작 불일치 때문이며 문법·타입·import 오류는 없었다.
- 50으로 낮추면 거부되고… → 메시지 불일치(`… 겹침 · 103 이상…` ≠ `… 겹침`)
- 올린 값 101 → 26104 → `SeqStartOverlapError: … 겹침 · 103 이상 입력`
- 올린 값 102 → 26105 → `SeqStartOverlapError: … 겹침 · 103 이상 입력`
- 문자열 "50" → 메시지 불일치
- createProject 경로 → "102" 저장 거부(`… 번호(104)와 겹침 · 105 이상 입력`)

lint와 typecheck는 통과했고 옛 안내 조각은 0건이었다.

## GREEN 실측 (Task 2)

- 통합: document-numbering 26/26, document-counters 포함 2개 파일 31/31 통과
- 단위: document-number-format과 error-copy-noun-style, 2개 파일 27/27 통과
- `pnpm lint` exit 0, `pnpm typecheck` exit 0
- grep 결과: (b) 조건 1줄, `이상 입력`·`maxIssued + 1`·`결정 ②(a)` 0건, `결정 ②(b)` 1건
- `git diff HEAD~2 --name-only`에는 두 파일만 나온다

## Deviations from Plan

None - plan executed exactly as written.

## 후속 확인 필요 (범위 밖, 건드리지 않음)

- `docs/design/DECISIONS.md` 약 1000–1004행의 「2026-09-27 — 결정 ② (a) 설정 검증」 항목이 아직 (a) 규칙과 옛 두 조각 메시지를 정본처럼 설명하고 있어 (b)와 맞지 않는다. docs/design/ 수정은 design-gate 훅 대상이므로 수정하지 않았고, 오케스트레이터나 사용자가 후속으로 정한다.
- 테스트 파일 describe 머리 주석(should-2)과 index.ts의 "실제 최대" 주석(should-1)은 리뷰 후속 커밋 1db3896에서 고쳤다(주석만 바꿨고 동작·문구는 그대로).
- should-1 문구 숫자(올린 뒤 낮출 때 상한 표시) — 사용자 결정 대기
- STATE.md 285행의 (a) 기록은 288행 (b)가 대체한다.

## Self-Check: PASSED

- FOUND: domain/document-numbering/index.ts, test/integration/document-numbering.test.ts
- FOUND: 9e286b2, 3fc1bf6, 1db3896 (git log)
