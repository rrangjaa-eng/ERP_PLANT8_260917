# 07.1 /plan-eng-review — 그룹 A (07.1-01 · 04 · 07 · 09 · 14)

대상: main b9acdd8. 읽기 전용 검토, 테스트는 돌리지 않음. 체커 r2 · 디자인 최종(final-check.md)에서 이미 처리된 지적은 다시 내지 않음.
합계: **P1 6 · P2 15 · P3 15**. 결정 필요 3.

---

## 07.1-01 증빙 목록 며칠째 · 잠김 한 줄 · C-80 · 정산 증빙 대기 · 점검 N+1

### 1. Architecture
- 경계: aging.ts 순수 모듈 + orphan-evidence가 그 모듈을 쓰는 방향은 맞다(현재 `orphan-evidence.ts:24` `createdBefore: kstDayStart(shiftDate(ctx.today, -days + 1))`).
- 운영 실패(새 경로마다 1개)
  - 며칠째: 규칙 행을 목록마다 읽음 → 규칙 표가 비어도 `effectiveRule` 기본값(enabled false)이라 색이 없을 뿐, 실패 없음. 대응 있음.
  - published 범위 방어 조건: 시그니처 변경이 풀(evidence-pool)까지 번져 풀 후보가 바뀜(아래 P1-1).
  - 정산 결재 행: 결재함이 `mine` 문서마다 점검 전체를 돌림(아래 P2).

### 2. Code quality / 지적

**[P1] (confidence: 8/10) 07.1-01-PLAN.md:374 · repositories/evidence-records.ts:166,206 — `scopeWhere`는 cardFormats를 받지 않아 「같은 조각 함수(stateWhere)를 부른다」를 그대로 할 수 없다**
- 플랜: 「`scopeWhere`의 `published` 갈래에 `stateWhere`가 「팀 공개 · 본부 공개」 낱말에 쓰는 조건 … 같은 조각 함수를 부른다」
- 코드: `function scopeWhere(scope: EvidenceScope): SQL {` / `function stateWhere(state: EvidenceRecordState, cardFormats: readonly string[]): SQL {`
- `stateWhere("published", cardFormats)`의 카드 미등록 판정에 `cardFormats`가 꼭 필요하다. 그러려면 `scopeWhere` · `evidenceScopeCondition`(:191) 시그니처를 바꾸고 호출부 5곳(:265 · :364 · :374 · :403 · `repositories/evidence-pool.ts:110,129`)을 모두 고쳐야 한다. 그런데 `repositories/evidence-pool.ts` · `domain/evidence-records/pool.ts`는 files_modified에 없다. 그래서 실행자가 「목록 밖 파일 → 멈춤」에 걸리거나, 범위 조건을 손으로 다시 쓰게 된다(플랜이 금지한 방식).
- 고칠 내용: ⑥에 「`scopeWhere(scope, cardFormats)` · `evidenceScopeCondition(viewer, scope, cardFormats)`로 넓히고 풀 호출부는 `CARD_FORMATS`를 넘긴다」를 적는다. files_modified에 `repositories/evidence-pool.ts` · `domain/evidence-records/pool.ts`를 더하고, 풀 회귀(`test/integration/evidence-pool.test.ts`)를 verify에 넣는다. 07.1-09가 같은 풀 파일을 고치므로(웨이브 1 · 두 플랜 모두 depends_on 없음) 순서도 함께 정한다.

**[P1] (confidence: 9/10) 07.1-01-PLAN.md:359,364 · repositories/evidence-records.ts:183 — RED 사례 「팀 공개 줄에 확인 필요를 세우면 팀 사람 목록에서 빠진다」는 지금 이미 통과한다(거짓 RED · 진짜 변경은 시험되지 않음)**
- 플랜: 「통합: 팀 공개 줄에 확인 필요를 세우면(flag 함수) 그 팀 사람의 목록에서 빠진다」 · 「① RED: … 실패를 본다」
- 코드: `// P2-1(사용자 결정 2026-10-17): 확인 필요 줄 … 팀원에게 내지 않는다.` / `… and ${evidenceRecords.needsCheck} is null and not ${privateToOwnerType}`
- published 갈래는 이미 `needsCheck is null`을 본다. 이 태스크가 실제로 더하는 조건은 **카드 미등록**(카드 서식 ∧ `corp_card_id` null)과 **합계 < 0** 둘인데, 둘 다 시험이 없다.
- 고칠 내용: :359를 바꾼다 — 팀 공개 줄을 DB에서 직접 (a) `corp_card_id = null`(카드 서식) (b) `total_krw < 0`으로 만든 뒤 팀 사람 목록 · 풀에서 빠지는지 본다. 확인 필요 사례는 「회귀(이미 녹색)」로 표시한다.

**[P2] (confidence: 8/10) 07.1-01-PLAN.md:309 · domain/evidence-records/index.ts:290,305 — `ageDays` null 판정을 `attachedKind !== null`로 하면 붙은 줄에도 경과일이 생긴다**
- 플랜: 「`ageDays`는 살아 있는 붙임이 있거나(`attachedKind !== null`) … null」
- 코드: `sourceOf`가 `attachedKind: null`을 늘 넣는다. `if (scope.rows !== "all" || dtos.length === 0) return dtos;` · `listAllEvidenceRecords`는 `rows.map(sourceOf)`만 쓴다(:468). 또 owners 맵에는 알려진 세 종류만 들어간다.
- 고칠 내용: 판정 재료를 `row.attached`(LIST_COLUMNS `attached: liveLinkExists`)로 바꾸고 `sourceOf` 안에서 계산한다. 규칙은 인자로 넘긴다.

**[P2] (confidence: 7/10) 07.1-01-PLAN.md:356,360 · domain/permissions/scope-for.ts:167 — 「evidence.intake 쓰기만 있는 계급」이라고만 쓰면 범위가 `none`이라 줄이 0이 된다**
- 코드: `if (!(await canFn(viewer, "evidence", "view"))) return { rows: "none" };`
- 고칠 내용: 시험 계급을 「`evidence` 보기 + `evidence.intake` 쓰기, `cards.proxy` 쓰기 없음」으로 못박는다. `proxy`는 금액 칸 보임 두 개와 AND로 묶인다(`index.ts:318`)는 점도 한 줄 적는다.

**[P2] (confidence: 6/10) 07.1-01-PLAN.md:361,368 · domain/evidence-records/index.ts:304-340 — 「연결 문서를 볼 수 없는 확인 필요 줄」을 만드는 데이터 경로가 없다**
- `withAttachFacts`는 범위 all(등록 권한자)에게만 owners를 싣는다. `listLiveLinkOwnersByRecords`(repositories/evidence-record-links.ts:220)에는 보임 판정이 없다. 실제로 `id`나 `number`가 null이 되는 경우는 번호 없는 구매 요청 · 카드 사용뿐이다(지출결의 번호 null은 `pending`).
- 고칠 내용: 픽스처를 「번호 없는 구매 요청에 붙은 확인 필요 줄」로 정한다. 「볼 수 없음」을 권한 뜻으로 쓸 거라면 `canSeeLinkOwner`를 쓰는 갈래를 따로 적는다.

**[P2] (confidence: 6/10) 07.1-01-PLAN.md:427 · domain/approvals/index.ts:1243-1252 · domain/settlements/index.ts:235 — 결재함 상세가 정산 문서마다 완료 전 점검 전체를 돌린다**
- 코드: `if (deps?.withDetails) { … await loadKindDetails(viewer, kind, …) }`. `computePreSettleCheck`는 질의 8개 이상을 쓰고, 미매칭 줄마다 `await projectAmounts(...)`를 부른다(pre-settle-check/index.ts:196).
- 고칠 내용: `loadPreSettleInputs`는 한 번만 읽고 SETTLING 문서만 `Promise.all`로 돌린다. 그리고 「결재함 1회 로드 질의 수 상한」을 적거나, 적어도 SUMMARY에 정산 문서 N건 비용을 적는다.

**[P3] (confidence: 9/10) 07.1-01-PLAN.md:370 · scope-for.ts:161-164 · lib/kst-date.ts:48 — 플랜 코드 조각이 타입 검사를 통과하지 못한다**
- 플랜: `await evidenceScopeFor(viewer, kstToday())` — 실제 시그니처는 `(viewer, deps?)`이고, `kstToday(now: Date)`는 인자가 필요하다(⑤의 `kstToday()`도 같음). `evidenceScopeFor(viewer)`와 `seoulToday()`로 고친다.

**[P3] (confidence: 6/10) 07.1-01-PLAN.md:370 · app/(app)/expenses/(list)/page.tsx:102 — `rows: "none"`이면 0을 돌려준다고 했는데, 0이면 링크 글자가 `증빙`으로 남아 빈 페이지로 간다** → `null`을 돌려 링크를 없앤다.

**[P3] (confidence: 6/10) 07.1-01-PLAN.md:418 — PF2 질의 계수는 `listReviewStatusByExpenses` 호출 1회만 보면 `findReviewByExpense`가 남아도 통과할 수 있다** → 같은 spy로 `findReviewByExpense` 호출 0도 단언한다(인수 기준 :440의 grep이 대신하긴 함).

**[P3] (confidence: 5/10) 07.1-01-PLAN.md:305 · domain/notify/rules.ts:16 — `EffectiveRule.days`는 `number | undefined`인데 `isAgeWarn`은 `days: number`를 받는다** → 넘길 때 기본값 7로 채운다.

### 3. Tests
```
며칠째  aging 순수(경계 동치 300) ── 단위 OK
        DTO ageDays/ageWarn ───────── E2E만 (붙은 줄=— 는 E2E) · listAll/published 갈래 GAP(P2)
        경고 색 = 독촉 건수 ────────── 같은 데이터 동치 통합 GAP(참고 — 단위 동치로 대체)
잠김 한 줄 ─────────────────────────── 통합+E2E OK(계급 정의 P2)
U-16 ───────────────────────────────── E2E OK · 픽스처 경로 GAP(P2)
C-80 #4 count ──────────────────────── 통합 OK
C-80 #1 readDivision 보관 ──────────── 통합 OK
C-80 #3 published 방어 ─────────────── 거짓 RED(P1) · 카드 미등록/음수 GAP · 풀 회귀 GAP
PD3 정산 행 ────────────────────────── 통합+E2E OK
PF2 ────────────────────────────────── 통합 계수 OK(보강 P3)
```
명령 · 경로: 시험 파일은 모두 있다. `evidence-list-audit.spec.ts`는 `desktop-evidence` 프로젝트(playwright.config.ts EVIDENCE_WIPE_SPECS)라 파일 인자로 돌려도 된다.

### 4. Performance
- published 조건이 늘어도 같은 행 조건이라 인덱스 영향은 없다. 결재함은 위 P2를 본다.

| 경로 | 실패 | 시험 있음? | 오류 처리 있음? | 사용자에게 |
|---|---|---|---|---|
| scopeWhere published + 풀 | 시그니처 변경 누락 → 풀이 옛 조건 · 타입 오류 | 없음(P1) | — | 조용함 |
| ageDays | 붙은 줄에 n일 · 경고색 | 부분(E2E 목록만) | 없음 | 보임(틀린 값) |
| 결재함 정산 상세 | 문서 N건 × 점검 | 없음 | 예외는 던짐 | 느림 |
| countTodoEvidence none | 빈 페이지로 가는 링크 | 있음(0 기대) | — | 보임 |

---

## 07.1-04 카드 대사 붙임 · 떼기 (money · db-lock)

### 1. Architecture
- 운영 실패
  - 사용일 덮기: 덮을 날짜의 세율 바탕을 읽지 않아 500(P1-2).
  - 사용일만 다른 붙임: 아무것도 쓰지 않고 로그도 없음(P1-1).
  - 떼기: 잠금 없이 판정한 뒤 해제 → 그사이 보관된 카드 사용에서도 떼어짐(P2).

### 2. 지적

**[P1] (confidence: 9/10) 07.1-04-PLAN.md:129-133 · domain/evidence-records/attach.ts:304-306,330,351,371 — `patchChangesValues`가 usedOn을 보지 않아, 사용일만 다른 붙임은 덮기 · 로그 갈래를 통째로 건너뛴다**
- 코드: `return patch !== null && (patch.total !== null || patch.card !== null);` · `if (!patchChangesValues(patch)) return { usage, record, patch, basis: null };` · `if (patchChangesValues(patch) && basis) {` · `} else if (patch?.approvalNo && patch.approvalNo !== usage.approvalNo) {`
- 승인번호가 같고 합계 · 카드도 같은데 날짜만 다른 경우가 D-7104의 대표 사례다(완화 후보 `isRelaxedHit`는 승인번호가 같으면 날짜를 보지 않음, reconcile.ts:174-177). 그런데 이 경우 basis가 null이고 첫 갈래를 타지 않아 `used_on`이 그대로 남는다. 금액 보임 검사(:332-333)도 건너뛴다.
- 고칠 내용: ②에 「`patchChangesValues`에 `patch.usedOn !== null`을 더한다(보임 검사 · basis · 막힘 판정 갈래로 들어가게)」를 적고, 단위 · 통합 사례 「합계 같음 · 날짜만 다름 → used_on 덮음 + 로그 changes.usedOn」을 더한다.

**[P1] (confidence: 9/10) 07.1-04-PLAN.md:133 · attach.ts:334 · domain/corp-card-usages/index.ts:1722,1729 — 덮기 바탕을 옛 사용일로만 읽어서, 새 사용일로 나누면 「덮기 세율 없음」 예외가 난다**
- 코드: `return { usage, record, patch, basis: await loadCardOverwriteBasis(viewer, [usage.usedOn]) };` / `for (const date of new Set(usedOns)) ratesByDate.set(date, await loadTaxRates(date));` / `if (!rates) throw new Error(\`덮기 세율 없음 — ${input.usedOn}\`);`
- 플랜 ④는 「분할 계산이 `patch.usedOn?.after ?? usage.usedOn`을 쓴다」고만 했다. 바탕은 바꾸지 않았으므로 날짜가 다르면 언제나 일반 Error가 나고(500), 붙이기가 실패한다.
- 고칠 내용: ④에 「`loadCardOverwriteBasis(viewer, [usage.usedOn, record.issuedOn])`」를 더한다. 통합 「분할 + 날짜 다름」 사례가 이 갈래를 지나는지 본다.

**[P2] (confidence: 9/10) 07.1-04-PLAN.md:43,166,174 · domain/evidence-records/reconcile.ts:38-57 — 가져오기 대사는 1 · 2단계 모두 사용일이 같을 것을 요구한다. 그래서 가져오기 쪽 usedOn 덮기는 늘 null이고, 「가져오기도 같은 used_on」 시험은 저절로 통과한다**
- 코드: `candidate.usedOn === line.usedOn &&`(stepOneHit · stepTwoHit 둘 다). fillsApproval도 1단계(같은 승인번호)와 2단계(`candidate.approvalNo === null || … === line.approvalNo`) 구조상 이미 「있는 값은 덮지 않음」이다.
- 고칠 내용: Task 2 ②의 몫을 「가져오기는 `changes`(totalKrw · approvalNo) 로그 모양만 맞춘다 · usedOn은 구조상 같음」으로 다시 쓴다. :166 시험은 「1단계 합계 다름 → changes.totalKrw」로 바꾼다. truth :43과 SUMMARY에는 「이미 맞음」으로 적는다.

**[P2] (confidence: 8/10) 07.1-04-PLAN.md:176 · attach.ts:616-645 · :1025-1037 — 카드 사용 떼기 갈래에 tx 안 잠금 · 재판정이 없다**
- 지출결의 떼기는 `lockEvidenceOwnerForChange(...)`를 잡고 권리를 다시 판정한다(:629-630). 플랜은 「`readCardUsageRights`로 … 확인하고 연결만 해제」라고만 적었는데, 이 함수는 tx 밖에서 읽는다(`// 트랜잭션 밖 한 번(06-03)`).
- 고칠 내용: ③에 「tx 안에서 `lockCardUsageForUpdate`로 카드 사용을 잡는다(attachToCardUsage :341과 같은 순서) → `archivedAt` · 권리 재판정 → `lockEvidenceRecordState` → `detachLink`」를 적고, 경합 시험(사전 판독 뒤 보관 → 거부)을 하나 더한다.

**[P2] (confidence: 6/10) 07.1-04-PLAN.md:133 · attach.ts:353 · corp-card-usages/index.ts:1733 — 덮기 막힘 판정 입력에 날짜가 없다(`{ usageId, totalKrw, corpCardId }`)** → 완료 프로젝트 · 고정 연결 카드 사용의 날짜만 바꾸는 덮기가 막히지 않는다. 「결정 필요 A-1」을 본다.

**[P3] (confidence: 9/10) 07.1-04-PLAN.md:7-22 · :157 — Task 2 files의 `test/integration/evidence-attach-exposure.test.ts`가 frontmatter files_modified에 없다.**

**[P3] (confidence: 7/10) 07.1-04-PLAN.md:178 — PE9 「기존 카드 사용 범위 함수」를 이름으로 적는다:** `cardSlipOwner` + `cardSlipRights(...).read`(domain/corp-card-usages/index.ts:1176,1186 — `isCardUsageInListScope`).

**[P3] (confidence: 8/10) 07.1-04-PLAN.md:205 · lib/evidence-return.ts:17-20 — PE4 ⓓ는 이미 맞다**(`.filter((pair) => … !== "registered")`). 회귀 시험만 두면 된다.

**[P3] (confidence: 7/10) domain/action-log/detail-lines.ts:27-48 — `approvalNo` · `usedOn` · `totalKrw` 라벨이 없다(플랜 ⑤가 더하는 것은 맞다).** 숫자는 `toLocaleString`으로 `50,000`, null은 `NONE`으로 그려진다(:69-72). 단위 기대값이 실제 NONE 글자(`—` 여부)와 맞는지 실행 때 확인한다.

### 3. Tests
```
fileWinsPatch usedOn ───── 단위 OK · 「날짜만 다름」 GAP(P1-1)
applyFileWins usedOn ───── 통합 OK
분할 새 날짜 ───────────── 통합 OK — 바탕 미로드라 지금 플랜대로면 예외(P1-2)
승인번호만 로그 ────────── 통합 OK
가져오기 usedOn ────────── 구조상 불가 → 저절로 통과(P2)
떼기 권한 ──────────────── 통합 OK · 잠금 경합 GAP(P2)
PE9 보기 ───────────────── 통합 OK
PE4/6/11 확정표 ────────── SUMMARY + 회귀
```

### 4. Performance
- 바탕 날짜가 하나 더 붙으면 `loadTaxRates` 1회가 는다. 무시해도 된다.

| 경로 | 실패 | 시험 | 오류 처리 | 사용자에게 |
|---|---|---|---|---|
| 날짜만 다른 붙임 | 덮기 · 로그 0 | 없음 | 없음 | 조용함(돈 칸 틀림) |
| 날짜 다른 분할 | `덮기 세율 없음` Error | 있음(지금은 빨강) | 일반 Error | 500 |
| 카드 사용 떼기 경합 | 보관 뒤 떼기 | 없음 | 없음 | 조용함 |
| 가져오기 | 해당 없음 | 저절로 통과 | — | — |

---

## 07.1-07 사람 본부 칸 · 증빙 범위 (위험 경로)

### 1. Architecture
- add-alongside 판단은 타당하다. 다만 이 범위가 실제로 쓰이는 사용자 표면을 잘못 짚었다. `/expenses/evidence`는 `evidence.intake` 쓰기가 있어야 열린다(`app/(app)/expenses/evidence/page.tsx:33` `if (!(await can(viewer, "evidence.intake", "write"))) notFound();` · layout도 같다). 보기만 있는 사람(published 범위)이 증빙을 보는 곳은 **증빙 고르기 풀**뿐이다(`repositories/evidence-pool.ts:110,129` `evidenceScopeCondition`).
- 운영 실패: 칸에 남은 옛 본부가 팀 발령이 끝난 뒤 다시 읽힌다(결정 필요 B-1).

### 2. 지적

**[P1] (confidence: 9/10) 07.1-07-PLAN.md:22,89,196 · domain/evidence-records/index.ts:473-474 — 「P의 countTodoEvidence가 목록과 같은 범위」는 만들 수 없는 시험이다**
- 코드: `export async function countTodoEvidence(viewer: Viewer): Promise<number | null> {` / `if (!(await can(viewer, "evidence.intake", "write"))) return null;`
- P는 「증빙 보기 · 발령 팀 없음」이라 intake 쓰기가 없다. 07.1-01을 반영해도 첫 줄에서 늘 null이 나온다. depends_on 근거(:22 「Task 3의 건수 사례가 07.1-01 배선 없이는 `rows: "all"`이라 빨갛다」)도 사실이 아니다. 이 사례 때문에 사용자 머지 PR이 draft로 묶이고 순서도 꼬인다.
- 고칠 내용: :196을 「P의 증빙 고르기 풀 건수(`countEvidencePool` · 작성자 모드)가 목록과 같은 범위」로 바꾼다. 그러면 depends_on 07.1-01의 근거가 남는지 다시 판단한다. 남는 근거는 published 조건(C-80 #3)뿐이고, 이 시험이 그것을 기대지 않으면 depends_on을 지울 수 있다(웨이브 1로 당겨지는 것은 체커 B-1 파일 겹침 0을 지키는 한).

**[P2] (confidence: 8/10) 07.1-07-PLAN.md:40,195-198 — 범위 시험이 `listEvidenceRecords`만 본다. 실제 사용자 표면(작성자 풀)에는 시험이 없다**
- 고칠 내용: Task 3에 「P가 작성 중 지출결의 증빙 고르기(`listEvidencePool` author)에서 B 본부 공개 줄을 보고, A 본부 공개 · 팀 T 공개는 보지 않는다」를 더한다. truth :40의 「목록 · 건수에서 본다」는 「증빙 고르기에서 본다(목록 화면은 등록 권한자 전용)」로 고친다.

**[P2] (confidence: 8/10) 07.1-07-PLAN.md:195 — 「전사 공개 보임」에 해당하는 공개 값이 없다**
- 코드: `return value === "team" || value === "division" ? value : "private";`(index.ts:246). scopeWhere published에는 team · division 갈래만 있다(evidence-records.ts:172-180).
- 고칠 내용: 이 사례를 지운다(또는 「없는 값 — 해당 없음」).

**[P2] (confidence: 7/10) 07.1-07-PLAN.md:105 — 받아들인 빚 「팀이 생긴 뒤에도 칸에 옛 본부가 남아도 읽지 않으므로 무해」는 팀 발령이 끝나면 깨진다.** 퇴직 전 공백, 팀 보관, 발령 사이 공백이 생기면 옛 칸이 다시 읽혀 옛 본부의 증빙이 보인다. → 결정 필요 B-1.

**[P3] (confidence: 9/10) 07.1-07-PLAN.md:159 — `repositories/org.ts` 파일이 없다** → `repositories/org-units.ts:19` `findOrgUnitById`(보관을 거르지 않으므로 `archivedAt`을 직접 본다). 07.1-14:112도 같다.

**[P3] (confidence: 6/10) 07.1-07-PLAN.md:130 · db/schema/org.ts:2 — `org.ts`가 이미 `import { users } from "./auth"`를 하므로, auth.ts에 orgUnits import를 더하면 순환이 생긴다.** 「`roleId` → `roles` 방식」(roles.ts는 auth를 import하지 않음)은 순환을 푸는 선례가 아니다. `references(() => orgUnits.id)`는 늦게 평가되므로 대개 동작하지만, `pnpm db:generate` · drizzle-kit 로드에서 확인하라는 줄을 남긴다.

### 3. Tests
```
스키마/마이그레이션 ── lint:sql + journal 단위 + db:migrate OK
scope-for 단위 ─────── 5사례 OK(팀 우선 불변식 포함)
통합 목록 ──────────── OK(전사 공개 사례 무효 P2)
통합 건수 ──────────── 불가능(P1)
작성자 풀 ──────────── GAP(P2) ← 실제 사용자 표면
```

### 4. Performance
- 팀 없는 사람만 읽기 2회가 는다(`findUserById` · `findOrgUnitById`). 무시해도 된다.

| 경로 | 실패 | 시험 | 오류 처리 | 사용자에게 |
|---|---|---|---|---|
| 팀 없음 → 칸 본부 | 보관 본부 사용 | 있음 | 보관 거름 | 조용함 |
| 팀 발령 끝남 → 옛 칸 | 옛 본부 증빙 보임 | 없음 | 없음 | 조용함(누수) |
| 마이그레이션 FK | 긴 잠금 | lint:sql | NOT VALID + 1s | 배포 실패로 보임 |

---

## 07.1-09 증빙 고르기 종류 거름 · 지출결의 목록 거르개

### 1. Architecture
- 풀: 문서 종류가 null인 구매 요청(evidence-pool.ts:164 `evidenceType: null`)과 카드 사용(pool.ts:103 `evidenceType: null`)은 거르지 않는다. 카드 대사 후보가 사라질 위험은 없다. 좋다.
- 목록 거르개: 실제 거름은 저장소 층에 있다(아래 P1).

### 2. 지적

**[P1] (confidence: 8/10) 07.1-09-PLAN.md:7-22,158,176 · domain/expenses/list.ts:191-216 · repositories/expenses.ts:605,681,757 — 팀 · 월 · 내 것만은 `repositories/expenses.ts`를 고쳐야 하는데, 그 파일이 files_modified에 없다**
- 코드: `listExpenses`는 `summarizeExpenseList(viewer, { scope, ranks, documentKind, ...search })` · `listExpensePage(...)` · `approvedOrderOf(...)`를 부르고, 걸 수 있는 조건은 `export type ExpenseSearch = { query: string; fields: readonly ExpenseSearchField[] };`뿐이다. SQL 조각을 넘길 자리가 없다. 월 옵션(`months`)과 범위 안 팀 옵션도 새 저장소 질의가 필요하다.
- 고칠 내용: files_modified · Task 2 files에 `repositories/expenses.ts`를 더한다. 조건 셋은 공용 where(:561-571 — 범위 조건을 만드는 곳)에 함께 넣어 「합계 · 쪽 · 승인 정렬이 같은 조건」이 되게 한다고 적는다.

**[P2] (confidence: 7/10) 07.1-09-PLAN.md:166,176 · repositories/expenses.ts:561 — 「그 팀 문서」가 무엇인지 정의가 없다**
- 코드: `const docTeamId = sql\`case when ${expenses.projectId} is not null then ${projects.teamId} else ${expenses.attributedTeamId} end\`;`
- 고칠 내용: 팀 거름은 `docTeamId`로 한다(행 범위와 같은 칸)고 적는다. 기안자의 발령 팀으로 하지 않는다.

**[P2] (confidence: 6/10) 07.1-09-PLAN.md:42,132-133 · repositories/evidence-pool.ts:98-103 — 건수 함수는 `doc` · `q`를 받지 않고 검색어도 적용하지 않는다(`Pick<PoolQuery, "author" | "cardFormats" | "allowedTypes" | "ownerFilter">`)**
- 「목록과 건수가 같은 거름」을 하려면 건수 경로에서도 문서 사실(`readPoolDocFacts`)을 읽어야 한다. 검색어가 있을 때 부제 `후보 {N}`이 무엇을 세는지(검색 무시 · 종류 거름 없음?)도 정의가 없다.
- 고칠 내용: ②에 「`countPoolForScope` 입력에 `docEvidenceType: string | null`을 더한다. 검색어가 있을 때 N은 지금처럼 검색과 무관하고 종류 거름도 없다」 같은 정의를 한 줄 둔다.

**[P3] (confidence: 6/10) 07.1-09 ↔ 07.1-01 — 둘 다 웨이브 1이고 서로 depends_on이 없는데, 07.1-01 P1-1 수정이 반영되면 `repositories/evidence-pool.ts`를 함께 고친다** → 순서를 정한다(09가 01 뒤, 또는 01이 풀 호출부만).

**[P3] (confidence: 5/10) 07.1-09-PLAN.md:176 — 「범위가 둘 이상 팀을 볼 때만 팀 옵션」을 RowScope 모양별로 적어 두라:** `all` → 전체 활성 팀 · `limited by team`(한 팀) → 빈 목록 · `own` → 빈 목록 · 본부 범위 → 그 본부의 활성 팀.

### 3. Tests
```
풀 종류 거름 ─── 통합 OK(null 종류 · 검색 · 범위 회귀) · 카드 사용 풀 회귀 GAP(P3 — ownerFilter 갈래)
목록 팀/월/mine ─ 통합 OK(범위 밖 팀 0 · 틀린 월 무시 · 합계) — 저장소 파일 누락(P1)
필터 줄 ──────── E2E OK(1280/1024 한 줄 · 팀장 팀 select 0 · 320)
```
- 시각 스냅숏에 `/expenses` 화면이 없어서(visual.spec.ts-snapshots 9장) 필터 줄이 바뀌어도 스냅숏은 깨지지 않는다. 확인함.

### 4. Performance
- 월 옵션 질의: 범위 조건 위에서 `distinct to_char(created_at …)`를 한다. `expenses.created_at`에 인덱스가 없으면 전체를 훑지만 30명 규모라 괜찮다. 그래도 질의는 범위 where를 같이 써야 한다.

| 경로 | 실패 | 시험 | 오류 처리 | 사용자에게 |
|---|---|---|---|---|
| team 파라미터 | 범위 확장 | 있음(범위 밖 0) | AND | 조용함 |
| month 형식 오류 | 무시 | 있음 | 있음 | 조용함 |
| 풀 건수 ≠ 목록 | 부제 N 어긋남 | 있음(검색 없음만) | — | 보임 |

---

## 07.1-14 사람 본부 칸 화면 · 쓰기

### 1. Architecture
- 서버 판정(권한 · 팀 · 보관)은 tx 안에서 다시 한다. 좋다.
- 운영 실패: 같은 사람에게 팀 발령과 본부 저장이 동시에 일어나는 경합(P2). 로그 상세가 `변경됨`으로 보임(P2).

### 2. 지적

**[P2] (confidence: 8/10) 07.1-14-PLAN.md:48,113,116 · domain/action-log/detail-lines.ts:15-16,74 — `changes.divisionId`에 uuid를 넣으면 상세가 `변경됨 → 변경됨`으로 보이고, 라벨도 `divisionId` 원문이 된다**
- 코드: `return typeof value === "string" && (UUID.test(value) || ROLE_ID.test(value));` / `if (isInternalId(value)) return CHANGED;` · `CHANGE_FIELD_LABELS`에 본부 항목이 없다.
- truth :48은 「상세 라벨 `본부` · 본부 이름」을 요구하는데, `domain/action-log/detail-lines.ts`가 files_modified에 없다.
- 고칠 내용: 로그를 `changes: { division: [이름 전, 이름 후] }`(이름 글자)로 정하고, `CHANGE_FIELD_LABELS`에 `division: "본부"`를 더한다. 그 파일과 detail-lines 단위 시험을 files에 더한다.

**[P2] (confidence: 7/10) 07.1-14-PLAN.md:130 · domain/people/index.ts:535 — 「사람 잠금 키」를 이름으로 적어야 팀 발령 경로와 같은 잠금이 된다**
- 코드: `await lockSeatKeys(viewer, { personIds: [userId], admin: true }, tx);`(changePersonRole). 팀 발령(`domain/org/index.ts`)도 `lockSeatKeys`를 쓴다.
- 고칠 내용: ③에 「`lockSeatKeys({ personIds: [userId] })` → tx 안에서 오늘 발령 재조회」를 적어, 팀 발령과 본부 저장이 엇갈려 「팀 있음 + 본부 칸」이 생기지 않게 한다.

**[P2] (confidence: 7/10) 07.1-14 · 07.1-07:105 — 팀을 발령해도 칸을 지우지 않아 옛 본부가 남는다** → 결정 필요 B-1(이 플랜이 쓰기 길을 가지므로 정리 위치 후보).

**[P3] (confidence: 9/10) 07.1-14-PLAN.md:112 — `repositories/org.ts`가 없다** → `repositories/org-units.ts` `listOrgUnits(viewer, { scope })`(includeArchived false).

**[P3] (confidence: 6/10) 07.1-14-PLAN.md:195,201 — F5: 선택된 비활성 option은 HTML 폼 데이터에서 빠진다(spec: disabled option은 제출 안 됨).** 지출결의 폼은 제어 상태(`expense-form.tsx:170-171` `useState(data.evidenceType ?? "")` · 보냄 :462,:511)라 안전하다. 그래도 E2E에 「바꾸지 않고 자동 저장 · 새로 고침 뒤에도 저장값 그대로」 한 줄을 더해 회귀를 고정한다. 새로 만들기 폼(PanelForm FormData)에는 비활성 옵션이 생기지 않으니 해당 없다.

**[P3] (confidence: 5/10) 07.1-14-PLAN.md:139 — 「저장값이 증빙 범위에 반영」 사례를 people.test.ts에 둘지 evidence-row-scope.test.ts에 둘지 정하지 않았다.** verify에는 둘 다 있다. 사례 위치를 하나로 정한다.

### 3. Tests
```
setPersonDivision 권한/팀/보관/없음/null ─ 통합 OK
로그 changes ───────────────────────────── 통합 OK · 상세 렌더(라벨·이름) GAP(P2)
범위 반영 ──────────────────────────────── 통합 OK
상세 즉시 저장 · 보관 비활성 옵션 ───────── E2E OK
새로 만들기 팀 ↔ 본부 칸 ────────────────── 통합+E2E OK
Select disabled ────────────────────────── 단위 OK
F5 지출결의 비활성 저장값 ──────────────── E2E OK · 자동 저장 보존 GAP(P3)
팀 발령 ↔ 본부 저장 경합 ───────────────── GAP(P2)
```

### 4. Performance
- 상세 화면에서 본부 목록 1회 + 오늘 발령 1회가 는다. 문제없다.

| 경로 | 실패 | 시험 | 오류 처리 | 사용자에게 |
|---|---|---|---|---|
| 본부 저장 vs 팀 발령 동시 | 팀 + 칸 공존 | 없음 | 잠금 미지정 | 조용함 |
| 로그 상세 | `변경됨` · 원문 키 | 없음 | — | 보임(읽을 수 없음) |
| 보관 본부 저장값 | 조용히 바뀜 | E2E | disabled 옵션 | 보임 |

---

## 결정 필요

**A-1 (07.1-04) 승인번호가 같기만 하면 날짜가 얼마나 떨어져 있어도 사용일을 덮을까?** 카드 승인번호는 카드사 · 기간에 따라 다시 쓰인다. 완료 프로젝트 · 고정 연결 카드 사용의 날짜만 바꾸는 덮기는 지금 막힘 판정에 들어가지 않는다.
- (가) 그대로 — 승인번호 같음이면 날짜와 상관없이 덮는다(D-7104 문자 그대로).
- (나) **추천**: 날짜 차이가 크면(예: 같은 달 또는 ±31일 밖) 후보에서 막힌 행으로 두고(`날짜 다름 · {n}일`), 완료 · 고정 막힘 판정에 날짜 변경도 넣는다.
- (다) 날짜 덮기를 하지 않고 로그 · 안내만 남긴다(D-7104 되돌림 — 비추천).

**B-1 (07.1-07 · 07.1-14) 팀을 발령받은 사람의 `division_id`를 어떻게 할까?** 그대로 두면 팀 발령이 끝났을 때 옛 본부 공개 증빙이 다시 보인다.
- (가) **추천**: 팀 발령 쓰기(domain/org)나 07.1-14 쓰기 길에서 팀이 생기면 칸을 null로 비운다. 위험 경로가 아니면 07.1-14에 넣고, 아니면 07.2로 넘긴다.
- (나) 그대로 두고 「팀 없음 갈래」에서 칸을 쓸 때 마지막 발령 종료일 뒤에 설정된 값만 쓴다(칸에 설정 시각이 필요하다 — 스키마 변경).
- (다) 빚을 받아들이고 SUMMARY · 07.2 후보로만 남긴다.

**C-1 (07.1-07) D-7122를 사용자에게 어떻게 보고할까?** 팀 없는 본부 사람이 증빙을 보는 곳은 증빙 고르기뿐이고 `/expenses/evidence` 목록은 아니다.
- (가) **추천**: 보고 · truth를 「증빙 고르기에서 본다」로 바로잡고, 풀 시험을 더한다.
- (나) 그 사람들에게 증빙 목록(읽기 전용)을 열어 준다 — 권한 · 화면이 새로 생기므로 07.2.
