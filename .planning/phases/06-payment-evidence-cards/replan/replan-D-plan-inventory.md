# 06 재계획 D — Phase 6 플랜 25개 인벤토리

> 읽기 전용 조사(2026-10-05). 리포 `ERP_PLANT8_260917` 브랜치 `claude/06-ui-spec-revision-oju6s5`(HEAD `90fcd1c8`, `origin/main` = `341537c1` 포함).
> 05 변경 목록 = `git diff --name-only origin/main...refs/remotes/pr162` (PR #162 head `a972a5ac`, merge-base = 현재 `origin/main`) → **345 파일(추가 220 · 수정 124 · 삭제 1)**.
> 방법: `.planning/phases/06-payment-evidence-cards/06-NN-PLAN.md` 25개 프런트매터·본문 파싱 + `git ls-files`(이 브랜치) · `git cat-file -e refs/remotes/pr162:<경로>`(05 실물; `git ls-tree`와 불일치 0건) 로 파일 존재 확인.
> 용어: `[A]`/`[M]`/`[D]` = 05가 그 파일을 추가/수정/삭제. 「이 브랜치에 없음」= `git ls-files`에 없음. 「risk 제안」은 CLAUDE.md §4의 `risk:` 정의(돈·권한·DB 잠금·마이그레이션)를 경로·키워드로 적용한 **내 추정**이다.
> 주의: 프런트매터 `files_modified` = 각 Task `<files>` 합집합(예외: 06-01의 `.planning/ROADMAP.md`·`REQUIREMENTS.md`는 프런트매터에만). 「이 플랜이 첫 등장」= 가장 이른 웨이브에서 그 경로를 올린 플랜(= 생성 플랜으로 추정).

## 0. 한눈에 (핵심 발견)

1. **웨이브 12단 · 사이클 0 · 같은 웨이브/뒤 웨이브 `depends_on` 0 · 같은 웨이브 안 같은 파일 0.** 24개 플랜이 전부 06-24로 모인다(06-24가 유일한 싱크). 웨이브 깊이는 **마이그레이션 직렬화**가 정한다(`db/migrations/meta/_journal.json`을 쓰는 플랜이 W2~W10에 웨이브당 1개).
2. **웨이브 순서만으로 유지되는 파일 충돌 쌍 5개**(depends_on 경로 없음): `_journal.json`(06-05↔06-06, 06-06↔06-08) · `domain/rules/register.ts`(06-04↔06-07·06-08) · `domain/settings/keys.ts`(06-04↔06-08) · `test/integration/leak-scan.test.ts`(06-15↔06-18·06-19) · `domain/payments/index.ts`(06-13↔06-20). 웨이브를 다시 짜면 명시적 `depends_on`이 필요하다.
3. **25개 모두 `risk:` 프런트매터 없음.** 그러나 11개 플랜(06-02·03·05·06·08·10·12·16·18·24·25)이 위험 경로(`db/schema/`·`db/migrations/`·`domain/permissions/`)를 직접 건드린다 — 현재 구조로는 이 11개 PR이 전부 사용자 머지 대상이다. `.claude/`·`.github/workflows/`·`infra/`·`domain/auth/`·`lib/crypto*`·`scripts/*.sh`는 25개 플랜 어디에도 없다.
4. **`db/schema/corp-cards.ts`(32-35행 XOR CHECK)를 만지는 플랜은 0개.** 공용 카드(소지자·팀 없는 카드)는 UI-SPEC rev 10의 사용자 결정 Q5(10/5 00:55)로만 존재하고 「06-05가 `공용` 갈래를 더한다」고 적혀 있으나 **06-05 플랜 본문엔 없다**(플랜은 2026-10-01 커밋 `7eb6c2ad` 이후 미수정, UI-SPEC rev 10은 10/4 16:28~16:55 UTC). → §4.
5. **05와 겹치는 `files_modified` 88건(고유 41파일: [A]10 · [M]30 · [D]1), 25개 중 23개 플랜**(겹침 0 = 06-09·06-14). **05가 삭제한 `app/(app)/expenses/page.tsx`를 06-15·06-20이 그대로 적는다.**
6. **이 브랜치에도 05에도 없는 항목 208건(고유 111경로 — 테스트 52 · 비테스트 59).** 대부분은 06이 새로 만드는 파일이지만 **05 실물과 어긋난 가칭 후보**가 있다(§7 #2~#8): `expense-form.tsx` 위치 · `domain/approvals/settlement.ts` · `app/(app)/approvals/[id]/page.tsx` · `domain/evidence-reviews/upload-checks.ts`·`domain/expenses/evidence.ts`·`domain/evidence-attachments/index.ts`(05의 `domain/evidence/*`와 중복·불명) · `[id]/actions.ts` 관례. 05-겹침 쪽에는 삭제된 `expenses/page.tsx`(#1)가 따로 있다.
7. **06-02·06-10은 05가 이미 한 일을 또 계획한다**: `sumKrw`·`diffKrw`(`domain/money/index.ts:208,212` — 05-03) · `evidence.max_size_mb` 키(`domain/settings/keys.ts:1110` — 05-04) · `files.sha256`+`files_sha256_idx`(05-04). `files.owner_kind`는 컬럼 + CHECK `IN ('expense')` 모양이라 06-16·06-25의 「⒜/⒝ 한 갈래」는 ⒜로 정해진다.
8. **크기**: 400줄 초과 13개(최대 06-17 487줄) · Task 6개 초과 0개(최대 4 = 06-17·06-20) · `files_modified` 15개 이상 6개(06-03·06-07 = 17). 토큰 추정 100k 초과 3개(06-17 115k · 06-07·06-09 110k).
9. **플랜은 UI-SPEC rev 9 기준이다**: `SidePanel`·옆 패널·`PanelForm`·Q2~Q7·`공용 카드`·`evidence_attach`·`voided_at`·「rev 10」을 본문에서 언급하는 플랜이 0개 — `/cards` 폼이 rev 10에서 페이지 폼 → 옆 패널로 바뀐 것 등이 전부 미반영.
10. **훅(`plant8-skill-gate.sh`)의 돈·결재 /cso 정규식은 Phase 6 신규 돈 모듈 대부분을 못 잡는다**: 잡는 것은 `domain/(money|corp-cards|reserves|revenue|approvals)/`·`repositories/(corp-cards|approvals|reserve-entries|revenue-entries).ts`뿐 → 06 플랜 중 해당은 06-02·03·16·18·19(가칭 경로)·22. `domain/payments/`·`corp-card-usages/`·`purchase-requests/`·`evidence-reviews/`·`issue-requests/`·`pre-settle-check/`·`settlements/`는 /cso가 강제되지 않는다(CLAUDE.md §4 판단 영역).

## 1. 플랜별 인벤토리 (25행)

열: 플랜 · 한 줄 목표 · 웨이브 · depends_on · requirements · autonomous · risk 태그(제안) · Task수 · 줄수 · files_modified수 · db/schema·db/migrations(표) · 돈·결재·권한·잠금 · 만드는 화면/라우트 · `files_modified` ∩ 05(정확한 경로) · 이 브랜치·05 어디에도 없는 항목(수·의심).

| 플랜 | 한 줄 목표 | W | depends_on | requirements | auto | risk 태그 (제안) | Task | 줄 | fm | db/schema · db/migrations (표) | 돈·결재·권한·잠금 | 화면/라우트 | fm ∩ 05 (정확한 경로) | 이 브랜치·05에 없는 항목 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **06-01** | SP-1~SP-7 디자인 결정 기록(DECISIONS 먼저 → SYSTEM 개정) + 상태 낱말 매핑 `app/(app)/status-display.ts` + ROADMAP·REQUIREMENTS 문구 정렬(D-607·R-9·EVID-01 추적표, 사용자 선택 체크포인트) | 1 | — | EXP-07, EXP-09 | **아니오**(체크포인트) | 없음 | 3 | 341 | 6 | 없음 | 없음(문서 + 상태 낱말→StatusTag 매핑). `.planning/ROADMAP.md`·`REQUIREMENTS.md`는 사용자가 고른 경로로만 수정(CLAUDE.md §2) | 없음(디자인 시스템 문서 · 매핑 파일) | `docs/design/DECISIONS.md`[M]; `docs/design/SYSTEM.md`[M]; `.planning/ROADMAP.md`[M]; `.planning/REQUIREMENTS.md`[M] | 2건 (이 플랜이 첫 등장 2 · 앞 플랜이 이미 올린 파일 0) |
| **06-02** | 공용 조각 — 설정 키 4(`evidence.required`·`evidence.max_size_mb`·`evidence.prepaid_due_days`·`purchase.online_vendor_name`) + 구매 요청 번호 서식 키 4, 메뉴 키 3(`expenses.payments`·`cards.purchases`·`cards.proxy`), `sumKrw`·`diffKrw`, `allocateScopedDocumentNumber`, `resolveLineDoor` | 1 | — | EVID-02, EXP-09, EXP-10, EXP-13, EXP-16 | 예 | 없음 (제안: permissions, money) | 3 | 346 | 11 | 없음 | 권한: 메뉴 키 3 → `domain/permissions/menus.ts`(위험 경로·사용자 머지) · 돈: `domain/money/index.ts`(훅 /cso 대상) · 문서번호 카운터(트랜잭션 밖 서식 읽기) | S20(관리자 설정·권한표에 키가 자동으로 나타남 — 화면 코드 없음) | `domain/settings/keys.ts`[M]; `domain/permissions/menus.ts`[M]; `domain/money/index.ts`[M]; `domain/document-numbering/index.ts`[M] | 4건 (이 플랜이 첫 등장 4 · 앞 플랜이 이미 올린 파일 0) |
| **06-03** | 단건 지급 완료 트레이서 — `expense_payments` 표 → 행 잠금 → 결재 게이트 `payment.approval-required` → 지급 총액(`applyTaxRule`) → Server Action → 문서 화면 행동 줄(P6). 페이즈 전체 tx 규약의 기준 | 2 | 06-01, 06-02 | EXP-06, EXP-09 | 예 | 없음 (제안: money, db-lock, migration, db-schema, permissions) | 2 | 431 | 17 | 신규 표 `expense_payments`(`db/schema/expense-payments.ts` + `db/schema/index.ts` export + 마이그레이션 1; 살아 있는 기록 1건 partial unique) | 전부: 돈(지급 총액 `domain/money/tax.ts` — 훅 /cso) · 결재 통과 게이트 · 잠금(`lockExpenseRow` FOR UPDATE, 「지급 완료 동시 6건」) · `expenses.payments` write 권한 · `recordAction` tx | `/expenses/[id]` 문서 화면 행동 줄(S5 트레이서 · P0/P4/P6) | `db/schema/index.ts`[M]; `db/migrations/meta/_journal.json`[M]; `domain/rules/register.ts`[M]; `app/(app)/expenses/[id]/page.tsx`[A]; `test/integration/leak-scan.test.ts`[M] | 10건 (이 플랜이 첫 등장 10 · 앞 플랜이 이미 올린 파일 0) — ⚠ 의심: `app/(app)/expenses/[id]/actions.ts`·`actions.registry.ts`(05는 `app/(app)/expenses/actions.ts` 한 벌 — 관례 갈림); 누락 의심: 05가 `domain/expenses/tax.ts`(A)에 「06-03이 같은 파일·같은 이름을 확장한다」고 적었으나 06-03 files_modified엔 없음 |
| **06-04** | S5 지급 섹션 완성 — 이체액·차이 사유·지급 예정일 제자리 저장, 증빙 필수 게이트 `payment.evidence-required`, 지급 취소(D-606), 동시성 | 3 | 06-03 | EXP-09, EVID-02, EXP-06 | 예 | 없음 (제안: money, db-lock) | 3 | 404 | 14 | 없음(`expense_payments` 사용만) | 돈(이체액·차이) · 증빙 게이트 · 잠금(취소·동시성, `lockExpenseRow`) · 지급 권한 `can` | S5 `/expenses/[id]` 지급 섹션(`payment-section.tsx`·`payment-action-row.tsx`) | `domain/rules/register.ts`[M]; `domain/settings/keys.ts`[M]; `app/(app)/expenses/[id]/page.tsx`[A] | 11건 (이 플랜이 첫 등장 3 · 앞 플랜이 이미 올린 파일 8) — ⚠ 의심: `app/(app)/expenses/[id]/actions.ts`·`actions.registry.ts`(관례 갈림) |
| **06-05** | 법인카드 사용 등록 첫 경로 — `corp_card_usages` 표부터 `/cards` 목록·폼까지(본인 등록·팀 비용 연결, 결제 합계→공급가 역산 D-607, 외화 O-7, 연결 필수 DB CHECK) | 3 | 06-01, 06-02, 06-03 | EXP-07 | 예 | 없음 (제안: money, migration, db-schema, permissions) | 3 | 416 | 14 | 신규 표 `corp_card_usages`(`db/schema/corp-card-usages.ts` + index export + 마이그레이션 1; FK → `corp_cards`·`vendors`·`quote_lines`·`teams`·users). `db/schema/corp-cards.ts`는 읽기·선례만 | 돈(합계→공급가 역산) · 권한(카드 자격: 소지자 본인/사용일 소속 팀 카드, `scopeFor`) · 잠금 없음. `domain/corp-cards`·`repositories/corp-cards.ts`는 읽기 | S8 `/cards` 목록 + S9 폼(`?new=1`) | `db/schema/index.ts`[M]; `db/migrations/meta/_journal.json`[M]; `test/integration/leak-scan.test.ts`[M] | 10건 (이 플랜이 첫 등장 10 · 앞 플랜이 이미 올린 파일 0) |
| **06-06** | 증빙 확인 S4 — `expense_evidence_reviews` 표(확인/면제), 상태 다섯, O-2 「확인 전이면 지급 막힘」, 금액 고쳐 확인(D-602), `evidenceGateInputs` | 4 | 06-04 | EVID-02, EVID-03 | 예 | 없음 (제안: money, db-lock, migration, db-schema) | 3 | 406 | 14 | 신규 표 `expense_evidence_reviews`(`db/schema/expense-payments.ts`에 같이 둠 + 마이그레이션 1; 문서당 1줄 uniqueIndex) | 지급 게이트 입력(증빙 상태) · 잠금(`lockExpenseRow`) · 금액 고침(돈) · 경영관리 권한 | S4 `/expenses/[id]` 증빙 확인 섹션(`evidence-review-section.tsx`) | `db/migrations/meta/_journal.json`[M]; `app/(app)/expenses/[id]/page.tsx`[A] | 12건 (이 플랜이 첫 등장 5 · 앞 플랜이 이미 올린 파일 7) — ⚠ 의심: `app/(app)/expenses/[id]/actions.ts`·`actions.registry.ts`(관례 갈림) |
| **06-07** | 카드 사용을 견적 줄·견적 외 비용에 잇는 경로 + 이중 연결 게이트 `card.dual-link-block`(잠금 뒤 `lockQuoteLines`) + 연결 고르기 S10 + 프로젝트 상세 「법인카드 사용」 S15 | 4 | 06-05 | EXP-07 | 예 | 없음 (제안: db-lock) | 3 | 413 | 17 | 없음 | 잠금(`lockQuoteLines` = `ORDER BY id FOR UPDATE`, 지출결의·구매 요청 입구 공용) · 게이트 `card.dual-link-block` · `domain/quotes/lines.ts`(05M) | S10 연결 고르기(`/cards` 패널 위 목록) · S15 `/projects/[id]` 법인카드 사용 섹션 · S14 진입 줄 | `domain/quotes/lines.ts`[M]; `domain/rules/register.ts`[M]; `app/(app)/projects/[id]/page.tsx`[M] | 13건 (이 플랜이 첫 등장 7 · 앞 플랜이 이미 올린 파일 6) |
| **06-08** | 온라인 구매 요청(EXP-10) 신청 경로 — `purchase_requests` 표, 게이트 `purchase.line-door`, 구매 요청 번호 부여, `/cards/purchases` 목록·폼 | 5 | 06-07 | EXP-10, EXP-07 | 예 | 없음 (제안: db-lock, migration, db-schema) | 3 | 365 | 14 | 신규 표 `purchase_requests`(`db/schema/purchase-requests.ts` + index export + 마이그레이션 1; `number` uniqueIndex) | 잠금(견적 줄 잠금 뒤 두 게이트) · 번호 부여 동시 6건 경합 · 목록 범위 | S11 `/cards/purchases` 목록 + S12 신청 폼 | `db/schema/index.ts`[M]; `db/migrations/meta/_journal.json`[M]; `domain/rules/register.ts`[M]; `domain/settings/keys.ts`[M]; `test/integration/leak-scan.test.ts`[M] | 9건 (이 플랜이 첫 등장 9 · 앞 플랜이 이미 올린 파일 0) |
| **06-09** | 경영관리 대리 등록(EXP-16) + 카드 사용 수정·삭제(보관·되돌리기) + 사용일 기준 「사용한 사람」 후보 + 완료 프로젝트의 견적 외 비용 | 5 | 06-07 | EXP-16, EXP-07 | 예 | 없음 (제안: permissions, db-lock) | 3 | 376 | 13 | 없음(06-05의 `archived_at`·`archived_by` 사용) | 권한(`cards.proxy`, `cardUsageRights` 한 함수) · 잠금(연결 변경 `lockQuoteLines`) | S9 대리 등록·수정 모드 · S8 행 `수정`·`삭제` + 토스트 | — | 12건 (이 플랜이 첫 등장 4 · 앞 플랜이 이미 올린 파일 8) |
| **06-10** | 증빙 면제(S4)·선결제(S6) — Phase 5 `expenses`에 `prepaid`·`prepaid_reason` + (조건부) `files.sha256`, `waiveEvidence`·`prepaidDueInfo`, 제출 검증, 게이트 ctx 배선 | 6 | 06-06, 06-08 | EXP-13, EVID-02 | 예 | 없음 (제안: migration, db-schema, db-lock, permissions) | 3 | 365 | 15 | 기존 표 ALTER: `expenses`(+`prepaid`·`prepaid_reason`·CHECK NOT VALID) · `files`(+`sha256`+인덱스 — **05에 이미 있음**) · 마이그레이션 2(생성 + `--custom` VALIDATE) | 권한(면제 `can`) · 잠금(`lockExpenseRow`가 `prepaid` 반환) · Phase 5 제출 검증 수정 | S4 면제 · S6 선결제 칸(지출결의 폼 `/expenses/[id]`·`/expenses/new`) | `db/schema/expenses.ts`[A]; `db/schema/files.ts`[A]; `db/migrations/meta/_journal.json`[M]; `domain/expenses/index.ts`[A]; `domain/settings/keys.ts`[M] | 10건 (이 플랜이 첫 등장 5 · 앞 플랜이 이미 올린 파일 5) — ⚠ 의심: `app/(app)/expenses/expense-form.tsx` ✗ → 실제 `app/(app)/expenses/[id]/expense-form.tsx`(05A, 플랜이 스스로 가칭이라 적음); `[id]/actions.ts`·`actions.registry.ts`(관례 갈림); `db/schema/files.ts` 항목: sha256·인덱스는 05에 이미 있어 불필요 |
| **06-11** | 증빙 수명 주기 — PM 증빙 변경이 확인을 풀고 결재 통과 문서 version을 올리는 훅, 비용 기준(EVID-03·04), 업로드 검사, 마지막 증빙 삭제 확인(SP-6), 고아 청소 절차 | 7 | 06-10 | EVID-03, EVID-04, EVID-02 | 예 | 없음 (제안: db-lock) | 3 | 439 | 15 | 없음 | 잠금(행 잠금 뒤 무효화 훅 + 결재 통과 문서 version 증가 — 결재 인접) · 범위 판정 · 돈 없음 | S7 첨부 영역(오류 넷 · 마지막 삭제 모달) — 지출결의 폼 안, 새 라우트 없음 | `domain/settings/keys.ts`[M]; `repositories/files.ts`[A]; `ui/attachments/Attachments.tsx`[A]; `docs/OPERATIONS.md`[M] | 11건 (이 플랜이 첫 등장 8 · 앞 플랜이 이미 올린 파일 3) — ⚠ 의심: `app/(app)/expenses/expense-form.tsx` ✗ → `[id]/expense-form.tsx`; `domain/expenses/evidence.ts` ✗(05엔 `domain/evidence/*`); `domain/evidence-reviews/upload-checks.ts`(artifact) — 05 `domain/evidence/upload-checks.ts`와 중복(그 파일 머리에 「06-11이 선결제 규칙을 이 함수에 더한다」) |
| **06-12** | 구매 요청 → 구매 완료 — S13 카드 폼 구매 완료 모드, 한 트랜잭션으로 카드 사용 생성 + 요청 `구매 완료`, 구매 완료 건 카드 고치기, O-20 요청자=처리자 허용 | 7 | 06-08, 06-09, 06-10 | EXP-10 | 예 | 없음 (제안: money, migration, db-schema, permissions, db-lock) | 3 | 389 | 14 | 기존 표 ALTER: `corp_card_usages`(+`purchase_request_id` FK·unique·CHECK) · 마이그레이션 2(생성 + VALIDATE) | 돈(카드 사용 생성) · 권한(`cards.purchases`, `policy.ts` O-20) · 잠금(원자성 · 구매 완료 경합) | S13 `/cards/purchases?purchase={id}` 패널(S9 칸 재사용) | `db/migrations/meta/_journal.json`[M] | 12건 (이 플랜이 첫 등장 2 · 앞 플랜이 이미 올린 파일 10) |
| **06-13** | 지출결의 쪽 이중 연결 게이트 + 견적 줄 상태 파생(O-14 우선순위)·`expense.line-paid-lock`(EXP-06) + 견적 줄 표 상태 열·행 행동(S14) + 세 입구 동시 요청 병렬 테스트 | 7 | 06-08, 06-10 | EXP-06, EXP-07 | 예 | 없음 (제안: db-lock) | 3 | 402 | 14 | 없음 | 잠금(`lockQuoteLines`) · 게이트 · Phase 5 제출 훅 수정(`domain/expenses/index.ts` — 결재 인접) | S14 `/projects/[id]` 견적 줄 표(`quote-table.tsx`) 상태 열·행 행동 | `domain/quotes/lines.ts`[M]; `domain/rules/register.ts`[M]; `domain/expenses/index.ts`[A]; `app/(app)/projects/[id]/quote-table.tsx`[M] | 8건 (이 플랜이 첫 등장 6 · 앞 플랜이 이미 올린 파일 2) |
| **06-14** | 구매 요청 마감 — 팀 비용 요청(O-19 귀속)·본인 취소+되돌리기(O-9·H-4)·외화 예상 금액·목록 필터/그룹/페이지/합계·카드 목록 하위 링크(SP-4) | 8 | 06-12 | EXP-10 | 예 | 없음 (제안: db-lock, permissions) | 3 | 406 | 14 | 없음 | 잠금(FOR UPDATE ×4 — 취소·재개) · 권한(본인/남 취소) · 외화 예상 금액(표시) | S11 마감 · S12 팀 비용 · S10 purchase 모드 · `/cards` 하위 링크 | — | 14건 (이 플랜이 첫 등장 0 · 앞 플랜이 이미 올린 파일 14) |
| **06-15** | 일괄 지급 뼈대 — 「지급 대상」 보기 S1 · 확인 모달·건별 처리 S2 · `ui/table` `selectable` variant(SP-1) · R-2 스냅숏 낡은 행 막기 | 8 | 06-11 | EXP-09, EXP-06 | 예 | 없음 (제안: money, permissions) | 3 | 430 | 14 | 없음 | 돈(일괄 지급 — 단건 경로 행마다 재사용, 건별 격리) · 권한(지급 권한) · 스냅숏(낙관적 동시성) | S1 `/expenses?view=pay` + S2 일괄 지급 모달 | `ui/table/Table.tsx`[M]; `ui/table/types.ts`[M]; `app/(app)/expenses/page.tsx`[D]; `app/(app)/expenses/actions.ts`[A]; `app/(app)/expenses/actions.registry.ts`[A]; `test/integration/leak-scan.test.ts`[M] | 7건 (이 플랜이 첫 등장 7 · 앞 플랜이 이미 올린 파일 0) — ⚠ 의심: `app/(app)/expenses/page.tsx`는 05에서 삭제됨[D] → `app/(app)/expenses/(list)/page.tsx` |
| **06-16** | Phase 4 이월 증빙 — D-56 차수 고객 승인 증빙 + D-60 리저브 줄 증빙: `files.owner_kind` 값 확장, `domain/evidence-attachments` | 8 | 06-11, 06-12 | EVID-03 | 예 | 없음 (제안: migration, db-schema, permissions) | 3 | 446 | 15 | 기존 표 ALTER: `files`(`owner_kind` CHECK 확장 `quote_revision`·`reserve_entry`) · 마이그레이션 2 | 권한(첨부 권리: 담당 PM·리저브 쓰기) · `domain/reserves/index.ts`(훅 /cso 대상) · 승인된 차수 증빙 | S21 `/projects/[id]` 차수 승인 증빙 · S22 `/pnl/reserves` 리저브 줄 증빙 | `db/schema/files.ts`[A]; `db/migrations/meta/_journal.json`[M]; `app/(app)/projects/actions.ts`[M]; `app/(app)/projects/actions.registry.ts`[M]; `test/e2e/quote-revisions.spec.ts`[M] | 4건 (이 플랜이 첫 등장 3 · 앞 플랜이 이미 올린 파일 1) — ⚠ 의심: `domain/expenses/evidence.ts` ✗; `domain/evidence-attachments/index.ts`(artifact) — 05 `domain/evidence/index.ts:72`의 주인 종류 표(「Phase 6이 종류를 더할 때 이 표에 한 줄」)와 중복 가능 |
| **06-17** | 일괄 지급 마감 — 이체액 편집·차이 사유·서버 합·지급일 재계산 막힘·`Space`·50건 페이지 + 제자리 증빙 확인(DR-4, `ui/confirm-dialog` `attachments` 슬롯 SP-7) + 편집·선택 보관 | 9 | 06-15 | EXP-09 | 예 | 없음 (제안: money) | 4 | 487 | 14 | 없음 | 돈(서버 합 · 이체액 · 차이 — 가장 큰 금액 표면) · 증빙 확인 재사용 · 새 잠금 없음 | S1 마감 · S2 · 확인 모달(`ui/confirm-dialog`) | `ui/table/Table.tsx`[M]; `ui/table/use-grid-keyboard.ts`[M]; `ui/confirm-dialog/ConfirmDialog.tsx`[M]; `ui/confirm-dialog/ConfirmDialog.module.css`[M]; `app/(app)/expenses/actions.ts`[A]; `app/(app)/expenses/actions.registry.ts`[A] | 8건 (이 플랜이 첫 등장 2 · 앞 플랜이 이미 올린 파일 6) |
| **06-18** | 세금계산서 발행 요청(D-610) — `revenue_issue_requests` 표, PM 요청 → 매출 기록 권한자가 발행 줄로 잇기, 매출 섹션 「발행 요청」 표(S16) | 9 | 06-01, 06-02, 06-13, 06-16 | PROJ-06 | 예 | 없음 (제안: money, migration, db-schema, permissions, db-lock) | 3 | 371 | 14 | 신규 표 `revenue_issue_requests`(`db/schema/revenue-entries.ts`에 같이 둠 + 마이그레이션 1; `issued_entry_id` uniqueIndex) | 돈/매출(`domain/revenue/index.ts` — 훅 /cso) · 권한(`revenueWriteRights`, `revenue.issued_amount` 정보 항목) · 잠금(동시 잇기 FOR UPDATE) | S16 `/projects/[id]` 매출 섹션 발행 요청 표 | `db/migrations/meta/_journal.json`[M]; `app/(app)/projects/actions.ts`[M]; `app/(app)/projects/[id]/page.tsx`[M]; `app/(app)/projects/[id]/quote-table.tsx`[M]; `test/integration/leak-scan.test.ts`[M] | 5건 (이 플랜이 첫 등장 5 · 앞 플랜이 이미 올린 파일 0) |
| **06-19** | 완료 전 미결 점검(PROJ-06 D-611~613) 판정 3그룹 + 정산 결재 기안 막힘 — 게이트 `project.pre-settle-check`, 강행 허용 설정 3키, Phase 5 기안 훅, 섹션 | 10 | 06-13, 06-18 | PROJ-06 | 예 | 없음 (제안: db-lock, permissions) | 3 | 420 | 13 | 없음 | 결재(정산 결재 기안 막기 — `domain/approvals/settlement.ts`는 훅 /cso 경로지만 가칭) · 잠금(「기안 동시 6건」) · 범위(`scopeFor` R-6) | S18 `/projects/[id]` 완료 전 점검 섹션 + 「정산 결재 올리기」 막힘 | `domain/rules/register.ts`[M]; `domain/settings/keys.ts`[M]; `app/(app)/projects/[id]/page.tsx`[M]; `app/(app)/projects/[id]/quote-table.tsx`[M]; `test/integration/leak-scan.test.ts`[M] | 8건 (이 플랜이 첫 등장 8 · 앞 플랜이 이미 올린 파일 0) — ⚠ 의심: `domain/approvals/settlement.ts` ✗ → 05 실물은 `domain/settlements/index.ts`·`repositories/settlement-approvals.ts`, UI 훅 자리는 `app/(app)/projects/[id]/settlement/*` |
| **06-20** | 지급 읽기 쪽 마감 — 「지급 완료」 보기 S3, 계좌 노출 O-17(대표에겐 계좌 없음), Phase 5 목록 상태 열, 문서 화면 왕복 `from=pay`·`[증빙 전체 ▾]` 필터, S3 제자리 증빙 확인 | 10 | 06-17 | EXP-09 | 예 | 없음 (제안: permissions) | 4 | 391 | 11 | 없음 | 권한(계좌번호 노출 `canReveal` 정보 항목) · 돈은 읽기만 · 잠금 없음 | S3 `/expenses?view=paid` · S1 필터 · S5 계좌 행 · `/expenses/[id]` 3차(`지급 대상으로`) | `app/(app)/expenses/page.tsx`[D]; `app/(app)/expenses/[id]/page.tsx`[A] | 9건 (이 플랜이 첫 등장 1 · 앞 플랜이 이미 올린 파일 8) — ⚠ 의심: `app/(app)/expenses/page.tsx`는 05에서 삭제됨[D] → `app/(app)/expenses/(list)/page.tsx` |
| **06-21** | 발행 요청 마감 — 취소(O-12)·상태 전이 한 함수, 경영관리 발행 요청 목록 S17, 프로젝트 목록 하위 링크(SP-4), `?issueRequest` 포커스 | 10 | 06-18 | PROJ-06 | 예 | 없음 (제안: db-lock, money) | 3 | 345 | 11 | 없음 | 매출 발행 요청 상태 전이(FOR UPDATE ×3) · 범위/권한 | S17 `/projects/issue-requests` · S16 취소 · `/projects` 필터 줄 링크 | `app/(app)/projects/actions.ts`[M] | 8건 (이 플랜이 첫 등장 3 · 앞 플랜이 이미 올린 파일 5) |
| **06-22** | 완료 전 점검을 대표 승인 경로까지 닫기(O-16) — 승인 함수 정산 결재 분기 재점검(「승인 동시 6건」) + 결재 문서 화면 막힘·결과 줄 + S18 표시 상태 마감 | 11 | 06-19 | PROJ-06 | 예 | 없음 (제안: db-lock, permissions) | 3 | 347 | 9 | 없음 | 결재(`domain/approvals/index.ts` 승인 함수 — 훅 /cso 경로, 다른 문서 종류도 지나는 공용 함수) · 잠금(승인 동시 6건) | `/approvals/[id]`(가칭 — 05엔 없음) 결재 문서 화면 · S18 마감 `/projects/[id]` | `domain/approvals/index.ts`[M]; `app/(app)/projects/[id]/page.tsx`[M]; `app/(app)/projects/[id]/quote-table.tsx`[M]; `app/(app)/projects/[id]/project-detail.module.css`[M] | 5건 (이 플랜이 첫 등장 1 · 앞 플랜이 이미 올린 파일 4) — ⚠ 의심: `app/(app)/approvals/[id]/page.tsx` ✗(플랜이 스스로 가칭) → 05 결재 UI는 `approvals/page.tsx`·`approval-sheet.tsx`·`decision-dialogs.tsx`; `app/(app)/status-display.ts`(06-01 산출 — 05 `app/(app)/expenses/status-display.ts`와 이름 겹침) |
| **06-23** | 홈 「내 차례」 S19 Phase 6 항목 — 경영관리(지급·구매 요청·발행 요청 묶음) · PM(선결제 기한 초과·결재 통과·증빙 없음·지급 대기·점검 막힘) | 11 | 06-14, 06-19, 06-20, 06-21 | EXP-09, EXP-10, EXP-13, PROJ-06 | 예 | 없음 | 3 | 341 | 9 | 없음 | 역할별 항목 범위(표시) · 돈·결재·잠금 로직 없음 | `/` 홈 「내 차례」(S19, `ui/next-turn`) | `domain/next-turn/index.ts`[A]; `ui/next-turn/build-next-turn-view.ts`[M]; `ui/next-turn/NextTurn.tsx`[M]; `app/(app)/page.tsx`[M]; `test/unit/ui/next-turn.test.ts`[M]; `test/integration/next-turn.test.ts`[A] | 3건 (이 플랜이 첫 등장 3 · 앞 플랜이 이미 올린 파일 0) |
| **06-24** | 페이즈 마감 — 경영관리 전체 E2E(이미지·PDF 두 경로) · 누수 스캔 완전성 · PR 전 마이그레이션 재생성(R-4) · 페이즈 전체 CI=true 게이트 | 12 | 06-16, 06-22, 06-23, 06-25 | EXP-06, EXP-07, EXP-09, EXP-10, EXP-13, EXP-16, EVID-02, EVID-03, EVID-04, PROJ-06 | 예 | 없음 (제안: migration) | 3 | 262 | 3 | 마이그레이션: 앞 플랜들의 Phase 6 마이그레이션을 지우고 `phase6` + `phase6_validate` 2개로 재생성(`_journal.json`·스냅숏). 스키마 파일 변경 없음 | 직접 없음(테스트·게이트) — 단 마이그레이션 재생성은 위험 경로 | 없음(E2E `management-flow.spec.ts`) | `test/integration/leak-scan.test.ts`[M]; `db/migrations/meta/_journal.json`[M] | 1건 (이 플랜이 첫 등장 1 · 앞 플랜이 이미 올린 파일 0) |
| **06-25** | 카드 전표 파일 첨부(EVID-01 카드 몫) — `files.owner_kind`에 `corp_card_usage` 추가, `attachmentOwnerRights`, 카드 폼 세 모드 첨부 영역, 목록 `증빙` 열, 구매 완료 S13 증빙 첨부 선택 | 10 | 06-11, 06-14, 06-16, 06-18 | EVID-01 | 예 | 없음 (제안: migration, db-schema, permissions) | 3 | 457 | 15 | 기존 표 ALTER: `files`(`owner_kind` CHECK 확장 `corp_card_usage`) · 마이그레이션 2(생성 + VALIDATE) | 권한(`attachmentOwnerRights` corp_card_usage 갈래) · 업로드 완료 통보 · 잠금(FOR UPDATE ×1) | S7 · S8 `증빙` 열 · S9 첨부 영역 · S13 증빙 첨부 선택(`/cards`) | `db/schema/files.ts`[A]; `db/migrations/meta/_journal.json`[M]; `repositories/files.ts`[A] | 12건 (이 플랜이 첫 등장 2 · 앞 플랜이 이미 올린 파일 10) — ⚠ 의심: `domain/evidence-reviews/upload-checks.ts`(artifact) — 05 `domain/evidence/upload-checks.ts`와 중복; `domain/evidence-attachments/index.ts` — 05 `domain/evidence/index.ts`와 중복 가능 |

`fm` = `files_modified` 수. 합계 320 entries / 고유 173파일. 06-NN 열의 분할(합 = fm수): ∩05 + 「이 브랜치에 있고 05는 안 건드림」 + 「없음」 — 전체 분할은 부록 A.

## 2. 웨이브 맵 · 의존 그래프

```
W01: 06-01 · 06-02
W02: 06-03
W03: 06-04 · 06-05
W04: 06-06 · 06-07
W05: 06-08 · 06-09
W06: 06-10
W07: 06-11 · 06-12 · 06-13
W08: 06-14 · 06-15 · 06-16
W09: 06-17 · 06-18
W10: 06-19 · 06-20 · 06-21 · 06-25
W11: 06-22 · 06-23
W12: 06-24
```

간선(`depends_on`):

```
06-01 (W1) ← (없음)
06-02 (W1) ← (없음)
06-03 (W2) ← 06-01, 06-02
06-04 (W3) ← 06-03
06-05 (W3) ← 06-01, 06-02, 06-03
06-06 (W4) ← 06-04
06-07 (W4) ← 06-05
06-08 (W5) ← 06-07
06-09 (W5) ← 06-07
06-10 (W6) ← 06-06, 06-08
06-11 (W7) ← 06-10
06-12 (W7) ← 06-08, 06-09, 06-10
06-13 (W7) ← 06-08, 06-10
06-14 (W8) ← 06-12
06-15 (W8) ← 06-11
06-16 (W8) ← 06-11, 06-12
06-17 (W9) ← 06-15
06-18 (W9) ← 06-01, 06-02, 06-13, 06-16
06-19 (W10) ← 06-13, 06-18
06-20 (W10) ← 06-17
06-21 (W10) ← 06-18
06-22 (W11) ← 06-19
06-23 (W11) ← 06-14, 06-19, 06-20, 06-21
06-24 (W12) ← 06-16, 06-22, 06-23, 06-25
06-25 (W10) ← 06-11, 06-14, 06-16, 06-18
```

검사 결과(스크립트):

- **사이클 0.** 정의되지 않은 id 0. **`depends_on`이 같은/뒤 웨이브를 가리키는 경우 0.** 모든 플랜의 `wave` = 1 + max(depends_on 웨이브) 로 일치(W1은 06-01·06-02, 의존 없음).
- 06-24가 유일한 싱크이고 나머지 24개 전부의 후손(조상 24개). 최장 사슬 12 = `06-01 → 06-03 → 06-05 → 06-07 → 06-08 → 06-10 → 06-11 → 06-16 → 06-18 → 06-19 → 06-22 → 06-24`.
- 중복(이미 다른 의존으로 함의되는) `depends_on`: 06-05 [06-01, 06-02] · 06-12 [06-08] · 06-13 [06-08] · 06-18 [06-01, 06-02] · 06-19 [06-13] · 06-24 [06-16] · 06-25 [06-11, 06-16] — 해롭지 않으나 정리 대상.
- 파급 크기(자손 수): 06-01·06-02 각 23 · 06-03 22 · 06-05 19 · 06-07 18 · 06-04 17 · 06-06·06-08 각 16 · 06-10 15. 06-03(트레이서)이 흔들리면 22개가 같이 흔들린다.
- **`_journal.json` 직렬화**: W2 06-03 · W3 06-05 · W4 06-06 · W5 06-08 · W6 06-10 · W7 06-12 · W8 06-16 · W9 06-18 · W10 06-25 · W12 06-24 — 웨이브당 정확히 1개. W3·W4·W5·W7·W8의 형제 플랜(06-04·06-07·06-09·06-11/06-13·06-14/06-15)은 마이그레이션이 없다. 즉 **12단 깊이의 상당 부분이 스키마 직렬화**다.
- 웨이브 순서에만 기대는 쌍(depends_on 경로 없음 — 웨이브를 바꾸면 충돌): `db/migrations/meta/_journal.json` 06-05↔06-06 · 06-06↔06-08 / `domain/rules/register.ts` 06-04↔06-07 · 06-04↔06-08 / `domain/settings/keys.ts` 06-04↔06-08 / `test/integration/leak-scan.test.ts` 06-15↔06-18 · 06-15↔06-19 / `domain/payments/index.ts` 06-13↔06-20.

## 3. 같은 웨이브에서 한 파일을 둘 이상이 쓰는 경우

**0건**(프런트매터 · Task `<files>` 모두). 작성자가 웨이브를 그렇게 배치했다(06-18 본문 「웨이브 9인 이유 …」, 06-13 「W7의 06-11·06-12는 이 파일을 건드리지 않는다」).

그러나 **웨이브를 가로질러 여러 플랜이 쓰는 핫 파일**이 있다(웨이브 직렬화로만 안전). 3개 플랜 이상:

| 파일 | 05 | 쓰는 플랜(웨이브) |
|---|---|---|
| `db/migrations/meta/_journal.json` | [M] | 06-03(W2) 06-05(W3) 06-06(W4) 06-08(W5) 06-10(W6) 06-12(W7) 06-16(W8) 06-18(W9) 06-24(W12) 06-25(W10) |
| `test/integration/leak-scan.test.ts` | [M] | 06-03(W2) 06-05(W3) 06-08(W5) 06-15(W8) 06-18(W9) 06-19(W10) 06-24(W12) |
| `app/(app)/cards/card-usage-form.tsx` | 신규 | 06-05(W3) 06-07(W4) 06-09(W5) 06-12(W7) 06-14(W8) 06-25(W10) |
| `domain/corp-card-usages/index.ts` | 신규 | 06-05(W3) 06-07(W4) 06-09(W5) 06-12(W7) 06-14(W8) 06-25(W10) |
| `domain/rules/register.ts` | [M] | 06-03(W2) 06-04(W3) 06-07(W4) 06-08(W5) 06-13(W7) 06-19(W10) |
| `domain/settings/keys.ts` | [M] | 06-02(W1) 06-04(W3) 06-08(W5) 06-10(W6) 06-11(W7) 06-19(W10) |
| `domain/payments/index.ts` | 신규 | 06-03(W2) 06-04(W3) 06-06(W4) 06-13(W7) 06-20(W10) |
| `app/(app)/cards/actions.registry.ts` | 신규 | 06-05(W3) 06-07(W4) 06-09(W5) 06-25(W10) |
| `app/(app)/cards/actions.ts` | 신규 | 06-05(W3) 06-07(W4) 06-09(W5) 06-25(W10) |
| `app/(app)/cards/card-usage-list.tsx` | 신규 | 06-05(W3) 06-09(W5) 06-14(W8) 06-25(W10) |
| `app/(app)/cards/page.tsx` | 있음(05 무변경) | 06-05(W3) 06-07(W4) 06-09(W5) 06-12(W7) |
| `app/(app)/cards/purchases/actions.ts` | 신규 | 06-08(W5) 06-12(W7) 06-14(W8) 06-25(W10) |
| `app/(app)/expenses/[id]/actions.registry.ts` | 신규 | 06-03(W2) 06-04(W3) 06-06(W4) 06-10(W6) |
| `app/(app)/expenses/[id]/actions.ts` | 신규 | 06-03(W2) 06-04(W3) 06-06(W4) 06-10(W6) |
| `app/(app)/expenses/[id]/page.tsx` | [A] | 06-03(W2) 06-04(W3) 06-06(W4) 06-20(W10) |
| `app/(app)/projects/[id]/page.tsx` | [M] | 06-07(W4) 06-18(W9) 06-19(W10) 06-22(W11) |
| `app/(app)/projects/[id]/quote-table.tsx` | [M] | 06-13(W7) 06-18(W9) 06-19(W10) 06-22(W11) |
| `domain/purchase-requests/index.ts` | 신규 | 06-08(W5) 06-12(W7) 06-14(W8) 06-25(W10) |
| `repositories/corp-card-usages.ts` | 신규 | 06-05(W3) 06-07(W4) 06-09(W5) 06-25(W10) |
| `app/(app)/cards/link-picker.tsx` | 신규 | 06-07(W4) 06-09(W5) 06-14(W8) |
| `app/(app)/cards/purchases/actions.registry.ts` | 신규 | 06-08(W5) 06-12(W7) 06-14(W8) |
| `app/(app)/cards/purchases/page.tsx` | 신규 | 06-08(W5) 06-12(W7) 06-14(W8) |
| `app/(app)/expenses/[id]/payment-action-row.tsx` | 신규 | 06-03(W2) 06-04(W3) 06-20(W10) |
| `app/(app)/expenses/payment-targets-table.tsx` | 신규 | 06-15(W8) 06-17(W9) 06-20(W10) |
| `app/(app)/projects/actions.ts` | [M] | 06-16(W8) 06-18(W9) 06-21(W10) |
| `db/schema/files.ts` | [A] | 06-10(W6) 06-16(W8) 06-25(W10) |
| `db/schema/index.ts` | [M] | 06-03(W2) 06-05(W3) 06-08(W5) |
| `domain/evidence-reviews/index.ts` | 신규 | 06-06(W4) 06-10(W6) 06-11(W7) |
| `domain/payments/action-row.ts` | 신규 | 06-03(W2) 06-04(W3) 06-06(W4) |
| `domain/payments/targets.ts` | 신규 | 06-15(W8) 06-17(W9) 06-20(W10) |
| `repositories/expense-payments.ts` | 신규 | 06-03(W2) 06-04(W3) 06-10(W6) |
| `test/e2e/payment-batch.spec.ts` | 신규 | 06-15(W8) 06-17(W9) 06-20(W10) |
| `test/e2e/payment-single.spec.ts` | 신규 | 06-03(W2) 06-04(W3) 06-06(W4) |
| `test/e2e/purchase-requests.spec.ts` | 신규 | 06-08(W5) 06-12(W7) 06-14(W8) |
| `test/integration/payment-batch.test.ts` | 신규 | 06-15(W8) 06-17(W9) 06-20(W10) |
| `test/integration/purchase-requests.test.ts` | 신규 | 06-08(W5) 06-12(W7) 06-14(W8) |

05가 이미 바꾼 핫 파일([M]) — `_journal.json`·`leak-scan.test.ts`·`domain/settings/keys.ts`·`domain/rules/register.ts`·`db/schema/index.ts`·`app/(app)/projects/[id]/page.tsx`·`quote-table.tsx`·`app/(app)/projects/actions.ts` — 은 06이 **05 머지 뒤 main 위에서** 시작하지 않으면 첫 플랜부터 충돌한다(PR #162는 아직 main에 없음).

## 4. `db/schema/corp-cards.ts` 와 「공용 카드」

**이 파일을 `files_modified`에 적은 플랜 0개, 본문에서 고치겠다고 한 플랜 0개.** 언급은 읽기·선례뿐: 06-05(`archived_at/by` 규약·XOR 선례 인용, `corp_card_id` FK 대상, `repositories/corp-cards.ts` 읽기) · 06-09·06-12(`repositories/corp-cards.ts`가 `tx` 인자 없음이라는 사실만). 05도 이 파일을 건드리지 않았다(05 변경 목록에 없음).

이 브랜치(HEAD) 20~45행 — 파일은 **39행에서 끝난다**(40~45행 없음). pr162의 같은 파일과 **동일**(`git diff HEAD refs/remotes/pr162 -- db/schema/corp-cards.ts` 비어 있음):

```ts
 20      kind: text("kind").notNull(),
 21      holderUserId: text("holder_user_id").references(() => users.id),
 22      teamId: uuid("team_id").references(() => teams.id),
 23      active: boolean("active").notNull().default(true),
 24      customFields: jsonb("custom_fields").notNull().default({}),
 25      archivedAt: timestamp("archived_at"),
 26      archivedBy: text("archived_by"),
 27      createdAt: timestamp("created_at").notNull().defaultNow(),
 28      updatedAt: timestamp("updated_at").notNull().defaultNow(),
 29    },
 30    (table) => [
 31      unique("corp_cards_issuer_last4_key").on(table.issuer, table.numberLast4),
 32      check(
 33        "corp_cards_owner_xor_check",
 34        sql`(${table.holderUserId} is not null) <> (${table.teamId} is not null)`,
 35      ),
 36      // 03-06이 GIN 인덱스를 뒤늦게 채운다(field_definitions 규약이 이제 정해졌다).
 37      index("corp_cards_custom_fields_idx").using("gin", table.customFields),
 38    ],
 39  );
```

- 32~35행 = `corp_cards_owner_xor_check`: `(holder_user_id is not null) <> (team_id is not null)` — **정확히 하나**(개인 또는 팀). 같은 식이 `db/migrations/0006_org_people_cards.sql:16`에 있고, `kind text NOT NULL`(20행)에는 CHECK가 없다.
- **플랜이 의도하는 변경**: 플랜 25개(2026-10-01, UI-SPEC rev 9 기준)에는 **없다** — 06-05·06-09의 카드 자격은 「소지자 본인 · 사용일 소속 팀의 카드」뿐이다. 변경 의도는 **UI-SPEC rev 10 사용자 결정 Q5(10/5 00:55)** 에만 있다: 「공용 법인카드(소지자·팀 없는 카드)를 06에서 받는다 — 카드 자격 판정에 갈래 하나(지금 스키마에 없음)」, 그리고 S9 절(UI-SPEC 733~735행)에 「**공용 카드는 지금 없다** … `db/schema/corp-cards.ts:32-35` · `CardOwnerKind = "personal" | "team"` `domain/corp-cards/index.ts:45` · 관리자 카드 폼 소유 옵션 `개인`·`팀` `card-form.tsx:98-99`. **06-05가 `공용` 갈래를 더한다**(관리자 폼 옵션 하나·소유자 칸 없음). `db/schema/`는 위험 경로라 별도 PR(사용자 머지)」.
- 즉 재계획에서 06-05(또는 새 선행 플랜)에 **공용 갈래**를 넣어야 한다. 바꿀 자리(코드 실측):
  - `db/schema/corp-cards.ts:32-35` XOR → 「둘 다 없음」 허용(예: `kind` 판별 CHECK 또는 「둘 다 있음 금지」) + **마이그레이션**(기존 표라 B-2 절차: `SET LOCAL` 한 쌍 · `NOT VALID` · `--custom` VALIDATE) — `db/schema/`·`db/migrations/` = 위험 경로·사용자 머지.
  - `domain/corp-cards/index.ts:44-54` `CardOwnerKind`·`cardOwnerKind()`(둘 다 없으면 `InvalidCardOwnerError`), 138·162·170·192행 사용처 — `domain/corp-cards/` = 훅 /cso 경로.
  - `app/(app)/admin/corp-cards/card-form.tsx`(34·55·96~100·105·155·170·198~200·209행 — 만들기·고치기 폼 둘) · `page.tsx:167-168` 종류 라벨 · `repositories/corp-cards.ts`(훅 /cso 경로).
  - 테스트: `test/unit/corp-cards/owner-rule.test.ts`(둘 다 없음 → throw 단언 20행) · `test/integration/corp-cards.test.ts`(112·122행) · `test/e2e/corp-cards.spec.ts`.
  - 06 쪽 소비자: 06-05 카드 자격(직원 = 자기 카드 + 자기 팀 카드 + 공용 카드) · 목록 범위(공용 카드 사용은 **자기가 등록한 것만**, UI-SPEC 688행) · 06-09 대리 등록(공용 카드는 소지자 힌트 없음, 「사용한 사람」 후보 = 사용일 재직자 전부·기본값 없음, UI-SPEC 772행) · 06-12·06-14 구매 요청/완료(카드 = 활성 카드 전부, 공용 포함, UI-SPEC 836행).

## 5. 위험 경로(CLAUDE.md §4 머지) — 사용자 머지 대상 묶음

훅 정규식(`.claude/hooks/plant8-skill-gate.sh` 311행): `^(db/migrations/|db/schema/|domain/auth/|domain/permissions/|lib/crypto|scripts/(deploy|rollback|bootstrap-gcp|promote-guard)\.sh$|\.github/workflows/|infra/|\.claude/|CLAUDE\.md$)` (`.claude/gates/`는 제외). `files_modified` + 본문 키워드(`.github/workflows`·`.claude/`·`infra/`·`lib/crypto`·`scripts/*.sh`·`domain/auth/`) 검색으로 확인.

**그룹 R1 — `db/schema/` + `db/migrations/` (9개 플랜 + 06-24 재생성)**

| 플랜 | 위험 경로 파일 | 표 / 변경 | 마이그레이션 |
|---|---|---|---|
| 06-03 | `db/schema/expense-payments.ts` · `db/schema/index.ts` · `db/migrations/meta/_journal.json` | 신규 `expense_payments` | 1 |
| 06-05 | `db/schema/corp-card-usages.ts` · `db/schema/index.ts` · `_journal.json` | 신규 `corp_card_usages` | 1 |
| 06-06 | `db/schema/expense-payments.ts` · `_journal.json` | 신규 `expense_evidence_reviews`(같은 파일) | 1 |
| 06-08 | `db/schema/purchase-requests.ts` · `db/schema/index.ts` · `_journal.json` | 신규 `purchase_requests` | 1 |
| 06-10 | `db/schema/expenses.ts` · `db/schema/files.ts` · `_journal.json` | `expenses` +`prepaid`·`prepaid_reason`·CHECK / `files` +`sha256`·인덱스(05에 이미 있음) | 2 (생성 + `--custom` VALIDATE) |
| 06-12 | `db/schema/corp-card-usages.ts` · `_journal.json` | `corp_card_usages` +`purchase_request_id` FK·unique·CHECK | 2 |
| 06-16 | `db/schema/files.ts` · `_journal.json` | `files.owner_kind` CHECK 확장(`quote_revision`·`reserve_entry`) | 2 |
| 06-18 | `db/schema/revenue-entries.ts` · `_journal.json` | 신규 `revenue_issue_requests`(같은 파일) | 1 |
| 06-25 | `db/schema/files.ts` · `_journal.json` | `files.owner_kind` CHECK 확장(`corp_card_usage`) | 2 |
| 06-24 | `_journal.json`(+ 재생성 SQL·스냅숏) | 위 마이그레이션 전부 삭제 후 `phase6` + `phase6_validate` 2개로 재생성(R-4) | 2 (재생성) |
| (없음 — 필요) | `db/schema/corp-cards.ts:32-35` + 새 마이그레이션 | 공용 카드 XOR 완화(UI-SPEC Q5) — 어느 플랜에도 없음 | 1~2 |

합계: 신규 표 5(`expense_payments`·`corp_card_usages`·`expense_evidence_reviews`·`purchase_requests`·`revenue_issue_requests`) + 기존 표 ALTER 5건(`expenses` 1 · `files` 3 — 06-10분은 05에 이미 있어 불필요 · `corp_card_usages` 1) → 06-24 재생성 전 마이그레이션 13개, 재생성 뒤 2개. 05는 0024~0027을 이미 썼다(06은 0028~, 번호는 `pnpm db:generate`가 정함 — 플랜은 번호를 박지 않고 글롭 `*corp_card_usages*.sql`만 쓴다).

**그룹 R2 — `domain/permissions/`(1개 플랜)**: 06-02 `domain/permissions/menus.ts`(메뉴 키 `expenses.payments`·`cards.purchases`·`cards.proxy` 3줄). 읽기 인용만 있는 파일: `can.ts`·`scope-for.ts`·`dto-registry.ts`·`info-items.ts`(수정 없음). 05는 `menus.ts`에 `expenses.evidence_void`·`expenses.evidence_attach`를 더했다.

**그룹 R3 — 나머지(`domain/auth/`·`lib/crypto*`·`scripts/*.sh`·`.github/workflows/`·`infra/`·`.claude/`·`CLAUDE.md`)**: 25개 플랜 **0건**.

**위험 경로는 아니지만 훅이 /cso를 강제하는 돈·결재 경로**(`^(domain/(money|corp-cards|reserves|revenue|approvals)/|repositories/(corp-cards|approvals|reserve-entries|revenue-entries)\.ts$)`): 06-02 `domain/money/index.ts` · 06-03 `domain/money/tax.ts` · 06-16 `domain/reserves/index.ts` · 06-18 `domain/revenue/index.ts` · 06-19 `domain/approvals/settlement.ts`(가칭 — 실물 `domain/settlements/`면 정규식 밖) · 06-22 `domain/approvals/index.ts`. 공용 카드 변경이 들어가면 `domain/corp-cards/index.ts`·`repositories/corp-cards.ts`도 해당.

**분리 PR 시사점**

- 위험 경로 파일이 든 플랜 11개(06-02·03·05·06·08·10·12·16·18·24·25)는 **같은 플랜 안에 위험 파일과 비위험 코드가 섞여 있다**(예 06-03: 위험 3 + 코드·화면 14). 이대로면 PR 11개가 모두 사용자 머지다 → CLAUDE.md의 「위험 경로 변경은 별도 PR로 떼어 나머지가 무인으로 흐르게」에 맞추려면 **스키마·마이그레이션(+ 06-02 메뉴 키 + 공용 카드 CHECK)을 한 덩어리 사용자 머지 PR로 앞쪽에 묶고**, 그 위에서 코드·화면 플랜이 세션 머지로 흐르게 쪼개야 한다.
- 06-24 R-4가 이미 「Phase 6 마이그레이션을 PR 직전에 지우고 `phase6`로 재생성」하므로 스키마 단일 PR 구조와 잘 맞는다. 단 현재는 코드 플랜이 스키마 플랜 뒤 웨이브에 걸려 있어(마이그레이션 직렬화) 스키마를 앞당기려면 웨이브·depends_on 재배치가 필요하다.

## 6. 크기 이상치

기준: 줄 > 400 또는 Task > 6. **Task > 6: 0개**(분포 2·3·4개 — 4개는 06-17·06-20, 2개는 06-03). **줄 > 400: 13개.**

| 플랜 | 줄 | Task | fm | 토큰 추정 | 비고 |
|---|---|---|---|---|---|
| **06-17** | 487 | 4 | 14 | 115k | 최대. rev 9에서 Task 4(제자리 증빙 확인·보관)와 `ui/confirm-dialog` 2파일 추가, 80k→115k. 플랜이 「쪼개지 않은 이유」를 적음 |
| **06-25** | 457 | 3 | 15 | 95k | 카드 전표 첨부. 마이그레이션 2 + 폼 세 모드 + 업로드. fm 15 |
| **06-16** | 446 | 3 | 15 | 90k | D-56·D-60 두 증빙 + 마이그레이션 2. fm 15(체커 15 문턱), 「16번째 파일」 재분할 방아쇠 3종 명시 |
| **06-11** | 439 | 3 | 15 | 100k | 증빙 수명 주기 5갈래. fm 15, 05가 이미 일부(중복 조회·`Attachments.tsx`)를 마련 |
| **06-03** | 431 | 2 | 17 | 100k | 트레이서 + tx 규약 + 마이그레이션. **fm 17**(체커 막음 15+ 초과, r3-2 오케스트레이터 결정으로 미분할) |
| **06-15** | 430 | 3 | 14 | 100k | 일괄 지급 뼈대 + `ui/table` variant. fm 14 |
| **06-19** | 420 | 3 | 13 | 100k | 완료 전 점검 판정. 재분할 방아쇠(Task 3 → 새 플랜) 명시 |
| **06-05** | 416 | 3 | 14 | 95k | 카드 사용 첫 경로 + 마이그레이션. fm 14 |
| **06-07** | 413 | 3 | 17 | 110k | **fm 17**(체커 막음 15+ 초과, 미분할 결정). 토큰 110k(예산 100k 초과) |
| **06-06** | 406 | 3 | 14 | 90k | 증빙 확인 S4 + 마이그레이션. fm 14 |
| **06-14** | 406 | 3 | 14 | 97k | 구매 요청 마감. fm 14(전부 앞 플랜 파일) |
| **06-04** | 404 | 3 | 14 | 100k | S5 지급 섹션. 100k 경계, 재분할 방아쇠 명시 |
| **06-13** | 402 | 3 | 14 | 100k | 줄 상태 파생 + 세 입구 병렬 테스트. 100k 경계, 재분할 방아쇠 명시 |

- `files_modified` ≥ 15(plan-checker 임계: 목표 5-8 · 경고 10 · 막음 15+): 06-03(17) · 06-07(17) · 06-10 · 06-11 · 06-16 · 06-25(각 15). 13~14개: 06-04·05·06·08·12·13·14·15·17·18(14) · 06-09·06-19(13).
- 토큰 추정이 계획 예산(100k)을 넘는 것: 06-17(115k) · 06-07·06-09(각 110k). 100k 정확히: 06-03·04·11·13·15·18·19. 합계 2,322k · 줄 9,796 · fm 320.
- 줄 수는 `wc -l`(줄바꿈 수). 가장 짧은 플랜: 06-24(262줄·fm 3).

## 7. 05 실물과 어긋나는 것으로 보이는 항목 (재계획 때 확인)

경로 대조 + 파일 머리 몇 줄만 읽은 결과다. **확정이 아니라 후보**로 본다(플랜 대부분은 각 Task ⓪에서 「가칭 → 실제」 대응을 SUMMARY에 적게 돼 있다).

| # | 플랜 | 플랜이 적은 것 | 05(pr162) 실물 | 판단 |
|---|---|---|---|---|
| 1 | 06-15 · 06-20 | `app/(app)/expenses/page.tsx`(files_modified) | 05가 **삭제**[D]. 목록은 `app/(app)/expenses/(list)/page.tsx` + `(list)/layout.tsx`·`loading.tsx`·`error.tsx`, 목록 부품 `expenses-table.tsx`·`list-columns.ts`·`status-filter.tsx`·`status-display.ts` | 틀림 — 경로 교체 |
| 2 | 06-10 · 06-11 | `app/(app)/expenses/expense-form.tsx`(가칭 명시) | `app/(app)/expenses/[id]/expense-form.tsx`[A] + `app/(app)/expenses/new/page.tsx` | 틀림 — 경로 교체 |
| 3 | 06-19 | `domain/approvals/settlement.ts`(신규) | 정산 결재는 `domain/settlements/{index,dto}.ts` + `repositories/settlement-approvals.ts` + `db/schema/settlement-approvals.ts` + UI `app/(app)/projects/[id]/settlement/*`. `domain/settlements/index.ts:74` 주석 「지출결의·증빙 마감 점검으로 막지 않는다(Phase 6 PROJ-06)」가 훅 자리 | 틀림 — 파일 교체 · 훅 정규식 밖이 될 수 있음 |
| 4 | 06-22 | `app/(app)/approvals/[id]/page.tsx`(가칭 명시) | 05 결재 UI는 시트 방식: `approvals/page.tsx`·`approval-sheet.tsx`·`decision-dialogs.tsx`·`sheet-material.ts` (`[id]` 라우트 없음) | 틀림 — 승인 막힘 표시 자리 재설계 |
| 5 | 06-11 · 06-25 | `domain/evidence-reviews/upload-checks.ts`(artifact, `checkEvidenceUpload`) | `domain/evidence/upload-checks.ts`[A]가 이미 `checkEvidenceUpload`(크기·형식·중복) 보유, 머리에 「06-11이 선결제 규칙을 이 함수에 더한다」 | 중복 — 05 파일 확장으로 수정 |
| 6 | 06-16 · 06-25 | `domain/evidence-attachments/index.ts`(신규 모듈) | `domain/evidence/index.ts:72` 「지금 주인은 지출결의 하나다. Phase 6이 종류를 더할 때 이 표에 한 줄을 더한다」, `domain/evidence/dto.ts:4`·`signals.ts` | 중복 가능 — 신규 모듈 대신 05 표 확장 검토 |
| 7 | 06-11 · 06-16 | `domain/expenses/evidence.ts`(신규) | 그런 파일 없음. 05: `domain/evidence/{index,dto,signals,upload-checks}.ts`, `domain/expenses/{access,detail,dto,gate,index,line-door,list,pick,tax}.ts` | 불명 — 대응 확인 필요 |
| 8 | 06-03 · 06-04 · 06-06 · 06-10 | `app/(app)/expenses/[id]/actions.ts`·`actions.registry.ts`(신규) | 05는 `app/(app)/expenses/actions.ts`·`actions.registry.ts` 한 벌[A](06-15·06-17은 이 파일을 쓴다고 적음) | 관례 갈림 — 한 벌로 합칠지 결정 |
| 9 | 06-02 | `sumKrw`·`diffKrw`·키 `evidence.max_size_mb`를 새로 추가 | `domain/money/index.ts:208,212`에 이미 있음(05-03 「06-02와 같은 이름·계약」), `domain/settings/keys.ts:1110`에 `evidence.max_size_mb`(05-04 「06-02가 계획한 같은 이름을 이 페이즈가 등록」) | 이미 됨 — Task 2 앞절·키 1개 제거. 남는 새 키: `evidence.required`·`evidence.prepaid_due_days`·`purchase.online_vendor_name`·`document_number.purchase_request.*` 4, 메뉴 3 |
| 10 | 06-10 | `files`에 `sha256`+비유니크 인덱스(조건부) | `db/schema/files.ts`에 `sha256` NOT NULL + `files_sha256_idx` 이미 있음(05-04) | 이미 됨 — `db/schema/files.ts` 항목 제거. `expenses.prepaid` 계열은 pr162 `expenses.ts`에 없음 → 유효 |
| 11 | 06-16 · 06-25 | 파일 표 주인 모양 ⒜(CHECK 값 목록) 또는 ⒝(주인별 FK 칸) | `files.owner_kind text NOT NULL` + `files_owner_kind_check ... IN ('expense')`, `owner_id` FK 없음 → **⒜**. `upload_intents.owner_kind`는 CHECK 없음 | 갈래 확정 — ⒜ |
| 12 | 06-03 | `domain/money/tax.ts` 세율 사전 조회(`loadTaxRates`·`taxRatesReader`) | 05-03이 `domain/expenses/tax.ts`[A](`pickTaxDates`, `TaxDateSource.paidDate?` 「지급일 Phase 6 전에는 없음」)를 만들고 「06-03이 같은 파일·같은 이름을 확장한다」 | 누락 — 06-03 files_modified에 `domain/expenses/tax.ts` 추가 검토 |
| 13 | 06-01 · 06-22 | `app/(app)/status-display.ts`(SP-2 낱말→StatusTag kind·variant 매핑, 새 파일) | 낱말→색 한 표가 이미 있다: `ui/status-tag/status-map.ts`(04.6 #158 스킨 A, 2026-10-04 — 플랜 작성(10/1) 뒤; 05가 [M]; 「표에 없는 낱말은 타입 오류」). 05는 `app/(app)/expenses/status-display.ts`[A](`expenseStatusWord`)도 추가. 06-01 본문은 `status-map`을 언급하지 않음 | 병행 매핑 위험 — SP-2를 `status-map.ts`에 합칠지 결정(06-20 「Phase 5 목록 상태 열」 · 06-22 `status-display.ts` 네 값도 같이) |
| 14 | 06-05 · 06-09 · 06-14 · 06-25 외 | `/cards` 폼을 페이지 폼 · 삭제 토스트 `되돌리기` 전제로 서술 | UI-SPEC rev 10: 카드 폼 = 옆 패널(`?new=1`·`?editId=`, `SidePanel`·`PanelForm`), 등록 뒤 토스트 없음, Q2~Q7 확정(구매 완료 취소 불가 · 카드·구매도 줄 실행가 초과 막기 · 지급 방식↔증빙 종류 짝 · 공용 카드 · 사용일 오늘까지/지급일 미래 허용 · …) | 플랜이 rev 9 기준 — 전면 재반영 필요 |

부가: 05의 증빙 규칙(결재 중 증빙 붙이기 `expenses.evidence_attach`, 무효 처리 `expenses.evidence_void`, 「살아 있는 파일 = removed_at IS NULL AND voided_at IS NULL」)은 06 플랜 25개 본문에 0회 등장한다(UI-SPEC rev 10 「증빙 판정 규칙」 절이 06-11 · S4 · S7에 영향).

## 부록 A. `files_modified` 전체 분할 (플랜별)

각 플랜의 `files_modified` = ① 05와 겹침(위 표) + ② 이 브랜치에 있고 05가 안 건드림 + ③ 이 브랜치·05에 없음(신규 후보). ③은 `→NEW`(이 플랜이 첫 등장 = 생성) / `←06-NN`(그 플랜이 이미 올린 파일을 이 플랜이 또 씀)으로 표기.

**06-01** (fm 6 = ∩05 4 + 기존·05무변경 0 + 없음 2)

- ③ 없음: `app/(app)/status-display.ts` →NEW; `test/unit/status-display.test.ts` →NEW

**06-02** (fm 11 = ∩05 4 + 기존·05무변경 3 + 없음 4)

- ② 기존·05 무변경: `test/unit/domain/document-number-format.test.ts`; `test/unit/permissions/can.test.ts`; `test/integration/document-numbering.test.ts`
- ③ 없음: `domain/quotes/line-door.ts` →NEW; `test/unit/domain/money-sum-diff.test.ts` →NEW; `test/unit/domain/line-door.test.ts` →NEW; `test/e2e/phase6-keys.spec.ts` →NEW

**06-03** (fm 17 = ∩05 5 + 기존·05무변경 2 + 없음 10)

- ② 기존·05 무변경: `domain/money/tax.ts`; `test/unit/domain/money-tax.test.ts`
- ③ 없음: `db/schema/expense-payments.ts` →NEW; `domain/payments/index.ts` →NEW; `domain/payments/action-row.ts` →NEW; `repositories/expense-payments.ts` →NEW; `app/(app)/expenses/[id]/payment-action-row.tsx` →NEW; `app/(app)/expenses/[id]/actions.ts` →NEW; `app/(app)/expenses/[id]/actions.registry.ts` →NEW; `test/unit/domain/payments.test.ts` →NEW; `test/integration/expense-payments-concurrency.test.ts` →NEW; `test/e2e/payment-single.spec.ts` →NEW

**06-04** (fm 14 = ∩05 3 + 기존·05무변경 0 + 없음 11)

- ③ 없음: `domain/payments/index.ts` ←06-03; `domain/payments/action-row.ts` ←06-03; `repositories/expense-payments.ts` ←06-03; `app/(app)/expenses/[id]/payment-section.tsx` →NEW; `app/(app)/expenses/[id]/payment-action-row.tsx` ←06-03; `app/(app)/expenses/[id]/actions.ts` ←06-03; `app/(app)/expenses/[id]/actions.registry.ts` ←06-03; `test/unit/domain/payments.test.ts` ←06-03; `test/unit/domain/payments-action-row.test.ts` →NEW; `test/integration/expense-payments.test.ts` →NEW; `test/e2e/payment-single.spec.ts` ←06-03

**06-05** (fm 14 = ∩05 3 + 기존·05무변경 1 + 없음 10)

- ② 기존·05 무변경: `app/(app)/cards/page.tsx`
- ③ 없음: `db/schema/corp-card-usages.ts` →NEW; `domain/corp-card-usages/index.ts` →NEW; `domain/corp-card-usages/amounts.ts` →NEW; `repositories/corp-card-usages.ts` →NEW; `app/(app)/cards/card-usage-list.tsx` →NEW; `app/(app)/cards/card-usage-form.tsx` →NEW; `app/(app)/cards/actions.ts` →NEW; `app/(app)/cards/actions.registry.ts` →NEW; `test/unit/domain/card-usage-amounts.test.ts` →NEW; `test/e2e/card-usage.spec.ts` →NEW

**06-06** (fm 14 = ∩05 2 + 기존·05무변경 0 + 없음 12)

- ③ 없음: `db/schema/expense-payments.ts` ←06-03; `domain/payments/action-row.ts` ←06-03; `domain/payments/index.ts` ←06-03; `domain/evidence-reviews/index.ts` →NEW; `repositories/expense-evidence-reviews.ts` →NEW; `app/(app)/expenses/[id]/evidence-review-section.tsx` →NEW; `app/(app)/expenses/[id]/actions.ts` ←06-03; `app/(app)/expenses/[id]/actions.registry.ts` ←06-03; `test/unit/domain/evidence-reviews.test.ts` →NEW; `test/unit/domain/payments-action-row.test.ts` ←06-04; `test/integration/evidence-reviews.test.ts` →NEW; `test/e2e/payment-single.spec.ts` ←06-03

**06-07** (fm 17 = ∩05 3 + 기존·05무변경 1 + 없음 13)

- ② 기존·05 무변경: `app/(app)/cards/page.tsx`
- ③ 없음: `domain/corp-card-usages/index.ts` ←06-05; `domain/corp-card-usages/link-targets.ts` →NEW; `repositories/quote-line-links.ts` →NEW; `app/(app)/cards/card-usage-form.tsx` ←06-05; `repositories/corp-card-usages.ts` ←06-05; `app/(app)/cards/link-picker.tsx` →NEW; `app/(app)/cards/actions.ts` ←06-05; `app/(app)/cards/actions.registry.ts` ←06-05; `app/(app)/projects/[id]/card-usage-section.tsx` →NEW; `test/unit/domain/rules-card-dual-link.test.ts` →NEW; `test/unit/repositories/quote-line-links-sql.test.ts` →NEW; `test/integration/corp-card-usages.test.ts` →NEW; `test/e2e/card-usage.spec.ts` ←06-05

**06-08** (fm 14 = ∩05 5 + 기존·05무변경 0 + 없음 9)

- ③ 없음: `db/schema/purchase-requests.ts` →NEW; `domain/purchase-requests/index.ts` →NEW; `repositories/purchase-requests.ts` →NEW; `app/(app)/cards/purchases/page.tsx` →NEW; `app/(app)/cards/purchases/purchase-request-form.tsx` →NEW; `app/(app)/cards/purchases/actions.ts` →NEW; `app/(app)/cards/purchases/actions.registry.ts` →NEW; `test/integration/purchase-requests.test.ts` →NEW; `test/e2e/purchase-requests.spec.ts` →NEW

**06-09** (fm 13 = ∩05 0 + 기존·05무변경 1 + 없음 12)

- ② 기존·05 무변경: `app/(app)/cards/page.tsx`
- ③ 없음: `domain/corp-card-usages/index.ts` ←06-05; `domain/corp-card-usages/rights.ts` →NEW; `domain/corp-card-usages/link-targets.ts` ←06-07; `repositories/corp-card-usages.ts` ←06-05; `app/(app)/cards/card-usage-list.tsx` ←06-05; `app/(app)/cards/card-usage-form.tsx` ←06-05; `app/(app)/cards/link-picker.tsx` ←06-07; `app/(app)/cards/actions.ts` ←06-05; `app/(app)/cards/actions.registry.ts` ←06-05; `test/unit/domain/card-usage-rights.test.ts` →NEW; `test/integration/corp-card-usages-proxy.test.ts` →NEW; `test/e2e/card-proxy.spec.ts` →NEW

**06-10** (fm 15 = ∩05 5 + 기존·05무변경 0 + 없음 10)

- ③ 없음: `domain/evidence-reviews/index.ts` ←06-06; `domain/evidence-reviews/prepaid.ts` →NEW; `repositories/expense-payments.ts` ←06-03; `app/(app)/expenses/expense-form.tsx` →NEW; `app/(app)/expenses/[id]/evidence-review-section.tsx` ←06-06; `app/(app)/expenses/[id]/actions.ts` ←06-03; `app/(app)/expenses/[id]/actions.registry.ts` ←06-03; `test/unit/domain/evidence-prepaid.test.ts` →NEW; `test/integration/evidence.test.ts` →NEW; `test/e2e/evidence-waive-prepaid.spec.ts` →NEW

**06-11** (fm 15 = ∩05 4 + 기존·05무변경 0 + 없음 11)

- ③ 없음: `domain/evidence-reviews/index.ts` ←06-06; `domain/evidence-reviews/cost-basis.ts` →NEW; `domain/evidence-reviews/upload-checks.ts` →NEW; `domain/expenses/evidence.ts` →NEW; `repositories/expense-evidence-reviews.ts` ←06-06; `app/(app)/expenses/expense-form.tsx` ←06-10; `test/unit/domain/evidence-cost-basis.test.ts` →NEW; `test/unit/domain/evidence-upload-checks.test.ts` →NEW; `test/integration/evidence-invalidation.test.ts` →NEW; `test/integration/evidence-upload-intent.test.ts` →NEW; `test/e2e/evidence-lifecycle.spec.ts` →NEW

**06-12** (fm 14 = ∩05 1 + 기존·05무변경 1 + 없음 12)

- ② 기존·05 무변경: `app/(app)/cards/page.tsx`
- ③ 없음: `db/schema/corp-card-usages.ts` ←06-05; `domain/purchase-requests/index.ts` ←06-08; `domain/purchase-requests/policy.ts` →NEW; `domain/corp-card-usages/index.ts` ←06-05; `domain/corp-card-usages/rights.ts` ←06-09; `app/(app)/cards/card-usage-form.tsx` ←06-05; `app/(app)/cards/purchases/page.tsx` ←06-08; `app/(app)/cards/purchases/actions.ts` ←06-08; `app/(app)/cards/purchases/actions.registry.ts` ←06-08; `test/unit/domain/purchase-policy.test.ts` →NEW; `test/integration/purchase-requests.test.ts` ←06-08; `test/e2e/purchase-requests.spec.ts` ←06-08

**06-13** (fm 14 = ∩05 4 + 기존·05무변경 2 + 없음 8)

- ② 기존·05 무변경: `domain/quotes/edit-scope.ts`; `test/unit/domain/quote-edit-scope.test.ts`
- ③ 없음: `domain/quotes/line-status.ts` →NEW; `repositories/quote-line-links.ts` ←06-07; `domain/payments/index.ts` ←06-03; `test/unit/domain/quote-line-status.test.ts` →NEW; `test/unit/domain/rules-line-paid-lock.test.ts` →NEW; `test/integration/quote-line-links.test.ts` →NEW; `test/integration/dual-link-concurrency.test.ts` →NEW; `test/e2e/quote-line-status.spec.ts` →NEW

**06-14** (fm 14 = ∩05 0 + 기존·05무변경 0 + 없음 14)

- ③ 없음: `domain/purchase-requests/index.ts` ←06-08; `domain/purchase-requests/policy.ts` ←06-12; `domain/corp-card-usages/index.ts` ←06-05; `repositories/purchase-requests.ts` ←06-08; `app/(app)/cards/purchases/page.tsx` ←06-08; `app/(app)/cards/purchases/purchase-request-form.tsx` ←06-08; `app/(app)/cards/purchases/actions.ts` ←06-08; `app/(app)/cards/purchases/actions.registry.ts` ←06-08; `app/(app)/cards/link-picker.tsx` ←06-07; `app/(app)/cards/card-usage-list.tsx` ←06-05; `app/(app)/cards/card-usage-form.tsx` ←06-05; `test/unit/domain/purchase-policy.test.ts` ←06-12; `test/integration/purchase-requests.test.ts` ←06-08; `test/e2e/purchase-requests.spec.ts` ←06-08

**06-15** (fm 14 = ∩05 6 + 기존·05무변경 1 + 없음 7)

- ② 기존·05 무변경: `ui/table/Table.module.css`
- ③ 없음: `domain/payments/targets.ts` →NEW; `domain/payments/batch.ts` →NEW; `repositories/payment-targets.ts` →NEW; `app/(app)/expenses/payment-targets-table.tsx` →NEW; `app/(app)/expenses/batch-payment-dialog.tsx` →NEW; `test/integration/payment-batch.test.ts` →NEW; `test/e2e/payment-batch.spec.ts` →NEW

**06-16** (fm 15 = ∩05 5 + 기존·05무변경 6 + 없음 4)

- ② 기존·05 무변경: `domain/quotes/revisions.ts`; `domain/reserves/index.ts`; `app/(app)/projects/[id]/revision-section.tsx`; `app/(app)/pnl/reserves/actions.ts`; `app/(app)/pnl/reserves/actions.registry.ts`; `app/(app)/pnl/reserves/reserves-table.tsx`
- ③ 없음: `domain/evidence-attachments/index.ts` →NEW; `domain/expenses/evidence.ts` ←06-11; `test/integration/approval-reserve-evidence.test.ts` →NEW; `test/e2e/approval-reserve-evidence.spec.ts` →NEW

**06-17** (fm 14 = ∩05 6 + 기존·05무변경 0 + 없음 8)

- ③ 없음: `domain/payments/targets.ts` ←06-15; `domain/payments/batch.ts` ←06-15; `app/(app)/expenses/payment-targets-table.tsx` ←06-15; `app/(app)/expenses/batch-payment-dialog.tsx` ←06-15; `test/unit/domain/payments-targets.test.ts` →NEW; `test/unit/ui/table-selectable.test.ts` →NEW; `test/integration/payment-batch.test.ts` ←06-15; `test/e2e/payment-batch.spec.ts` ←06-15

**06-18** (fm 14 = ∩05 5 + 기존·05무변경 4 + 없음 5)

- ② 기존·05 무변경: `db/schema/revenue-entries.ts`; `domain/projects/ledger.ts`; `domain/revenue/index.ts`; `app/(app)/projects/[id]/revenue-section.tsx`
- ③ 없음: `domain/issue-requests/index.ts` →NEW; `repositories/revenue-issue-requests.ts` →NEW; `app/(app)/projects/[id]/issue-request-table.tsx` →NEW; `test/integration/issue-requests.test.ts` →NEW; `test/e2e/issue-requests.spec.ts` →NEW

**06-19** (fm 13 = ∩05 5 + 기존·05무변경 0 + 없음 8)

- ③ 없음: `repositories/pre-settle-check.ts` →NEW; `domain/pre-settle-check/index.ts` →NEW; `domain/pre-settle-check/summary.ts` →NEW; `domain/approvals/settlement.ts` →NEW; `app/(app)/projects/[id]/pre-settle-check.tsx` →NEW; `test/unit/domain/pre-settle-check.test.ts` →NEW; `test/integration/pre-settle-check.test.ts` →NEW; `test/e2e/pre-settle-check.spec.ts` →NEW

**06-20** (fm 11 = ∩05 2 + 기존·05무변경 0 + 없음 9)

- ③ 없음: `domain/payments/targets.ts` ←06-15; `domain/payments/index.ts` ←06-03; `repositories/payment-targets.ts` ←06-15; `app/(app)/expenses/paid-list.tsx` →NEW; `app/(app)/expenses/payment-targets-table.tsx` ←06-15; `app/(app)/expenses/[id]/payment-section.tsx` ←06-04; `app/(app)/expenses/[id]/payment-action-row.tsx` ←06-03; `test/integration/payment-batch.test.ts` ←06-15; `test/e2e/payment-batch.spec.ts` ←06-15

**06-21** (fm 11 = ∩05 1 + 기존·05무변경 2 + 없음 8)

- ② 기존·05 무변경: `app/(app)/projects/page.tsx`; `app/(app)/projects/filter-bar.tsx`
- ③ 없음: `domain/issue-requests/index.ts` ←06-18; `repositories/revenue-issue-requests.ts` ←06-18; `app/(app)/projects/[id]/issue-request-table.tsx` ←06-18; `app/(app)/projects/issue-requests/page.tsx` →NEW; `app/(app)/projects/issue-requests/issue-requests.module.css` →NEW; `test/unit/domain/issue-requests.test.ts` →NEW; `test/integration/issue-requests.test.ts` ←06-18; `test/e2e/issue-requests.spec.ts` ←06-18

**06-22** (fm 9 = ∩05 4 + 기존·05무변경 0 + 없음 5)

- ③ 없음: `app/(app)/approvals/[id]/page.tsx` →NEW; `app/(app)/status-display.ts` ←06-01; `app/(app)/projects/[id]/pre-settle-check.tsx` ←06-19; `test/integration/pre-settle-check.test.ts` ←06-19; `test/e2e/pre-settle-check.spec.ts` ←06-19

**06-23** (fm 9 = ∩05 6 + 기존·05무변경 0 + 없음 3)

- ③ 없음: `domain/next-turn/phase6-items.ts` →NEW; `test/unit/domain/next-turn-phase6.test.ts` →NEW; `test/e2e/next-turn-phase6.spec.ts` →NEW

**06-24** (fm 3 = ∩05 2 + 기존·05무변경 0 + 없음 1)

- ③ 없음: `test/e2e/management-flow.spec.ts` →NEW

**06-25** (fm 15 = ∩05 3 + 기존·05무변경 0 + 없음 12)

- ③ 없음: `domain/evidence-attachments/index.ts` ←06-16; `domain/evidence-reviews/upload-checks.ts` ←06-11; `domain/corp-card-usages/index.ts` ←06-05; `repositories/corp-card-usages.ts` ←06-05; `domain/purchase-requests/index.ts` ←06-08; `app/(app)/cards/actions.ts` ←06-05; `app/(app)/cards/actions.registry.ts` ←06-05; `app/(app)/cards/card-usage-form.tsx` ←06-05; `app/(app)/cards/card-usage-list.tsx` ←06-05; `app/(app)/cards/purchases/actions.ts` ←06-08; `test/integration/card-usage-evidence.test.ts` →NEW; `test/e2e/card-usage-evidence.spec.ts` →NEW

