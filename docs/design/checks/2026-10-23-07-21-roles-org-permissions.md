# 07-21 계급 · 조직 · 권한표 — 위임자 범위 칸 · 사람 남은 보관 막기 · 딸린 권한 칸 — 점검표
화면: app/(app)/admin/people/roles/, app/(app)/admin/people/org/, app/(app)/admin/people/page.tsx, app/(app)/admin/people/people.module.css, ui/row-actions/, app/(app)/admin/permissions/, ui/permission-grid/
기준: BRIEF.md · frontend.md 화면 사용성 원칙 · CHECKLIST.md §1 · SYSTEM.md §7-3 · §7-8 · §7-13(개정 8 · 개정 10) · §10 · UI-SPEC SC-09 · SC-10 · SC-13 · SC-15(배정분) · 07-21 K4 · K14 · K15 · K24 · N4 · N10

지금 화면(고치기 전):
- 계급(Task 1): 위임자(`admin.people` 쓰기 · `admin.permissions` 쓰기 없음)의 계급 표에 상한 밖 줄(시스템 관리자 · 대표 · 범위가 넓은 계급)의 이름 입력 · 업무 범위 · 보는 범위 select · `삭제`가 그대로 열려 있다. 고르거나 누르면 서버(06.4 · 07-15)가 `계급 지정 권한 없음 · 시스템 관리자`로 거부해 값이 되돌아간다. 상한 안 줄 select도 네 값(전사 · 본부 · 팀 · 본인)을 다 보이고, 위 값은 거부된다. 표 위 잠김 한 줄이 없다.
- 계급 · 조직(Task 2): 사람이 남은 계급 · 팀 · 본부에도 `삭제`가 열려 있다. 계급은 두 단계 확인 뒤 서버 거부 문구가 실패 줄에 뜬다. 팀 · 본부는 서버가 소속을 세지 않아 사람이 남은 채 보관된다. 몇 명이 남았는지, 누구인지 화면이 알려 주지 않는다. 팀 추가 패널의 본부 select가 `ui/` 밖 네이티브 select다(SC-15).
- 권한표(Task 3): `쓰기`를 켜도 서버(07-15)가 같이 켠 `보기`는 새로 고치기 전까지 꺼진 채 보인다(F8 — 액션이 `changed`를 버림). 무엇이 같이 바뀌었는지, 되돌릴 길이 무엇인지 화면이 알려 주지 않는다. 저장 중에 같은 칸을 다시 누르면 요청이 또 간다.

진행: Task 1(위임자 계급 표) · Task 2(사람 남은 계급 · 팀 · 본부 `삭제` 비활성 + 이유 줄 `소속 {N}명`, `{N}명`은 사람 목록 필터 링크) · Task 3(권한표 딸린 칸 — 저장 중 `--surface-dirty` 면 · 표 위 결과 줄 `{메뉴} · 보기도 켬` / `{메뉴} · 쓰기·승인도 끔` + `되돌리기`) 기준으로 확인.

## SC-15 제외 표(N10 — `ui/` 밖 네이티브 입력으로 남기는 자리)
| 파일:줄 | 요소 | 이유 |
|---|---|---|
| app/(app)/admin/people/roles/roles-client.tsx:59 | 계급 이름 입력(`{계급} 이름`, 줄 안 blur 칸) | 계급 표 안 셀 입력 — SC-15 「표 안 셀 입력」 제외(`TextField`는 보이는 라벨이 필수라 셀에 못 씀) |
| app/(app)/admin/people/roles/roles-client.tsx:91 | 업무 범위 select | 표 안 셀 — 같은 제외 |
| app/(app)/admin/people/roles/roles-client.tsx:138 | 보는 범위 select | 표 안 셀 — 같은 제외 |
| app/(app)/admin/people/org/org-client.tsx:49 | 본부 · 팀 이름 입력(`RenameInput`, 줄 안 blur 칸) | 계층 목록 줄 안 셀 입력 — 같은 제외(보이는 라벨 없이 줄 이름 자체가 값) |
| app/(app)/admin/people/page.tsx:165 | 사람 목록 검색 입력 | 07-21이 바꾸지 않은 기존 필터 줄 — 배정 밖(07-21은 숨은 필터 값 입력 :178만 더함, 숨은 입력은 SC-15 대상 아님) |

팀 추가 패널 본부 select는 `ui/select` `Select`(`Form.Field` 라벨 `본부`)로 바꿨다 — 네이티브 select가 0이다(org-client.tsx `team-org-unit-id`).

## 원칙
- [x] 안내 문구: 화면의 모든 설명문을 셌다. 남긴 것은 오류·되돌릴 수 없는 일·잠김뿐이고 명사형 한 줄이다 — 근거: Task 3 결과 줄은 결과 명사형 한 줄 + `되돌리기`이고 딸려 바뀐 칸이 없으면 없다. 토스트는 없다(E2E 「토스트 없음」) — 실패 토스트는 §7-13 기존 그대로. Task 1은 잠김 한 줄 `계급 지정 권한 없음 · 시스템 관리자`(SYSTEM 개정 10 정본, `Form.Hint`) 하나만 더했다. Task 2는 `삭제` 옆 이유 한 줄 `소속 {N}명 · 먼저 다른 계급으로 옮기기`(계급) / `소속 {N}명 · 먼저 옮기기`(팀 · 본부)만 더했다 — 막힌 동작의 이유라 잠김 범주. 사람 목록 필터 표시는 값 글자 `계급 · {이름}` 하나다(shots/t23-*)
- [x] 결정 최소: 알 수 있는 값은 기본값으로 채웠고, 시스템이 계산할 것을 묻지 않는다 — 근거: 고를 값이 하나뿐인 범위 칸은 select 없이 저장값 글자다. 소속 수는 서버가 센다(`roleMemberCounts` · `orgMemberCounts` = 서버 거부 술어 = 사람 목록 필터 술어, 통합 org-archive-members 「숫자 = 거부 = 필터 total」). `{N}명`을 누르면 옮길 사람 목록이 이미 걸러져 열린다. 권한표 딸린 칸은 시스템이 같이 켜고 끄며, 서버 `changed`가 최종이다. 사용자는 칸을 하나씩 맞추지 않는다
- [x] 할 수 없는 선택지는 숨기거나 비활성화했다 — 근거: 상한 밖 줄은 입력 · select · `삭제`를 그리지 않는다. 사람 남은 계급 · 팀 · 본부 `삭제`는 `RowAction disabled` + 이유(aria-disabled · aria-describedby, 창을 열지 않음 — E2E roles 「소속 남은 계급 보관 막기」 · org 2건 녹색). 경합으로 뒤늦게 막히면 서버 문구 `소속 N명 · 먼저 옮기기`가 기존 실패 줄에 실린다. 권한표 저장 중 칸은 aria-busy · aria-disabled이고 누름을 무시한다(E2E 두 번 눌러도 요청 1회)
- [x] 주 버튼 하나: 이 화면의 다음 행동이 주 버튼 하나로 보인다 — 근거: 계급 · 조직 모두 1차는 기존 `계급 추가` / `본부 추가` 하나 그대로다(shots t1-* · t23-*-1280). 권한표는 1차가 없고 `되돌리기`는 3차 글자다(shots t23-admin-permissions-linked-1280)
- [x] 위험한 동작(삭제 등)은 떨어뜨려 두고 위험 색이다 — 근거: `삭제`는 기존 RowActions 위험 색 그대로다. 비활성 이유는 감사 수정으로 `reasonTone="info"` = `--text-muted`(UI-SPEC SC-09 · SC-13)다
- [x] 같은 말을 두 번 하지 않는다(라벨과 칸 안 글자, 태그와 줄 등) — 근거: 잠김 이유는 표 위 한 번이다(E2E가 정확히 하나를 확인). 소속 이유는 그 줄 `삭제` 옆 한 번이고, 숫자는 링크 글자 하나다. 권한표 결과 줄은 표 위 한 곳이다 — 칸 · 토스트에서 다시 말하지 않는다
- [x] 빈 화면은 설명보다 첫 행동 버튼이 먼저다 — 근거: 계급 · 조직 빈 화면은 기존 그대로다. 필터 결과 0명이면 사람 목록 기존 EMPTY `조건에 맞는 사람이 없습니다` + `필터 지우기`다
- [x] 키보드만으로 끝난다(표는 엑셀 키 구성) — 근거: 글자가 된 칸은 탭 정지점이 없다. 비활성 `삭제`는 aria-disabled 버튼이라 Tab으로 닿고 이유를 읽는다. `{N}명` 링크는 Tab → Enter로 사람 목록에 간다. 권한표 결과 줄 `되돌리기`는 Tab으로 닿는 버튼이다
- [x] 같은 종류의 행동은 같은 모양이다(링크·버튼 섞지 않음) — 근거: 이동(`{N}명` → 사람 목록)은 링크, 동작(`삭제`)은 버튼으로 기존 RowAction 규약 그대로다. 결과 줄 `되돌리기`도 휴일 삭제 결과 줄과 같은 RowAction이다

## 사용자 결정(§1)
- [x] §1의 결정을 하나도 어기지 않았다(웜톤 · 견적 엑셀식 · 옆 패널 · 스킨 A …) — 근거: 계급 · 코드표 폰 읽기만(2026-10-03) 그대로다 — 잠김 줄은 `PcOnly`라 폰에 없다(E2E 375 녹색). 팀 추가는 옆 패널 그대로다. 조직 폰 중복 줄 「더보기」(2026-10-13) 그대로다(E2E mobile-org 녹색)

## 시스템
- [x] 새 색·서체·radius·그림자를 만들지 않았다(tokens.css 변수만) — 근거: people.module.css `.ceilingHint`는 `margin: 0 0 var(--s-2)` 하나다. `.panelSelect` · `.selectInvalid`는 지웠다(ui `Select`로 대체). RowActions.module.css 폰 규칙은 `--touch-min`만 쓴다. PermissionGrid `.dirty`는 기존 토큰 `--surface-dirty`, `.resultLine`은 `--text-aux` · `--text-muted` · `--s-2` · `--s-3`(실측 13px · rgb(82, 97, 92))만 쓴다
- [x] 폰 320에서 가로 넘침 없음 · 터치 44px — 근거: 실측 scrollWidth − clientWidth = 0이다(Task 1 t1-shots.log, Task 2 t3-e2e-1.log `SHOT` 줄). 폰에서는 이유 줄이 버튼 아래로 줄바꿈하고 `{N}명` 링크는 44×44다(E2E mobile-org 「행동 44」 · mobile-320-no-overflow 녹색). 판정은 독립 DOM 감사가 다시 잰다
- [x] 실제 앱 화면(PC 1280 · 폰 390)을 찍어 보고 확인했다 — 스크린샷 경로: /home/user/wt/logs/07-21/shots/t1-{deleg,admin}-admin-people-roles-{1280,768,375,320}.png · t23-{deleg,admin}-{admin-people-roles,admin-people-org,admin-people-role-role-pm}-{1280,768,375,320}.png · t23-admin-permissions-linked-{1280,768}.png · t3-admin-permissions-linked-{1280,768,375,320}.png(CI=true 프로덕션 빌드)

## 독립 DOM 감사 수정(0721-dom-audit P2 #1~#5 · P3 #7 · Q4a)
화면 범위 추가: ui/row-actions/, ui/permission-grid/, app/(app)/admin/people/roles/, app/(app)/admin/people/org/

지금 화면(고치기 전): 이유 줄 `{N}명` 링크가 브라우저 기본 파랑 rgb(0,0,238) · 글자가 `--status-danger`(UI-SPEC은 `--text-muted`) · 계급 폰 이유 줄 세 줄(83px) · 폰 권한표 결과 줄이 표 위에만 있어 아래 칸을 켜면 화면 −4593px · 폰 칸에 저장 중 면 없음 · 결과 줄 끔 방향 `쓰기·승인도 끔`이 묶음 이름 `·`와 겹치고 없는 승인을 말함.

- [x] 안내 문구: 새 문구 없음. 결과 줄만 바꿨다 — `{묶음}: {실제 바뀐 동작}도 켬/끔`. 근거: 묶음 이름 안 `·`와 구분자가 겹치지 않게 구분자를 `:`로, 동작은 서버 `changed`에서 실제 바뀐 칸 이름(보기 · 쓰기 · 승인)만 쓴다(E2E permissions-grid 「거래처, 거래처 계좌 · 서류 수정: 쓰기도 끔」)
- [x] 결정 최소 · 할 수 없는 선택지 · 주 버튼 하나 · 위험 동작 · 같은 말 두 번 · 빈 화면: 바뀌지 않음. 근거: 요소 추가 0, 클래스 값 · 한 모양 추가만(`RowAction` `reasonTone="info"` 하나)
- [x] 키보드: 결과 줄 `되돌리기`는 main 안 Tab 순서에서 표 앞이라 문서 처음부터 Tab이면 첫 정지점(감사 #5). 저장소 `ui/`에 되돌리기 단축키(Ctrl+Z) 선례가 없어 새 단축키를 만들지 않았다 — 근거: grep `ctrl.*z|undo` ui/ 결과가 휴일 삭제 결과 줄(`autoFocus` 되돌리기) 하나뿐
- [x] 같은 종류의 행동은 같은 모양: 비활성 이유의 `{N}명` 링크는 다른 행동 링크와 같은 `--text-link`. 근거: RowActions.module.css `.reason a`
- [x] §1 사용자 결정: 어기지 않음. 근거: 계급 · 코드표 폰 읽기만(2026-10-03) 그대로, 조직 폰 줄 그대로
- [x] 새 색·서체·radius·그림자 없음 — 근거: `--text-link` · `--text-muted` · `--surface-dirty` · `--inset-error` 기존 토큰만(computed color 단언이 토큰 값과 같다 — mobile-07-21-dom-fixes.spec.ts)
- [x] 폰 320 가로 넘침 없음 · 터치 44px — 근거: 같은 스펙 375 · 320에서 scrollWidth − clientWidth ≤ 0, `{N}명` 링크 ≥ 44×44, 이유 줄 높이 ≤ 70px(계급 폰은 행 아래 전폭 줄)
- [x] 실제 앱 화면 측정 — 근거: CI=true 프로덕션 빌드의 E2E DOM 실측(getBoundingClientRect · getComputedStyle). 스크린샷 육안 판정은 하지 않았다
