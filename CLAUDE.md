# CLAUDE.md

## 0. 이 파일에 대해
> 프롬프트 캐시 프리픽스에 들어가는 파일. 바뀌면 캐시가 깨진다.
> 여기엔 "몇 달 뒤에도 그대로인 것"만. 진행 상황·날짜·TODO는 GSD `.planning/`에.

- 이 파일과 @import 대상은 세션 중 수정 금지. 수정은 세션 끝에 몰아서.
- 자주 바뀌는 파일(`.planning/*`, 로그)은 @import 금지 — 필요 시 Read.

## 1. 프로젝트
- 이름 / 한 줄 설명: PLANT8 ERP — BTL 광고대행사의 프로젝트·지출결의·법인카드·손익 관리 시스템(PHP 인트라넷 대체, 10→30명)
- 스택: Next.js 16(App Router, RSC + Server Actions via next-safe-action) + TypeScript 6 strict · domain/·repositories/ 4계층 + Drizzle ORM · PostgreSQL(Cloud SQL, 서울) · Cloud Run(서울, 회사 GCP) + Cloud Scheduler + GCS + Secret Manager
- 패키지 매니저: pnpm (다른 것 금지)
- 명령: dev `pnpm dev` · test `pnpm test`(단위→통합→E2E) · lint `pnpm lint`(+ `pnpm typecheck` · `pnpm lint:sql`) · build `pnpm build` — 통합·E2E는 로컬 DB가 필요하다(`pnpm db:dev`)
- 구조: `docs/ARCHITECTURE.md` · 디자인: `docs/DESIGN.md` — 둘 다 필요할 때 Read (import 금지)

## 2. 금지 한눈에 (자세한 맥락은 괄호 안 섹션)
- `.planning/` 수동 편집 · `git push --force` · 프로덕션 DB 직접 명령 · 이 파일에 진행 상황 추가
- pnpm 외 패키지 매니저 (§1) · `docs/ARCHITECTURE.md`·`docs/DESIGN.md` import (§1)
- 세션 중 이 파일·@import 대상 수정, 자주 바뀌는 파일 @import (§0)
- 승인 없이 절차 건너뛰기·즉석 방법으로 대체 (§4 공통) · `/review` 통과 없이 ship (§4)
- 웹 브라우징에 `/browse` 외 사용, `mcp__claude-in-chrome__*` 사용 (§4 공통)
- 실제 실행 확인 없이 "완료" · 추측 수정 · 승인 없는 새 의존성 (§5)
- 시크릿을 코드·커밋에 · `any` · 요청받지 않은 리팩터·주석·파일 이동 (§5)
- `docs/design/SYSTEM.md` 없이 화면 만들기 · 새 색·서체·radius 생성 · 화면 하나만 예외 · 스크린샷 육안 판정 (§6)

## 3. 작업 원칙

### 3.1 코딩 전에 생각하라
넘겨짚지 않는다. 혼란을 숨기지 않는다. 트레이드오프를 드러낸다.

구현 전에:
- 가정을 명시적으로 밝힌다. 확신이 없으면 묻는다.
- 여러 해석이 가능하면 제시한다 — 조용히 하나를 고르지 않는다.
- 더 단순한 방법이 있으면 말한다. 타당하면 반박(push back)한다.
- 무언가 불명확하면 멈춘다. 무엇이 헷갈리는지 이름 붙인다. 묻는다.

### 3.2 단순함이 먼저다
문제를 푸는 최소한의 코드. 추측성 코드는 없다.

- 요청받은 것 이상의 기능은 넣지 않는다.
- 한 번만 쓰이는 코드에 추상화를 넣지 않는다.
- 요청받지 않은 "유연성"이나 "설정 가능성"을 넣지 않는다.
- 일어날 수 없는 상황에 대한 에러 처리를 넣지 않는다.
- 200줄을 썼는데 50줄로 줄일 수 있다면 다시 쓴다.
- 스스로에게 묻는다: "시니어 엔지니어가 보면 과하다고 할까?" 그렇다면 단순화한다.

### 3.3 외과적으로 변경하라
꼭 필요한 곳만 건드린다. 자신이 만든 것만 치운다.

기존 코드를 수정할 때:
- 주변 코드·주석·포맷팅을 "개선"하지 않는다.
- 고장나지 않은 것을 리팩터하지 않는다.
- 자신의 취향과 다르더라도 기존 스타일을 따른다.
- 관련 없는 죽은 코드를 발견하면 언급만 한다 — 지우지 않는다.

변경으로 고아(orphan)가 생기면:
- 자신의 변경으로 인해 쓰이지 않게 된 import/변수/함수는 제거한다.
- 요청받지 않은 이상 기존에 있던 죽은 코드는 제거하지 않는다.
- 기준: 변경된 모든 줄은 사용자의 요청으로 바로 추적될 수 있어야 한다.

### 3.4 목표 지향 실행
성공 기준을 정의한다. 검증될 때까지 반복한다.

작업을 검증 가능한 목표로 바꾼다:
- "검증 추가" → "잘못된 입력에 대한 테스트를 작성하고, 통과시킨다"
- "버그 수정" → "버그를 재현하는 테스트를 작성하고, 통과시킨다"
- "X 리팩터" → "리팩터 전후로 테스트가 통과하는지 확인한다"

여러 단계로 이뤄진 작업이면 짧은 계획을 명시한다:
1. [단계] → 검증: [확인 항목]
2. [단계] → 검증: [확인 항목]
3. [단계] → 검증: [확인 항목]

강한 성공 기준은 독립적으로 반복(loop)할 수 있게 해준다. 약한 기준("되게만 해 줘")은 계속 되묻게 만든다.

## 4. 워크플로: Pre-build(gstack) → Build(GSD+Superpowers) → Post-build(gstack)

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

**공통**
- **이 파일의 절차를 건너뛰지 않는다.** 건너뛰는 것이 맞다고 판단되면 **먼저 말하고 승인을 받는다** — 조용히 생략하거나 즉석 방법으로 대체하지 않는다. "지금은 이게 빠르다"는 건너뛸 이유가 되지 않는다(Phase 3에서 Post-build 넷을 전부 건너뛰고 즉석 프롬프트로 대체했고, 나중에 `/review`가 14건을 찾았다)
- 사소한 변경(오타·색·한 줄)은 절차 없이 바로. 절차는 작업 크기가 정한다 — 단 이 예외는 **한 파일 안에서 끝나는 변경**에만 쓴다
- 웹 브라우징은 `/browse`만. `mcp__claude-in-chrome__*` 사용 금지

## 5. 코딩 규칙
- TDD: 실패 테스트 → 최소 구현 → 리팩터. 실제 실행 확인 없이 "완료" 금지
- **로컬 dev 통과는 완료 신호가 아니다.** `playwright.config.ts`가 CI에서만 프로덕션 빌드를 쓴다 — 배포·완료 판정은 `CI=true`로 확인한다
- 버그: 재현 → 원인 → 수정 → 회귀 테스트. 추측 수정 금지
- 한 커밋 한 의도. 커밋 메시지 언어: 제목은 영어 접두어(docs:/feat:/fix:/chore:) + 짧은 요약, 본문은 한국어
- 새 의존성은 이유 한 줄 + 승인 후
- 시크릿은 코드·커밋에 절대 금지. `any` 금지
- 요청받지 않은 리팩터·주석·파일 이동 금지. 기존 컨벤션 우선

## 6. 프론트엔드 (+ 화면 검증)
- 모든 화면의 기준은 `docs/design/SYSTEM.md`. 없으면 화면을 만들지 않고 `docs/DESIGN.md` §1부터 시작
- 새 화면·컴포넌트는 `docs/DESIGN.md` §4 절차대로. 새 색·서체·radius 생성 금지, 토큰은 `docs/design/tokens.css`에서만
- 시스템을 벗어나야 하면 `docs/design/DECISIONS.md`에 이유 기록 후 SYSTEM.md를 고친다. 화면 하나만 예외 금지
- UI 완료 판정은 `/design-review`(SYSTEM.md 일관성) → `/qa` 통과 후
- **화면 검증 순서: 싼 게이트(lint·typecheck·build) → 독립 DOM 감사 → 수정 → 전체 게이트 한 번.** 감사는 실행자가 아닌 별도 에이전트가 `CI=true`로 DOM을 실측 판정한다(스크린샷 육안 금지). 전체 게이트를 두 번 돌리지 않기 위한 순서다

## 7. 화면 사용성 원칙
- 목표: 사람이 읽고 고민하지 않아도 화면이 다음 행동으로 이끌어, ERP를 최대한 쉽게 쓰게 한다.
- 안내 문구는 최소로 한다. 설명문·도움말·자리 표시 설명 대신 알아보기 쉬운 이름, 아이콘, 배치로 뜻이 통하게 한다. 문구는 오류, 되돌릴 수 없는 작업, 잠김 같은 상태에만 한 줄로 쓰고, 무엇을 하면 되는지를 말한다. 빈 화면에는 설명 대신 첫 행동 버튼을 둔다.
- 화면에서 사용자가 할 결정은 최소로 한다. 알 수 있는 값은 기본값으로 미리 채운다(오늘 날짜, 내 팀, 최근·이전 입력값). 시스템이 계산·판단할 수 있는 것(합계, 세금, 상태 전환 조건)은 묻지 않는다. 할 수 없는 선택지는 보이지 않게 하거나 비활성화해 틀린 선택이 불가능하게 한다. "정말 하시겠어요?" 확인 창 대신 되돌리기를 주고, 확인은 되돌릴 수 없는 일에만 쓴다.
- 행동은 동작·컴포넌트·디자인으로 유도한다. 화면마다 다음에 할 일을 주 버튼 하나로 눈에 띄게 한다. 순서가 있는 일은 단계로 보여 주고, 필요한 값이 채워져야 다음 버튼이 켜진다. 입력 칸이 형식을 잡아 준다(숫자 쉼표 자동, 날짜 선택, 검색해서 고르기). 키보드만으로 엑셀처럼 입력·이동·저장할 수 있게 한다. 상태는 색·배지로 보여 주고, 위험한 동작은 떨어뜨려 둔다.
- 적용: 화면 설계(UI-SPEC)·플랜 작성·화면 설계 검토(Codex 포함)·/plan-design-review·/design-review는 "문구 없이 이해되는가, 사용자가 하지 않아도 될 결정이 남았는가"를 점검한다. 사용자가 이미 정한 결정은 바꾸지 않는다.

## 8. 캐시·컨텍스트·모델 선택
- 조사·탐색·긴 로그는 서브에이전트에 위임, 결론만 받는다
- **모델 선택**: 점검·계획·기획·판단·검토는 Opus 5로 한다. Fable 5는 정말 필요한 순간에만 쓴다 — 아키텍처·보안처럼 되돌리기 어려운 결정, Opus 5가 두 번 이상 틀리거나 판단이 갈리는 문제, 사용자가 명시로 요청한 때. 나머지(조사·탐색·코드 실행·정리·이관·문서 생성 등)는 작업에 알맞은 지능을 골라, 오류가 나지 않는 조건으로 필요한 지능만큼만 쓴다(Sonnet → Haiku 순으로 낮춰 본다). 서브에이전트를 띄울 때는 `model`을 반드시 명시하고, GSD `model_profile`은 `adaptive`로 둔다
- 파일은 Grep으로 위치 찾고 필요한 범위만 Read. 500줄 이상은 range 필수
- 테스트·빌드 출력은 요약만. 실패 시 실패 부분만 인용
- **토큰을 아낀다.** 이미 읽은 파일·이미 받은 도구 결과를 다시 조회하지 않는다. 나머지 수단은 위 세 줄(위임·범위 Read·출력 요약)이다
- 페이즈 끝나면 `/compact` 대신 새 세션. 재개는 `/gsd-progress`
- 반복 규칙(포맷·린트·테스트)은 문장이 아니라 hooks(`.claude/settings.json`)로
- 응답은 짧게. 결과와 다음 행동만

## 9. @import
기본은 비움. 추가 조건: 월 1회 이하 변경 + 100줄 이하.

## 10. Next.js 블록
> 아래 블록은 `next dev`가 자동으로 쓰고 다시 추가한다(파일 하단에 원문 영어로 유지). 지워도 `next dev`가 되살린다.

## 다른 계정 작업과 코디네이터 지시

- 이 저장소는 코디네이터(다른 Claude 계정)가 PR 댓글로 작업을 조율한다.
- 작업을 시작하거나 이어갈 때, 그리고 푸시하기 전마다 자기 PR에 달린 댓글 중 「[코디네이터 지시]」로 시작하는 최신 댓글을 GitHub에서 읽고 그대로 따른다.
- 지시를 끝내면 같은 PR에 「[완료 보고]」로 시작하는 댓글로 결과를 한 줄 남긴다.
- main에 새 머지가 생기면 main을 머지 커밋으로 반영한다(force push 금지).
- 머지는 사용자가 직접 「머지해」라고 할 때만 한다.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
