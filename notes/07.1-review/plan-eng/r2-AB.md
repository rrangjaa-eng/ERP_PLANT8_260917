# 07.1 /plan-eng-review 2회차 — 그룹 A(01 · 04 · 07 · 09 · 14) + 그룹 B(03 · 11 · 12 · 13 · 16)

대상: PR #301 head 41a5fe2(작업 트리 /home/user/wt/r301, 읽기 전용). 코드 기준 같은 트리(main b9acdd8). 1회차 번호는 eng-review.md(E-P1-xx · E-P2-xx).
범위: 맡은 플랜의 1회차 P1 · P2 반영 확인, D-E1~E4 · C-1(이 그룹 몫. D-E5 · D-E6 · D-E7은 06 · 10 · 18 몫이라 보지 않음), `git diff b9acdd8..41a5fe2` 바뀐 부분의 새 결함. P3는 표본만 봤다.

## 요약

- 1회차 P1 8건(E-P1-01 · 02 · 03 · 04 · 07 · 08 · 10 · 11): **해결 8**
- 1회차 P2 32건: **해결 31 · 부분 1(E-P2-03)** · 미해결 0
- 결정 D-E1 · D-E2 · D-E3 · D-E4 · C-1: 모두 사용자 답대로 들어갔다(D-E2는 아래 새 P2-B에 구멍이 하나 있다)
- 새 결함: **P1 0 · P2 2**(N-P2-A 07.1-01 픽스처가 만들 수 없는 데이터 · N-P2-B 07.1-14 미래 발령 뒤 본부를 다시 넣으면 CG-04가 되살아남) · P3 표본 4
- 같은 웨이브 files_modified 겹침: 01~19 전체를 다시 grep했고 0이다(07 → 웨이브 1, 09 → 웨이브 2로 옮긴 뒤에도 같다)

---

## 1. 1회차 P1 · P2 반영 확인

### 07.1-01

| 번호 | 판정 | 플랜(41a5fe2) | 코드 대조 |
|---|---|---|---|
| E-P1-01 | **해결** | :388-399 ⑥ 「`scopeWhere(scope: EvidenceScope, cardFormats: readonly string[])` … published 갈래를 `((팀) or (본부)) and (${stateWhere("published", cardFormats)})`」 · 풀 두 호출부 `evidenceScopeCondition(viewer, scope, query.cardFormats)` · files :11 `repositories/evidence-pool.ts` · verify에 풀 회귀 4파일 | `repositories/evidence-records.ts:226-227` `case "published": return sql\`${live} and ${plain} and ${totalKrw} >= 0 and not ${privateToOwnerType} and visibility <> 'private'\`` — 지금 갈래 끝의 넷(:180 `not liveLinkExists · archivedAt is null · needsCheck is null · not privateToOwnerType`)을 모두 품는다(`plain` :219). 호출부 전수 grep: :265 · :364 · :374 · :403 + pool :110 · :129 — 플랜 목록과 같다. `PoolQuery.cardFormats` :34 있음. pool.ts의 모든 풀 질의가 `cardFormats: CARD_FORMATS`(:195 · :230 · :235 · :246) 확인. 시험 파일에서 이 저장소 함수를 직접 부르는 곳 0(grep) — 시그니처 변경이 시험을 깨지 않는다. 07.1-09가 depends_on 07.1-01 · 웨이브 2로 옮겨져 같은 파일 겹침도 풀렸다 |
| E-P1-02 | **해결** | :371-372 「통합 RED … (a) 카드 서식 + `corp_card_id = null` (b) `total_krw < 0` … 지금은 둘 다 보인다」 · :373 확인 필요 사례는 「회귀(이미 녹색)」 | 지금 published 갈래에 카드 미등록 · 음수 조건이 없고(:180), 목록 `{state:"all"}`은 `live`만(:240) → (a) · (b) 둘 다 지금 보인다. RED가 진짜다 |
| E-P2-01 | **해결** | :316 「판정은 `sourceOf` 안에서 … `row.attached`(liveLinkExists) … `row.archivedAt !== null`」 · :374 `listAllEvidenceRecords` 통합 사례 | `sourceOf` :290 `attachedKind: null` 고정 · :468 `rows.map(sourceOf)` · `LIST_COLUMNS.attached: liveLinkExists` repositories :327 · 행 타입에 `archivedAt` 있음 — 맞다. (P3-1 참고: :860 호출부) |
| E-P2-02 | **해결** | :367 시험 계급 = 「`evidence` 보기 + `evidence.intake` 쓰기 + 금액 보임 둘, `cards.proxy` 쓰기 없음」 | `domain/permissions/scope-for.ts:167-168` 보기 → none, intake → all 차례 그대로. 이 계급은 all이라 `withAttachFacts`(:306 all만)가 판정을 낸다 — 맞다 |
| E-P2-03 | **부분** | :375 「번호 없는 구매 요청(`purchase_requests.number` null)에 붙은 … 줄」 · :382 판정 재료 = 번호 유무 | 판정 재료(번호 유무 · `canSeeLinkOwner` 안 씀)는 맞다. 그런데 픽스처 데이터가 만들 수 없다 — 아래 **N-P2-A** |
| E-P2-04 | **해결** | :452 「`loadPreSettleInputs(viewer)`를 그 호출에서 한 번만 … 프로젝트마다 `computePreSettleCheck(viewer, projectId, inputs)`를 `Promise.all` … 정산 아닌 행은 점검 0회 … `log.warn`」 · 감시 호출 수 behavior · awk acceptance | `domain/pre-settle-check/index.ts:129` `loadPreSettleInputs(viewer)` · :164 `computePreSettleCheck(viewer, projectId, inputs, tx?)` · `domain/settlements/index.ts:235-239` 지금 꼴과 :545-561 막힘 이유 꼴 — 그대로 쓸 수 있다 |

### 07.1-04

| 번호 | 판정 | 플랜 | 코드 대조 |
|---|---|---|---|
| E-P1-03 | **해결** | :45 truth · :162 ⑤ 「`patchChangesValues`(:301-303)에 `patch.usedOn !== null`을 더하고 타입 가드에 usedOn 갈래」 · :145 통합 「합계 · 카드 같음 · 사용일만 다름 → `used_on` = 명세 날짜 · 돈 칸 그대로 · `changes = { usedOn }`만」 · acceptance :175 | `domain/evidence-records/attach.ts:301-303` 지금 `patch.total !== null \|\| patch.card !== null`. 날짜만이면 total null → :356 split null → `applyFileWins` `total: null` → 돈 · 외화 칸을 쓰지 않음(`repositories/corp-card-usages.ts:428-431`) — truth와 맞다 |
| E-P1-04 | **해결** | :46 · :162 「바탕은 `loadCardOverwriteBasis(viewer, [usage.usedOn, record.issuedOn])`」 · 분할 날짜 `patch.usedOn?.after ?? usage.usedOn` · `judgeCardCandidates` 바탕에 줄 날짜 · :158 막힘 판정 실행가 분할 날짜 `patch.usedOn ?? fact.usedOn` | `domain/corp-card-usages/index.ts:1720-1721` 날짜마다 세율을 읽고 :1729 없으면 throw — 바탕에 새 날짜가 들어가므로 쓰기(:356)와 막힘 판정(:1794) 모두 세율을 찾는다. 가져오기 길은 `usedOn: null`이라 `fact.usedOn`(옛 바탕에 있음) — 안전 |
| E-P2-15 | **해결** | :49 truth · :211 ② 「1 · 2단계가 모두 사용일 일치를 요구하므로 … 이미 맞음」 · :199 behavior 「`changes.totalKrw` 한 칸 · `changes.usedOn` 없음」 | 1회차 확인 사실 그대로(reconcile.ts:44 · :53) |
| E-P2-16 | **해결** | :52 truth · :213 ③ 「`cardSlipOwner(viewer, usageId, tx)`(안에서 `lockCardUsageForUpdate`) → 잠근 행 status로 `cardUsageRecordRights(...).attach` 재판정 → `lockEvidenceRecordState` → `deps.afterLock` → `detachLink`」 · :203 경합 사례 · acceptance :226 | `domain/corp-card-usages/index.ts:1176-1183` tx가 있으면 잠근 행으로 `toCardSlipOwner` · 보관이면 status `closed`(:1165) → `cardUsageRecordRights` `attach = read ∧ status open ∧ intake`(attach.ts:1018-1024) 거짓 — 설계대로 막힌다 |
| E-P2-17 | **해결** | :48 · :158 ③ 「`CardOverwritePatch`에 `usedOn: string \| null` … `changed`(:1754)가 `usedOn !== null`도 본다」 · :142 · :149 사유 글자 시험 | `cardUsageOverwriteBlocks` :1754 지금 합계 · 카드만 → 플랜대로 넓히면 fixed · completed 판정(:1768-1771)을 탄다 |

### 07.1-07

| 번호 | 판정 | 플랜 | 코드 대조 |
|---|---|---|---|
| E-P1-07 | **해결** | :21 · :45 truth · :209 「`countEvidencePool(P, { kind: "expense", id: D })` == 그 목록의 고를 수 있는 B 공개 줄 수」 · acceptance `grep -c "countTodoEvidence" … == 0` · depends_on [] · wave 1 | `domain/evidence-records/pool.ts:238-248` 지출결의 갈래가 `evidenceScopeFor` 범위로 센다 — P(보기만 · published)에서 잴 수 있다 |
| E-P2-23 | **해결** | :209 `listEvidencePool(P, { owner: { kind: "expense", id: D } })` 보임 · 안 보임 · 보관 · 팀 발령 사례 | 작성자 모드 = `rights.authorAttach ∧ evidence 보기`(pool.ts:60) — role-pm 기안자면 선다 |
| E-P2-24 | **해결** | :213 「(지운 사례 — E-P2-24)」 | — |
| E-P2-25 | **해결** | :112 accepted debt 고쳐 씀 · :47 truth · T-07.1-07-06 transfer → 07.1-14 | 실제 비우기는 07.1-14 Task 2 ② — 그쪽 구멍은 N-P2-B |
| C-1 | **반영** | :45 truth 「증빙 고르기에서 본다 … `/expenses/evidence`는 intake 쓰기」 · Task 3 ③ 보고 문구 | — |

### 07.1-09

| 번호 | 판정 | 플랜 | 코드 대조 |
|---|---|---|---|
| E-P1-08 | **해결** | files :15 `repositories/expenses.ts` · :50 truth · :200 ② `expenseListFilterCondition` 세 목록 함수 공용 · `summarizeExpenseList`는 `inView` FILTER에만 · `scopeCondition` 미접촉(acceptance awk == 0) | `repositories/expenses.ts:662-676` · :678- · :759-782 세 함수의 입력에 `search`만 있고, :770 `inView` FILTER 꼴이 검색과 같은 자리 — 그대로 넣을 수 있다. `visibleCount` · `othersCount` 비거름도 :766-767 주석과 같은 이유 |
| E-P2-27 | **해결** | :49 · :200 팀 = `(${docTeamId})::text` | `docTeamId` :561 — 행 범위와 같은 칸 |
| E-P2-28 | **해결** | :46 truth · :151 ② `countPoolForScope` 입력 `docEvidenceType` · ③ `countRecommendedEvidence` · 트리거는 `countEvidencePool` 그대로 | `countPoolForScope` :98-111 입력에 문서 사실이 없음 — 넓히는 방향 맞다. 반영 중 스스로 찾은 「같은 종류 건수로 트리거를 가르면 검색 길이 닫힌다」 처리도 맞다 |

### 07.1-14

| 번호 | 판정 | 플랜 | 코드 대조 |
|---|---|---|---|
| E-P2-41 | **해결** | :55 truth · :155 ③ `changes: buildChanges({ division: 이전 이름 }, { division: 새 이름 })` · :157 ③-2 `division: "본부"` · files에 detail-lines 두 파일 | — |
| E-P2-42 | **해결** | :57 · :155 ③ `lockSeatKeys(viewer, { personIds: [userId] }, tx)` → … → `findMembershipAtDate(viewer, userId, 오늘, tx)` · Task 2 경합 시험(`holdKey` · `waitingOnKey`) | `domain/org/index.ts:307` `assignTeam`이 같은 사람 키(+팀 키)를 같은 층 정렬로 잡고 :318에서 잠금 뒤 사람을 다시 읽는다 — 교착 없음 |
| E-P2-43 | **해결(구멍 하나)** | :58 truth · :203 ② `assignTeam` tx 안에서 본부 칸 null + 로그, 오늘 · 미래 발령 모두 | 오늘 발령은 닫힌다. 미래 발령 뒤 재입력 길이 남는다 — N-P2-B |
| D-E2 | **반영** | 같음 | — |

### 07.1-03

| 번호 | 판정 | 플랜 | 코드 대조 |
|---|---|---|---|
| E-P2-09 | **해결** | :50 truth · :156 ② 잎 모듈 `domain/evidence/drafter-rule.ts` import 0 · acceptance :175-177 | 순환 사슬 `domain/evidence/index.ts:17` → expenses → `domain/expenses/index.ts:78` → evidence-reviews — 잎 모듈이면 끊긴다 |
| E-P2-10 | **해결** | :53 · :254 ③ `z.coerce.number().int().refine(v===1‖v===10)` · `roundingUnitOf` money 이동 · registry kind 시험 | zod 4.6.5 — `.refine`이 타입을 감싸지 않아 `describeSettingField`(registry.ts:436-439)가 `number`로 읽는다. 같은 꼴 선례 `domain/settings/keys.ts:84` · :94 |
| E-P2-11 | **해결** | files :18 · :21 · :24(formats.test · evidence-import/amounts · payments.test) | — |
| E-P2-12 | **해결** | :54 · :250 대상 `key.ts:37 splitOffsetPairs` · 코드 변경 0 · 회귀 | — |
| E-P2-13 | **해결** | :200 허용 결과 둘 + 불변식 | `domain/payments/index.ts:514` version 다르면 `PaymentConflictError` · 붙이기 쪽 `bumpExpenseVersion`(domain/evidence/index.ts:205 · evidence-reviews :236) — 두 갈래 설명과 맞다 |
| E-P2-14 | **해결** | :52 · :244 `getPaymentView(...).evidenceTaxLine` 통합 단언 · export 안 함 | — |

### 07.1-11

| 번호 | 판정 | 플랜 | 코드 대조 |
|---|---|---|---|
| E-P2-31 | **해결** | Task 1 :132 갈래 A(재현됨) / B(이미 맞음 · 회귀만) · `page.route`로 이동 붙잡기 | — |
| E-P2-32 | **해결** | :177 ② `cardArchivedAt: corpCards.archivedAt` 목록 · 상세 select · 로그 `cardChange`는 인자 안 넘김 · files :11 저장소 | `listCardUsageRows`가 이미 `corpCards.label` 등을 select(조인 있음) |
| E-P2-33 | **해결** | :179 ③ `listArchivedCardsWithUsages(viewer, scope)` EXISTS + 같은 `scopeCondition` · 「사용 없음 → 옵션 0」 | `repositories/corp-card-usages.ts:66-71` `scopeCondition`. (P3-3 참고: 활성 카드 옵션과 등록자 갈래가 다르다) |
| E-P2-34 | **해결** | :214 ① CI=true 실측 먼저 · soft 유지 · 이미 pass면 CSS 0 | — |

### 07.1-12

| 번호 | 판정 | 플랜 | 코드 대조 |
|---|---|---|---|
| E-P1-10 | **해결(D-E3)** | :47 truth 「지금처럼 막는다 … PF7은 「이미 번호 숨김 · 받아들임」으로 닫는다(코드 변경 0 · 회귀 시험)」 · `repositories/files.ts` files에서 뺌 | `domain/evidence/upload-checks.ts:9` · :71 번호 없는 거부 그대로 |
| E-P2-35 | **해결** | :135 ② 기존 `write().catch` 조건을 `isUniqueViolation ‖ isCancelFlagRace`로 · 한 번 · batch 한 벌 | — |
| E-P2-36 | **해결** | :141 ⑤ 훅 대신 `evidenceSourcesOf(…, tx).needsCheckCount > 0` → `deleteReviewByExpense` + `recordAction`, version은 :630 한 번 | `domain/evidence/has-evidence.ts:22` `needsCheckCount` · `repositories/expense-evidence-reviews.ts:75` `deleteReviewByExpense(viewer, id, tx)` · 취소 tx `bumpExpenseVersion`(payments/index.ts 취소 함수 안) 한 번 — 있는 함수만 쓴다 |
| E-P2-37 | **해결** | files :11 `repositories/corp-cards.ts` · :55 `tx: DbOrTx = db` · 복원 tx 차례 | `repositories/corp-cards.ts:96` · :101 지금 tx 인자 없음 — 맞게 짚었다. `lockEvidenceCardImport`(repositories/evidence-import-batches.ts:29) 있음 |

### 07.1-13

| 번호 | 판정 | 플랜 | 코드 대조 |
|---|---|---|---|
| E-P2-38 | **해결** | files :11 `domain/projects/ledger.ts` · :226 ④ `changed.preEstimateChanged = true` 자리에 `changes.preEstimate` | `domain/projects/ledger.ts:327-334` 그 자리 확인 |
| E-P2-39 | **해결** | :222 ② `findRevenueEntriesByIds` 새 묶음 읽기 · :224 ③ 루프 전 한 번 · version 같고 UPDATE 성공한 줄만 | `domain/revenue/index.ts:523-524` 두 `saveEntries` 호출 앞이 한 tx — 넣을 자리 있음. 저장소에 그 이름 함수는 아직 없음(새로 만듦 — 플랜이 그렇게 적음) |
| E-P2-40 | **해결** | ledger :314 `lineChanges = [{ id, kind, no, name, changes }]` · :174-178 | — |

### 07.1-16

| 번호 | 판정 | 플랜 | 코드 대조 |
|---|---|---|---|
| E-P1-11 | **해결** | :46-48 truth · `LoadedPaySchedule.earliestEvidenceIssuedOn` · `withEffectiveDate`가 함께 얹음 · `TaxDateSource` 필수 칸 · 10-05 / 10-12 / 10-20 시험 | `domain/payments/pay-schedule-load.ts:59` 이미 `listEarliestIssuedOnForExpenses`를 읽는다 · `domain/expenses/index.ts:486 · :1169 · :1645 · :1777` 넷 모두 `withEffectiveDate(row, …)`를 거친다 — 그 도우미에 얹으면 넷이 같은 값을 받는다. 필수 칸이라 빠진 길은 typecheck가 잡는다 |
| E-P2-44 | **해결(D-E4)** | :49 truth · :190 ② 「승인 문서의 EVID-04 지움(:207-208)은 바꾸지 않는다」 · :185 시험 · acceptance :202 diff 0 | `domain/evidence/index.ts:207-208` `change.kind === "void" && !hasEvidence → clearEvidenceValues` 그대로 |

### 결정 반영

| 결정 | 플랜 | 판정 |
|---|---|---|
| D-E1(±31일 밖 막힌 행 · 완료 · 고정 날짜 변경 막힘) | 04 :47 · :48 · :156 `USED_ON_GAP_MAX_DAYS = 31` · `날짜 다름 · {n}일` · 서버 재판정 :162 | 반영 |
| D-E2(팀 생기면 칸 비우기 · 14 쓰기 길 · 스키마 0) | 07 :47 · 14 :58 · :203 | 반영 — 미래 발령 처리에 구멍(N-P2-B) |
| D-E3(PF7 지금처럼 막기 · Task 2 ③ 제거) | 12 :47 · 원장 :314 | 반영 |
| D-E4(EVID-04 유지 · 수동 값은 작성 중 · 반려만) | 16 :49 · :190 | 반영(「회수」도 넣었다 — 기안자가 고치는 문서라 뜻에 맞음) |
| C-1(증빙 고르기에서 본다) | 07 :45 · Task 3 ③ | 반영 |

---

## 2. 새 결함(재계획으로 바뀐 부분만)

**N-P2-A [P2] (confidence: 9/10) 07.1-01-PLAN.md:375 · :382 · db/schema/purchase-requests.ts:15 — E-P2-03 픽스처 「번호 없는 구매 요청」은 만들 수 없다**
- 플랜 :375: 「번호 없는 구매 요청(`purchase_requests.number` null)에 붙은(살아 있는 링크) 증빙 줄을 확인 필요로 둔다」, :382: 「실제로 번호가 null이 되는 연결은 번호 없는 구매 요청 · 카드 사용이다」
- 코드: `number: text("number").notNull(),`(구매 요청 표). 번호가 null일 수 있는 주인은 카드 사용뿐이다 — `db/schema/corp-card-usages.ts:39-42` 「06.5 D-6503: K 번호. 이미 있는 행은 비워 둔다(데이터 이전 없음)」 `number: text("number")`. 픽스처 도우미도 번호 없는 카드 사용을 만들면 던진다(`test/integration/fixtures/evidence.ts:203` `if (!row?.number) throw new Error("카드 사용 번호 없음")`).
- 결과: 실행자가 E2E RED를 지시대로 쓸 수 없다(NOT NULL 위반). 다른 주인으로 즉석 대체하게 된다.
- 고칠 내용: :375 · :382 · 원장 :564의 픽스처를 「번호 없는 옛 카드 사용(픽스처로 만든 뒤 `corp_card_usages.number`를 DB에서 null로)에 붙은 확인 필요 줄」로 바꾸고, 「번호 없는 구매 요청」 문구를 지운다.

**N-P2-B [P2] (confidence: 6/10) 07.1-14-PLAN.md:58 · :155 · :203 — 미래 발령으로 칸을 비운 뒤 관리자가 본부를 다시 넣을 수 있고, 그 값이 팀 기간이 끝난 뒤 다시 읽힌다(CG-04가 되살아남)**
- 플랜 :58: 「오늘 · 미래 발령 모두 비운다(… 그 사이 상세에 칸이 보이므로 관리자가 다시 넣을 수 있다)」. :155 `setPersonDivision`의 막힘 판정은 「`findMembershipAtDate(viewer, userId, 오늘, tx)`로 오늘 발령 재조회(있으면 `팀 있음 · 본부는 팀에서`)」뿐이다.
- 경로: 미래 발령 T(본부 A) 저장 → 칸 null → 시작 전 관리자가 본부 B를 다시 넣음(플랜이 권하는 길) → T 시작(팀 우선이라 B 무시) → 나중에 T 발령이 끝나 팀 없음 → 07.1-07 `evidenceScopeFor`가 칸 B를 다시 읽는다 → 옛 본부 B 공개 증빙이 보인다. D-E2가 막으려던 CG-04와 같은 누수이고, 이번에는 플랜 문구가 그 길을 안내한다.
- 고칠 내용(셋 중 하나): (a) `setPersonDivision`이 오늘 이후 시작하는 발령도 재조회해 있으면 거부(`팀 발령 있음 · 본부는 팀에서`) + 화면 칸도 그때 숨김. (b) 비우기를 오늘 발령에만 하고, 미래 발령은 시작일에 비우는 길이 없으니 (a)와 함께 쓴다. (c) 읽기 쪽(07.1-07)에서 「발령 이력이 하나라도 있으면 칸을 안 읽는다」 — 위험 경로 PR이 바뀌므로 비추천. (a)를 권한다. 시험: 「미래 발령 뒤 본부 저장 → 거부」.

---

## 3. P3 표본(반영 판단 불필요 · 참고)

- P3-1 07.1-01:316 — `sourceOf(row, age)`를 필수 인자로 바꾸면 목록이 아닌 호출부 `readEvidenceRecordFacts`(domain/evidence-records/index.ts:860)도 규칙 · 오늘을 읽거나 넘겨야 한다. 「목록 함수가 넘긴다」만 적혀 있다 → `age`를 선택 인자로 두고 없으면 `ageDays: null`이라고 한 줄.
- P3-2 07.1-04:45 · :162 — 날짜만 다른 붙임도 두 금액 보임 검사(attach.ts:327-328)를 거치게 됐다. 지금 성공하던 「합계 같음 · 날짜 다름」 붙임이 금액을 못 보는 등록 계급에게는 `denyCardSlipWrite`로 바뀐다. 의도라면 SUMMARY에 한 줄. 또 날짜만 바뀌면 공급가 · 세액을 다시 나누지 않는다(:356 total 있을 때만) — 두 날짜 세율이 다르면 옛 날짜 세율이 남는다(카드 세율 이력이 실제로 바뀌는 일은 드묾). 그 밖에 `team_cost` 카드 사용의 `team_id`(사용일 소속에서 정함 — domain/corp-card-usages/index.ts:210)를 새 날짜로 다시 보지 않는다.
- P3-3 07.1-11:179 — 보관 카드 옵션은 `scopeCondition`(등록자 갈래 포함, repositories/corp-card-usages.ts:68)을 쓰고, 활성 카드 옵션 `cardChoicesFor`(domain/corp-card-usages/index.ts:1511-1515)는 주인 · 팀만 본다. 등록만 한 사람에게 활성 카드는 안 보이는데 보관 카드는 보인다 → 둘 중 하나로 맞추는 한 줄.
- P3-4 07.1-01:388 — published 갈래에 `totalKrw >= 0`이 들어오면서, published 범위이면서 작성자 모드가 아닌 풀(카드 사용 `registrar` = `rights.attach`, intake 없이는 불가)이 음수 줄을 잃는다. 지금 권한 구조에서는 그런 사람이 없다(attach.ts:1018 attach는 intake 필요) — 실제 영향은 없고 SUMMARY 한 줄이면 된다.

## 4. 사용자 결정

새로 필요한 결정 없음. N-P2-B는 D-E2(「팀 생기면 칸 비우기」)의 뜻 안에서 플랜을 고치면 된다((a) 권장). 플래너가 「미래 발령도 비운다」를 자기 판단으로 넣었으므로, (a) 대신 「미래 발령은 비우지 않음」을 택하려면 그때만 사용자에게 묻는다.
