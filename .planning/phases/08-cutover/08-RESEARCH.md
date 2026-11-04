# Phase 8: 전환 (cutover) - Research

**Researched:** 2026-11-04 (main `34cc9d3`, 브랜치 `claude/project-thread-00p3x5` = origin/main)
**Domain:** 운영 절차(체크리스트·승격) + 코드 세 가지(demo 행 삭제 워크플로, 전환 표시, 번호 카운터 초기화). 로그인 상태 표시·복원 리허설은 04.4가 이미 main에 넣었다.
**Confidence:** HIGH(코드·스키마·워크플로 읽음) / LOW(운영 GCP·GitHub Actions 기록 — 확인 못 함)

> 표기: `[VERIFIED: 경로:줄]` = 이번 세션에서 파일을 열어 읽음(값은 옆에 원문 인용). `[CITED: …]` = 다른 문서가 말한 것을 옮김. `[ASSUMED]`/`추정` = 확인 안 한 짐작. 「확인 못 함」 = 저장소 밖 상태(GitHub Actions 기록·GCP·운영 DB)라 볼 수 없었고, 계획이 확인 단계를 가져야 한다.

<user_constraints>
## User Constraints (from 08-CONTEXT.md)

### Locked Decisions
- **D8-01:** 전환일은 준비가 끝난 뒤 다음 달 첫 영업일. 준비 완료 = 마스터 입력·전 직원 계정 발급·복원 리허설 1회 성공. 영업일 판정은 Phase 7 공휴일 표(관리자가 체크리스트에서 날짜를 정하는 운영 규칙, 코드 판정 없음).
- **D8-02:** 전환일에 진행 중인 프로젝트는 새 시스템에 다시 등록(견적 줄 포함)하고 전환일 이후 지출만 올린다. 재등록은 **demo 삭제(D8-05) 직후** PM이 한다. 예외 경로·새 칸을 만들지 않는다.
- **D8-03:** 인트라넷에서 결재·지급 대기 중인 지출결의는 전환 전날까지 인트라넷에서 끝낸다. 체크리스트에 「인트라넷 결재 마감 공지」(전환 N영업일 전).
- **D8-04:** 인트라넷은 기술적으로 막지 않고 공지로만 입력 금지. ROADMAP 기준 3·4와 MIG-05 문구를 계획 단계에서 맞춘다.
- **D8-05:** demo 행 삭제는 GitHub Actions 워크플로(`account.yml` 패턴: `workflow_dispatch` → 같은 이미지의 Cloud Run Job, WIF). 두 단계(표별 건수 dry-run → 확인 입력 후 실제 삭제). 관리자 화면 버튼 없음. 같은 실행·같은 트랜잭션에서 이후 입력이 demo로 찍히지 않게 바꾸고 전환 시각을 저장한다(앱이 `source: input.source ?? "demo"`로 직접 쓰므로 컬럼 기본값 마이그레이션만으로는 부족). 대상은 `source` 컬럼이 있는 모든 업무 기록 표. 설정·규칙 성격 행은 대상 아님. 계획 단계에서 그때의 스키마로 목록을 이름으로 확정하고, 새 업무 표가 `source`를 빠뜨리면 실패하는 검사를 둔다. 리저브 기초 잔액처럼 실제 값은 demo 삭제 뒤에 넣는다. — one-way.
- **D8-06:** 연습용 가짜 마스터는 관리자가 기존 보관함으로 치운다(마스터에 demo 표시 없음). demo 삭제 **뒤에** 둔다.
- **D8-07(운영 규칙 부분):** 안 바꾼 사람이 있어도 전환하고, 그 사람은 전환 뒤 기존 재발급 경로로 다시 발급. ROADMAP 기준 2 문구를 계획 단계에서 맞춘다. (표시는 04.4가 만듦)
- **D8-08(04.4로 이동):** 복원 리허설 = WIF 워크플로가 임시 인스턴스에 복원·확인·삭제·기록. 운영 인스턴스와 같은 이름이면 거부. 전환 전 1회 필수.
- **D8-09:** 전환 뒤 첫 프로젝트 번호는 26001부터 다시. demo 삭제 워크플로가 같은 실행에서 `document_counters`를 처음으로 되돌린다. — one-way.
- 이미 확정된 입력: 데이터 이전 없음·가져오기 스크립트·전환용 새 화면 없음(MIG-05), 인트라넷 비밀번호는 어떤 형태로도 안 들어옴(MIG-04), 초기 비밀번호 변경 강제 없음(Phase 1 D-08), 자동 백업 켜짐(D-06), 프로젝트 번호 재사용 금지(Phase 4 D-42, D8-09만 예외).

### Claude's Discretion
- 전환 표시·전환 시각 저장 형태(설정 키 대 전용 행) — 「같은 트랜잭션」과 「앱이 쓰는 source 값이 따른다」만 지키면 됨
- demo 행을 가리키는 행동 로그를 지울지 남길지
- 「첫 로그인 전」 기록 칸의 형태(→ 04.4가 `users.first_login_at`로 이미 해결)
- 복원 리허설 결과 기록 위치(→ 04.4가 `restore_rehearsals` 표로 이미 해결)
- 인트라넷 결재 마감 공지 N영업일(기본 제안 3영업일)과 직원 공지 문안
- 체크리스트의 정확한 순서(기본 제안: 마스터 입력 확인 → 전 직원 계정 발급·로그인 상태 확인 → 복원 리허설 결과 확인 → 인트라넷 결재 마감 공지 → (전환일) 최신 백업 확인 → demo 삭제 + 카운터 초기화 → 연습용 마스터 보관 → 진행 중 프로젝트 재등록 → 인트라넷 입력 금지 공지·직원 공지)

### Deferred Ideas (OUT OF SCOPE)
- 재등록 프로젝트의 손익에서 전환 전 지출이 빠진 것의 표시 — Phase 9 소관(Phase 9는 2026-11-04 만들지 않기로 함)
- 인트라넷 쓰기 기술 차단
- 정기(분기 등) 복원 리허설 일정
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MIG-04 | 인트라넷 비밀번호는 가져오지 않고 직원 계정을 새로 발급 | §5: 발급(`/admin/people` 등록 폼)·재발급(`account.yml reset`)·상태 배지가 main에 모두 있음. 남은 일은 전환 때 실제 발급 순서·확인 절차(문서) |
| MIG-05 | 연중 전환, 마스터 손 입력, demo 삭제, 인트라넷 조회 전용(공지) | §4(demo 삭제: 스키마 현황·함정), §6(마스터 화면 전수), §2(체크리스트), §8(되돌릴 수 없는 일) |
| OPS-03 | (04.4로 이동, Complete) | §3: 워크플로·문서·상태 화면 모두 main에 있음. 이 페이즈는 **프로덕션 대상 1회 성공 기록**만 게이트로 확인 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- `.planning/` 수동 편집 금지(`gsd_run`으로), `git push --force`·프로덕션 DB 직접 명령 금지 (§2). 세션은 gcloud로 운영 변경을 직접 하지 않는다(OPERATIONS §7, 04.4 RESTORE.md §3 「세션(에이전트)은 하지 않는다」).
- 위험 경로 PR은 사용자가 GitHub에서 머지: `db/migrations/`·`db/schema/`·`domain/auth/`·`domain/permissions/`·`lib/crypto*`·`scripts/deploy.sh`·`rollback.sh`·`bootstrap-gcp.sh`·`promote-guard.sh`·`.github/workflows/`·`infra/`·`.claude/`·CLAUDE.md (§4 머지). **이 페이즈의 코드 산출물(새 워크플로·새 Cloud Run Job 배포 줄·스키마/마이그레이션)은 거의 전부 위험 경로** → 위험 경로 변경은 별도 PR로 떼어 나머지(문서)가 무인으로 흐르게 한다.
- 돈·결재 게이트: `domain/`의 `money`·`corp-cards`·`reserves`·`revenue`·`approvals`, `repositories/`의 `corp-cards`·`approvals`·`reserve-entries`·`revenue-entries`를 건드리면 `/review` + `/cso`. demo 삭제 도구가 `repositories/*`를 새로 쓰면 해당. `source` 쓰기 지점을 바꾸는 변경(§4)이 `repositories/revenue-entries.ts`를 건드린다.
- 문서·계획만(`*.md`)이면 게이트 없음. 화면 영향(`app/*.tsx`)이 생기면 `/design-review`+`/qa`. 이 페이즈는 화면을 만들지 않는 것이 목표(MIG-05: 전환용 새 입력 화면 금지, D8-05: 관리자 화면 버튼 없음).
- TDD, 새 의존성 금지(승인 필요), `any` 금지, 요청받지 않은 리팩터 금지. 테스트 단계: 작업 중에는 lint·typecheck + 관련 단위·통합만, 전체는 CI.
- 응답·산출물은 짧게. 웹은 `/browse`만. Codex는 디자인 검토에서만.
- **`docs/OPERATIONS.md`는 정확히 300줄이고 300줄 상한이 테스트로 고정**돼 있다(§2 참조).

## Summary

**전환의 코드 일은 작고 위험하다.** 운영 절차 문서(체크리스트)와 코드 세 가지 중, 04.4가 둘(복원 리허설·로그인 상태 표시)을 이미 main에 넣었다 `[VERIFIED: .github/workflows/restore-rehearsal.yml:1-83, app/(app)/admin/people/person-status.ts:8, db/migrations/0019_restore_rehearsal_login_status.sql:21]`. 남는 코드는 **demo 행 삭제 워크플로 + 전환 표시 + 카운터 초기화** 하나의 묶음이다. 그런데 CONTEXT D8-05의 전제(「`source` 컬럼이 있는 모든 업무 기록 표」)가 현재 스키마와 맞지 않는다: **`source` 컬럼은 업무 표 9개에만 있고, 지출결의(`expenses`)·결재(`approval_*`)·연차 신청(`leave_requests`)·프로젝트 참여자·예산·정산 결재·파일·알림에는 없다** `[VERIFIED: §4 표]`. `source`만 보고 지우면 프로젝트·견적·매출·리저브·카드 사용·구매 요청·지급 줄만 사라지고 **지출결의·결재·파일은 남아** FK(`expenses.project_id → projects.id`, 삭제 규칙 없음)에 막혀 삭제 자체가 실패한다. 게다가 `source`를 새로 쓰는 코드는 4곳뿐이고 나머지 5표는 DB 기본값 `'demo'`에 의존한다. 즉 **지금 코드는 전환 뒤에도 모든 새 행에 `'demo'`를 찍는다** — 전환 표시를 읽도록 쓰기 지점(4곳)과 DB 기본값(5표)을 모두 바꿔야 한다.

**운영(prod)은 9/18 뼈대 상태이고 첫 승격이 큰 일방통행 문이다.** 승격 가드는 「스테이징이 지금 서빙 중인 SHA만」 승격한다 `[VERIFIED: scripts/promote-guard.sh:5-6]`. 승격 시 migrate Job이 **운영 DB에 마이그레이션 최대 49개 파일(0000~0048)을 한 트랜잭션으로** 적용한다(운영 DB의 현재 위치는 확인 못 함 — Phase 1 뼈대라 앞 몇 개 추정). 가드 있는 마이그레이션(0009·0012·0015·0030·0036, `RAISE EXCEPTION`)이 운영 데이터를 보고 멈출 수 있다 `[VERIFIED: grep -l "RAISE EXCEPTION" db/migrations]`. 이 뒤에는 **옛 리비전으로의 롤백이 막힌다**(스키마 하한 0012·0015·0021·0036 `[VERIFIED: grep rollback-floor]`). 또한 `bootstrap-gcp.sh`에 9/18 이후 추가된 것(스케줄러 SA·purge-sched SA·서명/증빙 버킷·`cloudscheduler.admin`)을 **소유자가 운영 프로젝트에서 다시 실행했는지 확인 못 함** — 안 했다면 `deploy.sh`가 `ensure_cert_bucket`에서 중단한다.

**프로덕션 복원 리허설은 첫 승격 뒤에야 가능하다.** `restore-rehearsal.yml`은 `production`을 받지만(입력 `confirm_production: plant8-prod-db`) 부르는 Cloud Run Job `plant8-prod-restore`와 기록 표 `restore_rehearsals`는 04.4 이후 배포·마이그레이션에서만 생긴다 → **승격 → 프로덕션 리허설 → (전환 최소 1주 전)** 순서가 강제된다.

**Primary recommendation:** (1) 첫 프로덕션 승격을 전환 준비의 **맨 앞 이정표**로 당긴다(운영에 업무 데이터가 거의 없을 때 마이그레이션·Job·스케줄러·버킷 문제를 먼저 발견) — 전환 직전에 재승격은 델타만. (2) demo 삭제는 `source` 컬럼 기반이 아니라 **코드에 이름으로 박은 표 분류(삭제/유지/설정)** + 모든 스키마 표가 분류에 들어 있는지 보는 가드 테스트로 설계한다(`source` 전수 추가 마이그레이션보다 작고, 「새 표가 빠뜨리면 실패」 요구를 더 정확히 충족) — 단 D8-05 문구와 달라지므로 **사용자 확인이 필요**(Open Question 1). (3) 체크리스트는 `docs/OPERATIONS.md`(300줄 꽉 참)가 아니라 새 문서 `docs/CUTOVER.md`에 두고 OPERATIONS에는 포인터만 둔다.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| demo 삭제 실행 | 운영 Job(Cloud Run Job, 앱 이미지의 CLI 번들) | GitHub Actions(입력·확인·WIF 게이트) | 운영 DB 직접 명령 금지 → 워크플로가 Job을 띄움 (`account.yml` 패턴) |
| 전환 표시·전환 시각 저장 | Database(설정 키 또는 전용 행) | API/Backend(`repositories` 쓰기 지점이 읽음) | 쓰기 시점 `source` 결정이 저장소 계층 4곳에 있음 |
| 번호 카운터 초기화 | Database(`document_counters`) | demo 삭제 Job(같은 트랜잭션) | 행 잠금 규약(Phase 4) 안에서 |
| 체크리스트 | 문서(`docs/CUTOVER.md`) | OPERATIONS 포인터 | 코드 없음. 검증은 문서 한계 테스트 |
| 로그인 상태 확인 | `/admin/people`(04.4 완료) | `account.yml reset` | 이미 있음 |
| 복원 리허설 | Actions + Job(04.4 완료) | `/admin/system-status` | 이미 있음 — 프로덕션 1회 기록만 필요 |
| 첫 프로덕션 승격 | Actions `deploy.yml`(사용자 실행) | `promote-guard.sh`·`deploy.sh` | 세션은 승격 실행 불가(위험 경로·운영) |

## 1. 프로덕션 배포·승격 (전 과정)

### 1.1 실제 경로 `[VERIFIED]`
1. **트리거**: main 병합 → 스테이징 자동 배포. 프로덕션은 `workflow_dispatch`(target=production, sha 선택)만 — push로는 절대 안 돈다 `[VERIFIED: .github/workflows/deploy.yml:3-9, 125]` `if: github.event_name == 'workflow_dispatch' && inputs.target == 'production'`. main이 아니면 인증 전에 실패 `[VERIFIED: deploy.yml:130-138]`.
2. **가드**: `scripts/promote-guard.sh` — 스테이징이 100% 서빙하는 리비전의 `APP_GIT_SHA`를 읽고 `[VERIFIED: promote-guard.sh:70-79]`, 입력 sha(비우면 그 값)의 이미지가 Artifact Registry에 있어야 하며 `[VERIFIED: promote-guard.sh:~104]`, 입력 sha가 스테이징 SHA와 다르면 `staging is serving $STAGING_SHA, not $SHA — deploy $SHA to staging first (D-05)`로 거부. → **승격 대상은 항상 「지금 스테이징에 떠 있는 SHA」**. 그 사이 main에 PR이 머지되면 스테이징이 새 SHA로 바뀌므로 승격 직전 머지를 멈춘다(CLAUDE.md 「한 번에 PR 하나」와 맞물림).
3. **`deploy.sh --env prod`** 순서 `[VERIFIED: scripts/deploy.sh:902-930]`: `refuse_oidc_bypass → require_clean_tree → resolve_purge_auto_mode → resolve_project_number → require_prod_image(운영은 절대 빌드 안 함) → ensure_apis → ensure_ar_repo → ensure_network → ensure_sql_instance → ensure_sql_db_users → ensure_secrets → ensure_cert_bucket → ensure_evidence_bucket → build_and_push_image → deploy_jobs → run_db_bootstrap → run_migrate → run_seed → deploy_service → ensure_evidence_cors → ensure_scheduler → ensure_alerts → smoke → deploy_purge_auto_job → ensure_purge_scheduler → map_domain`.
4. **마이그레이션**: `plant8-prod-migrate` Job(`dist/cli/migrate-runner.mjs`) 실행, 16A 커넥션 검사(`max_instances × pool > max_connections − 5`이면 exit 3) `[VERIFIED: deploy.sh:532-550]`. **이번에 적용할 마이그레이션 전부가 한 트랜잭션** — 가드가 멈추면 그 DB는 한 칸도 안 바뀐다 `[VERIFIED: db/migrations/0036_drop_expense_evidence_amount.sql:8-10]`. Job `--task-timeout=15m` `[VERIFIED: deploy.sh:~420 job_common]`.
5. **시드**: `plant8-prod-seed` Job이 매 배포 권한표·노출표·코드표·설정 기본값을 멱등 채움 `[VERIFIED: deploy.sh:~440-447 주석]`.
6. **서비스 배포 → 100% 트래픽**(카나리 없음) → 스모크(`/api/health` ok:true, `/login` 200, 가짜 로그인 Origin 4xx, `/internal/notify-tick` 토큰 없이 401) `[VERIFIED: deploy.sh:776-833]`. 실패 시 이전 배포로 **한 번** 자동 롤백 `[CITED: docs/OPERATIONS.md:101-115]`.
7. **스테이징만 켜진 것**: `CERT_FEATURE_ALLOWED=true`는 staging만 `[VERIFIED: deploy.sh:603-605]` → **운영은 확인증 기능이 꺼진 채 간다**(Phase 11까지). 이 페이즈에서 건드리지 않는다.

### 1.2 롤백의 실제 한계 `[VERIFIED]`
`rollback.sh`는 스키마 하한(`-- rollback-floor:` 마이그레이션을 더한 커밋)보다 오래된 배포로 되돌리기를 **거부**한다 `[VERIFIED: scripts/rollback.sh:14-17; docs/OPERATIONS.md:124-130]`. 하한 파일: `0012_project_status_five_values.sql:1`, `0015_drop_project_contract_columns.sql:1`, `0021_holidays_archive.sql:1`, `0036_drop_expense_evidence_amount.sql:1`. 운영의 마지막 배포(9/18, run #24, 70a1235 — **이 클론에 해당 커밋 없음(얕은 이력), 확인 못 함**)는 Phase 1 뼈대라 이 모두보다 오래됨 → **첫 승격 뒤에는 9/18 리비전으로 돌아갈 수 없다.** 복구는 앞으로 고치기(roll-forward) 또는 백업 복원(`docs/RESTORE.md`)뿐. 그래서 **승격 직전 수동 백업**이 필수(§8).

### 1.3 첫 승격 전에 확인·생성할 것 (세션이 볼 수 있는 것과 없는 것)

| # | 항목 | 왜 | 근거 | 누가·어떻게 |
|---|---|---|---|---|
| P1 | **`bootstrap-gcp.sh`를 운영 프로젝트에서 최신 버전으로 재실행했는가** — 9/18 이후 추가: 스케줄러 SA(04.2), purge-sched SA(07.2-03), `cloudscheduler.admin`, 서명 버킷(04.3-05 d-2), 증빙 버킷(05-12 d-3), 런타임 SA `serviceAccountTokenCreator`(서명 URL) | 없으면 `ensure_cert_bucket`이 `run scripts/bootstrap-gcp.sh first`로 **서비스를 바꾸기 전에** 중단 `[VERIFIED: deploy.sh:350-367]`; purge-sched SA는 없으면 경고 후 Scheduler만 건너뜀 `[VERIFIED: deploy.sh:706-716]` | `[VERIFIED: bootstrap-gcp.sh:118,123,132,156,170,190]` — 스크립트는 `ENVS="staging prod"` 루프라 재실행 한 번이 두 환경을 다 만든다 | **소유자(사용자)만**(Cloud Shell, Owner). 세션 불가. 재실행 여부 **확인 못 함** — 읽기 전용 `verify.yml`의 `evidence-bucket` 점검이 `for env in staging prod`로 운영 버킷 존재·설정을 보여 주므로 `[VERIFIED: scripts/verify-gcp.sh:~103]` 그걸 돌려 증거를 얻는다 |
| P2 | GitHub 저장소 변수 4개 `GCP_PROJECT_ID`·`GCP_PROJECT_NUMBER`·`GCP_REGION`·`ALERT_EMAIL` | 스테이징 배포가 같은 변수를 쓰므로 이미 있음(추정 불필요 — 스테이징이 돌고 있음) | `[VERIFIED: docs/OPERATIONS.md:193-196, deploy.yml:94,128]` | — |
| P3 | 시크릿 `better-auth-secret-prod`·`app-data-key-v1-prod`(32바이트)·`db-admin-password-prod`·`smtp-*-prod` 4개 | `_ensure_secret`이 없으면 만들고 있으면 재사용 `[VERIFIED: deploy.sh:332-340]`. 이 중 **`app-data-key-v1-prod`는 2026-09-22 실측 32바이트** `[CITED: docs/OPERATIONS.md:218-220]`. SMTP는 `__unset__` 센티널 → **값은 사용자가 넣는다**(없으면 앱은 메일 안 보내고 상태 화면 「이메일 미설정」, 알림함만) `[VERIFIED: OPERATIONS.md:240-244]` | 시크릿 버전 삭제 금지 | 사용자 몫(smtp 4개는 readiness 8번) |
| P4 | Cloud Scheduler `plant8-prod-notify-tick`(매일 09:00 KST) | 배포가 만들고(`ensure_scheduler`), **첫 성공은 수동 실행으로 확인**해야 경보가 울린다 `[VERIFIED: OPERATIONS.md:138,147]` | `[VERIFIED: deploy.sh:681-698]` | 승격 직후 사용자가 `gcloud scheduler jobs run` 1회 + 로그 확인(§6 문구 그대로) |
| P5 | Cloud Scheduler `plant8-prod-purge-certs-monthly`(매월 1일 03:00 KST)·Job `plant8-prod-purge-certs-auto` | P1의 purge-sched SA가 있어야 생성. 모드는 `infra/purge-certs-auto.mode` = `dry-run`(승격되는 커밋의 파일을 읽음) `[VERIFIED: infra/purge-certs-auto.mode:3; deploy.sh:504-516]`. 운영은 확인증 기능이 꺼져 있어도 파기는 돈다(`docs/CERT-PURGE.md` §1 「기능 플래그와 무관하게 돈다」) → 운영에 확인증 데이터가 없으면 건수 0 | 최초 실행은 dry-run이라 안전 | 승격 후 `verify.yml`에 prod purge 점검이 없음(`purge-scheduler`는 소유자 로컬 셸 전용 `[VERIFIED: verify-gcp.sh:3]`) → 사용자가 콘솔에서 존재 확인 |
| P6 | 증빙 버킷 CORS = 운영 `status.url` | `ensure_evidence_cors`가 서비스 배포 뒤 설정 `[VERIFIED: deploy.sh:666-676]` | 06-VERIFICATION이 스테이징에서만 GCS 업로드를 사람 확인함 `[VERIFIED: .planning/phases/06-payment-evidence-cards/06-VERIFICATION.md:45-47]` | **운영 배포 직후 증빙 GCS 업로드 스모크**(이미지 1·PDF 1·10MB 초과 거부) — 사람 확인 항목으로 체크리스트에 |
| P7 | 경보 3개(5xx>5%·백업 실패·tick 25h)·알림 채널 `ERP Alerts (prod)` | `ensure_alerts` upsert `[VERIFIED: deploy.sh:835-892]`. 백업 실패 경보는 실제 실패 로그 매칭 미검증 상태 `[CITED: OPERATIONS.md:137]` → 상태 화면 「마지막 백업」을 주 1회 눈으로 | — | 사용자 |
| P8 | **자동 백업 7개 보관·18:00 UTC**와 **PITR 꺼짐** | 인스턴스 생성 때만 설정 `[VERIFIED: deploy.sh:204-215; OPERATIONS.md:298]`. 운영 인스턴스 `plant8-prod-db`가 9/18에 이미 생성됨 → `gcloud sql instances describe … settings.backupConfiguration`으로 현재 값 확인(설정 안 따라 바뀌지 않음) | 복원 단위 = 하루 1회, 최대 24시간 손실 `[CITED: TODOS.md:87-93]` | 사용자 결정(Open Q6) |
| P9 | 사용자 정의 도메인 | 미적용: `--domain`은 「accepted but deferred」 `[VERIFIED: deploy.sh:895-900]`. 접속 주소 = `status.url` 실측 | 직원 공지에 주소 필요 | 사용자 |
| P10 | 보안 스캐너 CI(#109) | 사용자가 「운영 배포 준비 때」로 미뤄 둠. workflows라 사용자 머지 `[CITED: TODOS.md:171-178]` | — | 사용자 결정(Open Q8) |
| P11 | 운영 설정값 `tax.rounding.vat_unit`·`withholding_unit` ∈ {1, 10} | 설정 화면은 이제 1·10만 저장. 운영 DB의 기존 값이 다른 값이면 확인 필요 `[VERIFIED: domain/settings/keys.ts:171-180 schema `v === 1 || v === 10`; default 1 / 10]`. 판정은 사람: 운영 `/admin/settings`에서 두 값을 눈으로 `[CITED: 07.1-VERIFICATION.md:150-152]` | 돈 계산 | 사용자(또는 사용자가 준 관리자 계정으로 화면 확인) |
| P12 | 공휴일 2026·2027 확정 | 지급일 자동 계산이 기댐 `[CITED: readiness/precutover-extra-1104.md §3]` — 운영 `/admin/holidays`에서 연도 확정(`holiday_year_confirmations`) 상태 확인 | — | 사용자 |

### 1.4 세션이 해도 되는 것 / 사용자만 하는 것 (CLAUDE.md §4·§2)
- **세션 가능**: 스테이징 배포 확인(머지가 자동 배포), 읽기 전용 `verify.yml` 실행 요청은 사용자가 Run workflow 눌러야 함(workflow_dispatch는 repo write 권한 필요 — 세션이 GitHub MCP로 디스패치 가능한지는 확인 못 함), 문서·테스트·CLI 코드 작성(위험 경로 PR 별도).
- **사용자만**: `deploy.yml` production 디스패치(운영 변경), `bootstrap-gcp.sh` 실행(Owner), 운영 시크릿 값 입력, Cloud Scheduler 수동 실행·콘솔 확인, 위험 경로 PR 머지(`scripts/deploy.sh`·`.github/workflows/`·`db/migrations/`·`infra/`), PITR 켜기, 운영 DB 직접 명령은 **누구도 안 함**(Job으로만).
- **운영 리비전·Job·스케줄러의 현재 상태**: 「확인 못 함」 — readiness도 같은 한계 `[CITED: /mnt/project-files/readiness/intranet-readiness-1104.md:73]`. 계획은 승격 PR/체크리스트 첫 단계에 「상태 읽기」 항목을 둔다.

### 1.5 첫 승격의 마이그레이션 위험 `[VERIFIED + 추정]`
- 마이그레이션 파일 49개(0000~0048), 가드(`RAISE EXCEPTION`) 있는 것: **0009·0012·0015·0030·0036·0046** `[VERIFIED: grep -l "RAISE EXCEPTION" db/migrations/*.sql]`. 운영에 업무 행이 없으면 대부분 무해. 운영에 사람이 손으로 넣은 **거래처**가 있다면 0030(사업자번호 숫자 중복)이 멈출 수 있고 `[VERIFIED: test/integration/migration-upgrade.test.ts:480-523 사례 T7]`, 지출결의가 있으면 0036(증빙 금액≠공급가액)이 멈춘다 `[VERIFIED: 0036…sql:11-30]`. 운영 업무 행이 0이라는 것도 확인 못 함 — 「9/18 이후 운영에 직원이 손으로 넣은 행」을 승격 전에 읽기 전용으로 센다(예: 운영 `/admin` 화면 목록, 또는 04.4 복원 리허설 복원본 위에서 마이그레이션을 먼저 적용해 보는 방법 — 아래).
- **「운영 DB 사본에 마이그레이션 미리 적용」**: 현재 도구는 없다. 04.4 리허설은 복원본의 마이그레이션 **버전 일치**만 본다(원본 DB 마이그레이션이 최신인지) → 승격 전 리허설은 이 문제를 증명하지 못한다. 선택지: (a) 승격 직전 수동 백업 + 가드 멈춤 시 한 칸도 안 바뀐다는 트랜잭션 성질에 의존(추천, 추가 코드 없음), (b) 복원본에 migrate를 돌리는 워크플로 추가(새 코드·워크플로 = 위험 경로, 과함). **추천 (a).**

## 2. 전환일 체크리스트 — 위치와 참조

- **`docs/OPERATIONS.md`는 지금 정확히 300줄이고 테스트가 300줄 초과를 거부한다** `[VERIFIED: wc -l = 300; test/unit/docs-limits.test.ts "300줄 이하다" `expect(lineCount(content)).toBeLessThanOrEqual(300)`]`. 「체크리스트」 단어는 OPERATIONS에 0건 `[VERIFIED: grep -c = 0]`. 현재 절 번호: §1 환경, §2 비용, §3 로컬, §4 배포 런북, §5 롤백, §6 경보 3개(+알림 발송 스케줄러), §7 계정 운영, §8 부트스트랩, §9 시크릿, §10 상태 화면, §11 로그·IP, §12 설정 가져오기, §13 Codex, **§14 백업·복원(OPS-03)** `[VERIFIED: grep -n "^## " docs/OPERATIONS.md]`.
- 선례: 긴 절차는 별도 문서로 뺐다 — `docs/RESTORE.md`(150줄 상한, 테스트 고정, OPERATIONS §14가 링크)·`docs/CERT-PURGE.md`·`docs/EVIDENCE-STORAGE.md` `[VERIFIED: OPERATIONS.md:93,300]`. **추천: `docs/CUTOVER.md` 신설**(상한 테스트 `docs-limits.test.ts`에 추가, 예: 200줄) + OPERATIONS §14 끝(또는 §4)에 링크 한 줄 → 그 한 줄을 넣으려면 OPERATIONS에서 줄을 하나 줄여야 한다(300 꽉 참; 계획이 §14의 긴 한 줄을 접거나 §2 비용 문단 한 줄을 정리). 참고: `deploy.yml`의 `paths`는 `docs/**`를 제외하되 OPERATIONS·RESTORE·ARCHITECTURE 등은 재포함 `[VERIFIED: deploy.yml:15-24]` → OPERATIONS를 고치면 main 병합이 스테이징 배포를 부른다(무해하지만 인지). 새 `docs/CUTOVER.md`는 재포함 목록에 없으면 CI도 안 돎(문서만 PR은 CI 안 돎 — CLAUDE.md §4).
- 체크리스트가 **참조해야 할 기존 절**: §6 경보(백업 실패·tick), §7 계정 운영(`account.yml` create/reset/unlock, 임시 비밀번호 로그에 한 번, 재실행 금지), §8(부트스트랩), §9(시크릿·SMTP), §10(상태 화면 — 「마지막 백업」·「복원 리허설」), §14+`docs/RESTORE.md`(§1 리허설 실행·결과 읽기, §3 사고 복원), `docs/CERT-PURGE.md`(해당 없음 — 운영 확인증 꺼짐).
- 체크리스트 구성(제안; 순서는 CONTEXT 기본 제안을 따르고 이번 조사로 앞뒤에 단계가 붙음):
  **사전(전환 4주~1주 전)** ① 선행 페이즈 완료 확인(§7 표) ② 첫 프로덕션 승격(§1.3 P1~P12) ③ 마스터 손 입력(§6) ④ 전 직원 계정 발급 + 상태 배지 확인(§5) ⑤ **프로덕션 복원 리허설**(전환 최소 1주 전 `[CITED: TODOS.md:55-61 CEO-6]`, 결과는 **일시가 그 리허설 날짜인지**까지 본다 `[CITED: TODOS.md CEO-7]`) ⑥ 인트라넷 결재 마감 공지(D8-03, N영업일 전) ⑦ 직원 공지 초안(전환일·번호 구분 한 줄, D8-09)
  **전환 전날~당일** ⑧ 인트라넷 결재·지급 마감 확인 ⑨ 수동 백업 + 최신 자동 백업 확인(§8) ⑩ demo 삭제 **dry-run** → 표별 건수 확인 → 실행(확인 입력) ⑪ 연습용 마스터 보관(D8-06) ⑫ 진행 중 프로젝트 재등록(D8-02) ⑬ 인트라넷 입력 금지 공지 + 직원 공지
  **전환 직후** ⑭ 첫 프로젝트 번호 `26001` 확인 ⑮ 비밀번호 안 바꾼 사람 재발급(D8-07) ⑯ notify-tick 첫 성공·백업 경보 눈 확인 ⑰ 운영 증빙 업로드 스모크
- **운영 규칙 문구 정리**(D8-04·D8-07): ROADMAP Phase 8 기준 2·3(`.planning/ROADMAP.md:1323-1324`)의 「전환일 전에 각자 로그인해 비밀번호를 바꾼다」「인트라넷 조회 전용 전환」을 「목표이지 조건 아님」「인트라넷 입력 금지 공지」로 바꾸는 일이 계획 첫 문서 작업(`gsd_run`).

## 3. 복원 리허설 (프로덕션 대상) — 04.4가 main에 넣음

- **프로덕션 원본 허용**: `restore-rehearsal.yml` `inputs.env`가 `staging|production`이고 production은 `confirm_production`에 `plant8-prod-db` 그대로를 요구, main만 허용 `[VERIFIED: .github/workflows/restore-rehearsal.yml:15-22, 47-62]` + 스크립트도 같은 검사 `[VERIFIED: scripts/restore-rehearsal.sh:78-81]`.
- **운영 덮어쓰기 방지**: 임시 이름 `plant8-<env>-rehearsal-<run>-<attempt>` 정규식 `^plant8-(staging|prod)-rehearsal-[0-9]+-[0-9]+$`, `plant8-staging-db`·`plant8-prod-db`·`$SOURCE`와 같으면 거부 `[VERIFIED: restore-rehearsal.sh:24, 61]`. 코드 쪽도 `REHEARSAL_TARGET_PATTERN = /^[a-z0-9-]+:[a-z0-9-]+:plant8-(staging|prod)-rehearsal-\d+-\d+$/` `[VERIFIED: scripts/restore-rehearsal-cli.ts:56]`. 워크플로 주석이 스스로 말하듯 main·확인 입력은 **실수 방지이지 권한 경계가 아니다**(WIF는 저장소로만 묶임; 「Phase 8에서 리허설 전용 최소 권한 SA · WIF ref 조건 검토」가 T-04.4-14로 이월) `[VERIFIED: restore-rehearsal.yml:7-10]` → 이 페이즈가 그 검토를 할지는 계획이 정한다(추천: 문서화만, 코드 변경 없음 — 1인 소유 비공개 저장소).
- **결과 기록·표시**: 그 환경 **자기 DB**의 `restore_rehearsals` 표에 한 줄 `[VERIFIED: db/schema/ops.ts:5-12 "각 환경의 리허설 Job이 자기 DB에만 쓰고"]`, 상태 화면 「복원 리허설」 행이 같은 DB를 읽음 `[VERIFIED: app/(app)/admin/system-status/page.tsx:147-148, 160-163: "리허설 기록 없음 — 첫 리허설 전" / 확인 불가]`. 컬럼 `source`는 `('staging','production')` 체크 `[VERIFIED: ops.ts:25]` — **demo 삭제 도구가 「`source` 컬럼 있는 표」를 기계적으로 훑으면 이 표를 오인하므로 분류에서 명시 제외해야 한다**(§4).
- **확인 항목**: `RESTORE_CHECK_TABLES`는 시드/계정 표 9개(`requireRows: true`: `users`·`roles`·`permission_matrix`·`visibility_matrix`·`code_items`·`org_units`·`teams`·`settings_simple`·`settings_historized`) + 읽히기만 하는 표 7개(`team_memberships`·`vendors`·`action_log`·`expenses`·`files`·`upload_intents`·`settlement_approvals`) `[VERIFIED: domain/ops/restore-check-tables.ts:4-19]`. **직원이 입력하는 `projects`·`quote_lines`·`revenue_entries` 등은 목록에 없다** → 프로덕션 리허설 성공이 「직원 입력이 복원된다」를 증명하지 못한다 = TODOS CEO-3 `[VERIFIED: TODOS.md:47-53]`("Phase 8 전 처리, P1"). 전환 시점 운영에는 demo 삭제 후 업무 행이 0이므로 `requireRows: true`로 올리면 **리허설이 실패**한다 — 따라서 업무 표는 `requireRows: false`(읽히는지만)로 더하거나, 리허설을 전환 1주 전(업무 행이 아직 demo로 존재하는 시점)에 돌리고 `true`로 올리는 두 갈래. 추천: `false`로 표만 더함(안전·시점 독립).
- **프로덕션 선행 조건(중요)**: `restore-rehearsal.sh`는 Cloud Run Job `plant8-prod-restore`를 부른다 `[VERIFIED: restore-rehearsal.sh:~85 JOB="$(job_name "$ENV_SHORT" restore)"; deploy.sh:~436-442 deploy_jobs]`. 이 Job과 `restore_rehearsals` 표(마이그레이션 0019)는 **운영에서 첫 승격 뒤에야 생김** → 프로덕션 리허설은 첫 승격에 의존. 또 리허설 중 배포가 끼면 이미지 digest 비교로 실패 기록 `[VERIFIED: restore-rehearsal.yml:31-34]`.
- **한 번이라도 프로덕션에 돌았는가: 확인 못 함**(GitHub Actions 기록 못 봄). 코드상 불가능에 가깝다(위 선행 조건). TODOS가 같은 말: 「프로덕션 경로(`plant8-prod-restore`, 운영 IAM DB 사용자, 확인 입력)는 04.4에서 한 번도 실제로 돌지 않는다」 `[VERIFIED: TODOS.md:57-58]`. **계획이 체크리스트에서 확인할 것**: Actions 목록에서 `restore-rehearsal` 실행의 입력 env=production 성공 + 상태 화면 행 일시 + 백업 id 일치.
- **문서**: `docs/RESTORE.md`(143줄, 150줄 상한) §1 실행·읽는 법, §2 남은 임시 인스턴스 정리, §3 사고 복원 `[VERIFIED: docs/RESTORE.md headings]`.

## 4. demo 행 삭제 (D8-05·D8-09) — 현재 스키마 기준 사실

### 4.1 `source` 컬럼이 있는 표 (이름으로)
`[VERIFIED: grep 'source: text("source")' db/schema/*.ts, 파일을 열어 확인]`

| 표 | 컬럼 정의 (원문) | 쓰는 곳 |
|---|---|---|
| `projects` | `db/schema/projects.ts:37` `source: text("source").notNull().default("demo")` | `repositories/projects.ts:447` `source: input.source ?? "demo"` |
| `quote_revisions` | `quote-revisions.ts:23` 같은 정의 | `repositories/quote-revisions.ts:26` `source: input.source ?? "demo"` |
| `quote_lines` | `quote-lines.ts:46` 같은 정의 | `repositories/quote-lines.ts:173` `source: input.source ?? "demo"` |
| `revenue_entries` | `revenue-entries.ts:24` 같은 정의 | `repositories/revenue-entries.ts:136` `source: input.source ?? "demo"` |
| `revenue_issue_requests` | `revenue-entries.ts:58` 같은 정의 | `repositories/revenue-issue-requests.ts:39` insert — **source 대입 없음(DB 기본값)** |
| `reserve_entries` | `reserve-entries.ts:25` | `repositories/reserve-entries.ts:113` insert — 대입 없음 |
| `corp_card_usages` | `corp-card-usages.ts:48` | `repositories/corp-card-usages.ts:21` — 대입 없음 |
| `expense_payments` | `expense-payments.ts:30` | `repositories/expense-payments.ts:18` — 대입 없음 |
| `purchase_requests` | `purchase-requests.ts:35` | `repositories/purchase-requests.ts:28` — 대입 없음 |

「대입 없음」 5개는 `grep 'source: input.source ?? "demo"|source: "demo"'`이 4곳(위 표 앞 4개)만 내놓은 것으로 판정 `[VERIFIED: grep 결과 4줄]`; 이 5개의 `values`를 한 줄씩 읽지는 않았음 → 계획이 확인.

**`source` 컬럼이 있지만 demo 표시가 아닌 표 (분류에서 제외해야 함)**: `restore_rehearsals.source`(`ops.ts:12`, 값 `'staging'|'production'`), `vendor_account_changes.source`(`vendor-details.ts:72`, `$type<"admin" | "workplace" | "evidence">()`, CHECK `vendor_account_changes_source_check` `vendor-details.ts:78`).
**호출자가 `source`를 넘기는 곳은 없다**: 4개 저장소 입력의 `source`는 선택 필드이고 `domain/*`에서 대입하지 않음(`grep`에 도메인 대입 줄 없음) → **현재 모든 새 행은 `'demo'`**. 전환 뒤에도 코드를 안 바꾸면 계속 `'demo'` → 다음 삭제 때 실데이터가 날아간다. 프로젝트 DTO에 `source` 필드가 노출돼 있다 `[VERIFIED: domain/projects/index.ts:138 { key: "source", from: "source", infoItem: "project.value" }]`.

### 4.2 `source` 컬럼이 **없는** 업무·준업무 표 (D8-05 「업무 기록」인데 빠지는 것)
스키마 전체 표 목록을 코드로 뽑아 `source` 유무를 대조했다 `[VERIFIED: db/schema/*.ts 전수 스크립트로 표 이름을 열거]`.

| 분류(추천) | 표 | 비고 |
|---|---|---|
| **삭제 대상, source 없음** | `expenses`(지출결의, 번호 `number` unique), `expense_evidence_reviews`, `approval_instances`/`approval_routes`/`approval_steps`(결재), `leave_requests`, `project_members`, `project_documents`, `project_budget_entries`, `settlement_approvals`, `files`·`upload_intents`(+GCS 객체), `notification_log`, (07.2-01 추가 예정) `expense_date_change_requests` | `expenses`는 `source`가 없고 `expenses.project_id → projects.id`, `quote_line_id → quote_lines.id` FK(삭제 규칙 없음 = NO ACTION) `[VERIFIED: expenses.ts:22-23]`. 팀 지출결의(`team_expense_kind`)는 프로젝트가 없어 **프로젝트 삭제로는 안 지워진다**. 결재 인스턴스는 `document_kind`+`document_id`(uuid, FK 없음) `[VERIFIED: approvals.ts:15-18]` |
| **유지(실제 값)** | `leave_adjustments`(연차 기초 잔고 조정 — 관리자가 `/admin/people/[id]`에서 입력, 추가만 가능·삭제 없음), `evidence_import_batches`·`evidence_records`·`evidence_record_links`(홈택스·카드사 엑셀 실데이터, **「`source` 칸도 두지 않는다」 `db/schema/evidence-records.ts:10` + 테스트가 source 칸 없음을 단언 `test/integration/evidence-schema.test.ts:168-175`**), `vendor_contacts`·`vendor_documents`·`vendor_account_changes`(마스터), `cert_*`(운영 꺼짐) | 단 `evidence_record_links.owner_id`가 지출결의 등을 가리킴 — demo 지출결의 삭제 시 **붙임 행을 먼저** 지워야 함(`scripts/demo-data.ts:518-531`이 그렇게 함). 증빙 기록이 demo 지출결의에 붙어 있었다면 붙임만 해제되고 기록은 남음 |
| **유지(설정·마스터)** | `users`·`sessions`·`accounts`·`verifications`·`rate_limits`·`login_attempts`, `roles`, `permission_matrix`·`visibility_matrix`, `code_items`, `org_units`·`teams`·`team_memberships`, `corp_cards`, `vendors`, `field_definitions`, `holidays`·`holiday_year_*`, `notification_rules`, `settings_simple`·`settings_historized`, `approval`은 위 삭제대상 | D8-05 「설정·규칙 성격 행은 대상 아님」 |
| **불변(삭제 불가)** | `action_log` — DB 트리거가 DELETE·TRUNCATE를 `RAISE EXCEPTION 'action_log is append-only'`로 거부, UPDATE는 「정리 안 됨 → 정리됨」만 `[VERIFIED: db/migrations/0046_phase7_action_log_immutable.sql:1-41]` | → CONTEXT Discretion 「행동 로그를 지울지 남길지」의 답은 **남긴다**(지울 수 없음). 로그의 `document_id`는 FK 없는 text `[VERIFIED: db/schema/action-log.ts:25]`라 지워진 문서를 가리키는 행이 남는다 — 선택: 정리(prune) 표시만(끌 수 없는 6종 제외 `UNPRUNABLE_ACTION_TYPES`). 260907은 트리거를 트랜잭션 안에서 내렸다 올렸지만(아래 대조) 여기서는 권하지 않음(감사 근거 약화) |
| **기록·표시용** | `restore_rehearsals`, `notify_tick_runs`, `document_counters`(§4.4), `privacy_session_activity`, `cert_*` | `restore_rehearsals`는 지우지 않는다(프로덕션 리허설 증거) |

**가드 테스트 존재 여부**: 「새 업무 표가 `source`를 빠뜨리면 실패하는 검사」는 **내 grep 기준 없음**(`test/`에서 `source`+`information_schema` 조합은 `evidence-schema.test.ts`의 반대 단언뿐) — 전수 확인은 못 함. 그리고 **현재 스키마에서 이 검사를 그대로 만들면 `expenses` 등에서 즉시 실패**한다. 그래서 검사의 설계가 `source`가 아니라 「모든 표가 삭제/유지/불변 중 하나로 분류돼 있다」여야 한다 → Open Question 1.

### 4.3 FK·고아 위험 (삭제 순서)
삭제 규칙은 거의 없고(NO ACTION) `restrict`가 일부 `[VERIFIED: grep onDelete — reserve_entries.project_id/vendor_id, revenue_entries.project_id, quote_lines.revision_id restrict; 나머지 FK는 규칙 없음]`. 자식부터 지우는 순서는 이미 `scripts/demo-data.ts`의 `purgeDemoData`가 구현·시험한다 `[VERIFIED: scripts/demo-data.ts:452-564, 시험 test/integration/demo-data.test.ts]`:
`approval_steps → approval_routes → approval_instances → evidence_record_links(주인 expense/corp_card_usage/purchase_request) → expense_payments → expense_evidence_reviews → files/upload_intents → expenses → corp_card_usages → purchase_requests → revenue_issue_requests → revenue_entries → reserve_entries → settlement_approvals → quote_lines → quote_revisions → project_members → projects → corp_cards → notification_log → team_memberships → vendors/teams/org_units(사용 중이면 보관)`.
이 스크립트는 **이름 접두어 「[테스트] 」·이메일 `demo-%@plant8-demo.test`로 견본을 고르는 스테이징용 도구**라 그대로는 못 쓰지만 삭제 순서·건수 집계(`record(key, result)`)·「실제 사람 지출결의가 견본 프로젝트에 달리면 따로 센다」(`counts.nonDemoExpenses`, `:~492`) 패턴은 재사용 모델이다. **빠진 것(07.2/06 이후 추가분)**: `project_documents`·`project_budget_entries`(07 W3·W4, `project-details.ts:16,42` FK → projects), `leave_requests`, `expense_date_change_requests`(07.2-01 `X4`: expense_id FK `[VERIFIED: 07.2-01-PLAN.md:48]`) — 순서에 더해야 함. 이 스크립트는 `dist/cli/demo-data.mjs`로 번들돼 운영 이미지에도 들어간다 `[VERIFIED: scripts/build-cli.mjs:14,24]` — 운영 `seed` Job을 args만 바꿔 부르면 견본 데이터가 **운영에 만들어질 수 있다**(CONTEXT의 「seed Job args 변경」). 운영에서 견본이 만들어졌는지(`[테스트]` 접두 프로젝트·`demo-…@plant8-demo.test` 사용자)는 **확인 못 함** → 체크리스트 사전 항목으로 읽기 전용 확인(없으면 D8-05가 지울 대상은 사용자가 연습하며 만든 행뿐).
**GCS 객체**: `files.owner_id`에 FK 없음 `[VERIFIED: files.ts:6]`, 객체는 증빙 버킷 `evidence/{id}` `[VERIFIED: files.ts:16 주석]` — 행만 지우면 객체가 고아로 남는다(버킷 수명 규칙은 `incoming/` 7일만 `[VERIFIED: bootstrap-gcp.sh:170-176]`). 개인정보·증빙이라 방치 부적절 → Open Question 7.
**삭제 권한**: Job은 런타임 IAM DB 사용자로 도는데 `db-bootstrap`이 `ALTER SCHEMA public OWNER TO <iam>` `[VERIFIED: scripts/db-bootstrap.ts:43]` — 마이그레이션이 같은 사용자로 돌아 표 소유자 → DELETE 가능(`action_log`만 트리거가 막음). 소유자 관계는 추정.

### 4.4 `document_counters`와 번호 초기화 (D8-09)
- 표: `(counter_key, period)` 복합 PK, `value`, `updated_at` `[VERIFIED: db/schema/document-counters.ts:12-22]`. 카운터 `seq`는 항상 1부터 증가하고 표시값은 `seq + seqStart - 1`(`documentNumberFormat`) `[VERIFIED: domain/document-numbering/index.ts:62-68]`. 프로젝트 번호 `26001` = 연도 2자리 + 순번 3자리(`DOCUMENT_NUMBER_PROJECT_SEQ_DIGITS` 기본 3 `keys.ts:~310`, 기본 `seqStart=1` `keys.ts:331-339`). → **초기화 = `counter_key='project'` 행 삭제(또는 value=0)** 이면 다음 프로젝트가 `26001`. 대안으로 설정 `document_number.project.seq_start`는 04-51이 「이미 매긴 번호보다 낮추면 충돌」을 막는 가드(`SeqStartOverlapError`)를 갖고 있어 카운터 직접 초기화보다 안전하지만 demo 삭제 뒤라면 겹침이 없어 어느 쪽이든 동작.
- **카운터 종류 전수** `[VERIFIED: grep allocate*Number / counterKey]`:
  | counter_key | period | 쓰는 곳 | 초기화 필요? |
  |---|---|---|---|
  | `project` | 연도(`"2026"`) | `domain/projects/index.ts:86` `PROJECT_NUMBER_COUNTER_KEY = "project"` | **예(D8-09)** |
  | `expense` | **프로젝트 번호**(`"26001"`…) | `domain/document-numbering/index.ts:304` `repoAllocateNumber(viewer, "expense", input.projectNumber, tx)` | **예 — 필수.** 프로젝트 번호가 `26001`부터 재사용되므로 `expense/26001` 카운터가 남아 있으면 새 프로젝트 26001의 첫 지출결의가 demo가 쓰던 다음 순번을 받는다 (번호 「재사용 금지」 취지와 반대로 순번이 이어져 혼란) |
  | `purchase_request` | 프로젝트 번호 | `document-numbering/index.ts` 시작값 가드 `lockDocumentCounter(viewer, "purchase_request", ALL_PERIODS, tx)` + 구매 요청 번호 | 예(같은 이유) |
  | `expense_team` | 연도 | `domain/expenses/index.ts:1305` | 권장(팀 지출결의 demo 삭제 시) |
  | `purchase_request_team` | 연도 | `domain/purchase-requests/index.ts:110` `TEAM_COUNTER_KEY = "purchase_request_team"` | 권장 |
  | `leave` | 연도 | `domain/leave/access.ts:7` `LEAVE_DOCUMENT_KIND = "leave"`, `domain/leave/index.ts:353` | `leave_requests`를 지우면 권장 |
  | `cert` | 연도 | `domain/certs/intake.ts:431` | **아니오** — 운영 확인증 꺼짐(실데이터 가능성 없음) 및 세무 기록 번호 |
  | `*` (ALL_PERIODS) | 잠금판 | `repositories/document-counters.ts:111` `ALL_PERIODS = "*"` | 잠금판은 있으면 지워도 `ON CONFLICT DO NOTHING`로 다시 생김 `[VERIFIED: document-counters.ts:55-57,80-82]` |
  CONTEXT는 프로젝트 번호만 말한다 → **어디까지 초기화할지는 사용자 확인**(Open Question 3; 추천: `cert` 제외 전부 — 지운 문서의 번호가 하나도 남지 않으므로 충돌 없음).
- 번호 유일성: `expenses.number`·`leave_requests.number`는 `text().unique()`라 카운터 초기화 + 삭제 순서가 어긋나면 유일성 위반 → **삭제 먼저, 카운터 나중, 한 트랜잭션**. 카운터 쓰기는 `lockDocumentCounter`(행 잠금) 규약 `[VERIFIED: repositories/document-counters.ts:65-100]` — 삭제 트랜잭션 중 동시 채번을 막으려면 서비스 점검 시간(전환일 이른 아침, 직원 공지)에 돌리거나 잠금판(`*`)을 먼저 배타 잠금.
- 인트라넷 번호와 겹침: 사용자가 수용(D8-09) — 직원 공지 한 줄(체크리스트 ⑦).

### 4.5 「이후 입력이 demo로 안 찍힘」 구현 선택지 (Claude's Discretion)
쓰기 지점 4곳(`?? "demo"`) + DB 기본값 5표를 모두 덮어야 한다. 선택지(계획이 하나 고름; 추천 B):
- **A. DB 기본값 변경 마이그레이션 + 4곳을 `input.source`(기본 DB 위임)로 변경**: 기본값을 `'live'`로 바꾸는 `ALTER TABLE … SET DEFAULT`는 DDL(위험 경로, 사용자 머지)이고 **배포 시점에 일제히 바뀌어** 전환일 삭제와 같은 트랜잭션이 아님 → D8-05가 이미 기각한 이유.
- **B. 전환 표시를 읽는 `currentSource()` 한 곳**: `repositories`의 쓰기 지점(4곳 + 기본값 의존 5표는 `values`에 `source` 명시 추가)이 `source: input.source ?? await readSourceMarker(tx)`를 쓰고, 마커는 `settings_simple`의 한 키(예: `cutover.at`; null = 아직 전환 전 = `'demo'`) 또는 전용 한 줄 표. 삭제 트랜잭션이 마커를 쓰면 **같은 커밋에서** 이후 모든 쓰기가 `'live'`. 비용: 쓰기마다 한 번 읽기 → 설정은 이미 캐시·읽기 경로(`getSettingValue`)가 있음 `[VERIFIED: domain/document-numbering/index.ts:114-131]`. 5표의 기본값 의존을 없애려면 저장소 9곳 수정(돈·카드 `repositories` 포함 → `/cso`).
- **C. 기본값은 두고, 전환 후 입력 행의 `source`를 앱 쓰기에서 항상 명시**(= B의 단순형). 새 표 추가 시 빠뜨리지 않게 가드 테스트가 필요(§4.2).

**전환 시각 저장과 Phase 9**: Phase 9는 만들지 않기로 했고(사용자 2026-11-04) 손익 메뉴는 숨김 `[CITED: readiness:69; git 34cc9d3 #339]`. D-910 「전환 후 N주」 조건은 이미 ROADMAP에서 「설정 `pnl.start_gate.weeks_after_cutover`는 삭제한다」 `[VERIFIED: .planning/ROADMAP.md:1355]` + 코드에 `cutover`·`start_gate` 키 없음 `[VERIFIED: grep domain/settings 0건]`. 그래서 전환 시각의 **소비자가 없다**. 옵션(결정 아님): (1) **마커 유지** — 한 키 `cutover.at`(timestamptz 문자열)로 쓰기 지점이 `'demo'`/`'live'`를 결정, 감사에도 유용; (2) **단순화** — 시각 없이 불리언 `cutover.done`, 또는 시각 대신 행동 로그(`record`) 한 줄로 전환일을 남기고 `source`는 쓰기 지점이 불리언만 읽음. 소비자가 쓰기 지점 하나뿐이면 (2)가 작지만, 「이전/이후」를 나중에 확인하는 증거(전환 시각)는 (1)이 남는다. 추천: (1) 한 키 + 행동 로그 한 줄.

### 4.6 안전 패턴 (두 단계)
- 저장소 선례: `scripts/purge-certs.ts`는 **기본이 dry-run**, `--apply`일 때만 변경, 등호 결합 거부 `[VERIFIED: purge-certs.ts:6-23]`; 로그 `purge_certs.done {mode, …}`로 건수 확인 `[VERIFIED: CERT-PURGE.md §3]`. `account.yml`은 확인 입력이 없고 main 가드도 없다(디스패치 입력만) `[VERIFIED: .github/workflows/account.yml 전체]` → **새 워크플로는 `restore-rehearsal.yml`의 입력 가드 스텝을 복제**: main 아니면 인증 전 실패 + production 확인 문자열 `[VERIFIED: restore-rehearsal.yml:47-62]`.
- 권장 설계: 입력 `env`(staging|production), `mode`(dry-run|apply), `confirm`(apply일 때: dry-run이 찍은 **총 건수 또는 표별 건수 요약 해시**를 그대로 — 건수가 바뀌었으면 거부) + production은 `confirm_production`(`plant8-prod-db`). dry-run 결과는 Job 로그→워크플로 요약(`account.yml`이 Cloud Logging을 폴링해 요약에 쓰는 방식 `[VERIFIED: account.yml:poll_logs]`). 한 트랜잭션: 삭제 → 카운터 초기화 → 마커 쓰기 → 행동 로그 1줄. 동시 배포 방지: `concurrency: group: deploy`를 공유(리허설은 의도적으로 분리했지만 이 작업은 마이그레이션과 겹치면 안 됨) — 추천.
- 새 Job 필요 여부: `job_name`은 `db-bootstrap|migrate|seed|account|restore|purge-certs|purge-certs-auto` 목록 `[VERIFIED: infra/names.sh:35 주석]`. 새 Job(예: `cutover`)은 `deploy.sh deploy_jobs`에 줄 추가(`--command=node,dist/cli/<x>.mjs`) + `scripts/build-cli.mjs` 진입점 + 번들 시험(`test/unit/deploy/cli-bundle.test.ts`) → **`scripts/deploy.sh`·`infra/names.sh`·`.github/workflows/`는 모두 위험 경로 = 사용자 머지 PR 하나로 떼기**. 대안(작음): 기존 `seed` Job에 `--args` 오버라이드 — 이미 `demo-data`가 쓰는 방식이지만 운영에서 오입력 위험이 커 비추천.
- 백업 확인(앞 단계): 삭제 직전 (a) 사용자가 `gcloud sql backups create`로 수동 백업 후 `SUCCESSFUL` 확인(`docs/RESTORE.md` §3.3의 명령 선례 `[VERIFIED: RESTORE.md 3-3]`), (b) Job이 읽기로 확인할 수 있는 것은 제한적 — `lib/gcp/cloud-sql-admin.ts`가 상태 화면용 「마지막 백업」을 이미 조회하므로 그 함수를 재사용해 「마지막 성공 백업이 N시간 이내」가 아니면 apply를 거부하는 가드를 둘 수 있음(추천, 작은 코드). 260907의 「열쇠 둘(`--실판허용`+`--백업했다`)」 선례와 같은 취지.

## 5. 직원 계정 (MIG-04) — main에 있음 `[VERIFIED]`
- 발급: `/admin/people` 등록 폼, 성공 시 초기 비밀번호를 한 번 보여 줌 — `app/(app)/admin/people/person-form.tsx:26,96`(`초기 비밀번호 — {registered.email}`), 액션 `registerPersonAction`(`app/(app)/admin/people/actions.ts:6,18`).
- 재발급·잠금 해제: `account.yml` `action` ∈ create|reset|unlock `[VERIFIED: account.yml:inputs]`, CLI `scripts/account-cli.ts:16-18`. 임시 비밀번호는 워크플로 로그·Cloud Logging에 한 번 남음, 출력이 안 보여도 reset 재실행 금지(세션 재만료) `[CITED: OPERATIONS.md:158-161]`.
- 04.4 표시: 배지 타입 `"첫 로그인 전" | "임시 비밀번호 사용 중"` `[VERIFIED: app/(app)/admin/people/person-status.ts:8]`; 판정 `firstLoginAt === null` → 첫 로그인 전, `passwordIsTemporary === true` → 임시 `[VERIFIED: person-status.ts:23-24]`; 컬럼 `users.first_login_at timestamp` `[VERIFIED: db/schema/auth.ts:28; db/migrations/0019:21]`, 쓰기 `setFirstLoginAtIfUnset`(`repositories/users.ts:~40`)가 세션 생성 훅 `recordFirstLogin`에서 호출 `[VERIFIED: lib/auth.ts:62; domain/auth/hooks.ts:202]`; 목록에서 사용 `app/(app)/admin/people/page.tsx:233`, 상세 `[id]/page.tsx:110`; 색 매핑 `ui/status-tag/status-map.ts:64-65`(muted). 마이그레이션 0019가 기존 사용자 `first_login_at`을 action_log/login_attempts로 백필, 그 밖에 임시 비밀번호가 아닌 사람은 실행 시각으로 채움 `[VERIFIED: 0019…sql:22-39]` → **첫 승격 때 운영의 기존 계정(9/18에 발급한 것)은 백필 결과로 표시됨** — 로그인한 적 없는데 임시가 아닌 계정은 「정상」으로 보일 수 있다(드문 경우).
- 전환 시 실제 일: 전 직원 계정을 **운영에서** 발급(스테이징 계정은 별개). 어느 수단(화면 vs `account.yml`)이든 임시 비밀번호는 구두·메신저 전달(D-13). 체크리스트에 「전 직원 로그인 확인 = 목록에서 「첫 로그인 전」 배지가 0명」 + D8-07(남은 사람 허용).
- 시스템 관리자 한 명 제외 대표 등 첫 계정은 `account.yml create`(role-sysadmin 시드 5종) — 이미 운영 사용 중(9/18 계정 존재, 확인 못 함).

## 6. 마스터 손 입력 — 화면 전수 (기준 1)
`app/(app)/admin/` 디렉터리 `[VERIFIED: ls]`: `action-log`·`archive`·`code-tables`·`corp-cards`·`field-definitions`·`holidays`·`notification-rules`·`people`(+`org`·`roles`·`[id]`)·`permissions`·`settings`·`system-status`·`vendors`·`visibility`.

| 마스터 | 화면(main) | 비고 |
|---|---|---|
| 거래처·클라이언트 | `/admin/vendors` — 한 표 `vendors`, 갈래 `kind ∈ ('client','supplier','both')` | `db/schema/vendors.ts:23,44`; 별도 클라이언트 표 없음 |
| 직원(계급·팀·발령일·입퇴사일) | `/admin/people`, `/admin/people/[id]`, `/admin/people/roles`, `/admin/people/org` | `users.hire_date`(`auth.ts:40`), 발령 `team_memberships`, 본부 소속 `users.division_id`(07.1-07, 마이그레이션 0047) |
| 본부·팀·조직 | `/admin/people/org` | `org_units`·`teams` |
| 법인카드 | `/admin/corp-cards` | `corp_cards`(카드 번호는 끝 네 자리만) |
| 분류 코드표 | `/admin/code-tables` | `code_items` |
| 결재선 | `/admin/settings` 안(결재선 단계 칸) | `app/(app)/admin/settings/settings-form-client.tsx`·`page.tsx:134,163`(결재선 단계 칸 주석) — 별도 `/admin/approvals` 화면은 **없다**(설정 안에 있음) |
| 알림 규칙 | `/admin/notification-rules` | 07-19 |
| 공휴일 표 | `/admin/holidays` | 연도 확정 필요(`holiday_year_confirmations`) |
| 권한표·정보 노출표 | `/admin/permissions`·`/admin/visibility` | 시드 기본값 있음 |
| 설정(세율·연차 일수·번호 서식·절사) | `/admin/settings` | 이력형 설정은 적용 시작일 있음 |
| 화면 항목(커스텀 칸) | `/admin/field-definitions` | 04.5 완료(9/9) |
| 리저브 기초 잔액 | `/pnl/reserves`(2026-11-04 #339로 「리저브」 메뉴) | **마스터가 아니라 업무 행** = `reserve_entries`(`source` 있음) → D8-05 대로 **demo 삭제 뒤** 입력. 권한 키는 07.3 이후 경영관리본부 |
| 연차 기초 잔고 | `/admin/people/[id]`(잔고 조정) → `domain/leave/balance-service.ts` | `leave_adjustments`는 `source` 없음·삭제 불가(추가만) → 전환 전에 넣어도 demo 삭제에 안 걸림(§4.2 유지 분류 전제). **demo 삭제 이전에 연습으로 조정을 넣으면 지울 길이 없다**(반대 부호 줄만) → 체크리스트: 연차 조정은 demo 삭제 뒤 |
- **화면 없는 마스터**: 못 찾음. 단 두 가지 주의: (a) 결재선은 설정 화면 안(전용 화면 아님), (b) 설정 가져오기 파일 업로드 화면은 일부러 없다 — 로컬 CLI `pnpm settings:import`만(`docs/OPERATIONS.md:261-279`, Job이 아님) → 운영 설정을 스테이징에서 옮기려면 운영 `DATABASE_URL`로 로컬 CLI를 돌려야 하는데 이는 「프로덕션 DB 직접 명령」 금지에 걸린다 → **설정은 운영 화면에서 손으로 입력**(MIG-05 취지와 일치)하거나 사용자가 별도 승인. 가져오기 스크립트 금지 문구와 충돌하지 않도록 계획은 `settings:import`를 전환 도구로 쓰지 않는다.
- `/admin/field-definitions`는 현재 거래처만 대상(04.5, `ROADMAP.md:660-690`). 프로젝트·견적 줄 대상은 아직 켜지지 않음(§7).

## 7. 전환 전 선행 조건 상태 (게이트로만 기록, 계획하지 않음)

| 선행 | 상태(증거) | 비고 |
|---|---|---|
| 04.4 복원 리허설·로그인 표시 | **main에 있음** `[VERIFIED: restore-rehearsal.yml, person-status.ts, 0019]` | 프로덕션 1회는 미실행 추정(§3) |
| 04.5 화면 항목 관리 | **완료 9/9** `[VERIFIED: ROADMAP.md:660-690 "9/9 plans executed"]` | 거래처만 대상 |
| 07.1 후속 | 코드 완료 21/20(`ROADMAP.md:1264-1311`, #334 UAT 재판정) · 사람 확인 11건 남음 `[CITED: readiness:32]`(07.1-VERIFICATION human_verification 목록 `:148-154`) | PJ13·PJ15·PJ12 포함 |
| 06 사람 확인 4건 | 남음 `[CITED: readiness:32; 06-UAT.md]` | — |
| 07.3-01 | main(#333) `[VERIFIED: git 75a7c49]` — 운영엔 안 올라감 | |
| 07.3-02(#340) | 진행 중, ready 상태 `[CITED: readiness:26]`; **main에 없음** `[VERIFIED: git log 34cc9d3까지에 없음]` | 자금 시드·③단 결재 |
| 07.3-04, 07.3-03 | 시작 전 `[VERIFIED: .planning/phases/07.3-management-fund-scope/ 에 PLAN만, SUMMARY는 07.3-01만]` | 07.3-03은 「기획 PM」→「사원」 마이그레이션(위험 경로·사용자 머지) = 0049 |
| 07.2 | 03(#337)·04(#336) main, 나머지 대기 `[VERIFIED: SUMMARY 존재 07.2-03·04; git log]` | 아래 |
| **견적 줄 「일수」 칸** | **미구현**: `db/schema/quote-lines.ts`에 `days`/`일수` 없음 `[VERIFIED: grep 0건]`; 07.2-01(스키마, 위험 경로·사용자 머지 `risk: migration`, `07.2-01-PLAN.md:27`)이 칸 추가, `DEFAULT 1`, 금액 공식 변경은 07.2-06 `[VERIFIED: 07.2-01-PLAN.md:105,259]` | 사용자 결정 2026-11-04: 전환 전 필수 |
| **07.2 선행 폐포** | 2026-11-04 사용자 카드: 07.2-17(프로젝트 지우기) 전환 전. `depends_on` 전수 `[VERIFIED: 07.2-*-PLAN.md frontmatter]`: 17←{02,05,11,14,16}, 16←{05,07,11,15}, 15←{05,07,10,12,13}, 14←{05,06,12}, 13←{05,07,08,10}, 12←{01,05,06,10}, 11←{05,06}, 10←{01,05,06,08}, 08←{01,04,05}, 07←{05,08}, 06←{01,05}. **폐포 = 07.2-01,02,04,05,06,07,08,10,11,12,13,14,15,16,17 (03·04는 이미 main)**. **전환 뒤로 미뤄도 되는 것: 07.2-09, 07.2-18, 07.2-19**(18←{01,07,16}, 19←{02,05,16,17,18}) | 07.2-06은 07.2-05 필요(`07.2-06-PLAN.md:6`). ROADMAP의 07.2 체크박스·`Plans: 1/19`는 낡음(03·04 완료인데 04가 `[ ]`) — 계획은 SUMMARY 존재와 git으로 판정. 07.2는 07.3 계획 01~04 전부 머지 뒤(0049 = 07.3-03) 순서를 지킴 `[CITED: ROADMAP.md 07.2 Plans 줄]` |
| 서류 출력 소수점 페이즈 | 계획 입력만, 시작 전 `[VERIFIED: /mnt/project-files/document-print/plan-input.md:1-8]`; ROADMAP에 엔트리 없음(`grep 서류 출력` ROADMAP 0건) | 07.2-10 고객 견적서 PDF 인쇄 틀 재사용 |
| 「화면 항목 추가」(Phase 10 기준 4 / ADMN-07) | 전환 전으로 결정(2026-11-04), Phase 10에서 분리 예정 `[CITED: readiness:69]`. 의존: 04.5(완료) — 관리 화면·`field_definitions`→zod 조립·보관·노출표 `[VERIFIED: ROADMAP.md:1359-1370 "Phase 04.5 관리 화면이 프로젝트·견적 줄도 대상으로 받게 켜고"]`; 프로젝트·견적 줄 폼/목록/검색/Excel/DTO에 붙이는 것은 **Phase 4 폼 코드 위**이므로 **견적 표를 바꾸는 07.2-06·07.2-12·07.2-14 뒤**가 안전(같은 파일 충돌) — 추정 | 새 페이즈 번호는 사용자/로드맵 몫 |
| 07.6 매출 발행·입금 줄 지우기 | 계획 PR #342 — 전환 전 필수(사용자 카드 2026-11-04 13:04 KST 「전환 전 작은 플랜」) | 07.4 · 07.5와 같은 하드 게이트(VERIFICATION passed on main) |
| 손익(Phase 9/10 손익 화면) | 만들지 않음, 손익 메뉴 숨김 #339 `[VERIFIED: git 34cc9d3]` | D-910 소멸(§4.5) |
| 남은 사람 확인 | 06: 4건, 07.1: 11건 | |
| smtp 4개 | 사용자 몫 — 없으면 알림함만 `[CITED: OPERATIONS.md:244]` | |
| 「기획 PM」→「사원」 스테이징 | 사용자 몫(07.3-03 전 스테이징 개명) `[CITED: readiness:32]` | |
| CSO-3 | 06.2 `/cso` 정보성 항목: 「`expenses` 보기는 있고 `expenses.team` 보기는 없는 work_scope team 계급이 본인 → 팀으로 넓어진다. 시드 팀장·기획 PM은 D-6217이 의도」 — **사용자 확인 대기, 코드 작업 아님** `[VERIFIED: /mnt/attach/project-files/notes/06.2-review/186-cso.md CSO-3 행; 06.5-CONTEXT.md:153]` | 운영 권한표가 기본 시드 값인지 확인 |
| 이 클론에 없는 것 | PHP 인트라넷 코드·화면 | 비교 불가 |

## 8. 되돌릴 수 없는 문 (one-way doors) 과 안전 순서
1. **첫 프로덕션 승격**(마이그레이션 최대 49개, 롤백 하한 이후 복귀 불가) — 승격 직전 수동 백업(`gcloud sql backups create … --description=pre-promote-<날짜>`) → `SUCCESSFUL` 확인 → 가드 있는 마이그레이션이 멈추면 그 DB는 안 바뀜(원자) → 스모크 후 notify-tick 수동 1회. 사용자가 수행.
2. **demo 삭제 + 카운터 초기화 + 전환 마커**(D8-05·D8-09): dry-run → 건수 확인 → apply(확인 입력). 직전 수동 백업이 사실상의 되돌림 수단(복원은 하루 1회 단위 + 수동 백업 시점). PITR 꺼짐 `[VERIFIED: OPERATIONS.md:298]` → 수동 백업이 유일한 직전 복원점.
3. **전환 뒤 첫 번호 26001 부여**: 이후 번호는 재사용 안 함.
4. **운영 시크릿**: 버전 삭제 금지 `[VERIFIED: OPERATIONS.md:206]`.
5. **`bank_transfer` 코드표 값**을 지우거나 이름 바꾸지 않는다: 코드 여러 곳이 문자열로 고정 `[VERIFIED: domain/seed/expenses.ts:15 `{ value: "bank_transfer", label: "계좌이체", sortOrder: 0 }`; domain/expenses/payee.ts:7; domain/payments/bank-transfer.ts; payment-method/plan-input.md 항목 3 「지금 `bank_transfer` 고정」]` — 전환 전 코드표 정리(D8-06 연습용 마스터 보관) 중에 이 값을 보관하면 지급이 깨질 수 있다.
- 두 단계 패턴의 저장소 선례 = `purge-certs.ts`(dry-run 기본, `--apply`) + `restore-rehearsal.yml`(확인 입력 가드). 260907은 열쇠 둘 방식(§260907 대조).

## 9. Phase 8 계획에 반드시 넣을 추가 항목 — coordinator 목록(`precutover-extra-1104.md §2`) 검증

| # | 항목 | 검증 결과 |
|---|---|---|
| 1 | 전환일 체크리스트 자체가 없음 | **확인**: `grep -c "체크리스트" docs/OPERATIONS.md` = 0. 위치 제약은 §2(300줄 꽉 참) |
| 2 | `expenses`엔 `source` 없음 → projects.source로만 지우면 지출결의 잔존 | **확인 + 더 큼**: `expenses.ts`에 source 없음, `expenses.project_id → projects.id` FK(삭제 규칙 없음)라 프로젝트 삭제가 **FK 위반으로 실패**하고, 팀 지출결의는 프로젝트 없이 존재. 결재·파일·알림·참여자·예산·정산 결재도 같은 처지(§4.2) |
| 3 | 운영 DB에 마이그레이션 약 40개 한 번에 적용(0036 가드) | **확인**: 파일 49개(0000~0048); 운영 현재 위치는 확인 못 함(9/18 Phase 1 뼈대 추정). 0036 가드는 `expenses` 제출 문서의 증빙 금액 불일치를 센다 `[VERIFIED: 0036…sql:11-30]`. 사전 리허설 도구 없음, 원자성에 의존(§1.5) |
| 4 | 운영 복원 리허설 + 복원 확인 표에 직원 입력 표 추가(CEO-3) | **확인**: `RESTORE_CHECK_TABLES`에 `projects`·`quote_lines`·`revenue_entries` 등 없음, `expenses`는 `requireRows:false`로 이미 있음(`restore-check-tables.ts:4-19`). 추가 방식 §3 |
| 5 | 운영 설정 `tax.rounding.vat_unit`·`withholding_unit` ∈ {1,10} 확인 | **확인**: 스키마가 1·10만 허용, 기본값 1·10(`keys.ts:171-190`). 운영 값은 확인 못 함 → 사람 확인 |
| 6 | 개인카드 전표 운영 켜기(PJ15), 경영관리 증빙 권한(PJ13)이 07.3-02 시드로 되는지 | **확인**: `07.1-VERIFICATION.md:153`에 「PJ13 경영관리 evidence 권한 켜기 · PJ15 개인카드 전표 운영 켜기(Phase 8)」. 07.3-02(#340)의 시드가 이를 대체하는지는 07.3-02 머지 후 확인 — **지금은 확인 못 함** |
| 7 | 운영 배포 직후 증빙 GCS 업로드 스모크(형식·10MB) | **확인**: `06-VERIFICATION.md:45-47` human_verification. 스테이징은 GCS 드라이버로 통과, 운영 미실행 |
| 8 | `bank_transfer` 값 지우지 않기 | **확인**(§8-5) |
| 9 | 결재 위임·대행 없음 → 결재자 부재 시 멈춤(운영 안내) | **확인**: REQUIREMENTS Out of Scope 「대결(위임 결재)·조건부 결재 분기 … 빈 자리 건너뜀 + 설정에서 담당 변경으로 대체」 `[VERIFIED: .planning/REQUIREMENTS.md:187]`, 경영관리 부재 시 지급·증빙 확인·구매 완료는 돌아올 때까지 멈춤 `[VERIFIED: 06-CONTEXT.md:35 D-601]` → 체크리스트 「부재 시 담당 변경은 설정에서」 안내 문구 |
- 추가로 읽은 3건(§3 사용자 결정 후보): PITR(Open Q6), 보안 스캐너 CI(Q8), 공휴일 2026·2027 확정(P12).

## 260907 대조

> 260907 = `/home/user/erp_plant8_260907`(읽기 전용). 인트라넷이 아니라 규칙 대조용. 데이터 이전은 260917에서 빠짐(MIG-01~03 Out of Scope)이라 260907의 이관 도구는 「가져오지 않는 쪽」이 맞다.

| 항목 | 260907 (file:line) | 260917 now (file:line) | 계획에 주는 뜻 |
|---|---|---|---|
| 개시 청소(시험 자료 삭제) | `docs/90_결정-기록.md:1587-1612` 「실운영 개시 청소」 — **업무 자료 전부·시험 계정·시험 거래처·감사 기록·알림·세션** 진짜 삭제, 삭제 막이 트리거를 트랜잭션 안에서만 내렸다 되살림, 문서 번호는 max 기반이라 26001부터 다시, 실판 롤백 검증 뒤 적용. SQL 파일 `db/2026-08-24_실운영-개시-청소.sql` 자체는 이 클론에 없음(확인 못 함) | `scripts/demo-data.ts:452-564`(견본 삭제, 이름·이메일로 고름, FK 순서 구현), 감사 로그는 DB 트리거로 삭제 불가 `db/migrations/0046…sql:19-41` | 260907도 **`source` 같은 표시가 아니라 업무 표 전체를 비우는 방식**이었다 → 우리도 표 분류 방식이 같은 계열. 감사 로그를 지우는 쪽(트리거 내림)은 260917의 불변 결정(07-13)과 충돌하므로 따르지 않고 「남긴다」 |
| 저장 공간 파일 정리 순서 | `server/도구/시험파일지우기.mjs:1-26,26-48` — 「청소 SQL보다 **먼저** 돌린다. 판을 비우면 파일 열쇠를 잃어 고아 파일이 남는다」, `--세보기` 먼저, 6개 표(`receipt_files`…`vendor_documents`) 전수, 판 이름을 찍고 3초 대기, 쓰는 판이 아니면 `--판` 명시 | `files`에 FK 없는 `owner_id`·`object_key unique`(`db/schema/files.ts:13-16`), 증빙 버킷 `evidence/` 수명 규칙 없음(`bootstrap-gcp.sh:170-176`) | **객체 키를 DB 삭제 전에 읽어 두는 순서**를 계획에 반영(Open Q7). 우리는 DB가 트랜잭션이라 「키 수집 → DB 삭제 커밋 → 객체 삭제」가 안전(객체 삭제 실패는 고아 로그만) |
| 실판 접근 열쇠 | `server/도구/이관/gates.mjs:92-132` `실판판정` — `--실판허용`과 `--백업했다`를 **함께** 붙여야 실판이 열림 | 해당 없음(새 워크플로) | 우리 두 단계(dry-run→확인 입력)에 **「직전 백업 확인」을 입력 또는 자동 가드로 3번째 열쇠로** 넣는 근거(§4.6) |
| 판 고칠 때 순서 | `docs/91_클라우드런-올리기.md:270-286` 「더하기만 먼저, 지우기는 다음 배포로」 | `scripts/rollback.sh:14-17` 스키마 하한 거부 + 마이그레이션 `-- rollback-floor:`, `ARCHITECTURE §5 확장 전용(DROP 없음)`의 예외 0015·0036 | 첫 승격은 DROP 마이그레이션(0015·0036)을 포함한 채 롤백 불가 → 260907 규칙의 위반이 이미 승인된 예외(DECISIONS 04-50). 승격 전 백업 필수의 근거 |
| 배포 | `docs/91_클라우드런-올리기.md:332-349` 되돌리기 = 옛 리비전으로 트래픽만 `update-traffic --to-revisions`; `배포전확인.cmd:3-20` 배포 전 관문 여섯 | `.github/workflows/deploy.yml:125-173` + `scripts/promote-guard.sh:5-6` + `rollback.sh` | 260917은 가드·자동 롤백 한 번이 이미 코드화 — 새로 만들 것 없음. 단 「승격 SHA = 스테이징 서빙 SHA」 제약이 전환 직전 머지 동결을 요구 |
| 복원 리허설 | `docs/91_클라우드런-올리기.md`에서 `백업|복원|restore|PITR` 검색 0건(확인: grep) — 260907엔 복원 리허설·백업 복원 절차 없음 | `restore-rehearsal.yml`, `docs/RESTORE.md`, `ops.ts` | 260917이 앞섬. 대조로 얻을 것 없음 |
| 계정 발급 | `server/도구/시험계정넣기.mjs:1-18` — 연습 판에 직책별 시험 계정 5개(관리자에는 업무 권한이 없어 사람 만들기가 번거로워서), `--지우기` 제공 | `/admin/people` 등록 폼(`person-form.tsx:96`), `account.yml` | 전환 도구로 쓰지 않음. 260907의 교훈: 관리자 계정은 업무 권한이 없다 → 운영 첫 업무 계정은 계급을 갖게 발급 |
| 마스터 입력 | `server/도구/이관/`(harvest·transform·load·verify, `gates.mjs`·`cards.mjs`·`sales-import`) — **인트라넷 데이터 이전 도구**; 거래처는 한 번 들어가면 매출·대장이 물어 지울 수 없음(`server/src/migration-gates.test.ts:5-8` `vendors_no_delete`) | 데이터 이전 없음(MIG-05, REQUIREMENTS Out of Scope) — 화면 손 입력 | 이관 도구는 **의도적으로 안 가져온다**(사용자 결정 2026-09-23). 거래처에 대해 「연습으로 넣으면 지울 수 없다」는 260907 사실은 우리도 `vendors`가 참조되면 보관만 가능(D8-06 「보관이 막힐 수 있다」)과 같은 맥락 |
| 번호 | 260907 「문서 번호는 max 기반」(`docs/90_결정-기록.md:1587` 개시 청소 절) | `document_counters` 카운터 + `seqStart` 오프셋 (`document-numbering/index.ts:62-68`) | 우리는 카운터 표라 **max 기반이 아니다** → 삭제만으로는 번호가 안 돌아옴, 카운터 초기화 필수(§4.4) |
| 체크리스트 | `00_이어하기-지시문.md:5192-5196`(개시 청소 v2·시험파일지우기 확장·`docs/10_점검/2026-08-28_실판-배포-차례.md` 사용자 실행 절차 전체) — 그 파일은 이 클론에 없음(확인 못 함) | 없음(`docs/OPERATIONS.md` 체크리스트 0건) | 260907도 「사용자 실행 절차」를 별도 문서로 뒀다 → `docs/CUTOVER.md` 별도 문서 근거 |
| 시드 마무리 자국 | `db/schema/150_seed_cleanup.sql:1-20` 「씨앗이 선 판은 감사 기록이 0」 — 세우는 동안 쌓인 감사 자국을 걷음 | 260917은 시드 Job이 배포마다 `action_log`에 쓰는지 확인 못 함 | 전환일 첫 화면에서 관리자가 「아무도 안 한 로그」를 보지 않게 할지는 선택(불변 트리거 때문에 지울 수 없음 → 정리 표시만) |

## Standard Stack / 도구 (신규 의존성 없음)

| 쓰는 것 | 버전 | 용도 | 근거 |
|---|---|---|---|
| Next.js / TypeScript / Drizzle / vitest / Playwright | 저장소 기존 | 화면·도메인·테스트 | CLAUDE.md §1 |
| `scripts/build-cli.mjs` 번들 + Cloud Run Job + `account.yml` 패턴 | 기존 | demo 삭제 CLI 실행 | `scripts/build-cli.mjs:14,24` |
| GitHub Actions `google-github-actions/auth@v3`, `setup-gcloud@v3` | 기존 | WIF | `deploy.yml:109-113` |

**신규 패키지 없음 → Package Legitimacy Audit: 해당 없음** (CLAUDE.md §5 「새 의존성은 승인 후」 지킴).

## Don't Hand-Roll
| 문제 | 직접 만들지 말 것 | 쓸 것 | 이유 |
|---|---|---|---|
| FK 순서 삭제 | 새 순서표를 처음부터 | `scripts/demo-data.ts:452-564`의 순서 + 빠진 표 추가 | 이미 통합 시험(`test/integration/demo-data.test.ts`)으로 증명 |
| 두 단계 실행 | 새 확인 방식 | `purge-certs.ts` dry-run/`--apply` + `restore-rehearsal.yml` 입력 가드 | 선례 |
| 번호 채번 잠금 | 직접 UPDATE | `repositories/document-counters.ts` `lockDocumentCounter`/`ALL_PERIODS` 규약 | 동시 채번 교착 전례(`document-numbering/index.ts:116-123` 주석) |
| 백업 시각 조회 | 새 GCP 호출 | `lib/gcp/cloud-sql-admin.ts`(상태 화면이 사용) | 이미 있음 |
| 로그인 상태 판정 | 새 컬럼·쿼리 | `personLoginStatus` | 04.4 완료 |
| 운영 상태 점검 | 세션의 gcloud | `verify.yml`(WIF, 읽기 전용) — 필요하면 prod 점검 항목 추가(위험 경로 PR) | `OPERATIONS.md:167-172` |

## Common Pitfalls
1. **`source` 기반 삭제가 FK에서 실패/부분 삭제** — 지출결의·결재·파일이 남음(§4.2). 회피: 표 분류 + FK 순서 + 통합 시험(삭제 후 모든 업무 표 0행, 유지 표 불변).
2. **전환 후 새 행이 `'demo'`로 찍힘** — 쓰기 지점 4곳 + 기본값 5표(§4.1). 회피: 삭제 실행 후 통합 시험으로 각 표에 한 행 쓰고 `source` 확인.
3. **`restore_rehearsals.source`/`vendor_account_changes.source`를 demo 표시로 오인**. 회피: 이름 명시 목록, 정보스키마 자동 열거 금지.
4. **`expense` 카운터를 초기화 안 해서 프로젝트 26001에 이어진 지출결의 번호**(§4.4).
5. **`action_log` 삭제 시도 → `P0001 action_log is append-only` → 트랜잭션 전체 롤백**. 회피: 표 목록에서 제외, 시험으로 고정.
6. **프로덕션 리허설을 첫 승격 전에 시도** → `plant8-prod-restore` Job 없음 실패(§3).
7. **승격 직전 main 머지** → 스테이징 SHA가 바뀌어 가드가 입력 SHA를 거부(`promote-guard.sh`). 회피: 승격 창 동안 머지 동결.
8. **`bootstrap-gcp.sh` 재실행 누락** → 운영 배포가 `ensure_cert_bucket`/`ensure_evidence_bucket`에서 중단하거나 purge Scheduler가 조용히 건너뜀(경고만).
9. **리허설 결과 화면의 낡은 성공** — 기록 전 실패는 화면에 남지 않음 → 체크리스트가 **일시까지** 확인(CEO-7, `docs/RESTORE.md` §1-5).
10. **연습으로 넣은 연차 조정·마스터가 지워지지 않음** — `leave_adjustments`는 삭제 불가, `vendors`는 참조되면 보관만 → 체크리스트에서 조정은 demo 삭제 뒤.
11. **임시 비밀번호가 Actions 로그·Cloud Logging에 남음**(D-13) — 공유 화면 금지.
12. **OPERATIONS.md 301줄** → `docs-limits.test.ts` 실패(§2).

## Code Examples

두 단계 입력 가드(선례를 그대로 복제할 모양) `[VERIFIED: .github/workflows/restore-rehearsal.yml:47-62]`:
```yaml
- id: input-guard
  shell: bash
  env: { REF: ${{ github.ref }}, INPUT_ENV: ${{ inputs.env }}, CONFIRM_PRODUCTION: ${{ inputs.confirm_production }} }
  run: |
    if [ "$REF" != "refs/heads/main" ]; then echo "::error::main에서만 돕니다" >&2; exit 1; fi
    if [ "$INPUT_ENV" = "production" ] && [ "$CONFIRM_PRODUCTION" != "plant8-prod-db" ]; then exit 1; fi
```
dry-run 기본 / apply 명시 인자 파싱 `[VERIFIED: scripts/purge-certs.ts:11-24]`(등호 결합 `--flag=value` 거부, 플래그와 값은 별개 argv).
FK 순서·건수 집계 `[VERIFIED: scripts/demo-data.ts:505-545]`:
```ts
const record = (key: string, result: { rowCount: number | null }) => { counts[key] = (counts[key] ?? 0) + (result.rowCount ?? 0); };
await db.transaction(async (tx) => { /* 자식 → 부모 순서로 tx.delete(...) 후 record(...) */ });
```

## State of the Art / 변경점
| 이전 | 현재 | 영향 |
|---|---|---|
| Phase 8이 복원 리허설·로그인 표시까지 소유 | 04.4로 이동, main 완료(2026-09-24) | 이 페이즈는 프로덕션 1회 기록·체크리스트 확인만 |
| 데이터 이전·`migration_runs` | 폐기(2026-09-23) | 가져오기 스크립트 금지 |
| Phase 9 「전환 후 N주」 게이트 | 소멸(Phase 9 안 만듦, `pnl.start_gate` 삭제) | 전환 시각 소비자 없음(§4.5) |
| 확인증 파기 수동 월 1회 | Scheduler 월 1회 dry-run 시작(07.2-03, #337) | 첫 승격이 purge Scheduler·Job 2개를 운영에 만듦 |

## Runtime State Inventory
> 이 페이즈는 이름 바꾸기가 아니라 **운영 초기화/전환**이다. 「전환 뒤에도 옛 상태가 남는 곳」을 같은 5범주로 점검.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | 운영 DB의 demo 업무 행(§4.2 삭제 분류 표), `document_counters` 행(§4.4), 증빙 버킷 객체 | 데이터 삭제(demo 삭제 Job), 객체 삭제(Open Q7) |
| Live service config | Cloud Scheduler 2개(notify-tick, purge-certs-monthly), Cloud Run Job 7개, 경보 3개 — 첫 승격이 생성/갱신 | 승격 후 존재 확인(사용자), 수동 1회 실행 |
| OS-registered state | 없음 — Cloud Run/Scheduler는 위 | 없음(확인) |
| Secrets/env vars | `*-prod` 시크릿(smtp는 센티널), GitHub vars 4개 | smtp 값 입력(사용자), 이름 변경 없음 |
| Build artifacts | 운영 Artifact Registry에는 스테이징이 빌드한 SHA 태그 이미지만(운영은 빌드 안 함) | 승격 전 이미지 존재 확인(가드가 함) |

## Environment Availability
| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node | 로컬 테스트 | ✓ | v22.23.4 | — |
| pnpm | 모든 명령 | ✓ | 10.33.0 | — |
| psql (+ 로컬 Postgres 16) | 통합 시험 | ✓ psql, DB는 `pnpm db:dev`로 | — | — |
| gcloud / gh | (세션은 운영에 쓰지 않음) | ✓ 설치됨 | — | 운영 확인은 사용자·`verify.yml` |
| GitHub Actions 기록·GCP 콘솔 | 승격·리허설 이력 확인 | ✗ (이 세션에서 못 봄) | — | 사용자에게 확인 요청 항목으로 |
| 운영 DB·운영 설정 | 위험 마이그레이션 사전 점검 | ✗ (접근 금지) | — | 사용자가 화면으로 확인 |

**Missing with no fallback:** 운영 상태 조회(사용자 몫으로 체크리스트화). 

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest(projects `unit`·`integration`) + Playwright E2E `[VERIFIED: package.json:19-21, vitest.config.ts:14,22]` |
| Config file | `vitest.config.ts`, `playwright.config.ts` |
| Quick run command | `pnpm exec vitest run --project unit <파일>` |
| Full suite command | CI(ready PR). 로컬 통합: `flock /tmp/plant8-erp-test.lock sh -c 'pnpm db:dev && pnpm db:reset:test && pnpm exec vitest run --project integration <파일>'` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MIG-05 | demo 삭제가 분류된 모든 업무 표를 0행으로, 유지 표는 불변으로, `action_log` 불변 | integration | `… vitest run --project integration test/integration/cutover-demo-delete.test.ts` | ❌ Wave 0 (모델: `test/integration/demo-data.test.ts`) |
| MIG-05 | 모든 스키마 표가 삭제/유지/불변으로 분류됨(새 표 누락 시 실패) | integration(스키마 열거) | 위와 같은 파일 | ❌ Wave 0 |
| MIG-05 | dry-run은 아무것도 안 바꾸고 건수만; apply는 확인 불일치 시 거부 | unit | `pnpm exec vitest run --project unit test/unit/cutover/parse-args.test.ts` | ❌ Wave 0 (모델: purge-certs 인자 시험) |
| MIG-05/D8-05 | 삭제 후 각 `source` 표 1행 쓰기 → `source`가 마커를 따름(`'demo'` 아님) | integration | 위와 같은 파일 | ❌ Wave 0 |
| D8-09 | 삭제 후 첫 프로젝트 번호 = 첫 값, 같은 프로젝트의 첫 지출결의 순번도 1부터(`expense` 카운터) | integration | `test/integration/document-counters.test.ts` 옆 신규 | ❌ Wave 0 |
| MIG-05 | 워크플로 정적 검사(main 가드·확인 입력·concurrency·WIF 줄이 account.yml과 같음) | unit | `pnpm exec vitest run --project unit test/unit/deploy/cutover-workflow.test.ts` | ❌ Wave 0 (모델: `restore-rehearsal-workflow.test.ts`) |
| MIG-05 | Job 번들 진입점·`deploy_jobs` 줄 | unit | `pnpm exec vitest run --project unit test/unit/deploy/cli-bundle.test.ts test/unit/deploy/deploy-sh.test.ts` | ✅ 확장 |
| MIG-04 | 로그인 상태 배지 | integration | `… vitest run --project integration test/integration/people-login-status.test.ts` | ✅ (04.4) |
| OPS-03 | 리허설 가드·워크플로 | unit | `pnpm exec vitest run --project unit test/unit/deploy/restore-rehearsal-workflow.test.ts test/unit/deploy/restore-rehearsal-sh.test.ts` | ✅ |
| (CEO-3) | `RESTORE_CHECK_TABLES`에 직원 입력 표 추가 | unit | `restore-check-tables` 시험(경로는 계획이 `grep -rn RESTORE_CHECK_TABLES test`로 확인) | ✅ 확장 |
| 문서 | `docs/CUTOVER.md` 줄 상한·필수 단어, OPERATIONS 300줄 | unit | `pnpm exec vitest run --project unit test/unit/docs-limits.test.ts` | ✅ 확장 |
| 위험 경로 | 마이그레이션 일관(새 마이그레이션이 있을 때) | lint | `pnpm lint:sql` + `pnpm typecheck` | ✅ |

### Sampling Rate
- **Per task commit:** `pnpm typecheck` + 바뀐 파일의 `vitest run --project unit …`
- **Per wave merge:** 관련 통합 시험(위 flock 명령), `pnpm lint`·`pnpm lint:sql`
- **Phase gate:** CI 초록 + 사용자 확인 사람 항목(운영 승격·프로덕션 리허설·실제 전환은 자동 검증 불가 → 체크리스트의 「확인 증거」 칸)

### Wave 0 Gaps
- [ ] `test/integration/cutover-demo-delete.test.ts` — 분류 완전성 + 삭제 + 카운터 + 마커 + `source` 쓰기 (모델 `demo-data.test.ts`)
- [ ] `test/unit/cutover/*` — 인자 파싱·dry-run/apply 분기·확인 불일치 거부
- [ ] `test/unit/deploy/cutover-workflow.test.ts` — 정적 워크플로 검사
- [ ] `docs-limits.test.ts` 확장 — `docs/CUTOVER.md`

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | 예(계정 발급·임시 비밀번호) | 기존 `domain/auth/accounts.ts`; 비밀번호는 로그·화면 외 저장 금지(D-13) |
| V3 Session Management | 예(`reset`이 전 세션 만료) | 기존 |
| V4 Access Control | 예(워크플로 실행 권한 = 저장소 write, 앱 권한표) | main 가드·확인 입력(실수 방지, 경계 아님 `restore-rehearsal.yml:7-10`) |
| V5 Input Validation | 예(워크플로 입력→Job 인자) | 입력은 환경 변수로만 받고 `ARGS`를 화이트리스트 열거(T-1-32 전례, `verify-gcp.sh:2`) — 확인 문자열은 정규식 일치 |
| V6 Cryptography | 아니오(새 암호 없음) | — |
| 데이터 파기 | 예(증빙 객체·개인정보) | §4.3 객체 정리 |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| 잘못된 환경 대상 삭제 | Tampering | `env` 입력 + `confirm_production`, Job 이름은 `job_name "$ENV_SHORT" …` 파생 |
| 삭제 도구가 운영 DB에서 실수 재실행 | Tampering/Repudiation | 전환 마커가 이미 있으면 apply 거부(멱등 방어) + 행동 로그 1줄 |
| 임시 비밀번호가 Actions 요약에 노출 | Info disclosure | 요약에 쓰지 않음(기존 `account.yml`은 로그에만) |
| 불변 로그 우회 | Tampering | 트리거를 내리지 않는다 |
| 워크플로 입력 주입 | Tampering | `env:` 경유 쉘 변수만 사용 (`account.yml`·`restore-rehearsal.yml` 형태) |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 운영 DB 마이그레이션 현재 위치는 Phase 1 뼈대(앞 몇 개)다 | §1.5 | 가드 있는 마이그레이션 위험 평가가 달라짐 |
| A2 | `bootstrap-gcp.sh`를 운영에서 최신으로 재실행하지 않았을 수 있다(확인 못 함) | §1.3 P1 | 틀리면 승격이 곧바로 됨(좋은 쪽) |
| A3 | 앱 런타임 IAM DB 사용자가 모든 표의 소유자라 DELETE 가능 | §4.3 | 틀리면 Job이 권한 오류 — 첫 apply 전 dry-run에서 드러남 |
| A4 | 「대입 없음」 5표의 insert가 `source`를 안 넘긴다 | §4.1 | 틀리면 이미 일부는 명시값 — 영향 작음 |
| A5 | 운영에 견본 데이터가 만들어졌는지 여부 | §4.3 | 사용자 확인 |
| A6 | 「화면 항목 추가」 분리 페이즈는 07.2-06·12·14 뒤가 안전 | §7 | 순서가 바뀌면 병합 충돌 |
| A7 | 운영 `plant8-prod-restore` Job·0019 표가 없어 프로덕션 리허설이 지금은 불가 | §3 | 이미 배포돼 있다면 순서 제약이 풀림 |

## Open Questions (사용자 결정 필요)

1. **demo 삭제 대상의 기준을 `source` 컬럼에서 「코드에 이름으로 박은 표 분류 + 완전성 가드」로 바꿔도 되는가?** D8-05는 「`source` 컬럼이 있는 표」인데 현재 `source`는 업무 9표뿐이고 지출결의·결재·연차 신청·파일 등 15표 안팎에 없다(§4.2). 옵션 (a) 분류 방식(추천: 마이그레이션 없음, 새 표 누락을 가드 테스트가 막음, `leave_adjustments`·증빙 기록 같은 「유지」를 명시), (b) 빠진 표 전부에 `source` 추가 마이그레이션(위험 경로·사용자 머지·운영 마이그레이션 추가, 증빙 표는 의도적으로 안 둔 결정과 충돌 `evidence-records.ts:10`). **추천 (a).**
2. **「유지」 분류의 경계**: `leave_adjustments`(연차 기초 잔고)와 증빙 기록(`evidence_*`)과 거래처 서류를 전환 전에 연습 입력했다면 지우지 못한다. 추천: 체크리스트에 「연차 조정·증빙 일괄 등록은 demo 삭제 **뒤**」를 못 박고 도구는 이 표들을 건드리지 않는다. 다른 의견이면(예: 연습 증빙 기록도 지움) 알려 달라.
3. **번호 카운터 초기화 범위**: `project`만(D8-09 문구) vs `cert` 제외 전부. 프로젝트 번호가 재사용되므로 `expense`·`purchase_request`(period = 프로젝트 번호)는 사실상 필수(§4.4). **추천: `cert` 제외 전부 초기화.**
4. **전환 시각(마커) 저장 방식**: Phase 9 소멸로 소비자가 쓰기 지점뿐. 옵션 (1) 설정 한 키 `cutover.at` + 행동 로그 한 줄(추천), (2) 불리언만. 설정 화면에 보이지 않게 하는 방식도 정해야 함(관리자가 지우면 이후 입력이 `demo`로 되돌아가는 사고 방지 → 설정 화면에서 읽기 전용).
5. **첫 프로덕션 승격 시점**: 옵션 (a) 전환 준비 맨 앞(지금~, 운영에 업무 행이 거의 없는 때) + 전환 직전 재승격(추천), (b) 전환 직전 한 번에. (a)는 마이그레이션·Job·스케줄러 문제를 일찍 드러내고 프로덕션 리허설(최소 1주 전)을 가능하게 한다. 승격은 07.2/07.3이 끝나기 전에도 가능하나 그 뒤 위험 경로 마이그레이션(0049 이후)이 또 승격을 요구한다.
6. **PITR을 켤까?** 지금 복원 단위 하루 1회(최대 24시간 손실). 전환 뒤 돈 데이터는 하루치 지출결의를 잃을 수 있다. 비용은 작은 DB에서 월 몇 달러(D-06 $30 안). **추천: 전환 전에 켠다**(인스턴스 설정 변경 = 사용자 작업).
7. **증빙 GCS 객체를 demo 삭제 때 같이 지울까?** 개인정보·증빙이 고아로 남는 것을 막으려면 apply가 객체도 지워야 하고(260907은 청소 전에 별도 도구로 먼저 지움) 이는 되돌릴 수 없다(버킷 소프트 삭제 7일 기본값이 한 번 보호). 추천: apply가 DB 삭제 커밋 뒤 객체를 지우고 건수를 로그에 남김(실패는 고아 목록 로그) — 객체 삭제 권한은 런타임 SA `objectUser`로 충분한지 계획이 확인.
8. **보안 스캐너 CI(#109)를 첫 승격 전에 할까?** 사용자가 「운영 배포 준비 때」로 정함(`TODOS.md:171-178`). 추천: 첫 승격 PR 전에 별도 위험 경로 PR로.
9. **공휴일 2026·2027 확정**(지급일 계산이 기댐)과 **운영 세율 절사 설정 확인**(P11)은 사용자가 운영 화면에서 하는 확인이다 — 체크리스트 사전 항목으로 넣는 것에 동의?

## Sources

### Primary (HIGH — 이번 세션에서 파일을 열어 읽음)
- `.planning/phases/08-cutover/08-CONTEXT.md`, `.planning/ROADMAP.md:614-690,1191-1311,1312-1355,1357-1375`, `.planning/REQUIREMENTS.md:131-138,187,282-286`
- `.github/workflows/deploy.yml`, `restore-rehearsal.yml`, `account.yml`, `verify.yml`
- `scripts/deploy.sh`, `promote-guard.sh`, `rollback.sh`(머리), `bootstrap-gcp.sh`, `restore-rehearsal.sh`(가드), `restore-rehearsal-cli.ts`(패턴), `purge-certs.ts`, `demo-data.ts`, `verify-gcp.sh`, `db-bootstrap.ts`, `infra/names.sh`, `infra/purge-certs-auto.mode`
- `docs/OPERATIONS.md`(전체), `docs/RESTORE.md`, `docs/CERT-PURGE.md`, `test/unit/docs-limits.test.ts`, `test/unit/deploy/restore-rehearsal-workflow.test.ts`
- `db/schema/*.ts`(전 표 `source` 유무 스크립트 대조), `db/migrations/0019`, `0036`, `0046`, `domain/ops/restore-check-tables.ts`, `domain/document-numbering/index.ts`, `repositories/document-counters.ts`, `domain/settings/keys.ts`
- `app/(app)/admin/people/person-status.ts`, `…/person-form.tsx`, `app/(app)/admin/system-status/page.tsx`, `domain/seed/expenses.ts`
- `.planning/phases/07.2-new-features/07.2-*-PLAN.md` frontmatter(`depends_on`), `07.2-01-PLAN.md`, `07.2-17-PLAN.md`
- `/mnt/project-files/readiness/intranet-readiness-1104.md`, `/mnt/project-files/readiness/precutover-extra-1104.md`, `/mnt/project-files/document-print/plan-input.md`, `TODOS.md`, `07.1-VERIFICATION.md:148-154`, `06-VERIFICATION.md:43-48`, `06.5-CONTEXT.md:153`, `/mnt/attach/project-files/notes/06.2-review/186-cso.md`

### Secondary (MEDIUM)
- 260907: `/home/user/erp_plant8_260907/docs/90_결정-기록.md:1587-1612`, `docs/91_클라우드런-올리기.md`, `server/도구/시험파일지우기.mjs`, `server/도구/이관/gates.mjs`, `server/도구/시험계정넣기.mjs`, `00_이어하기-지시문.md:5190-5196`

### Tertiary / 확인 못 함
- GitHub Actions 실행 기록(운영 마지막 배포 run #24, 프로덕션 리허설 이력), GCP 상태(Job·Scheduler·버킷·백업 설정), 운영 DB 내용·설정값, PHP 인트라넷 코드, 260907의 개시 청소 SQL 파일 본문, 얕은 이력이라 `70a1235` 커밋 내용.

## Metadata

**Confidence breakdown:**
- Standard stack(도구): HIGH — 신규 없음
- Architecture/삭제 설계: MEDIUM-HIGH — 스키마·순서는 읽음, 5표 insert 세부와 권한은 추정
- 운영 승격 상태: LOW — 확인 못 함 항목이 많음(체크리스트화)
- Pitfalls: HIGH

**Research date:** 2026-11-04
**Valid until:** 07.2/07.3 머지 진행에 따라 7일(스키마 표 목록과 마이그레이션 번호가 바뀜 — 계획 직전 `db/schema` 표 열거를 다시 돌릴 것)
