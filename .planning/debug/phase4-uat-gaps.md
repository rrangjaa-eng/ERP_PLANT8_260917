---
status: investigating
trigger: "Phase 4 UAT 결함 3건 원인만 찾기(수정 없음) — G-04-4 · G-04-16 · G-04-64 (.planning/phases/04-project-quote-ledger/04-UAT.md Gaps)"
created: 2026-09-29
updated: 2026-09-29
goal: find_root_cause_only
---

## Symptoms

Discovered during Phase 4 UAT evidence cross-check (2026-09-29). Not user-observed failures — evidence gaps the user asked to close with tests.

1. G-04-4 — expected: 프로젝트 목록을 못 불러오면 `app/(app)/projects/error.tsx`가 「프로젝트 목록 불러오기 실패 · 다시 시도」를 보이고 다시 시도가 reset을 부른다. actual: 이 화면을 다루는 테스트·감사 기록이 없다. errors: none. reproduction: UAT test 4. timeline: 04-05에서 만든 뒤 한 번도 검증 기록 없음.
2. G-04-16 — expected: `ui/select`에 오류(error)와 설명 옵션이 함께 오면 설명 힌트 대신 오류가 보인다. actual: 04-25-SUMMARY:63 커밋 안 된 임시 vitest뿐, 커밋된 테스트 없음, 둘을 함께 넘기는 호출부 없음. errors: none. reproduction: UAT test 16.
3. G-04-64 — expected: 매출 입력(revenue section)을 연 채 창을 1024 미만으로 줄여도 입력값·dirty 상태가 남는다(돌아와도 유지). actual: 04-41-SUMMARY:170 · 04-project-quote-ledger/.continue-here.md:311 — 재현 안 됨, 열린 채 이월. errors: none. reproduction: UAT test 64.

## Constraints

- Diagnose only. Do NOT edit app/ui/test code or other .planning files; only this debug file (and scratch files outside the repo, deleted afterwards).
- Integration: `pnpm vitest run --project integration <spec>` only, never concurrent. E2E: one spec at a time with `CI=true` (see playwright.config.ts webServer). Local DB is up.
- For G-04-64 actually try to reproduce (throwaway Playwright script/spec outside the repo or deleted after).

## Current Focus

hypothesis: (none yet)
next_action: gather initial evidence
