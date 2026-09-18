# Phase 1: 배포 스켈레톤·로그인 - Research

**Researched:** 2026-09-18
**Domain:** Next.js 16 단일 앱 배포 파이프라인(Cloud Run + Cloud SQL, 서울) + better-auth 인증/잠금 + next-safe-action + Drizzle 마이그레이션 린트
**Confidence:** MEDIUM-HIGH — 라이브러리 API(버전·설정 옵션)는 npm 레지스트리 직접 조회 + 공식 GitHub raw 문서로 HIGH. GCP 리전별 가용성(Cloud Run 도메인 매핑·Cloud SQL 가격)은 `docs.cloud.google.com`이 이 세션의 네트워크 프록시에서 차단되어 있어 WebSearch 종합에만 의존했고 MEDIUM 이하로 낮춰 표기했다.

<network_note>
이 세션의 아웃바운드 프록시는 `docs.cloud.google.com`, `better-auth.com`, `next-safe-action.dev`, `dev.to`, `doc.nais.io`, `webcache.googleusercontent.com`을 차단했다(`EGRESS_BLOCKED`). 이 도메인들의 1차 문서는 직접 열지 못했고, `raw.githubusercontent.com`(better-auth·google-github-actions·drizzle 등의 리포)과 WebSearch 종합으로 대체했다. GCP 리전 가용성·가격처럼 `docs.cloud.google.com`에서만 확정되는 항목은 아래에서 개별적으로 `[ASSUMED]`로 낮춰 표시했다 — 계획 단계에서 회사 GCP 확보 후 실제 `gcloud` 명령으로 재확인이 필요하다.
</network_note>

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

로드맵 Phase 1 절과 엔지니어링 리뷰(Issue 1·2·4·5·14, OV-3)에서 잠긴 기술 선택은 여기 반복하지 않는다. 아래는 `/gsd-discuss-phase`에서 추가로 확정한 것이다.

**개발·배포 동선**
- **D-01:** 개발 환경은 클라우드 세션(claude.ai/code)과 사용자 PC 둘 다 동등하게 지원한다. 통합 테스트용 Postgres는 스크립트 하나(예: `scripts/dev-db.sh`)가 환경을 감지한다 — Docker가 있으면 컨테이너, 없으면(클라우드 세션) apt로 설치한 Postgres. 클라우드 세션에서는 `.claude/settings.json`의 SessionStart 훅이 이 스크립트를 자동 실행한다. PC는 Docker Desktop이 있다고 전제한다. 통합·E2E 테스트를 CI에서만 돌리는 방식은 거부했다(TDD 사이클과 CLAUDE.md "실제 실행 확인" 규칙 때문).
- **D-02:** deploy.sh의 실행 주체는 GitHub Actions다. main 병합 → CI 통과 → 같은 워크플로가 deploy.sh를 실행한다. GCP 인증은 Workload Identity Federation(키 파일 없음). 사용자 PC에 gcloud를 요구하지 않는다. 단, WIF 풀·서비스 계정을 만드는 최초 1회 부트스트랩은 GitHub Actions가 스스로 할 수 없으므로 별도 스크립트(예: `scripts/bootstrap-gcp.sh`)를 사용자가 Cloud Shell(브라우저)에서 한 번 실행한다 — 이 예외는 OPERATIONS.md에 적는다. — **Reversibility:** costly.
- **D-03:** 회사 GCP가 확보되기 전(2026-09 넷째 주 예정)에는 로컬에서 되는 플랜(앱 골격·인증·CLI·CI·문서·상태 화면 코드)을 먼저 실행하고, 실제 GCP를 필요로 하는 일(부트스트랩·deploy.sh 첫 실행·경보·상태 화면의 GCP 조회 확인)은 마지막 플랜(들)로 묶어 GCP 확보 뒤 실행한다. 페이즈 완료 판정은 마지막 플랜의 deploy.sh 성공이다.
- **D-04:** 환경은 스테이징 + 프로덕션 둘이며, 같은 회사 GCP 프로젝트 하나 안에 Cloud Run 서비스 2개(예: `erp-staging`·`erp-prod`)와 Cloud SQL 인스턴스 2대, 환경 접미사가 붙은 시크릿으로 분리한다. deploy.sh는 환경 이름을 인자로 받고, 프로젝트 ID·리전 인자(재해 복구·다른 프로젝트 재현용)는 로드맵대로 유지한다. 별도 GCP 프로젝트 2개는 거부했다. — **Reversibility:** costly.
- **D-05:** 승격 흐름: main 병합 → CI → 스테이징 자동 배포(migrate Job → 0% 리비전 → 스모크 → 100%) → 사용자가 스테이징에서 확인 → GitHub Environment `production`의 승인 버튼(required reviewer = 사용자) → 같은 git SHA 이미지를 프로덕션에 같은 순서로 배포. 빌드는 한 번, 태그 규칙 없음, 승인 기록은 GitHub에 남는다.
- **D-06:** Cloud SQL은 두 환경 모두 최소 사양(공유 코어 db-f1-micro급, 최소 스토리지, 자동 백업 켬)이며 두 환경 합계 월 $30 안팎이 상한이다. 초과하면 스테이징을 먼저 줄인다(중지 스케줄은 지금은 하지 않음). 커넥션 풀 크기·max-instances는 이 티어의 `max_connections`를 기준으로 계획에서 정하고 deploy.sh의 `max-instances × 풀 ≤ max_connections − 5` 검사(16A)에 넣는다.

**세션·비밀번호 정책**
- **D-07:** 로그인 세션은 30일이며 사용할 때마다 만료가 연장된다(sliding). 30일 동안 안 쓰면 재로그인. 퇴사자 차단은 Phase 3의 계정 비활성화가 담당한다.
- **D-08:** 관리자가 발급·재발급한 초기 비밀번호로 로그인해도 변경을 강제하지 않는다. 대신 내 계정 화면에 "임시 비밀번호를 쓰고 있습니다 — 바꾸세요" 배너를 띄운다. 계정에 "임시 비밀번호 사용 중" 표시(예: `password_is_temporary`)가 필요하고, 본인이 비밀번호를 바꾸면 해제된다.
- **D-09:** 비밀번호 규칙은 8자 이상뿐이다. 문자 조합 강제 없음. 흔한 비밀번호(예: `password`, `12345678`) 소규모 내장 목록만 차단한다. 무차별 대입은 로드맵의 잠금(15분 창 N회, 기본 5)과 IP 속도 제한이 막는다. 규칙을 설정 키로 두는 것은 거부했다.
- **D-10:** 여러 기기 동시 로그인을 허용한다. 로그아웃은 현재 기기 세션만 끝낸다. 본인이 비밀번호를 바꾸거나 관리자가 재발급하면 그 사용자의 모든 세션을 만료시킨다. "모든 기기에서 로그아웃" 버튼은 만들지 않는다.

**계정 발급·첫 관리자**
- **D-11:** Phase 1의 계정 발급 수단은 CLI 하나다(예: `pnpm account:create --email … --name … [--admin]`). 무작위 임시 비밀번호를 터미널에 한 번만 출력하고, `--reset`으로 재발급한다. 운영 환경에서는 같은 컨테이너 이미지의 Cloud Run Job으로 실행한다. 첫 관리자 계정도 자동 시드가 아니라 이 CLI에 `--admin`을 붙여 사용자가 스테이징·프로덕션에서 각각 한 번 실행해 만든다. CSV 일괄 발급은 만들지 않는다.
- **D-12:** Phase 1에서 실제로 만드는 계정은 관리자 1(사용자 본인) + 테스트 직원 1뿐이다. 전 직원 계정은 Phase 3 관리 화면(MAST-02)에서 발급한다. 통합·E2E 테스트는 자체 픽스처 계정을 쓰고 실계정 정보는 리포에 넣지 않는다.
- **D-13:** 임시 비밀번호는 관리자가 직접(구두·메신저) 전달한다. 시스템은 관여하지 않고 유효 기한도 없다(이메일 발송은 Phase 7).
- **D-14:** Phase 1의 계급은 관리자/직원 둘뿐이다(예: 계정의 `is_admin` 하나). Phase 3가 계급 5종·권한표·정보 노출표로 교체한다. — **Reversibility:** reversible.

**URL·경보·상태 화면**
- **D-15:** 접속 주소는 Cloud Run 기본 URL(`*.run.app`)로 시작한다. 회사 도메인은 직원에게 열기 전(Phase 2~3)에 붙이며, 지금은 deploy.sh에 선택 인자 자리만 둔다. 서울 리전에서 Cloud Run 도메인 매핑이 되는지는 리서치가 확인하고, 안 되면 로드밸런서 방식을 그때 계획한다.
- **D-16:** 경보 3개(5xx > 5%·알림 tick 24시간 미성공·백업 실패)는 환경 변수 `ALERT_EMAIL` 하나로 가는 Cloud Monitoring 알림 채널을 deploy.sh가 만든다. 스테이징·프로덕션 모두 같은 주소이며 정책 이름·제목에 환경을 표시한다. 배포 실패는 GitHub Actions 워크플로 실패 알림(GitHub 기본)으로 받는다. tick 경보는 Phase 7에서 tick이 생기기 전까지 발화하지 않도록 조건을 두거나 Phase 7에서 켠다 — 계획에서 정한다.
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

### Deferred Ideas (OUT OF SCOPE)

- 회사 도메인 연결(예: `erp.plant8.co.kr`) — Phase 2~3, 직원 공개 전. deploy.sh 인자 자리만 Phase 1
- 전 직원 계정 발급·계정 비활성화·잠금 해제 화면 — Phase 3(MAST-02, 관리 콘솔)
- 경보 수신자에 경영관리 추가 — 운영 안정화 뒤, `ALERT_EMAIL`을 목록으로 확장
- "모든 기기에서 로그아웃" 버튼, 임시 비밀번호 유효 기한 — 필요가 생기면
- 스테이징 Cloud SQL 중지 스케줄 — 월 비용이 $30을 넘을 때
- Google 로그인 활성화 — v2(AUTH-05), Phase 1은 어댑터 자리만
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | 관리자가 계정·초기 비밀번호 발급, 이메일+비밀번호 로그인, 실패 N회(기본 5) 시 15분 잠금 + IP 속도 제한, 잠금·해제 행동 로그, 관리자 해제 | better-auth `rateLimit`(DB storage, customRules) + `hooks.before`(login_attempts 표) 조합 패턴, admin 플러그인 `revokeUserSessions`/`setUserPassword` — Code Examples 참조 |
| AUTH-02 | 세션은 브라우저 재시작 후도 유지, 어디서든 로그아웃 | better-auth `session.expiresIn`/`updateAge` sliding session, `signOut()` — Code Examples 참조 |
| AUTH-03 | 직원 비밀번호 변경, 관리자 재발급 | better-auth `changePassword`(revokeOtherSessions), admin 플러그인 `setUserPassword` |
| AUTH-04 | 로그인 방식 환경 변수 전환, Google 로그인 어댑터 자리 | better-auth `socialProviders.google` — 별도 설정 블록이라 기존 email/password 코드 구조 변경 없이 추가 가능 |
| OPS-01 | deploy.sh 1회 성공(Cloud Run+Cloud SQL+Secret Manager+Artifact Registry), Cloud SQL 커넥터+IAM, 커넥션 공식 검사, 확장-축소→0%→스모크→100%, rollback.sh, 경보 3개 | `@google-cloud/cloud-sql-connector` + `pg`, Squawk, `gcloud run deploy --no-traffic` + `update-traffic`, `gcloud monitoring policies/channels create` — Architecture Patterns·Code Examples 참조 |
| OPS-02 | 스케일-투-제로, 월 비용 목표 문서화 | Cloud Run `min-instances=0`, Cloud SQL은 상시 과금(Pitfall 11) — Common Pitfalls·비용 절 참조 |
| OPS-04 | 린트(`any` 금지)·타입체크·3계층 테스트 CI, import 경계·zod 필수 린트 | `eslint-plugin-boundaries`/`eslint-plugin-import`, `typescript-eslint`, 커스텀 규칙 스텁, GitHub Actions `services: postgres`, Playwright CI — Validation Architecture 참조 |
| OPS-06 | 관리자 시스템 상태 화면(배포 버전·DB 커넥션·마지막 백업), JSON 로그 | Cloud SQL Admin API `backupRuns.list`, `pg_stat_activity`, Cloud Logging 구조화 로그 필드(`severity`/`message`/`logging.googleapis.com/trace`) — Code Examples 참조 |
| OPS-07 | `docs/ARCHITECTURE.md`·`docs/OPERATIONS.md`(각 300줄) Phase 1 산출물 | Architecture Patterns 다이어그램을 ARCHITECTURE.md 초안 골격으로 사용 |
</phase_requirements>

## Summary

Phase 1은 "기능"이 아니라 "배포된다"를 증명하는 페이즈다. 리서치가 확인한 핵심은 세 가지다.

첫째, 이 페이즈가 쓰는 라이브러리(better-auth, next-safe-action, Drizzle, @google-cloud/cloud-sql-connector, Squawk)는 모두 npm 레지스트리에서 이번 세션에 버전을 직접 확인했다: `better-auth@1.7.5`, `next-safe-action@8.7.3`, `drizzle-orm@0.45.2`, `drizzle-kit@0.31.10`, `@google-cloud/cloud-sql-connector@1.12.0`, `pg@8.23.0`, `squawk-cli@2.65.0`(npm 래퍼, 메인테이너가 `sbdchd`로 GitHub 리포 소유자와 일치). 중요한 발견: `typescript-eslint@8.70.0`의 peerDependency가 `"typescript": ">=4.8.4 <6.1.0"`으로 선언되어 있어, TypeScript 6.1 이상이나 7.x는 아직 지원하지 않는다 — CLAUDE.md가 이미 못박은 "TypeScript 6"이 최신 스택 리서치와 별개로 **현재 생태계 제약**으로도 맞다. `typescript@6.0.3`으로 고정해야 한다.

둘째, D-15(서울 리전 Cloud Run 도메인 매핑 가능 여부)는 이 세션에서 `docs.cloud.google.com`이 프록시에 막혀 원문을 직접 열지 못했다. 두 차례 독립된 WebSearch 종합이 일관되게 "asia-northeast3는 Cloud Run 커스텀 도메인 매핑 지원 리전 목록에 없다"고 답했지만(다른 한 번은 모순되는 답 — 존재하지 않는 지역명을 섞어 신뢰도가 낮음), 원문을 못 읽었으므로 `[ASSUMED]`로 남긴다. Phase 1은 이 기능을 쓰지 않으므로(D-15는 인자 자리만) 블로커는 아니지만, Phase 2~3 계획 전에 회사 GCP에서 `gcloud run domain-mappings create --region=asia-northeast3`를 실제로 실행해 확인해야 한다.

셋째, Cloud SQL db-f1-micro의 `max_connections` 기본값은 세 차례 독립 검색에서 일관되게 **25**로 나왔다(공식 문서 직접 열람은 차단됨, `[ASSUMED]` — deploy.sh가 실제 인스턴스에서 `SHOW max_connections`로 검증해야 함). 16A 공식(`max-instances × 풀 ≤ max_connections − 5`)에 대입하면 여유는 20커넥션이다. `max-instances=3`(CEO 리뷰 다이어그램 기준) × 풀 크기 5 = 15 ≤ 20으로, migrate Job이 별도로 쓰는 연결까지 감안해도 안전 마진이 남는다 — 이 숫자를 Phase 1 계획의 시작값으로 제안한다.

**Primary recommendation:** better-auth `rateLimit`(storage: database) + `login_attempts` 표 + `hooks.before`(`createAuthMiddleware`, `ctx.path === "/sign-in/email"`)로 잠금을 구현하고, `@google-cloud/cloud-sql-connector`의 `authType: 'IAM'` + `pg.Pool`을 Drizzle `node-postgres` 어댑터에 물려 로컬(Auth Proxy)과 Cloud Run(커넥터)이 같은 `db/client.ts` 진입점을 쓰게 하며, `drizzle-kit generate`가 만든 SQL을 Squawk으로 CI에서 린트하고 `drizzle-kit push`는 CI에서 아예 실행하지 않는다.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 로그인 폼·내 계정 화면 | Browser/Client (RSC + 최소 클라이언트 컴포넌트) | Frontend Server(SSR) | Next.js App Router가 서버 컴포넌트로 렌더링, 폼 제출만 클라이언트 이벤트 |
| 인증 세션 발급·검증·잠금 | API/Backend (`domain/auth`) | — | better-auth는 Next.js Route Handler(`/api/auth/[...all]`)로 API 계층에 산다. viewer 해석은 domain 계층 |
| Server Action 실행(비밀번호 변경 등) | API/Backend (`app/*/actions.ts` → `authedActionClient`) | — | next-safe-action이 세션·zod 검증을 API 경계에서 강제 |
| Cloud SQL 커넥션·IAM 인증 | Database/Storage 접근 계층 (`db/client.ts`) | API/Backend(연결 풀 관리) | 커넥터는 애플리케이션 프로세스 안에서 동작하지만 책임은 DB 접근 경계 |
| 마이그레이션 실행 | Database/Storage(스키마 변경) | Deploy 파이프라인(Cloud Run Job) | 같은 이미지의 별도 실행 단위(Job)가 담당, 서비스 트래픽과 분리 |
| 배포·롤백·트래픽 분할 | Deploy 파이프라인(`scripts/deploy.sh`, `scripts/rollback.sh`) | CDN/Static 해당 없음 | Cloud Run 리비전 기능을 스크립트가 오케스트레이션할 뿐, 직접 구현 아님 |
| 경보·알림 채널 | Deploy 파이프라인 / GCP 인프라(Cloud Monitoring) | — | 애플리케이션 코드가 아니라 `deploy.sh`가 `gcloud monitoring` 리소스를 선언적으로 생성 |
| 시스템 상태 화면 데이터 조회 | API/Backend(`domain/system-status`) | Database/Storage(`pg_stat_activity`), GCP 인프라(Cloud SQL Admin API) | 화면은 서버 컴포넌트가 두 소스를 조회해 합성, 캐시 없음(D-18) |
| JSON 구조화 로그 | API/Backend(런타임 전역) | CDN/Static 해당 없음 | Cloud Run stdout → Cloud Logging 자동 파싱, 별도 로그 인프라 불필요 |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.3.5 [VERIFIED: npm view next version, 2026-09-18] | Next.js App Router, 프런트+백 단일 앱 | Issue 1(엔지니어링 리뷰)로 이미 잠김. `.planning/research/STACK.md`가 근거 |
| react / react-dom | 19.3.0 [VERIFIED: npm view react version, 2026-09-18] | UI | Next.js 16 기본 동반 버전 |
| typescript | **6.0.3** [VERIFIED: npm view typescript@6 version, 2026-09-18] — `latest` 태그는 7.0.2이지만 CLAUDE.md가 6으로 고정하며, `typescript-eslint@8.70.0`의 peerDependency가 `">=4.8.4 <6.1.0"`이라 7.x는 물론 6.1+도 아직 지원 안 됨 [VERIFIED: npm view typescript-eslint peerDependencies, 2026-09-18] | strict 모드, 생태계 린트 도구 호환의 실측 상한 |
| drizzle-orm | 0.45.2 [VERIFIED: npm view drizzle-orm version, 2026-09-18] | 타입 안전 ORM/쿼리 빌더 | better-auth의 drizzle-orm peerDependency가 정확히 `"^0.45.2 \|\| >=1.0.0-rc.1 <2.0.0"`이라 0.44계열이 아니라 0.45.2 이상을 못박아야 함 [VERIFIED: npm view better-auth peerDependencies, 2026-09-18] |
| drizzle-kit | 0.31.10 [VERIFIED: npm view drizzle-kit version, 2026-09-18] | 마이그레이션 SQL 생성(`generate`) | `generate`는 SQL 파일만 만들고 적용하지 않음, `push`는 CI 금지(Issue 4) — 아래 Code Examples 참조 |
| better-auth | 1.7.5 [VERIFIED: npm view better-auth version, 2026-09-18] | 인증(이메일+비밀번호, 세션, rateLimit, admin 플러그인) | `.planning/research/STACK.md` 채택 근거 그대로. Drizzle 어댑터 공식 지원(`@better-auth/drizzle-adapter`) |
| next-safe-action | 8.7.3 [VERIFIED: npm view next-safe-action version, 2026-09-18] | Server Action 클라이언트(zod 검증·미들웨어 체이닝) | Issue 2(엔지니어링 리뷰)로 잠김. peerDependency `next: ">= 14.0.0"`로 Next 16과 호환 [VERIFIED: npm view next-safe-action peerDependencies, 2026-09-18] |
| @google-cloud/cloud-sql-connector | 1.12.0 [VERIFIED: npm view @google-cloud/cloud-sql-connector version, 2026-09-18] | Cloud SQL 공인 IP 없이 IAM 인증 연결 | 6A(CEO 리뷰) 결정. `authType: 'IAM'`으로 비밀번호 없이 서비스 계정 IAM 인증 [CITED: raw.githubusercontent.com/GoogleCloudPlatform/cloud-sql-nodejs-connector README] |
| pg | 8.23.0 [VERIFIED: npm view pg version, 2026-09-18] | node-postgres 드라이버 | 커넥터가 `pg.Pool` 옵션을 반환하는 예제가 공식 README에 있음. better-auth peerDependency도 `pg: "^8.0.0"` [VERIFIED: npm view better-auth peerDependencies, 2026-09-18] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| drizzle-zod | 0.x(최신, `>=0.36.0` drizzle-orm 요구) [VERIFIED: npm view drizzle-zod peerDependencies — `"zod": "^3.25.0 \|\| ^4.0.0", "drizzle-orm": ">=0.36.0"`, 2026-09-18] | DB 스키마에서 zod 스키마 자동 생성 | Server Action 입력 스키마와 DB 스키마 이중 유지보수 방지 |
| zod | 4.6.5 [VERIFIED: npm view zod version, 2026-09-18] | 런타임 스키마 검증 | next-safe-action `.schema()`, drizzle-zod와 조합 |
| squawk-cli (npm) / squawk (바이너리 이름) | 2.65.0 [VERIFIED: npm view squawk-cli version, 2026-09-18] | Postgres 마이그레이션 SQL 린트(확장-축소 위반 탐지) | CI에서 `drizzle-kit generate` 산출물(`drizzle/*.sql`)을 린트. `npm`·`pip`·Docker·바이너리 릴리스 중 택1 [CITED: raw.githubusercontent.com/sbdchd/squawk README] |
| eslint | 10.10.0(latest) 또는 9.39.5(maintenance) [VERIFIED: npm view eslint dist-tags, 2026-09-18] | 플랫 config 린트 | `typescript-eslint`(peerDep `eslint: "^8.57.0 \|\| ^9.0.0 \|\| ^10.0.0"`) 및 `eslint-config-next`(`eslint: ">=9.0.0"`) 모두 10.x 호환 [VERIFIED: npm view 각 패키지 peerDependencies, 2026-09-18] — 오케스트레이터 메모의 "ESLint 9"는 현재 최신 major(10)로 갱신해도 무방 |
| typescript-eslint | 8.70.0 [VERIFIED: npm view typescript-eslint version, 2026-09-18] | 플랫 config용 TS 린트 통합 패키지 | typescript 6.0.x와 호환 상한(위 참조) |
| eslint-plugin-boundaries | 7.2.0 [VERIFIED: npm view eslint-plugin-boundaries version, 2026-09-18] | `app ↛ repositories/db`, `domain ↛ app` import 경계 강제 | `boundaries/elements` 설정으로 폴더 단위 타입 정의, 플랫 config 지원(peerDep `eslint: ">=6.0.0"`) [CITED: WebSearch 종합 — jsboundaries.dev 공식 문서 인용, 원문 직접 열람은 안 함] |
| eslint-plugin-import | 2.32.0 [VERIFIED: npm view eslint-plugin-import version, 2026-09-18] | import 순서·경계 보조 규칙(대안/병행) | boundaries만으로 부족한 세부 규칙(예: no-restricted-paths) 보완용 |
| vitest | 5.0.1 [VERIFIED: npm view vitest version, 2026-09-18] | 단위·통합 테스트 | better-auth peerDependency가 vitest 2~5 전부 허용 [VERIFIED: npm view better-auth peerDependencies, 2026-09-18] |
| @playwright/test | 1.63.0 [VERIFIED: npm view @playwright/test version, 2026-09-18] | E2E 테스트 | `webServer` 설정으로 `next build && next start`를 CI에서 띄우고 테스트 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| eslint-plugin-boundaries | eslint-plugin-import의 `no-restricted-paths` | boundaries가 "타입" 개념(app/domain/repositories/db)을 1급으로 표현해 4계층 경계 서술에 더 적합. import만으로는 경로 패턴을 직접 나열해야 해 유지보수가 어려움 |
| @google-cloud/cloud-sql-connector + pg | postgres-js + 수동 OAuth2 토큰(커넥터 패키지 없이) | 커넥터 없이 postgres-js로 직접 IAM 토큰을 비밀번호로 넣는 방법도 존재하나(DEV Community 블로그 사례, `[ASSUMED]` — 원문 미확인), 토큰이 1시간마다 만료돼 직접 갱신 로직이 필요해 복잡도가 늘어난다. 공식 커넥터가 이를 자동 처리 |
| squawk-cli(npm) | pip 패키지 `squawk-cli` 또는 GitHub Release 바이너리 | GitHub Actions에서는 바이너리 직접 다운로드가 가장 빠르지만(빌드 없음), 로컬 개발 PC/클라우드 세션 양쪽에서 같은 명령을 쓰려면 npm이 pnpm 워크플로에 자연스럽게 들어감 |

**Installation:**
```bash
pnpm add next@16.3.5 react@19.3.0 react-dom@19.3.0 typescript@6.0.3 \
  drizzle-orm@0.45.2 drizzle-kit@0.31.10 -D \
  better-auth@1.7.5 @better-auth/drizzle-adapter \
  next-safe-action@8.7.3 zod@4.6.5 drizzle-zod \
  @google-cloud/cloud-sql-connector@1.12.0 pg
pnpm add -D squawk-cli@2.65.0 vitest@5.0.1 @playwright/test@1.63.0 \
  eslint@10.10.0 typescript-eslint@8.70.0 eslint-plugin-boundaries@7.2.0
```

**Version verification:** 위 표의 모든 버전은 `npm view <package> version`으로 이번 세션(2026-09-18)에 직접 확인했다. 계획·실행 단계에서 실제 설치 직전 재확인 권장(며칠 새 패치가 나올 수 있음).

## Package Legitimacy Audit

`gsd_run query package-legitimacy check --ecosystem npm`을 이 세션에서 실행했다. **결과: 조회한 12개 패키지 전부가 `weeklyDownloads: null`("unknown-downloads")을 반환해 SUS로 분류됐다** — `pg`(2010년대부터 존재하는 node-postgres 표준 드라이버)·`eslint-plugin-import`(2025-06 게시, 업계 표준)처럼 명백히 정착된 패키지까지 동일하게 `unknown-downloads`가 나온 것으로 볼 때, 이 샌드박스에서 npm 다운로드 통계 API 자체가 막혀 있어 신호가 구조적으로 깨진 것으로 판단한다(개별 패키지의 실제 의심 신호가 아니다). 프로토콜에 따라 SUS 판정은 그대로 표에 반영하고 설치 전 `checkpoint:human-verify`를 건다.

| Package | Registry | Age(최초 게시) | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| better-auth | npm | 게시 이력 있음(패치 2026-09-14) | 조회 불가(unknown) | github.com/better-auth/better-auth | SUS(too-new, unknown-downloads) | Flagged — checkpoint 필요하나 STACK.md에서 이미 채택 근거 있음(널리 쓰이는 신흥 인증 라이브러리) |
| next-safe-action | npm | 패치 2026-09-07 | 조회 불가 | github.com/next-safe-action/next-safe-action(구 TheEdoRan/next-safe-action) | SUS | Flagged — checkpoint |
| drizzle-orm | npm | 패치 2026-03-27 | 조회 불가 | github.com/drizzle-team/drizzle-orm | SUS | Flagged — checkpoint(단, `.planning/research/STACK.md` 기존 채택) |
| drizzle-kit | npm | 패치 2026-03-17 | 조회 불가 | github.com/drizzle-team/drizzle-orm | SUS | Flagged — checkpoint |
| @google-cloud/cloud-sql-connector | npm | 패치 2026-09-02 | 조회 불가 | github.com/GoogleCloudPlatform/cloud-sql-nodejs-connector | SUS | Flagged — checkpoint(공식 Google Cloud 조직 소유 리포로 확인) |
| pg | npm | 패치 2026-08-08(오랜 프로젝트) | 조회 불가 | github.com/brianc/node-postgres | SUS(unknown-downloads만) | Flagged — checkpoint(신호 자체가 이 환경 결함으로 판단) |
| squawk-cli | npm | 패치 2026-09-10 | 조회 불가 | github.com/sbdchd/squawk — 메인테이너 `sbdchd`가 리포 소유자와 일치 [VERIFIED: npm view squawk-cli maintainers, 2026-09-18] | SUS(too-new) | Flagged — checkpoint |
| eslint-plugin-boundaries | npm | 패치 2026-08-09 | 조회 불가 | github.com/javierbrea/eslint-plugin-boundaries | SUS | Flagged — checkpoint |
| eslint-plugin-import | npm | 패치 2025-06-20 | 조회 불가 | github.com/import-js/eslint-plugin-import | SUS(unknown-downloads만) | Flagged — checkpoint |
| typescript-eslint | npm | 패치 2026-09-07 | 조회 불가 | github.com/typescript-eslint/typescript-eslint | SUS | Flagged — checkpoint |
| zod | npm | 패치 2026-09-13 | 조회 불가 | github.com/colinhacks/zod | SUS | Flagged — checkpoint |
| drizzle-zod | npm | 패치 2025-08-06 | 조회 불가 | github.com/drizzle-team/drizzle-orm | SUS | Flagged — checkpoint |

**Packages removed due to [SLOP] verdict:** 없음 — 전부 존재가 확인됐고 저장소 소유자가 알려진 조직/개인과 일치한다.
**Packages flagged as suspicious [SUS]:** 위 12개 전부. 플래너는 각 설치 태스크 앞에 `checkpoint:human-verify`를 넣되, 근본 원인이 "이 세션에서 다운로드 통계 조회가 막힘"임을 태스크 설명에 남겨 불필요한 공포를 주지 않도록 한다. 실제 실행 세션(로컬 PC 또는 네트워크 제한이 없는 CI)에서 `npm view <pkg> --json` 재조회로 다운로드 수를 확인하면 이 판정은 대부분 자동으로 OK로 바뀔 것으로 예상한다.

## Architecture Patterns

### System Architecture Diagram

```
[Browser/폰]
   │ HTTPS
   ▼
[Cloud Run: erp-staging / erp-prod, min-instances=0 max-instances=3]
   │
   ├─▶ Next.js App Router (RSC)
   │      │ 로그인 폼 제출 / 비밀번호 변경 폼 제출
   │      ▼
   │   Server Action (next-safe-action `authedActionClient`)
   │      │ 1) 세션 조회(better-auth) 2) zod 입력 검증 3) viewer 주입
   │      ▼
   │   domain/auth, domain/system-status ...
   │      │ scopeFor(viewer) 행 필터만
   │      ▼
   │   repositories/*  (Drizzle, 전체 컬럼 반환은 domain 안에서만)
   │      │
   │      ▼
   │   db/client.ts ──(@google-cloud/cloud-sql-connector, authType: IAM)──▶ [Cloud SQL Postgres, 서울, 공인 IP 없음]
   │
   ├─▶ /api/auth/[...all] (better-auth 라우트 핸들러)
   │      │ rateLimit(storage: database) → hooks.before(login_attempts 체크) → 세션 발급
   │
   └─▶ /internal/system-status (관리자 전용)
          ├─▶ pg_stat_activity 카운트 쿼리
          └─▶ Cloud SQL Admin API backupRuns.list (서비스 계정 IAM)

[GitHub Actions]
   │ main 병합
   ▼
CI: lint(boundaries+no-explicit-any) → typecheck → Squawk(drizzle/*.sql) → vitest(unit) → vitest+postgres(integration) → playwright(e2e)
   │ 통과
   ▼
build image → Artifact Registry(서울): sha 태그
   │
   ▼
deploy.sh: gcloud run jobs execute migrate --wait (같은 이미지) ─ 실패 ▶ 중단
   │ 성공
   ▼
gcloud run deploy --no-traffic (새 리비전) → 스모크(/healthz, 로그인 페이지) → update-traffic 100%
   │
   ├─▶ (staging 성공 시) GitHub Environment `production` 승인 대기 → 같은 SHA를 prod에 동일 순서로 배포
   │
   └─▶ deploy.sh: gcloud monitoring channels/policies upsert (5xx>5%, backup 실패, tick 24h — idempotent)

rollback.sh: gcloud run services update-traffic SERVICE --to-revisions=PREV_REVISION=100
```

### Recommended Project Structure
```
app/                     # Next.js App Router — 화면 + server actions만. repositories/db import 금지(lint)
  (auth)/login/
  (app)/account/          # 내 계정: 비밀번호 변경, 로그아웃
  (admin)/system-status/   # 관리자 전용, 404 for non-admin
  api/auth/[...all]/       # better-auth 라우트 핸들러
domain/                  # 순수 비즈니스 로직. app import 금지(lint)
  auth/
    lockout.ts            # login_attempts 판정 로직
    hooks.ts               # better-auth hooks.before/after 등록
  system-status/
lib/
  actions/
    client.ts              # next-safe-action createSafeActionClient → authedActionClient
repositories/             # Drizzle 쿼리. viewer 인자 필수(lint), 전체 컬럼 반환
  users.ts
  login-attempts.ts
db/
  schema/                  # Drizzle 테이블 정의 + better-auth 어댑터 스키마
  client.ts                # 환경별(local Auth Proxy / Cloud Run connector) 연결 진입점 하나
  migrations/               # drizzle-kit generate 산출물(.sql + meta/)
scripts/
  deploy.sh
  rollback.sh
  bootstrap-gcp.sh
  dev-db.sh
  account-create.ts          # Cloud Run Job으로도 실행되는 CLI 엔트리
eslint/
  rules/
    require-action-client.js   # "use server" 래퍼 없는 export 금지
    money-boundary.js          # domain/money 밖 산술 금지(Phase 4가 채움, Phase 1은 스텁)
test/
  unit/
  integration/                # vitest + Postgres 서비스 컨테이너
  e2e/                         # Playwright
.github/workflows/
  ci.yml
  deploy-staging.yml (또는 ci.yml 안의 job)
  deploy-production.yml
docs/
  ARCHITECTURE.md   # ≤300줄
  OPERATIONS.md     # ≤300줄, 런북 포함
```

### Pattern 1: better-auth Drizzle 어댑터 + 이메일/비밀번호 + sliding 세션

**What:** `betterAuth()` 설정 하나로 이메일+비밀번호, DB 세션, Drizzle 어댑터, rateLimit을 동시에 구성한다.
**When to use:** `db/auth.ts`(서버 전용) 한 곳에서만 인스턴스화하고 `app/api/auth/[...all]/route.ts`가 이를 마운트한다.
**Example:**
```typescript
// Source: raw.githubusercontent.com/better-auth/better-auth (session-management.mdx, rate-limit.mdx) — 2026-09-18 확인
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "@/db/client";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8, // D-09: 8자 이상뿐
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30일 (D-07)
    updateAge: 60 * 60 * 24,      // 1일마다 sliding 갱신
  },
  rateLimit: {
    storage: "database",
    modelName: "rateLimit",
    customRules: {
      "/sign-in/email": { window: 60, max: 10 }, // IP 속도 제한, 값은 계획에서 확정
    },
  },
  advanced: {
    ipAddress: {
      // Cloud Run은 자체 프록시 뒤에서 X-Forwarded-For를 신뢰할 수 있는 형태로 넣는다.
      // trustedProxies 값은 Cloud Run 리비전의 실제 프록시 IP 대역 확인 후 계획에서 확정 [ASSUMED]
      ipAddressHeaders: ["x-forwarded-for"],
    },
  },
  socialProviders: process.env.AUTH_PROVIDER === "google" ? {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  } : undefined, // AUTH-04: 어댑터 자리만, 코드 구조 변경 없이 켤 수 있음
});
```

### Pattern 2: `login_attempts` 잠금 — before hook + after hook

**What:** better-auth에는 계정 잠금 기능이 없다(rateLimit은 IP 단위일 뿐). `hooks.before`로 로그인 시도 전에 `login_attempts` 표를 확인해 거부하고, `hooks.after`로 성공 시 초기화한다.
**When to use:** `domain/auth/hooks.ts`에서 정의하고 `betterAuth({ hooks: {...} })`에 등록.
**Example:**
```typescript
// Source: raw.githubusercontent.com/better-auth/better-auth (hooks.mdx) — 2026-09-18 확인, DB 로직은 이 프로젝트 설계
import { createAuthMiddleware, APIError } from "better-auth/api";
import { db } from "@/db/client";
import { loginAttempts } from "@/db/schema/login-attempts";
import { and, eq, gte, sql } from "drizzle-orm";

const LOCKOUT_WINDOW_MINUTES = 15; // 설정 키로 뺄 예정(Issue 5), Phase 1은 상수+env override
const LOCKOUT_THRESHOLD = 5;

export const before = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/sign-in/email") return;
  const email = ctx.body?.email as string | undefined;
  if (!email) return;

  const since = new Date(Date.now() - LOCKOUT_WINDOW_MINUTES * 60_000);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(loginAttempts)
    .where(and(
      eq(loginAttempts.email, email),
      eq(loginAttempts.success, false),
      gte(loginAttempts.attemptedAt, since),
    ));

  if (count >= LOCKOUT_THRESHOLD) {
    throw new APIError("FORBIDDEN", { message: "계정이 잠겼습니다. 관리자에게 문의하세요." });
    // 이메일/비밀번호 오류와 같은 문구로 통일할지는 Claude's Discretion (CONTEXT.md)
  }
});

export const after = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/sign-in/email") return;
  const email = ctx.body?.email as string | undefined;
  if (!email) return;
  const success = !!ctx.context.newSession;
  await db.insert(loginAttempts).values({ email, success, attemptedAt: new Date() });
  if (success) {
    // 성공 시 초기화: 실패 기록을 남기지 않거나, 별도 리셋 플래그를 둔다(구현은 계획에서 확정)
  }
});
```
**주의:** DB 저장이라 여러 Cloud Run 인스턴스에서도 동작한다(F3 실패 모드가 정확히 이 문제를 지적함 — 인스턴스별 메모리 카운트 금지).

### Pattern 3: 비밀번호 변경 시 다른 세션 전부 만료 (D-10)

```typescript
// Source: raw.githubusercontent.com/better-auth/better-auth (session-management.mdx) — 2026-09-18 확인
await authClient.changePassword({
  currentPassword,
  newPassword,
  revokeOtherSessions: true, // 현재 세션만 유지, 나머지 전부 만료
});
```
관리자 재발급(강제 초기화)은 admin 플러그인의 `setUserPassword` + `revokeUserSessions`를 조합한다(둘 다 별도 호출, 자동 연동 아님 — 관리자 CLI가 순서대로 호출해야 함):
```typescript
// Source: raw.githubusercontent.com/better-auth/better-auth (admin.mdx) — 2026-09-18 확인
await auth.api.setUserPassword({ body: { userId, newPassword: tempPassword } });
await auth.api.revokeUserSessions({ body: { userId } });
// + password_is_temporary = true 컬럼 세팅(D-08, better-auth 기능 아님 — 이 프로젝트 스키마 확장)
```

### Pattern 4: next-safe-action `authedActionClient`

**What:** 세션 확인 + viewer 주입 + zod 검증을 한 미들웨어 체인으로 강제.
**Example:**
```typescript
// Source: WebSearch 종합(next-safe-action.dev 공식 문서 인용, 원문 직접 열람은 프록시 차단으로 실패) [CITED]
// lib/actions/client.ts
import { createSafeActionClient } from "next-safe-action";
import { auth } from "@/db/auth";
import { headers } from "next/headers";

const actionClient = createSafeActionClient({
  handleServerError(e) {
    return e instanceof Error ? e.message : "서버 오류가 발생했습니다.";
  },
});

export const authedActionClient = actionClient.use(async ({ next }) => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("로그인이 필요합니다.");
  }
  // viewer 투영: repositories가 scopeFor(viewer)로 쓸 최소 정보만 ctx에 싣는다
  return next({ ctx: { viewer: { id: session.user.id, isAdmin: !!session.user.isAdmin } } });
});
```
```typescript
// app/(app)/account/actions.ts
"use server";
import { z } from "zod";
import { authedActionClient } from "@/lib/actions/client";

export const changePasswordAction = authedActionClient
  .schema(z.object({ currentPassword: z.string(), newPassword: z.string().min(8) }))
  .action(async ({ parsedInput, ctx }) => {
    // ...
  });
```

### Pattern 5: `use server` 래퍼 강제 ESLint 규칙 (Issue 2)

**What:** `"use server"` 지시어가 있는 파일에서, export된 함수가 `authedActionClient`(또는 그 체인)로 감싸이지 않으면 lint 실패.
**설계 근거:** `[ASSUMED]` — 공식 예제가 아니라 이 프로젝트를 위한 설계 제안이다. ESLint AST 규칙 작성의 일반 패턴(Program 최상단 directive 검사 + ExportNamedDeclaration의 초기화 표현식 검사)을 따른다.
```javascript
// eslint/rules/require-action-client.js (설계 스텁 — Phase 1 계획에서 구현 확정)
// 1) Program.body[0]이 ExpressionStatement && Literal.value === "use server"인지 확인
// 2) 모든 ExportNamedDeclaration의 VariableDeclarator.init이
//    CallExpression 체인이며 그 루트 식별자가 authedActionClient(또는 승인된 액션 클라이언트 이름)인지 확인
// 3) 아니면 report({ node, message: "use server export must be wrapped by an approved action client" })
```

### Pattern 6: Cloud SQL 커넥터 + Drizzle (Cloud Run) vs Auth Proxy(로컬)

**What:** 같은 `db/client.ts`가 환경 변수 하나로 두 경로를 스위칭한다.
```typescript
// Source: raw.githubusercontent.com/GoogleCloudPlatform/cloud-sql-nodejs-connector README — 2026-09-18 확인, 조합은 이 프로젝트 설계
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { Connector } from "@google-cloud/cloud-sql-connector";

async function createPool() {
  if (process.env.CLOUD_SQL_CONNECTION_NAME) {
    // Cloud Run: 공인 IP 없음, IAM 인증 (6A)
    const connector = new Connector();
    const clientOpts = await connector.getOptions({
      instanceConnectionName: process.env.CLOUD_SQL_CONNECTION_NAME, // "project:region:instance"
      authType: "IAM",
    });
    return new Pool({
      ...clientOpts,
      user: process.env.DB_IAM_USER, // 서비스 계정 이메일, .gserviceaccount.com 제외 [CITED]
      database: process.env.DB_NAME,
      max: Number(process.env.DB_POOL_MAX ?? 5),
    });
  }
  // 로컬(PC·클라우드 세션): Cloud SQL Auth Proxy가 127.0.0.1:5432(or dev Postgres)로 노출
  return new Pool({
    connectionString: process.env.DATABASE_URL, // e.g. postgres://user:pass@127.0.0.1:5432/db
    max: Number(process.env.DB_POOL_MAX ?? 5),
  });
}

export const db = drizzle(await createPool());
```
**커넥션 공식(16A):** Cloud SQL db-f1-micro `max_connections` 기본값 **25** `[ASSUMED — docs.cloud.google.com 직접 열람 차단, 3회 독립 WebSearch 종합 일치]`. `max-instances=3 × pool=5 = 15 ≤ 25-5=20`(여유 5, migrate Job의 일시 연결 포함해도 안전). **deploy.sh는 실제 인스턴스에 `SHOW max_connections;`를 실행해 이 가정값을 배포 시점에 재검증해야 한다** — 하드코딩된 25를 신뢰하지 말 것.

### Pattern 7: drizzle-kit generate → Squawk → Cloud Run Job migrate

```bash
# Source: WebSearch 종합(orm.drizzle.team 공식 문서 인용) [CITED] + sbdchd/squawk README [CITED]
pnpm drizzle-kit generate   # drizzle/0000_xxx.sql + drizzle/meta/_journal.json + drizzle/meta/NNNN_snapshot.json 생성, DB에 미적용
squawk drizzle/*.sql --exclude=ban-drop-column   # 예시: 팀 정책에 맞게 룰 조정, CI에서 실패 시 배포 중단
# CI에서는 drizzle-kit push를 절대 실행하지 않는다 (Issue 4)
```
```bash
# 같은 컨테이너 이미지로 마이그레이션 Job 실행 (Source: docs.cloud.google.com WebSearch 종합, 원문 차단) [CITED]
gcloud run jobs deploy migrate \
  --image="${IMAGE}" --region="${REGION}" --project="${PROJECT_ID}" \
  --set-env-vars="CLOUD_SQL_CONNECTION_NAME=${CONN_NAME}" \
  --command="node" --args="scripts/migrate-runner.js"
gcloud run jobs execute migrate --region="${REGION}" --project="${PROJECT_ID}" --wait
# exit code != 0 → deploy.sh가 여기서 중단(리비전 배포로 진행하지 않음)
```

### Pattern 8: 0% → 스모크 → 100% 배포, rollback.sh

```bash
# Source: WebSearch 종합(docs.cloud.google.com 원문 차단, 2회 이상 일관된 결과) [CITED]
gcloud run deploy "${SERVICE}" --image="${IMAGE}" --region="${REGION}" \
  --no-traffic --tag="rev-${GIT_SHA:0:8}"
SMOKE_URL="https://rev-${GIT_SHA:0:8}---${SERVICE}-xxxxx.${REGION}.run.app"
curl -fsS "${SMOKE_URL}/healthz" && curl -fsS -o /dev/null -w '%{http_code}' "${SMOKE_URL}/login" | grep -q '^200$'
NEW_REVISION=$(gcloud run services describe "${SERVICE}" --region="${REGION}" --format='value(status.latestCreatedRevisionName)')
gcloud run services update-traffic "${SERVICE}" --region="${REGION}" --to-revisions="${NEW_REVISION}=100"
```
```bash
# scripts/rollback.sh
PREV_REVISION=$(gcloud run revisions list --service="${SERVICE}" --region="${REGION}" \
  --sort-by='~metadata.creationTimestamp' --format='value(metadata.name)' --limit=2 | tail -n1)
gcloud run services update-traffic "${SERVICE}" --region="${REGION}" --to-revisions="${PREV_REVISION}=100"
```

### Pattern 9: Workload Identity Federation 부트스트랩 (D-02)

```bash
# Source: raw.githubusercontent.com/google-github-actions/auth README — 2026-09-18 확인 [CITED]
gcloud iam workload-identity-pools create "github" \
  --project="${PROJECT_ID}" --location="global" --display-name="GitHub Actions Pool"

gcloud iam workload-identity-pools providers create-oidc "erp-repo" \
  --project="${PROJECT_ID}" --location="global" --workload-identity-pool="github" \
  --display-name="PLANT8 ERP repo" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition="assertion.repository == '${GITHUB_ORG}/${REPO_NAME}'" \
  --issuer-uri="https://token.actions.githubusercontent.com"

gcloud iam service-accounts create "gha-deployer" --project="${PROJECT_ID}"

gcloud iam service-accounts add-iam-policy-binding \
  "gha-deployer@${PROJECT_ID}.iam.gserviceaccount.com" \
  --project="${PROJECT_ID}" --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/attribute.repository/${GITHUB_ORG}/${REPO_NAME}"
```
```yaml
# .github/workflows 안 deploy job
permissions:
  contents: 'read'
  id-token: 'write'
steps:
  - uses: google-github-actions/auth@v3
    with:
      workload_identity_provider: 'projects/${{ vars.PROJECT_NUMBER }}/locations/global/workloadIdentityPools/github/providers/erp-repo'
      service_account: 'gha-deployer@${{ vars.PROJECT_ID }}.iam.gserviceaccount.com'
```
`gha-deployer`에 필요한 최소 역할(제안, Claude's Discretion): `roles/run.admin`(리비전 배포·트래픽 분할), `roles/run.developer`(Job 실행), `roles/cloudsql.client`(마이그레이션 연결), `roles/artifactregistry.writer`(이미지 push), `roles/secretmanager.secretAccessor`(시크릿 주입), `roles/monitoring.editor`(경보 upsert), `roles/iam.serviceAccountUser`(Cloud Run이 런타임 SA를 쓰게 위임).

### Pattern 10: Cloud Monitoring 경보 3개 + 알림 채널 (D-16)

```bash
# Source: WebSearch 종합(docs.cloud.google.com 원문 차단) [CITED]
CHANNEL_ID=$(gcloud beta monitoring channels create \
  --display-name="ERP Alerts (${ENV})" --type=email \
  --channel-labels=email_address="${ALERT_EMAIL}" --format='value(name)')

gcloud alpha monitoring policies create \
  --display-name="[${ENV}] 5xx ratio > 5%" \
  --notification-channels="${CHANNEL_ID}" \
  --condition-display-name="5xx ratio" \
  --condition-filter='resource.type="cloud_run_revision" AND metric.type="run.googleapis.com/request_count" AND metric.label.response_code_class="5xx"' \
  --condition-threshold-value=0.05 --condition-threshold-comparison=COMPARISON_GT \
  --condition-threshold-duration=300s
# 백업 실패, tick 24h 미성공 정책도 같은 패턴으로 upsert — 정확한 필터 표현식은 계획 단계에서 실제 지표명으로 확정
```
idempotent 처리: `gcloud alpha monitoring policies list --filter="displayName=...\""`로 기존 정책을 찾아 있으면 `update`, 없으면 `create` — deploy.sh가 재실행돼도 중복 생성되지 않게 한다(설계 제안, `[ASSUMED]`).

### Pattern 11: 관리자 시스템 상태 화면 데이터 조회 (D-18)

```typescript
// Source: WebSearch 종합(pg_stat_activity — 여러 블로그 일치) [CITED] + googleapis sqladmin 클라이언트 [CITED]
// pg_stat_activity 커넥션 수
const [{ count }] = await db.execute(sql`
  SELECT count(*)::int AS count FROM pg_stat_activity
  WHERE datname = current_database() AND state <> 'idle'
`);

// 마지막 백업 (Cloud SQL Admin API) — googleapis 패키지 사용, IAM 역할은 roles/cloudsql.viewer로 시도,
// 정확히 backupRuns.list를 포함하는지는 이 세션에서 원문 확인 실패 [ASSUMED] — GCP 확보 후 실제 권한으로 검증 필요
import { google } from "googleapis";
const sqladmin = google.sqladmin("v1");
const auth = new google.auth.GoogleAuth({ scopes: ["https://www.googleapis.com/auth/sqlservice.admin"] });
const { data } = await sqladmin.backupRuns.list({
  project: process.env.GCP_PROJECT_ID!, instance: process.env.CLOUD_SQL_INSTANCE_ID!,
  auth: await auth.getClient() as any,
});
const lastBackup = data.items?.[0]; // status, endTime
```

### Pattern 12: JSON 구조화 로그 (Cloud Logging 자동 파싱)

```typescript
// Source: WebSearch 종합(Cloud Logging 구조화 로그 공식 필드명) [CITED]
function log(severity: "INFO" | "WARNING" | "ERROR", message: string, fields: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ severity, message, ...fields }));
  // Cloud Run stdout → Cloud Logging이 severity/message를 특수 필드로 자동 인식.
  // trace 연결이 필요하면 "logging.googleapis.com/trace" 필드를 추가(Phase 1은 생략 가능)
}
```

### Anti-Patterns to Avoid

- **CI에서 `drizzle-kit push` 실행:** 스키마를 즉시 동기화해버려 확장-축소 검증(Squawk)을 우회한다. `generate` + Job 실행만 허용(Issue 4).
- **better-auth `rateLimit`만으로 계정 잠금을 대체:** rateLimit은 IP 단위 속도 제한이지 계정별 잠금이 아니다. `login_attempts` 표가 반드시 별도로 필요하다(F3 실패 모드).
- **인스턴스 메모리에 실패 횟수 카운트:** Cloud Run이 여러 인스턴스로 스케일하면 잠금이 무작위로 풀린다 — 반드시 DB.
- **Cloud SQL 퍼블릭 IP + 비밀번호 인증:** 6A 결정 위반. 커넥터 + IAM만.
- **`max-instances`를 무제한으로 두는 것:** db-f1-micro의 `max_connections`가 낮아(추정 25) 커넥션 폭증으로 500 에러가 난다(Pitfall 11, F10).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 비밀번호 해싱·세션 토큰·쿠키 관리 | 자체 bcrypt+세션 스토어 | better-auth | 이미 감사된 구현. Auth.js는 Credentials 프로바이더가 "프로덕션 비밀번호 인증용으로 설계되지 않음"을 메인테이너가 명시(STACK.md 근거) |
| Server Action 입력 검증·인증 체크 반복 | 매 액션 파일에서 세션 조회 복붙 | next-safe-action `authedActionClient` 미들웨어 체이닝 | 누락 위험(F1과 유사한 패턴: 한 곳이라도 빠지면 인증 우회) 제거 |
| Postgres 마이그레이션 위험 SQL 탐지 | 정규식으로 `DROP COLUMN` grep | Squawk | 락 유발 패턴(`ADD COLUMN ... NOT NULL`, 비-concurrent 인덱스 등) 룰셋이 이미 갖춰짐 |
| Cloud SQL IAM 토큰 발급·갱신 | 직접 OAuth2 토큰 요청 + 1시간마다 갱신 로직 | `@google-cloud/cloud-sql-connector` | 커넥터가 토큰 수명 관리를 내장 |
| 배포 트래픽 분할·롤백 | 자체 blue-green 스크립트 | Cloud Run 리비전 + `--no-traffic`/`update-traffic` | 플랫폼 기능을 스크립트로 오케스트레이션만 하면 충분(Issue 4 — "재구현 아님") |
| Cloud Monitoring 알림 발송 로직 | 커스텀 웹훅+SMTP 폴링 | `gcloud monitoring policies/channels` | GCP 네이티브 기능, deploy.sh가 선언적으로 생성 |

**Key insight:** Phase 1이 "직접 만드는 것"은 `login_attempts` 잠금 로직과 `deploy.sh`/`rollback.sh`의 오케스트레이션 순서뿐이다. 나머지는 전부 플랫폼/라이브러리 기능을 부르는 접착 코드다 — 엔지니어링 리뷰의 "What already exists" 표와 일치.

## Common Pitfalls

### Pitfall 1: Cloud SQL은 스케일-투-제로가 안 된다는 착각
**What goes wrong:** Cloud Run의 min-instances=0을 DB에도 그대로 기대하면 청구서가 다르게 나온다.
**Why it happens:** "스케일-투-제로" 요구사항이 앱 계층 용어라 DB까지 확장 해석하기 쉽다.
**How to avoid:** OPERATIONS.md 비용 절에 "Cloud SQL은 유휴 시에도 상시 과금"을 명시하고 D-06의 월 $30 상한을 이 전제로 계산한다.
**Warning signs:** 야간·주말에도 DB 항목이 고정비로 찍힘(`.planning/research/PITFALLS.md` Pitfall 11).

### Pitfall 2: 인스턴스별 메모리 카운트로 계정 잠금 구현
**What goes wrong:** Cloud Run이 트래픽에 따라 여러 인스턴스로 스케일되면 잠금 카운터가 인스턴스마다 따로 논다.
**How to avoid:** `login_attempts` 표(Postgres) + before hook. 통합 테스트로 "N회 실패 → 잠금 → 15분 후 해제 → 관리자 해제"를 직접 검증(F3).

### Pitfall 3: `max-instances × pool` 계산을 하드코딩 숫자로 신뢰
**What goes wrong:** db-f1-micro의 `max_connections=25`는 이 세션에서 직접 문서를 못 읽어 확인한 숫자다. GCP가 조용히 기본값을 바꿨거나 이 프로젝트가 더 큰 티어로 갈 수도 있다.
**How to avoid:** deploy.sh가 배포 때마다 `SHOW max_connections;`를 실제 인스턴스에 물어 16A 공식을 재계산하고, 하드코딩된 가정치와 다르면 경고한다.

### Pitfall 4: `drizzle-kit push`를 실수로 CI 스크립트에 남김
**What goes wrong:** `push`는 스키마를 즉시 DB에 동기화해버려 Squawk 린트를 완전히 우회한다.
**How to avoid:** CI 워크플로에 `push`라는 문자열이 없는지 grep하는 메타 테스트를 하나 둔다(Claude's Discretion 영역이지만 저비용 안전장치).

### Pitfall 5: Cloud Run 서비스 계정에 과도한 권한 부여
**What goes wrong:** 시스템 상태 화면이 Cloud SQL Admin API를 부르려면 서비스 계정에 권한이 필요한데, 편의상 `roles/cloudsql.admin`(백업 삭제·인스턴스 재구성까지 가능)을 주면 최소 권한 원칙을 어긴다.
**How to avoid:** D-18이 명시한 "Cloud SQL 읽기 권한만"을 지키고, `roles/cloudsql.viewer`가 실제로 `backupRuns.list`를 포함하는지는 회사 GCP 확보 후 `gcloud iam roles describe roles/cloudsql.viewer`로 확인한다(이 세션에서 미확인, `[ASSUMED]`).

### Pitfall 6: better-auth `hooks.before`가 모든 경로에 실행됨을 놓침
**What goes wrong:** `createAuthMiddleware`는 모든 better-auth 엔드포인트(회원가입·세션 갱신 등)에서 실행된다. `ctx.path` 분기를 빠뜨리면 로그인이 아닌 요청에도 잠금 로직이 돌아 불필요한 DB 쿼리나 오류가 난다.
**How to avoid:** 위 Pattern 2처럼 `if (ctx.path !== "/sign-in/email") return;`을 반드시 첫 줄에 둔다.

## Code Examples

주요 코드는 위 Architecture Patterns 절의 Pattern 1~12에 통합했다(라이브러리 실사용 코드와 인프라 스크립트가 밀접히 연결돼 있어 별도 중복 배치하지 않음).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Next.js `middleware.ts` | Next.js 16.2+는 `proxy.ts`로 파일명 변경 [CITED: `.planning/research/STACK.md`] | Next.js 16.2.6 | Phase 1에서 미들웨어가 필요하면 파일명을 `proxy.ts`로 시작해야 함(이전 튜토리얼 의존 금지) |
| ESLint 8 `.eslintrc` | ESLint 9+는 flat config(`eslint.config.js`)가 기본이자 유일한 형식으로 굳어짐(ESLint 10도 동일) | ESLint 9(2024), 10(latest, 2026-09 시점) [VERIFIED: npm view eslint dist-tags] | `.eslintrc` 문서를 참고하지 말 것 |
| drizzle-orm 0.4x | 1.0.0-rc.5까지 릴리스 진행 중, 아직 `latest` 태그는 0.45.2 [VERIFIED: npm view drizzle-orm dist-tags, 2026-09-18] | 진행 중(RC 단계) | Phase 1은 0.45.2 고정, 1.0 stable 출시 후 별도 마이그레이션 가이드 필요(STACK.md와 일치) |
| TypeScript 6 → 7(tsgo, Go 네이티브 컴파일러) | 7.0.2가 `latest`지만 typescript-eslint가 아직 6.1+/7.x를 지원하지 않음 [VERIFIED: npm view typescript-eslint peerDependencies] | 2026 여름 TS7 출시, 생태계 추격 중 | typescript@6.0.3 고정 유지(STACK.md 권고가 실측으로 재확인됨) |

**Deprecated/outdated:**
- `.planning/research/ARCHITECTURE.md`의 Hono·REST·raw pg 패턴 — Issue 1로 참고용 강등, Phase 1부터 채택하지 않음.
- Lucia auth — 메인테이너가 라이브러리 배포를 접음(STACK.md 근거, 이번 세션 재확인 안 함, 기존 리서치 신뢰).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | Cloud Run 커스텀 도메인 매핑이 asia-northeast3에서 지원되지 않는다 | Summary, D-15 관련 | Phase 1엔 영향 없음(인자 자리만). Phase 2~3 계획이 잘못된 전제로 로드밸런서 설계를 건너뛰면, 도메인 연결 시점에 재작업 필요 |
| A2 | Cloud SQL db-f1-micro의 `max_connections` 기본값이 25다 | Standard Stack, Pattern 6, Pitfall 3 | 16A 공식(`max-instances×pool≤max_connections-5`)의 여유값이 틀리면 deploy.sh의 배포 거부 임계치가 부정확해진다 — 단, deploy.sh가 실제 인스턴스에서 재조회하도록 설계하면 리스크는 배포 시점에 자동 정정됨 |
| A3 | `roles/cloudsql.viewer`가 `cloudsql.backupRuns.list` 권한을 포함한다 | Pattern 11, Pitfall 5 | 시스템 상태 화면의 "마지막 백업"이 403으로 실패. 역할을 `roles/cloudsql.admin`으로 넓히거나 커스텀 역할을 만들어야 할 수 있음 |
| A4 | Cloud SQL Auth Proxy 뒤 postgres-js로 커넥터 패키지 없이도 IAM 인증이 가능하다(대안 스택) | Standard Stack > Alternatives Considered | 채택하지 않은 대안이라 실제 리스크 낮음. 참고 정보로만 사용 |
| A5 | ESLint 규칙(`require-action-client.js`, `money-boundary.js` 스텁)의 AST 접근 방식 | Architecture Patterns Pattern 5 | 이 세션 설계 제안이며 공식 예제가 아니다. 실제 구현 시 next-safe-action의 정확한 export 형태(화살표 함수 vs `.action()` 체인 반환값)에 따라 AST 매칭 로직을 조정해야 함 |
| A6 | Cloud Run 서비스 계정에 필요한 최소 IAM 역할 목록(Pattern 9) | Pattern 9 | 과다 권한 부여 또는 권한 부족으로 배포 실패. 실제 GCP 프로젝트에서 `gcloud run deploy` dry-run으로 권한 오류를 확인하며 좁혀야 함 |

## Open Questions

1. **Cloud Run 도메인 매핑의 asia-northeast3 지원 여부(D-15)**
   - What we know: 두 차례 WebSearch 종합 중 신뢰도가 더 높아 보이는 쪽(구체적 리전 목록·다른 GCP 서비스명과 혼동 없음)이 "미지원"이라고 답함.
   - What's unclear: `docs.cloud.google.com` 원문을 이 세션에서 열지 못해 확정 불가.
   - Recommendation: Phase 1 계획에는 영향 없음(인자 자리만). 회사 GCP 확보 직후 `gcloud run domain-mappings create --region=asia-northeast3 ...`를 1회 시도해 실제 오류 메시지로 확정하고, Phase 2/3 계획 시점에 로드밸런서 대안 여부를 결정한다.

2. **`login_attempts` 성공 시 "초기화" 방식 — 실패 기록 삭제 vs 플래그**
   - What we know: 로드맵은 "성공 시 초기화"만 요구, 행동 로그에는 잠금·해제 이벤트만 남기면 된다.
   - What's unclear: 실패 기록 자체를 지울지, 아니면 `resolved_at` 같은 컬럼으로 남겨 감사 추적성을 유지할지는 CONTEXT.md가 Claude's Discretion으로 열어뒀다.
   - Recommendation: 감사 추적을 위해 삭제하지 않고 `resolved_at`/`reset_reason`(예: "success" / "admin_unlock")을 남기는 쪽을 계획에서 제안한다 — ADMN-12("지우지 않는다") 원칙과도 일관된다.

3. **`gha-deployer` 서비스 계정의 정확한 최소 역할 세트**
   - What we know: Pattern 9에 제안 목록이 있다.
   - What's unclear: 실제 GCP 프로젝트 조직 정책(예: 커스텀 역할 강제)에 따라 달라질 수 있다.
   - Recommendation: 부트스트랩 스크립트를 먼저 넓은 역할로 실행해 성공을 확인한 뒤, `gcloud iam service-accounts get-iam-policy` + Cloud Audit Logs의 `Policy Analyzer`로 실제 쓰인 권한만 남기는 2단계 접근을 계획에 넣는다.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | 앱 런타임, CLI | ✓ | 확인 필요(로컬/클라우드 세션에서 `node --version`) | — |
| pnpm | 패키지 매니저(CLAUDE.md 필수) | 확인 필요 | — | 없음(다른 매니저 금지) |
| Docker | `scripts/dev-db.sh`(D-01, PC), 로컬 이미지 빌드 | PC: 전제됨(D-01) / 클라우드 세션: 없음, apt Postgres로 대체 | — | apt 설치 Postgres(`docs/research/cloud-session-setup.md` 패턴) |
| gcloud CLI | `bootstrap-gcp.sh`(사용자가 Cloud Shell에서 1회 실행, D-02) | 로컬 PC에는 불필요(D-02 명시) | — | Cloud Shell에 사전 설치되어 있음(GCP 표준 환경) |
| 회사 GCP 프로젝트 | deploy.sh 첫 실행, Cloud Run/Cloud SQL/Secret Manager/Artifact Registry 전부 | ✗ (2026-09 넷째 주 확보 예정) | — | 확보 전까지 로컬 개발만(D-03), 이 페이즈의 마지막 플랜으로 미룸 |
| Squawk 바이너리(CI) | 마이그레이션 SQL 린트 | GitHub Actions에서 설치 필요 | 2.65.0(npm) | pip/Docker/바이너리 릴리스 중 택1 |

**Missing dependencies with no fallback:**
- 회사 GCP 프로젝트 — D-03이 이미 "확보 전 로컬만" 전략으로 흡수함. 블로커 아님, 순서 문제.

**Missing dependencies with fallback:**
- Docker(클라우드 세션) — apt 설치 Postgres로 대체(D-01, `docs/research/cloud-session-setup.md` 실측 패턴 재사용).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.1(단위+통합) + @playwright/test 1.63.0(E2E) [VERIFIED: npm view, 2026-09-18] |
| Config file | `vitest.config.ts`(신규, Wave 0), `playwright.config.ts`(신규, Wave 0) |
| Quick run command | `pnpm vitest run test/unit` |
| Full suite command | `pnpm vitest run && pnpm playwright test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | 이메일+비밀번호 로그인 성공/실패 | integration | `pnpm vitest run test/integration/auth.test.ts` | ❌ Wave 0 |
| AUTH-01 | N회 실패 시 15분 잠금, 관리자 해제 | integration(Postgres 컨테이너) | `pnpm vitest run test/integration/lockout.test.ts` | ❌ Wave 0 |
| AUTH-02 | 세션 유지(재접속), 로그아웃 | e2e | `pnpm playwright test test/e2e/login-logout.spec.ts` | ❌ Wave 0 |
| AUTH-03 | 비밀번호 변경/관리자 재발급 | integration + e2e | `pnpm vitest run test/integration/password.test.ts`, `pnpm playwright test test/e2e/change-password.spec.ts` | ❌ Wave 0 |
| AUTH-04 | `AUTH_PROVIDER=email` 기본, 코드 구조 불변 확인 | unit | `pnpm vitest run test/unit/auth-provider.test.ts` | ❌ Wave 0 |
| OPS-01 | 커넥션 공식 검사, 확장-축소 위반 거부 | integration(deploy.sh 자체 테스트 또는 셸 테스트) | `bash test/deploy/pool-check.bats`(또는 동등 셸 테스트, 형식은 계획에서 확정) | ❌ Wave 0 |
| OPS-04 | import 경계·zod 필수 린트 | lint(CI 게이트) | `pnpm lint` | ❌ Wave 0(설정 자체가 산출물) |
| OPS-06 | 관리자 상태 화면 데이터 조회 | integration | `pnpm vitest run test/integration/system-status.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm vitest run test/unit`
- **Per wave merge:** `pnpm vitest run && pnpm playwright test`
- **Phase gate:** CI 전체 그린(lint→typecheck→Squawk→unit→integration[Postgres 컨테이너]→e2e) 후 `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `vitest.config.ts` — 단위/통합 분리 설정(환경변수로 Postgres 컨테이너 유무 분기)
- [ ] `playwright.config.ts` — `webServer: { command: process.env.CI ? 'pnpm build && pnpm start' : 'pnpm dev', reuseExistingServer: !process.env.CI }` [CITED: WebSearch 종합, playwright.dev 공식 패턴]
- [ ] `test/integration/setup.ts` — Postgres 연결(로컬은 `scripts/dev-db.sh`가 띄운 인스턴스, CI는 `services: postgres` 컨테이너)
- [ ] `.github/workflows/ci.yml`의 `services.postgres`(image: postgres, health-cmd: pg_isready) [CITED: docs.github.com 공식 예제, WebSearch 종합]
- [ ] Framework install: 이미 Standard Stack의 `pnpm add -D` 명령에 포함

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | better-auth(이메일+비밀번호 해싱, 세션 토큰), `login_attempts` 잠금, IP rateLimit |
| V3 Session Management | yes | better-auth DB 세션, `expiresIn`/`updateAge` sliding, HttpOnly 쿠키(better-auth 기본), 비밀번호 변경 시 세션 전부 만료 |
| V4 Access Control | yes(부분) | 관리자 시스템 상태 화면 404 for non-admin(D-17). 전면적 viewer 투영·정보 노출표는 Phase 3(OPS-05 계열) |
| V5 Input Validation | yes | next-safe-action `.schema()`(zod), Server Action 전부 강제 |
| V6 Cryptography | yes(간접) | better-auth 내장 비밀번호 해싱 알고리즘 사용(직접 구현 금지). Phase 1은 주민등록번호·계좌번호 암호화(Issue 7)는 다루지 않음(Phase 3·7) |

### Known Threat Patterns for {Next.js + better-auth + Cloud Run}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| 무차별 대입 로그인 | Spoofing | better-auth `rateLimit`(IP) + `login_attempts`(계정) 이중 방어(F3 봉합) |
| 세션 고정/탈취 | Spoofing/Tampering | better-auth HttpOnly+Secure 쿠키, 세션 만료 정책. Cloud Run은 자동 HTTPS(TLS 종료) |
| CSRF(상태 변경 액션) | Tampering | Server Action은 POST 전용 + Next.js 내장 Origin 검사, better-auth `trustedOrigins` |
| 관리자 화면 권한 우회(URL 직접 접근) | Elevation of Privilege | 서버 컴포넌트에서 viewer.isAdmin 확인 후 404 반환(클라이언트 숨김만으로는 불충분 — Pitfall 3 패턴과 동일 원리) |
| 마이그레이션 SQL의 락 유발/파괴적 변경 | Tampering(가용성) | Squawk CI 게이트, `drizzle-kit push` CI 금지 |
| Cloud SQL 커넥션 폭증으로 인한 서비스 거부 | Denial of Service | 16A 공식 검사, `max-instances` 상한(Pitfall 11) |

## Project Constraints (from CLAUDE.md)

- **패키지 매니저:** pnpm만 허용, 다른 매니저 금지.
- **스택 고정:** Next.js 16 App Router + TypeScript 6 strict, domain/·repositories/ 4계층 + Drizzle ORM, PostgreSQL(Cloud SQL, 서울), Cloud Run(서울) + Cloud Scheduler + GCS + Secret Manager.
- **명령 4개(dev/test/lint/build)는 Phase 1 완료 시 CLAUDE.md에 채운다** — 이번 세션 중에는 CLAUDE.md를 수정하지 않는다(캐시 프리픽스 규칙).
- **TDD:** 실패 테스트 → 최소 구현 → 리팩터. 실제 실행 확인 없이 "완료" 금지.
- **커밋:** 한 커밋 한 의도, 제목 영어 접두어(`feat:`/`fix:`/`docs:`/`chore:`) + 한국어 본문.
- **새 의존성:** 이유 한 줄 + 승인 필요(next-safe-action은 이미 승인됨, 버전 고정).
- **시크릿 금지:** 코드·커밋에 절대 금지, Secret Manager 사용. `any` 금지(ESLint로 강제).
- **요청받지 않은 리팩터·주석·파일 이동 금지.**
- **프론트엔드:** Phase 1 화면은 `docs/design/SYSTEM.md` 이전이라 무스타일 임시 화면 허용(CONTEXT.md와 일치). 새 색·서체·radius 생성 금지 규칙은 Phase 2부터 본격 적용.
- **금지:** `.planning/` 수동 편집, `git push --force`, 프로덕션 DB 직접 명령, CLAUDE.md에 진행 상황 추가.
- **모델 선택 규칙:** 점검·계획·판단은 Fable 5, 나머지는 작업에 맞는 지능을 사용 — 이 규칙은 실행(gsd-executor) 단계에 적용되며 이 RESEARCH.md 자체와는 무관.

## Sources

### Primary (HIGH confidence)
- npm registry(`npm view <pkg> version` / `peerDependencies` / `dist-tags`) — better-auth, next-safe-action, drizzle-orm, drizzle-kit, @google-cloud/cloud-sql-connector, pg, squawk-cli, eslint, eslint-plugin-boundaries, eslint-plugin-import, typescript-eslint, typescript, zod, drizzle-zod, googleapis — 2026-09-18 확인
- `raw.githubusercontent.com/better-auth/better-auth` — session-management.mdx, rate-limit.mdx, hooks.mdx, admin.mdx, docs/content/docs/authentication/email-password.mdx, google.mdx — 2026-09-18 확인
- `raw.githubusercontent.com/google-github-actions/auth` — README.md(WIF 부트스트랩 명령), docs/EXAMPLES.md — 2026-09-18 확인
- `raw.githubusercontent.com/sbdchd/squawk` — README.md(설치·CLI·룰) — 2026-09-18 확인
- `gsd_run query package-legitimacy check` — 이 세션 실행, 2026-09-18

### Secondary (MEDIUM confidence)
- WebSearch 종합(공식 문서를 인용했으나 원문 직접 열람은 프록시 차단): next-safe-action.dev(createSafeActionClient/middleware), orm.drizzle.team(drizzle-kit generate/push), docs.cloud.google.com(Cloud Run Jobs, gcloud run deploy --no-traffic/update-traffic, Workload Identity Federation 흐름, Cloud Monitoring 정책/채널 생성, Cloud Logging 구조화 로그, pg_stat_activity, GitHub Actions postgres 서비스 컨테이너, Playwright webServer 패턴) — 2026-09-18
- `.planning/research/STACK.md`, `.planning/research/PITFALLS.md`, `docs/research/cloud-session-setup.md` — 기존 리서치, 2026-09-17 작성분 재인용

### Tertiary (LOW confidence, 확정 전 재검증 필요)
- Cloud Run 커스텀 도메인 매핑의 asia-northeast3 지원 여부(상충되는 WebSearch 결과)
- Cloud SQL db-f1-micro `max_connections=25`(문서 원문 미확인, 3회 검색 일치로 근거는 있으나 `[ASSUMED]` 유지)
- `roles/cloudsql.viewer`의 정확한 권한 목록(backupRuns.list 포함 여부)

## Metadata

**Confidence breakdown:**
- Standard Stack(버전·peerDependency): HIGH — npm 레지스트리 직접 조회, 이번 세션
- Architecture Patterns(better-auth/next-safe-action API): HIGH-MEDIUM — 대부분 GitHub raw 공식 문서 원문 확인, 일부(next-safe-action 미들웨어)는 WebSearch 종합
- GCP 인프라 세부(도메인 매핑 리전, Cloud SQL 가격/max_connections, IAM 역할 권한 상세): MEDIUM-LOW — 프록시가 `docs.cloud.google.com`을 차단해 원문 미확인, WebSearch 종합에 의존
- Pitfalls: HIGH(기존 `.planning/research/PITFALLS.md`가 이 회사 실측 감사에 기반) + 이번 세션 신규 발견(typescript-eslint 버전 상한) HIGH

**Research date:** 2026-09-18
**Valid until:** 라이브러리 버전 확인분은 7일(빠르게 변함), GCP 인프라·정책 확인분은 30일(회사 GCP 확보 후 반드시 재검증 필요)
