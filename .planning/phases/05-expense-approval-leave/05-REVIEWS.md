---
phase: 5
round: 2
sources:
  - eng-review.md (`/plan-eng-review 5`, 6c245e5, Opus 독립 교차 검토 — Codex 대체, 한도 해제 뒤 Codex 재확인 필요)
reviewers: [plan-eng-review, opus-outside-voice]
prior_rounds:
  - "Round 1 — 1108e20 (ceo-review.md, 반영 완료: 각 플랜 Ledger `### Round 1 — 1108e20`)"
---

# Phase 5 — Reviews (Round 2)

> `/gsd-plan-phase 5 --reviews` Round 2 입력. 정본은 `eng-review.md`이고 이 파일은 그 지적을 반영용 목록으로 옮긴 것이다(내용 추가 없음, 사용자 결정 E1 · E2만 덧붙임).
> Round 1(CEO) 지적은 `1108e20` 판 이 파일에 있고 각 플랜 Ledger Round 1에 반영됐다. design 게이트 결과는 다음 라운드에서 덧붙인다.

## User Decisions (코디네이터 경유 — 전제)

- **E1: A** (2026-09-27 00:4x KST, PR #89 issuecomment-5847548776) — 문서에는 세율 값(이력 id · 적용일 · 세율)만 스냅숏으로 저장하고 외래 키를 두지 않는다. 예정 세율 취소는 허용하고 그 문서에는 기존 「세율 바뀜」 표시
- **E2: A** (같은 댓글) — 업로드는 `incoming/` 접두어에 받고 완료 통보 때 `evidence/`로 옮긴다. 7일 삭제 규칙은 `incoming/`에만 건다
- `expenses.evidence_void` 기본 부여: **A**(시드 부여 없음, 15:18Z) — 현행 플랜 유지
- U1 · U2(Round 1)는 결정대로 반영 완료

## Consensus Summary

### HIGH (P1 — 실행 전 필수)
- **B1** `05-03-PLAN.md:184`(`tax_rate_setting_id` FK → `settings_historized`), `:188`(`pickTaxDates` 지급 쪽 = 지급 예정일, 미래일 수 있음), 코드 `domain/settings/registry.ts:182-183` · `repositories/settings.ts:88-96`(미래 이력 행 물리 삭제) — 예정 세율 행을 FK가 잡으면 관리자의 예정 세율 취소가 23503으로 영구히 막힌다. 수리(E1 A): 스냅숏 값(이력 id · 적용일 · 세율)을 FK 없이 저장, 취소 허용, 문서에는 기존 `세율 바뀜`. 통합 사례 1(예정 세율 참조 문서 제출 → 취소 성공 → 문서에 drift 표시). 영향: 05-03 스키마, 05-06 세금 한 줄 · 통합 사례(`05-06-PLAN.md:143`)
- **B2** `05-04-PLAN.md:173`(`completeEvidenceUpload`는 주인 상태 tx 재확인만), `:174`(`removeEvidence`는 `markRemoved`만) vs `05-09-PLAN.md:122`(잠금 순서 "지출결의 행 → 결재 인스턴스" 전제) — 제출 ∥ 삭제로 증빙 0개 문서 제출(기준 3 위반), 삭제 ∥ 삭제로 0개. 수리: 두 함수 tx 첫 단계 `lockExpenseForUpdate`(05-03) → 살아 있는 파일 수 재확인. 05-14 `afterLock` 두 순서 사례 2(제출↔삭제, 삭제↔삭제 — 결과 증빙 ≥ 1)

### MEDIUM (P2 — 같은 반영 라운드)
- **M1** `05-12-PLAN.md:34 · 156`, `05-04-PLAN.md:173`(`retain` = temporaryHold) — `evidence/` 전체 7일 삭제 + 보존 표식 하나로 완료 증빙을 지키는 구조(CEO F9의 부작용). 수리(E2 A): 업로드는 `incoming/{의도 id}`, 완료 통보 때 `evidence/`로 이동, 수명 주기 규칙은 `incoming/`에만. Round 1 `05-12` Deferred 「F9 대안 — `incoming/` 채택하지 않음」을 뒤집는다
- **M2** `05-08-PLAN.md:147 · 183` — 목록 페이지 나눔 × 그룹 정렬 계약 없음. 수리: `listExpenses` SQL `ORDER BY group_rank, <그룹별 CASE 키>, id` 계약 + 그룹 둘 이상이 쪽 경계를 넘는 통합 사례 1
- **M3** ARCHITECTURE §4-8(6) `tx-safety.test.ts`(풀 2)를 어느 플랜도 건드리지 않음 — 수리: 05-01(훅 승인) · 05-04(증빙 추가) · 05-11(정산 최종 승인)에 사례 하나씩
- **M4** `05-01-PLAN.md:303`("이동만"), `eslint.config.mjs:72`(ui는 `ui` · `lib`만 import) — 수리: 액션은 콜백 prop, 표시 타입은 `ui/approval-sheet` 안에 정의 + 이동 전 import grep 단계(Task 3 ⓪)
- **M5** 05-11 잠금 순서(인스턴스 → 프로젝트)가 §4-8(2)와 다른데 SUMMARY에만 기록, 05-03 counter period 예외(§4-6)도 같음 — 수리: 05-13 ARCHITECTURE 갱신에 §4-8 · §4-6 예외 각 한 줄
- **A1** `05-11-PLAN.md:159-160` — 브랜드 타입은 `as` 캐스트로 위조 가능. 수리: `domain/settlements` 밖 `as SettlementApprovalAuthority` 0건 grep을 acceptance에(또는 eslint `no-restricted-syntax`)

### LOW (P3)
1. `05-01-PLAN.md:292` 테스트 입력 `fxRate: 1`(숫자) vs `:299` 타입 `fxRate: string` — `domain/money` Money 모양으로 통일
2. `05-01-PLAN.md:239` · `05-11-PLAN.md:172` "종류 이름 리터럴 0건" grep이 `leave|expense|settlement`만 봄 — 05-03이 정한 실제 kind 값으로 패턴
3. E4 충돌 문구 `증빙을 더함`이 결재 중 **삭제**(`05-09-PLAN.md:44`)에도 나옴 — 추가/삭제로 가르거나 중립 문구
4. 05-11 훅의 "지금 차수 마지막 단계 기록"이 대표 폴백 행(`is_fallback`)을 포함하는지 명시 + 4단 끔 · 담당 없음 설정 사례 1
5. `05-11-PLAN.md:160` projects → settlements `import type` 역의존 — 브랜드를 projects 쪽에 선언하고 생성만 settlements에서 하는 배치 검토
6. `05-08-PLAN.md:146` `visibleExpenseScope.partyInstanceIds` 누적 IN 목록 — 결재 단계 표 EXISTS 서브쿼리로
7. `05-09` 다시 제출 · 되돌리기의 `expectedVersion`이 문서 version인지 인스턴스 version인지 섞임 — 인스턴스 version은 tx 잠금 뒤 읽는다고 명시
8. 웨이브 5 `05-05 ∥ 05-12` 같은 작업 트리 위험 — 별도 worktree 또는 순차, 05-12 사람 확인 checkpoint가 웨이브를 멈춤을 명시
9. `05-VALIDATION.md` Wave 0 `test/unit/lib/gcp/storage.test.ts`가 실제 `storage-local` · `storage-gcs` 이름과 다름 — P-5(`/gsd-validate-phase 5`)에서 맞춤
10. E3 종류별 `approveBlockedReason` 읽기가 04.1 `approvals-inbox-projection` 조회 횟수 단언(`05-01-PLAN.md:309`)을 흔들 수 있음 — 단언 범위 명시
11. `files.owner_id` FK 없음 · sha256 중복 검사에 UNIQUE 없음 — 동시 같은 파일 업로드 허용 여부 명시
12. 되돌리기 토스트 E2E가 토스트 표시 시간에 기댐 — 시간 주입 또는 지속 시간 설정
13. 목록 정렬 키(`submitted_at` · `scheduled_payment_date`) 인덱스 없음 — 30명 규모라 불요, 기록만

## Divergent Views

- 없음. Opus 독립 검토의 BLOCKER 2 · MAJOR 5 · MINOR 12는 eng-review가 B1 · B2 · M1~M5 · P3로 흡수했고 A1 · P3-13을 더했다
