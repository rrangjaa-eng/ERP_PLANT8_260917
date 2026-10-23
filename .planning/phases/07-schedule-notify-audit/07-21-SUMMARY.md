---
phase: 07-schedule-notify-audit
plan: 21
subsystem: admin-people-roles-org-permissions
status: complete
tags: [permissions, roles, org, archive, advisory-lock, permission-grid, ui]
requires: ["07-15 GridDto.requires · setPermissionCell changed · dependentCells", "07-12", "07-17 사람 목록"]
provides:
  - "위임자 계급 표 화면 판정(role-row-controls.ts = assertCanEditRole 같은 술어)"
  - "팀 · 본부 보관 소속 거부(OrgHasMembersError) + 보관 ∥ 발령 경합 잠금"
  - "소속 수(roleMemberCounts · orgMemberCounts) = 사람 목록 ?role · ?team · ?org 필터 = 서버 거부 술어"
  - "PermissionGrid linked 모드 · linked-cells.ts(linkedCells · revertSteps)"
affects: [app/(app)/admin/people/roles, app/(app)/admin/people/org, app/(app)/admin/people, app/(app)/admin/permissions, ui/permission-grid, ui/row-actions]
tech-stack:
  added: []
  patterns: ["잠금 뒤 같은 tx 재조회(FOR SHARE)", "화면 판정은 서버 술어 재사용", "ui는 함수 prop으로만 app 규칙을 받음"]
key-files:
  created:
    - app/(app)/admin/people/roles/role-row-controls.ts
    - app/(app)/admin/people/roles/error.tsx
    - app/(app)/admin/people/org/error.tsx
    - app/(app)/admin/permissions/linked-cells.ts
    - test/unit/app/role-row-controls.test.ts
    - test/unit/app/linked-cells.test.ts
    - test/unit/app/people-roles-org-boundaries.test.ts
    - test/integration/admin-cap-roles-screen.test.ts
    - test/integration/org-archive-members.test.ts
    - docs/design/checks/2026-10-23-07-21-roles-org-permissions.md
  modified:
    - domain/archive/index.ts
    - domain/org/index.ts
    - domain/people/index.ts
    - repositories/roles.ts
    - repositories/team-memberships.ts
    - repositories/teams.ts
    - repositories/users.ts
    - app/(app)/admin/people/roles/page.tsx
    - app/(app)/admin/people/roles/roles-client.tsx
    - app/(app)/admin/people/org/org-client.tsx
    - app/(app)/admin/people/org/page.tsx
    - app/(app)/admin/people/page.tsx
    - app/(app)/admin/people/people.module.css
    - app/(app)/admin/permissions/actions.ts
    - app/(app)/admin/permissions/page.tsx
    - app/(app)/admin/permissions/permission-grid-client.tsx
    - ui/permission-grid/PermissionGrid.tsx
    - ui/permission-grid/PermissionGrid.module.css
    - ui/row-actions/RowActions.tsx
    - ui/row-actions/RowActions.module.css
    - test/e2e/roles.spec.ts
    - test/e2e/org.spec.ts
    - test/e2e/people.spec.ts
    - test/e2e/permissions-grid.spec.ts
    - test/integration/admin-cap-concurrency.test.ts
decisions:
  - "07-21: assignTeam은 자리 잠금 뒤 팀을 다시 읽어 보관된 팀이면 거부한다 — 팀 보관 ∥ 발령 경합(R10)을 닫는다(06.4 (h) 시험 순서 조정)"
  - "07-21: 계급 · 조직 라우트에 loading.tsx를 두지 않는다 — 스트리밍 틀이 D-1 JS 끔 첫 렌더와 첫 렌더 실측 시험을 깨뜨린다(UI-SPEC SC-09 · SC-13 LOADING과 충돌, 정정 필요)"
  - "07-21: 권한표 결과 줄 {메뉴} = 딸려 바뀐 칸의 묶음 이름(여럿이면 `, `로 잇는다) — `거래처 · 보기도 켬`(UI-SPEC 예 `거래처 보기 · 보기도 켬`은 07-15 이전 낱말)"
metrics:
  duration: "약 1시간 20분(첫 커밋 02:51Z → 마지막 코드 커밋 04:11Z, 압축 전 준비 제외)"
  completed: 2026-10-23
actuals:
  tokens: 36000
  tasks: 3
  commits: 3
plan_head_before: b360a34e4b6151c8b63da36bbf4def93c57e8f21
---

# Phase 07 Plan 21: 계급 · 조직 · 권한표 화면 Summary

이 플랜은 세 가지를 바꿨다.
- 위임자의 계급 표는 상한 밖 줄을 글자로만 보인다.
- 사람이 남은 계급 · 팀 · 본부의 `삭제`는 비활성 + `소속 {N}명`(사람 목록 필터 링크)이다. 서버는 잠금 뒤 같은 술어로 거부한다.
- 권한표는 07-15 `changed`로 딸린 칸을 같이 움직인다. 결과 줄과 `되돌리기`(실제 바뀐 칸만)가 있다.

## 커밋
| Task | 커밋 | 내용 |
|---|---|---|
| 1 | 37ecaee1 | 위임자 계급 표 — 상한 밖 줄 글자 · 받는 값만 · 표 위 잠김 한 줄 |
| 2 | a7ad0742 | 사람 남은 계급 · 팀 · 본부 보관 막기 — 소속 수 · 이유 줄 · 사람 목록 필터(+ F2 계급 FOR SHARE) |
| 3 | fa86e3f8 | 권한표 딸린 칸 — 예측 · 저장 중 면 · 결과 줄 · 되돌리기(+ F8) |

## 검증(모두 CI=true · 자체 DB erp_w0721_test)
- `pnpm lint` · `pnpm typecheck` · `pnpm lint:sql`: 0 오류(최종 HEAD).
- 단위: verify 묶음(linked-cells · role-row-controls · system-md-compliance · import-cycles) 262 녹색. test/unit/ui + test/unit/app 전체 1324 녹색.
- 통합: 관련 20파일 262 녹색(org-archive-members 10 · admin-cap-* · archive · roles · people · org · team-memberships 등). permissions-dependent · leak-scan 5162 녹색.
- E2E 마지막 실행(desktop + mobile-375 `--no-deps`):
  - t3-e2e-1: permissions-grid · settings · roles · org · mobile-roles · mobile-org · people 115 녹색(남은 실패 1건은 커밋 안 하는 스크린샷 스펙의 선택자 — 고쳐 다시 돌림)
  - t3-e2e-2: mobile-320-no-overflow · mobile-w5-review-fixes · custom-field-visibility · journey · role-smoke · admin-nav 72 녹색
  - 그 앞 t2-e2e-4: people · mobile-org · org · mobile-320 녹색
  - 로그: /home/user/wt/logs/07-21/
- TDD RED:
  - 단위 · 통합은 RED를 먼저 확인했다. linked-cells는 구현을 일부러 깨뜨려 74건 실패로 시험의 검출력을 확인했다.
  - Task 3 E2E RED는 Task 2 빌드에서 7건 실패로 확인했다(t2-e2e-4-t3-red.log). 이때 통과한 3건은 07-15가 이미 만든 동작(K24 · K4 결과 줄 없음 · 노출표 회귀)이다.
  - Task 1 E2E RED와 boundaries 단위 RED는 돌리지 않았다(빌드 절약 · 파일보다 시험이 나중).
- 독립 DOM 감사: 오케스트레이터 지시로 돌리지 않았다.
- 플랜 acceptance의 `audit/07-21-dom-audit.md`는 오케스트레이터 몫이다.

## 스킬 호출
- `superpowers:test-driven-development`: 코드 전에 호출했다.
- `plant8:design-gate`: 화면 파일 전에 호출했다. 점검표: docs/design/checks/2026-10-23-07-21-roles-org-permissions.md, 빈칸 0.
- `superpowers:systematic-debugging`: Task 2의 시험 실패 세 묶음과 E2E 실패를 쫓기 전에 호출했다.
  - 시험 실패 세 묶음: (h) 동시성 · loading 스트리밍 · 폰 이유 넘침/44px.
  - E2E 실패의 원인:
    - getByRole이 숨은 폰 복제를 세지 않는 차이
    - Suspense reveal 지연
    - Next 경로 안내기의 role=alert
- `superpowers:verification-before-completion`: 커밋 전과 보고 전에 호출했다.

## 260907 대조(읽기 전용 /home/user/erp_plant8_260907)
- 딸린 권한 켬: `db/schema/020_functions.sql:1626-1645` `grant_required_permission`(켜면 requires를 같이 켬)
- 딸린 권한 끔: `:4233-4247` `revoke_dependent_permissions`(끄면 기대던 칸을 같이 끔)
- 이 둘은 07-15 서버 규칙과 같은 방향이다. 07-21은 그 결과(`changed`)를 화면에 확정만 한다.
- 본부 보관 거부: `server/src/org.ts:290-302`
  - 사람 수: `:296-297` 「아직 N명이 이 본부에 있습니다. 먼저 옮겨 주세요」 409
  - 팀 수: `:298-302`도 거부
- 07-21은 사람만 센다. 빈 팀만 남은 본부는 보관된다(D-P3-10, 통합 「빈 팀만 남은 본부」).
- 팀 보관 거부: `server/src/org.ts:458-472`(:471 「아직 N명이 이 팀에 있습니다」)
- 260907은 `left_date is null`로 퇴직자를 제외한다. 07-21은 퇴직일 ≥ 오늘을 아직 소속으로 보고, 앞으로 그 팀으로 발령된 사람도 센다(AQ-28).
- 직급 삭제: `server/src/access.ts:1211-1234`는 쓰는 사람이 있으면 거부하지 않고 보관한다. 07-21은 플랜 R17대로 활성 소속이 있으면 막는다(차이를 기록).

## Deviations from Plan
1. **[Rule 3] `repositories/teams.ts` 수정(files_modified 밖)**
   - `findTeamById`에 tx 매개를 더했다.
   - `listTeamIdsOfOrgUnit`을 새로 만들었다.
   - 둘 다 보관 tx 안에서 다시 읽으려고 필요했다(잠금 tx 안 전역 풀 읽기 금지).
2. **[Rule 1] `assignTeam`이 보관된 팀을 거부**
   - 잠금 뒤 재조회한다. R10 경합(보관이 먼저 키를 잡으면 발령이 보관 팀에 들어감)을 닫는다.
   - 06.4 `admin-cap-concurrency (h)`가 보관 팀에 발령하는 순서였다. 그래서 복원 → 발령 순서로 고쳤다(17/17).
3. **[Rule 1] F2 부분 처리**
   - `changePersonRole`은 잠금 뒤 계급을 FOR SHARE로 다시 읽고, 보관됐으면 거부한다.
   - `registerPerson`→`createAccount`(domain/auth, 위험 경로)의 계급 보관 경합은 그대로다.
4. **[Rule 1] loading.tsx 제거(계급 · 조직 둘 다)**
   - 계급 loading.tsx는 w5-review-fixes D-1 JS 끔 첫 렌더를 깨뜨렸다.
   - 조직 loading.tsx는 본문을 load 뒤에도 숨은 Suspense 틀에 잠시 남겼다. 그래서 mobile-org 「이름 입력 폭」 boundingBox가 null이 됐다.
   - error.tsx만 둔다. boundaries 단위 시험은 「loading 없음」을 단언한다.
5. **[Rule 1] 폰 RowAction 이유**
   - 이유가 nowrap이라 320 · 375에서 넘쳤다. 폰에서는 줄바꿈한다.
   - 이유 안 `{N}명` 링크는 18×15였다. 44×44로 키웠다(`--touch-min`).
6. **[Rule 1] 시험 선택자 3곳 조정**
   - people.spec 중복 팀 보유자 링크: `a[href^="/admin/people/"]:visible`로 바꿨다. 새 `{N}명` 링크와 숨은 폰 복제를 빼려는 것이다.
   - permissions-grid 실패 토스트: `alert` + 「저장 실패」로 좁혔다. Next 경로 안내기도 role=alert다.
7. **팀 추가 패널 본부 select를 `ui/select` `Select`로 바꿨다(SC-15 배정)**
   - people.module.css의 `.panelSelect` · `.selectInvalid`를 지웠다.
8. **점검표 파일명**: 플랜의 `2026-10-21-…` 대신 실행일 `2026-10-23-…`이다.
9. **결과 줄 낱말**
   - 플랜 E2E 문장 `거래처 보기 · 보기도 켬` 대신 `거래처 · 보기도 켬`을 쓴다. 메뉴 낱말은 07-15에서 「거래처」다.
   - 끔에서 묶음이 둘이면 `거래처, 거래처 계좌 · 서류 수정 · 쓰기·승인도 끔`이 된다.

## Known Stubs
없음.

## Threat Flags
없음 — 새 엔드포인트 · 인증 경로가 없다.
- 사람 목록 `?role` · `?team` · `?org`는 기존 `admin.people` 보기 관문 안에서만 읽는다.
- 소속 수 함수는 보기 권한이 없으면 ForbiddenError다(통합 확인).
- 행 범위(`projects`) 새 읽기는 없다.

## 열린 질문(추천안으로 진행함)
1. **UI-SPEC SC-09 · SC-13 LOADING 뼈대가 D-1 JS 끔 첫 렌더 계약과 충돌한다.** 추천: 계급 · 조직에 loading.tsx를 두지 않는다(현 구현). UI-SPEC 정정이 필요하다.
2. **assignTeam이 보관된 팀을 거부한다(06.4 동작 변경).** 추천: 유지한다. 본부 보관 여부는 assignTeam이 보지 않는다(팀만).
3. **결과 줄 `{메뉴}` 낱말.** 추천: 묶음 이름(`거래처 · 보기도 켬`), 묶음이 여럿이면 `, `로 잇는다. `/design-review`에서 확정한다.
4. **RowAction 비활성 이유 색은 `--status-danger`, UI-SPEC은 `--text-muted`이다.** 추천: 플랜대로 RowAction 그대로 두고, `/design-review` 후보로 넘긴다.
5. **폰 권한표 결과 줄의 위치.** 결과 줄이 표 위에 있어 아래쪽 칸을 누르면 화면 밖이다(role=status라 낭독은 된다). 추천: `/design-review` 후보로 넘긴다.
6. **F10** (`menus.ts:70` 알림 규칙 메뉴, 새 키 두 개의 `actions`): 위험 경로라 손대지 않았다. 07-19 머지 전에 켜면 안 된다는 보고만 남긴다.
7. **브랜치에 origin/main(3946e8b5, #277)이 아직 반영되지 않았다.** 이 브랜치는 #279 사슬 위에 있다. 추천: 사슬 머지 순서에 맞춰 오케스트레이터가 반영한다.

## Self-Check: PASSED
- 커밋 37ecaee1 · a7ad0742 · fa86e3f8가 있다(`git log b360a34e..HEAD` 3건).
- 만든 파일이 있다: role-row-controls.ts · linked-cells.ts · error.tsx 둘 · 시험 5개 · 점검표.
- 위험 경로 diff가 비어 있다: `git diff --name-only b360a34e HEAD -- db/ domain/auth/ domain/permissions/`.
