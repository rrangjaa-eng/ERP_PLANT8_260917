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
  - [ ] 3~6. 사용자가 모바일이라 브라우저·GCP 콘솔 확인 불가. 실행자가 대신 확인하되
        `*.run.app`이 실행자 세션의 에그레스 프록시에 막혀 있어(403 CONNECT) 직접
        두드릴 수 없다. 현재까지의 근거:
    - **4번(직원 404·로그아웃)**: `test/e2e/system-status.spec.ts`("직원이 접근하면
      404를 받는다")와 `test/e2e/login-logout.spec.ts`(로그아웃 후 `/account` 재접근이
      `/login`으로, D-10)가 **프로덕션에 떠 있는 바로 그 커밋 `ed2fbc5`에서** 통과.
    - **5번(세션 유지)**: 같은 E2E가 새 브라우저 컨텍스트에서 세션 유지 + 쿠키 만료
      30일을 단언(`lib/auth.ts`의 `expiresIn` 30일, D-07).
    - **6번(경보 3개)**: 이 배포의 로그에 채널 1개·정책 3개 `Created`.
    - **3번(상태 화면)**: 화면 동작은 E2E가 증명. `/api/health`의 `"ok":true`는
      `deploy.sh`의 `smoke()`가 **차단 조건으로** 검사해 통과(상태코드만이 아니다).
    - 남은 것은 "프로덕션 인스턴스 자체가 그렇게 설정돼 있는가" — 서빙 리비전의
      `APP_GIT_SHA` 실제 값, 비로그인 접근이 정말 404인지, 경보 정책이 enabled인지.
      일회용 읽기 전용 워크플로(`prod-verify.yml`)로 확인한다. `workflow_dispatch`는
      기본 브랜치에 있어야 실행되므로 이 PR이 main에 병합된 뒤에 돌린다.
- [ ] **백업 경보 필터 확인** — 첫 자동 백업 창(18:00 UTC) 이후에만 볼 수 있다(01-07에서 이월)
- [ ] **조직 정책 원문 확인** — 배포 SA에 `orgpolicy.policy.get`이 없다. Owner 계정 몫
- [ ] **스테이징 태그 전용 트래픽 항목 4개 정리** (01-07에서 이월)
- [ ] **`db-bootstrap.ts`의 `createAdminPool` 커넥터 미종료** — 지금은 `process.exit()`로
      가려져 있다(01-07에서 이월)
- [ ] **문서 마무리** — `docs/OPERATIONS.md` 실측 반영 잔여분, `CLAUDE.md` 명령 4자리
- [ ] **임시 결과 브랜치 3개 삭제** — `probe-result`, `probe-result2`, `guard-probe-result`
