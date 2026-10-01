# kst-today-people 브랜치에 origin/main(#123 머지 뒤) 병합 — 점검표 (병합 전용)
화면: app/(app)/approvals/conflict-line.tsx
기준: BRIEF.md · frontend.md 화면 사용성 원칙 · CHECKLIST.md §1 · SYSTEM.md

> 선례 `2026-09-30-verify-work-4-merge-main-90.md`(사용자 결정 2026-09-29, 선택지 A)와 같은 병합 전용 점검표다 — 새 디자인 점검이 아니다. 위 화면은 이 브랜치(claude/kst-today-people, PR #126)가 고치지 않았고, origin/main `eeddfad`와 바이트 단위로 같다 — `git diff --cached origin/main -- 'app/(app)/approvals/'` 0줄(2026-10-01 병합 커밋 직전). 이 병합 뒤 main 대비 다른 화면은 이 PR의 두 파일(`app/(app)/admin/people/[id]/page.tsx`·`app/(app)/admin/settings/page.tsx`, 점검표 `2026-10-01-이력-오늘-서울날짜.md`)뿐이다. 디자인 판단은 그 화면을 바꾼 #125의 게이트 몫이고, 여기 근거는 전부 「main과 동일」이다.

## 원칙
- [x] 안내 문구: 이 병합은 문구를 바꾸지 않는다 — 근거: 위 파일 origin/main 대비 diff 0줄
- [x] 결정 최소 — 근거: 위와 같음(main과 동일, #125 확인 대상)
- [x] 할 수 없는 선택지 숨김·비활성 — 근거: 위와 같음(main과 동일)
- [x] 주 버튼 하나 — 근거: 위와 같음(main과 동일)
- [x] 위험한 동작 분리·위험 색 — 근거: 위와 같음(main과 동일)
- [x] 같은 말 두 번 없음 — 근거: 위와 같음(main과 동일)
- [x] 빈 화면은 첫 행동 버튼 먼저 — 근거: 위와 같음(main과 동일)
- [x] 키보드만으로 끝남 — 근거: 위와 같음(main과 동일)
- [x] 같은 종류의 행동은 같은 모양 — 근거: 위와 같음(main과 동일)

## 사용자 결정(§1)
- [x] §1 결정 위반 없음 — 근거: 이 병합이 위 화면에 더한 변경 0줄(main과 동일)

## 시스템
- [x] 새 색·서체·radius·그림자 없음 — 근거: 이 병합이 위 화면에 더한 변경 0줄(main과 동일)
- [x] 폰 320 가로 넘침 없음 · 터치 44px — 근거: 이 병합 뒤 이 PR의 `CI=true` 전체 E2E(ready 전환 때)가 다시 잰다
- [x] 실제 앱 화면 확인 — 근거: 스크린샷 육안 판정 금지(CLAUDE.md §6) — DOM 실측 E2E(`CI=true`)로 대신한다
