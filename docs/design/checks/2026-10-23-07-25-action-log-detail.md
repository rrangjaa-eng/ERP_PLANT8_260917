# 07-25 행동 로그 상세 칸 · 폰 행 탭 시트 — 점검표
화면: app/(app)/admin/action-log/
기준: BRIEF.md · frontend.md 화면 사용성 원칙 · CHECKLIST.md §1 · SYSTEM.md §6-1(07 보강 개정 9) · §7-3(폰 행 두 줄 · 행 탭 시트)

지금 화면(고치기 전): `상세` 칸이 `JSON.stringify(row.detail)` 원문이라 읽을 수 없고, 폰은 `StaticTable` 접힌 줄에 원문이 그대로 들어간다.

고칠 계획: 서버 페이지가 `detailLines`(바뀐 칸 전부)로 줄 글자만 만들어 클라이언트 표(`Table` + `onRowTap` → `RowSheet`)에 넘긴다. 표 칸은 앞 3줄 + 3차 `외 N칸`, 폰은 접힌 줄 첫 요소 = 상세 첫 줄, 행 탭 시트에 바뀐 칸 전부. 민감 칸은 `····1234` / `바뀜`, `changes` 없음은 `—`. 새 부품 없음(기존 `Table` · `RowSheet` · `Button` tertiary).

## 원칙
- [x] 안내 문구: 화면의 모든 설명문을 셌다. 남긴 것은 오류·되돌릴 수 없는 일·잠김뿐이고 명사형 한 줄이다 — 근거: 새 글자는 `{칸 이름} · {이전} → {이후}` 줄 · `외 N칸` · `접기` · `바뀜` · `—`뿐이고 설명문 0(DetailCell · action-log-table 코드 전수).
- [x] 결정 최소: 알 수 있는 값은 기본값으로 채웠고, 시스템이 계산할 것을 묻지 않는다 — 근거: 사용자 입력 없는 읽기 화면. 칸 이름 · 값 글자는 서버가 정한다(detailLines).
- [x] 할 수 없는 선택지는 숨기거나 비활성화했다 — 근거: 줄이 3개 이하면 `외 N칸` 단추를 그리지 않는다(DetailCell `rest > 0`). 수정 · 삭제 단추 없음(불변 로그).
- [x] 주 버튼 하나: 이 화면의 다음 행동이 주 버튼 하나로 보인다 — 근거: 이 변경은 1차 단추를 만들지 않는다. 새 단추는 3차(tertiary) `외 N칸` 하나뿐이고 기존 `Excel 내보내기`/`정리` 줄은 그대로.
- [x] 위험한 동작(삭제 등)은 떨어뜨려 두고 위험 색이다 — 근거: 이 변경에 위험 동작 없음(`정리`는 바뀌지 않음).
- [x] 같은 말을 두 번 하지 않는다(라벨과 칸 안 글자, 태그와 줄 등) — 근거: 폰 접힌 줄은 상세 첫 줄 하나만 두고(summary) 나머지는 시트가 보인다. 시트는 행위자 · 대상을 한 번씩만(DOM 실측 sheetDt 9개 서로 다름).
- [x] 빈 화면은 설명보다 첫 행동 버튼이 먼저다 — 근거: EMPTY(`ListEmpty` + `필터 지우기`)는 이 변경 밖에서 그대로.
- [x] 키보드만으로 끝난다(표는 엑셀 키 구성) — 근거: `외 N칸`은 네이티브 button(Tab · Enter · Space), 폰 행 트리거는 Table의 role=button td(Enter · Space). E2E: 펼친 뒤 `toBeFocused`, 시트 Escape 뒤 행 트리거 `toBeFocused`(desktop 10 · mobile-375 2 통과).
- [x] 같은 종류의 행동은 같은 모양이다(링크·버튼 섞지 않음) — 근거: `외 N칸`은 기존 `Button variant="tertiary"`(3차 밑줄 글자). 시트는 다른 목록(card-usage-list)과 같은 `RowSheet`.

## 사용자 결정(§1)
- [x] §1의 결정을 하나도 어기지 않았다(웜톤 · 견적 엑셀식 · 옆 패널 · 스킨 A …) — 근거: 색 · 면을 건드리지 않았고 읽기 표라 입력 · 패널 결정과 무관. 표 면은 `Table` 그대로(스킨 A).

## 시스템
- [x] 새 색·서체·radius·그림자를 만들지 않았다(tokens.css 변수만) — 근거: action-log.module.css 추가 규칙 3개(`.detailLines` 목록 초기화 · `.detailFirst` overflow-wrap · `.nowrapHeader` white-space) 모두 색 · 서체 · radius 값 0. stylelint 통과.
- [x] 폰 320에서 가로 넘침 없음 · 터치 44px — 근거: DOM 실측(CI=true 프로덕션 빌드 · /home/user/wt/logs/07-25/dom-audit.json) 가로 넘침 1280/768/375/320 모두 0, 폰 접힌 줄 트리거 높이 51px(>=44) · 시트 가로 넘침 0.
- [x] 실제 앱 화면(PC 1280 · 폰 390)을 찍어 보고 확인했다 — 스크린샷 경로: /home/user/wt/logs/07-25/dom-1280.png · dom-768.png · dom-375.png · dom-320.png · dom-375-sheet.png · dom-320-sheet.png(판정은 DOM 실측, 스크린샷은 기록용).

## 독립 DOM 감사 고침 (2026-10-23, 감사 `.planning/phases/07-schedule-notify-audit/audit/07-25-dom-audit.md`)
화면: app/(app)/admin/action-log/
- [x] P1 키보드: 문서 번호 칸은 값이 바뀐 채 떠날 때만 제출한다 — 근거: 맨 위에서 Tab만으로 표까지 1280/768 24회 · 375/320 19회, 그 사이 문서 새로 불러짐 0(DOM 실측 `logs/07-25/audit2/audit.json`), E2E desktop·mobile-375 통과.
- [x] P2 시간: 발생 시각을 KST로 보인다(`kstDateTimeOf`, 기간 필터와 같은 시간대) — 근거: UTC 10-22 15:30 행이 표·시트 부제에서 `2026-10-23 00:30`. 새 글자 형식 없음(보관함과 같은 `YYYY-MM-DD HH:mm`).
- [x] P2 줄 순서: 칸 이름 표 선언 순서 → 표에 없는 키는 키 사전 순 — 근거: 오케스트레이터 결정으로 SC-08 순서 공백을 메운 것이며 되돌릴 수 있다(`detail-lines.ts` `compareFields` 한 곳). 단위 시험 3건 + E2E 앞 3줄 순서.
- [x] P3 같은 말을 두 번 하지 않는다: 없음 → 없음 줄은 표 칸 · 시트 · `외 N칸` 개수에서 함께 뺀다 — 근거: 줄 함수 한 곳에서 걸러 표와 시트가 같은 목록을 쓴다(단위 3건 · DOM: 표 1줄·단추 0 / 시트 dt 5개).
- [x] 새 색·서체·radius·클래스 없음 — 근거: CSS 변경 0, 토큰 밖 계산값 0(재실측).
