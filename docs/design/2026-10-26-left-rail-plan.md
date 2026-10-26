# 왼쪽 레일 셸 — 설계안 (2026-10-26)

## 왜
- 사용자 지시 2026-10-26 13:12 KST: 「모든 화면에서 상단에 메뉴를 넣지 말고 왼쪽 레일로 메뉴를 넣어」.
- 카드 답 13:14 KST: ① PC에서 위쪽 바를 없애고 레일 하나로(로고·검색 위, 메뉴 가운데, 사용자 메뉴 아래) ② 레일 접기는 「폭에 따라 자동」 — 1280 이상 항상 펼침, 좁으면 ≡로 여는 가림 레일, 단추 없음.
- 같은 날 결정: 증빙(/expenses/evidence)은 메뉴 3번째(증빙 등록 권한자만) — 레일 순서에도 그대로.
- 260907 대조: 왼쪽 레일 6묶음 16메뉴(.planning/research/ERP260907-CONTEXT.md:198-205). 이번 레일은 묶음 머리글 없이 평평하다(항목이 6~7개라 묶음이 정보를 더하지 않음).

## 바뀌는 규칙
- SYSTEM.md §6-0 도식·문장(상단 바 · 1차 메뉴 · 사용자 진입점 (a) · 태블릿 700–1023 「PC 셸 그대로」), §6-1:414 「필터 패널·사이드바 없음」의 「사이드바 없음」, §6-1:418 「1차 메뉴는 다섯 고정이고 탭 · 드롭다운은 없다」(이미 증빙 예외로 고침).
- CLAUDE.md에는 사이드바 규칙이 없다(grep). 고치지 않는다.
- DECISIONS.md 새 항목: 「2026-10-26 — 1차 메뉴를 왼쪽 레일로(위쪽 바 없음, 폭에 따라 자동)」.

## 폭별 셸
| 폭 | 셸 |
|---|---|
| ≥1280 | 왼쪽 레일 고정(위쪽 바 없음). 본문은 레일 오른쪽, 최대 폭 `--container-max` 1280 그대로 · 왼쪽 정렬 |
| 700–1279 | 위쪽 48px 바(`--bar-h`, 지금 폰 바와 같은 모양: 왼쪽 ≡ · 워드마크, 오른쪽 사용자 이름+배지) → ≡가 왼쪽에서 가림 레일(같은 레일 내용, 뒤 `--scrim-panel` · `inert`, Esc·바깥 누름·항목 이동으로 닫힘, 포커스는 ≡로 돌아옴). 하단 탭 없음 |
| <700 | 지금 그대로(바 + 하단 탭 4개 + 더보기 시트). 바뀌지 않음 |

## 레일 (≥1280 고정 · 700–1279 가림 공통 내용)
- 면: 지금 상단 바의 딥그린 면을 그대로 옮긴다 — `--bar-bg` · 글자 `--bar-fg` · 포커스 `--focus-on-bar`(앱 유일 딥그린 면, U1 반전 워드마크 그대로). 새 색 없음.
- 폭: 새 크기 토큰 `--rail-w: 176px`(tokens.css). 높이 100vh, `position: sticky; top: 0`, 레일 안은 넘치면 세로 스크롤.
- 위에서 아래로:
  1. 워드마크 링크 `PLANT8`(→ `/`, 접근 이름 `PLANT8 내 차례`, 높이 `--bar-h`)
  2. 검색 행 `검색  Ctrl+K`(명령 팔레트를 연다 — 지금 바의 kbd 표시를 누를 수 있는 행으로)
  3. `nav aria-label="주 메뉴"` — 프로젝트 · 지출결의 · 증빙(권한자만) · 법인카드 · 결재 · 손익. 행 높이 `--touch-min` 44, 글자만, 아이콘 없음.
  4. 빈 공간
  5. 아래 묶음: 「관리」(관리 view 권한 하나라도 있을 때만, 지금 사용자 메뉴 맨 위 항목을 옮김) · 사용자 행(이름 + 안 읽은 알림 배지 — 누르면 위로 열리는 작은 메뉴: 알림함 N · 내 정보 · 연차(권한) · 로그아웃. 지금 TopBar 사용자 메뉴의 키보드 동작 그대로: ↑↓ Home End Esc)
- 현재 메뉴: `aria-current="page"`(가장 긴 href 일치 하나 — currentHref) · 글자 700 + 왼쪽 3px `--g-400` 막대(지금 아래 2px 밑줄을 레일 방향으로) + 행 배경은 바꾸지 않음. hover = 밑줄(지금 바 메뉴와 같음).
- 권한: 레일 항목은 role-menu.ts 결과(topBarMenu·adminMenu·accountGroup)만 그린다. 역할 분기 없음(D-23).
- Tab 순서: 스킵 링크 → 워드마크 → 검색 → 주 메뉴 → 관리 → 사용자 → 본문.

## 본문·표에 미치는 것
- ≥1280에서 본문 가용 폭 = 뷰포트 − 176. 뷰포트 1280이면 본문 1104(패딩 포함).
- 열이 많은 표의 열 숨김 기준(§6-1 「1280 · 1024 두 폭」)이 뷰포트 기준이면 1280–1455 구간에서 본문이 좁아져 넘칠 수 있다 → DOM 감사로 `scrollWidth ≤ clientWidth`를 견적표·프로젝트 목록·증빙 표·권한표에서 1280·1440에서 잰다. 넘치면 숨김 기준을 본문 폭(컨테이너 쿼리) 또는 +176으로 옮긴다(이 PR 안).
- `--bar-h`를 sticky top으로 쓰는 곳(ui/permission-grid/PermissionGrid.module.css:269, ui/detail-screen/DetailScreen.module.css:69): ≥1280에서는 위쪽 바가 없으니 0. 새 변수 `--shell-top`(≥1280 0, 그 밖 `--bar-h`)으로 바꾼다.

## 파일
- ui/shell/: Shell.tsx·Shell.module.css(그리드), TopBar.tsx/.module.css → 레일 + 좁은 폭 바로 나눔(SideRail.tsx 새로, TopBar는 700–1279·<700 바만), BottomTabs/MoreSheet 그대로.
- docs/design/tokens.css(`--rail-w`, `--shell-top`), SYSTEM.md, DECISIONS.md.
- ui/permission-grid · ui/detail-screen sticky 오프셋 한 줄씩.
- 겹침 금지: app/(app)/projects/**/quote-table.tsx · ui/table/(다른 스레드).

## 검증
- 단위: role-menu 그대로, 레일 렌더(권한별 항목·aria-current·Tab 순서).
- e2e: page-chrome·admin-nav·mobile-shell 등 셸 스펙의 선택자 갱신, visual.spec.ts(1280) 기준 다시 만듦(CI linux 기준). visual-390은 바뀌지 않아야 함.
- 화면: 4폭(375·320·768·1280) + 1440 캡처를 main과 비교, Codex 디자인 검토, 독립 DOM 감사.

## 정해 둔 기본값(사용자에게 안 묻고 감)
- 묶음 머리글 없음, 아이콘 없음(아이콘 소스 없음 — UQ-5), 레일 폭 176, 폰 그대로.

## 계획 검토 반영 (/plan-design-review 독립 검토, 2026-10-26 — 추천안으로 자동 결정)
1. 검색 행: 명령 팔레트가 아직 없다(MoreSheet.tsx:103-111 `aria-disabled`). 레일 검색 행도 같은 `aria-disabled` 행(검색 + `Ctrl+K` kbd)으로 둔다. 팔레트는 범위 밖.
2. 표 넘침: 열 숨김 기준이 뷰포트다(ui/table/Table.module.css:411 `max-width:1279.98px`, projects/[id]/project-detail.module.css:320·334). ≥1280에서 본문이 176 줄어 넘칠 수 있다. 방식은 (b) 본문 `.main`에 `container-type: inline-size`, 표 숨김 기준을 컨테이너 쿼리로 옮긴다. `ui/table/`·projects 쪽 파일은 다른 스레드(견적표 초록 테두리)가 main에 들어온 뒤 그 위에서 고친다(겹침 금지). 그 전까지 레일 구현을 먼저 하고, DOM 감사로 1280·1440 넘침을 잰다.
3. 레일 스크롤은 주 메뉴 `nav`에만(`min-height:0; overflow-y:auto`). 아래 묶음(관리·사용자)은 `flex-shrink:0`로 바닥 고정, overflow 없음. 사용자 메뉴는 `bottom:100%; left:0`, 폭 ≥ 레일 폭.
4. 700–1279 가림 레일은 네이티브 `<dialog>.showModal()`(MoreSheet.tsx:46·SidePanel.tsx:164와 같은 패턴), `::backdrop`=`--scrim-panel`, 닫으면 포커스는 ≡. 손으로 짠 inert 없음. 현재 페이지 항목을 눌러도 닫힌다.
5. 1280 경계: `matchMedia('(min-width:1280px)')` change에서 가림 레일을 닫고 포커스를 `#main-content`로. 1280 미만으로 줄면 레일 사용자 메뉴를 닫는다. e2e resize 1건.
6. 랜드마크 한 벌: 1280 미만에서 고정 레일은 `display:none`, 가림 레일 내용은 열 때만 마운트. ≥1280에서 레일은 `<header>`(banner) 안의 `nav "주 메뉴"`로 두어 §10 랜드마크 넷을 지킨다. `getByRole("banner")` 쓰는 e2e는 그대로 통과해야 한다.
7. 토스트(ui/toast/Toast.module.css:9·12): ≥1280에서 `left: calc(var(--rail-w) + var(--pad-page))`.
8. 700–1279 사용자 진입점은 바 오른쪽 이름+배지 하나. 가림 레일에는 사용자 행을 두지 않는다(관리는 레일 아래에 둔다).
9. 사실 고침: 바 메뉴 hover는 색 변화(TopBar.module.css:70)다 — 레일도 같은 색 변화. 지금 폰 바에는 ≡가 없다 — 700–1279 바 왼쪽에 글자 `≡` 버튼(접근 이름 「메뉴」, `--touch-min`)을 새로 둔다. <700 폰 바는 그대로.
10. 현재 메뉴 막대는 새 값 없이 `--underline-w-hover`(2px) · `--bar-leaf`.
11. 레일 안쪽: 좌우 `--s-4`, 행 글자 `--text-body` 600(현재 700), 이름은 `.userTriggerName` 말줄임 재사용.
12. 인쇄: `@media print`에서 레일·그리드 열 없음.
13. 셸 그리드: `min-height:100vh`, 레일 `position: sticky; top:0; height:100vh; align-self:start`, z는 `--z-bar`. `--shell-top`은 DetailScreen.module.css:69 · PermissionGrid.module.css:269 두 곳. Table 결과 줄 sticky는 폰 전용이라 그대로.
14. SYSTEM §6-0: 「PC (≥1024)」 그림을 「PC (≥1280)」 레일 그림으로, 「태블릿 700–1023 PC 셸 그대로」를 「700–1279 가림 레일 셸」로. 「즉시 저장 마스터 표 편집 허용(700–1023)」 규칙은 셸과 무관하게 그대로라고 한 줄.
15. PC 레일에 「내 차례 N」 항목은 두지 않는다(지금처럼 워드마크 = 홈). 사용자 결정 범위 밖이라 바꾸지 않고 보고에 적는다.

## GSTACK REVIEW REPORT
| Run | Status | Findings |
|---|---|---|
| /plan-design-review 독립 검토(Claude Opus 서브에이전트) | issues_found → 반영 | Critical 3 · High 5 · Medium 8, 전부 위 「계획 검토 반영」 1–15로 반영(추천안 자동 결정) |
| Codex 디자인 검토(scripts/codex-design-review.sh --plan, exit 0) | completed | 지적 후보 4건, 모두 지금 /projects 필터 줄 순서(기존 화면, 이 계획 범위 밖) — 계획을 막는 지적 없음. 보고서 /mnt/project-files/evidence-menu/plan-review/codex-plan-review.md |

점수(반영 전 → 반영 후): 정보 구조 7→9 · 상호작용 상태 4→8 · 사용자 여정 6→8 · AI 슬롭 8→9 · 시스템 정합 6→9 · 반응형·접근성 4→8 · 미해결 결정 4→9.
VERDICT: 구현 진행. 표 넘침 수정(2)은 다른 스레드의 ui/table 변경이 main에 들어온 뒤.
OUTSIDE COVERAGE: Codex completed (기존 화면 지적만), Claude 독립 검토 completed.

NO UNRESOLVED DECISIONS
