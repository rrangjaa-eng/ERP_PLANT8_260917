# 06 eng 검토 B — 지급·증빙·종결 (06-03 · 04 · 06 · 10 · 11 · 15 · 16 · 17 · 20 · 28)

기준: 플랜 HEAD 5129a4e. 05 실물은 pr162 86bec989.
집계: P0 1 · P1 3 · P2 5 · P3 5

## 1. 발견

| # | 등급 | 위치 | 설명 | 고칠 방향 |
|---|---|---|---|---|
| B1 | [P0] (confidence 9/10) | 06-28-PLAN.md:149, :207 | **⓪ 검사에서 실행이 멈춘다.** 플랜은 `listNumberedByLine`를 요구한다.<br>플랜 :149: 「`git grep -n -e "export async function listNumberedByLine(" -e "export async function listNumberedByLines(" -e "export async function listExpensePage(" repositories/expenses.ts` 3건 미만이면 멈춤」<br>그런데 pr162 86bec989의 `repositories/expenses.ts`에는 `277: export async function listNumberedByLines(`과 `308: export async function listNumberedByProject(`만 있다. 단수형은 05 커밋 93cb3470 「count installments across the quote line lineage」에서 지워졌고, b05c3bda에서는 257줄에 있었다. 그래서 grep은 2건만 찾고 실행자는 멈춘다.<br>Task 1 ②(:207) 「`listNumberedByLine` · `listNumberedByLines`의 WHERE에 `isNull(expenses.closedAt)`를 더하고」도 없는 함수를 가리킨다. | :149의 grep과 기준을 「`listNumberedByLines(` · `listExpensePage(` 2건 + `domain/expenses/index.ts`의 `listNumberedByLineChain` 1건」으로 바꾼다.<br>:207은 `listNumberedByLines`만 남긴다. 사슬 경로는 `listNumberedByLineChain` → `listNumberedByLines`이므로 이 함수 하나만 고치면 된다.<br>read_first의 05 줄 번호(L1063 · L884-889 · L428)도 86bec989 기준으로 다시 잡는다. 지금 `doorFor`는 441줄, `loadSubmitFacts` 사슬 호출은 1153줄, `lineFactsFor`는 1261줄이다. |
| B2 | [P1] (confidence 9/10) | 06-15-PLAN.md:40, :224 · 06-11-PLAN.md:32, :160 · 06-06-PLAN.md:37 | **06-15의 C4 테스트가 06-11 B-1, 06-06 O-2와 맞지 않아 통과할 수 없다.**<br>06-15:224: 「통합 「C4 확인 기록 없음」: 증빙 필수 off · 확인 기록 없는 P4 문서에 기안자 `attachEvidence` → version 그대로 → 처리 성공」<br>06-11:32: 「결재 통과 문서의 증빙 추가 · 무효는 확인 기록이 있든 없든 문서 version을 올린다」(:160도 「문서 version +1은 결재 통과 문서의 모든 훅 경로(기록 유무 무관)」)<br>06-06:37: 「살아 있는 증빙이 있고(`hasEvidence` 참) 확인 기록이 없으면 지급 완료가 `증빙 확인 전 · 증빙 확인`으로 막힌다(증빙 필수 설정이 꺼져 있어도 — P2)」<br>06-11이 06-15보다 먼저 들어가므로, 이 행은 version 불일치로 동시성 막힘이 된다. version을 맞춰도 O-2 때문에 P2로 막힌다. 「처리 성공」은 두 경로 모두에서 나올 수 없다.<br>06-15:40의 C4 정정 문구 「확인 기록이 있는 결재 통과 문서에서만 … 문서 version을 올린다」도 06-11이 고친 해석과 반대다. | 06-15:224의 기대를 「version +1 → 행 동시성 막힘(옛 스냅숏) · 다시 고르면 P2 `selectable:false`」로 바꾼다.<br>06-15:40의 C4 문단을 06-11:160 해석(줄 지움은 기록이 있을 때만, version +1은 항상)으로 맞춘다.<br>이것은 X/N 재발이 아니고 06-11 B-1 반영 뒤 06-15를 따라 고치지 않은 결과다. |
| B3 | [P1] (confidence 7/10) | 06-03-PLAN.md:207, :222 · 06-10-PLAN.md:39, :235 | **증빙이 없어도 기안자가 넣은 `evidence_amount`로 지급 총액을 계산한다.**<br>06-03:207: 「`decidePayable(input, rates)`: 금액 = `evidenceAmountKrw ?? supplyAmountKrw` — 증빙 금액이 있으면 공급가액을 쓰지 않는다」<br>06-10은 폼에서 `증빙 금액`을 파일 없이 받는다(:39). 확인 가능한 값 제약은 정수 1 이상뿐이다(:235).<br>증빙 필수 off이거나 선지급이고 파일이 0개면 `hasEvidence`가 거짓이다. 이때 O-2 확인 게이트가 서지 않으므로, 아무도 확인하지 않은 기안자 입력값(승인된 공급가보다 클 수 있음)이 지급 총액을 정한다.<br>06-11은 원가 기준에서 「증빙이 있을 때만 증빙 금액」으로 쓰고, 살아 있는 파일이 0이 되면 `evidence_amount`를 비운다. 06-03은 이것과도 어긋난다. | 「결정 필요 D1」 참고. 추천안은 06-03:207 · :222를 「금액 = (`hasEvidence`(tx) 참 && `evidenceAmountKrw` 있음) ? 증빙 금액 : 공급가액」으로 바꾸는 것이다.<br>단위 테스트에 「파일 0 · 증빙 금액만 있음 → 공급가로 계산」을 더한다. |
| B4 | [P1] (confidence 8/10) | 06-03-PLAN.md:208, :222 · pr162 domain/money/index.ts:202-204 | **역산의 반올림 방식이 정해지지 않았고 계산이 부동소수다.**<br>06-03:208: 「`vat_surcharge`만 `grossFromTotal(이체액, rates의 TAX_VAT_RATE, …)` 역산 값이 있고」<br>실물 코드: `export function grossFromTotal(totalKrw: number, vatRate: number, unit: RoundingUnit, method: RoundingMethod): number { const raw = totalKrw / (1 + vatRate); return round(raw, unit, method); }`<br>unit과 method가 「…」로만 적혀 있다. 실행자가 같은 문맥의 `rule.roundingMethod`를 넘기고 그 값이 절사(코드북에서 고를 수 있음)이면, node에서 1100/1.1 = 999.999…가 되어 999로 떨어진다. 1,000,010도 909,100이 아니라 909,099가 된다.<br>지급 기록의 공급가 역산이 1원씩 틀어진다. | :208에 「unit = `TAX_ROUNDING_VAT_UNIT` 설정값, method = `"round"`(05 매출 `grossFromTotal` 호출 전례)」를 명시한다. 아니면 정수 연산(`Math.round(total*100/(100+vatPct))` 꼴)으로 바꾼다.<br>단위 테스트에 1100 → 1000 · 1,000,010 → 909,100 · 33 → 30 경계 사례를 더한다. |
| B5 | [P2] (confidence 7/10) | 06-28-PLAN.md:276 | 회차 계산이 picker와 제출에서 다르다. ⑤⑵는 제출 경로에서 종결 분할 문서를 `[line.id]` 하나로만 읽는다. 그런데 05는 번호 문서를 이미 사슬(`listNumberedByLineChain`, index.ts:1153 · :1261)로 센다. 앞선 견적 줄에 있는 종결 회차를 빠뜨려서, 제출 회차가 picker(사슬)와 달라진다.<br>X-9 메모 「제출 · lineFactsFor 사슬 넓히기는 06-13 ④」도 낡았다. 05가 이미 사슬로 바꿨다. | `listClosedInstallmentsByLines`에 사슬의 줄 id 전부를 넘긴다(`listNumberedByLineChain`과 같은 줄 집합).<br>06-13 ④(X-3)는 05와 중복이므로 06-13 담당에 알린다(이 검토 범위 밖). |
| B6 | [P2] (confidence 6/10) | 06-15 listPaymentTargets ③ | 저장소 함수는 「쪽 인자」를 받아 SQL에서 쪽을 자른다. 그런데 ③은 증빙 상태로 JS에서 거른 뒤 다시 쪽을 자른다. 쪽 크기와 총 건수가 틀어지거나 빈 쪽이 나온다. | 쪽 자르기를 한 곳으로 정한다. 증빙 상태 필터를 SQL로 내리거나, 저장소는 전체(상한 있음)를 주고 domain에서만 자른다. |
| B7 | [P2] (confidence 6/10) | 06-03 · 06-17 표시 · 05 submit 스냅숏 | 05는 제출할 때 `payable_krw` · `tax_basis_date`를 공급가 기준으로 저장하고, 문서 화면에 「세율 바뀜」 줄(`computeExpenseTax`, 공급가)을 보인다. 06 지급은 `evidence_amount`와 지급일로 다시 계산한다. 그래서 같은 화면에 서로 다른 「지급 총액」 두 개가 보일 수 있다. | 지급 뒤에는 지급 기록 값이 정본이라고 06-17(또는 06-03)에 한 줄 명시한다. 05 세율 바뀜 줄은 지급된 문서에서 숨긴다. |
| B8 | [P2] (confidence 6/10) | 06-15 일괄 → 06-03 `completeExpensePayment` | 일괄 처리는 행마다 단건 경로를 부른다. 그래서 행마다 `loadPaymentInputs`(getApprovalView · listCodeItems · settings · loadTaxRates)를 다시 읽는다. 세율 캐시는 목록에만 있다. 200행이면 트랜잭션 밖 전역 조회가 수백 번이 된다(교착은 아니고 느림). | 단건 함수에 deps(세율 · 설정 · 코드북)를 선택 인자로 받아, 일괄 처리에서는 한 번 읽은 값을 넘긴다. 행별 tx와 잠금은 그대로 둔다. |
| B9 | [P2] (confidence 7/10) | 기존 05 `domain/money/tax.ts` applyTaxRule | 플랜 결함이 아니다. 같은 부동소수 문제가 원천징수에도 있다. 8.8%를 10원 단위로 절사하면 712,500 × 0.088 = 62699.99…가 되어 62,690이 나온다(정답은 62,700). 06 지급 총액이 이 함수를 그대로 쓰므로 지급액이 10원 틀어진다. | 06-03 Task에 회귀 테스트를 하나 넣는다(712,500 · 8.8% · 절사 10원 → 62,700). 고치기는 05 `round`에 epsilon 보정이나 정수 연산을 넣는 별도 fix로 한다(돈 경로라 `/cso` 대상). |
| B10 | [P3] (confidence 5/10) | 06-28 · 05 approvals `listMyBlockedDocuments` | 반려 행은 `BLOCKED_REJECTED_LIMIT`(50)으로 먼저 자른 뒤 종결 문서를 거른다. 종결이 많으면 종결되지 않은 반려 문서가 목록에서 빠진다. | 종결 필터를 SQL WHERE(`closedAt IS NULL`)로 넣는다. |
| B11 | [P3] (confidence 5/10) | 06-28 read_first · domain/approvals/conflict-message.ts | 플랜이 인용한 `subjectParticle`은 pr162에서 `export function`으로 찾을 수 없다(0건, `SEOUL_TIME`은 있다). 내부 함수이거나 이름이 다르다. | ⓪에서 실제 export 이름을 확인하고, 없으면 export를 더하는 단계를 적는다. |
| B12 | [P3] (confidence 6/10) | 06-11 ① 중복 검사 재작성 | 05 c57f3aac가 `requestEvidenceUpload` 중복 검사 루프에 `if (!other) continue;`를 더했다. 06-11이 루프를 다시 쓸 때 이 줄을 빠뜨릴 위험이 있다. 다른 owner 종류의 규칙은 `ruleFor(file.ownerKind)`로 읽어야 한다. | ①에 「c57f3aac의 `if (!other) continue` 유지」를 한 줄 적는다. |
| B13 | [P3] (confidence 4/10) | 06-11 기안자 추가 · 완료 프로젝트 검사 | 완료 프로젝트 여부를 잠금 없이 읽는다. 정산 완료와 아주 짧게 겹치는 경합이 있다. | `lockParent`가 이미 프로젝트를 잠그므로, 검사를 그 잠금 뒤로 옮긴다. |
| B14 | [P3] (confidence 5/10) | 06-20 계좌 펼침 | 펼침은 admin vendors 액션을 재사용한다. 이 액션에는 메뉴 게이트가 없고 정보 항목 `vendor.account_number_unmasked`만 검사한다. 경영관리 역할에 이 항목이 없으면 지급 화면에서 펼침이 막힌다. | 시드나 권한 표에 「경영관리 → `vendor.account_number_unmasked`」가 있는지 ⓪에서 확인한다. |

추가 참고(P3에 넣지 않음): 지급 뒤 P5 증빙 금액 보정은 원가 기준을 바꾸지만, 지급 기록의 payable은 옛 값으로 남는다. 표시만의 차이이고, 확정 결정 「증빙 금액 초과 표시만」과 같은 방향이다.

## 2. 결정 필요

### D1 — 파일 없이 들어온 `증빙 금액`을 지급 계산에 쓸지 (B3)
- **추천안:** 살아 있는 증빙 파일이 있을 때만 `evidence_amount`를 쓰고, 파일이 없으면 공급가를 쓴다(06-03 :207 · :222 수정).
  - 이유: 06-11의 원가 기준, 그리고 파일이 0이 되면 금액을 비우는 동작과 같은 규칙이 된다.
  - 이유: 확인 게이트를 거치지 않은 기안자 숫자가 송금액을 정하지 못하게 된다.
- **다른 방식 1:** 06-10에서 파일이 없으면 `증빙 금액` 칸을 비활성화한다. 서버도 거부한다.
  - 문제: 선지급 흐름(증빙이 나중에 옴)에서 금액을 미리 적을 수 없다.
- **다른 방식 2:** 지금처럼 두고, 파일 없이 증빙 금액이 있으면 O-2와 같은 「확인 전」 게이트를 건다.
  - 문제: 확인할 파일이 없는데 확인을 요구하는 이상한 상태가 생긴다.

### D2 — 공급가 역산의 반올림 (B4)
- **추천안:** `TAX_ROUNDING_VAT_UNIT` 단위에 반올림(`"round"`)을 고정한다.
  - 이유: 05 매출 역산 전례와 같다.
  - 이유: 역산은 세액이 아니라 표시용 공급가라서 절사 규칙을 따를 이유가 없다.
- **다른 방식:** 코드북의 `rule.roundingMethod`를 따른다.
  - 조건: 이 방식이면 정수 연산이나 epsilon 보정을 반드시 함께 넣는다. 그렇지 않으면 1100 → 999가 된다.

## 3. 문제 없음 확인 (재검토 불필요)

- 06-03 · 04 · 06 · 15가 ⓪에서 인용한 05 심볼은 pr162 86bec989에 모두 있다. `lockExpenseForUpdate`(deletedAt 거름) · `findExpenseApprovalInstance(…, tx)` · `pickTaxDates` · `computeExpenseTax` · `incomeTypeFor` · `taxDriftText` · `storedTaxResult` · `listNumberedByLines` · `listNumberedByProject` · `countActiveByOwner(…, tx)`를 확인했다.
  - 예외는 B1과 B11이다.
  - `listAliveByOwners`는 tx 인자가 없지만, 06-06이 tx를 더하는 단계를 두고 있다.
- **이중 지급:**
  - `lockExpenseForUpdate`(FOR UPDATE) 뒤에 `findLivePayment`로 다시 확인한다.
  - 부분 유일 인덱스 `expense_payments_live_uniq (expense_id) WHERE cancelled_at IS NULL`가 최종 방어선이다.
  - 문서 version과 `bumpExpenseVersion`으로 중복 클릭과 낡은 화면을 막는다.
- **지급 취소와 재지급:**
  - 취소는 expense만 잠근다. 줄 잠금과의 순서 문제가 없다.
  - 취소 뒤 부분 유일 인덱스 덕분에 재지급이 가능하다.
  - `payment_cancel`은 ALWAYS_ON이다.
- **증빙 무효와 지급:**
  - 두 경로가 expense 행 잠금에서 직렬화된다.
  - 지급 게이트는 잠금 안에서 `hasEvidence(tx)`로 다시 판정한다.
  - 06-11 voidEvidence는 `lockParent`(project) → expense → file 순서로 잠근다.
- **잠금 순환 없음:**
  - 지급: 견적 줄 → expense.
  - 무효: project → expense → file.
  - 제출: project → 줄 → expense.
  - 세 경로가 N-3 순서와 맞는다.
- **트랜잭션 규칙(06-03):** 전역 조회(can · settings · loadTaxRates)는 tx 밖에서 하고, tx 안에서는 tx 저장소와 `recordAction(…, {tx})`만 쓴다. PR #75 같은 풀 교착 위험이 없다.
- 결재 상태 `approved`는 종착 상태라서, 잠금 뒤 결재 상태를 읽어도 안전하다.
- **일괄 지급의 부분 실패:**
  - 행마다 tx를 따로 쓰고, try/catch로 잡은 오류를 행 결과로 돌려준다.
  - 중복 행을 걸러 내고, version 스냅숏(E-5)을 쓰고, H-3 다시 고르기를 둔다.
  - 한 행이 실패해도 다른 행은 롤백되지 않는다.
- 06-17: `newPayableKrw`를 받으면, 이체액을 사용자가 고치지 않았을 때만 기본값을 갱신한다.
- 06-28 종결:
  - 재제출은 `submitExpense` 한 경로뿐이다(project → expense 잠금). 그래서 종결과 재제출이 직렬화된다.
  - `closeExpenseRow`는 조건부 UPDATE다.
  - status_change는 항상 켜져 있다.
- 06-20: 계좌 마스킹 투영은 단일 함수 하나뿐이다. open-redirect 가드가 있다.
- `pickTaxDates`의 실물(`payment_date: doc.paidDate ?? scheduled`, `evidence_date: doc.evidenceDate ?? documentDate`)이 06-03 설명과 맞는다.
  - 05 `computeExpenseTax(viewer, row)`는 새 `evidenceDate` 열을 자동으로 받는다.
- 05 `completeEvidenceUpload`의 멱등 재시도(b3d6ddc9 `findAliveFileOfIntent`)가 06-11 훅 추가와 충돌하지 않는다. version 올리기는 첫 완료 때 한 번만 일어난다.
