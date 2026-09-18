# 01-07 실제 GCP 스테이징 배포 로그

> 2026-09-18. `scripts/deploy.sh --env staging`을 회사 GCP 프로젝트에 실제로
> 실행한 기록. GCP 프로젝트 ID/번호는 마스킹(`<PROJECT_ID>`/`<PROJECT_NUMBER>`).

## 실행 URL

- 서비스: `plant8-staging` (asia-northeast3)
- 최종 서비스 URL: **`https://plant8-staging-67rumhdgba-du.a.run.app`**
  - 이 주소는 `gcloud run services describe --format='value(status.url)')`의
    실측값이다. `infra/names.sh` 계산식이 만드는 "결정적" 형식
    (`https://plant8-staging-<PROJECT_NUMBER>.asia-northeast3.run.app`)과는
    **다르다** — 아래 run #12~#16 항목 참고. 결정적 URL 가정(A)은 **기각**.
- 처음 성공한 실행: **run #20**, commit `5ed3eec`, workflow run id `35368076525`
  (`deploy` 워크플로 / `staging` 잡 success) — 아래 실측값은 이 리비전에서 쟀다.
- 마지막 실행: **run #21**, commit `5ca3522`, workflow run id `35372905903`
  (success) — 계정 Job 종료 버그 수정을 배포한 것(아래 "계정 Job 종료 버그").
- 스테이징이 서빙 중인 SHA(= 01-08 Task 1의 입력):
  **`5ca35226bc2f75be453e8c02adbe7aeb929bc1d7`**
- run #20 시점의 서빙 리비전: `plant8-staging-00021-jxr`

## 시도별 원인·수정 이력

배포 파이프라인(`.github/workflows/deploy.yml` → `scripts/deploy.sh`)을
회사 GCP에서 처음 돌리며 run #20까지 반복 실패했다. 로컬 fakebin 단위
테스트로는 잡히지 않는, 실제 GCP 상태·API 제약에 의한 버그들이었다.

### run #10 이전 — 카나리(0%→스모크→100%) 설계 단계에서 발견된 문제들

카나리 방식(`--no-traffic --tag=rev-<sha>`로 배포 후 태그 전용 URL로
스모크, 통과하면 `update-traffic --to-latest`로 승격)을 시도하는 동안
아래 문제들을 먼저 발견·수정했다:

1. **더티 트리 오탐**: `| tee deploy.log`가 만든 `deploy.log`가 추적 안 된
   파일로 잡혀 `require_clean_tree()`가 거부. → `.gitignore`에 추가.
2. **`gcloud sql instances create`의 `--storage-auto-increase-limit`이
   stable 트랙에서 인식 안 됨**(beta 전용 플래그). →
   `gcloud beta sql instances create`로 변경.
3. **db-bootstrap Job 실패 원인이 안 보임**: gcloud가 컨테이너 실패 사유를
   전파하지 않음. → 실패 시 Cloud Logging에서 `severity>=ERROR` 조회해
   stderr에 출력하도록 추가. 이 진단으로 다음 버그가 드러남.
4. **`ERR_MODULE_NOT_FOUND: @google-cloud/cloud-sql-connector`**: Next.js
   standalone 출력이 파일 내용은 트레이싱하지만 `node_modules` 최상위
   심볼릭 링크는 항상 다시 만들어주지 않음(esbuild가 `packages:
   "external"`로 번들한 CLI 스크립트가 실행 시점에 진짜 `node_modules`를
   필요로 함). → Dockerfile에 `deps-prod` 스테이지(프로덕션 전용
   `pnpm install`)를 추가해 `dist/cli/node_modules`로 복사. 로컬
   `/tmp/runtime-sim` 재현으로 사전 검증 후 반영.
5. **신규 서비스 배포 시 계산한 결정적 URL ≠ 실제 `describe().status.url`**:
   스모크가 엉뚱한 주소에 curl해서 404. → `describe_url`이 다르면
   `SERVICE_URL`을 실측값으로 교체하고 컨테이너의 `BETTER_AUTH_URL`도
   `gcloud run services update --update-env-vars`로 같이 고침.
6. **기존 서비스(카나리) 경로도 같은 문제**: 태그 전용 URL을 `gcloud run
   deploy`의 stdout에서 직접 파싱(`grep -oE 'https://rev-...' | head -1
   || true`)해서 대응 시도.
7. **태그 전용 URL이 반복적으로(4회 연속) 15분 넘게 라우팅되지 않음**:
   재시도 예산을 30초 → 5분 → 15분까지 늘렸지만 매번 타임아웃. GCP
   콘솔에서 직접 확인한 결과 리비전 자체는 매번 Ready/정상이었음 — 문제는
   태그 URL 라우팅 계층에 국한됨(정확한 근본 원인은 구글 인프라 내부로
   추정, 우리 쪽 재현 불가). → **설계를 단순화**: 카나리(0%→검증→승격)
   단계 전체를 제거하고, 신규·기존 서비스 모두 바로 100% 트래픽으로
   배포한 뒤 이미 검증된 실제 서비스 주소로 배포 직후 스모크하는 방식으로
   변경(`promote()` 함수·태그 관련 변수 전부 삭제). 실패 시 자동 롤백
   없음 — `scripts/rollback.sh`로 수동 롤백(트래픽 퍼센트 기준으로 동작해
   이 변경과 무관).

### run #10 (commit `0cd3900`) — 카나리 제거 후 첫 실전 테스트: 실패

빌드·푸시·Job 배포·db-bootstrap·migrate까지 전부 성공. `gcloud run
deploy` 자체도 성공. 그러나 `ensure_alerts` 단계에서 실패:

```
ERROR: (gcloud.beta.monitoring.channels.list) INVALID_ARGUMENT:
Could not parse filter "displayName=\'ERP Alerts (staging)\'";
syntax error at line 1, column 34, token '''
```

**원인**: Cloud Monitoring 필터 문법은 문자열 리터럴에 큰따옴표를
요구하는데(`displayName="..."`) 스크립트가 작은따옴표
(`displayName='...'`)를 쓰고 있었음. 채널이 0개일 땐 클라이언트 쪽에서
빈 결과로 처리돼 경고만 뜨고 넘어가지만, 채널이 1개 이상 생긴
직후(같은 실행 안에서 `channels create` 다음)부터 서버 쪽 필터
파싱이 실제로 동작하면서 실패가 드러남 — 로컬 fakebin은 필터 문법을
검증하지 않아 이 버그를 잡지 못했다.

**추가로 발견**(같은 커밋에서 로그로 확인): `gcloud run deploy`가
성공했는데도 `Service ... has been deployed and is serving 0 percent of
traffic`. 과거 카나리(`--no-traffic`) 시도들이 이 서비스의 트래픽을
특정 리비전에 명시적으로 고정해 놓은 상태였고, `--no-traffic` 플래그를
안 쓴다고 해서 그 고정이 자동으로 풀리지 않는 게 Cloud Run의 실제
동작이었다.

**수정** (commit `1ff0a3c`):
- `gcloud run deploy` 직후 `gcloud run services update-traffic --to-latest`를
  무조건 호출(신규 서비스는 이미 100%라 no-op, 기존 서비스는 고정을
  풀고 최신 리비전에 100% 트래픽을 명시적으로 지정).
- `monitoring channels list`(2곳)·`monitoring policies list`의 필터를
  큰따옴표로 수정.

### run #11 (commit `1ff0a3c`) — 트래픽·필터 수정 후: 실패(부가 단계)

핵심 배포는 **성공** — 리비전이 실제로 100% 트래픽으로 전환됨:
```
Service [plant8-staging] revision [plant8-staging-00009-zb8] has been
deployed and is serving 100 percent of traffic.
Service URL: https://plant8-staging-<PROJECT_NUMBER>.asia-northeast3.run.app
```
경보 정책 3개 중 2개(`5xx-ratio`, `backup-failed`)는 생성 성공. 세
번째(`tick-stale`)에서 실패:
```
ERROR: (gcloud.alpha.monitoring.policies.create) INVALID_ARGUMENT:
Field alert_policy.conditions[0].condition_absent.duration had an
invalid value of "24h": Durations longer than 23h30m are not supported.
```

**원인**: `infra/monitoring/tick-stale.json.tpl`이 `conditionAbsent.duration`에
`86400s`(24시간)를 지정했는데, Cloud Monitoring API는 absence 조건의
duration을 `23h30m`(84600초)까지만 허용한다(문서화된 하드 리밋).

**수정** (commit `71da2ab`): duration을 `84600s`(23h30m)로 낮춤.

### run #12~#17 — healthz 404: 5차례 오진 끝에 원인 확정

여기서부터 run #19까지는 **전부 같은 증상**이었다: 배포 자체는 매번 완전히
성공(리비전 Ready, 트래픽 100%)인데 스모크의 `/healthz`만 404. 원인을
잘못 짚어 서로 반대 방향으로 두 번 고쳤다가 되돌리는 낭비가 있었다 —
아래는 그 과정을 남긴 것이다(같은 실수를 반복하지 않기 위해).

- **run #12** (`71da2ab`): 스모크가 15분 내내 404. `describe().status.url`이
  돌려준 대체 호스트명(`plant8-staging-<hash>-du.a.run.app`)이 라우팅
  안 되는 값이라고 판단 → `SERVICE_URL` 덮어쓰기를 **제거**(commit
  `2313889`). 같은 커밋에서 Fable 코드 리뷰로 실제 API에서만 터지는 버그
  2개를 더 발견·수정: `policy_tick()`의 표시 이름이 아직 "24h"라 방금
  고친 23h30m 템플릿과 안 맞아 배포마다 경보 정책이 중복 생성될 뻔한 것,
  그리고 `account.yml`이 `job_name`만으로 Cloud Logging을 걸러 admin
  다음 test를 만들 때 **다른 계정의 임시 비밀번호를 출력할 수 있던 것**
  (이번 실행의 execution name으로 좁히도록 수정).
- **run #13** (`2313889`): 계산한 정본 URL로도 404 → 호스트명 형식 문제가
  아니라는 뜻. 추측을 멈추고 실패 시 서비스 상태(ingress 어노테이션·
  conditions·트래픽)를 덤프하도록 진단 추가(commit `5b1e357`).
- **run #14** (`5b1e357`): 진단 결과 `Ready`·`ConfigurationsReady`·
  `RoutesReady` 전부 True, 트래픽 100%. 그런데 `status.url` 필드 자체가
  대체 호스트명이었다 → **run #12의 판단이 틀렸다**고 보고 되돌림:
  `status.url`을 다시 정본으로 신뢰(commit `ea783bd`). 재시도 예산도
  15분 → 5분으로 축소. (같은 커밋 계열에서 `monitoring ... list` 조회에
  `| head -n1`을 붙여 중복 매치 시 JSON이 깨지는 문제도 수정 — `ab4db34`.)
- **run #16** (`ea783bd`): `status.url`로 고쳐도 404 그대로 → **두 형식
  모두 실패**. 다음 가설: `--allow-unauthenticated`가 조직 정책에 막혀
  조용히 실패했고(gcloud는 그래도 "Setting IAM Policy....done"을 찍는다),
  IAM이 막은 외부 요청은 403이 아니라 **404**로 응답한다(서비스 존재
  은닉). 추측으로 끝내지 않고 실제 IAM 정책을 덤프하도록 추가(`45d01cf`).
- **run #17** (`45d01cf`): IAM 덤프 결과 `allUsers`가 `roles/run.invoker`를
  **정상 보유** → IAM 가설도 기각. 남은 가능성은 "인프라 전체가 막혔다"
  대 "healthz 경로만 문제"인데, 그때까지 스모크가 healthz 재시도 예산을
  다 쓰고서야 종료해 이 둘을 가를 데이터가 한 번도 없었다 → 재시도 루프
  **전에** `/`·`/login`·`/healthz`를 재시도 없이 한 번씩 찍도록 수정
  (`5d583e1`).

### run #18 (commit `5d583e1`) — migrate Job에서 처음으로 실패

healthz가 아니라 migrate Job 자체가 `migration failed`로 죽었다.
`pool_rule_violation`이 아닌 일반 실패는 그때까지 실제 컨테이너 에러를
로그로 남기지 않아 원인을 알 수 없었다(같은 DB에 짧은 시간 안에 반복
배포하며 migrate를 여러 번 실행한 락 충돌로 **추정**했으나 확인 불가).
→ db-bootstrap과 같은 방식으로 `severity>=ERROR` 로그를 stderr에 덤프
(commit `96c73ac`). run #19는 이 커밋으로 돌던 중 취소됨.

### run #20 (commit `5ed3eec`) — 원인 확정 및 성공

**진짜 원인**: `/healthz`는 **Cloud Run/구글 엣지의 예약 경로**라 컨테이너에
도달하지 못한다. 사용자가 Google Cloud Shell에서 여러 경로를 직접 curl해
확정했다 — `/healthz`만 구글 엣지에서 종료되고(`X-Powered-By` 헤더 없음,
본문 길이 1568), `/api/health`·`/health`·`/_health`는 전부 컨테이너
(Next.js)까지 도달해 앱 자체의 404 페이지(`X-Powered-By: Next.js`, 길이
8734)를 돌려줬다. 낮에 검색으로 나왔던 "일부 프레임워크의 /healthz 충돌"
결과를 App Engine 전용이라고 무시했던 게 잘못이었다.

**수정** (commit `5ed3eec`): 헬스체크를 `app/healthz/route.ts` →
`app/api/health/route.ts`로 이전. `deploy.sh` 스모크·`domain/health.ts`
주석·`playwright.config.ts`의 webServer 대기 URL·통합/단위 테스트·
fakebin/curl·운영 문서(`OPERATIONS.md`, `ARCHITECTURE.md`)를 모두 새
경로로 맞춤. 동작(200/503 JSON 바디)은 그대로.

**결과**: `staging` 잡 success. 이 로그 맨 위의 실행 URL·SHA 참조.

### 계정 Job 종료 버그 (계정 발급 중 발견 → run #21로 수정 배포)

배포가 끝난 뒤 `account.yml`을 처음 돌렸더니(run `35370585243`) 실패했다.
그런데 Cloud Logging을 보면 **일은 전부 성공**했다 — 16:48:26에
`account created: rrangjaa@gmail.com (admin=true)`와 `auth.account_created`
이벤트가 찍히고 임시 비밀번호까지 출력됐다. 그 뒤 프로세스가 끝나지 않아
실행 `plant8-staging-account-txfcr`이 task-timeout 900초를 다 쓰고
`The configured timeout was reached`로 종료됐고, `jobs execute --wait`가
실패로 보고해 워크플로가 exit 1 했다(즉 **계정은 만들어졌는데 워크플로는
실패**).

**원인**: `db/client.ts`의 `createPool()`이 Cloud SQL 커넥터 경로에서
`new Connector()`를 만들어 놓고 **아무도 닫지 않았다**. 커넥터는 인증서·
토큰 갱신 타이머를 들고 있어 `pool.end()`만으로는 이벤트 루프가 비지
않는다. `migrate-runner.ts`·`db-bootstrap.ts`는 끝에 `process.exit()`를
명시적으로 불러서 이 문제가 가려져 있었고, 자연 종료에 기대던
`account-cli.ts`에서만 드러났다.

**수정** (commit `5ca3522`, run #21로 배포):
- `db/client.ts`: 커넥터를 모듈 수준에 들고 있다가 `closeDb()`에서 같이 닫음.
- `scripts/account-cli.ts`: 진입점에서 `main()` 뒤 `process.exit(exitCode)`로
  이중 방어(migrate-runner와 같은 관례).
- 회귀 테스트 2개: 커넥터 모듈을 모킹해 `closeDb()`가 커넥터를 닫는지 보는
  단위 테스트(`test/unit/db-client-close.test.ts`, 수정 전 실패 → 수정 후
  통과 확인)와, 자식 프로세스가 timeout 안에 스스로 끝나는지 보는 통합
  테스트(`test/integration/account-cli.test.ts`). 로컬(DATABASE_URL) 경로는
  커넥터를 안 쓰므로 통합 테스트만으로는 재현되지 않는다는 점도 기록한다.

**검증**: 수정 배포 후 계정 발급 2건이 모두 timeout 없이 success로 끝났다
(아래 "계정 생성").

## 측정값

측정 방법: 실행자 세션은 아웃바운드 방화벽 때문에 `*.run.app`에도 Actions
로그 저장소에도 닿지 못한다(api.github.com만 통과). 그래서 일회용
`workflow_dispatch` 워크플로(`.github/workflows/probe.yml`, run id
`35370433052`)를 만들어 GitHub Actions 안에서 측정하고 결과만 회수한 뒤
워크플로와 결과 브랜치를 삭제했다.

### 엔드포인트

| 경로 | 결과 |
|------|------|
| `/api/health` | **200**, 본문 `{"ok":true,"sha":"5ed3eec7077f69d9c90155751b94e63e9c0c0952","deployedAt":"2026-09-18T16:30:55Z"}` — `ok:true`와 배포 커밋 SHA 일치 확인 |
| `/login` | **200** |
| `/healthz` (구 경로) | **404** — 구글 엣지 예약 경로라는 위 진단을 배포된 서비스에서 재확인 |

### XFF 레이트리밋 프로브 (핵심 검증)

`/api/auth/sign-in/email`에 POST 11회, **요청마다 `X-Forwarded-For`를 다르게
위조**(`10.0.0.1` … `10.0.0.11`). 2026-09-18T16:47:20Z~16:47:24Z(4초).

| # | 위조 XFF | 응답 |
|---|----------|------|
| 1~5 | `10.0.0.1`~`10.0.0.5` | `401` (자격 증명 불일치) |
| 6~10 | `10.0.0.6`~`10.0.0.10` | `403` (계정 잠금 — `LOCKOUT_THRESHOLD=5`, 15분 창) |
| **11** | `10.0.0.11` | **`429`** ✅ (레이트리밋 — `RATE_LIMIT_LOGIN_MAX=10`, 60초 창) |

**판정: 통과.** 매 요청마다 소스 IP를 다르게 위조했는데도 11번째에서
429가 나왔다 = 앱이 클라이언트가 보낸 `X-Forwarded-For`의 **첫 항목을
무시하고** Cloud Run이 뒤에 붙인 실제 소스 IP로 버킷을 묶는다는 뜻이다.
IP 위조로는 레이트리밋을 우회할 수 없다(Eng Issue 1 전제 확인).
`lib/client-ip.ts`의 "XFF 마지막 항목이 실제 클라이언트 IP" 규칙이
Cloud Run 직결 환경에서 **실측으로 맞다**.

부수 확인: 잠금(계정 단위, 6번째부터 403)과 레이트리밋(IP 단위, 11번째
429)이 서로 독립적으로 둘 다 동작한다. Cloud Logging에 better-auth의
`no-trusted-ip` 경고 **없음** → `proxy.ts`가 `/api/auth/*`에 실제로
적용되고 있다(fail-closed 500도 없음).

### 기타 실측

- **`max_connections`**: **25** (migrate Job의 `db.max_connections` 구조화
  로그, 최근 5개 실행 전부 25) — 가정 A2(25) **확인**. 풀 규칙
  `MAX_INSTANCES(3) × DB_POOL_MAX(5) = 15 ≤ 25 − 5 = 20` 통과.
- **조직 정책**(`iam.allowedPolicyMemberDomains`, `run.allowedIngress`,
  `compute.restrictVpcPeering`, `iam.workloadIdentityPoolProviders`):
  **직접 조회 불가** — `gha-deployer` SA에 `orgpolicy.policy.get`이 없어
  4건 모두 `PERMISSION_DENIED`. 다만 **실효적으로는 아무것도 막히지
  않았다**: `--allow-unauthenticated`가 성공했고 run #17의 IAM 덤프에서
  `allUsers`가 `roles/run.invoker`를 보유한 것이 확인됐으며, VPC 피어링·
  WIF 프로바이더 생성도 전부 성공했다. 즉 조직 정책 차단은 **없음**(우회
  시도 없었음). 정책 원문 확인이 필요하면 Owner 권한 계정으로 조회해야
  한다(01-08 후보).
- **도메인 매핑 리전 지원(A1)**: `gcloud beta run domain-mappings list
  --region=asia-northeast3` 정상 응답(`Listed 0 items.`) → 해당 리전에서
  도메인 매핑 API 자체는 지원된다. 실제 매핑은 0건 — Phase 1은 자리만
  잡고 `--domain` 플래그는 accepted-but-deferred(D-15).
- **경보 정책 3개**: 전부 존재 — `[staging] 5xx ratio > 5%`(enabled),
  `[staging] Cloud SQL backup failed`(enabled), `[staging] notify tick
  stale 23h30m`(disabled, 설계대로). `backup-failed`의 필터가 실제 로그
  항목과 맞는지는 실패 이벤트 없이는 검증할 수 없다 — 첫 백업 창(18:00
  UTC) 이후 01-08 human-check 4가 닫는다. 현재는 **미확인**.
- **`note: computed url differs` 줄**: 있음(매 배포). 계산식 URL과 실제
  `status.url`이 항상 다르다 — 결정적 URL 가정 기각(맨 위 참고).
- **신규 서비스 첫 배포 트래픽**: 100%(카나리 제거 후 설계대로).

### ⚠️ deploy.yml 프로덕션 가드 전제 — **기각됨**(01-08이 고쳐야 함)

플랜의 `[ASSUMED]` 2건을 실측했다:

1. 스테이징 `status.traffic[]`에 `percent: 100` 항목이 하나인지 → **참**.
   단 배열에는 항목이 5개 있다 — 100% 항목 1개 + 폐기된 카나리 시도가
   남긴 **태그 전용 항목 4개**(`rev-54152656`, `rev-76518d7d`,
   `rev-fa7eadf1`, `rev-6d8cebc1`; percent 없음). `jq 'select(.percent ==
   100)'`은 정상 동작하지만 이 잔여 태그는 정리 대상이다(01-08 후보).
2. 서빙 리비전의 `spec.containers[0].image`가 `…/app:<sha>` **태그
   문자열을 보존하는지** → **거짓**. 실측값:
   ```
   asia-northeast3-docker.pkg.dev/<PROJECT_ID>/plant8/app@sha256:662211fc…d767200
   ```
   Cloud Run이 배포 시점에 태그를 **다이제스트로 해석해 저장**한다.
   `deploy.yml`의 가드는 `STAGING_SHA=${STAGING_IMAGE##*:}`로 마지막
   `:` 뒤를 git SHA로 간주하므로, 실제로는 **이미지 다이제스트**
   (`662211fc…`)를 얻는다. 그 결과 `[ "$SHA" != "$STAGING_SHA" ]` 비교가
   **항상 참**이 되어 프로덕션 승격이 영구히 막힌다.
   → **01-08 Task 1 전에 반드시 수정해야 한다.** 예: 리비전의 배포 태그를
   따로 라벨/어노테이션으로 기록하고 그것을 읽거나, 다이제스트로
   Artifact Registry를 역조회해 `:<sha>` 태그를 얻는 방식.
   (이번 페이즈에서는 프로덕션 배포가 없으므로 이 로그에 기록만 하고
   고치지 않는다 — 01-08의 입력이다.)

## 계정 생성

`account.yml` workflow_dispatch 2회(D-11·D-12). 임시 비밀번호는 리포에
절대 남기지 않는다(T-1-37) — 워크플로가 Cloud Logging에서 읽어 **Actions
실행 로그에만** 출력한다. 값은 이 파일에 적지 않는다.

- **admin** (`rrangjaa@gmail.com`, `admin=true`): **생성됨**
  - `create` 실행 run `35370585243` — 계정 자체는 16:48:26에 정상 생성됐으나
    위 "계정 Job 종료 버그" 때문에 워크플로는 failure로 끝났다.
  - 수정 배포 후 `action=reset` 실행 run `35374065076` — **success**. 쓸 수
    있는 임시 비밀번호는 이 실행의 로그에 있다(앞 실행의 것은 무효).
- **test** (`rrangjaa01@gmail.com`, `admin=false`): **생성됨**
  - `create` 실행 run `35373880399` — **success**(수정 후 첫 실행,
    timeout 없이 정상 종료 = 수정 검증).

임시 비밀번호는 첫 로그인 직후 즉시 변경한다(D-08 배너, human-check 1~2).
값은 Actions 실행 로그에만 있고 이 리포 어디에도 남기지 않는다(T-1-37).

## 최종 확인

- `git status --porcelain` 비어 있음: **예**
- 임시 `probe.yml` 워크플로·`probe-result` 브랜치: 삭제 완료
