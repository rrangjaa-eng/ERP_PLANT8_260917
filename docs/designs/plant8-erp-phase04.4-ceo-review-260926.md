# Phase 04.4 CEO 리뷰 (plan-ceo-review) — 2026-09-26

- 대상: `.planning/phases/04.4-restore-rehearsal-and-login-status/` 플랜 6개(04.4-01~06, 직렬 체인) · 브랜치 `claude/execute-phase-04-4` · 기준 `origin/main` 8dbe98f
- 모드: **HOLD SCOPE** — 범위는 ROADMAP Phase 04.4 기준 1~5와 잠긴 결정 D8-07·D8-08. eng(9b8694e·dcd9130)·design(f8c69f5) 게이트를 통과한 뒤의 CEO 게이트. 깊이: 구현 준비
- 결정 방식: 코디네이터 지시로 돈 세션이고 사용자 부재 — 모든 결정점은 **자동 결정(추천값)**, 이 페이즈의 선례(04.4-DESIGN-REVIEW)와 같다. 범위를 바꾸는 결정은 하지 않았다(거절·이연만)
- Outside Voice: **Codex 한도(2026-09-29까지)로 미실행 → Opus 독립 검토로 대체**(하위 에이전트, 대화 맥락 없이 플랜만 읽음). **한도 풀리면 Codex 재확인 필요** — 대상: 이 리뷰 반영 커밋 + eng 리비전 dcd9130 + 디자인 검토 f8c69f5

## 요약

전제는 맞다. 백업을 한 번도 복원해 보지 않은 채 돈 데이터로 전환하면, 사고 때 처음 해 보는 절차를 운영 DB에 바로 쓰게 된다. 이 페이즈는 그 비용을 직접 없앤다. 로그인 배지(D8-07)도 대리 지표가 아니라 세션 생성 시점을 직접 기록한다.

막는 문제 2건을 받아들여 플랜에 반영했다.
- **CEO-1 (03)**: 사고 복원 런북이 운영 인스턴스를 백업으로 덮어쓰기 전에 현재 상태를 떠 두지 않는다. PITR이 꺼져 있어 잘못 고르면 되돌릴 길이 없다.
- **CEO-2 (04)**: 배지용 칼럼 하나를 쓰는 세션 훅의 예외가 로그인을 500으로 막는다. 전환일 전 직원 로그인이 걸린 경로다.

나머지는 참고로 두고 Phase 8 전 이연(TODOS.md)으로 넘겼다. 범위를 줄이자는 제안 3건(GCS 기록, 배포 겹침 감지 축소, 백필 축소)은 거절했다. 사용자 결정·앞 게이트를 뒤집고 새 의존성이 필요하기 때문이다.

- 점수: Opus 독립 검토 6.5/10(반영 전). 반영 뒤 이 리뷰 판정: **CLEAR**(막는 문제 0)
- 전체 판정: **HOLD SCOPE 통과, 실행 가능**

## 발견과 결정

| ID | 심각도 | 플랜 | 발견 | 결정 |
|---|---|---|---|---|
| CEO-1 | 막음 | 03 T3 ③(다) | 사고 복원 3단계 `backups restore --restore-instance=plant8-<env>-db`가 현재 데이터를 덮어쓰는데, 그 전 수동 백업 단계가 없다(PITR 꺼짐) | **수용**: 2(백업 선택)와 3(복원) 사이에 `gcloud sql backups create`로 복원 전 안전 백업을 만들고 id를 적는 단계를 넣는다. RESTORE.md 순서 단언 테스트에도 토큰을 더한다 |
| CEO-2 | 막음 | 04 가정 3·truth | `recordFirstLogin` 예외를 감싸지 않는다 → UPDATE 순간 오류가 로그인 전체를 막는다 | **수용**: 예외를 잡아 구조화 에러 로그(userId·오류 이름만)를 남기고 로그인은 계속한다. NULL로 남으니 다음 로그인이 다시 채운다(에러 로그가 남고 스스로 복구되므로 조용한 실패가 아니다). 「throw해도 resolve + 로그 1회 + 비밀 없음」 단위 테스트를 더한다 |
| CEO-3 | 참고 | 02 `RESTORE_CHECK_TABLES` | 「비어 있지 않음」 표가 전부 시드 표다. 그래서 프로덕션 리허설이 직원 실입력 보존을 증명하지 못한다 | 이연(TODOS): Phase 8 프로덕션 리허설 전에 그때 main의 실입력 표(프로젝트·견적 줄 등)를 목록에 더한다. 목록을 한 곳에 둔 설계(CONTEXT)가 이 확장을 전제로 한다 |
| CEO-4 | 참고 | 03 고아 점검 | 러너를 잃어 남은 임시 인스턴스는 다음 수동 실행 때만 잡힌다. 예산 경보도 없다(`scripts/` grep 0건). db-f1-micro가 한 달 남으면 $30 상한의 약 1/3이다 | 이연(TODOS): Phase 8 전에 GCP 예산 경보(D-06 금액)를 등록한다. 이번 1회는 04.4-06 T3 확인 4(콘솔에 남은 인스턴스 없음)가 막는다 |
| CEO-5 | 참고 | 03·06 | 리허설 전용 최소 권한 SA·WIF ref 조건을 「Phase 8 후속」으로 미뤘는데 ROADMAP·TODOS에 추적이 없다 | 이연(TODOS)에 등록 |
| CEO-6 | 참고 | 06 T3 | 프로덕션 경로(`plant8-prod-restore`, 운영 IAM DB 사용자, 확인 입력)는 이 페이즈에서 실제로 한 번도 돌지 않는다 | 이연(TODOS): Phase 8 체크리스트에 「프로덕션 리허설은 전환일이 아니라 최소 1주 전」 |
| CEO-7 | 참고 | UI-SPEC:139 | 기록 전 이른 실패는 화면에 옛 성공을 남긴다(03 §14에 문서화됨) | 이연(TODOS): Phase 8 체크리스트 확인은 「행의 일시가 그 리허설 날짜인지」까지 본다 |
| CEO-8 | 참고 | 03 §14 | PITR이 꺼져 있어 전환 뒤 RPO가 24시간이다. 하루치 지출결의를 잃을 수 있다 | 이연(TODOS): Phase 8 전 사용자 결정 카드(비용 몇 달러 대 RPO) |
| CEO-9 | 참고·거절 | 01 | 결과를 운영 DB 표 대신 GCS 파일로 두면 표·마이그레이션·record Job이 빠진다 | **거절**: 새 의존성(`@google-cloud/storage`)과 버킷이 필요하다(RESEARCH A5, CONTEXT Discretion에서 이미 판단). eng·design 게이트가 DB 쪽을 통과시켰다 |
| CEO-10 | 참고·거절 | 03 truth 9 | 배포 겹침 digest 감지(기준선·ⓐⓑⓒ·`POST_RECORD`)가 1인 운영에 비해 무겁다 | **거절**: 사용자 결정 2026-09-24 「따로 두고 감지」. 실행 중 막히면 「[막힘]」으로 올린다 |
| CEO-11 | 참고·거절 | 04 백필 | 두 기록원 백필은 주로 스테이징 계정용이다(프로덕션 직원은 Phase 8에 발급) | **거절**: 이미 업그레이드 픽스처까지 설계됐고 멱등·조건부라 안전하다. 줄일 이득이 작다 |

## NOT in scope

- demo 행 삭제·번호 카운터·전환일 체크리스트 본문(Phase 8), 정기 리허설 스케줄(Deferred)
- 사람 목록 느림(issue #56) 해결 — 악화시키지 않기만 한다(#65 조회 수 가드)
- 이번 리뷰가 거절한 축소안: CEO-9·10·11(이유는 위 표)

## What already exists (재사용)

- `.github/workflows/account.yml` + `deploy.sh` `deploy_jobs` — WIF → Cloud Run Job 패턴(02·03이 따른다)
- `lib/gcp/cloud-sql-admin.ts` `getLastBackup` · `domain/system-status` — 상태 화면 한 줄 추가 자리(01)
- `repositories/users.ts` `listUsers` + PR #65 묶음 조회 — 새 두 칸이 쿼리를 더하지 않는다(04)
- `ui/status-tag` · `KvList` — 새 색·컴포넌트 없음(05)

## Dream state delta

```
  지금                           이 페이즈                          12개월 이상
  백업은 켜져 있으나 복원을      staging 원본 1회 성공, 워크플로·    분기 정기 리허설(스케줄+경보),
  한 번도 안 해 봄 · 사고 절차   런북·상태 화면 · 로그인 배지        실입력 표 확인, PITR, 리허설 전용
  없음 · 누가 로그인했는지 모름                                      최소 권한 SA, 예산 경보
```
이 페이즈는 오른쪽으로 가는 길을 막지 않는다. 표 목록 한 곳, 워크플로 재실행 가능, 결과가 DB 행으로 쌓이는 구조라 정기화·경보를 나중에 얹을 수 있다.

## Section 1 — 구조

```
 사람(Actions Run) ─► restore-rehearsal.yml ─WIF─► scripts/restore-rehearsal.sh (러너, gcloud만)
                          │ 이름 가드·고아 점검·기준선 digest
                          ├─► gcloud sql instances create plant8-<env>-rehearsal-<run>-<attempt>
                          ├─► gcloud sql backups restore (대상 = 임시 이름뿐)
                          ├─► Cloud Run Job plant8-<env>-restore: CLI verify --target (사설망)
                          ├─► 임시 인스턴스 삭제(async + wait, 부재는 목록 조회 성공으로만)
                          └─► Cloud Run Job: CLI record ─► 운영 DB restore_rehearsals 한 줄(run_key UNIQUE)
 관리자 ─► /admin/system-status ─► domain/system-status ─► getLatestRestoreRehearsal(시간 제한·재검증)
 직원 로그인 ─► better-auth session.create.after ─► recordFirstLogin ─► users.first_login_at (NULL일 때만)
 관리자 ─► /admin/people ─► listPeople(#65) ─► personLoginStatus ─► 배지 둘
```
- 결합: 새 결합은 상태 화면 → `domain/ops`, auth 훅 → `repositories/users` 둘이다. 둘 다 한 방향이다
- 단일 장애점: 워크플로 러너. 러너가 죽으면 finalize(`always()`)가 정리하고, 러너 자체를 잃으면 고아 점검이 잡는다(CEO-4)
- 롤백: 코드는 `rollback.sh`. 두 마이그레이션은 CREATE TABLE과 nullable ADD COLUMN(+백필)이라 옛 코드와 함께 돌아도 문제없다
- 발견: CEO-1(런북 쪽 되돌릴 수 없는 경로). 리허설 쪽 운영 덮어쓰기 방어(03 truth 2·3, 02 대상 가드)는 충분하다

## Section 2 — 오류·복구 지도

| 경로 | 무엇이 틀어지나 | 처리 | 사람이 보는 것 |
|---|---|---|---|
| 이름 가드 | 대상 = 운영 이름·형식 불일치 | 첫 gcloud 전 종료 | Actions 실패 |
| 백업 조회 | 성공 백업 없음·권한 | 단계 restore 실패 기록 | 화면 「실패 · 복원」 |
| verify Job | 접두 불일치·표 비어 있음·연결 실패 | 종료 코드 1 → verify 실패 | 「실패 · 검증」 |
| 정리 | 삭제 실패·조회 불가 | 재시도 후 「알 수 없음」 = cleanup 실패(0으로 적지 않음) | 「실패 · 정리」 + 요약 「확인 불가」 |
| 기록 전 이른 실패 | WIF 인증 등 | 기록 없음 | Actions만(CEO-7, §14 문서화) |
| 상태 화면 조회 | 풀 고갈·잠금·유효하지 않은 행 | 1s/2s/1s 제한, 그 행만 흡수 | 「확인 불가」 |
| 세션 훅 UPDATE | DB 순간 오류 | **CEO-2 반영 후**: 잡아서 에러 로그, 로그인 계속, 다음 로그인 재시도 | 로그인 정상, 배지는 다음 로그인까지 「첫 로그인 전」 |

GAP은 반영 전 두 건(CEO-1, CEO-2)이었다. 반영 뒤 없음.

## Section 3 — 보안

- 새 공격면: `workflow_dispatch` 하나(write 권한자만), Cloud Run Job 하나(공개 아님). 새 공개 엔드포인트 없음
- `roles/cloudsql.admin` 배포 SA를 리허설이 공유한다. 위험 수용이 명시돼 있다(03 T-04.4-14). 추적은 CEO-5
- 실행 URL은 모양 검증 뒤에만 `href`에 넣는다(01). DTO 새 두 필드는 `person.value` 노출표·누수 스캔에 들어간다(04, 기준 5)
- CEO-2 로그에는 userId와 오류 이름만 남긴다(이메일·토큰 금지 단언)

## Section 4 — 데이터 흐름·경계 사례

- 기록: run_key = `<run_id>-<attempt>`. finalize를 다시 돌려도 한 줄이고, 워크플로 재실행은 새 줄이다. 동시 실행은 동시성 그룹이 막는다
- 배포 겹침: 기준선 digest를 비교해 실패로 남긴다(사용자 결정). 기록 뒤 겹침은 Actions만 빨갛게 되는 한계를 수용했다(03 truth 9)
- 사람 목록: 보관된 사람은 배지를 억제한다. 노출 불가 계급에게는 필드 자체가 없다. 첫 로그인 경합(두 세션 동시)은 조건부 UPDATE(`IS NULL`)라 한 번만 기록된다

## Section 5 — 코드 품질

- 복잡도 최대 지점은 `scripts/restore-rehearsal.sh`의 상태 파일·마감·digest 분기다(CEO-10). 가짜 gcloud 테스트가 분기마다 있어 받아들인다. 실행자는 함수당 분기 5개를 넘으면 도우미로 나눈다
- 중복 없음: account-cli 규약, deploy_jobs, KvList를 재사용한다

## Section 6 — 테스트

각 플랜이 트레이서 + 빨간 테스트 먼저(TDD) 구조다. 추가된 것은 CEO-2 단위 1건과 CEO-1 문서 순서 토큰 1개다. 금요일 새벽 2시에도 배포할 수 있게 해 주는 테스트는 04.4-06 T3의 실제 staging 1회다. 가짜 gcloud로는 GCP 가정 A2·A3·A7·A12를 증명할 수 없어서, 실측으로 판정한다. 시간 의존(가짜 시계)·외부 서비스 의존은 가짜로 격리돼 있다.

## Section 7 — 성능

사람 목록은 #65 조회 수 기준값 단언으로 SQL이 늘지 않는다. 상태 화면은 조회 1건에 시간 제한이 있다. 리허설은 수십 분 걸리는 수동 작업이라 성능 문제가 아니다.

## Section 8 — 관측

- Actions 요약에 결과·단계·백업 id·digest·남은 임시 인스턴스를 남긴다. 화면에는 「실행 기록」 링크를 둔다
- 빠진 것: 예산 경보(CEO-4), 정기 리허설 경보(Deferred). CEO-2 반영으로 훅 실패가 로그에 남는다

## Section 9 — 배포

- 순서: migrate Job → seed → 서비스(기존 deploy.sh). 새 칼럼은 nullable이라 이전·새 코드가 같이 돌아도 문제없다
- 마이그레이션 번호는 `pnpm db:generate` 그대로 두고, 머지 직전에 재생성한다(06 T1)
- 배포 후 확인: 06 T3 확인 넷(Actions 초록, 요약, 화면 행, 콘솔 잔여 없음)

## Section 10 — 장기 경로

- 되돌리기 쉬운 정도 4/5. 표·칼럼 추가뿐이다. 운영 인스턴스에 쓰는 것은 사람이 하는 사고 런북뿐이고, CEO-1이 안전 백업을 넣었다
- 6개월 뒤 후회할 후보: PITR 꺼짐(CEO-8), 최소 권한 SA 미분리(CEO-5), 「복원 성공 = 실입력 보존」 오해(CEO-3). 셋 다 TODOS에 넣었다

## Section 11 — 디자인·UX

상태 화면 한 줄과 사람 목록 배지 둘뿐이다. `/plan-design-review`(f8c69f5)가 8.8/10 CLEAR로 봤다. CEO 관점 추가 지적은 없다. 실패를 글자로만 표시하는 것과 빈 상태에 첫 행동이 없는 것은 디자인 리뷰에서 이미 이연했다.

```
 /admin/system-status: [기록 없음] ─리허설 성공─► [성공 · 스테이징 · 일시 · 백업 · N분]
                                    └실패──────► [실패 · 단계 · … · 실행 기록 ↗]
                        조회 불가 ─► [확인 불가]
 /admin/people: 발급 ─► [첫 로그인 전 · 임시 비밀번호 사용 중] ─로그인─► [임시 비밀번호 사용 중]
                ─비번 변경─► [—] ─재발급─► [임시 비밀번호 사용 중]
```

## Implementation Tasks

- T1 (P1, 03, CEO-1): RESTORE.md 사고 복원에 복원 전 `backups create` 단계와 순서 토큰 — 플랜 반영 완료
- T2 (P1, 04, CEO-2): `recordFirstLogin` 예외 흡수 + 구조화 로그 + 단위 테스트 — 플랜 반영 완료
- T3~T8 (P2, Phase 8 전): CEO-3~8 → `TODOS.md` 「Phase 04.4 CEO 리뷰 이연」

## GSTACK REVIEW REPORT

| Runs | Status | Findings |
|---|---|---|
| plan-ceo-review 04.4 (HOLD SCOPE, Opus) | DONE | 막음 2(수용·반영), 참고 6(이연), 거절 3 |
| Outside voice (Opus 독립, Codex 대체) | DONE | 6.5/10, 막음 2 = CEO-1·2 |

- VERDICT: CLEAR — 실행 가능
- OUTSIDE COVERAGE / CROSS-MODEL: Codex 미실행(한도 2026-09-29) → Opus 독립 검토로 대체. **한도 풀리면 Codex 재확인 필요**

NO UNRESOLVED DECISIONS
