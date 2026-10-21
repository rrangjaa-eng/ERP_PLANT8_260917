---
phase: "07"
slug: "schedule-notify-audit"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-21"
---

# Phase 07 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. 근거: 07-RESEARCH.md 「Validation Architecture」.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest(unit · integration) · Playwright |
| **Config file** | `vitest.config.ts` · `playwright.config.ts`(CI에서만 프로덕션 빌드) |
| **Quick run command** | `pnpm exec vitest run --project unit <바뀐 단위 파일>` |
| **Full suite command** | 로컬에서 돌리지 않음 — PR ready 뒤 CI가 build · 전체 단위 · 통합 · E2E 한 번(CLAUDE.md §5) |
| **Estimated runtime** | 단위 ~30초 · 관련 통합 ~3분 · 관련 E2E ~5분 |

통합(관련 파일만, 시험 DB 하나라 flock): `flock /tmp/plant8-erp-test.lock sh -c 'pnpm db:dev && pnpm db:migrate && pnpm db:reset:test && pnpm exec vitest run --project integration <관련 통합 파일>'`

E2E(건드린 스펙만, CI=true): `flock /tmp/plant8-erp-test.lock sh -c 'pnpm db:dev && pnpm db:reset:test && CI=true pnpm playwright test <건드린 스펙>'`

---

## Sampling Rate

- **After every task commit:** `pnpm lint && pnpm typecheck` + 바뀐 단위 파일
- **After every plan wave:** 해당 웨이브 통합 파일 → 건드린 화면 E2E(한 번에 하나). 스키마 플랜(PR-S, 웨이브마다 하나)은 `pnpm lint:sql` + `pnpm db:generate` 재생성 확인 + `pnpm exec vitest run --project unit test/unit/db/migration-journal.test.ts`(C2 — 파일 이름 · 번호 grep 대신)
- **PR ready 때(묶음마다 한 번, D-726):** 위험 경로 묶음(PR-S · PR-AUTH · PR-PERM)은 마지막 플랜이 끝난 뒤 ready → CI 전체 한 번 → 게이트 한 번(묶음 플랜 게이트 줄 합집합). 무인 PR은 플랜마다 ready → CI 한 번. 로컬에서 전체를 되풀이하지 않는다(CLAUDE.md §5)
- **Before `/gsd-verify-work`:** 28개 플랜의 PR(묶음 3 + 무인 · 화면)이 모두 main에 들어가고 마지막 main CI · 스테이징 배포 초록
- **Max feedback latency:** 300 seconds

---

## Per-Task Verification Map

요구사항 기준 시험 지도(07-RESEARCH.md). 태스크 ID는 플랜의 `<verify>`가 정본이다.

| Requirement | Behavior | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|------------|-----------------|-----------|-------------------|-------------|--------|
| EXP-11 | 지급 예정일 순수 함수: 60일 금요일·금요일 공휴일·월요일 휴일 직후·추석 주·짧은 거래처 기한·기준일 | — | N/A | unit | `pnpm exec vitest run --project unit test/unit/payments/pay-schedule.test.ts` | ❌ W0 | ⬜ pending |
| EXP-11 | 수동 지정(경영관리만, 영업일만, 되돌리면 자동) | V4 | 서버 `can()` 판정 | integration | `test/integration/payments/schedule-manual.test.ts` | ❌ | ⬜ pending |
| EXP-11 · D-705 | 공휴일 확정·삭제 전후 날짜 재파생 | — | N/A | integration | `test/integration/payments/holiday-rederive.test.ts` | ❌ | ⬜ pending |
| EXP-11 | 세금 기준일 = 유효 예정일(수동 ?? 자동) | — | N/A | unit | `test/unit/expenses/tax-basis-effective-date.test.ts` | ❌ | ⬜ pending |
| EXP-12 | 마감 경계(정각·1분 뒤)·마감일 휴일 앞당김·승인 전 제외 | — | N/A | unit | `test/unit/payments/pay-cutoff.test.ts` · `test/unit/rules/payment-cutoff.test.ts` | ❌ W0 | ⬜ pending |
| EXP-12 | 승인 시각 = 현재 차수 `max(acted_at)` | V11 | N/A | integration | `test/integration/payments/approved-at.test.ts` | ❌ | ⬜ pending |
| NOTI-03 | 규칙 병합(코드 기본값 ⊕ 덮어쓰기)·일수 범위·이메일 끔 | V5 | 일수 범위 서버 검증 | unit · integration | `test/unit/notify/rules.test.ts` · `test/integration/notify/rules-tick.test.ts` | ❌ W0 | ⬜ pending |
| NOTI-03 | 조건 종류별 evaluate + `createTestConditionKind` 호환 | V4 | 알림 링크는 보임 판정 뒤 | integration | `test/integration/notify/kinds-*.test.ts` | ❌ | ⬜ pending |
| NOTI-03 · D-716 | 사건 알림은 다음 영업일 9시 묶음에 한 번만 | — | N/A | integration | `test/integration/notify/events-window.test.ts` | ❌ | ⬜ pending |
| NOTI-03 | `/admin/notification-rules` 누수 스캔·메뉴 레지스트리 | V4 | 권한 없는 계급 404 | unit · integration | `test/unit/admin-menu-registry.test.ts` · `test/integration/leak-scan.test.ts` | ✅ 수정 | ⬜ pending |
| 기준 5 | `*Dto` 열거 ↔ `DTO_REGISTRY` 미매핑 0 (07-03 K31 — 런타임 대조) | V4 | N/A | integration · unit | `test/integration/leak-scan.test.ts`(런타임 `*Dto` ↔ `DTO_REGISTRY` 이름 대조 describe) · `test/unit/leak-scan-coverage.test.ts`(`registerDto(` 모듈이 누수 스캔 import에 있는지) | ✅ 수정 | ⬜ pending |
| 기준 5 | 행동 로그 불변·전후 값·마스킹 | V7 | DELETE/TRUNCATE 거부 | unit · integration | `test/integration/action-log-immutable.test.ts` | ❌ | ⬜ pending |
| 기준 5 · R5 (Round 1 · 체커 1회차 A4) | 권한표 칸 · 정보 노출표 칸 · 계급 만들기 · 이름 · 업무/보는 범위 저장의 `permission_change`가 `detail.changes` 전후 값(`[이전 또는 null, 이후]`)을 싣고 저장과 한 트랜잭션 — 기록 실패면 값도 그대로 · 상한 · 마지막 관리자 · SelfLockout 사례 그대로 녹색(07-26, PR-PERM) | V7 | 권한 변경 감사 기록 누락 · 갈라짐 없음 | integration | `test/integration/action-log-permission-changes.test.ts`(07-26) | ❌ W0 | ⬜ pending |
| 기준 5 · ADMN-10 | 계급 스모크(시드 계급 × 메뉴 노출/404, 대표 행동 로그 열림) | V4 | N/A | e2e | `CI=true pnpm playwright test --project=desktop test/e2e/role-smoke.spec.ts` | ❌ W0 | ⬜ pending |
| 기준 5 | 관리자 폼 8개·설정·`/account` 오류 표시(§6-3·§7-2) | — | N/A | e2e(독립 DOM 감사) | `CI=true pnpm playwright test --project=desktop-settings` | 부분 ✅ | ⬜ pending |
| D-723 | 로그인 IP 한도·잠금 설정 범위 | V2 | 계정별 잠금이 방어 | integration | `test/integration/auth/*.test.ts` | 부분 ✅ | ⬜ pending |
| C2 (Round 1) | PR-S 마이그레이션 저널 가드 — idx 연속 · tag 접두 · when 증가 · SQL · 스냅숏 짝 · 고아 없음, 번호를 다시 만든 뒤에도 초록(07-02 · 07-07 · 07-11 · 07-13 스키마 태스크) | — | N/A | unit | `pnpm exec vitest run --project unit test/unit/db/migration-journal.test.ts` | ✅ 있음 | ⬜ pending |
| EXP-11 · D-741 (Round 1) | 기한 안 지급 요일 없음 → 기한 안 마지막 영업일 · `"no-slot"` · 배지 없음 / 그날 마감 1분 넘긴 승인 → 다음 지급 가능 금요일 · `"cutoff"`(기한 넘어도) / 기한 끝 휴일 · 주말 → 앞 영업일 / 수동 지정 → 마감 면제(D-742) / `payWeekGroupLabel` 실제 요일 | — | N/A | unit | `pnpm exec vitest run --project unit test/unit/payments/pay-schedule.test.ts` | ❌ W0 | ⬜ pending |
| EXP-12 · D-731 (Round 1) | `payRuleLine` 네 꼴(기한 안 마지막 {요일}요일 · 기한 안 마지막 영업일 · 마감 넘겨 밀림 · `결재 마감 면제`) 단위 + SC-02 · SC-03 지급 예정일 값 바로 아래 한 줄 | — | N/A | unit · e2e | `pnpm exec vitest run --project unit test/unit/payments/pay-schedule.test.ts` · `CI=true pnpm playwright test test/e2e/payment-schedule.spec.ts` | ❌ W0 | ⬜ pending |
| J13 · N8 (Round 1 · 체커 1회차 A2 — 07-28) | 지출결의 `상세` — 임시 저장은 비어도 되고 제출 때 비면 `상세 · 입력`으로 거부(서버 `submitExpense`도 같은 판정) · 기존 제출 시험은 `상세`를 채워 단언 그대로 녹색(07-28, 07-16에서 뗌) | V5 | 서버 제출 검증 | unit · e2e | `pnpm exec vitest run --project unit test/unit/expenses/detail-required.test.ts` · `CI=true pnpm playwright test --project=desktop test/e2e/expense-detail-required.spec.ts` | ❌ W0 | ⬜ pending |
| R20 · EXP-11 (Round 1 · 체커 1회차 A4) | 비공개 증빙 종류(개인카드)로 올린 파일은 업로드 완료 때 `files.private_to_owner = true` — 뒤에 문서 종류를 공개로 바꿔도 목록 · 단건 열기 · 내려받기 · 결재 시트에서 올린 사람 · 전사 보는 범위만 봄, 공개 종류로 올린 파일은 false(07-27) | V4 | `files` 칸 숨김 — 서버 보임 판정(단건은 「없음」 응답) | integration | `test/integration/evidence/private-file-flag.test.ts`(07-27) | ❌ W0 | ⬜ pending |
| R13 · N10 (Round 1) | 관리자 폼 8개 + 설정 + `/account`에서 `ui/` 밖 `select` · `input`(checkbox · radio · hidden 제외) 0 — 제외: 필터 줄 select · 표 안 셀 입력. 폼별 맡는 플랜이 자기 몫을 실측, 07-25가 최종 0 단언 | — | N/A | e2e(독립 DOM 감사) | 07-25 최종 검수 DOM 실측(`CI=true`, 파일은 07-25가 정함) | ❌ | ⬜ pending |
| W4 · W5 · D-729 · D-730 · D-747 (Round 1) | 경영관리 예산 직접 수정(사유 필수 · 이력 `직접 수정` + 메모) · PO 감액은 예산 자동 반영 없음(증액만) · 원가율 첫 저장 → 진행 중 전부 첫 예산 줄 | V4 | `projects.budget` 쓰기 = 경영관리만, 서버 판정(D-722 표) | unit · integration · e2e | `pnpm exec vitest run --project unit test/unit/projects/budget.test.ts` · `test/integration/project-budget.test.ts` · `CI=true pnpm playwright test test/e2e/projects-budget.spec.ts` | ❌ | ⬜ pending |
| U1 · D-728 (Round 1) | 퇴직자 행에는 잠겨 있어도 `잠금 풀기`가 렌더되지 않고, 서버 `unlockPerson`도 퇴직자를 거부 | V4 | 서버 거부(UI 숨김과 무관) | integration · e2e | 07-17이 정한 통합 파일 · `CI=true pnpm playwright test test/e2e/people-unlock-reset.spec.ts` | ❌ | ⬜ pending |
| R1 · D-726 (Round 1) | PR 묶음 차이 검사 — 묶음 PR은 ready 전 `git diff --name-only origin/main`이 그 묶음 플랜 files_modified(+ `.planning/`)만, 무인 PR은 `git diff --name-only origin/main -- db/ domain/auth/ domain/permissions/`가 빈 출력 | V14 | 위험 경로가 세션 머지 PR에 섞이지 않음 | shell | `git diff --name-only origin/main -- db/ domain/auth/ domain/permissions/` (무인 PR: 빈 출력) | — | ⬜ pending |
| EXP-12 · R15 (Round 2 — 07-01 · 07-16) | 일정 계산 상한 가드 오류가 그 행만 `failed`(대체 예정일 = 수동 ?? 기한 · gate `예정일 계산 실패` · 머리글 `예정일 계산 실패`)이고 다른 행은 정상 — 목록 전체 500 없음 · 화면은 그 행 2행(폰 P2 맨 앞)에 danger 글자 | — | N/A | unit · grep | `pnpm exec vitest run --project unit test/unit/payments/pay-cutoff.test.ts`(「상한 가드 오류 행만 failed」) · 07-16 `grep -c "paymentScheduleFailed" "app/(app)/expenses/payment-targets-table.tsx"` | ❌ W0 | ⬜ pending |
| EXP-11 · R7 (Round 2 — 07-01 · 07-16) | W1 지급 목록 E2E는 예정일 값 · 순서만 — 배지 · 결재 중 · `합계 제외` 단언은 07-16이 처음 | — | N/A | grep | 07-01 `grep -cE "마감 지나 밀림\|수동 지정\|합계 제외" test/e2e/payment-schedule.spec.ts` == 0 · 07-16 `test/e2e/payment-move-this-week.spec.ts` >= 1 | ❌ | ⬜ pending |
| D-726 · R2 (Round 2 — 07-01 · 07-02 · 07-13) | PR-S 재생성 뒤 custom SQL 본문 보존 — `pnpm db:generate` 「No schema changes」 + 번호 접두사를 뗀 재생성 전후 SQL 본문 diff 빈 출력 | — | N/A | shell | `pnpm db:generate`(마지막 줄 `No schema changes`) · 재생성 전 보관본과 `db/migrations/*_phase7_*.sql` 본문 `diff` 빈 출력(PR-S ready 단계) | — | ⬜ pending |
| D-726 · R3 (Round 2 — 07-02) | 검증 마이그레이션 머리주석에 같은 Job 이유 · 잠금 상한 | — | N/A | grep | `grep -cE "statement_timeout\|같은 트랜잭션" db/migrations/*_phase7_payment_schedule_validate.sql` >= 2 | ❌ | ⬜ pending |
| 기준 5 · R4 (Round 2 — 07-13) | 끌 수 없는 행동 종류(UNPRUNABLE 여섯) 행에 정리 표시 UPDATE → P0001 · 표류 가드(마이그레이션 SQL ⊇ `UNPRUNABLE_ACTION_TYPES`) | V7 | DB 트리거가 앱 밖 UPDATE도 거부 | integration | `pnpm exec vitest run --project integration test/integration/schema/action-log-immutable.test.ts` | ❌ | ⬜ pending |
| NOTI-03 · R6 (Round 2 — 07-10) | 받는 계급 추가로 후보 대량 → tick당 insert ≤ batchMax(받는 사람 합 기준) · 나머지 다음 tick · 사람당 하루 메일 한 통 이하(동작 불변) | — | N/A | integration | `pnpm exec vitest run --project integration test/integration/notify/rules-merge.test.ts` | ❌ | ⬜ pending |
| NOTI-03 · R8 (Round 2 — 07-10) | 종류 평가가 tick 잠금 tx 위에서 읽음(`ctx.tx` pid = 잠금 pid) | — | N/A | integration | `pnpm exec vitest run --project integration test/integration/notify/event-window.test.ts` | ❌ | ⬜ pending |
| EXP-12 · R9 (Round 2 — 07-10) | 종류 하나가 던진 날 → `evaluation_failed` · 임박 알림 행은 생기고 메일 보류 → 같은 날 수동 재실행으로 풀림(보류 범위 불변) · `docs/OPERATIONS.md` 재실행 절차 | — | N/A | integration · grep | `pnpm exec vitest run --project integration test/integration/notify/pay-week-alert.test.ts` · `grep -c "notify.condition_failed" docs/OPERATIONS.md` >= 1 | ❌ | ⬜ pending |
| 기준 5 · ADMN-10 · R10 (Round 2 — 07-25 · 07-05) | `admin.action-log` view 있고 `action_log.detail` 꺼진 계급 → 404(500 아님) · 스모크 대표 행동 로그 = 07-05 카드 ⑧ 켬이면 200 + 행 1개 이상 / 끔이면 404 | V4 | 정보 항목 없으면 조회 거부 → 404 | e2e | `CI=true pnpm playwright test --project=desktop test/e2e/action-log.spec.ts test/e2e/role-smoke.spec.ts` | ✅ 수정 | ⬜ pending |
| U1 · D-728 · R11 (Round 2 — 07-17) | 퇴직 거부는 domain `unlockPerson` 안 — 퇴직 대상이면 `ForbiddenError` · 주입 `unlockAccount` 호출 0회 · 술어 `isRetiredOn` 하나를 `canUnlock` · 목록 `퇴직`이 공유 | V4 | 서버(domain) 거부 | unit | `pnpm exec vitest run --project unit test/unit/domain/people-unlock-retired.test.ts` | ❌ | ⬜ pending |
| NOTI-03 · R12 (Round 2 — 07-19) | 알림함 결재 차례 50행 · 5행 쿼리 수 같음(N+1 없음) · 50행 < 5000ms | — | N/A | integration | `pnpm exec vitest run --project integration test/integration/notify/inbox-links.test.ts` | ❌ | ⬜ pending |
| NOTI-03 · R13 (Round 2 — 07-22 · 07-23) | `CONDITION_KINDS` 순서 = SC-07 표 순서에서 등록된 것만(계좌 바뀜 = `quote-nudge` 뒤 · `orphan-evidence` 앞, 수금 지연 = 끝) | — | N/A | integration | `pnpm exec vitest run --project integration test/integration/notify/collection-overdue.test.ts test/integration/notify/vendor-account-changed.test.ts` | ❌ | ⬜ pending |
| SC-12 · U1 (Round 2 U — 07-17) | 결과 단계: 값이 선택된 채 첫 포커스 · Tab 값 → `복사` → `닫기` · Esc · 바깥 누름 · x 무시 · `닫기`로만 닫힘 · `복사` → `복사됨` / 실패 `복사 실패 · 직접 선택` | V3 | 일회성 값이 키 하나로 사라지지 않음 · 남지 않음 | e2e · grep | `CI=true pnpm playwright test --project=desktop test/e2e/people-unlock-reset.spec.ts`(`복사됨` · `Escape` 사례) · `grep -c '"resultValue"' ui/confirm-dialog/ConfirmDialog.tsx` >= 1 | ❌ | ⬜ pending |
| SC-11 · U2 · U6 (Round 2 U — 07-17) | `퇴직 > 잠김` · `잠김 N`/`?locked=1` 퇴직 제외 · 필터 중 풀기 → 행 빠짐 · N 감소 · 0이면 링크 사라짐 · `잠금 풀기` aria-busy · 두 번 눌러도 요청 한 번 | V4 | N/A | e2e | `CI=true pnpm playwright test --project=desktop test/e2e/people-unlock-reset.spec.ts` | ❌ | ⬜ pending |
| SC-04 · U3 (Round 2 U — 07-24) | 원가율 첫 저장(null → 값)만 결과 줄 `원가율 저장 · 예산 {N}건 생성` + 3차 `예산 현황`(`projects.budget` 보기 있을 때만) · 다음 저장은 결과 줄 없음 · 되돌리기 없음(Q1) | V4 | `예산 현황` 링크는 권한자만 | integration · e2e | 07-24 `saveCostRateSetting` `{ firstSave, createdCount }` 통합 사례 · 07-24 Task 3 E2E | ❌ | ⬜ pending |
| SC-21 · U16 (Round 2 U — 07-24) | 합계 줄 오른쪽 `계산 불가 N건` 배지 · 패널 1차 `예산 저장`은 `예산 바꾸기` 뒤에만 · 포커스 `예산` · Esc 두 단계 | — | N/A | e2e | 07-24 Task 3 E2E(예산 현황) | ❌ | ⬜ pending |
| SC-05 · SC-06 · U6 · U10 · U17 (Round 2 U — 07-19) | `켬` 체크박스 aria-busy · 요청 한 번 · 일수 aux `{min}~{max}`(`daysRange`, 글자 상수 0) · 알림함 묶음 `aria-expanded`/`aria-controls` · 포커스 버튼 유지 · 안 읽은 0이면 선 끔 · `더 보기` 뒤 펼친 채 · 폰 행 전체 링크 | — | N/A | e2e · grep | 07-19 E2E(rules · inbox · mobile-notify-inbox) · `grep -rc "1~30\|0~10" "app/(app)/admin/notification-rules"` 합 0 | ❌ | ⬜ pending |
| SC-19 · SC-22 · U4 · U14 · U16 (Round 2 U — 07-18) | 사유 코드 → 낱말 표(`취소된 줄` · `견적 외 비용` · `조정 줄` · `남은 실행가 없음`) · `수주 전`/`권한 없음` 글자 0(권한 없음은 숨김) · 접힌 줄 권한 없으면 `기간 · MM-DD~MM-DD` · 손익 `계산 불가` 배지 | V4 | 권한 없는 사유는 숨김 | e2e · grep | 07-18 Task 1 · 3 E2E · `grep -cE "수주 전\|권한 없음" "app/(app)/projects/[id]/quote-table.tsx"` = 0 | ❌ | ⬜ pending |
| SC-16 · SC-17 · U6 · U12 · U16 (Round 2 U — 07-20) | 패널 행동 줄 하단 고정 · FormAlert 위로 스크롤 + 포커스 · `파일 받기` aria-busy · 요청 한 번 · 실패 `파일 받기 실패 · 다시 시도` 버튼 아래(토스트 0) | — | N/A | e2e · grep | 07-20 Task 1 · 3 E2E(`vendors.spec.ts` · 내려받기) | ❌ | ⬜ pending |
| SC-17 · SC-18 · U6 · U11 · U12 · U16 (Round 2 U — 07-23) | 검색어 있으면 결과 끝에 항상 `새 거래처 · "{검색어}"` · 등록 실패 = 패널 유지 + 첫 오류 칸 포커스 · `취소 Esc` 고르기 창 재열림 없음 · 포커스 지급처 칸 · ⑨⑩ 소제목 · 담당자 Enter 다음 줄(제출 0) · `확인됨으로 표시` aria-busy · 요청 한 번 | — | N/A | e2e · grep | `CI=true pnpm playwright test --project=desktop test/e2e/vendor-work-register.spec.ts test/e2e/vendors.spec.ts` · `grep -c "preventDefault" "app/(app)/admin/vendors/vendor-contacts.tsx"` >= 1 | ❌ | ⬜ pending |
| SC-01 · SC-02 · SC-03 · U6 · U8 · U13 · U16 (Round 2 U — 07-16) | `이번 주로` 두 꼴 모두 `되돌리기` · 옮긴 행 선택 해제 · 막힌 행 선택 유지 + 제목 아래 오류 줄(`영업일이 아닌 날`) · `이번 주로` aria-busy · 요청 한 번 · SC-03 편집 중 1차 = `예정일 저장` 하나 · SC-02 계산 중 규칙 줄 `…` | — | N/A | e2e · grep | `CI=true pnpm playwright test --project=desktop test/e2e/payment-move-this-week.spec.ts test/e2e/payment-schedule.spec.ts test/e2e/expense-hope-date.spec.ts` · `grep -c "영업일이 아닌 날" "app/(app)/expenses/payment-targets-table.tsx"` >= 1 | ❌ | ⬜ pending |
| SC-10 · U5 · U6 (Round 2 U — 07-15 · 07-21) | 딸린 칸 결과 줄 `{메뉴} · 보기도 켬` / `{메뉴} · 쓰기·승인도 끔` + `되돌리기`(실제 바뀐 칸만) · 같은 칸 다시 누름 = 보통 켬/끔(숨은 원복 없음) · 칸 저장 중 aria-busy · 요청 한 번 | V4 | 되돌리기도 보통 칸 저장 경로(서버 가드 그대로) | integration · e2e | `pnpm exec vitest run --project integration test/integration/permissions-dependent.test.ts`(「되돌리기 재료」) · `CI=true pnpm playwright test test/e2e/permissions-grid.spec.ts` | ❌ | ⬜ pending |
| SC-09 · SC-13 · U16 (Round 2 U — 07-21) | 계급 · 조직 화면 LOADING 뼈대 · ERROR `불러오지 못했습니다 · 다시 시도` + `다시 시도` | — | N/A | grep · e2e | 07-21 Task 2 수락(라우트 `loading.tsx` · `error.tsx` 넷 · 문구 grep) | ❌ | ⬜ pending |
| SC-20 · U15 (Round 2 U — 07-22) | 상태 열 첫 줄 상태 낱말 · 둘째 줄 `종료일 지남` > `수금 지연` · 완료 프로젝트도 · 폰 375 같은 한 값이 P2 `종료일 지남` 자리 | — | N/A | e2e | `CI=true pnpm playwright test --project=desktop test/e2e/projects-list.spec.ts` · `CI=true pnpm playwright test --project=mobile-375 --no-deps test/e2e/mobile-projects-collection.spec.ts` | ❌ | ⬜ pending |
| SC-08 · U9 (Round 2 U — 07-25) | 폰 접힌 줄 첫 요소 = 상세 첫 줄(`상세` P2 맨 앞) | — | N/A | e2e | `CI=true pnpm playwright test --project=mobile-375 --no-deps test/e2e/mobile-action-log.spec.ts` | ❌ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/unit/payments/pay-schedule.test.ts` · `test/unit/payments/pay-cutoff.test.ts` — EXP-11·12 순수 함수(공휴일은 고정 Set 주입)
- [ ] `test/integration/leak-scan.test.ts` 런타임 `*Dto` ↔ `DTO_REGISTRY` 대조 describe · `test/unit/leak-scan-coverage.test.ts` `registerDto(` 모듈 로드 대조 — 미매핑 `*Dto` 0(07-03 K31, 기존 파일 보강)
- [ ] `test/unit/notify/rules.test.ts` — 규칙 병합
- [ ] `test/e2e/role-smoke.spec.ts` — 계급 스모크
- [ ] `test/integration/action-log-permission-changes.test.ts` — 권한 변경 `detail.changes` 전후 값 · 한 트랜잭션(07-26, 기준 5 · R5)
- [ ] `test/integration/evidence/private-file-flag.test.ts` — 개인카드 증빙 `files` 칸 숨김(07-27, R20 · 새 폴더)
- [ ] `test/unit/expenses/detail-required.test.ts` · `test/e2e/expense-detail-required.spec.ts` — `상세` 제출 필수(07-28, J13 · N8)

프레임워크 설치: 없음(모두 기존). C2 가드 `test/unit/db/migration-journal.test.ts`는 이미 있다(Wave 0 아님).

---

## 웨이브 · PR 묶음 (Round 1 — D-726 · D-727, 7웨이브 28플랜)

| 웨이브 | 플랜 | 검증 시점 |
|---|---|---|
| W1 | 07-01 · 07-02(PR-S) · 07-03 · 07-04 · 07-12 | 07-01 · 03 · 04 · 12는 플랜 끝에 각자 ready → CI → 세션 머지. 07-02는 PR-S draft를 연다 |
| W2 | 07-05(PR-PERM) · 07-06 · 07-07(PR-S) · 07-08 · 07-09(PR-AUTH) · 07-26(PR-PERM) | PR-AUTH = W2 끝에 ready → CI 한 번 → 사용자 머지. 07-08은 W2 끝 세션 머지 |
| W3 | 07-10 · 07-11(PR-S) · 07-15(PR-PERM) · 07-16 · 07-17 | PR-PERM = W3 끝(D-722 카드 답 뒤) ready → CI 한 번 → 사용자 머지. 07-17은 세션 머지(D-727) |
| W4 | 07-13(PR-S) · 07-14 · 07-18 · 07-20 · 07-21 · 07-27 · 07-28 | PR-S = W4 끝 ready → 직전 origin/main 반영 · 번호 겹치면 07-02 → 07 → 11 → 13 순 재생성 → `migration-journal.test.ts` 초록 → CI 한 번 → 사용자 머지. 07-21은 세션 머지(D-727). 07-28(07-16 뒤 같은 폼 파일 — 체커 1회차 A2)은 무인 화면 PR · C3 게이트 · 세션 머지 |
| W5 | 07-19 · 07-22 | 화면 PR마다 독립 DOM 감사(`CI=true`, 375 · 320 · 768 · 1280) → CI |
| W6 | 07-23 · 07-24 | 같음. 07-23 · 07-24는 `+ /cso` |
| W7 | 07-25 | 최종 검수(N10 0 단언 · 계급 스모크 · 누수 스캔) |

- 실행은 기다리지 않는다(아직 main에 없는 depends_on 브랜치를 머지 커밋으로 품고 일함). **머지는 기다린다** — depends_on 사슬 전부가 main에 들어간 뒤 그 PR을 ready로 바꾸고 CI를 한 번 돌린다. 그래서 웨이브 끝마다 전체 CI를 돌리지 않는다.
- 화면 PR 게이트 줄(C3): `/review` → `/design-review`(scripts/codex-design-review.sh, 375·320·768·1280, Codex 없으면 「Codex 디자인 검토 건너뜀: 사유」) → `/qa`. 결함 판정은 DOM 실측으로만(D-732).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 실제 SMTP로 아침 9시 묶음 메일 수신 | NOTI-03 | SMTP 실제 값은 사용자 설정 몫 | 스테이징 [테스트] 계정으로 규칙 켬 → 다음 영업일 9시 메일 확인 |
| D-722 계급 기본값 표 확인 | 기준 5 | 사용자 결정(카드 한 장) | 첫 검수 플랜이 초안 → 사용자 카드 확인 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 300s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

---

## Review Dispositions Ledger

### Round 1 — ee0899f

#### Review Feedback Addressed

| Concern | Severity | How Addressed |
|---|---|---|
| 07-VALIDATION에 「PR 묶음」 절 없음 · R1 · N8 · N10 행 판단 (L361@ee0899f) | 참고 | 「웨이브 · PR 묶음」 절(7웨이브 · 묶음 CI 한 번) · R1 · J13/N8 · R13/N10 행 |
| C2 마이그레이션 가드 (L132@ee0899f) | P2 | 표 행 + 표본 추출 「After every plan wave」에 명령 |
| D-741 no-slot 규칙 (L65@ee0899f) | 막 | EXP-11 · D-741 행(단위 사례 다섯) |
| D-731 규칙 줄 (L61@ee0899f) | 막 | EXP-12 · D-731 행(`payRuleLine` + E2E) |
| D-729 · D-730 예산 (L58-59@ee0899f) | 막 | W4 · W5 행(+ D-747) |
| D-728 퇴직자 잠금 풀기 (L57@ee0899f) | 막 | U1 · D-728 행 |
| C5 웨이브 8→7 (L135@ee0899f) | 참고 | 웨이브 표 7줄 |
| 묶음 사이 맞춤(공유 플래너, fb46980 뒤) — 기준 5 행 · Wave 0이 07-03이 없앤 `test/unit/dto-registry-coverage.test.ts`를 참조 (07-03 K31) | P2 | 07-03 경로로 바꿈 — `test/integration/leak-scan.test.ts` 런타임 대조 describe · `test/unit/leak-scan-coverage.test.ts`. 07-RESEARCH · 07-PATTERNS의 같은 참조는 조사 산출물이라 두고 계약에 「낡은 참조 — 07-03 경로가 정본」 |
| 체커 1회차 A4(경고) — Per-Task 지도에 07-26 `action-log-permission-changes` · 07-27 `private-file-flag` 행 없음 · W6 /cso에 07-23 빠짐 | 경고 | 기준 5 · R5 행(07-26) · R20 행(07-27) · Wave 0 목록 둘 · W6 행 「07-23 · 07-24는 `+ /cso`」 |
| 체커 1회차 A2(경고) — 07-16 Task 4(J13 · N8)를 새 07-28로 뗌 | 경고 | J13 행을 07-28 단위 · E2E 명령으로 · Wave 0 줄 · W4 행에 07-28(세션 머지) · 「28개 플랜」 · 「7웨이브 28플랜」 |

#### Review Feedback Deferred

| Concern | Reason |
|---|---|
| `nyquist_compliant` · Sign-Off 체크 | validate-phase가 실행 뒤 판정하는 칸 — 계획 단계에서 바꾸지 않음(status draft 유지) |
| 새 행의 정확한 파일 이름 일부(D-728 통합 · N10 최종 검수) | 그 플랜(07-17 · 07-25)의 묶음 플래너가 같은 시간에 정함 — 공유 플래너가 이름을 지어내지 않음. J13 단위는 체커 1회차 A2로 07-28이 정해 표에 넣음 |

### Round 2 — d9b427f

#### Review Feedback Addressed

| Concern | Severity | How Addressed |
|---|---|---|
| eng-review R2 · R3 · R4 · R6 · R7 · R8 · R9 · R10 · R11 · R12 · R13 · R15 — 새 시험 · 확인 명령 | 참고 | Per-Task 지도에 Round 2 행 열둘(R7 · R15 · R2 · R3 · R4 · R6 · R8 · R9 · R10 · R11 · R12 · R13) — 시험 파일 · 명령은 각 플랜 `<verify>` · 수락 기준과 같다 |
| R1 · R5 · R14 · C1~C3 | 참고 | 시험 없음(문서 · 절차 · 사실 정정) — 지도 행 없음. R1은 07-01 지도 · ROADMAP, R5는 07-01 머지 규칙 |
| design-review U1 · U2 · U3 · U4 · U5 · U6 · U8 · U9 · U10 · U11 · U12 · U13 · U14 · U15 · U16 · U17 — 새 E2E · 통합 · grep 단언 | 참고 | Per-Task 지도에 「Round 2 U」 행 열셋(07-15 · 16 · 17 · 18 · 19 · 20 · 21 · 22 · 23 · 24 · 25). U7(결과 줄 유지 시점)은 문구만 — 시간 경과 단언은 일부러 두지 않음(과단언). U18(맡는 플랜 줄)은 UI-SPEC 문서뿐 — 지도 행 없음 |
