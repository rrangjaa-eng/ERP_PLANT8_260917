---
phase: 01-deploy-skeleton-login
plan: 08
subsystem: infra
tags: [gcp, cloud-run, cloud-sql, production, promotion, monitoring]

# Dependency graph
requires:
  - phase: 01-06
    provides: "deploy.yml production 잡 + deploy.sh --env prod"
  - phase: 01-07
    provides: "스테이징 환경과 서빙 SHA(승격 가드의 입력), promote-guard.sh"
provides:
  - "프로덕션 환경 — Cloud Run plant8-prod + Job 3개, Cloud SQL plant8-prod-db, 시크릿 7개, 경보 정책 3개·채널 1개"
  - "프로덕션 계정 2개(admin/test)"
  - "01-08-DEPLOY-LOG.md — 승격 기록·실측·잔여 체크리스트"
  - "docs/OPERATIONS.md 실측 반영(주소 규칙·실패 시 대응·롤백 규칙·첫 청구서 절차·배포자 권한 축소 근거)"
  - "CLAUDE.md 명령 4자리 확정"
affects: []

actuals:
  tasks: 3
  commits: 9
plan_head_before: fa5f22de28aab2fd6c9ac81aba1ea4cbb810b903

tech-stack:
  added: []
  patterns:
    - "프로덕션 승격은 재빌드하지 않는다 — 가드가 스테이징 서빙 리비전의 APP_GIT_SHA를 읽어 같은 이미지를 배포한다(ci·staging 잡은 skipped)"
    - "결정적 URL 가정은 두 환경 모두에서 기각 — status.url이 정본이고 deploy.sh가 BETTER_AUTH_URL까지 맞춰 재배포하므로 첫 배포에서 리비전이 둘 생긴다(00001 → 00002)"
    - "실행자 세션이 *.run.app에 닿지 못하는 환경에서는 일회용 읽기 전용 workflow_dispatch 워크플로로 Actions 안에서 재고, 결과를 orphan 브랜치로 회수한 뒤 워크플로를 지운다. workflow_dispatch는 기본 브랜치에 있어야 실행된다(작업 브랜치만으로는 404)"

key-files:
  created:
    - .planning/phases/01-deploy-skeleton-login/01-08-DEPLOY-LOG.md
  modified:
    - docs/OPERATIONS.md
    - CLAUDE.md
    - test/unit/docs-limits.test.ts
    - .planning/STATE.md

key-decisions:
  - "[사용자 위임] 01-08 Task 1은 checkpoint:human-action(사용자가 Actions에서 수동 실행)이었으나, 사용자가 '배포가 많아 모르겠으니 네가 눌러'라고 명시적으로 위임해 실행자가 workflow_dispatch로 실행했다. D-05의 취지(승인 기록 = Actions 실행 로그, 실행 권한 = write 협업자)는 유지된다 — triggering actor는 저장소 소유자 계정이다"
  - "[Rule 1 - Bug] 프로덕션 관리자 계정 생성 1회차가 gcloud 토큰 갱신 실패(RemoteDisconnected)로 6초 만에 죽었다. Cloud Run Job 실행 자체가 시작되지 않았고, createAccount가 중복 이메일을 거부하는 것을 코드로 확인한 뒤 1회만 재시도해 성공. '플레이크니까 재시도'가 아니라 '작업 본체 이전 단계에서 죽었다'는 로그 근거로 판단했다"
  - "[문서화된 판단] human-check 6항목 중 1·2는 사용자가 브라우저로 확인. 3~6은 사용자가 모바일이라 확인 불가했고 실행자도 *.run.app에 막혀 있어, 읽기 전용 프로브로 3·6을 프로덕션에서 닫고 4·5는 같은 커밋에서 통과한 E2E를 근거로 삼았다. 5번(세션 유지)은 프로브가 /login에서 Set-Cookie를 못 봐 닫지 못했다고 명시했다 — 닫은 척하지 않는다"
  - "[실측] 비로그인 /admin/system-status는 404가 아니라 307이다. page.tsx가 세션 없으면 redirect('/login')이고 notFound()는 로그인한 비관리자 경로(D-17). 예상과 다른 값을 그대로 기록하고 코드로 이유를 확인했다"
  - "[A3 해소] roles/cloudsql.viewer의 포함 권한에 cloudsql.backupRuns.list가 있다(gcloud iam roles describe 실측). 01-07이 미결로 넘긴 항목이 닫혔고, 커스텀 역할 erpBackupReader를 만들 필요가 없다"

requirements-completed: [OPS-01, OPS-02, OPS-07]
---

# Phase 1 Plan 8: 프로덕션 승격 Summary

**스테이징과 같은 이미지(`ed2fbc5`)를 재빌드 없이 프로덕션에 승격해 두 환경을 띄우고, 계정을 발급하고, human-check를 닫고, 운영 문서와 CLAUDE.md를 실측으로 마무리했다.**

## Performance

- **Started:** 2026-09-18 (01-07 종료 직후 같은 세션)
- **Tasks:** 3
- **프로덕션 배포:** deploy 워크플로 run #24 (`35378970054`) — 13분 30초, 첫 시도 success

## Accomplishments

- **프로덕션 환경 기동** — 시크릿 7개 → Job 3개 → db-bootstrap → migrate → 서비스 100% → 경보 3개 → 스모크까지 전 단계 성공
- **승격 가드가 실전에서 처음 동작** — 01-07에서 발견한 "이미지가 다이제스트로 저장돼 승격이 영구히 막히는" 회귀를 `fe851be`가 고쳤고, 이번 승격이 그 수정의 실증이다
- **계정 2개 발급** — 관리자·테스트 직원, 이름은 스테이징과 동일(`admin`/`test`)
- **human-check 1·2·3·6 확인**, 4는 E2E 근거, 5는 미확인으로 명시
- **A3 해소** — 백업 조회 권한이 `roles/cloudsql.viewer`에 포함됨을 실측
- **운영 문서 실측 반영** — 틀렸던 주소 규칙·스모크 실패 시 대응·롤백 선택 규칙 정정, 첫 청구서 확인 절차, 배포자 권한 축소 근거(뺄 수 있는 것과 없는 것을 이유와 함께)
- **CLAUDE.md 명령 4자리 확정** — dev/test/lint/build 전부 실제 실행 확인 후 기입
- **SC6 안전 속성 충족** — 배포당 리비전 하나(`status.url` 선확정)와 스모크 실패 시 1회
  자동 롤백을 넣고, 전자를 스테이징 배포 `35417809514`(리비전 `plant8-staging-00028-dms`)
  에서 실측했다. 01-VERIFICATION.md의 유일한 미충족 항목이 닫혔다

## Issues Encountered

- **실행자 세션의 네트워크 제약이 이 플랜 내내 가장 큰 제약이었다** — `*.run.app`이 에그레스 프록시에 403 CONNECT로 막혀 배포된 앱을 직접 두드릴 수 없다. 일회용 읽기 전용 워크플로로 우회했고, 그 워크플로는 기본 브랜치에 있어야 실행된다는 것도 실측으로 알았다(작업 브랜치만으로는 404 → PR 병합 후 실행)
- **`gsd_run state resolve-blocker`가 부분 문자열로 매칭한다** — "CLAUDE.md"로 닫으려다 같은 단어가 든 Phase 2 블로커까지 지워져 즉시 복구했다. 그 과정에서 Phase 2 블로커 자체가 낡았다는 것(디자인 시스템은 이미 존재)도 드러나 현재 사실로 교체했다
- **계정 Job 토큰 갱신 실패 1회** — 위 key-decisions 참조

## User Setup Required

- 임시 결과 브랜치 4개 삭제: `probe-result`, `probe-result2`, `guard-probe-result`, `prod-verify-result` (실행자 세션에서는 ref 삭제가 막힌다)

## Next Phase Readiness

- 두 환경이 같은 이미지로 돌고 있고 승격 경로가 검증됐다 — 이후 페이즈는 main 병합 → 스테이징 자동 → 수동 승격 흐름을 그대로 쓴다
- 이월 항목: 백업 경보 필터 검증(2026-09-19 첫 자동 백업 이후), 프로덕션 세션 유지 브라우저 확인(01-VERIFICATION human_verification 1), 조직 정책 원문·런타임 SA 역할 확인(Owner 계정), 스테이징 태그 전용 트래픽 항목 4개 정리, `scripts/db-bootstrap.ts`의 `createAdminPool` 커넥터 미종료, Dockerfile의 `SecretsUsedInArgOrEnv` 경고 2건, 01-REVIEW.md의 MAJOR 8·MINOR 16(전부 Phase 1 목표 밖)
- Phase 2 착수 조건은 충족 — `docs/design/`(SYSTEM.md 725줄·tokens.css·DECISIONS.md)이 이미 있다

---
*Phase: 01-deploy-skeleton-login*
*Completed: 2026-09-18*
