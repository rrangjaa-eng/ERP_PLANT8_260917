---
phase: 06-payment-evidence-cards
plan: 11
subsystem: evidence lifecycle (05 증빙 경로 확장) · 비용 기준 · 중복 범위 · F8 절차
status: complete
tags: [EVID-02, EVID-03, EVID-04, C4, B-1, X-1, X-12, E-49, E-21, U-4, O-6, DR-3, F8]
requires: ["06-03", "06-06", "06-10", "06-27", "06-28"]
provides:
  - "OwnerRule.onApprovedEvidenceChange 훅 — 결재 통과 문서의 증빙 추가 · 무효가 확인 기록 줄을 지우고 문서 version +1(확인 · 면제 모두 풀림)"
  - "voidEvidence 잠금 순서 프로젝트 행 → 지출결의 행 → 파일 행 → 확인 기록 줄(X-12) · 마지막 무효 시 지급 여부와 상관없이 증빙 금액 · 증빙일 지움(검토 I-1 안 a)"
  - "completeEvidenceUpload 결재 통과 문서 프로젝트 행 먼저 잠금 · 완료 판정은 잠금 뒤(E-49) · 잠근 사이 결재 통과면 다시 하기"
  - "expenseCostBasis(domain/evidence-reviews/cost-basis.ts) — 증빙 유무 · 증빙 금액으로만 확정 / 예상"
  - "duplicateScopeKinds — 지출결의 증빙 + 카드 전표 한 범위"
  - "완료 프로젝트 승인 문서 기안자 추가 닫힘(EVIDENCE_COMPLETED_PROJECT_LOCKED · completedProjectLocked · 잠김 한 줄)"
  - "docs/EVIDENCE-STORAGE.md §6 F8 정리 절차(되돌리기 창 30일)"
affects: ["06-12", "06-13", "06-16", "06-17", "06-19", "06-22", "06-25"]
tech-stack:
  added: []
  patterns:
    - "OwnerRule 선택 훅(lockParent · onApprovedEvidenceChange) — 주인 종류가 늘 때 표에 한 줄"
    - "풀 밖 pg.Client 로 행을 쥐고 pg_blocking_pids 로 잠금 순서를 결정적으로 고정"
key-files:
  created:
    - domain/evidence-reviews/cost-basis.ts
    - test/integration/evidence-release.test.ts
    - test/unit/domain/evidence-cost-basis.test.ts
    - test/e2e/evidence-lifecycle.spec.ts
    - docs/design/checks/2026-10-07-06-11-evidence-completed-lock.md
  modified:
    - domain/evidence/index.ts
    - domain/evidence/upload-checks.ts
    - repositories/expense-evidence-reviews.ts
    - app/(app)/expenses/[id]/evidence-attachments.tsx
    - docs/EVIDENCE-STORAGE.md
    - test/unit/domain/evidence/upload-checks.test.ts
    - test/integration/evidence-void.test.ts
    - test/integration/expense-approval-concurrency.test.ts
    - test/integration/expense-close.test.ts
decisions:
  - "마지막 증빙 무효는 지급 완료 여부와 상관없이 증빙 금액 · 증빙일을 지운다(검토 I-1 → 사용자 안 (a) 결정, 계획 must_have 그대로). 지급 뒤 다시 채울 때는 06-10 paidEvidenceAmountRejection이 지급 공급가와 같은 금액만 받는다 — 처음 실행은 지급 완료 예외를 뒀으나 지급 취소 뒤 옛 금액이 새 증빙의 확인 금액이 되는 우회가 있어 철회"
  - "훅은 면제(waived) 줄도 지운다 — 06-10이 넘긴 면제 자동 해제 훅을 이 플랜 범위 안에서 처리(면제 흔적은 끌 수 없는 evidence_waive 로그)"
metrics:
  duration: "약 1시간 30분"
  completed: "2026-10-07"
commits: 11
plan_head_before: 854e801d57d7fbb2bbb809ebe3bd3fba4834af69
actuals:
  tokens: 19000   # git diff 854e801..HEAD 76,291자 / 4 (chars/4)
  tasks: 3
  commits: 11
---

# Phase 6 Plan 11: 증빙 수명 주기 Summary

승인 뒤 증빙 추가 · 무효가 확인(과 면제)을 풀고 문서 version을 올리며, 무효는 프로젝트 → 지출결의 → 파일 순서로 잠기고, 완료 프로젝트 승인 문서의 기안자 추가는 닫히고, 카드 전표가 지출결의와 같은 중복 범위로 센다.

## 한 일

- **Task 1 (트레이서)** — `OwnerRule.onApprovedEvidenceChange`(지출결의 구현 `expenseApprovedEvidenceChange`): 결재 통과(`approved`) 문서에서만 확인 기록 줄을 지우고(`deleteReviewByExpense`) 문서 version을 올린다(`bumpExpenseVersion`, 기록 유무와 무관 — B-1). `completeEvidenceUpload`는 인스턴스 version 올리기 뒤 훅을 부르고 로그 detail에 `reviewReleased`(`confirmed` · `waived`, 풀린 것이 없으면 키 없음)를 싣는다. 로그 호출은 훅 뒤로 옮겼다(같은 `recordActionInTx` 한 번).
- **Task 2** — `voidEvidence`: `lockParent`(05 `lockProjectForWrite`) → `rule.lock` → `afterLock` → `markVoided` → 훅. 마지막 무효(살아 있는 파일 0)면 `clearEvidenceValues`. `expenseCostBasis` 순수 함수(타입 import 없음).
- **Task 3** — `duplicateScopeKinds`, 중복 고리 `findActiveBySha(…, duplicateScopeKinds(kind))`, `OwnerState.projectCompleted`, `drafterAdds`/`addOpen`, `EVIDENCE_COMPLETED_PROJECT_LOCKED`, `EvidenceActions.completedProjectLocked`, 앱 상수 `EVIDENCE_COMPLETED_PROJECT_LINE`, F8 절차 문서.

## 계획 이름 → 실제

| 계획 | 실제 |
|---|---|
| 06-28 종결 판정 이름 | `OwnerState.closed`(`row.closedAt !== null`) — 그 옆에 `projectCompleted`를 더했다(이름 `closed` 유지) |
| 05 중복 고리 `if (!other) continue;` | 06-28 B1이 `if (!other \|\| other.closed) continue;`로 넓혔다 — 고리를 다시 쓰며 그대로 유지(주인 없는 파일 · 종결 문서 파일은 중복 아님). 05 「지운 문서에 살아 있는 파일 행이 남아 있어도」 녹색 |
| `OwnerState` 필드 | `version`(문서 version) · `projectId`를 더했다(훅의 `bumpExpenseVersion` 기대 version · `lockParent`) |
| 훅 시그니처 | `onApprovedEvidenceChange?(viewer, owner, { kind }, tx): Promise<EvidenceReviewStatus \| null>`(풀린 기록의 status 반환) |
| 05 `deferred-items.md` | 읽지 않음(F8 30일 창은 플랜 본문을 따랐다) |

## 검증 (명령 · 통과 · 실패)

- 통합 `evidence-release`(13) · `evidence-upload` · `evidence-void` · `evidence-reviews` · `evidence-waive-prepaid` · `expense-visibility` · `expense-payments-concurrency` · `expense-close` · `expense-approval-concurrency` — 9 파일 **154 통과 · 0 실패**(`DATABASE_URL=…/erp_e0611_test`)
- 단위 `docs-limits` · `error-copy-noun-style` · `import-cycles` · `domain/evidence/*` · `evidence-cost-basis` — 7 파일 **187 통과 · 0 실패**
- `pnpm typecheck` · `pnpm lint` 0 오류(경고는 기존 boundaries 플러그인 폐기 예고뿐)
- `CI=true pnpm build` 성공(`next.config.ts`의 `turbopack.root` 임시 지정 → 되돌림, 커밋 안 함) · `CI=true playwright test test/e2e/evidence-lifecycle.spec.ts` **2 통과** (desktop; mobile 18 skipped = 파일명 규칙)
- 전체 `pnpm test:unit` · 전체 통합 · 전체 E2E는 돌리지 않음(CI 몫 — 브리프)

### RED → GREEN · 변이 (acceptance)

| 항목 | RED | GREEN |
|---|---|---|
| 증빙 변경 뒤 옛 version 확인 거부 · 확인 풀림 | `ad33528` — 2 실패(`expected {…} to be null`, `expected 2 to be 3`) | `310f7f9` |
| [X-12] 무효는 프로젝트 행을 먼저 잡는다 | `cfeba39` — 잠금 줄 없이 「무효가 프로젝트 행에서 막히지 않았다」 실패. 변이 재확인: `lockParent` 호출을 주석 처리 → 같은 단언으로 빨강 | `8f555fa` 통과 |
| [E-49] 완료 판정은 프로젝트 행 잠금 뒤 | `f0113fe` — 막힘에 이르지 못해 실패. 변이: `completeEvidenceUpload`의 `lockParent` 호출 삭제 → 「완료 통보가 프로젝트 행에서 막히지 않았다」 빨강 | `ece074d` 통과 |
| 비용 기준 · 중복 범위 | 모듈 · 함수 없음으로 실패 | 같은 커밋들 |

### 줄 번호 (acceptance)

- `voidEvidence`(`domain/evidence/index.ts`): `lockParent` 535 < `rule.lock` 536 < `afterLock` 538 < `markVoided` 539 < 훅 541
- `completeEvidenceUpload`: `lockParent` 366 < 첫 `rule.lock` 367 < 둘째 `rule.lock` 371 < `addOpen` 372
- `onApprovedEvidenceChange`: 정의 112 · 구현 연결 167 · 호출 400(`completeEvidenceUpload`) · 541(`voidEvidence`). `removeEvidence`(434-468) 범위 안 0건
- `grep 경영관리 domain/evidence/index.ts · upload-checks.ts` 0건(시작 때도 0) · 잠김 줄은 `evidence-attachments.tsx` 한 곳
- `grep "\[input.ownerKind\]"` 0 · `docs/OPERATIONS.md` 변경 0 · `EVIDENCE-STORAGE.md` 111줄(상한 150)
- 06-03 「hasEvidence tx 검사」: `voidEvidence` · `completeEvidenceUpload` 함수 범위 안 직접 호출 0 — 훅 안 호출은 `tx`를 넘긴다

## 260907 대조

| 항목 | 260907 file:line | 우리 file:line | 분류 |
|---|---|---|---|
| 승인 뒤 증빙 추가 허용 · 결재 중만 막음 | `server/src/expenses.ts:6465-6468` `whyCannotAttachFile`(in_review만 막음) | `domain/evidence/index.ts` `addOpen` · `drafterAdds`(승인 뒤 기안자 열림, 결재 중은 권한자만) | 같음 |
| 승인 · 지급 뒤 파일 떼기 막음, 잘못 붙은 건 새로 붙이고 경영관리에 알림 | `expenses.ts:6485-6494` `whyCannotDetachFile` · `:6505-6512` | `removeEvidence`(작성 중 · 반려 · 회수만) · `voidEvidence`(승인 뒤 무효 처리) | 계획 결정(무효 경로를 새로 둠, 05-09 사용자 결정 2026-09-26) |
| 증빙이 새로 붙으면 확인 · 면제가 풀리고 version이 오른다 | 해당 없음(확인 단계 자체가 없음 — `receipt-attach-in-review.test.ts:1-40` 「붙어도 숫자는 안 움직인다」) | `domain/evidence/index.ts:~100-125` `expenseApprovedEvidenceChange` | 계획 결정(C4 · B-1 — 확인은 검수 표시) |
| 증빙 붙임 · 뗌이 부가세 · 작성일 · 지급 예정일을 다시 셈 | `expenses.ts:968` `REFRESH_PAYMENT_DATE`(`refresh_expense_from_receipts`) · `receipt-attach-in-review.test.ts` 「되셈이 움직이는 것」 | 증빙 변경은 금액 · 증빙일 · 예정일을 재계산하지 않는다(확인만 풀림). 마지막 무효만 증빙 금액 · 증빙일 지움 | **숨은 규칙 H1(사용자 결정 필요)** — 승인 뒤 추가 · 무효가 증빙일 · 지급 예정일 · 부가세를 갱신해야 하는가. 지급일 자동 계산은 Phase 7 |
| 중복 판정 기준 | `server/src/receipts.ts:4470-4600` `/api/receipts/check-duplicates` — 카드 승인번호(확실) + 이름 · 작성일 · 금액(짐작) | `domain/evidence/upload-checks.ts` `duplicateScopeKinds` + 파일 SHA-256(`findActiveBySha`) | **숨은 규칙 H2(사용자 결정 필요)** — 우리는 같은 파일 해시만 막고 같은 카드 승인번호 · 같은 금액 · 날짜 · 이름 짐작 대조는 없음 |
| 완료 프로젝트 승인 문서의 기안자 추가 | 해당 코드 없음(`canTouchExpenseFiles` 작성자 · 관리팀 — `expenses.ts:6537`, 완료 프로젝트 조건 없음) | `evidence/index.ts` `expenseState.projectCompleted` · `drafterAdds` | 계획 결정(U-4 — 260907에 없는 새 규칙) |
| 고아 객체 정리 | 해당 코드 없음(보관 표시만 — `expenses.ts:6481`) | `docs/EVIDENCE-STORAGE.md` §6 | 계획 결정(F8) |

숨은 규칙 수: **2**(H1 증빙 변경 시 증빙일 · 지급 예정일 · 부가세 재셈, H2 승인번호 · 금액 짐작 중복 대조). 구현하지 않았다.

## 화면 감사 대상 (캡처 · GPT 검사 대상 경로)

| 경로 | 바뀐 요소 | 데이터 조건 |
|---|---|---|
| `/expenses/{결재 통과 · 완료 프로젝트 문서}` (기안자 로그인) | 첨부 영역: 「하나 더」 없음 + 잠김 한 줄 `완료 프로젝트 · 증빙은 경영관리` | 프로젝트 `status = completed` · 문서 결재 통과 · 증빙 1개 이상 |
| 같은 문서 (증빙 붙이기 권한자 로그인) | 「하나 더」 있음 · 잠김 줄 없음 | 같음 |
| `/expenses/{결재 통과 문서}` 경영관리 | 증빙 섹션 `확인` 줄이 승인 뒤 기안자 추가 뒤 `확인됨` → `확인 전`, 1차 `증빙 확인` | 확인된 문서에 기안자가 파일 추가 |
| 폭 | 320 · 375 · 768 · 1280. 잠김 줄 길이(15자) 줄바꿈 · 파일 10개 이상 행 목록 · 80자 한글 파일명(plan backstop 2건 — 이 플랜은 행 모양을 바꾸지 않음) | |

## 화면 검토 증거

- 독립 DOM 감사(CI=true 4폭): `/mnt/project-files/notes/06-review/06-11-dom-audit.md` — 결함은 같은 플랜 「검토 반영」에서 수정
- 합본 `/design-review`(Codex 실행·후보 8건 결함 아님, DOM 실측 결함 0): `/mnt/project-files/notes/06-review/183-design-review.md` 「플랜별 화면 검토 증거」 06-11 행, 원자료 `/mnt/project-files/notes/06-review/183-design-review-artifacts/`
- 합본 `/qa`(CI=true 흐름 21 통과, Low 3건 보고): `/mnt/project-files/notes/06-review/183-qa.md`

## 검토 반영 (독립 코드 검토 06-11-review · DOM 감사 06-11-dom-audit)

커밋(`073a162` 뒤): `5aa18c1`(RED) · `5a62f58` · `887eb91` · `de3581e` · `e2a0076`. 위 「한 일 · 검증」 수치는 처음 실행 기준이다.

| 항목 | 결과 |
|---|---|
| I-1 → 안 (a) | `expenseApprovedEvidenceChange`의 지급 완료 예외(`findLivePayment`)를 지웠다. RED 3건(`5aa18c1`: 지급 뒤 지움 기대 정정 · 지급 완료 → 마지막 무효 → 금액 비어 있음 → 새 증빙 다른 금액 `EVIDENCE_AMOUNT_PAID_MISMATCH` 거부 / 같은 금액 통과 · 지급 취소 뒤 금액 입력 없이 확인 `EvidenceAmountError` 회귀) → GREEN `5a62f58`. 검토자가 재현한 P2 우회는 닫힘 |
| S-1 | `잠근 사이 결재 통과` 통합 1건(작성 중 의도 → 제출 → 완료 통보 `afterLock`에서 최종 승인 → `restart` 거부 · 파일 · version · 확인 기록 그대로). 돌연변이: 가드 줄(`rule.approved(owner) && !approvedBefore`) 삭제 → 이 테스트만 빨강(`expected undefined to be an instance of EvidenceUploadRefusedError`), 원복 |
| S-2 | `팀 비용 문서(프로젝트 없음)` 통합 1건(결재 통과 팀 비용 문서 · 마지막 무효 → 확인 풀림 · version +1 · 금액 · 증빙일 null · 로그 `reviewReleased`). 현재 코드가 이미 맞아 처음부터 녹색(특성화 테스트 — 변이 확인은 `lockParent` null 갈래가 읽기로만 보이는 한계) |
| S-3 | 연결하지 않았다 — 플랜이 이 플랜 안 소비를 요구하지 않는다. 소유 플랜은 Phase 9 PNL-02(「넘김」에 적음) |
| S-4 | 점검표 「실제 앱 화면을 찍어 보고 확인했다」를 `- [ ]`로 비우고 촬영하지 않았음 · E2E DOM 단언 · `/design-review` 몫을 사실대로 적었다 |
| 고치지 않은 것 | 260907 숨은 규칙 H1~H3(H3 「승인 끝 — 경영관리도 붙임」은 05 결정이라 보고만) · DOM 관찰 O-1 · O-2 · O-4 · 잠김 문구 |

DOM 관찰 O-4(지급 완료 + 마지막 무효 뒤 `증빙 금액`과 `증빙 없음`이 함께 섬)는 (a) 결정으로 더는 생기지 않는다(금액이 지워진다). 감사가 본 상태(금액 9,876,500 유지)는 이전 동작이다.

검증(검토 반영 뒤, `DATABASE_URL=…/erp_e0611_test`): 통합 9파일 **158 통과 · 0 실패**(`evidence-release` 17 = 이전 13 + 4, 나머지 8파일 그대로) · `pnpm typecheck` · `pnpm lint` 0 오류 · `CI=true pnpm build` 성공(`next.config.ts` `turbopack.root` 임시 지정 → 되돌림, 커밋 안 함) · `CI=true playwright test test/e2e/evidence-lifecycle.spec.ts` **2 통과 · 0 실패**(mobile 18 skipped = 파일명 규칙).

## 사용자 질문 후보

| # | 무엇을 골랐나 | 왜 | 다른 안 |
|---|---|---|---|
| Q1 | **(a) 결정됨(검토 I-1):** 마지막 증빙을 무효하면 지급 완료 문서도 증빙 금액 · 증빙일을 지운다(문서 version은 오르고 확인은 풀림) | 계획 must_have · UI-SPEC L681과 같고, 지급 뒤 다시 채우는 길은 06-10 `paidEvidenceAmountRejection`이 지급 공급가와 같은 금액만 받아 장부 · 통장이 갈리지 않는다. 처음 안(지급 뒤 유지)은 지급 취소 뒤 금액 입력 없이 옛 금액으로 확인되는 F2 우회가 있었다 | 철회된 안: 지급 뒤 유지 · (b) `cancelExpensePayment`에서 지움 · (c) S4 금액 줄 숨김 |
| Q2 | 승인 뒤 문서 화면에 기안자 증빙 금액 칸을 새로 만들지 않음(추가는 확인만 풀고 금액은 그대로) | 플랜 「열린 선택」 기본값(UI-SPEC S4 「기안자 · PM — 확인 줄만」과 맞춤) | 기안자가 추가할 때 금액도 다시 적는 칸 |
| Q3 | 260907 H1(증빙 변경 시 증빙일 · 지급 예정일 · 부가세 재셈), H2(승인번호 · 금액 짐작 중복) 채택 여부 | 구현 금지 지시 | 채택 시 Phase 7 지급일 자동 계산과 함께 / 중복은 별도 플랜 |
| Q4 | F8 객체 정리는 문서 절차만(스크립트 없음), 되돌리기 창 30일 | 플랜 | 정리 스크립트 + Cloud Scheduler |
| Q5 | 완료 프로젝트 잠김 줄 `완료 프로젝트 · 증빙은 경영관리`, 거부 문구 `완료 프로젝트 · 증빙 잠김` | UI-SPEC 확정 문구(플랜 인용) | — |

## 플랜 밖 변경

| 파일 | 이유 |
|---|---|
| `test/integration/evidence-void.test.ts` · `expense-approval-concurrency.test.ts` · `expense-close.test.ts` | `getEvidenceActions` 응답에 `completedProjectLocked`가 늘어 deep-equal 기대값 정정(필드 `false` 추가) — 기대 정정 수준 |
| `docs/design/checks/2026-10-07-06-11-evidence-completed-lock.md` | design-gate 훅이 화면 파일(`evidence-attachments.tsx`) 커밋에 점검표를 요구 |
| `domain/evidence-reviews/cost-basis.ts` | 플랜 파일 목록 안(신규) — 별도 표기만 |

files_modified 목록 안 파일만 고쳤고, 그 밖 코드 변경은 위 기대 정정뿐이다.

## 넘김

- **06-16(W10)**: `repositories/files.ts` `restoreOwnerFilesRemovedAt` / 증빙 되살리기의 「다른 곳에 붙은 같은 파일은 되살리지 않음」 판정을 `duplicateScopeKinds` 묶음으로 넓힌다(플랜 drift ⑸ — 이 플랜은 `repositories/files.ts` · `domain/expenses/index.ts`를 건드리지 않았다).
- **06-25(카드 전표)**: 중복 범위에 `corp_card_usage`가 들어갔으나 주인 규칙이 아직 없어 카드 전표 파일은 번호 없는 문구로 센다. 카드 사용이 보관되거나 지워진 뒤 남은 파일 행이 중복으로 세지 않도록(주인 `load` null → 건너뛰기) 카드 전표 주인 규칙을 `OWNER_RULES`에 등록할 때 같이 본다(지금은 규칙 없는 종류 = 항상 중복).
- **06-22(정산 최종 승인)**: `onSettlementFinalApprovalInTx`가 재점검 전에 프로젝트 행을 잡는지가 X-12 직렬화의 반대쪽 절반이다(06-22 소유).
- **Phase 9(프로젝트 손익, PNL-02)**: `expenseCostBasis`의 소비자 — 줄 비용 · 손익이 이 함수 하나를 부른다(REQUIREMENTS 추적표 PNL-02 = Phase 9). 이 플랜 안에는 부르는 곳이 없고 플랜도 연결을 요구하지 않는다(단위 테스트로만 규칙을 고정). 06-06의 「같은 규칙」 주석은 `pickPaymentAmount`와의 일치를 가리킨다.
- TDD 편차: Task 1 E2E 두 번째 시나리오(완료 프로젝트)는 구현 뒤에 썼다(E2E RED 없음). 단위 · 통합은 RED(`ad33528` · `cfeba39` · `f0113fe`) → GREEN 커밋 순서대로.

## Known Stubs

없음.

## Threat Flags

없음 — 새 외부 표면 없음(기존 업로드 의도 · 완료 통보 · 무효 액션 안에서 판정만 바뀜). 중복 응답의 번호 노출은 `canSee` 판정 그대로이고 카드 전표 · 규칙 없는 종류는 번호 없는 문구다(T-06-50).

## Deviations from Plan

- **[Rule 1] E2E 대기 조건** — 첫 E2E에서 「행 개수 2」로 기다리면 올리는 중인 행(진행 바)이 이미 포함돼 완료 통보 전에 읽었다. `크기 · 날짜` 글자가 둘이 될 때까지 기다리도록 고쳤다(테스트 결함, 제품 결함 아님).
- **계획 대비** — Task 1 `<verify>`의 E2E 실행을 Task 3 끝에서 한 번에 돌렸다(빌드 비용). 태스크별 커밋 · 통합 테스트 · lint/typecheck는 태스크마다 돌렸다.

## Self-Check: PASSED

- 파일 존재: `domain/evidence-reviews/cost-basis.ts` · `test/integration/evidence-release.test.ts` · `test/unit/domain/evidence-cost-basis.test.ts` · `test/e2e/evidence-lifecycle.spec.ts` · `docs/design/checks/2026-10-07-06-11-evidence-completed-lock.md` 확인
- 커밋 존재(`git log 854e801..HEAD`): ad33528 · 310f7f9 · cfeba39 · 8f555fa · f0113fe · ece074d · 62666c8 · 7abf8cf · c0b96ab(SUMMARY) · 51179cb(통합 테스트 줄 정정) · 이 정정 커밋
