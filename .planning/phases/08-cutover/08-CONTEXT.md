# Phase 8: 전환 - Context

**Gathered:** 2026-09-24
**Status:** Ready for planning

<domain>
## Phase Boundary

데이터 이전 없이 새 시스템으로 옮겨 탄다. 관리자가 Phase 3 관리 화면으로 마스터(거래처·클라이언트·직원·법인카드·분류 코드표)를 손으로 넣고 직원 계정을 발급하며, 준비가 끝나면 잡은 전환일부터 직원은 새 시스템에만 입력하고 인트라넷은 과거 기록 조회용이 된다. 전환 전에 DB 백업을 실제로 한 번 복원해 본다. 요구사항: MIG-04, MIG-05, OPS-03 (`.planning/ROADMAP.md` Phase 8 성공 기준 1~5).

이 페이즈의 산출물은 대부분 운영 절차(`docs/OPERATIONS.md` 전환 체크리스트·복원 절차)이고, 코드는 세 가지뿐이다: demo 행 삭제 워크플로(D8-05·D8-09), 사람 목록의 로그인 상태 표시(D8-07), 복원 리허설 워크플로와 상태 화면 항목(D8-08).

범위 밖: 가져오기 스크립트·전환용 새 입력 화면(성공 기준 1이 금지), 인트라넷 데이터 이전(MIG-01~03 Out of Scope), 재등록 프로젝트의 손익 표시(Phase 9), 알림·공휴일 표 자체(Phase 7).

**번호 규칙:** Phase 6~11 논의가 스레드별로 동시에 진행되어 연속 번호(D-102~)가 겹친다. 이 페이즈는 `D8-xx`를 쓴다(Phase 10의 `D10-xx`와 같은 방식). 앞 페이즈의 D-01~D-101은 그대로 유효하다.

</domain>

<decisions>
## Implementation Decisions

### 이미 확정된 입력 (다시 묻지 않음 — 출처가 정본)
- 데이터 이전 없음, 마스터 포함 전부 관리 화면에서 손으로 입력, 가져오기 스크립트·전환용 새 화면 없음 — ROADMAP Phase 8 기준 1, REQUIREMENTS MIG-05 (2026-09-23 사용자 결정)
- 인트라넷 비밀번호는 어떤 형태로도 들어오지 않고 계정은 새로 발급 — MIG-04. 발급은 `/admin/people` 등록 폼이 초기 비밀번호를 한 번 보여 주는 방식(Phase 3), 재발급은 `account.yml` 워크플로 `reset`(OPERATIONS §7)
- 초기 비밀번호로 로그인해도 변경을 강제하지 않고 내 계정 화면 배너로 안내한다(`password_is_temporary`) — Phase 1 D-08. 임시 비밀번호 전달은 관리자가 구두·메신저로 — D-13
- 전환 전 새 시스템 업무 입력은 전부 `source='demo'`, 전환일에 demo 행 삭제, 마스터·설정·권한은 남음 — Eng OV-1, MIG-05. Phase 4 표 4개(`projects`·`quote_revisions`·`quote_lines`·`revenue_entries`)에 `source` 컬럼(기본값 `'demo'`)이 있다. Phase 4 CONTEXT가 Phase 8 연결 지점으로 적은 `source='intranet'` 값은 데이터 이전 철회로 쓰이지 않는다
- 전환일 뒤 non-demo 행이 Phase 9의 손익 화면 공개 조건(전환 후 N주, 기본 2주 실입력)으로 세어진다 — Phase 9 D-910(개발 착수 조건이 아니라 직원에게 손익 화면을 여는 조건)
- 2026년 숫자는 전환일을 경계로 두 시스템에 나뉜다(사용자 수용) — ROADMAP 기준 4
- Cloud SQL 자동 백업이 켜져 있다(`deploy.sh` `--backup --backup-start-time=18:00 --retained-backups-count=7`, Phase 1 D-06). 상태 화면 「마지막 백업」은 Cloud SQL Admin API로 화면 로드 시 조회한다 — D-18
- 프로젝트 번호는 재사용하지 않고 결번을 허용한다. 번호는 `document_counters` 행 잠금으로 등록 시 부여 — Phase 4 D-42, `docs/inputs/phase-04-project-quote.md` §5

### 전환일과 경계 업무
- **D8-01:** **전환일은 준비가 끝난 뒤 다음 달 첫 영업일이다.** 준비 완료 = 체크리스트의 사전 항목(마스터 입력, 전 직원 계정 발급, 복원 리허설 1회 성공)이 끝난 상태. 월 마감·지급 주기가 두 시스템에 나뉘지 않게 하려는 것이다. 영업일 판정은 Phase 7 공휴일 표를 따른다(관리자가 체크리스트에서 날짜를 정하는 운영 규칙이며 코드 판정은 없다).
- **D8-02:** **전환일에 진행 중인 프로젝트는 새 시스템에 다시 등록하고(견적 줄 포함) 전환일 이후 지출만 새 시스템에 올린다.** 전환 전 지출은 인트라넷에 남는다. 등록은 기존 Phase 4 화면·상태 흐름(수주중 → 진행 전환, 차수 고객 승인)을 그대로 쓰며 예외 경로나 새 칸을 만들지 않는다. 이 행은 demo가 아니어야 하므로 재등록은 **전환일에 demo 삭제(D8-05) 직후** PM이 한다(그 전에 넣으면 demo로 찍혀 함께 지워진다) — 체크리스트 순서에 반영한다.
- **D8-03:** **인트라넷에서 결재·지급 대기 중인 지출결의는 전환 전날까지 인트라넷에서 결재를 끝내고, 이미 결재된 건의 지급도 인트라넷 기록대로 마무리한다.** 전환일까지 결재를 못 끝낸 건만 새 시스템에 다시 올린다. 체크리스트에 「인트라넷 결재 마감 공지」(전환 N영업일 전)를 넣는다.
- **D8-04:** **인트라넷은 기술적으로 막지 않고 공지로만 입력을 금지한다.** ROADMAP 기준 3의 「인트라넷 조회 전용 전환」 단계는 「인트라넷 입력 금지 공지」로 바꾼다. 공지의 예외는 하나 — D8-03에 따라 전환 전 결재된 건의 지급 처리 기록(경영관리). 계획 단계에서 ROADMAP 기준 3·4와 MIG-05 문구를 `gsd_run`으로 맞춘다. — **Reversibility:** reversible — 나중에 인트라넷 쪽에서 쓰기를 막아도 이 시스템은 바뀌지 않는다.

### demo 행 삭제
- **D8-05:** **demo 행 삭제는 GitHub Actions 워크플로로 실행한다**(`account.yml`과 같은 패턴: `workflow_dispatch` → 같은 컨테이너 이미지의 Cloud Run Job, WIF). 두 단계다: 먼저 표별 삭제 건수만 보여 주고(dry-run), 사람이 그 건수를 확인한 뒤 확인 입력을 넣어 다시 돌리면 실제로 지운다. 관리자 화면 버튼은 두지 않는다. **같은 실행·같은 트랜잭션에서 이후 입력이 demo로 찍히지 않게 바꾸고, 전환 시각을 저장한다.** 앱이 저장소 계층에서 `source: input.source ?? "demo"`로 값을 직접 쓰므로(`repositories/projects.ts` 등 4곳) 컬럼 기본값만 바꾸는 마이그레이션으로는 부족하고 배포 시점이라 같은 트랜잭션도 아니다 — 앱이 쓰는 source 값이 이 트랜잭션에서 기록하는 전환 표시를 따라야 한다. 저장한 전환 시각은 Phase 9 D-910의 「전환 후 N주」·「남은 기간」 계산 기준이다. 대상은 `source` 컬럼이 있는 모든 **업무 기록** 표다 — Phase 4 표 4개(+ 04-07이 더할 리저브 대장)와 Phase 5~7이 더하는 업무 기록(지출결의·결재 문서·연차 신청·지급·증빙·카드 사용·구매 요청 등). **관리자가 넣는 설정·규칙 성격의 행(알림 규칙과 그 시드, 연차 일수 설정, 권한·노출표, 코드표 등)은 대상이 아니다.** 계획 단계에서 그때의 스키마를 기준으로 목록을 이름으로 확정하고, 새 업무 표가 `source`를 빠뜨리면 실패하는 검사를 둔다. 리저브 기초 잔액처럼 실제 값을 전환 전에 넣고 싶은 업무 기록은 D8-02처럼 demo 삭제 뒤에 넣는다. — **Reversibility:** one-way — 지운 demo 행은 백업 복원 없이는 되살릴 수 없다. 실행 직전 최신 백업 확인이 체크리스트 앞 단계에 있다.
- **D8-06:** **연습하다 만든 가짜 마스터(거래처·카드 등)는 관리자가 기존 보관함 기능으로 치운다.** 마스터에는 demo 표시를 붙이지 않는다. demo 업무 행이 참조하고 있으면 보관이 막힐 수 있으므로 체크리스트에서 **demo 삭제 뒤에** 둔다.
- **D8-09:** **전환 뒤 첫 프로젝트 번호는 26001부터 다시 매긴다**(추천안 「인트라넷 다음 번호」가 아닌 사용자 선택). demo 삭제 워크플로가 같은 실행에서 `document_counters`를 처음으로 되돌린다. demo가 쓴 번호를 다시 쓰는 것은 「프로젝트 번호는 재사용하지 않는다」(`docs/inputs/phase-04-project-quote.md` §5)의 예외다 — demo 행이 전부 사라져 같은 번호의 옛 문서가 새 시스템에 남지 않기 때문이다. 인트라넷 사내번호도 `26xxx` 형식이라 **2026년 번호는 두 시스템에서 겹칠 수 있고, 사용자가 이를 수용했다.** 번호가 어느 시스템 것인지는 전환일로 구분한다(직원 공지에 한 줄). — **Reversibility:** one-way — 전환 뒤 매긴 번호는 재사용하지 않으므로 되돌릴 수 없다.

### 계정·로그인 확인
- **D8-07:** **사람 목록(`/admin/people`)에 「첫 로그인 전」·「임시 비밀번호 사용 중」 표시를 더한다.** 체크리스트의 「전 직원 로그인 확인」은 이 표시로 한다. D-08(변경 강제 없음)은 유지한다. **전환일까지 비밀번호를 안 바꾼 사람이 있어도 전환하고**, 그 사람은 전환 뒤 기존 재발급 경로로 다시 발급한다 — 한 사람 때문에 월초 전환(D8-01)이 한 달 밀리지 않게. ROADMAP 기준 2의 「전환일 전에 각자 로그인해 비밀번호를 바꾼다」는 목표이지 전환 조건이 아니다(계획 단계에서 문구를 맞춘다). 표시는 SYSTEM.md의 기존 배지·표 규약을 쓴다.

### 백업·복원 리허설
- **D8-08:** **복원 리허설은 GitHub Actions 워크플로(WIF)가 최신 자동 백업을 임시 Cloud SQL 인스턴스로 복원해 확인하고, 임시 인스턴스를 지운 뒤 결과를 기록한다.** 운영 DB는 건드리지 않는다 — 복원 대상 인스턴스 이름은 워크플로가 만들고 운영 인스턴스 이름과 같으면 거부한다(배포 계정이 `roles/cloudsql.admin`이라 잘못된 대상이면 운영을 덮어쓸 수 있다, `scripts/bootstrap-gcp.sh`). 운영 DB에 공인 IP가 없으므로(`--no-assign-ip`) 복원본 확인은 GitHub 러너가 아니라 사설망에 닿는 곳(Cloud Run Job 등)에서 한다. 확인 항목은 최소한 마이그레이션 버전 일치와 핵심 표가 읽히고 비어 있지 않은지이며, 운영 현재 행 수와 직접 비교하지 않는다(백업 뒤 입력으로 차이가 나는 게 정상). 정확한 목록은 계획에서 정한다. 결과(일시·백업 id·성공/실패·소요 시간)는 관리자 시스템 상태 화면의 「복원 리허설」 항목으로 보인다(기준 5). 전환 전 1회가 필수이고, 필요하면 같은 워크플로를 다시 돌릴 수 있다. 복원 절차 문서(OPS-03)는 이 워크플로 실행법과 실제 사고 시 수동 복원(PITR 포함 여부는 계획에서)을 함께 적는다. 임시 인스턴스 비용은 D-06 예산 안에서 수십 분 수준이어야 한다.

### Claude's Discretion
- 전환 표시·전환 시각을 무엇으로 저장할지(설정 키 대 전용 행) — D8-05의 「같은 트랜잭션」과 「앱이 쓰는 source 값이 따른다」 조건만 지키면 된다
- demo 행을 가리키는 행동 로그를 지울지 남길지(남긴다면 대상이 사라졌다는 표시)
- 「첫 로그인 전」을 기록할 칸의 형태(예: 첫 로그인 시각). `sessions` 행은 로그아웃·관리자 재발급 때 지워지므로(`deleteUserSessions`) 판정 근거로 쓰지 않는다
- 복원 리허설 결과를 어디에 기록할지(운영 DB 한 줄을 Cloud Run Job으로 쓰기 대 GCS 파일) — 사람이 운영 DB에 직접 명령하지 않는다는 금지 규칙을 지킨다
- 인트라넷 결재 마감 공지의 N영업일(기본 제안 3영업일)과 직원 공지 문안 템플릿
- 체크리스트의 정확한 순서. 기본 제안: 마스터 입력 확인 → 전 직원 계정 발급·로그인 상태 확인 → 복원 리허설 결과 확인 → 인트라넷 결재 마감 공지 → (전환일) 최신 백업 확인 → demo 행 삭제 + 번호 카운터 초기화 → 연습용 마스터 보관 → 진행 중 프로젝트 재등록 → 인트라넷 입력 금지 공지·직원 공지

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 페이즈 범위·요구사항
- `.planning/ROADMAP.md` — Phase 8 절(성공 기준 1~5 + 트레일링 문단), Overview의 2026-09-23 데이터 이전 제외 문단, Phase 9 착수 조건
- `.planning/REQUIREMENTS.md` — MIG-04, MIG-05, OPS-03, Out of Scope의 MIG-01~03
- `docs/inputs/` — Phase 8 입력 문서는 없다(`docs/inputs/README.md`가 Phase 8을 범위 밖으로 적었다). 번호 서식은 `docs/inputs/phase-04-project-quote.md` §5

### 앞 페이즈 결정
- `.planning/phases/01-deploy-skeleton-login/01-CONTEXT.md` — D-06(자동 백업·비용 상한), D-08(임시 비밀번호 배너), D-11·D-13(계정 발급·전달), D-16(백업 실패 경보), D-18(상태 화면 조회 방식)
- `.planning/phases/03-permissions-settings-masters/03-CONTEXT.md` — 관리 화면·보관함 규약
- `.planning/phases/04-project-quote-ledger/04-CONTEXT.md` (브랜치 `claude/gsd-progress-e1nzgu`에서 main보다 앞섬) — D-42(번호 부여), `source` 컬럼(Eng OV-1), D-72~74(철회된 추출 스크립트 — 참고만)
- `.planning/phases/05-expense-approval-leave/05-CONTEXT.md` (초안 PR #41) — Phase 5가 더하는 업무 표(demo 삭제 대상)
- `.planning/phases/09-project-pnl/09-CONTEXT.md` — D-910(전환 후 실입력 N주 = 손익 화면 공개 조건, non-demo 행을 센다)

### 운영·구조
- `docs/OPERATIONS.md` — §6(경보), §7(계정 운영·`account.yml`), §10(상태 화면). 전환 체크리스트와 복원 절차가 여기에 새 절로 들어간다
- `docs/ARCHITECTURE.md` — 4계층 구조, 설정 레지스트리
- `.github/workflows/account.yml` — demo 삭제·복원 리허설 워크플로가 따를 패턴
- `scripts/deploy.sh` — Cloud SQL 백업 설정(200행 부근), 백업 실패 경보 정책

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/(app)/admin/people/` — 사람 등록 폼이 초기 비밀번호를 한 번 보여 준다(`person-form.tsx`). D8-07 표시는 이 목록에 더한다
- `db/schema/auth.ts` `passwordIsTemporary` — 「임시 비밀번호 사용 중」 판정 원본. 「첫 로그인 전」은 원본 칸이 없어 새로 기록해야 한다(`sessions`는 지워지는 행이라 부적합)
- `app/(app)/admin/system-status/page.tsx` + `lib/gcp/cloud-sql-admin.ts` — 마지막 백업 표시(ok/none/확인 불가). 복원 리허설 항목을 같은 자리에 더한다
- `app/(app)/admin/archive/` — 보관함(D8-06)
- `.github/workflows/account.yml` — WIF로 Cloud Run Job을 띄우는 기존 워크플로(demo 삭제·복원 리허설 워크플로의 본보기)

### Established Patterns
- 운영 작업은 화면 버튼이 아니라 `workflow_dispatch` 워크플로 + Cloud Run Job(OPERATIONS §7). 세션은 gcloud를 직접 쓰지 않는다
- 상태 화면은 캐시 없이 화면 로드 시 조회, GCP 조회 불가면 「확인 불가」(D-18)
- 업무 행은 `source` 컬럼 기본값 `'demo'`(Phase 4 표 4개)

### Integration Points
- demo 삭제 대상 목록은 Phase 5~7 스키마가 정해진 뒤 확정된다 — Phase 8 계획은 Phase 7 완료 뒤
- `document_counters`(Phase 4) — D8-09 카운터 초기화
- Phase 9 손익 화면 공개 조건(D-910)이 non-demo 행을 센다

</code_context>

<specifics>
## Specific Ideas

- 월초 전환(D8-01)과 「안 바꾼 사람이 있어도 전환」(D8-07)은 한 묶음이다 — 전환을 한 달씩 미루지 않는 것이 우선
- 되돌릴 수 없는 작업(demo 삭제·번호 설정)은 건수 미리보기 → 확인 입력의 두 단계로만 실행

</specifics>

<deferred>
## Deferred Ideas

- 재등록 프로젝트(D8-02)의 손익에서 전환 전 지출이 빠진 것을 어떻게 보여 줄지 — Phase 9 소관
- 인트라넷 쓰기 기술 차단 — 사용자가 공지만으로 정함(D8-04). 필요해지면 인트라넷 쪽 작업이라 이 시스템 범위 밖
- 정기(분기 등) 복원 리허설 일정 — 요구사항은 1회. 필요하면 D8-08 워크플로를 스케줄로 거는 것은 나중 일

</deferred>

---

*Phase: 08-cutover*
*Context gathered: 2026-09-24*
