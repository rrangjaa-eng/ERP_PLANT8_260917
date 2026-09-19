# 01-08 프로덕션 승격 로그

> 2026-09-18. `deploy` 워크플로를 `workflow_dispatch(target=production)`로 실행해
> 회사 GCP에 프로덕션 환경을 처음 만든 기록. 프로젝트 ID/번호와 서비스 URL 호스트는
> 마스킹한다(D-03, D-12). 실제 주소는
> `gcloud run services describe plant8-prod --region asia-northeast3 --format='value(status.url)'`로 얻는다.

## 실행

- 워크플로 실행: **run #24**, workflow run id `35378970054` — **success**
- 트리거: `workflow_dispatch`, `target=production`, `sha` **빈 값**(가드가 스테이징
  서빙 SHA를 채택), 체크아웃 ref `main`(`70a1235`)
- 실행자: 저장소 소유자 계정. GitHub Environments·승인 버튼은 없다(D-05) —
  **이 실행 로그가 승인 기록을 대신한다.**
- 소요: 18:14:01 → 18:27:31 (약 13분 30초)
- `ci`·`staging` 잡: **skipped**(설계대로 — 같은 이미지를 재빌드 없이 승격)

### 승격 가드

`scripts/promote-guard.sh`가 스테이징 서빙 리비전의 `APP_GIT_SHA`를 읽어 판정했고
**통과**(18:15:48→18:15:55). 승격된 SHA: **`ed2fbc56a52ddb5b73884fc3247999cd15855d5e`**
— 스테이징이 서빙 중인 것과 같은 이미지다(재빌드 없음).

01-07에서 이 가드는 리비전 `image`가 태그가 아닌 다이제스트로 저장되는 탓에
**영구히 막혀 있었다**. `fe851be`의 수정이 실제 승격에서 처음으로 검증됐다.

## 만들어진 것 (순서대로)

| 단계 | 결과 |
|------|------|
| 시크릿 7개(`*-prod`) | 생성 + `plant8-prod-runtime` SA에 `secretAccessor` 부여 |
| Cloud Run Job 3개 | `plant8-prod-db-bootstrap`, `plant8-prod-migrate`, `plant8-prod-account` 생성 |
| db-bootstrap 실행 | `plant8-prod-db-bootstrap-4vjm5` **성공** |
| migrate 실행 | `plant8-prod-migrate-qx86p` **성공** (16A 커넥션 예산 검사 통과) |
| 서비스 첫 배포 | `plant8-prod-00001-lf5`, 트래픽 **100%** |
| URL 교정 재배포 | `plant8-prod-00002-dw6`, 트래픽 **100%** (아래 참고) |
| 경보 | 알림 채널 1개 + 정책 3개 + 로그 메트릭 `notify_tick_success_prod` 생성 |
| 스모크 | `/` → **307**, `/login` → **200**, `/api/health` → **200** |

### 이미지 (T-1-24 — 재빌드 없이 승격했으므로 스테이징 빌드의 값)

- 베이스 이미지: `node:24-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553`
- 앱 이미지 다이제스트: `sha256:06f46c98593f425095439fe63144ef355578c76fed0e8053962bd9f33f399790`
  (태그 `app:ed2fbc56…`, 스테이징 빌드 run `35376419153`)
- 빌드 경고 2건: `SecretsUsedInArgOrEnv`(Dockerfile 33줄의 `ENV BETTER_AUTH_SECRET`·
  `BETTER_AUTH_URL`) — 빌드 시 더미값이고 실제 값은 런타임에 Secret Manager로 주입되지만,
  docker가 경고하는 형태이므로 ARG로 옮기는 편이 낫다(후속 후보).

## 실측 — 스테이징에서 본 현상이 프로덕션에서도 재현됨

**결정적 URL 가정은 프로덕션에서도 기각된다.** 로그에 그대로 남았다:

```
note: computed url (https://plant8-prod-<PROJECT_NUMBER>.asia-northeast3.run.app)
differs from actual status.url (https://plant8-prod-<해시>-du.a.run.app) — using status.url
```

`gcloud run deploy`가 화면에 찍는 `Service URL:`은 계산식 형식이고, 서비스의 실제
`status.url`은 해시 호스트다. `deploy.sh`가 `status.url`로 `SERVICE_URL`을 교체하고
컨테이너의 `BETTER_AUTH_URL`까지 고쳐 재배포하기 때문에 리비전이 둘(`00001` → `00002`)
생긴다 — 정상 동작이다. 두 번째 리비전이 100%를 서빙한다.

이 사실은 이미 `docs/OPERATIONS.md` §1에 반영했다(01-07 스테이징 실측 시점).

## 아직 안 한 것

- [x] **프로덕션 계정 발급 완료** — `account` 워크플로 `workflow_dispatch` 2회.
      이름은 스테이징과 같게 맞췄다(`admin` / `test`). 임시 비밀번호는 리포에
      절대 남기지 않는다(T-1-37) — Actions 실행 로그에만 있고 첫 로그인 직후
      변경한다(D-08 배너).
  - 관리자(`admin`, 관리자 권한): 실행 `35380666520` **재시도 2회차 success**
    (Cloud Run 실행 `plant8-prod-account-...`).
    1회차는 `gcloud run jobs execute`가 **토큰 갱신 실패**로 6초 만에 죽었다 —
    `There was a problem refreshing your current auth tokens: ('Connection
    aborted.', RemoteDisconnected(...))`. 잡 실행 자체가 시작되지 않았고
    (계정 미생성), `createAccount`가 중복 이메일을 거부하므로 재시도는
    안전했다. 일시적 네트워크 실패로 판정하고 **1회만** 재시도했다.
  - 테스트 직원(`test`, 일반 권한): 실행 `35380946900` **success**
    (Cloud Run 실행 `plant8-prod-account-f62zn`).
- [~] **human-check** — 6항목 중 2개 완료, 4개는 자동 시험·배포 로그로 대체 확인 중
  - [x] 1. 관리자 로그인 + 임시 비밀번호 배너 — **사용자 확인 완료**(2026-09-18)
  - [x] 2. 비밀번호 변경 + 옛 비밀번호 거부 — **사용자 확인 완료**(2026-09-18)
  - [x] 3~6. 사용자가 모바일이라 브라우저·GCP 콘솔을 볼 수 없어 실행자가 확인했다.
        실행자 세션은 `*.run.app`이 에그레스 프록시에 막혀 있어(403 CONNECT) 직접
        두드릴 수 없으므로, 일회용 읽기 전용 워크플로 `prod-verify.yml`
        (run `35382145883`, 배포 없음)로 Actions 안에서 쟀다. 결과(마스킹):

    | 확인 | 실측값 | 판정 |
    |------|--------|------|
    | 서빙 리비전 | `plant8-prod-00002-dw6` | — |
    | 리비전 `APP_GIT_SHA` | `ed2fbc56a52ddb5b73884fc3247999cd15855d5e` | ✅ 승격한 커밋과 일치 |
    | `/api/health` 본문 | `{"ok":true,"sha":"ed2fbc56…","deployedAt":"2026-09-18T18:26:47Z"}` | ✅ **3번 닫힘** — ok:true + SHA 일치 |
    | `/admin/system-status` (비로그인) | **307** | ✅ 정상 (아래 설명) |
    | `/account` (비로그인) | 307 | ✅ 같은 처리 |
    | `/login` | 200 | ✅ |
    | 경보 정책 | `[prod] 5xx ratio > 5%`=enabled, `[prod] Cloud SQL backup failed`=enabled, `[prod] notify tick stale 23h30m`=disabled(설계대로) | ✅ **6번 닫힘** |
    | 알림 채널 | `ERP Alerts (prod)` (email) | ✅ |

    **307은 404가 아니지만 정상이다.** `app/admin/system-status/page.tsx`는
    `if (!session) redirect("/login")` → 비로그인은 **307**,
    `if (!session.viewer.isAdmin) notFound()` → 로그인한 **비관리자**만 **404**다(D-17).
    프로브는 세션이 없으므로 307이 맞다. 4번이 말하는 "직원 404"는 로그인한 직원
    경우이고, 그쪽은 `test/e2e/system-status.spec.ts`가 프로덕션에 떠 있는 커밋
    `ed2fbc5`에서 통과시켰다. `/account`도 같은 307이라 존재 여부가 새지 않는다.

    **5번(세션 유지)은 프로브로 못 닫았다.** `/login`은 로그인 전 페이지라
    `Set-Cookie`가 없어 쿠키 속성을 볼 수 없었다 — 프로브 설계의 한계다. 근거는
    E2E(새 브라우저 컨텍스트에서 세션 유지 + 쿠키 만료 30일 단언)와
    `lib/auth.ts`의 `expiresIn` 30일(D-07)로 남는다.

- [x] **A3 해소(01-07 이월)** — `roles/cloudsql.viewer`의 포함 권한에
      **`cloudsql.backupRuns.list`가 있다**(같은 프로브 6번, `gcloud iam roles describe`).
      상태 화면의 "마지막 백업" 절이 권한 때문에 막히는 일은 없다.
- [ ] **백업 경보 필터·실제 백업 확인** — 프로덕션 DB는 18:25에 생겨 자동 백업이 아직
      한 번도 돌지 않았다. 상태 화면의 백업 절은 지금 "백업 없음"이 정상이고, 경보
      필터가 실제 로그 항목과 맞는지는 실패 이벤트 없이는 검증할 수 없다. 내일 첫
      백업 창 이후 확인한다.
- [ ] **조직 정책 원문 확인** — 배포 SA에 `orgpolicy.policy.get`이 없다. Owner 계정 몫
- [ ] **스테이징 태그 전용 트래픽 항목 4개 정리** (01-07에서 이월)
- [ ] **`db-bootstrap.ts`의 `createAdminPool` 커넥터 미종료** — 지금은 `process.exit()`로
      가려져 있다(01-07에서 이월)
- [ ] **문서 마무리** — `docs/OPERATIONS.md` 실측 반영 잔여분, `CLAUDE.md` 명령 4자리
- [ ] **임시 결과 브랜치 4개 삭제** — `probe-result`, `probe-result2`,
      `guard-probe-result`, `prod-verify-result` (실행자 세션에서는 ref 삭제가 막힌다)
- **참고**: 배포자 SA에는 `resourcemanager.projects.getIamPolicy`도 없다(이번 프로브에서
  드러남). 런타임 SA의 역할 목록 확인은 Owner 계정 몫이다 — 조직 정책 원문과 같은 처지.

## 추가 실측 (2026-09-19) — SC6 안전 속성 확인

SC6는 2026-09-19에 절차("0% 리비전 → 스모크 → 100%")가 아니라 그 절차가 사려던 안전
속성으로 재정의됐다: **스모크에 실패한 리비전이 트래픽을 계속 받는 상태로 끝나지
않는다.** 구현은 둘이다 — (1) 기존 서비스는 배포 전에 `status.url`을 확정해 배포당
리비전이 하나만 생기고, (2) 스모크가 실패하면 `deploy.sh`가 `rollback.sh`를 한 번
호출한 뒤 실패로 끝낸다(`smoke_failed()`).

두 번째는 단위 테스트로만 고정돼 있다(실패를 실제 GCP에서 일부러 낼 수는 없다).
첫 번째는 스테이징 배포에서 실측했다 — 워크플로 실행 `35417809514`의 스테이징 잡:

```
03:18:40  note: using actual status.url (https://plant8-staging-<hash>-du.a.run.app)
          instead of the computed one (https://plant8-staging-<num>.asia-northeast3.run.app)
03:18:55  Creating Revision ... Service [plant8-staging] revision [plant8-staging-00028-dms]
          has been deployed and is serving 100 percent of traffic.
03:19:11  quick probe (no retry): / -> 307, /login -> 200, /api/health -> 200
```

읽는 법: `note:` 줄이 **단 하나뿐인** `Creating Revision` 앞에 있다. 두 번째
`Deploying...`도, `run services update plant8-staging`도 로그에 없다. 어제
(`00024`→`00025`, 프로덕션 `00001`→`00002`)와 달리 이 배포는 리비전 `00028` 하나만
만들었다. 스모크는 통과했으므로 자동 롤백 경로는 이번에도 타지 않았다.

이것으로 01-VERIFICATION.md의 유일한 미충족 항목(SC6)이 닫힌다.
