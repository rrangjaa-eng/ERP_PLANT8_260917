---
phase: 07-schedule-notify-audit
plan: 22
subsystem: revenue-collection-documents-notify
status: complete
tags: [SC-20, SC-07, D-746, D-735, D-716, G-61, D-748, N22, risk-money]
requires: ["07-18", "07-14", "07-11", "07-08", "07-12", "07-27"]
provides:
  - 수금 지연 판정 한 벌(collectionStatus · collectionOverdueByProject) + 목록 상태 둘째 줄 · 상세 입금 합계 줄 배지
  - 프로젝트 상세 「서류」 섹션(발주서 · 기타 여러 장, 05 ui/attachments + OWNER_RULES project_document)
  - 매출 발행 줄 계산서 파일 한 장(OWNER_RULES revenue_entry · 교체 = 옛 파일 제거)
  - 알림 종류 collection-overdue(꺼 둠 · 맨 뒤) + tick 받는 사람 정보 항목 거르개(recipientInfoItem)
key-files:
  created:
    - domain/revenue/collection.ts
    - domain/revenue/invoice-file.ts
    - domain/projects/document-upload.ts
    - domain/notify/kinds/collection-overdue.ts
    - app/(app)/projects/[id]/documents-section.tsx
    - app/(app)/projects/[id]/invoice-file-panel.tsx
    - test/unit/revenue/collection-overdue.test.ts
    - test/integration/revenue-collection.test.ts
    - test/integration/project-documents.test.ts
    - test/integration/revenue-invoice-file.test.ts
    - test/integration/notify/collection-overdue.test.ts
    - test/e2e/project-documents.spec.ts
    - test/e2e/mobile-project-documents.spec.ts
    - test/e2e/mobile-projects-collection.spec.ts
    - docs/design/checks/2026-10-22-07-22-project-docs.md
  modified:
    - domain/revenue/index.ts
    - domain/projects/index.ts
    - domain/projects/documents.ts
    - domain/evidence/index.ts
    - domain/notify/condition-kinds.ts
    - domain/notify/recipients.ts
    - domain/notify/tick.ts
    - domain/holidays/calendar.ts
    - domain/settings/keys.ts
    - repositories/revenue-entries.ts
    - repositories/project-documents.ts
    - repositories/settings.ts
    - repositories/permissions.ts
    - ui/attachments/Attachments.tsx
    - app/(app)/projects/actions.ts
    - app/(app)/projects/actions.registry.ts
    - app/(app)/projects/projects-table.tsx
    - app/(app)/projects/[id]/page.tsx
    - app/(app)/projects/[id]/revenue-section.tsx
    - app/(app)/projects/[id]/quote-table.tsx
    - app/(app)/projects/[id]/project-detail.module.css
key-decisions:
  - "수금 지연 판정은 collectionOverdueByProject 한 벌 — 목록 · 상세 · 알림이 같은 함수(입금 = 잔액 줄과 같은 공급가액)"
  - "hasProjectDocument는 살아 있는 파일이 있어야 참 — 07-18 `발주서 파일 없음`이 파일 없는 서류 행에 속지 않게"
  - "계산서 교체 = 옛 파일 removedAt(무효 아님) — 줄에는 늘 한 장"
  - "알림 tick 잠금 tx 안 읽기는 모두 그 tx로(설정 · 노출표 · 수금 줄 · 공휴일). 공휴일은 보장 쓰기 없이 읽기만(readHolidayLookup) — tick이 잠금 전에 올해 · 다음 해를 보장"
  - "정보 항목 거르개는 계급 · 항목마다 tick 안 한 번 판정, 계급 모르는 후보는 버림(닫힌 쪽)"
  - "서류 섹션 위치 = 매출 면 뒤(카드 사용 앞) — 정보 면 바로 아래면 제목 없는 견적 표가 「서류」 아래 것처럼 읽힘(열린 질문)"
actuals:
  tokens: 48600
  tasks: 3
  commits: 4
plan_head_before: da8fa8be8706b90d7758943ca5ad80f2c072cf9a
duration: "Task 1 ~ Task 3 (2026-10-22 ~ 10-23)"
completed: 2026-10-23
---

# Phase 07 Plan 22: 수금 지연 · 프로젝트 서류 · 계산서 파일 · 수금 지연 알림 Summary

수금 지연을 한 함수로 판정해 목록 · 상세 배지와 꺼 둔 알림 종류 `collection-overdue`가 같은 정의를 쓰고(받는 사람 계급이 `revenue.paid_amount`를 볼 때만 행), 프로젝트 상세에 「서류」 섹션과 발행 줄 계산서 한 장 붙이기를 05 첨부 부품 위에 올렸다.

## Commits

| Task | Commit | 내용 |
|---|---|---|
| 1 | 62c2eb72 | 수금 지연 판정 한 벌 · 목록 상태 둘째 줄 · 상세 입금 합계 줄 배지 |
| 2 | a2246950 | 서류 섹션 · 발행 줄 계산서 파일(OWNER_RULES 두 줄 · 액션 셋 · ui/attachments 확장) |
| fix | 586da7fc | Task 1·2 단위 시험 회귀 세 건(전체 단위에서 발견) |
| 3 | 6d59d52e | 알림 종류 collection-overdue · tick 정보 항목 거르개 · 잠금 tx 읽기 |

## Skills invoked (Skill 도구)

- `superpowers:test-driven-development` — Task 1 · 2 · 3 구현 전(RED 확인: Task 3은 모듈 없음 실패 → GREEN). 거르개는 끈 채로 돌려 G-61 시험 2건 실패 확인(돌연변이).
- `plant8:design-gate` — app/ · ui/ 손대기 전. 점검표 `docs/design/checks/2026-10-22-07-22-project-docs.md` 전 항목 [x] + 근거.
- `superpowers:systematic-debugging` — 두 번: ① customer-approval-basis 07-18 시험(서류 행에 파일 필요 — 의도된 변화, 고정물 보강) ② 전체 단위 3건 실패(목록 단위 시험이 수금 판정으로 DB를 읽음 · 상세 페이지 시험 mock 누락 · readBy 표시 만료).
- `superpowers:verification-before-completion` — 각 커밋 전 · 보고 전.

## Verification

- typecheck 0 · `pnpm lint` 0 · `pnpm lint:sql` 0 · `pnpm build`(CI=true, flock) 0
- `pnpm test:unit` 전체: 347 파일 통과 · 5348 통과(1회차 3 실패 → 586da7fc로 수정 뒤 0)
- 통합(관련): collection-overdue · kinds-off · event-window · notify-tick · href · kinds-core · expense-result · revenue-collection · rules-merge · settings · holidays = 11 파일 170 통과. Task 2 통합(project-documents · revenue-invoice-file · customer-approval-basis 등) 통과(Task 2 때)
- row-scope-disposition 단위 17 통과(listCollectionCandidateProjects 처분 등록)
- E2E(CI=true, Task 1 · 2 때): desktop — projects-list · revenue-section · project-documents · project-info-panel / mobile-375 — mobile-projects-collection · mobile-project-documents 통과. Task 3은 화면 변경 없음.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 단위 시험 회귀 세 건(Task 1 · 2가 만든 것)** — 586da7fc
- loadProjectList에 `collectionOverdue` 주입 자리 추가(단위 시험이 가짜 id로 DB를 읽음) · 상세 페이지 시험에 새 섹션 mock · `PROJECT_COLLECTION_DUE_DAYS`의 `readBy` 표시 제거.

**2. [Rule 2 - Correctness] 잠금 tx 안 전역 풀 읽기 금지** — 6d59d52e
- `collectionOverdueByProject`에 `opts.tx`, `findEffectiveValue` · `findVisibility`에 선택 tx, `readHolidayLookup(years, tx)` 신설(보장 쓰기 없음). 표 밖 / 보장 안 된 옛 해의 공휴일은 비어 읽힘 — 오래된 예정일에만 영향.

**3. [Rule 1 - Bug] hasProjectDocument가 파일 없는 서류 행도 참** — a2246950 (살아 있는 파일 EXISTS 조건, 07-18 고정물 2곳 보강)

### 그 밖의 이탈

- files_modified 밖 파일: quote-table.tsx(prop 전달) · ui/attachments(metaLead · single · confirmRemove) · customer-approval-basis 시험 · project-info-panel E2E 고정물 · leak-scan import · recipients.ts · repositories/permissions.ts · repositories/settings.ts · domain/holidays/calendar.ts · kinds-off 목록 · domain/settings/keys.ts · 상세/목록 단위 시험.
- TDD: Task 2의 E2E 스펙은 화면 뒤에 썼다(통합 · 단위는 먼저).
- 서류 섹션 위치: 계획의 "정보 면 아래" 대신 매출 면 뒤.
- 계산서 링크는 폰(<1024)에서 숨김(p3 열) — 매출 표가 폰에서 보기 전용(DR-36)이라 열면 읽기 전용 패널.
- 파일 DTO(evidenceFile)가 `expense.value`로 칸을 가려, 계산서 파일을 보려면 그 항목도 필요(적립금 시험 선례).
- **독립 DOM 감사 미실시** — 이 실행자에는 하위 에이전트를 띄울 도구가 없다. `audit/07-22-dom-audit.md`는 만들지 않았다(자기 감사는 독립이 아님). 오케스트레이터가 별도 감사 에이전트(CI=true · 375/320/768/1280)를 띄워야 한다.

## Open Questions (권장안으로 진행)

1. 서류 섹션 위치 — (a) 매출 뒤[권장 · 적용] (b) 정보 면 바로 아래(계획) (c) 견적 표에 제목을 달고 정보 면 아래.
2. ui/attachments 공용 확장(single · metaLead · confirmRemove) — 유지[권장] / 서류 전용 래퍼로 분리.
3. 폰 계산서 접근 — 숨김 유지[권장 · DR-36] / 폰 접힌 줄에 읽기 링크.
4. 후보 상한 순서(가장 이른 발행 순) — 다 받은 오래된 프로젝트가 상한을 채울 수 있음. 1000 넘을 때만 문제 — 유지[권장] / 미수 잔액 있는 것만 SQL로 거르기.
5. listRevenue가 보관된 매출 줄도 보여 줌(기존 동작, 이번 범위 밖).
6. 목록 `수금 지연` 글자 무게(종료일 지남과 같은 단계) — 유지[권장].

## Known Stubs

None.

## Self-Check: PASSED

- 파일: domain/notify/kinds/collection-overdue.ts · domain/revenue/invoice-file.ts · app/(app)/projects/[id]/documents-section.tsx · app/(app)/projects/[id]/invoice-file-panel.tsx · test/integration/notify/collection-overdue.test.ts 존재
- 커밋: 62c2eb72 · a2246950 · 586da7fc · 6d59d52e 존재(`git rev-list --count da8fa8be..HEAD` = 4)
