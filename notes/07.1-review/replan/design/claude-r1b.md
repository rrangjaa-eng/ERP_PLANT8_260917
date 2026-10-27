# 07.1-18 D-E7 행 링크 표 — 독립 디자인 검토 (claude-r1b)

- 저장소 head 41a5fe2 · 대상 `.planning/phases/07.1-carryover-followup/07.1-18-PLAN.md`(must_haves :58-69 · 대조 표 :128-150 · Task 1 ④ :193-204 · Task 2 :231-282)
- 읽기 전용. 다른 검토 파일은 읽지 않았다. 재현 실험은 scratchpad 합성 HTML + 저장소 Playwright 1.63 Chromium(/opt/pw-browsers/chromium-1243) — 실제 화면 DOM 실측은 아님(앱 · DB 미기동)
- 판정: **막음 1 · 참고 6**

## 막음

### B1. 공용 말줄임 꼴이 칸(td)에 `width: 0` · `min-width`를 거는 꼴이라, 행 링크 표에서 넘치거나 칸이 무너진다 — 고칠 화면 CSS는 인수 기준이 막는다

- 계획: Task 1 ④(나)(:198) 「칸에 `width: 0` · `min-width: max(100%, 5em)` … 글자를 담는 상자(칸 자신 · 아래 줄이 있으면 `Table.tsx:820` `<div>`)에 overflow · text-overflow · nowrap」, Task 2 ①(가)(:255)가 같은 꼴을 `:has([data-row-link])` 표에 넓힌다.
- 옮겨 오는 「검증된 꼴」은 칸이 아니라 **칸 안 상자**에 건다: `app/(app)/expenses/expenses.module.css:187-197`(`.titleCell` = 블록 span · `.titleCell .link` 블록에 말줄임), `app/(app)/approvals/inbox-table.module.css:112-119`(`.rowTap` · `.rowLink` = 블록 버튼 · 링크).
- 재현(320 폭 · 본문 288 · 자동 표 배치 · 행 셋째 칸 nowrap 숫자 · `border-collapse: separate`):
  - td `width:0; min-width:max(100%,5em); nowrap; overflow:hidden; text-overflow:ellipsis` + 긴 글자 링크 → **표 폭 539px · 문서 scrollWidth 539**. 자동 배치에서 열 최소 폭은 칸 내용 min-content라 td `width: 0`이 줄이지 못한다. 칸 안 블록 span(`/projects` `.nameCell` 꼴)·inline-flex 링크(`/leave` `.rowLink` 꼴)도 같은 539.
  - 같은 td 규칙 + 발행 요청 `.projectLink` 꼴(grid `minmax(0,max-content)` · `.clip`) → 넘침은 없지만 **프로젝트 칸 16~29px · 링크 0~13px**(규칙 없는 지금 124 · 108px). td `min-width` 5em 바닥은 Chromium에서 먹지 않았다.
  - 비교: 칸 안 span에 `width:0; min-width:max(100%,5em)`(expenses 꼴) → 표 넘침 없음 · 칸 96px(5em 바닥 유지).
- 행 링크 표에 닿는 자리:
  - `/projects` 이름 칸: `app/(app)/projects/projects-table.tsx:142-146` `span.nameCell` + `projects.module.css:301-314`(`display: block` · `min-width: 9em`/폰 `5em`). 계획 꼴대로면 320에서 표가 넘쳐 Task 2 behavior(:247 `scrollWidth ≤ innerWidth`) · fails_when(:268)에 걸린다. 넘침을 `max-width: 0`으로 바꿔 막아도 글자는 블록 `.nameCell` 줄 안에 있고 그 상자는 overflow가 보임이라 **td의 `text-overflow`가 닿지 않는다**. 결과는 「…」 없이 잘린 글자이고, SP-71-1(07.1-15 :167) 「한 줄 말줄임」과 다르다.
  - 고칠 길이 막혔다: Task 1 인수 기준(:216)이 `app/(app)/projects/` 아래 `.css` 변경을 0으로 막고(Task 3 :325도 `projects.module.css` 0), `projects-table.tsx`는 files_modified(:7-36)에 없다. `Table.module.css` 공용 후손 규칙으로 칸 안 상자를 잡는 길은 계획에 적혀 있지 않다. 그 길을 택하면 §4 공통 「즉석 방법으로 대체」가 된다.
  - 발행 요청 목록: 계획 꼴의 td `width: 0`은 넘침을 만들지 않지만, 위 재현처럼 프로젝트 칸이 다른 열에 밀려 줄어들 수 있다. `issue-requests.module.css`도 Task 2 인수 기준(:277)이 변경을 0으로 막는다.
- 고칠 방향(계획 문장 안에서): (나)에 「폭 두 속성은 칸이 아니라 칸 안 글자 상자에 건다. 칸에 걸 때는 `max-width: 0`이고 5em 바닥은 칸 안 상자로 남긴다」를 적는다. 칸 안 상자가 화면 모듈 클래스(블록 · inline-flex · grid)인 행 링크 표(`/projects` `.nameCell` · `/leave` `.rowLink` · 발행 요청 `.projectLink`)에 공용 규칙이 어떻게 닿는지(공용 후손 선택자 또는 그 화면 파일 허용)를 Task 2 ①에 정한다. Task 2 behavior에 「말줄임 칸의 보이는 폭 ≥ 5em」을 더하면 칸이 무너지는 것도 잡힌다.

## 참고

### R1. (항목 1) 폰 주 행 P1 셀 안 추가 내용 — 여섯 표 모두 두 줄 함정(견적 표 `flex-basis:100%` 꼴)은 없다
- 지급 완료 `paid-list.tsx:107-115` 제목 = 화면 CSS 말줄임 블록 링크 · 이체액 숫자 칸. 발행 요청 `issue-request-list.tsx:39-46` grid + `.clip` · 금액 숫자 칸.
- 지급 대상 `payment-targets-table.tsx:1050-1066`: `titleSecondLine`의 `.wideSecondLine`은 폰에서 `display:none`(`expenses.module.css:200-203`). 증빙 칸 `.evidenceCell`(`:328-333` inline-flex wrap)은 폰에서 `evidenceAction`이 null(`:986`)이고 결재 중 행은 증빙 상태가 없어(`:145-153`) 자식이 하나다. 단 `phone`은 수화 뒤 JS 판정(`:325`)이라 첫 렌더에는 `증빙 확인` 링크가 같이 그려진다 — 일시적.
- 프로젝트 목록 상태 칸 `.statusSecondLine`은 폰에서 숨김(`projects.module.css:339-341`). 결재함 `.overdraw`도 폰에서 숨김(`inbox-table.module.css:106-108`). 휴가 목록은 추가 내용 없음.
- 남는 문제는 줄 수가 아니라 B1(말줄임 상자 위치)이다. 휴가 `.rowLink`는 폰에서 `display: inline-flex`(`leave.module.css` 폰 갈래)인 원자 인라인이라 td `text-overflow`가 그 안 글자를 자르지 못한다. Blink는 넘치는 원자 인라인을 통째로 숨기고 「…」만 남길 수 있다(실측 필요). `종류 · 기간`은 짧아(`labels.ts:26-33`) 실제로 넘칠 일은 드물다.

### R2. (항목 2) `합계`가 폰 판독기에서 사라지고, 상세 화면에도 없다
- Task 2 ①(라)(:258)는 「폰 판독기 사용자의 전체 정보는 상세 화면」이라고 하지만, 대조 표(:146-147)는 지급 완료 `차이` · 발행 요청 `합계`를 「상세 화면과 같은지 확인하지 않는다」고 적었다.
- 발행 요청 상세(`/projects/{id}?issueRequest=`)의 `합계`는 `issue-request-table.tsx:225-228` `.pcSecondary`라 폰에서 `display:none`(`project-detail.module.css:306-311`)이다. 메모 열 summary(`:254-259`)에도 없다.
- 지금은 목록 주 행 `.cellSecondary`로 판독기가 읽는다. 계획 뒤에는 `aria-hidden` 접힌 줄(`Table.tsx:1168`)에만 남아, 폰 보조기기 경로가 하나도 없게 된다. 막음 근거 규칙은 찾지 못해 참고로 둔다. 상세 화면에 있다는 근거를 대지 못하면 ①(라) 문장을 「보이는 글자만 접힌 줄 · 판독기 경로 없음」으로 정직하게 적거나, 그 열은 주 행 접근 이름에 남긴다(`sr-only`)를 정한다.
- 대체 갈래 (아)(:203)와 대조 표 아래 문단(:150)의 「행 시트 `items`에 한 줄」은 행 링크 표에는 시트가 없어 쓸 수 없다. 다만 `합계 …` · `차이 …`는 접힌 줄 맨 앞이고 짧아 320에서 잘릴 가능성은 낮다. 행 링크 표가 잘리면 「멈추고 SUMMARY」라는 한 줄만 있으면 된다.

### R3. (항목 3) 누름 영역 · 충돌 — 문제 없음
- 재현: tbody(`.rowLinkGroup`) · tr(휴가 · 결재함 `tr:has(.rowLink)`)이 기준인 `::after`는 td `overflow: hidden` 아래서도 잘리지 않는다. 다른 칸 · 접힌 줄 중심의 `elementFromPoint` = 행 링크(tbody 기준), tr 기준은 주 행만. 지금과 같다.
- 결재함 `button.rowTap`에 `data-row-link`를 달아도 `.rowLinkGroup` 규칙은 닿지 않는다(결재함은 `phoneRowLink` 아님). 기존 시험 · 코드는 모두 `a[data-row-link]`로 한정한다(`grep -rn data-row-link test/e2e` 13곳 · `request-panel.tsx:62`).
- Task 3 링크 히트 영역은 `[data-row-link]`를 뺀다(:288) — 충돌 없음.

### R4. (항목 4) E2E 스펙 · 판정식
- Task 2 verify(:267)의 기존 스펙 일곱(mobile-leave-list · mobile-payment-pushed · mobile-projects-collection · mobile-expense-320 · mobile-issue-requests-error · mobile-people · people)은 `test/e2e/`에 있다. 새 `mobile-table-two-line.spec.ts`는 이 플랜이 만든다.
- 「말줄임 걸린 행 링크(`scrollWidth > clientWidth`)」(:247)는 인라인 `<a>`(`/projects` `.nameCell` 안 링크 — 인라인 요소 scrollWidth는 0) · inline-flex(`/leave`) · `.clip`을 안에 둔 grid 링크(발행 요청)에서 참이 되지 않는다. 고르는 기준이 비면 접근 이름 단언이 빈 단언이 된다. 판정은 말줄임이 걸린 상자(`getComputedStyle(…).textOverflow === "ellipsis"`인 조상 또는 자손 — `issue-requests.spec.ts:532-535`가 쓰는 꼴)로 고친다.
- 긴 글자 픽스처 출처가 적혀 있지 않다. 프로젝트 이름은 `issue-requests.spec.ts:519-520`의 `db.update(projects).set({ name: longName })` 꼴로 만들 수 있다. 휴가 기간은 고정 형식이라 길게 만들 수 없다 — 「휴가는 말줄임 픽스처 없음 · 줄 수만」으로 적는다. `차이`(이체액 ≠ 지급 총액, `payment-single.spec.ts:188-217` 꼴) · `합계`(금액 열 권한자) 픽스처도 behavior에 이름을 적어 두면 좋다.
- `test/e2e/issue-requests.spec.ts:517-544`(발행 요청 목록 375 · 320 긴 이름 · 넘침 0)는 같은 목록을 재는데 Task 2 verify에 없다(CI는 돈다).
- 인수 기준 grep(:274-279)은 그대로 돈다(`:has(\[data-row-link\])`는 BRE에서 리터럴 — `.table:is([data-row-sheet], :has([data-row-link]))`에 맞는다 · 결재함 2곳 · 휴가 1곳).

### R5. (항목 5) 07.1-15 SP-71-1 · UI-SPEC W1
- 07.1-15 :37 · :162 · :167과 이 플랜 :58 · :62 · :255는 대상(행 시트 표 + 행 링크 표) · 제외(행 시트도 행 링크도 없는 표) · 아래 줄 갈래(행 링크 표는 상세 화면)가 같다.
- `07.1-UI-SPEC.md`는 D-E7을 반영하지 않았다(`grep -c D-E7` = 0). W1 :157(「행 시트가 없는 표 … 말줄임을 걸지 않고」) · :161(「폰 · 행 시트 있는 표에서만」) · :166(「행 시트가 있는 표에서 주 행 셀의 아래 줄은 빠지고」) · SP-71-1 :566(제외 「행 시트 없는 표」) · :605가 낡은 문장이다. 이 플랜은 UI-SPEC을 `<context>`(:111)로 싣는다. SYSTEM(07.1-15 뒤)이 정본이라 막음은 아니다. 실행자 · `/design-review`가 헷갈리지 않게 플랜 truth에 「UI-SPEC W1 · SP-71-1의 『행 시트 (있는/없는) 표』 문장은 D-E7로 대체 — 기준은 07.1-15 뒤 SYSTEM §7-3」 한 줄을 두는 것을 권한다.

### R6. 대조 표 범위 확인
- `grep secondaryLine`: 행 링크 표 가운데 `expenses-table.tsx` · `certs/events/events-table.tsx` · `inbox-table.tsx` · `leave-table.tsx`는 0이다. `projects-table.tsx:156`(기간 P2) · `payment-targets-table.tsx:1172`(이체액 P3)는 대조 표 「변경 없음」과 맞다. 빠진 열은 없다.
