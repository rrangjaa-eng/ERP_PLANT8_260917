# 권한표·정보 노출표 PC 행·열 뒤집기 — 점검표
화면: ui/permission-grid/, app/(app)/admin/permissions/, app/(app)/admin/visibility/
기준: BRIEF.md · frontend.md 화면 사용성 원칙 · CHECKLIST.md §1 · SYSTEM.md §7-13

## 원칙
- [x] 안내 문구: 화면의 모든 설명문을 셌다. 남긴 것은 오류·되돌릴 수 없는 일·잠김뿐이고 명사형 한 줄이다 — 근거: 새 문구는 모서리 칸 「메뉴」·「정보 항목」(머리글 이름)뿐, 설명문 추가 없음. 오류 한 줄·토스트는 기존 그대로.
- [x] 결정 최소: 알 수 있는 값은 기본값으로 채웠고, 시스템이 계산할 것을 묻지 않는다 — 근거: 사용자 입력 추가 없음. 즉시 저장·전체 선택(indeterminate 계산) 그대로.
- [x] 할 수 없는 선택지는 숨기거나 비활성화했다 — 근거: 서버가 안 보낸 항목은 처음부터 행이 없다(기존 규칙 유지). 계급 단위 전체 선택은 만들지 않았다.
- [x] 주 버튼 하나: 이 화면의 다음 행동이 주 버튼 하나로 보인다 — 근거: 이 화면은 버튼 없는 체크박스 격자(즉시 저장), 해당 없음 — 변경 없음.
- [x] 위험한 동작(삭제 등)은 떨어뜨려 두고 위험 색이다 — 근거: 삭제 동작 없음. 실패 셀 inset 오류선은 기존 `--inset-error` 그대로.
- [x] 같은 말을 두 번 하지 않는다(라벨과 칸 안 글자, 태그와 줄 등) — 근거: 메뉴 이름은 그룹 줄에서 한 번만, 동작 행에는 동작 이름만 쓴다.
- [x] 빈 화면은 설명보다 첫 행동 버튼이 먼저다 — 근거: 시드 계급·항목이 항상 있어 빈 상태 없음(SYSTEM §7-13 EMPTY 해당 없음), 변경 없음.
- [x] 키보드만으로 끝난다(표는 엑셀 키 구성) — 근거: 네이티브 체크박스 Tab/Space 유지. Tab 순서가 행 우선이 되는 것은 의도(SYSTEM §7-13 키보드 절에 기록).
- [x] 같은 종류의 행동은 같은 모양이다(링크·버튼 섞지 않음) — 근거: 셀·전체 선택 모두 기존과 같은 체크박스 모양.

## 사용자 결정(§1)
- [x] §1의 결정을 하나도 어기지 않았다(웜톤 · 견적 엑셀식 · 옆 패널 · 스킨 A …) — 근거: 스킨 A의 1px 선 + 옅은 초록 그룹 줄(`--surface-group`)을 §7-3 그룹 줄 토큰 그대로 썼다. 폰(계급 select + KvList, 2026-10-03 「계급·코드표 폰에서 읽기」와 무관한 권한표 폰 구조)은 건드리지 않았다. 이번 뒤집기는 2026-10-05 DECISIONS에 기록했다(사용자 11:21 KST 지적 + 선택 카드).

## 시스템
- [x] 새 색·서체·radius·그림자를 만들지 않았다(tokens.css 변수만) — 근거: CSS는 `--surface-group`·`--text-group`·`--surface-selected`·`--s-*`·`--text-aux` 등 기존 변수만, 13px 미만 글자 없음(`--text-aux`).
- [x] 폰 320에서 가로 넘침 없음 · 터치 44px — 근거: 폰 렌더(`.mobileOnly`)는 코드·CSS 변경 없음. PC 격자는 700 미만에서 `display: none` 그대로.
- [x] 실제 앱 화면(PC 1280 · 폰 390)을 찍어 보고 확인했다 — 스크린샷 경로: /mnt/project-files/notes/perm-grid-scroll/after/ (CI=true 빌드 화면 측정, 아래 DOM 실측으로 판정)

## DOM 감사 지적 반영(D1~D4, PR #166 독립 DOM 감사)
- [x] 계급 열 같은 폭(D1): `.colHeader` 폭을 `--s-12`×2(96px)로 같게 두고 남는 폭은 폭 없는 행 머리글 열이 갖는다 — auto 레이아웃 유지(table-layout: fixed는 좁은 폭에서 줄어들지 못해 700~768 가로 넘침이 생기므로 택하지 않음), 최소 폭 `--s-8 + --cell-pad-x×2`, 이름은 줄바꿈 허용. 근거: E2E 계급 th 폭 편차 ≤1px(1280·768) + 기존 가로 넘침 0 스펙 통과, 새 토큰 없음.
- [x] 셀 전체 클릭(D2, §7-13): label이 td를 채운다(`width: 100%; min-height: var(--s-8)`). 근거: E2E에서 td 오른쪽 끝 −3px 클릭이 체크박스를 토글.
- [x] 그룹 줄 선 0(D3, §7-3): `.table .groupHeader { border-bottom: 0 }`. 근거: Table.module.css 그룹 줄과 같은 값, after 측정에서 border-bottom 0px 확인.
- [x] 전체 선택 체크박스 32×32(D4, §3): 체크박스만 label로 감쌌다(항목 이름은 제외 — 이름 클릭으로 전 계급이 바뀌는 사고 방지). 근거: E2E 감싼 요소 ≥32×32.

## 행 높이 · 표 면 맞춤(Codex 디자인 검토 지적 1~8, 스레드 선택 카드 추천안)
- [x] 항목 행 44px(§3 `--row-h`)·머리 행·그룹 줄 안쪽 여백이 §7-3 표와 같다 — 근거: Table.module.css `.cell`(height `--row-h`)·`.headerCell`(`--s-3`)·`.groupHeader`(`--s-2` `--s-4`)와 같은 토큰으로 맞춤. 고치기 전 DOM 실측 tr 41/29px, E2E 「항목 행 높이 44」 RED → GREEN, after 실측은 /mnt/project-files/notes/perm-grid-scroll/after/.
- [x] 표 면이 §7-3 표와 같다(흰 면 + 1px 선 + r8) — 근거: `.wrap`에 `--surface-base`·`--border-surface`·`--radius-surface`·`--shadow-surface`, E2E가 /admin/people 표 면의 computed 값(테두리·radius·배경·그림자)과 같음을 비교. 고치기 전 border 0.
- [x] 새 색·토큰·radius 없음, 13px 미만 없음, sticky·모서리 충돌 없음 — 근거: tokens.css 변수만, `.wrap`이 스크롤 컨테이너라 overflow: auto가 둥근 모서리를 자르고 sticky 기준 불변, 기존 sticky 회귀 E2E·가로 넘침 0 E2E 통과.

## /review·Codex 2회차 지적 반영(그룹별 tbody · 첫 칸 여백 · 셀 세로 클릭)
- [x] 그룹 하나 = `<tbody>` 하나, `scope="rowgroup"`은 제 그룹만 덮는다 — 근거: Table.tsx 그룹 구조와 같게 바꿨고 E2E 「그룹마다 tbody」 RED(tbody 1개) → GREEN.
- [x] 첫 칸 왼쪽 `--s-4`(16px)가 §7-3 표 첫 칸(Table.module.css .cell:first-child)과 같다 — 근거: `.rowHeader`·`.corner` padding-left, E2E가 computed 16px 확인.
- [x] 셀 전체 세로 클릭(label min-height `--row-h`)·긴 계급 이름 줄바꿈(`overflow-wrap: anywhere`) — 근거: 새 토큰 없음, E2E 폭 700 가로 넘침 0 추가, after 측정은 /mnt/project-files/notes/perm-grid-scroll/after/.

## 면을 내용 폭에 맞춤(1280 이름–체크박스 거리)
- [x] 1280에서 항목 이름과 첫 체크박스 사이가 200px 이하다 — 근거: 고치기 전 E2E 실측 693.8px RED → `.wrap` `width: fit-content; max-width: 100%` 뒤 GREEN(권한표·정보 노출표), 같은 스펙의 가로 넘침 0(700·768·1280)·표 면 비교·행 높이 44 함께 통과(20 passed).
- [x] 시스템 이탈은 DECISIONS 먼저 — 근거: DECISIONS 2026-10-05 하위 결정 「면을 내용 폭에 맞춤」 기록 뒤 SYSTEM §4 제외 목록·§7-13 수정, 새 토큰 없음. after 측정 /mnt/project-files/notes/perm-grid-scroll/after/(CI=true).
