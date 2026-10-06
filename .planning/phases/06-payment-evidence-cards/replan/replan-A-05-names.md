# 06 재계획 대조 A — Phase 05 실제 이름 · 위치 (pr162 `a972a5ac` 기준)

> 작성 2026-10-05 · 읽기 전용 조사(레포 파일 · 커밋 · 패키지 · `.planning/` 변경 없음, `mcp__hearthbot__` 미사용).
> 출처: `git show refs/remotes/pr162:<경로>` · `git grep -n <심볼> refs/remotes/pr162 -- <경로>` · `git diff --name-only origin/main...refs/remotes/pr162`.
> 플랜 쪽 줄 번호(`06-02:32` 꼴)는 `origin/main`의 `.planning/phases/06-payment-evidence-cards/06-NN-PLAN.md`.

## 요약 — 가장 큰 어긋남 열 가지 (괄호 = §1 행 번호)

1. `sumKrw` · `diffKrw` · `evidence.max_size_mb`는 05에 이미 있다 → 06-02는 설정 키 셋 · Task 2에서 money 부분 삭제(1 · 2)
2. 번호 채번: `loadDocumentNumberFormat`은 5필드 · 등록표 전용이고 `allocateExpenseNumber`는 일반화 불가 → `expense` 선례 + `repoAllocateNumber`(3)
3. `pickTaxDates` · `incomeTypeFor`는 `domain/expenses/tax.ts`에 이미 있고 부가세 대체일은 작성일(5) · `lockExpenseRow` = `lockExpenseForUpdate`(8) · `resolveLineDoor`는 충돌 없음(4)
4. 「증빙 금액 · 증빙일」 칸과 PM 편집 함수는 05에 없고 06 어느 플랜도 안 짓는다(6). 증빙 변경은 `expenses.version`을 안 올리고(7), 상태별 증빙 권한도 06 문구(「PM이 제출 뒤 더하고 뗌」)와 다르다(25)
5. 제출 게이트 ⑧은 무조건이고 `domain/expenses/gate.ts`는 어느 06 플랜 파일 목록에도 없다(19). `lockQuoteLines`는 `lockProjectForWrite`와 `lockExpenseForUpdate` 사이(20)
6. 반려 · 회수 종결 todo는 pr162에만 있고 받는 06 플랜이 없다(16). 프로젝트 완료값은 `settled`가 아니라 `completed`(15)
7. 경로: 목록 `expenses/(list)/page.tsx`(12) · 액션 `expenses/actions.ts` · 폼 `[id]/expense-form.tsx`(21) · `approvals/[id]` 없음 → 정산은 `domain/settlements`(13)
8. A-608-T(저장소 테스트 모드)는 05가 해소했다 — 로컬 드라이버 · `createMemoryStorage`(23). F8 청소 자리는 `docs/EVIDENCE-STORAGE.md` §6이고 `docs/OPERATIONS.md`는 이미 300/300줄이다(24)
9. 마이그레이션: 05-13이 미실행이라 06은 `NNNN` 유지(14), `files_owner_kind_check` 확장은 NOT VALID + `--custom` VALIDATE 두 파일(10)
10. 상태 낱말 12개가 `status-map.ts`에 없고 표가 닫혀 있다(11). `05-UI-SPEC.md` 등 05 산출물은 pr162에만 있어 06 착수 게이트는 #162 머지 뒤에야 통과한다(§2.13)

## 0. 기준 · 방법 · 한계

- **기준 커밋**: `refs/remotes/pr162` = `a972a5accb5d0fe9234df8282328fc47789db3c5`(PR #162 head, 2026-10-05 08:10 「docs(05-11): record wave 13 review fixes in summary」). `origin/main` = `341537c188ae5503c6157f99254aec4f9113f2ec`이고 이것이 pr162의 merge-base다 — pr162는 main #166까지 이미 포함하므로 main 쪽에 pr162가 모르는 변경은 없다.
- **05 진행 상태**: 05-01~05-12 · 05-14 · 05-15는 SUMMARY가 있다. **05-13은 PLAN만 있고 실행 전**이다. 그래서 아래 넷은 **아직 없다**.
  1. 05 마이그레이션 0024~0027을 지우고 main 마지막 + 1 하나로 재생성
  2. `docs/EXPENSES.md`의 「계약」 · 「잠금 순서 예외」 절(지금 16줄, 「번호」 절뿐)
  3. 병합 번들 절단표
  4. SUMMARY의 「Phase 6 정렬 메모」(`.planning/phases/05-expense-approval-leave/05-13-PLAN.md:46`이 약속: 06-02 설정 키 넷 → 셋 · `sumKrw`/`diffKrw`는 Phase 5 · 06-03 `pickTaxDates` 부가세 대체 = 작성일(D-101) · 06 S4 계산 한 줄은 세율 `%` · 06 S18 강행 결과 줄 → 정산 결재 문서 화면 KvList 한 행 · 05-01 `name_map` 실제 이름)
- **줄 번호는 이 head에서만 유효**하다(05-13과 이후 수정으로 밀린다). 06 플랜에는 줄 번호가 아니라 심볼 이름 + grep 가드를 적을 것.
- **이전 감사**(`reconcile.md` §2 · §3, `notes-B-phase05.md`)는 `17a0a41b` 기준이었다 — 달라진 점은 §1 끝 「이전 감사 정정」.
- 표기: 「있음」 = pr162에 존재 · 「없음(확인함)」 = §3의 grep이 0건.
- squawk 2.65.0은 `node_modules/.bin/squawk --config <.squawk.toml 사본>`으로 스크래치 SQL에 직접 돌렸다(§2.9).
- 표 안의 `/`는 「또는」이다(마크다운 표 때문에 세로선을 쓰지 않았다).

## 1. 먼저 읽을 것 — 06 플랜이 고쳐야 할 이름 · 가정 25건

| # | 06 플랜의 가칭 · 가정 (플랜:줄) | pr162 실제 | 06이 쓸 것 · 조치 |
|---|---|---|---|
| 1 | `sumKrw` · `diffKrw`를 06-02가 새로 만든다(06-02:32,:59,:85,:180-:192, 테스트 `money-sum-diff.test.ts`) | **이미 있음** `domain/money/index.ts:208` `sumKrw(values: readonly number[]): number` · `:212` `diffKrw(a: number, b: number): number`(05-03, 주석 :207 「06-02와 같은 이름 · 계약」). 단위 테스트 `test/unit/domain/money.test.ts:313` `describe("sumKrw · diffKrw")` | 06-02 Task 2에서 두 함수 · 테스트 · `domain/money/index.ts` 수정을 뺀다(`resolveLineDoor`만 남김). 다른 플랜은 import만 |
| 2 | 설정 키 넷 `evidence.required` · `evidence.max_size_mb` · `evidence.prepaid_due_days` · `purchase.online_vendor_name`(06-02:30,:171,:293, `readBy` 6) | `evidence.max_size_mb`는 **이미 있음** `domain/settings/keys.ts:1109` `EVIDENCE_MAX_SIZE_MB`(`:1110` key · `:1120` push · 기본 10 · `unitLabel "MB"` · 1~100 정수 · **`readBy` 없음**). 읽는 곳: `domain/evidence/index.ts:210` · `app/(app)/expenses/[id]/page.tsx:37` · `app/(app)/expenses/new/page.tsx:32`. 나머지 셋은 없음(확인함) | 06-02는 키 **셋**만 신설. 가드 :171 「4 이상」 고침. `EVIDENCE_MAX_SIZE_MB`에 `readBy`를 달면 이미 읽히는 키라 `test/unit/settings/registry-coverage.test.ts`의 「표시 만료 강제」가 빨갛다. 한도 · 형식 · 중복 검사(06-11:40)도 05가 `requestEvidenceUpload`(`domain/evidence/index.ts:198`)에서 이미 한다 |
| 3 | `scopedDocumentNumberFormat` · `allocateScopedDocumentNumber` · `loadDocumentNumberFormat("purchase_request")`가 `{prefix, seqDigits, separator, seqStart}` 4필드를 돌려준다(06-02:34,:62,:220-:232, 06-08:35,:72,:117,:145, 06-14:36,:166) | `loadDocumentNumberFormat(counterKey)` `domain/document-numbering/index.ts:118`는 **이미 export**(main에서도 :103)지만 **5필드** `DocumentNumberFormat`(`yearDigits` 포함, :45)이고, 비공개 표 `DOCUMENT_NUMBER_FORMAT_DEFS`(:74-114: `project` · `cert` · `leave` · `expense_team`만)에 없는 키는 `UnknownDocumentNumberCounterError`(:116). `allocateDocumentNumber(viewer,{counterKey,year,format},tx?)` :146는 period = 연도. 05 선례: `allocateExpenseNumber(viewer,{projectNumber,format},tx)` :248(카운터 `"expense"` 고정 · period = 프로젝트 번호 · 접두어 없음) + `loadExpenseNumberFormat(deps?)` :238 + `expenseNumberFormat(projectNumber, seq, format)` :230 | 구매 요청 번호는 `expense` 선례를 따른다: ① 서식 키 3~4개(keys.ts:993-1022 모양, prefix만 더함) ② 한 번 SELECT 로더(`getSimpleSettingValues`) ③ 순수 서식 함수 ④ `repoAllocateNumber(viewer, "purchase_request", scope, tx)`(`repositories/document-counters.ts:47`) 호출 함수. `DOCUMENT_NUMBER_FORMAT_DEFS`에 억지로 넣지 않는다(5키 필수). 팀 비용(연도 period)만 `expense_team`처럼 DEFS 항목 + `allocateDocumentNumber`. 06-02의 「`loadDocumentNumberFormat` export 신설」 문구 삭제. 지급 번호는 06 어느 플랜에도 없다 |
| 4 | `domain/quotes/line-door.ts`의 `resolveLineDoor`(06-02:36,:56,:189) | 코드에는 없음(확인함). 05의 `domain/expenses/line-door.ts:19` `expenseLineDoor`는 **다른 축**(지출결의 문 `open/closed/no_vendor/none`)이고 :3 주석이 「06-02의 resolveLineDoor(지급 축)와 다른 축이라 이름이 다르다」고 적는다 | 이름 충돌 없음 → 06-02가 `resolveLineDoor`를 그대로 신설. 06-13의 줄 DTO `door`는 두 축(구매/지출결의 갈래 × `ExpenseLineDoorState` 4값)의 조합표를 명시해야 한다 |
| 5 | `pickTaxDates(doc, payDate, today)` · `incomeTypeFor`를 `domain/payments/index.ts`에 신설(06-03:65,:151,:187-:188,:205,:329) | 같은 이름이 이미 `domain/expenses/tax.ts:46` · `:65`에 있고 시그니처가 다르다: `pickTaxDates(doc: TaxDateSource, {ruleKind, codeBasis, basisWithholding, basisVat, todayKst}): PickedTaxDates`. `TaxDateSource`(:35)에 `paidDate?` · `evidenceDate?` 슬롯이 이미 있고 :27-28 주석이 「06-03이 같은 파일 · 같은 이름을 확장한다」. D-101(05-CONTEXT:41): 부가세 = 증빙일 **없으면 작성일**(`kstDateOf(createdAt)`) | 06-03은 새 함수를 만들지 말고 `domain/expenses/tax.ts`를 확장해 호출자가 `paidDate`/`evidenceDate`를 채워 부른다. 06-03:187의 「증빙 없음 → 결재 통과일」은 D-101(작성일)과 다르다 — 정본 확인 필요. `decidePayable` · `loadPaymentInputs` · `loadTaxRates`는 충돌 없음(grep 0) |
| 6 | 「증빙 금액 · 증빙일」 칸과 PM 증빙 편집 함수(A-608 · UA-606 — 06-03:141 · 06-06:124,:162 N-6 · 06-11:36-37 X-1 · 06-17:155. 칸을 쓰는 플랜은 그 밖에 06-04 · 06-15) | **없음(확인함)**. `db/schema/expenses.ts`에 증빙 금액 · 증빙일 · 선결제 · 지급 · 종결 칸이 없다(칸 목록 §2.8). 05의 증빙 함수는 파일 올리기 · 지우기 · 무효뿐이고 PM이 증빙 값을 고치는 함수는 없다. 05의 세금은 증빙일 칸이 없어 작성일로 대체한다(`tax.ts:32` 주석) | 06 어느 플랜도 이 칸 · 함수를 짓지 않는다(06-10은 `prepaid` · `prepaid_reason`만). **06-03(또는 06-06)에 태스크로 짓거나 05-13에 요청**해야 한다 — 06-03 세금 · 06-06 확인 · 06-15 일괄 지급이 전부 이 칸에 기댄다 |
| 7 | 증빙 변경마다 `bumpExpenseVersion`으로 `expenses.version`이 오른다(06-03:201,:207,:331 · 06-04:239 · 06-06:43 · 06-10:151,:162 · 06-11:36-37,:90,:212-214 · 06-17:153,:307) | 05에서 `expenses.version`은 `updateDraftIfVersion`(`repositories/expenses.ts:141`) · `saveSubmissionSnapshot`(:226) · `softDeleteDraft`(:166)에서만 오른다. 증빙 함수는 `expenses.version`을 건드리지 않고 결재 인스턴스 version만 올린다(`bumpInstanceVersion(... reason: "evidence")` `domain/evidence/index.ts:331`, 결재 중 · 승인 뒤 **추가**에만. 삭제 :373-387 · 무효 :455-471은 안 올림). `voidEvidence`는 지출결의 행도 잠그지 않는다(파일 행 조건 UPDATE 하나) | 06-11 훅 자리 = `completeEvidenceUpload` :254(승인 뒤 기안자 추가) · `voidEvidence` :445(무효) 둘뿐이다 — `removeEvidence` :359는 결재 통과 전에만 돌아 필요 없다(§1-25). `completeEvidenceUpload`는 이미 `rule.lock` → `lockExpenseForUpdate`로 행을 잡은 tx라 같은 tx에서 올리면 된다. `voidEvidence`는 행 잠금을 먼저 더해야 한다(잠금 순서 변경 — 05-13이 쓸 「잠금 순서 예외」와 맞출 것). 응답 모양: `completeEvidenceUpload`는 `Partial<EvidenceFileDto> & { id: string }`, 나머지는 `void` — version을 싣으려면 시그니처를 바꾼다. `Attachments`의 `onChanged?: () => void`(`ui/attachments/Attachments.tsx:47`)엔 version 인자가 없어 06-11:288의 `onVersionChange`는 새 prop |
| 8 | `lockExpenseRow`(9개 플랜: 06-03 ×8 · 06-04 ×6 · 06-06 ×3 · 06-07 ×1 · 06-10 ×8 · 06-11 ×4 · 06-13 ×8 · 06-15 ×5 · 06-17 ×1; 06-03:201,:331은 `repositories/expense-payments.ts`에 신설) | **이미 있음** `lockExpenseForUpdate(viewer, id, tx): Promise<ExpenseRow / null>` `repositories/expenses.ts:78`(`FOR UPDATE`) | 이름을 일괄 치환하고 신설 문구를 지운다 |
| 9 | 증빙 모듈 가칭: `domain/expenses/evidence.ts` · `domain/evidence-attachments`(`ATTACHMENT_OWNER_KINDS` · `attachmentOwnerRights`) · `repositories/files.ts`(가칭) · `domain/evidence-reviews/upload-checks.ts`의 `checkEvidenceUpload({ownerKind, ownerId, sizeBytes, mimeType, sha256})`(06-11:8-10,:75,:247 · 06-16 · 06-25:308) | 증빙 모듈 = `domain/evidence/index.ts`(올리기 · 삭제 · 무효 · 읽기), 순수 검사 `domain/evidence/upload-checks.ts:38` `checkEvidenceUpload(input: {size, contentType, sha256}, opts: {maxBytes, duplicates})`(헤더에 「06-11이 선결제 규칙을 이 함수에 더한다」), 주인 종류 표 `OWNER_RULES`(:118, 비공개, `expense` 한 줄), 리포지토리 `repositories/files.ts`(`findActiveBySha(viewer, sha256, ownerKinds[], tx)` :29는 이미 주인 종류 목록을 받는다) | 06-11 · 06-16 · 06-25는 위 모듈에 줄을 더하는 모양으로 다시 쓴다(§2.3). 새 `domain/evidence-reviews/`는 「확인」 모듈로 따로 두되 업로드 검사는 `domain/evidence/upload-checks.ts`를 확장 |
| 10 | 파일 표 주인 제약 확장(06-16:41,:190,:215 · 06-25:45,:206) | `files_owner_kind_check` = `CHECK (owner_kind IN ('expense'))`(`db/schema/files.ts:35`, 0026 SQL :23 인라인). `upload_intents.owner_kind`에는 CHECK 없음, `owner_id`에 FK 없음 → 06-16:190의 갈래 ⒜(`owner_kind` 칸 + CHECK)가 현실 | **마이그레이션 둘**이 필요하다(squawk 2.65.0 실측: DROP + ADD CHECK(검증형) = `constraint-missing-not-valid` 실패 · DROP + ADD … NOT VALID = 통과 · NOT VALID + VALIDATE를 한 파일에 = 실패 · VALIDATE 단독 = 통과). 06-16:190 ⒜ 그대로(생성 1 + `--custom` VALIDATE 1)이고 06-25도 같다 |
| 11 | 상태 낱말 12개와 `app/(app)/status-display.ts` · `statusDisplay(word)` · `test/unit/status-display.test.ts`(06-01:10-11,:25,:42-45,:105-106 · 06-22:10) | 색의 단일 출처는 `ui/status-tag/status-map.ts:5` `STATUS_KIND`(닫힌 표, `StatusWord` :63 · `statusKind` :65 — 표에 없는 낱말은 타입 오류). `StatusTag`는 `status`(+`variant`)만 받는다. 05가 `지출결의 중` · `본인 승인` · `무효` · `작성 중`을 이미 더했다. DECISIONS.md:1748: 「`status-map.ts` 줄은 낱말을 처음 쓰는 플랜이 더한다」 | 06-01은 두 번째 색 원본을 만들지 않는다. SP-2 낱말 12개(§2.11)는 처음 쓰는 플랜이 `STATUS_KIND` 한 줄 + `test/unit/ui/status-map.test.ts` 고정 목록에 더한다. 도메인 매퍼는 `StatusWord`를 돌려주는 모양(`expenseStatusWord` · `leaveStatusWord` · `lineStatusWord`) |
| 12 | 목록: 06-15 `/expenses?view=pay` · `app/(app)/expenses/page.tsx` 수정(06-15:14,:125), 06-20 · 06-17도 같은 파일. 표 `selectable` 변형(06-15:35-45,:129) | `app/(app)/expenses/page.tsx`는 05가 **삭제**했다 → `app/(app)/expenses/(list)/page.tsx`(필터 파라미터 `?status=진행 중/승인/전체`, `EXPENSE_STATUS_VIEWS` `list-columns.ts:14` · `ExpenseListStatus = "open" / "approved" / "all"` `domain/expenses/list.ts:20`). `ListScreen.primaryAction`은 **링크만**(`{label, href, phoneHidden?}` `ListScreen.tsx:13`). `ui/table`에 행 선택 · 체크박스 API는 없다(05가 더한 것은 `onOpenRow(row, rangeRows)` `Table.tsx:34`와 `headerHidden` `types.ts:59`뿐) | 06-15/17/20의 파일 목록을 `(list)/page.tsx`로 고친다. 일괄 지급 진입은 링크가 아니라 버튼이라 `ListScreen`(`ui/list-screen`)을 넓혀야 하면 06-15 files_modified에 추가. 보기 값은 `?view=pay` 대신 기존 `?status=` 낱말 방식(`지급 대상` · `지급 완료`)을 `EXPENSE_STATUS_VIEWS` · `VIEW_STATUS`에 더하는 쪽이 05 관례다(결정은 계획자). `selectable`은 06-15가 신설(UA-604 가드 통과) |
| 13 | 정산 결재: 06-19 `domain/approvals/settlement.ts`(A-609, 06-19:13,:127) · 06-22 `domain/approvals/index.ts`의 정산 승인 분기 + `app/(app)/approvals/[id]/page.tsx`(06-22:7-9,:118) | 05-11이 `domain/settlements/index.ts`를 신설했다: `SETTLEMENT_DOCUMENT_KIND = "settlement"` :76 · `submitSettlement` :322 · `withdrawSettlement` :391 · 종류 훅 `prepareSettlementFinalApproval` :429 / `onSettlementFinalApprovalInTx` :437 / `settlementApproveBlockedReason` :455 / `canResubmitSettlement` :461, 등록 :468-483. 문서 id = 프로젝트 id · 번호 = 프로젝트 번호. 정산 문서 화면은 `app/(app)/projects/[id]/settlement/page.tsx`, 올리기 버튼은 `app/(app)/projects/[id]/settlement-button.tsx:24`. `app/(app)/approvals/[id]/` 라우트는 없다. `domain/approvals/*.ts`에는 종류 키 리터럴 금지 테스트가 있다(`test/integration/approvals-extensions.test.ts:285-331`) | 06-19 A-609 가드(`grep -rln "정산 결재 올리기" app/`가 `projects/[id]/page.tsx` · `quote-table.tsx` 밖이면 멈춤)는 이미 멈춘다 → 가드 갱신. 미결 점검의 자리: 기안 쪽 `submitSettlement`의 트랜잭션 전 사전 읽기, 승인 막힘 표시는 `settlementApproveBlockedReason`(표시 전용 훅) 확장, 최종 판정은 `onSettlementFinalApprovalInTx`. 06-22는 `domain/approvals/index.ts`가 아니라 `domain/settlements/index.ts` 훅으로(금지 테스트) |
| 14 | 마이그레이션 번호(06 플랜 `NNNN`) | main 마지막 idx 23 `0023_custom_field_admin`(24개). pr162 마지막 idx 27 `0027_spicy_loners`(28개): 0024 `white_guardsmen`(`approval_instances.version_reason`) · 0025 `aromatic_hawkeye`(`expenses`) · 0026 `gifted_genesis`(`files` · `upload_intents`) · 0027 `spicy_loners`(`settlement_approvals`). **05-13이 아직 합치지 않았다** | 번호 하드코딩 금지 유지. `db/migrations/meta/_journal.json`을 files_modified로 가진 10개 플랜(06-03 · 05 · 06 · 08 · 10 · 12 · 16 · 18 · 24 · 25)은 05 병합 · 재생성 뒤에 `pnpm db:generate` |
| 15 | 프로젝트 완료 값 `settled`(06-09:128 A-601 가드 `grep -n "settled" db/schema/projects.ts` 0건이면 멈춤) | 다섯 값 `bidding / in_progress / settling / completed / lost`(`domain/projects/status-transitions.ts:5`). `settled`는 main의 0012에서 `completed`로 옮겨지고 코드표에서 지워졌다. `db/schema/projects.ts:28`의 `status`는 CHECK 없는 text | 06-09의 A-601을 `completed`로 고쳐 가드가 멈추지 않게 한다 |
| 16 | 반려 · 회수 지출결의 종결(취소) 경로 | 05가 `.planning/todos/pending/2026-09-26-phase-6-rejected-expense-close-path.md`를 pr162에 더했고(main에는 없음) 06-CONTEXT.md 「Phase 5에서 넘어온 것」에 한 줄(pr162에서 수정됨). 종결 칸 · 상태는 05 어디에도 없다(§2.8) | 25개 06 플랜 중 이 항목을 받는 플랜이 없다 → 새 플랜 또는 06-10 / 06-13에 태스크 배정. 입력 두 곳(`expenseLineDoor` · `remainingForInstallments`)이 종결 문서를 빼야 한다 |
| 17 | `listNextTurnItems(viewer, today)` · 널 가능 `amount` / `reason`(06-23:60,:178-:180) | `listNextTurnItems(viewer, deps?: ApprovalDeps): Promise<NextTurnEntry[]>` `domain/next-turn/index.ts:27`, `NextTurnEntry` :8(`tag: "결재" / "막힘"` :10). 호출부 `app/(app)/page.tsx:30`(`listNextTurnItems(session.viewer, { withDetails: true })`) · `app/(app)/layout.tsx:55`(`listNextTurnItems(viewer)` — 건수만). `HomeNextTurnError`(`app/(app)/home-approval-actions.tsx:158`)가 이미 `ListEmpty tone="error"` + `다시 시도`로 로드 실패를 처리한다. `ui/next-turn/build-next-turn-view.ts`에 `key?` · `measureText?`가 더해졌다 | 06-23 시그니처를 `(viewer, deps)`에 맞추고 `today`는 deps로. 태그가 둘뿐이라 06의 넷은 `NextTurnEntry.tag` 유니언 확장 |
| 18 | 연결 고르기 `app/(app)/cards/link-picker.tsx`를 새로(06-07:16,:78,:185) | `ui/pick-dialog/PickDialog.tsx`(05 신규, DECISIONS.md B5, 주석에 「06 S10 연결 고르기」)가 이미 있다: `PickRow` · `PickGroup` · `PickResult` · `PickDialogProps {open, onClose, title, subtitle, searchLabel, search, primaryLabel, noun: "줄" / "거래처", resultLine, onPick}`. 예: `app/(app)/expenses/[id]/pick-line.tsx`의 `LinePickDialog`, `domain/expenses/pick.ts`의 `searchLinesForPick` · `PickLineOptionDto` | `link-picker.tsx`는 `PickDialog`를 감싸는 얇은 래퍼로 |
| 19 | 「증빙 0」 결재 통과 문서 준비(06-03:214,:263 · `evidence.required = false`)와 「선결제면 Phase 5의 증빙 없음 제출 막힘이 풀린다」(06-10:40) | 제출 게이트 ⑧은 **무조건**이다: `domain/expenses/gate.ts:96` `evidenceCount === 0` → 「증빙 없음 · 증빙 올리기 Ctrl+U」(`ExpenseSubmitFacts.evidenceCount` :55, 값은 `domain/expenses/index.ts:1074`의 `countActiveByOwner`). `domain/expenses/gate.ts`는 어느 06 플랜 files_modified에도 없다. 테스트 도우미 `submitReadyDraft`(`test/integration/fixtures/expenses.ts:124`)는 증빙 한 장을 붙인 뒤 제출한다 | 06-10이 ⑧을 풀려면 `ExpenseSubmitFacts`에 `prepaid` 추가 + `stepsOf`(:77) ⑧ 조건부 + `loadSubmitFacts`/`loadSubmitPre`(index.ts:1056-1100) 변경 → 06-10 files에 `domain/expenses/gate.ts` 추가. 06-03/04의 테스트 준비는 `submitExpense`만으로 증빙 0 문서를 만들 수 없다 → 붙여서 제출 · 승인한 뒤 `voidEvidence`(`makeEvidenceManager` fixtures:114)로 무효 처리하거나 도우미를 새로 둔다 |
| 20 | 제출 트랜잭션 안 잠금 순서와 게이트 삽입(06-07:145 전역 순서 프로젝트 → 견적 줄 → 문서 행들 · 06-13:36 B-1 `lockQuoteLines` → `findLineLinks` → `expense.line-paid-lock` → `card.dual-link-block` → `purchase.line-door` → 저장) | 실제 `submitExpense` `domain/expenses/index.ts:832-924`: 트랜잭션 전(`computeExpenseTax` · `loadSubmitPre` · `prepareSubmission` · 번호 서식) → tx: `lockProjectForWrite` → `lockExpenseForUpdate` → `loadSubmitFacts`(tx) → `gate(locked, "expense.submit", buildExpenseSubmitContext(facts))` → 회차 상한 검사 → `saveSubmissionSnapshot` → `submitDocument` / `resubmitDocument` → 번호 부여(마지막 쓰기). `lockQuoteLines` · `findLineLinks` · `quote-line-links.ts`는 없음(확인함) | `lockQuoteLines`는 `lockProjectForWrite`(:854)와 `lockExpenseForUpdate`(:855) **사이**에 끼워야 06-07 순서와 맞는다(견적 줄 id는 트랜잭션 전 `row.quoteLineId`로 이미 안다). `card.dual-link-block` · `purchase.line-door` · `expense.line-paid-lock`은 `gate(...)` 호출(:869) 옆에. 재제출 갈래(`locked.number !== null`)도 같은 경로를 탄다 |
| 21 | 파일 경로 가칭: `app/(app)/expenses/expense-form.tsx`(06-10 · 06-11) · `app/(app)/expenses/[id]/actions.ts` · `actions.registry.ts`(06-03 · 04 · 06 · 10 · 17) | 폼은 `app/(app)/expenses/[id]/expense-form.tsx`. 액션은 `[id]` 안이 아니라 `app/(app)/expenses/actions.ts` · `actions.registry.ts` 하나(`app/(app)/expenses/[id]/`에 `actions*` 없음). 레지스트리 파일은 `test/integration/leak-scan.test.ts`의 import 목록이 읽는다 | 06 플랜의 경로를 실제로 치환(06-15 · 17은 이미 `expenses/actions.ts`를 쓴다 — 두 갈래가 섞여 있다). 새 `[id]/actions.registry.ts`를 두면 leak-scan 목록에도 더한다 |
| 22 | 권한 메뉴(06-02: `expenses.payments` · `cards.purchases` · `cards.proxy`) | 이 셋은 없음(확인함). 05가 더한 메뉴: `expenses.team` `domain/permissions/menus.ts:32` · `expenses.evidence_void` :36 · `expenses.evidence_attach` :37(main에는 없다). 시드는 `MENUS` 루프(`domain/seed/index.ts:161-187`)라 SYSADMIN만 받고 「경영관리」 계급은 시드에 없다(`fixtures/expenses.ts:112-113` 주석: 관리자가 권한표에서 켜는 계급). `domain/seed/expenses.ts`는 팀장에게 `expenses.team` view를 준다(:31) | 06-02의 메뉴 셋은 신설 그대로. 06은 경영관리 계급에 대한 시드 부여를 하지 않는다는 05 선례를 알고 정할 것. 새 DTO 칸은 `domain/permissions/info-items.ts`(05가 `expense.value` · `expense.amount` 추가)에 맞출 것 |
| 23 | A-608-T 「Phase 5 저장소의 테스트 모드」(06-11:155 B-4 · 06-16:141 · 06-24:25,:86, 06-11 ⓪ 가드 grep): 없으면 멈추고 「Phase 5 쪽 작업 / GCS 에뮬레이터 컨테이너(새 기반 시설 — 승인 필요)」를 묻는다 | **있음**(05-04 · 05-12). 포트 `lib/gcp/storage.ts:19` `ObjectStorage`(`createSignedPut` · `createSignedGet` · `getMetadata` · `move` · `delete` · `retain`) · `getObjectStorage()` :39 · 로컬 드라이버 `localStorageFromEnv()` :232(`writeObject` :58) · 서명 창구 `app/api/storage-local/[...key]/route.ts`(`PUT`/`GET`, 드라이버가 local이 아니면 404) · 선택 `resolvedStorageDriver(env)` `lib/env.ts:203`(`STORAGE_DRIVER` 없으면 `APP_ENV=local`일 때만 local · `STORAGE_DRIVER=local`은 `APP_ENV=local`에서만 허용 :131-135). E2E: `playwright.config.ts:76` `STORAGE_DRIVER ?? "local"`. 통합: 메모리 가짜 `test/integration/fakes/memory-storage.ts:22` `createMemoryStorage()`(`MemoryStorage` :10 — `objects` · `moves` · `retains` · `deletes` · `signedGets` · `put(url, object)` · `tamper` · `failNextMove` · `failRetain`)를 `deps.storage`로 주입 | 06-11 ⓪의 A-608-T는 「해소됨」으로 적고 에뮬레이터 · Phase 5 쪽 작업 선택지를 지운다(새 의존성 없음). 도우미: 통합 `attachEvidence(viewer, expenseId, storage?, file?)` `test/integration/fixtures/expenses.ts:95` · E2E `test/e2e/expense-fixture.ts:137` `uniqueReceipt(page)` + `page.getByTestId("attachments-input").setInputFiles(...)` :169 · `makeEvidenceManagerE2E()` :122 · `submitLineExpense(browser, baseURL, fx, key)` :162. 06-16 · 06-24 · 06-25의 같은 선행 줄도 이 값으로 |
| 24 | F8 고아 객체 청소(06-11:44,:290,:303 · T-06-54): 「`docs/OPERATIONS.md`에 15줄 절 + `wc -l` 300 이하」 · 고아 = 「서명 URL 발급 기록은 있고 파일 행이 없는 객체, 발급 뒤 24시간」 | 05-12가 자리를 **이미 정했다**: `docs/EVIDENCE-STORAGE.md`(86줄 · 상한 150 — `test/unit/docs-limits.test.ts`가 고정) §6 「남는 객체 정리 — Phase 6 F8」. `docs/OPERATIONS.md`는 main · pr162 모두 **300/300줄**(`docs-limits` 상한 300)이라 한 줄만 더해도 빨갛다(05는 그 파일에 1줄만 덧붙였고 줄 수 불변). 저장소 구조: `incoming/{업로드 의도 id}`(수명 주기 규칙이 **7일 뒤 삭제**) · `evidence/{파일 id}`(삭제 규칙 없음 + 임시 보존 표식 `temporaryHold`). 05가 F8로 넘긴 범위 = ① 지운 증빙(`removed_at`)의 `evidence/` 객체 ② 완료 통보 트랜잭션이 거부된 뒤 남은 `evidence/` 객체 — **보존 표식 해제 포함**, 재료는 `files` · `upload_intents`. 앱의 `ObjectStorage` 포트에는 `retain`(표식 켜기)만 있고 해제 메서드는 없다 — 해제 PATCH `{ temporaryHold: false }` 뒤 `delete`하는 순서는 스모크 스크립트 `scripts/gcs-sign-smoke.ts:129-139`(「표식 해제 뒤 삭제」)에만 있다. 표식 PATCH는 REST 범위 `devstorage.full_control`이 필요해 05가 올렸다(`lib/gcp/storage.ts:249` · 05-12 SUMMARY 8). 소프트 삭제 7일 기본값은 법정 보관 때문에 그대로(EVIDENCE-STORAGE §1) | 06-11 Task 3 ③을 고친다: 절 위치 = `docs/EVIDENCE-STORAGE.md` §6 확장(남은 64줄 안), 가드 `wc -l docs/EVIDENCE-STORAGE.md` ≤ 150. 그 문서 테스트가 `"Phase 6 F8"` 토큰을 요구하므로(`docs-limits.test.ts`) 문구를 유지하거나 테스트를 같이 고친다. 청소 대상은 위 ① ② + 보존 표식 해제 절차(해제 → 삭제 순서는 스모크 `scripts/gcs-sign-smoke.ts:129-139`가 선례 — 포트에 해제를 더하거나 `gcloud storage objects update --no-temporary-hold`)이고, 「발급 뒤 24시간」 기준은 `incoming/`의 7일 수명 주기 규칙과 겹친다 — 정리 기준을 다시 정할 것 |
| 25 | 제출 뒤에도 PM이 증빙을 더하고 뗄 수 있다(06-UI-SPEC UA-606 · 06-11 A-607 「PM 증빙 추가 · 삭제 · 금액 고침」 · 06-11 B-1/X-1 훅 · `lastEvidenceDeleteNeedsConfirm`) | 05의 상태별 증빙 권한(`OWNER_RULES.expense` `domain/evidence/index.ts:119-130` · `expenseState` :101 · `expenseDrafterRemoves` :115): **작성 중 · 반려 · 회수** = 기안자가 더하고 뗀다. **결재 중**(`submitted` · `in_review`) = 기안자도 못 더하고(`EVIDENCE_LOCKED_IN_REVIEW` :49) `expenses.evidence_attach` 쓰기 권한자(기안자 아님)만 더하며 아무도 못 뗀다. **승인** = **기안자만** 더한다(권한자는 `EVIDENCE_ADD_DRAFTER_ONLY` :53), 삭제는 없다(`EVIDENCE_REMOVE_LOCKED_APPROVED` :50 · :368), 무효 처리만 `expenses.evidence_void` 쓰기 권한자(`EVIDENCE_VOID_ONLY_APPROVED` :51 · :451, 사유 필수). 증빙 「금액 고침」 함수는 없다(§1-6) | 06 문구의 「PM」은 05에서는 **기안자**(문서를 쓴 사람 — 담당 PM이 기안자가 아니면 승인 뒤에도 못 더한다)다. 승인 뒤 「뗌」은 없고 「무효」뿐이라 06-11 훅은 결재 통과 문서에 닿는 두 곳에만 달면 된다: `completeEvidenceUpload`(승인 뒤 기안자 추가) · `voidEvidence`(경영관리 무효). `removeEvidence`는 작성 중 · 반려 · 회수에서만 돌아 확인 기록이 있을 수 없는 문서라 훅이 필요 없다(06-11 「결재 통과 전 문서는 version 안 올림」과도 맞다). `lastEvidenceDeleteNeedsConfirm`의 `expense · 남는 0` 확인도 이 세 상태(통과 전)에서만 쓰인다 |

### 이전 감사(`reconcile.md` · `notes-B-phase05.md`, 커밋 `17a0a41b`) 정정

1. `findActiveBySha`는 이미 **주인 종류 목록**을 받고(`repositories/files.ts:29`), `requestEvidenceUpload`는 `[input.ownerKind]`로 부른다(`domain/evidence/index.ts:212`) — 「주인 종류별 중복 조회」(06-11 X-4)가 이미 선 모양이다.
2. 줄 번호가 밀렸다: `keys.ts` 1045 → 1110, `allocateExpenseNumber` 235 → 248, `approveDocument` 610 → 640, `loadDocumentNumberFormat` 105 → 118.
3. 이제 **구현돼 있다**: `listEvidenceVoidSignals` · `domain/settlements` · 종류 훅 셋 · `expenses.evidence_attach`.
4. 06-03의 `pickTaxDates` · `incomeTypeFor`는 `domain/expenses/tax.ts`와 이름이 겹친다(§1-5).
5. `app/(app)/expenses/page.tsx`는 삭제됐다 → `(list)/page.tsx`. 액션은 `expenses/actions.ts`, 폼은 `[id]/expense-form.tsx`.
6. 06-01의 `app/(app)/status-display.ts`는 `ui/status-tag/status-map.ts` 단일 출처와 충돌한다.
7. `ListScreen.primaryAction`은 링크만 받는다.
8. 「NOT VALID + VALIDATE」 조언은 **두 마이그레이션으로 나눌 때만** 맞다(squawk 실측, 06-16:190 ⒜와 일치).
9. `loadDocumentNumberFormat`은 main에서도 이미 export돼 있다(:103).
10. `sumKrw` · `diffKrw`는 단위 테스트가 **있다**(`test/unit/domain/money.test.ts:313`) — 이전 요약의 「테스트 없음」은 잘린 grep 탓이었다.

## 2. 항목별 대조 (요청 1~12)

### 2.1 항목 1 — `sumKrw` / `diffKrw` · `evidence.max_size_mb` · 번호 채번

| 심볼 · 경로 | pr162 | 파일:줄 · 시그니처 | 06이 쓸 것 |
|---|---|---|---|
| `sumKrw` | 있음 | `domain/money/index.ts:208` `sumKrw(values: readonly number[]): number` | import만(06-02 Task 2 삭제) |
| `diffKrw` | 있음 | `domain/money/index.ts:212` `diffKrw(a: number, b: number): number` | 〃 |
| 단위 테스트 | 있음 | `test/unit/domain/money.test.ts:313` | 06-02의 `money-sum-diff.test.ts` 삭제 |
| 같은 파일의 05 추가분 | 있음 | `remainingForInstallments(execution, others, current?)` :219 · `formatRatePercent(rate)` :244 · `grossFromTotal` :202(main에서부터) | 분할 회차 상한 · 세율 `%` 글자에 재사용 |
| `domain/money/tax.ts` | 05 무변경 | `applyTaxRule` :59 · `ApplyTaxRuleOpts` :30 · `TaxRuleResult` :37 · `TaxRuleDeps` :44 | 06-03이 `loadTaxRates` · `decidePayable`을 이 위에 짓는다(둘 다 없음(확인함)) |
| `EVIDENCE_MAX_SIZE_MB` | 있음 | `domain/settings/keys.ts:1109-1120`(namespace `증빙` · 기본 10 · `unitLabel "MB"` · 1~100 정수 · `readBy` 없음) | 다시 정의 금지 · `readBy` 금지 |
| `SettingDef.unitLabel` · `getSettingEntry` | 05 추가 | `domain/settings/registry.ts:57` · `:394` | 새 키에 `unitLabel` 사용 가능(예: `evidence.prepaid_due_days` 「일」) |
| `getSimpleSettingValues` | main에 있음 | `registry.ts:375`(main :373) — 키 여러 개를 SELECT 한 번 | 번호 서식 로더가 쓴다 |
| 번호 서식(`project` 등) | 있음 | `DocumentNumberFormat` :45 · `documentNumberFormat(parts, format)` :62 · `DOCUMENT_NUMBER_FORMAT_DEFS` :74-114(비공개) · `UnknownDocumentNumberCounterError` :116 · `loadDocumentNumberFormat(counterKey)` :118(5개 `getSettingValue` 병렬 — 전역 풀 읽기라 **트랜잭션 전**) · `allocateDocumentNumber(viewer,{counterKey,year,format},tx?)` :146(period = `String(year)`, 미등록 키는 카운터를 올린 뒤 throw) · `assertSeqStartNotLowered` :180 · `setSimpleSettingValue` :204 | 연도 period 문서(팀 비용)에 사용 |
| 지출결의 번호(05) | 있음 | `ExpenseNumberFormat` :228 · `expenseNumberFormat(projectNumber, seq, format)` :230 · `loadExpenseNumberFormat(deps?)` :238 · `allocateExpenseNumber(viewer,{projectNumber,format},tx)` :248 | 카운터 키가 하드코딩이라 일반화 불가 — 패턴만 복제 |
| 카운터 리포지토리 | 있음 | `repositories/document-counters.ts:47` `allocateNumber(viewer, counterKey, period, tx = db)` · `:72` `lockDocumentCounter` · 표 `db/schema/document-counters.ts`(`(counter_key, period)` 복합 PK, 주석에 `"purchase_request"`) | `purchase_request`는 이 함수 하나로 가능 |
| 서식 키 | 있음 | `keys.ts:993-1022`(`DOCUMENT_NUMBER_EXPENSE_SEPARATOR` · `_SEQ_DIGITS` · `_SEQ_START`, push :1024-1045) · `expense_team` 다섯 :1049-1097 | `document_number.purchase_request.*`는 이 모양을 따른다 |

- 05가 쓰는 카운터: `expense`(period = 프로젝트 번호 → `26001-0004`) · `expense_team`(period = 서울 제출일 연도 → `T26-0001`, `submitExpense`의 `teamNumberYear`). 06-02 ⓪의 A-607(팀 비용 번호 규칙)은 **해소**돼 있다.
- 서식은 트랜잭션 **전에** 읽는다(`submitExpense`:847-849). 전역 풀 읽기를 잠긴 tx 안에서 하면 풀 소진 교착(PR #75)이다.
- 06-02 ⓪는 「Phase 5가 프로젝트 단위 카운터 경로를 이미 만들었으면 그 함수에 `purchase_request` 줄만 더한다」 — 그 함수는 `allocateExpenseNumber`인데 `"expense"`가 고정이라 줄만 더해서는 안 된다. 일반 부여는 `allocateNumber` 하나다.

### 2.2 항목 2 — 줄 문(door)

| 심볼 · 경로 | pr162 | 파일:줄 · 설명 | 06이 쓸 것 |
|---|---|---|---|
| `expenseLineDoor(input)` | 있음 | `domain/expenses/line-door.ts:19` — `input: { line: { lineKind, cancelled, vendorId, execution }, numbered: readonly LineDoorNumbered[], selfId? }` → `ExpenseLineDoor { state, latest?, remaining, nextInstallmentSeq, forcedInstallment }` | 지출결의 문. 06이 바꾸는 것은 종결 문서 제외(todo)뿐 |
| `ExpenseLineDoorState` | 있음 | :7 `"open" / "closed" / "no_vendor" / "none"` — none = 견적 줄 아님(견적 외 비용 · 조정) 또는 취소, no_vendor = 거래처 없음, closed = 자기 밖에 번호 있는 비분할 문서가 있거나 남은 실행가 ≤ 0 | 06-13 DTO `door` 조합표에 이 4값 사용 |
| `LineDoorNumbered` · `ExpenseLineDoor` | 있음 | :9 `{ id, number, installment, supply: Money }` · :11 | |
| 호출 래퍼 | 있음 | `domain/expenses/index.ts`: `lineExecution(line)` :419 · `doorFor(line, numbered, selfId?)` :428 · `listNumberedByLineage(viewer, projectId)` :443(줄마다 계보 사슬 전체의 번호 문서, D-66) · `doorBlock(door)` :494 · `lineRemainingText` :502 · `listLineDoors(viewer, { projectId })` :1263 → `LineDoors { showColumn, tableGateReason, cells }`(`LineDoorCell` :1252-1259) | |
| 문서 소스 | 있음 | `repositories/expenses.ts`: `listNumberedByLine` :257 · `listNumberedByLines` :276 · `listNumberedByProject` :307(`NumberedLineExpense` :251 · `NumberedProjectExpense` :301) | 종결 문서 제외 시 이 셋의 WHERE |
| `domain/quotes/line-door.ts` · `resolveLineDoor` | **없음(확인함)** | main에는 `line-door` 이름의 파일이 0개. pr162에는 `domain/expenses/line-door.ts`뿐(`resolveLineDoor`는 :3 주석에만) | 06-02가 신설 — 충돌 없음 |

### 2.3 항목 3 — 증빙 모듈

**`domain/evidence/index.ts`(476줄) 공개 이름** — 모두 pr162 있음:

| 이름 | 줄 | 시그니처 · 설명 |
|---|---|---|
| `EvidenceFileDto`(type) | :25 | `domain/evidence/dto.ts:7` 재export. `EVIDENCE_FILE_DTO_SPEC` dto.ts:20(칸 전부 정보 항목 `expense.value`), `registerDto("evidenceFile")` dto.ts:35 |
| `EvidenceCheckError` · `EvidenceLockedError` | :45 · :48 | `UserFacingError` 하위 |
| 문구 상수 | :49-53 | `EVIDENCE_LOCKED_IN_REVIEW`(「결재 중 · 증빙 잠김」) · `EVIDENCE_REMOVE_LOCKED_APPROVED` · `EVIDENCE_VOID_ONLY_APPROVED` · `EVIDENCE_ADD_DRAFTER_ONLY` |
| `EvidenceUploadRefusedError` | :58 | `restart` / `complete` 두 갈래 |
| `EvidenceDeps` | :64 | `{ storage?, now?, afterLock? }`(경합 사례용 `afterLock`) |
| `requestEvidenceUpload(viewer, raw, deps?)` | :198 | 트랜잭션 없이: 주인 · 보임 · 더하는 사람 · 상태 → 한도(:210) → 중복(:212) → `checkEvidenceUpload`(:221) → 의도 행 → 서명 PUT. 반환 `EvidenceUploadIntent` :194 |
| `completeEvidenceUpload(viewer, { intentId }, deps?)` | :254 | tx 전 메타데이터 재확인 · 옮기기 → tx: `rule.lock` → 의도 완료 → `insertFile` → `recordActionInTx` → (결재 중 · 승인 뒤 추가면) `bumpInstanceVersion(reason: "evidence")` :331. 반환 `Partial<EvidenceFileDto> & { id: string }` |
| `removeEvidence(viewer, { fileId }, deps?)` | :359 | 기안자만 · 작성 중 · 반려 · 회수에서만. `markRemoved` + 로그, 인스턴스 version 안 올림. 반환 `void` |
| `createEvidenceViewUrl(viewer, { fileId }, deps?)` | :393 | 서명 GET 5분 |
| `listEvidence(viewer, { ownerKind, ownerId })` | :407 | 삭제되지 않은 파일(무효 포함) 올린 순 |
| `getEvidenceActions(viewer, { ownerKind, ownerId })` | :422 | `EvidenceActions { canAdd, deletableFileIds, voidableFileIds, drafterLocked }`(:418) |
| `voidEvidence(viewer, { fileId, reason }, deps?)` | :445 | 승인된 문서만 · 무효 세 칸 쓰기 · 로그에는 사유 길이만 · 인스턴스 version 안 올림 · **지출결의 행 잠금 없음** · 반환 `void` |

**비공개**(06이 확장할 자리): `OwnerState` :74(`id, drafterId, number, status, updatedAt, instance`) · `OwnerRule` :83(`load · lock · canSee · drafterAdds · drafterRemoves · inReview · approved · attachMenu · voidMenu · notFound`) · **`OWNER_RULES` :118(`expense` 한 줄)** · `adderOf` :137 · `addOpen` :145 · `bumpsInstance` :150 · `OWNER_KINDS` :154(`z.enum`의 재료, :183) · `ruleFor` :156.

- `OwnerRule.attachMenu` · `voidMenu`가 **리터럴 타입**(`"expenses.evidence_attach"` · `"expenses.evidence_void"`, :93-94)이다 → 새 주인 종류(`quote_revision` · `reserve_entry` · `corp_card_usage`)가 자기 메뉴를 쓰려면 타입을 넓혀야 한다.
- `domain/evidence/index.ts:16`이 `@/domain/expenses`(`canSeeExpense` · `EXPENSE_DOCUMENT_KIND` · `ExpenseConflictError` · `ExpenseNotFoundError`)를 import한다. 반대로 `domain/expenses/index.ts:10`은 같은 모듈의 **잎 파일** `@/domain/evidence/signals`만 import한다(순환 방지 선례). 새 주인 종류를 이 표에 직접 넣으면 `domain/quotes` · 카드 모듈과 순환 위험 → 잎 파일 분리 또는 주인 모듈이 규칙을 등록하는 모양. `test/unit/import-cycles.test.ts`가 지킨다.
- 증빙 변경 시 `expenses.version`은 오르지 않는다(§1-7). 증빙 변경이 결재선에 닿는 곳은 `bumpsInstance`(결재 중 · 승인 뒤 추가)뿐.

**`domain/evidence/upload-checks.ts`(순수)**: `EVIDENCE_CONTENT_TYPES` :4(`image/jpeg · png · webp · heic · heif`, `application/pdf`) · `EVIDENCE_WRONG_TYPE` :6 · `EVIDENCE_DUPLICATE_SAME_OWNER` :7 · `EVIDENCE_DUPLICATE_HIDDEN` :8 · `EVIDENCE_UPLOAD_FAILED` :10 · `evidenceDuplicateElsewhere(number)` :12 · `evidenceTooLarge(size, maxBytes)` :26 · `EvidenceUploadDeclaration` :31 · `EvidenceDuplicate { sameOwner, visibleNumber }` :34 · `EvidenceUploadCheck` :36 · `checkEvidenceUpload(input, opts: { maxBytes, duplicates })` :38. 06-11:247이 가정한 `({ownerKind, ownerId, sizeBytes, mimeType, sha256})` 모양과 `domain/evidence-reviews/upload-checks.ts` 경로는 맞지 않는다.

**리포지토리 `repositories/files.ts`**(「domain을 import하지 않는다(06-11 X-4)」 헤더): `alive()` :13 · `insertFile` :15 · `findFileById` :22 · `findActiveBySha(viewer, sha256, ownerKinds, tx)` :29 · `countActiveByOwner` :44 · `listActiveByOwner` :54 · `markRemoved` :66 · `markVoided(viewer,{id,voidedBy,reason,at?},tx)` :78 · `findUnresolvedVoidOwnerIds` :94 · `listAliveByOwners` :113. `repositories/upload-intents.ts`: `insertIntent` · `findIntentById` · `completeIntentIfOpen`.

- **「살아 있는 파일」** = `removed_at IS NULL AND voided_at IS NULL`(`alive()` :13, `db/schema/files.ts` 주석 :8). 게이트 ⑧ 개수와 중복 검사는 이것만 센다.
- **무효 신호**: `listEvidenceVoidSignals(viewer, { ownerKind, ownerIds })` `domain/evidence/signals.ts:5` → `findUnresolvedVoidOwnerIds`(files.ts:94: 지워지지 않은 행 중 가장 늦은 무효가 있고 살아 있는 행이 없거나 무효가 가장 늦게 올린 살아 있는 행보다 늦은 주인). 소비자: `expenseBlockedAfterApproval`(`domain/expenses/index.ts:393`) → 종류 훅 `blockedAfterApproval`(:398-411) → 기안자 「내 차례」 [막힘] 「증빙 무효 · 증빙 올리기」.
- **`files_owner_kind_check`**: `db/schema/files.ts:35` `CHECK (owner_kind IN ('expense'))`, 마이그레이션 `db/migrations/0026_gifted_genesis.sql:23`(CREATE TABLE 인라인). 같은 표 `files_sha256_check` :36 · `files_size_bytes_check` :37 · `files_void_check` :38-41 · `files_void_reason_length_check` :42. `files.owner_id`에 FK 없음(`files.ts` 주석 :6 「Phase 6이 owner_kind 값을 더한다」). 넓히는 방법은 §1-10 · §2.9.
- **권한 메뉴 시드**: `domain/permissions/menus.ts:36` `expenses.evidence_void`(「증빙 무효 처리」) · `:37` `expenses.evidence_attach`(「결재 중 증빙 붙이기」). 시드는 `domain/seed/index.ts:161-187`의 `MENUS` 루프(SYSADMIN) — 다른 계급 부여 시드는 없다. 통합 테스트는 `makeEvidenceManager`(`test/integration/fixtures/expenses.ts:114`)로 계급을 만든다.
- **상태별 증빙 권한**(`OWNER_RULES.expense` :119-130 · `expenseState` :101 · `expenseDrafterRemoves` :115 · `adderOf` :137 · `addOpen` :145 · `bumpsInstance` :150): 작성 중(번호 · 인스턴스 없음) · 반려 · 회수 = 기안자가 더하고 뗀다. 결재 중 = 기안자 불가, `expenses.evidence_attach` 쓰기 권한자(기안자 본인은 권한이 있어도 이 갈래가 아니다 — 웨이브 11 검토 m3)만 더하고 아무도 못 뗀다. 승인 = 기안자만 더하고, 삭제 불가, 무효 처리만 `expenses.evidence_void` 권한자. 결재 판정(인스턴스 version)에 닿는 것은 결재 중 · 승인 뒤 **추가**뿐이다. 06이 가정한 「PM의 추가 · 삭제」와의 차이는 §1-25.

### 2.4 항목 4 — 05-15 줄 상태

| 심볼 · 경로 | pr162 | 파일:줄 · 설명 | 06이 쓸 것 |
|---|---|---|---|
| `lineStatusWord(line)` | 있음 | `app/(app)/projects/status-display.ts:17` — `(line: { lineStatus: string; linkedStatus: "rejected" / "active" / null }): StatusWord`. 우선순위 취소 > 반려 > 지출결의 중 > 미착수(작성 중 · 회수 문서는 `linkedStatus`가 null이라 줄 상태를 안 바꾼다) | 06-13은 이 사슬을 늘린다: UI-SPEC 우선순위 취소 > 반려 > 증빙 없음 > 지출결의 중 > 구매 요청 > 지급 완료 > 카드 사용 > 미착수 |
| `PROJECT_STATUS_TAG_KIND` | 있음 | 같은 파일 :7 | 06-01은 이 파일을 고치지 않는다(06-01:25 범위 나눔)와 일치 |
| 소비자 | 있음 | `quote-table.tsx:69`(import) · `:2053`(상태 열 `StatusTag variant="text"`) · `:2809`(폰 시트 「상태」) · `previous-revision.tsx:121`(`linkedStatus: null`) | |
| `QuoteLineLinkedStatus` | 있음 | `domain/quotes/lines.ts:78` `"rejected" / "active"` · 필드 :113 :120 :189 · `LinkedDocument { number, approvalStatus? }` :263 · `LinkedDocumentsByLine` :264 · `linkedDocumentsByLine(viewer, revisionId, tx?)` :268 · 비공개 `loadLinkedDocumentsByLine` :272 · `linkedStatusOf` :292 · 사용 :328 | 06-13의 `domain/quotes/line-status.ts`(`deriveQuoteLineStatus` · `QUOTE_LINE_STATUS_PRIORITY` — 없음(확인함))는 이 `linkedStatusOf` 자리를 대체/확장 |
| 문서 소스 | 있음 | `repositories/expenses.ts:303-307` `listNumberedByProject`(번호 있는 · 삭제 안 된 지출결의 + 결재 인스턴스 상태를 한 쿼리로) | |
| **D-66 잠금** | 있음 | `domain/quotes/edit-scope.ts:31` `LINKED_READONLY_FIELDS = ["quantity", "unitPrice", "execution"]`(연결 문서가 있는 줄의 금액 칸 읽기 전용) · `:134` 「Error — 셀(읽기 전용, D-66)」 · `domain/rules/register.ts:23-26`(연결 문서가 있는 줄은 보관 대신 취소) · `quote-table.tsx:118`(DTO의 읽기 전용 이유 줄) | 06-13의 `expense.line-paid-lock`은 같은 두 파일을 확장 |
| 점검표 | 있음 | `docs/design/checks/2026-10-04-05-15-quote-line-doors.md` | |

### 2.5 항목 5 — 05-11 정산 모듈 · 종류 훅

| 심볼 · 경로 | pr162 | 파일:줄 · 설명 |
|---|---|---|
| 정산 모듈 | 있음 | `domain/settlements/index.ts`(+ `dto.ts`) · `repositories/settlement-approvals.ts`(`findFinalStepActorInTx` · `findSettlementByProjectId` · `insertSettlementIfAbsent` · `listSettlementSummaries`) · `db/schema/settlement-approvals.ts`(0027) |
| `SETTLEMENT_DOCUMENT_KIND` | 있음 | :76 `"settlement"`. 문서 id = 프로젝트 id · 식별 번호 = 프로젝트 번호(새 카운터 없음). 헤더 :74 「지출결의 · 증빙 마감 점검으로 막지 않는다(Phase 6 PROJ-06 — D-100 · D-99)」 |
| 기안 · 회수 | 있음 | `submitSettlement(viewer, { projectId })` :322(트랜잭션 전 `prepareSubmission` :329 → tx 쓰기) · `withdrawSettlement(viewer, input, deps?)` :391 · 읽기 `getSettlement` :274 · `getSettlementHeader` :285 · `isSettlementResubmitWaiting` :298 · `canSeeSettlementDocument` :267 |
| 권한 브랜드 | 있음 | `SettlementApprovalAuthority` :89(만드는 함수 `grantApprovalAuthority` :91은 비공개 — 훅이 마지막 단계 기록을 확인한 뒤에만). `changeProjectStatus(viewer, projectId, { from, to, trigger?: "manual" / "approval" }, deps)` `domain/projects/status.ts:284` · `StatusChangeFacts` :105 |
| **`prepareFinalApproval`** | 있음 | 종류 훅 이름 그대로. 정의 `domain/approvals/kinds.ts:89` `(viewer, documentId) => Promise<unknown>`(트랜잭션 전, 풀 읽기 가능). 정산 구현 `prepareSettlementFinalApproval` `settlements/index.ts:429` → `{ projectId, facts: StatusChangeFacts }` |
| **`onFinalApprovalInTx`** | 있음 | `kinds.ts:90` `(viewer, documentId, tx, prepared) => Promise<void>`(최종 승인과 같은 tx · 단계 기록 뒤 · 행동 로그 전 · 던지면 승인 전체 롤백). 정산 구현 `onSettlementFinalApprovalInTx` `settlements/index.ts:437` → `findFinalStepActorInTx` 확인 후 `changeProjectStatus(... "settling" → "completed", trigger "approval")` |
| **`approveBlockedReason`** | 있음 | `kinds.ts:93` `(viewer, documentIds: string[]) => Promise<Map<string, string>>`(표시 전용). 정산 구현 `settlementApproveBlockedReason` `settlements/index.ts:455`(프로젝트가 정산이 아니면 「진행으로 바뀜 · 반려」) |
| 그 밖의 선택 필드 | 있음 | `DocumentKindDef`(`kinds.ts:75`): `canResubmit?(viewer, documentId?)` :84 · `resubmitFrom?` :86(`"rejected" / "withdrawn"`) · `blockedAfterApproval?` :96 · `loadDetails` / `detailDto` / `buildDetailRows`. 요약 타입 `DocumentSummary`(`kinds.ts:49-59`)의 선택 칸 `measure?` · `documentText?` · `number?` · `finalApprovalNote?` :55(최종 승인 토스트 꼬리) · `nextTurnText?` :57(「내 차례」 한 줄 대상 · 상황 글자) |
| 짝 규칙 | 있음 | `registerDocumentKind(def)` `kinds.ts:111` — `prepareFinalApproval`과 `onFinalApprovalInTx`가 짝이 아니면 `InvalidDocumentKindError`(:116-118) |
| **등록 위치** | 있음 | 정산: `domain/settlements/index.ts:468-483` `registerDocumentKind({ kind, label: "정산 결재", loadRouteConfig, href, describeDocuments, routeSettings, canResubmit, resubmitFrom: ["rejected","withdrawn"], prepareFinalApproval, onFinalApprovalInTx, approveBlockedReason, loadDetails, detailDto, buildDetailRows })`. 지출결의: `domain/expenses/index.ts:398-411`(`blockedAfterApproval`만, 최종 승인 훅 없음). 휴가는 04.1. 부수효과 import: `app/(app)/document-kinds.ts:2-4`(`@/domain/leave` · `@/domain/expenses` · `@/domain/settlements`) |
| 엔진 호출 | 있음 | `domain/approvals/index.ts`: `finalApprovalHookOf` :621 · `approveBlockedReasonsOf` :634 · `approveDocument` :640(훅 사용 :650) · `getApprovalView` :963(막힘 이유 :1008) · 결재함 목록 :1176 · `prepareSubmission` :240 · `submitDocument` :282 |
| **종류 키 리터럴 금지 규칙** | 있음 | `test/integration/approvals-extensions.test.ts:285-331` 「종류 키 리터럴 없음 — 등록된 종류 전부」: `app/(app)/document-kinds.ts`가 import하는 등록 모듈이 실제로 등록한 종류 키(`"expense"` · `"leave"` · `"settlement"` …)가 `domain/approvals/*.ts`의 주석 아닌 줄에 따옴표 리터럴(`"…"` · `'…'` · `` `…` ``)로 **0번** 나와야 한다 이 테스트가 유일한 금지 장치다 — ESLint · `.claude/` 훅 규칙은 없다(없음(확인함), §3) |
| 화면 | 있음 | 문서 `app/(app)/projects/[id]/settlement/{page,layout,loading,error,settlement-actions,settlement.module.css}` · 올리기 버튼 `app/(app)/projects/[id]/settlement-button.tsx`(:24 `정산 결재 올리기`) · `status-change.tsx` |

04.1 실제 이름(05-01 SUMMARY `name_map`, 변경 없음 — 확인용): `getApprovalView(viewer, { kind, documentId }, deps?)` · `prepareSubmission` · `submitDocument` · `approveDocument` · `rejectDocument` · `withdrawDocument` · `resubmitDocument` · `listMyInbox`.

### 2.6 항목 6 — 05-08 목록 화면

| 심볼 · 경로 | pr162 | 파일:줄 · 설명 | 06이 쓸 것 |
|---|---|---|---|
| `ListScreen` | 있음(05 무변경) | `ui/list-screen/ListScreen.tsx:35` props: `title · primaryAction · filters · summary · summaryPlain · singleColumn · empty · children · pagination · panel` | |
| `primaryAction` | 있음 | `:13` `{ label: string; href: string; phoneHidden?: boolean }` — **링크만**(`:47-57`이 `<Link>`를 그린다. `empty`가 있으면 그리지 않음 `:37`) | 버튼형 일괄 지급 진입이면 타입 확장 |
| 지출결의 목록 | 있음(05 신규) | `app/(app)/expenses/(list)/page.tsx`(`ExpensesPage`, `?status=` 파라미터 `toView` :21, `VIEW_STATUS` :19, `listExpenses` 호출 :56, `StatusFilter` :75, 합계 면 · `Pagination` · `empty`) · `(list)/{layout,loading,error}.tsx` · `list-columns.ts`(`EXPENSE_COLUMN_LABELS` 7열: number · title · vendor · amount · payment · drafter · status, `EXPENSE_STATUS_VIEWS = ["진행 중", "승인", "전체"]` :14) · `status-filter.tsx` · `expenses-table.tsx` | 06-15 · 06-17 · 06-20이 고칠 파일은 이 경로(§1-12) |
| 도메인 | 있음 | `domain/expenses/list.ts`: `ExpenseListStatus = "open" / "approved" / "all"` :20 · `listExpenses` :110 · `groupExpenses` · `VIEW_RANKS` · 승인 보기는 **지급 예정일 구간**(「예정일 지남」 · 「이번 주 지급」 · 「다음 주」 · 「그 뒤」 · 「지급 예정일 없음」)으로 묶는다 — 05 시점의 「지급 대상」 대용. 리포지토리 `repositories/expenses.ts`: `EXPENSE_GROUP_RANKS` :432(`draft 1 · returned 2 · inReview 3 · approved 4`) · `listExpensePage` :479 · `summarizeExpenseList` :547 · `isExpenseInScope` :573 | 06-15의 지급 보기 낱말 · 묶음 구간을 더할 자리(§1-12) |
| 상태 열 | 있음 | `expenses-table.tsx:122` `<StatusTag status={row.statusWord as StatusWord} variant="text" />`. 낱말은 `app/(app)/expenses/status-display.ts` `expenseStatusWord(approvalStatus)`(인스턴스 없음 → `작성 중`, 있으면 `leaveStatusWord`에 위임) · `domain/expenses/index.ts:247` `STATUS_WORDS`(`submitted · in_review` → 결재 중 · `approved` → 승인 · `rejected` → 반려 · `withdrawn` → 회수 · 없음 → 작성 중) | 지급 상태 낱말(`지급 완료` 등)은 이 열에 더한다 — 지금 지급 개념이 없다 |
| `ui/table` 행 선택 | **없음(확인함)** | 05가 더한 것: `onOpenRow?: (row, rangeRows) => void`(`Table.tsx:34`, Ctrl+E · `use-grid-keyboard.ts:31 · :237`) · `column.headerHidden`(`types.ts:59`). 이미 있던 키보드 범위 선택(`selectionAnchor` · `allSelected` · `isInSelection` · `onSelectAll` — `use-grid-keyboard.ts:57 · :70-74`)은 **셀 범위**이지 체크박스 행 선택이 아니다. `Table.module.css:77`의 `type="checkbox"`는 입력 셀 CSS 선택자일 뿐 | 06-15 `selectable` 변형 신설. 셀 범위 선택(`aria-selected` · `selectedCell`)과 체크 `checked`를 섞지 않는다(06-15:37 DR-7) |
| 정산 · 프로젝트 목록 | 있음 | `app/(app)/projects/**`는 04에서(`ListScreen` 사용) | |

### 2.7 항목 7 — 프로젝트 상태 enum · 마이그레이션

- `domain/projects/status-transitions.ts:5` `PROJECT_STATUSES = ["bidding", "in_progress", "settling", "completed", "lost"]` · `ProjectStatus` :7 · `ALLOWED_TRANSITIONS` :17(`bidding → in_progress` · `bidding → lost` · `lost → in_progress` · `settling → completed`(`menu: "projects.complete"`, `via: "approval"` — 05-11이 `via` 추가)) · `AUTO_TRANSITIONS` :25(`in_progress → settling`, `end_date_passed`).
- 마이그레이션: `db/migrations/0012_project_status_five_values.sql`(main에 있음, `-- rollback-floor:` 표시) — 옛 `settled` 행을 `completed`로 옮기고 코드표에서 `settled`를 지우고 `settling` · `completed`를 더한다. 시드 `domain/seed/index.ts:44-50`(`PROJECT_STATUS_CODES`: 수주중 · 진행 · 정산 · 완료 · 미수주).
- `db/schema/projects.ts:28` `status: text("status").notNull().default("bidding")`(CHECK 없음, 코드표 `project_status`가 정본).
- 05에서 달라진 것: `domain/projects/status.ts`의 `changeProjectStatus`에 `trigger` + `approvalAuthority`(정산 최종 승인 경로).
- 06 영향: 06-09 A-601 `settled`(06-09:128) → `completed`. 「완료 프로젝트」는 `projectRow.status === "completed"`(`domain/expenses/index.ts:468`, `gate.ts:37` `PROJECT_COMPLETED` 「완료 프로젝트 · 새 지출결의 없음」).

### 2.8 항목 8 — 컬럼 · 상태값

- **`projects.pmUserId`**: `db/schema/projects.ts:23` `text("pm_user_id").notNull().references(() => users.id)`. 05의 사용: `domain/expenses/index.ts:470`(`findUserById(projectRow.pmUserId)` — `loadProjectFacts` :464) · :476 · :547 · :767 · :1057 · :1083 · :1273(작성 권한 = 담당 PM 또는 `coversProjectTeam`). 06-04 A-607의 `pm` grep은 통과한다.
- **`expenses` 칸**(`db/schema/expenses.ts`, 77줄): `drafterId` · `number`(unique) · `projectId` · `quoteLineId` · `teamExpenseKind` · `usageDate` :25 · `content` · `attributedTeamId` · `vendorId` · `evidenceType` :30(코드표 값 문자열) · `paymentMethod` :31 · `supplyCurrency` · `supplyForeignAmount` · `supplyFxRate` · `supplyAmountKrw`(= 06의 「승인액」 후보, 번호 있는 문서는 > 0 CHECK `expenses_submitted_amount_check`) · `installment` · `installmentSeq` · `scheduledPaymentDate` :38 · `note` · 세금 스냅숏 `taxRuleKind` · `taxRate` · `taxRateSettingId` · `taxRateEffectiveFrom` · `taxCompanyBorneMethod` · `taxBasisDate` · `vatKrw` · `withholdingKrw` · `companyBorneKrw` · `payableKrw` · `idempotencyKey`(unique) · `submittedAt` · `version` :52 · `updatedBy` · `deletedAt` · `deletedBy` · `createdAt` · `updatedAt`.
  - **「증빙 금액 · 증빙일」 칸: 없음(확인함)**. 선결제 · 면제 · 지급 · 종결 칸도 없다. 가까운 값은 `evidenceType`(종류), `usageDate`, `scheduledPaymentDate`, `taxBasisDate`(제출 시점 스냅숏)뿐.
  - 제약: `expenses_team_expense_kind_check`(`lost_bid` / `team_overhead`) · `expenses_line_or_team_check` · `expenses_installment_seq_check` · `expenses_tax_rule_kind_check`(`none / vat_surcharge / withholding / company_borne`) · 유일 인덱스 `expenses_line_drafter_draft_uniq`(번호 없는 · 삭제 안 된 문서는 줄 · 기안자당 하나).
- **지출결의 상태값**: `expenses`에 상태 칸이 **없다**. 상태는 `approval_instances.status`(`db/schema/approvals.ts:33-34` CHECK: `draft / submitted / in_review / approved / rejected / withdrawn`)에서 파생하고 인스턴스가 없으면 「작성 중」(`STATUS_WORDS` `domain/expenses/index.ts:247-257`). 인스턴스 version 사유 CHECK `approval_instances_version_reason_check` `IN ('evidence')`(:36). `domain/approvals/route.ts:7` `APPROVAL_STATUSES`.
- **종결(closed) · 취소(canceled) 같은 최종 상태: 없음(확인함)** — `closed_at|cancelled_at|canceled|closedAt|cancelledAt|종결` 검색 0건(§3). `deletedAt`은 작성 중 문서 소프트 삭제 전용(`softDeleteDraft` repositories/expenses.ts:166).
- `repositories/expenses.ts` 주요: `lockExpenseForUpdate` :78 · `findExpenseApprovalInstance` :126 · `findExpenseApprovalStatus` :89 · `updateDraftIfVersion` :141 · `saveSubmissionSnapshot` :226 · `setExpenseNumber` :246 · `ExpenseRow` :10.

### 2.9 항목 9 — 마이그레이션 · 05-13

| 항목 | main | pr162 |
|---|---|---|
| `_journal.json` 항목 수 | 24 | 28 |
| 마지막 idx · tag | 23 · `0023_custom_field_admin` | 27 · `0027_spicy_loners` |
| 05가 더한 것 | — | 24 `0024_white_guardsmen`(`approval_instances.version_reason` 인라인 CHECK) · 25 `0025_aromatic_hawkeye`(`expenses`) · 26 `0026_gifted_genesis`(`files` · `upload_intents`) · 27 `0027_spicy_loners`(`settlement_approvals`) |

- **05-13은 아직 합치지 않았다**(PLAN만, §0). 05-13-PLAN:29-30,:130-131은 05-01 · 03 · 04 · 11 SUMMARY의 `migration_manifest`에 적힌 SQL · 스냅숏만 지우고 `pnpm db:generate`로 main 마지막 + 1 **하나**로 재생성하며 `SET LOCAL lock_timeout` 블록을 다시 손으로 넣는다. 따라서 06 마이그레이션 번호는 05 병합 뒤 확정이다(06 플랜의 `NNNN_…` 유지).
- squawk 규약: `.squawk.toml`(`assume_in_transaction = true`) · `pnpm lint:sql` = `squawk --config .squawk.toml db/migrations/*.sql` · 파일 머리 `SET LOCAL lock_timeout = '1s'; SET LOCAL statement_timeout = '5s';` · CHECK는 `ADD COLUMN` 안에 인라인(0024 선례, `constraint-missing-not-valid` 회피).
- **squawk 2.65.0 실측**(스크래치 SQL):

| 시나리오 | 결과 |
|---|---|
| `DROP CONSTRAINT` + `ADD CONSTRAINT … CHECK`(검증형) | exit 1 — `constraint-missing-not-valid` |
| `DROP CONSTRAINT` + `ADD CONSTRAINT … CHECK … NOT VALID` | exit 0 |
| `NOT VALID` + `VALIDATE CONSTRAINT`를 **같은 파일**에 | exit 1 |
| `VALIDATE CONSTRAINT` 단독 | exit 0 |
| `DROP CONSTRAINT` 단독 | exit 0 |

  → `files_owner_kind_check`를 넓히는 일은 **파일 둘**(NOT VALID 생성 1 + `pnpm db:generate --custom` VALIDATE 1)이어야 하고, 06-16:190 ⒜ · 06-25:206이 이미 그렇게 계획한다. 06-10의 `prepaid` CHECK도 같은 규칙(06-10:213).

### 2.10 항목 10 — 반려 종결 todo

- 경로 **`.planning/todos/pending/2026-09-26-phase-6-rejected-expense-close-path.md`**: pr162에 있음, **main에는 없음**(`git ls-tree -r origin/main`에서 0건).
- 내용: 05 `/plan-ceo-review` U2(05-REVIEWS Round 1 — 1108e20). 번호를 받은 반려 · 회수 지출결의(예 `26001-0003`)가 ① 그 견적 줄의 문을 계속 닫고(1줄 1문서 · D-66) ② 분할 줄이면 회차 상한 계산에 계속 들어가며 ③ 비용이 실제로 취소돼도 줄이 계속 `반려`로 닫힌다. 제안: 반려 · 회수 지출결의에 「종결(취소)」 동작(기안자 또는 경영관리, 행동 로그를 같은 트랜잭션에, **번호 재사용 없음**), 종결 문서는 `remainingForInstallments`와 `expenseLineDoor`에서 뺀다, 낱말 · 되돌림 · 권한은 Phase 6 계획이 정한다. 사용자 결정 2026-09-26(코디네이터 PR #89)으로 Phase 6 TODO 확정.
- `.planning/phases/06-payment-evidence-cards/06-CONTEXT.md`는 pr162에서 한 줄 바뀌었다 — 「Phase 5에서 넘어온 것」에 이 경로가 추가됨(main 쪽 06-CONTEXT에는 없다).
- 25개 06 플랜 중 이 항목을 받는 플랜은 **없다**(grep은 지급 취소만 찾는다).

### 2.11 항목 11 — `status-map.ts` 낱말 표

- **위치**: main `ui/status-tag/status-map.ts:5-56`(`STATUS_KIND`), `StatusWord` :59, `statusKind` :61 → pr162 `:5-60` · `:63` · `:65`. 헤더 :1-2 「낱말 → 색 한 표 … 표에 없는 낱말은 타입 오류다」.
- 05가 더한 낱말: `지출결의 중`(accent, :24) · `본인 승인`(success, :32) · `무효`(muted, :41) · `작성 중`(muted, :44).
- 기존 확인증 낱말: `접수 중`(accent) · `제출됨`(success) · `신청됨`(muted, :56) · `접수 전` · `닫힘` · `대조 제외`(muted). **맨 `신청`은 없다**(main · pr162 모두 `신청됨`만).
- 06 UI-SPEC SP-2 낱말(06-UI-SPEC.md Color 표 · SP-2)과 대조:

| 구분 | 낱말 | 색 | pr162 |
|---|---|---|---|
| 견적 줄 파생 | `미착수` `취소` `반려` `증빙 없음` `지출결의 중` | muted · muted · danger · danger · accent | **있음** |
| 견적 줄 파생 | `구매 요청` | accent | 없음 |
| 〃 | `지급 완료` | success | 없음 |
| 〃 | `카드 사용` | success | 없음 |
| 증빙 확인 | `없음` | danger | 없음 |
| 〃 | `확인 전` | accent | 없음 |
| 〃 | `확인됨` | success | 없음 |
| 〃 | `면제` | muted | 없음 |
| 〃 | `선결제` | warning | 없음 |
| 구매 요청 | `신청` · `구매 완료` | accent · success | 없음 |
| 〃 | `취소` | muted | 있음 |
| 발행 요청 | `요청` · `발행됨` | accent · success | 없음 |
| 〃 | `취소` | muted | 있음 |

  → **없는 낱말 12개**: `구매 요청` · `지급 완료` · `카드 사용` · `없음` · `확인 전` · `확인됨` · `면제` · `선결제` · `신청` · `구매 완료` · `요청` · `발행됨`. 추가로 06-22가 쓰는 `선결제 · 증빙 없음`(06-22 본문)도 없다.
- 고정 테스트: `test/unit/ui/status-map.test.ts`(`UI_SPEC_TABLE` · `CURRENT_CALL_SITES` :22-31 · `CERT_WORDS` :34-41 — 낱말이 표에 있는지만 본다) · `test/e2e/dev-components.spec.ts:95`(`Object.keys(STATUS_KIND)` 낱말마다 `tag` · `text` 둘씩 그리므로 낱말을 더하면 갤러리가 자동으로 늘어난다).
- 도메인별 매퍼: `app/(app)/expenses/status-display.ts` `expenseStatusWord` · `app/(app)/leave/status-display.ts:52` `leaveStatusWord(status, stepLabel?)` · `app/(app)/projects/status-display.ts:17` `lineStatusWord`. DECISIONS.md:1745-1748(B2): 「`status-map.ts` 줄은 낱말을 처음 쓰는 플랜이 더한다 — `본인 승인` 05-01 · `작성 중` · `지출결의 중` 05-05 · `무효` 05-09(B8)」.
- `docs/design/SYSTEM.md`(pr162) §7-5 상태 태그는 페이즈별 「보강」 불릿 목록이다 — 05는 B2(`작성 중` · `본인 승인` · `지출결의 중` · 견적 줄 `반려`, `SYSTEM.md:952`)와 B8(`무효`, :953)을 더했다. 06-01의 SP-2도 같은 꼴의 불릿 하나로 더하면 되고, 「두~네 글자 명사」 규칙(:945)을 `tag` 변형에만 걸리게 좁히는 문장(06-01:29)이 필요하다(`선결제 · 증빙 없음` 같은 긴 낱말은 이 좁힘이 있어야 `text` 변형으로 쓸 수 있다). 05가 SYSTEM.md에서 고친 절: §3 간격(:227) · §6-1 목록(:411) · §6-3 폼(:482-489) · §7-3 표(:899-929) · §7-5(:952-953) · §7-7(:966 · :981) · §7-10 첨부(:1033, +5줄) · 신설 §7-17-1 골라내기(:1243-1256, §7-17 바로 뒤) — 06-01이 고칠 §7-3(SP-1) · §7-5(SP-2) · §7-17(SP-7)과 같은 절 · 인접부다(합쳐 읽고 편집).

### 2.12 항목 12 — 05가 이미 만든 것(06이 만들려던 것)

| 06 계획 | 05에 이미 있는 것 |
|---|---|
| `files.sha256`(06-10:200 「파일 표에 내용 해시 칸이 없으면 `sha256 text null` + 비유니크 인덱스」, 마이그레이션 `evidence_prepaid_sha256`) | **있음** `db/schema/files.ts:17` `sha256`(NOT NULL) · `files_sha256_idx` :34(비유니크) · `files_sha256_check`(`^[0-9a-f]{64}$`) :36 → 06-10에서 sha256 부분과 `db/schema/files.ts` 수정을 뺀다(선결제 칸만 남김) |
| `files` 표 · 업로드 의도 | **있음** `db/schema/files.ts`(`files` + `upload_intents` :48, 0026) · `repositories/files.ts` · `repositories/upload-intents.ts` · 객체 저장소 `lib/gcp/storage`(`ObjectStorage`) |
| 업로드 테스트 모드(06-11 A-608-T) | **있음**(§1-23) — `STORAGE_DRIVER=local` · `app/api/storage-local/[...key]/route.ts` · `test/integration/fakes/memory-storage.ts` |
| 증빙 객체 청소(F8) 자리 | **자리만 있음**(§1-24) — `docs/EVIDENCE-STORAGE.md` §6이 범위를 Phase 6으로 넘긴다. 청소 코드 · 절차는 없음(확인함: `git grep -n -E "temporaryHold\|release\(\|--no-temporary-hold" refs/remotes/pr162 -- lib scripts domain` — 앱 코드는 `lib/gcp/storage.ts:356` `retain`(true)뿐, 해제 `{ temporaryHold: false }`는 스모크 `scripts/gcs-sign-smoke.ts:135`에만) |
| `payment_method` 코드표 | **있음** `domain/code-tables/index.ts:39` `{ key: "payment_method", label: "지급 방식" }`(`:37` `evidence_type` 옆) · 시드 `domain/seed/expenses.ts:16-20` `PAYMENT_METHOD_CODES`(`bank_transfer` · `corp_card` · `cash`, 루프 :37-39) · `expenses.paymentMethod` · `listExpenseFormOptions`(`domain/expenses/index.ts:1191`). 06은 코드표를 만들지 않는다 |
| `evidence_type` 코드표(세금 규칙) | Phase 3부터 있음(`domain/code-tables/index.ts:37`, `taxRule` JSON · 시드 `domain/seed/index.ts:302`). `computeExpenseTax`가 `listCodeItems(tableKey: "evidence_type")`로 읽는다 |
| 증빙 한도 · 형식 · 중복(sha256) 검사 | **있음**(§2.3) |
| 증빙 권한 메뉴 2개 | **있음**(`expenses.evidence_attach` · `expenses.evidence_void`) |
| 승인 뒤 증빙 무효 처리 · 기안자 막힘 | **있음**(`voidEvidence` · `listEvidenceVoidSignals` · `blockedAfterApproval`) |
| 지출결의 문 · 회차 상한 | **있음**(`expenseLineDoor` · `remainingForInstallments`) |
| 버전 충돌 거부 | **있음** `ExpenseConflictError(savedAt)` `domain/expenses/index.ts:156`(문구 「{HH:MM}에 다른 곳에서 저장됨 · 새로 고침」, `UserFacingError`) — 05가 `locked.version !== input.expectedVersion`(:865) 등에서 던진다. 승인 쪽 문구는 `domain/approvals/conflict-message.ts`의 `buildConflictMessage`(`versionReason: "evidence"` → 「… 증빙을 바꿈 · 새로 고침」) · `buildEvidenceVoidedMessage`. 06의 지급 · 확인 · 면제 version 거부(06-03 · 04 · 06 · 10 · 15 · 17)는 같은 클래스를 재사용하거나 UI-SPEC 「낙관적 잠금」 문구를 따로 정한다 |
| 「내 차례」 공급 함수 · 로드 실패 화면 | **있음**(`listNextTurnItems` · `HomeNextTurnError`) |
| 골라내기 대화상자 · 첨부 컴포넌트 | **있음**(`ui/pick-dialog` · `ui/attachments`: `AttachmentFile` · `AttachmentActions { request, complete, remove, viewUrl }` · `AttachmentsProps { mode, files, actions, maxMb, uploadFailedText, onChanged?, canAdd, deletableIds, voidable, lockedText }`) |
| 상태 낱말 4개 | **있음**(§2.11) |
| 번호 카운터 `expense` · `expense_team` | **있음**(§2.1) — `purchase_request`는 없음 |
| 통합 테스트 픽스처 | **있음** `test/integration/fixtures/expenses.ts`(`ExpenseFixture` :25 · `setupExpenseProject` :37 · `attachEvidence` :95 · `makeEvidenceManager` :114 · `submitReadyDraft` :124 · `ExtraLine` :131 · `addApprovedRevision` :139) · `fixtures/settlements.ts` — 06 통합 테스트가 재사용할 수 있다 |
| 증빙 확인 표 · 지급 표 · 카드 사용 · 구매 요청 · 발행 요청 표 | **없음(확인함)** — 아래 §3 |

### 2.13 06 플랜 「선행 의존(A-6xx · UA-6xx)」 표 재확인 (05가 건드린 것 위주)

각 플랜 ⓪의 가드 grep이 pr162에서 어떻게 나오는지다. 「통과」 = 가드가 멈추지 않는다.

| ID | 플랜 | 06 플랜의 가정 · 가드 | pr162 결과 |
|---|---|---|---|
| UA-601 | 06-01 | `grep -c "^### 7-1[57]\." docs/design/SYSTEM.md` 2 이상 | 통과 — 2(main · pr162 동일): `docs/design/SYSTEM.md:1160` 7-15 폼 · `:1223` 7-17 확인 모달 |
| UA-609 | 06-01 · 06-13 | `StatusTag`에 `text` 변형 | 통과 — `ui/status-tag/StatusTag.tsx:10` `StatusTagVariant = "tag" / "text"`, `quote-table.tsx:2053` 사용 중 |
| A-612 | 06-02 | `grep -rn "purchase_request" domain/ repositories/` 0건이어야 정상 | 통과 — 0건(`db/schema/document-counters.ts:6` 주석만) |
| A-607(번호) | 06-02 | 프로젝트 단위 카운터 경로 · 팀 비용 번호 규칙 | 있음(§2.1) — `expense`(period = 프로젝트 번호) · `expense_team`(연도). 단 일반화는 못 한다(§1-3) |
| UA-612 · UA-614 | 06-02 · 06-05 | 메뉴 라벨 · 새 키가 설정 화면에 자동 노출 | 새 메뉴 셋은 없음(확인함). 설정 화면은 레지스트리 기반이라 새 키가 자동으로 나오고, 05가 `unitLabel`(숫자 칸 옆 정적 단위 글자 — `registry.ts:57` · `settings-form-client.tsx`)을 더했다 |
| A-606 | 06-03 · 06-14 · 06-22 · 06-23 | 결재 조회 · 승인 함수 · `app/(app)/approvals/[id]/page.tsx` · `teamAtDate` | 조회 `getApprovalView` `domain/approvals/index.ts:963` · 승인 `approveDocument` :640 있음. `approvals/[id]/page.tsx`는 없음(§1-13). `teamAtDate` `domain/org/index.ts:193` 있음 |
| UA-607 | 06-03 | 자기 승인이 `approved`와 같은 「통과」로 읽힌다 | 맞다 — 자기 승인은 별도 인스턴스 상태가 아니다: 인스턴스 `approved` + 단계 기록 `selfApproved: true`(`domain/approvals/index.ts:656-697`). `expenseStatusWord`는 인스턴스 상태만 봐 `승인`을 돌려주고 `본인 승인`은 단계 플래그(`leaveStatusWord("self_approved")`)에서 온다 |
| A-607(지출결의) | 06-03 · 04 · 07 · 10 · 13 | `submitExpense` · 칸(승인액 · 증빙 종류 · 지급 방식 · 지급 예정일 · `version` · 견적 줄 연결) · PM 읽기 | 있음(§2.8): `supplyAmountKrw`(+세금 스냅숏) · `evidenceType` :30 · `paymentMethod` :31 · `scheduledPaymentDate` :38 · `version` :52 · `quoteLineId` · PM = `projects.pmUserId`(`loadProjectFacts` :470). 상태 칸은 없다(인스턴스 파생). 06-03 `[[]id]/page.tsx` · `version` 가드와 06-04 `grep -rln "pm\|manager" domain/expenses/`(`index.ts` · `pick.ts`)는 통과 |
| UA-617 · UA-618 | 06-03 · 04 · 20 | 지급 예정일 · 지급 방식 칸 | 있음 `db/schema/expenses.ts:38` · `:31` |
| UA-605 | 06-15 · 06-20 | `grep -c "ListEmpty" 'app/(app)/expenses/page.tsx'` 1 이상 + 목록 코드 없음 | 파일이 pr162에서 **삭제**돼 가드 대상이 없다(목록은 `expenses/(list)/page.tsx` — §1-12). 06-15 ⓪의 `actions.registry.ts` 확인은 이미 있으므로 새로 만들지 않는다 |
| M-9 · UA-605~UA-610 | 06-15:126 · 06-17:156 · 06-19:132 · 06-20:124 | 실행 착수 게이트: `git ls-files .planning/phases/05-expense-approval-leave/05-UI-SPEC.md` 비면 멈춤 + 06-UI-SPEC 「Phase 4·5 의존 가정(UI)」 UA-605~UA-610과 대조표를 SUMMARY에 | `05-UI-SPEC.md`(954줄)는 **pr162에만** 있다 — main의 05 폴더는 `05-CONTEXT.md` · `05-DISCUSSION-LOG.md`뿐이다(`05-RESEARCH.md` · `05-NN-PLAN/SUMMARY`도 pr162만). #162가 main에 들어온 뒤에야 가드가 통과한다. 대조에서 어긋나는 실제값: 목록 필터는 `?status=` `진행 중`(기본) · `승인` · `전체`(05-UI-SPEC :74 · :566 — 06의 `view=pay`와 다름, §1-12) · 증빙 금액 칸 없음(§1-6) · 제출 뒤 증빙 규칙(§1-25) · 정산 기안 = `projects/[id]/settlement` 문서 + `settlement-button.tsx`(§1-13) |
| A-608 | 06-03 · 06 · 10 · 11 · 16 · 17 · 25 | 파일 표 · 증빙 금액 · 증빙일 · PM 편집 함수 · 업로드 의도 · 첨부 컴포넌트 | 파일 표 · 업로드 · 완료 통보 · 첨부 컴포넌트 있음(§2.3). **증빙 금액 · 증빙일 · PM 편집 함수는 없음**(§1-6) — 06-06 가드 `grep -rn "evidence" domain/expenses/`는 무관한 이름(`evidenceType` · `evidenceCount`)에 걸려 통과하므로 찾는 함수가 실제로 있는지는 가드가 못 가린다 |
| A-608-T | 06-11 · 16 · 24 · 25 | 저장소 테스트 모드 | 있음(§1-23) |
| A-608-P | 06-25 | 새 문서가 저장 전에 올린 파일을 문서에 묶는 규약 | **없음** — 05의 증빙 올리기는 소유 문서 id가 필요하다(`requestEvidenceUpload(viewer, { ownerKind, ownerId, … })` — `requestSchema`가 `ownerId: z.string().uuid()`를 요구하고(`domain/evidence/index.ts:184`) 주인 행이 없으면 `ExpenseNotFoundError`(:202). `EvidenceAttachments`는 `expenseId`에 묶인 액션을 주입). 새 지출결의는 「문서는 첫 저장(임시 저장 · 증빙 올리기)에서 만들어지고 주소가 `/expenses/[id]`로 바뀐다」(`app/(app)/expenses/new/page.tsx` 머리 주석). 저장 전 첨부 개념이 없으므로 06-25가 ⒜/⒝를 스스로 정해야 한다 |
| UA-606 | 06-11 · 16 · 17 · 25 | 첨부 컴포넌트가 업로드 · 삭제 동작을 prop으로 받고, prop 없이 넘기면 읽기 | 있음 `ui/attachments/Attachments.tsx` — `AttachmentsProps`: `mode: "edit" / "read"` · **필수** `actions: AttachmentActions { request, complete, remove, viewUrl }` · `files` · `maxMb` · `uploadFailedText` · 선택 `onUploadingChange` · `onChanged` · `openSignal` · `pickerId` · `canAdd` · `deletableIds` · `voidable` · `lockedText`. 읽기 모드도 `actions`(`viewUrl`)를 받아야 하므로 06-16의 「prop 없이 넘기면 읽기」는 맞지 않는다. 래퍼 선례 `app/(app)/expenses/[id]/evidence-attachments.tsx`의 `EvidenceAttachments`(머리 주석 「06이 같은 컴포넌트에 다른 액션을 묶는다」) |
| UA-602 | 06-04 · 05 · 09 · 10 · 11 · 14 · 15 · 17 · 18 · 21 | `ui/confirm-dialog/ConfirmDialog.tsx` | 있음. 05가 `.tsx` +10줄 · `.module.css` +8줄을 고쳤다(06-17이 같은 두 파일에 슬롯을 더한다 — 합치기 주의) |
| UA-603 | 06-05 · 14 · 15 · 21 | `ui/pagination/Pagination.tsx` | 있음 |
| UA-604 | 06-15 · 06-17 | `ui/table` 편집 표 키 규약 · 선택 열 없음(`selectable` 0건이어야) | 통과 — `selectable` 0건. 05가 `Table.tsx` +11 · `types.ts` +2 · `use-grid-keyboard.ts` +20(`onOpenRow` · `headerHidden`) |
| UA-608 | 06-13 | 견적 줄 표 행 행동 「지출결의 올리기」 | 있음 `quote-table.tsx:1020` · `:1088` · `:1205` · `:2097` |
| UA-610 · A-609 | 06-19 | 정산 결재 기안 함수 · 「정산 결재 올리기」 버튼 | §1-13 — 함수는 `domain/settlements/index.ts` `submitSettlement`, 버튼은 `settlement-button.tsx:24` |
| A-601 | 06-09 · 06-19 | 완료 상태값 `settled` | §1-15 — 다섯 값, `completed` |
| A-602 · A-603 · A-604 · UA-613 · UA-616 | 06-07 · 13 · 18 · 19 · 20 | main(Phase 4)의 줄 상태 · 줄 종류 · 매출 발행 · 계좌 마스킹 · 원장 저장 | 가드 통과: `lineStatus` `edit-scope.ts:23` · `linkedDocumentReason` :135 · `lines.ts:104,:327` · `out_of_quote` `db/schema/quote-lines.ts:31,:49` · `issuedEntries` `domain/revenue/index.ts:133,:145` · `saveProjectLedger` `domain/projects/ledger.ts:122` · `app/(app)/admin/vendors/account-number.tsx` · `vendor.account_number_unmasked` `info-items.ts:21` |
| A-605 | 06-18 | `revenue.issued_amount` 정보 항목(「main은 `staffDefault: false`」) | 항목은 있으나 값이 다르다 — `staffDefault: true`(`domain/permissions/info-items.ts:53`, main도 같다). 06-18은 값과 무관하게 멈추지 않으니 설명 문구만 고치면 된다 |
| UA-611 · O-15 | 06-23 | 홈 「내 차례」 공급 경로 | 있음 — §1-17 |

## 3. 없음(확인함) — 실행한 grep

모두 `git grep -n -E '<패턴>' refs/remotes/pr162 -- <경로>`(`origin/main` 표시가 있으면 main). 결과 줄 수:

| 찾은 것 | 패턴 · 경로 | 결과 |
|---|---|---|
| 06-02의 새 설정 키 | `evidence\.required\|EVIDENCE_REQUIRED\|evidence\.prepaid_due_days\|purchase\.online_vendor_name\|PURCHASE_ONLINE_VENDOR_NAME` · `domain app db repositories ui lib` | 0 |
| 06-02의 메뉴 키 | `expenses\.payments\|cards\.purchases\|cards\.proxy` · 같은 경로 | 0 |
| 선결제 | `prepaid\|선결제` · 같은 경로 | 1 — 주석 `domain/evidence/upload-checks.ts:2` 「06-11이 선결제 규칙을 …」 |
| 06의 새 표 이름 | `expense_payments\|corp_card_usage\|expense_evidence_review\|purchase_request\|revenue_issue_request\|payment_methods` · 같은 경로 | 1 — 주석 `db/schema/document-counters.ts:6` 「purchase_request」 |
| 06이 만들 함수 이름 | `loadTaxRates\|TaxRates\|taxRatesReader\|decidePayable\|lockQuoteLines\|findLineLinks\|deriveQuoteLineStatus\|bumpExpenseVersion\|lockExpenseRow` · 같은 경로 | 0 |
| 06 신규 디렉터리 · 파일 | `git ls-tree -r --name-only` 이름 검사: `payments · corp-card · purchase · evidence-review · evidence-attach · pre-settle · revenue-issue · line-status · quote-line-links · expense-payments · line-door` | 05 이전부터 있던 Phase 3 법인카드 관리 파일(`db/schema/corp-cards.ts` · `domain/corp-cards/index.ts` · `repositories/corp-cards.ts` · `app/(app)/admin/corp-cards/*`)과 `app/(app)/expenses/[id]/evidence-attachments.tsx` · `docs/design/checks/2026-10-04-05-15-quote-line-doors.md`뿐 |
| 종결 · 취소 칸 | `closed_at\|cancelled_at\|canceled\|closedAt\|cancelledAt\|종결` · `domain/expenses db/schema/expenses.ts repositories/expenses.ts "app/(app)/expenses"` | 0 |
| 증빙 금액 · 편집 함수 | `evidence_amount\|증빙 금액\|updateEvidence\|confirmEvidence\|evidenceAmount` · `domain app db repositories ui` | 0(관련 없는 `evidence_date` 기준일 값만 `domain/code-tables/tax-rule.ts` · `domain/money/tax.ts` · `domain/settings/keys.ts` · `domain/revenue/index.ts`에) |
| 증빙 메뉴(main) | `evidence_attach\|evidence_void` · `origin/main` · `domain app db lib` | 0 |
| `resolveLineDoor`(코드) | `resolveLineDoor` · `domain app db repositories ui lib` | pr162 1(주석 `domain/expenses/line-door.ts:3`) · main 0 |
| `domain/quotes/line-door.ts` | `git ls-tree -r --name-only <ref>` 이름 `line-door` | main 0개 · pr162 `domain/expenses/line-door.ts`와 점검표 문서뿐 |
| 행 선택 | `selectable\|rowSelection\|selectedRows\|type="checkbox"` · `ui/table` | 1 — `Table.module.css:77`(CSS 선택자) |
| 맨 `신청` 낱말 | `신청` · `ui/status-tag/status-map.ts` | main · pr162 모두 `신청됨`(:52 / :56)만 |
| 반려 종결 todo(main) | `git ls-tree -r --name-only origin/main \| grep rejected-expense-close-path` | 0 |
| 종류 키 리터럴 금지 ESLint · 훅 규칙 | ① `approvals\|document.?kind` · `eslint.config.mjs` `eslint/` ② `kind.?literal\|종류 키\|리터럴` · `.claude/hooks .claude/rules .claude/settings.json scripts` | ① 0 ② 1 — 관련 없는 `scripts/deploy.sh:757` 주석. 금지는 통합 테스트 하나(`test/integration/approvals-extensions.test.ts:285-331`)뿐이다(`eslint/` · `eslint.config.mjs`는 05가 바꾸지 않았다: `git diff --name-status origin/main...pr162 -- eslint eslint.config.mjs` 0줄) |
| 06이 가정한 가칭 경로 | `app/(app)/approvals/[id]` · `domain/approvals/settlement.ts` · `domain/expenses/evidence.ts` · `domain/evidence-attachments` 트리 검사 | 모두 없음 |

## 4. 05가 짓지 않은 것 — 06 플랜이 가정했지만 소유자가 없는 것

1. **증빙 금액 · 증빙일 칸과 PM 증빙 편집 함수**(§1-6) — 06-03 · 04 · 06 · 11 · 15 · 17이 의존, 짓는 플랜 없음.
2. **`expenses.version`을 올리는 증빙 훅**(§1-7) — 06-11 훅이 05 증빙 함수 세 곳에 들어가야 한다.
3. **제출 게이트 ⑧의 선결제 예외**(§1-19) — `domain/expenses/gate.ts` 수정이 어느 플랜 파일 목록에도 없다.
4. **증빙 필수 설정 `evidence.required`** — 05는 ⑧을 설정과 무관하게 무조건 막는다. 설정 끔의 효과가 지급 게이트에만 미치는지 제출 게이트까지인지 06-02/04가 못 박아야 한다(06-CONTEXT D-603은 「이 게이트」 = 지급 게이트).
5. **반려 · 회수 종결(취소) 경로**(§1-16).
6. **SP-2 낱말 12개**(§2.11)와 증빙 확인 · 지급 완료 상태 파생.
7. **`ui/table` 행 선택**(§2.6) · **`ListScreen` 버튼형 1차**(§1-12).
8. **견적 줄 잠금 · 연결 조회**: `lockQuoteLines` · `findLineLinks` · `quote-line-links.ts`(06-07이 만든다 — 06-13 · 06-08이 기대는 순서 §1-20).
9. **지급 · 확인 · 카드 · 구매 · 발행 표 일체**(§3).
10. **`bumpExpenseVersion` · `loadTaxRates` · `decidePayable`**(06-03이 만든다 — 확인함).
11. **「경영관리」 시드 계급** — 없다. 06의 권한 메뉴가 누구에게 열리는지는 관리자 설정에 의존(05도 같은 방식).
12. **증빙 객체 청소(F8)** — 05-12가 `docs/EVIDENCE-STORAGE.md` §6에 범위(지운 증빙 · 거부된 완료 통보 뒤 남은 `evidence/` 객체 · 보존 표식 해제)만 적고 06으로 넘겼다. 06-11 Task 3 ③은 정의 · 문서 위치가 다르다(§1-24).

## 5. 위험 · 충돌 (구현 때 부딪칠 곳)

1. **`readBy` 만료 강제**(`test/unit/settings/registry-coverage.test.ts:81-118`): `readBy`가 있는 키가 settings 밖에서 읽히면 실패 — 06-02가 `readBy: { phase: "6" }`로 만든 키를 같은 페이즈의 읽는 플랜이 쓰는 순간 그 플랜이 `readBy`를 지워야 한다(06-02 · 04 · 10 · 11 · 08 · 19의 `keys.ts` 겹침과 같이 정리). `ROADMAP.md`에 `### Phase 6:`가 있어야 한다.
2. **`OwnerRule`의 리터럴 메뉴 타입 · expense 전용 `OwnerState`**(§2.3): 06-16 · 25의 새 주인 종류는 `status`/`instance`가 없는 문서(차수 · 리저브 · 카드 전표)라 `inReview`/`approved`/`drafterRemoves`의 뜻을 새로 정해야 한다.
3. **`domain/evidence`의 import 순환 위험**(§2.3) — `signals.ts` 잎 파일 선례 · `test/unit/import-cycles.test.ts`.
4. **종류 키 리터럴 금지 테스트**(§1-13) — 06-22의 정산 분기가 `domain/approvals/*.ts`에 `"settlement"`을 쓰면 실패.
5. **`ListScreen.primaryAction` 링크 전용 · `?status=` 파라미터**(§1-12).
6. **`PickDialog` 재사용**(§1-18) · **`Attachments.onChanged`의 인자 없음**(§1-7).
7. **`NextTurnEntry.tag` 2값**(§1-17) · `ui/next-turn/build-next-turn-view.ts`의 `key?` · `measureText?`.
8. **`STATUS_KIND` 닫힌 표**(§1-11) · `StatusWord` 타입이 모르는 낱말은 컴파일 오류 — 06-01이 먼저 12개를 넣지 않으면 06-04/06/07/08/13이 컴파일 실패.
9. **번호 서식 모양 불일치**(§1-3) — 06-02의 4필드 서식을 5필드 `loadDocumentNumberFormat`에 맞추면 `DOCUMENT_NUMBER_FORMAT_DEFS`에 `yearDigits` 키를 억지로 만들게 된다. 06-02 자신이 「`yearDigits`를 선택으로」 대안을 적었다.
10. **순번 시작값 하향 가드의 범위**: `assertSeqStartNotLowered`(`domain/document-numbering/index.ts:180`)와 `setSimpleSettingValue`(:204)는 `DOCUMENT_NUMBER_FORMAT_DEFS`에 등록된 카운터의 `seqStart` 키만 지킨다(`seqStartEntryFor` :172가 DEFS만 본다 · 올해 period 카운터 행을 잠그고 비교). 그래서 05의 `expense`(period = 프로젝트 번호) 키 `document_number.expense.seq_start`에는 이 가드가 걸리지 않고, DEFS 밖에 둔 `purchase_request` 키도 마찬가지다 — 06-02가 이 가드를 요구하는지 정해야 한다. 또 `allocateDocumentNumber`는 `seqStart`를 카운터 잠금 뒤 같은 tx로 다시 읽지만 `allocateExpenseNumber`는 트랜잭션 전에 읽은 `format.seqStart`를 그대로 쓴다(`submitExpense`:847-849).
11. **마이그레이션 두 갈래**(§2.9): 06이 `files_owner_kind_check`를 넓힐 때 05-13이 재생성한 마이그레이션 **뒤**여야 한다. 05-13 전에 06 마이그레이션을 만들면 번호가 겹쳐 지워진다(05-13-PLAN:51 「넓은 탐지로 고르지 말라」).
12. **`submitExpense` 순서**(§1-20) — `deps.afterLock`은 프로젝트 → 지출결의 두 잠금 직후에 멈춘다(경합 테스트). `lockQuoteLines`를 끼우면 이 테스트의 의미가 바뀐다.
13. **설정 읽기는 트랜잭션 전**: 06-08:164 `getSettingValue(PURCHASE_ONLINE_VENDOR_NAME)` · `evidenceRequired` 모두 `submitExpense`의 「트랜잭션 전 사전 읽기」 패턴(`loadSubmitPre` :1056)에 얹어야 한다 — 전역 풀 읽기를 `runCreate` 안에서 하면 풀 소진 교착.
14. **D-101 날짜**(§1-5): 증빙일 칸이 생기면 05 스냅숏 `taxBasisDate`(제출 시점의 작성일 대체)와 06-03 지급 시점 재계산 값이 달라질 수 있다 — `taxDriftText`(`domain/expenses/tax.ts:237`)가 이미 「저장 vs 지금 재계산」 표시를 다룬다.
15. **계층 경계 · 사용자 정의 ESLint**(`eslint.config.mjs`의 `boundaries/element-types`, `eslint/` — 05는 안 건드렸다): `domain`은 `domain · repositories · lib`만 import한다 → `ui`의 `StatusWord`를 반환 타입으로 못 쓴다. 05 선례: domain은 `lineStatus: string` 같은 키를 주고 `app/(app)/**/status-display.ts`(`lineStatusWord` · `expenseStatusWord`)가 `StatusWord`로 옮긴다 — 06-13의 `domain/quotes/line-status.ts`(`deriveQuoteLineStatus`)와 06-01 `statusDisplay`도 이 선을 지킬 것. `ui`는 `ui · lib`만 import한다 → `ui/table`의 `selectable` · `ui/attachments`는 domain 함수를 prop으로 받는다(05의 `Attachments`가 그렇다). `app/**`의 `<table>` · `<dialog>` 직접 사용 금지(`eslint/restrictions.mjs` → `ui/table` · `ui/confirm-dialog` · `ui/side-panel`). 그 밖에 `plant8/money-boundary`(`Money` 타입 산술은 `domain/money` 안에서만) · `plant8/no-row-type-escape`(domain export 함수의 반환 타입에 `*Row` 금지 — `lockExpenseForUpdate`가 돌려주는 `ExpenseRow`를 domain export 반환에 그대로 싣지 말고 `*Dto`로) · `plant8/repository-viewer-param`(repositories export 첫 인자 `viewer`) · `plant8/require-action-client`(`'use server'` export는 `authedActionClient` / `publicActionClient`로 감쌈).
16. **줄 상한이 걸린 문서**(`test/unit/docs-limits.test.ts`, 05-12가 37줄 추가): `docs/OPERATIONS.md` 300/300 · `docs/ARCHITECTURE.md` 295/300(05는 §4-6 끝 줄에 `expense` 카운터 한 조각만 덧붙였다 — 줄 수 불변. 05-13이 §4-8 끝 줄 조각을 같은 방식으로 더할 예정) · `docs/EVIDENCE-STORAGE.md` 86/150(`"Phase 6 F8"` 토큰 필수) · `docs/EXPENSES.md` 16/150(05-13이 「계약」 · 「잠금 순서 예외」 절을 채운다) · `docs/RESTORE.md` 143/150 · `docs/CERT-PURGE.md` 76/150. 06 플랜이 운영 · 구조 문서에 절을 더하면(06-11 Task 3 ③ · 06-03의 규약 인용 등) 상한 안인지 먼저 재야 하고, OPERATIONS는 새 문서로 나눈다(CERT-PURGE → EVIDENCE-STORAGE 선례, 그리고 OPERATIONS가 그 문서를 가리켜야 한다는 테스트가 있다).

## 6. 플랜별 05 겹침 표

「겹침」 = 플랜 frontmatter `files_modified`에 있는 파일 중 pr162가 main 대비 **새로 만든(A) · 고친(M) · 지운(D)** 것. 「§1」 = 위 §1 표 번호.

| 플랜 | 05가 만들었거나(A) 고쳤거나(M) 지운(D) `files_modified` | 겹침 / 전체 | 관련 §1 |
|---|---|---|---|
| 06-01 | **M** `docs/design/DECISIONS.md` · `docs/design/SYSTEM.md` · `.planning/ROADMAP.md` · `.planning/REQUIREMENTS.md` | 4 / 6 | 11 |
| 06-02 | **M** `domain/settings/keys.ts` · `domain/permissions/menus.ts` · `domain/money/index.ts` · `domain/document-numbering/index.ts` | 4 / 11 | 1, 2, 3, 4, 22 |
| 06-03 | **A** `app/(app)/expenses/[id]/page.tsx`<br>**M** `db/schema/index.ts` · `db/migrations/meta/_journal.json` · `domain/rules/register.ts` · `test/integration/leak-scan.test.ts` | 5 / 17 | 5, 6, 7, 8, 14, 19, 21 |
| 06-04 | **A** `app/(app)/expenses/[id]/page.tsx`<br>**M** `domain/rules/register.ts` · `domain/settings/keys.ts` | 3 / 14 | 6, 8, 19, 21 |
| 06-05 | **M** `db/schema/index.ts` · `db/migrations/meta/_journal.json` · `test/integration/leak-scan.test.ts` | 3 / 14 | 14 |
| 06-06 | **A** `app/(app)/expenses/[id]/page.tsx`<br>**M** `db/migrations/meta/_journal.json` | 2 / 14 | 6, 7, 8, 11, 14, 21 |
| 06-07 | **M** `domain/quotes/lines.ts` · `domain/rules/register.ts` · `app/(app)/projects/[id]/page.tsx` | 3 / 17 | 8, 18, 20 |
| 06-08 | **M** `db/schema/index.ts` · `db/migrations/meta/_journal.json` · `domain/rules/register.ts` · `domain/settings/keys.ts` · `test/integration/leak-scan.test.ts` | 5 / 14 | 2, 3, 11, 14, 20 |
| 06-09 | 없음 | 0 / 13 | 15 |
| 06-10 | **A** `db/schema/expenses.ts` · `db/schema/files.ts` · `domain/expenses/index.ts`<br>**M** `db/migrations/meta/_journal.json` · `domain/settings/keys.ts` | 5 / 15 | 6, 8, 14, 19, 21 |
| 06-11 | **A** `repositories/files.ts` · `ui/attachments/Attachments.tsx`<br>**M** `domain/settings/keys.ts` · `docs/OPERATIONS.md` | 4 / 15 | 2, 7, 8, 9, 21 |
| 06-12 | **M** `db/migrations/meta/_journal.json` | 1 / 14 | 14 |
| 06-13 | **A** `domain/expenses/index.ts`<br>**M** `domain/quotes/lines.ts` · `domain/rules/register.ts` · `app/(app)/projects/[id]/quote-table.tsx` | 4 / 14 | 4, 8, 11, 20 |
| 06-14 | 없음 | 0 / 14 | 3 |
| 06-15 | **A** `app/(app)/expenses/actions.ts` · `app/(app)/expenses/actions.registry.ts`<br>**M** `ui/table/Table.tsx` · `ui/table/types.ts` · `test/integration/leak-scan.test.ts`<br>**D** `app/(app)/expenses/page.tsx` | 6 / 14 | 6, 7, 8, 12, 21 |
| 06-16 | **A** `db/schema/files.ts`<br>**M** `db/migrations/meta/_journal.json` · `app/(app)/projects/actions.ts` · `app/(app)/projects/actions.registry.ts` · `test/e2e/quote-revisions.spec.ts` | 5 / 15 | 9, 10, 14 |
| 06-17 | **A** `app/(app)/expenses/actions.ts` · `app/(app)/expenses/actions.registry.ts`<br>**M** `ui/table/Table.tsx` · `ui/table/use-grid-keyboard.ts` · `ui/confirm-dialog/ConfirmDialog.tsx` · `ui/confirm-dialog/ConfirmDialog.module.css` | 6 / 14 | 8, 12, 21 |
| 06-18 | **M** `db/migrations/meta/_journal.json` · `app/(app)/projects/actions.ts` · `app/(app)/projects/[id]/page.tsx` · `app/(app)/projects/[id]/quote-table.tsx` · `test/integration/leak-scan.test.ts` | 5 / 14 | 14 |
| 06-19 | **M** `domain/rules/register.ts` · `domain/settings/keys.ts` · `app/(app)/projects/[id]/page.tsx` · `app/(app)/projects/[id]/quote-table.tsx` · `test/integration/leak-scan.test.ts` | 5 / 13 | 13 |
| 06-20 | **A** `app/(app)/expenses/[id]/page.tsx`<br>**D** `app/(app)/expenses/page.tsx` | 2 / 11 | 11, 12, 21 |
| 06-21 | **M** `app/(app)/projects/actions.ts` | 1 / 11 | — |
| 06-22 | **M** `domain/approvals/index.ts` · `app/(app)/projects/[id]/page.tsx` · `app/(app)/projects/[id]/quote-table.tsx` · `app/(app)/projects/[id]/project-detail.module.css` | 4 / 9 | 11, 13 |
| 06-23 | **A** `domain/next-turn/index.ts` · `test/integration/next-turn.test.ts`<br>**M** `ui/next-turn/build-next-turn-view.ts` · `ui/next-turn/NextTurn.tsx` · `app/(app)/page.tsx` · `test/unit/ui/next-turn.test.ts` | 6 / 9 | 17 |
| 06-24 | **M** `test/integration/leak-scan.test.ts` · `db/migrations/meta/_journal.json` | 2 / 3 | 14 |
| 06-25 | **A** `db/schema/files.ts` · `repositories/files.ts`<br>**M** `db/migrations/meta/_journal.json` | 3 / 15 | 9, 10, 14 |

- `db/migrations/meta/_journal.json`(M, +28줄 = 항목 4개)은 05가 더했다 — 이 파일을 `files_modified`로 가진 플랜(06-03 · 05 · 06 · 08 · 10 · 12 · 16 · 18 · 24 · 25)은 05-13 재생성 병합 전에 마이그레이션을 만들면 번호 · journal이 충돌한다. `db/schema/index.ts`(M, +3줄: `expenses` · `files` · `settlement_approvals` export)도 06-03 · 05 · 08이 같은 줄 끝을 건드린다.
- `test/integration/leak-scan.test.ts`(M, +4줄)는 05가 `import "@/domain/expenses"` · `import "@/domain/evidence"` · `import "@/app/(app)/expenses/actions.registry"` · `import "@/domain/settlements"` 네 줄을 더했다 — 이 파일을 가진 플랜(06-03 · 05 · 08 · 15 · 18 · 19 · 24)이 새 도메인 · 액션 레지스트리를 더할 때 같은 import 블록을 건드린다(`[id]/actions.registry.ts`는 실제로 없다).
- `domain/settings/keys.ts`(M, **+530줄**: 지출결의 · 정산 결재선 키 각 17개, 지출결의 · 팀 비용 번호 서식 키 8개, `EVIDENCE_MAX_SIZE_MB`, `QUOTE_LINE_MAX_PER_REVISION_DEFAULT`)를 가진 플랜(06-02 · 04 · 08 · 10 · 11 · 19)은 같은 `SETTING_DEFS.push` 블록 끝에 줄이 몰린다. `domain/rules/register.ts`(M, +12줄: `expense.submit` 게이트 규칙 `registerGateRule<unknown, ExpenseSubmitContext>` 하나)를 가진 플랜은 06-03 · 04 · 07 · 08 · 13 · 19.
- 06-01의 `docs/design/DECISIONS.md`(+82줄: B1 · B2 · B4 · B5 · 무효 증빙 항목) · `docs/design/SYSTEM.md`(+46/−13) · `.planning/ROADMAP.md`(+70) · `.planning/REQUIREMENTS.md`(30줄 변경)는 05가 이미 고쳤다 — 06-01의 SP-1~SP-7 · 문구 정렬은 이 위에 덧붙여야 한다. `test/e2e/quote-revisions.spec.ts`(24줄 변경)는 06-16 · `docs/OPERATIONS.md`(1줄)는 06-11 · `test/unit/ui/next-turn.test.ts`(+17)는 06-23과 겹친다.
- 표는 `files_modified`만 비교했다. 본문이 읽기만 하는 05 파일(예: 06-07의 `domain/expenses/index.ts`, 06-10의 `domain/expenses/gate.ts`)은 빠져 있으므로 §1 · §2를 같이 볼 것.

## 7. pr162 vs origin/main 변경 경로 (생성)

`git diff --name-status origin/main...refs/remotes/pr162 -- domain repositories db/schema app ui` — 총 137개(A 71 · M 65 · D 1). 스크립트로 생성했다(손으로 옮기지 않음). 표기: **A** 05가 만든 파일 · **M** 05가 main 대비 고친 파일 · **D** 05가 지운 파일. 이름 뒤 대괄호 = 그 파일을 `files_modified`로 가진 06 플랜.

### app/ — 72개 (A 42 · M 29 · D 1)

- `app/(app)/` — A: home-approval-actions.module.css, home-approval-actions.tsx · M: document-kinds.ts, layout.tsx, page.tsx [06-23]
- `app/(app)/admin/code-tables/` — M: code-tables.module.css
- `app/(app)/admin/settings/` — M: page.tsx, settings-form-client.tsx, settings.module.css
- `app/(app)/approvals/` — A: evidence-url.ts, refresh-then-focus.ts, row-actions.ts, sheet-material.ts · M: actions.registry.ts, actions.ts, approval-sheet.module.css, approval-sheet.tsx, approve-toast.ts, decision-dialogs.tsx, inbox-table.module.css, inbox-table.tsx, list-columns.ts, page.tsx
- `app/(app)/expenses/` — A: actions.registry.ts [06-15,06-17], actions.ts [06-15,06-17], deleted-toast.tsx, expenses-table.tsx, expenses.module.css, list-columns.ts, status-display.ts, status-filter.tsx, team-kind-options.ts · D: page.tsx [06-15,06-20]
- `app/(app)/expenses/(list)/` — A: error.tsx, layout.tsx, loading.tsx, page.tsx
- `app/(app)/expenses/[id]/` — A: delete-draft-button.tsx, error.tsx, evidence-attachments.tsx, expense-document.tsx, expense-form.tsx, expense.module.css, layout.tsx, loading.tsx, page.tsx [06-03,06-04,06-06,06-20], pick-line.tsx, pick-vendor.tsx, submit-block.ts, submitted-undo-toast.tsx, tax-parts.tsx
- `app/(app)/expenses/new/` — A: page.tsx
- `app/(app)/leave/` — M: status-display.ts
- `app/(app)/leave/[id]/` — M: document-actions.module.css, document-actions.tsx, page.tsx
- `app/(app)/projects/` — M: actions.registry.ts [06-16], actions.ts [06-16,06-18,06-21], status-display.ts
- `app/(app)/projects/[id]/` — A: settlement-button.tsx · M: page.tsx [06-07,06-18,06-19,06-22], previous-revision.tsx, project-detail.module.css [06-22], quote-table.tsx [06-13,06-18,06-19,06-22], status-change.tsx
- `app/(app)/projects/[id]/settlement/` — A: error.tsx, layout.tsx, loading.tsx, page.tsx, settlement-actions.tsx, settlement.module.css
- `app/api/storage-local/[...key]/` — A: route.ts

### db/schema/ — 5개 (A 3 · M 2 · D 0)

- `db/schema/` — A: expenses.ts [06-10], files.ts [06-10,06-16,06-25], settlement-approvals.ts · M: approvals.ts, index.ts [06-03,06-05,06-08]

### domain/ — 35개 (A 17 · M 18 · D 0)

- `domain/approvals/` — M: conflict-message.ts, dto.ts, index.ts [06-22], kinds.ts, route.ts
- `domain/code-tables/` — M: index.ts
- `domain/document-numbering/` — M: index.ts [06-02]
- `domain/evidence/` — A: dto.ts, index.ts, signals.ts, upload-checks.ts
- `domain/expenses/` — A: access.ts, detail.ts, dto.ts, gate.ts, index.ts [06-10,06-13], line-door.ts, list.ts, pick.ts, tax.ts
- `domain/leave/` — M: index.ts
- `domain/money/` — M: index.ts [06-02]
- `domain/next-turn/` — A: index.ts [06-23]
- `domain/permissions/` — M: info-items.ts, menus.ts [06-02]
- `domain/projects/` — M: status-transitions.ts, status.ts
- `domain/quotes/` — M: lines.ts [06-07,06-13]
- `domain/rules/` — M: register.ts [06-03,06-04,06-07,06-08,06-13,06-19]
- `domain/seed/` — A: expenses.ts · M: index.ts
- `domain/settings/` — M: keys.ts [06-02,06-04,06-08,06-10,06-11,06-19], registry.ts
- `domain/settlements/` — A: dto.ts, index.ts

### repositories/ — 6개 (A 4 · M 2 · D 0)

- `repositories/` — A: expenses.ts, files.ts [06-11,06-25], settlement-approvals.ts, upload-intents.ts · M: approvals.ts, vendors.ts

### ui/ — 19개 (A 5 · M 14 · D 0)

- `ui/attachments/` — A: Attachments.module.css, Attachments.tsx [06-11], prepare-file.ts
- `ui/confirm-dialog/` — M: ConfirmDialog.module.css [06-17], ConfirmDialog.tsx [06-17]
- `ui/next-turn/` — M: NextTurn.tsx [06-23], build-next-turn-view.ts [06-23]
- `ui/pick-dialog/` — A: PickDialog.module.css, PickDialog.tsx
- `ui/row-actions/` — M: RowActions.module.css, RowActions.tsx
- `ui/shell/` — M: BottomTabs.tsx, Shell.tsx
- `ui/status-tag/` — M: status-map.ts
- `ui/table/` — M: Table.tsx [06-15,06-17], types.ts [06-15], use-grid-keyboard.ts [06-17]
- `ui/toast/` — M: Toast.module.css, Toast.tsx
