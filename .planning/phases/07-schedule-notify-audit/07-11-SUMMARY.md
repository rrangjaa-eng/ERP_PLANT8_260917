---
phase: 07-schedule-notify-audit
plan: 11
subsystem: db-schema
status: complete
tags: [schema, migration, R20, vendors, projects, budget, PR-S]
requires: ["07-07"]
provides:
  - files.private_to_owner (R20 칸 · 백필)
  - vendor_contacts · vendor_documents · vendor_account_changes
  - vendors.confirmed_at/by · projects.po_number
  - project_documents · project_budget_entries (D-729 · D-730 CHECK)
  - quote_revisions.customer_approval_basis/memo
  - files.owner_kind vendor_document · project_document · revenue_entry
affects: ["07-13", "07-18", "07-20", "07-22", "07-23", "07-24", "07-27"]
tech-stack:
  added: []
  patterns: ["NOT VALID + 별도 VALIDATE 마이그레이션", "마이그레이션 백필 UPDATE를 꼬리 이름으로 찾아 다시 돌리는 통합 시험"]
key-files:
  created:
    - db/schema/vendor-details.ts
    - db/schema/project-details.ts
    - db/migrations/0043_phase7_file_private_flag.sql
    - db/migrations/0044_phase7_vendor_project_docs.sql
    - db/migrations/0045_phase7_vendor_project_docs_validate.sql
    - db/migrations/meta/0043_snapshot.json
    - db/migrations/meta/0044_snapshot.json
    - db/migrations/meta/0045_snapshot.json
    - test/integration/schema/phase7-s3-constraints.test.ts
  modified:
    - db/schema/files.ts
    - db/schema/vendors.ts
    - db/schema/projects.ts
    - db/schema/quote-revisions.ts
    - db/schema/index.ts
    - db/migrations/meta/_journal.json
decisions:
  - "vendor_account_changes 뒤 4자리 CHECK는 숫자 4자리(^[0-9]{4}$) — 계좌 변경을 기록하는 도메인(07-20 · 07-23)은 숫자만 뽑은 뒤 4자리를 넣어야 한다"
  - "project_budget_entries.cost_rate_pct 0~100 CHECK 추가(behavior의 100.1 거부 사례)"
  - "R20 백필은 private_to_owner = false 행만 갱신해 다시 돌려도 행을 다시 쓰지 않는다"
metrics:
  duration: "약 60분"
  completed: 2026-10-22
actuals:
  tokens: 204000   # chars/4 over realized diff(생성 스냅숏 포함 816455자). 손으로 쓴 몫(스냅숏 제외)은 약 12000
  tasks: 3
  commits: 5
plan_head_before: 40bb81938da03d022fdcf5ac380adcbbab4f07f3
---

# Phase 7 Plan 11: 스키마 S3 — R20 파일 칸 · 거래처 · 프로젝트 표 묶음 Summary

R20 `files.private_to_owner` 칸과 비공개 종류 지출결의 파일 백필, 거래처 담당자 · 서류 · 계좌 변경 기록(뒤 4자리만) · 확인 칸, 프로젝트 PO 번호 · 서류 · 예산 이력(D-729 `manual` 메모 필수 · D-730 자동 줄 양수만), 차수 고객 승인 근거를 마이그레이션 세 개(0043~0045)로 PR-S(#260)에 세웠다.

## 한 일

| Task | 이름 | 커밋 | 파일 |
|---|---|---|---|
| 1 | 트레이서: R20 파일 칸 + 백필 + 통합 시험 | 23e8fadc | files.ts · 0043 · phase7-s3-constraints.test.ts |
| 2 | 거래처 · 프로젝트 표 묶음 · 승인 근거 · 파일 주인 종류 | a9b0a50e | vendor-details.ts · project-details.ts · vendors/projects/quote-revisions/files/index.ts · 0044 |
| 3 | 검증 마이그레이션 · Squawk · 스키마 일치 | ad0282ba | 0045 |
| — | 시작 · 끝 origin/main 머지 커밋 | 40bb8193(시작, 기록 기준) · 0f836b31(끝) | 훅 파일만 들어옴 — 번호 겹침 없음 |

`commits: 5`는 `git rev-list --count 40bb8193..HEAD` 실측이다 — 태스크 셋 + 끝 머지 커밋 + 그 머지로 들어온 main 커밋 d8eb84ab(#270).

## 검증 (실제로 돌린 명령)

- `pnpm lint:sql && pnpm db:migrate && pnpm db:generate`(새 `erp_w0711_test` DB) → `Found 0 issues in 46 files` · 마지막 줄 **`No schema changes, nothing to migrate 😴`**
- `pnpm exec vitest run --project unit test/unit/db/migration-journal.test.ts` → 7/7(태스크마다 · 끝 머지 뒤)
- 통합 `phase7-s3-constraints` 18/18 · S1 · S2 · S3 함께 44/44. RED 먼저: Task 1 2/2 실패(칸 · 파일 없음 42703) · Task 2 16/16 실패
- 관련 통합 27 files · 5595 tests 통과(vendor* · project* · quote-revisions · quote-approved-lock · evidence-schema · evidence-private-files · evidence-upload · phase6/65-schema · leak-scan · schema/*)
- 검증 뒤 `pg_constraint.convalidated`: files_owner_kind_check · quote_revisions_customer_approval_basis_check · vendors_confirmed_by_users_id_fk 모두 t
- `pnpm typecheck` 0 · `pnpm lint` 0(기본 힙에서 eslint가 OOM — 같은 컨테이너의 다른 실행자 탓으로 보이며 `NODE_OPTIONS=--max-old-space-size=6144`로 다시 돌려 0)
- 수락 grep: `UPDATE files SET private_to_owner` 1 · `SET LOCAL lock_timeout = '1s';` 각 파일 1 · `collection_due|수금 기한` 0 · `account_no|accountNo`(vendor-details) 0 · `git diff --name-only origin/main...HEAD -- domain/evidence/ repositories/files.ts .squawk.toml` 빈 출력
- `git diff --name-only origin/main`(.planning 제외) = 07-02 · 07-07 · 07-11 files_modified뿐

## 호출한 스킬

`superpowers:test-driven-development`(Task 1 시작 전) · `superpowers:verification-before-completion`(첫 커밋 전) · `superpowers:systematic-debugging`(gh GraphQL 403 뒤 — 훅 요구, 원인은 오류 문구 그대로 REST로 전환).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 정확성] 원가율 범위 CHECK 추가**
- behavior가 `cost_rate_pct 100.1 → 23514`를 요구하는데 `numeric(4,1)`은 999.9까지 받는다 → `project_budget_entries_cost_rate_pct_check`(NULL 또는 0~100). 커밋 a9b0a50e

**2. [Rule 2 - 정확성] 거래처 확인자 FK도 NOT VALID + VALIDATE**
- 기존 표 `vendors`에 거는 FK `confirmed_by → users`를 CHECK 둘과 같이 미뤄 걸고 0045에서 검증(07-02 선례). 커밋 a9b0a50e · ad0282ba

### 범위 조정 (규칙 W3-RULES)

- Task 3 ④의 PR-S **ready 전환 · 게이트 · 「사용자 머지 대기」 댓글은 하지 않았다** — W3 공통 규칙이 PR 생성 · ready · 머지를 오케스트레이터 몫으로 둔다. ③의 PR 본문 절(07-11 바뀐 것 · 검증 · 260907 대조 #16~#21)은 REST로 덧붙였다.
- 재생성 절차(R2)는 필요 없었다 — main 마이그레이션 끝 번호가 0038이라 0039~0045가 겹치지 않음.

## 뒤 플랜 넘김

- 07-20 · 07-23: `vendor_account_changes.before_last4/after_last4`는 숫자 4자리만 받는다. 지금 `planAccountNumberUpdate`(domain/vendors/index.ts:369)의 `accountNumberLast4 = trimmed.slice(-4)`는 하이픈이 섞일 수 있다(예: `…-7-89` → `7-89`) — 기록 행에는 숫자만 뽑은 뒤 4자리를 넣어야 23514를 피한다.
- 07-23: 담당자 이름 공백만은 DB가 막지 않는다(260907은 `btrim <> ''` CHECK) — zod에서 trim 뒤 비어 있지 않음. 최대 5명도 도메인.
- 07-22: `po_number` 공백 문자열은 DB가 막지 않는다(260907 `projects_po_number_not_blank`) — 저장 전 trim · 빈 값은 NULL.
- 07-24: 예산 = `delta_krw` 합 · 메모 길이 500은 도메인. 자동 줄(`initial` · `po_amount_change` · `new_approved_revision`)은 기준 금액 · 원가율 필수.
- 07-27: `files.private_to_owner` 찍기(업로드 완료 때) · 판정 OR. 분할 틈(PR-S 머지 ~ 07-27 머지 사이 올린 비공개 종류 파일은 false)은 low/accept.
- 07-13(PR-LOG): 이 브랜치를 머지 커밋으로 품고 다음 번호(0046~)로.

## 열린 질문 (오케스트레이터 → 사용자 카드)

없음 — 플랜의 플래그된 가정(AQ-15 · FA-1)대로 칸을 만들었고 새 결정이 필요한 곳은 나오지 않았다.

## Known Stubs

없음(스키마 · 마이그레이션 · 시험만).

## Threat Flags

없음 — 위협 표 T-07-11-01~05 범위 안(새 네트워크 · 인증 경로 없음). T-07-11-02: 계좌 기록 표에 원값 · 암호문 칸 0(통합 시험이 information_schema로 확인).

## Self-Check: PASSED

- 파일: vendor-details.ts · project-details.ts · 0043/0044/0045 SQL · 스냅숏 셋 · phase7-s3-constraints.test.ts 모두 있음
- 커밋: 23e8fadc · a9b0a50e · ad0282ba · 0f836b31 모두 `git log`에 있음
