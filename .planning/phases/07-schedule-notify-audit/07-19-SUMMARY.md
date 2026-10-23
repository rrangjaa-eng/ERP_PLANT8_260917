---
phase: 07-schedule-notify-audit
plan: 19
subsystem: 알림 규칙 화면(SC-05) · 알림함 링크 · 접힘(SC-06)
tags: [NOTI-03, D-716, D-717, D-719, D-744, D-748, N2, N3, N4, N6, N17, N25, N26, K10, K18, U6, U10, U17, screen]
status: complete
requires:
  - 07-10 / 07-14 (규칙 엔진 · notificationHref · CONDITION_KINDS)
  - 07-15 (admin.notification-rules 메뉴 키 · 정보 항목 notification_rule.value)
  - 07-12 (ADMIN_MENUS 자리 · SYSTEM §7-12 개정 2 · 3)
provides:
  - /admin/notification-rules — 규칙 표(켬 즉시 저장 · aria-busy 연타 방지 · 실패 원복 + 오류 줄) · 옆 패널 `{규칙} 수정` · loading · error
  - domain/notify/rule-admin.ts — listRuleRows · setRuleEnabled · saveNotificationRule (notification_rule_change 행동 로그 · version · enabled_at)
  - 알림함 — 문장 링크(href) · kindLabel · 같은 날 같은 종류 5건 이상 접힘(domain/notify/inbox-fold.ts) · loading 「시각」 머리글 클래스
  - ui/table — TableColumn.headerClassName · TableSkeleton 열 className (선택 속성)
  - SYSTEM §6-10 개정 4 · §7-12 개정 13 + DECISIONS 기록
affects:
  - 07-23 (SYSTEM · DECISIONS 사슬)
key-files:
  created:
    - app/(app)/admin/notification-rules/{page,rules-client,actions,actions.registry,layout,loading,error}.tsx|ts + notification-rules.module.css
    - domain/notify/rule-admin.ts
    - domain/notify/inbox-fold.ts
    - test/unit/app/notification-rules-boundaries.test.ts
    - test/unit/app/notifications-loading.test.ts
    - test/integration/notify/rule-admin.test.ts
    - test/integration/notify/inbox-links.test.ts
    - test/e2e/notification-rules.spec.ts
    - test/e2e/notify-inbox-fixture.ts
    - docs/design/checks/2026-10-21-07-19-notification-screens.md
  modified:
    - repositories/notification-rules.ts · repositories/notifications.ts
    - domain/notify/inbox.ts · domain/seed/index.ts (PC-08 예외 줄만 지움)
    - app/(app)/notifications/{inbox-list.tsx,inbox-list.module.css,loading.tsx}
    - ui/table/{Table.tsx,TableSkeleton.tsx,types.ts}
    - docs/design/SYSTEM.md · docs/design/DECISIONS.md
    - test/e2e/{notify-inbox,mobile-notify-inbox,admin-nav}.spec.ts · test/unit/ui/role-menu.test.ts · test/integration/{seed-permissions,leak-scan}.test.ts
decisions:
  - "규칙 조회 오류 문구는 명사형 `불러오기 실패 · 다시 시도` — error-copy-noun-style 가드(SYSTEM §8-3)가 「~하지 못했습니다」를 막는다(플랜 문구에서 옮김)"
  - "ui/table 변경은 선택 속성만(headerClassName · className) — 다른 호출부 동작 불변"
  - "알림함 접힘 판정은 순수 함수 foldInbox로 분리 — 통합 시험이 같은 함수를 단언"
metrics:
  duration: multi-session (컨테이너 재시작으로 이어받음)
  completed: 2026-10-23
actuals:
  tokens: 0
  tasks: 3
  commits: 5
plan_head_before: 0f362733d39b74cb08b1350c635a28ccccfec4d7
---

# Phase 07 Plan 19: 알림 규칙 화면 · 알림함 링크 · 접힘 Summary

관리자가 `/admin/notification-rules`에서 등록된 조건 종류별로 켬 · 일수 · 받는 계급(회사 전체) · 이메일을 바꾸고(변경은 행동 로그 · version · enabled_at), 알림함 문장은 볼 수 있는 문서로 이어지며 같은 날 같은 종류 5건 이상은 접힌다.

## Tasks

| Task | 내용 | 커밋 |
| ---- | ---- | ---- |
| 1 (tracer) | 규칙 표 · 켬 즉시 저장 · 행동 로그 · enabled_at · SYSTEM 개정 4 · 13 · PC-08 시드 예외 지움 | b8ff53b9 |
| 2 | 옆 패널 `{규칙} 수정` · 동시 수정 · loading · error | 45179394, b9d594f2(오류 문구 명사형) |
| 3 | 알림함 조회 칸 · href · kindLabel · 접힘 · loading 머리글 · ui/table 선택 속성 | 583b1590 |
| — | origin/main 머지 커밋(DECISIONS.md 충돌은 양쪽 기록 모두 유지) | 0531251a |

## 호출한 스킬
- plant8:design-gate — 화면 파일 전에 · Task 3 재개 때 다시(점검표 `docs/design/checks/2026-10-21-07-19-notification-screens.md` 규칙 화면 + 알림함 절, 모든 항목 `[x]` + 근거)
- superpowers:test-driven-development — Task별 RED 후 GREEN(통합 red-int / int-red3 로그, 오류 문구 단위 RED 확인 후 수정)
- superpowers:systematic-debugging — 마지막 전체 단위 실행의 실패 2건 추적(아래)
- superpowers:verification-before-completion — 커밋 전 lint · typecheck · 단위 · 통합 · E2E 새로 실행

## 검증(마지막 실행 기준, 로그 /home/user/wt/logs/07-19/)
- `pnpm lint` exit 0 (머지 뒤 lint9.log) · `pnpm typecheck` exit 0 (머지 뒤 tc7.log) · `pnpm lint:sql` 0 issues (46 files)
- 단위 전체(`--project unit`) 머지 뒤: 349 파일 passed · 5361 passed / 6 skipped (unit7.log)
- 통합: 마지막 전체 통합 17 파일 5369 통과(int4.log, Task 3 코드 확정 뒤) · 07-19 관련 inbox-links 단독 9 통과(int6.log)
- E2E CI=true 프로덕션 빌드, `--project=desktop --project=mobile-375 --no-deps`: notify-inbox · mobile-notify-inbox · notification-rules · mobile-notification-rules 39 passed (e2e8.log). origin/main 머지 뒤 재빌드 · 재실행(admin-nav 포함): 46 passed (e2e9.log)
- ui/table 공유 변경 영향: 선택 속성 추가뿐 — ui/table 단위 시험과 전체 단위 통과, 다른 호출부 코드 변경 0
- 독립 DOM 감사(`audit/07-19-dom-audit.md`)는 오케스트레이터 몫 — 실행하지 않았다

## Deviations from Plan

### Auto-fixed Issues
1. **[Rule 1 - Bug] 규칙 화면 조회 오류 문구** — 플랜의 `불러오지 못했습니다 · 다시 시도`가 `error-copy-noun-style` 가드(전체 단위에서만 드러남)에 걸렸다. 프로젝트 오류 경계 선례(`… 불러오기 실패`)대로 `불러오기 실패 · 다시 시도`로 옮기고 단위 시험도 맞췄다. (b9d594f2)
2. **[Rule 3] `ui/table` 선택 속성 2개** — loading 「시각」 머리글에 로드 뒤와 같은 폭 클래스를 주려면 표 열에 머리글 클래스를 줄 길이 없었다. `TableColumn.headerClassName`, `TableSkeleton` 열 `className`을 선택 속성으로 더했다(플랜 files_modified 밖 3파일).
3. **[Rule 3] 새 파일** — `domain/notify/inbox-fold.ts`(접힘 순수 함수), `test/e2e/notify-inbox-fixture.ts`(알림 시드 준비), `test/unit/app/notifications-loading.test.ts`, 규칙 화면 `layout.tsx` — 플랜 목록 밖.

### 시험 안정성 메모
- 전체 통합 실행 중 `inbox-links` 「결재 차례 50행」이 `beforeEach` truncate 훅 10초 시간 초과로 한 번 실패 — 단독 재실행 9 통과(병렬 DB 부하, 코드 원인 아님). 같은 성질의 시간 초과를 07-16 SUMMARY도 기록했다.

## Known Stubs
없음.

## 열린 질문(권장안으로 진행)
- 오류 문구: 플랜/UI-SPEC의 `불러오지 못했습니다 · 다시 시도`를 가드에 맞춰 `불러오기 실패 · 다시 시도`로 옮겼다. 권장: 이대로 두고 UI-SPEC K18 문구를 다음 개정 때 명사형으로 정정(`.planning/` 수정은 이 실행의 몫이 아님).
- 받는 계급만 더한 저장은 `enabled_at`을 바꾸지 않아 새 계급 사용자가 지난 14일 사건을 한 번 받는다(플랜 플래그 B7) — 권장: 의도대로 두고 운영 중 확인.

## 미확인
- origin/main 머지 뒤의 전체 통합 · 전체 E2E는 로컬에서 돌리지 않았다(CI 몫). 머지 뒤에는 단위 전체 · lint · typecheck · 07-19 화면 E2E 46건만 다시 돌렸다.
- `/review` · `/design-review` · `/qa` · 독립 DOM 감사 · PR 생성 · ready는 오케스트레이터 몫.

## Self-Check: PASSED
- 파일: domain/notify/rule-admin.ts · domain/notify/inbox-fold.ts · app/(app)/admin/notification-rules/page.tsx · test/integration/notify/inbox-links.test.ts · 점검표 — 존재
- 커밋: b8ff53b9 · 45179394 · b9d594f2 · 583b1590 · 0531251a — git log에 있음
