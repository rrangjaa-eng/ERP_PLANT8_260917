---
phase: 06
reviewers: [reconcile-2026-10-05, replan-A-05-names, replan-B-uispec-r10, replan-C-prior-reviews, replan-D-plan-inventory]
reviewed_at: 2026-10-05
plans_reviewed: [06-01 … 06-25, 06-UI-SPEC (rev 10 r2), 06-VALIDATION]
base:
  this_branch: 90fcd1c8 (claude/06-ui-spec-revision-oju6s5 = main 341537c1 + UI-SPEC rev 10)
  phase05: PR #162 head a972a5ac (05-13 미실행 — 줄 번호는 밀린다, 심볼 이름 + grep 가드로 적는다)
  phase06_1: PR #164 head 002adca3
sources:
  - replan/reconcile.md (2026-10-05 01:20, 플랜 ↔ 05 · 04.6 · 6.1 · 옛 시스템 대조, §8 질문 7개 = 00:55 사용자 확정)
  - replan/replan-A-05-names.md (05 실제 이름 25건 · 05 변경 경로 137개)
  - replan/replan-B-uispec-r10.md (UI-SPEC rev 10 → 플랜 조치 · 충돌 C1~C14 · 판단 J1~J8 · UI Considerations 199행)
  - replan/replan-C-prior-reviews.md (지난 게이트 잔여 RS/ST/CF/CL/K · 옛 대조 GA · 6.1 기대 · 요구사항 RQ)
  - replan/replan-D-plan-inventory.md (25행 인벤토리 · 웨이브 · 05 겹침 · 위험 경로 · 크기)
  - replan/notes-A..D (reconcile 근거 메모)
---

# Phase 06 — REVIEWS (재계획 `--reviews` 입력 색인)

이 파일은 새 리뷰가 아니다. 2026-09-26에 짠 플랜 25개가 그 뒤 들어온 05 실물(PR #162), 04.6 스킨 A, UI-SPEC rev 10, 6.1(PR #164), 옛 시스템 대조와 어긋나는 곳을 모은 **재계획 입력 색인**이다(선례 `04.6-REVIEWS.md` · `06.1-REVIEWS.md`). 세부 근거(파일:줄)와 고칠 문구는 `replan/` 메모가 정본이다 — 항목 ID(예: A#6, B-C2, C-CL-1, D§5)로 찾아 범위 Read한다.

「세션 수용」은 사용자 승인이 아니다. 제품 뜻을 새로 정하지 않는 계획 내부 수정이거나 이미 있는 사용자 결정에 맞추는 수정이다. 사용자는 PR #165에서 어느 항목이든 거부할 수 있다.

## 0. 사용자 답 (2026-10-05, 이 스레드 카드 — UC-3만 추천과 다름)

| ID | 질문 | 답 | 기록 |
|---|---|---|---|
| R-Q1~Q7 | reconcile §8 일곱 질문 | 모두 추천안(00:55): Q2 구매 완료 취소는 `신청됨`에서만, 잘못 처리는 조정 줄 · Q3 카드 · 구매 요청도 견적 줄 실행가 초과를 막음(줄별 실행가 합계, 고정 상한 없음) · Q4 지급 방식↔증빙 종류 짝을 설정(기본 빈값 = 막지 않음, 판정은 지급 완료 때) · Q5 공용 법인카드 받음 · Q6 카드 사용일은 오늘까지, 지급일은 미래 허용 · Q7 카드 매출 「매출 미입력」은 06 그대로(강행 허용 설정), 카드 매출은 Phase 9 | reconcile §8 |
| U-1 | 계획 교차 검토 | **Opus 교차 검토** — 플랜 체커(Opus) + 별도 Opus 적대적 검토. Codex는 디자인 검토에서만(CLAUDE.md §6 · 훅 R3). 「Codex 재확인(09-29 이후)」 꼬리표는 닫는다 | 카드 10:48 |
| U-2 | 공용 카드 사용 등록 자격 | **대리 등록 권한자만**(`cards.proxy`) — 새 칸 · 권한 없음 | 카드 10:50 |
| U-4 | 완료 프로젝트 사후 처리 | **연다** — 지급 · 지급 취소 · 구매 완료 · 경영관리 증빙 붙이기는 완료 뒤에도 된다. PM(기안자)의 추가 붙임은 완료 프로젝트에서 막는다. 6.1-06 E40은 6.1 스레드가 맞춘다(코디네이터에 전달함) | 카드 10:50 |
| U-6 | UI-SPEC 열린 선택 16행(O-1,3,4,5,7,8,10~17,19,20) | **모두 추천안 확정** — UI-SPEC 표 「확정」 표기로 고친다(O-2도 표기만) | 카드 10:50 |
| U-8 | 카드 대사 금액이 실행가 초과 | **파일이 이김** — 직원 등록은 Q3대로 막고, 6.1 대사 덮기는 막지 않고 초과 표시만 | 카드 10:50 |
| U-3 | 반려 · 회수 지출결의 종결 | **기안자 + 경영관리**(사유 필수, 되돌림 없음) | 카드 11:58 |
| B-C8 | 선결제 증빙 기한 초과 「내 차례」 받는 사람 | **기안자** | 카드 11:58 |
| UC-1 | 견적 외 비용 줄에 이은 사용 건 금액 올리기 | **같은 Q3 상한**(넘으면 막고 04 견적표에서 줄 금액을 고친다) | 카드 22:27 KST(13:27Z) |
| UC-2 | 새 카드 사용 건 증빙 붙이기 | **05처럼** 저장 뒤 상세에서 붙이기, S13에 붙이기 칸 없음 | 카드 22:28 KST |
| UC-3 | 구매 요청 상한에서 다른 `신청됨` 요청 금액 | **뺀다(추천과 다름)** — 남은 실행가 = 실행가 − 카드 사용 공급가 합 − 그 줄 다른 `신청됨` 요청 예상 공급가 합. 신청 · 되돌리기 · 구매 완료 · 카드 직접 등록 · 고르기 2행 모두 같은 식(06-07 `lineRoom`). `취소` 요청은 빠진다 | 카드 22:29 KST |

답이 추천과 다르게 오면 해당 플랜 한 곳만 고친다(C9 · 06-23).

CONTEXT의 잠긴 결정(D-601~D-613)은 다투지 않는다. 옛 시스템(260907) **화면**과는 비교하지 않는다(사용자 지시). 옛 **규칙**은 gap-audit 행대로 반영한다.

## 1. 재계획 공통 결정 (플랜끼리 같은 이름을 쓰도록 오케스트레이터가 고정)

| # | 결정 | 근거 |
|---|---|---|
| C1 | **첫 태스크 = SP 승격.** 06-01 Task 1이 UI-SPEC의 SP-1 · SP-4 · SP-8을 `docs/design/DECISIONS.md`에 기록하고 같은 태스크에서 `docs/design/SYSTEM.md` 해당 절로 승격한다(DECISIONS 먼저 → SYSTEM). SP-2 · 3 · 5 · 7과 짝 격자 SP-9도 같은 순서로 기록 · 승격하되 SP-6(철회)은 넣지 않는다. 결정자 칸 = UI-SPEC rev 10 approved + `/plan-design-review` 통과 + 사용자 체크포인트(06-01 기존 checkpoint 재사용). 검사 정규식은 `SP-[1-9]` 집합으로 | 코디네이터 지시 · B §0.1 · B-C11 · B-J3 |
| C2 | **상태 낱말은 `ui/status-tag/status-map.ts` 한 곳.** 새 `status-display.ts` 표를 만들지 않는다(06-01 · 06-13 · 06-20 · 06-22). 새 낱말은 처음 쓰는 플랜이 `status-map.ts`에 더한다. 구매 요청 상태는 `신청됨`(맨 `신청` 금지). domain 값 → 낱말 변환이 필요하면 05 `expenseStatusWord` 꼴 함수만(이름은 `*-word.ts`) | A#11 · B-J8 · C-ST-3 |
| C3 | **05 실물 이름이 정본.** 아래와 `replan-A` §1 25행을 그대로 쓴다: 목록 `app/(app)/expenses/(list)/page.tsx` · 액션 `app/(app)/expenses/actions.ts` · 폼 `app/(app)/expenses/[id]/expense-form.tsx` · 정산 훅 `domain/settlements/index.ts`의 `prepareFinalApproval` · `onFinalApprovalInTx` · `approveBlockedReason`(정의 `domain/approvals/kinds.ts`) — `domain/approvals/*`에 종류 이름 리터럴 금지(`approvals-extensions.test.ts`) · `lockExpenseForUpdate` · `pickTaxDates`/`incomeTypeFor`(`domain/expenses/tax.ts`, 부가세 대체일 = 작성일 D-101) · `sumKrw`/`diffKrw`(`domain/money`, 이미 있음) · `EVIDENCE_MAX_SIZE_MB`(이미 있음 — 06-02 키는 셋) · 번호는 `repositories/document-counters.ts` `allocateNumber` + `expense` 선례(`allocateExpenseNumber` 일반화 안 함) · 줄 상태는 05-15 `lineStatusWord` 확장(새 `domain/quotes/line-status.ts` 없음) · 프로젝트 완료값 `completed`(`settled` 아님) · 완료 잠금 규칙 `project.line-edit` · `quoteLockReason` · `CompletedProjectError`(`project.completed-lock`은 없다). 실행 ⓪은 줄 번호가 아니라 `git grep` 존재 확인으로 | A §요약 · A §1 · C-ST-1 · B-C3 · B-C6 |
| C4 | **증빙은 05 `domain/evidence` 확장.** 새 `domain/evidence-reviews/upload-checks.ts` · `domain/evidence-attachments` · `domain/expenses/evidence.ts`를 만들지 않는다. `OWNER_RULES`(`domain/evidence/index.ts`)와 `checkEvidenceUpload`(`upload-checks.ts`)를 넓힌다. 살아 있는 파일 = `removed_at IS NULL AND voided_at IS NULL`. 확인을 푸는 훅은 05 실물 두 경로뿐(`completeEvidenceUpload`(승인 뒤 기안자 추가) · `voidEvidence`(시스템 관리자 무효)), **확인 기록이 있는 결재 통과 문서에서만** 확인을 풀고 문서 version +1(결재 중 · 초안에서는 version을 올리지 않는다 — X-1). SP-6 「마지막 증빙 삭제 확인」은 철회 | A#4 · A#7 · A#25 · B-C2 · 05 지시서 `/mnt/project-files/05-prep/evidence-in-approval-rule.md` |
| C5 | **`hasEvidence` 한 함수.** 06-03(W 앞쪽)이 지출결의 증빙 유무 순수 판정 `hasEvidence`를 `domain/evidence/`에 두고 선택 `tx` 인자를 받는다. 트랜잭션 안 호출은 `tx`를 넘긴다(grep · 테스트 가드). 06-04 · 06-06 · 06-10 · 06-11 · 06-15 · 06-19 · 06-20 · 06-23이 파일 수를 직접 세지 않고 이것을 부른다. 06-25 카드 DTO 불리언은 `hasCardSlip`으로 이름을 바꾼다 | C-K-1 · B-C4 · U-9 |
| C6 | **증빙 금액 · 증빙일 칸.** 05에 없다. `expenses.evidence_amount bigint NULL` · `expenses.evidence_date date NULL`을 C8 스키마 플랜이 더하고, 기안자 입력(편집 가능 상태)과 경영관리 「금액 고쳐 확인」(D-602)은 06-06이 domain 함수로 짓는다. 비용 기준(EVID-03 · 04)은 06-11 | A#6 · reconcile 06-03 |
| C7 | **위험 경로는 앞쪽 별도 PR(사용자 머지), 나머지는 무인 흐름.** 플랜에 흩어진 `db/schema/*` · `db/migrations/*` · `domain/permissions/menus.ts` 변경을 C8 · C9 두 플랜으로 모은다. 다른 플랜은 스키마 · 마이그레이션 · 메뉴 키 파일을 `files_modified`에 두지 않고 그 플랜에 `depends_on`한다. 06-24 R-4(마이그레이션 재생성)는 C9 PR 머지 직전 한 번으로 줄인다. 마이그레이션 번호는 예약하지 않는다(`NNNN`, `pnpm db:generate`). 기존 표 CHECK 확장은 NOT VALID + `--custom` VALIDATE 두 파일 | CLAUDE.md §4 머지 · D§5 · A#9 · A#10 |
| C8 | **새 플랜 06-26 「공용 법인카드 스키마」(PR-0, 사용자 머지, risk: db-schema, migration).** `corp_cards_owner_xor_check`(`db/schema/corp-cards.ts:32-35`)를 「개인 · 팀 · 둘 다 없음(공용)」으로 완화하는 마이그레이션 + 스키마만. `CardOwnerKind`에 `shared` · 관리자 카드 폼 `공용` 옵션 · 자격 판정(U-2: 공용 카드 사용 등록은 `cards.proxy` 권한자만)은 06-05가 코드로. 06-05 · 06-09 · 06-12는 06-26 뒤 | 코디네이터 지시 · D§4 · B-C5 · B-J2 · U-2 |
| C9 | **새 플랜 06-27 「06 스키마 · 권한 키 묶음」(PR-A, 사용자 머지, risk: db-schema, migration, permissions).** 새 표 `expense_payments` · `expense_evidence_reviews` · `corp_card_usages`(+`purchase_request_id` FK · unique · CHECK, 보관 칸) · `purchase_requests` · `revenue_issue_requests`, 기존 표 ALTER `expenses`(+`prepaid` · `prepaid_reason` · `evidence_amount` · `evidence_date` · 종결 칸 `closed_at` · `closed_by` · `closed_reason`), `files_owner_kind_check` 확장(`quote_revision` · `reserve_entry` · `corp_card_usage`), 메뉴 키 `expenses.payments` · `cards.purchases` · `cards.proxy`(+ 종결에 새 키가 필요하면 여기). `files.sha256`은 05에 이미 있어 뺀다. 각 표의 제약은 원래 플랜(06-03 · 05 · 06 · 08 · 10 · 12 · 16 · 18 · 25)의 스키마 태스크를 옮긴 것 — 그 플랜들은 「표 사용」 태스크만 남긴다 | D §1 표 · A#12 · C11 |
| C10 | **새 플랜 06-28 「반려 · 회수 지출결의 종결」(risk: money, approvals — Opus 실행자 + Opus 독립 검토 1).** U-3 추천안: 행위자 기안자 + 경영관리, 사유 필수, 되돌림 없음(재제출은 05가 이미 허용), 번호 재사용 없음. 종결 표시는 `expenses` 칸(C9) — 결재 공통 모듈 상태값은 건드리지 않는다. 종결 문서는 `expenseLineDoor` 입력 · `listNumberedByLines` · `remainingForInstallments` 호출부 넷 · 홈 「막힌 문서」에서 뺀다. 로그는 끌 수 없는 종류(`ALWAYS_ON_ACTION_TYPES` — 새 종류가 필요하면 그 목록에 넣는다). 화면: 반려 · 회수 상태 문서 상세의 위험 동작 자리(SYSTEM 위험 동작 분리)에 `종결` 한 버튼 → 사유 한 칸 확인 창(되돌릴 수 없는 일이라 확인 창 허용) → 문서 상태 낱말 `종결`(status-map). 06-07 「살아 있는 지출결의」 · 06-13 줄 상태 · 06-19 D-611 미결 집계 · PS-1 · PS-2 · 06-23은 종결 문서를 뺀다. UI-SPEC에 S23 한 절로 적는다(C14). requirements: PROJ-06 · EXP-06. todo `.planning/todos/pending/2026-09-26-phase-6-rejected-expense-close-path.md`(05 브랜치)를 닫는다 | C-CL-1 · A#16 · B §3 · 사용자 결정 2026-09-26(05 06-CONTEXT:11) |
| C11 | **새 플랜 06-29 「Phase 6 공용 조각 컴포넌트」(J1).** ① `ListScreen.primaryAction` 버튼 갈래(지금 링크뿐) ② SP-8 검색 고르기 = 05 `ui/pick-dialog/PickDialog` 위에 얹는다(검색 · 행 막힘 · 현재 줄 · 1차 `이 줄로` Enter · LOADING · EMPTY · ERROR) — `ui/confirm-dialog`에 새 갈래를 만들지 않는다(U-7, 6.1-03 G-4는 「있으면 확장」) ③ 짝 격자 입력(SP-9, O-23) ④ `ui/table` selectable 폭 식 ⑤ SP-7 `attachments` 상태 계약. 각각 DECISIONS → SYSTEM(C1에서 끝남) → 컴포넌트 → `/dev/components` → 단위 테스트. 새 색 · 서체 · radius 없음. 06-02 · 06-07 · 06-15 · 06-17은 이것을 쓰기만 한다 | B-C14 · B-J1 · B-C10 · C-CF-8 |
| C12 | **스킨 A 정렬(기계적).** 옛 토큰(`--bg/--fg/--muted/--danger/--warning/--success/--fs-*/--modal-w/--row-min`) → 두 단 이름(B §5.1 표) · 「2px 섹션 선 · 합계 18px」 → 1px `--border-row` · 14 굵게 · 한 건 폼(S9 카드 사용 · S12 구매 완료 · S13 구매 요청 · 06-09 수정)은 옆 패널(`SidePanel`/`PanelForm`, `/cards?new=1` 페이지 폼 없음 — S13은 `/cards/purchases?purchase={id}`) · 토스트 없음(되돌리기는 표 위 결과 줄 + 3차 `되돌리기`, B §5.4) · `PageHeader` 부제 없음 · 「담당 PM」 → 기안자(P3) · rev 8/9 줄 고정을 rev 10 절 이름으로 · SYSTEM 인용은 줄 번호 대신 절 이름(B-C12) | B §5 · B-C9 · B-C12 |
| C13 | **로드 오류 문구는 명사형** `… 불러오지 못함 · 다시 시도`(`error-copy-noun-style.test.ts`). 상세 섹션 부제(S15 · S18)는 없애고 그룹 머리글 · 합계 행이 말한다(B-J6 (c)) — 정보가 모자라면 eng/design 검토가 `subtitle?`를 SP-10으로 제안 | B-C1 · B-C13 |
| C14 | **UI-SPEC rev 10 → r3 정정(이 재계획 커밋 안).** 열린 선택 16행 「확정」 표기(U-6) · S23 종결 절(C10) · SP-8 = PickDialog(C11) · C13 문구 · O-23/C8 받는 사람 · U-4(완료 뒤 사후 처리) · U-8(대사 초과 표시) · 공용 카드 자격(U-2). 새 화면 디자인이 아니라 결정 반영이다. 화면 검토는 실행 뒤 `/design-review`(+Codex)에서 | U-6 · C10 · B §4.4 |
| C15 | **실행 순서 게이트.** 06 코드 플랜 23개가 05 파일과 겹친다(D §1). **06 실행은 PR #162(05)가 main에 머지된 뒤 시작**하고, 06-01 execution_gate에 「`git ls-files .planning/phases/05-expense-approval-leave/05-13-SUMMARY.md` 존재 + 05 심볼 grep」 한 줄을 둔다. 05 머지 뒤 첫 웨이브 전에 06 플랜 체커를 한 번 다시 돌려 줄 번호 어긋남을 반영한다(6.1 E36과 같은 규율) | D §1 · A §0 |
| C16 | **요구사항 청구.** MAST-05 → 06-02(관리 코드표 화면에 `payment_method` 확인 + 값 목록 + Q4 짝 격자 연결) · OPS-09 → 06-03 · 06-12(+06-04 지급 취소) · EVID-01 → 06-24 requirements에 더함(06-25 유지) · 지급 취소 로그(D-606)는 끌 수 없는 종류로(CF-9). REQUIREMENTS · ROADMAP 문구 수정은 06-01 Task 3 REQ-ROUTE가 GSD 도구로 | C §4.2 · U-5 |
| C17 | **`risk:` 태그.** 돈: 06-03 · 04 · 05 · 06 · 12 · 15 · 17 · 28 / 잠금: 04 · 07 · 13 · 17 · 21 / 결재: 19 · 22 · 28 / 권한: 02 · 09 · 20 / 스키마 · 마이그레이션: 26 · 27. 태그가 있는 플랜은 Opus 실행자 + Opus 독립 검토 1(CLAUDE.md §4 Build). Post-build 게이트: 돈 · 결재 경로(`domain/money` · `corp-cards` · `approvals`, `repositories/corp-cards` · `approvals`)는 `/review` + `/cso`, 화면은 + `/design-review`(Codex 포함) · `/qa` | reconcile §2 공통 · CLAUDE.md §4 |
| C18 | **웨이브는 실제 의존으로만.** 지금 12웨이브 깊이는 `_journal.json` 직렬화 탓이다(D §2). C7로 마이그레이션이 두 플랜에 모이니, `depends_on`은 코드 · 데이터 의존만 남기고 같은 웨이브에서 같은 파일을 둘이 쓰지 않게 한다(웨이브 번호에만 기대는 충돌 쌍 — `domain/rules/register.ts` · `domain/settings/keys.ts` · `test/integration/leak-scan.test.ts` · `domain/payments/index.ts` — 은 명시 `depends_on`) | D §2 · D §3 |
| C19 | **PR 묶음.** PR-0 06-26(사용자 머지) → PR-A 06-27(사용자 머지) → 코드 PR들(무인 머지 가능: `/review`, 돈 · 결재 묶음은 + `/cso`, 화면 묶음은 + `/design-review` · `/qa`). 각 코드 PR은 origin/main 머지 커밋으로 위험 경로 diff가 0인지 확인(6.1 E37 규율). 묶음 경계는 06-01 execution_gate 표에 적는다 | CLAUDE.md §4 · 6.1 C7 |

## 2. 플랜별 반영 목록 (전부 세션 수용 — `<action>` · `<acceptance_criteria>` · `<verify>` · `must_haves` · threat model에 보이게)

공통(모든 플랜): C2 · C3 · C12 · C13 · C15 · C17 · C18 적용, 지난 ledger의 rev 8/9 고정 갱신, 「Codex 재확인」 꼬리표 삭제(U-1), UI-SPEC `## UI Considerations` 199행 중 그 플랜 화면 몫을 must_haves로(B §6 — 특히 §6.1 더한 25행 · 바뀐 41행 · §6.3 빠진 28행).

| 플랜 | 반영 (ID는 replan 메모) |
|---|---|
| 06-01 | C1(첫 태스크) · C2(status-display.ts 삭제 → status-map 낱말) · C15 execution_gate · C19 PR 표 · C16 REQ-ROUTE · B §2.4 06-01 블록 · B-C11 · F16 tokens.test 단언 · ROADMAP 06-01 줄 「SP-1~6」 정정(GSD 도구) |
| 06-02 | A#1 · A#2(키 셋) · A#3(번호) · `resolveLineDoor` → 05 `expenseLineDoor`와 낱말 정리(A#4) · 메뉴 키는 C9로 이동 · Q4 짝 설정 키(빈값=허용) · MAST-05(C16) · B-C7(「화면 코드 없이」 두 줄 삭제, 짝 격자는 C11) |
| 06-03 | C5 `hasEvidence` · A#5 `pickTaxDates`(대체일=작성일) · A#8 `lockExpenseForUpdate` · 스키마는 C9로 · OPS-09 · 제출 게이트 ⑧ `domain/expenses/gate.ts` 확인(A#19) |
| 06-04 | 담당 PM은 `projects.pmUserId`가 아니라 기안자 기준 문구(P3) · Q6 미래 지급일 허용(UI-SPEC 「예정 지급」) · 지급 취소 로그 끌 수 없는 종류(C16 · CF-9) · U-4 완료 뒤 지급 · 취소 · C4 version 규칙 |
| 06-05 | C8 공용 카드 코드(`CardOwnerKind` `shared` · 관리 폼 · U-2 자격) · 옆 패널(C12) · `createCardUsage(…, tx?)`(6.1-09 전제) · Q3 실행가 초과 막음 · Q6 사용일 오늘까지 · 스키마는 C9로 |
| 06-06 | C4 · C6(증빙 금액 · 증빙일 domain) · `resolveEvidenceStatus` 입력에 증빙 기록 수 · 「등록이 곧 확인」 자리(6.1 D-6117) — 미리 짓지 않음 · 스키마는 C9로 |
| 06-07 | Q3 실행가 초과 막음(카드 쪽) · SP-8 = C11 PickDialog · 「살아 있는 지출결의」에서 반려 · 회수 · 종결 취급(C10) · U-8 대사 초과는 6.1 몫(06은 막음 규칙만, 대사 경로 예외 자리) |
| 06-08 | C9로 스키마 이동 · 번호 A#3 · 낱말 `신청됨` · OPS-09 구매 로그 확인 |
| 06-09 | 옆 패널 수정 폼 · 완료값 `completed`(A-601 가드) · U-4 · O-11(확정) · 06-26 뒤 |
| 06-10 | `files.sha256` 삭제(05에 있음) · `prepaid` 칸은 C9로 · 폼 경로 `[id]/expense-form.tsx` · O-4 · O-5 확정 |
| 06-11 | **재설계(C4).** 훅 두 경로 · 확인 기록 있는 결재 통과 문서만 · SP-6 삭제 · `checkEvidenceUpload` 확장 · `ownerKinds` 인자 · 고아 청소 절차 자리 `docs/EVIDENCE-STORAGE.md` §6(OPERATIONS.md 아님, A#24) · A-608-T 해소됨(A#23) · EVID-04 문구 「무효 처리하면」 |
| 06-12 | 완료 프로젝트 구매 완료 허용(행 38 · U-4) · 옆 패널 · 스키마 C9로 · Q2 · O-19 · O-20 확정 · OPS-09 |
| 06-13 | `lineStatusWord` 확장(B-C3 · 우선순위 여덟 값) · `expense.line-paid-lock`은 05-15 D-66 위에 · 종결 제외(C10) · O-14 확정 |
| 06-14 | Q2(취소는 `신청됨`에서만, 이미 있음) · 옆 패널 · 낱말 |
| 06-15 | 목록 경로 `(list)/page.tsx` · ListScreen 버튼 갈래는 C11에서 받음(파일 14 유지) · selectable(C11 ④) · `hasEvidence` · 「E2E 가정 훅이 version을 올림」 정정(C4) |
| 06-16 | 05 `OWNER_RULES` · `files_owner_kind_check` 확장(스키마는 C9) · 새 `domain/evidence-attachments` 없음 |
| 06-17 | `--modal-w` → `--dialog-w` · 표 키보드 04.6 Table · SP-7 슬롯은 C11 ⑤ 계약 사용 · Task 4개 크기 근거 |
| 06-18 | 스키마 C9로 · O-12 확정 · 낱말 |
| 06-19 | `domain/settlements` + 종류 훅(C3) · 종결 제외(C10) · 무효 파일 제외(C4) · Q7 그대로 · O-16 확정 |
| 06-20 | `(list)/page.tsx` · StatusTag text 열 · 계좌 셀 경로 재확인(거래처 옆 패널) · O-17 확정 · Task 4개 크기 근거 |
| 06-21 | 토큰 · TOCTOU(RS-12) 한 줄 판정 |
| 06-22 | `approveBlockedReason` · `prepareFinalApproval` · `onFinalApprovalInTx`로(approvals/index.ts 분기 금지) · O-16 |
| 06-23 | `listEvidenceVoidSignals`(05 실명은 A 참조)와 「증빙 없음」 신호 하나로 · B-C8 선결제 기한 초과 = 기안자 · 종결 제외 · O-1 · O-15 확정 |
| 06-24 | R-4는 06-27 PR 직전 한 번(C7) · EVID-01 requirements · Codex 꼬리표 삭제 · 페이즈 끝 사파리 워크플로 1회 |
| 06-25 | `hasCardSlip`(C5) · 6.1과 이중 증빙 막는 규칙 자리(카드 전표 ↔ 6.1 붙임) · 옆 패널 · 스키마 C9로 · 되돌리기 결과 줄 수명으로 T-06-201 재판정(B-C9) |
| 06-26 (새) | C8 |
| 06-27 (새) | C9 |
| 06-28 (새) | C10 |
| 06-29 (새) | C11 |
| UI-SPEC | C14 |
| VALIDATION | 새 플랜 넷 · 바뀐 경로 반영, Per-Task 지도는 실행 전 `/gsd-validate-phase` |

## 3. 미룸 · 받지 않음 (관련 플랜 Review Dispositions Ledger 「Deferred」에)

| 항목 | 이유 | 적을 플랜 |
|---|---|---|
| 「Codex 계획 검토」(reconcile §7) | U-1 — Opus 교차 검토로 갈음 | 06-24 |
| 카드 매출 처리(GA-159) | Q7 — Phase 9 | 06-19 |
| 결재함 일괄 승인 · 반려(GA-60) | 05 뒤 작은 작업 | 06-15(한 줄) |
| 6.1이 덮을 것(D-6117 등록이 곧 확인 · 대사 파일이 이김 · 외주 계산서 고르기) | 6.1 소관 — 06은 자리만 | 06-06 · 06-07 · 06-25 |
| 상세 섹션 `subtitle?`(SP-10) | C13 — 부제 삭제 우선 | 06-07 · 06-19 |
| 인쇄 · 계좌 서식(GA-184 · 186) | 다른 페이즈 | 06-20 |

## Plan-Revision Conflicts

<!-- gsd:plan-revision-conflicts:begin -->
<!-- gsd:plan-revision-conflicts:end -->
