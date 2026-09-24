# Phase 04.4 엔지니어링 리뷰 (plan-eng-review) — 2026-09-25

- 대상: `.planning/phases/04.4-restore-rehearsal-and-login-status/04.4-01-PLAN.md` ~ `04.4-06-PLAN.md`
- 브랜치: `claude/plan-phase-04-4-uvk4wz` · 날짜: 2026-09-25 KST
- 방식: Opus 1차 검토 3갈래(슬라이스 A=04.4-01·02 / B=04.4-03·04 / C=04.4-05·06) + Codex(gpt-6-astra, read-only) 같은 3슬라이스 동시 실행 + Sonnet 1차 대조(통합·중복제거) + Fable 막는 문제 판단(파일:줄 실측). 첫 단일 Codex 실행은 300초에서 타임아웃(커버리지 공백)했고, 3슬라이스로 나눠 재실행 — 모두 exit 0, "NO BLOCKING ISSUES", 참고 6건.

## Step 0 Scope Challenge

복잡도 게이트(8파일 이상) 발동 — 대상 플랜 6개 + CONTEXT·RESEARCH·VALIDATION 참조까지 걸려 상한을 넘는다. 자동 결정: 원래 구성(3슬라이스 병렬 1차 + Codex 3갈래 + 통합 대조 + Fable 판단) 유지 — 플랜 체커·Codex가 이미 여러 차례(첫 타임아웃 후 재실행 포함) 통과했고 줄일 수 있는 기능이 없다. 스레드 세션이라 카드 없이 추천안을 그대로 적용한다. 사용자 결정 「(04.4는 04와) 따로 두고 감지」는 불변으로 유지한다. mode: **FULL_REVIEW**.

---

## 1. 아키텍처

| ID | 심각도 | 판정 | file:line | 설명 |
|---|---|---|---|---|
| E-01 | P2 | 참고 | 04.4-02-PLAN.md:33,147,151 | 확인표는 "뒤 페이즈는 항목만 더한다"인데 "이미지가 앞선 것은 정상"(truth3)과 충돌 — 배포 직후 리허설이 새 표를 못 찾고 거짓 "검증실패". 지금 12개 표는 전부 0003~0007에 있어 이번 페이즈 실행에는 영향 없음(F2) |
| E-08 | P2 | 참고 | 04.4-03-PLAN.md:190 | 복원 완료 증거가 "동기 backups restore가 0 종료"뿐 — gcloud 조기반환 선례 있음, 리허설이 거짓 실패로 끝날 수 있음 |
| E-09 | P3 | 참고 | 04.4-03-PLAN.md:312 | 사고복원 1(d) "운영워크플로 안 돌린다"가 main 자동배포(push 트리거)를 못 막음(스테이징만 영향) |
| E-18 | P1 | **BLOCKING** | 04.4-06-PLAN.md:206 (A1) | Task1 재생성 뒤 `/ship`까지 사이 main이 다른 페이즈로 더 앞서면 drizzle이 04.4 마이그레이션을 조용히 건너뛴다(Fable #3) |
| E-19 | P2 | 참고 | 04.4-06-PLAN.md:220 (A2) | Task3 판정 문구는 Cloud Run Job stdout인데 Actions 로그 반입 단계가 없어 성공도 "로그에 없음"으로 오판 가능 |

## 2. 코드 품질

| ID | 심각도 | 판정 | file:line | 설명 |
|---|---|---|---|---|
| E-02 | P3 | 참고(크로스모델) | 04.4-02-PLAN.md:73,201 | cli-bundle.test.ts가 `--args=` 형식만 잡고 restore Job의 `--command=node,...` 형식은 놓침(Claude-A + Codex-A#1 일치) |
| E-03 | P3 | 참고 | 04.4-01-PLAN.md:59,205 / 04.4-02-PLAN.md:142 | DB모듈 미로딩 보장은 tsx·vitest 한정 — 번들에서는 외부 패키지 평가가 가드보다 먼저(안전성 문제 아님) |
| E-04 | P3 | 참고 | 04.4-02-PLAN.md:261 | Artifacts표가 restore-rehearsal-cli.test.ts를 "확장"이라 적었지만 01이 이 파일을 안 만듦(신규) — 오기 |
| E-07 | P2 | 참고 | 04.4-02-PLAN.md:202 | 번들 스모크가 종료코드1+에러단어 부재만 봐서 대상가드 이전 인증 env 오류로도 통과할 수 있음(Codex-A#2) |
| E-10 | P1 | **BLOCKING** | 04.4-04-PLAN.md:137,199 / 04.4-06-PLAN.md:125,134 | 생성된 ADD COLUMN 마이그레이션에 `SET LOCAL lock_timeout/statement_timeout` 헤더 없어 `pnpm lint:sql`이 반드시 실패(squawk 실측). 06에서는 헤더를 붙이면 확인(b) 정규식이 실패해 어느 쪽을 택해도 06 Task1 verify가 빨갛다(Fable #2) |
| E-11 | P3 | 참고 | 04.4-04-PLAN.md:219 | hooks.ts "삭제줄 0" 게이트가 자연스러운 import 확장을 삭제1줄로 잡아 막음 |
| E-12 | P3 | 참고 | 04.4-03-PLAN.md:204 | 원본대상변경 grep이 고정 변수이름(SOURCE)에 의존 — 다른 이름 쓰면 게이트 항상 통과 |
| E-13 | P3 | 참고 | 04.4-04-PLAN.md:197 | 스키마 주석 "after 훅"이 기록지점이 아니라고 명시한 hooks.ts:85의 after와 혼동 |
| E-20 | P1 | **BLOCKING** | 04.4-06-PLAN.md:184 (C1) | `PHASE_BASE`가 `<automated>` 새 셸에서 비어 `HEAD..HEAD`가 되어 금지범위 게이트가 항상 초록(Fable #4 실측: exit=0 len=0) |
| E-21 | P2 | 참고 | 04.4-05-PLAN.md:305,223,226 (C2) | 같은 원인 — `PLAN_BASE` 미설정시 ui/roles 불변 단언이 공허 통과(단 :223 삭제줄1개 단언은 빈 diff면 실패해 드러남) |
| E-22 | P3 | 참고 | 04.4-05-PLAN.md:125 (C3) | overflow-wrap:anywhere 중복 선언(body가 이미 상속으로 줌), 무해 |
| E-23 | P3 | 참고 | 04.4-05-PLAN.md:194 (C4) | .sr-only는 clip 방식이라 innerText 단언에 라벨이 섞여듬 — 라벨 제거로 '고치려는' 위험(금지사항) |
| E-24 | P3 | 참고(5/10, 오탐가능) | 04.4-05-PLAN.md:209 (C5) | person.value 꺼짐시 email 키 제거로 접힌줄이 구분자만 남는 퇴화 행(극단 케이스, 빈도 낮음) |
| E-25 | P3 | 참고 | 04.4-06-PLAN.md:153 (C6) | Task2 `<files>`가 journal.json인데 Task2는 journal을 안 고침(메타데이터 오기) |
| E-28 | P2 | 참고 | 04.4-06-PLAN.md:136 | 개발DB(erp) migrate 검증에 DATABASE_URL 미지정 — 상속 env로 다른 DB 적용해도 통과 가능(Codex-C#1) |

## 3. 테스트

```
슬라이스 A (04.4-01 · 04.4-02)
04.4-01 ─────────────────────────────────────────────────────────────
 CLI record ──parseArgs──────────── [통합6 인자 규약]  ✔
   │  APP_ENV→source ────────────── [통합5 local=2] [통합2 staging] ✔
   │  (prod→production)──────────── ✘ 직접 단언 없음(P3, F-미기재: 매핑 한 줄이라 생략 가능)
   ├─domain.record 검증 ─────────── [T2 쓰기 거부 행렬] [T2 CLI 거부 3] ✔
   ├─repo.insert ON CONFLICT ────── [통합7 같은 결과=0] [통합8 다른 결과=4] ✔
   └─DB 제약 ────────────────────── [통합4 직접 SQL 전 조합 + 제약 이름] ✔
 getSystemStatus.restoreRehearsal
   ├─none/recorded ──────────────── [통합1] [통합2] [통합3 최신·동시각] [단위] ✔
   ├─unavailable(throw) ─────────── [단위] ✔
   ├─잠금 대기 ──────────────────── [T2 LOCK TABLE, 5초] ✔ (단, F1 행 걸림)
   ├─풀 고갈 ────────────────────── [T2 getLastBackup 안에서 고갈] ✔ (단, F1)
   └─읽기 검증(infinity·역전) ──── [T2 통합] ✔
 formatRestoreRehearsal ─────────── [단위 성공·실패 3단계·복합·run_url NULL·
                                      59/60/119초·KST 경계·production] ✔
 page.tsx 행 순서·삭제 없음 ─────── [acceptance grep] ✔ (렌더 E2E는 05)

04.4-02 ─────────────────────────────────────────────────────────────
 CLI verify 가드 ────────────────── [단위: 원본·불일치·target 없음·플래그] ✔
   └─번들에서 가드 선행 ─────────── [T2 번들 스모크] ✔
 journal 읽기 실패 → 1 ──────────── ✘ 직접 테스트 없음(P3 — 파일은 이미지에 늘 있음)
 verifyRestoredDatabase
   ├─접두 전체 비교 ─────────────── [단위: 중복·빠짐·중간·0개·앞섬] [통합3] ✔
   ├─필수 표 0행 ────────────────── [통합2 permission_matrix] ✔
   ├─예외 흡수 ──────────────────── [단위] ✔
   └─이미지 앞섬 + 새 확인 표 ───── ✘ 설계 공백(F2, 아키텍처 절)
 RESTORE_CHECK_TABLES 실재·중복 ─── [단위 목록 1·2] ✔
 deploy.sh 5번째 Job ────────────── [deploy-sh 4→5 + restore 단언] ✔

슬라이스 B (04.4-03 · 04.4-04)
04.4-03                                   테스트                                  상태
guard/공통 준비(이름·env·run id·prod 확인) ─ 가드1·2·확인1 (rehearse+finalize)      ✓
rehearse 행복 경로(기준선→…→EXIT 정리)   ─ Task1 행복 경로 + 공통 불변식           ✓
고아 점검(있음/조회 실패)                 ─ 고아1·2                                  ✓
복원 실패(백업 없음/create/restore/users) ─ 실패1·2, 폴링 소진                       ✓
복원 완료 증거(gcloud 조기 반환)          ─ 없음                                     ✗ (1 아키텍처 P2)
정리(부재=성공한 목록만, 403/503/auth)    ─ 정리1~5                                  ✓
중단(kill) 뒤 finalize                    ─ finalize1                                ✓
판정 표(손 상태 파일)                     ─ ⓐ~ⓗ, ⓔ′                                  ✓
한 번 기록·응답 잃음·저장된 결과 권위     ─ finalize2~6                              ✓
마감(소진·기록 느림·0 거부·느린 삭제)     ─ 마감1~4 + UNBOUNDED/NONPOSITIVE 불변식   ✓
배포 겹침 digest(ⓐ~ⓕ, ⓓ′)                 ─ 배포 겹침, 이미지 확인 불가              ✓
겹친 실패 우선순위                        ─ ⓐ~ⓓ                                      ✓
워크플로 YAML(트리거·첫 단계·WIF·그룹·합) ─ 워크플로1~5                              ✓
문서(OPERATIONS §14·RESTORE 토큰·순서)    ─ 문서1·2 (docs-limits)                    ✓ 단, ≤270 게이트 모순(4 성능 아래 BLOCKING)
RESTORE.md 변경이 CI를 도는가             ─ 없음                                     ✗ (아래 P2)

04.4-04
personLoginStatus 0/1/2/보관/필드 부재    ─ 판정1~6 (unit)                           ✓
세션 훅 경로 무관·null·설정 무관·DB 미접촉 ─ first-login-session-hook (unit)          ✓
실제 로그인 훅 엣지(실패·잠김·보관·보존)  ─ first-login-hook (integration)           ✓
DTO 두 필드·필드 부재·표시 흐름           ─ people-login-status 1~4                  ✓
목록 조회 수 불변                         ─ people.test.ts #65 + 기준값 한 줄        ✓ (SYSTEM_VIEWER도 visible 조회를 탄다 — visible.ts:17-22)
백필 규칙·업그레이드·멱등·표지            ─ first-login-upgrade 1·2, 표지1           ✓
lint:sql(머리 줄)                          ─ verify에 있음 — 계획대로면 빨강          ✗ (2 코드 품질 P1)
getPerson 상세 +2 조회                     ─ 의도적 미검증(가정 6)                    — 수용

슬라이스 C (04.4-05 · 04.4-06)
CODE PATHS                                              USER FLOWS
[+] system-status/page.tsx (05 T1: className만)          [+] 관리자가 상태 화면을 연다
  ├── 기록 없음 문구       [★★★ E2E] 05 T1 serial #1       ├── [★★★] 성공·실패·겹친 실패 문구 — system-status.spec
  ├── 성공 + URL → 링크 없음 [★★★ E2E] 05 T1                ├── [★★ ] 폰 375 링크 44×44 — nested test.use
  ├── 실패 + URL → .runLink [★★★ E2E] 색·밑줄·굵기·target   └── [GAP] axe(a11y.spec:64)가 05 verify에 없음 → T1
  ├── NULL 실패 → 링크 없음 [★★ UNIT] 04.4-01 순수 함수(DB CHECK)
  ├── unavailable → 확인 불가 [★★ UNIT] 04.4-01
  └── .backupId nowrap·tnum [★★ E2E]
[+] people/page.tsx (05 T2)                              [+] 관리자가 사람 목록을 본다
  ├── archived → 보관됨     [★★ E2E] people.spec           ├── [★★★] 발급 직후 두 배지 PC 한 줄 / 폰 세로
  ├── badges 2 → sep 포함   [★★★ E2E] PC·375·360·640@2     ├── [GAP] 로그인 뒤 배지 1개(임시만) 정확 문구 → T2
  ├── badges 1 → sep 없음   [GAP] 암묵적일 뿐 → T2         ├── [GAP] 비번 변경 뒤 0개 `—` — 임시 감사만 → T2
  ├── badges 0 → `—`       [GAP] 06 임시 감사만(커밋 안 됨)  ├── [★★★] 360 긴 이름·640@2 넘침 없음·44×44
  ├── th scope=row + 유일 id [★★★ E2E] DOM 속성             └── [GAP] 기존 스펙 회귀(single-column:108 등) → T1
  ├── 접힌 줄 headers·sr-only·aria-hidden 없음 [★★★ E2E]
  ├── PC 접힌 줄 숨김(ariaSnapshot 1회) [★★ E2E]
  └── .table thead th 축소 → 계급 화면 불변 [★★★ E2E] (CRITICAL 회귀, 계획에 있음)
[+] SYSTEM.md/DECISIONS.md (05 T3)  [★★ UNIT] design-system-docs.test (정규식 한정)
[+] 06 T1 병합·재생성                [★★★] verify 2·3(idx·문장·No changes·빈 DB·가드) + 통합 5종 + E2E 3종
[+] 06 T2 금지 범위                  [GAP] 공허한 통과 → C1
[+] 06 T3 실제 리허설                 [★ MANUAL] SUMMARY grep(자기 증언) + A2 오판 위험

COVERAGE: 코드 경로 15/19 · 사용자 흐름 6/10  |  GAPS: 6 (E2E 4, 게이트 1, 수동 1)
Legend: ★★★ 동작+엣지+오류 · ★★ 정상 경로 · ★ 존재 확인
```

| ID | 심각도 | 판정 | file:line | 설명 |
|---|---|---|---|---|
| E-05 | P2 | 참고 | 04.4-01-PLAN.md:244-246,251 | 잠금/풀고갈 테스트가 빨간 단계에서 타임아웃되면 finally 미실행 → 잠금·연결 안 풀려 통합 스위트 전체 걸림 — **Fable 기각**(아래 §「기각」) |
| E-06 | P3 | 참고 | 04.4-01-PLAN.md:177,182-183,243 | CLI 자식프로세스 2회 실행하는 통합7·8이 vitest 기본 5초에 걸리기 쉬움 |
| E-14 | P2 | 참고(크로스모델) | 04.4-03-PLAN.md:291,305 | RESTORE.md 단위테스트 추가하지만 ci.yml/deploy.yml의 `!docs/**` 재포함 목록에 없어 단독 변경 PR은 CI 미실행(Claude-B + Codex-B#1 일치) |
| E-15 | P3 | 참고 | 04.4-03-PLAN.md:233,241 | 가짜 프로세스 다발 시나리오가 vitest 기본 5초 타임아웃 넘길 수 있음 |
| E-17 | P2 | 참고 | 04.4-04-PLAN.md:203 | 보관/잠김 첫로그인 미기록 보장이 이메일 로그인 경로에만 검증됨(Google 콜백 미적용, 현재 이메일전용 배포라 차단사유 아님) |
| E-26 | P2 | 참고(CRITICAL 회귀) | 04.4-05-PLAN.md:217 (T1) | Task2 verify가 자기 E2E 2개만 돌려 DOM변경이 기존 스펙(single-column 등)을 깨도 06 전체게이트에서야 발견 |
| E-27 | P2 | 참고 | 04.4-05-PLAN.md:190 (T2) | 배지 1개/0개 렌더 분기가 커밋 테스트에 없음(06 임시 감사에만 있고 삭제됨) |
| E-29 | P3 | 참고(재현 안 됨) | 04.4-05-PLAN.md:203 / 04.4-06-PLAN.md:165 | 두 배지 PC 한줄 경계값 테스트 부족(구분자 줄바꿈 가능성, 06 PC감사는 1280px만 검사) |

### 기각

**01-PLAN:244-251 잠금 대기·풀 고갈 테스트가 매달린다 — 기각.** `vitest.config.ts`에 `testTimeout` 지정이 없으므로 기본 5000ms가 적용된다. 구현이 시간 제한을 지키지 못하면 테스트가 5초에 **보이는 실패**로 끝나지 영원히 매달리지 않는다. 풀 고갈 테스트는 `finally`에서 전부 `release()`(01:253)하므로 다음 테스트로 누수도 없다. 플랜 수정 불필요.

## 4. 성능

| ID | 심각도 | 판정 | file:line | 설명 |
|---|---|---|---|---|
| E-16 | P1 | **BLOCKING** | 04.4-03-PLAN.md:134,321,368 | OPERATIONS.md 줄예산 전제가 낡음(전제 248줄, 실측 263줄) — §14 20줄 + 파일 270줄 동시 불가(여유 7줄뿐, 263+(빈줄1+머리글1+항목5)=270이 상한과 정확히 같음). §14 ≤ 20줄과 파일 ≤ 270줄은 §14 ≤ 7줄일 때만 양립하는 수치 모순(Fable #1 실측) |

---

## Outside Voice (Codex, gpt-6-astra, read-only)

- **첫 실행**: 단일 실행, 300초 타임아웃 — 슬라이스 미분할로 커버리지 공백. 재실행은 슬라이스별 3갈래로 분할.
- **슬라이스 A(04.4-01·02)**: exit 0, NO BLOCKING ISSUES. 참고 2건 — E-02(cli-bundle.test.ts가 `--command=node,...` 형식 놓침), E-07(번들 스모크 env 오류 거짓양성).
- **슬라이스 B(04.4-03·04)**: exit 0, NO BLOCKING ISSUES. 참고 2건 — E-14(RESTORE.md CI 재포함 누락), E-17(Google 콜백 미검증).
- **슬라이스 C(04.4-05·06)**: exit 0, NO BLOCKING ISSUES. 참고 2건 — E-28(erp DB migrate DATABASE_URL 미지정), E-29(700px 배지 경계 미검사).
- 참고 합계 6건, BLOCKING 0건 — Claude 1차 분류와 별도 병렬 실행.

**CROSS-MODEL 일치 2건**: E-02(Claude-A + Codex-A#1), E-14(Claude-B + Codex-B#1) — 두 모델이 독립적으로 같은 결함을 지적.

---

## 5. Critical failure-mode gaps (조용한 실패로 남는 것, 4건)

세 슬라이스 실패모드 표를 종합하면 "조용한 실패"(사용자에게 실패로도 성공으로도 안 보이거나 성공처럼 보이는 실패)로 남는 것은 BLOCKING 4건뿐이다. 나머지는 전부 보이는 실패(종료코드·화면 문구·다음 실행 고아점검)로 처리된다.

1. **OPERATIONS.md 줄예산 수치 모순(E-16)**: §14 작성 시점에 실행자가 추측으로 풀어야 하고, 잘못 추측하면 03:321 verify가 반드시 빨간다.
2. **마이그레이션 lint:sql 헤더 부재(E-10)**: 04 Task1과 06 Task1 모두, 플랜대로 하면 verify가 반드시 빨갛다(04) 또는 두 verify가 서로 모순돼 어느 쪽을 택해도 빨갛다(06).
3. **재생성-`/ship` 사이 main 진행(E-18)**: `/ship`의 "단순 충돌은 자동 해결"이 `_journal.json` 항목 추가를 순서 문제로 보고 자동 해결할 수 있어, 스테이징 배포가 마이그레이션을 조용히 건너뛴다 → 500 에러로만 간접 드러남.
4. **빈 `$PHASE_BASE`로 게이트 공허 통과(E-20)**: `<automated>` 새 셸에서 `PHASE_BASE`가 비어 `HEAD..HEAD`가 되고, git은 실패하지 않으므로 fails_when도 걸리지 않는다 — 금지범위 게이트가 항상 초록. 사람이 눈으로 diff를 보지 않으면 안 드러난다.

준-조용 항목(참고 유지): E-01(배포 직후 새 확인표), E-08(gcloud 조기반환 시 "실패"로는 보이지만 원인이 거짓).

---

## 이미 있는 것

CLI 규약(`account-cli.ts` UsageError·parseArgs·종료코드) · 확인불가 흡수(`system-status/index.ts:61-77`) · `StatusTag muted/text` · 표비우기 자동포함(`setup.ts:11-14`) · 별도 pg Pool·`check()`·identity seq 선례 · squawk 설정 · `ValidationError` · `@types/pg` 풀 필드 · `RESTORE_CHECK_TABLES` 12표 실재+시드 일치 · esbuild 지연초기화 실측(가정5 성립) · `account.yml` poll_logs·폴백 · `deploy.sh` ensure_sql_instance/db_users · fakebin gcloud 규약 · `setUserArchived` 조건부 UPDATE · 일회용 DB 픽스처 · #65 조회수 테스트 · `.detailLink`/칸접기/`.sr-only`/토큰 전부 · E2E 도메인 직접호출 선례 · `.table thead th`·`.num` 우선순위(정렬 불변) · `StatusTag nowrap` · `KvList dt/dd` 직계 · `db:generate`는 DB 없이 동작.

## NOT in scope (범위 밖)

임시인스턴스 IAM 보정(03 몫) · `run_url` 위조 가능성(신뢰경계 안, Phase8 판단) · 04.2/04.4 병합순서(조정자 몫) · 04.4-01/02/05/06 본문(단 E-10 lint:sql 헤더 문제는 01·06에도 전달됨) · IAM 경계·배포-리허설 그룹분리(수용·사용자결정) · 실제 GCP 실행(06 Task3) · 링크스타일 8번째 복제 공용화(별도과제) · 기존 결함 `person.id` 투영누락(04.4 무관) · 폰 접힌줄 선(시스템 선택).

## 병렬화 전략

- **05**: Task3(문서·단위테스트만, 파일 안 겹침)은 Task1·2와 병렬 가능. Task1·2는 둘 다 `erp_test` E2E를 쓰고 global-setup이 스키마를 다시 만들어 **직렬**(05:113과 일치).
- **06**: Task1 → Task2 → (사람의 Post-build) → Task3은 완전 직렬. 로컬 DB를 다시 만들어 다른 플랜과 동시 실행 불가(06:88과 일치).
- **슬라이스 간 의존**: 05는 01(문구·`recordRestoreRehearsal`·`runKey` 모양 `^\d+-\d+$`, URL 정규식)과 04(`personLoginStatus`·첫 로그인 훅)의 인터페이스를 씀. 05 예시 값(`9001-1`, `https://github.com/plant8/erp/actions/runs/123456`)은 01-PLAN:253 검증을 통과한다.

---

## Implementation Tasks

다음 세션에 `/gsd-plan-phase` 리비전 + 플랜 체커로 반영. 지금 세션에서는 적용하지 않는다.

**BLOCKING 4건(Fable 최소 수정 원문)**

1. **04.4-03-PLAN.md:134,321,368 (E-16)** — 03:134를 「지금 263줄 … §14를 머리글 포함 **12줄 이하**, 파일 전체 **276줄 이하**(04.2·04.3·Phase 8 몫 24줄)」로, 03:321을 `-le 276`으로, 03:368을 「≤ 276」으로 고친다. VALIDATION·CONTEXT:46·RESEARCH:36,286의 248도 263으로 맞춘다.
2. **04.4-04-PLAN.md:199 + 04.4-06-PLAN.md:125,134 (E-10)** — (1) 04:199 ③에 「생성 파일 맨 앞에 0008·0010과 같은 `SET LOCAL lock_timeout = '1s';` · `SET LOCAL statement_timeout = '5s';` · `--> statement-breakpoint` 세 줄을 붙인다(파일 이름·journal·스냅숏은 그대로)」를 넣고 04:219 수용 기준에 「그 SQL 첫 두 문장이 `SET LOCAL`」을 더한다. (2) 06:125 ④에 「맨 앞에 같은 머리 줄 세 줄을 붙이고 끝에 백필 블록을 붙인다」로 고친다. (3) 06:134 확인 (b)의 `every`를 `stmts.every(s=>/^SET LOCAL/i.test(s)||/restore_rehearsals|first_login_at/.test(s))`로 바꾸고 06:135 fails_when에 「`SET LOCAL` 머리 줄은 예외」를 적는다.
3. **04.4-06-PLAN.md:206,92 (E-18)** — 06:206 instructions와 06 Task2 Post-build 문단(06:92)에 한 줄 — 「`/ship` 직전 `git fetch origin main && git diff --quiet HEAD...origin/main -- db/migrations`. 참이 아니면 `/ship`이 충돌을 풀게 두지 말고 Task1 ①~⑥(병합 → 지우기 → `db:generate` 한 번 → 머리 줄·백필 재부착 → 확인 넷)을 다시 한 뒤 `/ship`」.
4. **04.4-06-PLAN.md:184 (E-20)** — 06:184에서 `"$PHASE_BASE"..HEAD`를 지우고 `HEAD --not origin/main`만 쓴다(병합 뒤에도 페이즈 자신의 커밋만 남는다; 현재 브랜치는 STATE.md·package.json·pnpm-lock.yaml 변경 0이라 거짓 빨강 없음 — 실측). 06:185 fails_when의 「`PHASE_BASE` 미설정」 문구를 지운다. 04·05의 `$PLAN_BASE` 명령은 앞에 `: "${PLAN_BASE:?PLAN_BASE unset}" &&`를 붙이거나 SUMMARY에 적은 해시를 그대로 쓴다(04:135·05:112 「PLAN_BASE로 적는다」에 「이 값을 검증 명령에 리터럴로 넣는다」를 더한다).

**권장 P2 참고 fixes(다음 세션 판단)**

- E-14: ci.yml·deploy.yml 재포함 목록 끝에 `- "docs/RESTORE.md"`, ci-guard WR-09 패턴 배열 끝에 같은 줄 추가(3줄 규모, `test/unit/deploy/workflows.test.ts`와 함께).
- E-02: cli-bundle.test.ts에 outputs 포함 단언 추가 또는 key_link를 번들 스모크로 수정.
- E-07: 번들 스모크에 유효한 테스트 env 변수 명시 + 대상가드 전용 식별 문구 단언 추가.
- E-08: 복원 뒤 operations wait 한 번 거친 뒤 RUNNABLE 판정.
- E-01: 목록 항목에 생성 마이그레이션 tag를 두고 적용 접두 밖이면 건너뜀 처리, 최소는 OPERATIONS/주석 한 줄.
- E-17: Google 전환 전 실제 콜백 경로로 보관/잠김 사례 검증.
- E-26: 05 Task1/2 verify에 a11y·single-column·detail-link·mobile 스펙 추가.
- E-27: 관리자 자신 행(임시비번 1개)에 상태칸+badgeSep 0개 단언 추가.
- E-28: 적용 명령에도 로컬 erp 연결(DATABASE_URL) 명시.
- E-29: 700px에서도 배지 위치·표 넘침 검사.

---

## Decision ledger

| # | 결정 | State | 근거/Actual answer | Accepted scope |
|---|---|---|---|---|
| R1 | E-16 OPERATIONS.md 줄예산 재설정(§14 ≤ 12줄, 파일 ≤ 276줄) | approved | 프로젝트 지침 §3(막는 문제는 파일:줄 근거로 반영, 판단은 Fable) 자동 결정 | Fable 최소 수정 원문 그대로(03:134·321·368 + VALIDATION/CONTEXT/RESEARCH 248→263) |
| R2 | E-10 마이그레이션 `SET LOCAL` 머리 줄 추가 + 06 확인(b) 정규식 예외 | approved | 프로젝트 지침 §3 자동 결정 (squawk 실측 exit 1→0 확인) | Fable 최소 수정 원문 그대로(04:199·219 + 06:125·134·135) |
| R3 | E-18 `/ship` 직전 main diff 확인 + 필요시 Task1 재실행 | approved | 프로젝트 지침 §3 자동 결정 (drizzle-orm dialect.js:62 조용한 건너뜀 코드 실측) | Fable 최소 수정 원문 그대로(06:206·92) |
| R4 | E-20 `$PHASE_BASE` 제거, `HEAD --not origin/main`만 사용 + `$PLAN_BASE` 가드 | approved | 프로젝트 지침 §3 자동 결정 (실측: exit=0 len=0) | Fable 최소 수정 원문 그대로(06:184·185 + 04:135·05:112) |
| R5 | 참고 항목(E-02·07·08·01·17·26·27·28·29 등) 반영 여부 | pending-다음 세션 판단 | 플래너가 다음 `/gsd-plan-phase` 리비전에서 반영 여부 결정 | 위 "권장 P2 참고 fixes" 목록 |

**Approval readiness: PASS (R1-R4, 프로젝트 지침 자동 결정)**

---

## Unresolved decisions

없음 — 사용자 확인이 필요한 항목 없음. BLOCKING 4건은 모두 Fable이 실측(squawk 실행, git 실측, drizzle-orm 코드 확인)으로 판단했고 최소 수정 문구까지 확정했다.

---

## Completion summary

- Step 0: 복잡도 게이트 발동 → 자동 결정(원래 구성 유지), mode FULL_REVIEW
- Architecture: 5건 (E-01, E-08, E-09, E-18, E-19)
- Code Quality: 15건 (E-02, E-03, E-04, E-07, E-10, E-11, E-12, E-13, E-20, E-21, E-22, E-23, E-24, E-25, E-28)
- Test gaps: 8건 (E-05, E-06, E-14, E-15, E-17, E-26, E-27, E-29)
- Performance: 1건 (E-16)
- NOT in scope: 작성됨 (9항목)
- What already exists: 작성됨 (18항목)
- TODOS.md: 0
- Failure modes: 4 critical gaps (E-10, E-16, E-18, E-20)
- Unresolved: 0
- Outside voice: codex 완료 (3 슬라이스; 첫 실행 300초 타임아웃 후 재분할)
- Parallelization lanes: 통합 파일 §7 기준 (05 Task3 병렬, 06 완전 직렬, 슬라이스간 01→05, 04→05 의존)
- Lake Score: N/A

---

## Suppressed findings (confidence ≤ 4, 재론 안 함)

- (4/10,A) `process.exitCode`가 vitest fork워커 종료코드 오염 가능성 — 선례 없어 미확인
- (4/10,A) 스테이징/prod `created_at`이 journal과 다를 가능성 — 06 Task3 실측이 드러냄
- (3/10,A) 02 통합테스트가 로컬 이력=journal 전제 — A4 전제 성립하면 문제없음
- (3/10,B) 백필 `now()` vs `new Date()` 시간대 — Cloud SQL UTC라 숨김
- (3/10,B) RESTORE.md 1(b)(c) 순서 — 지금 Scheduler 작업 없어 숨김, Phase7 재검토
- (4/10,B) gcloud 필터 대소문자/부분일치 — 이름 고유해 무피해
- (4/10,B) 상태파일 STARTED_AT 없을 때 처리 미정 — rehearse가 첫줄에 씀
- (4/10,C) 360px 칸 합계 332px 이내 추정(실측 전)
- (3/10,C) "상세"·보관버튼 사이 줄바꿈 불확실 — 넘침 단언이 잡아냄
- (4/10,C) 개수낱말 정규식이 다른 개수표현 못 잡음
- (4/10,C) 머리주석 이어쓰면 삭제줄2로 실패 — 새 블록 필요

---

`~/.claude/skills/gstack/bin/gstack-review-read` 실행 결과: `NO_REVIEWS`(이 브랜치·이 리뷰 파일에 대한 선행 GSTACK REVIEW REPORT 항목 없음) — 이번이 이 브랜치의 첫 `/plan-eng-review` 항목이다.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review `/plan-ceo-review` | 소수점 페이즈 면제(#68) | 04.4는 소수점 페이즈라 CEO 리뷰 대상 아님 | 0 | SKIPPED | — |
| Outside Review codex (plan-eng-review outside voice) | eng review와 동시 실행 | 독립 코드 대조, 첫 실행 타임아웃 재분할 | 1 | done | 0 blocking, 6 참고 |
| Eng Review `/plan-eng-review` | 04.4-01~06 플랜 최초 리뷰 | 6개 PLAN.md, 8파일 이상 복잡도 게이트 | 1 | ISSUES OPEN | 29 issues, 4 critical gaps |
| Design Review | 다음 세션 예정 | 04.4는 UI 변경(05) 포함 — 화면 검증은 실행 뒤 | 0 | 다음 세션 예정 | — |
| DX Review | 해당 없음 | 이 페이즈는 개발자 경험 변경 없음 | 0 | 해당 없음 | — |

**OUTSIDE COVERAGE:** Codex 3슬라이스(A/B/C) 전부 exit 0 완료, NO BLOCKING ISSUES, 참고 6건(E-02, E-07, E-14, E-17, E-28, E-29). 첫 단일 실행은 300초 타임아웃으로 커버리지 공백이 있었으나 재분할 실행으로 해소됨.
**CROSS-MODEL:** E-02(Claude-A + Codex-A#1), E-14(Claude-B + Codex-B#1) — 두 모델 독립 일치, 판정 참고 유지(이 페이즈 실행 자체를 막지 않음).
**VERDICT:** ENG ISSUES OPEN — 막는 문제 4건(E-10, E-16, E-18, E-20)을 다음 세션에서 반영 후 /plan-design-review. eng review required.

NO UNRESOLVED DECISIONS
