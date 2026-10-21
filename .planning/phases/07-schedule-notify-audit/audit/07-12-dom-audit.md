# 07-12 독립 DOM 감사 (SYSTEM 개정 묶음)

- 대상: PR #261, 브랜치 `claude/07-12-system-amendments`, HEAD `47b5620`
- 감사자: 실행자와 별도 에이전트(CLAUDE.md §6). 스크린샷 육안 판정 없음 — 전부 Playwright `getComputedStyle` 실측
- 환경: `CI=true pnpm build`(프로덕션 빌드) → `pnpm start`, Chromium(/opt/pw-browsers), 전용 DB `erp_audit0712_test`(공유 `erp_test` 미사용), 시드 `pnpm db:seed`
- 폭: 375 · 320 · 768 · 1280 (표 항목은 플랜대로 1280 · 768, 선택 표는 4폭 시도)
- 색은 canvas로 정규화한 sRGB hex. 대비는 WCAG 상대 휘도 식. 글자색은 요소 불투명도까지 곱해 실효 배경 위에 합성

## 0. 토큰 실측값 (`:root` 계산값, 1280·768 동일)

| 토큰 | 계산값 | 기대 | 판정 |
|---|---|---|---|
| `--surface-group` | `#F6F8F7` (= `--n-50`) | n-50 | PASS |
| `--surface-selected` | `#E4EAE7` (= `--n-100`) | n-100 | PASS |
| `--surface-dirty` | `#F3F7F5` (= `--n-60`) | n-60 | PASS |
| `--surface-head` | `#F6F8F7` | n-50 | PASS |
| `--focus-w` | `2px` | 2px | PASS |
| `--accent` | `#005446` | g-700 | PASS |

## 1. 견적 표(편집 표) 배경 · 포커스 칸 — Task 3 수락

페이지 `/projects/{id}`(진행 중 · 1차 승인 프로젝트, PM 로그인), 표 `caption="견적 줄"`(`table.table.editable`, 1280에서 `role=grid`). 마우스는 표 밖(1,1)에 두고 hover 면을 배제한 뒤 측정.

### 1-1. 1280 (편집 가능, 편집 칸 32개)

| 항목 | 선택자 | 계산 값 | 기대 | 판정 |
|---|---|---|---|---|
| 머리글 | `.editable thead th.headerCell` | bg `#E4EAE7`(n-100), 글자 `#00211C`(g-950) | SYSTEM §7-3:836 · §7-3:882 「편집 표 머리글 = `--surface-selected` + `--g-950`」 | PASS (문서 일치). 참고 1 |
| 그룹 줄 | `tbody tr.groupRow`, `td.groupHeader` | bg `#F6F8F7` | n-50 `#F6F8F7` | PASS |
| 본문 칸(읽기) | `tbody td.cell` | 투명(α=0, 표 면 `#FFFFFF` 위) | 투명/흰 | PASS |
| 본문 칸(편집) | `td.cell.editableCell` | 투명 | 투명 | PASS |
| 합계 줄 | `tfoot td` | bg `#F6F8F7` | n-50 | PASS |
| 범위 선택 칸 | `td.selectedCell` (Shift+↓/→ 4칸, 앵커·현재 포함) | bg `#E4EAE7` (포커스 없는 칸 3개) | n-100 `#E4EAE7` | PASS |
| 범위 안 활성(포커스) 칸 | `td.selectedCell:focus-visible` | bg `#FFFFFF`, outline `#005446` 2px solid, offset `-2px` | 흰 바탕 + 안쪽 2px accent | PASS |
| 저장 대기 칸 | `td.dirtyCell` (항목 칸 고친 뒤) | bg `#F3F7F5`, box-shadow `rgb(14,122,102) 0 0 0 1px inset`(`--inset-dirty`) | n-60 + inset-dirty | PASS |
| 저장 대기 + 포커스 | `td.editableCell.dirtyCell:focus-visible` | bg `#FFFFFF`, outline `#005446` 2px solid -2px (inset 1px g-600 그림자는 그대로) | 흰 바탕 + 2px accent | PASS |
| 포커스 칸(편집 칸) | `td.editableCell:focus-visible` | bg `#FFFFFF`, outline-color `#005446`, outline-width `2px`, outline-offset `-2px`, outline-style `solid`, box-shadow `none` | 흰 바탕 + 안쪽 2px accent (`outline` + 음수 offset으로 구현) | PASS |
| 포커스 칸(잠긴 칸 `lockedCell`) | `td.cell.lockedCell:focus-visible` | bg `#FFFFFF`, outline `#005446` 2px solid -2px | 동일 | PASS |
| 포커스 칸(번호 칸, 읽기) | `td.cell:focus-visible` | bg `#FFFFFF`, outline `#005446` 2px solid -2px | 동일 | PASS |
| 포커스 + 마우스 hover | `td.editableCell:focus-visible:hover` | bg `#FFFFFF` (hover 면 `#F3F7F5`에 지지 않음) | 흰 바탕 유지 | PASS |
| hover만(포커스 없음) | `td.editableCell:hover` | bg `#F3F7F5` (`--surface-muted` = n-60) | — | 참고 2 |
| 오류 칸 포커스(갤러리 `[data-gallery=table-edit] td.errorCell`) | `td.errorCell:focus-visible` | bg `#FBE9E9`(`--status-danger-weak`), outline `#005446` 2px -2px | 오류 칸은 고정 모양 | PASS |
| 표 안 초록 면 | 표 및 모든 자손의 배경 전수(기본 · 포커스 · 범위 · 저장 대기 상태) | 나온 배경: `#FFFFFF` `#E4EAE7` `#F6F8F7` `#F3F7F5`뿐. `--g-50 #EBF2F0` · `--g-100 #DCE8E4` · `--accent-weak #EBF2F0` · `--g-*` 0건 | 0건 | PASS |

### 1-2. 768 (같은 표 — 읽기 전용: `role=grid` 없음, 편집 칸 0, `table.table` (`.editable` 없음))

| 항목 | 선택자 | 계산 값 | 기대 | 판정 |
|---|---|---|---|---|
| 머리글 | `thead th.headerCell` | bg `#F6F8F7`(n-50) | 읽기 표 머리글 `--surface-head` | PASS |
| 그룹 줄 | `tr.groupRow`, `td.groupHeader` | bg `#F6F8F7` | n-50 | PASS |
| 본문 칸 | `tbody td.cell` | 투명 | 투명 | PASS |
| 합계 줄 | `tfoot td` | bg `#F6F8F7` | n-50 | PASS |
| 포커스 칸 | `td.cell[tabindex]:focus-visible` (첫 칸 `무대 제작…`) | bg `#FFFFFF`, outline `#005446` 2px solid, offset `-2px` | 흰 바탕 + 안쪽 2px accent | PASS |
| 행 hover | `tbody tr:hover > td` | bg `#F3F7F5` | — | 참고 2 |
| 초록 면 | 표 자손 전수 | `#FFFFFF` `#F6F8F7`뿐, 초록 0건 | 0건 | PASS |
| 범위 선택 · 저장 대기 칸 | — | 측정 불가: 768에서 표가 읽기 전용이라 범위 선택(`selectedCell`)과 저장 대기(`dirtyCell`)가 생기지 않음(`editableCell` 0개). 앱 규약상 정상(quote-table.spec `1024 미만에서는 줄을 만들거나 셀을 고칠 수 없다`) | — | 해당 없음 |

참고 1 — 편집 표 머리글 `#E4EAE7`(n-100)은 범위 선택 칸과 같은 면이다. SYSTEM 문서와는 일치하나, 플랜 Task 3 ③ 문구는 「머리글 · 묶음 줄은 `--surface-head`/`--surface-group`(n-50)」이어서 읽기에 따라 편집 표 머리글 n-50을 기대할 수 있다. 문서(SYSTEM §7-3:836 · :882)가 n-100을 명시하므로 결함으로 세지 않고 플랜 문구와의 차이만 적는다.
참고 2 — hover 면 `--surface-muted`(n-60 `#F3F7F5`)는 저장 대기 면 `--surface-dirty`(n-60)와 값이 같아 hover한 행과 저장 대기 칸을 면 색으로 구분할 수 없다(저장 대기 칸은 inset 1px g-600 선으로만 구분). 개정 11이 둘을 같은 n-60으로 재배정한 결과다.

## 2. 고른 행 위 글자 대비 (`--surface-selected` `#E4EAE7`)

### 2-1. 일괄 처리 표 = `/expenses` 지급 대상 표(`payment-targets-table.tsx`, 선택 열 사용 화면은 이 표와 `/dev/components` 표본 둘뿐)

지급 권한자 로그인, 지급 대상 4건(예정일 어제 · 오늘 · 없음 · 14일 뒤)을 전부 체크하고 마우스를 치운 뒤 고른 행 8줄(주 행 4 + 접힌 줄 4)의 모든 글자를 실측. 고른 행 칸 배경은 전부 `#E4EAE7`(막힌 행은 전부 투명 — PASS).

| 글자색 | 어디 | 크기/굵기 | 대비 | 판정 |
|---|---|---|---|---|
| `#13201C` (`--text-strong`) | 거래처 · 은행 · 계좌 마스크 · 예금주 등 32곳 | 14px/400 | 13.77 | PASS |
| `#005446` (`--accent`/링크) | 문서 번호 `26008-0001`, 문서 링크 `a.link` 8곳 | 14px/400 | 7.31 | PASS |
| `#0E7A66` (`--status-success`) | `span.base.success.text` **`확인됨`** 4곳 | 11px/600 | **4.31** | **FAIL (< 4.5)** |
| `#5F6E6A` (`--text-faint`) | 이 표 고른 행에는 나타나지 않음 | — | 4.39 (토큰 수학) | 이 화면에서는 미발생 |

- 1280: 위 표. 768 · 375 · 320: 지급 대상 표는 렌더되지만 선택 열(체크박스)이 없다(`input[type=checkbox]` 0개, 표 1개) — 고른 행이 생기지 않아 측정 불가.
- 결함 D1: 선택자 `/expenses` · `tbody tr.selectedRow td span.base.success.text`(`확인됨`) 전경 `#0E7A66` on `#E4EAE7` = 4.31:1, 11px 600(큰 글자 아님) → WCAG AA 4.5:1 미달. 실행자 경고(4.31)가 실제 화면에서 발생함을 실측으로 확인.
- 토큰 수학(고른 행 `#E4EAE7` 위): `--status-success` 4.31 · `--text-faint` 4.39 (둘 다 < 4.5), `--status-warning #8A5A00` 4.86 · `--text-muted #52615C` 5.34 · `--status-danger #9B1C1C` 6.68 · `--accent #005446` 7.31 · `--text-strong` 13.77.

### 2-2. `/dev/components` 「표 선택」 표본 (6행 중 고를 수 있는 4행 체크)

| 폭 | 글자색 | 대비 | 판정 |
|---|---|---|---|
| 1280 | `#13201C` on `#E4EAE7` (표본 이름 · 금액 8곳) | 13.77 | PASS |
| 768 | 동일 | 13.77 | PASS |
| 375 | 동일 | 13.77 | PASS |
| 320 | 동일 | 13.77 | PASS |

(표본 행에는 success · faint 글자가 없어 위반 글자가 드러나지 않음 — D1은 실제 화면에서만 나타난다.)

### 2-3. 새 면 위 글자 전수 (n-100 · n-50 · n-60), 4폭 × 11화면

대상: `/projects`, `/projects/{id}`, `/expenses`, `/pnl/reserves`, `/admin/code-tables`, `/admin/people/roles`, `/admin/permissions`, `/admin/vendors`, `/admin/visibility`, `/admin/action-log`, `/dev/components` (시스템 관리자). 실효 배경이 세 면 중 하나인 모든 글자.

| 면 | 글자색 | 최소 대비 | 대표 위치 | 판정 |
|---|---|---|---|---|
| n-100 `#E4EAE7`(편집 표/권한표 머리글, 선택) | `#13201C` 13.77 · `#00211C` 13.95 | 13.77 | `th.corner`(권한표 · 정보 노출표), `th.headerCell`(편집 표) | PASS |
| n-50 `#F6F8F7`(머리글 · 그룹 · 합계) | `#52615C` 6.11 · `#8A5A00` 5.56 · `#9B1C1C` 7.64 · `#00443A` 10.43 · `#13201C` 15.74 | 5.56 | 읽기 머리글, `td.groupHeader`, `예정일 지남`, 합계 줄 | PASS |
| n-60 `#F3F7F5`(hover · muted · dirty) | `#5F6E6A` 4.95 · `#52615C` 6.03 · `#13201C` 15.53 | 4.95 | 비활성 버튼 글자(`일괄 저장`, `1차 비활성`), 갤러리 첨부 영역 | PASS |

모든 화면 · 폭에서 위 세 면 위 최소 대비 4.95 이상(선택 상태를 만들지 않은 화면). 4.5 미만은 2-1의 D1 하나뿐.

## 3. 상태 낱말 여섯 (`/dev/components` 「상태 배지」 `[data-gallery=status-badges]`, 4폭)

여섯 낱말 × (`tag`, `text`) = 12개가 4폭 모두에서 존재. 아래 값은 4폭에서 동일.

| 낱말 | 종류 | 글자색 | 기대 토큰 | `tag`: 테두리 | `text`: 테두리/배경 | 대비(흰 바탕) | 줄 수 · nowrap | 판정 |
|---|---|---|---|---|---|---|---|---|
| 마감 지나 밀림 | warning | `#8A5A00` | `--status-warning` `#8A5A00` | 1px `#8A5A00` | 0 / 투명 | 5.40 | 1줄 · nowrap | PASS |
| 수동 지정 | muted | `#52615C` | `--status-muted` `#52615C` | 1px `#52615C` | 0 / 투명 | 5.94 | 1줄 · nowrap | PASS |
| 계좌 바뀜 | warning | `#8A5A00` | `--status-warning` | 1px `#8A5A00` | 0 / 투명 | 5.40 | 1줄 · nowrap | PASS |
| 잠김 | danger | `#9B1C1C` | `--status-danger` `#9B1C1C` | 1px `#9B1C1C` | 0 / 투명 | 7.43 | 1줄 · nowrap | PASS |
| 초과 | danger | `#9B1C1C` | `--status-danger` | 1px `#9B1C1C` | 0 / 투명 | 7.43 | 1줄 · nowrap | PASS |
| 수금 지연 | warning | `#8A5A00` | `--status-warning` | 1px `#8A5A00` | 0 / 투명 | 5.40 | 1줄 · nowrap | PASS |

| 폭 | `document.scrollWidth` / `innerWidth` | 낱말이 `li` 밖으로 넘침 | 판정 |
|---|---|---|---|
| 1280 | 1280 / 1280 | 0 | PASS |
| 768 | 768 / 768 | 0 | PASS |
| 375 | 375 / 375 | 0 | PASS |
| 320 | 320 / 320 | 0 | PASS |

폰트 11px/600, 모두 한 줄(Range 클라이언트 rect 줄 수 = 1). 단위 시험 `status-map` · `role-menu-notification-rules` · `design/tokens`(3파일 326건) 녹색 재확인.

## 4. 알림 규칙 관리 메뉴 슬롯

| 항목 | 측정 | 판정 |
|---|---|---|
| 정의 | `ui/shell/role-menu.ts:120-125` `ADMIN_MENUS` — `admin.notification-rules` · `알림 규칙` · `/admin/notification-rules` · `ADMIN_GROUP_SETTINGS_PERMISSIONS`, `시스템 설정` 항목 바로 뒤. 단위 시험이 순서(권한표 · 정보 노출표 · 시스템 설정 · 알림 규칙) 확인 | PASS |
| 키 없는 계급에게 숨김(시스템 관리자 로그인, 1280 · 768) | `/admin` 인덱스 링크 13개(`사람 … 보관함`) 중 `알림 규칙` 없음, 셸 `nav`/`header` 링크에도 없음 | PASS |
| 페이지 | `GET /admin/notification-rules` → HTTP 404 (07-19 몫, 계획대로) | PASS |

## 5. 그 밖의 DOM 측정 가능 수락 항목

| 항목 | 측정 | 판정 |
|---|---|---|
| 표 안 초록 면 0 — 15개 화면 × 1280 · 768 | `/projects` `/projects/{id}` `/expenses` `/expenses/evidence` `/pnl/reserves` `/cards` `/pnl` `/admin/code-tables` `/admin/people/roles` `/admin/permissions` `/admin/vendors` `/admin/visibility` `/admin/action-log` `/approvals` `/dev/components`: `table, [role=grid]`와 모든 자손 배경 전수에서 g-50 `#EBF2F0` · g-100 `#DCE8E4` · accent-weak `#EBF2F0` 및 `--g-*` 일치 0건. 나온 배경은 `#FFFFFF` `#F6F8F7` `#F3F7F5` `#E4EAE7`(+오류 칸 `#FBE9E9`) | PASS |
| 요약이 우려한 표 안 입력의 `--accent-weak` | `/pnl/reserves`(표 1개, 리저브 입력 행 없음 → 표 안 입력 미노출 상태), `/expenses`·`/expenses/evidence`(표 안 입력 칸이 뜨는 상태까지는 열지 못함) — 표 자손 전수에서 accent-weak 0건 | 주의: 입력 칸이 실제로 뜨는 상태(리저브 입력 행 · 증빙 편집)는 측정하지 못함 |
| 선택 열(체크박스)이 PC에서만 | 768 · 375 · 320의 지급 대상 표에는 체크박스 0 | 해당 없음 |
| 가로 넘침 | 15개 화면 1280 · 768 `scrollWidth - innerWidth` = 0 | PASS |
| 단위 · 테스트 | `status-map` · `role-menu-notification-rules` · `design/tokens` 326건 통과(`vitest --project unit`) | PASS |

## 6. 결함 · 측정 못한 것

### 결함
- **D1 (FAIL)** `/expenses` 지급 대상 표 고른 행 `td.selectedRow` 안 `span.base.success.text`(`확인됨`) — `#0E7A66` on `#E4EAE7` = 4.31:1 (11px/600, 4.5:1 미달). 4건 모두 동일. 고른 행 면이 g-100 → n-100으로 바뀌어 생김(옛 g-100 위 4.18). 조치는 글자 색 변경 등 후속(이 감사는 제품 코드를 고치지 않음).
- (예고된 위험) `--text-faint #5F6E6A` × `#E4EAE7` = 4.39:1은 토큰 수학상 미달이나 이번 측정한 고른 행(지급 대상 표, 갤러리 표본, 견적 범위 선택)에는 나타나지 않음.

### 측정하지 못한 것과 이유
1. 768에서 견적 표의 범위 선택 · 저장 대기 · 편집 칸 포커스: 1024 미만에서는 표가 읽기 전용이라 해당 상태 자체가 없음(읽기 포커스 칸은 측정함).
2. 768 · 375 · 320에서의 일괄 처리 고른 행: 선택 열이 PC 폭에서만 렌더됨.
3. 입력 칸이 뜨는 상태의 표 안 입력 배경(리저브 입력 행 · 증빙 편집 · `project-detail` 기간 입력/`periodSaved`): 해당 화면 상태를 만드는 픽스처를 이 감사에서 구성하지 못함(요약의 표 밖 `--accent-weak` 6곳 중 CSS 소스 확인만 가능, DOM 실측 못함).
4. 견적 표의 오류 칸 포커스는 갤러리 편집 표본으로 대체(실제 견적 표에서는 오류 칸을 만들지 못함).
5. 고른 행 + 포커스 칸 + hover 조합(지급 대상 표)은 측정하지 않음.
6. Codex 디자인 검토 · `/review` · `/qa`는 이 감사 범위 밖.

측정 스크립트는 저장소에 올리지 않았다(임시 `test/e2e/zz-audit0712-*.spec.ts`, 미추적).
