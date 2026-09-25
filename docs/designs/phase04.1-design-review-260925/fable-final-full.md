# 최종 전체 검토(디자인 리뷰 반영 회차 뒤) — Codex 대신 Fable — 한도가 풀리면(9/29 이후) Codex 재확인 필요

- 대상: `.planning/phases/04.1-approvals-leave/04.1-01..07-PLAN.md` · `04.1-UI-SPEC.md` · `04.1-VALIDATION.md` · `docs/design/DECISIONS.md`(70cf943에서 더한 2026-09-25 항목 둘) @ `7710c99`(`claude/phase-04.1-plan-1iqtwe`)
- 기준: `ROADMAP.md` 04.1 절 · `REQUIREMENTS.md` EXP-03/04/05 · LEAV-01 · ADMN-04 · CLAUDE.md(TDD · pnpm · `any` 금지 · §6 · §7) · `docs/design/SYSTEM.md` · `tokens.css` · 방금 반영한 디자인 리뷰 `docs/designs/plant8-erp-phase04.1-design-review-260925.md`(원장 #1~#28 · 지시 T1~T19)
- 존중한 것: 직전 최종 검토(`phase04.1-eng-review2-260925/fable-final-full.md`)의 W-1 · W-2 · N-1~N-3와 각 플랜 Review Dispositions · Round 원장(B-A2 · C-N02 deferred 등), 사용자 고정 결정(05-CONTEXT D-96 · D-97, CEO 리뷰 IA, Phase 4 P0 · `Ctrl+` · 진행 바 없음, 시트 중첩 없음)과 디자인 결정 28건은 다시 제기하지 않았다. UI-SPEC 「사용자 확인 대상 결정」 다섯 건은 설계상 사용자 확인 대기이므로 지적이 아니다.
- 방식: 읽기 전용. 델타 `git diff 47181b2..7710c99 -- .planning docs/design`(UI-SPEC 205줄 · 05-PLAN 112줄 · 06-PLAN 100줄 · 01~04 · VALIDATION · DECISIONS)을 전부 읽었고, 그 뒤 일곱 플랜 전체를 UI-SPEC 문자열 · 역할 · 플랜 간 계약 · 웨이브 순서 · 검증 명령과 `<fails_when>` · VALIDATION 행 · 코드 인용으로 교차했다. 인용된 코드(`ui/select/Select.tsx` · `ui/button/Button.tsx` · `ui/table/Table.tsx` · `docs/design/system/sheet-modal.html`)는 Grep/sed로 실측했다.

## 판정

**막는 문제(BLOCKER) 없음.** 경고 5건, 메모 6건. 디자인 리뷰 T1~T18이 UI-SPEC과 플랜에 같은 문자열로 들어갔고(교차 Grep 불일치 0), 새 검증은 전부 `<fails_when>`이 있으며 공허하게 통과하는 핵심 검사를 찾지 못했다. 경고 다섯은 모두 한두 줄 수정이다 — 가장 실질적인 것은 W-1(설정 힌트가 `—`의 뜻을 되살림)과 W-2(02·06의 zod 계약 문장 불일치)다.

## BLOCKER

없음.

## WARNING

### W-1. 01-PLAN의 `담당 계급` 힌트가 디자인 결정 #9(T12)와 반대 — `—`를 「계급 무관」의 뜻으로 되살린다
- 위치: `04.1-01-PLAN.md:309` — 「`role_id` 힌트는 `— 이면 계급 무관 · 그 범위의 누구나`(계획 가정 — UI-SPEC에 없는 한 문장)」. 같은 줄이 「04.1-04는 keys.ts를 고치지 않으므로 라벨·힌트·optionLabels·dynamicOptions는 여기서 최종형으로 적는다」라 이 힌트가 그대로 배포된다.
- 충돌: `04.1-UI-SPEC.md:243` S8 「`1단 담당 계급`(select, 빈 값 = 계급 조건 없음의 라벨 `계급 무관` — `—`를 쓰지 않는다. 같은 섹션에서 `—`는 「빈 자리」 한 뜻만 갖는다, #9)」 · `04.1-04-PLAN.md`(truth · Task 1 ① · behavior E2E · fails_when — 빈 값 라벨 `계급 무관`). 화면에는 `계급 무관` 옵션이 보이는데 힌트는 `—`를 말하므로 §7(문구 최소 · 한 뜻)과 #9의 근거를 같은 칸에서 어긴다. 04 E2E는 옵션 글자만 보므로 이 힌트를 잡지 못한다.
- 수정(한 줄): 01:309의 `role_id` 힌트를 없앤다(라벨 `계급 무관`이 뜻을 말한다 — §7-2 관리자 화면이라도 같은 사실 두 번 금지) 또는 `계급 무관 = 그 범위의 누구나`로 바꾼다. UI-SPEC S8 Copywriting에는 이 힌트가 없으므로 UI-SPEC 쪽 변경은 없다.

### W-2. `kind` · `half` zod 계약이 02와 06에서 반대 문장
- 위치: `04.1-02-PLAN.md:231` 「`submitLeaveAction`(zod: kind enum · …)」 vs `04.1-06-PLAN.md:293` ② 「`submitLeaveAction` · `resubmitLeaveAction` · `previewLeaveAction` zod는 `kind` · `half`를 문자열로 받아 도메인으로 넘긴다 — zod enum이 다른 기본 문구로 먼저 거부하지 않게」 · `04.1-01-PLAN.md:282`(T1 — 빈 종류·시간은 `countLeaveQuarters`가 칸 오류로 거부).
- 영향: 웨이브 순서(02 → 06)상 최종 트리는 06이 맞지만, 02 실행자는 enum을 만들고 06 실행자가 다시 풀어야 하며, 02 텍스트만 읽으면 01의 T1 상수(`LEAVE_KIND_EMPTY_ERROR`)가 닿지 않는 경로가 된다. 웨이브 3~5 사이에 `—` 제출은 zod 기본 문구로 거부되는 과도 상태다(구현 결함은 아님).
- 수정(한 줄): 02:231을 「zod: kind · half 문자열(빈 값·목록 밖 거부는 01 `countLeaveQuarters` 한 곳 — T1)」로 바꾼다(02 Task 2의 `resubmitLeaveAction`도 같은 문장). 06:293은 그대로 두거나 「02가 이미 문자열」로 줄인다.

### W-3. 「PC 행 `승인` 즉시(실물과 다름)」를 SYSTEM.md에 적는 자리가 비어 있다
- 위치: `docs/design/DECISIONS.md:567` 「**범위**: … SYSTEM.md는 04.1 개정 제안 A3(§6-1 결재함 문단)을 반영할 때 이 결정을 함께 적는다」 vs `04.1-UI-SPEC.md:453-457` A3(§6-1에 적을 문장 목록에 「PC 행 3차 승인·반려(행에 `회수` 없음)」까지만 — 「즉시 · 실물과 다름」 없음, Grep `즉시` 0) · `04.1-05-PLAN.md:217` Task 1 ①(A3를 「UI-SPEC A3 그 문장대로」 고친다).
- 영향: 05 실행자가 UI-SPEC A3대로 SYSTEM.md를 고치면 DECISIONS가 예고한 문장이 SYSTEM.md에 들어가지 않는다 — CLAUDE.md §6 「DECISIONS 기록 후 SYSTEM.md를 고친다 · 화면 하나만 예외 금지」의 후반이 빠진다(디자인 리뷰 #12의 「DECISIONS에 적어 화면 하나만 예외를 막는다」 취지가 SYSTEM.md까지 닿지 않음).
- 수정(한 줄): UI-SPEC A3 둘째 항목의 §6-1 문장 목록에 「PC·태블릿 행 `승인`은 즉시 실행(실물 `sheet-modal.html:218`과 다름 — DECISIONS 2026-09-25)」 한 구절을 더하고 05:217 ①이 그것을 따르게 한다.

### W-4. UI-SPEC frontmatter `status: approved`가 본문 「draft로 되돌렸다」와 어긋난다
- 위치: `04.1-UI-SPEC.md:4` `status: approved` vs `:592` 「2026-09-25 … 개정 — `status: draft`로 되돌렸다. 체커 재실행(반영 지시 T19) 뒤 다시 승인한다」. 체커 재실행(T19)은 아직 없다(`.continue-here.md`도 반영 전 상태).
- 영향: GSD 도구·실행자는 frontmatter를 읽으므로 T19 없이 승인된 것으로 보인다. 계약 모순은 아니지만 게이트 우회 가능성.
- 수정(한 줄): frontmatter를 `status: draft`로 두고 `/gsd-ui-phase` 체커(T19)를 돌린 뒤 `approved`로 올린다 — 또는 :592의 문장을 체커 결과로 갱신한다.

### W-5. VALIDATION 동기화가 부분적 — 03 T3 행만 더해지고 01 · 05 · 06의 새 검사 행이 없다
- 위치: `04.1-VALIDATION.md:95`(T3 행 신규) · `:115`(04 T12 갱신) · `:141`(06-02 T7 갱신)은 있으나, 다음이 0건이다(Grep): 01 T1 단위(`종류 비어 있음`/`LEAVE_KIND_EMPTY_ERROR`), 05 T14 통합(`ROUTE_BLOCKED_DRAFTER_LINE` · `04.1-05-PLAN.md:281·305` 새 verify), 05 T4(`aria-haspopup`) · T15(`aria-describedby`) · T18(`formatLeaveTitle`) · T6 · T11 E2E, 06 T10(시작일만 · 종료일 자동 채움) · #24(`네트워크 · 다시 신청`) E2E.
- 영향: 직전 검토 N-3(「나머지 행은 `/gsd-validate-phase`가 채운다」)의 범위였지만, 이번 회차가 일부만 손으로 더해 표가 「최신인 듯 보이는」 상태가 됐다. 실행 게이트(`nyquist_compliant: false`)는 그대로라 막지는 않는다.
- 수정(한 줄): 실행 전 `/gsd-validate-phase 04.1`로 위 행을 채우거나, 이번 회차 새 검사 아홉을 같은 형식으로 더한다.

## NOTE

- N-1. `ui/button/Button.tsx:31·44` — `pending`은 실제 `disabled`를 건다(`isDisabled = pending || disabled`, `...rest` 뒤에 `disabled=`). 05:197의 인용은 정확하고 `aria-disabled`는 rest로 통과한다. 다만 **누른 버튼** 자체는 요청 중 실제 `disabled`라 포커스가 `body`로 떨어진다 — §7-17이 「누른 버튼 = pending」으로 정했으므로 04.1의 문제가 아니라 Phase 4 개정 ⑦(소유자) 몫. 조치 없음.
- N-2. 「힌트에 일수가 보인다」는 옛 문장이 둘 남았다: `04.1-UI-SPEC.md:554` Assumptions #4 「(힌트에 일수가 보이므로 신청자가 나눠 낼 수 있다)」 · `04.1-07-PLAN.md:113` 「힌트가 그 일수를 보여 준다(UI-SPEC Assumptions #4)」. #5(T8) 뒤 일수는 잔고 행 `이번 신청 N일`에만 있다. 사실은 그대로(숫자는 여전히 보인다)라 문구만 「잔고 행에 일수가 보이므로」로.
- N-3. `04.1-UI-SPEC.md:172-177` Accent 1(「이 밖에는 없다」)의 3차 목록에 #24로 새로 생긴 3차 `다시 신청`(Copywriting :226)과 S9 관리자 3차(`잔고 고르기` 등)가 없다. 관리자 쪽은 `/admin/*`라 P0 밖이지만 `다시 신청`은 한 줄 추가 대상.
- N-4. `04.1-06-PLAN.md:318` T1 수락 기준 grep `selectOption\((\{ *label: *)?"(—)?"`는 `selectOption({ value: "" })` 모양을 잡지 못한다 — 검사 의도(스펙이 `—`를 고르지 않는다)는 behavior 문장이 지키므로 공허함은 작다. `value:` 갈래를 정규식에 더하면 닫힌다.
- N-5. 각 플랜의 「Round N — plan-design-review」 번호가 플랜마다 다르다(01·03 = Round 5, 04 = Round 4, 05·06 = Round 6). 플랜별 카운터라 정상이나 검색할 때 헷갈린다.
- N-6. `.planning/phases/04.1-approvals-leave/.continue-here.md`는 아직 「디자인 지적 반영 → 최종 전체 검토」가 남은 상태로 적혀 있다(668b851). 다음 세션 재개 전에 `/gsd-pause-work`로 갱신(T19 체커 · `/review` · PR #60 설명).

## 확인한 것(문제 없음)

### 델타(디자인 리뷰 반영) — UI-SPEC ↔ 플랜 문자열·역할
- #1 · T1 · T3: UI-SPEC :86(Select 행) · :227(막힘 — 신청 폼 필수) · :245(S9 `잔고 비어 있음 · 잔고 고르기`) · :281(연도 `—` → 올해) · A5(:464) ↔ 01:282 · :304(`countLeaveQuarters` 문자열 입력 · `LEAVE_KIND_EMPTY_ERROR` · `LEAVE_HALF_EMPTY_ERROR` · `DEFAULT_HALF_PERIOD` export) ↔ 06:293 · ③(폼이 세 상수를 import, 수락 기준 grep) ↔ 03 ③(`bucket` 문자열, 통합 사례) ↔ 06 Task 3 ①·②·behavior(`—` 선택 단계 삭제, `["연차"]`) ↔ VALIDATION:95 · 06-03 행. 문자열이 세 문서에서 글자 단위로 같고, `—` 선택은 어느 E2E에도 남지 않았다(Grep `selectOption("—")` 0).
- #2 · T4: UI-SPEC S4 폰 행동(:81) · S5 첫·둘째 항목(:88-89) · a11y 행(:226) ↔ 05 truth · Task 1 ④(`inbox-table.tsx`가 탭 요소를 직접 그린다) · behavior · fails_when · 수락 기준 grep `aria-haspopup="dialog"` · Task 3 ③ a11y. 실측 `ui/table/Table.tsx:338-350` — `onRowTap` 접힌 칸은 `role="button"`만 있고 `aria-haspopup`이 없으므로 05의 「직접 그린다」 판단이 맞다.
- #3 · T5 · T6: UI-SPEC S3 표 다섯 행(:36-42) · Copywriting :216-217 · S5 :88 ↔ 05 truth(행동 줄) · Task 2 ③(문서 화면 `[승인, 회수]`) · ⑤(PC 행은 `승인`·`반려`만 — 목록의 `회수`는 그리지 않음) · CXF-B-F01 E2E(행에 `승인` 하나 · `회수`·`반려` 0) · fails_when · 수락 기준. 02:237이 만든 첫 형태(`내 결재` 행 3차 `승인`만)와도 맞물린다.
- #4 · T7: UI-SPEC :189(제출 중 규칙 정본) · S2 :14 · S3 :50 · S5 :91 · S6 :98 ↔ 05 truth · Task 1 ④ · Task 2 ①·③ · 수락 기준(`disabled=\{` 0 · `aria-disabled` ≥ 1, ConfirmDialog 포함) · T-04.1-30 · L160 원장 갱신 ↔ 06 truth(CEO-12) · Task 2 ③(2차 `취소` `aria-disabled`) · behavior ↔ VALIDATION:141. 실측 `Button.tsx:8`(`Omit<…, "disabled">` 뒤 재정의)와 `:44`(`{...rest}` 뒤 `disabled=`)로 rest의 `aria-disabled`가 살아남는다 — 수락 grep이 실제로 판별한다. `(^|[^-])disabled=\{`는 `aria-disabled={`를 제외한다(정확).
- #5 · T8: UI-SPEC :22(S3 그림) · :46 · :88 · :232(일수 힌트) · :8(S2) ↔ 05 truth · backstop · Task 1 ③(`buildDetailRows` 일수 행 조건) · Task 2 ②(문서 화면 `일수` 행은 잔고 행 없을 때만) · behavior(회수·최종 승인 문서 = `일수` 있음, 결재 중 = 없음 · `이번 신청` 1회) · DOM 감사 ↔ 06 truth · backstop · Task 2 ②·③(힌트 = `주말 N일 제외` / `재택 · 차감 없음`) · behavior(`이번 신청` 1회, CX-R4는 잔고 행으로 판정) · fails_when. 재택(잔고 행 없음 → `일수 0일` 행) · 종결 문서 갈래가 세 문서에서 같다.
- #6 · #19 · T9: UI-SPEC S1 그림(:257-273) · :281 · :220-221 · empty 행(:182) ↔ 06 truth · 계획 가정 1 · Task 1 ③ · behavior(첫해 = 부제 · select 없음 / `?year={Y-1}` = select · 부제 없음 / 무효 셋 = 부제) · 수락 기준(`회계연도에 신청한` 0). 첫해·둘 이상 갈래가 `min(가장 이른 신청 연도, 요청 연도) ~ 올해` 규칙과 모순 없이 계산된다.
- #7 · T10: UI-SPEC S2 :7 · :227 ↔ 06 truth · Task 2 ③ · behavior(week 17 — `toBeEnabled()` · 종료일 재채움 · `입력 버리기` 1칸) · fails_when. `종료일이 시작일보다 빠릅니다` 오류(:225)는 종료일을 뒤에 앞당길 때만 닿는 경로로 살아 있다 — 모순 없음.
- #8 · T11: UI-SPEC :191 · :77 · S4 그림 ↔ 05 Task 2 ⑤ · behavior(표 안 `내 결재` 1회) · backstop · DOM 감사 · fails_when. 02의 E2E(02:216)는 행의 `승인`만 누르고 상태 칸 글자를 단언하지 않으므로 05가 상태 칸을 비워도 회귀하지 않는다.
- #9 · #10 · T12 · T13: UI-SPEC :243(S8 `계급 무관`) · :112-113(3단 기본값 · 비활성 칸 힌트 유지) · :219 · :124-126(S9 연도 라벨 · 두 링크 · 월차 옵션 빠짐) ↔ 04 truth · Task 1 ①(`dynamicOptions` 종류로 라벨을 가른다 — 계급·문서 종류 이름 분기 없음) · behavior E2E · fails_when ↔ 06 truth · Task 3 ②(라벨 `{V} 연차 조정 추가`는 연차일 때만) · behavior · ⑤ locator(`/연차 조정 추가$/`) · 수락 기준 ↔ VALIDATION:115 · 06-03 행. (W-1은 01의 힌트 한 줄만의 문제다.)
- #11 · T14: UI-SPEC :50(사용자 확인 대상 2) · :234 · :47 · :106 · state 행(:229) ↔ 05 truth(결재선) · Task 1 ②(끝 줄 `{글자, kind}`) · Task 2 ②(`getApprovalView`가 막힘 + 기안자일 때만 `ROUTE_BLOCKED_DRAFTER_LINE`, W10 · W11 · W13을 한 갈래로) · 통합 사례(`setupOrphanFinal()` — 01:432 · 02:299 · :332에 실재하는 describe 「담당 소멸 뒤 고아 최종」) · 새 verify · 수락 기준(`app`·`ui`에 문구 0 — X-1). 01의 「막힘이면 누구의 `mine`에도 없다(D2)」와 부딪치지 않는다(끝 줄은 `getApprovalView` 문서 화면에서만).
- #12 · #13 · T15: UI-SPEC :51(사용자 확인 대상 3) · :111(`--s-4`) · :79-80 · :218 · :227 ↔ 05 truth · Task 2 ⑤(새 `inbox-table.module.css` — `--s-4` · `pointer: coarse` · `--touch-min` · `aria-describedby` 행별 id) · Task 3 ③·④(coarse 에뮬레이션은 `matchMedia` 확인 뒤 판정 — 공허 방지) · 수락 기준(새 토큰 선언 0) ↔ `DECISIONS.md:557-569`. 실측 `sheet-modal.html:218`(PC 행 `승인` = `data-open-sheet`) — DECISIONS의 「실물과 다름」 인용 정확.
- #14 · #15 · #16 · #18 · T16: UI-SPEC :230-231(D4 문구) · :188(S3 loading) · :240(`.reason` 라벨 + `1fr`) · :241(회수 결과 줄 1·2·3명 이상·없음) ↔ 05 truth(로딩 · KvList 뼈대) · Task 2 ①(사유 칸 그리드) · ③(담당 표기 = 서버 표시 목록 S7 문자열 그대로) · Task 3 ① · behavior(모달 `boundingBox` 비교 · 회수 결과 줄) ↔ 06 truth(D4 · error S9). 실측 `sheet-modal.html:134-137` `.reason{grid-template-columns:var(--label-w) 1fr}` · `input{width:100%}` — 인용 정확. 03의 `formatBalanceRow` D4 규칙은 이미 같은 문장.
- #17 · T17: UI-SPEC :52(사용자 확인 대상 4) · :264-268 · :278 · populated 행 ↔ 06 truth · Task 1 ③(순서 상수 한 곳 `LEAVE_STATUS_GROUP_ORDER`) · behavior(`결재 중` → `반려`) · 수락 기준. 옛 순서 문자열은 플랜 어디에도 남지 않았다(Grep `반려 → 결재 중` 0).
- #20 · #21 · #22 · #24 · #25 · #28 · T18: UI-SPEC :53(사용자 확인 대상 5) · :19(S3 머리 `—`) · :88(S5 `—`) · :235(결재함 문서 칸은 `·`) · A4(:462 되돌리기 = 회수) · Assumptions #19(:270) · :226(`네트워크 · 다시 신청`) · error S9 행(:192) · :229(다시 신청 틀) ↔ 05 Task 1 ③·④(`formatLeaveTitle` 한 곳) · Task 2 ②(문서 화면도 같은 함수) · Task 3 ①(Assumptions #19 이유) · 수락 기준 ↔ 06 Task 1 ①(A4 한 줄) · Task 2 ③(네트워크 실패 3차) · behavior(week 19 `route.abort()`) ↔ 02:236(이미 `연차 — 종일 …`) · 02 Task 3 ①·수락 기준(#28 메모 정리). `—`(제목)와 `·`(표 셀) 갈래가 02·05·UI-SPEC에서 같다.
- 줄 번호 → 항목 이름 치환(7710c99): 일곱 플랜과 VALIDATION에 UI-SPEC 줄 번호 참조가 남지 않았다(Grep `UI-SPEC.md\` N` · `N행(S…)` 0 — 05:266의 `04-UI-SPEC.md 150행`은 Phase 4 문서라 대상 밖). 개정 전 UI-SPEC 문자열(`이번 신청 N일 · 주말` 힌트 · `회계연도에 신청한` EMPTY · `["—", "연차"]` · 「실제 `disabled`」)도 본문에서 0건(원장 표의 「옛 규칙 폐기」 기록만 남음).

### 플랜 간 계약 · 웨이브 순서
- 새로 늘어난 파일 접점: 05 `files_modified`에 `inbox-table.module.css` · `test/integration/approvals-route-fixed.test.ts` 추가 — 후자는 01(웨이브 1) · 02(웨이브 3)가 만든 파일을 05(웨이브 5)가 describe 안에 사례를 더하는 것으로 순서상 안전. `domain/approvals/index.ts`(`ROUTE_BLOCKED_DRAFTER_LINE`)는 05 Task 1·2 `<files>`에 있다.
- 01 T1 상수(`domain/leave/days.ts`) → 06 폼·E2E import: 01(웨이브 1) 산출물이라 06(웨이브 6)에서 존재한다. 03 T3(`bucket` 문자열 판정) → 06 Task 3 ① 액션은 zod에서 거르지 않고 넘긴다 — 판정 한 곳, 순서 안전.
- E2E 신청 주(`leaveWeekdayRange` week) 겹침 없음: 02 = 0 · 05 = 2 · 4~8 · 04/05 설정 스펙 = 9 · 06 = 10~19(새 17 · 19 포함, 18은 CX-R4 한 사례 안에서 weekdays 1·2·3). 
- 입사일 필수화 시점(03 선택 → 06 필수 + 여섯 스펙 갱신)은 델타에서 바뀌지 않았다(직전 검토 확인 유지).
- `formatLeaveTitle`은 05가 만들고 02의 인라인 조립을 대체한다 — 02의 E2E `leave-approval.spec.ts`는 05 Task 2 verify에 들어 있어 제목 회귀가 있으면 05에서 잡힌다(둘 다 `—`라 실제 회귀는 없다).

### 검증 명령 · `<fails_when>`
- 새 `<automated>`(05 Task 2 넷째 — `approvals-route-fixed.test.ts`)에 `<fails_when>`이 있고(05:305), 05 Task 1 · Task 2 · Task 3 · 06 Task 1 · Task 2 · Task 3 · 04 Task 1 · 03 Task 3 · 01 Task 1의 기존 `<fails_when>`이 새 단언(T1 · T3 · T4 · T7 · T8 · T10 · T11 · T12 · T13 · T14 · T15 · T16 · T18 · #24)을 이름으로 품는다. 직전 검토 W-1(`PLAN_BASE` 가드) · W-2(`--no-deps`)는 그대로 반영돼 있다(05:236 `--no-deps`, 04:257 · 05:247 · 06 수락 기준의 `. "$(git rev-parse --git-dir)/gsd-04.1-0N.env" && test -n "$PLAN_BASE"`).
- 수락 기준 grep의 판별력: `(^|[^-])disabled=\{`(T7) · `aria-haspopup="dialog"`(T4) · `pointer: coarse` + `--touch-min` + `--s-4` + 새 `--` 선언 0(T15) · `ROUTE_BLOCKED_DRAFTER_LINE` ≥ 2 + `app ui` 문구 0(T14) · `DEFAULT_HALF_PERIOD` import ≥ 1 · 선언 0(T1) · `회계연도에 신청한` 0(T9) — 전부 실제 코드 모양을 가른다. `pnpm test:e2e:ci`(`CI=true`) 전체 게이트와 독립 DOM 감사(coarse `matchMedia` 확인 포함)가 CLAUDE.md §6 순서 그대로.

### 코드 인용 실측
- `ui/select/Select.tsx:4-5`(주석 「옵션 0개면 `—`」) · `:29`(`<option value="">—</option>` 무조건) — UI-SPEC :86 · A5 · DECISIONS:571 인용 정확.
- `ui/button/Button.tsx:8 · 31 · 44` — 05:197 인용 정확(N-1 참조).
- `ui/table/Table.tsx:52 · 338-350` `onRowTap` — 05 Task 1 ④ 「`aria-haspopup`을 싣지 않는다」 정확.
- `docs/design/system/sheet-modal.html:134-137`(`.reason`) · `:218`(PC 행 `승인` → 근거 시트) — UI-SPEC :240 · DECISIONS:559 인용 정확.
- `docs/design/DECISIONS.md:557 · 571` 두 항목 — 형식(결정 · 왜 · 버린 대안 · 범위)이 기존 항목과 같고 새 토큰 0. `tokens.css` 변경 없음(델타 stat에 없음).

### CLAUDE.md §7 · §6(가볍게)
- 제어 기본값(종류 · 시간 · 연도 · 잔고), 시작일 → 종료일 자동 채움, 막힘 문구 하나, `—` 불가 선택은 서버 거부 + 막힘 문구, 같은 숫자 한 자리(`이번 신청` · `내 결재` · 연도), 위험 행동 떨어뜨림(`승인`↔`반려` `--s-4`, 행에 `회수` 없음), 새 색·서체·radius 0 — §7 「하지 않아도 될 결정 최소 · 문구 최소」와 §6 규칙에 맞다. 사용자 확인 대상 다섯은 표 한 곳에서 뒤집을 자리를 명시해 둔 점이 좋다.

## 정리
- BLOCKER 0 · WARNING 5(W-1 01:309 힌트 `—` 되살림, W-2 02:231 zod enum vs 06:293 문자열, W-3 A3에 「PC 행 승인 즉시」 문장 누락 vs DECISIONS:567, W-4 UI-SPEC:4 `approved` vs :592 draft, W-5 VALIDATION 부분 동기화) · NOTE 6.
- 권장: W-1 · W-2 · W-3은 각각 한 줄 수정, W-4는 T19 체커 재실행으로 자연히 닫힌다, W-5는 실행 전 `/gsd-validate-phase`. 그 뒤 `/review`(문서) → PR #60 설명. **Codex 대신 Fable — 한도가 풀리면(9/29 이후) Codex 재확인 필요.**

막는 문제 0건
