# CUTOVER — 첫 운영 승격 · 전환 런북 (MIG-04 · MIG-05)

> 200줄 상한(시험 고정) · 실제 프로젝트 ID · 번호 · 백업 id는 적지 않는다(D-03) · 명령은 `ENV` · `GCP_PROJECT_ID` 변수.

## 0. 선행 조건

(선행 조건 표 — 아래 단계에서 채운다)

## 1. 첫 운영 승격

세션이 하는 일은 읽기 · 증거 대조뿐이다. 운영 명령은 모두 사용자가 한다. 운영 DB는 9/18 뼈대라 남은 마이그레이션 약 40개를 한 번에 올린다.

| 단계 | 누가 | 증거 |
|---|---|---|
| (a) 운영 `/api/health`의 sha 읽기 | 사용자 | sha가 9/18 뼈대 커밋(journal 앞 세 항목)이다 |
| (a) Actions `deploy.yml` 마지막 production 실행 확인 | 사용자 | 실행이 success이고 날짜가 9/18 무렵이다 |
| (a) `verify.yml` check=policies 실행 | 사용자 | 조직 정책 4개 · 런타임 · 배포 SA 역할이 로그에 나온다 |
| (a) `verify.yml` check=evidence-bucket 실행 | 사용자 | prod 증빙 버킷이 보이고 런타임 objectUser가 있다 |
| (a) 증빙 버킷 · objectUser가 없으면 소유자가 Cloud Shell에서 `bootstrap-gcp.sh` 재실행 | 소유자 | 재실행 뒤 evidence-bucket 점검에 버킷 · objectUser가 보인다 |
| (a) 이유: `ensure_cert_bucket`이 버킷이 없으면 서비스를 바꾸기 전에 멈춘다 | 사용자 | 승격 로그가 마이그레이션 앞에서 멈추지 않는다 |
| (a) 보안 스캐너 CI(#109)가 main에 머지됨(첫 승격 선행 · 이 페이즈가 만들지 않는다) | 사용자 | #109 머지 기록 |
| (b) 머지 동결 — 승격 SHA는 스테이징이 서빙 중인 SHA뿐이다(promote-guard) | 사용자 | 승격이 끝날 때까지 main 머지가 없다 |
| (c) 수동 백업: `gcloud sql backups create --instance=plant8-prod-db --description=pre-promote-<날짜> --project=$GCP_PROJECT_ID` | 사용자 | `backups list`에서 설명이 맞는 백업이 `SUCCESSFUL` |
| (c) 승격 뒤에는 9/18 리비전으로 못 돌아간다(rollback-floor — 0012 · 0015 · 0021 · 0036 등이 하한을 올린다) | 사용자 | 위 백업이 유일한 복원점이라는 것을 안다 |
| (d) `deploy.yml` Run workflow — target=production, sha 비움 | 사용자 | 실행 링크가 success |
| (e) 승격 직후 `/api/health` | 사용자 | `ok`이고 sha가 새 SHA다 |
| (e) notify-tick 수동 1회(OPERATIONS §6 명령) | 사용자 | 로그에 `notify.tick` ok |
| (e) Scheduler `plant8-prod-purge-certs-monthly` 존재 · 모드 dry-run(`infra/purge-certs-auto.mode`) | 사용자 | 목록에 있고 모드가 dry-run |
| (e) 증빙 업로드 스모크 — 이미지 1 · PDF 1 · 10MB 초과 거부 | 사용자 | 둘은 올라가고 초과는 거부된다 |
| (e) `/admin/settings` 절사 단위 두 값 | 사용자 | 두 값이 1 또는 10이다 |
| (e) `/admin/holidays` 2026 · 2027 확정 | 사용자 | 두 해 모두 확정으로 보인다 |
| (e) 설정 「문서 번호」 묶음의 「프로젝트 번호 순번 시작값」 칸 | 사용자 | 칸이 보이고 값 1이다 |
| (e) 경보 3개 · 「마지막 백업」 | 사용자 | `/admin/system-status`에 보인다 |

(f) 실패할 때:

- 마이그레이션 가드가 멈추면 DB는 그대로다(한 트랜잭션 — `test/integration/migration-first-promotion.test.ts`가 고정). 원인을 고친 뒤 다시 승격한다.
- 스모크 실패 + 하한 거부: 로그에 「rollback FAILED」가 나오면 실패한 새 리비전이 서빙 중이다. 원인을 고쳐 같은 SHA를 재배포하고, 안 되면 pre-promote 백업을 복원한다([`RESTORE.md`](RESTORE.md) §3).
- PITR은 전환 전에 켠다 — 인스턴스 설정은 사용자가 한다. 증거는 설정 화면 또는 `gcloud sql instances describe plant8-prod-db` 출력의 `pointInTimeRecoveryEnabled: true`.
- 승격 시점은 지금 먼저 한 번, 전환 전에 한 번 더(§2 (c′) 리허설 앞).

## 2. 전환 준비

(전환 준비 표 — 아래 단계에서 채운다)

## 3. 전환일

(전환일 표 — 아래 단계에서 채운다)

## 4. 전환 직후

(전환 직후 — 아래 단계에서 채운다)

## 5. 되돌릴 수 없는 문

(되돌릴 수 없는 문 — 아래 단계에서 채운다)

## 6. 공지 문안

(공지 문안 — 아래 단계에서 채운다)
