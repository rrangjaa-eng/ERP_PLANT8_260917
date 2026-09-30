# API Coverage — Google Cloud (Cloud SQL Admin · Cloud Run Jobs · Artifact Registry)

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
> 04.4 복원 리허설(`scripts/restore-rehearsal.sh`)과 수동 복원 런북(`docs/RESTORE.md`)이 gcloud로 쓰는 표면.
> OPT-OUT의 이유는 모두 이미 기록된 결정에서 옮겼다(04.4-RESEARCH 가정 A4 · 04.4-06 SUMMARY Deferred · CEO 리뷰 CEO-1). 새 결정 없음.

| capability | decision | reason |
|---|---|---|
| Cloud SQL 인스턴스 생성(임시, 사설 IP만) | INTEGRATE | |
| Cloud SQL 인스턴스 조회·목록(이름 가드 · 고아 점검 · 부재 확인) | INTEGRATE | |
| Cloud SQL 인스턴스 삭제(임시 이름만) | INTEGRATE | |
| Cloud SQL 백업 목록(최신 성공 자동 백업 고르기) | INTEGRATE | |
| Cloud SQL 백업 복원(임시 인스턴스로) | INTEGRATE | |
| Cloud SQL 작업 대기(`operations wait`) | INTEGRATE | |
| Cloud SQL 작업 목록(삭제 전 끝나지 않은 작업) | INTEGRATE | |
| Cloud SQL IAM DB 사용자 목록·생성(복원 뒤 보정) | INTEGRATE | |
| Cloud Run Job 실행·조회(verify · record) | INTEGRATE | |
| Artifact Registry 이미지 digest 조회(배포 겹침 감지) | INTEGRATE | |
| Cloud SQL 온디맨드 백업 생성(사고 복원 전 안전 백업) | OPT-OUT | 자동화하지 않음 — 사고 때 사람이 `docs/RESTORE.md` 절차로 실행(CEO-1 결정) |
| Cloud SQL 인스턴스 설정 변경(`instances patch` — 공개 접근 제거 · 재개) | OPT-OUT | 자동화하지 않음 — 사고 복원 런북의 사람 절차(`docs/RESTORE.md`) |
| Cloud Scheduler 일시정지·재개 | OPT-OUT | 자동화하지 않음 — 사고 복원 런북의 사람 절차(`docs/RESTORE.md`) |
| PITR(시점 복구) | OPT-OUT | explicitly out of scope — 요구사항은 최신 자동 백업 복원(04.4-RESEARCH 가정 A4) |
| production 원본 리허설 | OPT-OUT | not needed yet — Phase 8 전환일 체크리스트로 이연(04.4-06 SUMMARY Deferred) |
| 정기 리허설 스케줄 | OPT-OUT | not needed yet — 이연(04.4-06 SUMMARY Deferred) |
