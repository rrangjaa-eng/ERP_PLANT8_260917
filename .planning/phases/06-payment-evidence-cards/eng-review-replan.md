# /plan-eng-review — Phase 06 (지급 · 증빙 · 카드) 재계획 전 통합 검토

- 대상: `.planning/phases/06-payment-evidence-cards/06-01 ~ 06-30-PLAN.md`(30개 · 12웨이브) + `06-VALIDATION.md`
- 브랜치: `claude/06-ui-spec-revision-oju6s5` · 커밋 `5129a4e3`
- 05 기준: `refs/remotes/pr162` = `86bec989`(지난 교차 검토 `b05c3bda` 뒤 27커밋 대조). main = 작업 트리(origin/main `341537c1`)
- 입력: 검토 A(기반 · 카드) · B(지급 · 증빙 · 종결) · C(구매 · 정산 · 홈) · D(05 드리프트 · 횡단) · X(Opus 교차 검토 = outside voice)
- 실행 방식: **무인 실행(밤 위임)** — 사용자 결정 질문은 카드(AskUserQuestion) 대신 아래 Decision ledger 목록으로 남기고, 추천안을 자동으로 고른 것으로 가정한다. 아침 브리핑은 `06-eng-review-questions.md`.
- **플랜 파일은 이 세션에서 고치지 않는다.** 반영은 새 세션의 `/gsd-plan-phase 06 --reviews`가 이 보고서의 「반영 지시」 표를 그대로 쓴다.
- 이미 끝난 것(다시 열지 않음): `06-REVIEWS.md` §0(U-1~U-8 · UC-1~UC-7) · §1(C1~C19), `replan/cross-review-opus.md` X-1~X-12 · N-1~N-6, 확정 결정 8개, 크기 경고 수용.
- 확인 방법: P0 · P1 열두 건은 이 통합 세션이 플랜 줄과 pr162 실물 줄을 직접 열어 다시 확인했다(각 항목 「확인」 칸). P2 · P3은 검토자 인용을 그대로 옮겼다(재확인 안 함).

집계: **P0 3 · P1 9 · P2 22 · P3 20 = 54건**(원 보고서 합 71건 → 같은 원인 합쳐 54) · critical gap 5 · 결정 질문 7(R-1~R-7)

---

## Step 0 — Scope Challenge

- **범위 유지(자동 결정).** 30개 플랜 · 12웨이브 · ROADMAP 기준 1~5는 그대로 둔다. 발견 54건 모두 플랜 몇 줄 수정 또는 테스트 추가로 닫히며, 새 플랜을 늘리거나 페이즈를 쪼갤 근거는 없다. 15~18파일 플랜 10개 · 4태스크 플랜 3개는 이미 수용됨.
- 이미 있는 것으로 줄일 수 있는 것: 05가 b05c3bda 뒤 새로 낸 헬퍼(`listLineageLinesByProjects` · `listNumberedByLineChain` · `findExpenseApprovalStatuses` · `isCalendarDate`/`DATE_FORMAT_ERROR` · `expenseDraftFieldsSchema` · `pickEmptyText`)를 06이 다시 만들거나 모른다 → 아래 「What already exists」.
- **결정 질문(R-1): 06-26(PR-0)을 06-27(PR-A)에 흡수할지.** 지금 의존 그래프에서 06-26만 기다리는 플랜이 없다(06-30 `depends_on: ["06-26", "06-27"]` — 확인). 06-01:133 규칙 ①이 「PR-0 · PR-A 머지 뒤에만 코드 묶음을 연다」라서 PR-0을 먼저 머지해도 앞당겨지는 것이 없다. 추천 = 흡수(사용자 머지 1회 · 웨이브 1개 · 쌓인 PR 하나가 준다). 밤 동안 흡수를 가정한다.

---

## Section 1 — Architecture

| ID | 등급 | 출처 | 위치 | 문제 | 확인 |
|---|---|---|---|---|---|
| **E-3** | **P0** (9/10) | C-2 · D-F1 | 06-23:252 · :297 / pr162 `domain/approvals/index.ts:1220` | 06-23은 기안자 신호 `증빙 없음 · 지급 대기` · `선결제 증빙 {N}일 경과`를 05 훅 `blockedAfterApproval`로 세우고 엔진은 「읽기만」(:252)이라 한다. 그런데 05 A9 뒤 엔진은 훅에 넘기기 전에 SQL로 거른다 — `listDrafterInstances(viewer, { drafterId: viewer.id, status: "approved", limit: BLOCKED_APPROVED_LIMIT, unresolvedVoidOnly: true })`. 파일이 0건인 승인 문서 · 선결제 기한 초과 문서는 무효 파일이 없어 훅에 오지 않는다 → 두 신호는 **조용히 절대 서지 않는다**. 앞단 필터를 넓히면 05 A9 회귀(승인 201건 → LIMIT 200)가 깨진다. 06 플랜 전체 `unresolvedVoidOnly` grep 0. 결정 R-3 | 플랜 :252 「`listMyBlockedDocuments` — …읽기만」, :297 「엔진이 기안자 = viewer인 승인 문서 id만 넘긴다」, 실물 :1214 주석 「지금은 증빙 무효뿐」 — 확인함 |
| **E-4** | **P1** (8/10) | C-3 · D-F4 · D-F5 | 06-19:38 · :44 · :231 / 06-22:172 · :186 / pr162 `domain/settlements/index.ts:452-453` · `:468-469` | 05 A8(결재 중 지출결의가 남으면 정산 최종 승인 막힘, 사용자 확정 10/5)을 06 플랜이 모른다(`A8` · `expensesInReview` · `countInReviewByProjects` 06 전체 grep 0). ⑴ 06-22 ⑸가 표시 함수 `settlementApproveBlockedReason`을 다시 쓰며 A8 갈래 `else if (count > 0) reasons.set(row.id, expensesInReview(count))`를 지운다 ⑵ 서버는 06-22 재점검(`changeProjectStatus` 앞)이 A8(뒤)보다 먼저 서서 거부 문구가 바뀐다 ⑶ `allow_open_expenses`가 켜지면 표시는 `승인` 활성, 서버는 A8로 거부(05 E3 「같은 문구 함수 하나」 위반) ⑷ 06-22 behavior 「막힘 0 · 강행 그룹만 → 승인 · `completed`」(:172)가 강행 그룹이 결재 중 문서면 실패 ⑸ 05 A8 테스트(`settlement-approval.test.ts:402-425`)는 06-19 기안 게이트에서 먼저 깨진다. 결정 R-2 | 실물 `if (inReview > 0) throw new GateBlockedError(expensesInReview(inReview));` · 표시 갈래 확인, 06 grep 0 확인 |
| **E-9** | **P1** (7/10) | A-1 (+ C-11 카드 삭제 부분) | 06-09:270 · :314 / 06-07:38 · :210 | 카드 사용 삭제(`runDelete`)와 연결 바꾸기의 옛 쪽이 옛 줄의 **프로젝트 행을 잠그지 않는다** — :270 「옛 줄은 잠그지 않는다(줄이는 쪽은 게이트가 없다)」, :314 「줄이는 쪽이라 견적 줄을 잠그지 않는다」. 완료 프로젝트 수정 · 삭제 권한(U-4)은 트랜잭션 밖 사전 조회에서만 본다. 사전 조회 때 `settling` → 그사이 05 정산 최종 승인이 프로젝트 행을 잡고 `completed` 커밋 → 비권한자 삭제가 잠금 없이 들어가 **완료 프로젝트의 카드 비용이 조용히 준다**. 06-22 재점검 뒤 · 승인 커밋 전 창에서도 같다(C-11). 06-07이 세운 「한 프로젝트의 연결 쓰기는 모두 그 행에서 줄을 선다」의 예외가 돈이 빠지는 쪽이다 | 플랜 두 줄 그대로 확인. 실물 05 정산 승인 「프로젝트 행을 잡은 뒤 센다」(settlements:451) 확인 |
| **E-12** | **P1** (7/10) | X-F3 | 06-01:122 · :133 | 코드 묶음 PR을 어떻게 자르는지 없다. 실행은 페이즈 브랜치 하나에서 웨이브를 이어 가는데, ① 묶음 브랜치를 어느 커밋에서 따는지 ② 묶음 `/review` 지적을 어느 브랜치에서 고치는지 ③ 어떻게 다시 합치는지가 없다. 묶음을 건너 같은 파일을 고친다 — `domain/settings/keys.ts`(PR-B 06-02 → PR-C 06-04 · 06-06 → PR-D 06-08 → PR-E 06-19), `ui/status-tag/status-map.ts`(PR-B 06-01 → PR-C 06-28 → PR-E 06-19). 「세션 자율 운영」의 검증 레인 · 만들기 레인 파일 비겹침 규칙과 부딪친다 | :122 · :133 원문 확인, files_modified 교차 직접 집계 확인 |
| **E-11** | **P1** (8/10) | X-F2 · A-6 | 06-01:124-131 | PR 묶음 표(「06 실행 순서의 정본」)에 **06-30이 없다.** 06-30은 W3 · `risk: [money]` · `domain/corp-cards/index.ts`(훅이 `/cso` 강제)라 어느 PR · 어느 게이트에 실을지 근거가 없다 | 표 7행 직접 확인 — PR-C 행 `06-03(W3) · 06-04 · 06-05 · 06-28(W4) · 06-06 · 06-07(W5)`에 06-30 없음 |
| E-13 | P2 (8/10) | A-2 · D-F12 · X-F5 | 06-07:265 · :271 | 06-07이 새로 짓는 `listLineageLines(viewer, projectId, tx)`는 pr162 `listLineageLinesByProjects(viewer, projectIds, tx)`(보관 줄 제외)와 같은 SELECT다. 06-07은 보관 줄을 사슬에 넣어 화면 문(05, 보관 제외)과 서버 상한(06)이 보관 줄이 낀 사슬에서 다르게 판정할 수 있다 | — |
| E-14 | P2 (7/10) | B-5 · D-F9 | 06-28:165 · :276 ⑵ | 종결 분할 회차를 `[line.id]` 하나로 센다 — 05는 이미 사슬로 센다. 웨이브 4~7 동안 새 차수 복사 줄의 회차가 고르기 창(사슬)과 제출(줄 하나)에서 달라 회차 번호가 겹칠 수 있다. 「사슬로 넓히기는 06-13 ④」 메모도 낡음 | — |
| E-15 | P2 (6/10) | A-7 | 06-26:56-58 · 06-30:118-123 · 06-05 Task 2 ③ | 06-30이 `kind`를 1차 명사로 올리고 06-05가 공용 판정을 `kind`로만 하는데, DB는 `kind` ↔ 소지자 · 팀 조합을 묶지 않는다. 결정 R-6 | — |
| E-16 | P2 (6/10) | X-F8 | 06-26 전체 · 06-27:6 · 06-30:6 | PR-0을 따로 두어도 앞당겨지는 플랜이 없다(Step 0). 결정 R-1 | 06-30:6 · 06-27:6 확인 |
| E-17 | P2 (7/10) | X-F6 | 06-01:118 | C15-체커 게이트 `grep -c "06 체커 재실행" .planning/STATE.md`를 쓰는 도구 · 플랜이 없다(§2 `.planning/` 수동 편집 금지) — 사람이 규칙을 어겨야 06-01이 시작된다 | :118 확인 |
| E-18 | P2 (6/10) | X-F7 | 06-29:318 · 06-01:243 | 시각 기준 사진 갱신이 PR-B에만 있다. PR-C/D/E가 `projects/[id]/page.tsx` · `quote-table.tsx` · `projects/page.tsx`를 고치면 `visual.spec.ts`가 빨개져 무인 머지가 막힌다 | — |
| E-35 | P3 | A-11 | 06-01:133 | PR-B(06-01 · 02 · 29)는 새 표 · 메뉴 키를 쓰지 않는데 「PR-0 · PR-A 머지 뒤」에 묶인다 | — |
| E-36 | P3 | A-14 | 06-30:6 | `depends_on: ["06-26","06-27"]` — 06-27의 표 · 키를 쓰지 않는다. R-1을 흡수로 정하면 자동 해소 | — |
| E-37 | P3 | C-11(나머지) | 06-22 X-12 | 미결을 늘리는 쓰기 중 프로젝트 행을 잡지 않는 경로(구매 요청 취소 `runCancel` · 05 증빙 파일 제거)가 재점검 뒤 · 커밋 전에 들어올 수 있다(창 짧음). 카드 삭제 몫은 E-9로 | — |
| E-38 | P3 | C-13 | 06-22 ⑵ | `prepareSettlementFinalApproval`은 1단 승인에도 불린다 — `loadPreSettleInputs` 실패가 1단 승인도 막는 갈래를 의도로 고정할지 | — |
| E-39 | P3 | X-F9 | 06-01:116 | 선행 사용자 머지(#162 → 체커 재실행 → PR-0 → PR-A)가 직렬. #162가 더 움직이면 게이트 grep이 또 깨진다 | — |
| E-40 | P3 | X-F10 | frontmatter | `risk:` 19개 → Opus 실행자 19 · 독립 검토 19. `risk: permissions`인데 `domain/permissions/`를 안 고치는 06-02 · 06-09 · 06-20 태그 재확인 | — |
| E-41 | P3 | X-F11 | `.claude/hooks/plant8-skill-gate.sh:315` | 새 돈 모듈(`domain/payments` · `corp-card-usages` · `purchase-requests` · `issue-requests` · `pre-settle-check`)이 훅 `/cso` 정규식 밖 — 06 뒤 quick PR이 `/cso` 없이 무인 머지될 수 있다 | — |

## Section 2 — Code Quality

| ID | 등급 | 출처 | 위치 | 문제 | 확인 |
|---|---|---|---|---|---|
| **E-1** | **P0** (9/10) | B-1 · D-F2 · X-F1 · A-8 | 06-28:149 · :207 · :97 (+ :41 · :401 · :423, 06-13:173, 06-06:573) | ⓪ 멈춤 조건 `git grep -n -e "export async function listNumberedByLine(" -e "…listNumberedByLines(" -e "…listExpensePage(" repositories/expenses.ts` **3건 미만이면 멈춤**. pr162에서 단수 `listNumberedByLine`이 지워져(93cb3470) 2건 → **06-28(W4)이 착수하자마자 멈추고 W5~W12가 따라 멈춘다.** :207 「`listNumberedByLine` · `listNumberedByLines`의 WHERE에 `isNull(expenses.closedAt)`」도 없는 함수를 가리킨다 | 플랜 :149 · :207 · :97 원문 확인. 실물 `git show pr162:repositories/expenses.ts`의 `listNumberedBy*`는 `277: listNumberedByLines(` · `308: listNumberedByProject(` 둘뿐 — 확인 |
| **E-5** | **P1** (8/10) | D-F3 · C-5 · X-F4 (+ B-5 메모) | 06-13:173 · :213 · :238 · :489 | X-3 전제(「`submitExpense`는 … 받은 줄 id 하나로만 읽는다」)가 pr162에서 이미 고쳐졌다 — `listNumberedByLineChain(viewer, { projectId, lineId: line.id }, tx)`(index.ts:1153 · :1261). :173 끝 「이미 계보 조회로 바뀌어 있으면 Task 1 ④의 바꾸기를 건너뛴다」와 :238 acceptance 「`findLineLinks(`가 2 이상」이 **서로 모순**이고, ① RED(「새 차수 복사 줄」)도 05에서 이미 초록이라 볼 수 없다. 결정 R-7 | :173 건너뛰기 문장 · :238 조건 원문 확인 |
| **E-7** | **P1** (7/10) | B-3 | 06-03:207 · :222 · 06-10:39 | `decidePayable`: 「금액 = `evidenceAmountKrw ?? supplyAmountKrw`」. 06-10은 `증빙 금액`을 파일 없이 받는다. 파일 0이면 `hasEvidence` 거짓 → O-2 확인 게이트가 서지 않아 **아무도 확인하지 않은 기안자 숫자가 송금액을 정한다**. 06-11 원가 기준(「증빙이 있을 때만 증빙 금액」, 파일 0 → 금액 비움)과도 어긋난다. 결정 R-4 | :207 · :222 원문, 06-10:39(파일 조건 없음) 확인 |
| **E-8** | **P1** (8/10) | B-4 | 06-03:208 / pr162 `domain/money/index.ts:202-204` | `grossFromTotal(이체액, rates의 TAX_VAT_RATE, …)` — unit · method가 「…」. 실물은 `const raw = totalKrw / (1 + vatRate); return round(raw, unit, method);`. method에 코드북 절사가 들어가면 node에서 `1100/1.1 = 999.9999999999999` → 999, `1000010/1.1 = 909099.99…` → 909,099. 지급 기록 공급가 역산이 1원씩 틀어진다. 05 매출은 `grossFromTotal(totalKrw, vatRate, unit, "round")`(revenue:95). 결정 R-5 | node 실측 · 실물 함수 · 05 전례 확인 |
| E-19 | P2 (8/10) | D-F6 | 06-10:7-10 · :39 · :193 | 칸 추가 자리 `draftFieldsSchema` · `draftFieldsInput`이 pr162에서 `domain/expenses/draft-fields.ts`의 `expenseDraftFieldsSchema` 별칭이다 — files_modified에 없다 | — |
| E-20 | P2 (8/10) | D-F7 | 06-04:198 · 06-10:235 · 06-15:269 | 날짜 칸 「`YYYY-MM-DD` 형식만」 — 05 A6이 고친 결함 꼴(`2026-02-30` → DB 500). 06-15 통합의 `2026-13-01 → 날짜 형식 오류`가 W8에서 빨개진다 | — |
| E-21 | P2 (7/10) | D-F8 · B-12 | 06-11:287 / pr162 `domain/evidence/index.ts:220` | 중복 고리 재작성에서 05 c57f3aac `if (!other) continue;`(주인 없음 = 중복 아님)가 빠져 05 통합 「지운 문서의 파일은 중복으로 세지 않는다」가 깨진다 | — |
| E-22 | P2 (6/10) | B-7 | 06-03 · 06-17 | 05 제출 스냅숏 `payable_krw`(공급가 기준)와 06 지급 총액(`evidence_amount` · 지급일)이 같은 화면에 둘로 보일 수 있다 | — |
| E-23 | P2 (7/10) | B-9 | pr162 `domain/money/tax.ts` `applyTaxRule` | 05 기존 결함: 712,500 × 0.088 = 62699.99… → 10원 절사 62,690(정답 62,700). 06 지급 총액이 이 함수를 쓴다 | node 실측 `62699.99999999999` 확인 |
| E-24 | P2 (6/10) | A-5 | 06-29:262 · :41 · :46 | 86bec989 `PickDialog`의 `pickEmptyText` 본문 줄 · `idleReason` 바닥 줄 두 자리 중 `noneSelectableReason`이 어느 자리를 대신하는지 미정 | — |
| E-25 | P2 (6/10) | B-6 | 06-15 `listPaymentTargets` ③ | 저장소가 SQL로 쪽을 자른 뒤 JS 증빙 필터로 다시 자름 → 쪽 크기 · 총 건수 틀어짐 | — |
| E-42 | P3 | A-9 | 06-26:150 · :160 | behavior 다섯 경우 낱말 · 단언은 `error.cause.code` · `cause.constraint`(drizzle 0.45) | — |
| E-43 | P3 | A-10 | 06-27:145 | `corp_card_usages` `(registered_by, created_at)` 인덱스 · `supply+vat=total` CHECK — 위험 경로 PR 다시 열지 않으려면 지금 | — |
| E-44 | P3 | A-12 | 06-07:265 | 「빠진 줄의 사슬」은 05 함수에 없는 갈래 — 「이 함수가 `copiedFromLineId` 역참조로 따로 푼다」로 정직하게 | — |
| E-45 | P3 | A-13 | 06-02:208 · :341 | 짝 격자 같은 탭 칸 저장 경합 — 「앞 저장 끝난 뒤 보냄」 한 구절 | — |
| E-46 | P3 | A-15 · D-F15 | 06-16 · 06-25 / pr162 `domain/evidence/index.ts:262-272` | 05 A10 멱등 갈래가 권리 확인 전에 DTO를 돌려준다 — 새 주인 종류에도 열림. 「보관 뒤 완료 재시도 = 같은 파일 · 새 행 0」 회귀 한 줄 | — |
| E-47 | P3 | B-10 | 05 `listMyBlockedDocuments` | 반려 행 LIMIT 50 뒤 종결 거르기 → 종결이 많으면 미종결 반려가 빠짐. SQL WHERE로 | — |
| E-48 | P3 | B-11 | 06-28 read_first | `subjectParticle` export 0건 — ⓪에서 실제 이름 확인 | — |
| E-49 | P3 | B-13 | 06-11 기안자 추가 | 완료 프로젝트 검사를 `lockParent` 잠금 뒤로 | — |
| E-50 | P3 | B-14 | 06-20 계좌 펼침 | 경영관리 역할에 `vendor.account_number_unmasked`가 있는지 ⓪에서 확인 | — |
| E-51 | P3 | C-12 | 06-24:23 · :97 · :150 | 범위 「06-01~06-29」 · SUMMARY 문턱 28 → 「06-01~06-30(06-24 제외 29)」 · 29 | — |
| E-52 | P3 | D-F16 | 06-10:193 · 06-28:276 | `loadSubmitFacts(viewer,row,projectRow,pre,tax,codes,tx?)` 위치 인자 순서 혼동 — 「`codes` 다음 · `tx` 앞」 | — |

## Section 3 — Tests

| ID | 등급 | 출처 | 위치 | 문제 | 확인 |
|---|---|---|---|---|---|
| **E-2** | **P0** (9/10) | C-1 | 06-19:8-24 · :41 · :44 · :208 · :231 / pr162 `test/integration/fixtures/settlements.ts:26` · `test/e2e/settlement-fixture.ts:57` | 05 정산 픽스처는 실행가 있는 견적 줄(`execution: { currency: "KRW", amount: 12_400_000 …}`)을 연결 없이 만들고 발행 줄이 없다. 06-19 판정으로 D-612(「실행가가 0이 아니고 … 연결이 하나도 없는 줄」, :41) + D-613(발행 줄 0)이 막힘, 강행 키 기본 false(:44) → `submitSettlement` 거부. 05 통합 넷(`settlement-approval` · `tx-safety` · `next-turn` · `project-status`) · E2E 넷이 빨갛다. 06-19 verify는 `settlement-approval.test.ts`를 돌려 「failed가 1 이상이면 실패」(:231-232)인데 `files_modified`에 픽스처가 없다. behavior 「미결 0 → 기존 동작 그대로」(:208) — 기존 픽스처는 미결 0이 아니다. **실행 막힘** | 픽스처 :26 · e2e :57 원문, `revenue|issued` grep 0, files_modified(:21-24 테스트 넷뿐), :41 · :44 · :231-232 확인 |
| **E-6** | **P1** (9/10) | B-2 | 06-15:40 · :224 / 06-11:32 · :160 / 06-06:37 | 06-15 통합 「C4 확인 기록 없음 … 기안자 `attachEvidence` → version 그대로 → 처리 성공」(:224)은 통과할 수 없다. 06-11 B-1(:32 「확인 기록이 있든 없든 문서 version을 올린다」, :160 「version +1은 … 모든 훅 경로(기록 유무 무관)」)이 06-15보다 먼저 들어가므로 version 불일치 → 동시성 막힘, 맞춰도 06-06 O-2로 P2 막힘. 06-15:40 C4 정정 문구가 06-11 해석과 반대(06-11 반영 뒤 따라 고치지 않음 — X/N 재발 아님) | :40 · :224 · 06-11:32 · :160 원문 확인 |
| **E-10** | **P1** (7/10) | C-4 | 06-19:226 · 06-22:190 | 「기안 동시 6건」 · 「승인 동시 6건」(PR #75 풀 교착 회귀)이 「막힘 0인 `settling` 프로젝트 6개」만 적는다. 막힘 0을 가장 쉽게 만들면(지출결의 0 · 실행가 0) `computePreSettleCheck`의 행별 경로(`hasEvidence(…, tx)` · 면제 읽기 · `findLineLinks` · `resolveLineDoor`)가 한 번도 돌지 않는다. 정적 grep은 이름만 보므로 `tx = db` 기본값 리포지토리를 tx 없이 부르는 실수(pr162 `countActiveByOwner(…, tx: DbOrTx = db)` 꼴)를 못 잡는다 | 두 줄 「막힘 0인 `settling` 프로젝트 6개」 원문 확인 |
| E-26 | P2 (7/10) | D-F10 | 06-13:46 · :261 · :272 · 06-10:274 · 06-14:228 · 06-18:224 · 06-21:37 | 2건 경합 테스트가 장벽 없는 `Promise.all` — 잠금을 빼도 빨개지지 않는다(RED 주장 불가), 06-13 셋째는 비결정 | — |
| E-27 | P2 (8/10) | D-F11 | 06-VALIDATION.md:38-43 | 「매 태스크 커밋 · 매 웨이브 `pnpm test` 전체」 — CLAUDE.md §5(작업 중엔 관련 테스트만, 전체는 ready CI 한 번)와 정면 충돌. 플랜 verify 70개는 이미 한정이라 문장만 틀림 | — |
| E-28 | P2 (7/10) | C-7 | 06-24:128 · 06-23:186 | 홈 묶음 건수 고정 단언(`… 1건`) — CI E2E는 한 DB · 스펙 사이 초기화 없음(`fullyParallel: false`). 예정일 시드 · 증빙 필수 설정 방법 없음 | — |
| E-29 | P2 (6/10) | C-8 | 06-24 전체 | 구매 → 지출결의 → 발행 → 정산 기안 → 대표 승인 → 완료를 끝까지 잇는 E2E가 없다 — E-2 · E-4 같은 플랜 간 상호작용이 여기서만 드러난다 | — |
| E-53 | P3 | D-F13 | ci.yml:162-225 | 새 E2E 스펙 29개 — 샤드당 +3~5분 추정, ready 전에 `--shard` 재조정 검토 | — |

### 커버리지 도표 (주요 경로 · 계획된 테스트 · GAP)

```
경로                              계획된 테스트                              GAP
───────────────────────────────── ────────────────────────────────────────── ─────────────────────────────
카드 사용 등록/수정 (06-05/07/09)  통합 X-2 경합 · .toSQL() 잠금 단위         [GAP] 사전조회 뒤 완료 전환 →
                                                                              비권한자 삭제 (E-9)
단건 지급 (06-03/04)               동시 6건(PR#75) · 이중지급 부분유니크     [GAP] 역산 경계 1100/1,000,010 (E-8)
                                                                              [GAP] 파일0·증빙금액만 (E-7)
                                                                              [GAP] 8.8% 절사 62,700 (E-23)
일괄 지급 (06-15)                  행별 tx · 부분 실패 · C4                  [RED] C4 기대값 모순 (E-6)
증빙 무효/추가 훅 (06-11)          NOWAIT 변이 RED · 옛 version 거부         [회귀] 05 「지운 문서 파일」 (E-21)
지출결의 제출 사슬 (06-13)         2건 경합(장벽 없음)                        [약함] 장벽 없음 (E-26)
                                                                              [모순] acceptance vs 건너뛰기 (E-5)
종결 (06-28)                       afterLock 장벽                             [막힘] ⓪ grep (E-1)
정산 기안 게이트 (06-19)           동시 6건 · 다섯 갈래                       [RED] 05 정산 테스트 8개 (E-2)
                                                                              [약함] 행별 경로 안 돎 (E-10)
정산 최종 승인 (06-22)             동시 6건 · X-12 재점검                     [RED] 05 A8 테스트 (E-4)
홈 기안자 신호 (06-23)             훅 단위 · 통합 · E2E                       [GAP] 엔진 앞단 필터 (E-3)
                                                                              [약함] 고정 건수 (E-28)
PM 정산 전 흐름 끝까지 (06-24)     없음 (플랜별 조각)                         [GAP] E-29
```

## Section 4 — Performance

| ID | 등급 | 출처 | 위치 | 문제 |
|---|---|---|---|---|
| E-30 | P2 (7/10) | C-6 · D-F14 | 06-22:186 ⑸ · :228 | 표시 막힘이 「행마다 `getPreSettleCheck`」 — 05 엔진이 대표 결재함 · 결재 시트 · 홈에서 부른다(N × 설정 4 + 범위 + 노출 + 문서마다 `hasEvidence`). 문서 화면은 같은 계산 두 번 |
| E-31 | P2 (6/10) | C-9 | 06-23:193 · :230 | 홈 로드마다 PM 정산 프로젝트 수만큼 전체 점검, 경영관리는 `listPaymentTargets` 전체 — 측정 기준 없음 |
| E-32 | P2 (7/10) | A-3 | 06-07:283 | `searchLinesForCardLink` 반대쪽 줄 상태 출처 없음 — 줄마다 읽으면 N+1. pr162 `findExpenseApprovalStatuses` 한 번 |
| E-33 | P2 (6/10) | A-4 | 06-07:284 · :367 | `loadLineRoomBasis`가 줄마다 거래처 · 코드표 규칙 → 상세 화면 N+1. 묶음 조회 · 세율 한 번 |
| E-34 | P2 (6/10) | B-8 | 06-15 → 06-03 | 일괄 지급 행마다 `loadPaymentInputs`(결재 보기 · 코드표 · 설정 · 세율) 재조회 — 200행이면 수백 번(교착 아님) |
| E-54 | P3 | C-10 | 06-23:230 | 구매 묶음 「가장 오래된 {MM-DD}」를 첫 페이지 행에서 읽으면 틀림 — 서버 집계 칸에서 |

트랜잭션 안 전역 `db`: **새 위반 계획 없음**(D §4 · A · B · X 일치 — 14개 플랜 쓰기 몸통 grep acceptance, `recordAction(…,{tx})`가 설정도 tx로 읽음 실측). 남은 위험은 E-10(테스트가 행별 경로를 안 돎)뿐.

---

## Outside Voice — Opus 교차 검토

- provider = **claude in-host**(Opus, 별도 에이전트 · 독립 문맥). Codex는 이 저장소에서 디자인 검토 밖 호출이 막혀 있다(규칙 훅 R3 · gstack `codex_reviews disabled`, CLAUDE.md §6).
- X 단독 발견: E-12(묶음 PR 자르기 절차) · E-16/R-1(06-26 흡수) · E-17(C15 체커 게이트) · E-18(시각 기준 사진) · E-39 · E-40 · E-41.
- X와 다른 검토자가 겹친 것: E-1(A · B · D와 공통 — X는 P1, B는 P0) · E-11(A와 공통) · E-13(A · D와 공통) · E-5(C · D와 공통).
- **긴장(Cross-model tension):**
  1. E-1 등급 — X · D는 P1(고치기 쉬움), B는 P0. 정의상 「실행이 막힘」 = P0이므로 **P0 채택**.
  2. E-5 고칠 방향 — D는 「④ 바꾸기 유지 · 이유만 바꿈(`findLineLinks`)」, X는 「05 `listNumberedByLineChain` 재사용 · acceptance 완화」. E-13(보관 줄 범위 차이)과 엮이면 D안은 화면 · 서버 어긋남을 되살릴 위험 → **X안 추천**(R-7).
  3. R-1 vs E-36 — A는 「06-30 의존에서 06-27을 빼자(PR-0 분리의 이득을 살림)」, X는 「06-26을 06-27에 흡수」. 06-01:133 규칙 ①이 코드 묶음을 PR-0 · PR-A 둘 다 머지 뒤에만 열게 하므로 의존을 빼도 일정 이득이 없다 → **흡수 추천**, E-36은 흡수 시 자동 해소.
- X 권고(「실행 전에 플랜을 고친다 — F1 · F2 · F3 먼저」)는 이 보고서의 P0 · P1 묶음에 들어 있다.

---

## 반영 지시 (재계획 세션 `/gsd-plan-phase 06 --reviews`용)

| 플랜 | 고칠 줄 | 방향 | ID |
|---|---|---|---|
| 06-28 | :149 | ⓪ grep에서 `listNumberedByLine(`을 빼고 「`listNumberedByLines(` · `listExpensePage(` 2건 미만이면 멈춤」 + 「`domain/expenses/index.ts`에 `listNumberedByLineChain(` 1건」 | E-1 |
| 06-28 | :41 · :97 · :207 · :401 · :423 | `listNumberedByLine ·` / `listNumberedByLine(s)`를 `listNumberedByLines`로. :207 「`listNumberedByLines` 하나의 WHERE에 `isNull(expenses.closedAt)` — 사슬 읽기 `listNumberedByLineChain`도 이것을 부른다」 | E-1 |
| 06-28 | read_first 05 줄 번호 | 86bec989 기준으로 다시: `doorFor` 441 · `loadSubmitFacts` 사슬 호출 1153 · `lineFactsFor` 1261. `subjectParticle` 실제 export 확인 단계 | E-1 · E-48 |
| 06-28 | :165 · :276 ⑵ | 종결 분할 읽기에 사슬 줄 id 전부(`listNumberedByLineChain`과 같은 집합)를 넘긴다. 「사슬로 넓히기는 06-13 ④」 삭제 | E-14 |
| 06-13 | :173 · :213 · :238 · :489 · must_haves · 위협 표 | (R-7 추천) 05 `listNumberedByLineChain`을 그대로 둔다. :238 → 「`listNumberedByLine(Chain|s)\(` 또는 `findLineLinks(` 1건 이상」, 「새 차수 복사 줄」은 회귀 가드(RED 생략, SUMMARY 한 줄). 「05 결함」 표현 → 「05 수정됨(93cb3470)」. ④의 06-28 X-9 문장 삭제 | E-5 |
| 06-19 | files_modified(:8-24) · Task 1 ⑦ · verify(:231) | `test/integration/fixtures/settlements.ts` · `test/e2e/settlement-fixture.ts` 추가. ⑦에 「05 정산 픽스처를 막힘 0으로 — 줄마다 연결(또는 실행가 0) + 발행 줄 1건(강행 키 켜기 금지)」. verify에 05 통합 넷(`settlement-approval` · `tx-safety` · `next-turn` · `project-status`) · E2E 넷 이름으로 | E-2 |
| 06-19 | Task 1 · read_first | A8 테스트 고정 꼴: 「정산 기안 먼저 → 지출결의 제출 뒤로」(R-2 추천), read_first에 `settlement-approval.test.ts` A8 describe. `files_modified`에 `test/integration/settlement-approval.test.ts` | E-4 |
| 06-19 · 06-22 | 06-19:226 ⑵ · 06-22:190 | 「동시 6건」 프로젝트 6개 = 결재 통과 · 증빙 있음 지출결의 1(면제 읽기 포함) + 카드 사용 이어진 줄 1 + `신청됨` 구매 요청 이어진 줄 1 + 발행 줄 1 | E-10 |
| 06-22 | :29 · :33 · :172 · :186 ⑶⑸ · :228 | (R-2 추천) A8 유지. 표시 · 서버 순서 = `BACK_TO_PROGRESS` > `결재 중 지출결의 {N}건 · 지출결의 결재 먼저` > `완료 전 점검 {N}건 · 담당 PM {이름}`. ⑸에 A8 갈래 보존, ⑶에서 A8을 재점검 앞(같은 tx · 프로젝트 잠금 뒤)으로. :172 「강행 그룹만」 픽스처 = 결재 통과 · 증빙 없음 문서. ⑸ 프로젝트 id 중복 제거 · 프로젝트 무관 설정 한 번 읽기 | E-4 · E-30 |
| 06-23 | :252 · :297 · files_modified(:7-16) · frontmatter `risk` · T-06-190 | (R-3 추천) 종류 정의에 선택 필드 `blockedAfterApprovalCandidates`(종류가 후보 SQL), 엔진은 있으면 그것, 없으면 `unresolvedVoidOnly`. files_modified + `domain/approvals/index.ts` · `domain/approvals/kinds.ts` · `repositories/expenses.ts` · `test/integration/approvals-extensions.test.ts`. 「읽기만」 삭제. `risk: [approvals]`. verify에 05 A9 케이스 + 「증빙 0 승인 문서가 201번째로 오래돼도 홈에 선다」 | E-3 |
| 06-23 · 06-24 | 06-23:186 · 06-24:128 | 건수 정규식 `\d+건` + 「처리 전 N → 처리 뒤 N−1」, 시드 `scheduledPaymentDate = seoulToday()`, 증빙 필수는 기본값 확인만. 06-23에 홈 공급 조회 수 단언 1건 | E-28 · E-31 |
| 06-15 | :40 · :224 | :40 C4 문단을 06-11:160 해석(줄 지움은 기록 있을 때만, version +1은 항상)으로. :224 기대 → 「version +1 → 행 동시성 막힘(옛 스냅숏) · 다시 고르면 P2 `selectable:false`」 | E-6 |
| 06-15 | ③ `listPaymentTargets` · 일괄 경로 | 쪽 자르기 한 곳으로(SQL 필터로 내리거나 domain에서만). 단건 함수가 세율 · 설정 · 코드표를 선택 인자로 받아 일괄에서 한 번 읽어 넘김 | E-25 · E-34 |
| 06-03 | :207 · :222 | (R-4 추천) 「금액 = (`hasEvidence`(tx) 참 && `evidenceAmountKrw` 있음) ? 증빙 금액 : 공급가액」. 단위 「파일 0 · 증빙 금액만 → 공급가로」 | E-7 |
| 06-03 | :208 · :222 | (R-5 추천) 「unit = `TAX_ROUNDING_VAT_UNIT`, method = `"round"`(05 매출 전례)」. 단위 경계 1100 → 1000 · 1,000,010 → 909,100 · 33 → 30. 회귀 1건 712,500 · 8.8% · 10원 절사 → 62,700(빨가면 05 `round` 보정은 별도 fix · `/cso`) | E-8 · E-23 |
| 06-03 · 06-17 | 지급 총액 표시 | 「지급 뒤에는 지급 기록 값이 정본, 05 세율 바뀜 줄은 지급된 문서에서 숨김」 한 줄 | E-22 |
| 06-09 | :270 · :314 · ~:333 acceptance | `runDelete`(견적 줄 연결 건)와 `runUpdate` 연결 변경의 옛 쪽도 첫 줄에 `lockProjectForLinkWrite(viewer, { projectId: 옛 줄 프로젝트, allowCompleted: pre.completedAllowed }, innerTx)`(줄 잠금 · 상한은 생략 가능). 순서 grep에 `lockProjectForLinkWrite(` 추가. 통합 「사전 조회 뒤 완료 전환 → 비권한자 삭제 = `CompletedProjectError` · 행 그대로」 | E-9 |
| 06-07 | :210(B-1) | 「프로젝트 여럿이면 id 순」 한 줄 | E-9 |
| 06-07 | :265 · :267 · :271 · :283 · :284 · read_first | 05 `listLineageLinesByProjects`를 넓혀(보관 시각 · 실행가 선택 칸) 재사용, 「보관 줄은 사슬에서 빠진다 — 05와 같은 범위」. 빠진 줄 사슬은 「`copiedFromLineId` 역참조로 따로 푼다」. :283 상태 = `findExpenseApprovalStatuses` 한 번. :284 거래처 · 코드표 묶음 조회 · 세율 한 번, 서명 `lineIds[]` | E-13 · E-44 · E-32 · E-33 |
| 06-10 | :7-10 · :39 · :193 | files_modified + `domain/expenses/draft-fields.ts`, 「`expenseDraftFieldsSchema`에 네 칸 — 액션 · 도메인 공용」. `loadSubmitFacts` 인자 위치 명시 | E-19 · E-52 |
| 06-04 · 06-10 · 06-15 | 06-04:198 · 06-10:235 · 06-15:269 | 날짜 칸은 05 `isCalendarDate`(lib/dates.ts) + `DATE_FORMAT_ERROR` 재사용 — 새 문구 상수 금지 | E-20 |
| 06-11 | :287 · verify | 「`load`가 null이면 중복에서 뺀다(05 c57f3aac)」 + verify에 `evidence-upload.test.ts`. 완료 프로젝트 검사를 `lockParent` 뒤로 | E-21 · E-49 |
| 06-13 · 06-10 · 06-14 · 06-18 · 06-21 | 2건 경합 케이스 | 05 `deps.afterLock` 장벽 + `pg_blocking_pids` 확인 꼴. 06-13 셋째는 순서 고정 두 케이스로 | E-26 |
| 06-01 | :124-131 | PR-C 행에 `06-30(W3)` 추가. (R-1 흡수 시) PR-0 행 삭제 · PR-A = 06-26+06-27 | E-11 · E-16 |
| 06-01 | :122 · :133 | 다섯 줄: 묶음 브랜치 = 그 묶음 마지막 플랜 SUMMARY 커밋에서 딴 브랜치 · 지적 수정은 묶음 브랜치 · 머지 뒤 페이즈 브랜치가 origin/main을 머지 커밋으로 받음 · 겹치는 파일(`keys.ts` · `status-map.ts`)은 그 묶음 머지 전까지 뒤 플랜이 손대지 않음(아니면 대기) · ④ ready 전 visual-baseline 한 번(사진 바뀐 묶음만). :133 ①을 「PR-C부터」로 | E-12 · E-18 · E-35 |
| 06-01 | :118 | C15 확인을 GSD 산출물(05 머지 뒤 날짜의 06 plan-checker 결과) 또는 `gsd-tools state add-decision` 한 줄로 | E-17 |
| 06-26 / 06-27 / 06-30 | 전체 · :6 | (R-1 추천) 06-26 CHECK 완화(NOT VALID + VALIDATE)를 06-27 표 명세 한 항목으로 흡수, 06-26은 「06-27에 흡수」로 닫음. 06-30 `depends_on: ["06-27"]`. (R-6 추천) CHECK = `corp_cards_owner_kind_check`(kind ↔ 소지자 · 팀 짝) | E-16 · E-36 · E-15 |
| 06-29 | :262 · read_first | 바닥 줄 우선순위 `resultLine ?? noneSelectableReason ?? idleReason`, 본문 none-selectable 줄 대체. 단위 한 줄 | E-24 |
| 06-24 | :23 · :97 · :150 · Task 2 | 범위 06-30 · 문턱 29. 「PM 정산 흐름」 E2E 하나(또는 SUMMARY 「플랜별 E2E로 대체」). 샤드 재조정 검토 한 줄 | E-51 · E-29 · E-53 |
| 06-VALIDATION | :38-43 | Sampling 세 줄을 CLAUDE.md §5 문장으로(전체 = ready CI · `/gsd-verify-work` 전 CI 초록 확인) | E-27 |
| 나머지 P3 | — | E-42 · E-43 · E-45 · E-46 · E-47 · E-50 · E-37 · E-38 · E-40 · E-54: 재계획 세션 판단(한 줄 반영 또는 SUMMARY 수용). E-39 · E-41은 `.planning` todo | — |

---

## NOT in scope

- `06-REVIEWS.md` §0 · §1, X-1~X-12 · N-1~N-6, 확정 결정 8개 — 재발 근거 없음(E-6은 재발이 아니라 06-11 반영 뒤 06-15 미추종).
- 05 자체 결함 수정(E-23 `applyTaxRule` 부동소수 · E-47 반려 LIMIT · E-46 멱등 권리) — 06은 회귀 테스트만, 고치기는 별도 fix.
- 훅 `/cso` 정규식 확장(E-41) — 위험 경로 별도 PR.
- UI-SPEC · 디자인 판정(`/plan-design-review` 몫).

## What already exists (05 · pr162 86bec989 — 06이 재사용할 것)

| 이미 있는 것 | 위치 | 06에서 |
|---|---|---|
| `listNumberedByLineChain(viewer,{projectId,lineId},tx?)` | `domain/expenses/index.ts:482` (비공개) | 06-13 · 06-28 사슬 읽기 (E-1 · E-5 · E-14) |
| `listLineageLinesByProjects(viewer,ids,tx)` | `repositories/quote-lines.ts:61` | 06-07 계보 조회 대체 (E-13) |
| `findExpenseApprovalStatuses` | `repositories/` (86bec989 신규) | 06-07 줄 상태 (E-32) |
| `isCalendarDate` · `DATE_FORMAT_ERROR` | `lib/dates.ts` · `domain/expenses/draft-fields.ts` | 06-04 · 10 · 15 날짜 (E-20) |
| `expenseDraftFieldsSchema` | `domain/expenses/draft-fields.ts` | 06-10 칸 추가 (E-19) |
| `countInReviewByProjects` · `expensesInReview` (A8) | `domain/settlements/index.ts:452` | 06-22 순서 (E-4) |
| `unresolvedVoidOnly` · `BLOCKED_APPROVED_LIMIT` (A9) | `domain/approvals/index.ts:1215-1220` | 06-23 후보 훅 (E-3) |
| `grossFromTotal(…, "round")` 전례 | `domain/revenue/index.ts:95` | 06-03 역산 (E-8) |
| `submitExpense(…, deps.afterLock)` 장벽 | `domain/expenses/index.ts:926` | 2건 경합 (E-26) |
| `pickEmptyText` · `idleReason` | `ui/` PickDialog | 06-29 (E-24) |
| `countingFindVisibility` 조회 수 단언 꼴 | `test/integration/approvals-inbox-projection.test.ts` | 06-23 홈 조회 수 (E-31) |

## Failure modes

| 실패 | 테스트 | 오류 처리 | 사용자에게 보임 | critical gap |
|---|---|---|---|---|
| 홈 기안자 신호가 안 섬 (E-3) | 계획됐으나 엔진 경로 안 탐 | 없음 | 조용함 | **예** |
| 완료 프로젝트 카드 비용이 완료 뒤 줆 (E-9) | 없음 | 사전 조회뿐 | 조용함 | **예** |
| 확인 안 된 기안자 숫자로 송금 (E-7) | 없음 | 없음 | 조용함 | **예** |
| 공급가 역산 1원 틀림 (E-8) | 없음 | 없음 | 조용함 | **예** |
| 원천징수 10원 틀림 (E-23, 05 기존) | 없음 | 없음 | 조용함 | **예** |
| 06-28 착수 멈춤 (E-1) | — | ⓪ 멈춤 | 실행 멈춤 | 아니오(시끄러움) |
| 05 정산 테스트 8개 빨강 (E-2) · A8 테스트 (E-4) · C4 (E-6) | 빨강 | — | CI 빨강 | 아니오 |
| 풀 교착 회귀 미검출 (E-10) | 약함 | — | 운영 멈춤 | 아니오(정적 grep 일부) |

**critical gap 5건**(E-3 · E-7 · E-8 · E-9 · E-23).

## Worktree parallelization

기존 웨이브 유지(같은 웨이브 안 같은 파일 교차 0건 — X 확인). 단 E-12의 묶음 간 겹침 파일(`keys.ts` · `status-map.ts`)은 웨이브가 아니라 묶음 PR 순서 규칙으로 막는다.

---

## Decision ledger (밤 위임 — 추천안을 가정, 아침에 사용자 확인)

### R-1 — 06-26(PR-0)을 06-27(PR-A)에 흡수 (E-16 · E-36)
- 상황: 06-26만 기다리는 플랜이 없고, 코드 묶음은 PR-0 · PR-A 둘 다 머지된 뒤에만 열린다. PR-0 분리는 사용자 머지 1회 · 웨이브 1개 · 쌓인 PR을 더한다.
- 추천: 06-26의 CHECK 완화를 06-27 표 명세에 넣고 06-26은 「흡수」로 닫는다. 06-30 `depends_on: ["06-27"]`.
- 다른 방식: 분리 유지, PR-A를 PR-0 위에 쌓지 말고 PR-0 머지 뒤 main에서 딴다(A안: 06-30 의존에서 06-27을 뺌).
- 이유: 지금 의존 그래프에서 분리의 일정 이득이 0이고 스쿼시 머지 + force push 금지라 쌓인 PR 정리 비용만 남는다. C8(분리) 당시엔 의존이 달랐던 것으로 보인다.
- State: pending(밤 위임 추천안 가정)

### R-2 — 05 A8과 06 강행 허용의 관계 (E-4)
- 상황: 05 A8(결재 중 지출결의 남으면 정산 최종 승인 막힘, 사용자 확정 10/5)은 강행 허용과 무관하게 막는데, 06-22는 `allow_open_expenses`가 켜지면 통과시키고 표시 함수에서 A8 갈래를 지운다.
- 추천: A8은 강행으로 넘길 수 없는 절대 규칙. 표시 · 서버 순서 = 진행 복귀 > A8 > 완료 전 점검. 06-22 ⑸에 A8 갈래 보존, ⑶에서 A8을 재점검 앞으로. 05 A8 테스트는 「정산 기안 먼저 → 지출결의 제출 뒤」로.
- 다른 방식: (나) A8을 06 재점검에 흡수하고 05 코드 · 테스트 삭제(강행 시 결재 중 문서가 남은 채 완료 가능) / (다) 그대로 두고 ⑸만 보존(거부 문구가 상황 따라 둘).
- 이유: 결재 중 문서가 완료 프로젝트 위에서 승인 · 반려되는 것을 막는 무결성 규칙이고 사용자 확정이 06 설계보다 늦다.
- State: pending(밤 위임 추천안 가정)

### R-3 — 06-23 기안자 신호 후보를 누가 고르나 (E-3)
- 상황: 05 엔진은 승인 문서를 「무효 뒤 새 증빙 없음」만 SQL로 먼저 걸러 훅에 넘긴다. 06의 「증빙 없음 · 지급 대기」 · 「선결제 경과」 문서는 훅에 닿지 않는다.
- 추천: 종류 정의에 선택 필드(종류가 자기 SQL로 후보 문서를 냄)를 더하고 엔진은 있으면 그것, 없으면 지금 경로. 06-23이 `domain/approvals/`를 고치므로 `risk: [approvals]` · `/cso`.
- 다른 방식: ① 엔진 앞단 필터를 「파일 0 ∨ 무효 미해소」로 넓힘(05 A9 LIMIT 회귀 깨짐) ② 두 신호를 결재 엔진 밖 06-23 홈 공급 갈래로 냄(엔진 무변경, 「문서마다 한 줄」 합치기 지점이 둘).
- 이유: 기존 경로를 그대로 두고 후보 정의가 지출결의 종류 한 곳에 남으며 종류 리터럴 없음(C3) 유지.
- State: pending(밤 위임 추천안 가정)

### R-4 — 파일 없이 들어온 증빙 금액을 지급 계산에 쓸지 (E-7)
- 상황: 06-03은 증빙 금액이 있으면 늘 그것으로 지급 총액을 정하는데, 06-10은 파일 없이 증빙 금액을 받는다.
- 추천: 살아 있는 증빙 파일이 있을 때만 증빙 금액, 없으면 공급가.
- 다른 방식: ① 파일 없으면 칸 비활성 + 서버 거부(선지급 흐름에서 미리 못 적음) ② 지금대로 + 「확인 전」 게이트(확인할 파일이 없는 이상한 상태).
- 이유: 06-11 원가 기준(파일 0 → 금액 비움)과 같은 규칙이 되고 확인 안 된 숫자가 송금액을 정하지 못한다.
- State: pending(밤 위임 추천안 가정)

### R-5 — 공급가 역산의 반올림 (E-8)
- 상황: 06-03의 역산 함수 호출에 반올림 단위 · 방식이 비어 있다. 절사가 들어가면 부동소수로 1원씩 틀어진다.
- 추천: 부가세 반올림 단위 설정값 + 반올림(`"round"`) 고정(05 매출 전례).
- 다른 방식: 코드표의 반올림 방식을 따르되 정수 연산 · epsilon 보정을 반드시 함께.
- 이유: 역산은 세액이 아니라 표시용 공급가라 절사 규칙을 따를 이유가 없고 05 전례와 같다.
- State: pending(밤 위임 추천안 가정)

### R-6 — 카드 종류와 소유 칸을 DB가 묶을지 (E-15)
- 상황: 06-05 공용 판정은 `kind`만 보는데 DB CHECK는 「소지자 · 팀 둘 다 있음」만 막는다.
- 추천: CHECK를 `kind` ↔ 소유 칸 짝으로(`personal`=소지자만 · `team`=팀만 · `shared`=둘 다 없음), NOT VALID + VALIDATE 두 파일 구조 그대로. 스테이징 · 덤프로 기존 `kind` 값 먼저 확인(프로덕션 직접 금지).
- 다른 방식: 지금대로 도메인 단일 방어(나중에 막으려면 위험 경로 PR 하나 더).
- 이유: 「누락 입력이 조용히 공용」을 DB에서도 막고 위험 경로 PR을 다시 열지 않는다.
- State: pending(밤 위임 추천안 가정)

### R-7 — 06-13 X-3 낡은 전제의 정리 방향 (E-5)
- 상황: 05가 이미 제출 경로를 계보 사슬로 읽는데 06-13은 「05 결함을 닫는다」며 바꾸기를 요구하고, 건너뛰기 지시와 acceptance가 서로 모순이다.
- 추천: 05 `listNumberedByLineChain`을 그대로 쓰고 acceptance를 「사슬 함수 또는 `findLineLinks` 중 하나」로 완화, 「새 차수 복사 줄」은 회귀 가드.
- 다른 방식: ④ 바꾸기를 유지하되 이유를 「카드 쪽 연결 · 지급 사실을 한 조회로」로 바꾸고 건너뛰기 문장 삭제(D안).
- 이유: 최소 변경이고, 06-07 계보 조회가 보관 줄을 넣는 차이(E-13)와 엮여 화면 · 서버 어긋남을 다시 만들 위험을 피한다.
- State: pending(밤 위임 추천안 가정)

---

## Implementation Tasks (재계획 세션 순서)

| T | 등급 | 플랜 파일 | 내용 | ID |
|---|---|---|---|---|
| T1 | P0 | 06-28 | ⓪ grep · :207 · :97 · read_first 줄 번호 · 종결 회차 사슬 | E-1 · E-14 · E-48 |
| T2 | P0 | 06-19 | 05 정산 픽스처 두 파일 files_modified · ⑦ · verify 8개 | E-2 |
| T3 | P0 | 06-23 | 후보 훅(R-3) · files_modified · risk · verify(A9 · 201번째) | E-3 |
| T4 | P1 | 06-22 · 06-19 | A8 순서(R-2) · 표시 갈래 보존 · A8 테스트 고정 꼴 | E-4 |
| T5 | P1 | 06-13 | X-3 전제 정리(R-7) · acceptance · RED 기대 | E-5 |
| T6 | P1 | 06-15 | C4 문단 · :224 기대값 | E-6 |
| T7 | P1 | 06-03 | 증빙 금액 조건(R-4) · 역산 반올림(R-5) · 경계 · 8.8% 회귀 | E-7 · E-8 · E-23 |
| T8 | P1 | 06-09 · 06-07 | 삭제 · 옛 쪽 프로젝트 잠금 · id 순 · 통합 경합 | E-9 |
| T9 | P1 | 06-19 · 06-22 | 동시 6건 픽스처를 행별 경로 포함으로 | E-10 |
| T10 | P1 | 06-01 | PR 표에 06-30 · 묶음 브랜치 다섯 줄 · visual-baseline · C15 게이트 | E-11 · E-12 · E-17 · E-18 · E-35 |
| T11 | P2 | 06-26 · 06-27 · 06-30 | 흡수(R-1) · kind CHECK(R-6) · 의존 | E-15 · E-16 · E-36 |
| T12 | P2 | 06-07 | 계보 헬퍼 재사용 · 상태 · 묶음 조회 | E-13 · E-32 · E-33 · E-44 |
| T13 | P2 | 06-10 · 06-04 · 06-15 · 06-11 | draft-fields.ts · 날짜 검증 재사용 · 중복 고리 continue · 쪽 자르기 · 일괄 deps | E-19 · E-20 · E-21 · E-25 · E-34 · E-52 |
| T14 | P2 | 06-22 · 06-23 · 06-24 | 표시 점검 묶음 · 홈 조회 수 · 고정 건수 · PM 흐름 E2E | E-28 · E-29 · E-30 · E-31 |
| T15 | P2 | 06-13 외 넷 · 06-VALIDATION · 06-29 · 06-03/17 | 경합 장벽 · Sampling 문장 · PickDialog 바닥 줄 · 지급 총액 정본 | E-22 · E-24 · E-26 · E-27 |
| T16 | P3 | 여러 | 나머지 P3 한 줄 반영 또는 SUMMARY 수용 · todo | E-37~E-54 |

---

## 부록 — Suppressed findings (합쳐지거나 등급이 바뀐 원 발견)

| 원 발견 | 처리 |
|---|---|
| B-1(P0) · D-F2(P1) · X-F1(P1) · A-8(P2) | E-1로 합침, **P0 채택**(실행 막힘 정의) |
| C-2(P0) · D-F1(P0) | E-3으로 합침 |
| C-3(P1) · D-F4(P1) · D-F5(P1) | E-4로 합침 |
| D-F3(P1) · C-5(P2) · X-F4(P2) · B-5의 「06-13 ④ 중복」 메모 | E-5로 합침, **P1 채택**(실행 전 수정 필요 · 지시 모순) |
| X-F2(P1) · A-6(P2) | E-11로 합침, **P1 채택** |
| A-1(P1) · C-11의 카드 삭제 부분(P3) | E-9로 합침, C-11 나머지는 E-37(P3) |
| A-2(P2) · D-F12(P2) · X-F5(P2) | E-13으로 합침 |
| B-5(P2) · D-F9(P2) | E-14로 합침 |
| D-F8(P2) · B-12(P3) | E-21로 합침, **P2 채택** |
| C-6(P2) · D-F14(P3) | E-30으로 합침, **P2 채택** |
| A-15(P3) · D-F15(P3) | E-46으로 합침 |
| A-14(P3) | E-36 유지, R-1 흡수 시 자동 해소 |
| D §3 잠금 순서 표 · §4 전역 db · 각 보고서 「문제 없음 확인」 | 재검토 불필요 목록으로 수용(새 위반 없음, 거꾸로 잡는 경로 없음) |
| 등급을 내린 것 | 없음 — P0 · P1 열두 건 모두 플랜 줄 · 실물 줄을 직접 열어 인용대로 확인됨 |

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|---|---|---|---|---|---|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | 마일스톤 수준에서만(CLAUDE.md §4) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | issues_open | 54건 — P0 3 · P1 9 · P2 22 · P3 20, critical gap 5 |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | 이 검토 범위 밖 |
| Outside Review | Opus in-host (Codex 차단: R3 · codex_reviews disabled) | Independent 2nd opinion | 1 | issues_open | 11건(P1 3 · P2 5 · P3 3, 그중 결정 1), 긴장 3 해소 |

**VERDICT:** NOT CLEARED — P0 3 · P1 9가 열려 있다. `/gsd-plan-phase 06 --reviews` 새 세션에서 「반영 지시」 표를 반영한 뒤 재검토 최대 1회(§4).

**UNRESOLVED DECISIONS:**
- R-1 06-26(PR-0)을 06-27에 흡수 — 추천 흡수(밤 위임 가정)
- R-2 05 A8과 강행 허용 — 추천 A8 절대 규칙 · 순서 진행 복귀 > A8 > 점검(밤 위임 가정)
- R-3 06-23 기안자 신호 후보 — 추천 종류 정의 선택 필드 · `risk: [approvals]`(밤 위임 가정)
- R-4 파일 없는 증빙 금액 — 추천 파일 있을 때만 증빙 금액(밤 위임 가정)
- R-5 공급가 역산 반올림 — 추천 단위 설정값 + 반올림 고정(밤 위임 가정)
- R-6 카드 종류 ↔ 소유 칸 CHECK — 추천 짝 CHECK(밤 위임 가정)
- R-7 06-13 X-3 낡은 전제 — 추천 05 사슬 함수 재사용 · acceptance 완화(밤 위임 가정)
