# Phase 3: 권한·설정·마스터 (관리자 운영 콘솔) - Context

**Gathered:** 2026-09-20
**Status:** Ready for planning

<domain>
## Phase Boundary

관리자가 코드 수정 없이 사람·계급·본부·팀·권한표·정보 노출표·설정·코드표·거래처·법인카드를 화면에서 등록하고, 이후 모든 화면·API가 이 권한·설정 위에 얹힌다.

이 페이즈는 **메커니즘**(판정 함수 · 리포지토리 행 필터 + DTO 투영 · 설정 레지스트리 · 누수 스캔 테스트 생성기 · 암호화 헬퍼 · 보관함 · 행동 로그)과 **마스터 데이터**를 세우는 데서 끝난다. 전 메뉴 대상 검수는 Phase 7 끝이다.

요구사항 13개: ADMN-01·02·03·05·06·08·10·12, OPS-05, MAST-01~04.

</domain>

<decisions>
## Implementation Decisions

Phase 1의 D-01~D-18, Phase 2의 D-19~D-32는 그대로 유효하다. 번호를 이어 붙인다.

**이 논의의 성격:** 사용자가 네 갈림길 전부를 "네가 추천하는대로 해"로 위임했다(2026-09-20). 아래 D-33~D-38은 Claude 판단이며, 각 항목에 근거와 되돌리기 비용을 남긴다 — 위임이지 합의가 아니므로 계획 단계에서 사용자가 뒤집을 수 있다. 도메인 연결(D-39)만 사용자가 직접 골랐다.

### 페이즈 크기

- **D-33:** **Phase 3을 쪼개지 않는다.** 로드맵을 고치지 않고 그대로 두되, `/gsd-plan-phase 3`이 5플랜 상한을 넘겨 **플랜 5~7개로 자연스럽게 나뉘는 것을 허용**한다. 근거: 로드맵 Phase 3 절이 이미 "전 메뉴 대상 검수는 Phase 7 끝에서 한다"로 범위를 한 번 덜어냈고(CEO 리뷰 결과), 요구사항 13개는 성공 기준 6개에 대응하지 플랜 수에 대응하지 않는다. MVP 모드이므로 플랜 수보다 성공 기준 충족이 우선이다. 3A/3B 분할은 Phase 4가 3B의 코드표(견적 대·소분류)에 의존하므로 `Depends on: Phase 3`을 쓰는 Phase 4~11 전체의 의존 관계를 다시 써야 하는 구조 변경이다. — **Reversibility:** reversible — 계획 단계에서 실제로 터지면 그때 나눈다.
- **D-34:** 쪼개야 할 상황이 오면 **절단선은 "메커니즘 vs 마스터 데이터"** 하나로 고정한다. 메커니즘 = 판정 3함수 + 누수 스캔 + 설정 레지스트리 + 암호화 헬퍼 + 보관함 + 행동 로그. 마스터 = 사람·계급·본부·팀·거래처·법인카드·코드표. 다른 선으로 자르지 않는다 — 마스터 화면이 판정 함수를 쓰므로 메커니즘이 반드시 앞선다.

### 권한 판정의 경계

- **D-35:** **`can()`과 `visible()`은 서로를 호출하지 않는다(완전 독립).** 메뉴 접근 판정과 필드 노출 판정이 각자의 표만 읽는다. 관리자가 "메뉴는 막고 필드는 열어둔" 모순 상태를 만들 수 있지만 그것을 코드가 막지 않는다. 근거: 성공 기준 2는 "판정은 `can()`/`visible()`/`scopeFor()` 세 함수에서만 이루어진다"라고 했지 상호 호출을 요구하지 않았고, REQUIREMENTS가 ADMN-01(권한표=계급×메뉴×동작)과 ADMN-02(정보 노출표=계급×정보 항목)를 **별개 표**로 정의했다. 260907식 "메뉴 우선"은 정보 항목→메뉴 매핑이라는 추가 레지스트리를 요구해 이미 큰 페이즈를 더 키운다. 실무에서 모순이 실제로 문제가 되면 Phase 7 전 메뉴 검수에서 보강한다. — **Reversibility:** reversible — 나중에 `visible()` 안에서 `can()`을 먼저 부르도록 바꾸는 것은 한 함수의 변경 + 매핑 레지스트리 신설이다.
- **D-36:** **`Viewer.isAdmin` 불리언을 이 페이즈에서 완전히 제거한다.** 모든 판정이 `can()`/`visible()`/`scopeFor()`를 거친다. `isAdmin` 분기를 남기면 그것이 네 번째 판정 경로가 되어 성공 기준 2를 정면으로 어긴다. **변경 반경을 과소평가하지 말 것** — 실측 2026-09-20: 프로덕션 9개 파일 + 테스트 16개 파일 = 25개. 테스트 쪽 진원지는 `test/fixtures.ts`의 `createFixtureUser({ isAdmin })`이고, 시그니처가 바뀌면 E2E 스펙 전부가 따라 움직인다. 그래서 **이 이관을 독립 플랜으로 떼어 낸다** — 다른 기능과 섞으면 TDD 사이클이 깨진다. — **Reversibility:** costly — 25개 파일의 호출 지점과 픽스처 시그니처가 함께 바뀐다.
- **D-37:** `users.isAdmin` **컬럼 자체는 이 페이즈에서 드롭하지 않는다.** `role_id` FK를 추가하고 코드를 전부 이관한 뒤, 컬럼은 남겨 둔다. 근거: `.squawk.toml`이 `ban-drop-column`을 예외 목록에 넣지 않았으므로 `pnpm lint:sql`이 DROP COLUMN 마이그레이션을 거부한다(실측). 드롭하려면 Squawk 예외를 새로 추가해야 하는데, 그 예외는 이 페이즈의 표 설계와 무관한 영구 완화라 값이 비싸다. 코드가 더는 읽지 않는 컬럼은 무해하며, 드롭은 별도 정리 작업으로 미룬다. **다만 이중 관리를 막기 위해** 이관 완료 후 `isAdmin` 컬럼을 참조하는 코드가 0임을 테스트로 고정한다(`ci-guard.test.ts`·`eslint-rules/` 전례와 같은 결). — **Reversibility:** reversible — 드롭은 언제든 별도 마이그레이션으로 가능하다.

### 누수 스캔 테스트 생성기

- **D-38:** **순수 런타임 등록으로 시작하고, 등록 누락은 감수한다.** 액션·DTO·Excel 내보내기 함수를 코드에서 명시적으로 레지스트리에 등록하고, 거기서 계급 × 항목 테스트를 생성한다. `defineAction()` 같은 팩토리로 등록을 타입 레벨에서 강제하는 안은 채택하지 않는다. 근거: 지금 액션이 `authedActionClient` 하나뿐이라 "무엇을 강제해야 하는지"의 실측 데이터가 없다(YAGNI). 강제 팩토리는 Phase 1이 만든 `authedActionClient` 사용 관례와 커스텀 lint `require-action-client`를 함께 바꿔야 한다. Phase 7 전 메뉴 검수에서 누락이 실제로 발견되면 그때 강제 장치를 얹는다. — **Reversibility:** reversible — 레지스트리가 이미 있으면 등록 강제는 그 위에 얹는 층이다.

### 마스터·관리 화면의 표

- **D-39:** **SYSTEM.md §7-3(엑셀식 표)은 이 페이즈에서 구현하지 않는다.** D-25의 결정(표는 Phase 4가 라이브러리 선택과 함께)을 그대로 지킨다. 사람·거래처·법인카드·코드표 관리 화면은 **§6-1 목록 템플릿 + §6-3 폼 템플릿**(추가·수정은 별도 화면 또는 모달)으로 설계한다.
- **D-40:** **단, 권한표·정보 노출표의 체크박스 격자는 예외로 이 페이즈가 만든다.** 계급 × 메뉴 × 동작은 목록+폼으로 표현할 수 없다. 이것을 §7-3의 "엑셀식 표"와 **분리된 별개 컴포넌트**로 만든다 — 다행 편집·sticky 머리글·오류 셀 inset 선 같은 §7-3의 기계장치가 필요 없는, 정적 격자 + 체크박스이기 때문이다. 따라서 Phase 4가 고를 데이터 그리드 라이브러리와 경쟁하지 않는다. **CLAUDE.md 프론트엔드 규칙에 따라 코드보다 먼저 `docs/design/SYSTEM.md` §7에 이 격자의 계약을 신설해야 한다**(D-30·D-31이 로그인 템플릿·알림함 계약에 쓴 것과 같은 절차). — **Reversibility:** reversible — 격자는 관리 화면 두 곳에서만 쓰인다.

### Claude's Discretion

사용자가 네 갈림길을 위임했으므로 D-33~D-40 전부가 Claude 판단이다. 그 밖에 planner 재량으로 남기는 것:

- **DTO 출구 강제 수단** — `eslint-plugin-boundaries`가 `app→repositories`를 Phase 1부터 이미 막고 있다(실측: `eslint.config.mjs`의 `{ from: "app", allow: ["app","domain","lib","ui"] }` + `default: "disallow"`). 남은 절반("domain의 출구는 DTO뿐")은 import 경계가 아니라 **반환 타입** 문제라 boundaries로 강제 불가. 권장 방향: 커스텀 type-aware ESLint 규칙(`eslint/rules/money-boundary.mjs`가 전례). React `experimental_taint`는 Next.js 16 문서 확인 후 2차 방어로.
- **설정 레지스트리의 이력형/비이력형 공존 형태** — 레지스트리는 하나, 값 저장 표는 `(key, effective_from, value)`와 `(key, value)` 둘. 로드맵이 "이 레지스트리에"를 반복해 설계가 이미 강하게 암시돼 있다. **다만 "특정 시점 기준 유효값" 조회 함수의 시그니처는 Phase 4의 `domain/money.applyTaxRule()`이 쓰는 계약**이므로 계획 단계에서 Phase 4 관점을 함께 본다.
- **`domain/` 하위 폴더 단위 boundaries 세분화 필요 여부** — 현재 규칙은 `domain` 전체 단위다.
- **완료 처리 강행 허용 설정 키의 형태** — Phase 6(PROJ-06)이 쓸 키를 이 페이즈가 등록한다. on/off 하나가 아니라 **점검 항목별 boolean**으로 넉넉하게 설계해 둔다.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 이 페이즈의 범위·기준
- `.planning/ROADMAP.md` — Phase 3 절(성공 기준 6개, 핵심 스키마 규약 문단: 보관함·행동 로그·`custom_fields` JSONB + `field_definitions`·문서 번호 카운터 표·앱단 암호화 컬럼 규약)
- `.planning/REQUIREMENTS.md` — ADMN-01·02·03·05·06·08·10·12, OPS-05, MAST-01~04
- `.planning/phases/03-permissions-settings-masters/03-ASSUMPTIONS.md` — 갈림길 8개의 근거·비용 비교. D-33~D-38이 여기서 나왔다
- `.planning/phases/03-permissions-settings-masters/03-PATTERNS.md` — 패턴 대응표, `No Analog Found`(선례 없는 7가지), 계획 갈림길 7개

### 아키텍처·경계
- `docs/ARCHITECTURE.md` — 4계층 + `ui`(D-26). §10이 "Phase 3: 암호화 헬퍼(`APP_DATA_KEY_v1` 사용 시작)"를 이미 예고. 300줄 상한이 `test/unit/docs-limits.test.ts`로 고정돼 있다
- `eslint.config.mjs` — `boundaries/elements` 9종과 `boundaries/element-types`. `app→repositories`가 이미 막혀 있다
- `eslint/rules/money-boundary.mjs` + `test/unit/eslint-rules/` — type-aware 커스텀 규칙 + 규칙 전용 테스트 전례
- `lib/actions/client.ts`(`authedActionClient`) · `lib/viewer.ts` — Server Action 진입점 단일화, `Viewer` 타입의 현재 모습
- `repositories/users.ts:9` — "viewer는 Phase 3의 scopeFor(viewer) 자리" 주석. 자리는 이미 있다

### 디자인
- `docs/design/SYSTEM.md` — §6-1 목록 · §6-3 폼(D-39가 쓴다) · §7-3 표 계약(D-39가 구현하지 않는다). D-40이 §7에 격자 계약을 신설해야 한다
- `docs/design/tokens.css` — 유일한 토큰 출처(D-21)
- `docs/design/DECISIONS.md` — 시스템 이탈 기록처
- `docs/DESIGN.md` §4 — 새 화면·컴포넌트 절차(D-40이 따른다)

### 앞 페이즈의 잠긴 결정
- `.planning/phases/01-deploy-skeleton-login/01-CONTEXT.md` — D-14(계급은 관리자/직원 둘, 이 페이즈가 5종으로 교체) · D-17(상태 화면 관리자 전용)
- `.planning/phases/02-design-system-app-shell/02-CONTEXT.md` — D-23(역할→메뉴 매핑이 데이터 한 곳) · D-25(표는 Phase 4) · D-26(`ui/` 경계) · D-27(SYSTEM.md가 기준)
- `lib/env.ts:67,135` — `APP_DATA_KEY_v1`이 이미 스키마와 `ENV_KEYS`에 있다(`optionalString()`)

### 스키마·마이그레이션
- `.squawk.toml` — 예외 4건. `ban-drop-column`은 예외가 아니다(D-37의 근거)
- `db/migrations/` · `db/schema/` — Drizzle 관례

### 배경
- `.planning/research/ERP260907-CONTEXT.md` — 이전 시스템의 권한 기준선("메뉴 먼저, 기능 나중")과 이력형 세율 표(`money_rules`)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `repositories/users.ts` — viewer를 첫 인자로 받는 shape이 이미 갖춰져 있고 `eslint/rules/repository-viewer-param.mjs`가 강제한다. `scopeFor(viewer)`를 만들면 **자리는 이미 있다**
- `lib/actions/client.ts`의 `authedActionClient` — 모든 Server Action의 단일 진입점. 누수 스캔 레지스트리(D-38)가 여기에 붙는다
- `ui/` 13종(컴포넌트 12 + `ui/logout/` 훅 1) — 목록·폼 화면(D-39)이 쓴다
- `test/unit/eslint-rules/` · `test/unit/ci-guard.test.ts` — "규칙·구조를 테스트로 고정한다" 패턴. D-37의 "isAdmin 참조 0" 단언이 같은 결로 붙는다
- `lib/env.ts` — 설정 레지스트리의 **틀만** 유사하다. 미사용 키 검출·DB 저장·이력형 값은 전부 없다

### Established Patterns
- 4계층 + `ui` 경계를 `eslint-plugin-boundaries`가 강제. `app→repositories`는 이미 차단됨
- `any` 금지, TypeScript 6 strict, 타입 정보 기반 lint 규칙
- 커밋: 영어 접두어 + 한국어 본문, 한 커밋 한 의도. 새 의존성은 이유 한 줄 + 승인
- 문서 300줄 상한이 테스트로 고정(`docs/ARCHITECTURE.md`·`docs/OPERATIONS.md`)
- CI는 `pull_request`만 돌고 `.planning/**`·`docs/**`만 바뀐 PR은 건너뛴다 — **주의: D-40이 요구하는 `SYSTEM.md` 계약 커밋만으로는 CI가 돌지 않는다**

### Integration Points
- `ui/shell/role-menu.ts`(D-23) — 지금 관리자/직원 둘. 이 페이즈가 계급 5종 + 권한표로 **이 한 곳만** 교체하고 셸 컴포넌트는 건드리지 않는다
- `domain/system-status/index.ts` · `app/(app)/admin/system-status/page.tsx` — 현재 `isAdmin` 분기. D-36이 `can()`으로 교체한다
- `test/fixtures.ts`의 `createFixtureUser({ isAdmin })` — 테스트 16개 파일의 진원지

</code_context>

<specifics>
## Specific Ideas

- 사용자가 네 갈림길을 명시적으로 위임했다("네가 추천하는대로 해", 2026-09-20). 계획 단계에서 D-33~D-40 중 어느 것이든 되돌릴 수 있도록 각 결정에 근거를 남겼다.
- 회사 도메인 연결은 사용자가 직접 **범위 제외**를 선택했다(아래 deferred).

</specifics>

<deferred>
## Deferred Ideas

- **회사 도메인 연결(`erp.plant8.co.kr`)** — **Phase 3 범위 제외**(사용자 결정, 2026-09-20). 02-CONTEXT.md:158이 "Phase 3으로 확정"이라 적었으나 ROADMAP Phase 3 절은 요구사항·성공 기준 어디에도 올리지 않았고, 어느 REQUIREMENTS 항목에도 대응하지 않는 순수 인프라 작업이다. 전 직원 계정 발급이 끝나는 시점(Phase 3 완료 근처)에 `/gsd-quick`으로 따로 처리한다. `deploy.sh`에 도메인 인자 자리가 이미 있다(D-15)
- **누수 스캔 등록 강제 장치**(`defineAction()` 팩토리) — D-38이 미룬 것. Phase 7 전 메뉴 검수에서 실제 누락이 발견되면 얹는다
- **`users.isAdmin` 컬럼 드롭** — D-37이 미룬 것. Squawk `ban-drop-column` 예외가 필요해지는 별도 정리 작업
- **SYSTEM.md §7-3 엑셀식 표 컴포넌트** — D-25·D-39. Phase 4가 라이브러리 선택과 함께
- **`custom_fields` 관리 화면** — 로드맵이 Phase 10으로 명시. 이 페이즈는 컬럼 + `field_definitions` 표 + zod 조립 검증까지만
- **문서 번호 부여 훅** — 로드맵이 Phase 4로 명시. 이 페이즈는 카운터 표 규약까지만
- **법정 공휴일 규칙 자동 생성(ADMN-11)** — Phase 7 배정

### 계획 단계에서 확인해야 할 것 (결정 아님)
- Next.js 16의 `experimental_taint` API 사용법 — `node_modules/next/dist/docs/`에서 실측
- Drizzle의 GIN 인덱스 생성 문법 — `node_modules/drizzle-orm` 실측
- AES-256-GCM에 Node 내장 `crypto`로 충분한지 — 신규 의존성이면 승인 절차
- **Secret Manager에 `APP_DATA_KEY_v1` 실제 값이 있는지** — `lib/env.ts`가 `optionalString()`이라 값 없이도 앱이 뜬다. 배포 전 사람 체크포인트 권장

</deferred>

---

*Phase: 03-permissions-settings-masters*
*Context gathered: 2026-09-20*
