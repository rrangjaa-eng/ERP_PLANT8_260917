---
phase: 07-schedule-notify-audit
plan: 15
subsystem: permissions
status: complete
tags: [permissions, seed, risk-permissions, PR-PERM]
requires: ["07-05", "07-26", "07-12"]
provides:
  - "MENUS: projects.budget · admin.notification-rules · vendors.account(쓰기 한 칸) · MenuDef.actions · menuActions"
  - "INFO_ITEMS: notification_rule.value · budget.amount"
  - "matrix: PERMISSION_REQUIRES · dependentCells · permissionRequiresMap · GridDto.requires · setPermissionCell { changed }"
  - "archive: RoleHasMembersError(count) · 계급 보관 상한 · repositories/roles countActiveMembersOfRole · lockRoleForUpdate"
  - "evidenceScopeFor R18 · 등록 계급 evidence 보기 시드"
affects: ["07-19", "07-20", "07-21", "07-23", "07-24"]
tech-stack:
  added: []
  patterns: ["메뉴별 칸 정의 한 곳(menuActions) — 열 · 시드 · 저장 거부가 같은 정의", "딸린 칸 닫힘 계산 + 바뀌는 칸 전체 가드 한 tx"]
key-files:
  created:
    - test/integration/permissions-dependent.test.ts
  modified:
    - domain/permissions/menus.ts
    - domain/permissions/info-items.ts
    - domain/permissions/matrix.ts
    - domain/permissions/roles.ts
    - domain/permissions/scope-for.ts
    - domain/archive/index.ts
    - domain/seed/index.ts
    - repositories/roles.ts
    - test/integration/seed-permissions.test.ts
    - test/integration/roles.test.ts
    - test/integration/archive.test.ts
    - test/integration/evidence-row-scope.test.ts
    - test/integration/row-scope-entries.test.ts
    - test/integration/admin-cap-concurrency.test.ts
    - test/unit/permissions/scope-for.test.ts
decisions:
  - "R17 소속 막기는 SYSTEM_VIEWER를 면제(last-admin O4 선례) — E2E people.spec archiveRolesByPrefix · 통합 admin-cap 「계급 보관과 관리자 수」가 소속 남은 계급을 시스템 주체로 보관한다"
  - "R19는 코드 변경 없음 — 계급에 「설정 본부」 칸이 없고, 팀 없는 본부 범위 사람은 이미 본인 행(PM · 참여)을 본다. 통합 사례로 고정. 증빙 범위의 팀 없는 사람 확대는 열린 질문"
  - "setPermissionCell: 요청 칸은 값이 같아도 지금처럼 쓰고 기록, 딸린 칸은 실제 값(행 없음 = 꺼짐)이 바뀔 때만. changed는 실제 값이 바뀐 칸만"
metrics:
  duration: "약 1시간"
  completed: 2026-10-22
estimate:
  tokens: 260000
  tasks: 3
actuals:
  tokens: 18200
  tasks: 3
  commits: 4
plan_head_before: f0f80ec52b88f4f5a6f6eaa120718acc2c7142a2
---

# Phase 07 Plan 15: 07 권한 키 · 딸린 권한 · 계급 가드 · 범위 판정 Summary

07 새 메뉴 키 셋(`projects.budget` · `admin.notification-rules` · `vendors.account` 쓰기 한 칸)과 정보 항목 둘을 메뉴별 칸 정의(`menuActions`) 위에 시드하고, 권한표 저장이 딸린 칸(같은 메뉴 쓰기 · 승인 ↔ 보기, `vendors.account:write → admin.vendors:view`, `evidence.intake:write → evidence:view`)을 한 트랜잭션에서 위로 · 아래로 끝까지 바꾸며 자기 잠금 · 마지막 관리자 가드가 바뀌는 칸 전체에 걸린다. 계급 이름 바꾸기 · 보관은 상한 검사를, 보관은 소속 활성 인원 막기를 받고, 증빙 범위는 `evidence` 보기를 먼저 본다.

## 커밋

| 태스크 | 커밋 | 내용 |
|---|---|---|
| — | `f0f80ec5` | origin/main 머지(38커밋 · 07-12 `ADMIN_MENUS` 알림 규칙 자리 확인) |
| 1 | `9614adb2` | 키 셋 · 정보 항목 둘 · `MenuDef.actions` · `menuActions` · 시드 루프 · PC-08 건너뛰기 |
| 2 | `48161109` | 딸린 권한 · 바뀌는 칸 전체 가드 · 정의 밖 칸 거부 · `{ changed }` · `requires` · R16 · R17 |
| 3 | `847c377e` | R18 · 등록 계급 증빙 보기 시드 · R19 고정 사례 |
| — | `89e79702` | fix: `no-admin-boolean` 시험에 걸린 도우미 이름(`turnsOffAdminWrite`) |

## 호출한 스킬

`superpowers:test-driven-development`(시작 전) · `superpowers:verification-before-completion`(첫 커밋 전) · `superpowers:systematic-debugging`(Task 3 단위 `scope-for` 실패 추적 전). 각 태스크 RED(Task 1 6 실패 · Task 2 21 실패 · Task 3 2 실패) → GREEN 확인.

## 검사

| 검사 | 결과 |
|---|---|
| 통합 23파일(플랜 verification 전부 + `setPermissionCell` 호출 여덟 + leak-scan · visibility · evidence-attach · evidence-export), `erp_w0715_test` | 23 files · 5679 passed |
| 단위 전체(`89e79702` 뒤) | 341 files · 5313 passed(앞 실행의 `no-admin-boolean` 1 실패는 도우미 이름 — 고침) |
| `pnpm typecheck` · `pnpm lint`(NODE_OPTIONS 6144) | exit 0 · exit 0(마지막 커밋 뒤) |
| `pnpm build:cli` + `cli-bundle.test.ts` | exit 0 · 4 passed |
| `seed-master` 번들 실제 실행(새 DB, Task 3 뒤 재빌드) | migrate exit 0 · 1회 exit 0 `permissions=128 visibility=190` · 2회 exit 0 · 두 실행 사이 `permission_matrix` · `visibility_matrix` 덤프 diff 0 · 운영 꼴 계급(`evidence.intake` 쓰기만)에 3회째 시드가 `evidence` 보기 켬 |
| Task 2 verify 셋째(E2E 12파일 포함 · 정의 밖 칸 저장 0) | 통과 |
| `git diff --name-only origin/main...HEAD -- app ui` | 빈 출력 |
| `git diff --name-only origin/main...HEAD -- repositories/evidence-records.ts` | 빈 출력 |
| `git diff --name-only origin/main...HEAD -- test/e2e` | `test/e2e/role-smoke.spec.ts` 한 줄 — 07-05 커밋(`8d145ae2` · `fe68467e`) 몫, 이 플랜은 E2E를 고치지 않음 |

E2E는 돌리지 않았다(화면 파일 안 건드림 — 플랜대로 PR-PERM ready CI 전체 E2E가 맡음).

## E2E `setPermissionCell` 호출자 영향

실행 때 `grep -rl setPermissionCell test/e2e`는 측정 12파일과 같다(새 호출자 없음).

| 파일:줄 | 꼴 | 결과 그대로 |
|---|---|---|
| person-payout-account:112 · holidays:102 · admin-person-leave:400 · code-tables-write-gate:19 · side-panel:467 · :879 · table-row-min:96 · leave-list:245 · cert-review:573 · vendors:93 | ① 보기 켬만 — 위로 딸린 칸 없음 | 예 |
| fixtures.ts:82-83 · leave-list:638-639 · :670-671 · cert-review:595-596 · cert-events:105(view · write 루프) | ② 보기 → 쓰기 — 쓰기 켤 때 보기 이미 켬 | 예 |
| vendor-custom-fields:257 | ③ 쓰기 끔 — 쓰기에 기대는 칸 없음(`vendors.account` 쓰기는 `admin.vendors` 보기에 기댐) | 예 |
| vendors:117 | ④ 보기만 가진 임시 계급의 `admin.vendors` 보기 끔 — 쓰기 · 계좌 쓰기 원래 꺼짐(행 없음 = 꺼짐이라 딸린 칸 기록 없음) | 예 |

E2E의 계급 보관(`roles.spec.ts:78 · :238` 빈 계급 · `admin-cap-fixtures.ts:69` 소속 남은 위임 계급)은 모두 `SYSTEM_VIEWER`라 R17 면제로 그대로다.

## Task 1 — 07-05 「07-15 입력」 대조

| 칸 | 07-05 표 | 이 플랜 |
|---|---|---|
| ⑤ `admin.notification-rules` | 시스템 관리자 보기 · 쓰기 | `MENUS`에 넣고 시드 루프가 건너뜀(PC-08) — 07-19가 그 줄을 지우면 표대로 켜짐 |
| ⑤ `vendors.account` | 시스템 관리자 보기 · 쓰기 | D-739대로 쓰기 한 칸만(`actions: ["write"]`) — 보기 칸은 정의 밖 |
| ⑤ `projects.budget` | 시스템 관리자 보기 · 쓰기 | MENUS 루프(기본 칸 셋 — 승인 칸도 생김, 플랜 행 그대로) |
| ⑤ 정보 항목 둘 | 시스템 관리자 보임 | INFO_ITEMS 루프 · 시드 계급 4종 숨김(`staffDefault: false`) |
| ⑥ D-729 경영관리 `projects.budget` 쓰기 | 시드 행 없음 | 시드 행 없음 — PR 본문 「배포 뒤 할 일」 ① |
| ⑦ R18 `evidence` 보기 | 「켬」 | Task 3 ③ 시드 단계 추가 |

시드 계급 4종에 새 권한 행이 없으므로 `domain/seed/role-defaults.ts`는 고치지 않았다(시스템 관리자는 루프가 맡음).

## Task 3 — R18 줄 번호 · R19 지금 → 바뀜

`evidenceScopeFor` 본문: `domain/permissions/scope-for.ts:167` `"evidence", "view"` → `:168` `"evidence.intake", "write"`(보기 검사가 앞줄).

| R19 판정 | 지금(`rowScopeFor` 본부 갈래) | 바뀜 |
|---|---|---|
| ① 계급 설정 본부가 보관 본부 | 해당 없음 — `roles`에 설정 본부 칸이 없다(`db/schema/roles.ts`). 본부는 오늘 발령 팀의 본부에서만 나온다 | 없음 |
| ② 팀 없는 사람 · 본부 범위 | `limited { kind: org_unit, orgUnitId: null }` → `repositories/row-scope.ts` 범위 조각 `false` + PM · 참여 조각 → 본인 행(own과 같음), 0건 아님 | 없음 — 통합 사례로 고정(`row-scope-entries` 「팀 없는 본부 범위 사람」) |

## Deviations from Plan

1. **[R19 해석 — 열린 질문]** 플랜의 「계급 설정 본부」는 스키마에 없다. 출처 C-80(carryover.md:108)의 「설정 본부」는 증빙 본부 공개 설정(`evidence.visibility.division_org_unit`)이고, 「팀 없는 사람 본부 갈래 0건」은 `evidenceScopeFor` published 갈래(발령 없음 → 0행)다. 그 0행은 06.1 T-061-08(「발령 없는 사람이 임의 팀 범위를 받음」 mitigate)이 일부러 정한 값이고 260907 근거는 「원본 미확인」이다. 정보 노출을 넓히는 판단이라 추측으로 바꾸지 않고 `rowScopeFor` 쪽을 시험으로만 고정했다. 아래 열린 질문 1.
2. **[R17 SYSTEM_VIEWER 면제]** 플랜에 없는 면제. 없으면 `test/e2e/people.spec.ts`(archiveRolesByPrefix — 소속 남은 위임 계급 보관)와 통합 `admin-cap-permissions.test.ts:299`가 깨지는데, E2E는 이 플랜이 고칠 수 없다(플랜 ⑥). last-admin O4와 같은 꼴. 열린 질문 2.
3. **[Rule 3] `test/integration/admin-cap-concurrency.test.ts` 결과 타입 넓힘** — `setPermissionCell` 반환 `void → { changed }`로 `PromiseSettledResult<void>[]` 도우미 넷이 타입 오류. `unknown`으로만 바꿈(동작 변화 없음). files_modified 밖.
4. **[Rule 1] `test/unit/permissions/scope-for.test.ts`** — 「등록 쓰기만 → all」을 단언하던 옛 규칙 사례를 R18대로(둘 다 → all, 등록 쓰기만 → none) 고침. files_modified 밖.
5. **[Rule 1] 도우미 이름** — `isAdminWriteOff`가 `no-admin-boolean` 단위 시험 정규식에 걸려 `turnsOffAdminWrite`로(`89e79702`).
6. **시드 카운트** — 반환 permissions 124 → 128(+3 `projects.budget` · +1 `vendors.account` · −1 `admin.vendors` 승인 · +1 R18 단계), visibility 180 → 190. 고정값 노출 숨김 목록에 새 항목 둘.
7. **`role-defaults.ts` 고치지 않음** — 위 대조표(시드 계급 새 행 없음).
8. **오케스트레이터 몫으로 남김** — 플랜 truth의 PR ready · CI · `/review` + `/cso` + 독립 검토 · 「사용자 머지 대기」 댓글, PR 본문 「배포 뒤 할 일」은 W3-RULES(PR · ready · 머지 금지)에 따라 하지 않음. 「배포 뒤 할 일」 재료: ① D-729 경영관리 `projects.budget` 쓰기를 권한표에서 켬 ② 07-19 머지 전에는 권한표에서 `알림 규칙` 칸을 켜지 않음(켜면 링크 404 — PC-08) ③ `evidence` 보기가 명시적으로 꺼진 등록 계급은 시드가 안 바꿈 — 권한표에서 확인.

## 열린 질문(오케스트레이터 카드)

1. **R19 증빙 범위 — 팀 없는 증빙 보기 사람에게 설정 본부(살아 있으면) 본부 공개를 보여줄까?** 선택지: (A) 보여줌 — 260907 receipts 대응(원본 미확인), 06.1 T-061-08 결정 뒤집음, `evidenceScopeFor`가 설정 · 본부 보관을 읽음 / (B) 지금처럼 0건. 추천 **B**(진행함) — 노출을 넓히는 결정이라 근거 확인 뒤 별도 플랜.
2. **R17 시스템 주체 면제 유지?** (A) 유지(진행함 — 시험 훅 · CLI만 해당, 화면 경로는 늘 막힘) / (B) 면제 없음 — E2E `people.spec` 정리 함수를 다른 플랜이 소속 옮기기로 바꿔야 함. 추천 **A**.

## Known Stubs / 남은 위험

- 스텁 없음.
- R17 경합: 보관 쪽은 계급 행 `FOR UPDATE` 뒤 센다. 사람 계급 바꾸기 · 등록(`domain/people`)은 그 계급 행을 잠그지 않아, 동시에 그 계급으로 옮겨지는 사람 하나가 보관된 계급에 남을 수 있다(그 경로는 저장 전 `role.archivedAt`을 잠금 없이 확인). 이 플랜 파일 밖 — `/review` · `/cso`에서 판단.
- `/expenses/evidence` 페이지 문(`page.tsx:33`)은 아직 `evidence.intake` 쓰기만 본다 — `evidence` 보기가 명시적으로 꺼진 등록 계급은 페이지는 열리고 목록은 빈다(R18 none). 화면 파일이라 고치지 않음(07-21 · 화면 플랜 몫).

## Self-Check: PASSED

- 파일: `test/integration/permissions-dependent.test.ts` · 수정 15파일 있음
- 커밋: `9614adb2` · `48161109` · `847c377e` · `89e79702` 있음
