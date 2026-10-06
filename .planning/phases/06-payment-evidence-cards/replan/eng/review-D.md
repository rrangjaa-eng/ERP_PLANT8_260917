# 06 eng 검토 D — 횡단(05 드리프트 · 트랜잭션 안 전역 db · 잠금 순서 · 테스트 전략)

기준: 플랜 = 브랜치 claude/06-ui-spec-revision-oju6s5 @5129a4e3, 05 실물 = refs/remotes/pr162 @86bec989(지난 교차 검토 b05c3bda 이후 27커밋 · domain/repositories 17파일).
방법: `git diff b05c3bda 86bec989 -- domain repositories lib` 심볼 추출 → 06 플랜 30개 grep 대조. 플랜 ⓪ 표의 「멈춤」 `git grep` 222개를 pr162 트리에서 실제로 돌렸다(06이 만들 심볼 · origin/main 참조 · 표 안 `\|` 이스케이프로 생긴 거짓 0은 손으로 걸렀다).

## 0. 05 /review 뒤 바뀐 것(b05c3bda → 86bec989) 요약

| 바뀐 것 | 06 영향 |
|---|---|
| `repositories/expenses.ts` `listNumberedByLine` **삭제**. `domain/expenses/index.ts`에 비공개 `listNumberedByLineChain(viewer,{projectId,lineId},tx?)`(계보 사슬 → `listNumberedByLines`) — `loadSubmitFacts` · `lineFactsFor`가 이미 계보 사슬로 읽는다(93cb3470) | 06-28 ⓪ 멈춤 · 06-13 X-3 전제 무효(F2 · F3) |
| 새 `listNumberedByLineageMany` · `loadProjectFactsMany` · `listLineageLinesByProjects`(보관 줄 제외) · `listQuoteLinesByRevisions` · `listLatestQuoteRevisionsByProjects` · `findUserNamesByIds` · `findVendorNamesByIds` · `findExpenseApprovalStatuses` | 06-28은 반영(N-4). 06-07 `listLineageLines`와 중복(F12) |
| `listMyBlockedDocuments` 승인 갈래가 `unresolvedVoidOnly: true`(증빙 무효 뒤 새 증빙 없음인 문서만 SQL로 먼저 거름, A9) | 06-23 기안자 신호가 훅에 닿지 않음(F1) |
| 정산 최종 승인: `onSettlementFinalApprovalInTx`가 `changeProjectStatus` 뒤 `countInReviewByProjects(…, tx)` → `결재 중 지출결의 {N}건 · 지출결의 결재 먼저` 거부, `settlementApproveBlockedReason`도 같은 이유 표시(A8, 사용자 확정 10/5) | 06-19 · 06-22와 겹침 · 05 회귀 테스트 깨짐(F4 · F5) |
| `draftFieldsSchema` = 새 파일 `domain/expenses/draft-fields.ts`의 `expenseDraftFieldsSchema`(액션 `draftFieldsInput`도 같은 객체), 날짜 칸 `isCalendarDate` + `DATE_FORMAT_ERROR`, 비고 1000→480 | 06-10 수정 파일 누락(F6) · 날짜 검증 재사용(F7) |
| `saveExpenseDraft` · `previewExpense` 맨 앞 `can(expenses, write)`, 줄 문서 `vendorId` 칸 거부, 번호 문서 공급가액 빈칸 → 칸 오류, `assertActiveCodes` / `loadActiveCodes`(보관 코드 = 빈 칸), `loadSubmitFacts`에 `codes` 인자 추가(tx 전 읽기) | 06-10 · 06-28은 영향 적음(F16) |
| `saveSubmissionSnapshot`에 `vendorId?` — 제출 때 줄 문서의 거래처를 줄 거래처로 맞춤 | 06-03 지급(거래처 계좌)에 유리. 조치 없음 |
| `deleteExpenseDraft` → `markOwnerFilesRemoved`, `restoreExpenseDraft` → `restoreOwnerFilesRemovedAt` | 06-25 카드 보관/되살리기는 다른 꼴(파일 살려 두고 되살릴 때 sha 재확인) — 일관성 참고만 |
| `requestEvidenceUpload` 중복 고리: 다른 주인을 `rule.load`가 못 찾으면 `continue`(지운 작성 중 문서) | 06-11 중복 고리 재작성(F8) |
| `completeEvidenceUpload` 멱등(이미 완료된 내 의도 → `findAliveFileOfIntent`로 같은 파일 반환, 트랜잭션 전), 의도 TTL 15→30분 | 06-11 확인 해제 훅은 재시도에서 다시 안 불림 — 첫 호출이 이미 해제, 문제 없음. 권리 재확인 없음(F15) |
| `sameAmountOn` · 비공개 `toMinor`(domain/money) | 06 플랜에 외화 `Math.round(x*100)` 비교 없음 — 문제 없음 |

## 1. 발견

| # | 등급 | 위치 | 설명 | 고칠 방향 |
|---|---|---|---|---|
| F1 | **P0** (8/10) | 06-23-PLAN.md:31 · :252 / pr162 domain/approvals/index.ts:1220 | 06-23은 기안자 신호 `선결제 증빙 {N}일 경과` · `증빙 없음 · 지급 대기`를 05 훅 `blockedAfterApproval`로 세운다고 하고 엔진은 「읽기만」(`domain/approvals/index.ts(listMyBlockedDocuments — 기안자 승인 문서 id를 훅에 넘기는 자리, 읽기만)`). 그런데 pr162 엔진은 훅에 넘기기 전에 SQL로 거른다: `const approved = await listDrafterInstances(viewer, { drafterId: viewer.id, status: "approved", limit: BLOCKED_APPROVED_LIMIT, unresolvedVoidOnly: true });`(주석 「승인 뒤 막힘의 원천(지금은 증빙 무효뿐)이 있는 문서만 SQL로 먼저 거른 뒤」). 증빙이 0건인 문서 · 선결제 기한 초과 문서는 무효 파일이 없어 훅에 오지 않는다 → 두 신호가 홈에 절대 서지 않는다. 플랜대로 실행하면 06-23 통합(listNextTurnItems 경유)이 빨갛거나, 훅 단위 테스트만 녹색이고 실제로는 비는 결과 | 06-23 Task(엔진 쪽)에 「승인 갈래 후보 거르기를 종류 훅으로 일반화」를 넣는다 — 예: `DocumentKindDef.blockedAfterApprovalCandidates?(viewer): SQL`(종류가 후보 조건을 낸다, 지출결의 = 무효 미해결 ∨ (지급 전 ∧ 증빙 0 ∧ 증빙 필수) ∨ 선결제)로 바꾸고 `unresolvedVoidOnly`를 그 훅으로 옮긴다. 종류 리터럴 없음이라 C3 위반 아님. `domain/approvals/*`는 /cso 게이트 대상이 된다. 통합: 「증빙 0 승인 문서가 201번째로 오래돼도 홈에 선다」(A9 회귀 함께) |
| F2 | **P1** (9/10) | 06-28-PLAN.md:149 · :207 · :41 · :97 | ⓪ 멈춤 조건 `git grep -n -e "export async function listNumberedByLine(" -e "export async function listNumberedByLines(" -e "export async function listExpensePage(" repositories/expenses.ts 3건 미만이면 멈춤` — pr162에서 `listNumberedByLine`이 삭제돼 2건 → **06-28(웨이브 4)이 착수하자마자 멈춘다**. :207 「`listNumberedByLine` · `listNumberedByLines`의 WHERE에 `isNull(expenses.closedAt)`」 · :97 「입력이 `listNumberedByLine(s)` 한 곳」도 없는 함수를 고치라고 한다 | ⓪ 행을 `listNumberedByLines(` · `listExpensePage(` 2건으로 바꾸고 「`listNumberedByLine`은 pr162에서 삭제 — 사슬 읽기 `listNumberedByLineChain`(domain/expenses 비공개)도 `listNumberedByLines`를 부르므로 거르기 한 곳」으로 고친다. :41 · :97 · :207 · :401 · :423의 `listNumberedByLine ·` 를 지운다 |
| F3 | **P1** (8/10) | 06-13-PLAN.md:173 · :219 · :238 · :489 | X-3 전제(「PR #162의 `submitExpense`는 `loadSubmitFacts`에서 번호 문서를 받은 줄 id 하나로만 읽는다」)가 pr162에서 이미 고쳐졌다: `const numbered = line && row.projectId ? await listNumberedByLineChain(viewer, { projectId: row.projectId, lineId: line.id }, tx) : [];`(pr162 domain/expenses/index.ts:1153, lineFactsFor :1261도 같음). ⓪ 지시 「이미 계보 조회로 바뀌어 있으면 Task 1 ④의 바꾸기를 건너뛰고 통합 케이스만 쓴다」가 발동하는데, acceptance(:238)는 같은 두 함수에 `findLineLinks(` 2건 이상을 요구한다 — 서로 모순이라 실행자가 어느 쪽도 지킬 수 없다 | 결정을 하나로: (권장) ④ 바꾸기를 유지하되 이유를 「계보 결함」이 아니라 「카드 쪽 연결 · 지급 사실을 같은 한 조회로」로 바꾸고 ⓪의 건너뛰기 문장을 지운다. 대안: 05 `listNumberedByLineChain`을 그대로 두고 acceptance의 `findLineLinks(` 요구를 지운다(게이트 ctx만 `findLineLinks`). 어느 쪽이든 must_haves · 「05 결함」 문단 · 위협 표의 「05 결함」 표현을 「05 수정됨(93cb3470)」으로 |
| F4 | **P1** (8/10) | 06-19-PLAN.md:38 · :44 · :231 / pr162 test/integration/settlement-approval.test.ts:402-425 | 05 A8 회귀 테스트는 결재 중 지출결의가 있는 채로 정산을 기안(`submitted(fx.pm, fx.projectId)`)한 뒤 승인 막힘을 단언한다. 06-19는 기안 게이트에 「결재 중 · 반려 문서는 늘 들고」(D-611) + 강행 허용 기본 false를 넣으므로 그 기안이 막혀 테스트가 기안 단계에서 깨진다. 06-19 verify(:231)가 바로 이 파일을 돈다. 플랜에 A8이 한 번도 나오지 않는다(`grep -c "A8" 06-*-PLAN.md` = 0) | 06-19 Task 1에 「05 A8 테스트 고정 꼴 — 정산 기안을 먼저, 지출결의 제출을 그 뒤로(또는 `allow_open_expenses` 켬)」 한 줄과 read_first에 settlement-approval.test.ts A8 describe를 넣는다 |
| F5 | **P1** (8/10) · 결정 필요 | 06-22-PLAN.md:29 · :33 · :186(⑸) / pr162 domain/settlements/index.ts:448-470 | 06-22 ⑸ 「`settlementApproveBlockedReason`(표시 · 풀): 정산이 아닌 행은 05 그대로 `BACK_TO_PROGRESS`, 정산인 행은 … `preSettleApproveReason`」 — pr162에 생긴 셋째 갈래 `else if (count > 0) reasons.set(row.id, expensesInReview(count))`가 플랜에 없다(덮어쓰면 A8 표시 사라짐). 서버 쪽도 06-22 재점검(`changeProjectStatus` 앞)이 A8 검사(`changeProjectStatus` 뒤)보다 먼저 서서, 결재 중 지출결의만 있는 프로젝트의 거부 문구가 `완료 전 점검 1건 · 담당 PM …`으로 바뀐다 → A8 테스트(`toMatchObject({ message: "결재 중 지출결의 1건 · 지출결의 결재 먼저" })`) 깨짐. 더해 강행 허용(`allow_open_expenses` 참)이면 06-22 재점검은 통과시키는데 A8은 무조건 막는다 — 두 규칙의 관계가 정해져 있지 않다 | 아래 「결정 필요 D1」. 어느 쪽이든 06-22 ⑶ · ⑸에 A8 갈래의 순서를 명시하고, 표시 · 서버 문구가 같은 순서를 따르게 한다 |
| F6 | P2 (8/10) | 06-10-PLAN.md:7-10(files_modified) · :193 · :39 | 칸 추가 자리를 `domain/expenses/index.ts`의 `draftFieldsSchema` · 액션의 `draftFieldsInput`이라고 적었지만 pr162에서 둘 다 `domain/expenses/draft-fields.ts`의 `expenseDraftFieldsSchema` 별칭이다(`const draftFieldsSchema = expenseDraftFieldsSchema;` · `const draftFieldsInput = expenseDraftFieldsSchema;`). 고칠 파일이 files_modified에 없다 | files_modified에 `domain/expenses/draft-fields.ts` 추가, ②를 「`expenseDraftFieldsSchema`에 `prepaid` · `prepaidReason` · `evidenceAmountKrw` · `evidenceDate` — 액션 · 도메인이 함께 받는다」로 |
| F7 | P2 (8/10) | 06-04-PLAN.md:198 · 06-10-PLAN.md:235 · 06-15-PLAN.md:269 | 「`payDate`는 `YYYY-MM-DD` 형식만 검사」 · 「`evidenceDate`를 `YYYY-MM-DD` 형식만」 — 05 A6(6e00b1c7)이 정확히 이 꼴(정규식만)이 `2026-02-30`을 DB 오류 500으로 흘린 결함을 고쳤다. 06-15 통합은 `2026-13-01 → 날짜 형식 오류 · 2026-09-19처럼`을 단언하므로 06-04가 정규식만 쓰면 06-15(웨이브 8)에서 빨개진다 | 06-04 · 06-10 · 06-15의 날짜 칸은 05 `isCalendarDate`(lib/dates.ts) + `DATE_FORMAT_ERROR`(domain/expenses/draft-fields.ts)를 재사용한다고 한 줄씩. 문구 상수 새로 만들지 않기 |
| F8 | P2 (7/10) | 06-11-PLAN.md:287 / pr162 domain/evidence/index.ts:220 | 06-11은 중복 고리를 다시 쓰며 「다른 주인은 `ruleFor(file.ownerKind)`가 있을 때만 `load` · `canSee`로 번호를 싣는다(규칙 없음 · 번호 없음 → `visibleNumber: null`)」 — pr162의 `if (!other) continue;`(주인 없음 = 중복 아님) 갈래가 빠진다. 05 통합 「지운 문서에 살아 있는 파일 행이 남아 있어도(고치기 전 데이터) 중복으로 세지 않는다」가 깨진다 | :287에 「`load`가 null이면 중복에서 뺀다(05 c57f3aac)」를 넣고 verify에 evidence-upload.test.ts를 포함 |
| F9 | P2 (7/10) | 06-28-PLAN.md:165 · :276 ⑵ | 「제출 · `lineFactsFor` = 그 줄 id, 사슬로 넓히기는 06-13 ④」 — pr162에서 두 자리의 번호 문서는 이미 사슬 전체다. 06-28(웨이브 4)이 종결 분할만 `[line.id]`로 세면 웨이브 4~7 동안 새 차수 복사 줄의 회차가 고르기 창(사슬)과 제출(줄 하나)에서 다르게 나온다(앞 차수 줄의 종결 분할이 제출 회차에서 빠짐 → 회차 번호 중복) | 06-28 ⑵에서 바로 사슬 줄 id를 쓴다 — 05 `listNumberedByLineChain`이 쓰는 사슬(내부 `listLineageLinesByProjects` → copiedFrom 거슬러 오르기)을 같은 파일 비공개 도우미로 드러내 종결 읽기에도 넘긴다. 06-13 ④의 「06-28 X-9 … 줄 id도 같은 사슬로 넓힌다」 문장은 삭제 |
| F10 | P2 (7/10) | 06-13-PLAN.md:46 · :261 · :272 · 06-10:274 · 06-14:228 · 06-18:224 · 06-21:37 | 2건 경합 테스트가 장벽 없이 `Promise.all`/`allSettled`만 쓴다. 「정확히 하나 성공」은 직렬로 돌아도 version · 상태 검사로 통과하므로 잠금을 빼도 빨개지지 않는다(「RED 먼저」 주장 불가). 06-13 셋째 케이스는 「어느 쪽이든」 결과가 갈려 비결정적 | 05 선례 `submitExpense(…, deps.afterLock)`(pr162 :926)처럼 첫 호출이 잠금 뒤 장벽에서 멈춘 동안 둘째를 보내고, 둘째가 `pg_blocking_pids`로 막힌 것을 확인한 뒤 푼다(06-03 · 06-22 PR #75 꼴). 06-13 셋째는 순서를 고정한 두 케이스로 나눈다 |
| F11 | P2 (8/10) | 06-VALIDATION.md:38-43 | 「After every task commit: Run `pnpm test`(단위→통합→E2E)」 · 「After every plan wave: Run `pnpm test`(전체)」 — CLAUDE.md §5(사용자 결정 2026-10-01: 작업 중엔 바뀐 파일 관련 단위 · 통합 + 건드린 화면 E2E만, 전체는 ready CI 한 번)와 정면으로 어긋난다. 플랜 verify(70개 `<automated>`)는 이미 대상 한정이라 VALIDATION 문장만 틀렸다 | Sampling Rate 세 줄을 §5 문장으로 바꾼다(전체 = ready CI · `/gsd-verify-work` 전 CI 초록 확인) |
| F12 | P2 (5/10) | 06-07-PLAN.md:265 · :267 / pr162 repositories/quote-lines.ts `listLineageLinesByProjects` | 06-07이 새로 짓는 `listLineageLines(viewer, projectId, tx)`는 pr162에 생긴 `listLineageLinesByProjects(viewer, ids, tx)`와 같은 SELECT다. 다만 05는 `isNull(quoteLines.archivedAt)`로 보관 줄을 빼고, 06-07은 보관 시각을 실어 보관 줄도 넣는다 → 06-13이 제출을 `findLineLinks`로 바꾸면 서버 사슬(보관 앞 차수 줄 포함)과 화면 문 `listLineDoors`(05, 보관 제외)가 다른 범위를 셀 수 있다(X-3이 막으려던 화면 · 서버 어긋남의 역방향) | 06-07 ①에서 05 함수를 재사용하고(보관 시각 · 실행가 칸은 현재 줄 판정용 별도 1쿼리 또는 05 함수에 선택 칸) 「보관 줄은 사슬에서 빠진다 — 05와 같은 범위」를 명시 |
| F13 | P3 (6/10) | ci.yml:162-225 · 플랜 전체 | 06은 E2E 스펙 51개를 건드리고 그중 29개가 새 파일, `<automated>` 안 E2E 호출 146회. 지금 desktop 2샤드(6:4) · e2e 잡 「평소 13분 안쪽」 · ready CI 약 10분 — 새 스펙 ~25% 증가로 샤드당 +3~5분 추정. 타임아웃(40분)에는 여유 | 페이즈 PR ready 전에 `--shard` 3개 또는 가중치 재조정 검토 한 줄을 06-24(마지막 웨이브)나 VALIDATION에. 결정 아님 |
| F14 | P3 (6/10) | 06-22-PLAN.md:186 ⑸ | 표시 막힘이 「행마다 `getPreSettleCheck(viewer, row.projectId)`」 — 결재함 · 홈이 정산 문서 여럿을 한 번에 넘기면 프로젝트마다 전체 점검(N+1). 05 A13이 같은 파일의 상세 읽기를 `Promise.all`로 바꾼 직후다 | 정산 결재는 동시에 많지 않아 수용 가능. 최소한 `Promise.all`로(풀 5 고려해 직렬도 무방) — 한 줄 |
| F15 | P3 (5/10) | pr162 domain/evidence/index.ts:262-272 · 06-16 · 06-25 | 05 A10 멱등 갈래는 트랜잭션 · 권리 확인 전에 DTO를 돌려준다. 06-16 · 06-25가 주인 종류(견적 차수 · 리저브 · 카드 전표)를 늘리면 「권리를 잃은 뒤 같은 의도 재시도 → 파일 DTO」가 새 종류에도 열린다(보기 URL은 없음) | 06-16 `ownerAccess` 도우미를 멱등 갈래 앞에도 부르게 한 줄(또는 05 지적으로 넘김) |
| F16 | P3 (6/10) | 06-10:193 · 06-28:276 | `loadSubmitFacts`가 pr162에서 `(viewer, row, projectRow, pre, tax, codes, tx?)`로 바뀌었다. 06-10(prepaid facts) · 06-28(`closedInstallments`)이 인자를 더할 때 위치 인자 순서 혼동 여지 | 「`codes` 다음 · `tx` 앞」 또는 객체 인자로 — 한 줄 |

## 2. 결정 필요

**D1 — 05 A8(결재 중 지출결의 남은 프로젝트 정산 최종 승인 막기)과 06 완료 전 점검(D-611 · 06-19 · 06-22)의 관계** (F4 · F5)
- 사실: A8은 D-611 「미결 지출결의」의 부분집합(결재 중만)이지만 강행 허용과 무관하게 **항상** 막는다. 06-22 재점검은 `allow_open_expenses`가 참이면 결재 중 문서도 통과시킨다.
- 추천(가): **A8은 강행 허용과 무관한 절대 규칙으로 남긴다** — 완료된 프로젝트에 결재 통과 지출결의가 뒤늦게 붙는 것을 막는 무결성 규칙이고 사용자 확정(10/5)이 D-611보다 늦다. 순서: 표시 · 서버 모두 `진행으로 바뀜 · 반려` > `결재 중 지출결의 {N}건 · 지출결의 결재 먼저` > `완료 전 점검 {N}건 · 담당 PM {이름}`. 06-22 ⑶은 A8 검사를 재점검 앞으로 옮기거나(같은 tx · 프로젝트 행 잠근 뒤) 재점검 뒤에도 A8 문구가 먼저 나오게 하고, ⑸에 A8 갈래를 유지. 06-19 기안 게이트도 강행 허용이 켜져 있어도 결재 중 문서가 있으면 A8과 같은 문구로 막으면 사용자가 기안 → 승인 막힘을 겪지 않는다.
- 대안(나): A8을 06-22 재점검에 흡수하고 05 코드 · 테스트를 지운다(문구 하나로). 단 강행 허용이 켜지면 결재 중 문서가 남은 채 완료될 수 있어 사용자 결정(10/5)을 약하게 만든다.
- 대안(다): 그대로 두되 06-22 ⑸만 05 갈래를 보존 — 거부 문구가 상황에 따라 둘로 갈리고 05 A8 테스트 문구 단언을 고쳐야 한다.

**D2 — 06-23 기안자 신호를 홈에 세우려면 결재 엔진을 건드려야 한다** (F1)
- 추천: 종류 중립 훅(`blockedAfterApprovalCandidates`)로 일반화 — 엔진 변경이지만 종류 리터럴 없음(C3 유지), A9의 「LIMIT 전에 SQL로 거르기」도 유지. `domain/approvals/` 변경이 생기므로 06-23 must_haves의 「읽기만」 문장과 acceptance의 approvals diff 0 조건(있으면)을 고친다.
- 대안: 06-23 신호를 홈 「막힌 문서」가 아니라 다른 공급 함수(`listNextTurnItems`의 별도 소스)로 낸다 — 엔진 무변경이지만 05 무효 신호와 「문서마다 하나」 병합(§2 06-23)이 두 곳으로 갈린다.

## 3. 잠금 순서 표(전역 규칙: 프로젝트 행 → 견적 줄 id 순 → 문서 · 요청 행 → 파일 · 기록)

| 쓰기 경로 | 플랜 | 순서 | 판정 |
|---|---|---|---|
| 지출결의 제출 · 다시 제출 | 05 + 06-13 | 프로젝트 → 줄(06-13 `lockQuoteLines`) → 지출결의 → (결재 인스턴스 INSERT) | 지킴 |
| 지출결의 종결 | 06-28 | 지출결의 하나(→ 같은 tx 결재 상태 읽기) | 지킴(단일 · 연결을 늘리지 않음) |
| 단건 지급 | 06-03 · 06-04 · 06-13 N-2 | 줄 → 지출결의 → 지급 기록 | 지킴(프로젝트 건너뜀, 거꾸로 없음) |
| 일괄 지급 | 06-15 · 06-17 | 행마다 자기 tx로 단건 경로 | 지킴 |
| 증빙 확인 · 금액 고침 · 면제 | 06-06 · 06-10 | 지출결의 → 확인 기록 | 지킴 |
| 증빙 무효 | 06-11 | 프로젝트 → 지출결의 → 파일 → 확인 기록(→ 결재 인스턴스 version) | 지킴 |
| 증빙 올리기 완료 | 05(06-11 훅) | 주인 행 → 파일 INSERT → 인스턴스 version | 지킴 |
| 카드 사용 등록 · 수정 · 되살리기 | 06-05 · 06-07 · 06-09 · 06-25 | 프로젝트(`lockProjectForLinkWrite`) → 줄(문서 줄 · 현재 줄 한 호출 id 순) → 카드 사용 행(조건 UPDATE) | 지킴 |
| 구매 요청 · 완료 · 취소 되돌리기 | 06-08 · 06-12 · 06-14 | 프로젝트 → 줄 → 요청 행 → 카드 사용 INSERT | 지킴 |
| 구매 요청 취소 | 06-14 | 요청 행 하나 | 지킴(연결을 줄임) |
| 정산 기안 | 05 + 06-19 | 프로젝트(기안 게이트는 tx 전 사전 조회 + tx 안 `computePreSettleCheck(tx)`) | 지킴 |
| 정산 최종 승인 | 05 + 06-22 | 결재 인스턴스(UPDATE) → 프로젝트(06-22가 재점검 전으로 당김) → A8 집계(tx) | 고리 없음 — 프로젝트를 쥔 채 정산 인스턴스를 잡는 경로가 없다 |
| 견적 줄 저장 · 새 차수 | 04 + 06-07 · 06-18 | 프로젝트 → 줄(`hasCardSideLinks`는 같은 tx `findLineLinks`) | 지킴 |
| 리저브 | 06-16 | 클라이언트 행 → 줄 | 별개 표(교차 없음) |
| 발행 요청 취소 ∥ 잇기 | 06-18 · 06-21 | 요청 행 `FOR UPDATE` 하나 | 지킴 |

거꾸로 잡는 경로는 찾지 못했다.

## 4. 트랜잭션 안 전역 db

- 06-03 「tx 규약」이 페이즈 공통이고, 쓰기 몸통마다 `awk 범위 | grep -cE '\b(can|getSettingValue|loadTaxRates|…)\('` = 0 acceptance가 있다(06-03 · 04 · 06 · 08 · 09 · 10 · 12 · 14 · 18 · 19 · 21 · 22 · 25 · 28 — 14개). `recordAction`은 `{ tx }`일 때 설정 읽기도 tx로 돈다(pr162 domain/action-log/record.ts:140-150 실측) — 「같은 tx 기록 검사」로 충분.
- pr162 신규 05 코드도 확인: `loadActiveCodes` · `assertActiveCodes` · `usableVendor` · `findAliveFileOfIntent`는 tx 전, `listNumberedByLineChain` · `listLineageLinesByProjects` · `countInReviewByProjects`는 tx를 받는다. `submitExpense` tx 콜백 안에 전역 db 호출 없음.
- 새 위반 계획은 찾지 못했다. 남은 위험은 F1 해결 때 엔진에 넣을 후보 SQL(트랜잭션 밖이라 무관)뿐.

## 5. 테스트 전략

| 항목 | 판정 |
|---|---|
| 플랜 verify 범위 | 70개 `<automated>` 모두 파일 · `-t`/`-g` 한정 + `flock` — CLAUDE.md §5와 맞음. VALIDATION Sampling 문장만 어긋남(F11) |
| 동시 6건(풀 교착) | 06-03 · 06-08 · 06-12 · 06-19 · 06-22 — 풀 밖 `pg.Client` + `pg_blocking_pids` + 10초 경주(PR #75 꼴) · 변이 RED 명시 → 결정적 |
| 잠금 순서 | 06-11 `NOWAIT` 변이 RED · 06-07 `.toSQL()` 단위 · 06-28 `afterLock` 장벽 → 결정적 |
| 2건 경합 | 06-10 · 06-13 · 06-14 · 06-18 · 06-21 — 장벽 없는 `Promise.all`(F10): 녹색은 결정적이나 잠금 회귀를 못 잡음, 06-13 셋째 케이스는 결과 비결정 |
| CI 시간 | F13 — 새 E2E 스펙 29개, 샤드 재조정 검토 권장 |
| 05 회귀 | A8 테스트(F4 · F5) · evidence-upload 「지운 문서 파일」(F8)이 06 변경에 깨질 수 있는데 플랜이 모름 |

## 6. 문제 없음 확인(재검토 불필요)

- 06-06 Q-F의 `listNumberedByLineage(viewer, projectId)` — pr162에도 export(래퍼). ⓪ `summarizeRevisions` · `listQuoteLinesByRevision` · `findQuoteLineById` 3건 이상 — 통과.
- 06-10 ⓪ `const draftFieldsSchema` · `toDraftColumns` · `loadSubmitFacts` 3건, `draftFieldsInput` 5건 — 통과(F6은 수정 위치 문제일 뿐).
- 06-11 ⓪ `completeEvidenceUpload` · `voidEvidence` · `OWNER_RULES` · `checkEvidenceUpload` · `ownerKinds: readonly string[]` · `lockProjectForWrite` — 통과.
- 06-13 ⓪ `submitExpense` · `listLineDoors` · `expenseLineDoor` · `linkedDocumentReason` · `QuoteLineLinkedStatus` — 통과. B-1 순서 acceptance(`lockProjectForWrite( lockQuoteLines( lockExpenseForUpdate( "expense.submit" …`)는 pr162 `submitExpense` 몸통 순서와 맞물린다(사전 조회에 해당 토큰 없음).
- 06-22 ⓪ 훅 셋 · `findFinalStepActorInTx` · `BACK_TO_PROGRESS` · `lockProjectForWrite` — 통과. E-1 acceptance 정규식(`can|visible|getSettingValue…`)은 pr162에 생긴 `countInReviewByProjects(`에 걸리지 않는다. X-12 순서 grep도 영향 없음.
- 06-23 ⓪ `listNextTurnItems` · `blockedAfterApproval: expenseBlockedAfterApproval` — 통과(심볼은 맞고 동작이 F1).
- 06-28 ⓪ 150~153행(submitExpense · isEditableByDrafter · canResubmit · recordActionInTx · loadActionLogGate · listMyBlockedDocuments · blockedAfterApproval?: · REJECT_REASON_* · buildEvidenceVoidedMessage · OwnerState · status_change) — 통과. X-9 읽기 순서 grep은 접두어 `listNumberedByLine`이라 pr162 `listNumberedByLineChain(`를 잡는다(이미 반영).
- 05 `saveSubmissionSnapshot(vendorId)` · `sameAmountOn` · `TEAM_EXPENSE_KINDS` 재export · 비고 480자 · 의도 TTL 30분 — 06 플랜에 충돌하는 인용 없음(`15분` · `1000자` · `Math.round` grep 0).
- `countInReviewByProjects`는 삭제 안 됨 조건만 보고 종결을 보지 않지만 종결은 반려 · 회수에서만 생기므로 결재 중 집계와 겹치지 않는다.
- 06-15 일괄 지급 · 06-14 취소 · 06-28 종결은 잠금 하나 또는 행마다 tx — 교착 고리 없음.
