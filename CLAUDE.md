# CLAUDE.md

1. Think Before Coding
Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

State your assumptions explicitly. If uncertain, ask.
If multiple interpretations exist, present them - don't pick silently.
If a simpler approach exists, say so. Push back when warranted.
If something is unclear, stop. Name what's confusing. Ask.

2. Simplicity First
Minimum code that solves the problem. Nothing speculative.

No features beyond what was asked.
No abstractions for single-use code.
No "flexibility" or "configurability" that wasn't requested.
No error handling for impossible scenarios.
If you write 200 lines and it could be 50, rewrite it.
Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

3. Surgical Changes
Touch only what you must. Clean up only your own mess.

When editing existing code:

Don't "improve" adjacent code, comments, or formatting.
Don't refactor things that aren't broken.
Match existing style, even if you'd do it differently.
If you notice unrelated dead code, mention it - don't delete it.
When your changes create orphans:

Remove imports/variables/functions that YOUR changes made unused.
Don't remove pre-existing dead code unless asked.
The test: Every changed line should trace directly to the user's request.

4. Goal-Driven Execution
Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

"Add validation" → "Write tests for invalid inputs, then make them pass"
"Fix the bug" → "Write a test that reproduces it, then make it pass"
"Refactor X" → "Ensure tests pass before and after"
For multi-step tasks, state a brief plan:

1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

> 프롬프트 캐시 프리픽스에 들어가는 파일. 바뀌면 캐시가 깨진다.
> 여기엔 "몇 달 뒤에도 그대로인 것"만. 진행 상황·날짜·TODO는 GSD `.planning/`에.

## 프로젝트
- 이름 / 한 줄 설명: PLANT8 ERP — BTL 광고대행사의 프로젝트·지출결의·법인카드·손익 관리 시스템(PHP 인트라넷 대체, 10→30명)
- 스택: Next.js 16(App Router, RSC + Server Actions via next-safe-action) + TypeScript 6 strict · domain/·repositories/ 4계층 + Drizzle ORM · PostgreSQL(Cloud SQL, 서울) · Cloud Run(서울, 회사 GCP) + Cloud Scheduler + GCS + Secret Manager
- 패키지 매니저: pnpm (다른 것 금지)
- 명령: dev `pnpm dev` · test `pnpm test`(단위→통합→E2E) · lint `pnpm lint`(+ `pnpm typecheck` · `pnpm lint:sql`) · build `pnpm build` — 통합·E2E는 로컬 DB가 필요하다(`pnpm db:dev`)
- 구조: `docs/ARCHITECTURE.md` · 디자인: `docs/DESIGN.md` — 둘 다 필요할 때 Read (import 금지)

## 워크플로: Pre-build(gstack) → Build(GSD+Superpowers) → Post-build(gstack)

**[Pre-build] gstack — 무엇을 왜 만들지 확정**
1. `/office-hours` 아이디어가 모호할 때 제품 관점 정리
2. `/gsd-new-project` 또는 `/gsd-plan-phase`로 GSD 계획 초안 생성
3. `/plan-ceo-review` → `/plan-eng-review` 계획 게이트
4. UI 포함 시 `docs/DESIGN.md` 읽기 — `docs/design/SYSTEM.md` 없으면 §1→§2→§3(브리프→발산→수렴)으로 먼저 만들고 `/plan-design-review`. 있으면 §4만 적용
- 게이트를 통과한 계획만 Build로 넘긴다. 리뷰 결과는 GSD 계획 파일에 반영한다.

**[Build] GSD가 뼈대, Superpowers가 규율**
- `/gsd-execute-phase`로 실행. 상태의 단일 출처는 `.planning/`
- 실행 중 Superpowers 스킬은 **호출**한다(켜졌다고 가정만 하지 않는다): 버그·테스트 실패·CI 실패를 쫓기 전에 `systematic-debugging`, "완료"를 말하기 전에 `verification-before-completion`, 구현 전에 `test-driven-development`. 서브에이전트에 위임할 때도 프롬프트에 그 스킬을 명시한다
- 페이즈 밖 소규모 작업: `/gsd-quick` 또는 `/superpowers:brainstorm → write-plan → execute-plan` 중 하나만
- 페이즈 종료: `/gsd-verify-work` → `/gsd-complete-milestone`

**[Post-build] gstack — 검증하고 내보내기**
1. `/review` 코드 리뷰 (통과 없이 ship 금지)
2. `/qa` 실제 브라우저 QA (읽기 전용 `/qa-only`) · UI 변경은 `/design-review`
3. `/cso` 보안 감사 (인증·결제·외부 입력 다룰 때 필수)
4. `/ship` PR 생성·머지 → `/retro` 회고
- 회고에서 나온 규칙은 이 파일이 아니라 `.planning/` 또는 `/learn`에 남긴다
- **Post-build 넷은 건너뛰지 않는다.** 페이즈 실행이 끝나면 즉석 검증으로 대체하지 말고 `/review` → `/qa` → (해당 시)`/cso` → `/ship`을 실제로 호출한다. 페이즈가 인증·권한·암호화·외부 입력을 건드렸으면 `/cso`는 선택이 아니다

공통
- **이 파일의 절차를 건너뛰지 않는다.** 건너뛰는 것이 맞다고 판단되면 **먼저 말하고 승인을 받는다** — 조용히 생략하거나 즉석 방법으로 대체하지 않는다. "지금은 이게 빠르다"는 건너뛸 이유가 되지 않는다(Phase 3에서 Post-build 넷을 전부 건너뛰고 즉석 프롬프트로 대체했고, 나중에 `/review`가 14건을 찾았다)
- 사소한 변경(오타·색·한 줄)은 절차 없이 바로. 절차는 작업 크기가 정한다 — 단 이 예외는 **한 파일 안에서 끝나는 변경**에만 쓴다
- 웹 브라우징은 `/browse`만. `mcp__claude-in-chrome__*` 사용 금지

## 캐시·컨텍스트 규칙
- 이 파일과 @import 대상은 세션 중 수정 금지. 수정은 세션 끝에 몰아서
- 자주 바뀌는 파일(`.planning/*`, 로그) @import 금지 — 필요 시 Read
- 조사·탐색·긴 로그는 서브에이전트에 위임, 결론만 받는다
- **모델 선택**: 점검·계획·기획·판단·검토는 Opus 5로 한다. Fable 5는 정말 필요한 순간에만 쓴다 — 아키텍처·보안처럼 되돌리기 어려운 결정, Opus 5가 두 번 이상 틀리거나 판단이 갈리는 문제, 사용자가 명시로 요청한 때. 나머지(조사·탐색·코드 실행·정리·이관·문서 생성 등)는 작업에 알맞은 지능을 골라, 오류가 나지 않는 조건으로 필요한 지능만큼만 쓴다(Sonnet → Haiku 순으로 낮춰 본다). 서브에이전트를 띄울 때는 `model`을 반드시 명시하고, GSD `model_profile`은 `adaptive`로 둔다
- 파일은 Grep으로 위치 찾고 필요한 범위만 Read. 500줄 이상은 range 필수
- 테스트·빌드 출력은 요약만. 실패 시 실패 부분만 인용
- **토큰을 아낀다.** 이미 읽은 파일·이미 받은 도구 결과를 다시 조회하지 않는다. 나머지 수단은 위 세 줄(위임·범위 Read·출력 요약)이다
- 페이즈 끝나면 `/compact` 대신 새 세션. 재개는 `/gsd-progress`
- 반복 규칙(포맷·린트·테스트)은 문장이 아니라 hooks(`.claude/settings.json`)로
- 응답은 짧게. 결과와 다음 행동만

## 코딩 규칙
- TDD: 실패 테스트 → 최소 구현 → 리팩터. 실제 실행 확인 없이 "완료" 금지
- **로컬 dev 통과는 완료 신호가 아니다.** `playwright.config.ts`가 CI에서만 프로덕션 빌드를 쓴다 — 배포·완료 판정은 `CI=true`로 확인한다
- 버그: 재현 → 원인 → 수정 → 회귀 테스트. 추측 수정 금지
- 한 커밋 한 의도. 커밋 메시지 언어: 제목은 영어 접두어(docs:/feat:/fix:/chore:) + 짧은 요약, 본문은 한국어
- 새 의존성은 이유 한 줄 + 승인 후
- 시크릿은 코드·커밋에 절대 금지. `any` 금지
- 요청받지 않은 리팩터·주석·파일 이동 금지. 기존 컨벤션 우선

## 프론트엔드
- 모든 화면의 기준은 `docs/design/SYSTEM.md`. 없으면 화면을 만들지 않고 `docs/DESIGN.md` §1부터 시작
- 새 화면·컴포넌트는 `docs/DESIGN.md` §4 절차대로. 새 색·서체·radius 생성 금지, 토큰은 `docs/design/tokens.css`에서만
- 시스템을 벗어나야 하면 `docs/design/DECISIONS.md`에 이유 기록 후 SYSTEM.md를 고친다. 화면 하나만 예외 금지
- UI 완료 판정은 `/design-review`(SYSTEM.md 일관성) → `/qa` 통과 후
- **화면 검증 순서: 싼 게이트(lint·typecheck·build) → 독립 DOM 감사 → 수정 → 전체 게이트 한 번.** 감사는 실행자가 아닌 별도 에이전트가 `CI=true`로 DOM을 실측 판정한다(스크린샷 육안 금지). 전체 게이트를 두 번 돌리지 않기 위한 순서다

## 금지
- `.planning/` 수동 편집 · `git push --force` · 프로덕션 DB 직접 명령 · 이 파일에 진행 상황 추가

## @import
기본은 비움. 추가 조건: 월 1회 이하 변경 + 100줄 이하.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
