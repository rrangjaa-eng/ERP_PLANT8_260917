# Phase 5 — `/plan-eng-review` 보고서

- 일시: 2026-09-26 (UTC) · 브랜치 `claude/vibrant-albattani-c4m0tj` @ 9fd3887(CEO 지적 반영 Round 1 뒤) · PR #89
- 대상: `05-01`~`05-15-PLAN.md`(각 `## Review Dispositions Ledger` 포함), `05-REVIEWS.md`, `ceo-review.md`, `05-RESEARCH.md`, `05-VALIDATION.md`, 관련 실제 코드(`domain/projects/status*.ts`, `domain/settings/registry.ts`, `repositories/settings.ts`, `eslint.config.mjs`, `docs/ARCHITECTURE.md` §4-6 · §4-8)
- 교차 검토: **Codex 대신 Opus 독립 검토**(Codex는 사용자 지시로 2026-09-29까지 사용 금지). **한도가 풀리면 Codex 재확인 필요**
- 결정 방식: 코디네이터 공통 규칙(2026-09-26 14:53) — 제품 범위·기본값·정책·되돌리기 어려운 설계는 「[사용자 결정 요청]」(issuecomment-5847459788: E1 · E2), 나머지 엔지니어링 수리는 추천안으로 기록하고 반영 세션이 `/gsd-plan-phase 5 --reviews`로 넣는다. 이 세션은 플랜을 고치지 않는다
- 기존 대기였던 `expenses.evidence_void` 기본 부여는 A(시드에서 부여하지 않음)로 결정됨(15:18Z) — 이 검토는 그 선택에 의존하지 않는다

## 결론

| 항목 | 값 |
|---|---|
| Scope Challenge | 범위 그대로(FULL_REVIEW). 구조도 원래 배치 유지(아래 S1) |
| 막는 문제(P1) | **2** — B1 세율 스냅숏 FK ↔ 예정 세율 취소, B2 증빙 추가·삭제가 지출결의 행을 잠그지 않음 |
| 반영 권장(P2) | 6 — M1(=사용자 결정 E2) · M2 · M3 · M4 · M5 · A1 |
| 사소한 것(P3) | 13 |
| 사용자 결정 요청 | 2 — E1(B1의 취소 정책), E2(M1의 버킷 청소 방식) |
| 반영 필요 여부 | **필요** — P1 둘은 실행 전 필수. B1은 E1 답에 따라 수리 모양이 정해진다 |
| CEO 지적 반영 확인 | F1~F9 · U1 · U2 모두 플랜에 있음. F1(브랜드 타입 + projectId 결속)은 권한 우회 구멍 없음으로 판단. F9는 새 위험 M1을 만들었다 |

## Step 0: Scope Challenge

**A. 평가**
- 이미 있는 것: `applyTaxRule` · `document_counters` · `domain/rules/gate` · `domain/permissions` · 설정 레지스트리 · `teamAtDate` · 행동 로그 · `lib/log.ts` · `lockProjectForWrite` · `test/integration/lock-race.ts` · `tx-safety.test.ts`(풀 2 증명 틀) — 플랜이 재사용한다(tx-safety만 빠짐 → M3)
- 최소 변경: 요구사항 8개 · ROADMAP 기준 1~7의 직접 이행. 미룰 수 있는 것 없음
- 복잡도: 파일 수십 개 · 새 도메인 모듈 셋(`expenses` · `evidence` · `settlements`) → 복잡도 문턱(8파일 / 2서비스) 초과
- 검색: 새 패턴은 GCS V4 서명(새 패키지 없이 `google-auth-library`) · 버킷 수명 주기 · 브랜드 타입. 웹 검색 도구 없음 — 모델 지식 기준. [Layer 1] 수명 주기 + 객체 보존 표식은 GCS 표준 기능이지만, "접두어 전체 삭제 + 예외 표식"은 실패 시 기본값이 삭제라 보수적 설계가 아니다(M1)
- TODOS: `TODOS.md`에 Phase 5를 막는 항목 없음. U2는 `.planning/todos/pending/2026-09-26-phase-6-rejected-expense-close-path.md`
- 배포 산출물: 증빙 버킷 부트스트랩 · 배포 스크립트(05-12) — CI/CD 경로 있음

**B. 복잡도 선택(자동 결정 — 엔지니어링 구조, 제품 결정 아님)**
- S1 기능 삭감 제안: 없음(요구사항 전부 ROADMAP 기준의 직접 이행)
- S2 구조: **원래 배치 유지**. plan-checker 2회차에서 이미 05-14 · 05-15로 쪼갰고, 더 작은 배치는 같은 파일(`domain/expenses/index.ts` · 폼 · 견적 줄 표)을 여러 플랜에 흩어 충돌만 늘린다
- 범위 기록: `feature answers: 삭감 없음; structure: A(원래 배치); accepted scope: 15플랜 그대로; pending remedies: B1 · B2 · M1~M5 · A1 · P3`

**C. 발견**: Scope 자체의 문제는 없음. 아래 섹션 발견으로 넘긴다.

## 발견 (파일:줄)

### P1 — 실행 전 반드시

**B1. 세율 스냅숏 외래 키가 "예정 세율 취소"를 영구히 막는다** — `05-03-PLAN.md:184`(`tax_rate_setting_id` FK → `settings_historized`), `05-03-PLAN.md:188`(`pickTaxDates` 지급 쪽 = 지급 예정일, 미래일 수 있음), 코드 `domain/settings/registry.ts:182-183` · `repositories/settings.ts:88-96`(미래 이력 행 물리 삭제)
- 실패: 지급 예정일이 미래인 지출결의가 제출되면 그 날짜의 예정 세율 행을 FK가 잡는다. 관리자가 그 예정 세율을 취소하면 23503이 문구 없는 오류로 떨어지고 취소가 영원히 안 된다. 데이터가 쌓인 뒤에는 FK 제거 비용이 생긴다
- 수리: **사용자 결정 E1 대기.** 추천 A = 스냅숏 값(이력 id · 적용일 · 세율)을 FK 없이 저장, 취소 허용, 문서에는 기존 `세율 바뀜`. B = 참조 중이면 취소 거부 + 문구. 어느 쪽이든 통합 사례 1(예정 세율 참조 문서 제출 → 취소 시도 → A: 성공 + drift / B: 문구 거부)

**B2. 증빙 추가·삭제가 지출결의 행을 잠그지 않는다(게이트 ⑧ 경합)** — `05-04-PLAN.md:173`(`completeEvidenceUpload`는 "주인 상태 tx 재확인"만) · `05-04-PLAN.md:174`(`removeEvidence`는 `markRemoved`만) vs `05-09-PLAN.md:122`("증빙 추가·삭제는 지출결의 행 → 결재 인스턴스" 잠금 순서를 이미 전제)
- 실패: 제출 tx가 행 잠금 아래에서 살아 있는 파일 1개를 세는 사이 다른 탭의 삭제가 잠금 없이 커밋되면 증빙 0개 문서가 제출된다(기준 3 위반). 결재 중 서로 다른 파일 둘을 동시에 지우면 둘 다 "마지막 아님"으로 통과해 0개가 된다
- 수리(추천): 05-04 두 함수의 tx 첫 단계에 `lockExpenseForUpdate`(05-03이 만드는 행 잠금) → 그 뒤 살아 있는 파일 수 재확인. 05-14에 `afterLock` 두 순서 사례: 제출↔삭제, 삭제↔삭제(각각 결과 증빙 ≥ 1)

### P2 — 같은 반영 세션에서

**M1. 수명 주기 규칙이 `evidence/` 전체를 7일 뒤 지운다(CEO F9의 부작용)** — `05-12-PLAN.md:34 · 156`, `05-04-PLAN.md:173`(`retain` = temporaryHold)
- 완료 증빙은 보존 표식 하나로만 지켜진다. 표식을 거치지 않는 경로(Phase 8 이관, 버킷 복사·복원 — 표식은 복사되지 않음, 표식을 푸는 코드)가 생기면 법정 보관 대상 세무 증빙이 영구 삭제된다. 플랜 스스로 이 상호작용을 [ASSUMED]로 표시했다
- 수리: **사용자 결정 E2 대기.** 추천 A = 업로드는 `incoming/`에 받고 완료 통보 때 `evidence/`로 이동, 7일 규칙은 `incoming/`에만

**M2. 목록 페이지 나눔 × 그룹 정렬 계약이 비어 있다** — `05-08-PLAN.md:147 · 183`
- 그룹 순위(상태 파생 · 날짜 구간)와 그룹별 정렬 키를 SQL `ORDER BY`로 할지 적혀 있지 않다. 50건을 자른 뒤 JS에서 묶으면 쪽마다 순서가 틀리고, 단위 사례와 "51건" 통합은 그룹 하나라 못 잡는다
- 수리: `listExpenses` SQL에 `ORDER BY group_rank, <그룹별 CASE 키>, id` 계약 명시 + 그룹 둘 이상이 쪽 경계를 넘는 통합 사례 1

**M3. 새 트랜잭션 경로에 풀 압력 증명이 없다** — ARCHITECTURE §4-8(6)은 `tx-safety.test.ts`(풀 2)로 증명하라는데 어느 플랜도 이 파일을 건드리지 않는다(grep 0). "tx 안 전역 풀 읽기 금지"는 전부 `verification: judgment`
- 실패: 훅 달린 승인(tx 안 `changeProjectStatus` → `loadProjectForGate`), 증빙 추가 + `bumpInstanceVersion`, 정산 기안에서 풀 읽기가 섞이면 운영에서만 5초 멈춤 뒤 실패
- 수리: 05-01(훅 승인) · 05-04(증빙 추가) · 05-11(정산 최종 승인)에 `tx-safety.test.ts` 사례 하나씩

**M4. 결재 시트 `ui/` 이동이 계층 규칙에 걸릴 수 있다** — `05-01-PLAN.md:303`("이동만"), `eslint.config.mjs:72`(ui 계층은 `ui` · `lib`만 import)
- 04.1 시트가 결재 액션 · domain DTO 타입을 import하면 Task 3에서 lint가 깨지고 계획 밖 리팩터가 생긴다(04.1 코드가 main에 없어 확인 불가)
- 수리: "액션은 콜백 prop, 표시 타입은 `ui/approval-sheet` 안에 정의" 명시 + 이동 전 import grep 단계(Task 3 ⓪)

**M5. 잠금 순서 예외가 ARCHITECTURE에 남지 않는다** — 05-11(정산 최종 승인: 인스턴스 → 프로젝트 순 잠금)이 §4-8(2) "첫 단계에서 프로젝트 행 잠금"과 다르다. SUMMARY에만 기록
- 수리: 05-13의 ARCHITECTURE 절 갱신에 §4-8 예외 한 줄(정산 결재 경로의 잠금 순서와 교착이 없는 이유). 05-03의 counter period 예외(§4-6)도 같은 절에

**A1. 브랜드 타입은 `as` 캐스트로 위조된다** — `05-11-PLAN.md:159-160`
- 타입 수준 보호라 `x as SettlementApprovalAuthority`가 있으면 결재 경로 권한 판정을 건너뛴다. 지금 acceptance grep은 생성 함수 export만 본다
- 수리: `domain/settlements` 밖에서 `as SettlementApprovalAuthority` 0건 grep을 acceptance에 추가(또는 eslint `no-restricted-syntax`)

### P3 — 사소한 것
1. `05-01-PLAN.md:292` 테스트 입력 `fxRate: 1`(숫자) vs `:299` 타입 `fxRate: string` 모순 — `domain/money` Money 모양으로 통일
2. `05-01-PLAN.md:239` · `05-11-PLAN.md:172` "종류 이름 리터럴 0건" grep이 `leave|expense|settlement`만 본다 — 05-03에서 정한 실제 kind 값으로 패턴을 만들 것(다르면 공허 통과)
3. E4 충돌 문구 `증빙을 더함`이 결재 중 **삭제**(`05-09-PLAN.md:44`)에도 나온다 — 문구만 추가/삭제로 가르거나 중립 문구
4. `05-11` 훅의 "지금 차수 마지막 단계 기록"이 대표 폴백 행(`is_fallback`)을 포함하는지 명시 + 4단 끔 · 담당 없음 설정 사례 1(F1 교착이 되살아날 수 있는 경로)
5. `05-11-PLAN.md:160` `domain/projects/status.ts` → `domain/settlements` `import type`은 하위 도메인이 상위를 아는 역의존 — 브랜드를 projects 쪽에 선언하고 생성만 settlements에서 하는 배치 검토
6. `05-08-PLAN.md:146` `visibleExpenseScope.partyInstanceIds` 누적 IN 목록이 대표 · 결재자에게 무한히 커짐 — 결재 단계 표 EXISTS 서브쿼리로
7. `05-09` 다시 제출 · 되돌리기의 `expectedVersion`이 문서 version인지 인스턴스 version인지 섞임 — 인스턴스 version은 tx 잠금 뒤 읽는다고 명시(기안자 본인 증빙 추가로 스스로 충돌 방지)
8. 웨이브 5 `05-05 ∥ 05-12`: 같은 작업 트리면 05-12가 고치는 `lib/gcp/storage.ts`를 05-05의 lint · build · E2E가 반쯤 고친 상태로 읽는다 — 별도 worktree 또는 순차. 05-12의 사람 확인 checkpoint가 웨이브를 멈춘다는 점도 명시
9. `05-VALIDATION.md` Wave 0의 `test/unit/lib/gcp/storage.test.ts`가 실제 플랜의 `storage-local` · `storage-gcs` 이름과 다름 — P-5(`/gsd-validate-phase 5`)에서 맞춤
10. E3 종류별 `approveBlockedReason` 읽기가 04.1 `approvals-inbox-projection`의 조회 횟수 단언(`05-01-PLAN.md:309`)을 흔들 수 있음 — 단언 범위 명시
11. `files.owner_id` FK 없음 · sha256 중복 검사에 UNIQUE 없음 — 동시 같은 파일 업로드 허용 여부 명시(영향 낮음)
12. 되돌리기 토스트 E2E가 토스트 표시 시간에 기댐 — 시간 주입 또는 지속 시간 설정으로 불안정 제거
13. 목록 정렬 키(`submitted_at` · `scheduled_payment_date`)에 인덱스 없음 — 30명 규모라 지금은 불요, 기록만

## 섹션별 검토

### 1. 아키텍처
```
 app/(app)/…  ─actions(authedActionClient)─▶ domain/expenses ─▶ repositories/* (viewer 필수) ─▶ Postgres
                                   │  gate(rules)   │ applyTaxRule   │ document_counters (행 잠금)
                                   │                ▼
                                   │           domain/evidence ─▶ lib/gcp/storage(local | gcs-v4) ─▶ GCS
                                   ▼                                   (B2: 행 잠금 없음, M1: 수명 주기)
                          domain/approvals(04.1 + E1~E7) ─onFinalApprovalInTx─▶ domain/settlements
                                                                        │ SettlementApprovalAuthority(브랜드)
                                                                        ▼
                                                       domain/projects/status.changeProjectStatus
                                                       (trigger=approval: 메뉴·rowScope 생략, projectId 결속)
```
- 경계: 4계층 유지. 새 결합은 settlements → projects(런타임)와 projects → settlements(타입만, P3-5)
- 권한: F1 경로는 브랜드 타입 + tx 안 "마지막 단계 기록 = viewer 승인" + 문서 행 projectId 결속으로 좁다. 액션 스키마에 `trigger` · `approvalAuthority` 없음. 구멍은 `as` 캐스트뿐(A1)
- 동시성: 번호 행 잠금 · version 낙관적 잠금 · `afterLock` 두 순서 — 제출 · 결재 · 정산은 증명됨. 증빙 경로가 빠짐(B2)
- 운영 실패 한 가지씩: GCS 서명 거부(F5 스파이크로 앞당김 — 반영됨), 수명 주기 오삭제(M1), 풀 고갈(M3), 예정 세율 취소 불가(B1)
- 발견: B1, B2, M1, M3, M5, A1

### 2. 코드 품질
- 조직: 모듈 배치가 기존 관례와 맞다. 공유 코드 추출 제안 없음(`sumKrw` · `diffKrw`는 06-02 이름을 미리 가져와 중복을 막는다 — 좋음)
- 플랜 내부 모순: P3-1(fxRate 타입), P3-3(충돌 문구)
- 공허 통과 위험: P3-2(리터럴 grep), A1(캐스트)
- 결합: P3-5
- 발견: M4, A1, P3-1 · 2 · 3 · 5 · 7

### 3. 테스트
테스트 도구: vitest 5(`unit` · `integration` 프로젝트) + Playwright 1.63(`CI=true` 프로덕션 빌드) + axe. 로컬 DB `erp_test` 재생성(`pnpm db:reset:test`).

```
CODE PATHS                                              USER FLOWS
[+] domain/approvals E1~E7 (05-01)                       [+] PM 지출결의 올리기 → 폰 승인 → 최종 승인
  ├── [★★★ TESTED] 회수→재제출·증빙 변경·옛 version 거부      ├── [★★★ TESTED] 05-05 E2E (CI=true)
  ├── [★★★ TESTED] 훅 롤백·등록 거부                       ├── [★★  TESTED] 폰 행 시트·폰 폼 (05-05)
  └── [GAP]         tx-safety 풀 2 (M3)                   └── [★★  TESTED] 되돌리기 토스트 (05-09, 불안정 P3-12)
[+] domain/expenses 생성·제출 (05-03/05-14)              [+] 팀 비용 올리기 (05-07)
  ├── [★★★ TESTED] 두 번 누름·동시 제출 번호·같은 줄 경합      └── [★★  TESTED] 05-07 E2E
  ├── [★★★ TESTED] 회차 상한·금액>0·두 창 저장·already_submitted  [+] 목록·보임 범위 (05-08)
  └── [GAP]         예정 세율 참조 뒤 취소 (B1)               ├── [★★  TESTED] 51건 페이지
[+] domain/evidence (05-04/05-09)                          └── [GAP]         그룹 둘이 쪽 경계 넘음 (M2)
  ├── [★★★ TESTED] 크기·형식·해시·의도 위조·메타 불일치      [+] 정산 결재 (05-11)
  ├── [★★  TESTED] 승인 뒤 추가·무효 처리(U1)                ├── [★★★ TESTED] 최종 승인=완료·D-80 두 순서·F1 3사례
  └── [GAP]         제출↔삭제·삭제↔삭제 경합 (B2)            └── [GAP]         4단 끔·폴백 담당 (P3-4)
[+] lib/gcp gcs-v4 (05-12)                               [+] 결재함·내 차례 (05-10)
  ├── [★★  TESTED] 서명 문자열·retain PATCH (단위)           └── [★★  TESTED] 05-10 E2E 둘
  └── [★   TESTED] staging 스파이크 (사람 확인, F5)
[+] 세금 한 줄 (05-06)  [★★★ TESTED] 규칙 4종·기준일 사슬·세율 바뀜

COVERAGE: 핵심 경로 대부분 ★★ 이상 | GAPS: 5 (B1 · B2 · M2 · M3 · P3-4)
```
- 회귀 규칙: 04.1 결재 테스트는 "사례 추가만, 기존 사례 수정 금지"(05-01 prohibition)와 E7 이동 뒤 04.1 결재 E2E 녹색 — 회귀 계약 있음. Phase 4 견적 표 E2E 회귀(05-15) · Phase 4 완료 테스트를 결재 경로로 옮김(05-11) — 있음
- 불안정: 시간(`todayKst` 주입 있음), 토스트 지속 시간(P3-12)
- 테스트 계획 파일: `~/.gstack/projects/{slug}/…-eng-review-test-plan-*.md`

### 4. 성능
- 인덱스: `expenses`(project · quote_line · drafter · attributed_team), `files`(owner · sha256), `settlement_approvals.project_id` UNIQUE가 새 쿼리를 받친다. 정렬 키 인덱스는 불요(P3-13)
- N+1: 결재함은 `describeDocuments` 일괄. 보임 범위 IN 목록이 커지는 문제(P3-6)
- 풀 5: 동시 제출 6건 증명(05-14). 훅 · 증빙 경로는 M3
- 발견: P3-6, P3-13, M3

## 실패 모드

| 경로 | 운영 실패 | 테스트 | 처리 | 사용자 |
|---|---|---|---|---|
| 예정 세율 취소 | FK 23503 | 없음 | 없음 | 문구 없는 오류 ← B1 |
| 증빙 삭제 ∥ 제출 | 증빙 0개 제출 | 없음 | 없음 | **조용함** ← **critical gap (B2)** |
| 버킷 수명 주기 | 표식 없는 완료 증빙 삭제 | 스파이크(규칙 존재만) | 없음 | **조용함(나중에 발견)** ← **critical gap (M1)** |
| 훅 승인 tx 안 풀 읽기 | 5초 멈춤 | 없음 | 타임아웃 | 실패 한 줄 ← M3 |
| 목록 쪽 경계 | 순서 뒤섞임 | 없음 | 없음 | 틀린 순서 ← M2 |

critical gap 2(B2, M1).

## 병렬화

"한 줄 체인" 웨이브 근거(공유 DB · 같은 파일 연속 수정)가 타당하다. 병렬 레인은 기존 두 쌍(05-01 ∥ 05-02, 05-05 ∥ 05-12)뿐이고, 05-05 ∥ 05-12는 같은 작업 트리면 P3-8 위험 — worktree 분리 또는 순차.

| 단계 | 모듈 | 의존 |
|---|---|---|
| 05-01 | domain/approvals, ui/approval-sheet, db/schema | 04.1 머지 |
| 05-02 | docs/design | — |
| 05-03 → 05-14 → 05-04 | domain/expenses, domain/evidence, lib/gcp, db/schema | 05-01 |
| 05-05 ∥ 05-12 | app/, ui/ ∥ lib/gcp, scripts/ | 05-04 |
| 05-15 → 05-06 → … → 05-11 | app/, domain/expenses, domain/settlements, domain/projects | 차례대로 |
| 05-13 | 전체 | 05-11 · 05-12 |

## 범위 밖
- 반려 · 회수 문서 종결(U2 → Phase 6 TODO) · 고아 객체 정리 쿼리(Phase 6 F8) · 인쇄 · 알림(Phase 7) · 목록 정렬 인덱스(P3-13)

## 이미 있는 것
`applyTaxRule` · `document_counters` · `domain/rules/gate` · `domain/permissions` · `domain/settings/registry`(이력형 · 미래 취소) · `teamAtDate` · 행동 로그 · `lib/log.ts` · `lockProjectForWrite` · `lock-race.ts` · `tx-safety.test.ts` · `import-cycles.test.ts` · `ui/*`

## 반영 작업 (다음 세션 — `/gsd-plan-phase 5 --reviews` Round 2)
- [ ] **T1 (P1, 사람 ~1h / CC ~10분)** 05-03 · 05-06 — 세율 스냅숏 저장 방식 E1 답대로 + 통합 사례 1 (B1)
- [ ] **T2 (P1, ~2h / ~15분)** 05-04 두 함수 tx 첫 단계 `lockExpenseForUpdate` + 05-14 두 순서 사례 2 (B2)
- [ ] **T3 (P2)** 05-04 · 05-12 — 버킷 청소 방식 E2 답대로(추천: `incoming/` 분리) (M1)
- [ ] **T4 (P2)** 05-08 — 정렬 SQL 계약 + 쪽 경계 통합 사례 (M2)
- [ ] **T5 (P2)** 05-01 · 05-04 · 05-11 — `tx-safety.test.ts` 사례 하나씩 (M3)
- [ ] **T6 (P2)** 05-01 Task 3 — 시트 이동 전 import grep, 콜백 prop · ui 내부 타입 (M4)
- [ ] **T7 (P2)** 05-13 — ARCHITECTURE §4-8 · §4-6 예외 기록 (M5)
- [ ] **T8 (P2)** 05-11 — `as SettlementApprovalAuthority` 밖 0건 acceptance (A1)
- [ ] **T9 (P3)** P3-1~12 문장 · 사례 정리

## 완료 요약
- Step 0: Scope Challenge — scope accepted as-is(구조 원래 배치)
- Architecture Review: 6 issues(B1 · B2 · M1 · M3 · M5 · A1)
- Code Quality Review: 6 issues(M4 · P3-1 · 2 · 3 · 5 · 7)
- Test Review: diagram produced, 5 gaps
- Performance Review: 2 issues(P3-6 · P3-13)
- NOT in scope: written
- What already exists: written
- TODOS.md updates: 0 proposed(U2는 이미 `.planning/todos/pending`)
- Failure modes: 2 critical gaps flagged(B2 · M1)
- Unresolved decisions: 2 in this review(E1 · E2)
- Outside voice: Opus 독립 검토 completed(native), Codex unavailable(사용자 지시)
- Parallelization: 2 lanes parallel(기존 쌍) / 나머지 sequential
- Lake Score: N/A

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review 5` | Scope & strategy | 1 | ISSUES OPEN (반영됨 9fd3887) | mode: HOLD_SCOPE, 1 critical gap |
| Outside Review | Opus 독립 검토(서브에이전트, Codex 대체) | Independent 2nd opinion | 1 | completed (native) | BLOCKER 2 · MAJOR 5 · MINOR 12 → 본 보고서 B1 · B2 · M1~M5 · P3로 흡수, A1 · P3-13 추가 |
| Eng Review | `/plan-eng-review 5` | Architecture & tests (required) | 1 | ISSUES OPEN | 21 issues, 2 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | 다음 게이트 |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | 해당 없음 |

- **OUTSIDE COVERAGE:** Codex — unavailable(사용자 지시로 2026-09-29까지 금지), no completed external review. Opus 독립 검토 — completed(native fallback). **한도 해제 뒤 Codex 재확인 필요**
- **VERDICT:** 게이트 기록됨. CEO · ENG 모두 ISSUES OPEN — P1 2건(B1 · B2)과 사용자 결정 E1 · E2 반영 뒤 실행 가능. eng review required(반영 뒤 재확인). design review required(UI 범위)

**UNRESOLVED DECISIONS:**
- E1 — 제출된 지출결의가 쓴 예정 세율의 취소 정책(05-03-PLAN.md:184). 추천: 값 스냅숏 · FK 없음 · 취소 허용
- E2 — 증빙 버킷 미완료 업로드 청소 방식(05-12-PLAN.md:34). 추천: `incoming/` 접두어 분리
- + 2 unresolved from prior reviews (CEO 로그 값 — U1 · U2는 이후 사용자 결정으로 해소됨. `expenses.evidence_void` 기본 부여도 A로 결정됨 — 2026-09-26T15:18Z 코디네이터 지시)
