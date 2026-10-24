---
phase: 07-schedule-notify-audit
plan: 23
subsystem: vendors-payment-safety
status: complete
tags: [V9, N2, B-P2-5, AQ-35, AQ-36, V7, V8, V4, N4, U6, U12, SC-17, SC-18, D-745, G13, AQ-21, K20, U11, U16, N14, D-716, risk-money]
requires: ["07-20", "07-16", "07-11", "07-14", "07-22", "07-12", "07-19", "07-28"]
requirements: [EXP-11]
provides:
  - 거래처 계좌 변경 기록(vendor_account_changes · 뒤 4자리 전후 · 같은 tx) + 수정 패널 `계좌 변경 기록`
  - 지급 대상 DTO vendorConfirmed · accountChanged → 지급 목록 결제 방법 칸 계좌 아래 한 값 `확인 전 > 계좌 바뀜`(표시만, 지급 판정 불변)
  - 수정 패널 담당자(최대 5명 · 같은 tx · 같은 version) · 서류 두 자리(사업자등록증 · 통장 사본 교체형) · 확인 표시 켬/끔
  - 일하는 자리 거래처 등록(지출결의 쓰기 권한 · 확인 전) + 사업자 번호 충돌 `이 거래처로`
  - PickDialog searchTail(검색어 끝 3차 항목)
  - 알림 종류 vendor-account-changed(`계좌 바뀜` · 꺼 둠 · 거래처마다 하루 한 번)
key-files:
  created:
    - domain/vendors/account-changes.ts
    - domain/vendors/contacts.ts
    - domain/vendors/documents.ts
    - domain/vendors/document-upload.ts
    - domain/notify/kinds/vendor-account-changed.ts
    - repositories/vendor-details.ts
    - app/(app)/admin/vendors/account-history.tsx
    - app/(app)/admin/vendors/vendor-contacts.tsx
    - app/(app)/admin/vendors/vendor-documents.tsx
    - test/integration/vendor-account-changes.test.ts
    - test/integration/vendor-contacts-documents.test.ts
    - test/integration/vendor-confirm.test.ts
    - test/integration/notify/vendor-account-changed.test.ts
    - test/e2e/vendor-work-register.spec.ts
    - docs/design/checks/2026-10-21-07-23-vendors-2.md
  modified:
    - domain/vendors/index.ts
    - domain/evidence/index.ts
    - domain/payments/targets.ts
    - domain/expenses/dto.ts
    - domain/notify/condition-kinds.ts
    - repositories/vendors.ts
    - repositories/payment-targets.ts
    - app/(app)/admin/vendors/page.tsx
    - app/(app)/admin/vendors/vendor-form.tsx
    - app/(app)/admin/vendors/actions.ts
    - app/(app)/admin/vendors/actions.registry.ts
    - app/(app)/admin/vendors/vendors.module.css
    - app/(app)/expenses/payment-targets-table.tsx
    - app/(app)/expenses/[id]/pick-vendor.tsx
    - app/(app)/expenses/[id]/expense-form.tsx
    - app/(app)/expenses/actions.ts
    - app/(app)/expenses/actions.registry.ts
    - ui/pick-dialog/PickDialog.tsx
    - test/e2e/vendors.spec.ts
    - test/e2e/payment-schedule.spec.ts
    - test/e2e/payment-batch.spec.ts
    - test/integration/leak-scan.test.ts
    - test/integration/notify/kinds-off.test.ts
    - test/unit/ui/pick-dialog-empty-text.test.ts
key-decisions:
  - "계좌 바뀜 = 가장 늦은 변경 > 그 거래처가 지급처인 살아 있는 지급의 가장 늦은 처리 시각(한 질의) — 처음 넣은 계좌는 변경이 아니라 `확인 전`이 맡는다(AQ-36)"
  - "시스템 주체(SYSTEM_VIEWER)의 계좌 변경은 changed_by FK를 채울 수 없어 기록하지 않는다"
  - "일하는 자리 등록은 expenses 쓰기 권한 · 갈래는 협력사/양쪽만 · 확인 전(confirmedAt NULL) · 사용자 정의 필수 칸 검사 없음"
  - "충돌 `이 거래처로`: 클라이언트뿐이면 양쪽으로 넓히고 행동 로그를 같은 tx에(document_update · source workplace)"
  - "알림 계좌 바뀜: ctx.since 없으면 0행, 거래처 · KST 날짜로 묶어 지급 담당(paymentManagers)에게 하루 한 번(dedup 키)"
actuals:
  tokens: 56000
  tasks: 3
  commits: 6
plan_head_before: a9537592155f0210de235d7aa861195b1830866e
duration: "Task 1 ~ Task 3 (2026-10-23)"
completed: 2026-10-23
---

# Phase 07 Plan 23: 거래처 2 — 계좌 변경 기록 · 지급 목록 확인 전/계좌 바뀜 · 담당자 · 서류 · 확인 표시 · 일하는 자리 등록 Summary

거래처 계좌가 바뀌면 같은 트랜잭션에 뒤 4자리 전후 기록이 남는다. 지급 목록에는 계좌 아래 `확인 전 > 계좌 바뀜`이 한 값으로 선다(지급 판정은 그대로). 지출결의 지급처 고르기에서는 누구나 거래처를 바로 등록할 수 있고, 그 거래처는 확인 전으로 남는다. 사업자 번호가 겹치면 `이 거래처로`를 고를 수 있다. 꺼 둔 알림 종류 `계좌 바뀜`이 거래처마다 하루 한 번 지급 담당에게 간다.

## Commits

| Task | Commit | 내용 |
|---|---|---|
| 1 | f7242d93 | 계좌 변경 기록 · 지급 목록 확인 전/계좌 바뀜 · 수정 패널 `계좌 변경 기록` |
| 2 | dcb10211 | 담당자 · 서류 두 자리 · 확인 표시 켬/끔 · 목록 상태 `확인 전` |
| fix | 1cffa192 | Task 1·2 회귀: 누수 스캔 import 셋 · payment-batch `확인 전` locator |
| 3 | 92d6f485 | 일하는 자리 등록 · `이 거래처로` · PickDialog searchTail · 알림 vendor-account-changed |
| merge | bb88e7fe | origin/main(#275 07-13 action_log 불변 트리거) 머지 커밋 |

`commits: 6`은 `git rev-list --count a9537592..HEAD`로 잰 값이다(SUMMARY 커밋 전). 이 플랜 커밋 4개, 머지 커밋 1개, 머지로 들어온 main 커밋 1개(1dc3267c)를 합친 수다. origin/claude/07-20-vendor-accounts는 푸시 직전 fetch 때 새 커밋이 없었다(HEAD..branch = 0).

## Skills invoked (Skill 도구)

- `superpowers:test-driven-development`: Task 1·2·3 구현 전에 썼다. 통합·단위 RED를 먼저 확인했다(Task 3: 알림 7건과 일하는 자리 5건은 타입이 맞는 스텁으로 실패를 보고 GREEN, pickSearchTail 단위도 RED → GREEN).
- `superpowers:systematic-debugging`: 네 번 썼다.
  1. Task 2 E2E 서류 시험이 새로 고침 뒤 0장이었다. DB 실측과 tsx 탐침으로 listVendorDocuments가 정상임을 확인했고, 원인은 시험이 올리는 중인 줄을 기다린 것이었다 → 완료 줄 기다림으로 고쳤다.
  2. 알림 시험 두 건: 거래처 이름 속 숫자, 규칙을 다시 켜면 창이 넓어지는 문제.
  3. 전체 단위의 leak-scan-coverage 실패.
  4. payment-batch strict mode 위반: 같은 행에 `확인 전` 둘(증빙 칸과 거래처 칸).
- `plant8:design-gate`: app/·ui/를 고치기 전에 썼다. 점검표 `docs/design/checks/2026-10-21-07-23-vendors-2.md`는 모든 항목이 [x]이고 근거가 있다(미체크 0).
- `superpowers:verification-before-completion`: 각 커밋 전과 보고 전에 썼다.

## Verification

- `pnpm typecheck` 0(머지 뒤 다시 돌림) · `pnpm lint`(eslint + stylelint, 전체) 0
- `pnpm test:unit` 전체: 1회차 1 실패(leak-scan-coverage, Task 1·2 모듈 누락) → 1cffa192로 고친 뒤 leak-scan-coverage 4/4 통과. 나머지 353 파일, 5400건은 1회차에 통과.
- 통합(DB erp_w0723_int, 머지 뒤): vendor-account-changes · vendor-contacts-documents · vendor-confirm · notify/vendor-account-changed · notify/kinds-off · leak-scan = 6 파일, 5414건 통과. Task 3 전 회귀 30 파일도 kinds-off 목록 외에는 통과.
- E2E(CI=true, flock, `--no-deps`):
  - desktop 1회차(vendor-work-register · vendors · payment-schedule · expense-hope-date · payment-batch): 103 통과, 2 실패.
    1. payment-batch:989 strict mode → 고쳤다.
    2. vendors:741(07-20 사업자 번호 입력, 이 플랜이 손대지 않은 시험)은 goto 직후 pressSequentially라 값이 ""였다. 하이드레이션 경합으로 판단한다.
  - 2회차(desktop vendors 전체 · payment-batch:989 + mobile-375 mobile-vendors · mobile-expense-form · mobile-payment-pushed): 67 통과, 0 실패. vendors:741도 통과했다.
- 머지 뒤 E2E는 다시 돌리지 않았다. 머지된 main 변경은 action_log 트리거와 시험 비우기뿐이고 이 플랜 시험은 action_log를 읽기만 한다. 통합 6 파일은 머지 뒤 통과했다. 전체 E2E는 PR ready 때 CI가 한 번 돈다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 누수 스캔에 새 registerDto 모듈 셋 누락**: 1cffa192
- Task 1·2가 만든 account-changes · contacts · documents를 leak-scan.test.ts에 side-effect import로 더했다.

**2. [Rule 1 - Bug] payment-batch 시험 strict mode**: 1cffa192
- 증빙 칸 `확인 전`을 `td:not(:has([data-vendor-flag]))`로 좁혔다. 시험 고정 거래처(setupExpenseE2E)는 확인 전이라 결제 방법 칸에도 `확인 전`이 선다.

**3. [Rule 1 - Bug] Task 2 서류 E2E가 올리는 중인 줄을 기다림**: 92d6f485
- `done(name)`으로 완료 줄(`\d+KB · MM-DD`)을 기다리게 했다.

### 그 밖의 이탈

- **Task 1**
  - SYSTEM_VIEWER가 바꾼 계좌는 기록하지 않는다(changed_by FK).
  - 기록 여부는 "원래 계좌가 있었나(hadAccount)"로 가른다.
  - 점검표 날짜는 2026-10-21이다(계획 경로 그대로).
  - 트레이서 E2E RED를 따로 보지 못했다(화면과 서버를 한 번에 빌드).
- **Task 2**
  - `계좌 변경 기록`은 읽기 전용 표(AccountHistory)다.
  - files_modified 밖 파일 `domain/vendors/document-upload.ts`를 더했다.
  - 확인 줄은 패널 본문 맨 위에 둔다.
  - 서류 교체 단추 라벨은 `다시 올리기`다. 서류는 교체만 된다.
  - 거부 로그에 clientIds를 남긴다.
  - 담당자 `삭제`는 위험 색이 아니다(폼 상태만 바뀌고 `취소 Esc`가 되돌리기).
  - 이미 확인된 거래처에는 머리 줄을 따로 두지 않는다.
- **Task 3**
  - PickDialog noun이 `지급처`라 0건 문구가 `조건에 맞는 지급처가 없습니다`다(계획은 `거래처`). 지급처 = 거래처 + 직원이라 그대로 두었다.
  - 알림 href에 `vendor` 갈래가 없다(링크 없는 알림).
  - 일하는 자리 행동 로그는 document_create · document_update(source workplace)를 쓴다. 설정으로 끌 수 있다.
  - 사용자 정의 필수 칸은 일하는 자리 등록에서 검사하지 않는다.
  - 갈래 선택지는 협력사 · 양쪽만이다.
  - 패널에서 담당자 · 기본 증빙 · 지급 기한을 숨긴다.
  - VendorForm이 `@/app/(app)/expenses/actions`를 import한다.
- 통합 시험은 E2E DB(erp_w0723_test)의 TRUNCATE와 부딪히지 않게 같은 플랜용 별도 DB `erp_w0723_int`에서 돌렸다(psql로 만듦).
- **독립 DOM 감사 미실시**: 이 실행자는 하위 에이전트를 띄우지 않았다(자기 감사는 독립이 아니다). `audit/07-23-dom-audit.md`는 만들지 않았다. 오케스트레이터가 감사 에이전트(CI=true · 375/320/768/1280)를 띄워야 한다.

## Open Questions (권장안으로 진행)

1. 일하는 자리 등록 · 넓히기 행동 로그 종류. (a) document_create/update + source workplace[적용] (b) 끌 수 없는 새 종류(vendor_workplace_create 등)를 더함(새 이름 — 사용자 몫). 권장: (b). 누구나 계좌까지 등록하는 돈 경로라 끌 수 없는 기록이 맞다.
2. 같은 행의 `확인 전` 둘(증빙 칸 · 결제 방법 칸 거래처). 칸이 달라 뜻이 갈리지만 글자가 같다. (a) 유지[적용 · 계획 문구] (b) 거래처 쪽을 `거래처 확인 전`으로. 권장: (a). 칸 머리가 맥락을 준다.
3. 계좌 바뀜 알림의 클릭 이동(href). 지금은 없다. 권장: 거래처 수정 패널(`/admin/vendors?editId=`)로 잇되, vendors.account 권한이 없는 받는 사람은 지급 목록으로 보낸다(다음 플랜).
4. 일하는 자리 등록에서 사용자 정의 필수 칸을 뺀 것. 권장: 유지. 경영관리가 확인할 때 채운다.
5. 지급 완료 보기의 S3 시험(payment-batch:1646, 같은 확인 전 고정 거래처)은 `확인 전` strict mode 위반 없이 통과했다. 지급 완료 보기에서 거래처 표시가 서는지는 확인하지 않았다. 권장: 검증 레인 `/qa`에서 실측한다.
6. vendors.spec:741 하이드레이션 경합 가능성(07-20 시험). 권장: 07-20 쪽에서 waitForHydration을 더한다(이 플랜 범위 밖).

## Known Stubs

None.

## 260907 대조

/home/user/erp_plant8_260907 원본을 직접 열어 확인했다(계획의 「원본 미확인」 인용 보강).

- 계좌 변경 판정: `server/src/vendors.ts:1118-1121`. 은행 · 예금주 · 번호 셋을 비교한다(bankChanged). 이 플랜은 07-20 `accountFieldsChanged`로 같은 결이다(예금주만 바뀌어도 한 줄).
- 알림 켬/끔: `server/src/vendors.ts:1128` `setting_on('notify.vendor_account_changed')`, 설정 목록 `server/src/notices.ts:39-43`. 이 플랜은 조건 종류 `vendor-account-changed` 시드 꺼 둠이다.
- 받는 사람 · 하루 한 번: `server/src/vendors.ts:1131-1170`. 지급일 권한(expense.paid_date) 보유자, 퇴직 제외, round = KST 날짜, 제목 「거래처 계좌가 바뀌었습니다」. 이 플랜은 07-10 paymentManagers(expenses.payments 쓰기 보유 활성 사용자) · dedup 키 `${vendorId}:${KST 날짜}` · 메시지 `계좌 바뀜 · {거래처}`(숫자 없음)다.
- 사업자 번호 중복이면 그 거래처를 들고 와 고르게 함: `server/src/vendors.ts:805-830`(보관 포함). 이 플랜의 K20 `이 거래처로`와 같은 결이다. 보관 · 숨김 · 볼 수 없는 거래처는 고를 수 없다(selectable).
- 담당자: `db/schema/010_tables.sql:5259-5309`(vendor_contacts). 서류: `:5314-5345`(vendor_documents · business_license · bank_book · id_card). 이 플랜은 담당자 최대 5명, 서류 두 자리다. id_card는 개인 수취인 몫이라 빠졌다(계획 Deferred).
- 옛 계좌 변경 기록 표: 없음. 이 플랜에서 새로 만들었다.

## Self-Check: PASSED

- 파일 존재: domain/vendors/account-changes.ts · domain/vendors/contacts.ts · domain/vendors/documents.ts · domain/notify/kinds/vendor-account-changed.ts · repositories/vendor-details.ts · test/e2e/vendor-work-register.spec.ts · test/integration/notify/vendor-account-changed.test.ts · docs/design/checks/2026-10-21-07-23-vendors-2.md
- 커밋 존재: f7242d93 · dcb10211 · 1cffa192 · 92d6f485 · bb88e7fe
