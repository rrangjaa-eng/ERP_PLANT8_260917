# 07.1 /plan-eng-review — 그룹 D (07.1-02 · 07.1-15 · 07.1-18 · 07.1-19)

대상 main b9acdd8. 공학 관점만 봤다(공용 컴포넌트 파급 · 회귀 시험 · E2E 경로 · #298 의존). 디자인 판단 없음. 체커 r2 · 디자인 final-check에서 처리된 지적(B1 겹침 fixture, B2 SelectOption 타입, F1~F5)은 다시 내지 않는다.

## 0. #298 왼쪽 레일 의존 — main에 들어왔나

- `git merge-base --is-ancestor 6e8d262 HEAD` → ancestor(#296, 2026-10-27 02:04 +0900) · `d30f619` → ancestor(#298 merge, 03:25 +0900). `git log d30f619..HEAD` = `b9acdd8 docs(07.1): … (#299)` 하나 — main은 #298 + 계획 커밋뿐이다.
- 플랜이 다시 읽으라는 덩어리가 실제로 그 커밋에 있다: #298 `ui/permission-grid/PermissionGrid.module.css`(2줄) · `docs/design/tokens.css`(+9) · `ui/detail-screen/DetailScreen.module.css`(2줄) · `ui/shell/SideRail*`; #296 `ui/table/Table.module.css`(11) · `quote-table.tsx`(44) · `project-detail.module.css`(7).
- SYSTEM 줄 인용 확인: :219 `## 3. 간격` · :429 필터 줄 · :849 `### 7-3. 표` · :876~878 폰 전략 · :909 (다) · :959 (차) · :1189 §7-14 · :1239 `Select` · :1385 §10, DECISIONS :2367 `## 2026-10-26 — 1차 메뉴를 왼쪽 레일로` — 모두 맞다. `--shell-top` = tokens.css:107 · ≥1280 `0px` :242.
- 결론: 15 · 18 · 19의 external_depends_on은 충족. merge-base 검증 줄은 지금 항상 통과한다(무해, 남겨도 됨).

---

## 07.1-02 (작은 화면 수정 묶음 — S2 · S3 · PC5 · PC7 · PX2 · PF8)

### Architecture
- 경계: 클라이언트 포커스 · 키 · CSS뿐, 서버 · 권한 변화 0 — 맞다.
- 공용 파급 두 곳: (1) `vendor-form.tsx`는 `/admin/vendors` 밖에서도 쓰인다 — `app/(app)/expenses/[id]/pick-vendor.tsx:107 <VendorForm … workplace={{ name, onVendor }} />`. 계좌 전용 effect를 `focusFirstInvalid`로 바꾸면 지출결의 화면 안 거래처 만들기에서도 이름 · 사업자번호 오류가 포커스를 가져간다. (2) `ui/pick-dialog/PickDialog.module.css`는 모든 고르기 대화상자의 폰 시트다.

### 지적
- **[P2] (confidence: 7/10) 07.1-02-PLAN.md:164 · rules-client.tsx:181-192 — `focusFirstInvalid("rule-form")`를 제출 처리기에서 바로 부르면 첫 범위 오류 때 포커스가 안 간다.**
  플랜: 「범위 오류로 막힌 제출이면 … `document.getElementById("days")?.focus()` 대신 `focusFirstInvalid("rule-form")`를 부른다」. 코드: `setRangeError(rangeMessage); return;` — `aria-invalid`는 다음 렌더에야 붙고(`error={daysError}`), 지금 파일에는 `getElementById("days")?.focus()`가 없다(grep "focus" 0건). 같은 처리기 안에서 부르면 `[aria-invalid="true"]`가 아직 없어 아무 일도 하지 않는다. E2E가 잡으므로 거짓 통과는 아니지만 실행자가 헤맨다.
  고칠 내용: ②를 「카드 폼 :74-77처럼 `useEffect(() => { if (daysError) focusFirstInvalid("rule-form"); }, [daysError, result])`」로 바꾸고, 없는 코드 인용(`getElementById("days")`)을 지운다.
- **[P2] (confidence: 6/10) 07.1-02-PLAN.md:164 · rules-client.tsx:178 · :217-218 — 서버가 돌려준 범위 오류 갈래가 빠졌다.**
  코드: `const daysError = rangeError ?? (serverError?.startsWith("일수 범위") ? serverError : undefined);` 그리고 `) : daysError ? ( daysError`. 플랜은 「범위 오류로 막힌 제출이면」 패널 이유를 `저장할 수 없음 — 일수 1칸 · 일수 고치기`로 — 클라이언트 막힘만 뜻하는지 서버 갈래도 포함하는지 불명. 서버 갈래가 그대로면 S3 truth 「`{min}~{max}` 글자가 보이는 요소 1개」가 서버 경로에서 깨진다(칸 오류 + 패널 이유 둘). E2E는 클라이언트 경로만 잰다.
  고칠 내용: ②에 「`daysError`가 있으면(클라이언트 · 서버 둘 다) 이유 = 요약 문장」을 명시하거나, 서버 갈래는 범위가 클라이언트에서 먼저 막혀 도달하지 않음을 근거와 함께 적는다.
- **[P2] (confidence: 6/10) 07.1-02-PLAN.md:168 · delete-holiday.tsx:43-55 · page.tsx:169-180 — PC7 원인 진단이 재현 근거 없이 「성공 경로 setPending(false) 없음」이다.**
  `StaticTable`는 `<Fragment key={row.key}>`(StaticTable.tsx:74, key = `row.id`)라 삭제 → `router.refresh()`로 행이 빠지면 `DeleteHoliday`가 언마운트되고, 되돌린 행은 새로 마운트되어 `pending=false`로 시작한다. 잠김은 refresh가 끝나기 전에 `되돌리기`를 누르는 경합에서만 남을 수 있다. RED가 「행이 사라질 때까지 기다린 뒤 되돌리기」면 main에서 실패하지 않을 수 있다.
  고칠 내용: Task 2 ①에 「RED가 main에서 실패하는 것을 먼저 본다 — 실패하지 않으면 추측 수정하지 않고 systematic-debugging으로 재현 조건(되돌리기 시점)을 찾는다」 한 줄. 수정 자체(성공 경로 `setPending(false)`)는 무해.
- **[P2] (confidence: 6/10) 07.1-02-PLAN.md:128 · vendor-form.tsx:379-383 · pick-vendor.tsx:107 — 거래처 폼 포커스 변경의 일하는 자리 회귀 시험이 없다.**
  코드: `useEffect(() => { if (hasAccountError && firstErrorId) document.getElementById(firstErrorId)?.focus(); }, …)` — `firstErrorId`는 `errorFields` 순서(계좌 · 담당자 `CONTACTS_ADD_ID` 등)이고, `focusFirstInvalid`는 DOM 순서의 `aria-invalid` 칸이다. 담당자 오류는 `vendor-contacts-add` 버튼(aria-invalid 아님)이라 새 호출로는 포커스가 가지 않는다(지금도 계좌 오류일 때만 가므로 회귀는 아님). 바뀐 효과가 `pick-vendor`(지출결의 화면)에도 걸리는데 Task 1 verify는 people · vendors · roles 스펙만.
  고칠 내용: verify에 지출결의 화면 안 거래처 만들기를 여는 기존 스펙(pick-vendor를 쓰는 스펙 — `grep -rln "pick-vendor\|새 거래처" test/e2e`)을 더하고, 요약 줄 「고치기」 버튼(:426 `firstErrorId`)과 자동 포커스가 같은 칸인지 behavior 한 줄.
- **[P3] (confidence: 9/10) 07.1-02-PLAN.md:223 · PickDialog.module.css:8 — 인수 기준 grep이 지금도 통과한다.** `.dialog { … max-height: var(--sheet-max-h);` 가 이미 있다(기본 블록). 폰 블록 :344 `height: var(--sheet-max-h);`가 남아 있어도 grep ≥1. 고칠 내용: 「`sed -n '/max-width: 699.98px/,/^}/p' … | grep -c 'height: var(--sheet-max-h)'` == 0」 처럼 폰 블록의 고정 height 제거를 재게 바꾼다(E2E가 행동은 잡으니 P3).
- **[P3] (confidence: 7/10) 07.1-02-PLAN.md:109 — `card-form.tsx:205-220`은 「클라이언트 검증 뒤 호출」이 아니라 두 번째 서버 오류 effect다.** :213 `if (result.validationErrors !== undefined) focusFirstInvalid("corp-card-owner-form");`. 사람 · 계급 폼에는 클라이언트 검증이 없다(`<Form noValidate>` — ui/form/Form.tsx:23, 서버 오류만). 고칠 내용: 인용 설명을 「서버 오류 effect 두 개」로, ③의 「클라이언트 검증으로 막힌 제출 직후」는 삭제.
- **[P3] (confidence: 6/10) 07.1-02-PLAN.md:199 — 50줄 고르기 픽스처의 결정성.** 폰 스펙은 mobile-375 프로젝트(공유 erp_test, desktop 뒤)에서 돈다. `evidence-pick.spec.ts`는 증빙 표를 비우는 `desktop-evidence` 프로젝트(playwright.config.ts:68-87) 소속이다. 후보 수가 다른 스펙 데이터에 섞이면 「3줄」이 3+N이 된다. 고칠 내용: 「후보는 새 사용자 · 고유 접미사로 범위를 좁혀 정확히 3 · 50」 한 줄과 어느 PickDialog(증빙? 거래처?)인지 명시.
- **[P3] (confidence: 5/10) code-tables.module.css:65-71 · evidence-type-fields.tsx:83-85** — `.taxRuleSection`은 `PhoneOnly` 한 줄 글자에도 붙는다. flex 세 줄을 `> :global(.single-column)`로 옮기면 폰 갈래는 flex가 빠진다(글자 한 줄이라 보이는 변화 거의 0). 실측 행에 폰 갈래 한 줄 추가 권장.

### Tests (커버리지)
```
S2 사람 빈 제출 포커스 ............ people.spec        [OK]
S2 거래처(admin) .................. vendors.spec       [OK]
S2 거래처(지출결의 pick-vendor) ... -                  [GAP]
S2 계급 ........................... roles.spec         [OK]
S3 클라이언트 범위 오류 ........... notification-rules [OK]
S3 서버 범위 오류 갈래 ............ -                  [GAP]
PC5 MoreSheet 안 Ctrl+Enter ....... leave-document     [OK]  (768 RailSheet도 dialog — 선택)
PC7 되돌린 줄 삭제 재활성 ......... holidays.spec      [OK? RED 재현 조건 미정]
PX2 3줄 / 50줄 .................... mobile-pick-dialog-sheet(새) [OK, 픽스처 결정성 주의]
PF8 폭 720 · 배경 전폭 ............ code-tables.spec   [OK]
회귀 evidence-pick ................ verify에 있음      [OK]
```
경로 확인: 열거한 스펙 전부 존재(`test/e2e/{people,vendors,roles,notification-rules,leave-document,holidays,code-tables,evidence-pick}.spec.ts`), `test/unit/app/notification-rules-boundaries.test.ts` 존재, `pnpm test:e2e` = `playwright test`, `db:reset:test` 존재. `scripts/codex-design-review/lib.ts`의 `VIEWPORTS`(:10) · `countLines`(:206) 실재, test→scripts import는 eslint boundaries 허용.

### Performance
해당 없음.

---

## 07.1-15 (SYSTEM · DECISIONS 개정 — 문서만)

### Architecture / Code quality
- 문서만 · 위험 경로 0 · 세션 머지 — 맞다. `docs/**`만 바뀐 PR은 CI가 돌지 않으므로 `test/unit/design-system-docs.test.ts`(SYSTEM이 참조하는 커스텀 속성 실재 :214 · 옛 토큰 이름 :233)는 로컬 실행이 유일한 가드다 — 플랜 verify에 있어 OK. `docs-limits.test.ts`는 SYSTEM · DECISIONS 길이를 재지 않는다(ARCHITECTURE · OPERATIONS 등만) — 그 시험을 돌려도 이 플랜 변경을 보지 않는다(무해, P3).
- 인용한 줄 전부 실제와 일치(위 0절). `--touch-min` 44px 실재(tokens.css:133).

### 지적
- **[P3] (confidence: 6/10) 07.1-15-PLAN.md 실행 순서 절 「같은 웨이브 4의 16 · 17은 SP-71 규칙에 기대지 않는다」** — 15가 머지된 뒤 18 · 19가 머지되기 전, main SYSTEM은 SP-71-2(폰 체크박스 래퍼 44) 등을 이미 요구하지만 화면은 아직이다. 그 사이 16 · 17(웨이브 4, 15와 병행)의 `/design-review`가 main SYSTEM을 기준으로 잡으면 SP-71 위반을 그 묶음 결함으로 볼 수 있다. 고칠 내용: 15 SUMMARY에 「SP-71-1~6 구현 몫 = 07.1-18 · 19 — 그 전 묶음의 /design-review는 SP-71 줄을 판정 대상에서 뺀다」 한 줄.
- **[P3] (confidence: 5/10) 인수 기준 `grep -c "07.1" docs/design/DECISIONS.md`가 6 이상 늘어난다** — 지금 32건, 본문 언급으로도 늘어난다. 머리줄로 재는 편이 정확: `grep -c '^## 2026-1.*07.1' …`.

### Tests
```
DECISIONS → SYSTEM 순서 ..... 커밋 순서(사람 확인)      [수동]
문서 구조 · 토큰 실재 ...... design-system-docs.test   [OK]
U-1 결정 기록 .............. SUMMARY 줄 grep            [OK]
Select 두 적용 선행 ........ grep "disabled: true" page.tsx ≥1 → 아니면 멈춤 [OK]
```

---

## 07.1-18 (공용 표 폰 2줄 · 머리글 높이 · 320 사람 표 · 터치 44)

### Architecture — 파급 범위(실측)
- `@/ui/table`를 쓰는 화면 파일 26, `StaticTable` 15, `onRowTap`(행 시트) 9: action-log · quote-table · card-usage-section · budget-table · purchase-list · card-usage-list · evidence-table · reserves-table · submissions-section. 행 링크(`data-row-link`, 시트 없음) 표: expenses-table · inbox-table · payment-targets · paid-list · projects-table · leave-table · issue-request-list · events-table · request-panel.
- 지금 「두 목록만」 한 줄 말줄임은 공용 표가 아니라 **화면 CSS**에 있다: `app/(app)/expenses/expenses.module.css:183-197`(`.titleCell { width: 0; min-width: max(100%, 5em); }` + 말줄임) · `app/(app)/approvals/inbox-table.module.css:113-118`. 공용 `Table.module.css`에는 말줄임 · `table-layout` 규칙이 없다.

### 지적
- **[P1] (confidence: 7/10) 07.1-18-PLAN.md:129 · :147 — 트레이서 시험이 공용 규칙을 재지 않는다(거짓 통과).**
  플랜 :129 「E2E(mobile-, 375 · 320 — 행 시트가 있는 표): `/expenses` · 결재함 · `/expenses/evidence` …」, :147 「한 줄 말줄임 선택자가 행 시트를 켠 표에만 걸리게」. 그런데 `/expenses`와 결재함은 행 시트가 없는 행 링크 표(`onRowTap` 0 — grep)이고, 한 줄 말줄임이 이미 화면 CSS(위 두 파일)에 있다. 그래서 공용 규칙이 없어도 두 화면 단언은 통과하고, 공용 규칙이 실제로 걸리는 시트 표(9개) 중 시험에 든 것은 `/expenses/evidence` 하나뿐이다.
  고칠 내용: :129 대상을 「시트 표 — `/expenses/evidence` · `/pnl/reserves` · `/cards/purchases` · 프로젝트 상세 견적 표(각 화면 CSS에 말줄임 없는 것)」로 바꾸고, `/expenses` · 결재함은 「이미 화면 CSS로 맞음 — 회귀만」으로 분리한다.
- **[P1] (confidence: 7/10) 07.1-18-PLAN.md:49 · :147 · test/e2e/mobile-card-usage-320.spec.ts:53-57 — option-a의 `.cellSecondary` 숨김이 기존 E2E를 깨고, 18 verify에 그 스펙이 없다.**
  플랜 :147 「셀 아래 줄(`.cellSecondary`)은 option-a면 같은 갈래에서 행 시트를 켠 표의 주 행에만 보이지 않게」. `/cards`(card-usage-list — `onRowTap` 있음)의 `결제 합계` 열은 P1이고 `secondaryLine: totalSecondLine`(외화 · 공급가)이다. 기존 시험 :53-57 `for (const segment of ["USD 900.00", "@1,474.89", "공급가 1,327,401"]) { … expect(lines, segment).toBe(1); }` — 숨기면 `getClientRects().length` 0이 되어 실패한다. 18은 「`/cards`는 … 07.1-19가 PA3 뒤에 잰다」(:129)고 하지만 숨김 규칙은 18 머지 때 `/cards`에 이미 걸린다. 같은 꼴의 시트 표 `secondaryLine` 열이 다섯 더 있다(quote-table 1 · card-usage-section 2 · purchase-list 3 · card-usage-list 2 · reserves-table 1). 플랜은 「시트에 없는 아래 줄을 가진 표가 나오면 … 멈추고 SUMMARY」라 실행 중 멈춤 확률이 높다.
  고칠 내용: (1) 18 verify에 `mobile-card-usage-320.spec.ts` · `mobile-quote-doors.spec.ts` · `mobile-projects-budget.spec.ts` · `mobile-purchase-requests-finish.spec.ts` · `mobile-320-no-overflow.spec.ts`를 더한다. (2) 실행 전(계획 단계)에 시트 표 다섯의 `secondaryLine` 정보가 각 행 시트에 있는지 표로 확인해 두고, 없으면 그 열에 `secondaryText`를 단다(18 files_modified에 그 화면 `.tsx`를 더한다) — 실행 중 멈춤을 계획 결정으로 바꾼다.
- **[P2] (confidence: 7/10) 07.1-18-PLAN.md:147 · Table.tsx:952-956 · :1165 — `secondaryText`만 있는 행은 접힌 줄이 안 그려진다.**
  코드: `const p2Values = columns.filter((column) => column.priority === "p2")…` 그리고 `{p2Values.length > 0 ? ( <tr className={styles.collapsedRow} …`. P2 값이 빈 행(또는 P2 열이 없는 표)에서는 secondaryText 글자가 갈 자리가 없다. 고칠 내용: ④에 「접힌 줄 조건 = P2 값 또는 secondaryText 글자가 하나 이상」.
- **[P2] (confidence: 7/10) 07.1-18-PLAN.md:147 · types.ts:26 · :32 · :43 — 「`title` = 전체 글자」를 「새 prop 0」으로 낼 수 없다.**
  `cell: (row: Row) => ReactNode` · `summary?: (row: Row) => ReactNode` · `secondaryLine?: (row: Row) => ReactNode` — 셀은 ReactNode라 `title` 문자열을 얻을 길이 없다. 재사용할 수 있는 기존 문자열 접근자는 `copyText?: (row: Row) => string`(types.ts, 격자 Ctrl+C용)뿐이다. 그리고 접힌 줄 칸의 접근 이름은 `aria-label={`${rowLabel ? rowLabel(row) : rowId} 상세 보기`}`(Table.tsx:1176)라 그 칸 글자가 말줄임되면 「title 또는 접근 이름 = 전체 글자」 단언을 만족하지 못한다.
  고칠 내용: ④에 「`title`은 `copyText`가 있는 열만 · 없는 열은 렌더 뒤 `textContent`(클라이언트) 또는 말줄임에서 뺀다」 중 하나를 정하고, 접힌 줄 칸에는 전체 글자 `title`을 단다고 적는다.
- **[P2] (confidence: 6/10) 07.1-18-PLAN.md:147 — 공용 한 줄 말줄임의 구현 꼴이 빠졌다.** 자동 표 배치(`table-layout` 없음)에서 칸에 `nowrap` + `overflow: hidden`만 주면 칸이 글자 길이로 늘어나 말줄임이 안 되고 320에서 가로 넘침이 난다. 이 저장소가 쓰는 검증된 꼴은 화면 CSS의 `width: 0; min-width: max(100%, 5em)` + 안쪽 block 말줄임(expenses.module.css:184-197 주석에 이유). 고칠 내용: ④에 「기존 두 목록의 꼴을 공용으로 옮긴다 · 숫자 칸(`.alignRight` nowrap)은 말줄임하지 않는다(T-07.1-18-02)」를 명시.
- **[결정 필요] 행 링크 표(시트 없음, `data-row-link`)는 한 줄 말줄임 대상인가** — 07.1-18-PLAN.md:48 제외 목록은 「행 시트가 없는 표(`StaticTable` · 사람 목록)」, :147 선택자는 「행 시트를 켠 표에만」. 두 기준이 `projects-table` · `leave-table` · `payment-targets` · `paid-list` · `issue-request-list` · `events-table`(행 링크 → 상세 화면에 전체 글자가 있음)에서 갈린다. 플랜대로면 이 표들은 줄바꿈 그대로라 PA1 목적(:77 「공용 표 하나에서 두 줄로 고정」)과 어긋난다.
  - (가) 「전체 글자에 닿을 길이 있는 표」 = 행 시트 또는 행 링크 → 둘 다 한 줄 말줄임(추천 — 행 링크 접근 이름이 전체 글자, 상세 화면에 전체 글자).
  - (나) 시트 표만 — 행 링크 표는 지금처럼 줄바꿈, SP-71-1 문장과 PA1 목적 줄을 「시트 표」로 좁힌다.
  - (다) 행 링크 표는 07.2로 넘기고 이번엔 실측 기록만.
- **[P2] (confidence: 6/10) 07.1-18-PLAN.md:225 — 전역 `label:has(> input[type="checkbox"])` 44 규칙의 레이아웃 파급.** `label`은 기본 inline이라 `min-height`가 먹지 않는다 — `display`를 바꿔야 하고, 그러면 그 규칙이 닿는 모든 폰 화면(MoreSheet · 필터 줄 · 폼 체크박스 · 표 선택 칸 `.selectLabel` · PermissionGrid)의 배치가 바뀐다. reversibility 줄(:204 「보이는 모양 변화 0」)과도 어긋난다. 고칠 내용: ②에 display 처리와 「요소 규칙이 닿는 자리 목록(grep 결과)」을 점검표에 남긴다는 줄, verify에 `mobile-shell.spec.ts`(MoreSheet) · `mobile-action-log.spec.ts`(이미 있음)를 더한다.
- **[P3] (confidence: 6/10) 07.1-18-PLAN.md:154 · :192 · :232 — 작업 중 E2E가 바뀐 공용 표의 기존 폰 스펙 56개 중 넷만 돈다.** CLAUDE.md §5상 전체는 CI 몫이지만 공용 CSS라 실패가 CI에서 한꺼번에 나온다. 권장: 각 태스크 끝에 `CI=true pnpm exec playwright test --project=mobile-375 --no-deps`(폰 스펙만, 한 워커) 한 번.
- **[P3] (confidence: 5/10) 화면 판독기** — option-a에서 `.cellSecondary`를 `display: none`으로 숨기고 같은 글자를 접힌 줄 칸에 실어도, 그 칸의 `aria-label`(「… 상세 보기」)이 내용 글자를 덮어 판독기는 아래 줄 정보를 못 읽는다. 시트에서 읽히므로 결함은 아님 — 점검표 한 줄.

### Tests (커버리지)
```
PA1 시트 표 한 줄(공용 규칙) ........ mobile-table-two-line: /expenses/evidence 하나 [GAP: 다른 시트 표 0]
PA1 /expenses · 결재함 .............. 화면 CSS가 이미 함 → 공용 규칙 증명 아님        [거짓 통과]
PA1 행 링크 표(projects · leave …) ... -                                              [GAP · 결정 필요]
시트 없는 표(StaticTable · people) .. mobile-table-two-line                          [OK]
secondaryText(D-7106 번호) .......... mobile-table-two-line                          [OK]
.cellSecondary 숨김 회귀(/cards 외화) mobile-card-usage-320 — verify에 없음           [GAP → CI 빨강]
머리글 ≤47 · 선택 열 무관 ........... table-header-height(새)                        [OK]
C-93 320 people ..................... mobile-people                                  [OK]
PA8 · PA9 ........................... mobile-history-list · mobile-vendors           [OK]
S4 래퍼 44 · 링크 히트 ............... mobile-touch-targets                           [OK]
행 링크 누름 면 회귀 ................. mobile-touch-targets(:217)                     [OK]
전역 label 규칙 파급(MoreSheet 등) ... -                                              [GAP]
```
경로 확인: 열거 스펙 모두 존재(`mobile-table-first-visible-cell` · `mobile-people` · `people-list-helpers.ts` · `mobile-history-list` · `mobile-vendors` · `mobile-touch-targets` · `mobile-action-log` · `mobile-roles` · `settings` · `people`). 새 스펙 이름 `mobile-*.spec.ts`는 mobile-375 프로젝트(MOBILE_SPEC_PATTERN, playwright.config.ts:50) — 맞다. `table-header-height.spec.ts`는 desktop 프로젝트에서 `setViewportSize`로 700까지 — 맞다.

### Performance
`:has()` 요소 규칙 하나 · 행마다 문자열 함수 하나 — 영향 없음.

---

## 07.1-19 (해시 도착 포커스 · 카드 목록 폰 열 · 견적 합계 · Ctrl+E 힌트 · 표본)

### 지적
- **[P2] (confidence: 7/10) 07.1-19-PLAN.md:133 · ui/detail-screen/DetailScreen.tsx:1-2 · :53-62 — 공용 `Section`은 서버 컴포넌트 호환 파일이다.**
  파일 머리 `import type { ReactNode } from "react"; import styles …` — `"use client"` 없음, 50개 화면 파일이 쓰고 `expense-document.tsx`(서버 컴포넌트, `"use client"` 없음)가 `<DetailScreen.Section title="증빙">`을 쓴다. 「마운트될 때 주소 해시가 자기 제목 id와 같으면 포커스」는 effect라 클라이언트가 필요하다. 파일 전체에 `"use client"`를 달면 DetailScreen 틀 전체가 50화면에서 클라이언트 번들로 넘어간다.
  고칠 내용: ④에 「`headingId`가 있을 때만 그 제목 옆에 작은 클라이언트 조각(같은 폴더 새 파일 1 — files_modified에 추가)이 해시를 보고 포커스 · `DetailScreen.tsx`는 서버 호환 그대로」로 못 박는다.
- **[P2] (confidence: 6/10) 07.1-19-PLAN.md:133 · expense-document.tsx:215-216 — `#evidence` 도착 대상이 `Section` 제목이 아니다.** `<DetailScreen.Section title="증빙"> <div id="evidence" …>` — 제목에는 `headingId`가 없다. 공용 동작을 받으려면 `headingId="evidence"`로 옮기고 안쪽 `div id`를 지워야 한다(같은 id 두 개 금지). `expense-form.tsx:1154`(`<div id="evidence" className={styles.evidencePick}>`, 클라이언트 폼)은 `Section`이 아닐 수 있어 같은 공용 동작이 닿지 않는다 — 두 번째 구현이 생긴다. 고칠 내용: ④ 문장을 「문서: `headingId="evidence"` · div id 삭제 / 폼: 같은 공용 조각을 그 제목에 단다」로 확정.
- **[P2] (confidence: 6/10) 07.1-19-PLAN.md:172 · quote-table.tsx:3176-3185 — 폰 합계 행을 따로 그리면 `{notice}`가 두 번 마운트된다.**
  코드: `footer={(notice) => ( <tr> <td colSpan={columns.length} className={styles.footerCell}> {\`합계 (공급가액 · ${lines.length}줄)\`} … {notice} </td> </tr> )}` — 합계 문구와 바닥 알림(붙여넣기 · 저장 결과 등)이 한 칸이다. 「실행가 합 셀 오른쪽 끝 = 실행가 열 오른쪽 끝」을 맞추려면 칸을 나눠야 하고, PC 갈래를 「그대로」 두고 폰 행을 CSS로 바꿔 끼우면 `notice`(알림 영역)가 두 줄에 중복된다. 고칠 내용: ③에 「한 행 안에서 칸을 나누고 PC/폰 표시만 클래스로 가르며 `{notice}`는 한 번만 렌더」 또는 「폰 행에는 notice를 두지 않는다」를 정하고, 기존 `quote-table.spec.ts`의 바닥 알림 단언을 회귀 목록에 적는다.
- **[P2] (confidence: 6/10) 07.1-19-PLAN.md:170 · card-usage-list.tsx:108-111 · :158-163 · Table.tsx:952-955 — `등록`을 P2로 내리면 둘째 줄(대리 · 구매 등록자 · 날짜)이 폰에서 사라진다.**
  열: `{ key: "registered", header: "등록", priority: "p1", cell: registeredFirst, secondaryLine: registeredSecond }`. 접힌 줄은 `column.summary ? column.summary(row) : column.cell(row)`만 쓰고 `secondaryLine`은 버린다. `registeredSecond` = `${row.registeredByName} ${row.registeredOn?.slice(5)}`(대리 등록 · 구매 완료 건). 고칠 내용: ②에 「그 정보가 행 시트에 있는지 확인 — 없으면 `summary`로 `registeredFirst · registeredSecond`를 한 글자로」 한 줄 + 대리 등록 픽스처 단언.
- **[P3] (confidence: 6/10) 07.1-19-PLAN.md:47 · :206 · evidence-table.tsx:868 — 「포커스 없으면 첫 행」은 지금 동작(「행동이 있는 첫 행」)과 다르다.** 코드: `const shownKeyAction = rows.map(keyActionOf).find((action) => action !== null) ?? null;`. 첫 행에 행동이 없으면 플랜 문장대로는 힌트에서 Ctrl+E가 빠진다. 포커스 행을 얻는 기존 길도 없다(`Table` props에 포커스 콜백 없음 — evidence-table.tsx:226 `td[data-grid-focus]` DOM 판별이 유일). 고칠 내용: 「포커스 없으면 행동이 있는 첫 행(지금 그대로)」 · 「포커스 행은 `focusin` + `td[data-grid-focus]`로 읽는다(새 Table prop 0)」.
- **[P3] (confidence: 5/10) 07.1-19-PLAN.md:133 — 클라이언트 이동 직후 `location.hash` 읽기 시점.** App Router는 Link 이동 때 history를 커밋 단계에서 갱신하고 스스로 해시로 스크롤한다. 마운트 effect가 갱신 전 주소를 읽거나 Next 스크롤이 뒤에 와서 위치를 바꾸면 깜빡 실패한다. E2E가 클릭 이동을 재므로 거짓 통과는 아니다. 권장: effect + `hashchange` 둘 다 · 단언을 `toBeFocused()` 폴링으로.

### Tests (커버리지)
```
PC4 다른 화면 → 문서 #evidence ..... hash-focus(새) 1280 · 768       [OK]
PC4 작성 중 폼 #evidence ........... hash-focus                     [OK]
PC4 정산 → 상세 #pre-settle-check .. hash-focus(375 · 320)           [OK]
PC4 같은 화면 회귀 ................. pre-settle-check.spec           [OK]
PC4 없는 id 해시 ................... behavior 줄 있음, 스펙 미지정    [GAP 작음]
PA3 /cards P1 셋 · 줄 수 ........... mobile-card-usage-320          [OK]
PA3 등록 둘째 줄(대리 · 구매) ...... -                              [GAP]
PA5 폰 합계 · 계산 불가 ............ mobile-quote-doors             [OK]
PA5 바닥 알림 중복 없음 ............ -                              [GAP]
PA6 dl ≤720 ........................ revenue-section                [OK]
PC6 Ctrl+E 한 행동 · 힌트 낱말 ..... evidence-list-audit            [OK]
PE1 떼기 컨트롤 0 .................. evidence-list-audit            [OK]
PJ9 표본 낱말 ...................... dev-components                 [OK]
```
경로 확인: `pre-settle-check` · `mobile-card-usage-320` · `card-usage` · `mobile-quote-doors` · `quote-table` · `revenue-section` · `evidence-list-audit` · `dev-components` · `evidence-attach` 모두 존재. `evidence-list-audit` · `evidence-attach`는 `desktop-evidence` 프로젝트(EVIDENCE_WIPE_SPECS, playwright.config.ts:68-87 — 증빙 표를 비우고 한 워커) — 그 스펙 안에서 375 · 320을 `setViewportSize`로 재는 것은 맞다. `gallery-client.tsx:149` `PASTE_NOTICES` 실재.

### Performance
해당 없음.

---

## 실패 모드 표

| 경로 | 실패 | 시험 있음? | 오류 처리 있음? | 사용자에게 |
|---|---|---|---|---|
| 02 알림 규칙 범위 오류 포커스 | 제출 처리기에서 동기 호출 → 첫 오류 때 포커스 안 감 | 있음(E2E가 잡음) | 없음 | 조용함(포커스만 안 감) |
| 02 서버 범위 오류 갈래 | 범위 글자 두 곳(칸 · 패널) | 없음 | 없음 | 보임(중복 문구) |
| 02 지출결의 안 거래처 만들기 | 바뀐 포커스 effect가 일하는 자리에서 다르게 동작 | 없음 | — | 보임 |
| 02 공휴일 되돌리기 | 경합 원인이면 RED 재현 실패 → 추측 수정 | 조건 미정 | — | 보임(버튼 잠김) |
| 02 폰 고르기 시트 | 3줄 시트 88dvh 그대로 | 있음 | — | 보임 |
| 15 SYSTEM 선행 | 16 · 17 /design-review가 아직 구현 안 된 SP-71로 판정 | 없음 | — | 조용함(리뷰 소음) |
| 18 공용 한 줄 말줄임 | 자동 표 배치에서 320 가로 넘침 | 있음(scrollWidth) | — | 보임 |
| 18 .cellSecondary 숨김 | /cards 외화 · 공급가 줄 폰에서 사라짐 · 기존 E2E 실패 | 기존 스펙 있으나 verify 밖 | 「멈춤」 규칙뿐 | CI 빨강 / 정보 사라짐 |
| 18 secondaryText만 있는 행 | 접힌 줄이 안 그려져 번호 사라짐 | 픽스처가 P2 값이 있으면 못 잡음 | 없음 | 조용함 |
| 18 행 링크 표 | 규칙 밖으로 남아 3줄 행 계속 | 없음 | — | 보임 |
| 18 전역 label 44 | MoreSheet · 폼 체크박스 배치 변화 | 부분 | — | 보임 |
| 19 Section 해시 포커스 | 서버 컴포넌트 파일에 effect → 빌드 오류 또는 50화면 클라이언트화 | build가 잡음 | — | 조용함(번들) |
| 19 폰 합계 행 | notice 중복 마운트 · 알림 두 번 | 없음 | — | 보임 |
| 19 등록 P2 | 대리 등록자 · 날짜 폰에서 사라짐 | 없음 | — | 조용함 |

## 결정 필요
1. **18 행 링크 표(시트 없음)의 한 줄 말줄임 범위** — (가) 시트 + 행 링크 표 둘 다(추천) · (나) 시트 표만, SP-71-1 · PA1 문장을 좁힘 · (다) 행 링크 표는 07.2로.
