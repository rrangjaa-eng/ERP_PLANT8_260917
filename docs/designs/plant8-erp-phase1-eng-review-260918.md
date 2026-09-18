# PLANT8 ERP Phase 1 플랜 세트 — 엔지니어링 리뷰 (/plan-eng-review, 2026-09-18)

**대상:** `.planning/phases/01-deploy-skeleton-login/01-01 … 01-08-PLAN.md`(8플랜/7웨이브) + `SKELETON.md` + `01-CONTEXT.md`(D-01~D-18) + `COVERAGE.md` + `01-VALIDATION.md`. 설계 문서 = `docs/designs/plant8-erp-phase1-ceo-review-260918.md`(같은 날 CEO 리뷰 — 결정 1A~11A·OV-1~10).
**브랜치:** `docs/phase1-plan-reviews-260918` · **리뷰 시점 base:** `4f6b3ff`(main) · **모드:** FULL_REVIEW(HOLD SCOPE, 8플랜/7웨이브·depends_on 불변)
**결과:** 이슈 10건 전부 결정(권고안 채택 — 자율 실행, 사용자 부재), critical gap 0, 잠긴 결정과 충돌 0, 미결 3(사용자 확인용, CEO 리뷰 §UNRESOLVED와 같음). 결정은 플랜 본문에 반영했고 8플랜 전부 `frontmatter.validate`·`verify.plan-structure` valid(경고 0)를 다시 통과했다.

## Step 0 — 스코프 챌린지

- **기존 코드:** 없음(그린필드). 플랫폼 내장(Cloud Run 리비전·태그 URL·트래픽, Cloud SQL 커넥터+IAM, Cloud Monitoring, better-auth 1.7.5, next-safe-action, drizzle-kit·Squawk, GitHub OIDC→WIF)을 스크립트가 부른다. 리포의 `.claude/settings.json` 훅·`scripts/install_pkgs.sh` 관례는 01-01이 확장.
- **최소 집합:** 로드맵 성공 기준 1~7 전부가 어느 플랜에 매핑돼 있다(01-VALIDATION 표). 미룰 후보는 없다 — 사용자가 8플랜/7웨이브를 잠갔고 HOLD SCOPE다.
- **복잡도 체크:** 발동(플랜 세트가 100파일 이상, 새 서비스·Job 4개). 사용자가 분할(1a/1b)을 명시적으로 거부했으므로 축소 제안 없이 진행. 대신 "파일 수를 늘리지 않는" 편집 원칙을 지켰다 — 이 리뷰가 더한 새 파일은 `proxy.ts`·`lib/client-ip.ts`·`app/session-refresh.tsx`·`infra/ar-cleanup-policy.json`·테스트 1개뿐.
- **검색 체크:** Aside·WebSearch 없이 진행 — 대신 외부 목소리 서브에이전트가 `better-auth@1.7.5`·`@better-auth/core@1.7.5`를 `npm pack`으로 열어 IP 유틸·rate limiter·세션 쿠키·훅 실행 순서를 실측했다(Issue 1·6·Layer 1 근거). Cloud Run XFF 순서·`gcloud run jobs execute --args` 대체 동작은 in-distribution 지식이며 01-07이 실측한다.
- **TODOS.md:** 기존 2건(SMTP 릴레이, exceljs)은 이 페이즈를 막지 않는다. 새 TODO 후보 1건("login_attempts·rate_limits 정리 → Phase 7 tick")은 편집 허용 범위 밖이라 OPERATIONS.md 절에만 적었다.
- **완전성:** 플랜은 이미 완전판 지향(3계층 테스트·가짜 gcloud 시나리오 11개·threat model). 이 리뷰의 추가는 전부 "테스트가 실제 동작을 증명하지 못하던 곳"을 메운 것이다.
- **배포물:** 컨테이너 이미지(AR, SHA 태그)·CLI 번들 3개·워크플로 3개 — 빌드·배포 파이프라인이 플랜 안에 있다. 정리 정책(AR)만 빠져 있어 CEO OV-8로 추가.

## 결정 기록 (10 issues)

| # | 섹션 | 심각도 / 신뢰도 | 결정 (전부 A) | 반영 위치 |
|---|---|---|---|---|
| 1 | Arch·Security | P1 / 9 | 클라이언트 IP = `x-forwarded-for` **마지막** 항목. 리포 루트 `proxy.ts`(Next.js 16, matcher `/api/auth/*`)가 `x-client-ip`를 항상 덮어쓰고, better-auth `ipAddressHeaders: ['x-client-ip']`·잠금 훅은 그 헤더만 읽는다; `x-client-ip` 없는 sign-in은 `hooks.before`가 500 + `auth.client_ip_missing`으로 거부(fail-closed). 근거: (a) Cloud Run/GFE는 클라이언트 XFF를 보존하고 실제 IP를 뒤에 붙인다 → 첫 항목은 위조 가능; (b) better-auth 1.7.5 `getIPFromHeader`는 값이 2개 이상이면 `trustedProxies` 없이는 **null**, null이면 rate limiter 키가 `no-trusted-ip\|<path>` 공용 버킷(경고 1회) → 클라이언트가 XFF 하나만 끼워도 전 직원이 분당 10회를 나눠 쓰는 조용한 DoS; (c) test/dev에서는 null → `127.0.0.1` 폴백이라 헤더를 빠뜨린 테스트는 조용히 한 버킷에 묶인다 — fail-closed가 이를 500으로 드러낸다. `trustedProxies`는 Cloud Run 프런트 IP가 고정 목록이 아니라 불가 | 01-02 files·must_haves·artifacts·key_links·<interfaces>·Task 2 read_first·behavior(client-ip 단위, lockout·rate-limit 통합)·action 4~8·verify·acceptance·T-1-07·산출물; 01-07 Task 3 step 3 실측(위조 XFF 11회 → 429, `no-trusted-ip` 경고 부재); CONTEXT 색인; SKELETON Auth 행; VALIDATION 1-02-02 |
| 2 | Arch | P1 / 8 | 접속 주소는 결정적 URL(`https://erp-{env}-<번호>.<region>.run.app`) 하나. deploy.sh `SERVICE_URL`은 이 값이며 서비스·Job `BETTER_AUTH_URL`·스모크·stdout 전부 같다; `describe status.url`이 레거시 `*.a.run.app`를 돌려주면 stderr 메모만. 스모크에 `Origin: $SERVICE_URL` + 가짜 자격 POST `/api/auth/sign-in/email`을 더해 403(Origin 불일치)이면 `SmokeFailed(origin)`. 근거: better-auth는 production에서 POST의 Origin이 `baseURL`과 다르면 403 "Invalid origin" — 기존 플랜은 describe 값이 다르면 stdout에 **그 값**을 쓰게 돼 있어 사용자가 그 주소로 들어가면 로그인만 깨지고 배포는 success였다 | 01-06 must_haves(2건)·<interfaces> SERVICE_URL·action deploy_service·smoke·behavior 1·2·5·가짜 curl·acceptance; 01-04 OPERATIONS (1); 01-08 Task 3 step 1; CONTEXT 색인 |
| 3 | Deploy | P2 / 9 | rollback.sh는 `services describe status.traffic`에서 percent 100인 리비전을 `SERVING`으로 잡고, 생성 시각 내림차순 목록에서 그 **다음** 항목을 `PREV`로 쓴다. 기존 "둘째로 새 리비전"은 스모크 실패로 0% 리비전이 남아 있을 때 현재 서빙 리비전을 다시 고르는 no-op 롤백("롤백 완료" 출력)이 된다 — 5xx 경보 상황에서 못 되돌린다 | 01-06 must_haves·action 3·behavior rollback 5시나리오·가짜 gcloud `serving` 상태·acceptance; 01-04 OPERATIONS (5) |
| 4 | Quality | P1 / 8 | `plant8/require-action-client`가 파일 수준 `"use server"`만 검사하면 서버 컴포넌트 안의 인라인 `async function save(){ "use server"; … }`가 래퍼 없이 통과한다(Issue 2·T-1-19 우회, AI 드리프트 Pitfall 14의 전형). 함수 본문 첫 문장이 `"use server"` 디렉티브인 함수를 파일 위치와 무관하게 report + 테스트 3건 + 프로브 파일 acceptance | 01-04 <interfaces> 규칙 계약·Task 1 behavior·acceptance |
| 5 | Tests | P2 / 8 | (a) 실제 `gcloud run jobs execute --wait`는 컨테이너 exit 3을 전파하지 않고 exit 1만 돌려준다 — 기존 가짜 심은 exit 3을 돌려줘 존재하지 않는 경로를 증명했다. 가짜 심을 실제와 같게(execute → exit 1, `logging read` → 위반 줄) 바꾸고 run_migrate는 로그 조회를 주 경로로. (b) 어느 gcloud가 죽었는지 알 수 없던 문제 — `STAGE` 변수 + `trap ERR`로 `deploy failed at <stage>`(시나리오 5b) | 01-06 <interfaces> 실패 출력·action 서두·run_migrate·behavior 4·5b·가짜 심·acceptance; 01-04 OPERATIONS (4) |
| 6 | Arch | P2 / 9 | D-07 sliding의 **쿠키** 연장: better-auth는 자기 라우트(`/api/auth/get-session` 등) 응답의 `Set-Cookie`로만 쿠키를 재발급하고, 서버 컴포넌트의 `auth.api.getSession({ headers })`는 DB `expiresAt`만 연장한다(`lib/auth.ts`는 next import 금지라 `nextCookies()` 불가). 그대로면 매일 쓰는 직원도 첫 로그인 30일 뒤 강제 재로그인 — E2E (d)는 최초 만료일만 봐서 통과한다. `app/session-refresh.tsx`(클라이언트, 마운트 시 `authClient.getSession()` 1회)를 루트 레이아웃에 + 통합 테스트(세션 `updated_at` 2일 전 backdate → `GET /get-session` 응답에 `set-cookie`, 새 세션은 없음) | 01-01 files·must_haves·Task 2 files·action 6·Task 3 behavior(auth.test)·acceptance; SKELETON Auth 행; VALIDATION 1-01-03; CONTEXT 색인 |
| 7 | Deploy·공급망 | P2 / 7 | Dockerfile deps 스테이지 `pnpm install --frozen-lockfile --ignore-scripts`(이미지는 squawk를 실행하지 않는데 `squawk-cli` postinstall이 네트워크 다운로드로 빌드를 묶고, postinstall 전면 차단이 T-1-SC2에도 낫다; esbuild는 optionalDependencies 바이너리라 스크립트 없이 동작 — 실패 시 `pnpm rebuild esbuild` 폴백 명시), `corepack enable` 대신 `npm install -g pnpm@<packageManager>`(Node 24 deprecated·25 제거), `.dockerignore`에 `gha-creds-*.json`(CEO OV-2 — WIF 자격 파일이 이미지 레이어에 남는 것 방지, T-1-SC3) | 01-05 Task 1 behavior·action 1·threat model; 01-01 `.gitignore` 짝 |
| 8 | Arch | P1 / 9 | account Job은 `gcloud run jobs deploy … --command=node,dist/cli/account-cli.mjs`(args 없음)로 배포한다. account.yml의 `jobs execute --args="create,--email,…"`는 배포 시 args를 **대체**하므로 기존 `--command=node --args=dist/cli/account-cli.mjs`로 배포하면 컨테이너가 `node create --email …`를 실행해 "Cannot find module 'create'"로 죽는다 — 01-07 Task 3의 첫 계정 발급이 실패했을 것 | 01-06 action deploy_jobs·behavior 9·Task 2 action 4; VALIDATION 1-06-01 |
| 9 | Tests·DX | P2 / 9 | `playwright.config.ts` `reuseExistingServer: !CI`는 개발자가 `.env.local`(erp DB·다른 secret)로 띄운 `pnpm dev`(3000)에 E2E가 붙어 픽스처(erp_test)와 서버(erp)가 어긋난 채 전부 "이메일 또는 비밀번호가 올바르지 않습니다"로 실패하게 한다 — CLAUDE.md "실제 실행 확인" 루프를 원인 불명으로 깨뜨림. E2E 전용 `PORT=3100` + `reuseExistingServer: false` | 01-01 Task 2 action 7·Task 3 action 8 |
| 10 | Observability | P3 / 6 | 5xx ratio 정책 템플릿에 `denominatorAggregations`(numerator와 동일) 추가 — 비율 조건은 분모 집계가 없으면 API가 거부할 수 있다; `ensure_alerts`를 `promote` **앞**으로 옮겨 경보 upsert 실패가 "앱은 100% 서빙 중인데 워크플로만 빨강"이 아니라 승격 전 중단이 되게 | 01-06 must_haves 순서·action ensure_alerts/promote·Task 2 템플릿·behavior 2 |

Section 4(성능)의 그 외 항목 — 16A 커넥션(3×5=15 ≤ 20; Job 풀은 pg Pool의 지연 연결이라 배포 중 동시 연결 1~2개), 상태 화면 Admin API 5초 타임아웃, better-auth rateLimit의 요청당 DB 1회(30명 규모), 콜드스타트(min 0 + Direct VPC egress — 첫 요청 수초, OPERATIONS에 기재) — 는 규모상 이슈 없음.

## NOT in scope (이 리뷰에서 제안하지 않은 것)

- better-auth rateLimit을 버리고 `login_attempts`로 IP 제한까지 직접 구현 — 로드맵 기준 2("IP 속도 제한은 better-auth rateLimit")와 충돌. `proxy.ts` 정규화로 해결(Issue 1).
- `nextCookies()` 플러그인·`lib/auth.next.ts` 분리 — CLI 번들 규칙과 충돌, 클라이언트 1회 호출이 더 작다(Issue 6).
- 요청 상관 ID(`logging.googleapis.com/trace`) — AsyncLocalStorage 도입 필요, Phase 1 밖.
- 롤백 시 DB 되돌리기 — 확장-축소 규칙(Squawk)으로 불필요(Issue 4 로드맵).
- `--no-traffic` 첫 배포 가능 여부·`status.url` 형식·`spec.containers[0].image` 태그 보존 — [ASSUMED]로 두고 01-07이 실측(이미 플랜에 있음).
- 인라인 서버 액션을 허용하되 래퍼를 강제하는 방식 — 인라인 액션은 `authedActionClient` 체인을 만들 수 없으므로 금지가 유일한 일관된 규칙(Issue 4).

## What already exists

| 하위 문제 | 이미 있는 것 | 플랜의 태도 |
|---|---|---|
| IP 추출 | better-auth `advanced.ipAddress.ipAddressHeaders`·`trustedProxies` | 헤더 이름만 바꿔 쓴다(`x-client-ip`); 정규화는 Next.js `proxy.ts`(플랫폼 내장 미들웨어) |
| 세션 쿠키 갱신 | better-auth `get-session` 라우트의 Set-Cookie | 클라이언트가 한 번 부른다 — 서버 코드 추가 없음 |
| 리비전·트래픽 | Cloud Run `status.traffic`·`update-traffic --to-revisions` | rollback.sh가 서빙 리비전을 읽는다 |
| Job 실행 인자 | Cloud Run Job `--command`/`--args` 의미론 | 계약을 정확히 맞춘다(Issue 8) |
| 인라인 서버 액션 탐지 | ESLint AST(FunctionDeclaration/Expression 본문 디렉티브) | 기존 규칙에 방문자 하나 추가 |
| 이미지 빌드 격리 | pnpm `--ignore-scripts`, `.dockerignore` | 플래그·패턴만 |
| 워크플로 실행 예산 | GitHub `paths-ignore`, concurrency | 트리거 정리(CEO 9A) |

## Diagrams

### 1. 로그인 요청 경로와 IP 규칙 (Issue 1)
```
 클라이언트 ──[XFF: 위조?]──▶ Cloud Run 프런트 ──[XFF: 위조, 실제IP]──▶ proxy.ts (/api/auth/*)
                                                                        │ x-client-ip = XFF[last]  (없으면 127.0.0.1 — 로컬만)
                                                                        ▼
                                  app/api/auth/[...all]/route.ts ──▶ better-auth
                                    rateLimit key = x-client-ip(값 1개 → null 아님)
                                    hooks.before: /sign-in/email → x-client-ip 없음? 500 fail-closed
                                                                 → count(open failures) ≥ N ? 403
                                    hooks.after : recordAttempt(ip = x-client-ip) · resolve · lockout 이벤트(≥N)
 통합 테스트: auth.handler 직접 호출 → proxy 없음 → 헤더를 직접 넣는다 / 없으면 500 단언
```

### 2. 배포 파이프라인 (Issue 2·3·5·8·10 반영)
```
 deploy.sh --env E --project P --region R --sha S
  STAGE=parse_args → require_clean_tree(gha-creds 무시) → resolve_project_number → SERVICE_URL(결정적, 유일)
  → require_prod_image(prod) → ensure_apis → ensure_ar_repo(+cleanup policy) → ensure_network
  → ensure_sql_instance(auto-increase ≤20GB) → ensure_sql_db_users → ensure_secrets → build_and_push_image
  → deploy_jobs(db-bootstrap·migrate: --command=node --args=<mjs> / account: --command=node,<mjs>)
  → run_db_bootstrap → run_migrate(실패 → logging read pool_rule? PoolRuleViolation : migration failed)
  → deploy_service(EXISTS ? --no-traffic --tag rev-<sha8> : 100%; describe url ≠ 결정적 → note)
  → smoke(GET /healthz ok:true · GET /login 200 · POST sign-in Origin=SERVICE_URL → 403? SmokeFailed(origin))
  → ensure_alerts(채널·지표·정책 3, denominatorAggregations) → promote(--to-latest) → map_domain(자리) → SERVICE_URL=
  trap ERR: "deploy failed at $STAGE"
```

### 3. 롤백 선택 (Issue 3)
```
 revisions(생성 내림차순): [v3(0%, 스모크 실패 잔존), v2(100%), v1]
 SERVING = traffic[percent==100] = v2
 PREV    = list[index(SERVING)+1] = v1      ← 기존 "둘째" = v2(no-op) 였음
 없으면 "no previous revision"; SERVING 없으면 "no serving revision"
```

### 4. 세션 sliding — DB와 쿠키 (Issue 6)
```
 RSC getSession(headers) ──▶ DB expiresAt 연장(updateAge 1일)     쿠키: 변화 없음(응답 헤더를 못 씀)
 클라이언트 SessionRefresh ──▶ GET /api/auth/get-session ──▶ Set-Cookie erp.session_token (maxAge 30일)  ← 여기서만
```

## 인라인 다이어그램이 필요한 파일

| 파일 | 다이어그램 | 이유 |
|---|---|---|
| `domain/auth/hooks.ts` | before/after 훅 판정 트리(path → x-client-ip → count → 403 / 기록 → resolve → lockout 이벤트) | 세 분기가 보안 경계 |
| `scripts/deploy.sh` | 단계 순서 + 각 단계의 실패 메시지(Diagram 2) | 워크플로 로그만 보는 운영자용 |
| `scripts/rollback.sh` | Diagram 3 | "둘째"로 되돌아가는 회귀 방지 |
| `proxy.ts` | Diagram 1 상단 3줄 | Phase 2~3 로드밸런서 도입 시 바꿀 지점 명시 |
| `app/session-refresh.tsx` | Diagram 4 | "왜 클라이언트에서 부르나"가 6개월 뒤 지워질 위험 |

## Test Review — 커버리지 다이어그램

```
CODE PATHS                                                  USER FLOWS
[+] lib/client-ip.ts · proxy.ts                             [+] 로그인 → 세션 유지 → 로그아웃
  ├── [★★★ TESTED] last 항목·빈 항목·없음·덮어쓰기 — client-ip.test.ts   ├── [★★★ TESTED] login-logout.spec.ts (a)(b)(c)(d)
[+] domain/auth/hooks.ts                                      ├── [★★  TESTED] 쿠키 sliding — auth.test.ts get-session set-cookie (Issue 6)
  ├── [★★★ TESTED] 잠금 6회째·창 만료·resolve·admin_unlock·비노출·이벤트   └── [→E2E 수동] 30일 무사용 — VALIDATION Manual-Only
  ├── [★★★ TESTED] 429 · x-client-ip 없음 → 500 (Issue 1)               [+] 비밀번호 변경·임시 배너
  └── [ACCEPTED] 동시 실패 이벤트 2회(at-least-once)                     └── [★★★ TESTED] change-password.spec.ts 7단언
[+] scripts/account-cli.ts                                  [+] 상태 화면
  └── [★★★ TESTED] parseArgs·create·reset·unlock·중복                   └── [★★★ TESTED] 404·200·3항목·백업 none/unavailable
[+] eslint/rules/require-action-client                       [+] 배포 (사람 + 스모크)
  └── [★★★ TESTED] 파일 디렉티브 5 + 인라인 3 (Issue 4)                   ├── [★★★ TESTED] 가짜 gcloud 시나리오 1~11 + 5b + rollback 5
[+] scripts/migrate-runner.ts                                 ├── [★★  실측] XFF 11회 429, describe url, backup 필터 — 01-07·01-08
  └── [★★★ TESTED] exit 3·skipped·max_connections (자식 프로세스)        └── [→E2E 수동] Origin POST는 스모크가 매 배포 자동 (Issue 2)
[+] scripts/deploy.sh · rollback.sh · bootstrap-gcp.sh
  ├── [★★★ TESTED] 순서·플래그·Job env·prod 거부·domain 자리·dirty
  ├── [★★★ TESTED] migrate 로그 경로·SmokeFailed(origin)·stage trap (Issue 5·2)
  └── [★★★ TESTED] rollback 서빙 기준 (Issue 3) · bootstrap 사전 검사·단일 파일 상수 일치
[+] Dockerfile · .dockerignore · workflows
  └── [★★  TESTED] 텍스트 단언(ignore-scripts·gha-creds·paths-ignore·command) — 실제 빌드는 01-07

COVERAGE: 코드 경로 26/26 (100%) | 사용자 흐름 8/8 (수동 2 포함) | GAPS: 0 (수용 1)
QUALITY: ★★★:19 ★★:5 실측:2
```

REGRESSION: 없음(그린필드). 이 리뷰가 고친 "테스트가 거짓을 증명하던 곳" 3건 — migrate exit 3 경로(Issue 5), rate-limit XFF 셋째 단언(Issue 1(c)), E2E 서버 재사용(Issue 9).

## Failure Modes Registry

| # | 코드 경로 | 운영 실패 시나리오 | 테스트 | 오류 처리 | 사용자에게 | 판정 |
|---|---|---|---|---|---|---|
| F1 | rateLimit 키 | XFF 위조 → 공용 버킷 → 전 직원 429 | 단위·통합·실측 | proxy 정규화 + fail-closed | 429/500 명확 | 봉합(Issue 1) |
| F2 | 세션 쿠키 | 30일 고정 만료 | 통합 | 클라이언트 재발급 | 없음 | 봉합(Issue 6) |
| F3 | 접속 URL | 레거시 URL 로그인 403 | 스모크 POST | SmokeFailed(origin) | 배포 실패 | 봉합(Issue 2) |
| F4 | rollback | no-op 롤백 | 단위 3리비전 | 서빙 기준 | 올바른 리비전 | 봉합(Issue 3) |
| F5 | account Job | `node create` 모듈 없음 | 시나리오 9 | `--command` 계약 | — | 봉합(Issue 8) |
| F6 | migrate 실패 | 원인 불명 "migration failed" | 시나리오 4 | 로그 조회 | PoolRuleViolation | 봉합(Issue 5) |
| F7 | 인라인 액션 | 래퍼 우회 | 규칙 테스트 | 린트 error | CI 실패 | 봉합(Issue 4) |
| F8 | E2E | 다른 DB의 dev 서버에 붙음 | — | 포트 분리·재사용 금지 | 명확한 실패 | 봉합(Issue 9) |
| F9 | 이미지 빌드 | squawk 다운로드 실패·자격 파일 포함 | 텍스트 단언 | ignore-scripts·dockerignore | 빌드 실패 | 봉합(Issue 7) |
| F10 | 경보 upsert | API 거부로 워크플로만 빨강 | 시나리오 2 순서 | 승격 전 중단 | 배포 실패 | 봉합(Issue 10) |
| F11 | hooks.after | DB 쓰기 실패 → 500 | — | better-auth 기본 | 500 | 수용(드묾, 세션 미생성) |

**Critical gaps: 0.**

## Worktree parallelization strategy

웨이브·depends_on은 사용자가 잠갔다(1→2→3→4→5(01-05 ∥ 01-06)→6→7). 이 리뷰가 더한 파일은 병렬성을 바꾸지 않는다: `proxy.ts`·`lib/client-ip.ts`(01-02), `app/session-refresh.tsx`(01-01), `infra/ar-cleanup-policy.json`(01-06). 01-05·01-06 병렬(`coupling_justified`)은 여전히 성립 — 01-06의 새 파일은 `infra/`, 01-05는 `Dockerfile`·`scripts/`·`domain/ops`. Conflict flag: 01-08 `files_modified`에 `infra/monitoring/backup-failed.json.tpl`을 더했지만 01-08은 웨이브 7 단독이라 충돌 없음.

## Implementation Tasks

Synthesized from this review's findings. 플랜 본문에 반영 완료 — 실행자용 색인.

- [ ] **T1 (P1, human: ~3h / CC: ~20min)** — 01-02 — `proxy.ts`·`lib/client-ip.ts`·`ipAddressHeaders`·fail-closed·테스트 (Issue 1)
- [ ] **T2 (P1, human: ~1h / CC: ~10min)** — 01-06 — SERVICE_URL 고정·Origin POST 스모크·가짜 curl (Issue 2)
- [ ] **T3 (P1, human: ~30min / CC: ~5min)** — 01-06 — account Job `--command=node,dist/cli/account-cli.mjs` (Issue 8)
- [ ] **T4 (P1, human: ~1h / CC: ~10min)** — 01-04 — 인라인 `use server` 규칙·테스트·프로브 (Issue 4)
- [ ] **T5 (P2, human: ~2h / CC: ~15min)** — 01-06 — rollback 서빙 기준 + 5시나리오 (Issue 3)
- [ ] **T6 (P2, human: ~1h / CC: ~10min)** — 01-01 — session-refresh + get-session 통합 테스트 (Issue 6)
- [ ] **T7 (P2, human: ~1h / CC: ~10min)** — 01-06 — run_migrate 로그 경로·STAGE trap·가짜 심 exit 1·5b (Issue 5)
- [ ] **T8 (P2, human: ~20min / CC: ~5min)** — 01-01 — Playwright 3100·reuse false (Issue 9)
- [ ] **T9 (P2, human: ~30min / CC: ~5min)** — 01-05·01-01 — `--ignore-scripts`·pnpm 설치·gha-creds 무시 (Issue 7)
- [ ] **T10 (P3, human: ~20min / CC: ~5min)** — 01-06 — `denominatorAggregations`·ensure_alerts 위치 (Issue 10)
- [ ] **T11 (P3, 실행 시 사람)** — 01-07 — XFF 실측·describe url·`no-trusted-ip` 경고 부재 확인 (Issue 1·2)

_No new tasks from Section 4 (Performance)._

## OUTSIDE VOICE (Claude subagent — 신선한 컨텍스트, 같은 하네스, Fable 5 명시, better-auth 1.7.5 소스 실측)

Codex 미설치로 네이티브 대체(outside_status: unavailable). Eng 렌즈 서브에이전트 8건. 전문은 리뷰 세션 기록에 있고 요지는 아래.

| # | 발견 | 결정 | 반영 |
|---|---|---|---|
| OV-1 | `jobs execute --args`가 배포 args를 대체 → account Job `node create …` | **A 수용** | Issue 8 |
| OV-2 | better-auth 1.7.5 IP 유틸: 2개 이상 → null, test/dev 폴백 127.0.0.1, 공용 버킷 키 — 리뷰 초안의 "첫 항목·NODE_ENV=test 분기" 전제가 둘 다 틀림; fail-closed 권고 | **A 수용(리뷰 초안 정정)** — vitest.config.ts NODE_ENV 조건 삭제, read_first를 실측 서술로, fail-closed 훅·테스트 추가 | Issue 1 |
| OV-3 | sliding 쿠키는 라우트 응답에서만 갱신 → 30일 강제 재로그인 | **A 수용** | Issue 6 |
| OV-4 | rollback "둘째 리비전" no-op | **A 수용**(리뷰도 독립 발견) | Issue 3 |
| OV-5 | Playwright `reuseExistingServer` DB 어긋남 | **A 수용** | Issue 9 |
| OV-6 | migrate exit 3 미전파, 로그 경로 미테스트 | **A 수용** + `logging read` 재시도는 account.yml 루프와 같은 원리로 run_migrate에 `--freshness=10m` 1회(배포는 어차피 멈추므로 재시도 3회는 생략) | Issue 5 |
| OV-7 | describe URL ≠ 결정적 URL → 403; exit 1 또는 trustedOrigins 권고 | **B 보강**: stdout은 결정적 URL 유지 + 메모, 실제 검증은 Origin POST 스모크(CEO OV-5)가 매 배포 수행 — exit 1은 두 URL이 모두 정상 응답하는 Cloud Run 기본 상태를 실패로 만들어 과하다 | Issue 2 |
| OV-8 | 5xx `denominatorAggregations` 누락, ensure_alerts가 promote 뒤 | **A 수용** | Issue 10 |

CROSS-MODEL TENSION: OV-2가 리뷰 초안의 전제(better-auth가 첫 항목을 쓴다)를 소스로 반박했고 리뷰가 정정했다 — 결론(마지막 항목 + `x-client-ip`)은 같았고 근거가 더 나빠진 쪽(공용 버킷 DoS)으로 강화됐다. OV-7만 처방을 바꿨다(exit 1 → 스모크 증명).

## TODOS.md updates

0건(편집 허용 범위 밖). 후보 1건은 OPERATIONS.md (11)에 기록 — Phase 7 계획 시 회수.

## Completion Summary

- Step 0: Scope Challenge — scope accepted as-is (8플랜/7웨이브 잠김, 복잡도 체크 발동했으나 사용자 축소 거부 기록)
- Architecture Review: 4 issues found (1·2·6·8, 전부 결정)
- Code Quality Review: 2 issues found (4·7)
- Test Review: diagram produced, 3 gaps identified (5·9 + Issue 1(c)) — 전부 플랜에 테스트로 추가
- Performance Review: 0 issues (4항목 검토, 규모상 이슈 없음)
- Observability: 1 issue (10)
- NOT in scope: written (6 items)
- What already exists: written
- TODOS.md updates: 0 (범위 밖 — OPERATIONS.md에 1건)
- Failure modes: 0 critical gaps (11 rows, 1 accepted)
- Outside voice: ran (Claude subagent — codex unavailable), 8 findings → 7 accepted, 1 refined
- Parallelization: 웨이브 불변, 01-05 ∥ 01-06 유지
- Lake Score: 10/10 recommendations chose complete option
- Plan validation after edits: 8/8 frontmatter valid, 8/8 structure valid, 0 warnings, `<automated>`:`<fails_when>` 17:17
- Unresolved decisions: 3 (사용자 확인용 — CEO 리뷰 §UNRESOLVED와 동일)

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR (2026-09-18, `plant8-erp-phase1-ceo-review-260918.md`) | mode: HOLD_SCOPE, 0 critical gaps, 11 findings + 10 outside decided |
| Outside Review | Claude subagent (codex not installed) | Independent 2nd opinion | 2 (CEO·Eng 렌즈) | unavailable (native fallback completed, 8+6 / 8 findings) | 17 accepted, 1 refined, 4 low-confidence dispositioned |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (2026-09-18, 자율 실행 — 권고안 자동 채택) | 10 issues, 0 critical gaps, 0 locked-decision conflicts |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — (Phase 2) | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** provider codex — not installed; phase plan-review for both CEO and Eng completed by native Claude subagents (Fable 5, in-host — not external-model coverage). Eng 렌즈는 better-auth 1.7.5 패키지 소스를 직접 열어 검증했다.
- **VERDICT:** CEO + ENG CLEARED — ready to implement. 실행 세션은 수정된 플랜을 그대로 따르면 되고, 아래 3건은 사용자가 답만 주면 된다(플랜 편집 불필요).

**UNRESOLVED DECISIONS:**
- 조직 정책 예외 요청에 `iam.workloadIdentityPoolProviders` 포함 여부(01-06 bootstrap이 막히면 멈추도록 돼 있음)
- CI 트리거를 `pull_request`만으로 둔 것(9A) — PR 없는 브랜치 푸시는 CI를 돌지 않는다
- `proxy.ts`·`x-client-ip`·fail-closed 구조 추가(Issue 1) — Claude's Discretion 범위로 판단해 채택, 거부 시 대안 없음(유지 권고)
