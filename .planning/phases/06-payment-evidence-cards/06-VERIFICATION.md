---
phase: 06-payment-evidence-cards
verified: 2026-10-14T04:30:10Z
status: human_needed
score: 5/5 must-haves verified
covered_files: [".planning/REQUIREMENTS.md", ".planning/ROADMAP.md", ".planning/phases/06-payment-evidence-cards/06-01-PLAN.md", ".planning/phases/06-payment-evidence-cards/06-01-SUMMARY.md", ".planning/phases/06-payment-evidence-cards/06-02-PLAN.md", ".planning/phases/06-payment-evidence-cards/06-02-SUMMARY.md", ".planning/phases/06-payment-evidence-cards/06-03-PLAN.md", ".planning/phases/06-payment-evidence-cards/06-03-SUMMARY.md", ".planning/phases/06-payment-evidence-cards/06-04-PLAN.md", ".planning/phases/06-payment-evidence-cards/06-04-SUMMARY.md", ".planning/phases/06-payment-evidence-cards/06-05-PLAN.md", ".planning/phases/06-payment-evidence-cards/06-05-SUMMARY.md", ".planning/phases/06-payment-evidence-cards/06-06-PLAN.md", ".planning/phases/06-payment-evidence-cards/06-06-SUMMARY.md", ".planning/phases/06-payment-evidence-cards/06-07-PLAN.md", ".planning/phases/06-payment-evidence-cards/06-07-SUMMARY.md", ".planning/phases/06-payment-evidence-cards/06-08-PLAN.md", ".planning/phases/06-payment-evidence-cards/06-08-SUMMARY.md", ".planning/phases/06-payment-evidence-cards/06-09-PLAN.md", ".planning/phases/06-payment-evidence-cards/06-09-SUMMARY.md", ".planning/phases/06-payment-evidence-cards/06-10-PLAN.md", ".planning/phases/06-payment-evidence-cards/06-10-SUMMARY.md", ".planning/phases/06-payment-evidence-cards/06-11-PLAN.md", ".planning/phases/06-payment-evidence-cards/06-11-SUMMARY.md", ".planning/phases/06-payment-evidence-cards/06-12-PLAN.md", ".planning/phases/06-payment-evidence-cards/06-12-SUMMARY.md", ".planning/phases/06-payment-evidence-cards/06-13-PLAN.md", ".planning/phases/06-payment-evidence-cards/06-13-SUMMARY.md", ".planning/phases/06-payment-evidence-cards/06-14-PLAN.md", ".planning/phases/06-payment-evidence-cards/06-14-SUMMARY.md", ".planning/phases/06-payment-evidence-cards/06-15-PLAN.md", ".planning/phases/06-payment-evidence-cards/06-15-SUMMARY.md", ".planning/phases/06-payment-evidence-cards/06-16-PLAN.md", ".planning/phases/06-payment-evidence-cards/06-16-SUMMARY.md", ".planning/phases/06-payment-evidence-cards/06-17-PLAN.md", ".planning/phases/06-payment-evidence-cards/06-17-SUMMARY.md", ".planning/phases/06-payment-evidence-cards/06-18-PLAN.md", ".planning/phases/06-payment-evidence-cards/06-18-SUMMARY.md", ".planning/phases/06-payment-evidence-cards/06-19-PLAN.md", ".planning/phases/06-payment-evidence-cards/06-19-SUMMARY.md", ".planning/phases/06-payment-evidence-cards/06-20-PLAN.md", ".planning/phases/06-payment-evidence-cards/06-20-SUMMARY.md", ".planning/phases/06-payment-evidence-cards/06-21-PLAN.md", ".planning/phases/06-payment-evidence-cards/06-21-SUMMARY.md", ".planning/phases/06-payment-evidence-cards/06-22-PLAN.md", ".planning/phases/06-payment-evidence-cards/06-22-SUMMARY.md", ".planning/phases/06-payment-evidence-cards/06-23-PLAN.md", ".planning/phases/06-payment-evidence-cards/06-23-SUMMARY.md", ".planning/phases/06-payment-evidence-cards/06-24-PLAN.md", ".planning/phases/06-payment-evidence-cards/06-24-SUMMARY.md", ".planning/phases/06-payment-evidence-cards/06-25-PLAN.md", ".planning/phases/06-payment-evidence-cards/06-25-SUMMARY.md", ".planning/phases/06-payment-evidence-cards/06-27-PLAN.md", ".planning/phases/06-payment-evidence-cards/06-27-SUMMARY.md", ".planning/phases/06-payment-evidence-cards/06-28-PLAN.md", ".planning/phases/06-payment-evidence-cards/06-28-SUMMARY.md", ".planning/phases/06-payment-evidence-cards/06-29-PLAN.md", ".planning/phases/06-payment-evidence-cards/06-29-SUMMARY.md", ".planning/phases/06-payment-evidence-cards/06-30-PLAN.md", ".planning/phases/06-payment-evidence-cards/06-30-SUMMARY.md", "docs/EVIDENCE-STORAGE.md", "domain/action-log/record.ts", "domain/corp-card-usages/amounts.ts", "domain/corp-card-usages/index.ts", "domain/evidence-reviews/cost-basis.ts", "domain/evidence/index.ts", "domain/evidence/upload-checks.ts", "domain/expenses/index.ts", "domain/payments/batch.ts", "domain/payments/index.ts", "domain/pre-settle-check/index.ts", "domain/purchase-requests/index.ts", "domain/rules/register.ts", "domain/settlements/index.ts", "test/e2e/management-flow.spec.ts", "test/e2e/pm-settlement-flow.spec.ts", "test/integration/leak-scan.test.ts"]
covered_digest: "v1:sha256:f28adf2c7569f3e5a4635c113ac9893154183ec5a21812cfd2b3907fb3628dbd"
behavior_unverified: 0
overrides_applied: 0
deferred:
  - truth: "EXP-13 — 선결제 14일(설정) 안 증빙 없을 때 독촉 알림"
    addressed_in: "Phase 7"
    evidence: ".planning/ROADMAP.md:1033 「Phase 6에서 미뤄 둔 알림 둘(선결제 14일 증빙 독촉, …)도 여기서 규칙으로 붙으며」 · ROADMAP.md:779(SC2 본문이 Phase 7로 명시)"
  - truth: "EXP-16 — 경영관리 대리 등록 시 담당 PM에게 알림"
    addressed_in: "Phase 7"
    evidence: ".planning/ROADMAP.md:1033 「경영관리 대리 등록 시 담당 PM 알림」 · ROADMAP.md:780(SC3 본문이 Phase 7 알림함으로 명시)"
  - truth: "EVID-03 — 증빙 금액이 '그 줄의 확정 비용'으로 화면 · 합계에 쓰임(비용 기준 함수 소비자)"
    addressed_in: "Phase 9 (모델은 06.5 D-6520이 바꿈)"
    evidence: ".planning/ROADMAP.md:1073 「비용 판정은 effectiveCost SQL 식 하나 … 목록·Excel·팀 합계·상세가 전부 이 식을 공유」 · ROADMAP.md:40 「effectiveCost 식 하나(증빙>승인액>실행가)」 · .planning/phases/06.5-payment-followup/06.5-CONTEXT.md:65 D-6520(증빙 금액 칸 삭제, 공급가액 하나로)"
  - truth: "OPS-09 — 지급 · 구매 처리 기록을 설정으로 끌 수 없는 핵심 로그로"
    addressed_in: "Phase 06.5"
    evidence: ".planning/phases/06.5-payment-followup/06.5-CONTEXT.md:48 D-6511 「payment_process·purchase_process 기록을 끌 수 없게 한다 … ALWAYS_ON_ACTION_TYPES에 두 줄 추가」"
human_verification:
  - test: "스테이징(2e05460 배포 완료)에서 실제 GCS 버킷으로 카드 전표(corp_card_usage) · 차수 고객 승인(quote_revision) · 리저브 줄(reserve_entry) 증빙을 이미지 1장 · PDF 1장씩 올리고, 10MB 초과 파일 1개를 올려 본다"
    expected: "서명 PUT URL에 x-goog-content-length-range가 걸리고, 완료 통보 뒤 files 행이 생기며 보기 URL이 열린다. 10MB 초과는 의도 단계에서 「…MB · 10MB 초과 · 파일을 줄여 다시」로 거부된다"
    why_human: "CI E2E는 로컬 저장 드라이버(lib/gcp/storage.ts localStorageFromEnv)로 돈다 — 06-24-SUMMARY Threat Flags. Phase 6이 더한 세 주인 종류가 실제 GCS 서명 · 메타데이터 재확인 경로를 지나는지는 CI가 보지 않는다"
  - test: "Phase 6 PLAN must_haves.prohibitions 130건(test 118 · judgment 12) 중 표본 밖 항목의 집행 근거를 사람이 훑는다"
    expected: "각 test-tier 금지에 대응 테스트 이름이 있고 그 테스트가 CI 38503613509에서 녹색이다. judgment-tier 12건(화면이 상태를 스스로 추론하지 않음 · 새 시각 패턴 없음 · 위험 경로 사용자 머지 등)은 /review · /design-review 기록과 맞는다"
    why_human: "검증기는 표본(PR-A #169 · PR-E #214 사용자 머지 확인, 브라우저 지급 총액 미저장 = judgeLockedPayment 서버 재계산, 06-07 미해결 금지 = 06-13 지출결의 쪽 게이트 + dual-link-concurrency.test.ts)만 직접 확인했다. 나머지는 금지 ↔ 테스트 대응표가 계획에 없어 기계적으로 대조할 수 없다 — unverified-prohibition, human review recommended"
---

# Phase 6: 지급·증빙·법인카드·구매 요청 (경영관리) Verification Report

**Phase Goal:** 경영관리가 결재 통과 건의 증빙을 확인해 지급 완료하며(실제 이체액 입력 → 공급가 역산), 법인카드·구매 요청·팀 비용까지 모든 나가는 돈이 견적 줄에 한 번만 연결되고, 완료(정산) 전 미결 점검이 선다. 지급일 자동 계산·마감·알림은 Phase 7이다
**Verified:** 2026-10-14T04:30:10Z
**Status:** human_needed
**Re-verification:** No — initial verification (기준 트리 origin/main 2e05460, PR #214 머지 · 사용자 머지)

MVP mode: ROADMAP.md:773 `Mode: mvp`이나 목표가 User Story 형식(「As a …, I want to …, so that ….」)이 아니다. User Flow Coverage 표 대신 표준 goal-backward로 검증했다 — 목표 문장을 MVP 형식으로 바꾸려면 `/gsd mvp-phase 6`.

## Goal Achievement

### Observable Truths (ROADMAP 성공 기준 1~5)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 결재 통과 건만 지급 완료 · 증빙 필수(설정) · 둘 다 `domain/rules.gate` · 지급 완료 줄 잠김 · 이체액 + 차이 사유 · 부가세 `grossFromTotal` 역산(증빙일 기준 `TAX_VAT_RATE`) · 원천징수는 차이만 · 지급 예정일 | ✓ VERIFIED | `domain/payments/index.ts:371-375` 게이트 3개(`payment.approval-required` · `payment.evidence-required` · `payment.method-evidence-mismatch`, 등록 `domain/rules/register.ts:351-367`) · `:166` 부가세 규칙만 `grossFromTotal`, 그 밖 null · `:404-406` 차이 ≠ 0이면 사유 필수 · `:574` `saveScheduledPayDate` · `domain/money/tax.ts:86` 증빙일 세율 · 줄 잠금 `domain/expenses/index.ts:1065-1072`(`expense.line-paid-lock`). 행동 테스트: `test/integration/expense-payments.test.ts:514` · `dual-link-concurrency.test.ts:179` · `quote-line-links.test.ts:96-136` — CI 38503613509 integration 1·2 success |
| 2 | 증빙 업로드(브라우저 2000px JPEG · SHA-256 → 서버 크기(설정)·형식·중복 → 크기 조건 서명 PUT → 완료 통보 → GCS 메타데이터 재확인 → files 행) · PDF 원본 · 고아 청소 절차 · 증빙 금액 → 확정 비용 · 세금은 지급 총액에만 · 떼면 예상 · 선결제 표시·사유 필수 | ✓ VERIFIED (일부 deferred · 경고 2) | `ui/attachments/prepare-file.ts:1-5,53,61` · `domain/evidence/index.ts:331`(`EVIDENCE_MAX_SIZE_MB`) · `upload-checks.ts:49-62` · `lib/gcp/storage.ts:317`(`x-goog-content-length-range`) · `domain/evidence/index.ts:416-423` 크기·형식·해시 재확인 · 청소 절차 `docs/EVIDENCE-STORAGE.md:82-111`(OPERATIONS.md:93이 이 런북으로 링크; 위치 변경은 06-11-PLAN.md:42에 기록) · 지급 총액 `pickPaymentAmount` → `decidePayable`(`applyTaxRule`) `domain/payments/index.ts:126-169` · 무효 시 증빙 금액 지움 `domain/evidence/index.ts:176` · 선결제 사유 `domain/expenses/gate.ts:44,110`. 「그 줄의 확정 비용」 소비자는 Phase 9(아래 Deferred) |
| 3 | 카드 사용: 연결(견적 줄/견적 외 비용/팀 비용) 필수 · 팀 자동 · 결제 합계 → 서버 역산 · 통화/환율 · 공용 카드는 대리 등록 권한자만 · 거래처 기본 증빙 종류 · 온라인구매 문 자동 · 구매 완료 → 카드 사용(한 tx) · 이중 연결 차단 · 대리 등록 '경영관리 등록' 표시 | ✓ VERIFIED | `domain/corp-card-usages/index.ts:348`(연결 없음 거부) · `:163-172,492`(공용 카드는 `cards.proxy`만) · `amounts.ts:19-31`(D-607 역산) · `:43-49`(`cardEvidenceDefault`) · `register.ts:386-428`(`card.dual-link-block` · `purchase.line-door`) — 양 입구 `corp-card-usages/index.ts:550` · `expenses/index.ts:1080-1084` · `purchase-requests/index.ts:303-305` · 구매 완료 `purchase-requests/index.ts:410-437`(카드 사용 생성 + 요청 완료 + `purchase_process` 한 tx) · 번호 카운터 `:267` · 표시 `app/(app)/projects/[id]/card-usage-section.tsx:34`(page.tsx:329에 배선). 행동 테스트: `dual-link-concurrency.test.ts:117` · `corp-card-usages.test.ts:920` · `purchase-requests.test.ts:367,1541,1566` (CI 녹색) |
| 4 | 완료(정산) 전 미결 지출결의 · 미매칭 견적 줄 · 매출 미입력을 `rules.gate`로 점검 · 강행 허용은 설정 · 정산 결재 기안 전에 돈다 | ✓ VERIFIED | `domain/pre-settle-check/index.ts:125-133`(설정 셋 `PROJECT_FORCE_COMPLETE_ALLOW_*`) · `:158-228` 세 그룹 계산 · 기안 tx 안 `domain/settlements/index.ts:374-377` · 대표 승인 재점검 `:513-517` · 규칙 `register.ts:430` · 화면 `app/(app)/projects/[id]/page.tsx:260,286`. E2E `test/e2e/pm-settlement-flow.spec.ts`(완료 전 점검 막힘 → 발행 → 승인) |
| 5 | 경영관리 흐름 E2E(이미지 · PDF) CI · 지급 게이트 · 이중 연결 · 의도만 있는 업로드 통합 테스트 · 새 DTO 누수 스캔 등록 | ✓ VERIFIED | `test/e2e/management-flow.spec.ts:161,166`(이미지 · PDF) · `test/integration/evidence-release.test.ts:302`(의도만 있는 업로드) · `expense-payments.test.ts:514` · `dual-link-concurrency.test.ts:117` · `test/integration/leak-scan.test.ts:701-706`(Phase 6 DTO 15개 대조). CI 실행 38503613509(헤드 8db3955 · quality · integration 1·2 · e2e 1·2 · tested-tree 모두 success)를 gh로 직접 확인, main 2e05460 deploy 38511010555 tested · staging success |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | EXP-13 선결제 14일 독촉 알림 | Phase 7 | ROADMAP.md:1033 · :779 |
| 2 | EXP-16 대리 등록 시 담당 PM 알림 | Phase 7 | ROADMAP.md:1033 · :780 |
| 3 | EVID-03 「그 줄의 확정 비용」 화면 · 합계 소비(`expenseCostBasis`는 단위 테스트만 부름) | Phase 9 (+06.5 D-6520 모델 변경) | ROADMAP.md:1073 · :40 · 06.5-CONTEXT.md:65 |
| 4 | OPS-09 지급 · 구매 기록 「끌 수 없음」 | Phase 06.5 | 06.5-CONTEXT.md:48 (D-6511) |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `domain/rules/register.ts` | Phase 6 게이트 규칙 8종 | ✓ VERIFIED | `expense.line-paid-lock` · `payment.*` 3 · `card.dual-link-block` · `card.execution-cap` · `purchase.line-door` · `project.pre-settle-check` 모두 등록되고 호출부 있음 |
| `domain/payments/index.ts` · `batch.ts` | 단건 · 일괄 지급 | ✓ VERIFIED | 일괄은 행마다 `completeExpensePayment`(batch.ts:58) — 게이트 우회 없음 |
| `domain/corp-card-usages/*` · `domain/purchase-requests/index.ts` | 카드 사용 · 구매 요청 | ✓ VERIFIED | 위 SC3 |
| `domain/pre-settle-check/index.ts` · `domain/settlements/index.ts` | 완료 전 점검 · 기안 게이트 | ✓ VERIFIED | 위 SC4 |
| `domain/evidence-reviews/cost-basis.ts` | 비용 기준 한 함수 | ⚠️ ORPHANED (deferred) | 운영 코드 소비자 0(`git grep expenseCostBasis` → 정의 + 단위 테스트만). 소비는 Phase 9 effectiveCost |
| `docs/EVIDENCE-STORAGE.md` §6 | F8 고아 청소 절차 | ⚠️ PARTIAL | 대상 2(완료 통보 거부 객체)는 주인 종류 무관. 대상 1 SQL이 `owner_kind = 'expense'`로 한정(:100) — Phase 6이 더한 `quote_revision` · `reserve_entry` · `corp_card_usage`(db/schema/files.ts:35)의 지운 증빙 객체가 빠진다 |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| 지급 완료(단건 · 일괄) | `rules.gate` 결재 · 증빙 · 짝 | `judgeLockedPayment` 잠금 뒤 | WIRED |
| 지출결의 제출 | 지급 완료 잠금 · 이중 연결 · 온라인구매 문 | `submitExpense` tx 안 게이트 | WIRED |
| 카드 사용 · 구매 요청 신청 | 이중 연결 · 실행가 상한 · 문 | 각 입구 tx 안 게이트 | WIRED |
| 구매 완료 | 카드 사용 생성 | `createCardUsage(…, innerTx)` | WIRED |
| 정산 기안 · 대표 승인 | 완료 전 점검 | `computePreSettleCheck` + `project.pre-settle-check` | WIRED |
| 증빙 완료 통보 | GCS 메타데이터 | `storage.getMetadata` 크기 · 형식 · sha256 비교 | WIRED |
| 비용 기준 함수 | 손익 · 줄 비용 화면 | — | NOT_WIRED (Phase 9 deferred) |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real Data | Status |
|----------|------|--------|-----------|--------|
| 지급 총액 | payableKrw | 잠근 지출결의 행 + 증빙 유무(tx) + 날짜별 세율 설정 | 예 | ✓ FLOWING |
| 완료 전 점검 섹션 | 세 그룹 건수 · 행 | `listPreSettleExpenseRows` · `findLineLinks` · `listIssuedAmountsKrw` | 예 | ✓ FLOWING |
| 프로젝트 카드 사용 섹션 | registeredVia 표시 | `CardUsageSection` → 카드 사용 리포지토리 | 예 | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase 6 순수 판정(게이트 · 지급 · 카드 역산 · 점검 요약 · 업로드 검사 · 비용 기준) | `pnpm vitest run --project unit` 12파일(card-usage-amounts · card-usage-rights · evidence/upload-checks · evidence-cost-basis · evidence-prepaid · evidence-reviews · payments · pre-settle-check · rules-card-dual-link · rules-gate · rules-line-paid-lock · expense-write-gate) | 12 files · 295 passed (/tmp/claude-0/phase06-verify-unit.txt) | ✓ PASS |
| 통합 · E2E 전체 | 로컬 실행 안 함(DB 초기화 필요 — 지시) · CI 38503613509 결과를 gh API로 확인 | 전 job success | ✓ PASS (CI 근거) |
| 스테이징 배포 | `gh run view 38511010555` | tested · staging success | ✓ PASS |

### Probe Execution

Step 7c: 해당 없음 — `scripts/*/tests/probe-*.sh` 없음, PLAN · SUMMARY에 probe 선언 없음.

### Requirements Coverage

| Requirement | Description(요약) | Status | Evidence |
|-------------|------------------|--------|----------|
| EXP-06 | 결재 미통과 지급 불가 · 지급 완료 줄 잠금 | ✓ SATISFIED | SC1 |
| EXP-07 | 카드 사용 등록 · 연결 필수 · 역산 · 공용 카드 | ✓ SATISFIED | SC3 |
| EXP-09 | 지급 예정일 · 이체액 · 역산 · 차이 | ✓ SATISFIED | SC1 |
| EXP-10 | 온라인 구매 요청 · 문 자동 · 구매 완료 → 카드 사용 | ✓ SATISFIED | SC3 |
| EXP-13 | 선결제 표시 · 사유 필수 · 막지 않음 / 독촉 | ✓ SATISFIED (독촉 → Phase 7 deferred) | `expenses/gate.ts:110` · ROADMAP.md:1033 |
| EXP-16 | 경영관리 대리 등록 · '경영관리 등록' 표시 / PM 알림 | ✓ SATISFIED (알림 → Phase 7 deferred) | `card-usage-section.tsx:34` · ROADMAP.md:1033 |
| EVID-02 | 증빙 필수 on/off 게이트 | ✓ SATISFIED | `register.ts:358` · `settings/keys.ts:1241-1286` |
| EVID-03 | 증빙 금액 → 확정 비용 · 세금은 지급 총액에만 | ✓ SATISFIED (지급 총액 몫) / 확정 비용 표시 → Phase 9 deferred | `payments/index.ts:126-169` · ROADMAP.md:1073 |
| EVID-04 | 증빙 떼면 예상으로 | ✓ SATISFIED | `evidence/index.ts:176` 무효 시 금액 지움 · `pickPaymentAmount` 공급가 복귀 |
| PROJ-06 | 완료 전 미결 점검 · 강행 설정 | ✓ SATISFIED | SC4 |
| MAST-05 | 지급 방식 코드표 관리 · 기본 셋 | ✓ SATISFIED | `domain/code-tables/index.ts:39` · `domain/seed/expenses.ts:16-20` · `app/(app)/admin/code-tables/page.tsx` |
| OPS-09 | 지급 · 구매 처리 핵심 행동 로그 | ✓ SATISFIED (기록) / 끌 수 없음 → 06.5 deferred | `payments/index.ts:498-505` · `purchase-requests/index.ts:434` · `action-log/record.ts:21-22` · 06.5-CONTEXT.md:48 |

ORPHANED requirements: 없음 — REQUIREMENTS.md가 Phase 6에 매핑한 12개가 모두 플랜 `requirements`에 있다.

참고(정보): REQUIREMENTS.md 추적이 아직 갱신 전이다 — 체크박스 :32 · :42 · :46 · :49 · :52 · :58 · :59 · :136 `[ ]`, 표 :208 · :215 · :219 · :222 · :225 · :228 · :229 · :276 `Pending`. 페이즈 완료 절차(`/gsd-complete-milestone` 또는 phase complete)에서 갱신할 몫이다.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (Phase 6 변경 domain · repositories · app · ui · lib) | — | TBD · FIXME · XXX | — | 0건 |
| domain/payments · corp-card-usages · purchase-requests · pre-settle-check · evidence · evidence-reviews · issue-requests · next-turn | — | TODO · HACK · not yet implemented | — | 0건 |
| docs/EVIDENCE-STORAGE.md | 100 | 청소 SQL `owner_kind = 'expense'` 한정 | ⚠️ Warning | 새 세 주인 종류의 지운 증빙 객체가 정리 대상에서 빠짐(데이터 손실 아님 · 저장 비용) |
| domain/evidence-reviews/cost-basis.ts | 12 | 운영 소비자 없는 export | ℹ️ Info | Phase 9 소비 예정, 06.5 D-6520이 입력 모델을 바꿈 |

### Human Verification Required

### 1. 실제 GCS로 새 주인 종류 증빙 업로드

**Test:** 스테이징에서 카드 전표 · 차수 고객 승인 · 리저브 줄 증빙을 이미지 · PDF로 올리고, 10MB 초과 파일을 시도한다.
**Expected:** 서명 PUT(크기 조건) → 완료 통보 → files 행 · 보기 URL 동작, 초과 파일은 의도 단계 거부.
**Why human:** CI E2E는 로컬 저장 드라이버로 돈다. 실제 GCS 경로는 CI가 보지 않는다.

### 2. 금지 사항(prohibitions) 130건 표본 밖 대조

**Test:** 각 PLAN의 `must_haves.prohibitions`(test 118 · judgment 12)에 대응 테스트 · 검토 기록이 있는지 훑는다.
**Expected:** test-tier는 이름 있는 테스트가 CI 녹색, judgment-tier는 /review · /design-review 기록과 일치.
**Why human:** 금지 ↔ 테스트 대응표가 없어 검증기가 기계적으로 닫을 수 없다(표본 4건은 확인). unverified-prohibition — human review recommended.

### Gaps Summary

차단(BLOCKER) 갭은 없다. 다섯 성공 기준이 모두 코드 · 배선 · CI 실행 근거로 성립한다. 남은 것은 경고 둘과 이관 넷이다.

- 경고 1 — `docs/EVIDENCE-STORAGE.md:100` F8 청소 SQL이 지출결의 증빙만 찾는다. Phase 6이 더한 세 주인 종류(`db/schema/files.ts:35`)를 넣어야 한다(문서 한 줄). 기준 2의 「완료 통보 없는 고아」(incoming/ 7일 수명 주기 + 대상 2)는 주인 종류 무관이라 기준 자체는 성립한다.
- 경고 2 — `expenseCostBasis`가 운영 코드에서 쓰이지 않는다. 「그 줄의 확정 비용」 표시는 Phase 9 effectiveCost(ROADMAP.md:1073) 몫이고 06.5 D-6520이 증빙 금액 칸을 없애므로, Phase 9 계획 때 이 함수의 입력을 06.5 모델에 맞춰야 한다.
- 이관 — EXP-13 독촉 · EXP-16 PM 알림(Phase 7, ROADMAP.md:1033), EVID-03 확정 비용 소비(Phase 9), OPS-09 끌 수 없음(06.5 D-6511).

---

_Verified: 2026-10-14T04:30:10Z_
_Verifier: Claude (gsd-verifier)_
