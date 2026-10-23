---
phase: 07-schedule-notify-audit
plan: 20
subsystem: vendors
status: complete
tags: [vendors, money, payment-term, version, account, search, csv-export, ui-select]
requires: ["07-15", "07-02", "07-12", "07-06"]
provides:
  - "vendors.payment_term_days 입력 · 저장(J5) — 07-06 listPaymentTermDays가 읽는 값"
  - "거래처 낙관적 동시성(version 비교 · 쓰기 다섯 자리 version + 1)"
  - "거래처 목록 검색 ?q= · 파일 받기(registerExport vendors.export)"
affects: ["07-06 지급 기한 계산 입력", "07-25 관리자 폼 ui/ 이관 계수(vendor-form.tsx 대기 목록에서 빠짐)"]
tech-stack:
  added: []
  patterns:
    - "조건부 UPDATE(version = expected) + returning 행 수로 충돌 판정"
    - "보내지 않은 계좌 칸은 payload에서 빼서 쓰지 않는다(B-P2-4)"
key-files:
  created:
    - domain/vendors/account-digits.ts
    - domain/vendors/business-no.ts
    - domain/vendors/export.ts
    - app/(app)/admin/vendors/export-button.tsx
    - app/(app)/admin/vendors/vendor-search.tsx
    - test/integration/vendor-export.test.ts
    - test/unit/vendors/account-digits.test.ts
    - docs/design/checks/2026-10-21-07-20-vendors-1.md
  modified:
    - domain/vendors/index.ts
    - domain/vendors/account-fields.ts
    - repositories/vendors.ts
    - app/(app)/admin/vendors/page.tsx
    - app/(app)/admin/vendors/vendor-form.tsx
    - app/(app)/admin/vendors/actions.ts
    - app/(app)/admin/vendors/actions.registry.ts
    - app/(app)/admin/vendors/vendors.module.css
    - test/integration/vendors.test.ts
    - test/integration/leak-scan.test.ts
    - test/unit/vendors/business-no.test.ts
    - test/unit/admin-forms-ui-only.test.ts
    - test/unit/ui/vendor-form-reason.test.ts
    - test/e2e/vendors.spec.ts
    - test/e2e/mobile-vendors.spec.ts
    - test/e2e/mobile-320-no-overflow.spec.ts
    - test/e2e/vendor-account-fields.spec.ts
    - test/e2e/vendor-edit.spec.ts
    - test/e2e/vendor-custom-fields.spec.ts
    - test/e2e/custom-field-journey.spec.ts
    - test/e2e/custom-field-visibility.spec.ts
decisions:
  - "F6: 계좌 변경 기록의 끝 4자리 — 숫자가 4자리 미만이면 NULL(accountNumberLast4). 새 저장은 항상 10~16자리라 미만은 옛 자료뿐"
  - "F24: 거래처에는 퇴직 개념이 없어 충돌하는 로직을 만들지 않았다"
  - "계좌 칸(은행 · 예금주 · 번호) 바꾸기는 vendors.account 쓰기 권한 — 권한 판정은 형식 검사보다 먼저, 트랜잭션 밖에서"
  - "검색칸 라벨은 `검색`, `거래처 이름·사업자 번호`는 칸 안 글자 — 패널 `이름` 칸과 접근 이름 충돌 회피"
  - "폰 P1 = 이름 · 갈래 · 상태, 계좌 · 사업자 번호 · 증빙은 접힘 줄(P2)"
metrics:
  duration: "약 1일(압축 1회 포함)"
  completed: 2026-10-23
actuals:
  tokens: 21356
  tasks: 3
  commits: 2
plan_head_before: 398b06662b83ff3d1f32d65ae831c32cd1dae9fd
---

# Phase 07 Plan 20: 거래처 지급 계좌 · 지급 기한 Summary

협력사 거래처의 지급 기한(1~180일)을 패널에서 넣어 07-06 계산이 읽게 했다. 거래처 쓰기 다섯 자리가 모두 version을 올리고, 패널 저장은 낡은 version이면 FormAlert로 막는다. 계좌 칸은 `vendors.account` 권한과 숫자 10~16자리로 지킨다. 목록에는 `?q=` 검색과 편집 폭 전용 2차 `파일 받기`(5,000곳 상한 · 계좌 끝 4자리 가림 · excel_export 기록)를 더했다.

## 커밋

| 커밋 | 내용 |
|---|---|
| 821e2e29 | feat: 07-20 구현 전체(도메인 · 저장소 · 액션 · 화면 · 시험 · 점검표) |
| (merge) | chore: 푸시 전 origin/main 반영(#277 · #278, 충돌 없음) |

`commits: 2`는 `git rev-list --first-parent --count plan_head_before..HEAD` 값(SUMMARY 커밋 전)이다. 평범한 `rev-list --count`는 33이 나오는데, origin/main에서 머지해 들여온 31개가 섞인 수다.

## 과업

1. **Task 1(트레이서) — J5 · V3 · D-745 · N6 · B-P2-6**
   - `resolvePaymentTermDays`: 클라이언트면 NULL, 숫자를 보내면 `지급 기한은 협력사만` 오류. 그 밖에는 1~180 정수.
   - `VendorVersionConflictError`가 나면 액션이 `{ versionConflict }`를 돌려준다. 패널 상단에 FormAlert와 `새로 불러오기`가 뜨고, 본문 scrollTop이 0이 되며 포커스가 알림으로 간다.
   - version은 두 번 확인한다. 먼저 `existing`과 비교하고, 같은 트랜잭션의 조건부 UPDATE가 0행이면 다시 충돌로 판정한다. 사용자 정의 칸 경로는 FOR NO KEY UPDATE로 잠근 행의 version과 비교한다.
   - `BUMP_VERSION` 적용 자리: updateVendor · updateVendorAccountNumber · setVendorHidden · setVendorArchived(두 갈래).
   - 갈래 기본값은 `협력사`, zod 오류 문구는 `갈래 선택`. 지급 기한 placeholder는 설정 `payment.term_days`이고 aux는 `1~180`.
2. **Task 2 — V5 · V6 · C-35 · R8/B-P2-4 · N10**
   - 사업자 번호 중복 줄과 blur 체크섬, 계좌번호 10~16자리 검사를 넣었다.
   - 계좌 칸 권한이 없으면 읽기 전용 KvList로 보인다. 보내지 않은 칸은 저장된 값을 그대로 둔다.
   - 거래처 폼의 select를 전부 `ui/select`로 옮겼다. 관리자 폼 계수에서 vendor-form.tsx가 0이 되어 대기 목록에서 지웠다.
3. **Task 3 — V2 · V1/K12/D-736 · U16**
   - 검색: 이름(normalizedName ILIKE)이나 사업자 번호 숫자(LIKE)로 찾는다. `% _ \`는 이스케이프한다.
   - `exportVendorsCsv` 순서: 권한 → 수 세기(5,000곳 넘으면 거절, 행을 읽지도 기록하지도 않음) → 목록 읽기 → `recordAction excel_export` → csvEscape 직렬화(BOM · CRLF).
   - 버튼은 편집 폭에서만 보인다. 생성 중에는 aria-busy · aria-disabled이고, 실패하면 버튼 아래 오류 한 줄이 뜨며 토스트는 없다.

## V5 현행 → 계약

| 경우 | 전 | 후 |
|---|---|---|
| 같은 갈래 중복 | `같은 사업자번호 거래처 있음 · {이름}` | `이미 등록됨 · {이름}` + `열기`(?editId=) |
| 다른 갈래 중복 | `… · {이름}(클라이언트) · 구분 더하기` | `이미 등록됨 · {이름}(클라이언트)` + `갈래 더하기` |
| 체크섬 · 길이 | `사업자번호 검증 숫자 틀림 · 다시 확인`(제출 뒤) | `사업자 번호 확인 · 다시 입력`(blur · 서버 같은 문구) |
| 숨김 · 보관 중복 | 기존 문구 | 그대로 |

## 260907 비교

| 동작 | 260907 근거 | 이번 결정 |
|---|---|---|
| 지급 기한 칸 · 범위 | db/schema/010_tables.sql:5428(payment_due_days), :5448-5449(CHECK) · server/src/vendors.ts:280-285(dueDaysField 1~180) | 같음. 1~180, 협력사 · 둘 다만 |
| 지급 기한 권한 | server/src/vendors.ts:302(TERMS_DENIED · `vendor.terms`) | 다름. 따로 권한을 두지 않고 거래처 쓰기에 포함(계획 범위) |
| 동시 수정 | server/src/vendors.ts:963-1116(`updatedAt` 문자열 비교 → 409 `다른 사람이 먼저 고쳤습니다…` · `stale`) | 같은 의도에 다른 수단. 정수 version과 조건부 UPDATE를 쓰고 문구는 `다른 사람이 먼저 수정 · 새로 불러오기` |
| 보내지 않은 칸 | server/src/vendors.ts:1004-1034(overlay — 안 보낸 칸 유지) | 같음(B-P2-4) |
| 계좌 바뀜 판정 | server/src/vendors.ts:1118-1121(bankChanged 세 칸 비교) | 같음(`accountFieldsChanged`) |
| 계좌 수정 권한 | vendor.edit만 있으면 됨(같은 PATCH) | 다름. `vendors.account` 쓰기 권한을 더 요구(R8) |
| 계좌번호 형식 | server/src/vendors.ts:305(bankAccount nullableText(40) — 숫자 규칙 없음) | 다름. 숫자 10~16자리이고 `-`·공백은 제거(C-35) |
| 예금주 | 010_tables.sql:5440(계좌가 있으면 예금주 필수) | 같음(judgeAccountFields 기존) |
| 사업자 번호 체크섬 · 문구 | server/src/vendors.ts:252-259(체크섬), :270-271(길이 · 체크섬 두 문구) | 계산은 같음. 문구는 하나로 합쳤다(`사업자 번호 확인 · 다시 입력`) |
| 검색 | server/src/vendors.ts:490, :541-542(`q` — 이름 ilike 또는 사업자 번호 접두어) | 거의 같음. 사업자 번호는 숫자만 남겨 부분 일치로 찾음 |
| 내보내기 | app/src/pages/Vendors.tsx:842-861(현재 쪽 클라이언트 CSV · 계좌 전체 formatBankLine), :570-579(머리 `내려받기`) · app/src/ui/csv.ts:40-50(수식 방어 없음) | 다름. 서버가 거르개 전체를 다시 읽고, 계좌는 끝 4자리만, csvEscape · excel_export 기록 · 5,000곳 상한을 둔다. 버튼은 필터 줄 2차 `파일 받기` |
| 지급 조건 | server/src/vendors.ts:124(terms) | 지급 기한 숫자 칸만 둔다(계획 범위) |

## 검증(최종 트리, CI=true 빌드)

- `pnpm lint`(6 GB 힙) · `pnpm typecheck` · `pnpm lint:sql`: 모두 0. 머지 뒤 typecheck도 0.
- 단위 시험
  - 전체 실행 결과: 346 파일 통과, 1 실패. 실패한 하나는 `design/mark-legacy` CLI 5초 시간 초과(부하 탓)이고, 혼자 다시 돌리면 13/13 통과한다.
  - 관련 11 파일 91 시험은 수정 뒤 다시 돌려 통과했다.
- 통합 시험: 거래처 · 내보내기 · 갈래 · 사용자 정의 칸 · 증빙 자동 등록 · leak-scan · 사람 계좌 · 은행 이체 · 견적 줄 등 12 파일 통과, archive · action-log-query · custom-fields · demo-data 등 5 파일 79 시험 통과.
- E2E
  - desktop: 관련 전체가 55 통과 · 18 건너뜀. 마지막 수정 뒤 vendors.spec만 다시 돌려 34 통과 · 18 건너뜀.
  - mobile-375(`--no-deps`): mobile-vendors · 320 넘침 · 관리자 목록 우선 · design-review-p2 · w14 70 통과. 수정 뒤 320 넘침은 40 통과, mobile-vendors는 6 통과.
- 독립 DOM 감사는 하지 않았다(오케스트레이터 몫). N10 DOM 계수도 그 감사에서 잰다. 소스 계수에서 vendor-form.tsx의 `ui/` 밖 네이티브 입력은 0이다(체크박스 제외).

## 스킬 호출

superpowers:test-driven-development(코드 전) · plant8:design-gate(화면 파일 전, 점검표 생성 · 채움) · superpowers:systematic-debugging(E2E · 단위 실패 추적 전) · superpowers:verification-before-completion(커밋 전 · 보고 전).

TDD RED는 단위 · 통합 수준에서 확인했다. E2E RED는 따로 보지 못했다. 없는 모듈을 import하는 시험 파일이 있으면 `next build`가 타입 검사에서 멈추기 때문이다.

## Deviations from Plan

### Auto-fixed Issues

1. **[Rule 3] 사업자 번호 순수 함수를 `domain/vendors/business-no.ts`로 분리.** files_modified 밖의 새 파일이다. 클라이언트 blur 검사가 domain/vendors/index.ts(서버 의존)를 import할 수 없어서 나눴다. index는 다시 내보낸다.
2. **[Rule 3] 필터 줄 검색칸을 `vendor-search.tsx`로 분리하고 `UI_ONLY_EXCLUDED`에 등록.** 관리자 폼 계수 시험(07-08 SC-15)이 page.tsx의 네이티브 `input`을 셌기 때문이다. 필터 줄은 계약상 제외 대상이고, action-log filter-bar와 같은 꼴로 처리했다.
3. **[Rule 1] export.ts의 `scopeFor` import를 없앴다.** 행 범위 처분표 시험의 ⓐ 위반이었다. 수 세기는 `domain/vendors`의 `countVendors`로 옮겼다. PROJECT_READ_DISPOSITION에 등록할 새 projects 읽기는 없다.
4. **[Rule 1] 수정 1차 버튼 이름을 `거래처 저장`으로(UI-SPEC).** 이 바꿈 때문에 files_modified 밖 E2E 5개의 로케이터를 고쳤다: vendor-edit · vendor-custom-fields · custom-field-journey · custom-field-visibility · vendor-account-fields. vendor-account-fields는 편집 계급에 `vendors.account` 쓰기 권한을 주고, 번호 보기가 숫자만 내놓는 것을 반영했다.
5. **[Rule 1] 폰에서 계좌 열이 P2가 되어 로케이터 수정.** mobile-vendors · mobile-320-no-overflow의 `번호 보기`를 접힘 줄에서 찾게 했다.
6. **[Rule 1] 시험 계약 갱신.** 04.5-06 「폼 상단 오류 상자 없음」은 「version 충돌 한 자리에만」으로 바꿨다. `(보관됨)` 옵션 단언은 ui/select options 배열 꼴로 바꿨다. admin-master-list-first는 주석을 옮겨 200자 창 안에 `showForm ?`가 들어오게 했다.
7. **[Rule 1] 새 E2E 두 개의 순서 의존 제거.** 열 머리글 시험과 U16 시험이 자기 거래처를 만들어 쓰게 했다. 보이는 거래처가 0곳이면 머리글 · 버튼이 그려지지 않는다.

## Known Stubs

없음.

## 남은 일 · 질문

- SC-17 성공 토스트 `거래처 저장 · {이름}`은 넣지 않았다. 기존 패널 상태 줄(`거래처 등록됨` 등)을 유지했다.
- 검색칸 라벨을 `검색` + placeholder로 둔 것은 UI-SPEC의 보이는 라벨 `거래처 이름·사업자 번호`와 다르다. 권장: 지금처럼 둔다(지출결의 검색칸과 같고, 접근 이름 충돌이 없다).

## Self-Check: PASSED

- 만든 파일 8개가 모두 있다(account-digits · business-no · export · export-button · vendor-search · vendor-export 통합 · account-digits 단위 · 점검표).
- 커밋 821e2e29가 브랜치에 있다.
