---
schema_version: 1
open_count: 5
waived_count: 0
fixed_count: 7
total_count: 12
last_updated: 2026-09-20T06:07:59.294Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 01 | lint-warning | .squawk.toml |  | prefer-timestamp-tz excluded — better-auth 12개 timestamp 컬럼이 timezone 없음, timestamptz 전환은 스키마 전체 변경 필요(01-04 범위 밖) | open |  | 2026-09-18T09:14:36.211Z |  |
| 2 | 01 | lint-warning | .squawk.toml |  | prefer-bigint-over-int excluded — rate_limits.count(integer)는 better-auth 자체 필드, bigint 전환은 adapter 스키마 검사와 충돌 위험 | open |  | 2026-09-18T09:14:36.412Z |  |
| 3 | 01 | lint-warning | .squawk.toml |  | adding-required-field excluded — rate_limits.id NOT NULL 추가(0002), 마이그레이션 시점에 테이블이 항상 비어 있어 실질 위험 없음 | open |  | 2026-09-18T09:14:36.610Z |  |
| 4 | 01 | lint-warning | .squawk.toml |  | require-concurrent-index-creation excluded — drizzle migrate()의 단일 트랜잭션과 CONCURRENTLY가 근본적으로 양립 불가(현재 SQL엔 미사용, 예방적 배제) | open |  | 2026-09-18T09:14:36.814Z |  |
| 5 | 02 | deviation | ui/shell/TopBar.tsx |  | PC 상단 바의 현재 메뉴(aria-current) 하이라이트는 CSS만 준비되고 실제 경로 연결은 되지 않음 — layout.tsx가 현재 pathname을 얻을 방법이 없어(미들웨어 확장은 이 플랜 범위 밖) 배선을 다음 페이즈로 미룸 | fixed |  | 2026-09-19T16:39:08.491Z | 2026-09-19T22:23:52.699Z |
| 6 | 02 | deviation | app/(auth)/login/login-form.tsx |  | 로그인 실패 문구가 SYSTEM.md §6-7 A②의 한국어 문장이 아니라 better-auth 영문("Invalid email or password") — login-form.tsx:32가 result.error.message를 GENERIC_ERROR보다 우선한다. 카피 결함이라 02-08(스타일 갭 클로저) 범위 밖이었고, 02-VERIFICATION.md 재검증에서 미추적으로 확인되어 등록 | fixed |  | 2026-09-19T22:41:02.543Z | 2026-09-20T02:13:51.401Z |
| 7 | 02 | deviation | docs/design/SYSTEM.md |  | §2-2(--fs-2xl = KPI 타일 전용)와 §6-9(오류 페이지 제목 = --fs-2xl)가 같은 토큰에 다른 용도를 지정한다. 02-08은 구체가 일반을 이긴다는 해석으로 §6-9를 정본 삼아 구현했고 렌더 픽셀은 정확하다. KPI 타일이 아직 없어(Phase 9~10) 지금 판단할 근거가 부족해 미룸 — 2026-09-20 사용자 결정, DECISIONS.md 기록. KPI 타일을 처음 만드는 페이즈에서 §2-2를 넓히거나 오류 제목에 별도 토큰을 주는 것 중 하나로 정리한다 | open |  | 2026-09-20T02:13:42.754Z |  |
| 8 | 02 | deviation | app/(app)/layout.tsx |  | WR-07 해소: 6개 페이지(approvals·cards·expenses·pnl·projects·settings)가 레이아웃 인증에만 의존하던 것을 각 페이지의 requireSession()으로 바꿨다. test/unit/page-auth-guard.test.ts가 (app) 그룹의 모든 page.tsx를 훑어 앞으로 만드는 페이지도 자동으로 잡는다 | fixed |  | 2026-09-20T05:53:42.705Z | 2026-09-20T05:53:54.621Z |
| 9 | 02 | deviation | ui/logout/use-logout.ts |  | WR-06 해소: 로그아웃 세 경로의 실패 처리를 useLogout 훅 한 곳으로 모았다. 성공해야만 메뉴·시트를 닫고, 실패하면 pending을 풀고 role=alert 문구를 보인다. test/e2e/logout-failure.spec.ts가 sign-out을 네트워크 단에서 끊어 검증한다 | fixed |  | 2026-09-20T06:00:52.976Z | 2026-09-20T06:00:53.167Z |
| 10 | 02 | deviation | ui/ |  | WR-02·WR-03 해소: 사용자 메뉴에 WAI-ARIA menu 키(ArrowDown/Up·Home/End, 순환)와 표준 해제(Tab 이탈·바깥 클릭)를 붙였다. test/e2e/user-menu.spec.ts 5건 | fixed |  | 2026-09-20T06:07:58.325Z | 2026-09-20T06:07:58.906Z |
| 11 | 02 | deviation | ui/ |  | WR-05 해소: 토스트 자동 소멸 타이머가 onDismiss 정체성 변화에 재시작되던 것을 ref로 끊었다. 오류 토스트 role=alert. test/unit/ui/toast-timer.test.ts | fixed |  | 2026-09-20T06:07:58.521Z | 2026-09-20T06:07:59.100Z |
| 12 | 02 | deviation | ui/ |  | WR-04 해소: 「내 차례」 다음 한 수가 item.action.href로 실제 이동한다. 더 보기는 moreHref가 있을 때만 링크. test/unit/ui/next-turn-action.test.ts | fixed |  | 2026-09-20T06:07:58.715Z | 2026-09-20T06:07:59.294Z |

````json
[
  {
    "id": 1,
    "kind": "lint-warning",
    "phase": "01",
    "file": ".squawk.toml",
    "line": null,
    "description": "prefer-timestamp-tz excluded — better-auth 12개 timestamp 컬럼이 timezone 없음, timestamptz 전환은 스키마 전체 변경 필요(01-04 범위 밖)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-18T09:14:36.211Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 2,
    "kind": "lint-warning",
    "phase": "01",
    "file": ".squawk.toml",
    "line": null,
    "description": "prefer-bigint-over-int excluded — rate_limits.count(integer)는 better-auth 자체 필드, bigint 전환은 adapter 스키마 검사와 충돌 위험",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-18T09:14:36.412Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 3,
    "kind": "lint-warning",
    "phase": "01",
    "file": ".squawk.toml",
    "line": null,
    "description": "adding-required-field excluded — rate_limits.id NOT NULL 추가(0002), 마이그레이션 시점에 테이블이 항상 비어 있어 실질 위험 없음",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-18T09:14:36.610Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 4,
    "kind": "lint-warning",
    "phase": "01",
    "file": ".squawk.toml",
    "line": null,
    "description": "require-concurrent-index-creation excluded — drizzle migrate()의 단일 트랜잭션과 CONCURRENTLY가 근본적으로 양립 불가(현재 SQL엔 미사용, 예방적 배제)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-18T09:14:36.814Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 5,
    "kind": "deviation",
    "phase": "02",
    "file": "ui/shell/TopBar.tsx",
    "line": null,
    "description": "PC 상단 바의 현재 메뉴(aria-current) 하이라이트는 CSS만 준비되고 실제 경로 연결은 되지 않음 — layout.tsx가 현재 pathname을 얻을 방법이 없어(미들웨어 확장은 이 플랜 범위 밖) 배선을 다음 페이즈로 미룸",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-19T16:39:08.491Z",
    "resolved_at": "2026-09-19T22:23:52.699Z",
    "milestone": null
  },
  {
    "id": 6,
    "kind": "deviation",
    "phase": "02",
    "file": "app/(auth)/login/login-form.tsx",
    "line": null,
    "description": "로그인 실패 문구가 SYSTEM.md §6-7 A②의 한국어 문장이 아니라 better-auth 영문(\"Invalid email or password\") — login-form.tsx:32가 result.error.message를 GENERIC_ERROR보다 우선한다. 카피 결함이라 02-08(스타일 갭 클로저) 범위 밖이었고, 02-VERIFICATION.md 재검증에서 미추적으로 확인되어 등록",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-19T22:41:02.543Z",
    "resolved_at": "2026-09-20T02:13:51.401Z",
    "milestone": null
  },
  {
    "id": 7,
    "kind": "deviation",
    "phase": "02",
    "file": "docs/design/SYSTEM.md",
    "line": null,
    "description": "§2-2(--fs-2xl = KPI 타일 전용)와 §6-9(오류 페이지 제목 = --fs-2xl)가 같은 토큰에 다른 용도를 지정한다. 02-08은 구체가 일반을 이긴다는 해석으로 §6-9를 정본 삼아 구현했고 렌더 픽셀은 정확하다. KPI 타일이 아직 없어(Phase 9~10) 지금 판단할 근거가 부족해 미룸 — 2026-09-20 사용자 결정, DECISIONS.md 기록. KPI 타일을 처음 만드는 페이즈에서 §2-2를 넓히거나 오류 제목에 별도 토큰을 주는 것 중 하나로 정리한다",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-20T02:13:42.754Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 8,
    "kind": "deviation",
    "phase": "02",
    "file": "app/(app)/layout.tsx",
    "line": null,
    "description": "WR-07 해소: 6개 페이지(approvals·cards·expenses·pnl·projects·settings)가 레이아웃 인증에만 의존하던 것을 각 페이지의 requireSession()으로 바꿨다. test/unit/page-auth-guard.test.ts가 (app) 그룹의 모든 page.tsx를 훑어 앞으로 만드는 페이지도 자동으로 잡는다",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-20T05:53:42.705Z",
    "resolved_at": "2026-09-20T05:53:54.621Z",
    "milestone": null
  },
  {
    "id": 9,
    "kind": "deviation",
    "phase": "02",
    "file": "ui/logout/use-logout.ts",
    "line": null,
    "description": "WR-06 해소: 로그아웃 세 경로의 실패 처리를 useLogout 훅 한 곳으로 모았다. 성공해야만 메뉴·시트를 닫고, 실패하면 pending을 풀고 role=alert 문구를 보인다. test/e2e/logout-failure.spec.ts가 sign-out을 네트워크 단에서 끊어 검증한다",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-20T06:00:52.976Z",
    "resolved_at": "2026-09-20T06:00:53.167Z",
    "milestone": null
  },
  {
    "id": 10,
    "kind": "deviation",
    "phase": "02",
    "file": "ui/",
    "line": null,
    "description": "WR-02·WR-03 해소: 사용자 메뉴에 WAI-ARIA menu 키(ArrowDown/Up·Home/End, 순환)와 표준 해제(Tab 이탈·바깥 클릭)를 붙였다. test/e2e/user-menu.spec.ts 5건",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-20T06:07:58.325Z",
    "resolved_at": "2026-09-20T06:07:58.906Z",
    "milestone": null
  },
  {
    "id": 11,
    "kind": "deviation",
    "phase": "02",
    "file": "ui/",
    "line": null,
    "description": "WR-05 해소: 토스트 자동 소멸 타이머가 onDismiss 정체성 변화에 재시작되던 것을 ref로 끊었다. 오류 토스트 role=alert. test/unit/ui/toast-timer.test.ts",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-20T06:07:58.521Z",
    "resolved_at": "2026-09-20T06:07:59.100Z",
    "milestone": null
  },
  {
    "id": 12,
    "kind": "deviation",
    "phase": "02",
    "file": "ui/",
    "line": null,
    "description": "WR-04 해소: 「내 차례」 다음 한 수가 item.action.href로 실제 이동한다. 더 보기는 moreHref가 있을 때만 링크. test/unit/ui/next-turn-action.test.ts",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-20T06:07:58.715Z",
    "resolved_at": "2026-09-20T06:07:59.294Z",
    "milestone": null
  }
]
````
