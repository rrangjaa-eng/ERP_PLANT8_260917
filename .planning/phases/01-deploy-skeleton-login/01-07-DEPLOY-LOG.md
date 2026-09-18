# 01-07 실제 GCP 스테이징 배포 로그

> 2026-09-18. `scripts/deploy.sh --env staging`을 회사 GCP 프로젝트에 실제로
> 실행한 기록. GCP 프로젝트 ID/번호는 마스킹(`<PROJECT_NUMBER>`).

## 실행 URL

- 서비스: `plant8-staging` (asia-northeast3)
- 최종 서비스 URL: **[진행 중 — run #12 완료 후 확정]**

## 시도별 원인·수정 이력

배포 파이프라인(`.github/workflows/deploy.yml` → `scripts/deploy.sh`)을
회사 GCP에서 처음 돌리며 총 3차례 실제 실행 실패가 있었다. 로컬
fakebin 단위 테스트로는 잡히지 않는, 실제 GCP 상태·API 제약에 의한
버그들이었다.

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

### run #12 (commit `71da2ab`) — 결과: **[진행 중]**

## 측정값 (배포 완료 후 채움)

- `max_connections`(migrate Job 로그에서 측정): **[TBD]**
- Org policy(`iam.allowedPolicyMemberDomains`, `run.allowedIngress`) 확인
  결과: **[TBD]**
- 도메인 매핑 리전 지원 확인 결과: **[TBD — Phase 1은 자리만, `--domain`
  플래그는 accepted-but-deferred]**
- `/healthz`: **[TBD]**
- `/login`: **[TBD]**
- XFF 레이트리밋 프로브(11번째 요청 429 기대): **[TBD]**

## 계정 생성

- admin (`rrangjaa@gmail.com`): **[TBD]**
- test (`rrangjaa01@gmail.com`): **[TBD]**

## 최종 확인

- `git status --porcelain` 비어 있음: **[TBD]**
