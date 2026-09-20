---
status: testing
phase: 01-deploy-skeleton-login
source: [01-01-SUMMARY.md, 01-02-SUMMARY.md, 01-03-SUMMARY.md, 01-04-SUMMARY.md, 01-05-SUMMARY.md, 01-06-SUMMARY.md, 01-07-SUMMARY.md, 01-08-SUMMARY.md]
started: 2026-09-20T08:32:45Z
updated: 2026-09-20T08:48:32Z
---

## Current Test

number: 3
name: Cloud Run 비용 ≈ 0 확인 (01-05 D5)
expected: |
  min-instances 0 전제라 유휴 시 과금이 거의 없어야 한다. GCP 청구서(또는 결제
  대시보드)에서 Cloud Run·Cloud SQL 실제 금액을 본다. 코드로는 증명 불가 — 청구서 의존.
awaiting: user response

## Tests

### 1. Cold Start Smoke Test
expected: 로컬에서 돌던 서버·DB를 전부 내리고 임시 상태(컨테이너, 캐시, 락 파일)를 지운 뒤 `pnpm db:dev` → `pnpm dev`로 맨바닥에서 올린다. 서버가 오류 없이 뜨고 마이그레이션·시드가 끝나며 `/login`이 뜨고 로그인이 된다.
result: pass
source: executor-verified
evidence: "Postgres 클러스터 정지 + .next 삭제 상태에서 시작. pnpm db:dev(exit 0) -> pnpm db:migrate({\"event\":\"db.migrate\",\"applied\":true}) -> next dev Ready 806ms. /api/health 200 {\"ok\":true,\"sha\":\"local\"}, /login 200(PLANT8·이메일·비밀번호 렌더), 비로그인 /account 307 -> /login. account:create 후 POST /api/auth/sign-in/email 200, 그 세션으로 /account 200(이메일·로그아웃·임시 비밀번호 배너 확인). 제약: DROP DATABASE가 이 세션에서 차단돼 DB 데이터는 남은 상태였다 — 스키마/데이터 empty 상태의 콜드 스타트는 아니다."

### 2. CI 파이프라인 실제 실행 (01-04 D3)
expected: GitHub Actions에서 ci.yml이 lint → typecheck → Squawk → 단위 → Postgres 서비스 컨테이너 통합 → build → Playwright E2E 순으로 실제로 돌고, 하나라도 실패하면 워크플로가 실패한다. 메타 테스트(ci-guard.test.ts 7건)는 통과했지만 실제 러너 실행은 미관찰 — 최근 ci 실행 하나를 열어 단계 순서와 결과를 확인한다.
result: pass
source: executor-verified
evidence: "Actions ci.yml 43회 실행, 최신 run #43(35498414997) success. 잡 단계 실측: quality = lint -> typecheck -> lint:sql(Squawk) -> test:unit, 이어서 needs:quality인 integration-e2e = Initialize containers(postgres:16 서비스 컨테이너) -> db:migrate -> test:integration -> playwright install -> test:e2e. playwright.config.ts:48 webServer command가 CI에서 `pnpm build && pnpm start`라 build(webServer) 단계도 성립. ci.yml에 continue-on-error/`|| true` 없음 -> 한 단계라도 실패하면 잡·워크플로가 실패. `drizzle-kit push`는 .github/·scripts/·package.json 어디에도 없음. test/unit/ci-guard.test.ts 9 passed 재실행 확인."

### 3. Cloud Run 비용 ≈ 0 확인 (01-05 D5)
expected: min-instances 0 전제라 유휴 시 과금이 거의 없어야 한다. GCP 청구서(또는 결제 대시보드)에서 Cloud Run·Cloud SQL 실제 금액을 본다. 코드로는 증명 불가 — 청구서 의존.
result: [pending]

### 4. 실제 GCP 배포 경로 재확인 (01-06 D10)
expected: 01-06은 가짜 gcloud/docker 심으로만 검증했고, 실제 gcloud 출력 형태(status.url 호스트, revisions describe의 image 필드) 재확인은 01-07의 몫이었다. 01-07·01-08 DEPLOY-LOG에 실측이 기록됐는지, 그 내용이 현재 스크립트와 일치하는지 확인한다.
result: pass
source: executor-verified
evidence: "01-07·01-08이 남긴 실측 3건이 현재 스크립트에 그대로 반영돼 있음을 코드로 확인: (1) status.url 정본 — deploy.sh:403-413이 배포 전에 describe status.url을 읽어 SERVICE_URL을 교체하고 456-466이 계산식 URL을 신뢰하지 않는 이유를 기록; (2) image가 태그를 보존하지 않음 — promote-guard.sh:77-85가 revisions describe JSON에서 APP_GIT_SHA env를 읽고, 없거나 형식이 틀리면 중단; (3) /healthz는 구글 엣지 예약 경로 — app/api/health/route.ts로 이전, deploy.sh smoke가 ${target}/api/health 사용. Actions 실측: deploy.yml 28회 실행, run #24(35378970054, workflow_dispatch) 프로덕션 승격 success, 최신 run #28 success."

### 5. 프로덕션 세션 유지 — 브라우저 종료 후 재진입 (VERIFICATION human 1)
expected: 프로덕션 URL에서 관리자로 로그인한 뒤 브라우저를 완전히 종료하고 다시 열어 /account에 바로 들어가진다. 실제 Cloud Run 도메인에서 쿠키 속성(Secure/SameSite/만료 30일)이 같게 내려오는지는 브라우저로만 확인 가능 — 프로브는 /login에서 Set-Cookie를 못 봐 닫지 못했다.
result: [pending]

### 6. 프로덕션 /admin/system-status 관리자 렌더 + 백업 절 (VERIFICATION human 2)
expected: 프로덕션에서 관리자로 /admin/system-status를 열면 배포 SHA(ed2fbc56)·DB 커넥션 n / 25·마지막 백업 절이 보인다. 2026-09-19 18:00 UTC 첫 자동 백업 이후 다시 열면 백업이 '성공 + 시각'으로 바뀐다. 런타임 SA의 roles/cloudsql.viewer 실부여와 Cloud SQL Admin API 호출 경로가 프로덕션에서 처음 관찰된다.
result: [pending]

### 7. 백업 실패 경보 필터·메일 전달 (VERIFICATION human 3)
expected: 백업 실패 경보 정책의 필터가 실제 이벤트를 잡고 이메일이 배달된다. 정책 존재는 2026-09-18 실측으로 확인됐지만, 실패 이벤트 없이는 필터 정확성과 메일 전달을 프로그램으로 검증할 수 없다.
result: [pending]

### 8. 조직 정책 원문·런타임 SA 역할 확인 (VERIFICATION human 4)
expected: Owner 계정으로 조직 정책 4건의 원문과 런타임 SA의 역할 목록을 직접 조회해 실효적 차단이 없음을 원문으로 확인한다. gha-deployer SA에는 orgpolicy.policy.get·resourcemanager.projects.getIamPolicy가 없어 실행자가 조회할 수 없었다(PERMISSION_DENIED).
result: [pending]

### 9. 임시 프로브 브랜치 4개 삭제 (01-08 User Setup Required)
expected: origin의 `probe-result`, `probe-result2`, `guard-probe-result`, `prod-verify-result` 네 브랜치가 지워져 있다. 2026-09-20 확인 결과 네 개 모두 origin에 그대로 남아 있다 — 실행자 세션에서는 ref 삭제가 막혀 사용자가 지워야 한다.
result: [pending]

### 10. 픽스처 계정으로 /login에서 이메일+비밀번호를 제출하면 /account로 이동하고 이메일이 보인다
expected: 픽스처 계정으로 /login에서 이메일+비밀번호를 제출하면 /account로 이동하고 이메일이 보인다
result: pass
source: automated
coverage_id: D1

### 11. 로그인 뒤 저장한 브라우저 상태로 새 컨텍스트를 열어도 /account가 유지되고 세션 쿠키가 30일 sliding이다
expected: 로그인 뒤 저장한 브라우저 상태로 새 컨텍스트를 열어도 /account가 유지되고 세션 쿠키가 30일 sliding이다
result: pass
source: automated
coverage_id: D2

### 12. /account 로그아웃 버튼을 누르면 현재 기기 세션만 끝나고 /login으로 가며 /account 재접근은 /login으로 리다이렉트된다
expected: /account 로그아웃 버튼을 누르면 현재 기기 세션만 끝나고 /login으로 가며 /account 재접근은 /login으로 리다이렉트된다
result: pass
source: automated
coverage_id: D3

### 13. pnpm db:dev 한 번으로 Docker 또는 apt Postgres 어느 쪽이든 127.0.0.1:5432에 erp·erp_test DB가 준비된다
expected: pnpm db:dev 한 번으로 Docker 또는 apt Postgres 어느 쪽이든 127.0.0.1:5432에 erp·erp_test DB가 준비된다
result: pass
source: automated
coverage_id: D4

### 14. GET /healthz는 DB SELECT 1 성공 시 200 {ok:true,sha,deployedAt}, 실패 시 503을 반환한다
expected: GET /healthz는 DB SELECT 1 성공 시 200 {ok:true,sha,deployedAt}, 실패 시 503을 반환한다
result: pass
source: automated
coverage_id: D5

### 15. POST /api/auth/sign-up/email은 4xx로 거부된다
expected: POST /api/auth/sign-up/email은 4xx로 거부된다
result: pass
source: automated
coverage_id: D6

### 16. lib/env.ts는 Phase 1 환경 변수 계약 전체를 zod로 검증하고 __unset__ 값을 undefined로 취급한다
expected: lib/env.ts는 Phase 1 환경 변수 계약 전체를 zod로 검증하고 __unset__ 값을 undefined로 취급한다
result: pass
source: automated
coverage_id: D7

### 17. pnpm build가 standalone 산출물을 생성한다
expected: pnpm build가 standalone 산출물을 생성한다
result: pass
source: automated
coverage_id: D8

### 18. pnpm account:create --email E --name N [--admin]는 계정을 만들고 임시 비밀번호를 stdout에 정확히 한 번 출력한다
expected: pnpm account:create --email E --name N [--admin]는 계정을 만들고 임시 비밀번호를 stdout에 정확히 한 번 출력한다
result: pass
source: automated
coverage_id: D1

### 19. pnpm account:reset --email E는 새 임시 비밀번호를 출력하고 그 사용자의 모든 세션을 만료시키며 password_is_temporary=true로 만든다
expected: pnpm account:reset --email E는 새 임시 비밀번호를 출력하고 그 사용자의 모든 세션을 만료시키며 password_is_temporary=true로 만든다
result: pass
source: automated
coverage_id: D2

### 20. 같은 이메일로 15분 창 안에 5회 실패하면 6회째는 올바른 비밀번호여도 거부된다 — DB 기반이라 인스턴스 무관
expected: 같은 이메일로 15분 창 안에 5회 실패하면 6회째는 올바른 비밀번호여도 거부된다 — DB 기반이라 인스턴스 무관
result: pass
source: automated
coverage_id: D3

### 21. 5회 실패 중 가장 오래된 것이 15분보다 오래되면 잠금이 풀리고, 성공은 열린 실패 기록을 resolved_reason=success로 닫는다
expected: 5회 실패 중 가장 오래된 것이 15분보다 오래되면 잠금이 풀리고, 성공은 열린 실패 기록을 resolved_reason=success로 닫는다
result: pass
source: automated
coverage_id: D4

### 22. pnpm account:unlock --email E는 열린 실패 기록을 resolved_reason=admin_unlock으로 닫고 auth.unlock 로그를 남긴다; 잠금 발생 시 auth.lockout 로그가 남는다
expected: pnpm account:unlock --email E는 열린 실패 기록을 resolved_reason=admin_unlock으로 닫고 auth.unlock 로그를 남긴다; 잠금 발생 시 auth.lockout 로그가 남는다
result: pass
source: automated
coverage_id: D5

### 23. 같은 IP에서 60초 안에 RATE_LIMIT_LOGIN_MAX(10)회 넘게 /sign-in/email을 부르면 429가 온다 — IP는 x-forwarded-for의 마지막 항목을 proxy.ts가 x-client-ip로 고정한 값
expected: 같은 IP에서 60초 안에 RATE_LIMIT_LOGIN_MAX(10)회 넘게 /sign-in/email을 부르면 429가 온다 — IP는 x-forwarded-for의 마지막 항목을 proxy.ts가 x-client-ip로 고정한 값
result: pass
source: automated
coverage_id: D6

### 24. 존재하지 않는 이메일도 6회째에 같은 잠금 문구로 거부된다(계정 존재 여부 비노출)
expected: 존재하지 않는 이메일도 6회째에 같은 잠금 문구로 거부된다(계정 존재 여부 비노출)
result: pass
source: automated
coverage_id: D7

### 25. x-client-ip 없는 /sign-in/email 요청은 fail-closed로 500과 auth.client_ip_missing 로그를 남긴다(공용 rateLimit 버킷으로 조용히 흘러가지 않음)
expected: x-client-ip 없는 /sign-in/email 요청은 fail-closed로 500과 auth.client_ip_missing 로그를 남긴다(공용 rateLimit 버킷으로 조용히 흘러가지 않음)
result: pass
source: automated
coverage_id: D8

### 26. 직원이 /account에서 현재 비밀번호와 8자 이상 새 비밀번호를 내면 비밀번호가 바뀌고 그 사용자의 모든 세션(현재 기기 포함)이 만료되어 /login으로 안내되며 새 비밀번호로만 다시 로그인된다
expected: 직원이 /account에서 현재 비밀번호와 8자 이상 새 비밀번호를 내면 비밀번호가 바뀌고 그 사용자의 모든 세션(현재 기기 포함)이 만료되어 /login으로 안내되며 새 비밀번호로만 다시 로그인된다
result: pass
source: automated
coverage_id: D1

### 27. 7자 비밀번호와 내장 흔한 비밀번호 목록(password, 12345678 등, 대소문자 무관)은 거부되고 문자 조합 규칙은 없다
expected: 7자 비밀번호와 내장 흔한 비밀번호 목록(password, 12345678 등, 대소문자 무관)은 거부되고 문자 조합 규칙은 없다
result: pass
source: automated
coverage_id: D2

### 28. 임시 비밀번호로 로그인한 사용자는 /account에서 배너를 보고 변경을 강제당하지 않으며, 본인이 바꾸면 배너가 사라진다
expected: 임시 비밀번호로 로그인한 사용자는 /account에서 배너를 보고 변경을 강제당하지 않으며, 본인이 바꾸면 배너가 사라진다
result: pass
source: automated
coverage_id: D3

### 29. 모든 Server Action은 lib/actions/client.ts의 authedActionClient로만 만들어진다
expected: 모든 Server Action은 lib/actions/client.ts의 authedActionClient로만 만들어진다
result: pass
source: automated
coverage_id: D4

### 30. AUTH_PROVIDER 환경 변수 하나로 로그인 방식이 정해지고, google로 바꾸면 lib/auth.ts의 socialProviders 블록과 로그인 화면의 버튼 슬롯만 켜져 코드 구조가 바뀌지 않는다
expected: AUTH_PROVIDER 환경 변수 하나로 로그인 방식이 정해지고, google로 바꾸면 lib/auth.ts의 socialProviders 블록과 로그인 화면의 버튼 슬롯만 켜져 코드 구조가 바뀌지 않는다
result: pass
source: automated
coverage_id: D5

### 31. 관리자만 /admin/system-status를 보고 직원은 404를 받는다; 배포 버전·DB 커넥션 수/max_connections·마지막 백업(백업 없음/확인 불가 구분)을 로드 때마다 직접 조회하고 커넥션 비율이 80% 이상이면 배너가 뜬다
expected: 관리자만 /admin/system-status를 보고 직원은 404를 받는다; 배포 버전·DB 커넥션 수/max_connections·마지막 백업(백업 없음/확인 불가 구분)을 로드 때마다 직접 조회하고 커넥션 비율이 80% 이상이면 배너가 뜬다
result: pass
source: automated
coverage_id: D6

### 32. pnpm lint는 any 사용, app→repositories/db import, domain→app import, viewer 인자 없는 repositories export, 래퍼 없는/인라인 'use server' export, domain/money 밖의 Money 산술을 각각 오류로 잡는다
expected: pnpm lint는 any 사용, app→repositories/db import, domain→app import, viewer 인자 없는 repositories export, 래퍼 없는/인라인 'use server' export, domain/money 밖의 Money 산술을 각각 오류로 잡는다
result: pass
source: automated
coverage_id: D1

### 33. pnpm lint:sql은 db/migrations/*.sql을 Squawk으로 린트해 컬럼 drop·잠금 유발 변경을 거부한다
expected: pnpm lint:sql은 db/migrations/*.sql을 Squawk으로 린트해 컬럼 drop·잠금 유발 변경을 거부한다
result: pass
source: automated
coverage_id: D2

### 34. docs/ARCHITECTURE.md와 docs/OPERATIONS.md가 존재하고 각각 300줄 이하이며, 요구된 구조·문구를 담는다
expected: docs/ARCHITECTURE.md와 docs/OPERATIONS.md가 존재하고 각각 300줄 이하이며, 요구된 구조·문구를 담는다
result: pass
source: automated
coverage_id: D4

### 35. 같은 컨테이너 이미지가 Next.js standalone 서버와 CLI 번들 셋(migrate-runner·account-cli·db-bootstrap)을 담고, Dockerfile은 node:24-slim 멀티스테이지(deps→build→runtime)·비루트 실행·corepack 미사용·인프라 플래그 없음이다
expected: 같은 컨테이너 이미지가 Next.js standalone 서버와 CLI 번들 셋(migrate-runner·account-cli·db-bootstrap)을 담고, Dockerfile은 node:24-slim 멀티스테이지(deps→build→runtime)·비루트 실행·corepack 미사용·인프라 플래그 없음이다
result: pass
source: automated
coverage_id: D1

### 36. esbuild 번들이 migrate-runner·account-cli·db-bootstrap 3개를 만들고 next를 끌어오지 않으며, migrate-runner 번들이 로컬 DB에 실제로 exit 0으로 동작한다
expected: esbuild 번들이 migrate-runner·account-cli·db-bootstrap 3개를 만들고 next를 끌어오지 않으며, migrate-runner 번들이 로컬 DB에 실제로 exit 0으로 동작한다
result: pass
source: automated
coverage_id: D2

### 37. db-bootstrap이 postgres 관리 사용자로 한 번 붙어 IAM 런타임 사용자에게 DB(erp)·public 스키마 소유권을 주고, 재실행해도 같은 결과다(6A)
expected: db-bootstrap이 postgres 관리 사용자로 한 번 붙어 IAM 런타임 사용자에게 DB(erp)·public 스키마 소유권을 주고, 재실행해도 같은 결과다(6A)
result: pass
source: automated
coverage_id: D3

### 38. migrate-runner가 마이그레이션 전에 실제 DB의 SHOW max_connections를 읽어 max-instances × pool ≤ max_connections − 5를 검사하고, 위반이면 exit 3으로 배포를 멈춘다(16A, A2 — 하드코딩 25를 믿지 않는다)
expected: migrate-runner가 마이그레이션 전에 실제 DB의 SHOW max_connections를 읽어 max-instances × pool ≤ max_connections − 5를 검사하고, 위반이면 exit 3으로 배포를 멈춘다(16A, A2 — 하드코딩 25를 믿지 않는다)
result: pass
source: automated
coverage_id: D4

### 39. scripts/deploy.sh --env staging|prod --project ID [--region R] 한 번으로 AR·Cloud SQL(db-f1-micro, 공인 IP 없음, IAM 인증, 자동 백업)·Secret Manager·Cloud Run 서비스+Job 3개가 없으면 생성되고 있으면 갱신되며, 다른 프로젝트/리전으로도 같은 시퀀스를 낸다
expected: scripts/deploy.sh --env staging|prod --project ID [--region R] 한 번으로 AR·Cloud SQL(db-f1-micro, 공인 IP 없음, IAM 인증, 자동 백업)·Secret Manager·Cloud Run 서비스+Job 3개가 없으면 생성되고 있으면 갱신되며, 다른 프로젝트/리전으로도 같은 시퀀스를 낸다
result: pass
source: automated
coverage_id: D1

### 40. deploy.sh는 더티 트리에서 gcloud 호출 전에 exit 2로 거부하고, migrate 실패(exit 3/1 구분)·스모크 실패(healthz/login/sign-in Origin)에서 트래픽을 옮기지 않고 exit 1하며, 임의 gcloud 실패는 stderr 마지막 줄에 'deploy failed at <함수명>'을 남긴다
expected: deploy.sh는 더티 트리에서 gcloud 호출 전에 exit 2로 거부하고, migrate 실패(exit 3/1 구분)·스모크 실패(healthz/login/sign-in Origin)에서 트래픽을 옮기지 않고 exit 1하며, 임의 gcloud 실패는 stderr 마지막 줄에 'deploy failed at <함수명>'을 남긴다
result: pass
source: automated
coverage_id: D2

### 41. SERVICE_URL은 결정적 형식 하나로 고정되어 Job env·서비스 env·스모크·stdout 전부가 같은 값을 쓰고, describe가 다른 호스트를 돌려줘도 stderr 노트로만 남긴다
expected: SERVICE_URL은 결정적 형식 하나로 고정되어 Job env·서비스 env·스모크·stdout 전부가 같은 값을 쓰고, describe가 다른 호스트를 돌려줘도 stderr 노트로만 남긴다
result: pass
source: automated
coverage_id: D3

### 42. scripts/rollback.sh는 서빙 중인 리비전보다 오래된 최신 리비전으로 트래픽을 되돌리고, 스모크 실패로 0%인 최신 리비전은 건너뛰며, 서빙 리비전이 가장 오래된 것이면 거부한다
expected: scripts/rollback.sh는 서빙 중인 리비전보다 오래된 최신 리비전으로 트래픽을 되돌리고, 스모크 실패로 0%인 최신 리비전은 건너뛰며, 서빙 리비전이 가장 오래된 것이면 거부한다
result: pass
source: automated
coverage_id: D4

### 43. Job 3개(db-bootstrap·migrate·account) 모두 APP_ENV·BETTER_AUTH_URL·BETTER_AUTH_SECRET을 갖고, DB_ADMIN_PASSWORD는 db-bootstrap에만, account만 --command 둘째 항목에 스크립트 경로를 둔다(Eng OV-1)
expected: Job 3개(db-bootstrap·migrate·account) 모두 APP_ENV·BETTER_AUTH_URL·BETTER_AUTH_SECRET을 갖고, DB_ADMIN_PASSWORD는 db-bootstrap에만, account만 --command 둘째 항목에 스크립트 경로를 둔다(Eng OV-1)
result: pass
source: automated
coverage_id: D5

### 44. Artifact Registry 정리 정책(최근 20버전 유지, 60일 초과 삭제)이 deploy.sh로 매번 재적용된다
expected: Artifact Registry 정리 정책(최근 20버전 유지, 60일 초과 삭제)이 deploy.sh로 매번 재적용된다
result: pass
source: automated
coverage_id: D6

### 45. scripts/bootstrap-gcp.sh는 프로젝트 존재·결제 연결을 먼저 검사해(D-03) 실패 시 아무 리소스도 만들지 않고 exit 1하며, 통과하면 API·WIF(리포 한정)·SA·역할·VPC·조직 정책을 멱등하게 수행하고 GitHub 변수 3개를 출력한다. 단일 파일이라 infra/의 이름 규칙 파일을 source하지 않지만 그 상수 값은 동일하다
expected: scripts/bootstrap-gcp.sh는 프로젝트 존재·결제 연결을 먼저 검사해(D-03) 실패 시 아무 리소스도 만들지 않고 exit 1하며, 통과하면 API·WIF(리포 한정)·SA·역할·VPC·조직 정책을 멱등하게 수행하고 GitHub 변수 3개를 출력한다. 단일 파일이라 infra/의 이름 규칙 파일을 source하지 않지만 그 상수 값은 동일하다
result: pass
source: automated
coverage_id: D7

### 46. .github/workflows/deploy.yml은 main push(또는 workflow_dispatch target=staging)에서 ci.yml 통과 뒤 스테이징에 배포하고, production은 workflow_dispatch(target=production)로만 실행되며 가드 스텝이 스테이징 서빙 이미지 태그 일치를 확인한 뒤에만 같은 SHA로 승격한다. GitHub Environments는 쓰지 않는다
expected: .github/workflows/deploy.yml은 main push(또는 workflow_dispatch target=staging)에서 ci.yml 통과 뒤 스테이징에 배포하고, production은 workflow_dispatch(target=production)로만 실행되며 가드 스텝이 스테이징 서빙 이미지 태그 일치를 확인한 뒤에만 같은 SHA로 승격한다. GitHub Environments는 쓰지 않는다
result: pass
source: automated
coverage_id: D8

### 47. .github/workflows/account.yml은 workflow_dispatch로 Cloud Run Job account를 실행(create/reset/unlock)하고, 01-02 parseArgs 규약(플래그·값 별개 항목)을 따르며, 로그 폴링으로 임시 비밀번호/unlocked를 확인한 뒤 재실행 금지를 안내한다
expected: .github/workflows/account.yml은 workflow_dispatch로 Cloud Run Job account를 실행(create/reset/unlock)하고, 01-02 parseArgs 규약(플래그·값 별개 항목)을 따르며, 로그 폴링으로 임시 비밀번호/unlocked를 확인한 뒤 재실행 금지를 안내한다
result: pass
source: automated
coverage_id: D9

## Summary

total: 47
passed: 41
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps

[none yet]
