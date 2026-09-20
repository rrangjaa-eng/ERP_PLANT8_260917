# Phase 3: 권한·설정·마스터 (관리자 운영 콘솔) - Research

**Researched:** 2026-09-20
**Domain:** 권한 판정(`can`/`visible`/`scopeFor`/`project`) · DB 기반 설정 레지스트리(이력형 포함) · 앱 단 암호화 · 마스터 데이터(사람·조직·거래처·법인카드·코드표) · 보관함·행동 로그
**Confidence:** HIGH (그린필드라 "무엇을 지어야 하는가"는 로드맵·REQUIREMENTS·기존 lint/스키마 컨벤션이 이미 결정해 뒀고, 이번 세션에서 그 결정들을 실제로 실행해 확인했다)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

Phase 1의 D-01~D-18, Phase 2의 D-19~D-32는 그대로 유효하다. 번호를 이어 붙인다.

**이 논의의 성격:** 사용자가 네 갈림길 전부를 "네가 추천하는대로 해"로 위임했다(2026-09-20). 아래 D-33~D-38은 Claude 판단이며, 각 항목에 근거와 되돌리기 비용을 남긴다 — 위임이지 합의가 아니므로 계획 단계에서 사용자가 뒤집을 수 있다. 도메인 연결(D-39는 표기 오류로 실제로는 아래 항목들의 번호를 그대로 옮김)만 사용자가 직접 골랐다.

**페이즈 크기**
- **D-33:** Phase 3을 쪼개지 않는다. 로드맵을 고치지 않고 그대로 두되, `/gsd-plan-phase 3`이 5플랜 상한을 넘겨 플랜 5~7개로 자연스럽게 나뉘는 것을 허용한다.
- **D-34:** 쪼개야 할 상황이 오면 절단선은 "메커니즘 vs 마스터 데이터" 하나로 고정한다. 메커니즘 = 판정 3함수 + 누수 스캔 + 설정 레지스트리 + 암호화 헬퍼 + 보관함 + 행동 로그. 마스터 = 사람·계급·본부·팀·거래처·법인카드·코드표.

**권한 판정의 경계**
- **D-35:** `can()`과 `visible()`은 서로를 호출하지 않는다(완전 독립). 메뉴 접근 판정과 필드 노출 판정이 각자의 표만 읽는다. 모순 상태(메뉴는 막고 필드는 열어둠)를 코드가 막지 않는다.
- **D-36:** `Viewer.isAdmin` 불리언을 이 페이즈에서 완전히 제거한다. 모든 판정이 `can()`/`visible()`/`scopeFor()`를 거친다. 변경 반경: 실측 프로덕션 10개 파일 + 테스트 15개 파일 = 25개(테스트 진원지는 `test/e2e/fixtures.ts`의 `createFixtureUser({ isAdmin })`). 이관을 독립 플랜으로 떼어 낸다.
- **D-37:** `users.isAdmin` 컬럼 자체는 이 페이즈에서 드롭하지 않는다. `role_id` FK를 추가하고 코드를 전부 이관한 뒤 컬럼은 남겨 둔다(`.squawk.toml`의 `ban-drop-column`이 예외 목록에 없어 `pnpm lint:sql`이 DROP COLUMN을 거부 — 이번 세션에서 실제로 재현). 이관 완료 후 `isAdmin` 컬럼을 참조하는 코드가 0임을 테스트로 고정한다.

**누수 스캔 테스트 생성기**
- **D-38:** 순수 런타임 등록으로 시작하고, 등록 누락은 감수한다. 액션·DTO·Excel 내보내기 함수를 코드에서 명시적으로 레지스트리에 등록하고, 거기서 계급 × 항목 테스트를 생성한다. `defineAction()` 같은 강제 팩토리는 채택하지 않는다(YAGNI — 지금 액션이 `authedActionClient` 하나뿐).

**마스터·관리 화면의 표**
- **D-39:** SYSTEM.md §7-3(엑셀식 표)은 이 페이즈에서 구현하지 않는다. 사람·거래처·법인카드·코드표 관리 화면은 §6-1 목록 템플릿 + §6-3 폼 템플릿(추가·수정은 별도 화면 또는 모달)으로 설계한다.
- **D-40:** 단, 권한표·정보 노출표의 체크박스 격자는 예외로 이 페이즈가 만든다. §7-3과 분리된 별개 컴포넌트다(다행 편집·sticky 머리글·오류 셀 inset 선 같은 §7-3 기계장치가 필요 없는 정적 격자 + 체크박스). CLAUDE.md 프론트엔드 규칙에 따라 코드보다 먼저 `docs/design/SYSTEM.md` §7에 이 격자의 계약을 신설해야 한다.

### Claude's Discretion

- **DTO 출구 강제 수단** — `eslint-plugin-boundaries`가 `app→repositories`를 이미 막고 있다(실측). 남은 절반("domain의 출구는 DTO뿐")은 반환 타입 문제라 boundaries로 강제 불가. 권장 방향: 커스텀 type-aware ESLint 규칙(`eslint/rules/money-boundary.mjs`가 전례). `experimental_taint`는 Next.js 16 문서 확인 후 2차 방어로 — **본 연구에서 이 권장을 뒤집는 실측 결과를 아래 Pitfall 1에 기록했다.**
- **설정 레지스트리의 이력형/비이력형 공존 형태** — 레지스트리는 하나, 값 저장 표는 `(key, effective_from, value)`와 `(key, value)` 둘. "특정 시점 기준 유효값" 조회 함수의 시그니처는 Phase 4의 `domain/money.applyTaxRule()`이 쓰는 계약이므로 계획 단계에서 Phase 4 관점을 함께 본다.
- **`domain/` 하위 폴더 단위 boundaries 세분화 필요 여부** — 현재 규칙은 `domain` 전체 단위다.
- **완료 처리 강행 허용 설정 키의 형태** — Phase 6(PROJ-06)이 쓸 키를 이 페이즈가 등록한다. on/off 하나가 아니라 점검 항목별 boolean으로 넉넉하게 설계해 둔다.

### Deferred Ideas (OUT OF SCOPE)

- **회사 도메인 연결(`erp.plant8.co.kr`)** — Phase 3 범위 제외(사용자 결정, 2026-09-20). 전 직원 계정 발급이 끝나는 시점에 `/gsd-quick`으로 따로 처리.
- **누수 스캔 등록 강제 장치**(`defineAction()` 팩토리) — Phase 7 전 메뉴 검수에서 실제 누락이 발견되면 얹는다.
- **`users.isAdmin` 컬럼 드롭** — Squawk `ban-drop-column` 예외가 필요해지는 별도 정리 작업.
- **SYSTEM.md §7-3 엑셀식 표 컴포넌트** — Phase 4가 라이브러리 선택과 함께.
- **`custom_fields` 관리 화면** — Phase 10. 이 페이즈는 컬럼 + `field_definitions` 표 + zod 조립 검증까지만.
- **문서 번호 부여 훅** — Phase 4. 이 페이즈는 카운터 표 규약까지만.
- **법정 공휴일 규칙 자동 생성(ADMN-11)** — Phase 7 배정.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ADMN-01 | 권한표: 계급 × 메뉴 × 동작(보기/쓰기/승인) 체크박스 | Architecture Patterns §1(`can()`), §7(체크박스 매트릭스 UI), Pitfall 1(`isAdmin` 이관 반경) |
| ADMN-02 | 정보 노출표: 계급 × 정보 항목 | Architecture Patterns §1(`visible()`), §2(`project(viewer, dto)`) |
| ADMN-03 | 정보 노출은 화면·API·Excel·자동완성·검색에 동일 적용. 리포지토리 viewer 투영이 강제 지점. 누수 테스트가 액션 레지스트리 × DTO × Excel 함수 × 계급에서 자동 생성 | Architecture Patterns §2·§6(누수 스캔 생성기), Code Examples 4, Pitfall 2 |
| ADMN-05 | 설정 키는 레지스트리 한 곳에 등록, 설정 화면 자동 생성, 미사용 키 검출 테스트 강제 | Architecture Patterns §5(설정 레지스트리), Code Examples 3 |
| ADMN-06 | 설정을 JSON으로 내보내고 빈 환경에 가져온다 | Architecture Patterns §5, Don't Hand-Roll |
| ADMN-08 | 계급 종류 추가·이름 변경(데이터) | Architecture Patterns §3(스키마), MAST-02와 결합 |
| ADMN-10 | 행동 로그 화면: 사람·기간·행동 종류·문서 필터 + Excel, 열람은 정보 노출표로 통제 | Architecture Patterns §8(행동 로그), Runtime State Inventory |
| ADMN-12 | "지우지 않는다": 삭제 → 보관함, 관리자만 복원, 삭제·복원은 행동 로그에 남는다 | Architecture Patterns §9(보관함) |
| OPS-05 | 핵심 행동만 로그(잡음 배제), Excel 내보내기·마스킹 해제는 설정으로 못 끄는 핵심 로그 | Architecture Patterns §8, Security Domain |
| MAST-01 | 거래처: 계좌번호 앱 단 암호화, 기본 뒤 4자리만 노출, 기본 증빙 종류 | Architecture Patterns §4(암호화 헬퍼), Code Examples 1 |
| MAST-02 | 직원 등록 = 사람+계급+팀, 팀 ⊂ 본부, 팀 소속은 발령일 이력 | Architecture Patterns §3(스키마: `org_units`·`teams`·`team_memberships`) |
| MAST-03 | 법인카드 마스터: 개인/팀 카드, 소지자 또는 팀 지정 | Architecture Patterns §3(스키마) |
| MAST-04 | 코드표(대분류·소분류·지급 방식·프로젝트 상태 등) 관리 화면 | Architecture Patterns §3·§10(코드표 CRUD) |
</phase_requirements>

## Summary

Phase 3은 그린필드다 — `domain/`·`repositories/`에 권한·설정·마스터 관련 코드가 전무하고, 있는 것은 5곳에 흩어진 `viewer.isAdmin` 분기와 `repositories/**`의 `void viewer;` 자리표시(10곳, 4개 파일) 뿐이다. 이번 조사는 "무엇을 지어야 하는가"보다 "이미 설정된 제약을 실제로 건드려 봤을 때 무엇이 새로 드러나는가"에 집중했다. 세 가지가 계획에 즉시 영향을 준다.

첫째, **React `experimental_taint`는 이 프로젝트에서 쓸 수 없다.** `next.config.ts`의 `experimental.taint: true`는 "React `experimental` 채널 전체를 켠다"는 뜻이고, 실제로 설치된 `react@19.3.0`(안정 채널)에는 `experimental_taintObjectReference`/`experimental_taintUniqueValue`가 존재하지 않는다 — 이 두 API는 Next.js가 내부에 번들한 `react-experimental` 패키지(`node_modules/next/dist/compiled/react-experimental/`)에만 있다. 즉 taint를 쓰려면 프로덕션 앱 전체가 미출시 React 채널로 바뀐다. CONTEXT.md의 "2차 방어로 taint"라는 권장은 **이번 실측으로 기각**한다 — DTO 출구 강제는 커스텀 type-aware ESLint 규칙(`money-boundary.mjs` 전례) 하나로 간다.

둘째, **`.squawk.toml`은 Phase 3의 새 표·FK·GIN 인덱스를 막지 않지만, 각 FK `ADD CONSTRAINT`와 `CREATE INDEX`(GIN 포함) 앞에 `SET LOCAL lock_timeout`/`SET LOCAL statement_timeout`을 수동으로 넣지 않으면 경고로 `pnpm lint:sql`이 exit 1을 낸다.** `drizzle-kit generate`는 이 두 줄을 자동으로 넣어 주지 않는다(`node_modules/drizzle-kit`에 `lock_timeout` 문자열이 없음, 실측) — 기존 `0001_login_attempts.sql`·`0002_rate_limits_id_column.sql`도 사람이 직접 추가한 것으로 보인다. Phase 3의 모든 `drizzle-kit generate` 출력은 이 두 줄을 손으로 보강하는 단계가 필요하다.

셋째, **AES-256-GCM은 신규 의존성 없이 Node 내장 `crypto`로 충분하다** — `createCipheriv('aes-256-gcm', ...)`/`createDecipheriv`로 실제 암호화·복호화 라운드트립을 이 세션에서 실행해 확인했다. GIN 인덱스는 설치된 `drizzle-orm@0.45.2`의 `index(name).using("gin", table.column)`으로 되고, `PgIndexMethod` 타입에 `'gin'`이 이미 포함돼 있다.

**Primary recommendation:** taint는 버리고 커스텀 ESLint 규칙(`plant8/no-row-type-escape`)으로 DTO 출구를 강제한다. 새 마이그레이션은 FK·인덱스마다 `SET LOCAL lock_timeout='1s'; SET LOCAL statement_timeout='5s';`를 `0001`/`0002` 컨벤션대로 넣는다. `Viewer.isAdmin` 제거는 독립 플랜(D-36)으로 떼어 실측 25개 파일(프로덕션 10 + 테스트 15, 이번 세션 grep으로 재확인)을 명시적으로 계획에 올린다.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 권한 판정(`can`) | domain/ | app/(호출부) | 정책 로직은 순수 함수, 호출은 액션·페이지 게이트에서(4계층 규칙) |
| 정보 노출 판정(`visible`) + DTO 투영(`project`) | domain/ | — | domain의 유일한 출구(ROADMAP §2). repositories 행 객체가 app으로 새지 않게 하는 지점 |
| 행 필터(`scopeFor`) | repositories/ (호출) · domain/ (판정 로직) | — | `repositories/*.ts`가 이미 `viewer`를 첫 인자로 받는 자리를 갖고 있다(`void viewer;` 10곳) — 판정은 domain, 적용은 repositories where절 |
| 설정 레지스트리(등록·읽기·이력 조회) | domain/settings (정책) + repositories/settings (저장) | app/settings (자동 화면) | DB 기반 런타임 설정이라 `lib/env.ts`(프로세스 시작 시 1회 파싱)와 계층이 다르다 |
| 암호화 헬퍼(`encrypt`/`decrypt`) | lib/crypto.ts (횡단 유틸) | domain/(거래처·법인카드) | `lib/`은 domain/repositories/db를 부를 수 있는 횡단 모듈(ARCHITECTURE.md §2) — Node crypto 래퍼는 특정 계층 정책이 아니라 유틸리티 |
| 보관함(soft-delete)·복원 | domain/archive (판정) + repositories(각 표의 soft-delete 컬럼) | app/admin/archive | "지우지 않는다"는 여러 표에 걸친 횡단 규약 — 표마다 컬럼을 두고 판정은 한 곳에 모은다 |
| 행동 로그 기록·조회 | domain/action-log (기록 API) + repositories/action-log | app/admin/action-log(화면) | `lib/log.ts`(JSON stdout, Cloud Logging용)와는 별개 — ADMN-10이 요구하는 필터·Excel은 DB 영속 표가 필요 |
| 마스터 CRUD(사람·조직·거래처·법인카드·코드표) | app/admin/** (화면·액션) → domain → repositories | ui/(목록·폼 컴포넌트 재사용) | §6-1·§6-3 템플릿(D-39) — 새 표 컴포넌트 없음 |
| 권한표·노출표 체크박스 격자 | ui/(신규 컴포넌트) | app/admin/permissions, app/admin/visibility | D-40 — §7-3과 분리된 신규 계약, SYSTEM.md §7에 먼저 신설 |

## Standard Stack

### Core

이 페이즈는 새 런타임 의존성이 필요 없다. 기존 스택(Next.js 16.3.5 · TypeScript 6.0.3 · Drizzle ORM 0.45.2 · Zod 4.6.5 · next-safe-action 8.7.3)만으로 전 요구사항을 구현할 수 있음을 이번 세션에서 실측했다.

| 기능 | 사용 라이브러리 | 근거 |
|---|---|---|
| AES-256-GCM 암호화 | Node.js 내장 `crypto`(`createCipheriv`/`createDecipheriv`) | `[VERIFIED: 실제 실행]` — 이 세션에서 32바이트 키 + 12바이트 IV로 암호화→복호화 라운드트립 성공(`node -e`, 위 Summary 참고). `getCiphers().includes('aes-256-gcm')`도 `true` |
| GIN 인덱스(`custom_fields` JSONB) | `drizzle-orm` `index(name).using("gin", table.col)` | `[VERIFIED: node_modules/drizzle-orm/pg-core/indexes.d.ts]` — `PgIndexMethod`가 `'gin'`을 포함하고 `IndexBuilderOn.using(method, ...columns)`가 실제 시그니처. squawk로 생성된 `CREATE INDEX ... USING gin (...)`이 통과함을 실측(아래 Code Examples 2) |
| 동적 zod 스키마 조립(`field_definitions` → 검증) | `zod` 4.6.5 `z.object({...동적 shape})` | `[VERIFIED: 실제 실행]` — 필드 4종(text/number/date/select)을 `z.string()`/`z.coerce.number()`/`z.coerce.date()`/`z.enum()`으로 조립해 `safeParse` 성공 확인 |
| Server Action 진입점 | `next-safe-action`(`authedActionClient`, 이미 Phase 1) | `[VERIFIED: lib/actions/client.ts:1-19]` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Node 내장 `crypto` | `@noble/ciphers`, `tweetnacl` 등 | 이 프로젝트 규모(암호화 대상: 거래처 계좌번호, CERT의 주민등록번호는 Phase 11)에서 내장 API로 완전히 충족되고 "새 의존성은 이유 한 줄 + 승인" 절차가 아예 필요 없다. 채택 안 함 |
| 커스텀 ESLint 규칙(no-row-type-escape) | React `experimental_taint` | taint는 React 실험 채널 전체 전환이 필요해(아래 Pitfall 1) 이 프로젝트 규모에 비용이 과하다. 채택 안 함 — 계획 단계에서 사용자에게 이 뒤집힘을 명시적으로 보고할 것 |

**Installation:** 불필요 — 신규 패키지 없음.

## Package Legitimacy Audit

이 페이즈는 새 외부 패키지를 설치하지 않는다(위 Standard Stack 참고 — Node 내장 `crypto`, 이미 설치된 `drizzle-orm`/`zod`/`next-safe-action`만 사용). Package Legitimacy Gate 대상 없음.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                         ┌─────────────────────────────┐
                         │  app/admin/** (화면·액션)      │
                         │  - 권한표/노출표 체크박스 격자  │
                         │  - 사람·조직·거래처·카드·코드표 │
                         └───────────────┬─────────────┘
                                         │ authedActionClient
                                         │ (ctx.viewer 주입, zod 검증)
                                         ▼
        ┌───────────────────────────────────────────────────────┐
        │ domain/                                                │
        │  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐ │
        │  │ can()    │  │ visible()     │  │ project(viewer,  │ │
        │  │ (메뉴×동작)│  │ (계급×항목)    │  │  dto) — DTO 출구  │ │
        │  └────┬─────┘  └──────┬───────┘  └────────┬─────────┘ │
        │       │ 완전 독립(D-35)│                    │           │
        │  ┌────▼─────────────────────┐  ┌───────────▼────────┐ │
        │  │ domain/settings           │  │ domain/archive      │ │
        │  │ (레지스트리 판정,           │  │ domain/action-log   │ │
        │  │  이력형 asOf 조회)          │  │ (보관함·행동 로그)   │ │
        │  └────────────┬──────────────┘  └───────────┬────────┘ │
        │               │ scopeFor(viewer) 판정 로직    │           │
        └───────────────┼──────────────────────────────┼──────────┘
                         ▼                              ▼
        ┌────────────────────────────────────────────────────────┐
        │ repositories/  (scopeFor(viewer)로 행만 거름, 전체 컬럼) │
        │  users · roles · org_units · teams · team_memberships   │
        │  vendors · corp_cards · code_tables · settings           │
        │  archive_* · action_log · field_definitions               │
        └───────────────────────┬────────────────────────────────┘
                                 ▼
                         ┌───────────────┐
                         │ db/ (Postgres) │
                         └───────────────┘

   누수 스캔 (ADMN-03): 액션 레지스트리 × DTO 타입 목록 × Excel 함수 × 계급
   → test/integration/leak-scan.test.ts가 런타임에 읽어 it.each로 동적 생성
   → 노출표에 매핑 안 된 DTO가 있으면 실패
```

### 1) `can()` / `visible()` / `scopeFor()` / `project()`의 정확한 계층과 완전 독립

**근거:** `eslint.config.mjs:36-71`(boundaries 규칙, 이번 세션 재확인), `repositories/users.ts:9-10`("viewer는 Phase 3의 scopeFor(viewer) 자리"), `docs/ARCHITECTURE.md:20-24`(4계층 다이어그램에 `project(viewer, dto)`가 domain 출구로 이미 기록됨).

- `scopeFor(viewer)`는 **repositories/ 계층 안에서 각 함수가 호출하는 헬퍼**다. 판정 로직 자체(어느 role이 어느 행을 볼 수 있는지)는 `domain/permissions/scope-for.ts`에 두고 `repositories/*.ts`가 import한다 — `{ from: "repositories", allow: ["repositories", "db", "domain"] }`가 이미 이 방향을 허용한다.
- `can()`/`visible()`은 `domain/`에 있고 `app/`이 호출한다. 두 함수는 **서로 참조하지 않는다**(D-35 확정) — `can(viewer, menu, action): boolean`, `visible(viewer, infoItem): boolean`로 반환 타입·인자가 다르고 각각 별개 표(`permission_matrix`, `visibility_matrix`)만 읽는다.
- `project(viewer, dto)`는 domain 함수가 반환하기 직전에 거치는 마지막 관문이다 — repositories가 반환한 Row(전체 컬럼)를 `visible()`로 각 필드를 걸러 DTO로 만든다.

### 2) `Viewer.isAdmin` 제거 — 실측 변경 반경 (D-36)

**근거:** 이번 세션에서 `grep -rl "isAdmin" --include="*.ts" --include="*.tsx" .`로 재확인(node_modules 제외) — 25개 파일, CONTEXT.md·PATTERNS.md의 실측(2026-09-20)과 총합 일치.

| 파일 | 위치 | 현재 코드(인용) |
|---|---|---|
| `domain/viewer.ts:1,4` | 타입 정의 | `export type Viewer = { id: string; isAdmin: boolean };` / `export const SYSTEM_VIEWER: Viewer = { id: "system", isAdmin: true };` |
| `domain/auth/accounts.ts:21,69,95` | 권한 게이트 3곳 | `if (!viewer.isAdmin) { throw new Error("계정 생성 권한이 없습니다."); }`(21행), 유사 패턴 69·95행(재발급·잠금 해제) |
| `domain/auth/password.ts:96` | 본인-또는-관리자 게이트 | `if (viewer.id !== userId && !viewer.isAdmin) { throw new Error("세션을 만료할 권한이 없습니다."); }` |
| `domain/system-status/index.ts:42` | 관리자 전용 게이트 | `if (!viewer.isAdmin) { throw new NotAdminError("관리자만 볼 수 있습니다."); }` |
| `app/(app)/admin/system-status/page.tsx:20` | RSC 이중 방어 | `if (!session.viewer.isAdmin) notFound();` |
| `ui/shell/role-menu.ts:13,71,93` | 셸 메뉴 분기 | `viewer.isAdmin ? [...관리자 탭] : [...직원 탭]`(71행), `viewer.isAdmin ? { ...SYSTEM_STATUS } : null`(93행) |
| `db/schema/auth.ts:14` | 스키마 컬럼 | `isAdmin: boolean("is_admin").notNull().default(false),` |
| `lib/auth.ts` | better-auth additionalFields | `isAdmin: { type: "boolean", ..., input: false }` |
| `scripts/account-cli.ts` | CLI 인자 | `--admin` → `isAdmin: parsed.admin` |
| `test/e2e/fixtures.ts:5-13` | E2E 픽스처 진원지 | `export async function createFixtureUser(options: { isAdmin: boolean })`(경로 정정: CONTEXT.md는 `test/fixtures.ts`로 적었으나 실제 경로는 `test/e2e/fixtures.ts`다 — 이 세션에서 확인) |
| 나머지 14개 테스트 파일 | `test/e2e/*.spec.ts` 9개, `test/integration/*.test.ts` 3개, `test/unit/*.test.ts` 2개 | 전부 `createFixtureUser({ isAdmin: ... })` 또는 `SYSTEM_VIEWER`/`Viewer` 타입을 직접 참조 |

**계획에 주는 함의:** `Viewer`를 `{ id: string; roleId: string }`(또는 유사)로 바꾸면 위 표의 프로덕션 10개 파일이 전부 컴파일 에러가 나고, `createFixtureUser`의 시그니처가 바뀌면 그것을 호출하는 테스트 14개가 함께 바뀐다. D-36대로 **이 이관을 다른 기능과 절대 섞지 않는 독립 플랜**으로 둔다. 순서는: (1) `roles` 테이블 + `role_id` FK 추가·백필 → (2) `can()` 구현 → (3) 위 10개 프로덕션 파일을 하나씩 `can()` 호출로 교체 → (4) `createFixtureUser`를 `{ roleId }` 받는 시그니처로 바꾸고 14개 테스트를 따라 고침 → (5) "isAdmin 참조 0" 메타 테스트(Pattern: `ci-guard.test.ts`처럼 그렙 기반) 추가.

### 3) Drizzle 스키마·마이그레이션 — squawk가 실제로 막는 것과 안 막는 것

**근거:** 이번 세션에서 `.squawk.toml`을 대상으로 실제 SQL 스니펫을 만들어 `node_modules/.bin/squawk --config .squawk.toml`로 두 번 실행했다(방법론: 신규 표 3개 + FK + btree 인덱스 + GIN 인덱스 + `ADD COLUMN`(nullable/NOT NULL 둘 다) + `DROP COLUMN`).

**1차 실행(SET LOCAL 없이) — 실제 출력:**
```
warning[require-lock-timeout]: Missing `set lock_timeout` ... (ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY 줄)
warning[require-statement-timeout]: Missing `set statement_timeout` ... (같은 줄)
warning[ban-drop-column]: Dropping a column may break existing clients. (ALTER TABLE users DROP COLUMN is_admin)
Found 3 issues in 1 file
```
exit code 1(경고라도 `pnpm lint:sql`은 비정상 종료로 CI를 막는다).

주목할 것 — **`CREATE TABLE`(FK 없는 신규 표 3개), `CREATE INDEX ... USING btree`, `CREATE INDEX ... USING gin`, `ALTER TABLE users ADD COLUMN role_id text`(nullable), `ALTER TABLE users ADD COLUMN must_fail_not_null text NOT NULL`(디폴트 없는 NOT NULL 추가)는 전부 경고 0건이었다.** `adding-required-field` 규칙(디폴트 없는 NOT NULL 컬럼 추가를 막는 규칙)이 `.squawk.toml`의 `excluded_rules`에 이미 있어(01-04 결정, better-auth 어댑터 사유) Phase 3의 신규 NOT NULL 컬럼 추가도 이 예외를 그대로 받는다 — **새 예외 추가가 필요 없다.**

**2차 실행(FK·인덱스 앞에 `SET LOCAL lock_timeout = '1s'; SET LOCAL statement_timeout = '5s';` 삽입) — 실제 출력:**
```
Found 0 issues in 1 file 🎉
```
exit code 0.

**결론:** D-37의 "DROP COLUMN은 거부된다"는 실측 그대로 재확인됐다(그래서 Phase 3은 컬럼을 남긴다). 그 외 Phase 3이 필요로 하는 마이그레이션 형태(신규 표, FK, btree/GIN 인덱스, 디폴트 없는 NOT NULL 컬럼 추가)는 **전부 통과**하지만, FK `ADD CONSTRAINT`와 각 `CREATE INDEX`(GIN 포함) 앞에는 `db/migrations/0001_login_attempts.sql`·`0002_rate_limits_id_column.sql`이 이미 쓰는 `SET LOCAL lock_timeout = '1s'; SET LOCAL statement_timeout = '5s';` 두 줄을 **`drizzle-kit generate` 실행 뒤 손으로** 넣어야 한다(`drizzle-kit`이 자동으로 넣어 주지 않음 — `node_modules/drizzle-kit`에 `lock_timeout` 문자열 없음, grep 확인). `.squawk.toml`에 새 예외를 추가할 필요는 없다.

### 4) 암호화 헬퍼 — `lib/crypto.ts`(신규)

**근거:** `lib/env.ts:67`(`APP_DATA_KEY_v1: optionalString()`)·`docs/ARCHITECTURE.md:111,122`(이미 계약된 자리, "Phase 3부터 사용"). Node `crypto` 실측(위 Summary).

- 키는 `APP_DATA_KEY_v1` 하나(env, base64 인코딩된 32바이트 권장). 저장 형식은 CONTEXT.md가 이미 지정한 `v1:` 접두어를 그대로 따른다 — 접두어가 "어느 키 버전으로 암호화했는지"를 담아, 나중에 `APP_DATA_KEY_v2`로 회전할 때 기존 값을 계속 복호화할 수 있게 한다.
- `optionalString()`이라 값이 없어도 앱이 뜬다(Phase 1 계약 그대로) — `encrypt()`는 키가 없으면 즉시 throw(fail-closed)로 설계하는 것을 권장한다. **Secret Manager에 실제 값이 채워졌는지는 이 세션에서 확인 불가**(GCP 접근 권한 없음) — CONTEXT.md가 이미 사람 체크포인트로 남겨 뒀다(그대로 유지).

### 5) 설정 레지스트리 — `lib/env.ts`와 근본적으로 다른 저장소

**근거:** `lib/env.ts` 전체(43-163행, 이번 세션 재확인) — zod 스키마 + `ENV_KEYS` 배열 + `loadEnv()`가 프로세스 시작 시 1회 파싱.

- `lib/env.ts`는 "재배포 없이 못 바꾸는 정적 설정"이고, Phase 3의 설정 레지스트리는 "관리자가 화면에서 바꾸면 즉시 반영되는 DB 기반 런타임 설정"이다 — 저장소가 다르므로 `lib/env.ts`의 zod 스키마 패턴만 재사용하고 나머지(DB 저장, 캐싱, 미사용 키 검출, 이력형 값)는 새로 만든다.
- **이력형/비이력형 공존**: 레지스트리 등록 자체는 하나(`{ key, kind: "simple" | "historized", schema: ZodType }`)이고, 값 저장 표는 둘: `settings_simple(key, value jsonb)`(단일 행 upsert) / `settings_historized(key, effective_from date, value jsonb)`(키당 여러 행, `effective_from` 오름차순).
- **"특정 시점 기준 유효값" 조회 — Phase 4 계약의 정확한 경계:** REQUIREMENTS EXP-15는 규칙 종류마다 기준일 방향이 다르다고 명시한다(원천징수·회사 대납 = 지급일, 미지급이면 지급 예정일; 부가세 = 증빙일, 없으면 작성일). **이 "어느 날짜를 쓸지 결정하는 로직"은 Phase 4(`domain/money.applyTaxRule`)의 책임이다** — Phase 3이 만드는 조회 함수는 그 결정된 날짜(`asOf: Date`)를 받기만 하면 된다:

  ```ts
  // domain/settings/registry.ts — Phase 3이 만드는 것, Phase 4가 호출하는 계약
  async function getSettingValue<T>(
    key: string,
    opts?: { asOf?: Date }, // 이력형 키만 사용. 비이력형은 무시
  ): Promise<T> { /* effective_from <= asOf(기본 now) 중 최댓값 행 반환 */ }
  ```

  이 시그니처를 확정해 Phase 4 계획에 넘기는 것이 이번 계획 단계의 산출물 중 하나여야 한다.
- "등록됐지만 안 읽히는 키" 검출은 `lib/env.ts`에 선례가 없다(이 파일도 `ENV_KEYS` 배열이 실제 참조 여부를 검사하지 않음, 확인 완료). 정적 분석(그래프/AST)보다는 **런타임 커버리지 계측**(각 `getSettingValue(key)` 호출을 테스트 실행 중 기록해 등록된 키 집합과 대조)이 새 정적 분석 의존성 없이 구현 가능하다.

### 6) 누수 스캔 테스트 생성기 — `it.each`는 이미 검증된 패턴, "런타임 레지스트리에서 먹인다"만 신규

**근거:** `test/unit/design-system-docs.test.ts:31-38`(`it.each(["### 6-7", ...])`), `test/unit/ci-guard.test.ts`(for-loop 기반 반복 단언), `test/unit/ui/role-menu.test.ts`(production 모듈 import는 하지만 `it.each`를 문서에서 파싱한 값으로만 씀) — 전부 이번 세션에서 직접 열어 확인.

PATTERNS.md는 "동적 `it.each` 생성기"를 완전한 no-analog로 분류했으나, 정확히 말하면 **`it.each` 자체는 이 코드베이스에 이미 3개 파일에서 쓰이는 검증된 메커니즘**이고, 진짜 신규 부분은 "그 배열을 **테스트 파일 안의 리터럴**이 아니라 **`app/`이나 `domain/`의 프로덕션 레지스트리 모듈에서 import해서** 먹인다"는 점뿐이다 — 지금까지의 3개 선례 중 그런 사례는 없다(role-menu.test.ts도 production 함수는 import하되 `it.each`의 배열은 SYSTEM.md 파싱 결과다). 설계:

```ts
// test/integration/leak-scan.test.ts
import { describe, it, expect } from "vitest";
import { ACTION_REGISTRY } from "@/lib/actions/registry"; // 신규
import { DTO_REGISTRY } from "@/domain/permissions/dto-registry"; // 신규
import { ROLES } from "@/domain/permissions/roles"; // 신규

const cases = DTO_REGISTRY.flatMap((dto) => ROLES.map((role) => ({ dto, role })));

describe("정보 노출 누수 스캔 (ADMN-03)", () => {
  it.each(cases)("$dto.name × $role.name: 노출표에 매핑되어 있다", ({ dto, role }) => {
    expect(isMappedToVisibilityTable(dto, role)).toBe(true);
  });
});
```

D-38(순수 런타임 등록, 등록 누락 감수)과 일치한다 — `defineAction()` 팩토리 강제는 하지 않는다.

### 7) DTO 출구 강제 — `plant8/no-row-type-escape`(신규 커스텀 ESLint 규칙)

**근거:** `eslint/rules/money-boundary.mjs` 전문(이번 세션 재확인) — type-aware 규칙의 정확한 구현 패턴, `eslint/index.mjs`(3개 규칙 등록 방식), `repositories/users.ts:7`(`export type UserRow = InferSelectModel<typeof users>;` — Row 타입 명명 컨벤션이 이미 `*Row` 접미사).

`money-boundary.mjs`는 `checker.typeToString(type)`에 `/\bMoney\b/` 정규식을 매칭하는 방식으로 타입 인지 검사를 구현한다(28-58행). 같은 기법을 반환 타입에 적용한다:

```js
// eslint/rules/no-row-type-escape.mjs (스케치 — money-boundary.mjs와 같은 골격)
// domain/** export 함수의 반환 타입(Promise<T>의 T 포함)이 repositories/**에서
// export된 `*Row` 타입과 구조적으로 일치하면 에러. project(viewer, dto)를 거친
// 뒤의 DTO 타입은 이름이 달라야 한다(컨벤션: DTO는 `*Dto` 접미사).
const ROW_TYPE_PATTERN = /\bRow\b/;
function isExemptPath(filename) {
  // project() 구현부 자체는 Row를 받아 DTO로 바꾸는 게 일이므로 예외.
  return filename.includes("domain/permissions/project");
}
```

**한계(문서화만, 규칙 설계 시 반드시 반영):** TS는 구조적 타이핑이라 "DTO가 우연히 Row와 같은 필드 집합"이면 이름 매칭이 아니라 구조 매칭이 필요해질 수 있다 — money-boundary도 이름(`Money`) 매칭이라 완벽하지 않은 것과 같은 종류의 트레이드오프다. `*Row`/`*Dto` 명명 컨벤션을 domain 모듈 작성 규칙으로 같이 정하면(이미 `UserRow`가 그렇다) 오탐을 크게 줄인다.

### 8) 행동 로그 — `lib/log.ts`(JSON stdout)와는 다른 저장소가 필요하다

**근거:** `lib/log.ts` 전문(이번 세션 확인) — `console.log(JSON.stringify(...))`, Cloud Logging이 severity·message를 파싱하는 용도. `domain/auth/accounts.ts:57`이 이미 `log.info("auth.account_created", {...})`를 호출한다.

`lib/log.ts`는 **영속·조회·필터·Excel 내보내기가 안 되는 휘발성 stdout**이다. ADMN-10("사람·기간·행동 종류·문서로 걸러 Excel로 내보낸다")·OPS-05("Excel 내보내기·마스킹 해제는 설정으로 못 끄는 핵심 로그")는 DB 표(`action_log`)가 필요하다. 기존 `log.info(...)` 호출은 **그대로 둔다**(운영 로그 목적이 다름) — Phase 3은 `domain/action-log/record.ts`를 새로 만들어 핵심 행동 지점(계정 생성·문서 CRUD·설정 변경·민감정보 열람 등)에서 `log.info(...)`와 **나란히** `recordAction(viewer, {...})`를 호출한다.

### 9) 보관함 — soft-delete 컬럼 컨벤션

**근거:** 코드베이스에 삭제·복원 개념이 전혀 없다(PATTERNS.md "no analog", 이번 세션에서 `domain/`·`repositories/` 전체 재확인해도 update만 있고 delete 관련 코드 없음).

각 보관 대상 표에 `archived_at timestamp`(NULL = 보관 안 됨) + `archived_by text`(FK users.id) 컬럼을 추가하는 표준 soft-delete 컨벤션을 권장한다. 진짜 DELETE는 애초에 코드에서 호출하지 않는 것으로 충분하다(DB 레벨 REVOKE까지는 이 페이즈 범위 밖으로 두되, 계획 단계에서 "왜 안 하는지" 한 줄 근거를 남길 것).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| AES-256-GCM 암호화 | 커스텀 암호화 라이브러리, 순수 XOR 등 | Node 내장 `crypto.createCipheriv('aes-256-gcm', ...)` | 검증됨, 신규 의존성 0, GCM은 인증 태그로 변조 탐지까지 제공 |
| DTO 출구 강제의 컴파일 타임 대안 | React `experimental_taint` | 커스텀 type-aware ESLint 규칙 | taint는 React 실험 채널 전체 전환이 필요해 이 프로젝트 규모에 안 맞는다(Pitfall 1) |
| 미사용 설정 키 검출 | ts-morph 등 AST 정적 분석 신규 의존성 | 런타임 호출 계측(테스트 중 `getSettingValue` 호출 기록) | `lib/env.ts`에 정적 분석 선례가 없고, ts-morph는 "새 의존성은 이유 한 줄 + 승인" 절차 대상이며 이 정도 검출에는 과하다 |
| 체크박스 매트릭스 표 | §7-3 엑셀식 표 컴포넌트를 앞당겨 만듦 | D-40의 별개 정적 격자 컴포넌트 | §7-3의 다행 편집·sticky 머리글 등 기계장치가 필요 없다 — Phase 4의 표 라이브러리 선택과 경쟁하지 않는다 |

**Key insight:** 이 페이즈의 "hand-roll 금지" 목록은 전부 "이미 있는 더 단순한 도구로 충분한데 과한 인프라를 새로 짓지 말라"는 방향이다 — 그린필드라 실측 데이터가 없다는 이유로 강제 장치(팩토리, AST 분석, 실험 API)를 앞당기면 YAGNI를 어긴다.

## Runtime State Inventory

> 이 페이즈는 리네임/리브랜드가 아니지만 `Viewer.isAdmin` 제거(D-36)가 실제 DB 컬럼(`users.is_admin`)과 25개 파일의 판정 분기를 바꾸는 마이그레이션 성격을 가져 인벤토리를 적용한다.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `users.is_admin` 컬럼의 실제 값 — 01-07/01-08에서 스테이징·프로덕션에 이미 발급된 계정(관리자/직원 각 1개 이상, 실측 CLI로 생성)이 존재할 수 있다. Phase 8(MIG) 전이라 **인트라넷 실사용자 이전은 아직 없다**(`.planning/REQUIREMENTS.md` MIG 절이 Phase 8 배정, 아직 Pending) | `role_id` 도입 시 기존 `is_admin=true`인 행을 새 최상위 role로, `false`인 행을 기본 role로 백필하는 데이터 마이그레이션(코드 편집이 아니라 UPDATE 문). 실제 스테이징 DB에 몇 개 계정이 있는지는 이 세션에서 확인 불가 — 계획 단계 또는 실행 시 `SELECT count(*) FROM users WHERE is_admin` 로 실측 권장 |
| live 서비스 설정 | 없음 — 이 페이즈가 다루는 권한·설정·마스터 데이터는 이 앱의 DB에만 존재하고, 외부 서비스(GitHub Actions 변수, Cloud Monitoring 등)에 `isAdmin`이나 계급 값을 미러링한 곳이 없다(확인: `.github/workflows/*.yml`에 role/isAdmin 문자열 없음, grep) | 없음 |
| OS 등록 상태 | 없음 — Cloud Run/Cloud Scheduler에 계급·권한 값을 심은 곳이 없다 | 없음 |
| 시크릿/env var | `APP_DATA_KEY_v1`은 이미 Phase 1이 예약한 키 이름이고 이 페이즈가 이름을 바꾸지 않는다(코드가 새로 이 키를 "쓰기 시작"할 뿐) | 없음 — 이름 변경 없음 |
| 빌드 산출물 | 없음 — 이 페이즈는 패키지 재설치나 아티팩트 이름 변경이 필요한 리네임을 포함하지 않는다 | 없음 |

## Common Pitfalls

### Pitfall 1: React `experimental_taint`를 "2차 방어"로 켜면 프로덕션 React 채널 자체가 바뀐다

**What goes wrong:** `next.config.ts`에 `experimental: { taint: true }`를 추가하고 `experimental_taintObjectReference`를 domain 함수에 넣으면, import는 실패한다 — 설치된 `react@19.3.0`(안정 채널) 어디에도 이 export가 없다(`grep -c "taint" node_modules/react/cjs/react.development.js` → `0`, 이번 세션 실측). taint 문서(`node_modules/next/dist/docs/.../taint.md:14`) 자체가 "이 플래그를 켜면 `app` 디렉터리의 React `experimental` 채널도 함께 켜진다"고 명시한다.

**Why it happens:** taint API는 아직 React 안정 릴리스에 병합되지 않은 실험 기능이라 Next.js가 자체적으로 번들한 별도 React 빌드(`node_modules/next/dist/compiled/react-experimental/`)에서만 제공된다. 이걸 켜는 것은 "함수 하나 더 쓴다"가 아니라 "앱이 쓰는 React 런타임을 통째로 바꾼다"는 뜻이다.

**How to avoid:** taint를 채택하지 않는다. DTO 출구는 커스텀 ESLint 규칙(위 Architecture Patterns §7)만으로 강제한다. CONTEXT.md의 "Next.js 16 문서 확인 후 2차 방어로"라는 권장은 이 실측으로 기각됐다는 것을 계획 문서에 명시적으로 반영할 것.

**Warning signs:** `next.config.ts`에 `experimental.taint`가 등장하거나, import 문에 `experimental_taintObjectReference`가 나타나면 즉시 이 조사 결과를 참조.

### Pitfall 2: `drizzle-kit generate`가 lock/statement timeout을 넣어 주지 않는다

**What goes wrong:** FK `ADD CONSTRAINT`나 `CREATE INDEX`(GIN 포함)가 있는 새 마이그레이션 파일을 `drizzle-kit generate`로 뽑은 그대로 커밋하면 `pnpm lint:sql`이 `require-lock-timeout`/`require-statement-timeout` 경고로 exit 1을 내 CI가 막힌다(이번 세션 실측, 위 Architecture Patterns §3).

**Why it happens:** Squawk의 두 규칙은 SHARE ROW EXCLUSIVE 이상의 락을 요구하는 문장 앞에 타임아웃 설정이 없으면 경고한다 — `drizzle-kit`은 이 컨벤션을 모르는 범용 SQL 생성기다.

**How to avoid:** `db/migrations/0001_login_attempts.sql`·`0002_rate_limits_id_column.sql`이 이미 쓰는 패턴대로, FK 추가·인덱스 생성 문장 바로 앞에 `SET LOCAL lock_timeout = '1s';`/`SET LOCAL statement_timeout = '5s';`를 수동으로 추가한다. `drizzle-kit generate` 뒤 diff를 검토하는 단계를 계획에 명시적으로 넣는다.

**Warning signs:** `pnpm lint:sql`이 CI 새 표 추가 PR에서 처음으로 exit 1을 내는 시점.

### Pitfall 3: `Viewer.isAdmin` 이관을 다른 기능 플랜에 섞으면 TDD 사이클이 깨진다

**What goes wrong:** 예를 들어 "권한표 관리 화면" 플랜 안에서 `isAdmin` 제거까지 같이 하면, 25개 파일(10 프로덕션 + 15 테스트)이 한 번에 움직여 테스트 실패의 원인이 새 기능 버그인지 이관 버그인지 구분이 안 된다.

**Why it happens:** `createFixtureUser({ isAdmin })`가 E2E 스펙 9개 파일의 진원지라, 시그니처를 바꾸면 관련 없는 스펙까지 동시에 빨갛게 변한다.

**How to avoid:** D-36대로 이관을 독립 플랜으로 뗀다. 순서: role 스키마 추가 → `can()` 구현 → 10개 프로덕션 파일 교체(파일별 커밋 가능) → 픽스처 시그니처 변경 → 15개 테스트 파일 이관. "isAdmin 참조 0" 메타 테스트를 이 플랜의 완료 조건으로 둔다.

**Warning signs:** 한 플랜의 diff가 `ui/shell/role-menu.ts`와 `app/admin/permissions/**`를 동시에 건드리기 시작하면 경계가 무너지고 있다는 신호.

## Code Examples

### 1. 암호화 헬퍼 — `lib/crypto.ts`

```typescript
// lib/crypto.ts — Node 내장 crypto만 사용(신규 의존성 없음, 이번 세션 라운드트립 실측)
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12; // GCM 권장 길이

function currentKey(): Buffer {
  if (!env.APP_DATA_KEY_v1) {
    throw new Error("APP_DATA_KEY_v1이 설정되지 않았습니다."); // fail-closed
  }
  return Buffer.from(env.APP_DATA_KEY_v1, "base64"); // 32바이트여야 함
}

export function encrypt(plaintext: string): string {
  const key = currentKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // v1: 키 버전 접두어 — 나중에 APP_DATA_KEY_v2로 회전해도 기존 값을 계속 복호화할 수 있다.
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decrypt(stored: string): string {
  const [version, ivB64, tagB64, dataB64] = stored.split(":");
  if (version !== "v1") throw new Error(`알 수 없는 키 버전: ${version}`);
  const key = currentKey(); // v1 고정 — v2 도입 시 version별 키 선택 로직 추가
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
```

### 2. GIN 인덱스 — `custom_fields` JSONB

```typescript
// db/schema/field-definitions.ts
// Source: node_modules/drizzle-orm/pg-core/indexes.d.ts (IndexBuilderOn.using, PgIndexMethod)
import { pgTable, text, jsonb, index } from "drizzle-orm/pg-core";

export const fieldDefinitions = pgTable(
  "field_definitions",
  {
    id: text("id").primaryKey(),
    entity: text("entity").notNull(), // "project" | "expense_line" | "vendor" 등
    customFields: jsonb("custom_fields").notNull().default({}),
  },
  (table) => [index("field_definitions_custom_fields_idx").using("gin", table.customFields)],
);
```

마이그레이션 파일에는 `drizzle-kit generate` 뒤 아래 두 줄을 CREATE INDEX 앞에 손으로 추가한다(Pitfall 2):
```sql
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
CREATE INDEX "field_definitions_custom_fields_idx" ON "field_definitions" USING gin ("custom_fields");
```
이 형태로 `squawk --config .squawk.toml`을 실행하면 `Found 0 issues`(이번 세션 실측).

### 3. 이력형 설정 조회 — Phase 4 계약

```typescript
// domain/settings/registry.ts
import { z } from "zod";

type SettingDef<T> = { key: string; kind: "simple" | "historized"; schema: z.ZodType<T> };

export const WITHHOLDING_TAX_RATE: SettingDef<number> = {
  key: "tax.withholding_rate.other_income",
  kind: "historized",
  schema: z.number().min(0).max(1),
};

// Phase 4의 domain/money.applyTaxRule()이 부르는 계약. "어느 날짜를 넘길지"는
// 호출자(Phase 4)의 책임 — 원천징수·회사대납은 지급일(미지급이면 지급예정일),
// 부가세는 증빙일(없으면 작성일)을 호출 전에 결정해 asOf로 넘긴다.
export async function getSettingValue<T>(
  def: SettingDef<T>,
  opts?: { asOf?: Date },
): Promise<T> {
  /* repositories/settings.ts의 findEffectiveValue(def.key, opts?.asOf ?? new Date())
     결과를 def.schema.parse()로 검증 후 반환 */
  throw new Error("not implemented — 계획 단계 스케치");
}
```

### 4. 커스텀 필드 동적 zod 조립 — `field_definitions` → 검증 스키마

```typescript
// domain/custom-fields/build-schema.ts — 이번 세션에 zod 4.6.5로 실제 실행 확인
import { z } from "zod";

type FieldDef = { key: string; type: "text" | "number" | "date" | "select"; options?: string[] };

export function buildCustomFieldsSchema(defs: FieldDef[]) {
  const shape: Record<string, z.ZodType> = {};
  for (const def of defs) {
    switch (def.type) {
      case "text":
        shape[def.key] = z.string();
        break;
      case "number":
        shape[def.key] = z.coerce.number();
        break;
      case "date":
        shape[def.key] = z.coerce.date();
        break;
      case "select":
        shape[def.key] = z.enum(def.options as [string, ...string[]]);
        break;
    }
  }
  return z.object(shape);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| React 데이터 유출 방지 = 문서화된 관례("DTO만 반환하라") | React 19의 `experimental_taint*` API로 런타임 방어 시도 가능 | React 19 experimental 채널부터, Next.js 16이 `experimental.taint` 플래그로 노출 | **이 프로젝트에는 적용 불가**(Pitfall 1) — 안정 채널 앱은 여전히 lint/타입 강제에 의존해야 한다 |

**Deprecated/outdated:** 없음 — 이 페이즈가 쓰는 라이브러리(Node crypto, Drizzle GIN, zod 동적 객체)는 모두 각 패키지의 현재(설치된) 버전에서 안정적으로 지원되는 기능이며 대체된 API가 없다.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | `APP_DATA_KEY_v1`을 base64로 인코딩한 32바이트 값으로 Secret Manager에 넣는다(형식은 코드가 정하는 것이라 아직 값이 없음) | Code Examples 1 | 실제 값이 다른 인코딩(hex 등)으로 채워지면 `Buffer.from(..., "base64")`가 길이 다른 키를 만들어 `createCipheriv`가 즉시 throw — 배포 전 실제 값 형식을 Secret Manager 등록 시점에 맞춰야 한다 |
| A2 | `v1:` 접두어 뒤 구분자는 `:`이고 순서는 `iv:tag:ciphertext`(base64 각각) — CONTEXT.md는 접두어만 지정했고 정확한 직렬화 형식은 명시하지 않았다 | Code Examples 1 | 다른 구분자·순서를 쓰면 `decrypt()` 파싱이 깨진다 — 계획 단계에서 이 형식을 확정하고 단위 테스트로 고정할 것 |
| A3 | 보관함은 DB 레벨 DELETE 권한 회수(REVOKE)까지는 하지 않고 "코드에서 DELETE를 호출하지 않는다"로 충분하다고 가정 | Architecture Patterns §9 | 실수로 어딘가 `db.delete(...)`가 들어가면 보관함 규약이 조용히 깨진다 — `plant8/no-hard-delete` 같은 린트 규칙이나 통합 테스트로 보강이 필요할 수 있다(계획 단계 재량) |
| A4 | `role_id`를 도입할 때 기존 `users.is_admin=true` 행을 "시스템 관리자" 역할 하나로, `false` 행을 "직원" 기본 역할로 1:1 백필하면 충분하다(5계급 중 나머지 3종은 관리자가 화면에서 재배정) | Runtime State Inventory | 실제 스테이징 DB에 이미 세분화된 역할 기대가 있다면(예: 특정 계정을 이미 "경영관리"로 취급 중) 백필 뒤 재배정 작업이 별도로 필요 — 배포 전 실제 계정 목록을 확인할 것 |

## Open Questions

1. **`domain/` 하위 폴더 단위 boundaries 세분화가 필요한가**
   - What we know: 현재 `eslint.config.mjs`의 `boundaries/element-types`는 `domain` 전체를 하나의 타입으로 취급한다. "repositories는 domain 안에서만 호출된다"는 이미 성립하지만 "repositories는 domain/permissions 같은 특정 서브모듈에서만 호출돼야 한다"는 세분화 요구는 로드맵에 없다.
   - What's unclear: Phase 3 이후 domain 서브모듈이 늘어나면(auth, permissions, settings, archive, action-log, system-status) 서로 다른 서브모듈이 repositories를 무분별하게 부르는 걸 막을 필요가 실제로 생기는지.
   - Recommendation: 이번 페이즈는 세분화하지 않는다(CONTEXT.md discretion 항목과 일치). Phase 7 전 메뉴 검수에서 실제 혼선이 발견되면 boundaries 엘리먼트를 `domain/permissions`처럼 서브패턴으로 추가한다.

2. **체크박스 매트릭스 격자를 `ui/`의 정식 컴포넌트로 만들 것인가, 관리 화면 전용 로컬 마크업으로 갈 것인가**
   - What we know: D-40이 §7-3과 분리된 별개 계약을 SYSTEM.md §7에 신설하라고 명시했다. `ui/`에는 아직 표/그리드 계열 컴포넌트가 없다(`ls ui`로 12개 컴포넌트 확인, 표 없음).
   - What's unclear: 권한표·정보노출표 두 화면에서만 쓰는데 `ui/permission-grid/` 같은 정식 컴포넌트로 분리할 가치가 있는지, 아니면 `app/admin/permissions/`의 로컬 컴포넌트로 두어도 되는지.
   - Recommendation: 두 화면이 정확히 같은 컴포넌트를 재사용하므로 `ui/`에 두는 쪽을 권장하되, §7-3처럼 무겁게 설계하지 않는다(정적 격자 + 체크박스, 다행 편집 없음).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | 전체 | ✓ | v22.22.2 (Dockerfile은 node:24-slim) | — |
| pnpm | 전체 | ✓ | 10.33.0 | — |
| PostgreSQL(로컬) | 통합 테스트·마이그레이션 | ✓ | 16.13 (Ubuntu) | — |
| squawk-cli | `pnpm lint:sql` | ✓ | 2.65.0 (`node_modules/.bin/squawk`) | — |
| Secret Manager `APP_DATA_KEY_v1` 실제 값 | 암호화 헬퍼 배포 | 관측 불가(GCP 접근 권한 없음, 이 세션은 로컬 파일 시스템에 한정) | — | 배포 전 사람 체크포인트(CONTEXT.md 기존 항목 유지) |

**Missing dependencies with no fallback:** 없음 — 위 관측 불가 항목은 "부재"가 아니라 "확인할 수 없음"이며 배포 전 체크포인트로 이미 계획돼 있다.
**Missing dependencies with fallback:** 없음.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest(단위·통합, `--project unit`/`--project integration`) + Playwright(E2E) |
| Config file | `vitest.config.ts`, `playwright.config.ts` |
| Quick run command | `pnpm test:unit` |
| Full suite command | `pnpm test` (`test:unit` → `test:integration` → `test:e2e`, `package.json:16-19`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| ADMN-01 | `can(viewer, menu, action)` 판정 | unit | `vitest run --project unit domain/permissions/can.test.ts` | ❌ Wave 0 |
| ADMN-02 | `visible(viewer, item)` 판정 + `project()` DTO 투영 | unit | `vitest run --project unit domain/permissions/visible.test.ts` | ❌ Wave 0 |
| ADMN-03 | 누수 스캔(액션×DTO×Excel×계급) | integration | `vitest run --project integration test/integration/leak-scan.test.ts` | ❌ Wave 0 |
| ADMN-05 | 설정 레지스트리 미사용 키 검출 | unit | `vitest run --project unit domain/settings/registry-coverage.test.ts` | ❌ Wave 0 |
| ADMN-06 | 설정 JSON export/import 라운드트립 | integration | `vitest run --project integration test/integration/settings-export.test.ts` | ❌ Wave 0 |
| ADMN-08 | 계급 CRUD + 5종 시드 | integration | `vitest run --project integration test/integration/roles.test.ts` | ❌ Wave 0 |
| ADMN-10 | 행동 로그 필터+Excel | E2E | `playwright test test/e2e/action-log.spec.ts` | ❌ Wave 0 |
| ADMN-12 | 삭제→보관함→복원 | integration | `vitest run --project integration test/integration/archive.test.ts` | ❌ Wave 0 |
| OPS-05 | 핵심 행동만 기록, 잡음 제외 | unit | `vitest run --project unit domain/action-log/record.test.ts` | ❌ Wave 0 |
| MAST-01 | 거래처 CRUD + 계좌번호 암호화·마스킹 | integration | `vitest run --project integration test/integration/vendors.test.ts` | ❌ Wave 0 |
| MAST-02 | 직원 등록(사람+계급+팀), 발령일 이력 | integration | `vitest run --project integration test/integration/team-memberships.test.ts` | ❌ Wave 0 |
| MAST-03 | 법인카드 마스터(개인/팀) | integration | `vitest run --project integration test/integration/corp-cards.test.ts` | ❌ Wave 0 |
| MAST-04 | 코드표 CRUD·비활성화 | integration | `vitest run --project integration test/integration/code-tables.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm test:unit`
- **Per wave merge:** `pnpm test`(전체 3계층)
- **Phase gate:** `/gsd-verify-work` 전 `pnpm test` 전부 녹색

### Wave 0 Gaps

- [ ] `domain/permissions/{can,visible,scope-for,project}.test.ts` — 판정 4함수 단위 테스트
- [ ] `test/integration/leak-scan.test.ts` — 런타임 레지스트리 기반 동적 `it.each`(ADMN-03)
- [ ] `domain/settings/registry-coverage.test.ts` — 미사용 키 검출 메커니즘 자체의 테스트
- [ ] `lib/crypto.test.ts` — 암호화 라운드트립 + 키 없을 때 fail-closed
- [ ] Wave 0 프레임워크 설치 불필요 — Vitest/Playwright는 Phase 1부터 이미 설치·설정됨

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|--------------------|
| V2 Authentication | 아니오(이 페이즈 범위 밖 — Phase 1이 이미 구현) | — |
| V3 Session Management | 아니오 | — |
| V4 Access Control | **예** | `can()`/`visible()`/`scopeFor()` 세 함수가 유일한 판정 지점(ADMN-03 "우회 경로 없음") — 서버 측 강제, 클라이언트 숨김에 의존하지 않음 |
| V5 Input Validation | **예** | Zod 스키마(next-safe-action의 `authedActionClient` 체인, Phase 1부터 강제) + 동적 `field_definitions` → zod 조립(Code Examples 4) |
| V6 Cryptography | **예** | Node 내장 `crypto`의 AES-256-GCM만 사용(자체 구현 암호 금지). 키는 Secret Manager 경유 env var, 코드·커밋에 값 없음(`lib/env.ts`의 "값은 로그에 절대 안 남긴다" 원칙과 동일선) |

### Known Threat Patterns for {stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| 정보 노출표를 우회해 API/Excel/자동완성으로 마스킹된 데이터를 새게 함 | Information Disclosure | ADMN-03의 누수 스캔 생성기 — 모든 노출 경로(DTO·Excel·검색)를 하나의 `visible()` 판정으로 통일. `project(viewer, dto)`가 domain의 유일한 출구 |
| `role_id` 백필 누락으로 관리자 권한이 잘못 매핑됨 | Elevation of Privilege | "isAdmin 참조 0" 메타 테스트 + 백필 SQL을 별도 검증 스텝으로(Pitfall 3) |
| 거래처 계좌번호 평문 노출(로그·에러 메시지·DB 덤프) | Information Disclosure | `lib/env.ts`의 "값은 절대 로그에 안 남긴다" 원칙을 `lib/crypto.ts`에도 적용 — `encrypt()`/`decrypt()`의 인자·반환값을 로그하지 않는다. 암호문 자체는 DB에 저장되고 평문은 메모리에서만 존재 |
| 행동 로그를 관리자가 마음대로 지워 사고 증거를 인멸(ADMN-10이 "관리자는 로그를 정리할 수 있다"고 허용하지만 OPS-05는 Excel 내보내기·마스킹 해제를 "설정으로 못 끄는 핵심 로그"로 지정) | Repudiation | 관리자의 로그 정리(수정·삭제) 행위 자체도 행동 로그에 남긴다(로그 정리 로그) — 계획 단계에서 이 재귀적 요구를 명시적으로 태스크화할 것 |

## Sources

### Primary (HIGH confidence — 이번 세션에서 직접 실행/열람)
- `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/taint.md` — taint API 공식 문서, `experimental.taint` 플래그의 정확한 효과
- `node_modules/next/dist/docs/01-app/02-guides/data-security.md` — DAL·taint 관계
- `node_modules/react/cjs/react.development.js` — grep으로 taint export 부재 확인
- `node_modules/next/dist/compiled/react-experimental/` — taint가 실제로 사는 곳(Next 번들)
- `node_modules/drizzle-orm/pg-core/indexes.d.ts` — `PgIndexMethod`·`IndexBuilderOn.using()` 정확한 시그니처
- `node_modules/drizzle-kit/` — grep으로 `lock_timeout` 자동 생성 부재 확인
- `.squawk.toml` + `node_modules/.bin/squawk` 실행(2회, SET LOCAL 유무 대조) — GIN/FK/신규 표/NOT NULL 추가/DROP COLUMN 각각의 실제 통과·거부 여부
- Node.js 내장 `crypto` — AES-256-GCM 암호화·복호화 라운드트립 실행
- `zod` 4.6.5 — 동적 `z.object()` 조립·`safeParse` 실행
- `eslint.config.mjs`, `.squawk.toml`, `docs/ARCHITECTURE.md`, `lib/env.ts`, `lib/actions/client.ts`, `lib/log.ts`, `domain/viewer.ts`, `domain/auth/accounts.ts`, `domain/auth/password.ts`, `domain/system-status/index.ts`, `ui/shell/role-menu.ts`, `app/(app)/admin/system-status/page.tsx`, `repositories/{users,health,login-attempts,system-status}.ts`, `db/schema/{auth,login-attempts,index}.ts`, `db/migrations/*.sql`, `eslint/rules/{money-boundary,repository-viewer-param}.mjs`, `eslint/index.mjs`, `test/unit/{ci-guard,docs-limits,design-system-docs}.test.ts`, `test/unit/ui/role-menu.test.ts`, `test/unit/eslint-rules/repository-viewer-param.test.ts`, `test/e2e/fixtures.ts`, `test/integration/auth.test.ts` — 전부 이 세션에서 Read
- `docs/design/SYSTEM.md`(§6-1·§6-3·§7-3·§7 목차) — 이 세션에서 Read

### Secondary (MEDIUM confidence)
- `.planning/phases/03-permissions-settings-masters/03-ASSUMPTIONS.md`·`03-PATTERNS.md` — 대부분 이번 세션의 직접 검증과 일치했으며, 불일치 지점(taint 채택 가능성, `test/fixtures.ts` 경로)은 본문에 정정 표시

### Tertiary (LOW confidence)
- 없음 — 이번 조사는 전부 로컬 실행/열람으로 검증 가능한 범위였다(외부 웹 검색 불필요)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 신규 의존성 없음, 전부 실제 실행으로 확인
- Architecture: HIGH — 4계층·boundaries·기존 컨벤션이 이미 코드에 있고 이번 세션에서 재확인
- Pitfalls: HIGH — taint 부재와 squawk 동작은 직접 재현한 실측, 추측이 아님

**Research date:** 2026-09-20
**Valid until:** 이 리포의 `package.json` 고정 버전(next 16.3.5·drizzle-orm 0.45.2·zod 4.6.5)이 바뀌기 전까지 유효. Next.js의 taint 실험 상태는 마이너 업그레이드마다 바뀔 수 있어 재확인 권장(30일 또는 다음 `pnpm update` 중 먼저 오는 시점)
