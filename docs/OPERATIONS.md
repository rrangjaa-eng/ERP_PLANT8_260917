# OPERATIONS

> 300줄 상한(테스트로 고정: `test/unit/docs-limits.test.ts`). 실제 프로젝트 ID·이메일·
> 시크릿 값은 여기 적지 않는다 — 변수명(`GCP_PROJECT_ID` 등)만 쓴다(D-03). 이후 페이즈가
> 항목을 추가한다.

## 1. 환경

| | staging | production |
|---|---|---|
| Cloud Run 서비스 | `erp-staging` | `erp-prod` |
| Cloud SQL 인스턴스 | `erp-staging-db` | `erp-prod-db` |
| 시크릿 접미사 | `-staging` | `-prod` |
| 접속 주소 | `https://erp-staging-<프로젝트 번호>.asia-northeast3.run.app` | `https://erp-prod-<프로젝트 번호>.asia-northeast3.run.app` |

접속 주소는 이 **결정적 URL** 하나만 쓴다. Cloud Run이 함께 주는 레거시 `*.a.run.app`
주소나 태그 리비전 URL로 열면 화면은 뜨지만 로그인 POST가 better-auth의 Origin 검사
(`BETTER_AUTH_URL`)에 걸려 403이 난다 — 북마크·안내는 항상 결정적 URL로.

## 2. 월 비용 목표

두 환경 합계 **$30** 안팎이 상한(D-06). 초과하면 스테이징을 먼저 줄인다(중지 스케줄은
아직 없음). 과금 항목:

- Cloud Run 요청·CPU — `min-instances=0`이라 유휴 시 0에 가깝다
- Cloud SQL `db-f1-micro` 2대 — **유휴여도 상시 과금**(스케일-투-제로 아님, 착각 주의)
- 스토리지(HDD 10GB 시작, 자동 증가 상한 20GB) + 자동 백업
- Artifact Registry 이미지 — 정리 정책(최근 20버전 유지, 60일 지난 나머지 삭제) 없으면
  SHA 태그 이미지(~300MB)가 push마다 쌓여 상한을 잠식한다
- Secret Manager 접근, Cloud Logging 수집

**GitHub Actions 분 예산:** 무료 플랜 비공개 저장소는 월 **2,000**분. CI 1회 ≈ 8~10분,
스테이징 배포 1회 ≈ 8~10분 — 월 100회 안팎이 사실상 상한이다. 소진되면 GitHub이 월말까지
워크플로를 아예 시작하지 않아 배포가 조용히 멈춘다(GitHub 청구 메일이 유일한 신호) —
매월 초 Settings → Billing 사용량을 확인한다. 초과 시 유료 분 결제 또는 다음 달 대기.

## 3. 로컬 개발

`scripts/dev-db.sh`가 Docker 있으면 컨테이너, 없으면(클라우드 세션) apt로 Postgres 16을
설치해 127.0.0.1:5432에 `erp`·`erp_test` DB를 준비한다. `.env.local`에 로컬 값을 두고
`pnpm db:dev && pnpm db:migrate && pnpm dev` 순서로 띄운다.

**D-01(로드맵 기준 1의 "로컬 개발은 Auth Proxy" 문구 대체):** 로컬은 `dev-db.sh`의
Docker/apt Postgres이지 Cloud SQL **Auth Proxy**가 아니다 — Cloud SQL은 프라이빗 IP뿐이라
PC에서 Auth Proxy로 직접 붙을 수조차 없다. `db/client.ts`의 `DATABASE_URL` 경로는 Auth
Proxy와도 호환되므로, 나중에 정말 필요해지면(예: 운영 DB 조사) 프록시를 127.0.0.1에 띄우고
같은 변수로 붙이면 된다 — 지금은 그 경로를 쓰지 않는다.

## 4. 배포 런북

**트리거:** main 병합(자동, staging) 또는 GitHub Actions "Run workflow"(수동, 대상 선택).

**단계:** CI(quality → integration-e2e) → 이미지 빌드(SHA 태그, 이미 있으면 생략) →
db-bootstrap Job → migrate Job(16A 커넥션 검사, 위반이면 exit 3으로 중단) → 기존 서비스면
0% 리비전 → 스모크(`/healthz`, `/login`, 가짜 자격 로그인 Origin 검사) → 경보 3개 upsert →
100% 승격.

**승격(스테이징 → **production**):** 스테이징에서 확인 → GitHub Actions "Run workflow" →
target=production, sha 입력(비우면 스테이징이 서빙 중인 SHA) → 가드가 그 SHA 이미지가
Artifact Registry에 있고 스테이징이 실제로 서빙 중인지 확인 → 통과 시 같은 이미지로 배포.
GitHub Environments·승인 버튼은 없다(D-05, 무료 플랜 비공개 저장소) — 실행 권한은 저장소
쓰기 협업자로 제한한다.

**실패 시:** 스모크 실패 = 트래픽 0% 유지(리비전은 남아 조사 가능). 실패 단계 이름은
워크플로 로그 마지막 줄의 `deploy failed at <stage>`로 안다.

## 5. 롤백

`pnpm rollback` = `scripts/rollback.sh --env … --project … --region …` — **현재 100%
서빙 중인 리비전보다 오래된 최신 리비전**으로 되돌린다(스모크에 실패해 0%로 남은 리비전은
건너뛴다). DB는 확장-축소 규칙(컬럼 추가만)이라 되돌릴 필요가 없다 — 데이터 손상은 백업
복원(OPS-03, 별도 페이즈)으로 대응한다.

## 6. 경보 3개

| 경보 | 대응 |
|---|---|
| 5xx > 5% | 최근 배포를 의심 → `rollback.sh` 검토, Cloud Logging에서 오류 확인 |
| Cloud SQL 백업 실패 | Cloud SQL 콘솔에서 확인, 수동 백업 실행. 이 필터는 실제 실패 없이는 검증 불가 — 01-08이 첫 백업 뒤 검증됨/미검증을 이 표에 적는다. 미검증인 동안은 상태 화면 "마지막 백업"을 주 1회 눈으로 확인 |
| notify tick 24h 미성공 | Phase 7까지 `enabled: false`(tick 자체가 없다) |

알림 채널은 환경 변수 **`ALERT_EMAIL`** 하나 — 스테이징·프로덕션 모두 같은 주소, 정책
이름·제목에 환경을 표시해 구분한다(D-16). 배포 자체의 실패는 GitHub Actions 워크플로
실패 알림(GitHub 기본)으로 받는다.

## 7. 계정 운영

로컬 3종 CLI: `pnpm account:create --email … --name … [--admin]` / `pnpm account:reset
--email …` / `pnpm account:unlock --email …`. 운영에서는 같은 컨테이너 이미지의 Cloud Run
Job `erp-{env}-**account**`를 GitHub Actions `account.yml`로 실행한다(입력: env·action·
email·name·admin).

임시 비밀번호는 워크플로 로그와 Cloud Logging에 한 번 남으므로 전달받는 즉시 변경을
안내한다(D-13). 워크플로가 로그를 최대 2분(10초 간격 12회) 재조회하므로, 출력이 바로
안 보여도 `reset`을 다시 돌리지 말고 완료를 기다린다 — 재실행하면 전 세션이 다시 만료되고
새 임시 비밀번호가 또 발급된다.

## 8. 최초 1회 부트스트랩 (D-02)

사용자가 Cloud Shell에서 **`scripts/bootstrap-gcp.sh`**를 1회 실행한다 — 단일 파일이라
비공개 리포를 클론하지 않고 파일 하나만 붙여넣어 실행할 수 있다. 만드는 것: API 활성화,
WIF 풀·프로바이더, 서비스 계정 3개(배포자 + 환경별 런타임 2개), VPC 프라이빗 서비스
접근, 조직 정책 확인. 저장소 수준 GitHub Actions 변수 4개를 설정한다: `GCP_PROJECT_ID`,
`GCP_PROJECT_NUMBER`, `GCP_REGION`, `ALERT_EMAIL`(Secrets 탭은 비워 둔다 — WIF라 키
파일이 없다. GitHub Environments도 만들지 않는다).

## 9. 시크릿 목록

접미사 규칙(`{base}-{env}`), 생성 주체는 `deploy.sh`(없으면 생성, 있으면 재사용). SMTP
4개(`SMTP_HOST`·`SMTP_USER`·`SMTP_PASSWORD`·`SMTP_FROM`)는 정의만 하고 값은 센티널
(`__unset__`) — Workspace SMTP 릴레이 확인 결과는 이 절에 추가한다(TODOS.md 참고, 확인
전).

**시크릿 버전은 삭제·비활성화하지 않는다.** `app-data-key-v1-{env}`를 잃으면 Phase 3
이후 암호화된 데이터를 복구할 수 없다. `db-admin-password-{env}`는 인스턴스를 다시 만들
때 `deploy.sh`가 재설정하지 않으므로, 그때는 `gcloud sql users set-password postgres`를
손으로 맞춘다.

## 10. 상태 화면

`/admin/system-status`(관리자 전용, 직원은 404) — 배포 버전(git SHA + 배포 시각), DB
커넥션 수/한도, 마지막 백업(ok/none/확인 불가). 커넥션 비율이 80% 이상이면 배너.
로컬처럼 GCP 조회가 안 되면 "확인 불가"로 표시한다(D-18).

## 11. 로그·IP 규칙

JSON 구조화 로그(`severity`·`message`·`event`·필드), Cloud Logging에서
`jsonPayload.event`로 검색한다. 클라이언트 IP는 `x-forwarded-for`의 마지막 항목 하나만
신뢰 — `proxy.ts`가 그 값을 **`x-client-ip`** 헤더로 고정하고, better-auth·잠금 훅은
`x-forwarded-for`를 직접 읽지 않는다(위조 방지, Eng Issue 1). Phase 2~3에서 로드밸런서를
앞에 두면 `lib/client-ip.ts` 한 곳만 "마지막에서 두 번째"로 바꾼다. `login_attempts`·
`rate_limits` 행 정리는 Phase 7 tick에 붙인다.
