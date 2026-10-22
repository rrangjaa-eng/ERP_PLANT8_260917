---
phase: 07-schedule-notify-audit
plan: 05
type: execute
status: complete
requirements: [NOTI-03, EXP-11]
branch: claude/07-pr-perm-05
risk: permissions
merge_owner: user
subsystem: seed · permissions
tags: [D-722, D-726, D-729, C-88, ADMN-10, R10, R18]
requires: ["07-03"]
provides: ["domain/seed/role-defaults.ts ROLE_DEFAULT_PERMISSIONS · ROLE_DEFAULT_VISIBILITY", "D-722 확정값(대표 행동 로그 보기)", "07-15 입력 표"]
affects: ["07-15", "07-24", "07-25"]
key-files:
  created:
    - domain/seed/role-defaults.ts
    - test/unit/seed/role-defaults.test.ts
  modified:
    - domain/seed/index.ts
    - test/integration/seed-permissions.test.ts
    - test/e2e/role-smoke.spec.ts
decisions:
  - "D-722 카드 답 A(2026-10-22, PR #265): ①~⑦ 추천대로, ⑧ 끔, ③은 A′(시스템 관리자 evidence.intake 시드 켠 채 — 코드 변경 없음)"
  - "대표 admin.action-log 보기를 시드 계급 표에 insert-if-absent로 한 줄 — 대표 action_log.detail 노출은 false 그대로"
plan_head_before: 4f6236ee
actuals:
  tokens: 9000
  tasks: 3
  commits: 4
metrics:
  completed: 2026-10-22
---

# Phase 07 Plan 05: D-722 계급 기본값 표 Summary

시드 계급 4종(대표 · 본부 책임자 · 팀장 · 기획 PM)의 기본 권한 · 노출을 `domain/seed/role-defaults.ts` 정본 표 하나로 모으고(행 변화 0), D-722 확인 카드 답대로 대표 행동 로그 보기 한 줄을 insert-if-absent로 시드했다. C-88 세 질문은 지금 동작 그대로 스모크 행으로 고정했다.

## D-722 확인 카드 답 (2026-10-22, PR #265 댓글)

- **A — 초안대로 확정**: ①~⑦ 추천대로.
- **⑧ 끔**: 대표 `action_log.detail` 노출 시드는 false 그대로. 노출을 켜는 커밋 없음.
- **③ = A′ 취소**: 시스템 관리자 `evidence.intake` 시드는 켠 채로 둔다. 코드 변경 없음. 지금 코드에서 「증빙 전부 봄」(`domain/permissions/scope-for.ts:166`)과 `/expenses/evidence` 접근(`app/(app)/expenses/evidence/page.tsx:33`)이 그 쓰기에서만 나오므로, ③을 끄면 ②가 깨진다.
- ② 시스템 관리자 증빙 전부 봄 유지 · ④ 대표 · 본부 책임자 증빙 404 유지: 지금 동작 그대로.
- ⑤ · ⑥ · ⑦: 07-15 몫. 아래 「07-15 입력」 표.

## 커밋

| 태스크 | 커밋 | 내용 |
|---|---|---|
| 1 | `fc9a140a` | refactor: 시드 계급 기본값을 표 하나로(행 변화 0) |
| 2 | — | 확인 카드(PR #265 댓글) · 답 수령. 코드 없음 |
| 3 | `8d145ae2` | feat: 대표 `admin.action-log` 보기 시드 · 통합 사례 · 계급 스모크 행 |
| — | `3e7034d9` | Merge origin/main |
| — | (이 커밋) | docs: 07-05 SUMMARY |

`commits: 4`는 `git rev-list --count --first-parent 4f6236ee..HEAD`(이 브랜치 자체 커밋)다. 머지로 들어온 main 커밋까지 세면 14.

## Task 1 손 빨강 확인

표에서 `{ roleId: CEO_ROLE_ID, menu: "projects.complete", action: "write", allowed: true }` 한 줄을 지우고 `seed-permissions` 통합을 돌리면 「빈 DB 첫 시드 뒤 시드 계급 4종의 권한 · 노출 행 집합이 리팩터 전과 같고 반환 카운트도 같다」가 빨강(diff `- "role-ceo|projects.complete|write|true"`, 1 failed | 22 passed). 줄을 되돌리면 녹색. 이전 실행자가 Task 1에서 한 번, 이 실행자가 2026-10-22 머지 뒤 트리에서 한 번 더 확인했다.

## must_haves · 수락 기준 대조

| 항목 | 상태 | 근거 |
|---|---|---|
| truth: 시드 계급 기본값이 `role-defaults.ts` 표 한 곳 · `seedMasterData`가 표를 돎 · 재시드 행 변화 0 | 충족 | `grep -c ROLE_DEFAULT_PERMISSIONS domain/seed/index.ts` = 2 · 행 집합 같음 사례 녹색 |
| truth: 카드 답 전에는 새 값이 시드에 안 들어감 | 충족 | Task 1(`fc9a140a`)은 행 변화 0, 새 값 커밋 `8d145ae2`는 답 뒤 |
| truth: (⑧ 켬일 때만) 대표 `/admin/action-log` 열림 | 답으로 바뀜 | ⑧ 끔 — 대표 열림 행 없음, 07-25가 404 단언(R10). 대표 메뉴 보기 행만 시드 |
| truth: C-88 세 질문이 표 값 · 스모크 행으로 남음 | 충족(③ 답으로 바뀜) | 스모크: 시스템 관리자 `/expenses/evidence` 열림(②) · 대표 · 본부 책임자 404(④). ③ A′라 시스템 관리자 `evidence.intake` 켬 — 기존 통합 사례(`seed-permissions.test.ts:212`)가 단언 |
| truth: 시드 insert-if-absent · 운영 값 보존 | 충족 | 통합 「대표 admin.action-log 보기를 권한표에서 끈 뒤 재시드해도 꺼진 채」 · 기존 기획 PM 보존 사례 |
| truth: D-729 경영관리 `projects.budget` 쓰기 한 줄 | 07-15로 넘김 | 아래 「07-15 입력」 · 시드 표에 경영관리 줄 없음 |
| truth: D-726 PR-PERM 묶음 | 충족 / 오케스트레이터 몫 | 묶음 브랜치 머지 · PR 댓글 · ready는 오케스트레이터(W2-RULES §1) |
| 금지: 답 없이 새 기본값 넣지 않음 | 충족 | 위와 같음 |
| 금지: 기존 행 덮어쓰기 없음 | 충족 | 통합 보존 사례 녹색 |
| 금지: 07 새 키를 코드로 만들지 않음 | 충족 | `git diff origin/main...HEAD -- domain/permissions/menus.ts domain/permissions/info-items.ts` 빈 출력 |
| T1 수락: `ROLE_DEFAULT_PERMISSIONS` in index.ts ≥ 1 | 충족 | 2 |
| T1 수락: `insertPermissionIfAbsent` in index.ts ≥ 1 | 충족 | 4 |
| T1 수락: 줄 하나 지우면 빨강(손 확인) | 충족 | 위 「손 빨강 확인」 |
| T2 수락: 카드 댓글 ①~⑧ · 경영관리 · G34 줄 | 충족(이전 실행자) | PR #265 댓글 |
| T2 수락: ⑧ 답 없으면 노출 켜는 커밋 없음 | 충족 | ⑧ 끔 · 통합이 대표 `action_log.detail` false 단언 |
| T3 behavior: ⑧ 끔 → 표 값 변경 없음 · 대표 열림 행 없음 | 충족 | `role-smoke.spec.ts` 대표 행 = `/projects` 열림 · `/admin/permissions` · `/expenses/evidence` 404 |
| T3 behavior: 본부 책임자 `/admin/action-log` 404 | 충족 | 스모크 행 |
| T3 behavior: 기획 PM · 팀장 `/evidence` 열림 | 답·실제 동작으로 바뀜 | 실제 목록 경로 `/expenses/evidence`는 `evidence.intake` 쓰기만 엶 → 기획 PM · 팀장 404로 행 넣음(Deviations 1) |
| T3 behavior: 통합 대표 `admin.action-log` view 새 DB true · 기존 false 보존 | 충족 | 통합 두 사례 |
| T3 behavior: 통합 시스템 관리자 `evidence.intake` false(C-88 b) | 답으로 바뀜 | ③ A′ — 켠 채. 기존 사례가 true 단언 |
| T3 수락: 새 키 diff 빈 출력 | 충족 | 위 |
| T3 수락: `grep -c D-722 domain/seed/role-defaults.ts` ≥ 1 | 충족 | 2 |
| T3 수락: SUMMARY 「07-15 입력」 표 · D-729 줄 · ⑦ 답 | 충족 | 아래 |
| T3 수락: `hold` 라벨 안 붙임 | 충족 | 라벨 · PR 조작 없음 |

## 07-15 입력

| 칸 | 계급 | 값 | 근거 |
|---|---|---|---|
| ⑤ 메뉴 `admin.notification-rules` | 시스템 관리자만(MENUS 루프) | 보기 · 쓰기 켬 | 카드 A |
| ⑤ 메뉴 `vendors.account` | 시스템 관리자만(MENUS 루프) | 보기 · 쓰기 켬 | 카드 A |
| ⑤ 메뉴 `projects.budget` | 시드 계급 중 시스템 관리자만(MENUS 루프) | 보기 · 쓰기 켬 | 카드 A |
| ⑤ 정보 항목 `notification_rule.value` | 시스템 관리자만(INFO_ITEMS 루프) | 보임 | 카드 A |
| ⑤ 정보 항목 `budget.amount` | 시스템 관리자만(INFO_ITEMS 루프) | 보임 | 카드 A |
| ⑥ D-729 `projects.budget` 쓰기(예산 직접 수정 · 사유 필수) | 경영관리(시드 계급 아님) | 권한표에서 켬 — 시드 행 없음 | 카드 A(확인만). PR-PERM 본문 「배포 뒤 할 일」 · 07-24 PR 본문 확인 항목 · 07-24 UAT 수동 확인 줄로 이어짐 |
| ⑦ R18 `evidence` 보기 | `evidence.intake` 쓰기가 켜진 모든 계급(시드 계급 중 시스템 관리자는 이미 켜짐 · 운영에서 켠 계급은 배포 때 시드가 판정) | insert-if-absent로 켬 | 카드 A — 07-15 Task 3이 씀 |

경영관리는 시드 계급이 아니다 — 시드 표(`ROLE_DEFAULT_PERMISSIONS`)에 경영관리 줄은 없다.

## 대표 500 창

이 PR부터 07-25까지 대표가 `/admin/action-log`에 들어가면 500이다 — 메뉴 보기는 켰지만 ⑧ 끔이라 `action_log.detail` 노출이 없어 조회가 `ForbiddenError`(`domain/action-log/index.ts:264-266`). 상세 노출은 없다. 07-25가 404로 바꾸고 단언한다. PR-PERM 본문에도 한 줄 필요(오케스트레이터 몫).

## 검사 (머지 뒤 트리 `3e7034d9`)

`git fetch origin main` 뒤 origin/main은 이미 브랜치에 있다 — 새 머지 커밋 없음. 아래는 전부 머지 뒤 트리에서 돌렸다.

| 검사 | 결과 |
|---|---|
| 단위 `test/unit/seed/role-defaults.test.ts` | 8 passed |
| 통합 `seed-permissions` + `leak-scan`(새 `erp_w0705_test`) | 2 files · 5052 passed |
| `pnpm build:cli` | exit 0 |
| 단위 `test/unit/deploy/cli-bundle.test.ts` | 4 passed |
| 번들 실제 실행: `dist/cli/migrate-runner.mjs` → `dist/cli/seed-master.mjs`(새 시험 DB) | 둘 다 exit 0 · `permissions=125 visibility=180` · `permission_matrix`에 `role-ceo admin.action-log view t` |
| `pnpm typecheck` | exit 0 |
| `NODE_OPTIONS=--max-old-space-size=6144 pnpm lint` | exit 0(boundaries 설정 경고만, 기존) |
| E2E `role-smoke` + `action-log`(desktop, CI=true, flock) | 13 passed · 18 skipped(의존 `visual` 프로젝트 — 설계대로) |

## Deviations from Plan

1. **[Rule 1 - 경로] 플랜의 `/evidence`는 실제로 `/expenses/evidence`** — 그 목록은 `evidence.intake` 쓰기만 연다(06.1-05, `page.tsx:33`). 플랜 behavior 「기획 PM · 팀장 `/evidence` 열림」은 실제 동작과 달라, 스모크 행을 실제 동작대로 기획 PM · 팀장 404로 넣었다(그들의 `evidence` 보기는 지출결의 안 증빙 칸에서 쓰임). 시스템 관리자 열림 · 대표 · 본부 책임자 404는 플랜 그대로. 커밋 `8d145ae2`.
2. **[Rule 3 - 타입] Task 1 `noUncheckedIndexedAccess` 대응** — 이전 실행자 보고: Task 1 코드의 색인 접근을 `tsconfig`의 `noUncheckedIndexedAccess`에 맞게 고쳤다(커밋 `fc9a140a` 안, 커밋 전 형태가 남지 않아 이 실행자는 diff로 따로 짚지 못함). 동작 변화 없음 · 지금 트리 typecheck exit 0.
3. **③ C-88 b 미적용** — 플랜 action ①의 「시스템 관리자 MENUS 루프에서 `evidence.intake` 분기」는 카드 답 ③ A′로 하지 않음(위 대조표).
4. **오케스트레이터 몫으로 남김** — 플랜 action ④의 묶음 브랜치 머지 커밋 · PR-PERM 「[완료 보고]」 댓글은 W2-RULES §1(PR · 댓글 · 머지 금지)에 따라 하지 않음.

## Known Stubs

없음.

## 다음 플랜 메모

- † 표 밖 시드 행: `domain/seed/approvals-leave.ts`(leave 메뉴 · 노출) · `domain/seed/expenses.ts`(expenses · expenses.team · 노출)는 아직 `role-defaults.ts` 표 밖에서 직접 insert-if-absent한다. 「계급 기본값 한 곳」을 완전히 하려면 다음 검수 플랜이 표로 옮긴다(이 플랜 범위 밖).
- 07-15: 위 「07-15 입력」 표를 precondition으로 쓴다. ⑦은 증빙 범위를 `evidence` 보기 우선으로 바꿀 때 같은 커밋에.
- 07-25: 대표 `/admin/action-log` 404 단언(⑧ 끔).
- 07-24: D-729 경영관리 칸이 꺼져 있으면 `예산 바꾸기`가 안 보이는 것을 E2E 전제로.

## Self-Check: PASSED

- 파일: `domain/seed/role-defaults.ts` · `test/unit/seed/role-defaults.test.ts` 있음
- 커밋: `fc9a140a` · `8d145ae2` · `3e7034d9` 브랜치에 있음
