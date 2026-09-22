# ARCHITECTURE

> 300줄 상한(테스트로 고정: `test/unit/docs-limits.test.ts`). 이후 페이즈가 항목을 추가한다.
> Phase 1은 골격만 세운다 — 업무 화면·손익·권한 세부는 없다.

## 1. 요약

Next.js 16 단일 앱(App Router, RSC + Server Actions) + Drizzle ORM + PostgreSQL(Cloud SQL,
서울). 프런트·백을 한 리포·한 배포 단위로 묶는다 — 큐·마이크로서비스 없음. Cloud Run
(`min-instances=0`)이 스케일-투-제로, Cloud SQL은 최소 사양으로 상시 과금을 최소화한다.

## 2. 4계층 + 단일 지점

```
ui/             디자인 시스템 컴포넌트(Phase 2) — 순수 표현, 토큰·마크업만
  │  ← domain/repositories/db/app을 import 금지(lint, boundaries `ui` 타입)
  ▼
app/            화면 · Server Action(authedActionClient만) · 라우트 핸들러
  │  ← DTO만 통과(app은 repositories/db를 직접 import 금지, lint)
  ▼
domain/         순수 비즈니스 로직 · viewer 기반 권한 판단
  ├─ domain/money/index.ts        모든 금액 산술의 유일한 지점(Phase 4, 04-01·04-02) —
  │    Money 브랜드 · round/toKrw/moneyFromRow/moneyToColumns/quoteAmount/profit/
  │    splitWithRemainder/grossFromTotal, domain/money/tax.ts의 applyTaxRule(세금
  │    규칙 4종), domain/money/currency.ts의 recentFxRate/rememberFxRate(통화별
  │    최근 환율). 기준일 규약(04-2): 원천징수·회사 대납=지급일, 부가세=증빙일
  ├─ domain/rules/gate.ts         모든 게이트(고객 승인·증빙 필수·마감)의 유일한
  │    지점(Phase 4, 04-01) — gate/registerGateRule/listGateRules, 미등록 규칙은 던진다.
  │    domain/rules/register.ts가 규칙을 등록하는 사이드이펙트 모듈
  ├─ domain/document-numbering/index.ts  문서 번호 부여 — 카운터 원자 증가 + 서식
  │    조립(allocateDocumentNumber/formatDocumentNumber, Phase 4, 04-01)
  └─ project(viewer, dto)  domain 출구 — repositories 행 객체를 DTO로 투영(Phase 3)
  ▼
repositories/   Drizzle 쿼리. 모든 export 함수 첫 인자는 viewer(lint), 전체 컬럼 반환
  ▼
db/             스키마 · 클라이언트 · 마이그레이션(drizzle-kit generate 산출물만)
```

횡단: `lib/`(env·log·auth·actions/client 등, domain/repositories/db를 부를 수 있음).
`app`은 누구도 import하지 않고, `db`는 `lib`만 예외로 부른다(env 계약, 01-01). `ui/`는
`ui`와 `lib`만 부를 수 있다 — `app`과 `test`가 `ui`를 부르는 방향만 허용되고 그 반대는
안 된다 — 강제는 lint(`boundaries/element-types`).

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
  띄운다(강제 변경 없음, D-08). Phase 3가 계급 5종·권한표로 교체(`users.is_admin`은
  드롭하지 않고 남긴다 — Squawk `ban-drop-column`, 03-01-DECISION-TASK1.md ③)

## 4-1. 권한 판정 4함수(Phase 3)

`can(viewer, menu, action)`·`visible(viewer, item)`·`scopeFor(viewer, entity)`가
유일한 판정 지점이고 서로 독립이다(`can`↔`visible` 완전 독립, D-35) —
`project(viewer, row, dto)`(위 §2)가 행 객체를 DTO로 투영해 domain 밖으로 내보내는
유일한 출구다. `scopeFor`는 Drizzle SQL 조각이 아니라 서술자(`{ rows, includeArchived }`)를
돌려준다 — `boundaries/element-types`가 domain에서 `db` 계층 import를 금지하므로 표
컬럼을 참조할 수 없다(리포지토리가 서술자를 where절로 번역한다). 보관함
(`archived_at`/`archived_by`)과 `custom_fields` JSONB는 마스터 표에만 둔다(`roles`·
`code_items` 등) — 판정 표(`permission_matrix`·`visibility_matrix`)와 로그 표
(`action_log`)는 대상이 아니다(판정 표는 체크박스 값이라 보관 대상이 아니고 로그는
append-only다).

## 4-2. 설정 레지스트리 조회 계약(Phase 3 → Phase 4)

`getSettingValue(def, opts?)`(`domain/settings/registry.ts`) — 키 문자열이 아니라
레지스트리 **정의 객체**를 받아 반환 타입을 추론한다. `opts.asOf?: Date`는 이력형 키에서만
쓰이고(`effective_from <= asOf` 중 최댓값, 경계 포함) 비이력형은 무시한다. **어느 날짜를
넘길지는 호출자의 책임**이다 — Phase 4의 `domain/money`가 원천징수·회사대납은 지급일,
부가세는 증빙일을 결정해 `asOf`로 넘긴다. 값도 기본값도 없으면 예외(fail-closed).

## 4-3. 시점 소속 조회 계약(Phase 3 → Phase 5·10)

`teamAtDate(viewer, userId, date, deps?)`(`domain/org/index.ts`) — 발령일이 `date` 이하인
발령 이력 중 가장 늦은 것의 팀 Dto를 돌려준다. 해당 이력이 없으면(발령 이력이 아예 없거나
전부 `date`보다 뒤) **`null`을 돌려준다** — 임의의 기본 팀으로 떨어지지 않으며 호출자가 그
`null`을 처리해야 한다. Phase 5의 비용 귀속·Phase 10의 팀 직접 관리비가 사용일을 `date`로
넘겨 이 함수를 그대로 쓴다.

## 4-4. 앱단 암호화 계약(Phase 3, 03-06)

`lib/crypto.ts`의 `encrypt`/`decrypt` — 저장 형식은 `v1:<iv>:<tag>:<ciphertext>`
(콜론 구분, 뒤 세 조각은 각각 base64, AES-256-GCM). 키는 `APP_DATA_KEY_v1`/
`APP_DATA_KEY_v2`(base64 32바이트, Secret Manager). **키가 없거나 길이가
틀리면 암호화·복호화가 즉시 예외(fail-closed)** — 평문 저장이나 빈 값 통과로
떨어지지 않는다. 키 회전은 새 버전 키를 추가하고 옛 키를 남긴 채
`scripts/rotate-key.ts`로 재암호화한다(`pnpm db:rotate-key`) — 복호화는
접두어의 버전으로 키를 골라 v1·v2가 동시에 있어도 둘 다 복호화된다. 마스킹
표시용 뒤 4자리는 암호문과 별도 평문 컬럼에 함께 저장한다(목록이 복호화
없이 그려지고, 복호화 호출 자체가 "마스킹 해제"라는 의미를 갖는다).

## 4-5. 커스텀 필드 규약(Phase 3, 03-06)

마스터 표의 `custom_fields` jsonb 컬럼은 `field_definitions` 표((entity, key)
복합 unique)가 정의한 키·타입만 담는다. 서버 액션이 저장 전
`domain/custom-fields/build-schema.ts`의 `buildCustomFieldsSchema(defs)`로
zod 스키마를 조립해 검증한다(`.strict()` — 등록되지 않은 키 거부). **필드
타입 변경은 금지** — 리포지토리 갱신 함수가 `type` 컬럼을 대상으로 받지
않는다(타입을 바꾸려면 새 필드를 만든다). **이후 새 표는 생성 마이그레이션에
GIN 인덱스를 포함한다** — 기존 마스터 표(`roles`·`code_items`·`org_units`·
`teams`·`corp_cards`)는 이 규약이 정해지기 전에 생겨 마이그레이션 0007이
뒤늦게 채웠다(`03-06-SUMMARY.md`).

## 4-6a. 행동 로그 정리 규약(Phase 3, 03-07)

관리자의 "정리"(ADMN-10)는 `action_log.pruned_at`/`pruned_by` 표시일 뿐 물리 삭제가
아니다 — 정리 함수(`domain/action-log.pruneActionLog`)가 대상 행에 표시를 남기는 것과
같은 호출 안에서 정리 자체를 `action_log_prune` 종류로 기록한다(정리한 사람도 감사
대상). 정리 종류 행 자체는 다음 정리의 대상에서 항상 제외된다.

## 4-6. 문서 번호 카운터 표 규약(Phase 3 → Phase 4, 03-06)

`document_counters`((counterKey, period) 복합 PK) — **이 표는 규약만 세운다.
실제 번호 부여(원자적 증가)와 행 잠금은 Phase 4다.** `repositories/
document-counters.ts`는 읽기와 upsert만 두고 증가 함수를 두지 않는다.

**증가 규약(04-01):** `repositories/document-counters.ts`의 `allocateNumber`가
`UPDATE … RETURNING`으로 원자 증가한다 — 반드시 문서 INSERT와 같은
`db.transaction`(tx) 안에서 불린다. `period`는 서기 연도 네 자리 문자열
(`"2026"`), `counterKey="project"`의 번호 서식은 연도 뒤 두 자리 + 순번
세 자리(`26001`, `domain/document-numbering`).

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
| `boundaries/element-types` | app↛repositories/db, domain↛app, db는 lib만 예외, eslint↛나머지, ui↛domain/repositories/db/app(Phase 2) |
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
| `LOCKOUT_THRESHOLD`·`LOCKOUT_WINDOW_MINUTES` | 잠금 | Phase 3부터 설정 레지스트리 키(`auth.lockout.*`)의 기본값 출처로만 남는다 |
| `RATE_LIMIT_LOGIN_MAX` | 속도 제한 | 부팅 시 1회(`lib/auth.ts` better-auth 설정) — 레지스트리 밖, 런타임 변경 불가 |
| `APP_DATA_KEY_v1`·`APP_DATA_KEY_v2` | 암호화 키(Phase 3부터 사용, v2는 회전용 두 번째 버전) | Secret Manager |
| `SMTP_HOST`·`SMTP_USER`·`SMTP_PASSWORD`·`SMTP_FROM` | 이메일(Phase 1은 정의만) | Secret Manager |
| `GCP_PROJECT_ID`·`CLOUD_SQL_INSTANCE_ID` | 상태 화면의 GCP 조회 | 배포 워크플로 변수 |
| `APP_GIT_SHA`·`APP_DEPLOYED_AT` | 상태 화면 배포 버전 표시 | deploy.sh가 주입 |
| `MAX_INSTANCES` | 16A 커넥션 규칙 계산 | 배포 워크플로 변수 |
| `STATUS_CONN_BANNER_RATIO` | 상태 화면 배너 한도(기본 0.8) | 기본값 |

## 10. 이후 페이즈가 교체·추가하는 지점

- **Phase 2:** 임시 화면(로그인·내 계정·상태) 전부를 `docs/design/SYSTEM.md` 기준으로 교체
- **Phase 3:** `can`/`visible`/`scopeFor(viewer)` + DTO 투영 + 누수 스캔 생성기, 설정
  레지스트리, 암호화 헬퍼(`APP_DATA_KEY_v1` 사용 시작), 행동 로그 표, 계급 5종.
  03-01이 트레이서(판정 4함수 + 행동 로그 + 보관함 + 코드표 화면 1개)로 착수 —
  나머지 여섯 플랜은 이 경로 위의 확장
- **Phase 4:** `domain/money`·`domain/rules.gate` 실제 구현(현재는 린트 규칙 자리만),
  프로젝트·견적 원장, 통화·리저브 대장
- **Phase 7:** 이메일 발송 활성화(SMTP 4개 변수 실사용), 알림 tick(현재 경보는
  `enabled: false`)
