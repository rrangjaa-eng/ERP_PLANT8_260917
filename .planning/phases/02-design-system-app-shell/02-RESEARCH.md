# Phase 2: 디자인 시스템·앱 셸 - Research

**Researched:** 2026-09-19
**Domain:** Next.js 16(App Router/RSC) CSS 기계장치(전역 CSS + CSS Modules) · stylelint 리터럴 금지 · eslint-plugin-boundaries 신설 계층 · 자체 호스팅 서체 · Playwright 다중 뷰포트/접근성 검증
**Confidence:** HIGH — 핵심 주장(Q1·Q2·Q4의 CSS import·CSS Modules·boundaries 동작)은 이 저장소에서 직접 `pnpm build`/`pnpm dev`/`pnpm lint`를 실행해 확인했다. Pretendard 파일 출처(Q5)도 이 세션에서 `npm view`·`npm pack`으로 재현했다. stylelint 버전·규칙 존재(Q3)는 실제 패키지 tarball을 받아 소스를 읽었다. Docker 빌드 컨텍스트 문제(Q1 후반)는 `.dockerignore`·`Dockerfile`을 읽어 코드로 검증했지만 Docker 데몬이 이 환경에 없어 실제 `docker build` 실행은 못했다(아래 명시).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

Phase 1의 D-01~D-18은 그대로 유효하다. 아래는 02-CONTEXT.md에서 확정한 것.

- **D-19:** 컴포넌트 CSS는 **전역 CSS + CSS Modules**다. Tailwind·CSS-in-JS·vanilla-extract를 쓰지 않으며 이 항목으로 새 런타임 의존성을 추가하지 않는다. — Reversibility: costly.
- **D-20:** "새 색·서체·radius 생성 금지, 토큰은 `tokens.css`에서만"을 **stylelint 규칙 + CI**로 강제한다. Phase 1의 ESLint 커스텀 규칙 3개 + `@typescript-eslint/rule-tester` 전례를 따른다. 개발 의존성 추가는 **stylelint 하나로 한정**하고 이 문장이 그 승인이다.
- **D-21:** `tokens.css`의 단일 출처는 `docs/design/tokens.css` 하나이며 **앱이 그것을 직접 import**한다. 복사본을 만들지 않는다. Next.js 16의 CSS 처리와 ESLint boundaries가 `app/` 밖 경로 import를 허용하는지는 리서치가 확인해야 한다. 불가능하다고 판명되면 차선은 `app/`으로 복사 + **바이트 단위 동일성 테스트**(`docs-limits.test.ts`와 같은 결). 원본을 앱으로 옮기는 안은 거부.
- **D-22:** 상단 바 1차 메뉴 5개(프로젝트·지출결의·법인카드·결재·손익)를 전부 내보내고, 화면 없는 라우트는 §7-7 EMPTY를 렌더한다.
- **D-23:** 역할 → (상단 바 메뉴, 폰 하단 탭 4개) 매핑을 데이터로 한 곳에 분리한다. 셸 컴포넌트는 렌더링만. Phase 2는 관리자/직원 둘만.
- **D-24:** 「내 차례」는 컴포넌트만 만들고 입력은 빈 배열. 단위 테스트가 최대 6줄·「더 보기 N건」·태그 순서(막힘→오늘→결재→대기)·폰 두 줄 배치를 고정한다.
- **D-25:** 진짜 코드로 만드는 것: 셸(상단 바·폰 하단 탭·「더보기」 시트) · 버튼 위계(§7-1) · 입력·서버 검증 오류(§7-2) · 상태 태그(§7-5) · 토스트(§7-6) · 「내 차례」(§7-4) · 목록 화면 EMPTY(§6-1) · 다섯 상태(§7-7). 표(§7-3)·모달(PC 480)은 만들지 않는다.
- **D-26:** 디자인 시스템 컴포넌트는 최상위 `ui/`에 두고 `eslint.config`의 `boundaries/elements`에 `ui` 타입을 신설한다. `{ from: "ui", allow: ["ui", "lib"] }`. `{ from: "app", allow: [...] }`에 `"ui"`를 더한다. `app/_components/`는 거부. — Reversibility: costly.
- **D-27:** 실물 HTML과 앱 코드가 어긋나면 SYSTEM.md가 기준. 실물이 맞다고 판단되면 먼저 SYSTEM.md를 고치고 그 다음 따른다. 불일치는 DECISIONS.md에 기록.
- **D-28:** 루트 `/`는 「내 차례」 홈 화면. 건수 0이면 사라지고 목록 EMPTY가 올라온다.
- **D-29:** 관리자 시스템 상태 화면(`app/admin/system-status/`)도 SYSTEM.md 기준으로 다시 만든다. D-17(관리자만, 직원 404)·한도 배너는 유지.
- **D-30:** SYSTEM.md §6에 **로그인 화면 템플릿을 코드보다 먼저** 신설한다. 셸 없는 구조, 로그인 실패 문구 자리, 계정 잠금 안내 자리, 임시 비밀번호 배너 위치, 다섯 상태. 「내 계정」은 §6-3 폼 템플릿 재사용(새 템플릿 불필요).
- **D-31:** SYSTEM.md §7에 「알림함·배지」 계약을 신설한다(구현은 Phase 7). 읽음/안읽음, 목록 행 모양, 진입점, 건수 배지 규칙, 다섯 상태.
- **D-32(이미 잠김):** Pretendard Variable 동적 서브셋 woff2 92개(3.1MB) + css + OFL 라이선스를 리포에 커밋. 자체 호스팅 `public/fonts/pretendard/`, 외부 CDN 금지, `font-display: swap`. npm 의존성 아님 — tarball에서 파일만 복사. `app/layout.tsx` `<head>`에 `<link>` 한 줄. 전역 CSS는 `--font-sans`만. 검수(Windows Chrome/Edge 자릿수 정렬 + 200–300KB)는 **사람 체크포인트**.

### Claude's Discretion

- 성공 기준 3(폰 375px·PC·키보드만)을 무엇으로 증명하는지 — Playwright 두 뷰포트·axe·시각 회귀 중 선택은 planner 재량. §11·§10 항목이 테스트로 덮이는지는 plan-checker가 확인.
- CSS Modules 파일 배치·이름 규칙, 컴포넌트 파일 단위, 셸의 서버/클라이언트 컴포넌트 분할.
- stylelint 규칙을 기성 조합/커스텀 중 선택, 금지 리터럴의 정확한 패턴 목록.
- 역할→메뉴 매핑을 `domain/` 대 `ui/`의 순수 상수 중 어디에 둘지 — D-26 경계 규칙만 지키면 됨.
- 빈 라우트 5개의 URL 경로 이름과 각 EMPTY의 "다음 한 수" 문구.
- 「더보기」 시트의 검색 항목 동작 여부 — 자리만 두고 비활성해도 됨.

### Deferred Ideas (OUT OF SCOPE)

- 회사 도메인 연결 → Phase 3.
- 표(§7-3) 컴포넌트 구현·라이브러리 선택 → Phase 4.
- 알림함 구현(계약만 이 페이즈) → Phase 7.
- PC 480 모달 → 수요 페이즈(Phase 5 반려 확인).
- 손익 대시보드 화면 → Phase 9. 인쇄 라우트 → Phase 5·11. 외부 수령자 화면 → Phase 11.
- 「더보기」 시트 검색(`⌘K` 명령 팔레트) 실동작 → 데이터 생기는 페이즈.
- 다크 모드 — 이번 논의에서 다루지 않음.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UX-01 | `docs/design/SYSTEM.md`를 먼저 확정하고 모든 화면이 그 토큰·컴포넌트만 쓴다. 컴포넌트 계약은 LOADING/EMPTY/ERROR/SUCCESS/PARTIAL 상태를 필수로 정의하고, EMPTY·ERROR는 다음 행동을 유도한다 | SYSTEM.md §1~§11이 이미 이 계약을 정의함(성공 기준 1 충족, 재작성 불필요). 이 페이즈는 (a) §6 로그인 템플릿·§7 알림함 계약의 빈 곳 2개를 채우고(D-30·D-31) (b) 코드로 실현한다(D-19·D-21·D-25·D-26). 다섯 상태 표는 §7-7에 이미 컴포넌트별로 정의되어 있어 `ui/` 컴포넌트 props 설계가 그 표를 그대로 옮기면 됨 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- pnpm만 사용. 다른 패키지 매니저 금지.
- 새 의존성은 "이유 한 줄 + 승인" 필요. D-20이 stylelint 하나를 이미 승인했다. `@axe-core/playwright`(Q6 권장)는 **이 리서치가 새로 제안하는 것이라 아직 승인되지 않았다** — planner가 사용자 승인을 받아야 한다.
- `any` 금지, TypeScript 6 strict.
- Next.js 16은 훈련 데이터와 다른 브레이킹 체인지가 있을 수 있어 `node_modules/next/dist/docs/`를 직접 읽어야 한다 — 이 리서치는 `01-app/01-getting-started/11-css.md`·`13-fonts.md`·`03-api-reference/02-components/font.md`·`03-api-reference/05-config/01-next-config-js/useLightningcss.md`를 읽고 인용한다(아래 Sources).
- 요청받지 않은 리팩터·주석·파일 이동 금지. 기존 컨벤션 우선.
- `.planning/` 수동 편집 금지 — 이 문서만 작성.
- 커밋 메시지: 영어 접두어 + 한국어 본문.
- 사소한 변경 절차 생략, 절차는 작업 크기가 정한다.

## Summary

Phase 2는 새 프레임워크를 들이는 페이즈가 아니라 **이미 확정된 SYSTEM.md/tokens.css를 Next.js 16 App Router 위에 그대로 얹는 배선 작업**이다. 핵심 리스크는 프레임워크 지식(CSS Modules가 되는지)이 아니라 **저장소 특유의 배선 지점 셋** — (1) `docs/` 밖 파일을 `app/`이 직접 import할 때 로컬 빌드는 되지만 **Docker 프로덕션 빌드 컨텍스트가 `docs/`를 통째로 제외**하고 있다는 것, (2) eslint-plugin-boundaries가 `ui` 타입을 아직 모르는 상태에서 컴포넌트를 먼저 만들면 아무 경계도 강제되지 않는다는 것, (3) SYSTEM.md의 실물 HTML 자체가 `#fff` 리터럴을 상시적으로 쓰고 있어 순진한 "리터럴 전면 금지" stylelint 규칙은 시스템 실물부터 위반시킨다는 것 — 이다. 이 셋 모두 이 세션에서 실제로 `pnpm build`/`pnpm dev`/`pnpm lint`를 실행하거나 파일을 읽어 확인했다.

**Primary recommendation:** D-21의 직접 import는 그대로 간다(`app/layout.tsx`에서 `import "../docs/design/tokens.css"`) — 로컬 빌드는 이미 동작을 확인했다. 다만 `.dockerignore`의 `docs` 제외 라인을 걷어내야 프로덕션 Docker 빌드가 깨지지 않는다(정확한 수정은 Code Examples 참고). CSS Modules는 `ui/<Component>/<Component>.module.css`로 컴포넌트 옆에 두면 되고 이것도 이 세션에서 빌드 확인했다. stylelint는 `declaration-property-value-allowed-list`(단일 스칼라 속성용)와 `declaration-property-value-disallowed-list`(box-shadow 등 복합 속성의 리터럴 색만 잡는 용)를 병용하고, `#fff` 리터럴은 금지하는 대신 **`var(--bg)`로 치환**(같은 값, 새 토큰 불필요)하도록 포팅 규칙에 못박는다. D-26의 `ui` 타입 추가는 `eslint.config.mjs`의 `boundaries/elements`뿐 아니라 **`test` 정책의 allow 목록에도 `"ui"`를 더해야 한다** — D-24가 요구하는 「내 차례」 단위 테스트가 `ui/` 파일을 import하기 때문이다.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 디자인 토큰(색·타입·간격·형태) | 정적 자산(`docs/design/tokens.css`, 빌드 시 인라인) | — | 서버·클라이언트 구분 없는 순수 CSS. 앱 코드가 아니라 디자인 문서가 출처(D-21) |
| 앱 셸(상단 바·하단 탭·더보기 시트) | Frontend Server(RSC, `app/layout.tsx`) | Browser(시트 열림/닫힘 상호작용은 클라이언트 컴포넌트) | 정적 구조는 서버 렌더, 상호작용(포커스 트랩·Esc)만 `"use client"` |
| 역할→메뉴 매핑(D-23) | Frontend Server(RSC가 세션에서 role을 읽어 매핑 결과를 셸에 props로 전달) | — | 매핑 자체는 순수 데이터(상수)이므로 계층 무관하지만, "세션에서 role을 읽는" 행위는 서버 전용(`lib/viewer.ts`) |
| 「내 차례」 데이터 조립 | API/Backend(향후 domain 함수가 채움, Phase 2는 빈 배열) | — | Phase 2는 컴포넌트만, 실제 데이터는 Phase 9(UX-02) |
| 로그인·비밀번호 변경 폼 검증 | API/Backend(`authedActionClient` + zod, 이미 존재) | Browser(클라이언트 폼 상태) | 로직은 변경 없음(D-25 범위는 "표현만 갈아끼운다") — 서버 검증 오류 표시는 §7-2 컴포넌트로 이관 |
| 서체 로딩(Pretendard) | CDN/Static(`public/fonts/`, Cloud Run이 정적 자산으로 서빙) | Frontend Server(`<link>` 태그 삽입) | 자체 호스팅이라 별도 CDN 없음 — Cloud Run 자체가 정적 자산 서버 |
| stylelint/eslint 경계 강제 | 빌드 타임 도구(CI `quality` job) | — | 런타임 계층이 아니라 정적 분석. `ui`가 `domain/repositories/db`를 구조적으로 import 못 하게 막는 것 자체가 정보 노출 방지의 1차 방어선(Phase 3 이전에 이미 확보) |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.3.5(이미 설치됨, 변경 없음) | App Router RSC + 전역 CSS + CSS Modules | 이미 프로젝트 표준(Phase 1). 이 페이즈는 CSS 기능만 추가로 쓴다 |
| stylelint | **17.15.0** `[VERIFIED: npm registry, npm view stylelint version 실행 결과]` | 리터럴 금지 규칙 강제(D-20) | D-20이 이미 승인한 유일한 신규 devDependency. `stylelint.config.{mjs,js,cjs,ts}` ESM 지원 확인(`node_modules` 대신 tarball의 `lib/cli.mjs` 도움말 텍스트로 확인, 아래 Sources) |

`stylelint`는 `[ASSUMED]`가 아니라 `[VERIFIED: npm registry]`로 표기한다 — 이 세션에서 실제로 `npm view stylelint version`을 실행했고(등록 결과 17.15.0), 동시에 `npm pack stylelint@17.15.0`으로 tarball을 받아 `lib/rules/` 디렉터리를 직접 열어 `declaration-property-value-allowed-list`·`declaration-property-value-disallowed-list` 규칙 소스 코드(`index.mjs`)를 읽었다 — 패키지명 발견 경로가 CONTEXT.md에 이미 존재하는 결정(D-20)이므로 슬롭스쿼팅 우려가 없는 잘 알려진 공식 패키지다.

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@axe-core/playwright` | 4.13.0 `[ASSUMED — 아직 미승인]` | Playwright E2E에서 자동 접근성 검사(WCAG 규칙 세트) | Q6 권장. peer dep은 `playwright-core >= 1.0.0`뿐(이미 만족). **새 devDependency이므로 사용자 승인 필요** — CLAUDE.md "새 의존성은 이유 한 줄 + 승인" |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| stylelint 내장 `declaration-property-value-*-list` | `stylelint-config-standard` + 커스텀 플러그인 | D-20이 devDependency를 stylelint 하나로 명시적으로 한정했다 — config-standard나 플러그인 패키지를 추가하면 D-20 위반. 내장 규칙만으로 충분히 표현 가능(Code Examples 참고) |
| `@axe-core/playwright` | Playwright의 `page.accessibility.snapshot()`(내장, 의존성 0) | snapshot()은 브라우저 접근성 트리를 원시 출력할 뿐 WCAG 규칙 판정을 하지 않는다 — SYSTEM.md §10 계약(`aria-live`·`aria-invalid`·랜드마크 등)을 자동 판정하려면 axe-core의 규칙 엔진이 필요. 의존성을 늘리기 싫다면 수동 assertion(`getByRole`, `aria-*` 속성 존재 확인)만으로 §10을 부분 커버 가능 — 이 경우 devDependency 승인 절차 자체를 생략할 수 있다(Claude's Discretion 영역) |
| Playwright 시각 회귀(`toHaveScreenshot`) | `docs/design/system/shots/`와 픽셀 비교 | shots는 Pretendard 웹폰트 없이 시스템 산세리프로 렌더됐다(`system/README.md`: "Pretendard 웹폰트는 이 실물에 포함하지 않아 시스템 산세리프로 렌더된다") — 앱은 Pretendard를 로드하므로 기존 shots와의 픽셀 비교는 폰트 차이만으로 항상 실패한다. 새 베이스라인을 CI와 동일 OS/브라우저에서 생성해야 함(아래 Q6 상세) |

**Installation:**
```bash
pnpm add -D stylelint@17.15.0
# axe는 사용자 승인 후:
pnpm add -D @axe-core/playwright@4.13.0
```

**Version verification:** 위 두 버전은 이 세션에서 `npm view <pkg> version`으로 직접 확인했다(`stylelint` → `17.15.0`, `@axe-core/playwright` → `4.13.0`). `eslint-plugin-boundaries`는 이미 설치된 `7.2.0`이 최신(`npm view eslint-plugin-boundaries versions --json`으로 확인, latest가 `7.2.0`) — 업그레이드 불필요.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `stylelint` | npm | 매우 오래됨(stylelint는 2015년부터 존재하는 CSS 생태계 표준 린터) | 매우 높음(주간 수천만) | `github.com/stylelint/stylelint` | OK | Approved — D-20이 이미 승인한 유일한 신규 의존성 |
| `@axe-core/playwright` | npm | Deque Systems(axe-core 원저작사)가 공식 유지하는 Playwright 바인딩, 다년 이력 | 높음 | `github.com/dequelabs/axe-core-npm` | OK | 제안됨 — **사용자 승인 필요**, 승인 전까지 `checkpoint:human-verify` |

`gsd_run query package-legitimacy check`(seam)는 이 실행 환경에 네트워크 형태의 registry 조회 seam이 연결되어 있지 않아 직접 실행하지 못했다 — 대신 `npm view <pkg> version/license/repository.url`을 이 세션에서 실행해 존재·라이선스·저장소를 확인했다(위 Standard Stack 절 인용). 두 패키지 모두 잘 알려진 생태계 표준 도구라 슬롭스쿼팅 위험은 낮으나, `@axe-core/playwright`는 이 리서치가 **새로 제안**한 것이므로 패키지명 자체는 `[ASSUMED]`로 남겨 두고 planner가 사용자 승인 체크포인트를 넣어야 한다.

**Packages removed due to [SLOP] verdict:** 없음
**Packages flagged as suspicious [SUS]:** 없음 — 단, `@axe-core/playwright`는 미승인 상태이므로 설치 전 `checkpoint:human-verify` 필요

## Architecture Patterns

### System Architecture Diagram

```
                        ┌────────────────────────────────────────┐
                        │  docs/design/tokens.css (단일 출처, D-21)  │
                        └───────────────┬──────────────────────────┘
                                        │ import "../docs/design/tokens.css"
                                        ▼
┌───────────────────────────────────────────────────────────────────────┐
│ app/layout.tsx (RSC, Root Layout)                                     │
│  - <head><link rel="stylesheet" href="/fonts/pretendard/..."></head>  │  ← D-32
│  - import "./globals.css"; import "../docs/design/tokens.css"         │  ← D-21
│  - getSession() → viewer{id, isAdmin}                                 │
│  - roleMenuMap(viewer.isAdmin) → {topNav[], bottomTabs[]}  (D-23)      │
│         ▼                                                             │
│  <Shell nav={...} tabs={...}>  ui/shell/Shell.tsx (RSC)                │
│    ├─ ui/shell/TopBar.tsx   (RSC, 정적 구조)                           │
│    ├─ ui/shell/BottomTabs.tsx (RSC, 폰만 CSS로 표시)                   │
│    ├─ ui/shell/MoreSheet.tsx ("use client", 포커스 트랩·Esc)           │
│    └─ {children}  ← 각 라우트의 page.tsx                               │
└───────────────────────────────────────────────────────────────────────┘
         │                     │                        │
         ▼                     ▼                        ▼
  app/login/page.tsx    app/(app)/account/page.tsx   app/admin/system-status/page.tsx
  (셸 없음, D-30 신규    (§6-3 폼 템플릿 재사용,       (D-29, 셸 안으로 들어옴,
   템플릿)               ChangePasswordForm 유지)      getSystemStatus() 로직 유지)
         │                     │                        │
         ▼                     ▼                        ▼
  ui/form/*, ui/button/*, ui/input/*, ui/status-tag/*, ui/toast/*, ui/next-turn/*
  (전부 "domain/repositories/db 直접 import 불가" — boundaries가 구조적으로 강제, D-26)
```

### Recommended Project Structure

```
ui/                                  ← 신규 최상위 계층(D-26)
├── shell/
│   ├── Shell.tsx                    ← RSC, 서버에서 nav/tabs props로 받음
│   ├── Shell.module.css
│   ├── TopBar.tsx / TopBar.module.css
│   ├── BottomTabs.tsx / BottomTabs.module.css
│   └── MoreSheet.tsx ("use client") / MoreSheet.module.css
├── button/
│   └── Button.tsx / Button.module.css      ← §7-1 위계 3종 + 진행 중 상태
├── input/
│   └── TextField.tsx / TextField.module.css ← §7-2, 서버 검증 오류 표시
├── status-tag/
│   └── StatusTag.tsx / StatusTag.module.css ← §7-5
├── toast/
│   └── Toast.tsx / Toast.module.css         ← §7-6
├── next-turn/
│   ├── build-next-turn-view.ts      ← 순수 함수(태그 정렬·6줄 절단·"더 보기 N건" 계산) — DOM 없이 단위 테스트 가능
│   ├── NextTurn.tsx / NextTurn.module.css   ← 위 함수의 결과를 그대로 렌더
│   └── build-next-turn-view.test.ts는 test/unit/에 둔다(레포 컨벤션)
├── list-empty/
│   └── ListEmpty.tsx / ListEmpty.module.css ← §6-1 목록 EMPTY
└── five-states/                     ← §7-7 다섯 상태 공통 골격(선택: 컴포넌트별로 분산해도 무방, Claude's Discretion)

app/
├── layout.tsx                       ← 토큰 import + 서체 link + Shell 삽입 + SessionRefresh 유지
├── globals.css                      ← box-sizing 유지 + body 기본 스타일(§2-1 폰트 적용)
├── page.tsx                         ← D-28: 「내 차례」 홈
├── (auth)/login/page.tsx            ← D-30 신규 템플릿, 셸 없음
├── (app)/account/page.tsx           ← §6-3 폼 템플릿 재사용
├── admin/system-status/page.tsx     ← D-29, 셸 안으로
├── projects/page.tsx 등 빈 라우트 5개 ← D-22, EMPTY만 렌더(URL 이름은 Claude's Discretion)
```

### Pattern 1: 전역 CSS 직접 import(D-21)

**What:** `docs/design/tokens.css`를 복사하지 않고 `app/layout.tsx`에서 상대 경로로 바로 import.
**When to use:** 루트 레이아웃 한 곳에서만(중복 import 방지, Next.js 권고 — 아래 인용).
**Example (이 세션에서 `pnpm build`·`pnpm dev`로 실제 확인됨):**
```tsx
// Source: 이 세션에서 app/layout.tsx에 삽입해 pnpm build(Turbopack) 성공,
// pnpm dev로 /login을 curl해 응답 HTML에 "--g-700"·"Pretendard" 토큰 값이
// 인라인된 <style> 청크로 실제 서빙됨을 grep으로 확인했다(2026-09-19).
import type { Metadata } from "next";
import "./globals.css";
import "../docs/design/tokens.css";   // D-21 — 단일 출처, 복사본 없음
import { SessionRefresh } from "./session-refresh";
```

Next.js 공식 문서(`node_modules/next/dist/docs/01-app/01-getting-started/11-css.md`, "External stylesheets" 절)는 "Stylesheets published by external packages can be imported anywhere in the app directory"라고만 말하지만, 이는 가이드의 예시 맥락일 뿐 **`app/` 밖 경로를 금지한다는 언급은 어디에도 없다** — 실제로 이 세션의 빌드 테스트가 `app/` 트리 밖의 상대 경로 import가 Turbopack에서 정상 처리됨을 증명한다.

**CSS Modules는 `ui/`에서도 동일하게 동작한다(D-26과 결합 시나리오).** 이 세션에서 `ui/_probe/Probe.module.css` + `ui/_probe/Probe.tsx`를 만들어 `app/page.tsx`에서 `@/ui/_probe/Probe`로 import했고 `pnpm build`가 성공했다. Next.js 공식 문서(`11-css.md` "CSS Modules" 절)의 표현은 "create a new file with the extension `.module.css` and import it into **any component inside the app directory**"이지만, 이는 튜토리얼의 서술 범위일 뿐 실제 번들러(Turbopack/Lightning CSS)는 파일 위치를 `app/` 하위로 제한하지 않는다 — 이미 `domain/`·`repositories/`·`lib/` 같은 비-`app` 최상위 디렉터리가 TypeScript 모듈로 정상 동작하는 것과 같은 원리(모듈 해석은 디렉터리가 아니라 import 경로 기준).

### D-21의 실제 장애물: Docker 빌드 컨텍스트(Q1 핵심 발견)

`.dockerignore`(리포 루트)를 이 세션에서 읽었다:

```
# .dockerignore (해당 라인, 이 세션에서 Read로 확인)
node_modules
.next
dist
.env
.env.*
!.env.example
.git
.planning
docs
test
playwright-report
test-results
.claude
```

`docs`가 통째로 제외되어 있다. `Dockerfile`의 `build` 스테이지는 `COPY . .` 뒤 `RUN pnpm build && pnpm build:cli`를 실행한다(`Dockerfile:18-19`, 이 세션에서 Read로 확인) — 즉 **Docker 빌드 컨텍스트 안에는 `docs/design/tokens.css`가 존재하지 않는다.** `app/layout.tsx`가 이 파일을 직접 import하면 로컬 `pnpm build`(방금 확인한 것)는 성공하지만, **CI가 만드는 프로덕션 이미지 빌드는 `Module not found` 로 실패한다** — 이 부분은 이 환경에 Docker 데몬이 없어(`docker info` 실행 결과 "failed to connect to the docker API") 실제 `docker build`로 재현하지는 못했다. 대신 `.dockerignore`·`Dockerfile`을 직접 읽어 구조적으로 확인한 코드 근거다.

**수정(planner가 Wave 0에 넣어야 함):** `.dockerignore`에서 `docs` 라인을 제거한다.
```diff
- docs
+ # docs/design/tokens.css를 app/layout.tsx가 직접 import한다(D-21) — Docker
+ # 빌드 컨텍스트에 반드시 있어야 한다. runtime 스테이지는 docs/를 COPY하지
+ # 않으므로(Dockerfile의 runtime 스테이지가 .next/standalone·static·public·
+ # dist/cli·db/migrations만 선택적으로 COPY) 최종 이미지 크기에는 영향 없다.
```
최종 런타임 이미지 크기에는 영향이 없다 — `runtime` 스테이지는 `build` 스테이지에서 `.next/standalone`·`.next/static`·`public`·`dist/cli`·`db/migrations`만 선택적으로 `COPY --from=build`하고 `docs/`는 어디에도 다시 COPY하지 않기 때문이다(멀티스테이지 빌드, `Dockerfile` 전체를 이 세션에서 Read로 확인). `docs/` 전체 크기는 9.2MB(`du -sh docs/` 실행 결과, 대부분 `docs/design/system/shots/*.png` 스크린샷) — 이는 `build` 스테이지의 빌드 컨텍스트 전송량에만 잠깐 더해질 뿐 이미지 레이어에 남지 않는다.

이것은 **Blocked Decision이 아니다** — D-21의 직접 import 자체는 실행 가능하고 로컬에서 이미 동작을 확인했다. 다만 `.dockerignore` 한 줄을 빼는 별도 작업이 반드시 같은 wave에 포함되어야 하며, 이 사실을 몰랐을 경우 "로컬은 되는데 배포만 깨진다"는 뒤늦은 실패로 나타난다.

### Pattern 2: eslint boundaries `ui` 타입 신설(D-26)

**정확한 편집(`eslint.config.mjs`, 이 세션에서 Read로 현재 상태 확인):**
```diff
     settings: {
       "boundaries/elements": [
         { type: "app", pattern: "app/**" },
         { type: "domain", pattern: "domain/**" },
         { type: "repositories", pattern: "repositories/**" },
         { type: "db", pattern: "db/**" },
         { type: "lib", pattern: "lib/**" },
         { type: "scripts", pattern: "scripts/**" },
         { type: "test", pattern: "test/**" },
         { type: "eslint", pattern: "eslint/**" },
+        { type: "ui", pattern: "ui/**" },
       ],
     },
     ...
       "boundaries/element-types": [
         "error",
         {
           default: "disallow",
           rules: [
-            { from: "app", allow: ["app", "domain", "lib"] },
+            { from: "app", allow: ["app", "domain", "lib", "ui"] },
             { from: "domain", allow: ["domain", "repositories", "lib"] },
             { from: "repositories", allow: ["repositories", "db", "domain"] },
             { from: "db", allow: ["db", "lib"] },
             { from: "lib", allow: ["lib", "domain", "repositories", "db"] },
             { from: "scripts", allow: ["scripts", "domain", "repositories", "db", "lib"] },
             {
               from: "test",
-              allow: ["test", "app", "domain", "repositories", "db", "lib", "scripts", "eslint"],
+              allow: ["test", "app", "domain", "repositories", "db", "lib", "scripts", "eslint", "ui"],
             },
             { from: "eslint", allow: ["eslint"] },
+            { from: "ui", allow: ["ui", "lib"] },
           ],
         },
       ],
```

**`test` 정책에도 `"ui"`를 반드시 더해야 하는 이유(D-24와의 교차 의존, 이 리서치의 발견):** D-24는 "「내 차례」... 단위 테스트가 최대 6줄·「더 보기 N건」·태그 순서·폰 두 줄 배치를 고정한다"고 요구한다. 이 단위 테스트 파일(`test/unit/ui/next-turn.test.ts` 같은 위치)은 `ui/next-turn/build-next-turn-view.ts`를 import해야 하므로, `boundaries/elements`에 `ui`를 추가하는 순간 `test → ui` 경로가 **기본값 `disallow`에 걸려 새로 막힌다.** CONTEXT.md의 D-26 원문(`{ from: "ui", allow: ["ui", "lib"] }`, `{ from: "app", allow: [...] }`에 `"ui"` 추가)은 `test`를 언급하지 않았지만, D-24의 요구사항을 실행하려면 이 한 줄이 반드시 필요하다 — planner는 D-26 작업 안에 이 `test` 정책 수정을 포함해야 한다.

**순서 리스크(이 세션에서 실측):** 이 세션에서 `ui/`를 아직 `boundaries/elements`에 등록하지 않은 상태로 `app/page.tsx`가 `@/ui/_probe/Probe`를 import하도록 만들고 `pnpm lint`를 실행했더니 **아무 오류도 나지 않았다**(경고만, 전부 기존 설정의 deprecated API 경고이지 이 import에 대한 경고가 아니다). 즉 **`ui` 타입을 아직 등록하지 않은 상태에서는 `ui/` 컴포넌트가 `domain/`·`repositories/`·`db/`를 몰래 import해도 boundaries가 전혀 잡지 못한다.** planner는 D-26의 eslint.config.mjs 편집을 **Wave 0(첫 번째 작업)으로** 배치해야 하며, 그 전에 `ui/` 컴포넌트를 먼저 만들면 안 된다.

**deprecated API 경고는 기존 상태다.** `eslint-plugin-boundaries@7.2.0`은 `policies`/`dependencies` 신 API를 권장하지만 이 저장소의 기존 8개 element-type 설정은 이미 구 API(`rules`/`element-types`, string selector)를 쓰고 있고 이는 **Phase 1부터 존재하던 것**이다(Phase 2 범위 아님, 수정 요청 시에만 별도 작업). `ui` 타입 추가는 기존 구 API 스타일을 그대로 따라야 한다(혼용 금지, 기존 컨벤션 우선 — CLAUDE.md).

### Pattern 3: CSS Modules + 전역 토큰 조합 규칙(Q2)

- **순서 결정성:** Next.js 문서(`11-css.md` "Ordering and Merging")는 CSS 순서가 **코드의 import 순서**를 따른다고 명시하고, "Import global styles ... in the root of your application"·"Extract shared styles into shared components to avoid duplicate imports"를 권장한다. `tokens.css`는 `:root` 커스텀 속성만 정의하므로 `var()` 해석은 계산값 단계에서 일어나 **선언 순서와 무관** — component module이 `tokens.css`보다 먼저 파싱돼도 `var(--g-700)`은 정상 해석된다(CSS 커스텀 속성의 표준 동작). 그래도 Next 권고대로 `tokens.css`는 `app/layout.tsx` 한 곳에서만 import한다(중복 import 방지).
- **`@media print`·`position: sticky`·`:has()`:** 전부 표준 CSS 기능이라 CSS Modules 여부와 무관하게 그대로 동작한다. Turbopack은 CSS 처리에 Lightning CSS(Rust)를 기본 사용한다(`useLightningcss.md`: "Turbopack uses Lightning CSS by default since Next 14.2 ... always uses Lightning CSS"). `:has()`·`sticky`는 Lightning CSS의 트랜스파일 대상 피처 목록(`nesting`·`is-selector`·`color-function` 등)에 없다 — 즉 그대로 통과(no-op)된다. `browserslist` 설정이 `package.json`에 없으므로(이 세션에서 확인) Lightning CSS는 기본 타깃으로 동작하며, 회사 PC(Windows Chrome/Edge, D-32 검수 대상)는 이 셋을 전부 네이티브 지원한다.
- **클래스명 생성:** Next.js가 자동으로 스코프된 고유 클래스명을 생성한다(설정 불필요). 개발 모드에서는 `ComponentName_className__hash` 형태로 디버깅 가능한 이름이, 프로덕션에서는 축약된 해시가 나온다 — 이 세션의 `pnpm dev` curl 결과에서 실제로 확인됨(`.next/static/chunks/*.css`).
- **파일 배치:** `ui/<컴포넌트>/<Component>.tsx` 옆에 `<Component>.module.css`를 두는 배치를 이 세션에서 빌드 확인했다(Recommended Project Structure 참고). 이는 Claude's Discretion 항목이므로 이 리서치는 권장안만 제시한다.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| "리터럴 색/서체/radius/간격 금지" 강제 | 커스텀 stylelint 플러그인(`.mjs` 플러그인 모듈) | stylelint 내장 `declaration-property-value-allowed-list` / `-disallowed-list` | 두 규칙만으로 이 페이즈가 요구하는 4개 카테고리(색·서체·radius·간격) 전부 표현 가능(Code Examples 참고) — 커스텀 플러그인은 D-20이 승인한 "devDependency는 stylelint 하나"를 벗어나지 않지만 유지보수 비용만 늘린다 |
| 접근성 판정(WCAG 규칙 매칭) | 수작업 색 대비 계산 스크립트 | `@axe-core/playwright`(승인 시) 또는 수동 `aria-*` assertion | axe-core는 WCAG 규칙 엔진이 이미 관리되고 있다 — SYSTEM.md §1의 대비값은 이미 사람이 계산해 문서화했으므로(예: `on --bg 8.9`) 이를 재계산하는 스크립트는 불필요, 렌더된 DOM이 `aria-live`/`role=grid`/랜드마크를 실제로 갖는지만 확인하면 됨 |
| 폰트 서브셋팅 | 자체 unicode-range 분할 스크립트 | `pretendard@1.3.9`의 기 서브셋된 92개 파일 그대로 사용 | `pretendardvariable-dynamic-subset.css`가 이미 unicode-range 92분할 + `font-display: swap` + `format('woff2-variations')`을 전부 포함 — 원본을 그대로 복사하면 고칠 것이 없다(이 세션에서 tarball을 열어 CSS 내용 확인) |
| 모달/시트 포커스 트랩 | 커스텀 focus-trap 로직 | 네이티브 `<dialog>` 또는 최소 커스텀(포커스 이동 배열 하나) — 새 의존성(`focus-trap-react` 등) 없이 | D-19가 새 런타임 의존성을 금지했고, 시트/모달은 이 페이즈에서 「더보기」 시트 하나만 실제로 필요(D-25) — 과설계 방지 |

**Key insight:** 이 페이즈의 함정은 "새 기술을 배우는 것"이 아니라 "이미 정해진 규칙(SYSTEM.md)을 도구가 사람 대신 지키게 만드는 배선"이다. 배선이 틀리면(경계 등록 순서, dockerignore, `#fff` 예외) 화면은 똑같이 보이지만 나중에 조용히 깨진다.

## Common Pitfalls

### Pitfall 1: SYSTEM.md 실물 HTML 자체가 `#fff` 리터럴을 상시 사용한다
**What goes wrong:** D-20의 "리터럴 금지 + var()만 허용" stylelint 규칙을 순진하게 "모든 색 프로퍼티는 반드시 var()"로 만들면, `docs/design/system/preview.html`·`sheet-modal.html`·`form-expense.html`·`dashboard-*.html`·`external-cert.html` **전부**에 있는 `.bar .mark{color:#fff}`(로고 워드마크 흰 반전, `DECISIONS.md` U1 결정) · `.btn.p{color:#fff}`(1차 버튼 흰 글자) 패턴을 옮기는 순간 lint가 실패한다.
**Why it happens:** `--bg: #FFFFFF`(tokens.css)와 값이 같은데도 토큰 시스템에 "어두운 배경 위의 흰 글자"를 가리키는 의미 토큰이 없다 — `--bg`는 "바탕"이라는 의미로만 쓰기로 되어 있어(§1-2) 재사용이 어색해 보이지만, 계산된 값은 완전히 동일하다.
**How to avoid:** CSS Modules로 포팅할 때 `#fff` → `var(--bg)`로 그대로 치환한다(새 토큰 추가도, DECISIONS.md 갱신도 불필요 — 같은 값을 다른 방식으로 쓰는 것뿐). `rgba(255,255,255,.5)`(`kbd` 테두리, `--btn.p kbd`)도 같은 방식으로 `color-mix()` 등을 새로 도입하지 말고, 이 하나는 실제로 반투명 흰색이 필요하므로 stylelint 예외 목록에 정확히 `rgba(255,255,255,.5)` 리터럴 하나만 허용하거나 새 토큰(`--on-accent-weak`)을 추가할지는 Claude's Discretion.
**Warning signs:** stylelint를 `ui/**`에 걸자마자 첫 컴포넌트(TopBar)부터 실패하면 이 케이스다.

### Pitfall 2: box-shadow의 inset 오프셋 리터럴은 "간격" 리터럴이 아니다
**What goes wrong:** `declaration-property-value-allowed-list`를 `box-shadow`에도 걸어 "전체 값이 `var(--inset-*)`와 정확히 일치해야 한다"로 만들면, `preview.html`의 `.bar nav a[aria-current]{box-shadow:inset 0 -2px 0 var(--bar-leaf)}`처럼 **tokens.css에 없는 조합**(색만 다른 인셋 밑줄)을 쓰는 실제 화면 요구가 막힌다.
**Why it happens:** tokens.css는 `--inset-tab`·`--inset-error`·`--inset-dirty` 세 개의 "완성된" 합성 토큰만 정의했지, "오프셋은 고정, 색만 바꾸는" 일반형 토큰은 없다.
**How to avoid:** D-20의 금지 대상은 "색·서체·radius·간격" 넷뿐이다. `box-shadow`는 이 네 카테고리에 속하지 않으므로 애초에 값-전체-일치 규칙을 걸지 않는다. 대신 `declaration-property-value-disallowed-list`로 `box-shadow` 안에 **16진 색 리터럴(`#`)이나 `rgb(`/`hsl(`이 나타나면만** 잡는다(오프셋 숫자는 그대로 통과) — Code Examples 참고.
**Warning signs:** 편집용 표의 오류 셀·저장 대기 셀 스타일을 포팅할 때 이 규칙에 걸리면 규칙이 너무 넓게 잡힌 것이다.

### Pitfall 3: `ui` 타입을 boundaries에 등록하기 전에 컴포넌트부터 만들면 무방비 기간이 생긴다
**What goes wrong:** (Pattern 2에서 실측) `ui/**`가 아직 `boundaries/elements`에 없으면 `ui/` 파일이 `domain/`·`repositories/`를 직접 import해도 아무 오류가 나지 않는다.
**How to avoid:** eslint.config.mjs 편집(D-26)을 이 페이즈의 첫 작업(Wave 0)으로 배치.
**Warning signs:** `ui/` 컴포넌트 안에 `import { ... } from "@/domain/..."` 같은 줄이 리뷰에서 나오는데 lint가 조용하다면 이 순서 문제다.

### Pitfall 4: 사용자 이름 옆 "소속·계급" 텍스트는 Phase 2 시점에 데이터가 없다
**What goes wrong:** SYSTEM.md §6-0 목업은 상단 바 우측에 "박서연·기획1팀"을 보여주지만, `lib/viewer.ts`의 `SessionUser`(이 세션에서 Read로 확인)는 `{id, email, name, isAdmin, passwordIsTemporary}`뿐이고 팀/본부 필드가 없다(MAST-02는 Phase 3).
**Why it happens:** SYSTEM.md 목업은 Phase 3 이후 최종 상태를 그린 것이라, Phase 2 시점의 실제 세션 데이터와 어긋난다.
**How to avoid:** Phase 2의 TopBar는 `user.name`만 표시하고 팀 부분은 생략하거나 자리만 비워 둔다(EMPTY 아님, 단순 데이터 없음) — 이는 D-27의 "실물/문서가 어긋나면 SYSTEM.md가 기준이지만 실물이 맞다고 판단되면 SYSTEM.md를 고친다"에 해당하지 않는, **아직 데이터가 없는** 경우이므로 SYSTEM.md 수정 대상이 아니다. Phase 3에서 팀 필드가 추가되면 그때 채운다.
**Warning signs:** TopBar 컴포넌트가 `team` prop을 필수로 요구하도록 설계하면 이 문제에 부딪힌다 — optional로 설계할 것.

### Pitfall 5: 기존 shots/ 대비 시각 회귀는 폰트 차이로 항상 실패한다
**What goes wrong:** `docs/design/system/shots/*.png`를 baseline으로 Playwright `toHaveScreenshot()`을 걸면, 실물은 시스템 산세리프(README.md 명시)이고 앱은 Pretendard를 로드하므로 렌더링이 다르다.
**How to avoid:** 새 baseline을 CI와 동일한 OS/브라우저 조합(Playwright의 Linux 컨테이너 Chromium)에서 처음 한 번 생성해 커밋하고, 그 이후부터 diff한다. `docs/design/system/shots/`는 "구조 확인용 참고"로만 쓰고 회귀 baseline으로 재사용하지 않는다.

### Pitfall 6: CI의 `docs/**` paths-ignore는 SYSTEM.md만 단독으로 바꾼 PR을 건너뛴다(Q9)
**What goes wrong:** `.github/workflows/ci.yml`(이 세션에서 Read)의 트리거는 `pull_request: paths-ignore: [".planning/**", "docs/**"]`이고 `deploy.yml`도 `push: paths-ignore: [".planning/**", "docs/**"]`다. D-30·D-31이 `docs/design/SYSTEM.md`**만** 바꾸는 커밋/PR로 따로 나가면 CI가 아예 돌지 않는다.
**Why it happens:** 이 저장소는 GitHub PR 기반 워크플로를 쓴다(`git log`에서 `(#17)`·`(#16)` 같은 머지 PR 확인) — `docs/**`만 바뀐 PR은 GitHub Actions의 `paths-ignore`에 의해 워크플로 자체가 트리거되지 않는다.
**Is this a real problem for this phase:** **크지 않다.** Phase 2는 SYSTEM.md 수정과 동시에 `ui/`·`app/`·`eslint.config.mjs`·`package.json` 같은 비-docs 파일도 바꾸므로, 같은 PR 안에 두 종류가 섞이면 GitHub의 `paths-ignore`는 PR 전체가 무시 대상 패턴에 **전부** 해당할 때만 워크플로를 건너뛴다 — 코드 파일이 하나라도 섞이면 정상적으로 CI가 돈다.
**Cheapest correct handling:** D-30·D-31(SYSTEM.md 보강)을 별도의 "문서만" PR로 먼저 올리지 말고, **같은 wave/PR 안에서 해당 컴포넌트 코드와 함께 커밋**한다(CONTEXT.md의 "문서가 코드보다 먼저"는 파일을 먼저 쓰는 순서를 말하는 것이지, 별도 PR로 먼저 머지하라는 뜻이 아니다). 정말 SYSTEM.md만 먼저 리뷰받고 싶다면, PR에 트리비얼한 플레이스홀더 코드 파일 하나(예: 빈 `ui/.gitkeep` 대신 `ARCHITECTURE.md`의 `ui` 계층 설명 한 줄 추가처럼 규칙에 이미 필요한 변경)를 함께 넣어 `paths-ignore`를 우회한다.

## Code Examples

### stylelint 설정 (D-20) — 내장 규칙만, 신규 devDependency 0개 추가

```js
// Source: 이 세션에서 stylelint@17.15.0 tarball의 lib/rules/declaration-property-value-*-list/index.mjs를
// 직접 읽어 옵션 스키마(속성 키 → 허용/금지 값 패턴 배열)를 확인했다.
// stylelint.config.mjs (리포 루트, package.json의 "type":"module"과 일치)
export default {
  rules: {
    // ── 단일 값이어야 하는 스칼라 속성: 전체 값이 var()와 정확히 일치해야 함 ──
    "declaration-property-value-allowed-list": {
      "font-family": ["/^var\\(--font-sans\\)$/"],
      "font-size": ["/^var\\(--fs-[\\w-]+\\)$/"],
      "border-radius": ["/^(0|var\\(--radius\\))$/"],
      "/^(margin|padding|gap|row-gap|column-gap)(-top|-right|-bottom|-left|-inline|-block)?$/": [
        "/^(0|var\\(--s-[\\w-]+\\)|calc\\(.*var\\(--s-[\\w-]+\\).*\\))$/",
      ],
      "z-index": ["/^var\\(--z-[\\w-]+\\)$/"],
      "transition-duration": ["/^var\\(--dur-[\\w-]+\\)$/"],
      "animation-duration": ["/^var\\(--dur-[\\w-]+\\)$/"],
    },
    // ── 복합/축약 속성: 값 전체 대신 "리터럴 색"만 부분 매치로 금지 ──
    // (box-shadow의 px 오프셋, border의 style 키워드 등은 그대로 통과시킨다 — Pitfall 2)
    "declaration-property-value-disallowed-list": {
      "/^(color|background|background-color|.*border.*color.*|outline-color|fill|stroke|accent-color|caret-color|box-shadow|border|outline|background-image)$/": [
        "/#[0-9a-f]{3,8}\\b/i", // 헥스 색(#fff 포함 — Pitfall 1: var(--bg)로 치환할 것)
        "/\\brgba?\\(/i",
        "/\\bhsla?\\(/i",
      ],
    },
  },
};
```

`overrides`로 `docs/design/tokens.css`를 예외 처리할 필요가 없다 — `pnpm lint`가 넘기는 glob 자체를 `ui/**/*.module.css app/globals.css app/**/*.module.css`로 한정하면 애초에 `docs/`가 스캔 대상에 들지 않는다(아래 wiring 참고).

**wiring — 기존 `pnpm lint` 스크립트에 통합(CLAUDE.md의 "명령 4개" 형태를 깨지 않음):**
```diff
   "scripts": {
-    "lint": "eslint .",
+    "lint": "eslint . && stylelint \"ui/**/*.module.css\" \"app/globals.css\" \"app/**/*.module.css\"",
```
CI(`ci.yml`)의 `quality` job은 이미 `pnpm lint`를 실행하므로 워크플로 파일 수정이 불필요하다(이 세션에서 `ci.yml` 확인).

**규칙 자체의 테스트(D-20 "규칙 자체에도 테스트를 붙인다") — `test/unit/stylelint-config.test.ts`:**
```ts
// Source: stylelint@17.15.0 lib/index.mjs가 default export에 lint: standalone을
// 노출함을 이 세션에서 직접 확인(export { lint: standalone } 구조).
import stylelint from "stylelint";
import { describe, expect, it } from "vitest";
import config from "../../stylelint.config.mjs";

async function lint(code: string) {
  const { results } = await stylelint.lint({ code, config });
  return results[0].warnings;
}

describe("stylelint: 색 리터럴 금지", () => {
  it("var(--bg) 대신 #fff를 쓰면 걸린다", async () => {
    const warnings = await lint(".x { color: #fff; }");
    expect(warnings.length).toBeGreaterThan(0);
  });
  it("var(--bg)는 통과한다", async () => {
    const warnings = await lint(".x { color: var(--bg); }");
    expect(warnings).toHaveLength(0);
  });
  it("box-shadow의 px 오프셋은 리터럴이어도 통과한다(Pitfall 2)", async () => {
    const warnings = await lint(".x { box-shadow: inset 0 -2px 0 var(--bar-leaf); }");
    expect(warnings).toHaveLength(0);
  });
  it("border-radius 리터럴 값은 걸린다", async () => {
    const warnings = await lint(".x { border-radius: 4px; }");
    expect(warnings.length).toBeGreaterThan(0);
  });
});
```

### Pretendard 서체 도입 (D-32) — 이 세션에서 재현·검증

```bash
# Source: docs/design/NEXT-SESSION.md §B의 명령을 이 세션에서 그대로 실행해
# 92개 파일·3.1MB·OFL 라이선스·font-display:swap 내장을 확인했다(2026-09-19).
cd "$(mktemp -d)" && npm pack pretendard@1.3.9 >/dev/null && tar xzf pretendard-1.3.9.tgz
mkdir -p "$REPO/public/fonts/pretendard"
cp package/dist/LICENSE.txt "$REPO/public/fonts/pretendard/LICENSE.txt"
cp package/dist/web/variable/pretendardvariable-dynamic-subset.css \
   "$REPO/public/fonts/pretendard/pretendard-dynamic-subset.css"
cp -r package/dist/web/variable/woff2-dynamic-subset "$REPO/public/fonts/pretendard/"
# 검증(이 세션 실측): 92개 파일, 3.1M, 56K짜리 CSS, 92개의 @font-face 블록,
# 각 블록에 이미 font-display:swap · font-weight:45 920 · format('woff2-variations') 포함
```

```tsx
// app/layout.tsx — <head>에 이 한 줄만(D-32). next/font는 쓰지 않는다(locked decision).
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="stylesheet" href="/fonts/pretendard/pretendard-dynamic-subset.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

```css
/* app/globals.css */
body { font-family: var(--font-sans); }
```

`.dockerignore`·`.gitignore`는 `public/`을 제외하지 않는다(이 세션에서 확인) — `public/fonts/pretendard/`는 그대로 커밋·빌드에 포함된다.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Next.js Pages Router의 `_app.js`에서 전역 폰트 적용 | App Router `layout.tsx` + `<head>` 또는 `next/font` | Next 13+ (App Router 도입) | 이 프로젝트는 셀프호스팅 `<link>` 방식을 이미 locked decision(D-32)으로 선택 — `next/font/local`(자동 최적화)을 쓰지 않는 이유는 CONTEXT.md에 명시되지 않았지만, 서브셋 CSS를 이미 손으로 튜닝했고(unicode-range 92분할) `next/font/local`이 자체적으로 서브셋을 재계산하면 이 튜닝이 무의미해지기 때문으로 추정 — `[ASSUMED]`, 재확인 불필요(locked) |
| webpack 기반 Next.js CSS 파이프라인(PostCSS) | Turbopack + Lightning CSS(Rust) 기본값 | Next 14.2+ | 이 프로젝트는 Turbopack을 이미 기본으로 쓰고 있음(`pnpm dev`/`pnpm build` 출력에 "▲ Next.js 16.3.5 (Turbopack)" 확인). `useLightningcss` 설정은 webpack 전용이라 이 프로젝트엔 무관 |

**Deprecated/outdated:** `eslint-plugin-boundaries`의 `rules`/`element-types`(구 API) — 이 저장소가 이미 쓰고 있고(Phase 1부터) v7.2.0에서 `policies`/`dependencies`로 이름이 바뀌었다. Phase 2는 기존 스타일을 따라간다(혼용 금지) — 마이그레이션은 별도 작업.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | `@axe-core/playwright`가 이 페이즈의 접근성 자동 검증에 적합한 신규 devDependency다 | Standard Stack, Q6 | 사용자가 새 의존성 승인을 거부하면 axe 기반 자동 검증 대신 수동 `aria-*` assertion으로 대체해야 함(대체 경로는 이미 Alternatives Considered에 기술) |
| A2 | `next/font/local`을 쓰지 않고 `<link>` 태그 방식을 쓰는 이유가 서브셋 CSS 재계산 회피 때문이다 | State of the Art | 실제 이유가 다르더라도(예: 단순히 첫 세션에서 조사 안 함) 결정 자체(D-32)는 이미 locked라 실행에는 영향 없음 — 순수 배경 설명 |
| A3 | rgba(255,255,255,.5)(`kbd` 테두리) 처리 방식(리터럴 예외 vs 신규 토큰)은 열려 있다 | Pitfall 1 | 잘못 정하면 stylelint가 이 한 군데에서 오탐(false positive)을 낼 수 있음 — 영향 범위가 좁아 리스크 낮음 |
| A4 | Docker 빌드 컨텍스트 문제(.dockerignore의 `docs` 제외)가 실제 `docker build` 실행에서도 재현된다 | Pattern 1, Q1 | 코드 판독(Dockerfile의 `COPY . .` + `.dockerignore`의 `docs` 라인)으로 확인했으나 이 환경에 Docker 데몬이 없어 직접 `docker build`로 실행 확인은 못 했다. Planner는 이 수정을 하되, 실행 검증(스모크)은 실제 CI/스테이징 배포에서 최종 확인해야 한다 |

## Open Questions

1. **`rgba(255,255,255,.5)` (버튼 안 `kbd` 테두리, 1차 버튼 위)를 stylelint 예외로 둘지 새 토큰(`--on-accent-weak`)으로 만들지**
   - What we know: 실물 HTML 전체에서 이 정확한 값이 한 곳(`btn.p kbd`)에만 쓰인다.
   - What's unclear: DECISIONS.md에 새 토큰을 추가할 만큼의 재사용성이 있는지.
   - Recommendation: 사용처가 하나뿐이므로 이번 페이즈는 stylelint 예외 문자열로 두고, 재사용이 생기면 그때 토큰화(YAGNI) — Claude's Discretion.

2. **Docker 빌드 컨텍스트 수정의 실제 검증 시점**
   - What we know: 코드 판독으로는 확실한 문제이고 수정 방법도 명확하다.
   - What's unclear: 이 환경에 Docker 데몬이 없어 실제 `docker build .` 실행 확인을 못 했다.
   - Recommendation: planner는 `.dockerignore` 수정을 별도 검증 가능한 작업으로 분리하고(`docker build --target build .`가 로컬 Docker 있는 개발자 환경 또는 CI에서 성공하는지), 실행 검증은 실제 CI 파이프라인(스테이징 배포)에서 최종 확인한다.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `stylelint` | D-20 리터럴 금지 규칙 | ✗(devDependency로 추가 예정) | 17.15.0(레지스트리 확인됨) | 없음 — D-20이 이미 승인, 설치만 하면 됨 |
| `@axe-core/playwright` | Q6 접근성 자동 검증(권장) | ✗(devDependency로 추가 예정, **미승인**) | 4.13.0(레지스트리 확인됨) | 수동 `aria-*`/`getByRole` assertion으로 대체 가능(Alternatives Considered) |
| Docker | 프로덕션 이미지 빌드(D-21 수정 검증) | ✓(클라이언트 바이너리 있음) / ✗(데몬 없음, `docker info` 실패) | Docker Engine 29.3.1(클라이언트만) | 실제 `docker build` 검증은 CI/스테이징에서 수행 |
| Pretendard(npm 레지스트리) | D-32 서체 파일 확보 | ✓ | `pretendard@1.3.9`(이 세션에서 `npm pack`으로 실제 다운로드 성공) | 없음 — 이미 성공 |
| Playwright(Chromium) | Q6 다중 뷰포트/axe 검증 | ✓(이미 `@playwright/test@1.63.0` 설치됨, `playwright.config.ts` 확인) | 1.63.0 | 없음 |

**Missing dependencies with no fallback:** 없음
**Missing dependencies with fallback:** `@axe-core/playwright` 미승인 시 수동 assertion, Docker 데몬 부재 시 CI에서 최종 검증

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.1(unit/integration projects) + Playwright 1.63.0(E2E) — `vitest.config.ts`·`playwright.config.ts` 이미 존재, 이 페이즈는 확장만 |
| Config file | `vitest.config.ts`(unit/integration project 정의) · `playwright.config.ts`(E2E) |
| Quick run command | `pnpm test:unit`(도메인/순수 함수) |
| Full suite command | `pnpm test`(unit → integration → e2e) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| UX-01(다섯 상태 계약) | `ui/next-turn/build-next-turn-view.ts`가 6줄 절단·태그 정렬(막힘→오늘→결재→대기)·"더 보기 N건"을 정확히 계산 | unit | `pnpm vitest run --project unit test/unit/ui/next-turn.test.ts` | ❌ Wave 0(신규) |
| UX-01(다섯 상태) | stylelint 규칙 자체가 리터럴을 잡고 var()를 통과시킴 | unit | `pnpm vitest run --project unit test/unit/stylelint-config.test.ts` | ❌ Wave 0(신규) |
| UX-01(로그인 화면, D-30) | 로그인 → `/account` 리다이렉트, 실패 시 오류 문구, 임시 비밀번호 배너 | e2e(기존 스펙 재사용) | `pnpm test:e2e -- login-logout.spec.ts change-password.spec.ts` | ✅ 이미 존재(선택자만 새 마크업에 맞춰 수정 필요) |
| UX-01(관리자 상태 화면, D-29) | 직원 404, 관리자는 배포 버전·DB 커넥션·백업 표시 | e2e(기존 스펙 재사용) | `pnpm test:e2e -- system-status.spec.ts` | ✅ 이미 존재(선택자 유지 가능성 높음 — 텍스트 콘텐츠는 그대로 두고 마크업만 감싸는 구조 권장) |
| 성공 기준 3(375px·PC·키보드) | 로그인·내비게이션·비밀번호 변경이 375px 뷰포트에서도 깨지지 않음 | e2e(신규 프로젝트) | `pnpm exec playwright test --project=mobile-375` | ❌ Wave 0(신규 — `playwright.config.ts`에 project 추가) |
| 성공 기준 3(키보드 전용) | Tab만으로 로그인·메뉴 이동·비밀번호 변경 완료 | e2e(신규) | `pnpm test:e2e -- keyboard-nav.spec.ts` | ❌ Wave 0(신규) |
| §10 접근성 계약 | 랜드마크·스킵 링크·`aria-live`·포커스 복귀 | e2e(axe, 승인 시) | `pnpm test:e2e -- a11y.spec.ts` | ❌ Wave 0(신규, `@axe-core/playwright` 승인 후) |

### Sampling Rate

- **Per task commit:** `pnpm test:unit`(빠름, DB 불필요)
- **Per wave merge:** `pnpm test`(전체 3계층) — 특히 로그인/비밀번호 변경/상태 화면 E2E 스펙은 마크업이 바뀔 때마다 즉시 실행
- **Phase gate:** `pnpm test` 전체 그린 + `pnpm lint`(stylelint 포함) 그린이 `/gsd-verify-work` 이전 필수

### Wave 0 Gaps

- [ ] `eslint.config.mjs`에 `ui` boundaries 타입 추가(코드 예제 참고) — **다른 모든 `ui/` 작업의 선행 조건**
- [ ] `.dockerignore`에서 `docs` 제외 라인 제거 — D-21 프로덕션 빌드 선행 조건
- [ ] `stylelint.config.mjs` + `package.json`의 `lint` 스크립트 통합
- [ ] `test/unit/stylelint-config.test.ts` — 규칙 자체의 테스트(D-20 요구)
- [ ] `test/unit/ui/next-turn.test.ts` — D-24 요구
- [ ] `playwright.config.ts`에 375px 뷰포트 project 추가
- [ ] (선택, 승인 시) `@axe-core/playwright` 설치 + `test/e2e/a11y.spec.ts`

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1`(`.planning/config.json` 확인).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | 아니오(로직 변경 없음) | 기존 better-auth 흐름 그대로(Phase 1) — Phase 2는 표현만 갈아끼움(D-25) |
| V3 Session Management | 아니오 | 동일 — `authedActionClient`·`getSession()` 변경 없음 |
| V4 Access Control | 예(간접) | D-29 관리자 상태 화면의 `notFound()`(직원 404) 로직은 그대로 유지해야 함 — 마크업만 셸 안으로 이동, 접근 제어 분기(`if (!session.viewer.isAdmin) notFound()`)는 건드리지 않는다 |
| V5 Input Validation | 예 | 로그인 폼·비밀번호 변경 폼의 서버 검증(zod, `authedActionClient`)은 이미 존재 — Phase 2는 오류 **표시** 방식만 §7-2 컴포넌트로 교체, 검증 로직 자체는 불변 |
| V6 Cryptography | 아니오 | 해당 없음(이 페이즈는 암호화 관련 코드를 만들지 않음) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|------------------------|
| `ui/` 컴포넌트가 실수로 `domain`/`repositories`를 직접 import해 계급별 정보 노출 우회 경로가 됨 | Information Disclosure | D-26의 `boundaries/element-types`(`{ from: "ui", allow: ["ui", "lib"] }`)가 구조적으로 이를 원천 차단 — Phase 3의 `scopeFor(viewer)` 방어선보다 먼저, 컴파일/린트 단계에서 막는 1차 방어 |
| CSS injection(사용자 입력이 CSS 값으로 흘러 들어가는 경우) | Tampering | 이 페이즈는 사용자 입력을 CSS로 렌더하는 지점이 없다(모든 값은 tokens.css 상수) — 해당 없음, 향후 페이즈에서 동적 스타일(예: 팀 색상 커스터마이징)이 생기면 재검토 |
| 신규 devDependency(`stylelint`, `@axe-core/playwright`)의 공급망 리스크 | Tampering(supply chain) | Package Legitimacy Audit 절 참고 — 둘 다 잘 알려진 생태계 표준 도구, `postinstall` 스크립트 확인은 아래 참고 |

**postinstall 스크립트 확인(신규 devDependency 공급망 점검):**
```
$ npm view stylelint scripts.postinstall
(빈 출력 — postinstall 없음)
$ npm view @axe-core/playwright scripts.postinstall
(빈 출력 — postinstall 없음)
```
(이 세션에서 실행 확인 — 위 두 패키지는 설치 시 임의 스크립트를 실행하지 않는다.)

## Sources

### Primary (HIGH confidence — 이 세션에서 직접 실행/판독)
- `pnpm build`·`pnpm dev`·`pnpm lint` 실행 결과(이 저장소, 2026-09-19) — D-21 직접 import, `ui/` CSS Modules, boundaries 동작 확인
- `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md` — CSS Modules·전역 CSS·외부 스타일시트·순서 규칙
- `node_modules/next/dist/docs/01-app/01-getting-started/13-fonts.md`, `03-api-reference/02-components/font.md` — `next/font` API(이 페이즈는 D-32 locked decision으로 미사용, 비교 목적으로 읽음)
- `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/useLightningcss.md` — Turbopack의 Lightning CSS 기본 사용, 트랜스파일 피처 목록
- `eslint.config.mjs`, `docs/design/tokens.css`, `docs/design/SYSTEM.md`, `docs/design/DECISIONS.md`, `docs/design/NEXT-SESSION.md`, `docs/design/system/README.md`, `docs/design/system/preview.html`·`sheet-modal.html`·`form-expense.html`·`dashboard-*.html`·`external-cert.html`·`print-*.html`, `Dockerfile`, `.dockerignore`, `.github/workflows/ci.yml`·`deploy.yml`, `playwright.config.ts`, `vitest.config.ts`, `test/e2e/*.spec.ts`, `test/e2e/global-setup.ts`, `test/e2e/fixtures.ts`, `test/unit/docs-limits.test.ts`, `test/unit/eslint-rules/*.test.ts`, `eslint/index.mjs`, `docs/ARCHITECTURE.md`, `app/**`, `lib/viewer.ts`, `lib/actions/client.ts`, `app/session-refresh.tsx` — 전부 이 세션에서 Read
- `npm view stylelint version/scripts.postinstall`, `npm view @axe-core/playwright version/peerDependencies/scripts.postinstall`, `npm view eslint-plugin-boundaries versions`, `npm view pretendard@1.3.9 version/license/repository.url/dist.unpackedSize` — 전부 이 세션에서 실행
- `npm pack stylelint@17.15.0` tarball의 `lib/rules/declaration-property-value-*-list/index.mjs`·`lib/cli.mjs`·`lib/index.mjs` — 이 세션에서 압축 해제 후 직접 Read
- `npm pack pretendard@1.3.9` tarball의 `dist/web/variable/*` — 이 세션에서 압축 해제 후 파일 개수·크기·CSS 내용 직접 확인

### Secondary (MEDIUM confidence)
- 없음(이 리서치의 핵심 주장은 전부 1차 소스로 검증됨)

### Tertiary (LOW confidence)
- A2(Assumptions Log) — `next/font/local` 미채택 이유 추정

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 버전은 레지스트리에서 직접 확인, D-20이 이미 승인
- Architecture: HIGH — CSS import·CSS Modules·boundaries 동작을 이 세션에서 실제 빌드로 검증
- Pitfalls: HIGH(SYSTEM.md 실물 HTML을 grep해 `#fff` 패턴이 6개 파일에 반복됨을 직접 확인) / MEDIUM(Docker 빌드 컨텍스트 문제는 코드 판독만, 실제 `docker build` 미실행)

**Research date:** 2026-09-19
**Valid until:** SYSTEM.md/tokens.css가 바뀌지 않는 한 유효(디자인 시스템 자체는 리뷰 통과 후 안정). Next.js/stylelint 버전은 30일 기준으로 재확인 권장.
