---
phase: 06-payment-evidence-cards
plan: 24
subsystem: 페이즈 마감 E2E(경영관리 흐름 · PM 정산 흐름) · 누수 스캔 완전성 · 마이그레이션 대조
status: complete
tags: [EXP-06, EXP-07, EXP-09, EXP-10, EXP-13, EXP-16, EVID-01, EVID-02, EVID-03, EVID-04, PROJ-06, E-28, E-29, E-51, X-a, T-06-117]
requires: ["06-22", "06-23", "06-25"]
requirements-completed: [EXP-06, EXP-07, EXP-09, EXP-10, EXP-13, EXP-16, EVID-01, EVID-02, EVID-03, EVID-04, PROJ-06]
provides:
  - "test/e2e/management-flow.spec.ts — 이미지 · PDF 두 증빙 경로: PM 화면 제출 → 결재 → 홈 [오늘] 지급(상대 건수 N → N-1) → 증빙 확인 → 지급 완료 → 지급 완료 목록"
  - "test/e2e/pm-settlement-flow.spec.ts — [E-29] 구매 요청 → 구매 완료 · 지출결의 → 정산 전환 → 완료 전 점검 막힘(매출 발행 없음) → 발행 요청 → 발행 → 정산 결재 → 대표 승인 → 프로젝트 완료"
  - "test/integration/leak-scan.test.ts — `Phase 6 DTO가 모두 등록돼 있다`(상수 15개 ↔ DTO_REGISTRY)"
affects: []
tech-stack:
  added: []
  patterns:
    - "E2E 시드 카드는 호출마다 무작위 발급사 · 뒤 4자리(corp_cards_issuer_last4_key 23505 회피, X-a)"
    - "홈 지급 묶음 건수는 처리 전 N을 읽어 처리 뒤 N-1로 본다(공유 E2E DB, E-28)"
key-files:
  created:
    - test/e2e/management-flow.spec.ts
    - test/e2e/pm-settlement-flow.spec.ts
  modified:
    - test/integration/leak-scan.test.ts
key-decisions:
  - "제품 코드를 바꾸지 않는다 — 이 플랜은 앞 플랜들의 계약을 페이즈 단위로 검증하는 테스트만 더한다"
  - "Phase 6 DTO 목록은 레지스트리에서 거꾸로 만들지 않고 05-13 이후 `registerDto` 증가분을 git diff로 모아 상수로 둔다"
duration: 21 min
completed: 2026-10-13
actuals:
  tokens: 7100
  tasks: 3
  commits: 2
plan_head_before: 293c5518a11eba8ea005b8be4a50a4055434e587
commits: 2
---

# Phase 06 Plan 24: 페이즈 마감 E2E · 누수 스캔 완전성 Summary

경영관리 흐름(PM 제출에서 지급 완료 목록까지)을 이미지 · PDF 두 증빙 경로로, PM 정산 흐름(구매 · 지출결의에서 대표 승인 · 완료까지)을 한 E2E로 `CI=true` 녹색에 올리고, Phase 6 DTO 15개가 누수 스캔 레지스트리에 모두 있음을 상수 목록으로 고정했다. 제품 코드 변경은 없다.

## 커밋 (2 + SUMMARY)

| # | 해시 | 내용 |
|---|---|---|
| 1 | 410da0b | test — Task 1 트레이서: 이미지 증빙 한 건 경영관리 흐름 E2E |
| 2 | 45c6492 | test — Task 2: PDF 경로 · PM 정산 흐름(E-29) · 누수 스캔 완전성 `it` |

## Task 1 ⓪ 선행 의존 재확인 (모두 통과)

| 게이트 | 결과 |
|---|---|
| C15 | `git ls-files …/05-13-SUMMARY.md` → 1줄 |
| A-608-T | `localStorageFromEnv`(lib/gcp/storage.ts:238) 1 · `app/api/storage-local/[...key]/route.ts` 1줄 · `uniqueReceipt`(test/e2e/expense-fixture.ts:152) 1 |
| 06-01 ~ 06-30 SUMMARY 루프 | 06-24를 뺀 모든 06 PLAN.md에 SUMMARY — 출력 0줄 |
| C7 · R-4 | `grep -c "No schema changes" 06-27-SUMMARY.md` = 4 (둘째 generate `No schema changes, nothing to migrate` 인용: 06-27-SUMMARY 195행) |
| 06-19 | `app/(app)/projects/[id]/pre-settle-check.tsx` 1줄 |
| 06-15 · 06-20 · 06-23 | `listPaymentTargets`(domain/payments/targets.ts:210) 1 · `paid-list.tsx` · `domain/next-turn/phase6-items.ts` 2줄 |

## 이름 대응 (계획 → 실제)

| 계획 이름 | 실제 |
|---|---|
| PNG 증빙 `uniqueReceipt` | 05 `uniqueReceipt`는 JPEG(`image/jpeg`)를 만든다 — 이름만 「이미지 경로」로 하고 도우미는 그대로 썼다(바이너리 픽스처 없음) |
| 홈 `[오늘] 지급` 줄 | 「지급 — 예정일 지남·오늘 N건」(06-23 `PAYMENT_DUE` 정규식) |
| `지급 완료` `aria-disabled`(`확인 전 · 증빙 확인`) | 확인 전에는 1차 자리가 `증빙 확인`이고 `지급 완료`는 서 있지 않다(06-06 O-2) — 스펙은 「0개거나 1개면 aria-disabled」로 둘 다 받는다 |
| settlement-fixture 정산 전환 도우미 | 그런 도우미는 없다(`setupSettlementE2E`는 프로젝트째 만든다) — 기간을 직접 쓰고 `applyAutoSettlement`(실제 자동 정산 경로)를 부른다 |
| 업로드 입력 | `attachments-input` 테스트 id 그대로 |

## 결과 (acceptance)

Task 1
- `grep -c uniqueReceipt management-flow.spec.ts` = 3(≥1) · 이미지 경로 `CI=true` 녹색(1 passed, 1.2m — 콜드 빌드 포함)
- `git ls-files -- 'test/e2e/*.png' 'test/e2e/*.pdf'`: 이 플랜 전후 같음(visual 스냅숏 png 18개 그대로, 추가 0)
- E-28: `grep -cE "예정일 지남·오늘 1건"` = 0 · `grep -c "seoulToday()"` = 2

Task 2
- `application/pdf` 업로드 있음(1) · management-flow 두 test + pm-settlement-flow 한 test 한 번에 `3 passed (38.6s)`
- E-29: `grep -c "완료 전 점검" pm-settlement-flow.spec.ts` = 5 · `uniqueReceipt` = 2
- X-a: `grep -v '^\s*//' … | grep -cE 'numberLast4: "[0-9]{4}"'` = 0 · `--repeat-each=2` 녹색(`2 passed`, 23505 없음)
- 누수 스캔: 새 `it` 단독 + 파일 전체 `4178 passed`, 단위 `leak-scan-coverage` 2 passed
- merge-base diff: `git diff --stat "$(git merge-base origin/main HEAD)" -- package.json pnpm-lock.yaml docs/design/tokens.css` 빈 출력(종료 0)
- 새 `it` 단언 DTO 이름 15개(≥6). 상수 배열 출처: 05-13 SUMMARY 커밋(`acf1cf2`) 이후 `registerDto({ name: … })` 증가분을 `git grep` 대조로 모았다. SUMMARY에 이름이 적힌 것은 `paymentView`(06-03 · 06-20) · `CardUsageListItemDto` · `ProjectCardUsageDto`(06-07) · `paymentTargetRow`(06-15 · 06-17) · `IssueRequestDto`(06-18) · `PreSettleCheckDto`(06-19) · `paidPaymentRow`(06-20)이고, 나머지 8개(`payablePreview` · `CardUsageEditDto` · `CardUsageCardOptionDto` · `ProjectCardUsageTotalsDto` · `CardLinkProjectDto` · `CardLinkLineDto` · `PurchaseRequestListItemDto` · `PurchaseCompletionDto`)는 SUMMARY에 이름이 없어 코드 diff가 출처다. `ProjectMemberDto` · `ProjectMemberCandidateDto`는 06.2(보임 범위) 몫이라 뺐다.

RED 확인
- E2E 둘: 앞 플랜 기능을 증명하는 특성화 테스트라 첫 실행이 바로 녹색이다. 단언이 살아 있음은 변이로 확인 — pm-settlement-flow에서 시드 카드 사용 한 줄(`worst`)을 빼면 `미매칭 견적 줄 ` 단언이 `Expected: 0 / Received: 1`로 빨개진다(되돌려 녹색 복귀).
- 누수 스캔 `it`: 상수 목록에 없는 이름 `Phase6MutationProbeDto`를 넣으면 `누수 스캔 레지스트리에 없는 Phase 6 DTO: Phase6MutationProbeDto`로 빨개진다(되돌림).

## Task 3 — 로컬로 할 수 있는 부분

| ① 항목 | 결과 |
|---|---|
| 기준 커밋 | 05-13 SUMMARY가 들어온 커밋 `acf1cf2f5762c577ca6f2ccc87d34985cb06c5dd` |
| 06 범위에서 `db/migrations`·`db/schema`를 바꾼 커밋 | 5개: `70d5b21`(#169 Phase 6 스키마 · 0025 · 0026) · `7c55305`(#174 거래처 갈래 · 0027 · 0028) · `32e37c1`(#177 증권 세율 시드 동기화 · 0029) · `bfd0e90`(#179 사업자번호 유일 색인 · 0030) · `8f7f8fa`(#186 06.2 보는 범위 스키마 · 0031) |
| 허용 목록 `/tmp/plant8-06-allowed-schema-commits.txt` | 1줄(`70d5b21` = PR-A #169, 06-27 SUMMARY의 커밋 다섯이 스쿼시로 들어간 커밋). `gh`가 없어 PR #164(6.1) 커밋은 못 채웠고, 그 번호는 `git log`에 나타나지 않는다 |
| verify 둘째 줄 출력 | `disallowed=4` → 종료 1 (아래 「열린 항목 1」) |
| `pnpm lint:sql` | 0건(종료 0) |
| `pnpm db:migrate`(격리 DB erp_test_0624 빈 DB) + `pnpm db:generate` | `No schema changes, nothing to migrate` |
| ⑥ 롤백 DROP · RENAME · 타입 변경 grep(verify 다섯째 줄) | 종료 1 — `+ALTER TABLE "corp_cards" DROP CONSTRAINT "corp_cards_owner_xor_check"` · `+ALTER TABLE "files" DROP CONSTRAINT "files_owner_kind_check"` 두 줄(0025). 컬럼 · 표 DROP · RENAME · 타입 변경은 0 (아래 「열린 항목 2」) |
| backstop 합 | `grep -c "verification: backstop"` 합(06-24 제외) = **67**; 줄 전체가 `verification: backstop`인 필드 줄만 세면 **61**(본문에 문구가 들어간 줄 6). 별도 감사 에이전트 판정 건수와 맞춘다 |
| NP-4 인용 | 06-27-SUMMARY 「C15 · A-… 결과」 표의 `6.1` 행: ``evidence_records · evidence_import_batches · approval_no` 출력 없음`` (06-27 기준 시점. 이 플랜 시점에도 `git grep -nE "evidence_records|evidence_import_batches|approval_no" -- db domain app lib repositories` 출력 0) |
| C19 | 기준 `293c551…HEAD` 위험 경로 0건. `origin/main...HEAD`로 세면 1건(`.claude/gates/phase-06.log` — 이 플랜 앞 오케스트레이터 커밋이 들어 있는 기록, 내 변경 아님) |
| `.github/workflows/` diff | 기준 대비 0줄 |

## 열린 항목 (오케스트레이터 판단 필요)

1. **마이그레이션 대조 `disallowed=4`.** 계획이 쓰인 뒤 06 범위에 들어온 다른 트랙 PR 넷(#174 거래처 갈래 · #177 세율 시드 · #179 사업자번호 색인 · #186 06.2 보는 범위)이 스키마 · 마이그레이션을 바꿨고 허용 목록 규칙(06-27 + 6.1 #164)에 없다. 넷 모두 별도 PR 번호로 main에 들어왔고 추가형(0027 ~ 0031)이다. 계획 규칙대로면 「멈추고 보고」이고, 현실적으로는 허용 목록에 이 넷을 더하는 판단(권장)이 필요하다. 이 플랜은 마이그레이션 · 저널을 건드리지 않았다.
2. **롤백 grep 2건.** `0025_phase6_tables.sql`의 `DROP CONSTRAINT` 둘은 CHECK 교체다 — `corp_cards_owner_xor_check`(홀더 xor 팀) → `corp_cards_owner_kind_check`(personal ↔ 홀더, team ↔ 팀, shared ↔ 둘 다 없음 — 옛 제약이 받던 행은 새 제약도 받는다), `files_owner_kind_check`(`expense` 만 → `expense · quote_revision · reserve_entry · corp_card_usage`로 넓힘). 옛 코드가 쓰던 행은 모두 새 제약을 통과하므로 Cloud Run 이전 리비전 호환은 유지된다고 본다(데이터 손실 없음). 다만 계획의 정규식은 이 둘을 못 거르므로 verify 문장은 literal로는 실패다 — 사람의 확인이 필요하다.
3. **증빙 필수 설정 경합 가능성.** `payment-single.spec.ts`는 파일 전체 동안 전역 `evidence.required`를 `false`로 두었다가 afterAll에서 되돌린다. management-flow는 계획대로 시작에서 그 값이 `true`인지 읽기만 하므로, CI에서 워커 둘이 두 파일을 동시에 돌리면 드물게 「증빙 필수 설정이 기본값이 아님」으로 빨개질 수 있다(파일 순서상 겹칠 가능성은 낮다). 겹침이 보이면 payment-single 쪽을 직렬로 두는 별도 정리가 필요하다 — 이 플랜 범위 밖.

## 06.5 정리 대상 (evidence_amount)

- 새로 `expenses.evidence_amount` 를 읽거나 쓰는 코드 · `pickPaymentAmount` 의존: **없음**.
- 화면 조작 한 곳: `test/e2e/management-flow.spec.ts`의 `runManagementFlow`가 증빙 확인 전에 `#evidence-amount` 칸을 공급가액(`expenses.supplyAmountKrw`)으로 채운다(기안자 증빙 금액 칸이 비어 있으면 열려 있는 06-06 화면 조작). 06.5에서 칸이 없어지면 이 한 줄(`amountField` 분기)을 지운다.

## 스킬 호출 기록

- `superpowers:test-driven-development` — 누수 스캔 `it` 먼저 쓰고 변이로 빨강 확인.
- `superpowers:verification-before-completion` — 커밋 전(훅 요구)에 tsc · eslint · E2E 실제 실행 결과 확인.
- `superpowers:systematic-debugging` — 실패가 없어 호출하지 않았다.
- `design-gate` — app/ · ui/ · docs/design 파일을 건드리지 않아 호출하지 않았다.

## 실행 기록 (격리 DB · 잠금)

- E2E는 `flock /tmp/plant8-erp-test.lock` + `--no-deps --project=desktop` + `DATABASE_URL=…/erp_0624_test`, 통합 `…/erp_test_0624`, 둘 다 마지막에 드롭. 출력은 `/tmp/claude-0/exec-0624/`.
- 단위 전체(`pnpm vitest run --project unit`, 마지막 코드 커밋 뒤): 306 files · 4598 passed · 0 failed. `pnpm lint` · `pnpm typecheck` 종료 0.
- 통합은 `test/integration/leak-scan.test.ts`만(4178 passed). 전체 통합 · 전체 E2E는 CI 몫.

## Deviations from Plan

**1. [Rule 3 - Blocking] 정산 전환 도우미 없음** — Task 2. 계획이 가리킨 settlement-fixture의 「정산 전환 도우미」는 프로젝트째 만드는 `setupSettlementE2E`뿐이라(발행 줄을 미리 만들어 막힘 한 번을 가린다) 쓸 수 없다. 대신 05 `setupExpenseE2E` 프로젝트의 기간만 직접 지난해로 쓰고 실제 경로 `applyAutoSettlement`로 정산에 둔다. 새 도우미 파일 없음. 파일: pm-settlement-flow.spec.ts.

**2. [Rule 3 - Blocking] 줄 A의 거래처를 온라인구매 협력사로** — Task 2. 구매 요청 문(06-08)은 온라인구매 협력사 줄에만 열린다. `setupExpenseE2E`의 줄은 모두 일반 거래처라 줄 A(`tracer`)의 `vendorId`만 테스트 준비로 직접 바꾼다(전역 설정은 `online-vendor.ts` 규약대로 고정 이름을 멱등으로 켠다).

**3. [Rule 1 - 계획 문구] PNG → 이미지(JPEG)** — 위 이름 대응 표.

**4. [기록] 허용 목록 · 롤백 grep** — 「열린 항목 1 · 2」. 계획 verify literal은 실패, 원인은 계획 이후 들어온 다른 트랙 PR과 정규식의 DROP CONSTRAINT 포착.

**Total deviations:** 2 auto-fixed(Rule 3) + 2 기록. **Impact:** 제품 코드 영향 없음. 오케스트레이터 판단은 열린 항목 1 · 2.

## 오케스트레이터 몫(아직 안 함)

아래는 서브에이전트가 할 수 없거나 GitHub 자원이 필요해 하지 않았다. 완료로 표시하지 않는다.

- **별도 에이전트 DOM 감사(backstop 전부).** 실행자가 아닌 에이전트가 `CI=true` 빌드 화면에서 06 PLAN.md(06-24 제외)의 `verification: backstop` 전부를 DOM 실측(스크린샷 육안 금지). 건수는 위 backstop 합(67 / 필드 줄 61)과 맞춘다. 채울 줄: 감사 판정 건수 = ___ , 결함 ___건 수정 ___.
- **사파리 캡처 한 번.** 페이즈 브랜치 푸시 뒤 `gh workflow run safari-capture.yml -f ref=<브랜치> -f routes='["/","/expenses?status=지급 대상","/expenses?status=지급 완료","/cards","/cards/purchases","/projects","/projects/issue-requests","/admin/settings"]'` → `gh run watch --exit-status` → `gh run download`. SC-1 경로는 06 SUMMARY들의 새 id 없는 라우트와 대조해 빠진 것을 더한다. 채울 줄: 실행 id ___ , `headBranch` ___ , WebKit · Chromium 비교 판정(별도 에이전트) ___.
- **Opus 교차 검토(U-1).** 플랜 체커(Opus) + 별도 Opus 적대적 검토 1명이 페이즈 diff를 본다. 채울 줄: 결과 ___.
- **`/gsd-validate-phase 6`(RS-03).** Per-Task 지도가 실행된 29 플랜(06-01 ~ 06-30 − 06-26) · 실제 테스트 이름과 맞는지, 결과 ___.
- **E-53 샤드 시간 두 벌.** ready 전 최신 녹색 main CI와 ready PR CI의 e2e 샤드 job 시간(`gh run list` · `gh run view --json jobs`), 가장 긴 샤드가 `timeout-minutes`의 80% 또는 가장 짧은 샤드의 1.5배를 넘으면 `ci.yml` 조정은 이 PR이 아니라 별도 PR 제안 + todo. 판정 한 줄 ___.
- **ready PR CI 전체 게이트.** `gh pr checks --watch --fail-fast` 녹색 링크 ___.
- **Post-build 묶음 게이트.** `/review` · `/design-review`(외부 검토는 디자인 검토에서만) → `/qa` · `/cso`(업로드 · 링크 URL 외부 입력).
- **허용 마이그레이션 목록 확정.** 열린 항목 1의 넷을 허용에 더해 verify 둘째 줄을 `disallowed=0`으로 다시 돌려 인용 / PR #164(6.1) 해시 포함(`gh pr view`).
- **롤백 한 줄 판정.** 열린 항목 2를 받아들이면 「Cloud Run 이전 리비전으로 되돌려도 스키마 호환」 한 줄을 확정.

## Known Stubs

없음 — 테스트만 더했다.

## Threat Flags

없음 — 새 네트워크 · 인증 · 파일 접근 면 없음(업로드는 05 로컬 드라이버, PDF는 코드 안 바이트 상수; T-06-118 accept 그대로). T-06-117(누수 스캔 밖 DTO)은 상수 목록 대조 `it`로 완화.

## Self-Check: PASSED

- 파일 존재: test/e2e/management-flow.spec.ts · test/e2e/pm-settlement-flow.spec.ts · test/integration/leak-scan.test.ts 확인.
- 커밋 존재: 410da0b · 45c6492 가 `git log 293c551..HEAD`에 있음(2건, 원장 `plan_head_before` 기준 `git rev-list --count` = 2).
- U-1: 페이즈 마감 게이트에 외부 모델 재확인 없음(Opus 교차 검토만).

## 오케스트레이터 판정 (2026-10-13)

- **열린 항목 1 → 허용.** #174(`7c55305`) · #177(`32e37c1`) · #179(`bfd0e90`) · #186(`8f7f8fa`)은 06 코드 PR이 아니라 각각 따로 main에 머지된 다른 트랙 PR이고 마이그레이션은 추가형(0027~0031)이다. 허용 목록을 5줄로 늘려 verify 둘째 줄을 다시 돌렸다: `disallowed=0`(종료 0). PR-E(#214)는 `db/migrations`·`db/schema`를 바꾸지 않는다. 6.1 #164는 아직 머지 전이라 범위에 없다.
- **열린 항목 2 → 호환으로 확정, 사용자 알림.** 0025의 `DROP CONSTRAINT` 둘은 더 넓은 CHECK로 바꾸는 교체(PR-A #169, 사용자 머지)다. 옛 리비전이 쓰는 행은 새 제약도 통과하므로 「Cloud Run 이전 리비전으로 되돌려도 스키마 호환」. 계획 정규식이 DROP CONSTRAINT를 거르지 못해 literal은 실패이므로 PR 보고에 사용자에게 알린다.
- 열린 항목 3은 CI e2e 결과로 본다(겹침이 보이면 별도 정리).

## 교차 검토(U-1) 반영 (2026-10-14)

출처: `notes/06-review/06-u1-cross-review.md`(Opus 독립 · 읽기 전용). 지적 셋은 고치고(TDD — 실패 테스트를 먼저 보고 고침), 참고 둘은 기록만 한다.

| 지적 | 처리 | 커밋 | 테스트 |
|---|---|---|---|
| U1-1 중간 — 구매 요청 취소가 프로젝트 행을 잠그지 않고 완료 판정도 없다 | `cancelPurchaseRequest`가 견적 줄 요청이면 트랜잭션 첫 줄에서 `lockProjectForLinkWrite`(기본값 — 완료 거부)를 잡는다. 잠금 순서는 프로젝트 → 요청 행(구매 완료와 같은 방향). `precheckPurchaseCancel`은 완료 프로젝트를 트랜잭션 전에 거부하고(`CompletedProjectError`) 잠근 행으로 다시 본다(X-2). 형제 동작(카드 사용 삭제 — 완료 프로젝트 건은 권리 없음 U-4)에 이미 있는 숨김 꼴을 따라 목록 `cancelBranches` · S13 패널 `cancelBranch`에서 완료 프로젝트 줄 요청의 `요청 취소`를 뺀다(화면 코드 무변경 — domain 값만) | bd88851 · 5162449(행 범위 처분표 등록) | `purchase-requests.test.ts` [U1-1] 3건(완료 거부 본인 · 구매 권한자 · 로그 0 / 사전 조회 뒤 완료 커밋 경합 / 목록 · 패널 갈래), `pre-settle-check.test.ts` [U1-1] 2건(취소 먼저 쥠 → 승인은 기다린 뒤 `완료 전 점검 1건` 거부 · 승인 먼저 → 취소 `완료 · 견적 줄 잠김` · 요청 `신청됨` · 로그 0). 고치기 전 4건 모두 빨강 확인 |
| U1-2 중간 — 레이아웃 · 홈이 「내 차례」를 요청마다 두 번 계산 | `app/(app)/next-turn-request.ts` — React `cache()`가 요청마다 새 Map을 주고 열쇠는 사람 id · 계급(레이아웃 · 홈의 viewer 객체가 달라서). 홈이 결재 시트 재료를 쓰므로 한 번 계산에 `withDetails`를 싣는다. 레이아웃 · 홈은 import · 호출 한 줄씩 바꿈(JSX · CSS diff 0, 점검표 `docs/design/checks/2026-10-14-06-u1-next-turn-request-memo.md`). 건수 정의(S19)는 그대로 | 4265193 | `test/unit/app/next-turn-request-memo.test.ts` 4건 — vitest의 일반 react는 `cache`가 그냥 통과하므로 cache를 「한 요청 = 한 memo」로 흉내 내 열쇠 · 재사용 규칙을 본다(같은 사람 두 번 → 공급 함수 1회 · 다음 요청 새로 · 다른 사람/계급 따로 · 레이아웃/홈이 이 함수를 거침). memo를 끄면 빨강(뮤테이션 확인). 실제 요청 단위 memo는 Next 문서(`caching-without-cache-components.md` 「Deduplicating requests」)의 계약 — 실측은 프로덕션 빌드에서 `listNextTurnItems` 호출을 세는 계측(예: 일시 로그 · OpenTelemetry span)으로 홈 전체 로드 1회를 확인하는 방식으로 남긴다 |
| U1-3 낮음 — `restoreEvidence`가 카드 전표도 되살림 | `restoreEvidence`가 되살리기 주인 종류를 차수 고객 승인(`quote_revision`) · 리저브 줄(`reserve_entry`) 허용 목록으로 한정 — 카드 전표(`corp_card_usage`)는 직접 호출도 카드 쪽 없는 건 문구로 거부(06-25 must_have 「카드 전표 되돌리기 없음」). 액션 주석 「새 두 주인 종류만」과 서버가 이제 같다 | d2a4d78 | `card-usage-evidence.test.ts` [U1-3] 1건(등록한 사람 · 대리 등록 권한자 직접 되살리기 거부 · 파일 지운 채 · `evidence_restore` 로그 0) + 기존 [X-2]의 카드 전표 되살리기 호출을 거부 단언으로 바꿈(version 불변 단언은 그대로). 차수 승인 · 리저브 되살리기는 `approval-reserve-evidence.test.ts` 그대로 통과 |
| U1-4 참고 — 카드 전표 읽기 범위가 `cards` 메뉴 보기를 보지 않음 | 기록만 — 06-05 S8 목록과 같은 동작 승계라 06-25 prohibition은 문면대로 지켜진다. 메뉴 게이트를 원하면 06-05 · 06-25를 함께 고친다 | — | — |
| U1-5 참고 — 서로 다른 주인 사이 중복 판정은 잠금으로 직렬화되지 않음 | 기록만 — 05 업로드 중복과 같은 수준의 남은 위험. 유일 제약이 없으니 6.1 대사에서 잡히는지만 본다 | — | — |

### 07 입력 (U1-2 남은 비용)
- 레이아웃은 전체 로드 · `router.refresh()` · `revalidatePath` 액션마다 여전히 「내 차례」 전체 계산을 한 번 돈다(지급 권한자 `listAllPaymentTargets`, PM 프로젝트별 `computePreSettleCheck`, 대표 `approveBlockedReasonsOf` → 정산 점검). 이번 수정은 홈의 중복 한 번만 없앴다.
- 한 번 계산에 `withDetails`를 실어서 홈이 아닌 화면의 레이아웃 렌더도 `내 결재` 문서의 결재 시트 재료(`loadKindDetails` · `possibleActions`)를 함께 읽는다 — `내 결재` 건수만큼 늘어나는 비용.
- 07 후보: 레이아웃 건수용 가벼운 갈래(묶음 존재 여부만 COUNT, 결재 막힘 이유 · 시트 재료 생략 — 건수 정의 S19 유지) 또는 클라이언트 경로 변경 때 건수를 따로 받기(UnreadCountProvider 꼴).

### 실행 기록
- 격리 DB만: 통합 `erp_test_u1f`, E2E `erp_u1f_test`(`flock /tmp/plant8-erp-test.lock`, 포트 3100, `--no-deps --project=desktop`). 끝난 뒤 둘 다 지움.
- `pnpm lint` 종료 0(boundaries 설정 경고만) · `pnpm typecheck` 종료 0 · `pnpm test:unit` 307파일 4602건 녹색.
- 통합: `purchase-requests.test.ts` · `pre-settle-check.test.ts` · `card-usage-evidence.test.ts` · `approval-reserve-evidence.test.ts` · `evidence-upload.test.ts` · `evidence-void.test.ts` · `next-turn.test.ts` 녹색.
- CI=true E2E(desktop): `purchase-requests-finish.spec.ts` · `next-turn-phase6.spec.ts` 9건 통과.
- 스킬: superpowers:test-driven-development · verification-before-completion · design-gate(U1-2 화면 파일) 호출.

## backstop 감사 반영

판정 건수 61 = backstop 합 61(필드 줄), 결함 4 → 수정 4

출처: `/mnt/project-files/notes/06-review/06-backstop-audit.md`(기준 트리 `0b841e1`). 모두 낮음. 실패 E2E 단언을 먼저 커밋(RED 3건 실패 확인)한 뒤 수정했다.

| 결함 | 수정 | 위치 | 커밋 |
|---|---|---|---|
| B-1 카드 사용 목록 가맹점 칸 3~4줄 꺾임 | 연결 칸과 같은 `.linkCell`/`.linkText` 한 줄 말줄임 + title | `app/(app)/cards/card-usage-list.tsx` `merchantCell` | 0add937 |
| B-2 옆 패널 가맹점 · 카드 이름 꺾임 | `.valueLine`(flex, `바꾸기` 버튼 줄지 않음) + `.valueText` 한 줄 말줄임 + title | `card-usage-form.tsx` 가맹점 · 수정 모드 카드 이름, `cards.module.css` | 0add937 |
| B-3 확인 모달 부제 2~4줄 꺾임 | 공용 `ConfirmDialog` 부제 `-webkit-line-clamp: 2` + `overflow-wrap: anywhere` + title 전문 | `ui/confirm-dialog/ConfirmDialog.module.css` `.subtitle`, `ConfirmDialog.tsx` | c6c2147 |
| B-4 홈 느린 로드 LOADING 없음 | `page.tsx`를 `app/(app)/(home)/`로 옮기고 `loading.tsx`(제목 `내 차례` + `--surface-muted` 행 2개, aria-busy, 300ms 지연) 추가 | `app/(app)/(home)/loading.tsx` · `loading.module.css` | 4d8929d |

- 테스트 선행 커밋: 2ca5772(`test(06)`).
- B-4 방식 편차: 지시는 페이지 안 Suspense를 선호했으나, Next 16 문서상 동적 라우트는 `loading.js`가 있어야 미리 가져오기가 되고(prefetching.md), 감사가 쓴 계측(RSC 지연 중 클라이언트 이동)에서는 페이지 안 Suspense가 이동 중 뼈대를 만들지 못한다. `app/(app)/loading.tsx`는 하위 전체에 번지므로 `expenses/(list)` 선례의 라우트 그룹으로 홈만 감쌌다. 홈 로드 뒤 화면은 그대로다. `layout.tsx` · `domain/next-turn/*`는 건드리지 않았다.
- 점검표: `docs/design/checks/2026-10-14-06-24-backstop-fix.md` + 06-05 · 06-17 · 06-23 점검표에 한 줄씩.
- 검증(CI=true, 격리 DB `erp_bsf_test`, `--no-deps`): backstop 신규 3건 통과 / desktop 관련 182 통과(card-usage · card-usage-evidence · card-usage-panel-width · next-turn-phase6 · payment-batch · payment-single · evidence-lifecycle · issue-requests · dev-components · quote-revisions) / desktop 홈 접촉 95 통과 5 건너뜀 / mobile-375 87 통과 2 건너뜀 / `pnpm lint` · `pnpm typecheck` 0 / `pnpm test:unit` 306 파일 4598 통과.
- 미실시: 폰 시트 위의 확인 모달 부제 직접 단언(증빙 확인 모달은 PC 폭에서만 열린다 — 규칙은 공용 CSS 한 곳), 320 폭 재실측(독립 DOM 감사 몫).
