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

세션은 읽기뿐이고 화면 입력은 관리자가 한다. 전환일은 **2027-01-04(월)** 고정 — 준비가 먼저 끝나도 그날까지 인트라넷을 쓴다. 2026년 업무는 인트라넷에만 남고 새 시스템 첫 프로젝트 번호는 **27001**.

| 단계 | 누가 | 증거 |
|---|---|---|
| (a) 마스터 손 입력: `/admin/vendors`(거래처 · 클라이언트 한 표) · `/admin/people`(+`/roles` · `/org`) · `/admin/corp-cards`(끝 네 자리) · `/admin/code-tables` | 관리자 | 각 화면 목록에 실제 쓰는 행이 보인다 |
| (a) 마스터 손 입력: `/admin/settings`(세율 · 연차 일수 · 번호 서식) · `/admin/notification-rules` · `/admin/holidays` · `/admin/permissions` · `/admin/visibility` · `/admin/field-definitions` | 관리자 | 각 화면에 값이 들어 있다 |
| (a) 거래처 정리: `/admin/vendors`에서 갈래가 「둘 다」로 남은 행을 실제 갈래(클라이언트 · 협력사)로 고친다 | 관리자 | 「둘 다」로 남은 행이 정말 둘 다인 곳뿐이라는 건수 한 줄 |
| (a) 운영 설정 — 정산 결재선 3단 켬: `/admin/settings` 정산 결재선 묶음 3단 사용 켬 · 담당 계급 「본부 책임자」 · 조직 범위 「특정 부서」 · 특정 부서 「경영관리본부」 → 「3단 저장」 | 관리자 | 설정 화면에 3단 네 칸이 켜져 있다 |
| (a) `/admin/people`에서 경영관리본부 소속 「본부 책임자」 계급을 정확히 한 사람에게 준다 — 그 계급인 사람이 없으면 3단이 조용히 넘어간다 | 관리자 | 사람 목록에 경영관리본부 「본부 책임자」가 1명 |
| (a) 설정 가져오기 CLI · 가져오기 스크립트는 쓰지 않는다(운영 DB 직접 명령). 리저브 기초 잔액 · 연차 조정 · 증빙 일괄 등록은 demo 삭제 뒤(§4) | 관리자 | — |
| (b) 직원 계정: `/admin/people` 등록 폼(초기 비밀번호 한 번) 또는 `account.yml create` — 첫 업무 계정은 계급을 갖게 만든다 | 관리자 | 사람 목록 수가 직원 수와 같다 |
| (b) 임시 비밀번호는 구두 · 메신저로 전한다. Actions 로그는 공유 화면에 띄우지 않는다. 인트라넷 비밀번호는 어떤 형태로도 받지 않는다 | 관리자 | — |
| (b) 9/18에 만든 기존 계정은 「정상」으로 보일 수 있다 — 목록을 사람 수와 대조한다. 계정 발급 안내에 연습 안내(§6)를 꼭 넣는다 | 관리자 | 대조한 건수 한 줄 |
| (c) 로그인 확인 — 사람 목록 「첫 로그인 전」 0명이 목표다 | 관리자 | 목록의 「첫 로그인 전」 건수 |
| (c) 비밀번호를 안 바꾼 사람이 있어도 전환한다. 그 사람은 전환 뒤 사람 상세 「비밀번호 초기화」로 재발급하고, 화면을 못 쓸 때만 `account.yml reset`. 한 사람 때문에 전환을 미루지 않는다 | 관리자 | 대상 이름 목록 |
| (c′) 재승격 — §0 선행이 끝나고 08-02 · 08-04가 main에 들어와 스테이징이 초록이면 프로덕션 리허설 앞(전환 1주 이상 전)에 §1 (b)~(e)를 반복한다(수동 백업 `pre-promote-2-<날짜>`) | 사용자 | 승격 실행 링크 success |
| (c′) 운영 `cutover.yml` env=production · mode=dry-run(읽기만)으로 Job · 건수를 본다 | 사용자 | 요약에 표별 건수가 찍힌다 |
| (d) 프로덕션 복원 리허설 — 재승격 뒤 `restore-rehearsal.yml` env=production · confirm_production `plant8-prod-db`. 전환 최소 1주 전에 한다 | 사용자 | 실행 success |
| (d) 상태 화면 「복원 리허설」 행의 일시가 그 실행 날짜이고 백업 id가 요약과 같다. 스테이징 성공은 이 조건을 채우지 않는다 | 사용자 | 일시 · 백업 id 대조 한 줄 |
| (e) 전환일 2027-01-04: 준비 완료(마스터 · 전 직원 계정 · 프로덕션 리허설 1회 성공)는 그 전까지의 조건이다. 안 끝나면 전환하지 않고 사용자가 정한다 | 사용자 | 전환 전날 조건 대조 |
| (f) 인트라넷 결재 마감 공지 — 전환 3영업일 전. 날짜는 `/admin/holidays` 공휴일 표로 센다 | 관리자 | 공지 날짜 |
| (f) 결재 · 지급 대기 지출결의는 전환 전날까지 인트라넷에서 끝낸다. 못 끝낸 건만 전환 뒤 새 시스템에 다시 올린다. 법인카드 · 증빙은 사용일 기준 — 전환일 전 사용분은 인트라넷에서 마감 | 관리자 | 미결 건수 |
| (g) 결재 위임은 없다 — 결재자 부재 시 관리자가 설정에서 담당을 바꾼다. 직원은 할 수 없어 직원 공지에 넣지 않는다 | 관리자 | — |

## 3. 전환일

(전환일 표 — 아래 단계에서 채운다)

## 4. 전환 직후

(전환 직후 — 아래 단계에서 채운다)

## 5. 되돌릴 수 없는 문

(되돌릴 수 없는 문 — 아래 단계에서 채운다)

## 6. 공지 문안

(공지 문안 — 아래 단계에서 채운다)
