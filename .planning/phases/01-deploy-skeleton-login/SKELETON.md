# Walking Skeleton — PLANT8 ERP

**Phase:** 1
**Generated:** 2026-09-18

## Capability Proven End-to-End

> 관리자가 발급한 계정으로 직원이 배포된 앱(`erp-staging`, Cloud Run 서울)에 이메일+비밀번호로 로그인하면 DB 세션이 만들어지고, 내 계정 화면에서 로그아웃할 수 있다 — 브라우저 → Next.js 서버 컴포넌트 → better-auth 라우트 → Drizzle → Cloud SQL(IAM 커넥터)까지 한 경로가 실제로 통한다.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Next.js 16.3.x App Router(RSC + Server Actions), TypeScript 6.0.x strict, React 19.3 | 프런트·백 단일 앱(Eng Issue 1). `typescript-eslint@8.70`이 TS 6.1+/7.x를 아직 지원하지 않아 6.0.x 고정(RESEARCH Standard Stack) |
| Runtime / package manager | Node 24(컨테이너 `node:24-slim`, `.nvmrc`=24; `engines.node >=22.12`로 클라우드 세션의 Node 22.22도 허용), pnpm 10.33 (`packageManager` 고정, pnpm만) | STACK.md Node 24 권고 + 클라우드 세션 실측(Node 22) 양립. CLAUDE.md pnpm 규칙 |
| Data layer | PostgreSQL 16 + Drizzle ORM 0.45.2 / drizzle-kit 0.31.10(`generate`만, `push` 하위 명령 CI 금지) + Squawk 린트. 마이그레이션은 `scripts/migrate-runner.ts`(drizzle `migrate()`)가 적용하고 운영에서는 같은 이미지의 Cloud Run Job이 실행 | Eng Issue 4·ROADMAP 기준 6. 스키마가 TS 코드라 별도 DSL 없음 |
| Layering | 4계층 `app/ → domain/ → repositories/(viewer 인자 필수) → db/` + 횡단 `lib/`(better-auth 인스턴스 `lib/auth.ts`, next-safe-action `lib/actions/client.ts`, JSON 로그 `lib/log.ts`, 환경 변수 스키마 `lib/env.ts`, GCP 클라이언트 `lib/gcp/*`). `lib`는 domain·repositories·db를 import할 수 있고 `app`은 누구도 import하지 않는다. 최상위 디렉터리(`src/` 없음) | Eng Issue 1. better-auth 인스턴스는 domain의 훅(잠금)을 등록해야 하므로 `db/`가 아니라 `lib/`에 둔다(db→domain 역방향 import 회피). `eslint-plugin-boundaries`로 강제 |
| Auth | better-auth 1.7.5(이메일+비밀번호, DB 세션 30일 sliding/updateAge 1일 — 쿠키 연장은 `app/session-refresh.tsx`가 마운트 시 `/api/auth/get-session`을 불러 일으킨다, `disableSignUp`, `cookiePrefix: 'erp'`, rateLimit DB 저장소·IP는 `x-forwarded-for` **마지막** 항목을 리포 루트 `proxy.ts`가 `x-client-ip`로 고정한 값만 신뢰, 헤더 부재 시 fail-closed) + `login_attempts` 표 before/after 훅 잠금(15분 창 N회, 기본 5, env 키). 계급은 `users.is_admin` 하나(D-14). 임시 비밀번호 표시는 `users.password_is_temporary`(D-08). 계정 발급은 CLI `scripts/account-cli.ts`(D-11) | ROADMAP 기준 2·3, D-07~D-14. better-auth 테이블은 복수형(`users`·`sessions`·`accounts`·`verifications`·`rate_limits`) — Postgres 예약어 `user` 회피, 되돌리기 비용 `costly`(테이블 rename 마이그레이션) |
| Server Actions | next-safe-action 8.7.3 `authedActionClient`(세션 → viewer 주입 → zod)만. 커스텀 ESLint 규칙이 래퍼 없는 `use server` export를 막음 | Eng Issue 2 |
| Deployment target | 회사 GCP 프로젝트 1개(ID는 `GCP_PROJECT_ID` 변수만), 리전 `asia-northeast3`. 환경 2개 = Cloud Run `erp-staging`/`erp-prod` + Cloud SQL `erp-staging-db`/`erp-prod-db`(db-f1-micro, 공인 IP 없음, 프라이빗 IP + IAM 인증) + 접미사 시크릿. GitHub Actions(WIF, 키 없음)가 `scripts/deploy.sh`를 실행: 이미지 SHA 태그 → Artifact Registry → Cloud Run Job(db-bootstrap → migrate, 16A 커넥션 검사 포함) → `--no-traffic` 리비전 → 스모크(`/healthz`, `/login`) → 100% → 경보 3개 upsert. 프로덕션은 사용자가 deploy 워크플로를 수동 실행(`workflow_dispatch` target=production, SHA 입력; 가드가 스테이징 서빙 SHA만 통과)해 같은 SHA — GitHub Environments 없음, 변수는 저장소 수준 | D-02~D-06, D-15, D-16, Eng Issue 4, CEO 16A·19A·20A |
| Directory layout | `app/` 화면·액션·라우트, `domain/` 순수 로직, `repositories/` Drizzle 쿼리, `db/` 스키마·클라이언트·마이그레이션, `lib/` 횡단 인프라, `scripts/` 셸·CLI, `infra/` 이름·경보 정의, `eslint/rules/` 커스텀 규칙, `test/{unit,integration,e2e}`, `docs/` | RESEARCH 권장 구조 + Claude's Discretion |
| Tests | Vitest 5(단위 `test/unit`, 통합 `test/integration` + 실제 Postgres) + Playwright 1.63(E2E). 로컬 DB는 `scripts/dev-db.sh`(Docker 있으면 컨테이너, 없으면 apt Postgres 16), 클라우드 세션은 SessionStart 훅이 자동 실행. CI는 `services.postgres` | Eng Issue 14, D-01 |
| Observability | JSON 구조화 로그(`lib/log.ts`: `severity`·`message`·`time`·`event`·필드) → Cloud Logging 자동 파싱. 관리자 상태 화면 `/admin/system-status`(배포 버전 `APP_GIT_SHA`/`APP_DEPLOYED_AT`, `pg_stat_activity` 커넥션 수/`max_connections`, Cloud SQL Admin API 마지막 백업; 캐시 없음) | OPS-06, D-17, D-18 |

## Stack Touched in Phase 1

- [x] Project scaffold (Next.js 16 + TS 6 strict, pnpm scripts 계약, ESLint flat config, Vitest/Playwright 러너) — Plan 01-01·01-04
- [x] Routing — `/login`, `/account`, `/healthz`, `/api/auth/[...all]`, `/admin/system-status` — Plan 01-01·01-03
- [x] Database — 읽기(세션 조회·`pg_stat_activity`) AND 쓰기(로그인 세션 생성·`login_attempts` 기록·비밀번호 변경) — Plan 01-01·01-02·01-03
- [x] UI — 로그인 폼 제출 → better-auth 라우트, 로그아웃 버튼, 비밀번호 변경 폼(Server Action) — Plan 01-01·01-03
- [x] Deployment — `erp-staging`(Cloud Run 서울)에 GitHub Actions + `scripts/deploy.sh`로 배포, 이어서 `erp-prod` 승격 — Plan 01-05·01-06·01-07. 로컬 전체 스택 실행 명령: `pnpm db:dev && pnpm db:migrate && pnpm dev`

## Out of Scope (Deferred to Later Slices)

- 디자인 시스템·스타일(Phase 2: `docs/design/SYSTEM.md`가 임시 화면 셋을 교체)
- 계급 5종·권한표·정보 노출표·`scopeFor(viewer)`/`project(viewer, dto)`·설정 레지스트리·행동 로그 표·암호화 헬퍼(Phase 3; Phase 1은 `is_admin` 하나 + JSON 로그 이벤트)
- 전 직원 계정 발급·잠금 해제·계정 비활성화 화면(Phase 3, MAST-02) — Phase 1은 CLI
- `domain/money`·`domain/rules.gate`(Phase 4) — Phase 1은 린트 규칙 자리만 실제 규칙으로 구현(branded `Money` 타입 대상)
- 이메일 발송(Phase 7) — SMTP 환경 변수 4개는 정의만
- 알림 tick(Phase 7) — tick 경보 정책은 만들되 `enabled: false`
- 회사 도메인 연결(Phase 2~3) — `deploy.sh --domain` 인자 자리만
- 백업 복원 리허설(OPS-03), 스테이징 DB 중지 스케줄, "모든 기기에서 로그아웃", Google 로그인 활성화(v2)

## Subsequent Slice Plan

- Phase 2: 디자인 시스템(`SYSTEM.md`·`tokens.css`) + 앱 셸이 로그인·내 계정·상태 화면을 교체
- Phase 3: 권한 핵심(can/visible/scopeFor·DTO 투영·누수 스캔) + 설정 레지스트리 + 마스터 + 관리 콘솔(계정 발급·잠금 해제 화면이 CLI를 대체)
- Phase 4: 프로젝트·견적 원장 + `domain/money` + `rules.gate` + 통화·리저브
- Phase 5~7: 지출결의·결재 → 지급·증빙·법인카드 → 마감·알림·SMTP·tick(tick 경보 `enabled: true`)
- Phase 8: 데이터 이전·전환 / Phase 9~10: 손익 / Phase 11: 기타소득 확인증(`/cso` 게이트)
