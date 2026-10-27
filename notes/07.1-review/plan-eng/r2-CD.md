# 07.1 /plan-eng-review 2회차 — 그룹 C+D (07.1-05 · 06 · 08 · 10 · 17 / 07.1-02 · 15 · 18 · 19)

대상: PR #301 head 41a5fe2(`/home/user/wt/r301`, 읽기 전용). 코드 기준은 같은 작업 트리(main b9acdd8 + 계획 문서). better-auth 실물은 `/home/user/ERP_PLANT8_260917/node_modules/better-auth`(1.7.5)에서 확인했다. wt에는 node_modules가 없다. 테스트는 돌리지 않았다. 판정은 줄 인용으로 했다.

## 요약

- 1회차 P1 5건(E-P1-05 · 06 · 09 · 12 · 13): **해결 5 · 부분 0 · 미해결 0**
- 1회차 P2 21건(E-P2-05~08 · 18~22 · 26 · 29 · 30 · 45~53): **해결 21 · 부분 0 · 미해결 0**
- 결정 D-E5(06) · D-E6(10) · D-E7(18 · 15)은 사용자 답(추천안)대로 들어갔다. D-E1~E4와 C-1은 맡은 플랜 밖이다(04 · 07 · 12 · 14 · 16).
- 새 결함: **P1 0 · P2 0 · P3 4**
- 웨이브 · 의존 점검(frontmatter 19개 스크립트 대조): 같은 웨이브 안 files_modified 겹침 0, 겹치는 파일인데 depends_on(전이 포함)이 없는 쌍 0, 의존 대상이 같거나 뒤 웨이브인 경우 0.
- 새로 필요한 사용자 결정: 없음.

---

## 1. 1회차 P1 · P2 반영 판정

### 07.1-05

| 번호 | 판정 | 플랜 반영(줄) | 코드 대조 |
|---|---|---|---|
| E-P1-05 | 해결 | :57 truth 「행동 로그는 … `rows.length` … `pruneCount`는 버튼 상태에 쓰지 않는다」 · :166 ④ `page.tsx :127은 count={rows.length}` · acceptance :183 `count={rows.length}` == 1 · `count={pruneCount}` == 1 · E2E :156 `cert_view` 1행 + 정리 행 → `pruneCount` 0 | `app/(app)/admin/action-log/page.tsx:70` `rows = await queryActionLog(session.viewer, filter)` · :76 `pruneCount = rows.filter(... isPrunableActionType ...)` · :127 `<ExportButton filter={filterValues} />`(지금 count 없음). `cert_view`는 `prune-scope.ts:6-13` `UNPRUNABLE_ACTION_TYPES`에 있다. 0046 트리거는 INSERT를 막지 않는다(:11 「INSERT는 막지도 늦추지도 않는다」). 그래서 `pruned_at`을 채운 `cert_view` 행을 넣을 수 있다. |
| E-P2-18 | 해결(정정안을 택함) | :164 ③ 「(E-P2-18 정정: 이것은 「읽기 전 count」가 아니다 …)」 · :290 위협 T-07.1-05-01 「행동 로그: 직렬화 · 파일 전달 전 거부」 | `domain/action-log/index.ts:268` `filterActionLog`가 전부 읽는다 · :271 「SQL where절과 같은 계약」. `LIMIT+1`을 택하지 않은 근거(같은 거르개 화면이 무제한으로 읽음)는 page.tsx:70과 맞다. |
| E-P2-19 | 해결 | :9 files `domain/evidence-records/index.ts` · :162 ② `countEvidenceRecords(viewer, query)` = `listInputsFor` → `countAndSumForScope` 합 · acceptance :184-186 | `domain/evidence-records/index.ts:425-429` `listInputsFor` · :433-435 `countAndSumForScope(viewer, scope, repoFilters)`의 `count` 합 · `repositories/evidence-records.ts:381` 시그니처 `(viewer, scope, filters)`. 05 → 01 depends_on이 있다(:6). |
| E-P2-20 | 해결 | :58 truth · :155-156 behavior · :168 ⑤ · acceptance :187(`cert_view` · `includePruned=1`) | `repositories/action-log.ts:170` `if (!filter.includePruned) conditions.push(isNull(actionLog.prunedAt))`. page.tsx:45 `documentId` · :48 `includePruned === "1"`. `test/e2e`에 `includePruned`를 쓰는 다른 스펙은 0이다(grep). 그래서 정리 행은 다른 스펙 화면에 보이지 않는다. 증빙 화면은 `?batch=`를 받는다(`app/(app)/expenses/evidence/page.tsx:41`). |

### 07.1-06

| 번호 | 판정 | 플랜 반영 | 코드 대조 |
|---|---|---|---|
| E-P1-06 | 해결 | :50 truth · :152 ④ registerPerson (a) 판정 tx에서 회사 키를 잠그고 `:391` 조기 반환을 없앤다 · (b) `createAccount` 뒤 tx에서 `lockSeatKeys(person+company)` → `findRoleForShare` → `listCompanySeatHolders` → 겹치면 **같은 tx 안** `setUserArchived` + `recordAction` → 커밋 뒤 `SeatTakenError` · :138 동시성 ⓐ registerPerson×2 · ⓑ registerPerson×changePersonRole · ⓒ | `domain/people/index.ts:389-391` `withTransaction … if (!seat) return;` · :409 `createAccount`(tx 밖, `roleId: input.roleId`를 넘긴다. 그래서 새 계정은 생성 즉시 대표 보유자로 보인다. 사후 재조회가 상대 계정을 본다). `repositories/users.ts:127` `setUserArchived(viewer, userId, value, tx)`가 tx를 받는다. `domain/archive/index.ts:131-132` tx 안 두 줄이 같은 꼴이다. 잠금을 쥔 tx에서 보상을 커밋하므로 「둘 다 짐」 창이 없다. 순서를 따라가 보면 앞 tx가 상대를 보고 진다 → 보관 커밋 → 뒤 tx는 보관된 앞 계정을 보지 않는다 → 이긴다. |
| E-P2-21 | 해결 | :49 truth · :145 ② 사람 갈래 첫 호출도 `companyRoleIds` · :147 ③ 회사 판정은 :114 조기 반환 앞에 두고 여기서는 키를 잡지 않음 · :130 가짜 tx 키 순서 시험 · :169 acceptance | `repositories/seats.ts:48` `seatLockOrder(viewer, { personIds, admin: input.admin })` — 지금은 새 칸이 버려진다. 플랜이 정확히 이 줄을 고친다. 순서는 :26-30(사람 → 관리자 → 팀 → 본부) 사이에 회사를 넣는다. |
| E-P2-22 / D-E5 | 해결 | :48 truth(구간 규칙 · `spansOverlap` 재사용 · 겹치지 않는 후임 미리 저장) · :132-133 · :136 behavior(퇴사 +3 / 입사 +4 저장 · +3 · 입사일 없음 거부 · 입사일 당기기 거부) · :151 입사일 갈래도 `newSeats` | 사용자 답(「팀장처럼 기간 규칙」)과 같다. `hireDate`는 `registerPerson` 사후 tx 뒤에 저장된다(:460 `saveHireDate`). 그래서 동시 요청이 보는 새 계정 구간은 열린 시작(보수적)이다. 거짓 허용은 없다. |

### 07.1-08

| 번호 | 판정 | 플랜 반영 | 근거 |
|---|---|---|---|
| E-P2-26 | 해결 | :13 `gates: ["/review(한 줄 — .claude/ 아래 .md는 … 빠진다 · E-P2-26)"]` · :61 · :147 | CLAUDE.md §4 「`.claude/`·이 파일 제외」와 같다. 생략 승인 요청 안 대신 `/review`를 택했다. |

### 07.1-10

| 번호 | 판정 | 플랜 반영 | 코드 대조 |
|---|---|---|---|
| E-P1-09 | 해결 | :34 truth 「서버 내부 `auth.api.*` 호출(`ctx.request` 없음 …)은 이 판정이 건드리지 않는다 … :48 단언 그대로」 · :113 ③(a) `ctx.request` 없으면 돌아옴 · :102 단위 · :104 · :145 통합(앱 경로 `getSession()` null · 던지지 않음) | `domain/auth/hooks.ts:128` `if (!ctx.request) throw error;` — 기존 갈래가 같은 구분을 쓴다. `lib/viewer.ts:33` `auth.api.getSession({ headers })`에는 request가 없다. |
| E-P2-29 / D-E6 | 해결 | :31 truth 허용 목록 7개(`/sign-in/email` · `/sign-in/social` · `/callback/:id` · `/sign-out` · `/request-password-reset` · `/reset-password` · `/reset-password/:token`) 밖은 모두 판정 · :101 단위(`/verify-password` · `/update-session` · `/list-accounts` · `/ok` → 판정) | better-auth 1.7.5 `createAuthEndpoint` 경로 30개 실측과 맞다. `dispatch.mjs` `internalContext.path = endpoint.path`(템플릿 경로)이므로 `/callback/:id` · `/reset-password/:token`을 문자 그대로 비교하면 된다. 사용자 답(로그인 · 로그아웃 · 재설정만)과 같다. |
| E-P2-30 | 해결 | :35 truth · :113 ③(c) `getSessionFromCtx(ctx, { disableRefresh: true })` · 훅에서 `@/lib/auth` · `auth.api.*` 금지 | `better-auth/dist/api/routes/session.mjs:246-275` `getSessionFromCtx`는 `getSession()`을 plain 함수로 부른다(dispatch.mjs 주석 「Calling an endpoint as a plain function deliberately skips hooks」). `api/index.mjs:220`이 그것을 export한다. :281 주석(「an earlier hook may have populated ctx.context.session」)대로 훅이 채운 세션 캐시는 라이브러리가 예상한 동작이다. |

### 07.1-17

| 번호 | 판정 | 플랜 반영 | 코드 대조 |
|---|---|---|---|
| E-P2-45 | 해결 | :48 truth · :243 ② `listNextTurnItems` 세 번째 인자 `phase6?: () => Promise<…>` · :245 ③ 두 층 memo(Phase 6 층 · 목록 · 건수) · :233 단위 세 순서(건수 → 목록 · 목록 → 건수 · `Promise.all`)에서 `listPhase6NextTurnItems` 1회 · :262 acceptance | `app/(app)/next-turn-request.ts:15` `listNextTurnItems(viewer, { withDetails: true })` 한 칸 memo · `domain/next-turn/index.ts:31` 시그니처 `(viewer, deps?, options?: { today?: string })` · :63 `listPhase6NextTurnItems(viewer, options?.today ?? seoulToday())`. 고칠 자리가 실제와 같다. files_modified에 `domain/next-turn/index.ts`를 더했다(:9). |

### 07.1-02

| 번호 | 판정 | 플랜 반영 | 코드 대조 |
|---|---|---|---|
| E-P2-05 | 해결 | :170 ② effect `[daysError, result]` + 같은 값으로 다시 제출하면 처리기 안에서 호출 · :163 재제출 E2E · :186 acceptance 호출 2곳 | `app/(app)/admin/notification-rules/rules-client.tsx:182` `setRangeError(null)` → :190 `setRangeError(rangeMessage); return;`. 같은 글자면 상태가 바뀌지 않아 effect가 다시 돌지 않는다. 그래서 재제출 갈래가 필요하고, 플랜이 그것을 짚었다. |
| E-P2-06 | 해결 | :47 truth · :170 ② `reason`을 `daysError` 갈래(:216-217)에서 요약 문장으로 | rules-client.tsx:178 `daysError = rangeError ?? (serverError?.startsWith("일수 범위") ? serverError : undefined)` · :216 `daysError ? ( daysError`. 한 변수에서 두 갈래가 다 바뀐다. |
| E-P2-07 | 해결 | :159 read_first(`StaticTable.tsx:74` key 재마운트 근거) · :165 · ① main에서 RED를 먼저 본다 · 재현이 안 되면 systematic-debugging · ④는 RED일 때만 · :185 acceptance에 「재현 안 됨」 갈래 | 1회차 지적 그대로다. |
| E-P2-08 | 해결 | :46 truth · :123 회귀 `vendor-work-register.spec.ts` U16 · Task 1 verify에 그 스펙 | `vendor-form.tsx:346-347` 계좌 오류는 모두 `result.validationErrors`에서 온다. 그래서 새 effect(`[result]` · `result.validationErrors`)로 바꿔도 U16(예금주 없음)의 포커스는 유지된다. `PanelForm id="vendor-form"`은 :448에 있다. `test/e2e/vendor-work-register.spec.ts:124` U16이 실재한다. |

### 07.1-15

1회차 P1 · P2는 없다(P3 둘 — CG-14 · 머리줄 grep — 반영 확인). D-E7 연동은 :37 truth와 :167 ①에 「대상 = 행 시트 표 + 행 링크 표 · 제외 = 행 시트도 행 링크도 없는 표」, :179 acceptance `행 링크 표` ≥ 1로 들어갔다. 07.1-18 :58과 같은 말이다.

### 07.1-18

| 번호 | 판정 | 플랜 반영 | 코드 대조 |
|---|---|---|---|
| E-P1-12 | 해결 | :59 truth · :172 E2E 대상 `/expenses/evidence` · `/pnl/reserves` · `/cards/purchases` · 견적 표 · :173 `/expenses` · 결재함은 회귀만 | `expenses.module.css:183-197` · `inbox-table.module.css:111-119` 화면 CSS 말줄임이 실재한다. 넷 다 `onRowTap` 표다. |
| E-P1-13 | 해결 | :60 truth · :128-150 「셀 아래 줄 정보 대조」 표(열마다 결정) · :200 (사) 스펙 셋 고침(mobile-card-usage-320 :53-57 · purchase-requests :571 · card-usage :437) · :361 verify 5개 더함 · files_modified에 화면 tsx 8개 | `grep -rln secondaryLine app`은 13개 파일이다. 대조 표 밖 셋(`previous-revision` · `revenue-section` · `projects/[id]/issue-request-table`)은 `onRowTap` · `phoneRowLink`가 없는 표라 대상 밖이다. 이것이 맞다. 시트 표는 Table.tsx:1170 `onRowTap` 갈래, 행 링크 표는 `phoneRowLink` 파일 6개(+ 자체 꼴 둘)다. |
| E-P2-46 | 해결 | :62 truth · Task 1 ④(라) · :224 acceptance `p2Values.length > 0 ?` == 0 | `ui/table/Table.tsx:1165` `{p2Values.length > 0 ? (` 실재. |
| E-P2-47 | 해결 | :61 truth(주 행 셀 `title` 0 · 접힌 줄 탭 칸에만 ref로 textContent `title`) · Task 1 ④(마) | Table.tsx:1176 `aria-label={… 상세 보기}`. 「새 prop 0」과 ReactNode 셀이 서로 어긋나지 않게 정했다. |
| E-P2-48 | 해결 | Task 1 ④(나) :195 — `width: 0` · `min-width: max(100%, 5em)` + 글자 상자 세 속성을 공용으로 옮김 · 숫자 · 선택 · 동작 칸 제외 · :225 점검표 | 지금 꼴은 `expenses.module.css:188-191`에 있다. (아래 새 P3 N1 참고 — 여러 칸에 동시에 거는 것은 이 저장소에서 처음이다) |
| E-P2-49 | 해결 | :65 truth(폰 갈래 `inline-flex` · 닿는 자리 목록 · 줄 높이 실측) · :286 reversibility 「래퍼 줄 높이는 44로 늘 수 있다」 · :294 grep 13곳 · :303 E2E · :325 `:where(` | 1회차 지적(display 변경 · 파급 목록 · reversibility 모순)이 셋 다 들어갔다. |
| D-E7 | 반영 | :58 truth(시트 9 + 행 링크 8) · Task 2 ① (가) 선택자 `.table:is([data-row-sheet], :has([data-row-link]))` · :247 E2E(`/projects` · `/leave` · 발행 요청 · 지급 완료) · :275 acceptance | 사용자 답(「상세로 가는 표도 포함」)과 같다. `request-panel.tsx:62`는 `a[data-row-link]`를 찾기만 한다(표가 아님) — :238이 이를 확인했다. |

### 07.1-19

| 번호 | 판정 | 플랜 반영 | 코드 대조 |
|---|---|---|---|
| E-P2-50 | 해결 | :48 truth · files `ui/detail-screen/HashFocus.tsx`(새) · Task 1 ④ · :169 acceptance(DetailScreen 지시문 · 훅 0 / HashFocus `use client` · `hashchange` ≥ 1) · :301 build | 서버 호환 파일에 클라이언트 조각을 import하는 꼴이라 App Router에서 맞다. |
| E-P2-51 | 해결 | :151 (다) `headingId="evidence"` + div id 삭제 · :152 (라) 폼 `div#evidence` `tabIndex=-1` + 같은 조각 · :138 화면마다 `#evidence` 1개 · :170 acceptance · `expense-undo-resubmit.spec.ts:257` 고침 | 1회차 인용(`expense-document.tsx:215-216` · `expense-form.tsx:1154`)과 맞다. |
| E-P2-52 | 해결 | :50 truth · :201 ③ `<tr>` 하나 · `{notice}` 한 번(「폰에 알림 없음」 갈래 기각) · :192-193 E2E 375 · 1280 알림 DOM 1 · :218 acceptance | `quote-table.tsx` `footer={(notice) => (<tr><td colSpan…>…{notice}</td></tr>)}` 구조와 맞다. |
| E-P2-53 | 해결 | :49 truth · :199 ② `registered` P2 + `summary` = 행 시트 `등록` 줄 글자 · 18이 단 `secondaryText`는 지움 · :191 대리 · 구매 완료 픽스처 · :219 acceptance | Table.tsx:955 접힌 줄은 `summary ?? cell`만 쓴다. 18 :140(`registered` `secondaryText`)과 19 ②(지움)가 서로 맞물린다. 19 → 18 depends_on도 있다. |

---

## 2. 결정 반영

- **D-E5** (06): :48 truth와 :132-136 behavior가 같은 기준(구간 규칙)이다. 1회차 「:42 대 :120」 모순은 사라졌다.
- **D-E6** (10): 허용 목록 7개 · 거부 기본 · `lib/viewer.ts` 내부 호출은 무판정(:31 · :34). 사용자 답 문장과 같다.
- **D-E7** (18 · 15): 18 :58 · Task 2 ①, 15 :37 · :167. 두 플랜의 대상 · 제외 문장이 같다.
- D-E1~E4 · C-1: 맡은 플랜 밖(04 · 07 · 12 · 14 · 16)이다.

---

## 3. 재계획 diff에서 찾은 새 결함

**[P3] (confidence: 5/10) 07.1-18-PLAN.md:195 — `width: 0; min-width: max(100%, 5em)`을 한 행의 글자 칸 여러 개에 동시에 거는 것은 검증되지 않은 꼴이다**
- 플랜: 「`.table[data-row-sheet]`의 데이터 행 주 행 글자 칸(`.cell` 중 `.alignRight` 숫자 칸 · `.selectCell` 선택 칸 · 버튼만 든 동작 칸 제외 …)에 … 검증된 꼴을 옮긴다」
- 코드 `app/(app)/expenses/expenses.module.css:186-191`: 이 꼴은 한 표에서 **한 칸**(`.titleCell`)에만 걸려 있다. 주석 「다른 열이 쓰고 남은 폭만 쓰게 한다」. 글자 칸 둘 이상이 모두 `min-width: 100%`를 요구하면 남은 폭 배분이 브라우저 자동 표 배치에 맡겨진다. 그 결과 한 칸이 5em 바닥까지 눌리고 숫자 칸이 넓게 남을 수 있다. behavior의 단언(줄 수 ≤ 1 · `scrollWidth ≤ innerWidth`)은 이 배치를 잡지 못한다.
- 고칠 내용: (나)에 「글자 칸이 둘 이상인 표(증빙 목록 거래처 · 상태 · 구매 요청 품목 · 상태 등)는 320 · 375에서 칸별 폭을 점검표에 남기고, 한 칸이 5em 바닥에 붙으면 그 표의 주 칸 하나에만 꼴을 건다」 한 줄.

**[P3] (confidence: 4/10) 07.1-18-PLAN.md:60 · :200 — `secondaryText`가 같은 글자를 DOM에 두 벌 만든다. 고칠 스펙을 셋만 찾았다**
- 주 행 `.cellSecondary`(폰에서 숨김)와 접힌 줄(PC에서 `display: none`)에 같은 글자가 모든 폭에서 함께 있다. 플랜은 `card-usage.spec.ts:437`(`toHaveCount(1)`) · `mobile-card-usage-320` · `purchase-requests:571`만 고친다. 표본 grep으로는 다른 깨짐을 찾지 못했다. `payment-batch.spec.ts:131` `rowOf`는 `tbody tr`를 품목명으로 거르므로 접힌 줄이 걸리지 않는다. `evidence-intake.spec.ts:164`의 `확인 필요` exact는 `status.ts:37` detail이 다른 글자다. 다만 대상 화면을 여는 스펙이 39개라 전수 확인은 아니다.
- 고칠 내용: Task 1 (사)에 「대조 표의 `secondaryText` 글자로 `grep -rn "getByText(" test/e2e`를 돌려 exact `toHaveCount` · 단일 로케이터 단언을 찾아 같은 `.filter({ visible: true })` 꼴로 고친다」 한 줄.

**[P3] (confidence: 4/10) 07.1-02-PLAN.md:206 — PX2 고르기 픽스처(협력사 거래처 3 + 50건)를 공유 erp_test에서 지우지 않는다**
- 고유 접미사 덕분에 이 스펙의 정확히 3 · 50 단언은 결정적이다. 하지만 53개 거래처가 남아 뒤에 도는 폰 스펙(`mobile-vendors` 등 — 18이 verify에 넣음)의 거래처 목록 · 쪽 수에 섞인다. 05가 E-P2-20에서 같은 문제를 afterAll 지우기로 푼 것과 맞지 않는다.
- 고칠 내용: 「afterAll에서 접미사 거래처를 보관(또는 삭제)한다 — 지울 수 없으면 숨김」 한 줄.

**[P3] (confidence: 5/10) 07.1-05-PLAN.md:156 — 행동 로그 상한 E2E가 5,001행 · 5,000행 화면을 그대로 그린다**
- 코드 `app/(app)/admin/action-log/page.tsx:96-115`는 `rows` 전부를 `tableRows`로 만들어 표에 싣는다(쪽 나눔 없음, 행마다 `detailLines`). 그래서 E2E가 5,000행 넘는 표를 두 번 렌더 · 하이드레이트한다. CI 시간 제한에 닿을 수 있다. 거짓 통과는 아니다.
- 고칠 내용: 활성 사례는 `&actionType=settings_change` 대신 「5,000행 = 픽스처 한 행을 다른 토큰으로 둔 상태」처럼 같은 크기를 유지하거나, 스펙 timeout을 명시한다. 점검표에 렌더 시간 한 줄.

새 P1 · P2: 없음. 06(registerPerson 사후 tx · 키 순서) · 10(`getSessionFromCtx` · 템플릿 경로 비교) · 17(Phase 6 memo) · 19(HashFocus · 합계 행 한 행)의 바뀐 부분은 코드와 맞는다(위 1절 인용).

---

## 4. 웨이브 · 의존 점검 (바뀐 웨이브 07→1, 09 · 02→2, 14는 09 뒤)

frontmatter 19개를 스크립트로 대조했다(`wave` · `depends_on` · `files_modified`):

| 웨이브 | 플랜 |
|---|---|
| 1 | 01 · 03 · 04 · 06 · 07 · 08 · 10 |
| 2 | 02(← 06) · 05(← 01 · 03) · 09(← 01) · 11(← 04) · 12(← 01 · 03 · 04) · 13(← 04 · 06) |
| 3 | 14(← 07 · 02 · 06 · 13 · 09) |
| 4 | 15 · 16 · 17 |
| 5 | 18(← 09 · 15) |
| 6 | 19 |

- 같은 웨이브 안 files_modified 겹침: **0**
- 겹치는 파일인데 앞 플랜이 뒤 플랜의 depends_on(전이 포함) 밖인 쌍: **0**
- depends_on 대상이 같은 웨이브이거나 뒤 웨이브인 경우: **0**
- 본문 서술도 맞다: 02 :7 · :116, 06 :31 · :100, 05 :39(03 → 05 `keys.ts` · `registry.test.ts`), 17 :25(웨이브 4 유지 사유).
