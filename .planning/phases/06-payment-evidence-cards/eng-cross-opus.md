# Phase 6 플랜 엔지니어링 교차 검토 (06-01 ~ 06-24)

> **Codex 대체 Opus 교차 검토 — 한도 풀리면 Codex 재확인 필요**
> 기준: 브랜치 `claude/plan-phase-06-b3dsju` @ a7f2f4e · 이전 게이트(ceo-*, checker-r1/r2, cross-review-r1/r2)에서 해결된 항목은 다시 적지 않았다.

## 기계 확인 (문제없음)
- 같은 웨이브 안 `files_modified` 겹침 0건(24개 전부 대조, 하이픈 보존 파싱). `_journal.json`을 만지는 플랜은 웨이브마다 하나뿐이다.
- 없는 파일(Phase 4/04.1/5 산출물: `domain/expenses/*`, `db/schema/files.ts`, `domain/reserves`, `domain/quotes/revisions.ts`, `app/(app)/expenses/[id]/*`, `ui/attachments/Attachments.tsx`, `domain/approvals/*`)은 cross-review-r2 R-7과 각 플랜 ⓪ 멈춤 조건이 이미 다룬다. 다시 적지 않는다.

## 막음

### E-1 [막음] 지급 완료 트랜잭션 안에서 전역 `db`로 세율 읽기 → 커넥션 풀 고갈 교착
- **근거:** 06-03-PLAN.md:181은 `lockExpenseRow` **뒤에** "지급 총액 재계산"(`applyTaxRule`)과 "세율 = 증빙일의 `TAX_VAT_RATE` 이력 값"을 둔다. `domain/money/tax.ts:65`의 `applyTaxRule`은 기본값으로 `getSettingValue`를 쓰고, 이것은 `repositories/settings.ts`의 전역 `db`로 읽는다(audit 표: `findEffectiveValue` tx 인자 없음). 풀 상한은 `lib/env.ts:54` `DB_POOL_MAX` 기본 5다. 지급 완료 5건이 동시에 돌면 각자 행 잠금과 커넥션을 쥔 채 여섯째 커넥션을 기다린다. 이것은 PR #75 교착과 같은 꼴이다. 06-04(취소·이체액), 06-06(증빙 확인 금액 고침), 06-10(면제), 06-15(일괄 → 단건 재사용)가 모두 이 경로를 물려받는다.
- **고칠 것:** 06-03 ③에 "설정(세율·반올림 단위·방식)과 `can()`은 트랜잭션을 열기 **전에** 읽고, 트랜잭션 안에는 순수 계산(`decidePayable(input, rates)`, 06-03:227)만 둔다"를 명시한다. 증빙일은 잠금 뒤에야 확정되므로 두 방법 중 하나를 고른다. (a) 잠금 전에 증빙일로 rates를 미리 읽고, 잠금 뒤 증빙일이 달라졌으면 `PayableChangedError`로 거부한다. (b) `applyTaxRule` deps에 tx로 묶인 `getSettingValue`를 넘긴다. 06-04 통합 테스트에 `DB_POOL_MAX` 이상 병렬 `Promise.all` 한 케이스를 더해 RED를 확인한다.

### E-2 [막음] `allocateScopedDocumentNumber`가 PR #75 교착을 그대로 옮긴다
- **근거:** 06-02-PLAN.md:225는 "기존 `allocateDocumentNumber`와 같은 규약(반드시 문서 INSERT와 같은 트랜잭션)"이라고 적는다. 그런데 이 브랜치의 `domain/document-numbering/index.ts:88`은 트랜잭션 안에서 `loadDocumentNumberFormat`을 부르고, 이 함수는 76-80행에서 `getSettingValue`를 5번 부른다(전역 `db`). PR #75 수정은 origin/main(0341e36)에 없다. 06-08-PLAN.md:160은 이 함수를 `lockQuoteLines` 잠금을 쥔 같은 트랜잭션 안에서 부른다.
- **고칠 것:** 06-02 ②를 이렇게 바꾼다. "서식은 `loadDocumentNumberFormat`으로 트랜잭션 **밖에서** 읽어 `format` 인자로 넘기고, `allocateScopedDocumentNumber(viewer, { counterKey, scope, format }, tx)`는 설정을 읽지 않는다(PR #75 꼴)." 06-08 ③은 트랜잭션을 열기 전에 서식을 읽게 하고, 06-08 통합 테스트의 "번호 경합" 케이스를 풀 크기 이상 병렬로 돌린다.

## 고침

### E-3 [고침] 구매 완료 트랜잭션 안의 `createCardUsage`가 전역 `db`로 권한·카드·세율을 조회한다
- **근거:** 06-12-PLAN.md:158은 `completePurchaseRequest`가 한 트랜잭션에서 줄·요청 행을 잠근 뒤 `createCardUsage`를 부르게 한다. 그 안에서 `can(viewer,"cards.purchases","write")`(`repositories/permissions.ts findPermission`, 전역 `db`), 활성 카드 조회(`repositories/corp-cards.ts`, audit상 tx 인자 없음), `splitCardTotal`의 `tax.*` 설정 읽기(06-05:206)가 돈다. 이 경로는 E-1과 같은 풀 고갈 꼴이다. 06-05·06-07은 `createCardUsage`가 트랜잭션을 스스로 여는지 외부 `tx`를 받는지도 정하지 않는다.
- **고칠 것:** `createCardUsage(viewer, input, tx?)`로 정하고, 권한·카드 자격·세율 사전 조회는 호출자가 트랜잭션을 열기 전에 끝내 인자로 넘긴다(`saveQuoteLines`의 standalone/외부 tx 이중 경로와 같은 꼴). 06-12 acceptance에 "트랜잭션 콜백 안에 `can(`·`getSettingValue(` 0건" grep을 더한다.

### E-4 [고침] 06-18이 이미 교착 버그가 있는 원장 경로(B)에 쓰기를 더한다
- **근거:** 06-18-PLAN.md:122·203은 `saveProjectLedger` 트랜잭션 안에서 `linkIssueRequestToEntry`(요청 행 `FOR UPDATE`)를 돌린다. audit B행(`domain/quotes/lines.ts` 372·375, `revenue/index.ts` 319·324)은 이 트랜잭션 안에서 아직 전역 `db`를 쓰고 있다. 새 잠금이 붙으면 잠금을 쥔 시간이 늘어나 고갈 확률이 오른다.
- **고칠 것:** 06-18 ⓪에 "audit B행 수정(PR #40 계열)이 main에 있는지" 확인을 더하고, 없으면 멈춘다. 또는 `lockIssueRequest` 안에서는 전역 `db`를 부르지 않는다는 grep을 acceptance에 넣는다.

### E-5 [고침] 06-07 "잠금 순서" 단위 테스트는 RED를 만들 수 없다
- **근거:** 06-07-PLAN.md:158의 behavior는 "`lockQuoteLines([3,1,2])`가 1→2→3 순서로 잠근다"이다. 잠금 획득 순서는 결과 행으로 관찰되지 않는다. `ORDER BY`가 없어도 이 테스트는 초록일 수 있다.
- **고칠 것:** 생성된 SQL에 `order by "id"`와 `for update`가 있는지 단언한다(`.toSQL()`). 또는 06-13의 `dual-link-concurrency`에 역순 id 두 요청 병렬 케이스를 더해, 교착이 없고 둘 다 끝나는지를 판정한다.

## 참고
- **R-1 (06-05 잔차 정의):** 06-05:200·206은 부가세를 `diffKrw(합계, 공급가)`로 두어 공급가+부가세 = 합계가 항상 성립한다. "잔차 = 재계산 합 − 합계"가 이 부가세로 계산되면 잔차는 늘 0이고 `· 반올림 차이 N` 테스트는 실패할 수 없다. 재계산 부가세는 `round(공급가×세율)`로 따로 셈한다고 behavior에 적는다(`domain/revenue/index.ts:92-94` 선례). 예시 값(예: 합계 1,000,001)으로 잔차 ≠ 0 케이스를 하나 넣는다.
- **R-2 (06-05 세율 기준일):** 카드 역산 세율의 `asOf`(사용일)가 명시되지 않았다. 06-03의 증빙일 기준과 맞춰 적는다.
- **R-3 (06-15 스냅숏과 무효화):** 06-11 무효화 훅이 version을 올리지 않는 설계(06-15:171)는 "잠금 뒤 게이트 재판정"에만 기대고 있다. E-1 수정 뒤에도 게이트 입력(증빙 상태)이 잠금 **뒤에** tx로 읽히는지 06-04 acceptance에 한 줄 확인을 둔다.
