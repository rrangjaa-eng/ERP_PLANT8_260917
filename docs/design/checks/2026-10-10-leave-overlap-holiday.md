# 연차 겹침 · 공휴일 — 점검표
화면: app/(app)/leave/new/leave-form.tsx
기준: BRIEF.md · frontend.md 화면 사용성 원칙 · CHECKLIST.md §1 · SYSTEM.md §6-3(폼 화면) · §7-2(입력 · 오류 표시) · docs/DESIGN.md §4(SYSTEM.md가 있어 §4만 적용)

지금 화면(고치기 전): 신청 폼 힌트는 `주말 N일 제외`(주말만)이고, 휴일 날짜를 골라도 막힘 줄 없이 1차 `연차 신청`이 켜져 있어 눌러야 서버 오류가 보인다. 이번 06.3-01 변경: 힌트 `휴일 N일 제외`(주말 + 공휴일 합) · 휴일 날짜는 고르는 순간 기존 막힘 줄 + 1차 비활성 + 3차(그 칸으로 포커스). 새 JSX 요소 · CSS · 토큰 없음(확정 K-D1, 사용자 카드 2026-10-10).

## 원칙
- [x] 안내 문구: 화면의 모든 설명문을 셌다. 남긴 것은 오류·되돌릴 수 없는 일·잠김뿐이고 명사형 한 줄이다 — 근거: 새 설명문 0. 힌트는 `휴일 N일 제외` 한 줄(명사형, 기존 `주말 N일 제외` 자리 그대로)이고 막힘은 기존 막힘 줄 하나(`휴일 · 다른 날 고르기` 등, 오류 문구 SYSTEM.md §7-2 「원인 · 다음 행동」) — leave-form.tsx diff에 새 JSX 문구 요소 없음
- [x] 결정 최소: 알 수 있는 값은 기본값으로 채웠고, 시스템이 계산할 것을 묻지 않는다 — 근거: 휴일 판정 · 일수는 서버가 계산(사용자가 빼는 날을 고르지 않음). 날짜를 고르면 종료일 채움 · 미리보기가 자동으로 돈다(기존 그대로)
- [x] 할 수 없는 선택지는 숨기거나 비활성화했다 — 근거: 확정 K-D1: 공휴일 날짜(반차 · 휴일만 기간)를 고르는 순간 1차 `연차 신청`이 `disabled`(blocked !== null) — `.claude/rules/frontend.md:22`. E2E 「공휴일 반차」 사례가 toBeDisabled → 평일로 바꾸면 toBeEnabled를 단언
- [x] 주 버튼 하나: 이 화면의 다음 행동이 주 버튼 하나로 보인다 — 근거: 1차 `연차 신청` 하나 그대로, 새 버튼 0. 막힘 줄의 3차 `다른 날 고르기`는 기존 3차 배선(focusField)이 만든다
- [x] 위험한 동작(삭제 등)은 떨어뜨려 두고 위험 색이다 — 근거: 해당 없음(위험 동작 추가 · 변경 없음)
- [x] 같은 말을 두 번 하지 않는다(라벨과 칸 안 글자, 태그와 줄 등) — 근거: 휴일 날짜의 막힘 문구는 막힘 줄 한 곳뿐 — 서버 제출 거절 문구(시작일 칸 아래)는 미리보기가 먼저 막으므로 같은 화면에서 겹치지 않는다. 힌트 `휴일 N일 제외`는 막힘일 때 offDays가 null이라 안 나온다
- [x] 빈 화면은 설명보다 첫 행동 버튼이 먼저다 — 근거: 해당 없음(빈 화면 변경 없음)
- [x] 키보드만으로 끝난다(표는 엑셀 키 구성) — 근거: 3차 `다른 날 고르기`는 Tab 대상 button, 누르면 그 칸으로 포커스(E2E 단언). Ctrl+Enter는 blocked이면 submit()이 조기 반환(기존)
- [x] 같은 종류의 행동은 같은 모양이다(링크·버튼 섞지 않음) — 근거: 막힘 3차는 기존 필수 막힘의 3차와 같은 컴포넌트(`Button variant="tertiary"`) · 같은 `blockedLine` 모양 — 새 모양 0

## 사용자 결정(§1)
- [x] §1의 결정을 하나도 어기지 않았다(웜톤 · 견적 엑셀식 · 옆 패널 · 스킨 A …) — 근거: 색 · 배치 · 패널 · 엑셀식 입력 결정을 건드리지 않음 — 힌트 문구 · 막힘 조건만 바뀜. 새 JSX 요소 0

## 시스템
- [x] 새 색·서체·radius·그림자를 만들지 않았다(tokens.css 변수만) — 근거: 새 값 0 · CSS 파일 변경 0 · tokens.css diff 0 (git diff --stat에 *.css 없음)
- [x] 폰 320에서 가로 넘침 없음 · 터치 44px — 근거: 레이아웃 · CSS 변경 0 — 막힘 줄은 기존 `blockedLine`(폰 고정 행동 줄) 그대로. 폰 320 DOM 감사는 PR의 /design-review 게이트 몫
- [x] 실제 앱 화면(PC 1280 · 폰 390)을 찍어 보고 확인했다 — 스크린샷 경로: 없음 — 육안 판정 금지(CLAUDE.md §6). 이 변경은 CSS · 새 요소 없이 문구 · 비활성 조건뿐이라 `CI=true` E2E(leave-list 힌트 · 공휴일 반차 사례)로 DOM을 실측하고, 4폭(375 · 320 · 768 · 1280) DOM 감사 · Codex 검토는 PR의 `/design-review` 게이트에서 한다

## 06.3-02 겹침 · 막힘 줄 접근성 · 낡은 제출 오류

지금 화면(고치기 전): 결재 중 · 승인 연차와 같은 날을 골라도 막힘 줄 없이 1차가 켜져 있고(제출해야 서버가 거절), 막힘 줄 `#leave-blocked`에는 `role`이 없어 미리보기 뒤 생긴 줄을 화면 읽기 프로그램이 알리지 않으며, 날짜 칸이 막힘 줄을 가리키지 않는다. 제출이 거절된 뒤 날짜를 고쳐도 옛 칸 오류 · `신청 실패 · …` 줄이 남는다. 이번 변경(확정 D-6313, 사용자 카드 2026-10-10): 겹침은 기존 막힘 줄 하나 + 1차 비활성 + 3차 `날짜 바꾸기`, 막힘 줄 `role="status"` · 막힘 칸 `aria-describedby`, 입력이 제출값과 달라지면 낡은 칸 오류만 숨김. 새 JSX 요소 · CSS · 토큰 없음.

- [x] D-6313 겹침은 기존 막힘 줄 하나로(새 요소 · 확인 창 · 설명문 없음) — 근거: `previewLeaveAction`이 `days.ok`일 때 같은 `blockedReason` 칸에 겹침 한 줄을 싣고 폼은 06.3-01 `formBlocked` 배선 그대로 — leave-form.tsx 여는 태그 개수 전후 동일(태그 비교)
- [x] 할 수 없는 신청은 1차 비활성(`.claude/rules/frontend.md:22` · CLAUDE.md §7) — 근거: 겹침이면 `blocked !== null`이라 1차 `연차 신청` · `연차 다시 신청` `disabled` — E2E 「겹침」 · 「다시 신청 폼 겹침」이 toBeDisabled, 날짜를 바꾸면 toBeEnabled
- [x] 「원인 · 해결」 명사형 한 줄(D-6315 · SYSTEM.md:785) — 근거: `{M월 D일} {갈래} 신청과 겹침 · 날짜 바꾸기` — 원인 `… 신청과 겹침`, 다음 행동은 3차 `날짜 바꾸기`(splitReason)
- [x] 3차 버튼이 시작일 칸으로 간다 — 근거: 겹침 막힘 칸이 `startDate` → `focusField("startDate")` — E2E가 `날짜 바꾸기` 누름 뒤 시작일 칸 toBeFocused
- [x] 날짜 칸 아래 같은 줄을 한 번 더 보이지 않는다(문구 최소) — 근거: 미리보기 겹침은 막힘 줄에만, 칸 아래 `startError`는 제출 거절일 때만이고 겹침이면 1차가 꺼져 제출이 나가지 않는다 — 같은 화면에 두 번 뜨지 않음
- [x] (리뷰 F2) 막힘 줄 `role="status"`(SYSTEM.md:492 · :626 꼴) — 근거: `#leave-blocked` span에 속성 하나 — E2E가 `toHaveAttribute("role", "status")`
- [x] (리뷰 F2) 막힘 칸의 `aria-describedby`가 막힘 줄을 가리킨다 — 근거: 시작일 칸은 `blocked?.field === "startDate"`, 종료일 칸은 `blocked?.field === "endDate"`(06.3-01 회계연도 막힘)일 때 `leave-blocked`(칸 오류와 함께면 공백으로 이음) — E2E가 막힘 때 `/leave-blocked/` · 풀린 뒤 없음 단언
- [x] (리뷰 A1) 입력을 고치면 낡은 제출 거절 줄이 사라진다 — 근거: `sameLeaveInput(useAction의 마지막 input, 지금 입력)`이 거짓이면 `shownSubmitErrors(true, …)`가 칸 · 비고 오류를 비운다(되돌리면 다시 보임). 서버 오류(결재선 없음 · 권한)는 그대로(eng R2-W2), 네트워크 실패 줄도 그대로 — 단위 6건
- [x] (리뷰 A3 · 의도) 겹침 상대가 결재 중인지 승인인지 문구에 넣지 않는다 — 근거: 문구 최소(D-6315), 다음 행동은 3차 `날짜 바꾸기` 하나. 결재 중이면 회수도 길이지만 그 길은 문서 화면의 2차 `회수`(260907 「취소하거나 날짜를 바꿔」 `O: server/src/leave.ts:1633`과 다른 이유)
- [x] (리뷰 A5) 결재자 화면(문서 화면 · 결재 시트 · 결재함)은 바꾸지 않는다 — 근거: 이 플랜 diff에 `app/(app)/leave/new/` 밖 화면 파일 없음 — 저장값 `days_quarters` 그대로(D-6305), 260907도 설명 없음
- [x] (리뷰 A6) 반려 뒤 같은 날 새 신청이 있으면 다시 신청 폼이 열자마자 막힌다 — 근거: 의도된 동작(반려 행은 살아 있지 않고 새 신청이 살아 있음) — E2E 「다시 신청 폼 겹침」이 열자마자 막힘 줄 · `연차 다시 신청` 비활성
- [x] 시스템(새 색 · 서체 · radius · CSS 없음, docs/DESIGN.md §4만) — 근거: `.css` · `ui/` · `tokens.css` 변경 0, 속성 · 식만. 4폭 DOM 감사 · Codex 검토는 PR의 `/design-review` 게이트 몫(실행자가 하지 않음)

## 06.3-02 /design-review 수정 — 되돌린 제출값의 칸 오류 · 막힘 줄 중복

지금 화면(고치기 전, DOM 실측 `/mnt/project-files/06.3-prep/exec-design-02/dom-적용후-수정전.json` 「stale-reverted」 4폭): 제출이 겹침으로 거절된 뒤 날짜를 바꿨다가 제출값으로 되돌리면 시작일 칸 아래 `#startDate-error` 「{M월 D일} 종일 신청과 겹침 · 날짜 바꾸기」와 막힘 줄 `#leave-blocked` + 3차 `날짜 바꾸기`가 같은 문구로 한 화면에 두 번 보인다(시작일 `aria-describedby="startDate-error leave-blocked"`). 이번 변경: 미리보기 막힘이 같은 칸 · 같은 문구를 말하면 그 칸 오류만 숨긴다(`shownSubmitErrors` 셋째 인자). 새 JSX 요소 · CSS · 토큰 없음.

- [x] 같은 말을 두 번 하지 않는다 — 근거: 수정 뒤 DOM 실측 `dom-적용후.json` 「stale-reverted」 4폭 모두 `fieldErrors` [] · 막힘 줄 1개 · 시작일 `aria-describedby="leave-blocked"` · `aria-invalid` 없음. 단위 「같은 칸 · 같은 문구면 칸 오류는 숨긴다」 · 「다른 문구면 그대로」
- [x] 막힘 줄 · 1차 비활성 · 다른 상태는 그대로 — 근거: 수정 전후 JSON의 나머지 상태(겹침 3종 · 오전-오후 · 공휴일 · 거절 · 바꾼 뒤) 막힘 문구 · role · 1차 aria-disabled · describedby · 3차 포커스 비교 동일(diff 0). `CI=true pnpm playwright test --project=desktop test/e2e/leave-list.spec.ts` 27 통과
- [x] 시스템(새 색 · 서체 · radius · CSS 없음) — 근거: diff는 form-state.ts 식 · leave-form.tsx 인자 하나 · 단위 테스트뿐, `.css` · `ui/` · `tokens.css` 변경 0
