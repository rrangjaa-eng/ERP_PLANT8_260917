# Phase 1: 배포 스켈레톤·로그인 - Context

**Gathered:** 2026-09-18
**Status:** Ready for planning

<domain>
## Phase Boundary

`scripts/deploy.sh` 한 번으로 회사 GCP 프로젝트(서울)에 Cloud Run + Cloud SQL + Secret Manager + Artifact Registry가 서고 앱이 뜬다. 직원이 이메일+비밀번호로 로그인하고, 브라우저를 닫았다 열어도 세션이 유지되며, 비밀번호를 바꾸고, 어디서든 로그아웃한다. 이 페이즈가 세우는 뼈대: Next.js 단일 앱 4계층(`app/ → domain/ → repositories/(viewer 필수) → db/`), next-safe-action `authedActionClient`, better-auth + `login_attempts` 잠금, drizzle-kit generate + Squawk, Cloud Run Job(migrate) → 0% 리비전 → 스모크 → 100% 배포와 `rollback.sh`, Cloud Monitoring 경보 3개, 3계층 테스트(Vitest 단위·Vitest+Postgres 통합·Playwright E2E) CI, `docs/ARCHITECTURE.md`·`docs/OPERATIONS.md`, 관리자 시스템 상태 화면 뼈대, JSON 서버 로그.

화면은 로그인·내 계정(비밀번호 변경·로그아웃)·관리자 상태 화면 셋뿐이고 전부 무스타일 임시 화면이다(Phase 2가 교체). 업무 화면·계정 관리 화면(Phase 3)·이메일 발송(Phase 7)은 없다. 회사 GCP 프로젝트는 확보됐고(2026-09-18), deploy.sh 첫 성공이 페이즈 완료 조건이다.

</domain>

<decisions>
## Implementation Decisions

로드맵 Phase 1 절과 엔지니어링 리뷰(Issue 1·2·4·5·14, OV-3)에서 잠긴 기술 선택은 여기 반복하지 않는다. 아래는 이번 논의에서 추가로 확정한 것이다.

### 개발·배포 동선
- **D-01:** 개발 환경은 클라우드 세션(claude.ai/code)과 사용자 PC 둘 다 동등하게 지원한다. 통합 테스트용 Postgres는 스크립트 하나(예: `scripts/dev-db.sh`)가 환경을 감지한다 — Docker가 있으면 컨테이너, 없으면(클라우드 세션) apt로 설치한 Postgres. 클라우드 세션에서는 `.claude/settings.json`의 SessionStart 훅이 이 스크립트를 자동 실행한다. PC는 Docker Desktop이 있다고 전제한다. 통합·E2E 테스트를 CI에서만 돌리는 방식은 거부했다(TDD 사이클과 CLAUDE.md "실제 실행 확인" 규칙 때문).
- **D-02:** deploy.sh의 실행 주체는 GitHub Actions다. main 병합 → CI 통과 → 같은 워크플로가 deploy.sh를 실행한다. GCP 인증은 Workload Identity Federation(키 파일 없음). 사용자 PC에 gcloud를 요구하지 않는다. 단, WIF 풀·서비스 계정을 만드는 최초 1회 부트스트랩은 GitHub Actions가 스스로 할 수 없으므로 별도 스크립트(예: `scripts/bootstrap-gcp.sh`)를 사용자가 Cloud Shell(브라우저)에서 한 번 실행한다 — 이 예외는 OPERATIONS.md에 적는다. — **Reversibility:** costly — 수동 배포로 되돌리면 CI 워크플로·WIF·GitHub Environment 설정을 걷어내야 한다.
- **D-03:** 회사 GCP 조직에서 사용자 계정의 Owner 권한이 확보됐다(2026-09-18 사용자 확인 — 대기 조건 없음). 프로젝트는 아직 없으며 사용자가 콘솔에서 직접 만든다: 프로젝트 1개(스테이징·프로덕션은 그 안에서 분리 — D-04), 회사 조직 아래, 회사 결제 계정 연결까지. 이것이 01-07 부트스트랩 사람 체크포인트의 전제 조건이며 스크립트는 프로젝트를 만들지 않는다(재해 복구용 재현은 이월). 플랜 순서는 로컬에서 되는 것(앱 골격·인증·CLI·CI·문서·상태 화면 코드) → 실제 GCP가 필요한 것(부트스트랩·deploy.sh 첫 실행·경보·상태 화면 GCP 조회 확인) 순으로 두되, 마지막 플랜을 뒤로 미루지 않고 바로 이어서 실행한다. 부트스트랩(WIF·서비스 계정·조직 정책 확인)은 배포 플랜 직전의 사람 체크포인트다. 프로젝트 ID는 리포·문서에 적지 않고 변수명(`GCP_PROJECT_ID`)만 두며, 실제 값은 실행 단계에서 GitHub Actions 변수와 deploy.sh 인자로 넣는다. 리전은 `asia-northeast3`, 사용자 계정이 프로젝트 Owner이고 결제 계정이 연결돼 있다고 가정한다. 페이즈 완료 판정은 deploy.sh 성공이다.
- **D-04:** 환경은 스테이징 + 프로덕션 둘이며, 같은 회사 GCP 프로젝트 하나 안에 Cloud Run 서비스 2개(예: `erp-staging`·`erp-prod`)와 Cloud SQL 인스턴스 2대, 환경 접미사가 붙은 시크릿으로 분리한다. deploy.sh는 환경 이름을 인자로 받고, 프로젝트 ID·리전 인자(재해 복구·다른 프로젝트 재현용)는 로드맵대로 유지한다. 별도 GCP 프로젝트 2개는 거부했다(조직 정책·IAM 확인이 두 번). — **Reversibility:** costly — 인스턴스를 나중에 합치거나 프로젝트를 나누려면 DB 이전이 필요하다.
- **D-05:** 승격 흐름: main 병합 → CI → 스테이징 자동 배포(migrate Job → 0% 리비전 → 스모크 → 100%) → 사용자가 스테이징에서 확인 → GitHub Environment `production`의 승인 버튼(required reviewer = 사용자) → 같은 git SHA 이미지를 프로덕션에 같은 순서로 배포. 빌드는 한 번, 태그 규칙 없음, 승인 기록은 GitHub에 남는다. 저장소는 개인 계정 `rrangjaa-eng`의 비공개 저장소로 유지하고(사용자 결정 B, 2026-09-18), 비공개 저장소의 Environment 보호 규칙(required reviewers)을 쓰기 위해 GitHub Pro(개인, 월 $4)로 올린다. 회사 GitHub 조직으로의 이전은 이월한다 — 이전하면 WIF가 저장소 경로에 묶여 있어 `bootstrap-gcp.sh`를 다시 돌려야 한다.
- **D-06:** Cloud SQL은 두 환경 모두 최소 사양(공유 코어 db-f1-micro급, 최소 스토리지, 자동 백업 켬)이며 두 환경 합계 월 $30 안팎이 상한이다. 초과하면 스테이징을 먼저 줄인다(중지 스케줄은 지금은 하지 않음). 커넥션 풀 크기·max-instances는 이 티어의 `max_connections`를 기준으로 계획에서 정하고 deploy.sh의 `max-instances × 풀 ≤ max_connections − 5` 검사(16A)에 넣는다. 실제 과금 항목과 목표는 OPERATIONS.md 비용 절에 적는다.

### 세션·비밀번호 정책
- **D-07:** 로그인 세션은 30일이며 사용할 때마다 만료가 연장된다(sliding). 30일 동안 안 쓰면 재로그인. 퇴사자 차단은 Phase 3의 계정 비활성화가 담당한다.
- **D-08:** 관리자가 발급·재발급한 초기 비밀번호로 로그인해도 변경을 강제하지 않는다. 대신 내 계정 화면에 "임시 비밀번호를 쓰고 있습니다 — 바꾸세요" 배너를 띄운다. 이를 위해 계정에 "임시 비밀번호 사용 중" 표시(예: `password_is_temporary`)가 필요하고, 본인이 비밀번호를 바꾸면 해제된다.
- **D-09:** 비밀번호 규칙은 8자 이상뿐이다. 문자 조합 강제 없음. 흔한 비밀번호(예: `password`, `12345678`) 소규모 내장 목록만 차단한다. 무차별 대입은 로드맵의 잠금(15분 창 N회, 기본 5)과 IP 속도 제한이 막는다. 규칙을 설정 키로 두는 것은 거부했다(설정 항목 최소화, Pitfall 2).
- **D-10:** 여러 기기 동시 로그인을 허용한다. 로그아웃은 현재 기기 세션만 끝낸다. 본인이 비밀번호를 바꾸거나 관리자가 재발급하면 그 사용자의 모든 세션을 만료시킨다. "모든 기기에서 로그아웃" 버튼은 만들지 않는다.

### 계정 발급·첫 관리자
- **D-11:** Phase 1의 계정 발급 수단은 CLI 하나다(예: `pnpm account:create --email … --name … [--admin]`). 무작위 임시 비밀번호를 터미널에 한 번만 출력하고, `--reset`으로 재발급한다(AUTH-03의 관리자 재발급). 운영 환경에서는 같은 컨테이너 이미지의 Cloud Run Job으로 실행한다. 첫 관리자 계정도 자동 시드가 아니라 이 CLI에 `--admin`을 붙여 사용자가 스테이징·프로덕션에서 각각 한 번 실행해 만든다. CSV 일괄 발급은 만들지 않는다.
- **D-12:** Phase 1에서 실제로 만드는 계정은 관리자 1(사용자 본인) + 테스트 직원 1뿐이다. 전 직원 계정은 Phase 3 관리 화면(MAST-02)에서 발급한다. 통합·E2E 테스트는 자체 픽스처 계정을 쓰고 실계정 정보는 리포에 넣지 않는다.
- **D-13:** 임시 비밀번호는 관리자가 직접(구두·메신저) 전달한다. 시스템은 관여하지 않고 유효 기한도 없다(이메일 발송은 Phase 7).
- **D-14:** Phase 1의 계급은 관리자/직원 둘뿐이다(예: 계정의 `is_admin` 하나). Phase 3가 계급 5종·권한표·정보 노출표로 교체한다. — **Reversibility:** reversible — Phase 3 마이그레이션이 이미 로드맵에 있고 이 시점 계정은 2개뿐이다.

### URL·경보·상태 화면
- **D-15:** 접속 주소는 Cloud Run 기본 URL(`*.run.app`)로 시작한다. 회사 도메인은 직원에게 열기 전(Phase 2~3)에 붙이며, 지금은 deploy.sh에 선택 인자 자리만 둔다. 서울 리전에서 Cloud Run 도메인 매핑이 되는지는 리서치가 확인하고, 안 되면 로드밸런서 방식을 그때 계획한다.
- **D-16:** 경보 3개(5xx > 5%·알림 tick 24시간 미성공·백업 실패)는 환경 변수 `ALERT_EMAIL` 하나로 가는 Cloud Monitoring 알림 채널을 deploy.sh가 만든다. 스테이징·프로덕션 모두 같은 주소이며 정책 이름·제목에 환경을 표시한다. 배포 실패는 GitHub Actions 워크플로 실패 알림(GitHub 기본)으로 받는다. (tick 경보는 Phase 7에서 tick이 생기기 전까지 발화하지 않도록 조건을 두거나 Phase 7에서 켠다 — 계획에서 정한다.)
- **D-17:** 관리자 시스템 상태 화면은 관리자 계급만 본다. 직원이 접근하면 404. 한도 초과 배너도 관리자에게만.
- **D-18:** 상태 화면의 "마지막 백업"은 Cloud SQL Admin API, "DB 커넥션"은 `pg_stat_activity`를 화면 로드 시 직접 조회한다(캐시·별도 저장 없음). Cloud Run 서비스 계정에 Cloud SQL 읽기 권한만 추가한다. 로컬 개발처럼 GCP 조회가 불가능하면 "확인 불가"로 표시한다.

### Claude's Discretion
- 리포 디렉터리 배치(최상위 `app/ domain/ repositories/ db/` vs `src/` 아래), Node 24·pnpm 버전 고정, Dockerfile(멀티스테이지·standalone), `.github/workflows` 분리 방식
- WIF 풀·프로바이더·서비스 계정 이름과 최소 권한 세트, 부트스트랩 스크립트와 deploy.sh의 책임 경계
- 스모크 테스트 내용(예: `/healthz` + 로그인 페이지 200), JSON 로그 라이브러리와 필드
- better-auth 설정 세부(쿠키 이름·updateAge), 잠금 화면 문구와 남은 시간 표시 여부, 로그인 실패 시 이메일/비밀번호 구분 없이 같은 문구
- 흔한 비밀번호 목록 크기, `password_is_temporary` 구현 방식, 계정 CLI의 위치와 Cloud Run Job 실행 절차
- 상태 화면 배너 한도 값(예: 커넥션 80%), 배포 버전 표기(git SHA + 배포 시각)
- 스테이징 DB에 넣는 데이터(비어 있음 + 테스트 계정 1)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 페이즈 범위·요구사항
- `.planning/ROADMAP.md` §"Phase 1: 배포 스켈레톤·로그인" — 성공 기준 1~7과 화면 범위 문단. 기술 선택의 1차 출처
- `.planning/REQUIREMENTS.md` — AUTH-01~04, OPS-01, OPS-02, OPS-04, OPS-06, OPS-07 (OPS-03 백업 복원 리허설·OPS-05 행동 로그는 다른 페이즈)
- `.planning/PROJECT.md` §Constraints·§Key Decisions — 호스팅 확정, 코딩 규칙, 로그인 방식 전환(환경 변수), 시크릿 금지

### 리뷰 결정
- `docs/designs/plant8-erp-roadmap-eng-review-260917.md` — Issue 1(4계층·Hono/REST/raw pg 배제), Issue 2(next-safe-action + ESLint 커스텀 규칙), Issue 4(Cloud Run Job migrate·Squawk·Artifact Registry SHA 태그·더티 트리 거부·rollback.sh), Issue 5(rateLimit + `login_attempts` 잠금), Issue 14(3계층 테스트), OV-3(Phase 1부터 회사 GCP), Diagram 2(배포 파이프라인), Failure Modes F2·F3·F10, Worktree S1·S2
- `docs/designs/plant8-erp-roadmap-ceo-review-260917.md` — D5(SMTP 환경 변수 4개는 정의만), OV-6(deploy.sh 1회 성공 게이트), 16A(커넥션 공식)

### 리서치
- `.planning/research/STACK.md` — better-auth·Drizzle·Node 24·Docker 멀티스테이지·Part A 호스팅 비교(Neon 대신 Cloud SQL을 택한 근거)
- `.planning/research/PITFALLS.md` — Pitfall 11(콜드스타트·커넥션 폭증·"스케일-투-제로인데 비싸다"), Pitfall 1(과잉설계), Pitfall 14(AI 드리프트)
- `.planning/research/ARCHITECTURE.md` — 참고용만. Hono·REST·raw pg 부분은 채택하지 않는다(Issue 1)
- `docs/research/cloud-session-setup.md` — 클라우드 세션 전제(리포 내 `.claude/`, SessionStart 훅 패턴, `CLAUDE_CODE_REMOTE` 분기)

### 리포 규칙·기존 설정
- `CLAUDE.md` — 스택·코딩 규칙·명령 4개(dev·test·lint·build)를 Phase 1 완료 시 채운다는 약속
- `.claude/settings.json` — 기존 SessionStart 훅(dev-db 훅은 여기에 더한다)
- `TODOS.md` §"Google Workspace SMTP 릴레이 설정 확인" — Phase 1은 SMTP 환경 변수 정의만
- `docs/DESIGN.md` — Phase 1 화면은 무스타일 임시라 적용하지 않지만, Phase 2 교체를 전제로 화면 구조를 단순하게 둔다

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- 앱 코드 없음(그린필드). 리포에는 문서·계획·`.claude/` 도구뿐이다
- `.claude/settings.json` SessionStart 훅과 `scripts/install_pkgs.sh` — 클라우드 세션 부팅 경로가 이미 있다. D-01의 dev-db 훅을 같은 자리에 더한다
- `scripts/` 디렉터리 관례(셸 스크립트)가 있으므로 deploy.sh·rollback.sh·bootstrap·dev-db도 여기에 둔다

### Established Patterns
- 커밋 메시지: 영어 접두어 + 짧은 요약, 본문 한국어(CLAUDE.md)
- 패키지 매니저 pnpm만. 새 의존성은 이유 한 줄 + 승인(next-safe-action은 이미 승인, 버전 고정)
- 상태의 단일 출처는 `.planning/`; `docs/ARCHITECTURE.md`·`docs/OPERATIONS.md`는 300줄 상한

### Integration Points
- `CLAUDE.md`의 명령 4개 자리 — Phase 1 끝에 실제 스크립트 이름으로 채운다(세션 끝에 몰아서 수정하는 규칙 준수)
- `docs/ARCHITECTURE.md`·`docs/OPERATIONS.md` 신규 — 이후 모든 페이즈가 갱신한다
- Phase 3가 교체할 지점: 계급(관리자/직원 → 5종), 계정 CLI → 관리 화면, 잠금 해제 → 관리 화면, 행동 로그(잠금·해제 기록은 Phase 1에선 최소 표 또는 JSON 로그로)

</code_context>

<specifics>
## Specific Ideas

- 사용자는 배포마다 자기 손이 가는 방식을 원하지 않는다 — "배포된다"의 증명은 GitHub에서 승인 버튼 하나로 끝나야 한다
- 비용 상한은 두 환경 합계 월 $30 안팎이며, 이 숫자를 OPERATIONS.md에 적고 상태 화면 배너의 근거로 삼는다
- 직원 마찰 최소화 우선: 비밀번호 조합 강제 없음, 초기 비밀번호 변경 강제 없음, 30일 세션, 다중 기기 허용 — 보안은 잠금·속도 제한·전 세션 만료로 보완

</specifics>

<deferred>
## Deferred Ideas

- 회사 도메인 연결(예: `erp.plant8.co.kr`) — Phase 2~3, 직원 공개 전. deploy.sh 인자 자리만 Phase 1
- 전 직원 계정 발급·계정 비활성화·잠금 해제 화면 — Phase 3(MAST-02, 관리 콘솔)
- 경보 수신자에 경영관리 추가 — 운영 안정화 뒤, `ALERT_EMAIL`을 목록으로 확장
- "모든 기기에서 로그아웃" 버튼, 임시 비밀번호 유효 기한 — 필요가 생기면
- 스테이징 Cloud SQL 중지 스케줄 — 월 비용이 $30을 넘을 때
- Google 로그인 활성화 — v2(AUTH-05), Phase 1은 어댑터 자리만
- 저장소를 회사 GitHub 조직으로 이전 — 코드 소유권을 회사로. 이전 시 WIF 속성 조건(저장소 경로)·Environment 설정·Claude GitHub 앱 설치를 다시 해야 하므로 `bootstrap-gcp.sh` 재실행 포함

</deferred>

---

*Phase: 01-배포 스켈레톤·로그인*
*Context gathered: 2026-09-18*
