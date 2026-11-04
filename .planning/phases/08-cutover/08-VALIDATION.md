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
| 08-03-T1 | 08-03(카드 대기 D3 — A: 행 삭제 / B: 그대로) | 2 | MIG-05/C4 | 표시 지움 → demo 복귀 · 못 읽은 값을 「전환 전」으로 보임 | readOnly 키 저장 거부 · 「전환 시각」 KvList 한 줄 · 읽기 실패 「확인 불가」(B2) · `isCutOver` 한 판정(F4) | unit + e2e | `pnpm exec vitest run --project unit test/unit/settings/registry.test.ts test/unit/settings/read-only-value.test.ts` + `CI=true pnpm playwright test test/e2e/settings.spec.ts` | ❌ W0 | ⬜ pending |
| 08-03-T2 | 08-03(카드 대기 D3 — A: 행 삭제 / B: 그대로) | 2 | MIG-05/C4 | 가져오기로 표시 덮음 | 내보내기 제외 · 가져오기 거부 · 시드 행 없음 · rowSource 판정 변경 뒤 전환 · 동시성 시험 그대로 | integration | `… vitest run --project integration test/integration/settings.test.ts test/integration/settings-export.test.ts test/integration/cutover-demo-delete.test.ts test/integration/cutover-concurrency.test.ts` | ✅ 확장 | ⬜ pending |
| 08-04-T1 · T2 | 08-04 | 2 | MIG-05 | 입력 주입 · 잘못된 환경 · 늦은 로그에 apply 재실행 | 워크플로 main 가드 · 확인 입력 · env 경유 · 그룹 deploy · 요약(거부 줄 원인 · 다음 행동 · 늦은 로그 경고 F10 · 서울 분 단위 F12 · 「전환됨」 갈래) · Job 줄 | unit | `pnpm exec vitest run --project unit test/unit/deploy` | ❌ W0 | ⬜ pending |
| 08-05-T1 · T3 | 08-05 | 2 | (운영 배포) | 운영 덮어쓰기 | 선행 조건 · 수동 백업 · production 승격 성공 | gh 읽기 | 08-05 Task 1 · 3 `<automated>` | — | ⬜ pending |
| 08-06-T2 | 08-06 | 3 | OPS-03 | 운영 덮어쓰기 | 프로덕션 리허설 성공(로그 `INPUT_ENV: production`) | gh 읽기 + 기존 unit | 08-06 Task 2 `<automated>` · `test/unit/deploy/restore-rehearsal-workflow.test.ts` | ✅ | ⬜ pending |
| 08-06-T3 | 08-06 | 3 | MIG-04 | — | 로그인 상태 배지 · 정산 결재선 3단 + 본부 책임자 1명 | manual + 기존 integration | `… test/integration/people-login-status.test.ts` | ✅ | ⬜ pending |
| 08-09-T1 · T2 | 08-09 | 3 | MIG-05 | 권한 우회 · 운영 덮어쓰기 | 리허설 전용 SA · 임시 인스턴스만 조건부 cloudsql.admin · restore Job만 실행 · 재실행 멱등(`--condition`) · WIF main ref(새로 · 이미 있음 같은 조건) · 워크플로 SA 이름 대조 | unit | `pnpm exec vitest run --project unit test/unit/deploy` | ✅ 확장 | ⬜ pending |
| 08-09-T3 | 08-09 | 3 | MIG-05 | 권한 우회 | 스테이징 리허설이 gha-rehearsal로 성공 · main 밖 ref 인증 거부 | gh 읽기 | 08-09 Task 3 `<automated>` | — | ⬜ pending |
| 08-07-T1 · T3 | 08-07 | 4 | MIG-05 | 선행 조건 미충족 · 잘못된 환경 | 선행 조건 기계 게이트(07.2 · 07.3 SUMMARY · 07.4 · 07.5 · 07.6 VERIFICATION · #109 · 카드 대기 D3 갈래 — B: `CUTOVER_AT` 있음 / A: 없음 + cutover.yml 「전환됨」) · 운영 apply 성공(env · mode 로그) | gh 읽기 | 08-07 Task 1 · 3 `<automated>` | — | ⬜ pending |
| 08-08-T1 · T2 · T3 | 08-08 | 5 | MIG-04/MIG-05 | — | 전환 뒤 dry-run demo 0 · 첫 번호 · 2주 뒤 리허설 | gh 읽기 | 08-08 Task 1 · 2 · 3 `<automated>` | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/integration/cutover-demo-delete.test.ts` — 삭제 + 카운터 + 마커 + `source` 쓰기 (모델 `test/integration/demo-data.test.ts`) · `test/integration/cutover-tables.test.ts` — 분류 완전성 · FK 순서 (08-02)
- [ ] `test/integration/migration-first-promotion.test.ts` — 9/18 뼈대 → 전체 마이그레이션 · 원자성 (08-01)
- [ ] `test/unit/settings/read-only-value.test.ts` — 읽기 전용 칸 값 · 읽기 실패 「확인 불가」 (08-03 · 카드 대기 D3 — A: 항목 삭제 / B: 그대로)
- [ ] `test/unit/cutover/*` — 인자 파싱·dry-run/apply 분기·확인 불일치 거부
- [ ] `test/unit/deploy/cutover-workflow.test.ts` — 정적 워크플로 검사 (모델 `restore-rehearsal-workflow.test.ts`)
- [ ] `test/unit/docs-limits.test.ts` 확장 — `docs/CUTOVER.md`

---

## D3 두 갈래 (카드 대기 D3 — CEO 검토 2026-11-04 · 디자인 검토 1회차 2026-11-04 (B3))

카드 D3 「설정 화면 「전환 시각」 표시(플랜 08-03)를 뺄까요?」는 답 대기다 — 계획은 어느 답에도 맞게 두 갈래를 같은 꼴로 적는다: `(카드 대기 D3 — A: … / B: …)`.

- **판정(한 곳):** origin/main에 `.planning/phases/08-cutover/08-03-PLAN.md`가 있으면 **B**(08-03 범위 안 · 답이 오기 전에도 이쪽 — 게이트가 답 없이 08-03을 건너뛰지 않는다), 없으면 **A**. 기계 확인은 08-07 Task 1 verify(B: keys.ts에 `CUTOVER_AT` 있음 / A: `CUTOVER_AT` 없음 + cutover.yml에 「전환됨」 요약 갈래).
- **A = 08-03 빼기:** 키는 끝까지 미등록(화면 · 가져오기 · 내보내기 길이 처음부터 없다) · 전환 확인 면은 cutover.yml 전환 뒤 dry-run 요약 「전환됨 <시각> · demo 남은 행 0」(08-04) 하나.
- **B = 그대로:** 08-03이 키 등록 + 가드 + 설정 화면 `/admin/settings?group=전환` 읽기 전용 칸 · 런북 §4에 설정 화면 확인 줄 · 08-08 (b)가 그 칸을 대조.

| 플랜 | 자리 | A | B |
|---|---|---|---|
| 08-01 | 인터페이스 계약 「전환 표시」 · Task 2 (c′) · Task 3 ④ §4 | 확인 면 = 요약 하나 · (c′) 08-02 · 08-04 · §4 설정 화면 줄 없음 | + 08-03 · §4에 설정 화면 확인 줄 |
| 08-02 | 머리 주석 · 산출물 표 | 키 미등록 | 08-03이 등록 · rowSource 판정을 isCutOver로(F4) |
| 08-03 | 플랜 전체 | 파일 삭제 | 실행 |
| 08-05 · 08-06 | 시작 조건 · 재승격 (0) | 08-02 · 08-04 | + 08-03 |
| 08-07 | depends_on 주석 · truths · 시작 조건 · Task 1 (다) · verify · 사람 확인 | depends_on에서 08-03 삭제 · `CUTOVER_AT` 없음 + 「전환됨」 | 그대로 · `CUTOVER_AT` 있음 |
| 08-08 | truths · Task 1 장부 (b) · Task 2 (b) · 확인 · 성공 기준 | (b) 「해당 없음 · (a)로 갈음」 | (b) 설정 화면 「전환 시각」 = (a) 시각 |
| 08-VALIDATION | 08-03-T1 · T2 행 · Wave 0 read-only-value | 행 · 항목 삭제 | 그대로 |

**답 반영 순서(계획 수정 세션 — 한쪽만 남긴다):**
- A면: ① `08-03-PLAN.md` 삭제 ② 08-07 depends_on에서 `"08-03"` 삭제(같은 커밋) ③ 위 표의 「카드 대기 D3 — A: … / B: …」 문장을 A 글자만 남기고 표시를 지운다 ④ 08-02 Task 시험에 「`SETTING_DEFS`에 `cutover.at` 없음」 단언 한 줄을 더한다(CEO 검토 2026-11-04 T11) ⑤ 08-01이 B로 런북을 이미 머지했으면 `docs/CUTOVER.md` §4의 설정 화면 확인 줄을 지우는 quick 한 건(08-07 시작 전).
- B면: 위 표의 문장을 B 글자만 남기고 표시를 지운다(파일 · depends_on 그대로).

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
