# ARCHITECTURE

> 300줄 상한(테스트로 고정: `test/unit/docs-limits.test.ts`). 이후 페이즈가 항목을 추가한다.
> Phase 1은 골격만 세운다 — 업무 화면·손익·권한 세부는 없다.

## 1. 요약

Next.js 16 단일 앱(App Router, RSC + Server Actions) + Drizzle ORM + PostgreSQL(Cloud SQL,
서울). 프런트·백을 한 리포·한 배포 단위로 묶는다 — 큐·마이크로서비스 없음. Cloud Run
(`min-instances=0`)이 스케일-투-제로, Cloud SQL은 최소 사양으로 상시 과금을 최소화한다.

## 2. 4계층 + 단일 지점

```
app/            화면 · Server Action(authedActionClient만) · 라우트 핸들러
  │  ← DTO만 통과(app은 repositories/db를 직접 import 금지, lint)
  ▼
domain/         순수 비즈니스 로직 · viewer 기반 권한 판단
  ├─ domain/money        모든 금액 산술의 유일한 지점(Phase 4) — round/toKrw/tax/gross
  ├─ domain/rules.gate   모든 게이트(고객 승인·증빙 필수·마감)의 유일한 지점(Phase 4)
  └─ project(viewer, dto)  domain 출구 — repositories 행 객체를 DTO로 투영(Phase 3)
  ▼
repositories/   Drizzle 쿼리. 모든 export 함수 첫 인자는 viewer(lint), 전체 컬럼 반환
  ▼
db/             스키마 · 클라이언트 · 마이그레이션(drizzle-kit generate 산출물만)
```

횡단: `lib/`(env·log·auth·actions/client 등, domain/repositories/db를 부를 수 있음).
`app`은 누구도 import하지 않고, `db`는 `lib`만 예외로 부른다(env 계약, 01-01).

## 3. 요청 흐름

**로그인:** 브라우저 → `POST /api/auth/sign-in/email`(better-auth 라우트 핸들러) →
`domain/auth/hooks.ts`(before: `login_attempts` 잠금 확인 → after: 성공/실패 기록) →
DB 세션 발급(30일 sliding, `updateAge` 1일 — 쿠키 연장은 `app/session-refresh.tsx`가
마운트 시 `/api/auth/get-session`을 불러 일으킨다).

**Server Action:** 폼 제출 → `authedActionClient`(`lib/actions/client.ts` — 세션 조회 →
`{viewer, user}` ctx 주입 → zod 스키마 검증) → `domain/*` 함수 → `repositories/*`.
`"use server"` export가 이 체인으로 감싸이지 않으면 린트가 막는다(Issue 2, 아래 §9).

## 4. 인증·세션·잠금·계급

- 이메일+비밀번호(better-auth), Google 로그인은 `AUTH_PROVIDER` 환경 변수로 전환(Phase 1은
  어댑터 자리만, 활성화는 v2)
- 세션 30일 sliding, 로그아웃은 현재 기기만(D-10). 비밀번호 변경·관리자 재발급 시 그
  사용자의 모든 세션 만료
- 잠금: `login_attempts` 표 + before/after 훅, 15분 창 5회 실패(env로 조정), 관리자 CLI로
  즉시 해제. IP 속도 제한(60초 10회)은 better-auth `rateLimit`(DB 저장)
- 클라이언트 IP는 `x-forwarded-for`의 **마지막** 항목 하나만 신뢰 — `proxy.ts`가
  `x-client-ip`로 고정하고 훅·better-auth는 그 헤더만 읽는다. 헤더 없으면 500(fail-closed)
- 계급은 Phase 1엔 `users.is_admin` 하나. `password_is_temporary`가 임시 비밀번호 배너를
  띄운다(강제 변경 없음, D-08). Phase 3가 계급 5종·권한표로 교체

## 5. DB·마이그레이션

`drizzle-kit generate` → Squawk(`.squawk.toml`, `pnpm lint:sql`) → `scripts/migrate-runner.ts`
(로컬) / Cloud Run Job `migrate`(운영, 같은 컨테이너 이미지)가 `drizzle-orm`의 `migrate()`로
적용. **`drizzle-kit push`는 CI·배포 어디에도 없다** — 스키마 동기화가 즉시 이루어져
Squawk의 확장-축소 검증을 우회하기 때문(Issue 4). 마이그레이션은 확장 전용(컬럼 추가만,
DROP 없음)이 원칙. 배포 시 16A 커넥션 규칙(`max-instances × pool ≤ max_connections − 5`)을
`migrate-runner`가 실제 `SHOW max_connections`로 검사해 위반이면 exit 3으로 배포를 멈춘다.

## 6. 배포 파이프라인

```
git push(main) ─▶ deploy.yml: workflow_call로 ci.yml 실행(quality → integration-e2e)
     │ 통과
     ▼
scripts/deploy.sh: 이미지(git SHA 태그) → db-bootstrap Job → migrate Job(16A 검사)
     → 신규·기존 서비스 모두 바로 100% 트래픽 배포 → 스모크(/api/health, /login, 가짜
       로그인 Origin 검사) → 경보 3개 upsert
       (/healthz가 아니라 /api/health인 이유: /healthz는 Cloud Run/구글 엣지의
       예약 경로라 컨테이너까지 안 오고 404가 났다 — 2026-09-18 확인)
프로덕션: 사용자가 GitHub Actions "Run workflow"로 수동 실행(같은 SHA, 스테이징 서빙
       확인 가드) — GitHub Environments 없음(D-05)
실패 시: scripts/rollback.sh → 서빙 중인 것보다 오래된 최신 리비전으로 트래픽 복구
```

## 7. 테스트 3계층 · 페이즈 완료 조건

Vitest 단위(`test/unit`, `domain/*` 순수 로직) · Vitest+Postgres 통합(`test/integration`,
서비스 컨테이너) · Playwright E2E(`test/e2e`, 역할별 핵심 흐름). 페이즈 완료 조건: 새
domain 모듈 = 단위, 새 액션·DTO = 통합(+Phase 3부터 누수 생성), 새 화면 흐름 = E2E 1개
(Issue 14).

## 8. 린트 규칙

| 규칙 | 강제 내용 |
|---|---|
| `@typescript-eslint/no-explicit-any` | `any` 금지 |
| `boundaries/element-types` | app↛repositories/db, domain↛app, db는 lib만 예외, eslint↛나머지 |
| `plant8/repository-viewer-param` | `repositories/**` export 함수 첫 인자는 `viewer` |
| `plant8/require-action-client` | `"use server"` export는 승인된 액션 클라이언트로만, 인라인 서버 액션 금지 |
| `plant8/money-boundary` | `domain/money` 밖에서 Money 타입 산술 금지(type-aware) |

## 9. 환경 변수 계약 (`lib/env.ts`)

| 키 | 용도 | 출처 |
|---|---|---|
| `DATABASE_URL` | 로컬 Postgres 접속(dev-db.sh) | `.env.local` |
| `CLOUD_SQL_CONNECTION_NAME`·`DB_IAM_USER`·`DB_NAME`·`DB_POOL_MAX` | Cloud SQL 커넥터(IAM) | 배포 워크플로 변수 |
| `BETTER_AUTH_SECRET`·`BETTER_AUTH_URL` | 세션 서명·Origin 검사(비로컬 필수) | Secret Manager / 서비스 URL |
| `AUTH_PROVIDER`·`GOOGLE_CLIENT_ID`·`GOOGLE_CLIENT_SECRET` | 로그인 방식 전환 | 환경 변수 |
| `LOCKOUT_THRESHOLD`·`LOCKOUT_WINDOW_MINUTES`·`RATE_LIMIT_LOGIN_MAX` | 잠금·속도 제한 | 기본값(env로 조정) |
| `APP_DATA_KEY_v1` | 암호화 키 자리(Phase 3부터 사용) | Secret Manager |
| `SMTP_HOST`·`SMTP_USER`·`SMTP_PASSWORD`·`SMTP_FROM` | 이메일(Phase 1은 정의만) | Secret Manager |
| `GCP_PROJECT_ID`·`CLOUD_SQL_INSTANCE_ID` | 상태 화면의 GCP 조회 | 배포 워크플로 변수 |
| `APP_GIT_SHA`·`APP_DEPLOYED_AT` | 상태 화면 배포 버전 표시 | deploy.sh가 주입 |
| `MAX_INSTANCES` | 16A 커넥션 규칙 계산 | 배포 워크플로 변수 |
| `STATUS_CONN_BANNER_RATIO` | 상태 화면 배너 한도(기본 0.8) | 기본값 |

## 10. 이후 페이즈가 교체·추가하는 지점

- **Phase 2:** 임시 화면(로그인·내 계정·상태) 전부를 `docs/design/SYSTEM.md` 기준으로 교체
- **Phase 3:** `can`/`visible`/`scopeFor(viewer)` + DTO 투영 + 누수 스캔 생성기, 설정
  레지스트리, 암호화 헬퍼(`APP_DATA_KEY_v1` 사용 시작), 행동 로그 표, 계급 5종
- **Phase 4:** `domain/money`·`domain/rules.gate` 실제 구현(현재는 린트 규칙 자리만),
  프로젝트·견적 원장, 통화·리저브 대장
- **Phase 7:** 이메일 발송 활성화(SMTP 4개 변수 실사용), 알림 tick(현재 경보는
  `enabled: false`)
