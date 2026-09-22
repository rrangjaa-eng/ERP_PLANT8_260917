---
task: quick/260922-i3k-b-admin-3-a-m3
verifier: independent live-DOM audit (did not write the code)
verified_at: 2026-09-22T15:02Z
method: Playwright 1.63.0 · Chromium 1194 · CI=true production build (`pnpm build && pnpm start`) · erp_test reset before the run
status: pass_with_one_deviation
counts:
  pass: 14
  fail: 1
  unverified: 0
  total: 15
blocking: false
---

# 260922-i3k — 렌더된 DOM 실측 감사 (DOM-VERIFY)

이 문서는 **소스가 아니라 렌더된 DOM에서 잰 숫자**만 담는다. 스크린샷 육안 판정은
쓰지 않았다. 모든 값은 `getComputedStyle` · `getBoundingClientRect` · `Range` 텍스트
사각형 · Playwright `ariaSnapshot()` · Chromium CDP `Accessibility.getFullAXTree`로
측정했다. 조언용(additive·advisory)이며 아무것도 막지 않는다.

## 실행 방법 (재현 가능)

- 저장소의 `playwright.config.ts` 기계를 그대로 썼다. 임시 스펙 두 개를
  `test/e2e/`(= `testDir`)에 두고 `pnpm db:reset:test` 후 `CI=true pnpm exec playwright test`로
  돌렸다 — `CI=true`라 webServer가 `pnpm build && pnpm start`(프로덕션 빌드)를 띄운다.
  데스크톱은 기본 뷰포트 1280×720, 폰은 `mobile-375` 프로젝트(375×800).
- 임시 스펙은 측정이 끝난 뒤 삭제했다. 최종 `git status --porcelain`은 이 보고서
  파일 하나뿐이다(맨 아래).
- 같은 실행에서 **기존 E2E 97개도 전부 통과**했다(임시 2개 포함 99 passed, 2.1m).
- 계정: `createFixtureUser({ roleId })` — `role-sysadmin`(seed가 `admin.*` 10개 전부 허용),
  `role-pm`(`admin.*` 0개).
- 데이터 보강 2건: 「법인카드」·「거래처」 표는 목록이 비면 `<table>` 자체가 렌더되지
  않아(§7-7 EMPTY) `domain/corp-cards.createCorpCard` · `domain/vendors.createVendor`로
  `erp_test`에 각 1행을 넣고 쟀다. 사람 상세의 `HistoryList`는 신규 픽스처 사용자에게
  소속 이력이 없어 「새 이력 추가」를 눌러 표를 띄운 뒤 쟀다. (둘 다 DB 조작일 뿐
  저장소는 건드리지 않았다.)
- 환경 기록: webServer 기동 시 `⚠ "next start" does not work with "output: standalone"`
  경고가 났으나 서버는 정상 기동·응답했고 전 테스트가 통과했다. 이번 변경과 무관한
  기존 인프라 잡음이다.

---

## A. §6-10 「관리」 인덱스 (`/admin`)

### A-1. 그룹 머리글과 항목 링크의 좌측 기준선 (WR-01) — **PASS**

요소 사각형(`getBoundingClientRect().left`)과 **텍스트 사각형**(`Range.selectNodeContents`)
둘 다 쟀다. 델타는 전부 **0.0px**다.

| 뷰포트 | `main` 패딩 | 그룹 머리글 left / textLeft | 항목 링크 left / textLeft (10개 전부) | 델타 |
|---|---|---|---|---|
| 1280 | `20px` | 20 / 20 (마스터·설정·권한·운영 기록 셋 모두) | 20 / 20 | **0px** |
| 375 | `14px 14px 72px` | 14 / 14 (셋 모두) | 14 / 14 | **0px** |

`.link`의 `padding-left`는 계산값 `0px`, `display: flex`, `width` 1240px(1280) —
즉 본문 콘텐츠 박스를 꽉 채우고 머리글과 같은 열에서 시작한다. §6-10 도해
(`│ 마스터` / `│ 사람`이 같은 열)와 일치한다. **WR-01은 렌더된 DOM에서 실제로 닫혔다.**

### A-2. 그룹 머리글 계산 스타일 (WR-02) — **PASS**

세 머리글(`마스터` · `설정·권한` · `운영 기록`) 전부, 1280·375 양쪽에서 동일:

| 속성 | 계산값(실측) | §6-10 요구 | tokens.css 값 | 판정 |
|---|---|---|---|---|
| `font-size` | `12px` | `--fs-sm` | `--fs-sm: 12px` | PASS |
| `color` | `rgb(78, 93, 89)` | `--muted` | `--muted: #4E5D59` = rgb(78,93,89) | PASS |
| `font-weight` | `600` | 600 | `--fw-medium: 600` | PASS |

`--fs-xs`(11px) · `--faint`(#5F6E6A = rgb(95,110,106))는 이 화면에 **없다** —
비교용으로 같은 실행에서 「더보기」 시트의 「계정」 머리글을 쟀더니 `11px` /
`rgb(95, 110, 106)`로 나왔다(§7-8 시트 톤, 별개 표면). 두 톤이 실제로 갈라져 있다.
**WR-02도 렌더된 DOM에서 닫혔다.**

### A-3. 항목 행 높이 ≥ `--touch-min` — **PASS**

| 뷰포트 | 링크 높이(10개) | `min-height` 계산값 | `--touch-min` | 판정 |
|---|---|---|---|---|
| 1280 | 전부 `44px` | `44px` | 44px | PASS |
| 375 | 전부 `44px` | `44px` | 44px | PASS |

`<li>` 높이는 44–45px(45는 `border-bottom: 1px var(--line)` 포함, 마지막 항목은 44).
§6-10 「항목은 §7-8 시트 목록 행과 같은 높이」 충족 — 같은 실행에서 잰 시트 목록
행 높이도 44px로 일치한다.

### A-4. 카드·아이콘·설명 문구 0개 — **PASS**

`<main>` 서브트리 전수 열거 결과:

| 항목 | 실측 | 요구 | 판정 |
|---|---|---|---|
| 아이콘(`svg, img, i, use, [class*=icon]`) | **0개** | 0 | PASS |
| 카드 후보(4면 테두리 전부 >0 **또는** `box-shadow !== none`) | **0개** | 0 | PASS |
| `box-shadow` ≠ `none` | **0개** | `--shadow: none` | PASS |
| `border-radius` ≠ `0px` (네 모서리 전부 검사) | **0개** | `--radius: 0` | PASS |
| h1·h2·a·button 밖의 텍스트 노드(= 설명 문구) | **0개** | §8 안내 문구 0 | PASS |
| `<table>` / `<button>` / `[disabled]·[aria-disabled=true]` | 0 / 0 / **0** | 이유 없는 비활성 버튼 0개(§11) | PASS |

### A-5. 그룹·항목 문서 순서 — **PASS**

`main` 안 `h1,h2,h3,h4,h5,h6,a`를 문서 순서로 뽑은 결과(1280·375 동일):

```
H1 관리
H2 마스터        → A 사람 /admin/people · A 거래처 /admin/vendors
                   · A 법인카드 마스터 /admin/corp-cards · A 코드표 /admin/code-tables
H2 설정·권한     → A 권한표 /admin/permissions · A 정보 노출표 /admin/visibility
                   · A 시스템 설정 /admin/settings
H2 운영 기록     → A 시스템 상태 /admin/system-status · A 행동 로그 /admin/action-log
                   · A 보관함 /admin/archive
```

§6-10 정본 표(마스터: 사람·거래처·법인카드 마스터·코드표 / 설정·권한: 권한표·정보
노출표·시스템 설정 / 운영 기록: 시스템 상태·행동 로그·보관함)와 **원소 단위로 동일**.

### A-6. 375px 가로 스크롤 — **PASS**

| 값 | 실측 | 요구 |
|---|---|---|
| `document.documentElement.scrollWidth` | **375** | = clientWidth |
| `document.documentElement.clientWidth` | **375** | — |
| `document.body.scrollWidth` | **375** | — |

오버플로 0px. §7-3 「가로 스크롤 금지」·§10 충족.

### A-7. 접근성 트리의 그룹 머리글 — **PASS**

머리글은 스타일 입힌 `<div>`가 아니라 **진짜 `<h2>`**다(DOM 태그 실측 `H2`,
role 덮어쓰기 없음). 렌더된 트리:

```
- main:
  - heading "관리" [level=1]
  - heading "마스터" [level=2]
  - list: listitem → link "사람" (/admin/people) … (4개)
  - heading "설정·권한" [level=2]
  - list: … (3개)
  - heading "운영 기록" [level=2]
  - list: … (3개)
```

`<h1>` 하나 아래 `<h2>` 셋 — 레벨 중첩이 건전하고 건너뛴 레벨이 없다. 항목은
`list > listitem > link`로 노출돼 §6-10 「항목 행 = 링크」와 맞는다.

측정 방법 주: 이 트리는 Playwright `locator.ariaSnapshot()`(살아 있는 DOM 위의 ARIA
계산)으로 얻었다. 레거시 `page.accessibility.snapshot({root})`는 이 화면에서 `null`을
돌려줘 쓰지 못했다 — 대신 표 화면에서는 Chromium CDP `Accessibility.getFullAXTree`로
**브라우저 실제 AX 트리**를 직접 읽었다(§C 참조). `<section>`은 접근 가능한 이름이
없어 region으로 노출되지 않는데, §6-10이 요구하지 않는 사항이라 판정 대상이 아니다.

---

## B. 진입점

### B-8. sysadmin @1280 — PC 사용자 메뉴 — **PASS**

`[role=menu]` 안 `[role=menuitem]`:

| # | 태그 | 접근 가능한 이름 | href |
|---|---|---|---|
| 1 | `A` | **관리** | `/admin` |
| 2 | `A` | 내 정보 | `/account` |
| 3 | `BUTTON` | 로그아웃 | — |

- 항목 수 **3개**. 메뉴 전체 텍스트: `관리내 정보로그아웃`.
- 개별 관리자 화면 이름(시스템 상태·코드표·사람·거래처·법인카드 마스터·권한표·정보
  노출표·시스템 설정·행동 로그·보관함) **0개**. 「관리」는 한 줄. §6-0 (a)·D-17 충족.

### B-9. sysadmin @375 — 「더보기」 시트 — **PASS**

| 측정 | 실측 | 요구(§7-8) |
|---|---|---|
| `a[href="/admin"]` 개수 | **1** | 「관리」 한 줄 |
| 그 행의 높이 / 글자 크기 | `44px` / `15px` | 목록 행 44 |
| 텍스트가 정확히 `관리자`인 요소 | **0개 (없음)** | 「관리자」 그룹 머리글 없음 |
| `계정` 그룹 머리글 | 있음 (`li.group[role=presentation]`, 11px, `rgb(95,110,106)`) | 「계정」 그룹은 유지 |

시트 ARIA: `dialog "더보기" → list → listitem → link "관리" (/url: /admin)`. 「관리」
행은 1차 메뉴들 바로 아래, 「계정」 머리글 **위**에 머리글 없이 한 줄로 놓인다 —
사용자가 잠근 결정 그대로다.

### B-10. `role-pm`(admin.* 0개) — **PASS**

| 표면 | 실측 |
|---|---|
| PC 사용자 메뉴 | menuitem **2개**(내 정보 `/account`, 로그아웃). `a[href="/admin"]` **0개** |
| 「더보기」 시트 @375 | `a[href="/admin"]` **0개**. 행: 검색·법인카드·결재·손익·계정·내 정보·설정·로그아웃 |
| `/admin` 직접 이동 | HTTP **404** (데스크톱·폰 양쪽) |

404 응답 본문도 §6-9 화면이 렌더된다(`페이지를 찾을 수 없습니다 / 이 페이지가 없거나
옮겨졌습니다 / 첫 화면으로`). 소스의 가드를 읽은 것이 아니라 응답 상태 코드와 DOM
텍스트로 확인했다.

---

## C. A-M3 caption — **전부 PASS**

### C-11. caption이 접근성 트리에서 표 이름이 되는가 + 시각적으로 숨겨졌는가

**Chromium 실제 AX 트리**(CDP `Accessibility.getFullAXTree`) 기준. 8개 caption 인스턴스
전부 `role: "table"` 노드의 `name`으로 잡혔고 `ignored: false`다.

| # | 화면 | caption 텍스트 = AX 표 이름 | AX `ignored` |
|---|---|---|---|
| 1 | `/admin/code-tables` | `코드표 · 프로젝트 상태` | false |
| 2 | `/admin/code-tables?tableKey=evidence_type` | `코드표 · 증빙 종류` | false |
| 3 | `/admin/corp-cards` | `법인카드` | false |
| 4 | `/admin/people` | `사람` | false |
| 5 | `/admin/people/roles` | `계급` | false |
| 6 | `/admin/vendors` | `거래처` | false |
| 7 | `/admin/settings` (HistoryList ×6) | `부가세율 이력` · `기타소득 원천징수율 이력` · `사업소득 원천징수율 이력` · `기타소득 원천징수 면제 기준(지급액) 이력` · `회사 대납 세율 이력` · `회사 대납 계산 방식 이력` — 6개 전부 서로 다름 | false ×6 |
| 8 | `/admin/people/[id]` (HistoryList) | `소속 발령 이력` | false |

Playwright `getByRole("table", { name: <caption>, exact: true })`도 각 화면에서
정확히 **1개**를 잡는다. `ariaSnapshot()` 첫 줄도 `- table "<caption>":`이다.

**시각적 숨김 방식 계산값** (8개 인스턴스 전부 동일, `class="sr-only"`):

| 속성 | 계산값 | 판정 |
|---|---|---|
| `display` | `block` | **`none` 아님** ✓ |
| `visibility` | `visible` | **`hidden` 아님** ✓ |
| `position` | `absolute` | — |
| `width` / `height` | `1px` / `1px` | — |
| `clip` | `rect(0px, 0px, 0px, 0px)` | 표준 clip 기법 |
| `clip-path` | `none` | — |
| `overflow` | `hidden` | — |
| `margin` | `-1px` | — |
| `opacity` | `1` | — |
| `getBoundingClientRect()` | `1 × 1` | 화면에서 안 보임 |

`display:none` / `visibility:hidden`이 **아니므로** 접근성 트리에서 제거되지 않는다 —
실제 AX 트리가 이를 위 표로 증명한다. A-M3 수정은 무효화되지 않았다.

관측 메모(결함 아님): 「법인카드」·「거래처」 목록이 비었을 때는 `<table>` 자체가
없고 §7-7 EMPTY가 뜬다 — 이름 붙일 표가 없으므로 caption 부재가 맞다. 사람 상세의
`HistoryList`도 이력이 0건이면 같다.

### C-12. 코드표 두 표의 caption이 서로 다른가 — **PASS**

같은 화면에서 `tableKey`만 바꿔 라이브로 두 번 읽었다:
`코드표 · 프로젝트 상태` ≠ `코드표 · 증빙 종류`. 둘 다 각자의 URL에서 AX 표 이름으로
확인했다. (WR-06 수정이 렌더 결과로도 성립한다.)

### C-13. 코드표 `th` / `scope="col"` 개수 — **PASS**

| 측정 | 실측 |
|---|---|
| `th` 총 개수 | **5** |
| `th[scope="col"]` | **5** |
| `th[scope="row"]` | 0 |
| scope 없는 `th` | **0** |
| 머리글 텍스트 | 값 · 이름 · 정렬 · 상태 · 동작 |

두 코드표(project_status · evidence_type) 모두 5/5로 동일. 참고로 같은 실행에서 잰
나머지: 법인카드 7/7 · 사람 6/6 · 계급 4/4 · 거래처 6/6 · HistoryList 4/4 — scope 없는
`th`는 어느 표에도 없다.

---

## D. 교차 점검

### D-14. `/admin`에서 tokens.css로 환원되지 않는 값 — **PASS (위반 0건)**

방법: `<main>`과 그 모든 후손을 열거해 `color` · `background-color` · (두께>0인)
`border-*-color` · `font-size` · 네 모서리 `border-radius` · `box-shadow` · `font-family`
계산값을 뽑고, **같은 문서에서 `:root` 커스텀 속성을 프로브 요소로 환산한 값 집합**과
대조했다(리터럴 기대값을 코드에 쓰지 않는 방식 — `admin-people-detail-link.spec.ts`와
같은 방법).

| 검사 | 허용 집합(런타임 환산) | 위반 |
|---|---|---|
| 색 (글자·배경·테두리) | tokens.css의 모든 색 토큰 + `rgba(0,0,0,0)` | **0** |
| `font-size` | `--fs-*` 7개 = 11·12·14·15·18·24·32px | **0** |
| `border-radius` | `0px` (`--radius: 0`) | **0** |
| `box-shadow` | `none` (`--shadow: none`) | **0** |
| `font-family` | `--font-sans` | **0** |

실측 대표값: `h1` 18px(`--fs-lg`) · 항목 링크 14px(`--fs-base`) `rgb(11,21,18)`(`--fg`)
· 머리글 12px `rgb(78,93,89)`(`--muted`) · `li` 아래 선 `--line`.
hover 상태도 따로 쟀다: `background-color: rgb(243, 247, 245)` = `--surface`(`#f3f7f5`)
— 원시 리터럴 아님. §11 「새 색·서체·radius·그림자 0개 · 카드 0개」 충족.

### D-15. 포커스·키보드 — **키보드/Esc는 PASS, 토큰 이탈 1건 (FAIL)**

**Tab 순서 (= 시각 순서, §10)** — `/admin`에서 Tab 24회 실측:

```
1  본문으로 건너뛰기(#main-content)
2-6 상단 바 주 메뉴 5개(프로젝트·지출결의·법인카드·결재·손익)
7  사용자 트리거(E2E Admin)
8-17 /admin 항목 링크 10개 — 사람·거래처·법인카드 마스터·코드표·권한표·
     정보 노출표·시스템 설정·시스템 상태·행동 로그·보관함 (§6-10 순서 그대로)
18 페이지 밖(BODY)으로 빠져나감
```
건너뛴 정류장·순서 뒤바뀜·포커스 트랩 없음. 모든 정류장에서 `el.matches(':focus-visible')`
가 `true`, outline 두께 `2px solid`.

**Esc 동작**

| 표면 | 실측 | 계약 |
|---|---|---|
| PC 사용자 메뉴 (§6-0 (a)) | Esc 후 `[role=menu]` DOM에서 제거, `document.activeElement` = 트리거 `BUTTON "E2E Admin"`, `aria-expanded="false"` | 닫히고 포커스 복귀 — **PASS** |
| 「더보기」 시트 @375 (§7-8) | Esc 후 `dialog.open === false`, `activeElement` = `BUTTON "더보기"` | 닫히고 포커스 복귀 — **PASS** |

**FAIL-01 — `/admin` 항목 링크의 포커스 링 offset이 §4-4와 부호가 반대다**

| 측정 | 실측 | 계약 |
|---|---|---|
| `outline-width` / `style` / `color` | `2px` / `solid` / `rgb(0, 84, 70)` = `--focus`(`--g-700`) | 일치 |
| `outline-offset` | **`-2px`** (10개 링크 전부) | **`2px`** |

- 위반 문구: `SYSTEM.md` §4-4 표 「포커스 링 | `:focus-visible` 2px `--focus` **offset 2px**.
  `:focus`(마우스)에는 링 없음」, 그리고 §1-2 표 `--focus` 행 「`:focus-visible` 외곽선
  2px, **offset 2px**」. 전역 규칙 `app/globals.css:51-54`는 `outline-offset: var(--focus-offset)`(=2px)을
  올바로 쓰는데, `app/(app)/admin/admin-index.module.css:47-50`이 그 화면에서만
  `calc(-1 * var(--focus-w))`로 덮는다.
- 맥락(정직하게): 이건 이 작업이 발명한 값이 아니라 **기존 두 컴포넌트에서 복사된
  패턴**이다 — `ui/shell/MoreSheet.module.css:105-108`, `ui/shell/BottomTabs.module.css:40-43`
  이 같은 `-2px`를 쓴다(`admin-index.module.css` 머리 주석이 「MoreSheet의 `.link`
  규칙을 그 토큰 그대로 옮겨 쓴다」라고 밝힌 그대로다). `docs/design/DECISIONS.md`에
  inset 변형을 허용하는 기록은 없다(grep 0건).
- 심각도: **낮음(조언)**. 링 자체는 2px `--focus`로 또렷하게 보이고 §11의 「`:focus-visible`
  2px `--focus`」 바닥은 통과한다. 접근성 결함이 아니라 토큰 충실도 이탈이다.
- 선택지 둘 중 하나: (a) `.link:focus-visible`에서 `outline-offset` 덮어쓰기를 지워 전역
  `--focus-offset`을 따르게 한다 — 단 항목 링크가 본문 폭을 꽉 채우고 서로 1px 선으로
  붙어 있어 +2px 링이 이웃 행을 침범한다. (b) 「폭을 꽉 채운 목록 행의 포커스 링은
  inset」을 `DECISIONS.md`에 한 줄 기록하고 §4-4를 그에 맞게 고친다 — 그러면 이미
  같은 값을 쓰는 `MoreSheet`·`BottomTabs`까지 한 번에 정본이 된다. CLAUDE.md 프론트엔드
  규칙(「시스템을 벗어나야 하면 DECISIONS.md에 이유 기록 후 SYSTEM.md를 고친다.
  화면 하나만 예외 금지」)에 비춰 **(b)가 맞아 보인다** — 화면 하나가 아니라 이미
  세 곳의 공통 패턴이기 때문이다.

---

## 판정 요약

| # | 항목 | 판정 | 근거 숫자 |
|---|---|---|---|
| 1 | 머리글·항목 좌측 기준선 (WR-01) | PASS | 델타 0.0px @1280·@375, 요소·텍스트 사각형 둘 다 |
| 2 | 머리글 토큰 (WR-02) | PASS | 12px / rgb(78,93,89) / 600 |
| 3 | 항목 행 높이 | PASS | 44px @1280·@375 (`--touch-min` 44px) |
| 4 | 카드·아이콘·설명 문구 | PASS | 0 / 0 / 0 |
| 5 | 그룹·항목 순서 | PASS | §6-10 표와 원소 단위 일치 |
| 6 | 375 가로 스크롤 | PASS | scrollWidth 375 = clientWidth 375 |
| 7 | 접근성 트리의 머리글 | PASS | 진짜 `<h2>`, h1(1) → h2(2) 중첩 |
| 8 | PC 사용자 메뉴 | PASS | menuitem 3개, 개별 관리자 화면 이름 0개 |
| 9 | 「더보기」 시트 | PASS | `/admin` 링크 1개, 「관리자」 머리글 0개 |
| 10 | role-pm 차단 | PASS | 메뉴 0 / 시트 0 / HTTP 404 |
| 11 | caption 8개 (AX 이름 + 시각 숨김) | PASS | AX `ignored:false`, `display:block`·`visibility:visible`, 1×1 clip |
| 12 | 코드표 caption 구분 | PASS | `코드표 · 프로젝트 상태` ≠ `코드표 · 증빙 종류` |
| 13 | 코드표 `th` / `scope=col` | PASS | 5 / 5 (scope 없는 th 0) |
| 14 | 토큰 밖 색·서체·radius·그림자 | PASS | 위반 0건 (hover 포함) |
| 15 | 포커스·키보드 | **FAIL (조언)** | Tab·Esc 전부 PASS / `outline-offset -2px` ≠ §4-4 `2px` |

**측정 불가(UNVERIFIED) 항목: 없음.** 15개 전부 실제 렌더 결과에서 숫자를 얻었다.

## 저장소 상태

```
$ git status --porcelain
?? .planning/quick/260922-i3k-b-admin-3-a-m3/260922-i3k-DOM-VERIFY.md
```

임시 스펙 2개(`test/e2e/dom-verify.spec.ts`, `test/e2e/mobile-dom-verify.spec.ts`)는
삭제했다. 커밋·푸시 없음, 소스 변경 없음.
