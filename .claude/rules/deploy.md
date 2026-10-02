---
paths:
  - "scripts/**"
  - ".github/workflows/**"
  - "infra/**"
  - "Dockerfile"
  - ".dockerignore"
---

# 배포·CLI·워크플로를 만지는 세션이 먼저 알아야 할 것 (docs/HANDOFF.md 함정 1·2 + 운영 실측)

- **순환 import는 CLI 번들을 조용히 죽인다.** `scripts/build-cli.mjs`는 esbuild ESM 번들이라 런타임 순환이 있으면 top-level await가 풀리지 않아 Node가 exit 13으로 끝나고, Cloud Run Job이 아무 일도 안 한 채 성공처럼 보인다. dev·Next 빌드·vitest는 순환을 견디므로 잡지 못한다. `test/unit/import-cycles.test.ts`가 빨간불이면 우회하지 말고 잎 모듈로 끊는다(`domain/permissions/role-name.ts` 선례).
- **CI는 `build:cli`를 돌리지 않는다.** 번들을 건드렸으면 `pnpm build:cli` 뒤 **실제로 실행**해 본다. `test/unit/deploy/cli-bundle.test.ts`가 deploy.sh 진입점과 outputs를 대조한다.
- CI 구조: draft PR은 `quality`만, ready·main은 `integration`·`e2e` 각 2샤드. 잡 순서·필수 스텝은 `test/unit/ci-guard.test.ts`가 고정한다 — ci.yml을 바꾸면 그 테스트를 먼저 바꾼다(RED → GREEN). `deploy.yml`의 push paths는 ci.yml과 같아야 한다(`test/unit/deploy/workflows.test.ts`).
- main push → deploy.yml은 같은 tree를 PR에서 이미 검사했으면(tested-tree) CI를 건너뛰고, 아니면 ci.yml을 부른 뒤 스테이징에 배포한다. 프로덕션은 `workflow_dispatch` 수동이고 `scripts/promote-guard.sh`가 스테이징이 서빙 중인 SHA만 올린다(D-05).
- **배포 SA 권한이 늘면 소유자가 `scripts/bootstrap-gcp.sh`를 1회 다시 실행해야 한다.** 04.2가 Cloud Scheduler 작업 생성을 deploy.sh에 넣었고(`ensure_scheduler`), `gha-deployer`에 `cloudscheduler.admin`이 없어 main 배포가 실패했다(2026-09-27). 새 GCP 리소스 종류를 deploy.sh에 넣으면 bootstrap의 역할 목록도 같이 고치고 OPERATIONS.md에 재실행 조건을 적는다.
- bash `ERR` 트랩은 `set -E`(errtrace) 없이는 함수 안에서 발동하지 않는다(deploy.sh STAGE 메시지 실측).
- 프로젝트 ID·번호·이메일 등 식별자를 리포에 적지 않는다. GitHub 변수(`GCP_PROJECT_ID`·`GCP_REGION`)와 인자로만 넣는다.
