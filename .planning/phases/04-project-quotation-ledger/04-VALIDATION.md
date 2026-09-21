---
phase: "04"
slug: "project-quotation-ledger"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-21"
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> 출처: `04-RESEARCH.md` §Validation Architecture (실측 확인된 명령만 적는다).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3계열(project 분리: unit/integration) + Playwright(e2e) |
| **Config file** | `vitest.config.ts`(unit·integration project) · `playwright.config.ts`(e2e) |
| **Quick run command** | `pnpm test:unit` |
| **Full suite command** | `pnpm test` (unit → integration → e2e 순차) |
| **E2E reset command** | `pnpm db:reset:test && CI=true pnpm test:e2e` (한 명령으로 돈다) |
| **Estimated runtime** | unit ~수 초 · 전체 수 분 (실측은 Wave 0에서 기록한다) |

**로컬 dev 통과는 완료 신호가 아니다** — `playwright.config.ts`가 CI에서만 프로덕션 빌드를
쓰므로 완료 판정은 `CI=true`로 한다(CLAUDE.md).

---

## Sampling Rate

- **After every task commit:** `pnpm test:unit` — money·gate·grid 순수 로직은 DB 없이 여기서 대부분 잡힌다
- **After every plan wave:** `pnpm test` (전체)
- **Before `/gsd-verify-work`:** 전체 그린
- **Max feedback latency:** unit 단계 기준 60초

---

## Per-Task Verification Map

플랜이 아직 없으므로 Task ID 열은 계획 단계에서 채운다. 요구사항 → 테스트 계층 대응은 확정이다.

| Requirement | Behavior | Test Type | Automated Command | File Exists |
|---|---|---|---|---|
| PROJ-01 | 프로젝트 번호 원자적 증가 · 동시 제출에 중복 없음 | integration | `pnpm vitest run --project integration -t "document counter"` | ❌ W0 |
| PROJ-02 | 견적가·실행가 입력 시 차익을 서버가 계산 · 브라우저 값 미저장 | unit + integration | `pnpm vitest run --project unit -t "quote-lines"` | ❌ W0 |
| PROJ-03 | 계약금액 → 부가세·합계 서버 계산 · 입금액 → 공급가 역산 | unit | `pnpm vitest run --project unit -t "grossFromTotal"` | ❌ W0 |
| PROJ-04 | 상태 전이 게이트(수주중→진행 · 수주중→미수주 · 미수주→진행 · 진행→완료) | unit | `pnpm vitest run --project unit -t "rules.gate"` | ❌ W0 |
| PROJ-05 | 이전 프로젝트·견적 줄 복사와 기본값 채움 | integration | `pnpm vitest run --project integration -t "project copy"` | ❌ W0 |
| PROJ-07 | 고객 승인 전 지출결의·구매 요청 비활성 (게이트 경유) | integration + e2e | `pnpm vitest run --project integration -t "quote approval gate"` | ❌ W0 |
| ADMN-09 | 문서 번호 서식 설정 키 등록·읽힘 | unit | `pnpm vitest run --project unit -t "registry-coverage"` | ✅ 기존 테스트가 새 키를 자동 검사 |
| UX-04 | 잘못된 입력이 서버 검증으로 안내 · 저장 실패·중복 저장·입력값 유실 없음 | integration + e2e | `pnpm vitest run --project integration -t "quote-lines batch save"` | ❌ W0 |
| UX-05 | 키보드만으로 견적 줄 입력(Tab/Enter/방향키/⌘C·V/Esc/⌘S) | e2e | `CI=true pnpm playwright test test/e2e/quote-grid-keyboard.spec.ts` | ❌ W0 |
| RSV-01 | 리저브 입금·출금·잔액 계산 · 음수 잔액 DB 제약 거부 | integration | `pnpm vitest run --project integration -t "reserve ledger"` | ❌ W0 |
| FX-01 | 통화 선택 시 `exchange_rates` 최신 행이 기본값으로 채워짐 | integration | `pnpm vitest run --project integration -t "exchange rate default"` | ❌ W0 |

---

## Wave 0 Requirements

- [ ] `domain/money/index.test.ts` — `round`/`toKrw`/`splitWithRemainder`/`grossFromTotal`/`applyTaxRule` 단위 테스트(세금 규칙 4종 × 절사 표 기반). D-53의 최소단위 정수 표현을 고정한다
- [ ] `domain/rules/gate.test.ts` — 게이트 규칙 단위 테스트. D-56의 `{ allowed, reason, ruleKey }` 반환 형태와 D-43의 수주중 면제를 고정한다
- [ ] **`test/integration/document-counters.test.ts` 갱신 (blocking)** — `test/integration/document-counters.test.ts:40-43`이 `Object.keys(documentCountersRepo).sort()`를 `["findDocumentCounter","upsertDocumentCounter"]`로 **정확히** 단언한다(실측 확인). 원자적 증가 함수를 더하는 커밋이 이 단언을 함께 고치지 않으면 CI가 즉시 빨개진다
- [ ] `test/integration/document-counters.test.ts` — 동시 증가(트랜잭션 2개) 통합 테스트 추가
- [ ] `test/integration/quote-lines-conflict.test.ts` — D-48 조건부 `updatedAt` 충돌 감지
- [ ] `test/e2e/quote-grid-keyboard.spec.ts` — 키보드 전용 시나리오
- [ ] `test/unit/design-tokens-usage.test.ts` — D-61. 사용처 0인 토큰을 잡되 감시 범위는 `app/**` + `ui/**`. `--form-max`가 오늘 RED여야 한다
- [ ] `test/unit/migrate/extract-allowlist.test.ts` — D-57a. 허용목록 밖 표·DB를 만나면 extract가 실패하는지
- [ ] `test/unit/source-column-coverage.test.ts` — D-58. 이전 대상 업무 표가 `source`·`source_id`를 빠뜨리면 잡는다

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|---|---|---|---|
| 목록 응답 p99 500ms | PROJ-01 (ROADMAP 기준 1) | 부하 특성이라 단위 테스트로 못 고정한다. 125건 규모에서는 자명하나 수치가 기준에 못박혀 있다 | 시드된 개발 DB에서 목록 화면을 재고 결과를 `04-VERIFICATION.md`에 적는다 |
| 엑셀 붙여넣기가 실제 스프레드시트에서 온 TSV로 동작 | UX-05 | Playwright의 합성 클립보드가 실제 Excel·Google Sheets의 TSV 형태와 다를 수 있다 | 실제 시트에서 범위를 복사해 견적 줄 표에 붙여넣는다 |
| transform의 `amount_basis` 판정이 실데이터에서 맞는지 | ROADMAP 기준 7 | 실데이터가 public 레포 밖에 있어 CI가 볼 수 없다(D-57) | 로컬에서 `PLANT8_INTRANET_BACKUP_260915` 덤프로 돌리고 보고서를 눈으로 본다. 보고서는 커밋하지 않는다 |

---

## Validation Sign-Off

- [ ] 모든 태스크에 `<automated>` verify 또는 Wave 0 의존이 있다
- [ ] 샘플링 연속성: 자동 검증 없는 태스크가 3연속으로 오지 않는다
- [ ] Wave 0가 MISSING 참조를 전부 덮는다
- [ ] watch 모드 플래그 없음
- [ ] 피드백 지연 < 60s (unit 단계)
- [ ] `nyquist_compliant: true`를 frontmatter에 설정

**Approval:** pending
