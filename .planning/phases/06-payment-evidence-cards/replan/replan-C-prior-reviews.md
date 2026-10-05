# 06 재계획 대조 C — 지난 검토의 잔여 지적 · 옛 시스템 대조 · 6.1 기대 · 반려 종결 · 요구사항 매핑

> 작성 2026-10-05 · 읽기 전용 조사(레포 파일 · 커밋 · 패키지 · `.planning/` 변경 없음, `mcp__hearthbot__` 미사용). 이 파일 하나만 새로 만들었다.
> 기준: 브랜치 `claude/06-ui-spec-revision-oju6s5` HEAD `90fcd1c8`(`origin/main` = `341537c1`). 05 = `refs/remotes/pr162` `a972a5ac`(PR #162 draft, 2026-10-05T08:10Z). 6.1 = PR #164 draft · 22커밋 · 플랜 13개 · head `002adca3`(2026-10-04T15:34Z — 이 조사에서 다시 확인했고 notes-C(10/4) 뒤로 변동 없음).
> 표기: `06-NN:줄` = `.planning/phases/06-payment-evidence-cards/06-NN-PLAN.md`의 줄 · `6.1-NN:줄` = `06.1-NN-PLAN.md`(PR #164에서 추출) · `UI-SPEC:줄` = 이 브랜치 `06-UI-SPEC.md`(rev 10 r2, 1508줄) · `fable:줄` = `final-review-fable.md`. 05 쪽 줄 번호는 pr162 기준이라 05-13 이후 밀린다(replan-A §0).
> 자매 보고: `replan-A-05-names.md`(05 실제 이름) · `replan-D-plan-inventory.md`(플랜 25개 인벤토리) · `replan-B-uispec-r10.md`(UI-SPEC rev 10 — 이 조사 시점에는 아직 없음). 겹치는 내용은 위치만 가리킨다.
> 2026-09-26 이전의 커밋 해시(`a7f2f4e` · `333f7bf` · `8dc58ec` · `0f3f653` · `acca39f` 등)는 PR #78 squash(`2adbedf5`, 2026-09-26T20:18+09:00)로 이 저장소에서 사라졌다. 보고서 안의 해시는 이름표로만 쓴다.
> 모든 판정 · 제안은 내 의견이다. 결정은 §6의 사용자 확인 목록에 모았다.

## 0. 한눈에 (먼저 읽을 것)

1. **요구사항 구멍(§4.2).** MAST-05 · OPS-09는 25개 플랜 어디에도 없다(frontmatter `requirements:` 0건). 둘 다 2026-10-01 quick 261001-hfi가 ROADMAP:719 · REQUIREMENTS:23 · :136에 더했고, 06-CONTEXT:9와 플랜은 그보다 앞서 쓰였다. OPS-09는 내용상 이미 있다(`payment_process` 06-03:48 · `purchase_process` 06-12:166 — 둘 다 `domain/action-log/record.ts:21-22`의 `CORE_ACTION_TYPES`에 있다). 청구만 빠졌다. MAST-05는 05가 `payment_method` 코드표를 이미 만들었으므로(`domain/code-tables/index.ts:39`, replan-A §2.12) 06은 관리 화면 확인 + Q4 짝 격자만 하면 된다. EVID-01은 06-25 하나만 청구한다(ROADMAP:696 · REQUIREMENTS:226은 Phase 5, 06-24는 06-25에 의존하면서 requirements에서 뺐다).
2. **반려 · 회수 종결 경로(§4.1).** D-611이 반려 문서를 미결로 세고 06-19 Task 1 트레이서가 「반려 1건이면 정산 결재 올리기가 막힌다」를 증명하는데, 그 문서를 끝내는 길이 어느 플랜에도 없다. 05에는 종결 상태가 없고(`approval_instances_status_check` 여섯 값), `expenseLineDoor` · `remainingForInstallments`는 번호 있는 문서를 상태와 무관하게 센다. 05 브랜치 06-CONTEXT:11 한 줄과 todo `2026-09-26-phase-6-rejected-expense-close-path.md`가 이 브랜치에 없다(병합 충돌 후보). 새 플랜(돈 · 결재라 `risk:` 태그 + Opus 실행자)과 Phase 5 쪽 표 변경(위험 경로 PR)이 필요하다.
3. **옛 시스템 7행(§2).** 플랜 본문에 이미 있는 것은 Q2(= O-9, 06-14:37 · :62)뿐이다. Q3 · Q4 · Q5 · Q6 · 행 38은 본문 0건이고, Q7은 「06 변경 없음」이 맞다. Q5(공용 카드)는 「06-05 갈래 하나」가 아니다 — `corp_cards_owner_xor_check`(`db/schema/corp-cards.ts:32-35`) · `cardOwnerKind`(`domain/corp-cards/index.ts:44-54`) · 관리 폼 `card-form.tsx`까지 Phase 3 변경이고 위험 경로 PR(사용자 머지)이다(replan-D §4).
4. **낡은 규칙 이름(ST-1).** `project.completed-lock`은 main에 없다 — `test/unit/domain/rules-gate.test.ts:29-31`이 「없다」를 단언한다. 플랜 17곳 + `06-RESEARCH.md` 2곳이 아직 인용한다. 실제는 `project.line-edit`(`domain/rules/register.ts:64`) · `quoteLockReason`(`domain/quotes/edit-scope.ts:127`) · `CompletedProjectError`(`domain/projects/index.ts:72`). 행 38 설계와 6.1-06 P-DONE이 이 이름에 기댄다.
5. **6.1과 부딪히는 곳 열 가지(§3.3).** `reviewed_at` ↔ `confirmed_at`(CF-1) · UI-SPEC:67-69의 `evidence_import_records` 오기(CF-2) · Q3 실행가 상한 ↔ 6.1-09 「파일이 이김」(CF-3) · 토스트 폐지 · 옆 패널 ↔ 6.1-09 복귀 토스트 · `card-usage-form.tsx`(CF-4) · P-LOCK · P-DONE · P-LAST 이름(CF-5) · `hasEvidence` DTO 칸 ↔ 함수(CF-6) · 6.1-06:66 완료 프로젝트 증빙 잠금 ↔ 행 38(CF-7) · SP-8 ↔ 05 `PickDialog` ↔ G-4(CF-8) · AS2 `document_update` ↔ `evidence_amount_change`(CF-9) · 06-11 훅 ↔ 05 규칙 ↔ 6.1-06(CF-10).
6. **rev 10은 플랜 본문에 0%(§1.6).** SP-8 · O-23 · 짝 격자 · `evidence_attach` · `voided_at` · `SidePanel` · `PanelForm` · `--surface-` · `--status-` · `status-map` 모두 25개 플랜에서 grep 0건. 토스트는 10개 플랜 61줄이 그대로다. 플랜의 마지막 수정은 2026-10-01(`7eb6c2ad`), UI-SPEC rev 10은 10/4(`072b3bc` · `b1118415` · `b9a572d1`).
7. **열린 선택 17행(§1.7).** UI-SPEC 「열린 선택」 표(:1387-1411)에 확정 표시가 없는 행이 17개다(O-1 · 2 · 3 · 4 · 5 · 7 · 8 · 10 · 11 · 12 · 13 · 14 · 15 · 16 · 17 · 19 · 20). 표 머리(:1384)가 `/gsd-plan-phase 6` 전에 한 줄씩 확인하라고 적는다. O-2는 `design-review.md:7` · `.continue-here.md:54`에서 이미 사용자 확정이라 표기만 낡았다.
8. **「Codex 재확인(2026-09-29 이후로 미룬 것)」은 낡은 꼬리표다(§1.2).** 2026-09-26 사용자 결정으로 Fable 검토가 갈음했고, 진짜 Codex는 10/5에 UI-SPEC rev 10(디자인 검토)만 돌았다. reconcile.md:70 · :107 · :123 · :125가 「Codex 계획 검토」를 되살리는데 CLAUDE.md §4 · §6 · §8과 규칙 훅 R3는 Codex를 디자인 검토에서만 허용한다 — 사용자 확인이 필요하다(U-1).
9. **SP-8 · G-4 · 05 `PickDialog` 삼중 정의(CF-8).** 05 브랜치에 `ui/pick-dialog/PickDialog.tsx`가 이미 있고(DECISIONS.md B5, 주석에 「06 S10 연결 고르기」), rev 10 SP-8은 `ui/confirm-dialog`에 검색 갈래를 따로 정의하며, 6.1-03 G-4는 같은 경로 `ui/pick-dialog/PickDialog.tsx`를 「새로」 만든다.
10. **VALIDATION.md는 아직 draft(RS-03).** Wave 0 · 서명 · M-9 표 미체크, 06-15 행의 `-t` 누락, 06-13 `dual-link-concurrency` 행 없음.
11. **6.1 쪽 조건.** 05-09가 05 브랜치에서 완료돼(`expenses.evidence_attach` · `expenses.evidence_void` — `domain/permissions/menus.ts:36-37` · `domain/evidence/index.ts:93-94`, pr162) notes-C의 「05 미반영이면 6.1 전체 착수 안 함」 조건은 pr162 기준 충족이다. 아직 main에는 없다.

## 1. 지난 게이트 검토

### 1.1 검토 파일별 날짜 · 판정

| 파일 | 날짜 · 커밋 · 대상 | 검토자 | 판정 · 건수 | 남은 것 |
|---|---|---|---|---|
| `.claude/gates/phase-06.log`(6줄) | plan-ceo-review 2026-09-24T23:52Z `a7f2f4e` · plan-eng-review 09-24T23:59Z `333f7bf` · plan-design-review 09-25T00:37Z · review 09-24T18:00Z · 09-26T10:10Z · ship 09-26T11:14Z | — | 앞 셋은 「원 기록 유실 · 사용자 승인 2026-09-26로 보고서 근거 기록」. 10/5 rev 10 설계 검토는 로그에 없다 | RS-01 RS-02 |
| `eng-review.md` | 브랜치 `claude/plan-phase-06-b3dsju` @ `a7f2f4e`(:4) · 게이트 기록 `333f7bf` · 날짜 줄 없음 | gstack plan-eng-review(무인) | 「E-1 반영 전 Build 진입 불가」(:80). 막음 1(E-1) · 고침 2(E-2 · E-3) · 참고 3(E-4 :42 · E-5 :55 · E-6 :59) · 테스트 빈칸 2(:51-52) · Outside Voice 「Codex 한도 — 한도 풀리면 Codex 재확인 필요」(:62 · :79) | RS-01 RS-08 RS-09 |
| `eng-cross-opus.md` | 기준 `a7f2f4e`(:4) · 날짜 없음 | Opus(Codex 대체, :3) | 판정 줄 없음. 막음 2(E-1 · E-2) · 고침 3(E-3 · E-4 · E-5) · 참고 3(R-1 :35 · R-2 :36 · R-3 :37). 전부 플랜에 반영(§1.5) | RS-01 RS-10 |
| `design-review.md` | 2026-09-25(:3) · 대상 `8dc58ec` = UI-SPEC rev 8(:4) · 게이트 기록 session `99102bb1` | Opus 본 검토 + Opus 교차(Codex 대체, :5) | 7/10(:21). 「막음 2건(DR-1 · DR-2) 반영 전 06-16 착수 불가」(:100). 막음 2 · 고침 8 · 참고 14(:58). 사용자 결정 셋 2026-09-25 11:13 KST(:62-66 · :103-105). 「Codex 한도 풀리면(2026-09-29 이후) rev 9 재확인」(:5 · :88 · :100) | RS-01 RS-04 |
| `design-apply-cross-r2.md` | HEAD `050d71a` · diff `e017ca2..f3d5112`(:3-4) · 날짜 없음 | Opus(읽기 전용) | 막음 1(X-1) · 고침 5(X-2 ~ X-6) · 참고 3(X-7 ~ X-9)(:46-49). 전부 Fable이 확인(fable:65-76), X-8만 부분 | RS-15 |
| `final-review-fable.md` | 2026-09-26(:3) · 반영 `0f3f653` | Fable(읽기 전용, 최종 전체 검토) | FIX_NEEDED · 막음 0 · 고침 4(F-F1 ~ F-F4) · 참고 3(F-N1 ~ F-N3). 「Codex 재확인 필요」(:88-89) | RS-05 RS-15 |
| `final-review-fable-r4.md` | 2026-09-26(:3) · `0f3f653` vs main `4347517`(:4) | Fable r4 재확인(Codex 대체) | FIX_NEEDED · 막음 0 · 고침 3(R4-F1 ~ F3) · 참고 3(R4-N1 ~ N3)(:6 · :31-33). 06 계획 r5에서 반영(`.continue-here.md:43`), R4-N3만 참고로 남음 | RS-13 |
| `COVERAGE.md` | 5줄 | — | 게이트 보고서가 아니라 「외부 API 연동 없음」 메모. fable:84가 「정확」으로 확인 | 없음 |
| `design-review-rev10.md`(52줄) | 2026-10-05 KST · UI-SPEC rev 10(`072b3bc`, PR #165) → 반영본 r2 `b1118415` · 사용자 확정 `b9a572d1`(10/5 01:53) | Opus 본 검토(7패스) + Opus 독립 + Codex 3회(:9-15) | 하드 리젝션 0. 독립: 막음 0 · high 2 · medium 8 · low 7. Codex 2차 「막는 문제 없음」, 3차 N1 ~ N5 | §1.6 §1.7 |
| `codex-design-review-rev10.md`(251줄) | 실행 `test-results/codex-design-review/20261004-163034-3775`(커밋 안 함) · `scripts/codex-design-review.sh` | Codex gpt-6.1-sol · medium | 후보 1건(합계 14 굵게 ↔ SYSTEM §6-1:409). 「실측 확인」 칸이 비어 있고 design-review-rev10.md C1이 사용자 결정 ⑥으로 닫음 | R10-C1 |
| `.continue-here.md` | 2026-09-26T10:55Z | — | 남은 참고 9건(:50), 사용자 결정(:54-58), Codex 갈음(:26 · :58) | §1.3 |

참고: 위 파일 밖에 있던 원본(`ceo-review.md` · cross-review-r1/r2 · checker-r1/r2 · `design-review-opus.md` · `design-apply-r2-brief.md` · `06-gates/`)은 저장소에 없고 각 플랜 ledger 인용으로만 남아 있다(fable:51-55 · `.continue-here.md:22`).

### 1.2 「Codex 재확인(2026-09-29 이후로 미룬 것)」이 가리키는 것

- **무엇인가.** Phase 6 계획 게이트(`/plan-eng-review` · `/plan-design-review` · 최종 검토)에서 Codex 외부 검토를 못 불러 Opus(나중에는 Fable)가 대신했고, 「한도가 풀리면 Codex가 다시 보라」고 적어 둔 꼬리표다. 사유는 Codex 한도 소진 — 2026-09-29 07:13 KST까지(`.continue-here.md:26`).
- **꼬리표가 붙은 자리.** `eng-review.md:62` · `:79`(Outside Voice) · `eng-cross-opus.md:3`(「Codex 대체 Opus 교차 검토 — 한도 풀리면 Codex 재확인 필요」) · `design-review.md:5` · `:88` · `:100`(rev 9 재확인) · `final-review-fable.md:88-89`(「한도 해제(≥ 2026-09-29) 뒤 Codex 재확인이 handoff대로 남아 있다」) · 플랜 25개의 ledger(「Codex」 82줄, 예 06-02:300 · :318 · :336 — append-only) · `reconcile.md:70` · `:125`.
- **닫힌 근거.** 사용자 결정 2026-09-26 「Codex 재확인은 Fable 검토로 갈음」(`.continue-here.md:26` · `:58`). 그에 따라 Fable 최종 전체 검토(`final-review-fable.md`)와 r4 재확인(`final-review-fable-r4.md`)이 대신했다. 한도 해제일(09-29)은 이미 지났지만 그 뒤로 Codex가 플랜 25개를 본 적은 없다.
- **진짜 Codex가 돈 것.** 2026-10-05 UI-SPEC rev 10(1차 4폭 캡처 + DOM 실측, 2차 UI-SPEC 1-1469줄 전문, 3차 반영 확인 — `design-review-rev10.md:13-15`). 대상은 UI-SPEC과 화면뿐이고, 1차는 계획 글을 프롬프트 한도(약 100KB)까지만 받았다. 플랜 25개 본문에 대한 Codex 검토는 한 번도 없다.
- **충돌.** `reconcile.md:107` · `:123`이 「Codex 계획 검토 + 승인 직전 최종본 전체 Codex 검토」를 필요 게이트로 적었다. CLAUDE.md §4(「외부(Codex) 검토는 디자인 검토에서만」) · §6 · §8과 규칙 훅 R3는 Codex를 `/plan-design-review` · `/design-review`(`scripts/codex-design-review.sh --plan <파일>`)에서만 허용한다. reconcile §7이 근거로 든 「프로젝트 지침 3장 · 10」은 저장소 문서에서 확인되지 않는다.
- **권고.** 재계획 CONTEXT · 게이트 기록에 「Codex 재확인 = 2026-09-26 사용자 결정으로 종결(Fable). 이후 Codex는 `/plan-design-review --plan`에서만」 한 줄만 남기고 다시 돌리지 않는다. 사용자가 reconcile §7을 유지하길 원하면 CLAUDE.md §4 공통 규칙대로 예외 승인이 먼저다(U-1).

### 1.3 플랜에 아직 없거나 참고로만 남은 지적 (id · 출처 · 대상 플랜 · 현재 플랜 본문)

판단 기준: 플랜 본문(must_haves · action · files · verify · acceptance)에 들어갔으면 「반영」(§1.5), ledger 줄에만 있으면 「ledger만」, 어디에도 없으면 「없음」. ledger는 append-only라 본문이 아니다.

| id | 출처 | 내용 | 대상 플랜 | 현재 플랜 본문 | 재계획에서 할 일 |
|---|---|---|---|---|---|
| RS-01 | `eng-review.md:62` · `:79` · `eng-cross-opus.md:3` · `design-review.md:5` · `:88` · `:100` · fable:88-89 · `.continue-here.md:26` · `:58` · `reconcile.md:70` · `:107` · `:123` · `:125` | Codex 재확인(2026-09-29 이후) — §1.2 | 절차(06-24 게이트 목록 · ledger 머리줄) | ledger 머리줄만(25개 플랜 82줄, 예 06-02:300 · :318 · :336) | 다시 돌리지 않는다. 종결 근거 한 줄만 CONTEXT · 게이트 기록에. reconcile §7과의 충돌은 U-1 |
| RS-02 | `phase-06.log:1` · `eng-review.md:16`(`ceo-review.md` 인용) · `.continue-here.md:50` | plan-ceo-review 보고서(`ceo-review.md`)가 저장소에 없다. 게이트 로그만 「원 기록 유실 · 사용자 승인 2026-09-26로 보고서 근거 기록」 | 절차 | 해당 없음 | 복원하지 않는다. CLAUDE.md §4 3번: CEO 검토는 마일스톤 수준에서만(reconcile:124도 같은 판단) |
| RS-03 | fable:86 · `.continue-here.md:50` · `06-VALIDATION.md:6-8` · `:66-77` · `:85` · `:142-151` · `:153-163` · `:178-187` | VALIDATION: (a) `status: draft` · `nyquist_compliant: false` · `wave_0_complete: false` (b) Wave 0 · 서명 · M-9 게이트 표가 전부 미체크 (c) :85 06-15 Task 2 행의 `-t "목록 지급 총액"`이 「세율 읽기 횟수」 테스트를 거른다 (d) 「동시 6건」 표(:66-77)에 06-03 · 08 · 12 · 19 · 22만 있고 06-13 `dual-link-concurrency`(CROSS-R1 B-1, 06-13:355 「샤드 A 배정」) 행이 없다(grep 0). 06-17 행 셋은 반영됐다(:104 · :110 · :113) | 06-13 · 06-15 · 06-24 | VALIDATION에만 있고 플랜 본문에는 없음 | `/gsd-validate-phase 6`(GSD 절차)로 다시 만든다 — `.planning/` 수동 편집 금지. `-t`가 두 이름을 모두 걸게 하고 06-13 행 추가. Wave 0 목록(`test/unit/domain/payments/` 등)이 재계획 뒤 파일 이름과 맞는지 확인 |
| RS-04 | `design-review.md:44`(DR-9) · `:56`(M-9) · `06-VALIDATION.md:142-151` · UI-SPEC UA-601 ~ 610 | 핵심 표면(S1 · S3 · S4 · S5 · S6 · S14 · S18)이 의존하는 Phase 5 UI-SPEC · `ui/attachments` · `ui/confirm-dialog` 대조. 지금 `05-UI-SPEC.md`와 `ui/attachments`는 pr162에만 있고 main에는 없다 | 06-15 · 06-17 · 06-19 · 06-20 · 06-01 | 있음 — design-apply-cross-r2.md:40 추적(M-9 → 06-15 · 06-17 · 06-19 · 06-20). 게이트 칸은 VALIDATION:142-151에서 미체크 | 05가 main에 들어온 뒤 UA-6xx ↔ `05-UI-SPEC.md` 대조를 착수 게이트 첫 줄에 둔다. 재계획 시점에는 pr162 기준으로 미리 대조 가능(replan-A §2.13) |
| RS-05 | fable:51-55(F-N1) · `UI-SPEC:55` · `design-review-rev10.md:33` · 6.1 플랜 13곳(6.1-01 ~ 6.1-09) | 저장소 밖 `/mnt/project-files/...` 인용 재발. 플랜 본문은 0건(ledger F-N1 줄 7개만: 06-02:305 · 06-05:342 · 06-07:341 · 06-08:308 · 06-09:319 · 06-12:315 · 06-14:333). `evidence-in-approval-rule.md`는 어느 ref에도 없고 `/mnt/project-files/05-prep/`에만 있다 | 모든 플랜(05 규칙 인용 시) | 플랜 본문 깨끗 | 05 규칙은 pr162 `05-09-PLAN.md` · `05-UI-SPEC.md` · `domain/evidence/index.ts` 심볼 이름으로 인용한다. 새 외부 경로를 만들지 않는다(UI-SPEC:55는 UI-SPEC 쪽 몫, replan-B) |
| RS-06 | fable:72(X-5) · `design-apply-cross-r2.md:49` | 06-24의 backstop 수 48(06-24:28 · :182 · :197 · :226). 지금 06-01 ~ 06-23 · 06-25의 `grep -c 'verification: backstop'` 합 = 48로 일치한다(전 플랜 합 51 − 06-24 자신 3). 재계획으로 화면 플랜이 달라지면 어긋난다 | 06-24 | 있음(06-24:182 「실행 전에 다시 세어 SUMMARY에」) | 재계획 끝에 숫자를 다시 센다. 숫자를 박지 말고 「grep -c 합」만 적는 쪽이 안전 |
| RS-07 | `design-apply-cross-r2.md:34`(체커 W3) · 06-17:437 · :454 · 06-20:358 · :373 · replan-D §0-8 | 06-17(태스크 4 · 487줄 · 약 115k 토큰) · 06-20(태스크 4 · 약 95k)의 「태스크 4 경고 유지」(오케스트레이터 판단). 같은 결의 크기 이상치: 06-07 · 06-09 약 110k, `files_modified` 15개 이상 6개(06-03 · 06-07 = 17). rev 10(SP-8 · 결과 줄 · 짝 격자)이 이 플랜들을 더 키운다 | 06-17 · 06-20 · 06-03 · 06-07 · 06-09 | ledger만 | 재계획 때 분할 여부를 처음부터 정한다. 「분할 안 함」 사용자 결정(`.continue-here.md:54`)은 06-03 · 06-07 · 06-17 · 06-20에 대한 것이고 rev 10 이전 크기 기준이다 |
| RS-08 | `eng-review.md:42`(E-4) · `.continue-here.md:50` · 06-11:409 · 06-16:416 | 06-16 · 06-25 첨부 주인 CHECK 갈래 ⒜(`owner_kind IN`)/⒝(주인별 FK 칸)를 실행 중에 고르는 분기. 05 실물이 ⒜로 정했다(`files_owner_kind_check IN ('expense')` — `db/schema/files.ts:35`) | 06-16 · 06-25 · 06-11 | 있음(분기 문구 06-16:190, ⒝ 관찰 줄 06-11:409 · 06-16:416) | ⒜로 확정하고 ⒝ 문구 · 관찰 줄을 뺀다. 마이그레이션은 둘(NOT VALID 생성 1 + `--custom` VALIDATE 1 — squawk 실측 replan-A §2.9). 위험 경로 PR |
| RS-09 | `eng-review.md:59`(E-6 · N-5) · 06-10:319 | VALIDATE 분리가 drizzle 단일 트랜잭션에서 무력하다는 참고 — 「문구 정정만」(06-10:265 권장). 「VALIDATE를 별 트랜잭션에서」는 범위 밖으로 기각 | 06-10 · 06-16 · 06-25 | 06-10:43 · :200은 이미 `NOT VALID` + `--custom` VALIDATE 별 파일 | 05와 같은 두 파일 규칙이라 추가 조치 없음. 새 CHECK를 더하는 플랜 전부가 같은 규칙을 따르는지만 확인 |
| RS-10 | `eng-cross-opus.md:32`(E-5 대안 ⒝) · 06-07:385 | 잠금 순서 검증 대안 — 06-13 `dual-link-concurrency`에 역순 id 두 요청 병렬 케이스. 채택 안 함(⒜ `.toSQL()` 단언만) | 06-13 · 06-07 | ⒜만 반영(06-07:74 · :173 · :201). ⒝는 없음 | 역순 병렬 한 케이스를 06-13에 더할지 결정한다. 비용이 작고 교착 회귀를 실제로 증명하는 유일한 길이다 |
| RS-11 | 06-03:368(CROSS-R1 R-3 · R-4 참고) | `taxRatesReader` 날짜 비교(`dateOnly`)와 `loadTaxRates` 순차 읽기 — 「다음 라운드에서 받으면 Task 1 ③ 한 줄」로 미룸. Q6(미래 지급일)과 맞물린다: 원천징수 · 회사 대납은 지급일 기준 세율이다(06-03:205) | 06-03 | ledger만(06-03:368). Task 1 ③(06-03:204-206)에는 없음 | Q6 반영(GA-129)과 함께: 미래 지급일의 `loadTaxRates(지급일)` · `pickTaxDates(doc, payDate, today)` 동작을 06-03 Task 1 ③에 한 줄 |
| RS-12 | fable:86 · `.continue-here.md:50` · `reconcile.md:67` | 06-21 TOCTOU — 이름뿐이고 원 지적문이 저장소에 없다(cross-review 원본 소실). 가장 가까운 근거는 06-21:47(CROSS-R1 F-5: 취소 권한 판정은 원장 트랜잭션 전, 완료 프로젝트 판정은 트랜잭션 안) — 판정과 사용 사이의 틈 | 06-21 · 06-18 | 이름도 본문에 없음(`TOCTOU` grep 결과는 fable:86 한 건) | 재계획에서 한 줄로 정의(어느 확인과 어느 쓰기 사이인지)해 닫거나 「해당 없음」으로 기록한다 |
| RS-13 | `final-review-fable-r4.md:33`(R4-N3) · 06-15:426 · 06-21:340 · `.continue-here.md:50` | `tx?` 선택 인자 — 트랜잭션 안 호출자가 `tx`를 빠뜨리면 조용히 풀 `db`를 읽는 PR #75 꼴 위험. 지금 호출자는 안전. 6.1-12:176은 `hasEvidence(viewer, owner, tx)`가 트랜잭션 안에서 같은 `tx`로 읽기를 요구한다 | 06-06 · 06-15 · `hasEvidence`를 세우는 플랜(K-1) | 있음(06-06:35 `evidenceGateInputs(viewer, lockedDoc, pre, tx?)`, 06-15:172 · :426) | `hasEvidence`의 `tx` 규칙을 먼저 정한다. domain은 `db`를 import할 수 없으므로(`eslint.config.mjs:46` — F-F1) 선택 인자를 유지하고 「트랜잭션 콜백 안 `hasEvidence(` 호출은 `tx` 인자를 가진다」는 grep · 테스트 가드를 둔다 |
| RS-14 | `.continue-here.md:50` · 06-09:376 · 06-25:409(R-1) · `UI-SPEC:693` · `:377` | 삭제한 카드 사용은 토스트 수명 안에서만 되돌릴 수 있다. rev 10은 토스트를 폐지하고 삭제 = 보관함 이동 + 표 위 결과 줄 `카드 사용 삭제됨 · 48,000` + 3차 `되돌리기`(보관 해제, 같은 서버 판정)로 바꿨다 | 06-09 · 06-25 · 06-05 | 낡음 — 06-09:45-47 · :69-70 · :89 · :139 토스트 `되돌리기`(`restoreCardUsage`), 보관함 등록 안 함(06-09:376), 06-25:409 「토스트 수명뿐」 | 06-09를 결과 줄 방식으로 다시 쓴다. 보관함 복원(`ARCHIVABLE_TABLES`)은 D-609 게이트를 우회하므로(06-09:376) 계속 하지 않는다. 06-25 T-06-201 「되돌리기 뒤 중복」 재확인 |
| RS-15 | `design-apply-cross-r2.md:19`(X-8) · fable:61-63(F-N3) · `.continue-here.md:50` · 06-25:408 | EVID-01 배정: ROADMAP:696 · REQUIREMENTS:226은 Phase 5, 06-25가 카드 몫을 청구한다. ROADMAP:781은 이미 「EVID-01 카드 몫」으로 고쳤고 `Plans: 25 plans`(:728)이지만 REQUIREMENTS 표는 그대로다. 05-09 SUMMARY(pr162)는 지출결의 몫 EVID-01을 완료로 적는다 | 06-01 Task 3 · 06-24 | 있음(06-01:33 · :107 · :208-241 REQ-ROUTE). 단 06-24 frontmatter requirements에 EVID-01이 없다 | 06-01 Task 3(사용자 선택 경로)로 「Phase 5(지출결의) + Phase 6(카드 사용)」 분할을 GSD 도구로 반영. 06-24 requirements에 EVID-01 추가 |
| RS-16 | `.continue-here.md:50` · 06-03:420 · :427 등 | 옛 ledger 문구(「커밋 뒤」 · `deferRecord`)는 append-only라 남아 있고 S-F1 / R4-F2 줄이 대체(Supersedes)한다. 14개 플랜 · 본문 0건(`deferRecord` 매칭은 전부 ledger 줄) | 14개 플랜 | ledger만 | 재계획이 ledger를 이어 쓸 때 Supersedes 줄을 유지하고 옛 문구를 본문에 되살리지 않는다 |
| RS-17 | `design-review.md:47-52`(H-4 · M-4 · M-5) → rev 10 | 플랜 본문이 rev 9 표면으로 쓰여 있다. 토스트: 10개 플랜 61줄(06-05:1 · 06-08:2 · 06-09:23 · 06-12:7 · 06-14:15 · 06-15:3 · 06-16:2 · 06-17:4 · 06-20:1 · 06-25:3). 카드 사용 폼: `card-usage-form.tsx` `?new=1` 페이지 폼(06-05 · 06-07 · 06-09 · 06-12 · 06-14). rev 10: 토스트 없음 · 결과 줄(UI-SPEC:177 · :377-378), 한 건 폼은 옆 패널(S9 · S12 · S13, `?new=1` 라우트 유지) | 06-05 · 06-07 · 06-08 · 06-09 · 06-12 · 06-14 · 06-15 · 06-16 · 06-17 · 06-20 · 06-25 | 낡음 | replan-B(UI-SPEC rev 10)와 함께 고친다. 결과 줄 · 패널 문구를 플랜 acceptance에 옮긴다 |
| RS-18 | `06-RESEARCH.md:337-348`(Assumptions AS2 · 「사용자 확인 필요」) · 06-06:133 · 06-10:132 | AS2 「증빙 확인 · 면제는 새 행동 종류 없이 `document_update`」가 확인 기록 없이 플랜에 박혔다. 그 사이 6.1-01이 끌 수 없는 행동 `evidence_amount_change`를 더했다. 06-03 · 06-12는 `payment_process` · `purchase_process`(이미 `CORE_ACTION_TYPES`)를 쓴다 | 06-06 · 06-10 | 있음(06-06:37 · :157 · :284, 06-10:132 · :272) | 재계획에서 AS2를 확정으로 적거나 새 종류를 둘지 사용자 확인 한 줄(CF-9) |
| RS-19 | `06-RESEARCH.md:349-365`(Open Question 3) | 지급 · 카드 · 구매 요청 금액을 정보 노출표(`domain/permissions/info-items.ts`)에 몇 개 `infoItem`으로 둘지 미결. 정보 항목 언급은 06-07 · 06-18 · 06-19 ~ 06-23뿐이고 06-03 · 06-05 · 06-08 · 06-12의 새 DTO에서는 키를 정한 곳이 grep으로 안 보인다 | 06-03 · 06-05 · 06-08 · 06-12 | 없음 | 새 키 목록을 06-02(권한 · 설정 공통 기반)에서 한 번에 정해 누수 스캔이 자동으로 걸리게 한다(RESEARCH 권고). 05는 `expense.value` · `expense.amount`를 이미 더했다(replan-A §1-22) |
| RS-20 | `06-CONTEXT.md:134-135`(다른 페이즈 소관) | (a) 회사 대납 세금 기본값 — 05가 `tax.company_borne` 기본을 0.22 · gross_up으로 맞춰 닫았다(pr162). (b) 필요경비 0% 기타소득(22%) 구분 키 — 열려 있다(Phase 5 EXP-15 또는 Phase 11 CERT-04). 05도 필요경비 비율 키를 더하지 않았다 | 06-03 · 06-04 | 본문에 필요경비 구분 없음 | 06은 하지 않는다. 원천징수 세율 하나로 계산한다는 전제만 06-03에 한 줄로 남긴다 |
| RS-21 | `06-CONTEXT.md:128-130` | Deferred: 선결제 14일 독촉 · 대리 등록 PM 알림 → Phase 7, 지급 예정일 자동 계산 · 결재 마감 → Phase 7, 카드사 명세 대사 → 백로그였다가 6.1(D-6111)이 승격 | 06-10 · 06-09 · 06-23 | 06-23은 「내 차례」 항목만(알림 아님). 알림은 없음 | 06 범위 밖 유지. 6.1 승격분은 §3.2 NP-2로 |

### 1.4 이전 검토가 못 잡은 낡은 가정 (이번 조사에서 확인)

| id | 내용 | 근거 | 대상 플랜 | 할 일 |
|---|---|---|---|---|
| ST-1 | `project.completed-lock` 규칙 이름은 main에 없다. 플랜 17곳 + RESEARCH 2곳이 인용한다: 06-03:177 · 06-04:133 · :226 · :239 · 06-07:145 · :183 · :232 · :305 · 06-18:38 · :159 · :169 · 06-19:162 · :186 · 06-21:31 · :47 · :144 · :153 · `06-RESEARCH.md:61` · :214 | `test/unit/domain/rules-gate.test.ts:29-31`(「옛 이진 규칙 project.completed-lock은 없다」). 실제: `project.line-edit`(`domain/rules/register.ts:64`) · `quoteLockReason({ status, approvedSeq })`(`domain/quotes/edit-scope.ts:127`) · `CompletedProjectError`(`domain/projects/index.ts:72`). 완료 값은 `completed`(`domain/projects/status-transitions.ts:5`, 06-09:128 A-601 가드는 `settled` — replan-A §1-15) | 06-03 · 06-04 · 06-07 · 06-09 · 06-18 · 06-19 · 06-21 · 06-12 | 한 이름으로 통일(K-5). 완료 프로젝트에서 되는 일 목록(GA-38)과 같이 정한다 |
| ST-2 | SP-6 · `lastEvidenceDeleteNeedsConfirm`은 rev 10이 철회했다(`UI-SPEC:64` · `:1119` — 떼기가 있는 상태에는 확인 기록이 없고 확인 기록이 있는 상태에는 떼기가 없다). 플랜 쪽: 06-01:96 · :182 · :186 · :298 · 06-11:51 · :75 · :118 · :248 · :264 · :272-275 · :356 · 06-16:38 · :143 · :241 · 06-25:51 · :151 · :288 · :312 · :322 | 6.1-12 P-LAST(:143)가 이 함수의 호출부를 찾는다 | 06-01 · 06-11 · 06-16 · 06-25 | 함수와 SP-6 문구를 뺀다(GA-79 재설계의 일부). 6.1에는 호출부가 없어졌음을 알린다 |
| ST-3 | 구매 요청 상태 낱말: 플랜은 `신청`(백틱 41곳 — 06-01:1 · 06-08:2 · 06-12:9 · 06-13:2 · 06-14:22 · 06-25:5, `신청됨` 0곳). UI-SPEC rev 10은 `신청됨`(40곳)이고 `ui/status-tag/status-map.ts`에는 이미 `신청됨: "muted"`(확인증, :52)가 있다 | reconcile:47 「`신청`(06)과 04.3 `신청됨`이 겹치니 낱말을 다시 고른다」 | 06-01 · 06-08 · 06-12 · 06-13 · 06-14 · 06-25 | 낱말을 `신청됨`으로 통일하고 `status-map.ts` 처리는 처음 쓰는 플랜이 한다(replan-A §1-11) |

### 1.5 반영이 확인된 것 (다시 열 필요 없음)

- `eng-review.md`: E-1(막음) 정산 점검 사전 읽기 — 06-19 Task 3 ③ `loadPreSettleInputs` · 06-22 승인 트랜잭션 전 읽기 · 「동시 6건」 통합 케이스(06-19 · 06-22). E-2 — 06-03 ⑴' `loadPaymentInputs`가 트랜잭션 전(06-03:206-207). E-3 — 06-03:45 「06-03 tx 규약」. E-5 멱등성 — 06-15:42 · :215 · :231 · :330. 테스트 빈칸 둘 — 같은 케이스로 채움.
- `eng-cross-opus.md`: E-1 · E-2(번호 서식 사전 읽기) · E-3(`createCardUsage(viewer, input, pre, tx?)` 06-05:180 · :329 · 06-12:158) · E-4(06-18:49 · :127 — main 04-12 · 04-41에서 해소) · E-5(06-07:74 · :173 · :201) · R-1(06-05:35 · :221-222) · R-2(06-05:36) · R-3(06-04:42 · :241 · :261 · :326).
- `design-review.md`: DR-1 · DR-2(UI-SPEC S21 · S22 + 06-16) · DR-3(06-05 · 06-11 · 06-16 · 06-25) · DR-4 · C-1(06-01 · 06-05 · 06-06 · 06-15 · 06-17 · 06-20) · DR-6 · H-3(06-01 · 06-15 · 06-17) · DR-7 · DR-8(06-17:294) · DR-9(06-01 · 06-16, 단 RS-04) · DR-10(06-17) · DR-11(`eng-review.md:9` 정정) · DR-12 · H-1(06-23:217) · H-2(06-17) · H-5(06-17:65 · :231 · :237) · M-1(06-17:426) · M-2(06-15 · 06-17) · M-3(06-17 · 06-20:40) · M-6(06-19 · 06-22) · M-7(06-15:36 · 06-20:41). H-4 · M-4 · M-5는 rev 9 문구로 반영됐으나 rev 10이 대체한다(RS-17). M-8은 기각(06-01 · 06-18:337). 사용자 결정 셋(DR-3 · DR-4 · DR-2)은 UI-SPEC O-6 · O-21 · O-22로 확정.
- `design-apply-cross-r2.md`: X-1(06-11:37 · :214 · :216 — fable:68) · X-2(06-16:217 · 06-25:43) · X-3(06-25:155) · X-4(06-11 · 06-25 `repositories/files.ts`, 06-25:308) · X-5(RS-06) · X-6(절 이름 인용으로 교체, 플랜 본문에 UI-SPEC · SYSTEM 줄 번호 인용 0건) · X-7(06-25:173) · X-9(UI-SPEC:125 · :1324 출처 명시). X-8은 RS-15.
- `final-review-fable.md`: F-F1(06-15:172 `tx` 생략 + 06-06:35 `tx?`) · F-F2(06-20 투영 함수를 `domain/payments/index.ts`로) · F-F3(06-21 취소 = 06-18 `saveIssueRequestRows` 취소 갈래, 06-18:169 · :171) · F-F4(06-10 files에 `repositories/expense-payments.ts` + `lockExpenseRow` 반환 칸에 `prepaid`) · F-N2(06-03 `71eba82`, 옛 `70a39d4`는 ledger 06-03:404에만). F-N1은 RS-05, F-N3은 RS-15.
- `final-review-fable-r4.md`: R4-F1(06-15:197 `prepaid`) · R4-F2(행동 로그를 main 규약 같은 tx 안 `recordAction(…, { tx })`로 — 06-03 「같은 tx 기록 검사」, 12개 플랜) · R4-F3(줄 번호를 심볼 이름으로) · R4-N1 · R4-N2(06-21:334 · :335 「고침」). R4-N3은 RS-13.
- 플랜 ledger 인계 중 착지한 것: 06-07:401 → 06-13:48 · :99(`/cards?new=1&line={id}`) · 06-15:368 H-5 → 06-17 Task 2 · 06-15:369 DR-8 → 06-17 Task 3 · 06-17:434-435 C-1 ① ④ → 06-20:38-39 · 06-17:455 VALIDATION 행 → VALIDATION:104 · :110 · :113 · 06-06:345 DR-4 모달 → 06-17 Task 4 · 06-20 Task 3 · 06-02:332 번호 경합 동시 6건 → 06-08:193-204 · 06-18:311 audit-B → main 해소(06-18:127).
- RESEARCH Open Question 1(Phase 4 머지 상태)은 낡았고 OQ2(조정 줄을 연결 대상에 넣을지)는 06-07:44(「조정 줄 · 취소 줄은 연결 고르기 목록에 없다」)로 닫혔다.

### 1.6 UI-SPEC rev 10 검토 지적 (`design-review-rev10.md`) — UI-SPEC에만 반영, 플랜 본문에는 없음

플랜은 2026-10-01 이후 수정된 적이 없어 아래 전부가 「플랜 본문 없음」이다(`SP-8` · `O-23` · `짝 격자` · `검색 고르기` grep 0). 표시는 `design-review-rev10.md:20-49`의 id.

| id | 지적 · 결정 | 대상 플랜 | 비고 |
|---|---|---|---|
| R10-F1 | F1 · N1 · N2(high) S10 고르기 목록의 컴포넌트가 없다 → SP-8 `ui/confirm-dialog` 검색 고르기 갈래(검색 · 행 막힘 · 현재 줄 · 1차 `이 줄로 Enter` · LOADING · EMPTY · ERROR). UI-SPEC:787-793 · :1129 | 06-01(SP-8 시스템 변경) · 06-07(S10) · 06-09 · 06-14(S12) | 05 `ui/pick-dialog/PickDialog`가 이미 이 역할(CF-8). SP-8을 PickDialog 재사용으로 고칠지 U-7 |
| R10-F2 | F2(high) 금액 없이 붙은 증빙(05 결재 중 붙이기)의 `확인 전` — 제자리 모달에 금액 칸이 없다 → 문서 화면 + S4 금액 칸 열림 + 1차 막힘 `증빙 금액 없음`. 승인액 자동 채움 안 함 | 06-17(S1 제자리) · 06-06(서버 갈래) · 06-20(S3) | 05에는 증빙 금액 칸 자체가 없다(replan-A §1-6) |
| R10-F3 | F3 `확인 전`(accent) ↔ `확인됨`(success) 비슷한 초록, 견적 줄 상태 `구매 요청`과 행동 `구매 요청` 같은 낱말 → 색은 그대로 두고 낱말만 `구매 요청 중` | 06-01 · 06-13 · 06-08 · 06-14 | ST-3과 함께 |
| R10-F4 | F4 · R5 S9 수정 뒤 토스트 문장이 「토스트 없음」과 모순 → 지움(행 값이 바뀜) | 06-05 · 06-09 | RS-17 |
| R10-F5 | F5 S5 행동 뒤 누른 버튼이 사라지면 포커스 미정 → 새 1차, 없으면 결과 글자(`tabindex=-1` · `role=status`) | 06-04 | |
| R10-F6 | F6 · R2 · R6 S13 — 구매 완료 뒤 포커스를 다음 `신청됨` 행 `구매 완료`로(없으면 제목) · 실행가 초과 문구에 `견적 줄은 담당 PM 박서연` · 활성 카드 0장 상태(`활성 법인카드 없음 · 카드 등록은 관리자`) | 06-12 | Q3 상한과 연결(CF-3) |
| R10-F7 | F7 S1 고른 이체액 합 → 숫자 `--text-body` + `--fw-bold` | 06-15 · 06-17 | |
| R10-F8 | F8 · O-23 Q4 짝 설정 입력 모양 → 짝 격자(SYSTEM §7-2 새 입력 타입). 사용자 확정 10/5 01:53 | 06-02 · 06-03(SP 기록) | GA-80 |
| R10-F9 | F9 미래 지급일(Q6) 건이 S3 그룹에 없음 → 맨 앞 `예정 지급` 그룹 | 06-20 | GA-129 |
| R10-F10 | F10 S21 · S22 파일 삭제가 즉시이고 되돌리기가 없음 → 결과 줄 + `되돌리기`(§7-8 :1008) | 06-16 | |
| R10-F12 | F12 외화 2행 형식이 둘 → :361 형식 하나로 | 06-05 · 06-12 · 06-14 | |
| R10-F15 | F15 S11 아이콘 링크 누르는 영역 → 44×44(`--touch-min`) | 06-14 | |
| R10-F16 | F16 · M1 이 문서가 잰 대비 쌍이 `tokens.test`에 없음 → 06-01이 단언 추가. status-map 줄 인용 어긋남 고침 | 06-01 | |
| R10-R1 | R1 · N3 제자리 확인 성공 뒤 자동 선택이 Q4 짝 막힘을 무시 → 선택 칸이 `고를 수 있음`일 때만 자동 선택, 짝 막힘 갈래는 선택 없음 · 이유 · 행 링크 포커스 | 06-17 · 06-20 | GA-80 |
| R10-R3 | R3 SP-7이 LOADING · 새로 고침 뒤 열린 채 유지를 공용 계약에 안 넣음 | 06-01 · 06-17 | |
| R10-C1 | C1 합계 14 굵게가 SYSTEM §6-1:409(subtitle 700)와 다름 → 사용자 결정 ⑥(CHECKLIST:35)이 이기고 SYSTEM 문장 정리를 06-01에. Codex는 읽기 목록의 합계 줄과 편집 표의 합계 행을 구분하라고 짚었다(`codex-design-review-rev10.md` 후보 1) | 06-01 · 06-15 · 06-17 · 06-20 | |
| R10-DOC | F11 · R8(와이어프레임 `증빙 기한 —` 삭제) · F13 · R9(O-6 · O-21 · O-22 확정 표기) · N4 · N5(문구) — UI-SPEC 문서 수정뿐 | 없음 | |
| R10-DROP | 버린 것: F14(`evidence-in-approval-rule.md:85` 사용자 답 Q2로 확정) · F17(S11 :805에 이유) · R4(발행 요청 취소 확인 창은 SYSTEM §7-3 :905 규칙). R7은 참고 | 없음 | |

### 1.7 열린 선택 — 확정 표시가 없는 17행 (UI-SPEC:1387-1411)

표 머리(:1384): 「사용자가 이번 세션에 답할 수 없어 추천안으로 이 문서를 썼다. `/gsd-plan-phase 6` 전(또는 `/plan-design-review` 때) 한 줄씩 확인한다.」 확정된 것: O-6 · O-21 · O-22(2026-09-25) · O-9(Q2, 10/5 00:55) · O-23(10/5 01:53) · O-18(rev 2에서 닫힘). O-2는 `design-review.md:7` · `.continue-here.md:54`에서 사용자 확정이다(표 표기만 낡음).

| id | 질문 | 추천(UI-SPEC) | 플랜의 기본값 자리(plan:line) |
|---|---|---|---|
| O-1 | 경영관리 작업 화면 구성 | 1차 메뉴 안 + 「내 차례」가 모음 | 06-08:126 · 06-14:145 · 06-15:139 · 06-21:119 · 06-23:90 |
| O-2 | 증빙 확인이 지급의 게이트인가 | 게이트다(확인 전이면 지급 막힘) — 사용자 확정 | 06-01:104 · 06-06:33 · 06-11:170 · 06-15:43 · 06-23:126 |
| O-3 | 일괄 지급의 지급일 | 확인 모달 날짜 한 칸 | 06-15:44 · 06-17:37 |
| O-4 | 선결제를 누가 · 언제 켜나 | 기안자(PM)가 제출 때만 | 06-01:124 · 06-10:40 |
| O-5 | 선결제 증빙 기한 기준일 | 지급일부터 N일(설정, 기본 14) | 06-01:124 · 06-10:41 · 06-23:80 |
| O-7 | 외화 카드 입력 | 외화 금액 + 환율 → 서버가 원화 | 06-05:38 |
| O-8 | 카드 「견적 외 비용」 연결 | 저장할 때 견적 외 비용 줄을 새로 만든다 | 06-07:43 |
| O-10 | 구매 요청 예상 금액 기준 | 결제 합계(부가세 포함), 차이는 보이고 막지 않음 | 06-01:123 · 06-08:127 · 06-12:39 |
| O-11 | 카드 사용 수정 · 삭제 권리 | 등록한 사람 · 대리 등록 권한자, 완료 프로젝트 줄은 대리 등록 권한자만 | 06-01:125 · 06-09:38 · 06-12:34 · 06-25:187 |
| O-12 | 발행 요청 상태 · 금액 기준 | `신청됨` · `발행됨` · `취소`, 금액 = 공급가 | 06-01:105 · 06-18:90 · 06-21:30 |
| O-13 | 온라인구매 협력사 설정 | 문자열 한 칸 | 06-01:123 · 06-02:36 · 06-08:37 |
| O-14 | 결재 중 문서의 증빙 없음 표시 | 제출된 문서면 `증빙 없음`이 `지출결의 중`을 이긴다 | 06-01:103 · 06-13:33 · 06-19:138 |
| O-15 | 「내 차례」 공급 함수 | 이 페이즈 계획이 05 산출물을 보고 정한다 | 06-23:35 |
| O-16 | 대표 승인 때 완료 전 점검 재실행 | 한 번 더 돈다 | 06-19:91 · 06-22:30 |
| O-17 | 계좌 노출 범위 | 지급 권한자만 | 06-03:261 · 06-20:30 · 06-23:222 |
| O-19 | 구매 요청 팀 비용의 팀 | 구매 완료 사용일의 요청자 소속(`teamAtDate`) | 06-12:63 · 06-14:34 · 06-23:30 |
| O-20 | 요청자 = 결제자 허용 | 막지 않음 | 06-12:40 · 06-14:70 |


## 2. 옛 시스템(260907) 대조 — gap-audit 06 행

- 출처: `/mnt/project-files/notes/260907-gap/gap-audit.md`(2026-10-04, 기준 main `55647a0b`). 행 번호는 옛 규칙 문서 `.planning/research/ERP260907-CONTEXT.md`의 줄 번호이고 MF:44만 `docs/research/erp260907-money-flow.md:44`다. gap-audit 파일 안의 줄은 L43 · L72 · L80 · L81 · L107 · L132 · L143 · L145 · L162.
- 결정 출처: reconcile.md §5(:96-100)가 06에서 고칠 행을 지정했고 §8 Q2 ~ Q7(:129-135)을 사용자가 추천안대로 확정했다(2026-10-05 00:55 KST, UI-SPEC:36-47). 행 38은 Q 목록 밖이다 — reconcile §2 06-12 행(:58)의 추천 「허용」이 UI-SPEC:49에 기본값으로 적혔고 「계획이 06-12에서 확정한다」.
- 「현재 플랜 본문」은 25개 플랜 본문을 grep한 결과다. UI-SPEC rev 10에는 있지만 플랜에는 없는 것은 「UI-SPEC만」이라 적었다.
- 요지: 플랜 본문에 이미 들어간 것은 MF:44(= Q2 = O-9, 06-14:37 · :62)뿐이다. 38 · 67 · 79 · 80 · 129는 본문 0건이고, 159(Q7) · 184 · 186은 「06 변경 없음」이 맞다.

| id | 옛 규칙(260907 원문 요지) | 빠진 것 · 결정 | 현재 플랜 본문 | 제안 대상 플랜 · 할 일 |
|---|---|---|---|---|
| GA-38 | 260907:38 · gap-audit:43(확정 2026-08-24 총-5). 「완료로 잠기면 견적 · 매출 · 새 지출 막힘. 단 사후 처리(실제 지급일 적기 · 구매요청 처리 · 원천징수 적기)는 완료 뒤에도 가능 — 완료 후 대금 지급 · 계산서 수령이 흔하기 때문」 | 지급 완료 · 지급 취소 · 조정 줄은 이미 덮임(06-CONTEXT:32 · D-606 :42 · 04-CONTEXT D-47). 빠진 것: (1) 완료 프로젝트의 구매 요청 「구매 완료」 처리, (2) 원천징수 확정(CERT-04) — (2)는 Phase 11 몫이라 06은 안 한다. 결정: Q 목록 밖, reconcile §2 06-12 추천 = 허용(D-47과 같은 결, 이미 신청된 구매는 처리한다). UI-SPEC:49 · :839 · :1271이 기본값으로 적고 「06-12 확정」으로 넘겼다 | 본문 0건. `completePurchaseRequest`(06-12:153)는 `신청` 아님만 거부하고 프로젝트 상태를 보지 않는다. 06-08 · 06-12 · 06-14에 「완료 프로젝트」 문구가 없다. 06-09:38 · :137(O-11)은 완료 프로젝트 줄의 카드 사용 수정 · 삭제 권리만 다룬다 | 06-12 Task 1: 「프로젝트가 완료여도 `신청` 요청은 구매 완료할 수 있다」 한 줄 + 통합 한 케이스(완료 프로젝트 줄 + `신청` 요청 → 성공, purchase 갈래 카드 사용 생성). 06-08: 새 요청을 만드는 쪽이 완료 프로젝트에서 막히는지 문구가 없다 — 같이 한 줄. 규칙 이름은 ST-1에서 정한 하나로. 6.1-06:66 E40(완료 프로젝트 증빙 붙이기 거부)과의 범위는 CF-7 · U-4 |
| GA-67 | 260907:67 · gap-audit:72(확정 2026-09-03, 근거 06_구매요청.md:170-273). 「카드는 사람이 고르지 않고 배정(개인 → 팀 → 공용 순) 및 카드사 파일이 정한다(다르면 파일이 이긴다)」 | 빠진 것: 공용 카드 배정, 「파일이 이긴다」(후자는 6.1 D-6111로 승격 — NP-2). 결정: Q5 = 06에서 받는다(UI-SPEC:45, 소지자 · 팀 없는 카드, 「지금 스키마에 없음」). 현 스키마는 소지자 XOR 팀을 강제한다 — `corp_cards_owner_xor_check`(`db/schema/corp-cards.ts:32-35`) · `cardOwnerKind`(`domain/corp-cards/index.ts:44-54`, 둘 다 없으면 `InvalidCardOwnerError`) · `test/unit/corp-cards/owner-rule.test.ts:16-20` · `test/integration/corp-cards.test.ts:112` · `:122` · 관리 폼 `app/(app)/admin/corp-cards/card-form.tsx` | 「공용」 0건. 06-05의 카드 자격은 소지자 본인 · 사용일 소속 팀의 카드뿐이다(06-05:60 · :179 · :301, 목록 범위 06-05:137 UA-612). reconcile §8 Q5의 「06-05 갈래 하나」로 끝나지 않는다 | 06 밖 선행 PR(Phase 3 corp-cards 변경): CHECK 완화(NOT VALID 생성 + `--custom` VALIDATE 두 파일), `cardOwnerKind` 공용 갈래, 관리 폼 · 테스트. 위험 경로(`db/schema/` · `db/migrations/`)라 사용자 머지(U-2, replan-D §4). 그 뒤 06-05(자격 판정 갈래 + 팀 귀속은 사용한 사람의 사용일 소속 `teamAtDate`) · 06-09(`cardUsageRights`가 공용 카드에서 누구를 소지자로 보는지) · 06-12(구매 완료 카드 고르기). REQUIREMENTS:43 EXP-07 문구(「자기 카드 · 자기 팀 카드」)는 GSD 도구로 고친다. 사용자 확인: 공용 카드 사용 등록 자격(소지자가 없어 기준이 없다) |
| GA-79 | 260907:79 · gap-audit:80(확정 2026-08-28, 근거 05_증빙.md:366-393). 「결재 중인 지출결의에는 원칙적으로 아무도 증빙을 못 떼고(앞 결재자가 본 근거가 사라지면 안 됨), 붙이는 것은 경영관리만(작성자는 결재 끝난 뒤). 붙어도 결재 중에는 금액 · 부가세를 재계산하지 않는다」 | gap-audit 「일부」: 05-09가 다른 방식으로 막고, 빠진 것은 「붙이기는 경영관리만」 · 「결재 중 재계산 안 함」 결정. 결정: 05 결정 「결재 중 증빙」(사용자 2026-10-04, UI-SPEC:55-66) — 결재 중 아무도 안 뗌 · 붙이기는 `expenses.evidence_attach` 권한자만 · 승인 뒤 기안자 추가 + 시스템 관리자 `expenses.evidence_void` 무효 · 「살아 있는 파일」 = `removed_at IS NULL AND voided_at IS NULL`. 05-09는 pr162에서 완료(`domain/permissions/menus.ts:36-37` · `domain/evidence/index.ts:93-94` · `repositories/files.ts:13` · `:44`) | 옛 모델이다. 06-11:36-37 · :118(PM이 결재 통과 문서에서 붙이고 떼면 훅이 version +1), SP-6 · `lastEvidenceDeleteNeedsConfirm`(ST-2), 「살아 있는 파일」 정의 · `voided_at` 0건(06 전체). 05 쪽 메모 `/mnt/project-files/05-prep/evidence-in-approval-rule.md:61`이 06-11:51 · :118을 지목했다 | 06-11 재설계: 확인을 푸는 훅은 「승인 뒤 기안자 추가」와 「시스템 관리자 무효」 두 경로뿐, 결재 중 권한자 추가는 확인 기록이 없어 확인에 손대지 않고 결재 인스턴스 `version`만 05가 올린다. SP-6 삭제(ST-2). 「살아 있는 파일」 정의는 `hasEvidence`(K-1) 한 곳. 06-23 신호는 05 `listEvidenceVoidSignals`와 한 신호로(reconcile:69). 06-04 · 06-06 · 06-15 · 06-19 · 06-20의 증빙 수 세기가 무효 파일을 빼는지 확인. 「결재 중 금액 재계산 안 함」은 06이 지급 때만 계산하므로 한 줄 확인만. 금액 없이 붙은 증빙은 R10-F2 |
| GA-80 | 260907:80 · gap-audit:81(근거 05_증빙.md:20-80 · 07_설정-항목.md:262-284). 「증빙 종류마다 부가세 자동/미자동 및 파일형식 허용목록이 다르고, 지급방식 ↔ 증빙종류 짝을 설정에서 지정하면 서버가 실제로 막는다(관리자가 좁히지 않은 지급방식은 「전부 받음」)」 | 종류별 세금 규칙은 EXP-15로 덮이고 파일 형식은 전역 이미지 · PDF다. 빠진 것: 짝 제약. 결정: Q4 = 넣는다, 짝은 설정, 기본 빈 값(비면 막지 않음)(UI-SPEC:44, 영향 S1 · S2 · S5 · S20 · 「거부 — 일괄 지급 건별 결과」). 입력 모양 = O-23 짝 격자(UI-SPEC:1411, 사용자 확정 10/5 01:53, 「06-02/03이 SP로」). reconcile §8 Q4 추정 +30분 | 「짝」 0건. S20은 06-02 · 06-08에만 이름이 있다. 6.1-06:191 P-PAIR가 `domain/expenses` · `domain/payments`에서 이름에 `Pair` · `pair` · `Match`가 든 `export … function`을 찾고, 없으면 6.1 붙이기 세 경로(6.1-06 1차 · 6.1-08 · 6.1-09)가 짝 검사 없이 지나간다(비멈춤, 6.1-06:293 「SUMMARY 인계」 한 줄) | 06-02: 설정 키(지급 방식별 허용 증빙 종류, 기본 빈 값) + 짝 격자 SP(SYSTEM §7-2 새 입력 타입) + MAST-05 지급 방식 관리와 한 화면(RQ-MAST-05). 06-03: 순수 판정 함수 — 이름에 `Pair` 또는 `Match`를 넣고 `domain/payments` 아래에 둔다(K-6) + 게이트 이유 문구. 06-04(S5) · 06-15(일괄 건별 결과) · 06-17(S1 선택 칸, 제자리 확인 뒤 자동 선택 R10-R1) · 06-20(S3 · S20). 확인: 판정 시점을 지급 완료 때로만 둘지(UI-SPEC 영향 표면 S1 · S2 · S5 · S20) 증빙 종류를 고르는 05 작성 화면에서도 거를지 — 후자는 05 화면 변경이라 06 밖 |
| GA-129 | 260907:129 · gap-audit:107(근거 05_기본-정책.md:472-478). 「원칙적으로 금액에 음수를 허용한다(할인 · 환불). 작성일이 미래여도 막지 않는다(세금계산서 선발행 존재)」 | 음수는 EXP-14 · 04C:34 D-48로 덮인다. 빠진 것: 미래 작성일 허용 여부. 결정: Q6 = 카드 사용일은 오늘까지, 지급일은 미래 허용(예정일)(UI-SPEC:46, 영향 S2 · S5 · S9 · 「Error — 지급일 · 지급 예정일 칸」 · 「Error — 카드 사용 폼 칸」). reconcile §8 Q6은 05 뒤 작은 작업 「미래 작성일 허용」과 같은 규칙으로 맞추라 했다(05 쪽 작업, 06 밖) | 「미래」 0건. 지급일 칸 기본 오늘(KST)만 있다(06-04:33 · :165, 06-15:34 · :52). `pickTaxDates(doc, payDate, today)`(06-03:205)는 지급일 > 지급 예정일 > 오늘로 기준일을 고를 뿐 미래를 거르지 않는다. 카드 사용일도 기본 오늘만(06-05:49 · :261), 상한 규칙이 없다 | 06-05(+06-09 수정 폼): 사용일 서버 검사 「오늘(KST)까지」 + 「Error — 카드 사용 폼 칸」. 06-04 · 06-15: 지급일 미래 허용을 한 줄로 명시(막지 않음, 결과는 `예정 지급`). 06-03 Task 1 ③: 미래 지급일의 `loadTaxRates(지급일)`이 읽는 값(설정 이력에 미래 값이 없으면 읽는 순간의 유효값)을 한 줄로 못 박는다(RS-11과 같이). 06-20: S3 맨 앞 `예정 지급` 그룹(R10-F9). 확인: 미래 지급일로 「지급 완료」가 되면 견적 줄이 그 순간 잠기는지(D-606 · EXP-06) — UI-SPEC은 그룹만 정했다 |
| GA-159 | 260907:159 · gap-audit:132(확정 2026-09-01, 근거 07_매출-수금-지급.md:118-144). 「카드로 받는 매출은 계산서 없이 별도 처리, 카드 수수료는 그 행사의 비용(실행가)으로 잡는다(수수료율 설정이 아니라 실제 떼인 금액을 수금 시 직접 입력)」 | 수수료는 조정 줄(04C:99 D-83)로 가능하다. 빠진 것: 계산서 없는 카드 매출을 매출 칸 · 분모(09C:37 D-902) · 완료 점검 「매출 미입력」(06C:55 D-613)이 어떻게 받는지, 매출 대장 범위 밖(REQ:176)인지 모호. 결정: Q7 = 06은 그대로(기존 「강행 허용」 설정으로 넘김), 카드 매출 입력은 Phase 9(UI-SPEC:47, 영향 S18) | 06-19에 통과 길이 이미 있다: D-613 「매출 미입력 = 발행 줄 0」(06-19:36), 강행 허용 설정 셋 `project.force_complete.allow_*` 기본 false(06-19:37). 카드 매출 문구 0건 | 06 변경 없음. 06-19에 한 줄만(「계산서 없는 카드 매출 프로젝트는 `매출 미입력`으로 걸리고 `강행 허용`으로만 통과한다 — 카드 매출 입력은 Phase 9」). Phase 9 CONTEXT 입력에 gap-audit:132를 09C:37 D-902 분모와 함께 이월 |
| GA-MF44 | `docs/research/erp260907-money-flow.md:44` · gap-audit:162(08-24 M-27). 「증빙까지 붙은 구매요청을 취소하면 붙였던 전표가 자동으로 떨어져 「주인 없음」으로 돌아가고 확정 실행가도 함께 비워진다」(취소는 경영관리가 어디서든 사유와 함께, 요청자는 「취소 요청」) | gap-audit 「빠짐」: 06C:63은 취소 주체 · 금액 차이 처리만 재량으로 남겼다. 결정: Q2 = 구매 완료한 요청은 취소하지 않는다 — 취소는 `신청됨`에서만, 잘못 처리한 구매 완료는 조정 줄(D-83)로(UI-SPEC:42, 영향 S11 · S13 · 「Destructive — 구매 요청 취소」). 「주인 없음 복귀」 경로는 생기지 않는다 | O-9 기본값이 이미 같다: 06-14:37 · :62 · :144(취소는 `신청`에서만, 구매 완료 건 취소로 카드 사용이 연결 없이 남지 않는다). 남은 차이: 낱말 `신청`(ST-3), 06-14:38 · :216의 토스트 `되돌리기`(RS-14 · RS-17), 06-CONTEXT:63 「경영관리는 언제든」 재량이 `신청`만으로 좁아졌다는 기록 | 06-14: 낱말 `신청됨`, 취소 되돌리기를 결과 줄 방식으로, 「Destructive — 구매 요청 취소」에서 구매 완료 취소 갈래 삭제. 06-12: 구매 완료 행에 취소 동작이 없다는 점을 behavior에 한 줄(숨김, CLAUDE.md §7). 6.1 접점: `신청`에서 취소될 때 6.1 2차 고르기(6.1-08:59)가 붙인 증빙 붙임을 떼는 자리(K-7) |
| GA-184 | 260907:184(설정 표 「회사 기본」 줄, 판정 「필요 — ADMN-09, MAST」). 「회사명 · 로고 · 직인, 회계연도 시작월, 번호 서식 5종, 영업일 · 공휴일, 과거 기간 잠금(없음)」 | gap-audit 「빠짐」: 계획에서 못 찾음(회계연도는 1월 고정으로만 05C:23). 대상 「5 · 6(인쇄물)」. 결정: reconcile §5(:99) 「06 변경 없음 — 인쇄 · 계좌 서식은 다른 페이즈」 | 06 플랜 25개와 06-CONTEXT에 인쇄 · 직인 · 로고 · 회사명 · 회계연도 문구 0건이다 — 06은 인쇄물(지급 확인서 등)을 만들지 않는다. 번호 서식만 06-02(ADMN-09는 Complete) | 06 변경 없음. 재계획 CONTEXT 이월 목록에 한 줄(「직인 · 로고 · 회계연도는 인쇄물이 생기는 페이즈의 입력, 06에는 인쇄물 없음」). 06에 인쇄물이 생기는 결정이 나오면 그때 다시 연다 |
| GA-186 | 260907:186(설정 표 「지급 · 수금」 줄, 판정 「필요 — EXP-09 (현재 REQ에 상세 미명시, 누락 후보)」). 「지급요일/기한(60일), 결재마감시각(14시), 은행별 계좌번호 자릿수 서식」 | gap-audit 「빠짐」: MAST-01은 암호화 · 뒤 4자리만(REQ:19). 결정: reconcile §5(:99) 06 변경 없음. 한 행에 설정 셋이 섞여 있다 — (a) 은행별 계좌번호 자릿수 서식 = 거래처 계좌 입력 검증(Phase 3 MAST-01 후속), (b) 지급요일 · 기한 (c) 결재 마감 시각 = Phase 7(06-CONTEXT:129 지급 예정일 자동 계산 · 결재 마감) | 06-20:32 S1 지급 방식 칸은 고정 마스크 `{은행} ****-**-{뒤4}` + main `AccountNumberCell` 재사용(06-20:70-71 · UA-613). 은행별 서식 · 자릿수 검증 0건 | 06 변경 없음. 이월 목록에 셋으로 나눠 적는다 — (a) Phase 3 거래처 후속, (b)(c) Phase 7. 서식이 들어오면 `AccountNumberCell` 한 곳이 바뀐다(06-20 UA-613: 옮기지 않음) |

### 2.1 이 조사에서 더 보인 것

- 행 129의 「작성일」은 지출결의 · 증빙 작성일(세금계산서 선발행)이다. Q6은 이를 카드 사용일 · 지급일로 옮겨 정했다. 미래 증빙일(선발행 계산서)의 처리는 05 「미래 작성일 허용」 작은 작업의 몫이고 06은 그 결과를 받는다 — `pickTaxDates`(06-03:187 · :205)는 미래 증빙일을 막지 않으므로 06 쪽 추가 작업은 없고 확인만 남는다.
- 행 79의 「결재 중 금액 재계산 안 함」: 06은 지급 때만 지급 총액을 계산하므로(06-03) 결재 중 재계산이 생기지 않는다. 다만 05에 증빙 금액 칸이 없어서(replan-A §1-6) 결재 중 붙은 증빙은 금액이 없다 — R10-F2의 「증빙 금액 없음」 막힘이 이 틈을 UI에서 메운다. 칸의 주인은 아직 없다(§3.4 notes-C 빈틈 #1).
- gap-audit의 6.1 행(52 · 69 · 76 · 77 · 81 · 83 · DC:13)은 6.1 몫이라 다루지 않았다. 6.1 자신의 E-old-system-diff M1(완료 프로젝트 증빙 규칙, `reviews/eng/E-old-system-diff.md:26`)과 M2(짝 검사, :27)가 06에 되묻는 것은 CF-7 · K-6에 옮겼다.

## 3. Phase 06.1(PR #164)이 06에 기대하는 것

- 6.1 상태: PR #164 draft, 22커밋, head `002adca3`(2026-10-04T15:34Z), 플랜 13개(`06.1-NN-PLAN.md`, 이 보고서 표기 `6.1-NN:줄`). 이 조사에서 PR을 다시 확인했고 notes-C(10/4) 이후 변동이 없다.
- 순서와 문: 05 → 06 → 6.1-01(위험 경로, 사용자 머지) → 나머지. `6.1-01:28-30` `execution_gate.start_after`는 05 · 06이 main에 머지돼 있어야 착수하고, `pre_wave1`(E36)은 머지 직후 플랜 13개를 plan-checker로 다시 돌려 05 · 06의 실제 함수 이름 · 경로와 대조한다. 그래서 06은 6.1을 위해 이름을 정확히 남기는 것이 일이고, 6.1이 덮어쓸 것을 미리 만들지 않는 것도 일이다.
- 06 플랜 25개 · `06-CONTEXT.md` · `06-VALIDATION.md`에는 6.1 이름이 한 건도 없다(grep 0건 확인). 6.1이 06의 가칭을 전부 가정한다.
- 6.1 쪽 `reviews/...` 경로는 `.planning/phases/06.1-evidence-bulk-intake/reviews/`(PR #164) 아래다. `6.1-eng-review.md`는 그 안의 `reviews/06.1-eng-review.md`.

### 3.1 06이 남겨 둬야 하는 것 (이름 · 이유 · 6.1 근거 · 06 현재)

| id | 남길 것 | 이유 · 6.1이 하는 일 | 6.1 근거 | 06 현재 · 재계획에서 할 일 |
|---|---|---|---|---|
| K-1 | 증빙 유무 판정 한 서버 함수 `hasEvidence`(가칭, UI-SPEC:67 · reconcile:42)와 「살아 있는 파일」 정의 한 곳. 파일 수를 화면 · 액션이 직접 세지 않는다 | 6.1-12가 이 함수에 「파일 OR 살아 있는 증빙 붙임」을 넣어 05 · 06 게이트 5곳 · 목록 · 신호를 한 번에 넓힌다. 06이 먼저 모아 두면 6.1-12가 고칠 06 파일이 준다(notes-C §6-3) | 6.1-12:48 · :56 · :60 · :69(exports `hasEvidence` · `evidenceSummaryForOwner`) · :134-137(P-FILES · P-GATE5 · P-GATE6 · P-LIST) · :176 | 06-04 · 06-10 · 06-11 · 06-15 · 06-19 · 06-20 · 06-23 · 06-25가 파일 수를 직접 센다. 가칭 함수는 어느 플랜에도 없다. 첫 호출자가 06-04(W3)라 06-06(W4)에 두자는 reconcile:76은 늦다 — 06-03(W2) 또는 06-04가 맡는다. 05 `countActiveByOwner(viewer, ownerKind, ownerId, tx = db)`(`repositories/files.ts:44`)를 감싸고 `tx`를 통과시킨다(RS-13). 이름 충돌 CF-6. U-9 |
| K-2 | `createCardUsage(viewer, input, pre, tx?)`(안쪽 `runCreate`) · `splitCardTotal` · `cardUsageFormDefaults` · `registered_via`(self · proxy · purchase) · `purchase_request_id` · `cards.proxy` · `cardUsageRights` · 카드 사용 수정 가능(잠김) 판정 | 6.1-09 대사 3단계가 06 카드 사용 등록을 트랜잭션 안에서 부르고 카드 · 합계를 파일 값으로 덮는다. 대리 등록은 `createCardUsageFromEvidence`가 `createCardUsage(…, tx)`를 부른다 | 6.1-09:99-100 · :122-123 · :167-173(P-CU · P-RV · P-CULOCK · P-PROXY · P-FORM · P-SRC) | `tx?`는 06-05:180 · :329에 이미 있다(notes-C 빈틈 #2 해소, E-3). `registered_via` 06-12, `cards.proxy` · `cardUsageRights` 06-09에 있다. 재계획에서 시그니처를 유지한다. 패널화로 폼 파일 이름 · 위치가 바뀌면 6.1에 알린다(CF-4). Q3 상한 판정은 순수 함수로 내보내 6.1이 부를 수 있게(CF-3) |
| K-3 | 증빙 상태 판정의 입력 자리: `resolveEvidenceStatus`에 증빙 기록 수 · 「등록이 곧 확인」 자리, `evidenceGateInputs`, 확인 기록 표 `expense_evidence_reviews`와 시각 칸 이름, `expenseCostBasis`, `invalidateEvidenceReview`, 면제 3차 자리 | 6.1-12:50이 입력(`fileCount` · `recordCount` · `authorLinkAfterConfirm`)을 바꿔 D-6117을 구현한다. 06-04 게이트 · 06-15 · 06-17 · 06-20의 「확인 전」 필터가 영향을 받는다 | 6.1-12:50 · :136(P-GATE6) · :139(P-CONFIRM) · :140(P-WAIVE) · :144(P-COST) | 06-06:164는 `reviewed_at`이고 P-CONFIRM은 `confirmed_at`를 찾는다(「없으면 멈춤」 — CF-1). `resolveEvidenceStatus` 입력은 파일 수뿐이다. UI-SPEC:69 ①이 입력 자리를 요구한다(화면은 서버가 준 증빙 낱말만 그린다). 재계획: 입력을 이름 있는 필드 객체로 두어 6.1이 필드만 더하게 한다 |
| K-4 | 행 잠금 · 문서 version 함수 이름: 06-03의 `lockExpenseRow` · `bumpExpenseVersion`과 05의 `lockExpenseForUpdate`(`repositories/expenses.ts:78`) · `bumpInstanceVersion`(`repositories/approvals.ts:151`, 05-09 호출 `domain/evidence/index.ts:331`)의 관계 | 6.1-06 P-LOCK은 셋(`lockExpenseRow` · `bumpExpenseVersion` · `bumpInstanceVersion`)이 모두 있어야 시작하고 하나라도 비면 멈춘다 | 6.1-06:186 · :219 | 06-03이 앞 둘을 만든다. 05 실물은 `lockExpenseForUpdate`다(replan-A). 06이 05 함수를 재사용해 `lockExpenseRow`를 만들지 않기로 하면 P-LOCK grep이 비어 6.1이 멈춘다 — 이름을 남기거나(얇은 래퍼) 6.1에 알린다 |
| K-5 | 「완료(잠긴) 프로젝트인가」 판정 하나와 그 이름. 지금은 실제 이름이 흩어져 있다 — `CompletedProjectError`(`domain/projects/index.ts:72`) · `quoteLockReason`(`domain/quotes/edit-scope.ts:127`) · `PROJECT_COMPLETED`(pr162 `domain/expenses/gate.ts:37`) · 인라인 `status === "completed"`(pr162 `domain/expenses/index.ts:468` · `:1087`) | 6.1-06 E40이 완료 프로젝트 문서의 붙이기 · 떼기를 서버에서 거부하려고 판정 함수를 부른다 | 6.1-06:189(P-DONE — `domain/projects`에서 `export` 줄에 `locked` · `completed`가 든 것을 찾고 「판정 함수 이름을 SUMMARY에, 없으면 멈춤」) | 플랜은 없는 규칙 `project.completed-lock`을 17곳 인용한다(ST-1). P-DONE grep은 `CompletedProjectError` · `PROJECT_STATUSES`에 걸려 멈추지는 않지만 판정 함수가 아니다. 재계획에서 06이 쓰는 판정 하나를 정해 06-03 · 04 · 07 · 09 · 12 · 18 · 19 · 21이 같은 이름을 쓰게 한다 |
| K-6 | 지급 방식 ↔ 증빙 종류 짝 판정 함수(Q4) — 이름에 `Pair` · `pair` · `Match`가 들고 `domain/expenses` 또는 `domain/payments` 아래 있어야 6.1이 찾는다 | 6.1 붙이기 세 경로(6.1-06 1차 · 6.1-08 · 6.1-09)가 붙이기 전에 부른다(E44, 6.1 M2) | 6.1-06:191 · :293 · `6.1-eng-review.md:43`(E44) | 06에 짝 판정이 없다(GA-80). 없으면 6.1은 「인계」 한 줄로 넘어가 옛 규칙이 조용히 빠진다. 06-03에 순수 함수로 두고 이름 규칙을 맞춘다 |
| K-7 | 카드 사용 보관(삭제)과 구매 요청 취소 트랜잭션이 `tx`를 받는 형태 + 6.1이 한 줄(리포지토리 `detachLiveLinksForOwner`)을 더할 자리 | 문서가 사라지면 붙임도 떨어진다(E22 · DB-15). 05 · 06 domain은 `domain/evidence-records`를 import하지 않고(순환 — 6.1 리뷰 id C-F14) 리포지토리 함수만 부른다 | 6.1-06:76 · :95 · :112 · :119 · :190(P-DEL — 삭제 · 취소 · 보관 · 복원 함수 이름, 셋 중 하나라도 없으면 멈춤) | 06-09 `deleteCardUsage`(06-09:241) · 06-14 `cancelPurchaseRequest`가 있다. Q2 덕에 구매 완료 뒤 취소가 없어 떼기 훅은 `신청` 취소와 카드 사용 보관에만 필요하다(notes-C #4 축소). rev 10은 삭제를 결과 줄 `되돌리기`(보관 해제)로 바꾸므로 보관 해제 함수 이름도 P-DEL 정규식(`delete` · `cancel` · `archive` · `restore` · `undo`)에 걸리게 |
| K-8 | 06-20 `[증빙 전체 ▾]` 필터 값(`unreviewed` · `missing` · `payable`)을 서버 열거 한 곳에서 | 6.1-10이 값 `파일만 있음`을 더한다 — 화면 코드 변경 없이 열거만 넓히게 | 6.1-10:105(P-20, `domain/payments/targets.ts` · `repositories/payment-targets.ts`에서 이 값들을 grep, 비면 멈춤) | 06-20:39 · :258 · :268이 정확히 이 값과 파일을 쓴다 — 호환. 열거를 상수 하나로(UI-SPEC:69 ②) |
| K-9 | 한 건 폼 · 목록의 화면 자리: S4 문서 `증빙` 섹션(`app/(app)/expenses/[id]/evidence-review-section.tsx` 계열), S9 카드 사용 폼, S10 `app/(app)/cards/link-picker.tsx`, S11 구매 요청 목록 행(6.1-08이 3차 `증빙 고르기 {N}` 추가), S13 구매 완료 폼, `/cards?new=1&evidence={id}` 대리 등록 진입 | 6.1이 여기에 트리거 · 행동 · 진입 링크를 더한다 | 6.1-09:72 · :320 · :172(P-FORM) · 6.1-06:192(P-LINKPICKER, 비멈춤) · 6.1-08:59 | 위치는 UI-SPEC:69 ④가 정리했고 플랜은 아직 rev 9 표면이다(RS-17). 패널화 · 토스트 폐지로 달라지는 것은 CF-4. S11 행동 칸에 3차를 더할 자리를 06-14가 남긴다 |
| K-10 | 같은 공용 파일을 6.1-03과 함께 고치는 곳의 순서: `ui/attachments/Attachments.tsx`(05) · `ui/status-tag/status-map.ts`(06-01이 새 낱말 12개, 6.1-03이 6개) · `ui/pick-dialog/PickDialog.tsx` · `docs/design/DECISIONS.md` · `SYSTEM.md` | 텍스트 충돌만이다(이름 겹침 없음) — 6.1은 06 뒤에 쌓는다 | 6.1-03:16-18 · :57 · :156 · :158 | 06-01이 먼저 고친다. PickDialog는 05가 이미 만들었으므로(CF-8) 6.1-03은 「있으면 확장」으로 바뀌어야 한다 |
| K-11 | 마이그레이션 번호 · `_journal.json` · `menus.ts` · `settings/keys.ts` · `leak-scan.test.ts` 텍스트 충돌 | 06-24 R-4(PR 전 마이그레이션 재생성)와 6.1-01 재생성이 같은 규약 — 겹치면 내 것을 지우고 `pnpm db:generate`로 다시 만든다(CLAUDE.md 세션 자율 운영) | 6.1-01(`_journal.json` · 재생성 규칙), reconcile:81 | 05-13이 05 마이그레이션을 하나로 다시 만든 뒤 0027 이후로 번호를 정한다(reconcile:40). 06은 번호를 박지 않는다 |
| K-12 | 카드 전표 파일(06-25, `files.owner_kind = corp_card_usage`)과 6.1 증빙 기록 붙임(`evidence_record_links`, 주인 종류 `corp_card_usage`)을 둘 다 센다는 점 | `hasEvidence`가 둘을 OR한다. 한 카드 사용에 두 갈래가 겹쳐 붙는 이중 증빙을 막는 규칙이 없다(notes-C #8, reconcile:71) | 6.1-12:48 · 6.1-RESEARCH Pattern 1(별도 표) | 06-25 재설계 때 「06-25 파일은 작성자 첨부, 6.1은 경영관리 · 대사 붙임」으로 갈래를 문장으로 갈라 두고 이중 증빙 방지는 6.1-12로 넘긴다 |

### 3.2 06이 미리 만들면 안 되는 것 (6.1이 덮어쓴다)

| id | 만들지 말 것 | 근거 · 이유 | 06이 할 일(자리만) |
|---|---|---|---|
| NP-1 | D-6117 「등록이 곧 확인」 — 별도 확인 상태 · 확인 화면 · 자동 확인 부여 | 6.1-CONTEXT:61(D-6117, 사용자 결정 2026-10-04, UI-SPEC O-6101) · UI-SPEC:68-69 ① | 06-06 `resolveEvidenceStatus` 입력에 증빙 기록 수 자리만(K-3) |
| NP-2 | 카드 대사 「파일이 이긴다」 — 대사 화면 · 파일 값으로 카드 사용 합계 · 카드를 덮는 로직 · 끌 수 없는 덮기 기록 | D-6111(6.1-CONTEXT:55). 06-CONTEXT:130 백로그를 6.1이 승격(6.1-09:62 · :398). 06의 카드 금액은 D-607대로 결제 합계 직접 입력 | `createCardUsage`가 `tx`를 받는 것 + 카드 사용 수정 가능 판정 노출(K-2). Q3 상한과의 관계는 CF-3 |
| NP-3 | 외주 세금계산서 「공개된 증빙을 고른다」 길 | D-6106(6.1-CONTEXT:46, 6.1-RESEARCH.md:503). D-602(PM이 첨부하며 금액을 적음)는 작성자가 직접 올리는 파일에만 남는다 | 06-06은 PM 첨부 · 금액 · 확인 흐름만. 6.1-06:75가 06-06 증빙 금액 칸을 「붙은 증빙이 있으면 입력이 아닌 합 + 2행 `등록 증빙 {n}건`」으로 바꾸므로 칸의 값과 표시를 분리해 둔다 |
| NP-4 | 6.1 이름 전부: 표 `evidence_import_batches` · `evidence_records` · `evidence_record_links`, 칸 `corp_card_usages.approval_no`(+ `(corp_card_id, approval_no)` 인덱스), 행동 종류 `evidence_amount_change`(끌 수 없음), 설정 `evidence.visibility.division_org_unit`, 메뉴 `evidence` · `evidence.intake`, 정보 항목 `evidence.value` · `evidence.amount`, 거래처 자동 생성(D-6114), 공개 3단계 | 6.1-01 ~ 6.1-05. 06 플랜에 같은 이름이 없다(grep 0건). UI-SPEC:67이 `evidence_import_records`라 잘못 적었다(CF-2) | 같은 이름 · 같은 역할을 만들지 않는다. 텍스트 충돌 파일은 K-11 |
| NP-5 | `approval_no` 칸과 그 인덱스를 06-05 표에 미리 넣는 일 | 6.1-01이 더한다(6.1-09 P-CU). 카드 끝 4자리는 Phase 3 `corp_cards.numberLast4`(`corp_cards_issuer_last4_key`, `db/schema/corp-cards.ts:31`)에 이미 있다 | 06-05 표 칸 이름 `registered_via`만 고정(K-2) |

### 3.3 06과 6.1이 부딪히는 곳

| id | 충돌 | 06 쪽 | 6.1 쪽 | 제안 |
|---|---|---|---|---|
| CF-1 | 확인 시각 칸 이름 | 06-06:164 `expense_evidence_reviews`의 `reviewed_by` · `reviewed_at`(`confirmed` · `waived` 공용) | 6.1-12:139 P-CONFIRM이 `confirmed_at` · `confirmedAt`를 grep하고 「없으면 멈춤」 | `reviewed_at`이 면제까지 덮는 맞는 이름이다 — 06-06은 유지하고 6.1에 알린다(E36 재검, 6.1-01:28-30). 06-06 SUMMARY에 실제 이름 한 줄 |
| CF-2 | 6.1 표 이름 오기 | UI-SPEC:67이 `evidence_import_records` | 실제는 `evidence_records`(6.1-01 `db/schema/evidence-records.ts`) | UI-SPEC 문서 수정(replan-B 몫). 플랜에는 이 이름을 쓰지 않는다 |
| CF-3 | Q3 실행가 상한 ↔ 「파일이 이긴다」 | Q3(UI-SPEC:43): 카드 사용 등록 · 구매 요청 · 구매 완료가 줄 실행가 초과를 막는다(고정 상한 없음). 06-05 · 06-07 · 06-12 본문에는 없다 | 6.1-09:62 · :398: 대사가 카드 사용 합계 · 카드를 파일 값으로 덮고(D-6111) 상한 검사는 언급이 없다 | 파일 값이 줄 실행가 합을 넘기면 (a) 파일이 이긴다(실제 나간 돈이 사실) · 상한은 표시만, (b) 덮기도 상한을 통과해야 한다 · 대사 실패 줄 — 사용자 결정 U-8. 어느 쪽이든 06의 상한 판정을 순수 함수로 내보낸다(K-2) |
| CF-4 | 토스트 폐지 · 옆 패널 | UI-SPEC:177 · :377-378(토스트 폐지, 결과 줄) · 한 건 폼은 옆 패널(S9 · S12 · S13, `?new=1` 라우트 유지) | 6.1-09:72 · :320(저장 → 토스트 `카드 사용 등록 · {합계}` → `/expenses/evidence?state=…` 복귀) · :172 P-FORM(`card-usage-form.tsx` · `actions.ts` · `page.tsx` 셋 중 하나라도 없으면 멈춤) | 06은 `app/(app)/cards/card-usage-form.tsx` 경로를 패널 본문으로 유지하거나 6.1에 이름을 알린다. 복귀 알림은 결과 줄. 6.1-09:320 E2E 문구는 E36 재검에서 고친다 |
| CF-5 | P-LOCK · P-DONE · P-LAST 이름 | K-4 · K-5 참고. SP-6 철회로 `lastEvidenceDeleteNeedsConfirm`이 없어진다(ST-2) | 6.1-06:186 · :189, 6.1-12:143(P-LAST — 이 함수 호출부를 찾는다, 비멈춤) | 6.1에 「호출부 없음」을 알린다. P-LOCK · P-DONE은 K-4 · K-5의 이름 확정으로 |
| CF-6 | `hasEvidence` 이름 충돌 | 06-25:102 · :170 · :198 · :347이 DTO 불리언 칸을 `hasEvidence`라 부른다 | 6.1-12:69가 함수 `hasEvidence`를 export | DTO 칸은 다른 이름(예: `evidencePresent`), `hasEvidence`는 함수 이름만 |
| CF-7 | 완료 프로젝트 증빙 | 06은 완료 뒤 사후 처리를 연다(D-47 · D-606 · D-611 「완료 뒤에도 경영관리가 지급할 수 있다」), 행 38은 구매 완료 허용. 05 첨부 경로(`domain/evidence/index.ts`)에는 완료 프로젝트 검사가 없다(pr162) | 6.1-06:66 E40: 완료(잠긴) 프로젝트 문서의 붙이기 · 떼기를 서버가 거부, 잠김 줄 `완료 프로젝트 · 증빙 잠김`(수용 E40, `6.1-eng-review.md:42`). 6.1 자신의 M1이 「사용자 확인 필요」로 남겼다(`reviews/eng/E-old-system-diff.md:154`) | 완료 프로젝트의 지급 전 문서는 05 파일 경로로는 증빙을 붙여 지급할 수 있고 6.1 증빙 기록 경로로는 붙일 수 없다. 한 규칙으로 정한다 — U-4 |
| CF-8 | 고르기 목록 컴포넌트 삼중 정의 | 05 pr162에 `ui/pick-dialog/PickDialog.tsx`(DECISIONS.md B5 「06 S10 연결 고르기」). UI-SPEC SP-8(:787-793 · :1129)이 `ui/confirm-dialog` 검색 고르기 갈래를 따로 정의 | 6.1-03:16-18 · :57 · :156 · :158 G-4가 같은 경로를 「새로」 만든다(Q-D1 A, 사용자 결정 2026-10-04 22:40) | 컴포넌트는 05의 `PickDialog` 하나, SP-8 계약(검색 · 행 막힘 · 현재 줄 · LOADING · EMPTY · ERROR)은 그 위에. 6.1-03은 「있으면 확장」. U-7 |
| CF-9 | 행동 종류 | 06-06:37 · :157 · :284, 06-10:132 · :272 · 06-04:44가 증빙 확인 · 면제 · 지급 취소 · 예정일 저장을 `document_update`로 남긴다(RESEARCH AS2, 사용자 확인 필요, 설정으로 끌 수 있음 — `ALWAYS_ON_ACTION_TYPES`에 없다, `domain/action-log/record.ts:85`) | 6.1-01이 끌 수 없는 `evidence_amount_change`(경영관리가 증빙 금액을 고침)를 더한다 | D-602 「고친 값 · 전 값 · 사람 · 시각이 남는다」와 D-606 「취소 사유 · 사람 · 시각이 남는다」는 끌 수 있는 종류로는 보장되지 않는다. AS2를 확정하고(RS-18) 06의 종류를 정한다 |
| CF-10 | 같은 목적의 훅 두 갈래 | 06-11 `invalidateEvidenceReview`(결재 통과 문서의 증빙 변경이 확인을 풀고 문서 version +1) | 05-09 `bumpInstanceVersion`(결재 중 권한자 추가가 결재 인스턴스 version을 올림)과 6.1-06 결재 중 붙이기가 같은 것을 재사용(6.1-06:186 · :219 · :275) | 06-11 재설계(GA-79)에서 훅 두 경로(승인 뒤 추가 · 무효)와 호출 위치를 확정하고 6.1에 알린다. 결재 중 경로는 06이 손대지 않는다 |

### 3.4 notes-C(2026-10-04) 이후 달라진 것

- 6.1 PR: 변동 없음(head `002adca3`). 06 플랜: 변동 없음(마지막 수정 2026-10-01 `7eb6c2ad`), 즉 rev 10도 아직 반영되지 않았다.
- UI-SPEC rev 10 + r2(10/4 ~ 10/5): 6.1 자리(`hasEvidence`(가칭) · 「미리 만들지 않는다」 · 올라탈 자리 넷, :67-69), Q2 ~ Q7(:36-47), SP-6 철회(:64), SP-8, 토스트 폐지, 옆 패널 폼이 새로 들어왔다 — 06 플랜이 이를 받아야 K-1 · K-3 · K-9가 채워진다.
- 05-09가 pr162에서 완료됐다(`expenses.evidence_attach` · `expenses.evidence_void` 키, 살아 있는 파일 정의, `bumpInstanceVersion`). notes-C #7(「05 미반영이면 6.1 전체 착수 안 함」)은 pr162 기준 충족이고 main에는 아직 없다. 그 사이 6.1-01 `execution_gate`는 그대로다.
- notes-C 빈틈 여덟 개의 현재 상태: #1 05 증빙 금액 칸 — 아직 주인 없음(05에 칸이 없고 rev 10은 S4 금액 칸 UI만 정했다, R10-F2). #2 `tx?` — 06-05:180 · :329에 있음(해소, 끝 4자리는 Phase 3 `numberLast4`에 이미 있고 `approval_no`는 6.1-01 몫). #3 `hasEvidence` — UI-SPEC에서 정했으나 플랜 없음(K-1). #4 떼기 훅 — Q2로 줄었지만 `신청` 취소와 카드 사용 보관에는 필요(K-7). #5 `invalidateEvidenceReview` — 06-11이 아직 옛 모델(GA-79 · CF-10). #6 D-6117 — 6.1 단독(NP-1). #7 05 규칙 — 충족(pr162). #8 이중 증빙 — 그대로(K-12).
- 6.1이 06에 새로 되묻는 것: 6.1 E-old-system-diff M1(완료 프로젝트 증빙 규칙 — CF-7)과 M2(짝 검사 — K-6). 둘 다 06에 아직 답이 없다.

### 3.5 6.1 플랜 체커 재검(E36)에 넘길 한 줄 목록

06 재계획 SUMMARY에 다음을 「실제 이름」으로 적어 6.1이 가칭을 바꾸게 한다: (1) 확인 시각 칸 `reviewed_at`(CF-1), (2) `lockExpenseRow` · `bumpExpenseVersion`을 남기는지 05 이름으로 바꾸는지(K-4), (3) 완료 프로젝트 판정 함수 이름(K-5), (4) 짝 판정 함수 이름과 위치(K-6), (5) `hasEvidence`가 사는 파일과 `tx` 규칙(K-1), (6) 카드 사용 폼의 패널 경로와 복귀 방식(CF-4), (7) `lastEvidenceDeleteNeedsConfirm` 삭제(CF-5), (8) Q3 상한 판정 함수 이름과 대사 처리 결정(CF-3), (9) 완료 프로젝트 증빙 정책(CF-7), (10) `PickDialog` 하나로 합친 결과(CF-8).

## 4. 반려 종결 경로 · 요구사항 매핑

### 4.1 반려 · 회수 지출결의 종결(취소) 경로

이 브랜치 `06-CONTEXT.md`에서 반려 · 회수 · 종결 · 취소를 말하는 결정은 아래가 전부다.

| 결정 | 줄 | 요지 | 지출결의 반려 · 회수 종결과의 관계 | 플랜 반영 |
|---|---|---|---|---|
| D-606 | :42 | 지급 완료는 경영관리가 사유를 적고 취소할 수 있다. 취소하면 견적 줄 잠금이 풀리고 문서는 지급 전 상태로 돌아가며 사유 · 사람 · 시각이 행동 로그에 남는다. 완료 프로젝트에서도 D-47과 같은 범위 | 지급 취소다(결재 통과 뒤의 일). 반려 · 회수 종결이 아니다 | 06-04 `cancelExpensePayment`(06-04:71 · :133 · :221-239). 로그 종류는 `document_update`(06-04:44 — CF-9) |
| D-609 | :47 | 견적 줄 하나는 지출결의 쪽 또는 카드 쪽 한 쪽에만 연결된다. 반대쪽 연결은 서버가 막는다 | 06-07이 「살아 있는 지출결의」를 「반려 · 취소 제외」로 정의한다. 회수 · 종결의 취급은 적혀 있지 않다 | 06-07:39 · :171 `card.dual-link-block` |
| D-611 | :53 | 「미결 지출결의」 = 결재 중 · 반려 상태 문서 + 증빙 없는 문서. 결재 통과 · 지급 전 문서는 막지 않는다 | **반려 문서가 정산 결재 올리기를 막는다.** 회수는 열거에 없다(06-19 PS-1 :139 「미제출 · 회수는 세지 않는다」). 문서를 끝내는 길이 없으면 반려 1건이 영구히 막는다 — 우회로는 강행 허용 설정(`project.force_complete.allow_*`, 기본 false)뿐 | 06-19:34 · :138-140 · :155(Task 1 트레이서 「반려 1건 → 기안 막힘」) · :173 · :180 · 06-13:33 · :221(줄 상태 우선순위 취소 > 반려 > …) · 06-23:217(`증빙 없음 · 지급 대기`에서 결재 중 · 반려 제외) |
| D-612 | :54 | 미매칭 견적 줄: `취소` 상태 줄 · 조정 줄은 점검 대상이 아니다 | 견적 줄 취소라 종결과 다르다. 다만 06-19 PS-2(:140)가 「취소 · 회수된 지출결의」를 연결로 세지 않는다 | 06-19:140 |
| D-610 · CONTEXT:28 · :63 | :50 · :28 · :63 | 매출 발행 요청 `요청 · 발행됨 · 취소`, 구매 요청 `신청 · 구매 완료 · 취소`와 취소 주체 재량 | 지출결의가 아니다(구매 요청 취소는 GA-MF44) | 06-18 · 06-21 · 06-14 |
| 반려 · 회수 종결 | 없음 | 이 브랜치 CONTEXT에는 결정이 없다. 05 브랜치 `06-CONTEXT.md:11`이 「Phase 5에서 넘어온 것」에 「반려 · 회수 지출결의 종결(취소) 경로 — 종결 문서는 회차 상한 · 줄 문 판정에서 제외(Phase 5 U2 이관 — 사용자 결정 2026-09-26, 코디네이터 PR #89)」를 더했다 | — | 어느 플랜에도 없다 |

05 쪽 사실(pr162 `a972a5ac`, 줄 번호는 05-13 이후 밀린다):

- 종결 상태가 없다. `approval_instances_status_check`는 draft · submitted · in_review · approved · rejected · withdrawn 여섯 값이다(`db/schema/approvals.ts:33-35`).
- 반려 · 회수 문서는 기안자가 고쳐 같은 번호로 다시 낼 수 있다 — `EDITABLE_STATUSES`가 rejected · withdrawn(`domain/expenses/index.ts:120-121`), `resubmitDocument`(`domain/approvals/index.ts:799`). 종결은 「다시 안 낼 때」의 길이다.
- 번호를 받은 문서는 지울 수 없다. `deleteExpenseDraft`(`domain/expenses/index.ts:930`)가 `number !== null`을 거부한다.
- 줄 문 · 회차 상한이 반려 · 회수 문서를 센다. `expenseLineDoor`(`domain/expenses/line-door.ts:19`)의 입력 `numbered`는 번호 있는 문서 전부(제출 순)이고, 모으는 `listNumberedByLines`(`repositories/expenses.ts:276-298`)는 `number IS NOT NULL AND deleted_at IS NULL`만 거른다. `remainingForInstallments`(`domain/money/index.ts:219`) 호출부 `domain/expenses/index.ts:503` · `:875` · `:1149` · `:1174`가 같은 목록을 쓴다.
- 반려 문서가 홈의 「막힌 문서」로 계속 뜬다(`domain/approvals/index.ts:1210-1230`, `BLOCKED_REJECTED_LIMIT`). 종결 문서를 이 목록에서도 빼야 하는지 확인이 필요하다.
- 이 브랜치에는 05 브랜치의 todo `.planning/todos/pending/2026-09-26-phase-6-rejected-expense-close-path.md`와 위 CONTEXT:11 한 줄이 둘 다 없다(`.planning/todos/pending/`에 다른 여섯 파일만 있다). 05가 main에 들어올 때 CONTEXT 한 줄이 충돌 후보다.

| id | 빈 곳 | 필요한 것 | 영향 |
|---|---|---|---|
| CL-1 | 반려 · 회수 문서를 끝내는 동작이 어느 플랜에도 없다. todo가 제안한 것은 (1) 반려 · 회수 지출결의에 「종결(취소)」 동작 — 기안자(또는 경영관리), 행동 로그를 같은 트랜잭션에, 번호 재사용 없음 (2) 종결 문서를 `remainingForInstallments` · `expenseLineDoor`에서 제외 (3) 낱말 · 되돌림 · 권한은 Phase 6 계획이 정함 | 새 플랜 1개(가칭 06-26 — 번호 · 웨이브는 replan-D 인벤토리에서 정한다). `risk: money, approvals`라 Opus 실행자 + 독립 검토 1명(CLAUDE.md §4 Build). reconcile §3.1은 06-03 또는 06-13 근처를 권했고, `domain/expenses/index.ts`를 06-10 · 06-13이 이어 고치므로 그보다 앞(W2 ~ W3)이 안전하다. requirements 청구 후보: PROJ-06 · EXP-06. Phase 5 쪽 표 변경(종결 표시 칸 또는 상태값)은 `db/schema/` · `db/migrations/`라 위험 경로 PR(사용자 머지). 결정 번호는 D-614(가칭, CONTEXT 마지막이 D-613) | 06-07:171 · 06-13:33 · :221 · 06-19:34 · :138-140 · :155 · :173 · 06-23:217 · 새 플랜. 05 쪽 `expenseLineDoor` 입력 거르기 · `listNumberedByLines` · 호출부 넷 · 홈 막힌 문서 |

CL-1에서 정할 것(todo 제안 3 + 이번 조사에서 보인 것):

- 종결 표시의 자리: (가) 결재 인스턴스 상태값 추가는 공통 결재 모듈(연차 등)을 건드리고 05-01이 approvals 안의 종류 이름 리터럴을 금지하므로 무겁다. (나) `expenses` 표의 칸(`closed_at` · `closed_by` · `closed_reason`)이 05 문서에 한정된다 — 이쪽을 추천한다(내 의견). 어느 쪽이든 05 마이그레이션과 같은 두 파일 규칙(NOT VALID + `--custom` VALIDATE)이다.
- 행위자: 기안자 · 경영관리 · 둘 다(todo는 「기안자(또는 경영관리)」). 반려 · 회수 뒤 경영관리가 붙인 파일도 기안자가 뗄 수 있다는 05 답 Q2(`evidence-in-approval-rule.md:84-85`)와 같은 결로 기안자 + 경영관리 둘을 추천한다. 권한 키는 새로 만들지 기존 쓰기 권한을 쓸지.
- 사유 필수 여부 · 되돌림(재제출은 05가 이미 허용하므로 종결 되돌림은 없는 쪽이 단순하다) · 낱말(`status-map.ts`는 닫힌 표라 새 낱말이 필요하다 — 처음 쓰는 플랜이 더한다).
- 행동 로그 종류: 05 OPS-08(문서 반려 · 회수, `document_reject` · `document_withdraw`)과 같은 계열로 볼지, 끌 수 없는 `status_change`(`ALWAYS_ON_ACTION_TYPES`, `domain/action-log/record.ts:85`)를 쓸지. `document_*`는 설정으로 끌 수 있어 「로그를 같은 트랜잭션에」(todo)의 보장이 약하다(CF-9).
- 소비자 갱신: 06-07:171 「살아 있는 지출결의」에 종결 · 회수 취급, 06-13 줄 상태에서 종결 문서의 줄 상태, 06-19 D-611 문장 · PS-1 · PS-2에서 종결 제외, 06-23 항목, 05 쪽 거르기 넷(위). 06-22의 `반려`는 정산 결재 문서에 대한 대표의 반려라 별개다.

### 4.2 Phase 6 요구사항 ↔ 플랜 청구 (frontmatter `requirements:` 다시 계산)

- ROADMAP:719 Phase 6 요구사항은 12개(EXP-06 · EXP-07 · EXP-09 · EXP-10 · EXP-13 · EXP-16 · EVID-02 · EVID-03 · EVID-04 · PROJ-06 · MAST-05 · OPS-09). 05-브랜치와 이 브랜치의 `06-CONTEXT.md:9`는 앞 열 개만 적는다. MAST-05 · OPS-09는 2026-10-01 quick 261001-hfi(`REQUIREMENTS.md:299`, `STATE.md:395`)가 ROADMAP에 더했고 플랜은 그 전에 쓰였다.
- ROADMAP:728 `Plans: 25 plans`. EVID-01은 ROADMAP:696(Phase 5)에 있고 ROADMAP:781이 06-25를 「EVID-01 카드 몫」이라 적는다.
- 아래 청구 열은 25개 플랜 frontmatter를 모두 읽어 다시 셌다. 행 머리가 `RQ-`인 네 행이 이상 징후다. 요구사항 문구 수정은 `.planning/` 수동 편집 금지라 GSD 도구로 한다.

| 요구사항 | 내용(REQUIREMENTS 줄) | ROADMAP:719 | 청구하는 플랜(frontmatter) | 비고 |
|---|---|---|---|---|
| EXP-06 | :42 결재 통과 못 한 지출결의는 지급 완료 불가 · 지급 완료 줄 잠김 | 있음 | 06-03 · 06-04 · 06-13 · 06-15 · 06-24 | CL-1이 줄 문(1줄 1문서)과 닿는다. 종결 플랜이 청구 후보 |
| EXP-07 | :43 자기 카드 · 자기 팀 카드 사용 등록 · 연결 · 이중 계산 방지 | 있음 | 06-01 · 06-05 · 06-07 · 06-08 · 06-09 · 06-13 · 06-24 | Q5로 「공용 카드」가 더해지면 문구 수정(GA-67) |
| EXP-09 | :45 지급 예정일 · 지급 완료 · 이체액 → 공급가 역산 | 있음 | 06-01 · 06-02 · 06-03 · 06-04 · 06-15 · 06-17 · 06-20 · 06-23 · 06-24 | Q4 짝 · Q6 미래 지급일이 닿는다(GA-80 · GA-129) |
| EXP-10 | :46 온라인 구매 요청(신청 · 구매 완료 · 취소) | 있음 | 06-02 · 06-08 · 06-12 · 06-14 · 06-23 · 06-24 | Q2 · 낱말 `신청됨`(ST-3) |
| EXP-13 | :49 선결제(표시 · 사유 · 14일 독촉 알림) | 있음 | 06-02 · 06-10 · 06-23 · 06-24 | 독촉 알림은 Phase 7(06-CONTEXT:128). 06은 「내 차례」 항목(06-23)까지 |
| EXP-16 | :52 대리 등록(PM 알림 · 비용 `경영관리 등록`) | 있음 | 06-02 · 06-09 · 06-24 | PM 알림은 Phase 7(06-CONTEXT:128) |
| EVID-02 | :57 증빙 필수 게이트(설정 on/off) | 있음 | 06-02 · 06-04 · 06-06 · 06-10 · 06-11 · 06-24 | `hasEvidence` 호출자(K-1) |
| EVID-03 | :58 증빙 금액 = 확정 비용 | 있음 | 06-06 · 06-11 · 06-16 · 06-24 | 05에 증빙 금액 칸이 없다(§3.4 #1) |
| RQ-EVID-04 | :59 「증빙을 떼면 비용이 예상으로 돌아간다」 | 있음 | 06-11 · 06-24 | 05 결정으로 「뗀다」가 둘로 갈렸다 — 작성 중 · 반려 · 회수의 기안자 삭제(보통 삭제)와 승인 뒤 시스템 관리자 `무효`. 문구를 「무효 처리하면 비용이 예상으로 돌아간다」로 다시 읽고 06-11 재설계(GA-79)에 넣는다 |
| PROJ-06 | :32 완료(정산) 전 미결 점검 | 있음 | 06-18 · 06-19 · 06-21 · 06-22 · 06-23 · 06-24 | CL-1(반려 종결)이 열쇠. 06-18 · 06-21은 매출 발행 요청(D-610) 몫 |
| RQ-MAST-05 | :23 · :202 지급 방식 코드표를 관리 화면에서 추가 · 수정 · 비활성화, 값은 Phase 6 계획에서 정한다 | 있음(10/1 추가) | **없음(0건)** | 05가 `payment_method` 코드표를 이미 만들었다(`domain/code-tables/index.ts:39`, 시드 `domain/seed/expenses.ts:16-20` — `bank_transfer` · `corp_card` · `cash`, replan-A §2.12). 06이 할 일은 관리 코드표 화면에 실리는지 확인 + 값 목록 확정(06 CONTEXT에 값 결정이 없다) + Q4 짝 격자를 같은 화면에(GA-80). 청구 제안: 06-02 frontmatter에 MAST-05 추가(U-5) |
| RQ-OPS-09 | :136 · :276 지급 · 구매 처리를 핵심 행동 로그로 | 있음(10/1 추가) | **없음(0건)** | 내용은 이미 있다 — `payment_process`(06-03:48 · 06-15:290) · `purchase_process`(06-12:166)이고 둘 다 `CORE_ACTION_TYPES`(`domain/action-log/record.ts:21-22`)에 있다. 청구만 빠졌다 → 06-03 · 06-12 frontmatter에 OPS-09. 구멍 하나: 06-04:44는 지급 취소 · 예정일 저장을 `document_update`(AS2 기본값)로 적는데 `payment_process` · `purchase_process` · `document_update`는 모두 `ALWAYS_ON_ACTION_TYPES`(`record.ts:85`)에 없어 설정(ADMN-10)으로 끌 수 있다. D-606 「취소가 로그에 남는다」를 보장할 종류를 정한다(CF-9) |
| RQ-EVID-01 | :56 첨부 · 크기 한도 · SHA-256 중복 · 폰 사진 축소 / :226 `EVID-01 \| Phase 5 \| Pending` | 없음(ROADMAP:696 Phase 5에 있음) | 06-25만(frontmatter :24) | 06-25는 「카드 몫」(ROADMAP:781)이고 지출결의 몫은 05-09(pr162 SUMMARY — 완료)다. 06-24는 06-25에 의존하면서 requirements에서 EVID-01을 뺐다. 분할은 06-01 Task 3 REQ-ROUTE(06-01:33 · :107 · :208-241)가 사용자 선택 경로로 하도록 설계돼 있다 — REQUIREMENTS:226 갱신 + 06-24 requirements에 EVID-01 추가(RS-15) |

요약: 플랜이 0개인 ID는 MAST-05 · OPS-09(둘 다 청구만 빠졌고 내용은 05 또는 06 플랜에 이미 있다). 플랜이 하나뿐인 ID는 EVID-01(06-25). ROADMAP에 없지만 플랜이 청구하는 ID도 EVID-01이다. 요구사항 열 개는 모두 플랜이 있다.

## 5. 플랜별 역색인

재계획 때 플랜 하나를 열면서 그 플랜에 걸린 잔여 항목을 한눈에 보려는 표다. 칸 안 숫자는 아래 표 머리의 접두어를 뗀 id다(예: RS 칸의 `07`은 RS-07). 「계」는 그 플랜에 걸린 id 수다. id 정의는 각 절의 표에 있다.

- RS = §1.3 잔여 지적 · ST = §1.4 낡은 가정 · R10 = §1.6 rev 10 지적 · O = §1.7 열린 선택 · GA = §2 옛 시스템 · K = §3.1 남길 것 · NP = §3.2 미리 만들지 말 것 · CF = §3.3 6.1 충돌 · CL = §4.1 · RQ = §4.2 · U = §6
- 한 id에 플랜이 여럿이면 각 플랜 줄에 모두 나온다. 「새 플랜」(CL-1)은 번호가 정해지면 그 줄이 생긴다.

| 플랜 | 계 | RS | ST | R10 | O | GA | K | NP | CF | CL · RQ · U |
|---|---|---|---|---|---|---|---|---|---|---|
| 06-01 | 22 | 04 · 15 | 2 · 3 | F1 · F3 · F16 · R3 · C1 | 2 · 4 · 5 · 10 · 11 · 12 · 13 · 14 | 79 | 10 | - | 8 | U-5 · U-7 |
| 06-02 | 10 | 19 | - | F8 | 13 | 80 | 6 · 11 | 4 | - | RQ-MAST-05 · U-5 · U-10 |
| 06-03 | 19 | 07 · 11 · 19 · 20 | 1 | F8 | 17 | 80 · 129 | 1 · 4 · 5 · 6 | - | 5 | CL-1 · RQ-OPS-09 · U-5 · U-9 · U-10 |
| 06-04 | 16 | 18 · 20 | 1 | F5 | - | 79 · 80 · 129 | 1 · 3 · 5 · 9 | - | 9 | RQ-OPS-09 · U-5 · U-9 · U-10 |
| 06-05 | 16 | 14 · 17 · 19 | - | F4 · F12 | 7 | 67 · 129 | 2 · 9 | 2 · 5 | 3 · 4 | U-2 · U-8 |
| 06-06 | 15 | 13 · 18 | - | F2 | 2 | 79 | 1 · 3 · 4 · 9 | 1 · 3 | 1 · 5 · 9 | U-9 |
| 06-07 | 15 | 07 · 10 · 17 | 1 | F1 | 8 | - | 5 · 9 · 10 | - | 3 · 8 | CL-1 · U-3 · U-7 · U-8 |
| 06-08 | 9 | 17 · 19 | 3 | F3 | 1 · 10 · 13 | 38 · MF44 | - | - | - | - |
| 06-09 | 19 | 07 · 14 · 17 · 21 | 1 | F1 · F4 | 11 | 38 · 67 · 129 | 2 · 5 · 7 | 2 | 4 · 7 | U-2 · U-4 |
| 06-10 | 9 | 09 · 18 · 21 | - | - | 4 · 5 | - | 1 · 3 · 4 | - | 9 | - |
| 06-11 | 14 | 08 | 2 | - | 2 | 79 | 1 · 3 · 4 · 10 | 1 | 5 · 7 · 10 | RQ-EVID-04 · U-4 |
| 06-12 | 24 | 17 · 19 | 1 · 3 | F6 · F12 | 10 · 11 · 19 · 20 | 38 · 67 · MF44 | 2 · 5 · 9 | - | 3 · 4 · 7 | RQ-OPS-09 · U-2 · U-4 · U-5 · U-8 |
| 06-13 | 7 | 03 · 10 | 3 | F3 | 14 | - | - | - | - | CL-1 · U-3 |
| 06-14 | 14 | 17 | 3 | F1 · F3 · F12 · F15 | 1 · 19 · 20 | MF44 | 7 · 9 | - | 8 | U-7 |
| 06-15 | 15 | 03 · 04 · 13 · 17 | - | F7 · C1 | 1 · 2 · 3 | 79 · 80 · 129 | 1 · 3 | - | - | U-10 |
| 06-16 | 6 | 08 · 09 · 17 | 2 | F10 | - | 79 | - | - | - | - |
| 06-17 | 12 | 04 · 07 · 17 | - | F2 · F7 · R1 · R3 · C1 | 3 | 80 | 3 | - | - | U-10 |
| 06-18 | 4 | 12 | 1 | - | 12 | - | 5 | - | - | - |
| 06-19 | 10 | 04 | 1 | - | 14 · 16 | 79 · 159 | 1 · 5 | - | - | CL-1 · U-3 |
| 06-20 | 16 | 04 · 07 · 17 | - | F2 · F9 · R1 · C1 | 17 | 79 · 80 · 129 · 186 | 1 · 3 · 8 | - | - | U-10 |
| 06-21 | 5 | 12 | 1 | - | 1 · 12 | - | 5 | - | - | - |
| 06-22 | 1 | - | - | - | 16 | - | - | - | - | - |
| 06-23 | 11 | 21 | - | - | 1 · 2 · 5 · 15 · 17 · 19 | 79 | 1 | - | - | CL-1 · U-3 |
| 06-24 | 9 | 03 · 06 · 15 | - | - | - | - | 11 | 4 | - | RQ-EVID-04 · RQ-EVID-01 · U-1 · U-5 |
| 06-25 | 14 | 08 · 09 · 14 · 15 · 17 | 2 · 3 | - | 11 | 79 | 1 · 12 | - | 6 | RQ-EVID-01 · U-5 |

25개 플랜 전부에 걸리는 것(ledger 머리줄 · 인용 규칙):

- RS-01 — Codex 재확인 꼬리표 종결(ledger 머리줄 82줄, 06-24 게이트 목록)
- RS-05 — 저장소 밖 경로 인용 재발 방지
- RS-16 — 옛 ledger 문구 Supersedes 유지

플랜 밖(절차 · UI-SPEC 문서 · 다른 페이즈 · 다른 행 참조)인 것:

- RS-02 — ceo-review.md 유실, 복원하지 않음
- R10-DOC — UI-SPEC 문서 수정뿐
- R10-DROP — 버린 지적
- GA-184 — 회사 기본 설정(06 변경 없음)
- CF-2 — UI-SPEC 표 이름 오기
- U-6 — 열린 선택 일괄 확정(플랜은 O 행 참조)

## 6. 사용자 확인 목록

모두 내 제안이고 결정은 사용자 몫이다. 「추천」은 내 의견이다. 이미 확정된 것(reconcile §8 Q1 ~ Q7 · O-6 · O-21 · O-22 · O-23 · 05 「결재 중 증빙」)은 다시 묻지 않는다.

| id | 질문 | 추천 · 대안 | 영향 플랜 · 근거 |
|---|---|---|---|
| U-1 | Codex 계획 검토를 하는가 | reconcile §7(:123 · :125)은 「Codex 계획 검토 + 승인 직전 최종본 전체 Codex 검토」를 필요 게이트로 적었는데 CLAUDE.md §4 · §6 · §8과 규칙 훅 R3는 Codex를 `/plan-design-review` · `/design-review`에서만 허용한다. 추천: 「Codex 재확인」 꼬리표를 2026-09-26 사용자 결정(Fable 갈음)으로 종결하고 Codex는 `/plan-design-review --plan`에서만 부른다. 대안: 계획 전체 Codex 검토를 예외로 승인(CLAUDE.md §4 공통 규칙대로 승인이 먼저) | 06-24 게이트 목록 · 재계획 CONTEXT 한 줄. §1.2 |
| U-2 | Q5 공용 법인카드를 어디서 만드는가 | 추천: 06 앞의 별도 선행 PR(Phase 3 corp-cards 변경 — CHECK 완화 · `cardOwnerKind` · 관리 폼 · 테스트, 위험 경로라 사용자 머지)로 떼고 06-05 · 06-09 · 06-12는 그 뒤에 한다(CLAUDE.md §4 「위험 경로 변경은 별도 PR로」). 대안: 06 PR에 합친다. 함께 정할 것: 공용 카드 사용 등록 자격(소지자가 없어 기준이 없다) | GA-67 · 06-05 · 06-09 · 06-12 · replan-D §4 |
| U-3 | 반려 · 회수 종결 경로를 새 플랜으로 만드는가 | 추천: 만든다(`risk: money, approvals`, Opus 실행자 + 독립 검토 1). 세부 추천 — 종결 표시는 `expenses` 칸, 행위자는 기안자 + 경영관리, 사유 필수, 되돌림 없음(재제출은 05가 허용), 끌 수 없는 로그 종류, 새 낱말은 처음 쓰는 플랜이 `status-map.ts`에. Phase 5 쪽 표 변경은 위험 경로 PR | §4.1 CL-1 · 06-07 · 06-13 · 06-19 · 06-23 |
| U-4 | 완료 프로젝트의 사후 처리를 한 규칙으로 | 행 38(구매 완료 허용 — UI-SPEC:49 기본값) · 6.1-06 E40(증빙 붙이기 · 떼기 거부) · 05 첨부 경로(검사 없음)가 어긋난다. 추천: 사후 처리(지급 · 구매 완료 · 증빙 붙이기)는 완료 뒤에도 연다(D-47과 같은 결) — 6.1 M1의 안 「경영관리 붙이기 허용 · PM 2차 막음」. 대안: 증빙도 잠그되 05 파일 경로도 같이 잠근다 — D-611 「완료 뒤에도 경영관리가 지급할 수 있다」와 부딪혀 증빙 없는 문서는 영영 지급이 안 된다 | GA-38 · CF-7 · 06-09 · 06-11 · 06-12 · 6.1-06 · 6.1-07 |
| U-5 | 요구사항 청구 배정 | 추천: MAST-05 → 06-02, OPS-09 → 06-03 · 06-12(+ 06-04 지급 취소 로그), EVID-01은 06-25 유지 + 06-24 requirements에 추가 + REQUIREMENTS:226 분할(06-01 Task 3 사용자 선택 경로). 청구 수정은 GSD 도구로 | §4.2 · 06-01 · 06-02 · 06-03 · 06-04 · 06-12 · 06-24 · 06-25 |
| U-6 | 열린 선택 16행을 추천안대로 확정하는가 | UI-SPEC:1384가 `/gsd-plan-phase 6` 전에 한 줄씩 확인하라고 적는다(§1.7). 추천: 추천안 일괄 확정. 영향이 큰 O-11(U-4와 묶음) · O-14 · O-16 · O-19만 따로 본다. O-2는 이미 확정이라 표 표기만 고친다 | §1.7 표의 플랜들 |
| U-7 | 고르기 목록 컴포넌트 | 추천: 05의 `ui/pick-dialog/PickDialog` 하나로 두고 SP-8 계약(검색 · 행 막힘 · 현재 줄 · 1차 `이 줄로 Enter` · LOADING · EMPTY · ERROR)을 그 위에 얹는다. UI-SPEC SP-8 문구를 고치고 6.1-03 G-4는 「있으면 확장」. 대안: SP-8을 `ui/confirm-dialog` 갈래로 따로 둔다(컴포넌트 둘) | CF-8 · R10-F1 · 06-01 · 06-07 · 06-14 · 6.1-03 |
| U-8 | Q3 실행가 상한과 「파일이 이긴다」 | 추천: 파일이 이긴다 — 상한은 초과 표시만(대사는 이미 카드사에서 나간 돈의 사실을 맞추는 일이라 막으면 장부가 사실과 어긋난다). 대안: 덮기도 상한을 통과해야 하고 못 통과하면 대사 실패 줄 | CF-3 · 06-05 · 06-07 · 06-12 · 6.1-09 |
| U-9 | `hasEvidence`의 집과 `tx` 규칙 | 추천: 06-03(W2)에 순수 함수 + `tx` 선택 인자, 「트랜잭션 콜백 안 `hasEvidence(` 호출은 `tx` 인자를 가진다」는 grep · 테스트 가드, 06-25의 DTO 불리언 칸은 이름 변경(CF-6) | K-1 · RS-13 · 06-03 · 06-04 · 06-06 · 06-10 · 06-11 · 06-15 · 06-19 · 06-20 · 06-23 · 06-25 |
| U-10 | Q4 · Q6 세부 둘 | (가) 짝 판정 시점 — 추천: 지급 완료 때만(UI-SPEC 영향 표면이 S1 · S2 · S5 · S20). 대안: 05 작성 화면에서도 거름(05 화면 변경). (나) 미래 지급일로 「지급 완료」를 기록하면 — 추천: UI-SPEC 그대로(견적 줄 잠금은 기록 때, 화면은 `예정 지급` 그룹, 세율 기준일은 지급일 그대로이고 설정 이력에 미래 값이 없으면 읽는 순간의 유효값) | GA-80 · GA-129 · RS-11 · 06-02 · 06-03 · 06-04 · 06-15 · 06-17 · 06-20 |

## 부록. 읽은 것과 한계

- 읽은 것(전문 또는 해당 부분): 지난 게이트 파일 열한 개(`eng-review.md` · `eng-cross-opus.md` · `design-review.md` · `design-apply-cross-r2.md` · `final-review-fable.md` · `final-review-fable-r4.md` · `COVERAGE.md` · `design-review-rev10.md` · `codex-design-review-rev10.md` · `.continue-here.md` · `.claude/gates/phase-06.log`), `06-CONTEXT.md` · `06-RESEARCH.md` · `06-VALIDATION.md` · `06-UI-SPEC.md`(rev 10 r2 — 결정 표 · 증빙 판정 · 열린 선택 · 관련 표면), 플랜 25개의 frontmatter · ledger · 인용한 줄, gap-audit 해당 행과 옛 규칙 원문(`ERP260907-CONTEXT.md` · `erp260907-money-flow.md`), `reconcile.md` 전문, `notes-C-06.1.md` 전문, `replan-A` · `replan-D` 해당 절, 6.1 플랜 13개 · `06.1-CONTEXT.md` · 6.1 리뷰 파일(PR #164 head `002adca3` 사본), pr162(`a972a5ac`)의 해당 심볼.
- 유실: `ceo-review.md` · cross-review r1/r2 · checker r1/r2 · `design-review-opus.md` · `design-apply-r2-brief.md` · `06-gates/`는 저장소에 없다. 각 플랜 ledger 인용으로만 남았고 RS-12(06-21 TOCTOU)처럼 원 지적문을 못 찾은 항목이 있다. 2026-09-26 이전 커밋 해시는 PR #78 squash(`2adbedf5`)로 사라져 이름표로만 썼다.
- 읽지 않은 것: `docs/inputs/phase-06-payment.md`(06-CONTEXT가 정본으로 지목한 입력). 확인하지 못한 것: reconcile §7이 근거로 든 「프로젝트 지침 3장 · 10」(저장소 문서에서 보이지 않음), Phase 5 UI-SPEC ↔ UA-6xx 대조(RS-04), `docs/design/*` 줄 번호 재확인.
- 줄 번호의 기준: 06 쪽은 이 브랜치 HEAD `90fcd1c8`, 6.1 쪽은 PR #164 head `002adca3`(PR이 바뀌면 달라진다), 05 쪽은 pr162 `a972a5ac`(05-13 이후 밀린다). 「본문 0건」 판정은 25개 `06-NN-PLAN.md` grep이고 `06-RESEARCH.md` · `06-VALIDATION.md`는 따로 적은 곳만이다.
- 이 조사는 읽기 전용이었다. 저장소 파일 · `.planning/` · 커밋을 바꾸지 않았고 `mcp__hearthbot__` 도구를 쓰지 않았으며 이 파일만 새로 만들었다.
