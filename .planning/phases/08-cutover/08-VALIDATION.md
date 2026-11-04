---
phase: "8"
slug: "cutover"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-04"
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> 근거: `08-RESEARCH.md` §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest(projects `unit`·`integration`) + Playwright E2E |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `pnpm exec vitest run --project unit <파일>` |
| **Full suite command** | CI(ready PR). 로컬 통합: `flock /tmp/plant8-erp-test.lock sh -c 'pnpm db:dev && pnpm db:reset:test && pnpm exec vitest run --project integration <파일>'` |
| **Estimated runtime** | ~60 seconds (단위), 통합 파일당 ~120 seconds |

---

## Sampling Rate

- **After every task commit:** `pnpm typecheck` + 바뀐 파일의 `pnpm exec vitest run --project unit …`
- **After every plan wave:** 관련 통합 시험(위 flock 명령), `pnpm lint` · `pnpm lint:sql`
- **Before `/gsd-verify-work`:** CI 초록 + 체크리스트 「확인 증거」 칸(운영 승격·프로덕션 리허설·실제 전환)
- **Max feedback latency:** 180 seconds

---

## Per-Task Verification Map

플랜 작성 뒤 플래너·체커가 태스크 id로 채운다. 요구사항별 기본 지도:

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-01-T1 | 08-01 | 1 | MIG-04/MIG-05 | 운영 DB 반쯤 바뀜 | 9/18 뼈대 → 남은 마이그레이션 한 번 · 실패 시 한 칸도 안 바뀜 | integration | `… vitest run --project integration test/integration/migration-first-promotion.test.ts` | ❌ W0 | ⬜ pending |
| 08-01-T1 | 08-01 | 1 | OPS-03 | — | CEO-3 직원 입력 표 12개 requireRows false | unit | `pnpm exec vitest run --project unit test/unit/ops/restore-check-tables.test.ts` | ✅ 확장 | ⬜ pending |
| 08-01-T1~T3 | 08-01 | 1 | 문서 | — | `docs/CUTOVER.md` 200줄 · 절 순서 · §3 순서 · 필수 단어(정산 결재선 3단 포함), OPERATIONS 300줄 | unit | `pnpm exec vitest run --project unit test/unit/docs-limits.test.ts` | ✅ 확장 | ⬜ pending |
| 08-02-T1 · T3 | 08-02 | 1 | MIG-05 | 잘못된 환경 대상 삭제 · 재실행 | 업무 표 0행 · 유지 표 · `action_log` 불변(+1) · 재실행 · 건수 변경 · 낡은 백업 거부 | integration | `… vitest run --project integration test/integration/cutover-demo-delete.test.ts` | ❌ W0 | ⬜ pending |
| 08-02-T2 | 08-02 | 1 | MIG-05 | — | 모든 스키마 표가 삭제/유지/초기화/불변으로 분류 · FK 순서 · source 표 ⊂ 삭제(새 표 누락 시 실패) | integration | `… vitest run --project integration test/integration/cutover-tables.test.ts` | ❌ W0 | ⬜ pending |
| 08-02-T1 | 08-02 | 1 | MIG-05 | 실수 재실행 · 인자 주입 | dry-run 기본 · `--apply --confirm` 꼴 · 등호 결합 · 모르는 플래그 거부 | unit | `pnpm exec vitest run --project unit test/unit/cutover/parse-args.test.ts` | ❌ W0 | ⬜ pending |
| 08-02-T2 | 08-02 | 1 | MIG-05/D8-05 | — | 쓰기 지점 12곳이 rowSource를 따름(전 demo · 뒤 live) | unit + integration | `pnpm exec vitest run --project unit test/unit/cutover/source-writers.test.ts` + cutover-demo-delete | ❌ W0 | ⬜ pending |
| 08-02-T1 | 08-02 | 1 | D8-09 | — | cert 제외 카운터 초기화(사용자 카드 2026-11-04 13:38 KST) · 첫 번호 `<yy>001` · 첫 순번 1 | integration | cutover-demo-delete + `test/integration/document-counters.test.ts` | ❌ W0 | ⬜ pending |
| 08-02-T3 | 08-02 | 1 | MIG-05/C7 | 증빙 객체 고아 | 보류 해제 → 삭제 · 실패 키 고아 목록 | unit + integration | `pnpm exec vitest run --project unit test/unit/lib/gcp/storage-gcs.test.ts test/unit/lib/gcp/storage-local.test.ts` + cutover-demo-delete | ✅ 확장 | ⬜ pending |
| 08-03-T1 | 08-03 | 2 | MIG-05/C4 | 표시 지움 → demo 복귀 | readOnly 키 저장 거부 · 「전환 시각」 글자 표시 | unit + e2e | `pnpm exec vitest run --project unit test/unit/settings/registry.test.ts test/unit/settings/read-only-value.test.ts` + `CI=true pnpm playwright test test/e2e/settings.spec.ts` | ❌ W0 | ⬜ pending |
| 08-03-T2 | 08-03 | 2 | MIG-05/C4 | 가져오기로 표시 덮음 | 내보내기 제외 · 가져오기 거부 · 시드 행 없음 | integration | `… vitest run --project integration test/integration/settings.test.ts test/integration/settings-export.test.ts` | ✅ 확장 | ⬜ pending |
| 08-04-T1 · T2 | 08-04 | 2 | MIG-05 | 입력 주입 · 잘못된 환경 | 워크플로 main 가드 · 확인 입력 · env 경유 · 그룹 deploy · 요약 · Job 줄 | unit | `pnpm exec vitest run --project unit test/unit/deploy` | ❌ W0 | ⬜ pending |
| 08-05-T1 · T3 | 08-05 | 2 | (운영 배포) | 운영 덮어쓰기 | 선행 조건 · 수동 백업 · production 승격 성공 | gh 읽기 | 08-05 Task 1 · 3 `<automated>` | — | ⬜ pending |
| 08-06-T2 | 08-06 | 3 | OPS-03 | 운영 덮어쓰기 | 프로덕션 리허설 성공(로그 `INPUT_ENV: production`) | gh 읽기 + 기존 unit | 08-06 Task 2 `<automated>` · `test/unit/deploy/restore-rehearsal-workflow.test.ts` | ✅ | ⬜ pending |
| 08-06-T3 | 08-06 | 3 | MIG-04 | — | 로그인 상태 배지 · 정산 결재선 3단 + 본부 책임자 1명 | manual + 기존 integration | `… test/integration/people-login-status.test.ts` | ✅ | ⬜ pending |
| 08-09-T1 · T2 | 08-09 | 3 | MIG-05 | 권한 우회 · 운영 덮어쓰기 | 리허설 전용 SA · 임시 인스턴스만 조건부 cloudsql.admin · restore Job만 실행 · 재실행 멱등(`--condition`) · WIF main ref(새로 · 이미 있음 같은 조건) · 워크플로 SA 이름 대조 | unit | `pnpm exec vitest run --project unit test/unit/deploy` | ✅ 확장 | ⬜ pending |
| 08-09-T3 | 08-09 | 3 | MIG-05 | 권한 우회 | 스테이징 리허설이 gha-rehearsal로 성공 · main 밖 ref 인증 거부 | gh 읽기 | 08-09 Task 3 `<automated>` | — | ⬜ pending |
| 08-07-T1 · T3 | 08-07 | 4 | MIG-05 | 선행 조건 미충족 · 잘못된 환경 | 선행 조건 기계 게이트(07.2 · 07.3 SUMMARY · 07.4 · 07.5 · 07.6 VERIFICATION · #109) · 운영 apply 성공(env · mode 로그) | gh 읽기 | 08-07 Task 1 · 3 `<automated>` | — | ⬜ pending |
| 08-08-T1 · T2 · T3 | 08-08 | 5 | MIG-04/MIG-05 | — | 전환 뒤 dry-run demo 0 · 첫 번호 · 2주 뒤 리허설 | gh 읽기 | 08-08 Task 1 · 2 · 3 `<automated>` | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/integration/cutover-demo-delete.test.ts` — 삭제 + 카운터 + 마커 + `source` 쓰기 (모델 `test/integration/demo-data.test.ts`) · `test/integration/cutover-tables.test.ts` — 분류 완전성 · FK 순서 (08-02)
- [ ] `test/integration/migration-first-promotion.test.ts` — 9/18 뼈대 → 전체 마이그레이션 · 원자성 (08-01)
- [ ] `test/unit/settings/read-only-value.test.ts` — 읽기 전용 칸 글자 (08-03)
- [ ] `test/unit/cutover/*` — 인자 파싱·dry-run/apply 분기·확인 불일치 거부
- [ ] `test/unit/deploy/cutover-workflow.test.ts` — 정적 워크플로 검사 (모델 `restore-rehearsal-workflow.test.ts`)
- [ ] `test/unit/docs-limits.test.ts` 확장 — `docs/CUTOVER.md`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 운영 첫 승격·재승격 성공 | (운영 배포) | GCP·Actions 실제 실행 | `deploy.yml` 실행 기록 링크와 `/api/health`를 체크리스트 증거 칸에 |
| 프로덕션 대상 복원 리허설 성공 | OPS-03 / 기준 5 | 운영 인스턴스 대상 | 상태 화면 「복원 리허설」 행 일시·성공 |
| 마스터 손 입력·전 직원 계정 발급 | MIG-04/MIG-05 기준 1·2 | 사람 입력 | 사람 목록 배지·관리 화면 건수 |
| 리허설 전용 SA · WIF main ref 조건 적용(CEO-5) | MIG-05 | 소유자 Cloud Shell IAM 변경 | 08-09 Task 3 — 증거 세 줄 · 스테이징 리허설 링크 · main 밖 ref 거부 실행 링크 |
| 전환일 실행(demo 삭제 apply·공지) | MIG-05 기준 3·4 | 되돌릴 수 없는 운영 작업 | 체크리스트 순서대로, dry-run 건수 기록 뒤 apply |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
