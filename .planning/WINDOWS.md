---
schema_version: 1
open_count: 14
waived_count: 0
fixed_count: 13
total_count: 27
last_updated: 2026-09-22T22:32:21.535Z
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
| 13 | 02 | unrun-verify | docs/design/tokens.css |  | D-32 미검증: Windows Chrome/Edge에서 Pretendard가 실제로 렌더되는지(맑은고딕 폴백 아님)·숫자 tabular 정렬·폰트 전송량 200~300KB. 리눅스 CI의 Playwright로는 판정 불가 — 실제 Windows 브라우저가 필요하다. /gsd-verify-work 02 | fixed |  | 2026-09-20T08:00:58.462Z | 2026-09-22T05:07:38.170Z |
| 14 | 02 | unrun-verify | ui/shell/Shell.module.css |  | 태블릿 700~1023px 뷰포트 미검증: PC 셸이 유지되고 하단 탭이 안 나오는지. 미디어 쿼리 존재만 확인했고 그 폭으로 실제 렌더해 보지 않았다(Playwright 프로젝트가 desktop·mobile-375 둘뿐). /gsd-verify-work 02 | fixed |  | 2026-09-20T08:00:58.639Z | 2026-09-22T05:07:38.351Z |
| 15 | 02 | unrun-verify | docs/design/SYSTEM.md |  | 375px 시각 품질 미검증: E2E는 계산값만 재고 보기 좋은지는 판정하지 않는다. /design-review(SYSTEM.md 일관성) + /qa(실제 브라우저) 미실행 — CLAUDE.md가 UI 완료 판정 조건으로 지정한 둘이다 | open |  | 2026-09-20T08:00:58.866Z |  |
| 16 | 02 | unrun-verify | ui/next-turn/NextTurn.module.css |  | 「내 차례」 폰 2줄 레이아웃 미검증: D-24로 buildNextTurnView 입력이 항상 []라 블록이 렌더되지 않아 자동·수동 모두 확인 불가. Phase 4가 첫 실제 항목을 넣을 때 검증한다 | fixed |  | 2026-09-20T08:00:59.072Z | 2026-09-22T05:07:38.521Z |
| 17 | 01 | unrun-verify | docs/OPERATIONS.md |  | Cloud Run/Cloud SQL 실제 과금액 미확인(01-05 D5): min-instances 0 전제의 '비용 ≈ 0'은 GCP 청구서로만 판정된다. 코드·테스트로 증명 불가 | open |  | 2026-09-20T08:55:21.416Z |  |
| 18 | 01 | unrun-verify | app/(auth)/login/login-form.tsx |  | 프로덕션 세션 유지 미검증(01-VERIFICATION human 1): 실제 Cloud Run 도메인에서 로그인 후 브라우저 완전 종료 → 재진입 시 /account 유지되는지. 근거는 로컬 E2E의 30일 쿠키 단언과 lib/auth.ts expiresIn뿐이고, 프로브는 /login에서 Set-Cookie를 못 봐 닫지 못했다 | fixed |  | 2026-09-20T08:55:21.607Z | 2026-09-22T06:23:58.276Z |
| 19 | 01 | unrun-verify | app/admin/system-status/page.tsx |  | 프로덕션 /admin/system-status 관리자 렌더 + 백업 절 미관찰(01-VERIFICATION human 2, 01-08 human-check 3·4): 런타임 SA의 roles/cloudsql.viewer 실부여와 lib/gcp/cloud-sql-admin.ts 호출 경로가 프로덕션에서 한 번도 실행·관찰되지 않았다 | fixed |  | 2026-09-20T08:55:21.801Z | 2026-09-22T06:23:58.442Z |
| 20 | 01 | unrun-verify | infra/monitoring/tick-stale.json.tpl |  | 백업 실패 경보 필터·메일 전달 미검증(01-VERIFICATION human 3): 경보 정책 존재는 2026-09-18 실측으로 확인됐으나, 실패 이벤트 없이는 필터 정확성과 메일 도달을 프로그램으로 검증할 수 없다 | open |  | 2026-09-20T08:55:22.100Z |  |
| 21 | 01 | unrun-verify | scripts/bootstrap-gcp.sh |  | 조직 정책 원문·런타임 SA 역할 미확인(01-VERIFICATION human 4): gha-deployer SA에 orgpolicy.policy.get·resourcemanager.projects.getIamPolicy가 없어 실행자가 조회 불가(PERMISSION_DENIED). 실효적 차단 없음만 확인됨 — 원문 확인은 Owner 계정 몫 | fixed |  | 2026-09-20T08:55:22.302Z | 2026-09-22T06:00:49.449Z |
| 22 | 01 | unrun-verify | .planning/phases/01-deploy-skeleton-login/01-08-DEPLOY-LOG.md |  | origin 임시 프로브 브랜치 4개 미삭제(probe-result·probe-result2·guard-probe-result·prod-verify-result): 2026-09-20 확인 결과 전부 잔존. git push --delete가 이 세션의 에그레스 프록시에서 끊긴다(일반 push는 정상) — 사용자가 GitHub에서 삭제해야 한다 | open |  | 2026-09-20T08:55:22.487Z |  |
| 23 | 02 | deviation | ui/shell/TopBar.tsx |  | §10 터치 목표 44 미달(375px DOM 감사 2026-09-22): 사용자 메뉴 트리거 19px, 로그인·비밀번호 변경·로그아웃·첫 화면으로 버튼 40px(--control-h 폰 40). 컨트롤 높이는 SYSTEM.md 토큰 결정이라 화면 하나로 못 고친다 — 디자인 결정 후 tokens.css에서 | open |  | 2026-09-22T05:07:38.693Z |  |
| 24 | 02 | deviation | docs/design/system/preview.html |  | §7-4 폰 두 줄 실물(preview.html .next li grid)이 §7-4 원문과 다르게 렌더된다 — grid(auto 1fr auto) 자동 배치가 .amt를 2행 2칸에 먼저 놓아 .go(행동)가 2행으로 밀린다. 컴포넌트(NextTurn)는 2026-09-22 원문대로 고쳤고(test/e2e/mobile-next-turn.spec.ts 실측) 실물은 미수정. 디자인 문서 정비 시 맞춘다 | open |  | 2026-09-22T05:07:38.860Z |  |
| 25 | 04 | unrun-verify | test/e2e/action-log.spec.ts |  | 04-01: 전체 E2E 스위트 동시 실행 시 간헐적 실패(단독 실행은 통과) — Excel BOM·corp-cards·master-edit·org, 웹서버 stream 오류 의심, 04-01 범위 밖 | open |  | 2026-09-22T20:41:47.158Z |  |
| 26 | 04 | stub | app/(app)/projects/[id]/revenue-section.tsx |  | 발행·입금 줄은 스키마·domain 계층이 이미 임의 통화를 지원하나 UI는 KRW 입력만 제공한다(계약 금액·견적 단가는 통화 Select+환율 완비) — 04-04 이후 외화 입금 실사례가 나오면 마저 채운다 | open |  | 2026-09-22T21:35:03.481Z |  |
| 27 | 04 | stub | app/(app)/projects/projects-table.tsx |  | 열 머리글 클릭 정렬·aria-sort 미구현 — ui/table/Table.tsx가 04-04 소유 파일이라 이 플랜은 건드리지 않는다(서버 정렬 자체는 구현·테스트됨, URL 파라미터 직접 내비게이션으로 검증) | open |  | 2026-09-22T22:32:21.535Z |  |

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
  },
  {
    "id": 13,
    "kind": "unrun-verify",
    "phase": "02",
    "file": "docs/design/tokens.css",
    "line": null,
    "description": "D-32 미검증: Windows Chrome/Edge에서 Pretendard가 실제로 렌더되는지(맑은고딕 폴백 아님)·숫자 tabular 정렬·폰트 전송량 200~300KB. 리눅스 CI의 Playwright로는 판정 불가 — 실제 Windows 브라우저가 필요하다. /gsd-verify-work 02",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-20T08:00:58.462Z",
    "resolved_at": "2026-09-22T05:07:38.170Z",
    "milestone": null
  },
  {
    "id": 14,
    "kind": "unrun-verify",
    "phase": "02",
    "file": "ui/shell/Shell.module.css",
    "line": null,
    "description": "태블릿 700~1023px 뷰포트 미검증: PC 셸이 유지되고 하단 탭이 안 나오는지. 미디어 쿼리 존재만 확인했고 그 폭으로 실제 렌더해 보지 않았다(Playwright 프로젝트가 desktop·mobile-375 둘뿐). /gsd-verify-work 02",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-20T08:00:58.639Z",
    "resolved_at": "2026-09-22T05:07:38.351Z",
    "milestone": null
  },
  {
    "id": 15,
    "kind": "unrun-verify",
    "phase": "02",
    "file": "docs/design/SYSTEM.md",
    "line": null,
    "description": "375px 시각 품질 미검증: E2E는 계산값만 재고 보기 좋은지는 판정하지 않는다. /design-review(SYSTEM.md 일관성) + /qa(실제 브라우저) 미실행 — CLAUDE.md가 UI 완료 판정 조건으로 지정한 둘이다",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-20T08:00:58.866Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 16,
    "kind": "unrun-verify",
    "phase": "02",
    "file": "ui/next-turn/NextTurn.module.css",
    "line": null,
    "description": "「내 차례」 폰 2줄 레이아웃 미검증: D-24로 buildNextTurnView 입력이 항상 []라 블록이 렌더되지 않아 자동·수동 모두 확인 불가. Phase 4가 첫 실제 항목을 넣을 때 검증한다",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-20T08:00:59.072Z",
    "resolved_at": "2026-09-22T05:07:38.521Z",
    "milestone": null
  },
  {
    "id": 17,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "docs/OPERATIONS.md",
    "line": null,
    "description": "Cloud Run/Cloud SQL 실제 과금액 미확인(01-05 D5): min-instances 0 전제의 '비용 ≈ 0'은 GCP 청구서로만 판정된다. 코드·테스트로 증명 불가",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-20T08:55:21.416Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 18,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "app/(auth)/login/login-form.tsx",
    "line": null,
    "description": "프로덕션 세션 유지 미검증(01-VERIFICATION human 1): 실제 Cloud Run 도메인에서 로그인 후 브라우저 완전 종료 → 재진입 시 /account 유지되는지. 근거는 로컬 E2E의 30일 쿠키 단언과 lib/auth.ts expiresIn뿐이고, 프로브는 /login에서 Set-Cookie를 못 봐 닫지 못했다",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-20T08:55:21.607Z",
    "resolved_at": "2026-09-22T06:23:58.276Z",
    "milestone": null
  },
  {
    "id": 19,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "app/admin/system-status/page.tsx",
    "line": null,
    "description": "프로덕션 /admin/system-status 관리자 렌더 + 백업 절 미관찰(01-VERIFICATION human 2, 01-08 human-check 3·4): 런타임 SA의 roles/cloudsql.viewer 실부여와 lib/gcp/cloud-sql-admin.ts 호출 경로가 프로덕션에서 한 번도 실행·관찰되지 않았다",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-20T08:55:21.801Z",
    "resolved_at": "2026-09-22T06:23:58.442Z",
    "milestone": null
  },
  {
    "id": 20,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "infra/monitoring/tick-stale.json.tpl",
    "line": null,
    "description": "백업 실패 경보 필터·메일 전달 미검증(01-VERIFICATION human 3): 경보 정책 존재는 2026-09-18 실측으로 확인됐으나, 실패 이벤트 없이는 필터 정확성과 메일 도달을 프로그램으로 검증할 수 없다",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-20T08:55:22.100Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 21,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "scripts/bootstrap-gcp.sh",
    "line": null,
    "description": "조직 정책 원문·런타임 SA 역할 미확인(01-VERIFICATION human 4): gha-deployer SA에 orgpolicy.policy.get·resourcemanager.projects.getIamPolicy가 없어 실행자가 조회 불가(PERMISSION_DENIED). 실효적 차단 없음만 확인됨 — 원문 확인은 Owner 계정 몫",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-20T08:55:22.302Z",
    "resolved_at": "2026-09-22T06:00:49.449Z",
    "milestone": null
  },
  {
    "id": 22,
    "kind": "unrun-verify",
    "phase": "01",
    "file": ".planning/phases/01-deploy-skeleton-login/01-08-DEPLOY-LOG.md",
    "line": null,
    "description": "origin 임시 프로브 브랜치 4개 미삭제(probe-result·probe-result2·guard-probe-result·prod-verify-result): 2026-09-20 확인 결과 전부 잔존. git push --delete가 이 세션의 에그레스 프록시에서 끊긴다(일반 push는 정상) — 사용자가 GitHub에서 삭제해야 한다",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-20T08:55:22.487Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 23,
    "kind": "deviation",
    "phase": "02",
    "file": "ui/shell/TopBar.tsx",
    "line": null,
    "description": "§10 터치 목표 44 미달(375px DOM 감사 2026-09-22): 사용자 메뉴 트리거 19px, 로그인·비밀번호 변경·로그아웃·첫 화면으로 버튼 40px(--control-h 폰 40). 컨트롤 높이는 SYSTEM.md 토큰 결정이라 화면 하나로 못 고친다 — 디자인 결정 후 tokens.css에서",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-22T05:07:38.693Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 24,
    "kind": "deviation",
    "phase": "02",
    "file": "docs/design/system/preview.html",
    "line": null,
    "description": "§7-4 폰 두 줄 실물(preview.html .next li grid)이 §7-4 원문과 다르게 렌더된다 — grid(auto 1fr auto) 자동 배치가 .amt를 2행 2칸에 먼저 놓아 .go(행동)가 2행으로 밀린다. 컴포넌트(NextTurn)는 2026-09-22 원문대로 고쳤고(test/e2e/mobile-next-turn.spec.ts 실측) 실물은 미수정. 디자인 문서 정비 시 맞춘다",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-22T05:07:38.860Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 25,
    "kind": "unrun-verify",
    "phase": "04",
    "file": "test/e2e/action-log.spec.ts",
    "line": null,
    "description": "04-01: 전체 E2E 스위트 동시 실행 시 간헐적 실패(단독 실행은 통과) — Excel BOM·corp-cards·master-edit·org, 웹서버 stream 오류 의심, 04-01 범위 밖",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-22T20:41:47.158Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 26,
    "kind": "stub",
    "phase": "04",
    "file": "app/(app)/projects/[id]/revenue-section.tsx",
    "line": null,
    "description": "발행·입금 줄은 스키마·domain 계층이 이미 임의 통화를 지원하나 UI는 KRW 입력만 제공한다(계약 금액·견적 단가는 통화 Select+환율 완비) — 04-04 이후 외화 입금 실사례가 나오면 마저 채운다",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-22T21:35:03.481Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 27,
    "kind": "stub",
    "phase": "04",
    "file": "app/(app)/projects/projects-table.tsx",
    "line": null,
    "description": "열 머리글 클릭 정렬·aria-sort 미구현 — ui/table/Table.tsx가 04-04 소유 파일이라 이 플랜은 건드리지 않는다(서버 정렬 자체는 구현·테스트됨, URL 파라미터 직접 내비게이션으로 검증)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-22T22:32:21.535Z",
    "resolved_at": null,
    "milestone": null
  }
]
````
