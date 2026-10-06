# /plan-eng-review 2회차 — Phase 06 (지급 · 증빙 · 카드) 반영본 재검토

- 대상: `.planning/phases/06-payment-evidence-cards/06-01 ~ 06-30-PLAN.md`(29개 · 06-26은 06-27에 흡수) + `06-VALIDATION.md` + `ROADMAP.md`
- 브랜치: `claude/06-ui-spec-revision-oju6s5` · 커밋 `44d325be`(1차 반영본). origin/main `341537c1`은 이미 포함됨
- 1차 기준: `eng-review-replan.md`(@ `b77fe3f6`, 54건 · P0 3 · P1 9 · P2 22 · P3 20, critical gap 5, 결정 R-1~R-7)
- 05 기준: PR #162 브랜치 `claude/phase-05-execute-pxok9w` 최신 head `8ae301e1`(1차는 `86bec989`, 그 뒤 17커밋)
- 이 회차는 CLAUDE.md:81 「지적 반영 뒤 재검토는 최대 1회」의 그 1회다. 3회차는 없다.
- 방식: 프로젝트 지침 §3 ② 2회차 방식 — 지난 지적의 해결 여부와 바뀐 부분(`git diff 1208c93a 44d325be`, +1669/−823)만 본다.
- 실행 방식: 밤 위임(10/6 03:09 KST) — 질문 카드 없이 추천안으로 진행, 새 결정은 `/mnt/project-files/notes/night-0106/06-eng-review-questions.md` §14.
- **이 세션은 플랜을 고치지 않는다**(세션당 게이트 하나). 반영은 아래 「반영 지시」 표.

## 지킨 규칙 (파일:줄)

- CLAUDE.md:81 — 계획 게이트 `/plan-eng-review` 1회, 반영 뒤 재검토 최대 1회
- CLAUDE.md:83 · :134 — 외부(Codex) 검토는 디자인 검토에서만 → 교차 검토는 Opus(사용자 카드 10/5 19:48). gstack `codex_reviews`도 `disabled`
- CLAUDE.md:87 — 세션은 게이트 리뷰 경계에서 끊는다(이 세션은 검토만)
- CLAUDE.md:16 — `.planning/` 수동 편집 금지 → 플랜은 건드리지 않고 이 스킬 보고서만 남긴다(1차와 같은 방식)
- CLAUDE.md:105 — 06-27(PR-A, `db/schema/`)은 위험 경로라 사용자 머지
- docs/DESIGN.md:88(§4) · docs/design/SYSTEM.md — 화면 기준. 이 검토는 eng 범위라 화면 판정은 하지 않았다(06 디자인 검토는 별도 끝남)

## 결론

**조건부 통과.** 막는 문제(P0 · P1) 0건. 1차 P0 · P1 12건과 결정 7건은 모두 플랜 줄 단위로 반영됐다. 남은 것은 P2 2건 · P3 9건이다. 단 **P2 2건(N-1 · N-2)은 06 실행 착수 전에 플랜에 반영해야 한다** — 「#162 머지 뒤 플랜 체커 재실행(C15-체커)에 맡긴다」는 처리로는 순서가 보장되지 않는다(교차 검토가 깨뜨림, 아래 Outside Voice). 반영은 두 곳 몇 줄이라 재검토가 필요 없다.

집계: 1차 54건 → 해결 49 · 미룸 4(todo 있음) · 부분 1 / 결정 7 반영 / 이번 새 발견 11건(P2 2 · P3 9) · critical gap 새 0(미룸 1 = E-23, ready 게이트로 막힘)

---

## Step 0 — Scope Challenge

- 범위 유지(1차와 같음). 29플랜 · 12웨이브. 반영으로 플랜이 늘지 않았고(06-26 흡수로 1개 줆), 새 발견은 모두 플랜 몇 줄로 닫힌다. 복잡도 문턱은 1차에서 수용됨 — 다시 묻지 않는다.
- 이미 있는 것: 05 최신 head에 06이 새로 써야 할 헬퍼는 없다(드리프트 대조). `findExpenseApprovalStatus`(단건)는 06-28이 쓸 수 있을지 미확인(추정).
- 그래프: 순환 · 누락 의존 0, 같은 웨이브 `files_modified` 겹침 0, `06-26` 의존 잔존 0, ROADMAP · VALIDATION · PR 묶음 · `risk:` 19개가 frontmatter와 일치(검토 A3).

## 1차 지적 해결 여부

| 묶음 | 결과 | 근거 파일 |
|---|---|---|
| P0 3 · P1 9 (E-2 · E-3 · E-4 · E-6 · E-9 · E-10 …) | **12/12 해결** · 새 문제 0. 반영 지시 P0 · P1 15행 모두 해결, 요구 테스트 모두 플랜에 있음(예: 06-19:262 · :264, 06-22:215, 06-23:290-292 · :321, 06-03:223 · :225 · :274, 06-09:344, 06-15:230) | `/mnt/project-files/06-prep/eng-r2-A1-p0p1.md` |
| 결정 R-1~R-7 | **7/7 반영**. R-3은 05가 만든 후보 자리 `BlockedCandidateFilter`(05 `repositories/approvals.ts:307`)에 값 하나를 더하고 `domain/approvals/`는 0줄 | 같은 파일 |
| P2 22 | 해결 21 · 미룸 1(E-23 → `todos/pending/2026-10-06-05-apply-tax-rule-float-floor.md`, 06-03:367 `it.fails` + 06-01:135 「PR-C ready 전 녹색」 게이트) | `/mnt/project-files/06-prep/eng-r2-A2-p2p3.md` |
| P3 20 | 해결 16 · 미룸 3(E-39 · E-41 · E-47, todo 있음) · 부분 1(E-37 → N-10) | 같은 파일 |
| critical gap 5 | 해결 4(E-3 · E-7 · E-8 · E-9) · 미룸 1(E-23) | 같은 파일 |

돈 · 잠금 세 건은 교차 검토가 실질을 다시 확인했다: E-3 후보 SQL `or(05 조건, exists(...))`(06-23:300) + 201건 회귀, E-9 몸통 UPDATE가 version 조건이라 사전 조회 뒤 바뀌면 0행 거부(06-09:323), E-4 같은 tx 프로젝트 잠금 뒤 A8 순서 grep(06-22:215).

---

## Section 1 — Architecture

| ID | 등급 | 위치 | 문제 | 확인 |
|---|---|---|---|---|
| **N-2** | **P2** (8/10) | 06-27:1-6 · :111 · :137-149 / 06-01:112 · :118-119 | 06-27은 `wave: 1` · `depends_on: []`이고 :111이 06-01보다 먼저 돌라 한다. 그런데 06-27 실행 게이트 표에는 `C15`(#162 머지) 줄만 있고 06-01의 `C15-05기준`(:118) · `C15-체커`(:119) 줄이 없다. 06-01:112는 「다른 06 플랜의 ⓪은 이 표의 C15 줄을 그대로 쓴다」라 다른 28개 플랜도 체커 기록 없이 착수할 수 있다. 결과: #162 머지 직후 체커 재실행 전에 위험 경로 PR-A가 사용자에게 넘어갈 수 있다. 이번 05 드리프트에는 `db/` 변경이 0이라 실제 피해는 아직 없다 | 06-27:139 표 행 `C15 \| PR #162(Phase 5)가 main에 머지됐다` 하나뿐, 06-01:118 · :119 두 줄 직접 확인 |
| N-6 | P3 (6/10) | 06-15:42 · 06-23:38 | 지급 대상 원천에 상한이 없는데 홈 로드마다 전체를 읽고 판정한다(1차 E-31의 남은 부분) | 검토자 인용(재확인 안 함) |

## Section 2 — Code Quality

| ID | 등급 | 위치 | 문제 | 확인 |
|---|---|---|---|---|
| **N-1** | **P2** (9/10) | 06-19:225 · :264 / 06-22:29-30 · :34 · :180 ↔ 05 `domain/settlements/index.ts:86` | 05 `8ae301e1`이 A8 문구를 `결재 중 지출결의 ${count}건 · 먼저 결재`로 바꿨다(05 테스트도 같이). 플랜은 옛 글자 `· 지출결의 결재 먼저`를 단언한다. 06-19:264 acceptance grep이 0건이 되어 W9에서 멈추고, 06-22 테스트가 옛 글자를 단언해 실행자가 05 상수를 되돌릴 유인이 생긴다. C15-05기준(06-01:118)은 이름 넷만 보고 문구는 안 보며, 체커 범위도 「줄 번호 · 이름 어긋남」(06-01:123)이라 재실행이 잡는다는 보장이 없다 | 05 실물 `const expensesInReview = (count: number) => \`결재 중 지출결의 ${count}건 · 먼저 결재\`;` 확인, 플랜 grep 5곳 확인 |
| N-3 | P3 (7/10) | 06-07:180 | 규모 근거가 「17개」인데 E-13으로 `repositories/quote-lines.ts`가 더해져 frontmatter는 18개 | 검토자 인용 |
| N-4 | P3 (6/10) | 06-03:46 | 부가세 역산은 `"round"` 고정, 정방향은 코드표 방식 — 절사 방식이면 역산 공급가가 1원 어긋날 수 있음(검토자 실측 1,000,006 → 1,000,005). R-5 결정(반올림 고정) 범위 안이라 테스트 한 줄로 고정 권장 | 검토자 인용 |
| N-7 | P3 (8/10) | 06-15:148 | 선행 의존 표 설명이 E-6 정정 전 해석(「확인 기록 있는 문서만 version +1」)으로 남음 | 검토자 인용 |
| N-10 | P3 (7/10) | 06-22:475 | 「별도 할 일로 넘긴다」고 했지만 `todos/pending/`에 해당 파일 없음(E-37) | 검토자 인용 |
| N-11 | P3 (6/10) | 06-28:44 · :273 ↔ 05 `domain/expenses/pick.ts:132-136` | 05가 `searchLinesForPick` change 모드를 `isEditableByDrafter`로 바꿔 반려 · 회수 문서도 열린다 — 06-28 전제에 유리한 변화. pick.ts 호출부를 06-28 수락 grep에 넣을 것 권장 | 드리프트 대조 |

## Section 3 — Tests

| ID | 등급 | 위치 | 문제 |
|---|---|---|---|
| N-5 | P3 (5/10, 중간 확신 — 실제 문제인지 확인) | 06-23:35 | E-3 후보 SQL이 증빙 필수 꺼짐을 보지 않아 신호 없는 문서가 LIMIT 200을 채울 수 있는데 테스트 없음. 이 회사 규모에선 비현실적 |
| N-8 | P3 (7/10) | 06-19:258 | 05 `test/e2e/screen-routes.ts:126`을 거쳐 정산 픽스처를 쓰는 a11y · design-principles · type-hierarchy 세 스펙이 E2E verify 목록에 없음 |
| N-9 | P3 (6/10) | 06-VALIDATION.md | E-2 · E-3 · E-4 · E-6 · E-7 · E-8 · E-23 신호 행이 없음(플랜 본문에는 있음) |

### 커버리지 도표 (1차 GAP의 현재 상태)

```
경로                              1차 GAP                          지금
───────────────────────────────── ──────────────────────────────── ─────────────────────────────
카드 사용 등록/수정 (06-05/07/09)  [GAP] 완료 전환 뒤 삭제 (E-9)     [★★★] version 조건 0행 거부 06-09:323 · :344
단건 지급 (06-03/04)               [GAP] 역산 경계 (E-8)             [★★★] 06-03:223 · :225
                                   [GAP] 파일0 증빙금액 (E-7)        [★★★] 06-03:274
                                   [GAP] 8.8% 절사 (E-23)            [미룸] it.fails + ready 게이트 06-03:367
일괄 지급 (06-15)                  [RED] C4 기대값 모순 (E-6)        [★★★] 06-15:230 (설명 줄 N-7 낡음)
지출결의 제출 사슬 (06-13)         [약함] 장벽 없음 (E-26)           [★★★] 해결
정산 기안 게이트 (06-19)           [RED] 05 정산 테스트 (E-2)        [★★★] 06-19:262 · [GAP] E2E 3스펙 (N-8)
정산 최종 승인 (06-22)             [RED] 05 A8 (E-4)                 [★★★] 06-22:215 · [RED 예정] 옛 문구 (N-1)
홈 기안자 신호 (06-23)             [GAP] 엔진 앞단 필터 (E-3)        [★★★] 06-23:290-292 · :321 · [GAP] 꺼짐+LIMIT (N-5)
PM 정산 끝까지 (06-24)             [GAP] (E-29)                      [★★] 해결
```

Test Plan 산출물: 화면 경로는 1차 · 디자인 검토 산출물 그대로. 이번 회차가 더하는 QA 확인은 「정산 승인 막힘 문구 = 05 `expensesInReview`」 하나.

## Section 4 — Performance

N-6(위 Section 1) 외 새 문제 없음. 1차 E-30~E-34는 해결(검토 A2).

---

## Outside Voice — Opus 교차 검토 (Codex 대신, 사용자 결정 10/5 19:48)

`codex_reviews: disabled` · CLAUDE.md:83(R3). 독립 Opus 검토자(읽기 전용)가 잠정 판정 「P0 · P1 0 → 통과, P2는 체커 재실행에 맡김」을 깨뜨리도록 맡겼다.

- 막는 문제 못 찾음. E-3 · E-4 · E-9 실질 반영 확인, 6.1(PR #164)은 계획 문서뿐이라 06-27과 충돌 없음(6.1-01 start_after 「05 · 06 머지 뒤」).
- **긴장 1(판정 수정):** 「체커 재실행에 맡김」은 순서 보장이 없다 — N-2(06-27이 체커 전에 돌 수 있음), N-1(체커가 문구를 안 봄). → 두 건을 「착수 전 반영」으로 올렸다.
- 권고 원문: `Recommendation: 통과 because 돈·잠금 P0·P1(E-3·E-4·E-9)은 플랜 줄 단위로 실질 반영됐고 외부 머지로 실행이 막히는 경로도 없다. 단, 위 P2 두 건은 … 실행 전 지금 반영해야 한다(조건부 통과).`

## 반영 지시 (06 실행 착수 전 · 재검토 없음)

| 플랜 | 줄 | 지시 |
|---|---|---|
| 06-27 | :137-149 실행 게이트 표 | 06-01:118 `C15-05기준` · :119 `C15-체커` 두 줄을 그대로 복사해 넣는다(N-2). :111 「06-01보다 먼저」는 두 줄이 통과한 뒤로 읽히게 한 줄 보탠다 |
| 06-19 · 06-22 | 06-19:225 · :264, 06-22:29-30 · :34 · :180 | A8 문구 리터럴을 `결재 중 지출결의 {N}건 · 먼저 결재`로 바꾸거나 「05 `expensesInReview(n)` 값」으로 적는다(N-1). 06-19:264 grep도 같이 |
| 06-01 | :118 | (권장) C15-05기준에 `expensesInReview` 정의 grep 한 줄을 더해 다음 문구 드리프트를 착수 때 잡는다 |
| P3 N-3~N-11 | 위 표 | 같은 반영 세션에서 함께 고치거나, #162 머지 뒤 C15-체커 재실행에서 고친다(막지 않음) |

반영 방법(추천): 코디네이터가 06 실행 전에 짧은 `/gsd-plan-phase 06 --reviews` 반영 세션 하나를 띄운다. 두 곳 몇 줄이라 CLAUDE.md:81에 따라 다시 eng 검토하지 않는다.

## NOT in scope

- 화면 판정(06 디자인 검토 · Codex 디자인 검토에서 끝남, CLAUDE.md:83)
- E-23 원천징수 절사 수정 자체(05 공통 함수 별도 PR — todo, ready 게이트로 막힘)
- 6.1 플랜 대조(6.1 스레드가 05 · 06 main 반영 뒤 한다)

## What already exists

05 `8ae301e1` 기준 새로 쓸 헬퍼 없음. 1차 「What already exists」 목록(05 `listLineageLinesByProjects` · `listNumberedByLineChain` · `findExpenseApprovalStatuses` · `isCalendarDate` · `expenseDraftFieldsSchema` · `pickEmptyText`)은 반영본이 쓰고 있다(검토 A1 · A3). 스키마 · 마이그레이션 · 권한 키 변경 없음 — 05 head 마지막 마이그레이션 `0024_even_mulholland_black`, 06-27은 `db:generate`가 번호를 정함(06-27:151).

## Failure modes

| 실패 | 테스트 | 오류 처리 | 사용자에게 보임 | critical gap |
|---|---|---|---|---|
| 06-19 acceptance 옛 문구로 멈춤 (N-1) | grep | ⓪ 멈춤 | 실행 멈춤 | 아니오(시끄러움) |
| 실행자가 05 문구를 옛 글자로 되돌림 (N-1) | 05 테스트가 빨개짐 | — | CI 빨강 | 아니오 |
| 06-27이 체커 전에 PR-A를 냄 (N-2) | 없음 | 없음 | 사용자 머지 PR 1개가 낡은 전제 | 아니오(이번엔 `db/` 드리프트 0 — 확인) |
| 원천징수 10원 (E-23) | `it.fails` | ready 게이트 | PR-C ready 못 함 | 1차 그대로(미룸) |

새 critical gap 0.

## Worktree parallelization

기존 12웨이브 유지. 같은 웨이브 파일 겹침 0(검토 A3). 반영 지시는 06-27 · 06-19 · 06-22 · 06-01 네 파일 — 한 세션 순차.

## Implementation Tasks

- [ ] **T1 (P2, human: ~15min / CC: ~3min)** — 06-27 — 실행 게이트에 C15-05기준 · C15-체커 두 줄 복사
  - Surfaced by: Architecture — N-2 (06-27:137-149)
  - Files: `.planning/phases/06-payment-evidence-cards/06-27-PLAN.md`
  - Verify: `grep -n "C15-체커\|C15-05기준" 06-27-PLAN.md` 2줄 이상
- [ ] **T2 (P2, human: ~15min / CC: ~3min)** — 06-19 · 06-22 — A8 문구를 05 `expensesInReview` 값으로
  - Surfaced by: Code Quality — N-1
  - Files: `06-19-PLAN.md`, `06-22-PLAN.md`, (권장) `06-01-PLAN.md`
  - Verify: `grep -rn "지출결의 결재 먼저" .planning/phases/06-payment-evidence-cards/*-PLAN.md` 0줄
- [ ] **T3 (P3, human: ~1h / CC: ~10min)** — 여러 플랜 — N-3~N-11 정리(같은 세션 또는 C15-체커 때)
  - Surfaced by: Sections 1–3
  - Files: 06-07 · 06-03 · 06-15 · 06-22 · 06-23 · 06-19 · 06-28 · 06-VALIDATION
  - Verify: 플랜 체커 재실행 통과

## Unresolved decisions

없음. 새 결정 1건(판정: 조건부 통과, P2 두 건 착수 전 반영)은 밤 위임 추천안으로 정하고 `06-eng-review-questions.md` §14에 적었다(아침 확인).

## Decision ledger

### R2-1 — 2회차 판정과 P2 두 건의 처리
Finding: N-1 · N-2 (P2, 8~9/10, 검토 A3 · B · 교차 검토)
Plan baseline: 1차 VERDICT 「NOT CLEARED, 반영 뒤 재검토 최대 1회」
Runtime evidence: 05 `domain/settlements/index.ts:86` 문구 실측, 06-27:139 게이트 표 실측
Comparison grid:
| 선택 | 지금 | A 조건부 통과(추천) | B 불통과 | C 통과 · 체커에 맡김 |
|---|---|---|---|---|
| 판정 | 미정 | 통과, P2 두 건 착수 전 반영 | 불통과, 재계획 | 통과 |
| 재검토 | 1회 남음(이번) | 없음 | 3회차 필요(CLAUDE.md:81 위반) | 없음 |
| 순서 보장 | — | 반영 세션이 착수 전에 | 재계획 뒤 | 없음(N-2) |
Question D1: 06 eng 재검토 판정 — 막는 문제 0, P2 두 건을 어떻게? Recommendation: A because 몇 줄 수정에 재계획 · 3회차 검토는 과하고, 체커에 맡기면 순서가 보장되지 않는다.
Header: 2회차 판정
Options:
A) 조건부 통과 (recommended) — 통과로 두고 06 실행 전 짧은 반영 세션에서 두 곳 고침
B) 불통과 — 재계획 세션 후 다시 검토(재검토 한도 초과)
C) 통과 · 체커 재실행에 맡김 — 06-27이 체커보다 먼저 돌 수 있어 보장 없음

State: approved
Actual answer: A — 밤 위임 추천안 자동 결정(사용자 지시 10/6 03:09 「추천안으로 진행, 아침 브리핑에서 질문」), `06-eng-review-questions.md` §14
Accepted scope: 판정 기록만. 플랜 수정은 별도 반영 세션
History: 없음

Approval readiness: PASS (R2-1 — 밤 위임 자동 결정)

## 부록 — Suppressed findings

- A1-3 (P3, 4/10) 06-19:244 — USD 실행가 줄에 카드 사용을 이을 때 06-07 상한이 환산하는지 플랜에 없음. 인용 근거 약함
- A1-5 06-01:145 — 묶음 겹침 파일 대기 때문에 W4 · W6 착수가 PR-B · PR-C 머지를 기다림. 의도된 설계 · todo 있음(문제 아님)

## Completion summary

- Step 0: Scope Challenge — scope accepted as-is
- Architecture Review: 2 issues found (P2 1 · P3 1)
- Code Quality Review: 6 issues found (P2 1 · P3 5)
- Test Review: diagram produced, 3 gaps identified (P3)
- Performance Review: 0 new issues (N-6은 Architecture에 셈)
- NOT in scope: written
- What already exists: written
- TODOS.md updates: 0 items proposed (E-37 todo 누락은 N-10으로 반영 지시)
- Failure modes: 0 critical gaps flagged
- Unresolved decisions: 0 in this review
- Outside voice: Opus in-host 교차 검토 completed(Codex disabled — CLAUDE.md:83), 긴장 1 해소(판정을 조건부로)
- Parallelization: 기존 12웨이브 유지, 반영은 1 lane 순차
- Lake Score: N/A (커버리지 선택지 0)

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | 마일스톤 수준에서만(CLAUDE.md:81) |
| Outside Review | Opus in-host (Codex disabled · CLAUDE.md:83) | Independent 2nd opinion | 2 | completed (in-host) | 막는 문제 0, 판정 근거 1건 깨뜨림 → 조건부 |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 2 | issues_open | 11건 — P0 0 · P1 0 · P2 2 · P3 9, critical gap 0 (1차 54건 중 49 해결 · 4 미룸 · 1 부분) |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | 이 검토 범위 밖 |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | 해당 없음 |

- **OUTSIDE COVERAGE:** Codex 외부 검토 disabled(사용자 결정 · 훅 R3). 대신 Opus in-host 독립 검토 completed — 외부 모델 커버리지는 아님.
- **VERDICT:** ENG 조건부 통과 — 막는 문제 0. 06 실행 착수 전 반영 지시 T1 · T2(P2 두 건)를 반영하면 실행 가능. 재검토 없음(CLAUDE.md:81).

NO UNRESOLVED DECISIONS
