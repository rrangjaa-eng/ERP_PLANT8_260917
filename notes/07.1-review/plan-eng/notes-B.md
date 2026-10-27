# 07.1 /plan-eng-review — 그룹 B (돈 · 지급 · 결재 · 세금)

대상: main b9acdd8 · 플랜 07.1-03 · 11 · 12 · 13 · 16. 읽기 전용. 체커 r2 · SUMMARY · 디자인 final-check에서 이미 처리된 지적은 제외했다.
합계: **P1 2 · P2 17 · P3 7** · 결정 필요 2.

---

## 07.1-03 지급 게이트 문구 · 세금 줄 · 절사 단위 · PE15

### Architecture
- 데이터 흐름: `expenseDrafterAddsEvidence`(규칙) → `evidenceGateInputs`(단건 · 지급 완료) / `judgeTargets`(목록) → `evidenceGateDecision` 마지막 거부 갈래 글자만 분기. 허용 집합은 바뀌지 않는다(맞음).
- 운영 실패: 프로젝트가 사전 조회와 잠금 사이에 완료로 바뀌면 이유 글자만 한 단계 낡는다. 판정은 바뀌지 않으므로 받아들일 수 있다(P3-03-7 참고).

**[P2] (confidence: 7/10) 07.1-03-PLAN.md:62 · :131 — 새 정적 import가 런타임 순환을 만든다**
- 플랜: `from: domain/evidence-reviews/index.ts → to: domain/evidence/index.ts via: "evidenceGateInputs → expenseDrafterAddsEvidence(...)"`
- 코드: `domain/evidence/index.ts:17` `import { canSeeExpense, … } from "@/domain/expenses";` → `domain/expenses/index.ts:78` `import { recheckEvidenceConfirmation } from "@/domain/evidence-reviews";` → (새 줄) evidence-reviews → `@/domain/evidence`. 이 저장소는 이 꼴을 이미 경계한다: `domain/evidence-reviews/index.ts:43-44` 「정적 상호 import는 런타임 순환이다」.
- 고칠 내용: `expenseDrafterAddsEvidence`(와 `expenseDrafterRemoves` · 상태 집합 두 개)를 무거운 import가 없는 잎 모듈(예: `domain/evidence/has-evidence.ts` 또는 새 `domain/evidence/drafter-rule.ts`)에 두고, `domain/evidence/index.ts` · `evidence-reviews` · `payments/targets`가 그 모듈을 import하게 key_links · artifacts를 고친다.

**[P2] (confidence: 8/10) 07.1-03-PLAN.md:220 — 좁힌 스키마가 설정 화면의 숫자 칸을 문자열 칸으로 바꾼다**
- 플랜: `스키마 z.coerce.number().pipe(z.union([z.literal(1), z.literal(10)]))`
- 코드: `domain/settings/registry.ts:412-414` `function unwrapPipe(schema) { if (zodTypeName(schema) === "pipe" … ) return schema.out; }` → out은 `union`이고, `:438-445`는 `if (typeName === "number") return { kind: "number" … }` … `return { kind: "string" };`. 그래서 `/admin/settings`의 두 칸이 문자열 입력으로 바뀌는데, 이를 잡는 시험이 없다.
- 고칠 내용: 스키마는 `z.coerce.number().int().refine((v) => v === 1 || v === 10, { message: "1 또는 10 · 다시 입력" })`로 두어 `type: "number"`를 유지하고 `SettingDef<number>`도 그대로 둔다. `loadTaxRates`(domain/money/tax.ts:161-163)에서는 이미 있는 판정 함수 `vatUnitOf`(domain/evidence-import/amounts.ts:26-29)를 `domain/money`로 옮겨 `RoundingUnit`으로 좁힌다(타입 단언 0이라는 목표를 그대로 이룬다). 「registry.test: describeSettingField(두 키).kind === "number"」 시험 한 줄을 더한다.

**[P2] (confidence: 8/10) 07.1-03-PLAN.md:7-25 · :220 — typecheck를 깨는 파일이 files_modified에 없다**
- 코드: `test/unit/evidence-import/formats.test.ts:273` `{ ...RATES, asOf: "2026-05-28", vatUnit: 100 }`(`TaxRates.vatUnit: RoundingUnit`이 되면 Map 타입 불일치) · `domain/evidence-import/amounts.ts:26` `vatUnitOf(unit: number)`(죽은 검사가 된다) · `test/unit/domain/payments.test.ts:264-283` `preOf(): PaymentInputs`(`projectCompleted`가 필수 칸이 되면 빠진다).
- 고칠 내용: 세 파일을 files_modified에 더하고 처리 방식을 적는다. formats.test의 100 사례는 위 refine 안이면 `loadTaxRates` 경계의 시험으로 옮긴다. `PaymentInputs.projectCompleted`는 선택 칸으로 두거나 preOf에 `projectCompleted: false`를 넣는다.

**[P2] (confidence: 8/10) 07.1-03-PLAN.md:207 · :222 — C-78 P3-2(끝 4자리 없는 상쇄)의 대상 함수가 틀렸다**
- 플랜: `domain/evidence-import/cards.ts:20-60(… 취소 상쇄 — :42 one.cardLast4 === null이면 그대로 · :45 비교)` · ④ 「`record.cardLast4 !== null`을 조건에 더한다」
- 코드: `cards.ts:42`는 A-10 `flagSameApprovalOtherAmount`(같은 부호 · 다른 합계 표시)이고 상쇄가 아니다. 그 안에서 `record.cardLast4 === one.cardLast4`(one은 null 아님)이므로 ④는 효과가 없다. 실제 상쇄는 `domain/evidence-import/key.ts:37-41` `splitOffsetPairs` — `if (line.approvalNo === null || line.cardLast4 === null) return;`(이미 거른다)이고, 이를 직접 재는 시험은 없다(`grep splitOffsetPairs test` 0).
- 고칠 내용: read_first · ④ · behavior를 `key.ts` `splitOffsetPairs`로 바꾼다. 시험은 `test/unit/evidence-import/formats.test.ts`(offsetPairs 사례가 있는 곳)나 새 key 시험에 「null 끝 4자리 두 줄 → offsetPairs 0 · 둘 다 lines」를 회귀로 둔다. 코드 변경은 0이고 「이미 맞음」으로 기록한다.

**[P2] (confidence: 7/10) 07.1-03-PLAN.md:169 — PE15 ⓐ의 기대 결과 집합이 실제 결과와 다르다**
- 플랜: `결과는 「확인 기록 있음 + 지급됨」 또는 「지급 거부(확인 전) + 확인 기록」 중 하나`
- 코드: 붙이기가 먼저 커밋되면 `autoConfirmOnAttach`가 승인 문서의 version을 올린다(`domain/evidence-reviews/index.ts:361-363` `bumpExpenseVersion`). 그래서 지급 완료는 `locked.version !== input.version` → `PaymentConflictError`(`domain/payments/index.ts:513`)가 되고 「지급됨」은 나오지 않는다. 지급이 먼저(증빙 0 · 필수 on)이면 거부 이유는 `증빙 없음 · …`이지 「확인 전」이 아니다.
- 고칠 내용: 픽스처(증빙 필수 on/off · 처음 증빙 0)를 정하고, 단언을 불변식으로 바꾼다 — 「살아 있는 지급이 있으면 확인 기록 confirmed(필수 on일 때) · 확인 기록 없이 지급 0」. 허용 결과는 {붙이기 stored + 지급 충돌}, {지급 거부 `증빙 없음` + 붙이기 stored}로 적는다.

**[P2] (confidence: 7/10) 07.1-03-PLAN.md:211 · :227 — PA10 「단위(지급 세금 줄)」 시험을 둘 곳이 없다**
- 코드: `domain/payments/index.ts:867` `function evidenceTaxLineOf(…)`는 export되지 않는다. Task 3 verify의 단위 목록(money-tax · cards · registry · card-usage-amounts · error-copy)은 이 함수를 재지 않는다.
- 고칠 내용: `expense-payments.test.ts`에서 원천징수 0 · 회사 대납 0 문서를 만들고 `getPaymentView(...).evidenceTaxLine`(:1140)의 글자를 이어 붙여 단언하라고 적는다. 아니면 함수를 export하고 `test/unit/domain/payments.test.ts`를 files에 더한다. 폼 `taxLineText`(domain/expenses/tax.ts:186-215)의 조각 꼴을 재사용할지도 정한다(두 갈래가 따로 늘지 않게).

**[P3] (confidence: 6/10) 07.1-03-PLAN.md:135 — 지급 완료 tx는 이미 프로젝트 행을 잠가 읽는다**
- 코드: `domain/payments/index.ts:501` `if (pre.projectId) await lockProjectForWrite(viewer, pre.projectId, tx);` — `repositories/projects.ts:457-460`가 행을 돌려준다.
- 고칠 내용: tx 길(:516)은 잠근 행의 `status`로 `projectCompleted`를 짓는다(사전 조회 값은 미리보기 :1075에만 쓴다). 이유 글자도 잠금 뒤 값이 된다.

### Tests (커버리지)
```
D-7101 단건 지급 완료(completed)      expense-payments/evidence-presence + 단위   OK
D-7101 미완료 · 팀 비용 그대로         기존 사례(:292 · :629)                       OK
D-7101 목록(일괄)                       payment-batch                               OK
D-7101 행 미리보기(getPaymentView)       —                                           GAP (P3: payment-single E2E는 미완료 갈래만)
PE15 ⓐ 동시                             evidence-presence                           기대값 오류(P2)
PE15 ⓑ submitted · ⓒ 외화               evidence-presence                           OK
PA10 지급 세금 줄 0 갈래                 —                                           GAP(P2)
PX3 스키마 1·10                          registry                                    OK · 화면 칸 종류 GAP(P2)
PX3 끝4자리 상쇄                         cards.test(틀린 함수)                        GAP(P2)
```
### Performance
- 목록 길은 같은 select에 `projects.status`만 더한다(이미 leftJoin, repositories/payment-targets.ts:52). 추가 질의 0 — 좋다.

---

## 07.1-11 카드 사용 다시 저장 · 보관 카드 표시 · S8 넘침

**[P2] (confidence: 7/10) 07.1-11-PLAN.md:110-114 · :119 — PC1 · PC3 E2E는 지금 코드에서 RED가 나오지 않는다**
- 플랜: `E2E: 새 건 저장 → 올리기 실패(흉내) → 금액 고침 · 저장 → 다시 금액 고침 · 저장 → 충돌 문구 없음`
- 코드: `card-usage-form.tsx:447-451` resave onSuccess → `router.replace(\`${slipEditHref}${savedId}\`)` · `:802-805` onSlipChanged도 같다. `app/(app)/cards/page.tsx:199` `<CardUsageEditPanel key={\`edit-${edit.id}\`}>` 대 `:264` `<SidePanel key="new">` — 첫 다시 저장이 성공하면 새 건 폼이 내려가고, 두 번째 저장은 수정 모드(서버 최신 version)가 한다. 남는 틈은 「성공 ~ 이동 완료」 사이에 한 번 더 제출하는 경우뿐이다.
- 고칠 내용: ①에서 도달 가능한 재현(이동 전 두 번째 제출 등)을 시험으로 먼저 보이게 하고, 재현이 안 되면 「이미 맞음 · 회귀 E2E만」으로 닫으라고 적는다. 그때 새 순수 함수는 만들지 않는다(§3.2). acceptance `savedSlipRef.current =`가 늘어야 한다는 줄(:134)은 조건부로 바꾼다.

**[P2] (confidence: 8/10) 07.1-11-PLAN.md:146 · :159 — `(보관)`에 필요한 카드 보관 칸이 행에 없다 · 저장소 파일이 빠졌다**
- 코드: 목록 행 select `repositories/corp-card-usages.ts:102-104` `cardLabel: corpCards.label, cardIssuer: …, cardLast4: …`. 보관 칸이 없다(`corp_cards.archived_at`, db/schema/corp-cards.ts:24). 상세 `cardText`(domain/corp-card-usages/index.ts:1111)도 같은 stored 행을 읽는다.
- 또 `cardLabel`은 감사 로그 `cardChange { from, to }`(index.ts:743)에도 쓰인다. 여기에 `(보관)`이 붙으면 로그 글자가 바뀐다.
- 고칠 내용: files_modified에 `repositories/corp-card-usages.ts`를 더한다(목록 · 상세 행 select에 `cardArchivedAt`). `cardLabel`의 보관 인자는 선택으로 두고 :743 로그 호출은 넘기지 않는다고 적는다.

**[P2] (confidence: 8/10) 07.1-11-PLAN.md:154 · :159 — W12 필터 옵션은 「순서만」이 아니라 새 질의다**
- 코드: `domain/corp-card-usages/index.ts:1511-1512` `cardChoicesFor … listCorpCards(viewer, { scope: { rows: "all", includeArchived: false }, includeInactive: true })` — 지금은 보관 카드가 옵션에 전혀 나오지 않는다. 「사용 내역이 있을 때만」 보관 카드를 내려면 범위 안 사용 존재(EXISTS) 질의가 필요하다.
- 고칠 내용: ②를 `cardChoicesFor`(domain) + 저장소의 「범위 안 사용이 있는 보관 카드」 질의로 고친다. `card-usage-list.tsx`는 그대로 둘 가능성이 크다. 통합 시험에 「사용 없는 보관 카드는 옵션 0」을 더한다.

**[P2] (confidence: 5/10) 07.1-11-PLAN.md:41 · :184 · :190 — 「무른 검사 → 단단한 검사」는 판정을 바꾸지 않는다**
- 코드: `test/e2e/evidence-reconcile-audit.spec.ts:37` `if (pass !== null) expect.soft(pass, …).toBe(true);` — soft 실패도 시험을 실패로 끝낸다. `:27` `WIDTHS = [1280, 1024, 768, 700, 375, 320]`이므로 main CI가 초록이면 S8 행 넘침은 이미 0이다.
- 고칠 내용: ①에서 최근 CI의 `evidence-reconcile-audit.jsonl`이나 로컬 `CI=true` 실행으로 「S8 행 넘침 없음」 pass 값을 먼저 확인한다. 이미 pass면 CSS를 바꾸지 않고 「이미 맞음」으로 닫는다. hard 전환이 꼭 필요하면 그 이유(같은 시험 안 뒤 단계 의존 등)를 적는다.

**[P3] (confidence: 5/10) 07.1-11-PLAN.md:197 — verify 명령이 의존 프로젝트 전체를 돌린다**
- 코드: `playwright.config.ts:193-198` 주석 「스펙 하나만 빨리: --project=desktop-evidence --no-deps <스펙>」 · `dependencies: ["mobile-375", "certs"]`.
- 고칠 내용: `pnpm exec playwright test --project=desktop-evidence --no-deps test/e2e/evidence-reconcile-audit.spec.ts`와 `--project=mobile-375 test/e2e/mobile-card-usage-320.spec.ts` 두 줄로 나눈다.

### Tests
```
PC1/PC3 연속 다시 저장       card-usage E2E   재현 불확실(P2)
PC2 견적 외 줄 1개           corp-card-usages 통합  OK
D-7112 목록·상세 글자        통합+E2E          OK(저장소 select 필요)
W12 필터 보관 옵션           E2E               GAP — 도메인 질의 없음(P2)
고르기에 보관 카드 0         통합 회귀         OK
PE7 S8 넘침                  audit+320         이미 soft로 판정 중(P2)
```

---

## 07.1-12 뒤늦은 취소 재시도 · 지급 취소 풀기 · 카드 다시 잇기 · 비공개 중복 · 빈 파일

**[P1] (confidence: 7/10) 07.1-12-PLAN.md:46 · :163 · :170 — 비공개 파일을 중복 판정에서 빼면 같은 영수증 이중 청구를 막는 장치가 풀린다** — **결정 필요**
- 플랜: `A의 비공개 파일과 같은 sha256 파일을 B가 올리면 중복으로 막히지 않는다(존재 누설 없음)`
- 코드: 비공개 표지는 개인카드 매출전표 같은 청구 영수증 종류에 걸린다(`files.private_to_owner`, db/schema/files.ts:32). 지금 중복 거부는 번호를 내지 않는 문구다: `domain/evidence/upload-checks.ts:9` `EVIDENCE_DUPLICATE_HIDDEN = "이미 첨부된 파일 · 다른 파일 고르기"`, `:71`. 누설되는 정보는 「같은 바이트의 파일이 어딘가 있다」뿐이고, 같은 바이트를 가진 사람만 알 수 있다. 플랜대로 고치면 B는 A의 영수증 파일로 다른 지출결의를 막힘 없이 올린다.
- 선택지: (a) 지금 동작을 유지하고 PF7을 「이미 번호 숨김 · 받아들임」으로 닫는다 **(추천)** · (b) 거르되 그 업로드에 「확인 필요」를 세워 경영관리가 본다(새 동작 · 문구) · (c) 플랜대로 거른다(이중 청구 위험을 받아들임).
- 고칠 내용: 결정 전까지 Task 2 ③을 보류로 표시한다. (b)를 고르면 behavior · 시험을 다시 쓴다.

**[P2] (confidence: 8/10) 07.1-12-PLAN.md:127 — 재시도 범위는 가져오기 tx 전체뿐이다**
- 플랜: `경계가 가져오기 전체 tx라면 전체 재시도의 멱등성을 시험으로 증명하고, 아니면 표시 단계만`
- 코드: 표시 단계는 `write = () => withTransaction(...)`(domain/evidence-import/index.ts:483-525) 한 tx 안에 있다. 오류가 나면 tx가 무효가 되고, 잠금 순서(프로젝트 → 문서 → 견적 줄 → 카드 사용 → 증빙 행, :500)가 있어 표시 단계만 다시 돌 수 없다. 이미 같은 꼴의 재시도가 있다: `:528-531` `write().catch((error) => { if (!isUniqueViolation(…)) throw error; return write(); })`.
- 고칠 내용: 「표시 단계만」 갈래를 지우고 기존 catch를 `isUniqueViolation(…) || isCancelFlagRace(error)`로 넓힌다고 적는다(재시도는 합쳐 한 번). 시험의 `afterOwnerLock` 훅은 두 번째 시도에서도 불리므로 한 번만 동작하게 만든다. 두 번째 시도에서도 batch · 기록 수가 한 벌인지 단언한다.

**[P2] (confidence: 7/10) 07.1-12-PLAN.md:133 — 지급 취소 tx에서 「승인 뒤 풀기와 같은 훅」을 쓰면 version 충돌로 실패한다**
- 플랜: `확인 기록을 푼다(문서 version · 로그 — 승인 뒤 풀기와 같은 훅)`
- 코드: 취소 tx는 이미 `bumpExpenseVersion`을 한다(domain/payments/index.ts:630). 훅 `expenseApprovedEvidenceChange`도 `expectedVersion: owner.version`으로 다시 올린다(domain/evidence/index.ts:203-206 `if (version === null) throw new ExpenseNotFoundError();`). `releaseConfirmationOnRecordFlag`는 살아 있는 지급이 있으면 null이다(:1002). 그리고 취소 tx에는 그 훅이 받는 `EvidenceOwnerState`가 없다(`lockExpenseForUpdate`만 한다, :621).
- 고칠 내용: `markPaymentCancelled` 뒤에 `evidenceSourcesOf(viewer, …, tx).get(id)?.needsCheckCount > 0`(has-evidence.ts — 이미 있는 묶음 판정)이면 `deleteReviewByExpense` + `recordAction`(같은 tx, detail `reviewReleased`)만 한다. 문서 version은 :630의 한 번으로 끝난다고 적는다. 확인 필요 사유를 `CANCEL_REGISTERED_CHECK`로 한정할지도 적는다(P3).

**[P2] (confidence: 8/10) 07.1-12-PLAN.md:7-22 · :168 — tx 이동에 필요한 저장소 파일이 빠졌다**
- 코드: `repositories/corp-cards.ts:96` `setCorpCardActive(viewer, id, active)` → `db.update(...)`(tx 인자 없음) · `:101` `setCorpCardArchived(viewer, id, value)`도 같다. 범용 복원은 `entry.setArchived(viewer, id, false)`(domain/archive/index.ts:303)라 엔트리 인터페이스에도 tx가 없다. 복원 로그(`recordAction`, :315-316)도 tx 밖이다.
- 고칠 내용: files_modified에 `repositories/corp-cards.ts`를 더하고, 카드 복원은 범용 경로에서 떼어 `withTransaction` 안에서 setArchived(tx) → relink(tx) → recordAction(tx) 순서로 한다고 적는다.

**[P3] (confidence: 8/10) 07.1-12-PLAN.md:62 — key_link 대상 파일이 틀렸다**
- 플랜 `to: domain/evidence-import/cards.ts` — 실제는 `domain/evidence-import/card-relink.ts:13` `relinkUnknownCardRecords(viewer, cardId, tx?)`(이미 tx를 받는다).

**[P3] (confidence: 5/10) 07.1-12 Task 2 — 다시 잇기와 가져오기가 직렬화되지 않는다**
- 카드 켜기 tx와 카드 명세 가져오기(`lockEvidenceCardImport`, evidence-import/index.ts:487)가 겹치면, 가져오기는 아직 커밋되지 않은 활성 상태를 못 봐서 「카드 미등록」으로 넣는다. createCorpCard도 같은 꼴이라 새 문제는 아니다. 기록만 하고, 필요하면 켜기 · 복원 tx 맨 앞에서 `lockEvidenceCardImport`를 잡는다.

### Tests
```
CANCEL_FLAG_RACE 1회 재시도 성공 · 2회 실패   concurrency   OK(훅 1회성 필요)
재시도 멱등(batch/기록 1벌)                    —             GAP(P2 — 단언 추가)
released 무관 로그 3갈래                       release       OK
지급 취소 → 풀림 → 재지급 거부                 expense-payments OK(구현 경로 수정 필요)
카드 켜기 · 복원 실패 되돌림                    corp-cards/relink OK
비공개 중복                                     private-files 결정 대기(P1)
0바이트 문구                                    pipeline      OK
```

---

## 07.1-13 행동 로그 전후 값(S8)

**[P2] (confidence: 9/10) 07.1-13-PLAN.md:11 · :168-169 — 사전 견적을 쓰는 곳은 `domain/projects/ledger.ts`라서 Task 3이 멈춘다**
- 플랜: files_modified `domain/projects/index.ts` · read_first 「domain/projects/ledger.ts(… files 경계 밖이면 멈추고 SUMMARY)」
- 코드: `domain/projects/index.ts`의 recordAction은 등록(:721-726, document_create)뿐이다. 사전 견적 쓰기와 로그는 `domain/projects/ledger.ts:318-333` `updateProjectPreEstimate` … `changed.preEstimateChanged = true;`와 `:351-356` `recordAction(… detail: changed …)`에 있다.
- 고칠 내용: files_modified · Task 3 files의 `domain/projects/index.ts`를 `domain/projects/ledger.ts`로 바꾼다. 이미 있는 `changed` detail에 `changes: { preEstimate: [이전 Money 글자, 이후] }`를 더한다(`preEstimateChanged` 칸은 남긴다 — 하위 호환).

**[P2] (confidence: 8/10) 07.1-13-PLAN.md:145 — 매출 줄 저장은 이전 줄을 읽지 않는다**
- 플랜: `두 저장이 tx 안에서 이미 읽는 이전 줄과 쓴 줄로`
- 코드: `domain/revenue/index.ts:475` `repoUpdateRevenueEntryIfVersionMatches(viewer, input.id, input.version, …)`는 조건 UPDATE라서 이전 행을 읽지 않는다. 실패했을 때만 `repoFindRevenueEntryById`(:477)를 부른다.
- 고칠 내용: 고치는 줄 id들을 루프 전에 tx로 한 번 묶어 읽고(행마다 질의하지 않는다), version이 입력과 같을 때만 그 값을 「이전」으로 쓴다고 적는다. 저장소 묶음 읽기가 없으면 `repositories/revenue-entries.ts`를 files에 더한다.

**[P2] (confidence: 6/10) 07.1-13-PLAN.md:133 · :145 — 줄 전후를 담을 키 모양이 정해지지 않았다**
- 코드: `detailLines`는 `detail.changes`를 칸 하나 = 한 줄인 평평한 맵으로 읽는다(domain/action-log/detail-lines.ts:170-180). 객체 값은 `formatPlain`이 `CHANGED`(「바뀜」)로 바꾸고(:80), 라벨이 없는 키는 키 문자열이 그대로 보인다(`labelFor` → `return settingLabel(field) ?? field`). 항목명을 키로 쓰면 같은 이름의 줄 둘이 겹쳐 하나가 사라진다.
- 고칠 내용: 키를 `line{표시 순번}.{칸}`처럼 겹치지 않게 정하고, `detailLines`에 그 접두를 「견적 줄 {순번} {항목명}」 라벨로 바꾸는 갈래 하나를 둔다. 아니면 `lineChanges: [{ no, itemName, changes }]` 배열과 펼치는 갈래를 둔다. `sortOrder` · `version` · `updatedAt` · id 칸은 비교에서 뺀다고 적는다.

**[P3] (confidence: 5/10) 07.1-13 — 큰 저장의 detail 크기**
- 줄 수 상한(`QUOTE_LINE_MAX_PER_REVISION`)까지 바꾸면 jsonb 한 행이 커진다. 위 제외 칸을 지키면 순서만 바꾼 저장은 changes 0이 된다. 상한을 둘지(예: 50줄 + `외 N줄`) 한 줄 적는다.

### Tests
```
입사/퇴직일 전후     people + detail-lines 단위     OK
견적 줄 전후(수정·새·지움)   quote-lines           OK(키 모양 확정 필요)
매출 줄 전후         revenue-entries               OK(사전 읽기 필요)
사전 견적 전후       project-ledger-po              파일 경로 틀림(P2)
숨김 거래처 노출     quote-lines-hidden-vendor      OK(verify 목록에만 — Task 2 verify에 넣기 권고 P3)
```

---

## 07.1-16 증빙일 = 붙은 증빙 가장 이른 발행일

**[P1] (confidence: 7/10) 07.1-16-PLAN.md:42 · :148-158 — 제출 스냅숏 · 상세 재계산 경로가 새 날짜를 받지 않는다**
- 플랜 must_have: `부가세 기준일 · 세금 스냅숏 · 지급 세금 계산 · 지급 대상 목록이 모두 같은 값을 쓴다`. 그런데 Task 1 · 2가 배선하는 곳은 `loadPaymentInputs` · targets · 「DTO · 미리보기」뿐이다.
- 코드: `pickTaxDates`의 세 번째 호출자 `computeExpenseTax`(domain/expenses/tax.ts:130-147)는 `doc`만 받는다. 이 함수를 부르는 곳은 `domain/expenses/index.ts:486`(목록 세율 바뀜) · **`:1169`(제출 — 세금 스냅숏)** · `:1645`(폼 미리보기) · `:1777`(상세 current와 stored 비교 → 「세율 바뀜」)이다. 이 경로들은 모두 `withEffectiveDate(row, …)`(:336-338)를 거치고 수동 `evidenceDate`만 본다.
- 결과: 작성 중에 기록을 붙이고 제출하면 스냅숏은 수동 날짜(없으면 문서 날짜)로 찍힌다. 지급은 가장 이른 발행일로 다시 계산하므로 세율 경계를 넘으면 지급 총액이 결재 금액과 달라지고, 상세에는 「세율 바뀜」이 거짓으로 뜬다. 이를 잡는 시험도 없다(Task 1의 tax-snapshot은 「불변」만 잰다).
- 고칠 내용: 가장 이른 발행일 묶음 읽기를 `withEffectiveDate`와 같은 자리(문서 행에 날짜를 얹는 도우미)에 넣어 `computeExpenseTax` 호출 넷과 지급 · 목록이 같은 입력을 받게 한다. files에 그 줄들을 적는다. 시험을 하나 더한다 — 「기록 둘(10-05 · 10-12) 붙은 작성 중 문서 제출 → 스냅숏 basisDate 10-05 · 지급 미리보기 payable = 스냅숏 payable · 상세 세율 바뀜 없음」.

**[P2] (confidence: 8/10) 07.1-16-PLAN.md:43 · :114 — 승인 문서에서 마지막 증빙을 떼면 수동 증빙일이 지워진다(EVID-04)** — **결정 필요**
- 플랜: `통합: 증빙을 모두 떼면 10-20으로 돌아간다 · 수동 값은 DB에 그대로`
- 코드: `domain/evidence-records/attach.ts:636` 승인 문서에서 떼면 `afterEvidenceOwnerChange(… { kind: "void" })` → `domain/evidence/index.ts:207-208` `if (change.kind === "void" && !(await hasEvidence(...))) { await clearEvidenceValues(viewer, owner.id, tx); }` → `repositories/expense-evidence-reviews.ts:86` `.set({ evidenceDate: null })`. 지급 시험 픽스처는 승인 문서이므로 이 단언은 실패한다.
- 선택지: (a) EVID-04는 그대로 두고 U-4 「수동 값 유지」를 작성 중 · 반려 문서로 한정한다. 승인 문서는 떼면 문서 날짜로 돌아간다 **(추천 — 기존 결정과 맞음)** · (b) EVID-04를 「붙은 기록이 없을 때만 지움」으로 바꾼다(지금 동작 변경 · 회귀 시험 필요).
- 고칠 내용: 고른 쪽으로 behavior :114와 must_have :43을 고쳐 쓴다.

**[P3] (confidence: 8/10) 07.1-16-PLAN.md:15 · :112 — 단위 시험 경로가 없다**
- `test/unit/expenses/tax-dates.test.ts`는 없다. 기존 `pickTaxDates` 시험은 `test/unit/domain/expenses/tax.test.ts`다. 새 파일 대신 그 파일을 확장한다.

**[P3] (confidence: 6/10) 07.1-16 Task 1 ⑤ — 사전 조회와 잠금 사이 발행일 변화**
- 가장 이른 발행일을 사전 조회(`loadPaymentInputs`)에서만 읽어도, 그 사이에 승인 문서에 붙이거나 떼면 문서 version이 올라 `:513` version 검사가 거부한다. 지금 그대로 안전하다고 SUMMARY에 한 줄 적는다.

### Tests
```
pickTaxDates 우선순위           tax.test(경로 정정)         OK
지급 · 목록 같은 기준일          expense-payments/payment-batch OK
제출 스냅숏 기준일              —                           GAP(P1)
상세 세율 바뀜 거짓 없음        —                           GAP(P1)
떼면 수동 값 복귀               expense-payments            EVID-04와 충돌(P2)
폼 칸 숨김/복귀/포커스          E2E 1280·375·320            OK
```
### Performance
- 목록은 문서 id 묶음으로 한 번 읽는다. `evidence_record_links`의 주인 색인을 쓰고, `evidence_records.issued_on`에 주인 기준 색인은 없지만 링크 → 기록 PK 조인이라 충분하다.

---

## 실패 모드 표

| 경로 | 현실적 실패 | 시험 있음? | 오류 처리 있음? | 사용자에게 |
|---|---|---|---|---|
| 03 지급 게이트 문구 | 사전 조회 뒤 프로젝트 완료 → 이유 글자 낡음 | 아니오 | 판정은 잠금 뒤(허용 · 거부 정확) | 보임(글자만 낡음) |
| 03 evidence-reviews → evidence import | 런타임 순환으로 모듈 초기화 순서 오류 | 아니오 | 없음 | 서버 500 |
| 03 절사 단위 스키마 | 설정 화면 칸이 문자열이 됨 | 아니오 | zod 거부 | 보임(입력 형태) |
| 03 PE15 ⓐ | 붙이기 · 지급 동시 → 지급 쪽 version 충돌 | 예(기대값 고쳐야) | PaymentConflictError | 보임(새로 고침) |
| 11 다시 저장 | 이동 전 두 번째 제출 → 낡은 version | 불확실 | 서버 version 거부 | 보임(충돌 문구) |
| 11 보관 카드 필터 | 보관 카드 옵션 없음 | 아니오 | — | 조용함(옵션이 안 보임) |
| 12 가져오기 재시도 | 두 번째 시도에서 훅 · 경합 반복 | 예 | 두 번째는 CANCEL_FLAG_RACE | 보임 |
| 12 지급 취소 풀기 | 이중 version 올림 → ExpenseNotFoundError | 계획됨(구현 경로가 틀림) | 던짐 → 취소 전체 롤백 | 보임(「없는 지출결의」 오인) |
| 12 카드 켜기 다시 잇기 | 가져오기와 겹쳐 미등록으로 남음 | 아니오 | 없음 | 조용함 |
| 12 비공개 중복 거름 | 같은 영수증 이중 청구 | 아니오 | 없음 | 조용함 |
| 13 매출 전후 | 이전 값 없이 로그 | 계획됨 | — | 조용함 |
| 13 줄 키 겹침 | 같은 항목명 줄 변경이 덮임 | 아니오 | 없음 | 조용함(감사 누락) |
| 16 제출 스냅숏 | 스냅숏과 지급 기준일 다름 → 지급 총액 차이 · 거짓 「세율 바뀜」 | 아니오 | 지급 차이 사유 요구 | 보임(혼란) |
| 16 떼기 | 승인 문서의 수동 증빙일이 지워짐 | 시험이 실패할 것 | — | 조용함 |

## 결정 필요
1. **PF7(07.1-12)** — 비공개 파일 중복 판정: (a) 지금 동작 유지(번호 숨김 · 이중 청구 차단) **추천** / (b) 거르고 「확인 필요」 세움 / (c) 플랜대로 거름.
2. **EVID-04 vs U-4(07.1-16)** — 승인 문서에서 마지막 증빙을 떼면: (a) 지금처럼 증빙일 지움, 수동 값 유지는 작성 중 · 반려만 **추천** / (b) 지우지 않도록 EVID-04 변경.
