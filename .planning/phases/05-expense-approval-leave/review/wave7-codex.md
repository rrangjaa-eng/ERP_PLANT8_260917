# Codex 디자인 검토 — 웨이브 7 (05-15)

> Codex 지적은 후보다 — 결함 판정은 DOM 실측으로만 한다(CLAUDE.md §6 스크린샷 육안 판정 금지).

- Codex 실행: 완료(exit 0) · diff 기준 `a80f0e74...HEAD`(웨이브 6 수정 뒤) · 계획 `05-15-PLAN.md`
- 경로: `/dev/components` · `/admin/vendors` · `/projects` — 캡처 하네스가 시드 없이 닿는 경로뿐이라 05-15 화면(`/projects/[id]` 견적 줄 표 · 폰 행 시트 · 이전 차수 읽기 표)은 아래 시드 상태 캡처로 따로 쟀다
- 산출물: `test-results/codex-design-review/20261004-143031-5519`(사본: 노트 `05-review/wave7/branch-codex/`) · 원문 사본 `05-review/wave7/wave7-codex-raw.md`

## 지적 후보

| # | 경로 | 폭 | 지적 | 실측 확인 |
|---|---|---|---|---|
| C1 | /admin/vendors | 320 | 목록 머리 1차 0개, 등록은 빈 화면 2차뿐 | 빈 목록 — SYSTEM §7-20 :1271(DR5 A) 빈 목록이면 머리 1차를 숨기고 빈 화면 버튼이 맡는다. 웨이브 6 C1과 같고 이 묶음이 바꾸지 않은 경로 → **NOT-A-DEFECT** |
| C2 | /admin/vendors | 1280 | C1과 같음 | **NOT-A-DEFECT** |
| C3 | /projects | 320 | 목록 머리 1차 0개, 본문 「거래처 등록」뿐 | 빈 목록 + 거래처 0개 — `app/(app)/projects/create-entry.ts:21`이 선행 단계 `거래처 등록`(93×44)을 빈 화면 행동으로 낸다(DR5 A · UX-06 선행 단계). 이 묶음 diff 밖 → **NOT-A-DEFECT** |
| C4 | /projects | 1280 | C3과 같음 | **NOT-A-DEFECT** |
| C5 | /dev/components | 320 | 비활성 버튼 이유 `권한 없음 · 담당에게 요청`에 다음 한 수 3차 없음 | 개발용 견본 화면(제품 화면 아님), 「담당에게 요청」은 앱 안 행동이 없어 3차가 설 자리가 없다. diff 밖 → **NOT-A-DEFECT** |
| C6 | /dev/components | 1280 | 견본 오류 셀 이유가 `숫자 입력` 한 조각 | 개발용 견본 글자, diff 밖 → **NOT-A-DEFECT** |

## 웨이브 7(05-15) 판정 — 2026-10-04, DOM 실측만

브랜치 f7ed6157 · 웨이브 6 a80f0e74, 둘 다 `CI=true` 프로덕션 빌드, 375×667 · 320×568 · 768×1024 · 1280×900. 시드 상태: 견적 줄 표(지출결의 중 · 반려 · 미착수 · 취소 · 거래처 없음 · 열기 · 올리기) · 만들기 실패 · 누름 중 · 저장 안 한 편집 · 거래처 고르기 · `Ctrl+E` · 2차 고객 승인 전(표 전체 게이트) · 이전 차수 1차 읽기 표 · 폰 행 시트 다섯 줄. 웨이브 6 하네스(05-05 폼 · 문서 · 결재 시트)도 다시 돌려 D1–D6 회귀를 봤다. 증거: 노트 `05-review/wave7/`(README · measurements-summary.txt · measurements-w6-summary.txt).

| # | 판정 | 화면 · 폭 | 실측 | 원인 | 고칠 방향 |
|---|---|---|---|---|---|
| D1 | DEFECT(판단 필요) | 견적 줄 표, 2차 고객 승인 전, 4폭 | 1차에서 제출된 줄의 2차 행: 상태 `지출결의 중`인데 행동 셀 빈 칸(UI-SPEC S1 :348 「`지출결의 열기`는 그대로 선다」). 웨이브 6 판(게이트 없음)에서 같은 줄은 `지출결의 올리기` — 고객 승인 뒤 브랜치도 그렇게 된다 | 문 판정이 줄 id 일치만 본다 — `domain/expenses/index.ts:700,703`(`listNumberedByLines` · `doorFor`)와 만들기 `:420`. 상태 · D-66은 계보로 따라온다(`domain/quotes/lines.ts:289` `resolveLinkedDocumentsByLineage`) | 문 판정 · 만들기 확인도 같은 계보 결과로(새 차수 줄의 이전 차수 제출 문서 = 문 닫힘). 계보를 따를지는 D-54 · D-66 결정 확인 뒤 |
| D2 | DEFECT(05-05부터) | 견적 줄 표 768 · 1280, 누름 중 | 누른 버튼 `지출결의 올리기…` 91×21(평소 80) → 행동 열 104→115(768) · 127→132(1280), 왼쪽 열 전부 이동(항목 191→189, th 행동 x 1132→1127). 웨이브 6 판도 104→115 | `ui/row-actions/RowActions.tsx:92` 대기 때만 `…`를 덧붙임 + 행동 열 폭 = 평소 글자(UI-SPEC S1 :334) | 평소에도 `…` 자리를 `visibility:hidden`으로 잡아 두거나, 행동 열 최소 폭을 대기 글자로 |
| D3 | DEFECT(접근성) | 견적 줄 표 768 · 1280 | `지출결의 열기` 링크 aria-describedby 없음(1280 2/2, 768 2/2), `tabindex=-1` — 같은 이름 링크가 줄마다. 버튼 · `거래처 고르기`는 그 줄 항목 칸을 가리킴 | `quote-table.tsx:2058` 링크에 안 넘김, `RowActions.tsx:29` `LinkAction`이 `describedBy?: never` — 05-15 truth 31 「셀의 3차는 … aria-describedby가 그 줄 항목 칸」 | `LinkAction`에 `describedBy` 허용 + `itemCellId` 전달 |
| D4 | DEFECT(다듬기) | 같은 화면 이전 차수 읽기 표, 4폭 | 상태 칸 `미착수` 14px(PC) · 15px(폰) · 400 · 본문색(rgb 19,32,28) 맨 글자, 현재 표는 `StatusTag text` 11px · 600 · `--status-muted` — 한 화면 같은 열 두 모양 | `app/(app)/projects/[id]/previous-revision.tsx:115` `lineStatusLabel` 문자열 — SYSTEM §7-5 :944 「표 상태 열은 색 글자만(`variant="text"`)」. 05-15-PLAN :292가 기록만 하고 둠 | `StatusTag variant="text"` + 낱말(`lineStatusWord({ lineStatus, linkedStatus: null })` — 파생은 넣지 않음) |

기대대로(E): E1 모든 상태 · 폭 가로 넘침 0 · 표 스크롤 0, 쓰인 색 · radius · 서체 · 글자 크기 전부 tokens.css 값. E2 상태 열 `StatusTag text` 11px 600 배경 · 테두리 없음 — `지출결의 중` rgb(0,84,70) accent · `반려` rgb(155,28,28) danger · `미착수` · `취소` rgb(82,97,92) muted, 상태 열 45→65(nowrap). E3 행동 셀 갈래: 올리기 버튼 80×21 · 열기 링크 69×20 · 거래처 없음 13px danger nowrap + 1280에만 `거래처 고르기` 69×21(두 조각 사이에서 꺾임, 1280 행동 열 104→127은 이 셀) · 768은 글자만 · 취소 줄 빈 칸, 모든 셀 3차 `tabindex=-1`. E4 실패 · 미저장 한 줄은 합계 행(tfoot colspan) 안, 실패 전후 행동 열 127 · 104 그대로(웨이브 6 D3 유지). E5 누름 중 나머지 `지출결의 올리기` aria-disabled=true(`--text-faint`). E6 미저장 편집 1칸에서 누르면 주소 그대로 + `저장 안 한 편집 1칸 · 먼저 일괄 저장`(웨이브 6 판은 폼으로 이동). E7 `Ctrl+E`(항목 칸) → `/expenses/{id}`(웨이브 6 판은 이동 없음). E8 `거래처 고르기` → 그 줄 거래처 `select`에 포커스. E9 힌트 줄 1280 한 줄(높이 21) kbd 7 · 끝 `지출결의 올리기 Ctrl+E` · 복사 · 붙여넣기 하나로 합침 · 13px `--text-faint`. E10 표 위 한 줄 `2차 고객 승인 전 · 고객 승인 표시` 하나(lockLine 13px muted, 4폭), 올리기 버튼 0개. E11 폰 행 시트 `상태` 값 StatusTag text(지출결의 중 · 반려 · 취소 · 미착수 색 위와 같음), 3차 96×44 · 109×44, 닫기 44×44. E12 웨이브 6 회귀 없음: D1 썸네일 48×48 radius 0 · D2 빈 첨부 13px · D3 실패 전후 행동 열 폭 같음 · D4 버튼 describedby = 항목 칸 · D5 프로젝트 링크 높이 44(375 · 320) · D6 분할 지급 체크 44×44(375 · 320).

참고(N): N1 `test/e2e/quote-revisions.spec.ts:715-716`(실패 위치 675행 테스트)은 현재 표 머리글 = 읽기 표 머리글을 단언하는데, UI-SPEC S1 :350 「이전 차수 표(차수 섹션)에는 행동 열이 없다」 · :334 숨긴 머리글 `행동`이 정본이고 실측도 읽기 표 머리글 11개(행동 없음) · 현재 표 12개 → **제품 결함 아님, 테스트 기대가 낡음**(05-05부터 — 웨이브 6 판도 현재 표에 `행동`). 고칠 방향: 비교에서 현재 표 마지막 숨긴 머리글 `행동`을 빼고 단언. N2 누름 중 `거래처 고르기`는 aria-disabled가 아님(서버 요청 없는 셀 이동이라 판정 보류). N3 표 전체 게이트 줄 색은 Phase 4 lockLine(muted) 그대로 — Copywriting :293가 Phase 4 계약 그대로라 함. N4 폰 시트의 게이트 글자 · 합계 행 실패 글자의 글자색은 별도로 재지 않음(Table footer notice · `doorNote`는 이 묶음이 바꾸지 않음). N5 결재함 폰 접힌 줄 94×21 · 폰 폼 입력 40 = 웨이브 6 N3 · N4 그대로.

05-15 화면 결함 4건(D1–D4). D1은 문 판정의 계보 결정이 필요하고, D2는 05-05부터 있던 것이다.
