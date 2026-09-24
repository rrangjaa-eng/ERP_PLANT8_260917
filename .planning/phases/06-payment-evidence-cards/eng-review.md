# Phase 6 plan-eng-review (gstack) — 06-01 … 06-24

- 대상: `.planning/phases/06-payment-evidence-cards/06-01~24-PLAN.md` + CONTEXT · RESEARCH · PATTERNS · VALIDATION · UI-SPEC
- 브랜치: claude/plan-phase-06-b3dsju @ a7f2f4e · 무인 실행(추천안 자동 선택) · 플랜 파일은 고치지 않았다(보고서만)

## 0. 이전 게이트 해소 확인
| 항목 | 상태 | 근거 |
|---|---|---|
| N-1 UI-SPEC D-56/D-60 표면 | 해결 | `grep -c "D-56\|D-60" 06-UI-SPEC.md` = 39 (이전 0) |
| N-2 지급 ∥ 제출 경합 | 해결 | 06-13:35·213·226 — `completeExpensePayment`가 `lockExpenseRow` 앞에서 `lockQuoteLines`, 병렬 케이스 |
| N-3 전역 잠금 순서 | 해결 | 06-03:40 · 06-07:132 · 06-12:35·176 · 06-13:36·280 에 프로젝트 → 견적 줄(id) → 문서 행 명시 |
| N-6 PM 편집 부수 작업 | 해결 | 06-06:152·244 |
| B-1~B-5, R-1~R-9 | 해결(cross-review-r2 판정 유지) | 재확인 샘플: 06-07:164, 06-24 ⑴~⑺ |

## Step 0. Scope Challenge
- 24 플랜 · 12 웨이브는 크다. 다만 CEO 게이트(ceo-review.md)에서 범위가 이미 확정됐고, 모든 플랜이 ⓪에서 선행 의존(A-6xx)을 멈춤 조건으로 둔다. 범위 축소는 제안하지 않는다(자동 결정 D1).
- 같은 웨이브 안 `files_modified` 겹침: 스크립트로 전수 대조 — **0건**. `_journal.json`을 여는 플랜(06-03/05/06/08/10/12/16/18)도 웨이브가 모두 다르다.
- 선행: main에는 `domain/expenses`, `domain/reserves`, `repositories/quote-line-links` 등이 없다(`ls domain/`). Phase 4/04.1/5 병합 전에는 06-03 ⓪부터 멈춘다 — 예상된 상태(R-7).

## Section 1. Architecture

### E-1 (막음) 정산 점검이 트랜잭션 안에서 전역 `db`를 쓴다 — 커넥션 풀 교착
- **근거(코드):** `domain/settings/registry.ts:68-85` `getSettingValue`는 tx 인자가 없고 `repositories/settings.ts:12·43`의 전역 `db`로 읽는다. `can()`(`domain/permissions/can.ts:16`)도 `repositories/permissions.ts findPermission`(전역 `db`)을 쓴다(deadlock-fix/global-db-in-tx-audit.md 표 A·B와 같은 모양, PR #75가 고친 바로 그 패턴).
- **근거(플랜):** 06-19:172 `computePreSettleCheck(viewer, projectId, tx?)`가 "먼저 프로젝트 읽기 권한 확인, 강행 허용 세 키를 `getSettingValue`로" 읽는다. 06-19:174 ⑤는 이 함수를 Phase 5 기안 **같은 트랜잭션에서** 부르고, 06-22:141은 04.1 승인 함수 **트랜잭션 안에서** 부른다.
- **왜 깨지나:** 트랜잭션이 커넥션 하나를 잡은 채 두 번째 커넥션을 기다린다. DB_POOL_MAX=5에서 동시 기안/승인 5건이면 전부 멈춘다(projects-create-concurrency 재현과 동일).
- **플랜 수정:**
  - 06-19 Task 3 ③ 끝에 추가: "권한 판정(`can`)과 강행 허용 세 키(`getSettingValue`)는 **트랜잭션을 열기 전에** 호출자가 읽어 `computePreSettleCheck(viewer, projectId, { allowances }, tx)`로 넘긴다. tx 안에서는 `tx`를 받는 리포지토리 조회만 한다(global-db-in-tx-audit 규약)."
  - 06-19 ⑤ · 06-22:141: "같은 트랜잭션에서 `computePreSettleCheck`" 앞에 "트랜잭션 전에 `loadPreSettleInputs(viewer)`(권한·설정)를 읽고"를 넣는다.
  - 06-19 · 06-22 verify에 "기안/승인 6건 `Promise.all` 병렬 — 타임아웃 없이 끝남" 통합 케이스 한 줄.

### E-2 (고침) 지급 완료의 재계산이 트랜잭션 안에서 세율을 읽는다
- **근거:** 06-03:181 ⑵ "한 트랜잭션: `lockExpenseRow` → … → 지급 총액 재계산"이고 역산 세율은 "증빙일의 `TAX_VAT_RATE` 이력 값"(R-9). 이력 값은 `getSettingValue` → `findEffectiveValue`(전역 `db`, repositories/settings.ts:43). 06-03:227이 `decidePayable(input, rates)` 순수 함수를 말하지만 rates를 **언제** 읽는지 정하지 않았다. 06-15 일괄 지급(AS1 건별 트랜잭션, 06-15:130)이 이 경로를 반복한다.
- **플랜 수정:** 06-03 Task 1 ③ ⑴ 뒤에 "⑴' 원천징수·부가세 세율을 트랜잭션 전에 읽는다(증빙일은 잠금 없는 사전 조회로; 잠금 뒤 증빙일이 바뀌었으면 `PayableChangedError`)"를 넣고, ⑵의 재계산은 `decidePayable(input, rates)`만 쓴다고 적는다. 06-10(선결제) · 06-12(`can(viewer,"cards.purchases","write")`, 06-12:158)에도 "판정·설정 읽기는 트랜잭션 앞" 한 줄.

### E-3 (고침) 전역 규약을 한 곳에 못박기
- 잠금 순서는 06-03:40에 있으나 "tx 안에서 전역 db 호출 금지"는 어느 플랜 must_haves에도 없다(grep "트랜잭션 앞" → 06-16:224 참조 1건뿐).
- **플랜 수정:** 06-03 must_haves.truths에 "**tx 규약:** 트랜잭션 안에서는 `tx`를 받는 리포지토리만 부른다. `can`·`visible`·`getSettingValue`·`recordAction`은 트랜잭션 앞(또는 `deferRecord`)." 다른 플랜은 이 줄을 참조.

## Section 2. Code Quality
- 금액: 06-05:35-36은 결제 합계만 받고 서버가 `grossFromTotal()`로 공급가/부가세를 역산, 잔차는 금액 모듈로(06-05:64·75). 정수 원 · 브라우저 값 불신(06-05:53) — 문제 없음.
- 번호 부여: 06-02:242는 서식을 트랜잭션 밖에서 읽는 PR#75 방식을 따른다 — 문제 없음.
- (참고) E-4: 06-16의 첨부 주인 CHECK 갈래 ⒜/⒝(06-16:160)는 실행 중 분기 선택이다. Phase 5 실제 모양을 ⓪에서 적게 해 두었으므로 수용.

## Section 3. Tests
```
지급 단건(06-03/04) ─ unit payments · int expense-payments · e2e payment-single
증빙 확인/면제/선결제/무효화(06-06/10/11) ─ int evidence-* (병렬 06-11:166)
카드 사용·대리·구매(06-05/07/09/12/14) ─ int corp-card-usages*, purchase-requests · e2e card-*, purchase-*
이중 연결 경합(06-07/08/13) ─ int dual-link-concurrency (Promise.all)
일괄 지급(06-15/17) ─ int payment-batch · e2e payment-batch
정산 점검(06-19/22) ─ int/e2e  ← [빈칸] 풀 교착 병렬 케이스 없음 (E-1)
지급 세율 재계산 ─ [빈칸] 병렬 N≥6 지급 케이스 없음 (E-2)
```
- VALIDATION(96줄)의 leak-scan 누적 확장 패턴(06-VALIDATION:76)과 플랜 files_modified가 맞는다.
- (참고) E-5: 일괄 지급 멱등성 — 06-15는 version + `expectedPayableKrw`로 재요청을 막는다(R-2). 같은 스냅숏을 두 번 보내면 두 번째는 version 불일치로 거부된다. 테스트 이름에 "같은 요청 재전송 → 0건 추가 지급"을 명시할 것을 권한다.

## Section 4. Performance
- `findLineLinks` 단일 조회 + 쿼리 수 테스트(06-13:280) — 좋음.
- (참고) E-6: N-5(VALIDATE 분리가 drizzle 단일 tx에서 무력) 는 표 크기상 수용 — 06-10:265 문구 정정만 권장(기존 참고 유지).

## Outside Voice
Codex 한도 — 한도 풀리면 Codex 재확인 필요

## 자동 결정 목록
- D1 범위 축소 없음(CEO 게이트 확정 범위 유지)
- D2 E-1을 막음으로 분류(코드·플랜 줄 근거 있음, 기존 사고 재현 패턴)
- D3 E-2는 고침(단건 지급 동시성은 낮으나 일괄 지급 반복 경로)
- D4 TODOS.md·QA 테스트 플랜 파일은 쓰지 않음(지시: 보고서만)
- D5 텔레메트리/리뷰 로그 생략

## GSTACK REVIEW REPORT
| 항목 | 결과 |
|---|---|
| Scope Challenge | 통과(범위 유지, 웨이브 파일 겹침 0) |
| Architecture | 막음 1 (E-1), 고침 2 (E-2, E-3) |
| Code Quality | 이슈 없음, 참고 1 (E-4) |
| Tests | 빈칸 2 (E-1·E-2 병렬 케이스), 참고 1 (E-5) |
| Performance | 참고 1 (E-6) |
| Outside Voice | Codex 한도 — 한도 풀리면 Codex 재확인 필요 |
| 판정 | **E-1 반영 전 Build 진입 불가** (06-19 · 06-22 수정 후 재확인) |
