---
phase: quick-261001-hfi
plan: 01
subsystem: holidays · archive · settings · code-tables · projects · requirements
tags: [ADMN-12, MAST-04, OPS-05, ADMN-10, quick, risk]
status: complete
requires: []
provides:
  - "공휴일 삭제 = 보관(보관함 「공휴일」 행 · 복원 · holiday_change delete/restore 로그)"
  - "설정 미래 예정값 취소의 같은 트랜잭션 settings_change 기록 · 없는 예정값 오류"
  - "공휴일 결과 줄 「되돌리기」 = 보관된 같은 행 복원(restoreHolidayAction)"
  - "코드표 관리 화면 「견적 분류」(quote_subcategory) · 끈/보관 분류 이름 유지"
  - "요구사항 분리: MAST-05 · OPS-08~11, v1 86 → 91"
affects: [/admin/holidays, /admin/archive, /admin/settings 예정값 취소, /admin/code-tables, /projects/[id] 견적 표]
tech-stack:
  added: []
  patterns: ["부분 유일 인덱스 + onConflictDoNothing({ target, where }) 추론", "도메인 복원기(DOMAIN_RESTORERS) — 잠금 · 게이트 · 재계산 · 로그를 한 트랜잭션에", "선택지(활성) / 이름표(전부) 분리"]
key-files:
  created:
    - db/migrations/0021_holidays_archive.sql
    - test/integration/project-form-references-subcategories.test.ts
    - docs/design/checks/2026-10-01-공휴일-보관함.md
    - docs/design/checks/2026-10-01-견적-분류-코드표.md
  modified:
    - db/schema (holidays)
    - repositories/holidays.ts
    - repositories/archive.ts
    - repositories/settings.ts
    - domain/holidays/admin.ts
    - domain/archive/index.ts
    - domain/settings/registry.ts
    - domain/permissions/scope-for.ts
    - domain/projects/references.ts
    - app/(app)/admin/holidays/actions.ts · delete-undo.tsx · delete-holiday.tsx
    - app/(app)/admin/archive/actions.ts · archive-table.tsx
    - app/(app)/admin/code-tables/page.tsx
    - app/(app)/projects/[id]/page.tsx · quote-table.tsx
    - .planning/REQUIREMENTS.md · .planning/ROADMAP.md · docs/design/DECISIONS.md
decisions:
  - "공휴일 삭제는 보관(0021 부분 유일 인덱스), 복원은 restoreHoliday(달력 잠금 · admin.holidays 쓰기 · 오늘 이후만 · 대체 행 정리 · 재계산 · 로그)"
  - "예약(미래 설정값 · 미래 발령) 취소는 삭제가 아니며 같은 트랜잭션 행동 로그로 남는다(ADMN-12 예외, 사용자 결정 2026-10-01)"
  - "견적 분류 = quote_subcategory 하나, 대분류 = 그룹 머리글(D-62)"
  - "OPS-05 분리 → OPS-08(P5) · OPS-09(P6) · OPS-10(P9) · OPS-11(P10), 주민등록번호 열람은 CERT-02. 지급 방식 코드표 → MAST-05(P6)"
metrics:
  completed: 2026-10-01
actuals:
  tasks: 4
  commits: 7
---

# Quick 261001-hfi: Phase 2·3 요구사항 갭 남은 몫 Summary

공휴일 삭제를 보관함으로 옮기고(보관 · 복원 · 같은 트랜잭션 로그), 설정 예정값 취소 로그를 같은 트랜잭션으로 묶고, 코드표 관리 화면에 「견적 분류」를 더하며 끈 분류의 이름을 유지하고, OPS-05 · MAST-04의 페이즈별 몫을 새 요구사항으로 분리했다.

## 작업별 결과

| Task | 커밋 | 브랜치 | 내용 |
|---|---|---|---|
| A (스키마, 위험 경로) | 0ccc5ea | quick/phase23-gaps-2-risk (PR #137) | `feat: archive columns and partial unique date index for holidays` |
| B1 | cdbf3bf | quick/phase23-gaps-2 (PR #138) | `feat: holiday delete archives and restores through the archive` |
| B2 | 75a4422 · 9a1e8b8 | 〃 | `fix: log future setting cancel in the same transaction` + 단위 테스트 deps 보정(CI quality 2건) |
| C1 | ebfadaf | 〃 | `feat: holiday undo restores the archived row` |
| C2 | 106f524 | 〃 | `feat: quote category code table on the code-table admin screen` |
| D | 0787af7 | 〃 | `docs: split phase-specific log and code-table requirements` |

## RED / GREEN

- B1 RED: 통합 holidays-admin · holidays · archive 15 failed / 52 passed — 결과에 id 없음 · 행 삭제, restoreHoliday 없음, 등록되지 않은 entity: holiday. GREEN: 통합 4파일 84/84, tsc 0, lint 0.
- B2 RED: 단위 registry 2 failed(tx 없이 호출 · 지운 행 없어도 성공), 통합 settings 2 failed(로그 실패에도 행 지워짐 · 없는 예정값 취소 성공). GREEN: 통합 6파일 118/118, 단위 24/24. 이후 CI quality에서 effective-from-rule 단위 2건이 DB 연결로 실패 — 로컬 재현 → deps에 트랜잭션 대역 주입(9a1e8b8) → settings 단위 70/70, 전체 단위 2392/2392.
- C1 RED: 단위 holiday-undo · archive-revalidate 6 failed, E2E 되돌리기 뒤 같은 날짜에 [보관된 옛 행, 새 행] 두 행. GREEN: 단위 10/10, leak-scan 1605/1605, CI=true build + E2E 582/582.
- C2 RED: 통합 c1 subcategoryLabels 없음, E2E code-tables 3 failed(링크 2개), c3 끈 분류 줄이 코드값으로 보임(첫 실행은 편집 계정 표가 grid 역할이라 locator 불일치 → 캡션 locator로 고쳐 옛 코드에서 재실행해 올바른 이유로 실패 확인). GREEN: 통합 8/8, tsc 0, lint 0, CI=true build + E2E 698/698, 단위 2392/2392.
- D: roadmap validate 경고 0, 계획 문서 grep 조건 전부 통과.

## 가정

- A-1 결과 줄 「되돌리기」와 보관함 복원은 같은 restoreHoliday(권한 admin.holidays 쓰기, 보관함 경로는 admin.archive 쓰기 추가).
- A-2 로그 종류는 holiday_change(항상 켜짐), detail.op = delete / restore.
- A-3 공휴일 관리 화면 목록은 보관 행을 보이지 않는다(보관함에만).
- A-4 scope-for ENTITY_MENUS에 holiday → admin.holidays(소비처는 아직 없음).
- A-5 대체공휴일 행의 물리 삭제는 규칙에서 다시 만들어지는 파생 데이터라 ADMN-12 대상이 아니다.
- A-6 결과 줄 문구 · 2단계 삭제 확인 문구는 그대로.
- A-7 「견적 대분류」 별도 표 없음 — D-62. 선택지 이름은 「견적 분류」.
- A-8 domain/system-status는 공휴일 표를 읽지 않는다(실측).
- A-9 예약 취소 로그 종류는 그대로(설정값 취소 settings_change, 발령 취소 document_delete — 둘 다 선택 종류).

## ADMN-12 물리 삭제 감사(최종)

| 경로 | 사용자 행동? | 이 quick 뒤 |
|---|---|---|
| 공휴일 수동 삭제 deleteHoliday | 예 | 보관(archiveHolidayById) — B1 |
| 대체공휴일 재계산 · 추가/복원 시 대체 행 제거(deleteSubstituteById — kind = substitute 조건) | 아니오(파생) | 물리 유지(A-5) |
| 설정 미래 예정값 취소 cancelHistorizedValue | 예(예약 취소) | ADMN-12 예외 — 같은 tx settings_change, 지운 행 없으면 FutureValueNotFoundError(domain/settings/registry.ts:62) — B2 |
| 미래 팀 발령 취소 cancelFutureAssignment | 예(예약 취소) | ADMN-12 예외 — 같은 tx document_delete(85g e10cf57) |
| 행동 로그 정리 pruneActionLog | 예 | 삭제 아님 — repositories/action-log.ts markActionLogRowsPruned가 prunedAt/prunedBy만 표시 |
| better-auth 세션 · 리저브 ledger(메모리 Map) | 아니오 | 업무 데이터 아님 |

## 완료 표시 근거

- **OPS-05 Complete**: login — domain/auth/hooks.ts:106 · document_create — 예 domain/vendors/index.ts:286 · domain/code-tables/index.ts:111 · document_delete — domain/org/index.ts:304 · settings_change — domain/settings/registry.ts:180·217 · permission_change — domain/permissions/roles.ts:125 · matrix.ts:122. 핵심 종류 레지스트리 CORE_ACTION_TYPES(domain/action-log/record.ts:12), 끌 수 없는 excel_export · mask_reveal(ALWAYS_ON_ACTION_TYPES, record.ts:73). 정리는 조건 삭제 표시(prunedAt)이고 action_log를 고치는 다른 경로 없음(repositories/action-log.ts의 update는 정리 표시 하나). 테스트: test/integration/action-log.test.ts · action-log-query.test.ts. 이후 페이즈 문서의 생성 · 삭제 로그는 같은 레지스트리를 쓰고 Phase 7 전 메뉴 검수가 확인한다.
- **MAST-04 Complete**: app/(app)/admin/code-tables/page.tsx:22-26 TABLE_OPTIONS 세 항목(프로젝트 상태 · 증빙 종류 · 견적 분류), domain/projects/references.ts:39·120 이름표, c1~c3 통과(C2 106f524).
- **ADMN-12 Complete**: 커밋 A · B1 · B2 · C1 통과 출력, 위 감사표(사용자 대상 물리 삭제 = 예외로 정한 예약 취소 둘뿐, 둘 다 같은 tx 로그).
- **ADMN-10**: 표시하지 않음(Gaps Found 유지, Phase 7 확정 항목).

## DOM 감사 메모(Post-build 독립 DOM 감사가 볼 곳)

- /admin/holidays: 삭제 → 결과 줄 → 되돌리기(같은 행 복원 · 포커스), 오류 시 결과 줄 원인.
- /admin/archive: 「공휴일」 행(이름 `{날짜} {이름}`) · 복원 · 거부 토스트 `복원 · 실패 · {원인}`.
- /admin/code-tables?tableKey=quote_subcategory: 링크 셋 간격 · 현재 표 구분 · 목록.
- /projects/[id]: 끈 분류 줄의 그룹 머리글 · 소분류 칸 이름, 새 줄 선택지에 끈 분류 없음.
- 폭 375 · 320 · 768 · 1280, CI=true.

## 후속 메모

- A-9 예약 취소 로그 종류를 항상 켜짐으로 할지 — 지금은 선택 종류라 관리자가 끄면 남지 않는다.
- Phase 5 · 6 · 9 · 10 계획이 OPS-08 · MAST-05 · OPS-09 · OPS-10 · OPS-11을 가져가야 한다.
- CERT-02 페이즈 표기 불일치: ROADMAP Phase 04.3 Requirements ↔ 이번 분리 문구의 「CERT-02(P11)」 해석 — 다음 계획에서 정리.
- 코드표 tableKey 허용 목록이 화면 TABLE_OPTIONS에만 있다(도메인 쓰기 경로는 tableKey를 검증하지 않음).
- 편집 중 끈 분류 줄의 소분류 칸을 열면 select가 활성 목록만 보여 첫 항목이 선택돼 보인다(커밋하지 않으면 바뀌지 않음) — 기존 동작, 필요하면 후속.
- 훅 quick 예외: risk 플랜 Opus 실행자 위임이 훅에 막혀 메인 세션이 직접 실행(사용자 결정) — 훅 수정은 후속 과제.
- `pnpm test:e2e <files>`에 파일 필터가 적용되지 않고 전체가 돈다(`--grep`은 동작).
- 0021 마이그레이션 주석이 DECISIONS.md 2026-10-01 항목을 가리키는데, 그 항목은 PR #138에 있다(#137이 먼저 머지되면 잠시 앞선 참조).
- MAST-01 · MAST-02는 이 quick 범위 밖.

PR① 본문용: 0021 단일 마이그레이션 사용자 승인 2026-10-01 · 프로덕션 승격은 업무 시간 밖.
