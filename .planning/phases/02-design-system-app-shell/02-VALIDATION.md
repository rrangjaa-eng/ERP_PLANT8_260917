---
phase: "02"
slug: "design-system-app-shell"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: true
wave_0_complete: false
created: "2026-09-19"
updated: "2026-09-19"
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 5.0.1 (unit + integration, projects) · Playwright 1.63.0 (e2e) · stylelint 17.15.0 (Wave 1 신규, D-20 승인) |
| **Config file** | `vitest.config.ts` · `playwright.config.ts` · `stylelint.config.mjs`(02-02 신규) |
| **Quick run command** | `pnpm test:unit` (= `vitest run --project unit`) |
| **Full suite command** | `pnpm test` (unit → integration → e2e) |
| **E2E 사전 조건** | `bash scripts/dev-db.sh && pnpm db:migrate` — Phase 01이 실제로 쓴 명령 그대로 |
| **Estimated runtime** | unit 수 초 · e2e 수 분(웹 서버 빌드 포함). CI `quality` 잡이 `pnpm lint`·`pnpm typecheck`·`pnpm lint:sql`·`pnpm test:unit`을 먼저 돌고, 그다음 `integration-e2e` 잡 |

**측정된 스크립트 정본:** `pnpm lint` = `eslint .`(02-02 이후 `eslint . && stylelint …`) · `pnpm typecheck` = `tsc --noEmit` · `pnpm test:unit` = `vitest run --project unit` · `pnpm test:e2e` = `playwright test` · `pnpm build` = `next build` · `pnpm db:dev` = `bash scripts/dev-db.sh`.

---

## Sampling Rate

- **After every task commit:** `pnpm test:unit` (DB 불필요, 수 초)
- **After every UI task commit:** `pnpm lint && pnpm typecheck && pnpm build`
- **After every plan wave:** `pnpm test` 전체 3계층
- **Before `/gsd-verify-work`:** 전체 그린 + `pnpm lint`(stylelint 포함) 그린
- **Max feedback latency:** 60초 (단위 계층 기준)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | UX-01 | T-02-01 | 사람이 고르지 않은 제품 동작이 시스템 문서가 되지 않는다 | manual (checkpoint:decision, blocking-human) | — (체크포인트) | — | ⬜ pending |
| 02-01-02 | 01 | 1 | UX-01 | T-02-01 | N/A | static | `node -e` SYSTEM.md 신설 머리글 검사 · `pnpm typecheck` | ❌ W1 | ⬜ pending |
| 02-01-03 | 01 | 1 | UX-01 | T-02-02 / T-02-03 | 의도적 이탈이 기록 없이 남지 않는다 | unit | `pnpm vitest run --project unit test/unit/design-system-docs.test.ts test/unit/docs-limits.test.ts` | ❌ W1 | ⬜ pending |
| 02-02-01 | 02 | 1 | UX-01 | T-02-04 | `ui/`가 `domain`/`repositories`/`db`를 import하면 lint가 막는다 | static (프로브 실행) | `pnpm lint` + 경계 프로브(`EXIT_OK=0`·`EXIT_BAD=1`) | ✅ 기존 | ⬜ pending |
| 02-02-02 | 02 | 1 | UX-01 | T-02-SC | 승인된 의존성 하나만 설치된다 | unit | `pnpm vitest run --project unit test/unit/stylelint-config.test.ts` + stylelint 프로브 | ❌ W1 | ⬜ pending |
| 02-02-03 | 02 | 1 | UX-01 | T-02-05 / T-02-06 | 빌드 컨텍스트에서 `.planning`은 계속 제외된다 | unit | `pnpm vitest run --project unit test/unit/ci-guard.test.ts test/unit/deploy/workflows.test.ts test/unit/dockerfile.test.ts` | ✅ 기존(보강) | ⬜ pending |
| 02-03-01 | 03 | 2 | UX-01 | T-02-07 / T-02-09 / T-02-10 | 실패 문구가 계정 존재를 구분하지 않고, 세션 연장 장치가 유지된다 | e2e (tracer) | `bash scripts/dev-db.sh && pnpm db:migrate && pnpm playwright test test/e2e/login-logout.spec.ts` + `pnpm build` | ✅ 기존 | ⬜ pending |
| 02-03-02 | 03 | 2 | UX-01 | T-02-08 | 서버 검증이 클라이언트로 옮겨가지 않는다 | e2e | `bash scripts/dev-db.sh && pnpm db:migrate && pnpm playwright test test/e2e/login-logout.spec.ts` | ✅ 기존 | ⬜ pending |
| 02-03-03 | 03 | 2 | UX-01 | T-02-07 | 동일 | e2e | `… pnpm playwright test test/e2e/login-logout.spec.ts test/e2e/change-password.spec.ts` | ✅ 기존 | ⬜ pending |
| 02-04-01 | 04 | 3 | UX-01 | T-02-12 | 역할에 없는 진입점이 셸에 노출되지 않는다 | unit | `pnpm vitest run --project unit test/unit/ui/role-menu.test.ts` | ❌ W3 (TDD, 같은 태스크가 생성) | ⬜ pending |
| 02-04-02 | 04 | 3 | UX-01 | — | N/A | static | `pnpm lint && pnpm typecheck && pnpm build` + `node -e` MoreSheet 계약 검사 | ✅ 기존 | ⬜ pending |
| 02-04-03 | 04 | 3 | UX-01 | T-02-11 / T-02-13 | 라우트 이동 뒤에도 직원이 관리자 화면에서 404를 받는다 | e2e | `… pnpm playwright test test/e2e/login-logout.spec.ts test/e2e/change-password.spec.ts test/e2e/system-status.spec.ts` | ✅ 기존 | ⬜ pending |
| 02-05-01 | 05 | 4 | UX-01 | — | N/A | unit | `pnpm vitest run --project unit test/unit/ui/next-turn.test.ts` | ❌ W4 (TDD, 같은 태스크가 생성) | ⬜ pending |
| 02-05-02 | 05 | 4 | UX-01 | — | N/A | static | `pnpm lint && pnpm typecheck && pnpm build` | ✅ 기존 | ⬜ pending |
| 02-05-03 | 05 | 4 | UX-01 | T-02-14 / T-02-16 | 새 라우트 여섯이 전부 세션 게이트 뒤에 있고 가짜 데이터가 없다 | e2e | `… pnpm playwright test test/e2e/login-logout.spec.ts test/e2e/change-password.spec.ts test/e2e/system-status.spec.ts` + 라우트 대조 `node -e` | ✅ 기존 | ⬜ pending |
| 02-06-01 | 06 | 5 | UX-01 | — | N/A | static | `pnpm lint && pnpm typecheck && pnpm build` + `pnpm vitest run --project unit test/unit/design-system-docs.test.ts` | ✅ 기존 | ⬜ pending |
| 02-06-02 | 06 | 5 | UX-01 | T-02-19 | 서버 검증 메시지 문자열이 불변이다 | e2e | `… pnpm playwright test test/e2e/change-password.spec.ts test/e2e/login-logout.spec.ts` | ✅ 기존(무수정 통과) | ⬜ pending |
| 02-06-03 | 06 | 5 | UX-01 | T-02-17 / T-02-18 / T-02-20 | 접근 제어 세 요소 보존, 오류 화면이 내부 정보를 노출하지 않는다 | e2e | `… pnpm playwright test test/e2e/system-status.spec.ts` + 게이트 존재 `node -e` | ✅ 기존(무수정 통과) | ⬜ pending |
| 02-07-01 | 07 | 6 | UX-01 | T-02-SC2 | 미승인 의존성이 설치되지 않는다 | manual (checkpoint:decision, blocking-human) | — (체크포인트) | — | ⬜ pending |
| 02-07-02 | 07 | 6 | UX-01 | T-02-22 | N/A | e2e | `bash scripts/dev-db.sh && pnpm db:migrate && pnpm playwright test` + `pnpm exec playwright test --list` | ❌ W6 (같은 태스크가 생성) | ⬜ pending |
| 02-07-03 | 07 | 6 | UX-01 | T-02-21 | 검사 대상 축소·규칙 비활성으로 통과를 만들지 않는다 | e2e + manual | `bash scripts/dev-db.sh && pnpm db:migrate && pnpm playwright test` + 키보드 스펙 마우스 호출 0 검사 | ❌ W6 (같은 태스크가 생성) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**샘플링 연속성:** 자동 검증이 없는 태스크는 체크포인트 둘(02-01-01 · 02-07-01)뿐이고 서로 떨어져 있다 — 자동 검증 없는 태스크가 3개 연속되는 구간이 없다.

---

## Wave 0 Requirements

이 페이즈의 「Wave 0」은 **wave 1의 두 플랜(02-01 · 02-02)** 이다. 문서와 도구만 다루고 `ui/**` 파일이나 화면 코드를 하나도 만들지 않으며, 이후 모든 컴포넌트 작업의 선행 조건이다.

- [ ] `eslint.config.mjs`에 `ui` boundaries 타입 등록 (+ `app`·`test` allow 목록, `{ from: "ui", allow: ["ui","lib"] }`) — **모든 `ui/` 작업의 선행 조건.** 등록 전에는 `ui/`의 금지 import가 아무 오류도 내지 않는다(리서치 실측)
- [ ] `.dockerignore`에서 `docs` 제외 해제 — D-21 프로덕션 빌드 선행 조건
- [ ] 두 워크플로(`ci.yml`·`deploy.yml`)의 트리거 경로 필터를 **`paths-ignore` → `paths` + `!` 네 줄로 교체**(02-02 Task 3). 순서가 곧 의미다: 「전체 포함 → `!.planning/**` → `!docs/**` → `docs/design/tokens.css`」 — tokens.css 줄이 `docs/**` 부정 줄보다 **뒤**여야 하고, 첫 패턴이 빠지면 필터가 뒤집혀 CI가 거의 모든 PR에서 사라진다. `test/unit/ci-guard.test.ts`·`test/unit/deploy/workflows.test.ts`가 `paths-ignore` 부재·네 패턴 존재·네 패턴의 순서 셋을 단언하도록 함께 고쳐진다
- [ ] `stylelint@17.15.0` 설치 + `stylelint.config.mjs` + `package.json` `lint` 통합
- [ ] `test/unit/stylelint-config.test.ts` — 규칙 자체의 테스트(D-20 요구)
- [ ] `test/unit/design-system-docs.test.ts` — 디자인 문서 계약 회귀 + **두 워크플로의 `docs/**` 무시 때문에 docs 전용 커밋이 CI를 타지 않는 문제의 완화책**(이 파일이 커밋 묶음을 docs 전용이 아니게 만든다)
- [ ] `docs/design/SYSTEM.md` 신설 절 5개 — §6-7 · §6-8 · §6-9 · §7-11 · §7-12. 이후 플랜의 화면·컴포넌트 태스크가 이 절들을 유일한 설계 출처로 읽는다
- [ ] `docs/design/SYSTEM.md` §6-0 보강 (a)~(e) — 특히 **(a) PC 상단 바 사용자 진입점의 형태**(02-01 체크포인트 항목 G의 답). 02-04 Task 1이 그 형태대로 만들고 02-07 Task 3의 키보드 동선이 그 형태대로 단언한다. 이 문장이 없으면 두 태스크가 형태를 고를 수 없다
- [ ] `docs/design/SYSTEM.md` §7-1 — 1차 버튼 위 `kbd` 테두리 처리(항목 I의 답). 02-03 Task 1이 참조할 유일한 출처이고, 답이 ②면 `docs/design/tokens.css`에 토큰 하나가 함께 생긴다

**후속 웨이브에서 생성되는 테스트 파일**(각각 자기 태스크 안에서 만들어지고 그 태스크의 `<verify>`가 바로 돌린다):
`test/unit/ui/role-menu.test.ts`(02-04-01 — `tdd="true"`, 실패 테스트 먼저) · `test/unit/ui/next-turn.test.ts`(02-05-01 — `tdd="true"`, 실패 테스트 먼저) · `test/e2e/mobile-shell.spec.ts`(02-07-02) · `test/e2e/keyboard-nav.spec.ts`·`test/e2e/a11y.spec.ts`(02-07-03). 앞의 둘만 TDD 태스크이고 뒤의 셋은 이미 만들어진 화면을 검사하는 스펙이다.

**`ui/input/TextField.tsx`(02-03-02)는 자기 태스크에 테스트 파일을 두지 않는다 — 의도된 것이고 그 대가가 여기 적혀 있다.** 리포의 단위 계층이 `environment: node` + `include: test/unit/**/*.test.ts`라 컴포넌트를 렌더할 수단이 없고(새 devDependency가 필요한데 이 페이즈가 승인한 것은 stylelint 하나뿐이다), 로그인 화면은 필드 단위 오류를 만들지 않는다(실패는 폼 상단 alert). 그래서 그 태스크는 `tdd` 표시를 달지 않고, 계약 여섯의 검사 위치는 이렇다 — 라벨↔id는 02-03-02가 돌리는 `login-logout.spec.ts`, 오류 줄 렌더는 02-06-02의 `change-password.spec.ts`(새 비밀번호 8자 미만 케이스), `aria-invalid`·`aria-describedby`는 02-07-03의 `a11y.spec.ts`(필드 오류가 떠 있는 상태의 케이스). **입력값 보존 · 오류 없을 때 오류 줄 부재 · 자리표시자 규칙 셋은 실행 검사가 없다** — 정적 검사와 계약 문장뿐이고 02-03 SUMMARY가 그 사실을 그대로 적는다.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Pretendard가 Windows Chrome/Edge에서 실제로 적용되고 숫자 자릿수가 정렬되며 첫 로드 서체 전송량이 200–300KB 안이다 (D-32) | UX-01 | 리눅스 컨테이너에 Windows 폰트 스택(맑은 고딕)이 없어 폴백 대비 비교가 불가능하다 | Windows Chrome 또는 Edge로 배포된 앱을 열고 ① 개발자 도구에서 렌더된 서체가 폴백이 아니라 Pretendard인지, 여러 줄 숫자의 자릿수가 세로로 정렬되는지 ② 네트워크 탭에서 woff2 요청 합계가 200–300KB 안인지. 어긋나면 서브셋 unicode-range 분할이 의도대로 동작하지 않는 것 → 02-03으로 되돌아간다 |
| `docs/design/tokens.css`만 바뀐 PR이 CI를 트리거하고, **그것과 무관한 소스 파일만 바뀐 PR도 여전히 트리거한다** | UX-01 | GitHub Actions의 경로 필터 판정은 GitHub 서버만 한다. 플랜은 이미 `paths` + `!` 형태(문서가 부정 패턴을 지원한다고 명시하는 유일한 쪽)를 쓰므로 남은 것은 로컬에서 재현 불가능한 실제 트리거 동작뿐이다 | 02-02 Task 3의 `human-check` 두 항목. **①** tokens.css만 바뀐 PR에서 Actions 탭의 `ci`가 실행되는지. **②** `.github/` 아래 파일이나 리포 루트의 점 파일처럼 문서·계획 밖 파일만 바뀐 PR에서 `ci`가 **여전히** 실행되는지 — `paths` 형태는 기본값이 「미실행」이라 첫 패턴이 모든 경로를 덮지 못하면 CI가 조용히 사라진다. **②가 이 변경의 진짜 위험 지점이다.** ②가 실패하면 즉시 `paths-ignore` 형태로 되돌리고 tokens.css 예외는 포기한다 — 예외 하나보다 CI가 도는 것이 우선이다. 이 둘이 통과하기 전까지 02-02 SUMMARY는 이 변경을 「미검증」으로 적는다 |
| SYSTEM.md 일관성과 실제 브라우저 QA | UX-01 | CLAUDE.md 프론트엔드 규칙: 「UI 완료 판정은 `/design-review`(SYSTEM.md 일관성) → `/qa` 통과 후」 | `/design-review` → `/qa`. §11 「시스템 일치」 목록(새 색·서체·radius·그림자 0개 · 카드 0개 · 포인트 색 사용처 5군데 안 · 안내 문구 0개 · 이유 없는 비활성 버튼 0개)을 그 리뷰에서 확인 |
| 신설 SYSTEM.md 절 5개의 제품 동작 선택 **과 플랜들이 전제하지만 결정이 없는 4건** | UX-01 | 백지 설계 — 실물 HTML도 기존 결정 기록도 없다. 에이전트가 고르면 결정한 적 없는 것이 시스템 규칙이 된다 | 02-01 Task 1의 `checkpoint:decision` — **A~I 아홉 묶음 24개 항목**. A~E는 신설 절 5개(§6-7 · §6-8 · §6-9 · §7-11 · §7-12)의 제품 동작이고, F~I는 코드 플랜이 이미 전제하는 것들이다(F 로그인 복귀 안내 · G PC 사용자 진입점 형태 · H 「설정」 항목의 목적지 · I 1차 버튼 위 `kbd` 테두리). G·H·I의 답은 각각 02-04 T1·02-07 T3 / 02-05 T3 / 02-03 T1이 소비한다. `gate="blocking-human"`이라 자동 모드에서도 멈춘다 |
| `@axe-core/playwright` 도입 여부 | UX-01 | CLAUDE.md: 「새 의존성은 이유 한 줄 + 승인」. 리서치가 새로 제안한 것이라 아직 미승인이다 | 02-07 Task 1의 `checkpoint:decision`. 거절·보류 시 수동 assertion 경로로 진행 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — 체크포인트 둘을 제외한 19개 태스크 전부 `<automated>` + `<fails_when>` 쌍을 가진다
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references — 신규 테스트 파일은 각자 생성 태스크 안에서 구현보다 먼저 만들어진다
- [x] No watch-mode flags — 모든 명령이 `run`/1회 실행 형태다
- [x] Feedback latency < 60s (단위 계층)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planner-filled 2026-09-19 — 실행 중 `/gsd-execute-phase`가 Status 열을 갱신한다
