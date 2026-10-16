# 06.1 독립 엔지니어링 검토 C — 붙이기·떼기·05/06 통합 (06.1-06·07·08·09·10·12)

검토자: Opus 독립 검토(읽기 전용). 근거: 페이즈 브랜치 `.planning/phases/06.1-evidence-bulk-intake/*`, 05 코드 `origin/claude/phase-05-execute-pxok9w`(a80f0e74), 06 계획 `.planning/phases/06-payment-evidence-cards/06-*-PLAN.md`.
잠긴 결정(CONTEXT D-61xx·「이미 확정」)은 다투지 않는다. 사용자 결정이 필요한 것은 끝 절에 따로 모았다.

## 요약 표

| # | 심각도 | 확신 | 플랜 | 한 줄 |
|---|---|---|---|---|
| F1 | P1 | 8 | 09 | 「짝 없음」에 후보가 있는 줄도 섞여 S8 대리 등록이 기존 카드 사용을 **중복 생성**할 수 있다(비용 이중) |
| F2 | P1 | 7 | 12 | 「증빙 있음」 판정 자리 누락 — 06-10 면제 게이트(증빙 0)·06-04 waive 자리·06-23 홈 수집·05-09/10 무효 신호·06-11 마지막 증빙 판정. 고치면 files_modified 밖 → 예정된 멈춤 |
| F3 | P2 | 9 | 10 | ⓪이 `liveLinkExistsSql`을 `repositories/evidence-presence.ts`에서 찾지만 12는 `evidence-record-links.ts`에 둔다. 「파일 존재 조각」은 12 exports에 없다 → 착수 즉시 멈춤 |
| F4 | P2 | 8 | 06 | 경영관리의 결재 중 붙이기 뒤 결재자 거부 문구가 `지금 담당이 아님`으로 나온다(05 `conflictMessageOf`가 기안자·결재선 사람만 이름을 찾음) |
| F5 | P2 | 7 | 07 | 안 붙은 기록 금액 고침이 잠금 뒤 붙임을 다시 보지 않는다 — 그새 결재 중 문서에 붙으면 결재 중 금액이 바뀐다 |
| F6 | P2 | 7 | 07·09 | 07(W5)이 카드 사용에 붙은 기록 갈래를 계획하지만 카드 사용 붙임·`lockCardUsagesForUpdate`는 09(W6)에서 생긴다 — 구현·테스트 불가 |
| F7 | P2 | 7 | 09 | 구매 완료로 생긴 카드 사용(`used_by` = 요청자)에 요청자가 S5로 카드 줄을 붙이면 확정 실행가가 바뀐다 — 「확정 실행가는 경영관리만」(:69) 위반 |
| F8 | P2 | 6 | 09 | 1·2단계 자동 대사가 「같은 카드」를 요구 — 카드를 잘못 적은 건은 자동으로 못 붙고(F1로 이어짐) D-6111 카드 덮기는 수동 길에서만 일어난다 |
| F9 | P2 | 6 | 12 | 비용 기준 호출자(손익·문서 화면)가 files_modified 밖 → Task 2 예정된 멈춤. Phase 9 손익 SQL용 기록 합 조각이 없다 |
| F10 | P3 | 7 | 06 | S7 결과 줄이 늘 `비용이 예상 {금액}으로` — 파일·06-06 금액이 남은 문서는 떼면 `확정`이다 |
| F11 | P3 | 7 | 12 | acceptance가 `completeExpensePayment` 범위에서 증빙 수 호출을 찾지만 06-06 뒤 그 호출은 `evidenceGateInputs` 안이다 — 빈 검사 |
| F12 | P3 | 5 | 06 | 붙이기는 잠금 뒤 결재 상태를 다시 판정하지 않는다(떼기만 함). `bumpInstanceVersion`은 상태를 보지 않는다 |
| F13 | P3 | 6 | 09 | 2단계의 「증빙 없음」을 잠금 전에 읽는다 — 잠금 뒤 다시 보지 않으면 카드 사용에 기록이 둘 |
| F14 | P3 | 5 | 12 | `domain/expenses` ↔ `domain/evidence-records` 순환 import 위험(no-cycle 린트 없음) |
| F15 | P3 | 6 | 10 | depends_on에 06.1-11 없음 · `registry.ts` import가 엑셀 파서를 지급 목록 경로로 끌어들인다 |
| U1–U5 | 사용자 결정 | — | 06·08·12 | 승인 뒤 떼기 권한·작성자 자기 떼기 / 구매 요청 「미배정」 뜻 / 기록 여러 건 합산 / D-6117 범위 |

웨이브 겹침: `files_modified` 211줄을 웨이브별로 대조했고 **같은 웨이브 안 파일 겹침은 0**이다(W5의 07·08 포함 — 07은 `evidence-table.tsx`·`actions.ts`, 08은 `attach.ts`·`attach-actions.ts`를 맡고 서로 읽기만 한다고 적었다). 순서 문제는 F6·F15만 있다.

---

## P1

### F1 (P1, 확신 8) — S8 대리 등록이 기존 카드 사용을 중복 생성한다
- 플랜: `06.1-09-PLAN.md:52` "각 단계는 후보가 정확히 하나일 때만 자동으로 붙이고(`attach_mode = reconcile`), 둘 이상이면 붙이지 않는다(3단계 사람이 고름)"
- 플랜: `06.1-09-PLAN.md:58` "S8 대리 등록 … S2 짝 없는 카드 줄(카드 등록됨 · 안 붙음 · 취소 아님 · 음수 아님)의 행 행동 `대리 등록`"
- 근거: `06.1-UI-SPEC.md:290-291` "2건 이상 후보는 자동으로 붙이지 않고 `짝 없음`에 센다(사람이 S4에서 고름 — 3단계)". 그 밖에 수정 잠김 카드 사용(`06.1-09` behavior 「수정 잠김 카드 사용 … 그 줄은 짝 없음」), 06-25 파일이 이미 있는 카드 사용(2단계 조건 「아직 증빙 없음」), 카드를 잘못 적은 카드 사용(F8)도 모두 같은 「짝 없음」 묶음에 들어간다.
- 문제: 「짝 없음」에는 **실제 카드 사용이 이미 있는** 줄이 섞인다. S8 조건은 후보가 있는지 보지 않으므로 경영관리가 `대리 등록`을 누르면 같은 결제가 카드 사용 두 건이 되고 견적 줄 비용에 두 번 든다(EXP-07 이중 계산). 06-07의 이중 연결 게이트는 「지출결의 쪽 ↔ 카드 쪽」만 막고 카드 쪽 안의 여러 건은 허용한다(D-609).
- 고칠 플랜 문장(09):
  - must_haves S8 줄에 추가: 「`대리 등록`은 그 줄에 **완화 후보 0**일 때만 렌더한다 — 완화 후보 = 같은 승인번호(카드 무관) 또는 (같은 사용일 · 같은 합계 · 같은 카드사), 잠김·증빙 있음 필터 없이. 후보가 하나라도 있으면 `붙이기`(S4)만 렌더한다」
  - `createCardUsage` 증빙 갈래: 「트랜잭션 안에서 같은 완화 후보 조회를 다시 해 1건 이상이면 `이미 카드 사용 있음 · {번호}`로 거부」
  - 결과 DTO·상태 필터를 둘로 나눈다: `짝 없음(후보 없음)` / `고를 후보 있음` — UI-SPEC 문구가 하나뿐이면 결과 조각은 그대로 두고 S2 행 행동만 위 조건으로 가른다.
  - behavior 한 줄: 「승인번호 같은 카드 사용이 수정 잠김일 때 그 줄에 `대리 등록` DOM 0」.

### F2 (P1, 확신 7) — 「증빙 있음」 판정 자리 누락
- 플랜: `06.1-12-PLAN.md:41` "증빙 유무를 재는 모든 자리가 이 둘 중 하나를 부른다"
- 플랜: `06.1-12-PLAN.md:113` "고칠 자리가 이 플랜 `files_modified` 밖의 파일이면 고치기 전에 멈추고 `06.1-12 파일 한도 — {파일} 필요`를 보고한다"
- 플랜: `06.1-12-PLAN.md:120` P-LIST가 세 리포지토리(06-19 · 06-25 · 06-15/20)만 명시.
- 근거 — 계획·코드에 이미 보이는 판정 자리인데 12의 표·files_modified에 없는 것:
  1. `06-10-PLAN.md:162` `waiveEvidence` "결재 통과 · 증빙 0 · 면제 아님 확인 … 증빙 수 · 확인 표는 `tx`를 받는 리포지토리" — 기록만 붙은 문서를 면제할 수 있게 된다(면제 > 확인됨 순서라 상태가 `면제`로 덮임).
  2. `06-10-PLAN.md:36` 「증빙 면제 3차는 결재 통과 · 증빙 0 · 면제 아님이면 … 선다」 — 06-04 `domain/payments/action-row.ts` 자리 판정(P3·P4·P6).
  3. `06-23-PLAN.md:216-217` `buildPrepaidOverdueItems`(선결제 · 증빙 0) · `buildEvidenceMissingItems`(증빙 0) — 홈 「내 차례」 수집(`domain/next-turn/phase6-items.ts`, `listPaymentTargets`를 부르지 않는다 `06-23:132`). 기록만 붙은 문서가 PM 홈에 `증빙 없음 · 지급 대기`로 남는다.
  4. 05-09 `listEvidenceVoidSignals`(`05-09-PLAN.md` must_haves 「무효 파일이 있고 살아 있는 파일이 0개」) → 05-10 「내 차례」 `[막힘] 증빙 무효 · 증빙 올리기` — 기록이 붙어도 막힘 신호.
  5. `06-11-PLAN.md:51` `lastEvidenceDeleteNeedsConfirm` — 결과 줄 「증빙 금액 지워짐 · 증빙 확인 풀림」은 기록이 남아 있으면 틀린다.
- 문제: Task 3 acceptance(`06.1-12:233`)는 05 파일 수 함수 이름 grep만 하므로 SQL로 `files`를 직접 조인하는 자리(3·4)는 걸리지 않거나, 걸려도 「판정 아님」 표로 빠질 수 있다. 걸리면 files_modified 밖이라 멈춘다 — 어느 쪽이든 D-6104·D-6105가 일부 경로에서만 통한다(12가 막으려던 Pitfall 9 그대로).
- 고칠 플랜 문장(12):
  - P-LIST 표에 행 추가: `P-WAIVE`(06-10 `waiveEvidence` 증빙 0 조건 · 06-04 `action-row.ts` waive 자리) · `P-HOME`(06-23 `phase6-items.ts`의 선결제·H-1 수집 쿼리) · `P-VOID`(05-09 `domain/evidence/signals.ts`) · `P-LAST`(06-11 `lastEvidenceDeleteNeedsConfirm`).
  - files_modified에 `domain/evidence-reviews/index.ts`(이미 있음 — `waiveEvidence` 포함 명시), `domain/payments/action-row.ts`, `domain/next-turn/phase6-items.ts`(또는 06-23 SUMMARY의 실제 리포지토리), `domain/evidence/signals.ts`, `domain/evidence-reviews/upload-checks.ts`를 더한다. 파일 수가 커지면 Task 4 「나머지 판정 자리」로 쪼갠다.
  - acceptance 추가: `grep -rnE "from\(files\)|files\.(ownerId|removedAt|voidedAt)" domain repositories --include=*.ts` 결과 줄마다 `evidence-presence.ts` 안이거나 「판정 아님 · 사유」 표에 있다.
  - behavior 추가: 기록만 붙은 승인 문서 → `waiveEvidence` 거부(「증빙 있음」) · 홈 H-1 줄 없음 · 무효 신호 없음.

---

## P2

### F3 (P2, 확신 9) — 06.1-10 ⓪가 엉뚱한 파일을 본다
- 플랜: `06.1-10-PLAN.md:103` "`grep -n "export function liveLinkExistsSql\|export const liveLinkExistsSql" repositories/evidence-pre…` 비면 멈춤 · 파일 존재 조각 이름을 SUMMARY에"; `:60-61` key_link `to: repositories/evidence-presence.ts … pattern: liveLinkExistsSql`
- 근거: `06.1-12-PLAN.md:63-65` `repositories/evidence-record-links.ts` … `exports: ["liveLinkExistsSql", "sumLiveLinkedSupply"]`; `:60-62` `evidence-presence.ts` exports는 `evidencePresenceSql`·`countEvidenceForOwner`뿐. 12 ①(`:155`)은 파일 조건을 `repositories/files.ts`에서 「조각으로 꺼내」 쓴다고만 하고 이름·export가 없다.
- 고칠 문장: 10 ⓪ 줄을 `repositories/evidence-record-links.ts`로, key_link `to`도 같은 파일로. 12 artifacts `repositories/files.ts`에 `exports: ["aliveFileExistsSql"]`(가칭)을 적고 10 ⓪이 그 이름을 grep한다.

### F4 (P2, 확신 8) — 경영관리 결재 중 붙이기 뒤 결재자에게 틀린 거부 문구
- 플랜: `06.1-06-PLAN.md:53` "결재 중 붙이기는 결재 인스턴스 version을 올려(05-09 `bumpInstanceVersion`, 사유 `evidence`) 옛 화면으로 승인하려던 결재자를 막고"; `:218` "옛 인스턴스 version으로 승인 → 05의 기존 거부"
- 근거(05 코드): `domain/approvals/index.ts:399-402` `actorName = … instance.updatedBy === instance.drafterId ? instance.drafterName : (graph.routes…find((step) => step.actedBy === instance.updatedBy)?.actedByName ?? null)`; `domain/approvals/conflict-message.ts:34-38` `state.actorName ? … : NOT_HOLDER` · `if (state.versionReason === "evidence") return who("증빙을 바꿈")`. 경영관리는 기안자도 결재선 처리자도 아니라 `actorName = null` → 결재자에게 `지금 담당이 아님` 계열 문구가 간다(05-09 계약은 `{사람}이 HH:MM에 증빙을 바꿈 · 새로 고침`).
- 고칠 문장(06 behavior 첫 줄): 「옛 version 승인 → 거부 문구가 `{경영관리 이름}이 HH:MM에 증빙을 바꿈 · 새로 고침`(문자열 단언)」. 05 `conflictMessageOf`가 `updatedBy` 이름을 일반 조회하도록 바꾸는 일은 `domain/approvals/`(결재 경로)라 06.1이 아니라 05 실행 스레드 몫 — 06 ⓪ 표에 `P-CONFLICT`(「`updatedBy`가 기안자·결재선 밖이어도 이름이 나온다」 확인, 아니면 멈춤)를 더한다.

### F5 (P2, 확신 7) — 안 붙은 기록 금액 고침의 잠금 뒤 재확인 누락
- 플랜: `06.1-07-PLAN.md:174` "`withTransaction`: 증빙 행 `lockRecordsForUpdate`([id]) → version 비교 → `updateAmountIfVersionMatches` … 이 태스크는 안 붙은 기록만 고친다 — 붙은 기록은 … 사전 판독에서 거부한다"
- 근거: 붙이기는 증빙 행을 잠그고 붙임만 INSERT한다 — `06.1-06-PLAN.md:183` "증빙 행 `FOR UPDATE` … → `insertLink`"(증빙 행 version 올림 없음). 따라서 「사전 판독: 안 붙음」 → (그새 경영관리가 결재 중 문서에 붙이고 커밋) → 금액 고침이 증빙 잠금 획득 · version 같음 → 결재 중 문서의 증빙 금액이 바뀐다. `06.1-07:43` "결재 중 지출결의에 붙은 증빙은 금액을 고치지 못한다"를 깬다.
- 고칠 문장(07 Task 1 ③ · Task 2): 「안 붙은 갈래도 `lockRecordsForUpdate` 직후 `findLiveLinkForRecordForUpdate`를 불러 붙임이 생겼으면 P-VCONF 꼴 낡음 거부(문서 행을 뒤늦게 잠그지 않는다 — 전역 순서 문서 → 증빙)」 + behavior 「사전 판독 뒤 붙이기 커밋 → 안 붙은 갈래 금액 고침 거부(`deferred` · `waitForLockWaiter`)」. 또는 06 `insertLink`·`detachLink`가 증빙 행 version을 + 1 하도록 06 ②에 한 줄.

### F6 (P2, 확신 7) — 카드 사용 갈래가 07에 있으나 재료는 09에서 생긴다
- 플랜: `06.1-07-PLAN.md:220` "카드 사용에 붙은 기록은 문서 행을 잠근 뒤 기록만 고친다(합계가 그대로라 카드 사용 행 칸은 쓰지 않는다 — PA-AMT-LINK)"
- 근거: 카드 사용 붙임은 09가 처음 만든다(`06.1-09:52` 대사 · Task 2 「`attachEvidence` · `attachEvidenceAsAuthor`의 문서 종류 `corp_card_usage` 갈래」), 잠금 함수 `lockCardUsagesForUpdate`도 09 ②(`06.1-09:177` 부근). 07 files_modified에 `repositories/corp-card-usages.ts` 없음, 09 files_modified에 `domain/evidence-records/amount.ts` 없음 → 이 갈래는 W5에서 테스트할 수 없고 W6에서 아무도 맡지 않는다.
- 고칠 문장: 07의 카드 사용 문장을 「카드 사용에 붙은 기록은 사전 판독에서 거부(09가 갈래를 연다)」로 바꾸고, 09 Task 2 files에 `domain/evidence-records/amount.ts` · `test/integration/evidence-amount.test.ts`를 더해 「카드 사용 행 잠금 → 증빙 행 → 고침」 갈래와 behavior를 옮긴다. 이때 카드 사용의 공급가 · 세액(`splitCardTotal`)과 기록 공급가가 갈라지는지(PA-AMT-LINK) 한 줄로 정한다.

### F7 (P2, 확신 7) — 요청자가 구매 완료 카드 사용의 확정 실행가를 바꿀 수 있다
- 플랜: `06.1-09-PLAN.md:57` "작성자 S5(06.1-08)가 06 S9 카드 사용 수정 폼 첨부 영역 옆에 선다 — 작성자 = 카드 사용 `used_by`(PA-CUAUTH). 카드 줄을 고르면 … 붙이면 파일 값으로 덮인다(O-6104 기본값 — 붙이는 사람과 무관)"
- 근거: `06-12-PLAN.md:162` 구매 완료 카드 사용의 「사용한 사람 = 요청자」; 잠긴 규칙 `CONTEXT` 「이미 확정」 3번 "확정 실행가는 경영관리만 적는다 — :69" · `ERP260907-CONTEXT.md:69` "「제 원가를 제가 확정하는 자리를 열지 않는다」". 요청자가 고른 카드 줄(다른 금액)로 카드 사용 합계 = 확정 실행가가 덮인다.
- 고칠 문장(09 PA-CUAUTH): 「카드 사용 작성자 = `used_by`, 단 `registered_via = purchase`인 카드 사용은 작성자 모드 none(경영관리 S4만)」 + behavior 「구매 완료 카드 사용을 요청자가 열면 `증빙 고르기` DOM 0 · 액션 404 꼴」. 기본값을 반대로 하려면 사용자 결정.

### F8 (P2, 확신 6) — 자동 대사 1단계가 「같은 카드」를 요구한다
- 플랜: `06.1-09-PLAN.md:52` "1단계 = 같은 카드 · 같은 승인번호의 카드 사용, 2단계 = 같은 카드 · 사용일 같음 · 합계 같음"
- 근거: 잠긴 순서 `CONTEXT:31` "승인번호 → 결제일+금액+카드 끝 4자리 → 사람이 고름"(1단계에 카드 조건 없음) · `CONTEXT:32` "카드는 사람이 고르지 않고 카드사 파일이 정한다. 사람이 등록한 값과 다르면 파일이 이긴다". 1단계에 카드를 걸면 직원이 카드를 잘못 고른 건(덮어야 할 바로 그 건)은 자동으로 붙지 않고 「짝 없음」 → F1 중복 위험.
- 고칠 문장: 1단계 = 「같은 카드사(issuer) · 같은 승인번호」(승인번호는 카드사 안에서 유일), 카드 끝 4자리는 2단계에만. 카드가 다르면 `fileWinsPatch`가 카드를 덮고 기록 — behavior 「승인번호 같고 카드 다른 카드 사용 → 1단계 짝 · `corp_card_id` 덮음 · `evidence_amount_change`에 카드 전·후」.

### F9 (P2, 확신 6) — 비용 기준 호출자·Phase 9 합계
- 플랜: `06.1-12-PLAN.md:193` "이 함수를 부르는 06 자리(손익 · 문서 화면)가 입력을 만들 때 `evidenceSummaryForOwner`를 거치게 한다 — 부르는 자리가 이 플랜 `files_modified` 밖이면 멈추고 보고"
- 근거: `06-11-PLAN.md:180` "프로젝트 합계 SQL은 Phase 9 소관이고 이 플랜은 문서 한 건의 판정 함수만 만든다". 호출자(06 문서 화면 `app/…`, 06-13 줄 표 등)는 12 files_modified에 없다 → 예정된 멈춤. Phase 9가 손익을 SQL로 합칠 때 기록 갈래를 모르면 PNL-02가 다시 갈라진다.
- 고칠 문장: ⓪에 `P-COST`(`grep -rn "expenseCostBasis(" app domain repositories`) 행을 두고 그 결과 파일을 files_modified에 미리 넣는다. artifacts에 `repositories/evidence-record-links.ts` `liveLinkedSupplySumSql(ownerKind, ownerIdRef)`(목록·합계용 SQL 조각)를 더하고, SUMMARY에 「Phase 9 손익 SQL은 이 조각으로 기록 갈래를 넣는다」 인계 한 줄 — ROADMAP Phase 9 메모는 계획 레인이 단다.

---

## P3

### F10 (P3, 확신 7) — 떼기 결과 줄이 늘 「예상」
- 플랜: `06.1-06-PLAN.md:57` "결과 줄 `비용이 예상 {금액}으로`(서버가 그 붙임을 뺀 상태로 06.1-12 비용 기준을 셈한 값)"; behavior `:223`은 「붙은 증빙 하나뿐인 지출결의 → expected」만.
- 근거: `06.1-12:44` 비용 기준 순서 「기록 → 06-06 증빙 금액 칸 → 승인액 → 실행가」. 파일과 06-06 금액이 남아 있으면 떼어도 `확정 · {06-06 금액}`, 기록이 둘이면 `확정 · {남은 합}`.
- 고칠 문장: 결과 줄 = `previewDetach` 결과 `kind`로 두 글 — `비용이 예상 {금액}으로` / `비용이 {금액}으로`(UI-SPEC 문구 하나 추가는 design 게이트에서). behavior에 「기록 둘 중 하나 떼기 → 확정 · 남은 합」 「파일 + 06-06 금액 + 기록 하나 → 확정 · 06-06 금액」.

### F11 (P3, 확신 7) — 12 acceptance가 빈 범위를 검사한다
- 플랜: `06.1-12-PLAN.md:173` "`completeExpensePayment` 범위(SUMMARY에 줄 번호)에서 `countEvidenceForOwner(`/`hasEvidence(` 호출마다 `tx` 인자가 있다"; `:159` "`completeExpensePayment`의 `evidenceCount`를 … `countEvidenceForOwner`"
- 근거: `06-06-PLAN.md:207` "`completeExpensePayment`의 ctx 채움을 이 함수 호출 하나로 바꾼다 — … `evidenceCount`는 잠근 문서에서" → 06-06 뒤 증빙 수 읽기는 `evidenceGateInputs(viewer, lockedDoc, pre, tx?)` 안. `completeExpensePayment` 범위에는 호출이 0이라 검사가 늘 참.
- 고칠 문장: 배선 대상을 「`evidenceGateInputs` 안의 증빙 수 읽기」로, acceptance를 「`evidenceGateInputs` 몸통의 `countEvidenceForOwner(` 호출이 `tx`를 넘기고, `completeExpensePayment`가 `evidenceGateInputs(…, tx)`를 부른다」로.

### F12 (P3, 확신 5) — 붙이기의 잠금 뒤 결재 상태 재판정
- 플랜: `06.1-06-PLAN.md:229` "`attachEvidence`의 사전 판독에서 지출결의 결재 상태가 결재 중이면: … 트랜잭션 안에서 문서 잠금 뒤 `bumpInstanceVersion(…, "evidence", tx)`"; 떼기는 `:235` "결재 상태 재판정(… 사전 판독과 잠금 사이 상태가 바뀔 수 있다)".
- 근거: `repositories/approvals.ts:148-167`(05) `bumpInstanceVersion`은 `expectedVersion`이 없으면 상태 조건 없이 version만 올린다. 사전 판독 「임시」 → 잠금 사이 제출이면 문서 version 비교가 막지만(제출이 `expenses.version`을 올리는지 05에서 확인 필요), 사전 판독 「결재 중」 → 잠금 사이 승인 완료면 승인된 인스턴스 version을 올린다(해는 작음).
- 고칠 문장: 「붙이기도 문서 잠금 뒤 결재 상태를 다시 읽어 그 값으로 갈래를 정한다(결재 중이면 bump · 작성자 모드면 거부)」 + acceptance 「`attachEvidence` 콜백 범위에 결재 상태 판독 1건 이상」.

### F13 (P3, 확신 6) — 대사 2단계의 증빙 유무를 잠금 전에 읽는다
- 플랜: `06.1-09-PLAN.md:179` 부근 ③ "후보 조회 → `planReconcile` → 짝의 카드 사용을 `lockCardUsagesForUpdate` → 짝마다 `fileWinsPatch`"
- 근거: 사람 붙이기는 카드 사용 행 → 증빙 행 순서로 다른 기록을 붙일 수 있다(09 Task 2). 후보 조회와 잠금 사이에 커밋되면 2단계 조건 「증빙 없음」이 깨진 채 붙는다.
- 고칠 문장: 「잠금 뒤 `evidencePresenceSql`을 한 번 더 읽어 2단계 짝 중 증빙이 생긴 건은 짝 없음으로 돌린다」.

### F14 (P3, 확신 5) — 순환 import
- 플랜: `06.1-12-PLAN.md:159` 05 제출 게이트(`domain/expenses/index.ts`)가 `hasEvidence`를 부른다.
- 근거: 05 `domain/evidence/index.ts:14` 가 이미 `domain/expenses`를 import하고, `EXPENSE_DOCUMENT_KIND`는 `domain/expenses/index.ts:83`에 있다. `has-evidence.ts`가 이 상수나 `domain/evidence-records/index.ts`(06이 `attach.ts`를 거쳐 `domain/expenses` import)를 import하면 순환이 생긴다. `eslint.config.mjs`에는 boundaries만 있고 no-cycle 규칙이 없다.
- 고칠 문장: 「`has-evidence.ts`는 `repositories/*`와 `domain/money`만 import하고 owner kind는 문자열 리터럴 유니온으로 받는다 — acceptance `grep -c "@/domain/expenses\|@/domain/evidence-records\"" domain/evidence-records/has-evidence.ts` = 0」.

### F15 (P3, 확신 6) — 06.1-10 의존·import 무게
- 플랜: `06.1-10-PLAN.md:36` "06.1-11(W3)이 계산서 · 현금영수증 서식을 이 플랜(W4)보다 먼저 더하므로 실행 때 집합은 … 넷" — frontmatter `depends_on: ["06.1-05", "06.1-12"]`. key_link `domain/payments/targets.ts → domain/evidence-import/registry.ts`.
- 고칠 문장: depends_on에 `"06.1-11"`. 증빙 종류 집합은 `registry.ts`(파서 · SheetJS 포함) 대신 `domain/evidence-import/types.ts`의 상수 배열(서식 id → evidenceType)에서 읽게 하고 registry가 그 배열을 쓴다 — 지급 목록 서버 번들에 엑셀 파서를 싣지 않는다.

---

## 확인된 것(문제 없음)
- 잠금 순서: 05 결재 엔진은 인스턴스 UPDATE를 먼저 하고(`domain/approvals/index.ts:516-521`) 지출결의 종류에는 `onFinalApprovalInTx`가 없다(05 `git grep` 결과 정의만). 06.1 붙이기(지출결의 행 → 증빙 행 → 인스턴스 UPDATE)는 05-09 「지출결의 행 → 결재 인스턴스」와 같은 방향이고, 제출(`domain/expenses/index.ts:541-542` 프로젝트 → 지출결의)과도 교차하지 않는다.
- 부분 유니크 위반 → 사용자 문구 변환은 06(`06.1-06:183` "부분 유니크 위반도 같은 문구로 바꾼다")에 있고 08(`06.1-08` 「잠금 순서는 06.1-06과 같다」)도 이어받는다.
- 결재 중 재계산 없음: 06·07·12 모두 스냅숏 칸을 쓰지 않는다고 명시하고 통합 전·후 비교가 있다.
- 실제 05 이름: `lockExpenseForUpdate`(05) ≠ `lockExpenseRow`(06-03 신규 `repositories/expense-payments.ts`) — 06 ⓪ P-LOCK이 06 이름을 찾으므로 06 머지 뒤라면 맞다. `bumpInstanceVersion(viewer, { instanceId, expectedVersion?, updatedBy, reason: "evidence" }, tx)` — 플랜의 `(…, "evidence", tx)` 표기는 축약이니 실행자가 인스턴스 id를 tx 안에서 찾아야 한다는 한 줄을 06 Task 2에 두면 좋다.
- 05 제출 게이트는 `if (locked.quoteLineId)` 안에서만 증빙 수를 본다(`domain/expenses/index.ts:552-567`) — 팀 비용 지출결의는 원래 증빙 게이트가 없다. 12 behavior의 「증빙 필수 제출」 픽스처는 견적 줄 지출결의로 만들어야 한다(한 줄 명시 권장).

---

## 사용자 결정이 필요한 것 (잠긴 결정 밖 — 제품 동작이 바뀜)

### U1 — 승인된 지출결의에서 떼기: 권한과 작성자 자기 떼기
- 플랜: `06.1-06-PLAN.md:149` "결재 뒤 떼기 권한은 `evidence.intake` 하나(05-09 `expenses.evidence_void`를 쓰지 않음)"; `06.1-08-PLAN.md:58` "작성자의 떼기는 자기가 2차로 붙인 증빙만 … 지급 완료된 지출결의는 작성자에게 숨김(O-6103 기본값 — 경영관리만)" → 승인됐지만 지급 전이면 작성자가 뗄 수 있다.
- 근거: 05-09 사용자 결정(2026-09-26, PR #89) 「승인된 문서에는 더하기만 … 서버도 삭제를 거부한다(결재자가 본 근거가 줄지 않게) … 무효 처리 권한 … `expenses.evidence_void`로만 판정」(`05-09-PLAN.md` must_haves · prohibitions). 기안 중 2차로 붙인 뒤 제출 · 승인된 기록은 결재자가 본 근거다. 05-10 G1 「무효 뒤 기안자 신호」에 해당하는 신호도 06.1 떼기에는 없다.
- 선택지: ⑴ 05와 맞춘다 — 승인 문서의 떼기는 `expenses.evidence_void` 권한자만(경영관리), 작성자 자기 떼기는 편집 가능 상태(임시 · 반려 · 회수)와 「최종 승인 뒤 붙인 붙임」에만 ⑵ 플랜 기본값 유지 — 05-09 결정과 다른 규칙이 둘 생긴다. 권장 ⑴.

### U2 — 구매 요청 「미배정」의 뜻
- 플랜: `06.1-08-PLAN.md:54` "**내** 요청(`requested_by` = 나) · 상태 `requested` · 살아 있는 붙임 0(「미배정」 — RESEARCH A10)인 행"; `:146` "A10 (RESEARCH 추론)".
- 근거: `ERP260907-CONTEXT.md:65` "신청→경영관리가 법인카드로 실제 구매(「구매함」)→증빙 등록 시 확정 실행가 결정". 증빙(카드 줄 · 세금계산서)은 구매 **뒤**에 생기므로 「상태 `requested`일 때만」이면 작성자 2차 붙이기가 거의 일어날 수 없다. `06.1-RESEARCH.md:563` 스스로 "뜻이 「구매 완료 전」이면 조건이 다름"이라 적었다.
- 선택지: ⑴ 미배정 = 그 요청에 살아 있는 붙임 0 · 취소 아님(상태 무관 — 구매 완료 뒤도 가능) ⑵ 플랜 그대로(`requested`만). 권장 ⑴ — 어느 쪽이든 확정 실행가는 바꾸지 않는다(잠긴 규칙 그대로).

### U3 — 기록이 여럿 붙은 문서의 비용 합
- 플랜: `06.1-12-PLAN.md:44` "붙은 증빙 기록이 있으면 `{ 확정, 붙은 기록 공급가 합 }` … 기록과 06-06 칸이 둘 다 있으면 기록 합이 이긴다"(RESEARCH Open Q4 기본값).
- 문제: 같은 결제의 기록 둘(예: 법인카드 결제 지출결의(D-609)에 카드 줄 + 그 거래의 세금계산서)을 붙이면 공급가가 두 번 더해진다(부분 유니크는 같은 기록만 막는다). 반대로 기록 하나 + 등록 안 된 종이 영수증 파일(06-06 금액)이 함께 있으면 파일 몫이 비용에서 빠진다.
- 선택지: ⑴ 합(플랜) + 같은 문서에 카드 줄과 사업자번호 증빙이 함께 붙으면 붙이기 결과 줄 경고 ⑵ 카드 줄이 사업자번호 증빙과 함께 있으면 카드 줄 금액을 합에서 뺀다 ⑶ 기록 합 + 「기록에 없는 파일 몫」은 06-06 칸으로 더한다. 결정 전까지 ⑴ 권장(가장 단순, 규칙 글 한 곳).

### U4 — D-6117 「등록이 곧 확인」이 작성자 2차 붙임에도 적용되나
- 플랜: `06.1-12-PLAN.md:43` "경영관리가 등록한 줄(증빙 기록)만 붙은 문서의 06-06 증빙 상태는 `확인됨`"; 위협표 `:254` T-061-61 완화가 "기록은 `evidence.intake` 권한자만 만든다"뿐.
- 문제: 06-06 확인은 「이 문서에 이 증빙이 맞다」의 검수다. 작성자가 공개 풀에서 비슷한 다른 증빙을 잘못 골라 붙여도 확인 없이 `확인됨` → 지급 가능(P4)이 된다. D-6117 원문은 「일괄 등록된 증빙은 따로 확인 단계 없이 확인된 것으로 본다」라 붙인 사람 범위가 열려 있다.
- 선택지: ⑴ 모든 붙임(플랜) ⑵ `attach_mode ∈ {registrar, reconcile}`만 `확인됨`, `author` 붙임이 있으면 `확인 전`. 해석 확인만 받으면 된다.

### U5 — (F7 반대 선택) 요청자가 구매 완료 카드 사용에 카드 줄을 붙일 수 있게 둘지 — F7 기본안(막음)을 뒤집으려면 사용자 결정.
