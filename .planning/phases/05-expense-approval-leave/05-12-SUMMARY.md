---
phase: 05-expense-approval-leave
plan: 12
subsystem: infra
tags: [gcs, v4-signed-url, google-auth-library, iam-signblob, bootstrap, deploy, cors, lifecycle]

requires:
  - phase: 05-04
    provides: ObjectStorage interface (createSignedPut · createSignedGet · getMetadata · move · delete · retain) + local driver
  - phase: 04.3-05
    provides: lib/gcp/gcs.ts GcsRequest adapter · cert_bucket / ensure_cert_bucket precedent
provides:
  - gcs evidence driver (createGcsStorage) + getObjectStorage gcs branch
  - lib/gcp/gcs-v4.ts buildV4SignedUrl (pure V4 signing, injected signer)
  - evidence bucket infra (bootstrap (d-3) · ensure_evidence_bucket · ensure_evidence_cors · env vars · verify-gcp evidence-bucket)
  - docs/EVIDENCE-STORAGE.md runbook · scripts/gcs-sign-smoke.ts spike
affects: [05-13, phase-06-F8]

actuals:
  tokens: 26000
  tasks: 3
  commits: 7
plan_head_before: a80f0e74cf93faa2a75025a4ca8567919e36bbfe

tech-stack:
  added: []
  patterns:
    - "V4 signing without SDK: buildV4SignedUrl + injected signer (GoogleAuth.sign → IAM signBlob)"
    - "Evidence REST via 04.3 GcsRequest with GCS_OBJECT_SCOPE (devstorage.full_control); signer GoogleAuth uses cloud-platform"

key-files:
  created: [lib/gcp/gcs-v4.ts, test/unit/lib/gcp/storage-gcs.test.ts, docs/EVIDENCE-STORAGE.md, scripts/gcs-sign-smoke.ts]
  modified: [lib/gcp/storage.ts, lib/gcp/gcs.ts, infra/names.sh, scripts/bootstrap-gcp.sh, scripts/deploy.sh, scripts/verify-gcp.sh, .github/workflows/verify.yml, docs/OPERATIONS.md, test/unit/deploy/bootstrap-sh.test.ts, test/unit/deploy/deploy-sh.test.ts, test/unit/deploy/workflows.test.ts, test/unit/deploy/fakebin/gcloud, test/unit/docs-limits.test.ts]

key-decisions:
  - "서명용 GoogleAuth 범위는 cloud-platform — IAM signBlob(iamcredentials)은 저장소 범위 토큰을 거부"
  - "증빙 REST 범위는 devstorage.full_control(GCS_OBJECT_SCOPE) — read_write 토큰으로는 temporaryHold PATCH가 403(스파이크 실측). 권한 상한은 버킷 IAM objectUser"
  - "스파이크 서명은 런타임 SA 자신의 토큰으로 자기 signBlob — Cloud Run과 같은 갈래라 부트스트랩 자기 TokenCreator 바인딩을 증명"

requirements-completed: [EVID-01]

coverage:
  - id: D1
    description: "gcs 드라이버 V4 서명 PUT · GET(공개 키 검증) · 메타데이터 · rewriteTo 옮기기 · temporaryHold · 서명 실패 로그 · gcs 분기와 버킷 없음 오류"
    requirement: EVID-01
    verification:
      - kind: unit
        ref: "test/unit/lib/gcp/storage-gcs.test.ts"
        status: pass
      - kind: manual_procedural
        ref: "/mnt/project-files/notes/05-review/05-12-spike/README.md (2차 8 PASS · exit 0)"
        status: pass
    human_judgment: false
  - id: D2
    description: "증빙 버킷 부트스트랩 (d-3) · 배포 ensure_evidence_bucket · 서비스 배포 뒤 CORS · 환경 변수 둘 · verify-gcp evidence-bucket · 런북"
    requirement: EVID-01
    verification:
      - kind: unit
        ref: "test/unit/deploy/{bootstrap-sh,deploy-sh,workflows}.test.ts · test/unit/docs-limits.test.ts"
        status: pass
    human_judgment: true
    rationale: "CORS 원점 · prod 런타임 objectUser는 첫 배포 뒤에만 실재 — 05-13 Task 3 staging 확인이 본다"

duration: ~3h (checkpoint wait 포함)
completed: 2026-10-04
status: complete
---

# Phase 05 Plan 12: GCS 증빙 드라이버 · 증빙 버킷 인프라 Summary

**새 패키지 · 키 파일 없이 google-auth-library만으로 만든 GCS V4 서명 증빙 드라이버(IAM signBlob)와, 부트스트랩 · 배포 · 점검 스크립트로 재현되는 증빙 버킷(incoming/ 7일 수명 주기 · 버킷 범위 최소 IAM · 확정된 서비스 원점 CORS) — 실제 staging 버킷에서 사람이 스파이크 8단계 PASS로 확인**

## Accomplishments
- `lib/gcp/gcs-v4.ts` 순수 V4 조립 + `createGcsStorage`(REST는 04.3 `GcsRequest` 재사용, `lib/gcp/gcs.ts`는 두 타입만 넓힘) · `getObjectStorage` gcs 분기
- 부트스트랩 (d-3) · `ensure_evidence_bucket` · `ensure_evidence_cors`(deploy_service 뒤) · `STORAGE_DRIVER=gcs` · `GCS_EVIDENCE_BUCKET` · `INPUT_CHECK=evidence-bucket`
- `docs/EVIDENCE-STORAGE.md`(86줄) · OPERATIONS §4 가리킴 조각(300줄 그대로)
- 스파이크 증거: `/mnt/project-files/notes/05-review/05-12-spike/README.md` — 2차(3b901805) put 200 · metadata · move · metadata-after-move · retain 200 · get 200 · oversize-put 400 EntityTooLarge · delete 200, exit 0, 남은 객체 없음. verify-gcp evidence-bucket: 예상된 첫 배포 전 2줄(staging CORS 원점 · prod 런타임 objectUser)만 실패

## Task Commits
1. Task 1 gcs 드라이버 — `a9038109` (test, RED 14) · `f6c85ae5` (feat)
2. Task 2 증빙 버킷 인프라 — `83118ad1` (test, RED 12) · `2499bf3a` (feat)
3. Task 3 스파이크 — `8df5e714` (feat) · 오케스트레이터 `05971a81` (chore, verify.yml) · `3b901805` (fix, 범위)

`commits: 7`은 `(05-12)` 커밋 수다. `git rev-list --count a80f0e74..HEAD` = 11(같은 트리의 05-15 커밋 4개 포함).

## Deviations from Plan

1. **[Rule 1] 서명 범위 cloud-platform** — Task 1. 계획은 서명용 GoogleAuth에 devstorage.read_write를 줬지만 Cloud Run 메타데이터 토큰은 요청 범위를 따르고 iamcredentials signBlob은 저장소 범위를 거부한다. 서명용만 cloud-platform. `f6c85ae5`
2. **[Rule 3] 수명 주기를 create에도 실음** — Task 2. 새 버킷은 `create … --lifecycle-file`, 있는 버킷은 `update … --lifecycle-file`(매번 적용은 그대로). 별도 update 줄은 기존 사례 `not.toContain("storage buckets update")`를 깬다. `2499bf3a`
3. **[Rule 3] 기존 단언 좁힘** — deploy-sh 서명 버킷 사례의 「버킷 바인딩이 전체에서 하나」를 서명 버킷 범위로(증빙 버킷 바인딩이 하나 더 생김). `83118ad1`
4. **[Rule 3] 가짜 gcloud 수정** — `test/unit/deploy/fakebin/gcloud`가 `--lifecycle-file` · `--cors-file` 내용을 다음 줄에 기록(호출 뒤 지워지는 임시 파일 단언용). `83118ad1`
5. **[실행 규칙] verify.yml을 실행자가 고치지 않음** — 실행 규칙(워크플로 수정 금지)으로 되돌리고 그 단언을 뺐다. 오케스트레이터가 사용자 허락으로 `05971a81`에서 `- evidence-bucket`을 더했다.
6. **[Rule 1] 스파이크 서명 갈래** — 가장 자격에서 `GoogleAuth.sign`은 사람 계정으로 signBlob을 불러 런타임 자기 TokenCreator를 증명하지 못한다. 스파이크는 런타임 SA 자신의 토큰으로 자기 signBlob(Cloud Run과 같은 갈래). 사람에게는 가장용 임시 TokenCreator와 되돌림 명령을 런북 §5에 둠. `8df5e714`
7. **[ASSUMED → 확인됨] verify-gcp는 jq + `gcloud storage --format=json` 필드 이름**(`uniform_bucket_level_access` · `lifecycle_config` · `cors_config`) — 사람 실행에서 통과 줄이 나와 확인됨.
8. **[Rule 1 — 사람 스파이크가 찾음] 증빙 REST 범위 full_control** — 1차 스파이크에서 retain · 표식 해제 PATCH만 403(read_write). 오케스트레이터가 `3b901805`에서 `GCS_OBJECT_SCOPE = devstorage.full_control`(기본 REST 클라이언트 · 스파이크)과 retain 실패 시 GCS 오류 message 기록으로 고쳤고, 2차에서 8 PASS.

**Total deviations:** 8 (Rule 1: 3 · Rule 3: 3 · 실행 규칙 1 · 가정 확인 1). **Impact:** 보안 범위는 버킷 IAM이 그대로 정하고 새 의존성 0, 범위 확장 없음.

## 사용자 결정에 따른 변경
- 웨이브 순서: 코디네이터 · 사용자 합의로 이 checkpoint를 기다리는 동안 웨이브 7 이후가 계속 돌았고, 05-13만 기다렸다(플랜 execution_notes의 「웨이브 6이 멈춘다」 대신).
- verify.yml 선택지는 사용자 허락(2026-10-04)으로 오케스트레이터가 더함(`05971a81`).

## Verification
- `pnpm test:unit` 전체: 248 files · 3794 tests 통과(SUMMARY 직전, 3b901805 이후)
- lint · typecheck · `flock … pnpm build` · `bash -n` 넷 통과(Task 1 · 2). lockfile diff 0 · 개인 키 문자열 0 · 스파이크 console.log에 url · signature · client_email 없음
- 사람 확인: Task 3 `approved`(2차 8 PASS)

## Next Phase Readiness
- 위험 경로(`infra/names.sh` · `bootstrap-gcp.sh` · `deploy.sh` · `verify.yml`)는 사용자 머지. staging 버킷은 이미 부트스트랩됨 — prod도 같은 실행에서 만들어졌다. 첫 배포가 CORS · prod 런타임 objectUser를 맞춘 뒤 `INPUT_CHECK=evidence-bucket` 재실행 · 05-13 Task 3 앱 전체 확인.
- 지운 증빙 · 거부된 트랜잭션 뒤 남은 `evidence/` 객체 정리(표식 해제 포함)는 Phase 6 F8.
- 사용자 지정 도메인 매핑 시 CORS 원점은 `status.url` 기준이라 도메인 원점은 따로 더해야 한다(도메인은 아직 보류).

## Self-Check: PASSED
- 파일: lib/gcp/gcs-v4.ts · test/unit/lib/gcp/storage-gcs.test.ts · docs/EVIDENCE-STORAGE.md · scripts/gcs-sign-smoke.ts 존재
- 커밋: a9038109 · f6c85ae5 · 83118ad1 · 2499bf3a · 8df5e714 · 05971a81 · 3b901805 존재
