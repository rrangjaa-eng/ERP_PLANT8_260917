# API Coverage — GCP(Cloud Storage · Cloud SQL Admin · Cloud Run · Cloud Logging · IAM) · GitHub REST

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
> Phase 8은 새 외부 서비스를 붙이지 않는다 — 이미 쓰는 GCP 클라이언트(lib/gcp)와 워크플로의 gcloud, 세션의 `gh` 읽기만 쓴다. 아래는 전환 도구 · 워크플로 · 운영 대조가 닿는 면 전부다.

| capability | decision | reason |
|---|---|---|
| gcs.objects.delete | INTEGRATE | 지운 업무 기록의 증빙 객체 삭제 — 08-02 Task 3 · 기존 ObjectStorage.delete |
| gcs.objects.patch temporaryHold=false | INTEGRATE | 삭제 전 임시 보류 해제 — 08-02 Task 3 · 새 ObjectStorage.release |
| gcs.objects.list | OPT-OUT | explicitly out of scope — 지울 키는 같은 트랜잭션에서 files 표로 모으고 실패 키는 로그 `cutover.objects`(C7) |
| gcs 보존 정책 · 이벤트 보류 해제 | OPT-OUT | not needed — 증빙 객체는 임시 보류만 쓴다 · 그 밖은 삭제 실패 → 고아 목록 |
| cloudsql.backupRuns.list | INTEGRATE | 마지막 백업 성공 · 3시간 안 가드 — 08-02 · 기존 getLastBackup |
| cloudsql.backupRuns.insert | OPT-OUT | explicitly out of scope — 운영 GCP 작업은 사용자 단계(수동 백업) · 도구는 최신성만 확인 |
| cloudsql.instances.patch PITR | OPT-OUT | explicitly out of scope — 사용자 카드 2026-11-04 13:38 KST 「전환 전에 켬」 · 사용자가 콘솔에서(08-05 · 08-06) |
| run.jobs.run 재정의 인자 | INTEGRATE | cutover.yml이 `plant8-{env}-cutover` 실행 — 08-04 · account.yml과 같은 권한 |
| run.jobs.create/replace | INTEGRATE | deploy.sh가 cutover Job 배포 — 08-04 |
| logging.entries.list jsonPayload | INTEGRATE | 실행 이름으로 좁혀 `cutover.*` 줄 읽기 — 08-04 |
| iam.workloadIdentityPoolProviders.update attribute-condition | INTEGRATE | WIF 프로바이더 main ref 조건 — 08-09 · 소유자 bootstrap 재실행(create · update 같은 조건) |
| iam.serviceAccounts.create · 프로젝트 조건부 IAM 바인딩 | INTEGRATE | 리허설 전용 SA gha-rehearsal · 임시 인스턴스 접두어에만 cloudsql.admin · 읽기 역할 다섯 — 08-09 |
| run.jobs.setIamPolicy(job 단위) | INTEGRATE | restore Job 둘에만 리허설 SA 실행 권한 — 08-09 부트스트랩 |
| github REST 읽기(runs · logs · issues) | INTEGRATE | 세션의 증거 대조 — 08-05 ~ 08-08 · GraphQL 막힘 |
| github REST 쓰기(워크플로 실행) | OPT-OUT | explicitly out of scope — 운영 실행은 사용자(CLAUDE.md §2) · 세션은 읽기와 PR 댓글만 |
