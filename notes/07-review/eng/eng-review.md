# 07 계획 eng 검토 (/plan-eng-review) — 1회차

- 대상: PR #257 브랜치 `claude/project-thread-g0xvm8` @ 6951904, `.planning/phases/07-schedule-notify-audit/07-01..25-PLAN.md`
- 기준 코드: origin/main 9122c31 (마지막 마이그레이션 0038). 260907: `ERP_PLANT8_260907` @ 60f86da 얕은 복제
- 일시: 2026-10-21 05:05~05:30 KST. 검토자: Opus 4명(A 위험 경로·마이그레이션·인증·권한 / B 돈·거래처·예산 / C 알림·검수 / D 화면·파일 겹침·순서), 읽기 전용. 종합·표본 확인: 이 세션(Opus)
- Codex: 쓰지 않음(프로젝트 규칙 「eng 검토엔 Codex 금지」, gstack `codex_reviews=disabled`) → Outside Voice = disabled
- 밤 위임(사용자 10/21 02:13 KST): 카드 없이 추천안 기록, 사용자 질문은 아침 브리핑용으로 코디네이터에 모음
- 상세 근거(지적마다 플랜 줄 인용·코드 file:line·처방): `notes-A-risk-migration.md` · `notes-B-money.md` · `notes-C-notify-audit.md` · `notes-D-screens-overlap.md` (같은 폴더)

## 합계

| 검토자 | P1 | P2 | P3 | 부록(신뢰 3~4) |
|---|---|---|---|---|
| A 위험 경로·마이그레이션·인증·권한 | 3 | 13 | 9 | 3 |
| B 돈(지급일·지급 대상·거래처·예산) | 6 | 6 | 10 | 3 |
| C 알림 엔진·누수 스캔·검수 | 2 | 13 | 7 | 2 |
| D 화면·파일 겹침·웨이브 | 1 | 9 | 11 | 2 |
| **합** | **12** | **41** | **37** | 10 |

막는 지적(P1) 12건, 참고 지적(P2+P3) 78건. 표본 확인(이 세션): A-P1-2 `lib/auth.ts:36-44` additionalFields에 `archivedAt`만 있고 퇴직일 칸 없음 확인 · B-P1-4 `domain/holidays/lunar-table.ts:5-6` 2025~2035 확인.

## P1 (재계획 전에 고쳐야 함)

1. **[A] PR 묶음·브랜치 계획 없음** — 07-01-PLAN.md:169-171, ROADMAP 07 절(1135~1172)에 06.5(ROADMAP:959) 같은 「PR 묶음」이 없음. 플랜 25개가 각자 PR, 사용자 머지 8개가 사슬(02→07→11→13, 04→09→17, 05→15→웨이브 6)이라 사용자 부재 시 웨이브 1 뒤 멈춤. CLAUDE.md:105 「위험 경로 변경은 별도 PR로 떼어 나머지가 무인으로」 위반. 처방(추천): 스키마 PR 하나(S1~S4 = 07-02·07·11·13), 인증 PR 하나(07-09), 권한 PR 하나(07-05+07-15+07-04의 matrix.ts·roles.ts 부분) → 사용자 머지 8→3, 임계 경로 대기 2회. 07-04 나머지·07-11의 증빙 숨김 코드(R20)는 무인 PR로.
2. **[A] 07-09-PLAN.md:138·:219 퇴직자 기존 세션 막기가 작동 안 함** — `lib/viewer.ts`는 `lib/auth.ts:40-43`에 등록된 `archivedAt`만 세션에서 받음. 퇴직일은 미등록인데 플랜이 `lib/auth.ts` 수정을 금지. 수락 grep은 통과하므로 조용히 실패. 처방: additionalFields 등록(위험 경로 PR 안) 또는 viewer에서 DB 조회 + 통합 시험.
3. **[A] 07-15-PLAN.md:39·:179 「보기」 끄면 「쓰기」 같이 끄는 연쇄가 마지막 관리자 보호(`domain/permissions/matrix.ts:113-135`)를 우회** — 권한표 보기를 끄면 마지막 관리자가 잠겨 DB 직접 수정 말고는 복구 불가. 처방: 연쇄 결과 전체에 같은 가드 적용 + 시험.
4. **[B] 07-06-PLAN.md:142 자동 계산일이 「수동 지정」으로 저장됨** — 07-06 뒤 상세 DTO가 계산일을 돌려주고 `page.tsx:277`→`expense-form.tsx:152`→저장(:414)으로 되돌아가, 07-16 전까지 모든 임시 저장이 계산일을 수동값으로 굳힘(D-715 위반). 처방: 07-06에서 작성자 날짜를 서버가 버림.
5. **[B] 07-01-PLAN.md:42 / AQ-12 작성자가 친 날짜가 「수동」으로 마감 gate 면제** — `domain/expenses/draft-fields.ts:26`이 그대로 받음. 웨이브 1부터 D-703 마감 우회. 누가 정했는지 기록 칸도 07-02에 없음. 처방: 작성자 입력은 「희망일」로만, 수동 지정은 지급 권한자만 + 기록.
6. **[B] 07-06-PLAN.md:42 세금 기준일 소비처 누락** — `computeExpenseTax`(`domain/expenses/tax.ts:147`, 제출 스냅숏 `index.ts:1094`·미리보기·차이 표시)가 빠짐. 세율 바뀌는 날 결재 세액과 지급 세액이 갈림.
7. **[B] 07-01-PLAN.md:322 공휴일 로더 범위 밖이면 예외** — [min−1, max+2]년을 읽는데 표는 2025~2035(`lunar-table.ts:5-6`). 2025 이하·2034 이상 기준일이면 `LunarTableRangeError`로 지급 목록(07-06 뒤엔 지출결의 목록 전체)이 죽음. 처방: `domain/leave/guard.ts:28-31`처럼 표 밖은 주말만.
8. **[B] 07-24-PLAN.md:40 / AQ-37 예산 증액 공식이 사용자 결정과 반대** — 플랜: (기준 × 현재 원가율) − 현재 예산. 결정(`/mnt/project-files/notes/fund-forecast/design.md:5,9,13`): 늘어난 금액 × 원가율, 예산 고정. 원가율 70→60·PO 10k→11k면 플랜 −400, 결정 +600. 처방: 결정대로.
9. **[B] 07-16-PLAN.md:57·198·256 실행 불가** — `page.tsx` 수정을 금지하는데 새 값은 `page.tsx`·`expense-document.tsx:244`·`payment-action-row.tsx`를 거쳐야 함(뒤 둘은 files_modified에도 없음).
10. **[C] 07-10-PLAN.md:158 사건 알림 유실** — 창 시작 = `findLastTickRun().startedAt`, tick은 주말·공휴일에도 실행 기록(`domain/notify/tick.ts:144`) → 월요일 창이 일요일 9시부터라 금 9시~일 9시 사건(대리 등록·결재 결과·지급)이 안 나감. 상한 잘림·늦은 커밋도 같음. 07-14:148·189(expense-result)도 상속. 처방: 고정 되돌아보기(규칙 updated_at 하한) + 기존 중복 키.
11. **[C] 07-08-PLAN.md:116 잠금 설정 범위 밖 저장값이면 모든 로그인 실패** — `domain/settings/registry.ts:155·161`이 읽을 때마다 검증, `lockoutConfig()`는 로그인마다 호출. 처방: 범위 밖은 기본값으로 읽기 + 시험, 스테이징·운영 현재값 확인, /cso 검토.
12. **[D] 07-18-PLAN.md:203·212 기존 E2E 약 30개 선택자 깨짐** — 「기간 바꾸기」·「총 매출 예상가 바꾸기」→「고치기」로 project-period(21)·ledger-save-flow(4)·quote-edit-scope(3)·hidden-references(1)·quote-table(1) 깨짐. 플랜 파일 목록·시험 실행에 없어 ready 때 CI에서야 빨강. 처방: 다섯 스펙을 files_modified와 실행 목록에.

## 주요 P2 (요약, 전체는 notes)

- [A] 07-13:128 불변 트리거 우회가 beforeEach만 → `test/integration/setup.ts:25` resetDatabase 쓰는 4파일 깨짐 · 07-13:34 UPDATE 허용 범위가 「정리 안 됨→됨」 하나보다 넓음 · 07-09 잠금 키가 기존 `lockLoginEmail`과 달라 서로 안 기다림, account_lock 기록 중복 가능, IP 한도 60이 `test/integration/rate-limit.test.ts:25` 깸 · 07-04 `changes` 추가가 roles.test.ts:152·245, admin-cap-permissions.test.ts:94, settings.test.ts:141 정확 일치 시험 깸 · 07-15 위임자 한도 시험 도달 불가, 증빙 범위 변경이 evidence.intake 쓰기만 가진 계급을 끊음 · 수락 grep이 `0046_…` 이름 고정(재생성 뒤 깨짐).
- [B] 07-06 결재 목록 재정렬이 지급 끝난 문서까지 전부 읽음(`repositories/expenses.ts:561`) · `compareTargetKey`(`domain/payments/targets.ts:600`)가 옛 날짜로 정렬 · 「이번 주로」가 주말·지급일 뒤엔 늘 실패(260907은 다음 지급일로) · 07-20 `vendors.account` 없는 사람이 저장하면 계좌가 지워짐 · 07-20 자동 생성 거래처(`vendor-autocreate.ts:66`)가 version 안 올림.
- [C] 지급 주 알림·마감 전 알림이 그날 하루만 → tick 한 번 실패하면 EXP-12 알림 유실 · 사다리가 밀린 건에 1~3회차 한꺼번에, 첫 배포 백로그 상한 없음 · 07-10 저장소 파일 미기재(결재 저장소로 가면 /cso 필요) · 단계 열린 시각 칸 없음 · 07-14 「viewer loader」 없음 · 누수 스캔 DTO 이름 가정 틀림(`certs/events.ts:241` 반복 등록) · 엑셀 내보내기 검수 시험 없음(ROADMAP 기준 5) · 원가율 비우면 0 저장 · 07-22 수금 기한이 260907의 전 영업일 당김(`020_functions.sql:758-760`) 누락 · tick 25초 잠금 안에 13종 이상.
- [D] 07-12:172 결과 단계 개정이 SYSTEM.md:1275 등과 모순 · 07-17 ConfirmDialog(호출 약 25곳) 실패 시험 먼저 없음 · 07-18 Esc 2단계 동작 변경·saveLocked 무시, PO 금액 이름 바꾸기 일부만(project-form.tsx:289 등) · 07-15→07-12, 07-12→07-10 의존이 한 줄 때문 → 풀면 8웨이브→7웨이브 · 07-25가 07-13에 기대지만 depends_on 없음 · 07-17 임시 비밀번호 액션 DTO 미등록 · 07-17 퇴직자 잠금 풀기 노출(260907 `server/src/people.ts:1008`은 막음).
- [B·A] 260907 대조 오류: 07-13:73 「260907엔 불변 트리거 없음」 틀림(`020_functions.sql:192`, `080_triggers.sql:111-123`) · 07-15:83 딸린 권한은 DB 트리거+requires 그래프(`020_functions.sql:1620-1645`) · `notices.ts:2890`은 버그 설명 주석 · 거래처 `id_card` 서류 빠짐, 지급 기한 범위 1~180 vs 365.

## 확인된 양호 항목

- 파일 겹침: 같은 웨이브 안 겹침 0, 겹치는 쌍마다 depends_on 있음, 선언 웨이브 = 계산 웨이브(D).
- PR #256: 07-12·16·23 모두 `git cat-file -e` 06.1-15/16 SUMMARY 확인 관문(오늘 실행 시 실패 = 정상 대기). 07-19는 07-12 경유 간접(P3). 나머지 플랜은 #256 파일 안 건드림.
- 마이그레이션: 번호는 db:generate, 머지 직전 재생성 명시, 2단계 validate는 0035 선례, squawk 예외 추가 없음.
- 화면 게이트: 화면 플랜 12개 모두 design-gate·4폭 DOM 감사·/design-review(+Codex)·/qa 명시. 돈 플랜 6개 /review+/cso+Opus 검토 명시. 07-14(결재)·07-22(수금) /cso 명시.
- condition-kinds.ts 순서 07-10→14→22→23 충돌 없음. D-717·D-718 반영 맞음. 260907 인용은 연 것 모두 존재(위 오류 제외).

## Decision ledger (밤 위임: 추천안 기록, 사용자 확인은 아침)

### R1: 07 PR 묶음 구조
Finding: P1-1 [A]. Plan baseline: 플랜당 PR, 사용자 머지 8. Runtime evidence: ROADMAP 07 절에 PR 묶음 없음.
Comparison grid: | 선택 | 현재 | A | B | — 사용자 머지 PR 수 | 8 | 3(스키마·인증·권한) | 8 유지, 순서만 표기 |
Recommendation: A — 무인 흐름 보장(CLAUDE.md:105).
State: pending(재계획 세션이 A 반영 추천, 아침 브리핑에서 사용자 확인)
Actual answer: unanswered · Accepted scope: none

### R2: 07-17·07-21 머지 주체
Finding: P2 [D] 07-17:31, 07-21:38. CLAUDE.md:98 「인증·권한·암호화는 위험 경로라 사용자가 머지」 vs D-724(세션 머지). 두 플랜은 훅 위험 경로 파일은 안 건드림.
Options: A) 화면 플랜은 세션 머지(D-724 유지, 훅 기준) (recommended) · B) 사용자 머지
State: pending(아침 질문) · Actual answer: unanswered

### R3: 퇴직자 잠금 풀기 노출(07-17)
Finding: P2 [D] 07-17:127·146, 260907 `server/src/people.ts:1008`은 퇴직자 해제 막음.
Options: A) 260907처럼 퇴직자 행엔 「잠금 풀기」 숨김 (recommended) · B) 플랜대로 표시
State: pending(아침 질문) · Actual answer: unanswered

그 밖 P1·P2 처방은 사용자 결정(design.md·D-7xx)을 그대로 따르는 버그 수정이라 별도 결정 없이 재계획 반영 대상.

Approval readiness: 승인된 처방 없음(모두 재계획 세션 몫·pending). PASS 아님 — 이 검토는 지적 전달용.

## NOT in scope
- 플랜 파일 수정·PR #257 푸시(지시상 재계획 세션 몫) · Codex 외부 검토(프로젝트 규칙) · 디자인 검토(/plan-design-review 별도 세션) · 테스트 실제 실행(계획 검토).

## What already exists (재사용 확인)
- 표 밖 공휴일 처리 `domain/leave/guard.ts:28-31` · 로그인 잠금 키 `lockLoginEmail` · 마지막 관리자 가드 `domain/permissions/matrix.ts:113-135` · 알림 중복 키(04.2 notification_log) · 2단계 제약 검증 마이그레이션 0035 선례.

## Failure modes (critical gap = 시험·오류 처리 없음 + 조용함)
1. 주말 사이 사건 알림 유실(P1-10) — 시험 없음, 조용함 → **critical gap**
2. 퇴직자 세션 유지(P1-2) — 수락 grep 통과, 조용함 → **critical gap**
3. 계산일이 수동값으로 굳음(P1-4) — 조용함 → **critical gap**
4. 마지막 관리자 소실(P1-3) — 사용자에겐 보이나 복구 불가
5. 표 밖 연도 예외(P1-7) — 화면 오류로 보임
6. 범위 밖 설정 로그인 실패(P1-11) — 보임, 전원 로그인 불가
7. 지급 주 알림 하루 놓치면 유실(P2 C) — 조용함 → **critical gap**

## Worktree parallelization
현 플랜 웨이브 구조(8웨이브, 같은 웨이브 파일 겹침 0)는 병렬 가능. D 제안: 07-15→07-12, 07-12→07-10 의존을 풀면 7웨이브. R1(A) 채택 시 스키마·인증·권한 PR 세 개가 사용자 머지 대기 지점.

## Implementation Tasks (재계획 세션용)
- [ ] T1 (P1) PR 묶음·브랜치 절 추가(R1 추천안) — ROADMAP 07 절, 각 PLAN
- [ ] T2 (P1) 07-09 퇴직일 세션 반영 경로 + 시험
- [ ] T3 (P1) 07-15 연쇄 해제에 마지막 관리자 가드 + 시험
- [ ] T4 (P1) 07-01·07-06 작성자 날짜 서버 제거·수동 지정 권한·기록 (D-703·D-715)
- [ ] T5 (P1) 07-06 computeExpenseTax 포함
- [ ] T6 (P1) 07-01 공휴일 표 밖 = 주말만
- [ ] T7 (P1) 07-24 증액 = 늘어난 금액 × 원가율
- [ ] T8 (P1) 07-16 files_modified에 page.tsx·expense-document.tsx·payment-action-row.tsx
- [ ] T9 (P1) 07-10·07-14 고정 되돌아보기 창
- [ ] T10 (P1) 07-08 범위 밖 저장값 기본값 읽기 + 운영값 확인
- [ ] T11 (P1) 07-18 E2E 5개 스펙 갱신 포함
- [ ] T12 (P2) notes A~D의 P2 41건 반영, 260907 인용 정정
- [ ] T13 (P2) CONTEXT D-7xx 줄 형식(decision-coverage 게이트 파싱) — 기존 메모

## Unresolved decisions
- R1 PR 묶음 구조 · R2 07-17·07-21 머지 주체 · R3 퇴직자 잠금 풀기 노출

## Completion summary
- Step 0 Scope Challenge: scope accepted as-is(07 범위는 사용자 카드 10/21 01:39로 확정)
- Architecture: 12 P1 중 아키텍처·보안 6 · Code Quality: P1 4 · Test: 커버리지 도식은 notes 각 3절, 기존 시험 회귀 위험 다수(CRITICAL: 07-18 E2E 30, 07-04 정확 일치 4, 07-13 resetDatabase, 07-09 rate-limit) · Performance: P2 3(재정렬 전체 읽기, tick 25초 잠금, 백로그)
- NOT in scope / What already exists: written · TODOS.md: 0 · Failure modes: critical gap 4 · Unresolved decisions: 3
- Outside voice: disabled(프로젝트 규칙·codex_reviews=disabled) · Parallelization: 8웨이브(7 가능)

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Outside Review | codex (disabled) | Independent 2nd opinion | 0 | disabled | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ISSUES OPEN | 90 issues(P1 12), 4 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** codex, plan-review, disabled(프로젝트 규칙), findings 없음
- **VERDICT:** CLEAR 없음 — eng review required(재계획 뒤 플랜 체커로 확인, CLAUDE.md:81 eng 재검토는 최대 1회)

**UNRESOLVED DECISIONS:**
- R1 PR 묶음 구조(추천: 스키마·인증·권한 3 PR)
- R2 07-17·07-21 머지 주체(추천: 세션 머지)
- R3 퇴직자 잠금 풀기 노출(추천: 260907처럼 숨김)
