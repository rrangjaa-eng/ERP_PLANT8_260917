# 지출결의 · 증빙 계약(Phase 5 → Phase 6)

> 150줄 상한(테스트로 고정: `test/unit/docs-limits.test.ts`). ARCHITECTURE.md가 줄 예산이 없어 지출결의 계약을
> 별도 문서로 둔다(사용자 결정 U3 A — ARCHITECTURE §4-6 끝에서 이 문서를 가리킨다). 계약 · 잠금 순서 예외 절은 05-13이 더했다.

## 번호

- 꼴: `{프로젝트 번호}{구분자}{순번}` — 예 `26001-0004`(사용자 결정 2026-09-26 #6). 발급된 번호는 다시 매기지 않는다.
- 카운터: `document_counters`의 `counterKey = "expense"`, **period = 프로젝트 번호**다 — 연도 규약(ARCHITECTURE §4-6
  「`period`는 서기 연도 네 자리」)의 첫 예외. 프로젝트마다 순번이 1부터 시작한다.
- 팀 비용(프로젝트 없는 지출결의)은 `expense_team` · period = 연도(05-07).
- 서식 키: `document_number.expense.separator`(기본 `-`) · `.seq_digits`(4) · `.seq_start`(1) — 단순값. 이미 매긴 번호는
  그대로다. 표시 순번 = 카운터 + 시작값 − 1, 자릿수를 넘친 순번은 자르지 않는다(`expenseNumberFormat`).
- 번호는 제출 트랜잭션의 **마지막 쓰기**다(`allocateExpenseNumber` → `setExpenseNumber`) — 카운터 행 잠금을 가장 짧게.
  서식 세 키는 트랜잭션 전에 SELECT 한 번으로 읽는다(`loadExpenseNumberFormat` — 잠근 tx 안 전역 풀 읽기 금지).
- 작성 중 문서는 번호가 없다(`number IS NULL`). 번호가 있는 문서는 공급가액이 0보다 크다(CHECK, EXP-14).

## 계약(Phase 5 → Phase 6)

- 문서 모델: `expenses` 한 행 = 지출결의 한 건, 결재 종류 `EXPENSE_DOCUMENT_KIND = "expense"`(`registerDocumentKind`).
  **상태 칸이 없다** — 상태는 결재 인스턴스(`approval_instances.status`)에서 파생한다(복사 열은 정본 둘). 작성 중 = 번호 없음.
- 만들기 · 제출: `createExpenseFromLines`(1줄 1문서 — 줄마다 작성 중 문서 하나, 두 번 눌러도 하나) · `saveExpenseDraft` ·
  `submitExpense`(tx: 프로젝트 → 문서 FOR UPDATE → 재판정 → 스냅숏 → 결재 제출 → 마지막 쓰기 번호) · `withdrawExpense`.
- 1줄 1문서 판정: `expenseLineDoor`(`domain/expenses/line-door.ts`) 하나 — 견적 줄 · 취소 아님 · 거래처 있음 · (번호 있는
  문서 0 또는 전부 분할 · 남은 실행가 > 0). 줄 표 · 폰 시트 · 골라내기 · 게이트 ④가 같은 함수를 부른다.
- 번호 카운터 두 종류: 위 「번호」 절(`expense` period = 프로젝트 번호 · `expense_team` period = 연도).
- 세금 호출자: `computeExpenseTax`(기준일 사슬 하나로 `applyTaxRule` 한 번) · `pickTaxDates`(D-101 — 원천징수 · 회사 대납
  = 지급일 → 지급 예정일 → 오늘, 부가세 = 증빙일 → 작성일) · `incomeTypeFor` · `taxLineText`(계산 한 줄 조각 — 세율 `%` 포함).
  제출 때 세율 이력 행 id · 적용일 · 세액을 문서에 스냅숏한다(FK 없음). 금액 합 · 차는 `sumKrw` · `diffKrw`(`domain/money`).
- 증빙 경로: 표 `files`(owner_kind · owner_id · sha256 · 무효) · `upload_intents`(서명 PUT 의도). 포트 `ObjectStorage`
  (`lib/gcp/storage.ts` — local · gcs 드라이버) → `requestEvidenceUpload` → 서명 PUT → `completeEvidenceUpload`(메타데이터 재확인 →
  `incoming/{의도}` → `evidence/{파일}` 옮긴 뒤 파일 행). 중복은 `findActiveBySha`(`repositories/files.ts`) — 다른 문서 것도 막는다.
- 게이트: 규칙 `expense.submit` ①~⑨ 첫 이유 하나(순서는 `domain/expenses/gate.ts` `stepsOf` 한 곳 — ① 고객 승인 ② 완료
  프로젝트 ③④ 줄 · 문 ⑤ 거래처 ⑥ 팀 비용 칸 ⑦ 빈 칸 ⑧ 증빙 ⑨ 세율). Phase 6이 끼울 자리 = ⑧(`선결제` 예외 · `증빙 필수` 설정).
- 「내 차례」 공급: `listNextTurnItems`(`domain/next-turn`) — 결재 종류 중립(지출결의 · 정산 결재 · 연차 같은 모양).
- 엔진 선택 필드 E1~E7(`domain/approvals` — E4는 `repositories/approvals`): E1 회수 뒤 다시 제출(`resubmitFrom` · `canResubmit(viewer, documentId?)`) ·
  E2 최종 승인 훅(`prepareFinalApproval` tx 전 · `onFinalApprovalInTx` 같은 tx) · E3 `approveBlockedReason` ·
  E4 `bumpInstanceVersion` + `version_reason('evidence')` · E5 `DocumentSummary`(measure · number) · E6 「본인 승인」 · E7 시트 `onApprove`.

## 잠금 순서 예외

- 정산 결재 최종 승인(05-11)은 잠금 순서가 결재 인스턴스 → 프로젝트 행이다 — ARCHITECTURE §4-8 (2)의 「첫 단계에서 프로젝트
  행」의 예외(엔진이 인스턴스를 갱신한 뒤 최종 승인 훅이 `loadProjectForGate`로 프로젝트를 잠그고 `changeProjectStatus`로 완료).
- 교착이 없는 이유: 프로젝트 행을 먼저 잡고 같은 정산 결재 인스턴스를 잡는 경로가 없다 — 정산 올리기 · 다시 올리기는 프로젝트를
  tx로 읽기만 하고(잠금 없음), 회수는 인스턴스만 잡으며, 기간 변경(D-80 `saveProjectLedger`)은 프로젝트 행만 잠그고, 지출결의
  제출(프로젝트 → 지출결의 → 인스턴스)은 다른 인스턴스를 잡는다. 두 순서의 경합은 통합 사례(`settlement-approval` · tx-safety (j)).
