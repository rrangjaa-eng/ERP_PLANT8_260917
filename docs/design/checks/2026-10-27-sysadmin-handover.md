# 시스템 관리자 넘기기(07.1 D-2) — 점검표
화면: app/(app)/admin/people/[id]/, app/(app)/admin/people/actions.ts, app/(app)/admin/people/actions.registry.ts
기준: BRIEF.md · frontend.md 화면 사용성 원칙 · CHECKLIST.md §1 · SYSTEM.md §6-2 · §7-1 · §7-17 · §8

지금 화면(고치기 전): 유일 시스템 관리자가 다른 사람 상세에서 계급 select를 「시스템 관리자」로 바꾸면 `시스템 관리자 있음 · {본인}`으로 거부되고,
자기 상세에는 계급 변경 줄이 없다 — 자리를 넘길 길이 화면에 없다. 고칠 계획: 넘길 수 있는 대상(재직 · 보관 아님 · 입사일 오늘 이전 ·
지금 시스템 관리자 아님)의 상세에서, 보는 사람이 시스템 관리자일 때만 계급 변경 줄 아래 3차 `시스템 관리자 넘기기` 하나 →
되돌릴 수 없는 일이라 확인 모달(§7-17) → 성공하면 내 관리 권한이 사라지므로 첫 화면으로.

## 원칙
- [x] 안내 문구: 화면의 모든 설명문을 셌다. 남긴 것은 오류·되돌릴 수 없는 일·잠김뿐이고 명사형 한 줄이다 — 근거: 상세 화면 설명문 추가 0. 확인 모달 결과 줄 한 줄 `내 계급 → 기획 PM · 되돌리기는 새 시스템 관리자`(되돌릴 수 없는 일 · 명사형). 서버 거부는 그 문자열 그대로 막힘 자리(E2E 「누르면 확인 모달」)
- [x] 결정 최소: 알 수 있는 값은 기본값으로 채웠고, 시스템이 계산할 것을 묻지 않는다 — 근거: 대상은 지금 보는 상세의 사람, 옛 사람 계급은 기본 계급(DEFAULT_ROLE_ID)으로 시스템이 정한다 — 고르는 칸 0
- [x] 할 수 없는 선택지는 숨기거나 비활성화했다 — 근거: 보는 사람이 시스템 관리자가 아니거나, 대상이 자기 · 시스템 관리자 · 보관 · 퇴직(예정) · 입사일 오늘 뒤면 버튼 없음(page.tsx `canHandOver`, E2E 「시스템 관리자에게만 · 넘길 수 있는 대상에만」 — 입사일 내일 · 관리자 대상 · 자기 상세 · 위임 계정 0개)
- [x] 주 버튼 하나: 이 화면의 다음 행동이 주 버튼 하나로 보인다 — 근거: 상세 화면 1차 버튼 수 변화 없음(트리거는 3차 `variant="tertiary"`), 확인 모달 안 1차는 `시스템 관리자 넘기기` 하나(§7-17)
- [x] 위험한 동작(삭제 등)은 떨어뜨려 두고 위험 색이다 — 근거: 되돌릴 수 없는 넘기기는 §7-1 「위험 행동은 확인 모달로 구분 · 붉은 버튼 없음」대로 확인 모달(ConfirmDialog) 뒤에만 실행, 계급 select와 다른 줄(`.loginActions` 여백 --s-4)
- [x] 같은 말을 두 번 하지 않는다(라벨과 칸 안 글자, 태그와 줄 등) — 근거: 부제는 대상 이름만, 결과 줄은 내 계급만. 서버 거부 글자는 보이는 자리 1곳(E2E `filter({ visible: true })` 개수 1 — Button 안 사본은 ConfirmDialog CSS가 display:none)
- [x] 빈 화면은 설명보다 첫 행동 버튼이 먼저다 — 근거: 빈 상태 없음(상세 한 사람) — 해당 없음
- [x] 키보드만으로 끝난다(표는 엑셀 키 구성) — 근거: 트리거는 네이티브 button(Tab · Enter), ConfirmDialog는 열릴 때 1차 포커스 · Ctrl+Enter · Esc(§7-17 공용 동작)
- [x] 같은 종류의 행동은 같은 모양이다(링크·버튼 섞지 않음) — 근거: 같은 상세의 `비밀번호 초기화`(확인 모달을 여는 3차)와 같은 모양 · 같은 컨테이너 클래스(`.loginActions`)

## 사용자 결정(§1)
- [x] §1의 결정을 하나도 어기지 않았다(웜톤 · 견적 엑셀식 · 옆 패널 · 스킨 A …) — 근거: 한 건 등록 · 수정 폼이 아니라 끝내야 하는 한 건의 확인이라 모달(§1 2026-09-27 「모달 = 끝내야 하는 한 건」), UQ-6 확인 창 폭 480 그대로(ConfirmDialog 기본)

## 시스템
- [x] 새 색·서체·radius·그림자를 만들지 않았다(tokens.css 변수만) — 근거: CSS 변경 0 · 새 클래스 이름 0(기존 `styles.loginActions` · `Button` · `ConfirmDialog`)
- [x] 폰 320에서 가로 넘침 없음 · 터치 44px — 근거: E2E 320 `scrollWidth <= innerWidth` 참, 3차 버튼 폰 44 터치는 `Button` 공용 규칙(§7-1). Codex 캡처 DOM 실측표(아래 보고서)
- [x] 실제 앱 화면(PC 1280 · 폰 390)을 찍어 보고 확인했다 — 스크린샷 경로: 이 브랜치 /home/user/wt/07.1-06b/test-results/codex-design-review/branch-capture/admin_people_lockedId_-58fac12b-{375,320,768,1280}.png · main(21e3b8dd) /home/user/wt/07.1-06b-main/test-results/codex-design-review/main-21e3b8dd/ 같은 이름(CI=true, 시드 people-list-filled). DOM 실측(measurements-*.json): 네 폭 모두 overflowX false · scrollWidth = 폭, 새 3차 버튼 폰 375·320 높이 44 · 768·1280 높이 22(§7-1 3차) · 한 줄, main에는 버튼 0

## 게이트 반영(r2 · PR #313 게이트 B-1 · P2-1 · N-1 · N-3)
- [x] 할 수 없는 선택지 숨김 — 대표 대상 · 나 말고 시스템 관리자가 또 있을 때 버튼 없음 — 근거: page.tsx `canHandOver`에 `currentRoleId !== CEO_ROLE_ID` · `!hasOtherSysadmin` 추가, 서버도 같은 판정(통합 「재직 대표에게는 넘기지 못한다」 · 「시스템 관리자가 이미 둘이면」), E2E 「다른 시스템 관리자가 있으면 … 버튼이 없다」 통과
- [x] 안내 문구 · 같은 말 두 번 — 결과 줄 둘(`대상 계급 {지금 계급} → {시스템 관리자}` · `내 계급 → {기본 계급} · 되돌리기는 새 시스템 관리자`) — 근거: 대상이 무엇을 잃는지(팀장 · 본부장 자리)가 확인 전에 보여야 한다(review P2-1). 부제는 이름만이라 겹치지 않음. 계급 이름은 데이터(listAssignableRoles)에서
- [x] 실패 줄 — 서버 거부는 막힘(`disabledReason`), 연결 실패는 다시 누를 수 있는 `failure` — 근거: ConfirmDialog `failure` 계약(04.3-17)과 review-form.tsx · header-actions.tsx의 같은 갈래
- [x] 새 색 · 서체 · radius · CSS 0 — 근거: `git diff origin/main -- '*.css'` 0줄
- [x] 실제 앱 화면 — 근거: Codex r2 캡처(CI=true, 시드 people-list-filled — 시드 관리자가 유일 시스템 관리자) test-results/codex-design-review/20261027-115933-13881/admin_people_lockedId_-58fac12b-{375,320,768,1280}.png, DOM 실측: 네 폭 overflowX false · scrollWidth = 폭, 버튼 375·320 높이 44 · 768·1280 높이 22 · 한 줄. 확인 모달 안(결과 줄 둘 · 실패 줄)은 브라우저로 재지 못함(E2E erp_test에는 시스템 관리자가 늘 여럿이라 버튼이 없다) — /qa 몫
