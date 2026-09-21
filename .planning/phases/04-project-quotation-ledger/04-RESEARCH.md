# Phase 4: 프로젝트·견적 원장 - Research

**Researched:** 2026-09-21
**Domain:** Next.js 16 App Router + Drizzle/Postgres 4계층 ERP — 금액 모델·문서 번호·엑셀식 편집 그리드·상태 게이트
**Confidence:** HIGH (전부 파일 직접 열람으로 실측. 웹 조사는 클립보드 E2E·grid a11y 패턴 둘뿐)

## Summary

이 페이즈는 새 npm 의존성을 하나도 들이지 않는다(D-45). 리서치의 초점은 라이브러리
선택이 아니라 **이미 서 있는 계약(린트 규칙·테스트·설정 레지스트리·경계) 안에서
정확히 무엇을 만들어야 하는가**다. 세 가지가 특히 날카롭다.

1. `eslint/rules/money-boundary.mjs:3`의 `MONEY_TYPE_PATTERN = /\bMoney\b/`는 **정규식
   단어 경계**로 판정한다. `MoneyKRW`나 `FxMoney`처럼 "Money"가 다른 단어와 같은
   식별자 안에서 붙어 있으면 그 앞뒤에 단어 경계가 생기지 않아 **린트가 전혀 잡지
   못한다.** 브랜디드 타입은 정확히 `Money`라는 단독 토큰이어야 하고, 스케일별로
   나누고 싶다면 제네릭(`Money<"KRW">`)으로 가야 `<`가 비단어 문자라 경계가 생긴다.
2. `test/integration/document-counters.test.ts:41-42`가 `documentCountersRepo`의 export
   이름을 `["findDocumentCounter", "upsertDocumentCounter"]` **정확히 이 두 개**로
   고정하는 테스트를 이미 갖고 있다. Phase 4가 원자적 증가 함수를 추가하는 순간 이
   테스트는 실패하도록 **의도적으로** 설계되어 있다 — 이 테스트를 고치는 것 자체가
   Phase 4 작업의 일부다(누락하면 CI가 그 자리에서 막는다).
3. Phase 3이 이미 `project_status` 코드표를 시드했는데(`domain/seed/index.ts:19-25`)
   그 값(`planning/in_progress/on_hold/done/cancelled`)은 D-41이 요구하는 4상태
   (수주중/진행/완료(정산)/미수주)와 **다르다**. `code_items`는 관리자가 화면에서
   자유롭게 추가·수정하는 표(MAST-04)인데, PROJ-04의 상태 전이는 `domain/rules.gate`
   하드코딩 로직이 지켜야 하므로 자유 편집 코드표에 상태값을 얹으면 게이트 로직과
   코드표 편집이 서로를 깨뜨릴 수 있다. 계획 단계에서 반드시 결정해야 할 지점이다
   (Open Questions 참고).

나머지는 대체로 "이미 있는 선례를 그대로 따르면 된다"로 정리된다: DTO 투영은
`domain/permissions/project.ts`의 `project(viewer, row, spec)`, 트랜잭션은
`repositories/settings.ts:134`의 `db.transaction`, bigint 컬럼은
`db/schema/action-log.ts:19`·`db/schema/auth.ts:85`에 이미 `mode: "number"` 선례가
있다. 다만 "Phase 3의 조건부 UPDATE 선례"(D-48)는 낙관적 잠금이 아니라 **멱등
가드**(`WHERE id = ? AND archivedAt IS NULL`) 패턴이라 기법(조건부 WHERE +
`.returning()` 길이로 판정)만 옮겨 오고 조건절 자체는 새로 쓴다.

**Primary recommendation:** `domain/money`·`domain/rules.gate`·문서 번호 원자적 증가를
먼저 만들고(D-59가 F1·F2와 함께 맨 앞), `ui/form → ui/select → ui/table → ui/grid`
컴포넌트를 화면보다 먼저 만들고(D-60), 그다음에만 프로젝트·견적 화면을 붙인다.

## User Constraints (from CONTEXT.md)

<user_constraints>

### Locked Decisions

D-41~D-62 전부 잠긴 결정이다(04-CONTEXT.md 26~148행 원문). 요약(재론 금지, 구현
방법만 조사):

- **D-41**: 수주중·미수주 상태를 요구사항에 전부 반영(PROJ-04 4종 상태, EXP-08 경로
  추가, PNL-07 「미수주 비용」).
- **D-42**: 프로젝트 번호는 등록 시(수주중 단계부터) 부여. 결번 허용.
- **D-43**: 수주중에는 지출결의를 올릴 수 있고 고객 승인 게이트는 `domain/rules.gate`
  안에서 면제 단락.
- **D-44**: 미수주 → 진행 되살리기 허용. 행동 로그 기록.
- **D-45**: 엑셀식 표는 **자체 구현, 새 의존성 0**.
- **D-46**: `ui/table`(읽기, §6-1)과 `ui/grid`(편집, §7-3)를 분리하되 폰 칸 접기
  P1/P2/P3 로직은 공유.
- **D-47**: 관리자 읽기 표 6개의 `ui/table` 이관은 Phase 7. Phase 4는 컴포넌트만 만들고
  견적 줄·프로젝트 목록에만 적용.
- **D-48**: 일괄 저장 충돌은 행별 `updatedAt` 비교(조건부 `UPDATE ... WHERE updated_at = ?`)로 감지.
- **D-49**: `document_counters`의 기존 컬럼명(`counter_key, period, value`) 유지, 매핑만
  `docs/ARCHITECTURE.md`에 기록. 마이그레이션 없음.
- **D-50**: 순번 통 넷 — 프로젝트(연도별 전사) · 지출결의 뒷자리(연도별 전사 한 통,
  `26GA-`와 공유) · 구매 요청 `C`(별개) · 법인카드 사용 `K`(별개).
- **D-51**: 견적 차수는 정수 컬럼, "1차"는 표시 시점 조립. 사전 견적은 별도 값.
- **D-52**: 번호 서식은 설정 키 한 줄(접두어·연도·가름 글자·자릿수·구분자·순번 범위).
  Phase 4는 프로젝트·견적만 등록.
- **D-53**: `Money`는 최소단위 정수, DB `bigint`. 원화 1원, 외화 1/100, 환율 1/10000.
- **D-54**: 통화별 최근 환율은 새 `exchange_rates` 표 — 설정 레지스트리 키 아님(FX·통화
  키 0건 실측 확인).
- **D-55**: 견적 줄은 차수 소유. 새 차수는 전체 복사. 프로젝트 비용 합계는 차수가 아닌
  지출 쪽에서 집계.
- **D-56**: `rules.gate`는 `{ allowed, reason, ruleKey }` 반환.
- **D-57**: 인트라넷 덤프는 `.gitignore` 경로 + 환경 변수로 `extract`가 읽음. 사용자가
  덤프 준비 중, 계획에 `extract` 온전히 포함.
- **D-58**: `source`·`source_id NOT NULL DEFAULT 'demo'` 컬럼을 이전 대상 표마다.
- **D-59**: F1(Dockerfile 런타임 스테이지가 `APP_ENV` 미설정)·F2(`findVendorById`가
  archivedAt 필터 없음)를 UI 작업보다 앞에 별도 커밋으로 닫는다.
- **D-60**: `ui/form`·`ui/select`·`ui/table`·`ui/grid`를 화면보다 먼저 만든다.
- **D-61**: 사용처 0 토큰 감시 범위는 `app/**` + `ui/**`(목업 HTML 제외).
- **D-62**: 플랜 수 상한은 계획자 판단, 5 초과 시 리저브 대장(RSV-01) 분리.

### Claude's Discretion

- `Money`의 객체 모양(단일 객체 vs 브랜디드 타입 + 행 컬럼) — D-53은 수치 표현·DB
  타입만 정함. 타입 이름에 `Money`(단어 경계 충족)가 반드시 들어가야 함.
- `ui/form`의 칸 폭 변형 API 형태(prop vs 변형 클래스).
- 엑셀 그리드의 범위 선택·클립보드 구현 세부(§7-3 키 구성은 계약, 내부 구조는 재량).
- `custom_fields`를 프로젝트·견적 줄에 어떤 키로 적용할지(관리 UI 없음, 최소로).
- 목록 p99 500ms 증명 방법.
- `rules.gate`의 `rule` 인자 모양(문자열 키+레지스트리 vs 선언 객체) — D-56은 반환
  형태만 정함.

### Deferred Ideas (OUT OF SCOPE)

- 관리자 읽기 표 6개의 `ui/table` 이관 — Phase 7(D-47).
- 03-OPEN-ITEMS DOM 감사 2·6·7(관리자 표 375px 가로 스크롤) — Phase 7(D-47).
- RSV-02(리저브 매출 충당) — Phase 9, 매출 기준(PNL-03) 이후.
- PROJ-06(완료 시 미결 점검) — Phase 6, 지출결의 이후.
- 번호 서식 설정 키 5종(지출결의·일반관리비·구매 요청·법인카드 사용·연차) — 각 문서를
  만드는 페이즈가 등록(D-52).
- 인트라넷 적재·검증·델타 이전·전환 — Phase 8. 이 페이즈는 extract·transform까지.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROJ-01 | 프로젝트 등록·목록·상세(클라이언트·PM·팀·기간·상태) | Architecture Patterns §프로젝트 스키마, Code Examples §문서 번호 |
| PROJ-02 | 견적 줄 원장, 차익 서버 계산, 취소 상태(견적가 0, 이력 유지) | `domain/money`, Excel 그리드, `no-row-type-escape` 경계 |
| PROJ-03 | 매출 최소 칸(계약금액·세금계산서 발행/입금), 공급가액 입력 + 역산 | `grossFromTotal()` 설계, FX-01과 공유 컬럼 |
| PROJ-04 | 수주중→진행→완료(정산), 미수주 닫기, 되살리기 | Open Questions §project_status 충돌, `domain/rules.gate` |
| PROJ-05 | 프로젝트·견적 줄 복사, 반복 입력 기본값 | Code Examples §차수 복사(D-55) |
| PROJ-07 | 사전→상세 차수, 고객 승인 표시, 게이트 면제(수주중) | `domain/rules.gate` 반환 형태, D-43 |
| ADMN-09 | 문서 번호 서식 설정 키(접두어·연도·자릿수·구분자·순번 범위) | 문서 번호 원자적 증가, `domain/settings/registry.ts` |
| UX-04 | 서버 검증 즉시 안내, 저장 실패·중복·유실 없음 | 일괄 저장 충돌 감지(D-48), next-safe-action 스키마 |
| UX-05 | 키보드만으로 표 입력, 엑셀 키 구성, 전부/전부 거부 | Excel 그리드 구현 접근 §범위 선택·클립보드·roving tabindex |
| RSV-01 | 클라이언트별 리저브 대장(입금·출금·잔액, 프로젝트 연결) | `domain/money` 재사용, 보관함·정보 노출표 규약 |
| FX-01 | 통화·외화·환율·원화 환산 공용 컬럼, 서버 단일 반올림 | `domain/money.round()`·`exchange_rates` 표 |

</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 프로젝트/견적 CRUD, 상태 전이 | API/Backend (`domain/` + Server Actions) | Browser(폼 검증 UX) | 상태 전이는 `domain/rules.gate` 단일 진입점이 판정 — 클라이언트는 결과만 반영 |
| 문서 번호 원자적 증가 | Database/Storage (row lock) | API/Backend (트랜잭션 경계) | 동시성 보장은 Postgres 행 잠금(`UPDATE...RETURNING`)이 유일한 정본 — 애플리케이션 레벨 락은 재현 불가능한 레이스를 남긴다 |
| 금액 계산(`round`/`toKrw`/`applyTaxRule`) | API/Backend (`domain/money`) | — | 브라우저 계산값은 저장 안 함(PROJ-02) — 서버가 유일한 계산 지점 |
| 엑셀식 그리드 편집 상호작용 | Browser/Client | API/Backend(일괄 저장 검증) | 키보드·클립보드·범위 선택은 순수 클라이언트 상태, 서버는 최종 검증·저장만 |
| 정보 노출(열 가변, 리저브 숨김) | API/Backend (repositories `scopeFor` + `project()` DTO) | Browser(서버가 안 보낸 열은 그릴 수 없음) | ADMN-03: 강제 지점은 리포지토리 투영, 화면 코드가 숨기지 않는다 |
| 인트라넷 추출·변환 (extract/transform) | 로컬 운영자 스크립트(`scripts/`) | — | Cloud Run Job 번들(`scripts/build-cli.mjs`)에 없는 4종 CLI 외 별도 카테고리 — 실제 덤프는 `.gitignore`된 로컬 경로, 실행자가 로컬에서 tsx로 돌림(D-57) |

## Standard Stack

### Core

새 의존성 **0개**(D-45). 이미 설치된 스택만 쓴다. `npm view` 검증은 이미 설치된
패키지이므로 버전만 확인한다.

| Library | Installed Version | Purpose | Source |
|---------|--------|---------|--------|
| next | 16.3.5 | App Router, RSC, Server Actions | `package.json` [VERIFIED: package.json] |
| next-safe-action | 8.7.3 | 서버 액션 스키마 검증(`authedActionClient`) | `package.json` [VERIFIED: package.json] |
| react / react-dom | 19.3.0 | UI, 그리드 상호작용의 로컬 상태 | `package.json` [VERIFIED: package.json] |
| drizzle-orm | 0.45.2 | ORM, `bigint`/`sql` 템플릿, `db.transaction` | `package.json` [VERIFIED: package.json] |
| zod | 4.6.5 | 스키마 검증(설정 레지스트리·서버 액션·`custom_fields`) | `package.json` [VERIFIED: package.json] |

### Supporting

없음 — 클립보드·키보드 네비게이션은 브라우저 네이티브 API(`navigator.clipboard`,
`paste`/`keydown` 이벤트)만 쓴다.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| 자체 구현 그리드(채택) | AG Grid / Glide Data Grid / react-data-grid | D-45가 이미 기각: SYSTEM.md §7-3 계약(폰 칸 접기, 고정 오류 셀, 서버 미전송 열, 외화 2행)이 어느 라이브러리에도 없어 결국 오버라이드로 다시 만들게 됨. canvas 기반(Glide)은 DOM 실측 검증과 근본 충돌 |
| `react-roving-tabindex`(npm) | 자체 roving tabindex 구현 | D-45가 "새 의존성 0"을 요구하므로 라이브러리 채택 불가. 패턴(ARIA grid, 단일 tabbable 셀)만 차용 [CITED: react-roving-tabindex 문서·ARIA grid 패턴] |

**Installation:** 없음(신규 패키지 설치 없음).

## Package Legitimacy Audit

**이 페이즈는 새 외부 패키지를 설치하지 않는다(D-45).** Package Legitimacy Gate는
스킵한다 — 설치 대상이 없어 검사할 대상이 없다.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| *(해당 없음)* | — | — | — | — | — | 신규 설치 없음 |

**Packages removed due to [SLOP] verdict:** 없음
**Packages flagged as suspicious [SUS]:** 없음

## Architecture Patterns

### System Architecture Diagram

```
[PM 브라우저]
  │  키보드/클립보드 이벤트 (Tab/Enter/방향키/⌘C·V/Esc/⌘S)
  ▼
[ui/grid 클라이언트 상태]  ← 범위 선택 · dirty 셀 추적 · TSV 파싱
  │  ⌘S 또는 blur → 배치 페이로드 { rows: [{id, updatedAt, ...fields}] }
  ▼
[Server Action: saveQuoteLinesAction]  (next-safe-action, zod 스키마 검증)
  │
  ▼
[domain/quote-lines]  ─── domain/rules.gate(quote, "edit_line", ctx) 통과 확인
  │                         (수주중 게이트 면제 단락, 승인 전 차수 잠금)
  ├──► domain/money.round()/applyTaxRule()  (차익·부가세 계산, 브라우저 값 폐기)
  │
  ▼
[repositories/quote-lines]  행별 조건부 UPDATE (WHERE id=? AND updated_at=?)
  │   전부 성공 또는 전부 거부(트랜잭션) — 실패 행은 { id, reason } 배열로 반환
  ▼
[db: quote_lines, exchange_rates, document_counters]
        │
        └──► [document_counters: UPDATE...RETURNING 원자적 증가]  (프로젝트/견적 등록 시)
                     │  같은 트랜잭션 안에서 documents.UNIQUE(format_key, number) 삽입
                     ▼
              번호 확정 or 트랜잭션 롤백(결번 허용)

[프로젝트 상세 화면] ◄── project(viewer, row, DTO_SPEC)  (repositories/*.ts → domain 출구, visible() 필터)
        │  서버가 계급별로 열을 아예 안 보냄(ADMN-03)
        ▼
[클라이언트: 남은 열만 렌더, 폭 재분배]
```

### Recommended Project Structure

```
db/schema/
├── projects.ts          # 프로젝트 원장(신규) — status는 Open Questions §1 결정 후 확정
├── quotes.ts             # 견적 차수(신규) — 정수 round 컬럼, isApproved
├── quote-lines.ts        # 견적 줄(신규) — Money 공용 컬럼 세트, 취소 상태
├── exchange-rates.ts     # 통화별 최근 환율(신규, D-54)
├── reserve-ledger.ts     # 클라이언트별 리저브 대장(신규, RSV-01)
└── document-counters.ts  # 기존 — 컬럼명 유지, 스키마 변경 없음

domain/
├── money/
│   ├── index.ts          # Money 타입, round, toKrw, splitWithRemainder, grossFromTotal, applyTaxRule
│   └── index.test.ts     # 단위 테스트 — money-boundary 예외 경로
├── rules/
│   └── gate.ts           # domain/rules.gate(doc, rule, ctx) 단일 진입점
├── document-numbers/
│   └── index.ts          # 원자적 증가 + 서식 조립(설정 레지스트리 읽기)
├── projects/index.ts
├── quotes/index.ts
├── quote-lines/index.ts
└── reserve-ledger/index.ts

repositories/
├── document-counters.ts  # 기존 2함수 + incrementDocumentCounter(원자적 증가) 추가
├── projects.ts
├── quotes.ts
├── quote-lines.ts        # 행별 조건부 UPDATE(D-48)
├── exchange-rates.ts
└── reserve-ledger.ts

ui/
├── form/    # D-60, 화면보다 먼저
├── select/  # D-60
├── table/   # D-46, 읽기 전용(§6-1)
└── grid/    # D-46, 편집(§7-3) — table과 P1/P2/P3 로직 공유
```

### Pattern 1: DTO 투영 — domain 출구는 `project()` 하나

**What:** 리포지토리는 행 전체(모든 컬럼)를 반환하고, domain은 `project(viewer, row, spec)`로
`visible()` 판정을 거친 필드만 남긴 DTO로 변환한다.
**When to use:** 프로젝트·견적 줄·리저브 대장 등 이 페이즈가 만드는 모든 domain 조회 함수.
**Example:**
```typescript
// Source: domain/permissions/project.ts:1-31 (실측)
export type DtoSpec<Row, Dto> = {
  readonly fields: ReadonlyArray<{ key: keyof Dto & string; from: keyof Row & string; infoItem: string }>;
};

export async function project<Row extends object, Dto extends object>(
  viewer: Viewer,
  row: Row,
  spec: DtoSpec<Row, Dto>,
  deps?: Partial<ProjectDeps>,
): Promise<Partial<Dto>> {
  const visibleFn = deps?.visible ?? defaultVisible;
  const source = row as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const field of spec.fields) {
    if (!(field.from in source)) continue;
    const ok = await visibleFn(viewer, field.infoItem);
    if (!ok) continue;
    result[field.key] = source[field.from];
  }
  return result as Partial<Dto>;
}
```
실사용 예: `domain/vendors/index.ts:49-69`의 `VENDOR_DTO_SPEC` + `registerDto(...)` 등록.
같은 형태로 `PROJECT_DTO_SPEC`·`QUOTE_LINE_DTO_SPEC`을 만들고 `registerDto`에 등록해야
ADMN-03 누수 스캔이 커버한다.

**주의(no-row-type-escape, `eslint/rules/no-row-type-escape.mjs:10,20`):** 이 규칙은
export된 domain 함수의 반환 타입 이름이 `/Row$/`로 끝나면 막는다(`type.aliasSymbol?.name
?? type.symbol?.name` 우선 판정, 구조 펼침에 안 뚫림). 새 리포지토리 Row 타입은 기존
컨벤션대로 `ProjectRow`·`QuoteLineRow`처럼 반드시 `Row`로 끝나는 이름을 쓰고, domain
함수가 그 타입을 그대로 반환하면 이 린트가 즉시 잡는다.

### Pattern 2: `domain/money` — 브랜디드 타입 이름은 반드시 `Money` 단독 토큰

**What:** `eslint/rules/money-boundary.mjs:3`의 `MONEY_TYPE_PATTERN = /\bMoney\b/`는
`checker.typeToString(type)`로 얻은 **문자열 전체**에 대해 정규식 단어 경계로 매칭한다.
**핵심 함정:** `\b`는 단어 문자(`[A-Za-z0-9_]`)와 비단어 문자 사이의 경계다.
`MoneyKRW`나 `FxMoney`처럼 "Money"가 다른 단어 문자에 직접 붙은 식별자는 앞뒤에 경계가
생기지 않아 **정규식이 매칭하지 않는다** — 즉 그 타입의 산술은 `domain/money` 밖에서도
린트에 안 걸리고 통과해 버린다(보안 구멍이 아니라 탐지 구멍).
```
"MoneyKRW"  →  \bMoney\b 매칭 실패 (y와 K 사이에 비단어 문자 없음)
"Money"     →  매칭 성공
"Money<'KRW'>" → 매칭 성공 (y 다음이 '<', 비단어 문자라 경계 성립)
"{ amount: Money }" 타입의 필드 접근 → 그 필드의 타입은 여전히 "Money" → 매칭 성공
```
**검증 근거:** `test/unit/eslint-rules/fixtures/money.ts`가 실제로 `export type Money =
number & { readonly __brand: "Money" }`로 선언하고, TypeScript는 이런 이름 붙은 타입
별칭의 `typeToString`을 확장하지 않고 별칭 이름을 그대로 보존한다(테스트가 이 형태로
통과함을 `test/unit/eslint-rules/money-boundary.test.ts:12-19,29-35`이 고정).

**권장 구현:** 스케일(원화 정수원 / 외화 1/100 / 환율 1/10000)을 구분해야 한다면 별도
이름을 새로 짓지 말고 제네릭으로 스케일을 파라미터화한다:
```typescript
// domain/money/index.ts (신규 — Claude's Discretion, 이름만 계약)
export type MoneyScale = "krw" | "fx_minor" | "rate_minor";
export type Money<S extends MoneyScale = MoneyScale> = number & {
  readonly __brand: "Money";
  readonly __scale: S;
};
// Money<"krw">, Money<"fx_minor">, Money<"rate_minor"> 전부 typeToString에
// "Money<...>" 형태로 나와 \bMoney\b가 항상 매칭한다.
```

### Pattern 3: 문서 번호 원자적 증가 — `UPDATE ... SET value = value + 1 RETURNING`

**What:** `document_counters` 행을 트랜잭션 안에서 잠그고 증가시켜 다음 번호를 얻는다.
**기존 상태(실측):** `db/schema/document-counters.ts:1-18`은 `(counterKey, period, value)`
복합 PK만 정의하고, `repositories/document-counters.ts:10-33`은 `findDocumentCounter`·
`upsertDocumentCounter` 두 함수만 있다(주석 9행: "실제 번호 부여(원자적 증가)와 행
잠금은 Phase 4다"). `upsertDocumentCounter`의 `onConflictDoUpdate`는 **읽은 값을 그대로
덮어쓰는** 것이라 동시 두 트랜잭션이 같은 번호를 받을 수 있다 — 원자적 증가로 쓸 수
없다.

**⚠️ 반드시 함께 고쳐야 하는 테스트:** `test/integration/document-counters.test.ts:41-42`가
```typescript
const exportedNames = Object.keys(documentCountersRepo).sort();
expect(exportedNames).toEqual(["findDocumentCounter", "upsertDocumentCounter"]);
```
로 이 리포지토리의 export를 정확히 두 개로 고정해 놨다. 새 함수(예: `incrementDocumentCounter`)를
추가하면 이 단언이 실패한다 — **의도된 방화벽**(파일 주석: "이 테스트는 ... 증가 함수의
부재만 증명한다")이므로 Phase 4 계획에 이 테스트를 새 계약(3함수 이상)으로 갱신하는
작업을 명시적으로 포함해야 한다.

**Drizzle 구현 패턴(이 리포지토리에서 검증된 재료 조합):**
```typescript
// repositories/document-counters.ts에 추가 — sql 템플릿은 repositories/health.ts:1,
// repositories/system-status.ts:1에 이미 선례가 있다(raw 표현식 삽입 안전).
import { sql } from "drizzle-orm";

export async function incrementDocumentCounter(
  viewer: Viewer,
  counterKey: string,
  period: string,
): Promise<number> {
  // 행이 없으면 0에서 시작하도록 먼저 upsert(onConflictDoNothing)한 뒤 증가.
  // db.transaction은 repositories/settings.ts:134의 applySettingsImport와 같은 결.
  return db.transaction(async (tx) => {
    await tx
      .insert(documentCounters)
      .values({ counterKey, period, value: 0 })
      .onConflictDoNothing({ target: [documentCounters.counterKey, documentCounters.period] });

    const [row] = await tx
      .update(documentCounters)
      .set({ value: sql`${documentCounters.value} + 1`, updatedAt: new Date() })
      .where(and(eq(documentCounters.counterKey, counterKey), eq(documentCounters.period, period)))
      .returning({ value: documentCounters.value });

    if (!row) throw new Error("document_counters increment이 행을 반환하지 않았습니다.");
    return row.value;
  });
}
```
**동시성이 안전한 이유:** Postgres의 `UPDATE`는 대상 행에 `FOR UPDATE`급 행 잠금을
자동으로 건다 — 두 번째 트랜잭션의 같은 `UPDATE`는 첫 번째가 커밋(또는 롤백)할 때까지
블록된다. 별도 `SELECT ... FOR UPDATE`나 advisory lock이 필요 없다(이 리포지토리
전체에 `FOR UPDATE`·`pg_advisory` 선례가 없음 — grep 확인, 즉 이 패턴이 이 코드베이스
최초 도입이다). 문서 삽입(다음 번호로 documents 테이블에 INSERT)은 **같은 트랜잭션
안에서** 뒤따라야 하고, `UNIQUE(format_key, number)`가 이중 방어선이 된다(ROADMAP Phase
4 기준 1 원문).

**동시 제출 통합 테스트 설계(선례 없음 — 이 리포지토리 최초):** 기존 테스트 어디에도
두 트랜잭션을 동시에 실행하는 패턴이 없다(grep 확인, `db.transaction` 사용처는
`repositories/settings.ts:134` 단 한 곳뿐이고 concurrency 테스트 아님). Vitest에서
`Promise.all([incrementDocumentCounter(...), incrementDocumentCounter(...)])`로 두 호출을
동시에 발사하면 Node의 `pg` Pool이 실제로 별도 커넥션 두 개를 열어 두 트랜잭션이 겹치고,
결과값 집합이 `{1, 2}`(순서 무관, 유일함)임을 단언하면 된다 — `fileParallelism: false`
(`vitest.config.ts`)는 **테스트 파일 간** 병렬을 막을 뿐 한 테스트 안의 `Promise.all`은
막지 않으므로 이 설계로 충분하다.

### Pattern 4: 조건부 UPDATE + `.returning()` — 낙관적 잠금(D-48)

**실측 결과 — 정정 필요:** CONTEXT.md D-48이 "Phase 3의 조건부 UPDATE 선례를 그대로
쓴다"고 적었지만, 실제 Phase 3 선례(`repositories/vendors.ts:134-139`,
`repositories/roles.ts:49-55`)는 `WHERE id = ? AND archivedAt IS NULL` 형태의
**멱등 가드**(같은 보관 요청을 두 번 보내도 두 번째는 조용히 no-op)이지, "클라이언트가
읽은 시점의 `updatedAt`과 지금 DB 값이 같은가"를 확인하는 **낙관적 동시성 잠금**이
아니다. **옮겨 오는 것은 조건절의 모양이 아니라 기법**(조건부 `WHERE` + 영향받은 행을
`.returning()`으로 받아 길이로 성공/충돌 판정)이다 — 이 리포지토리 어디에도 `rowCount`를
쓰는 코드가 없고(grep 확인), `.returning()` 뒤 배열 길이를 보는 패턴만 있다(예:
`repositories/settings.ts:78`, `repositories/roles.ts:34`).

```typescript
// repositories/quote-lines.ts (신규) — D-48 구현
export async function updateQuoteLineIfUnchanged(
  viewer: Viewer,
  id: string,
  expectedUpdatedAt: Date,
  patch: Partial<QuoteLineWritable>,
): Promise<{ ok: true; row: QuoteLineRow } | { ok: false; current: QuoteLineRow | null }> {
  const [row] = await db
    .update(quoteLines)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(quoteLines.id, id), eq(quoteLines.updatedAt, expectedUpdatedAt)))
    .returning();
  if (row) return { ok: true, row };
  const [current] = await db.select().from(quoteLines).where(eq(quoteLines.id, id)).limit(1);
  return { ok: false, current: current ?? null };
}
```
일괄 저장 도메인 함수는 각 행을 순회하며 이 함수를 부르고, `ok: false`인 행만 모아
`{ id, reason: "다른 사람이 HH:mm에 N으로 바꿈", current }` 배열로 돌려준다 — §7-3의
"전부 저장 또는 전부 거부" 요구를 지키려면 도메인 레이어가 **하나라도 실패하면 전체
트랜잭션을 롤백**해야 한다(개별 행 UPDATE들을 하나의 `db.transaction`으로 묶고, 충돌
발견 시 명시적으로 throw해 롤백을 트리거).

### Pattern 5: 세금 규칙 조회 — 코드표(taxRule) + 설정 레지스트리(세율)의 이중 조회

**What:** `applyTaxRule()`은 두 정본을 합친다 — "어떤 규칙을 적용할지"는 증빙 종류
코드표(`code_items.tax_rule` JSONB, 스키마는 `domain/code-tables/tax-rule.ts`)가 결정하고,
"세율이 몇 %인지"는 이력형 설정 레지스트리(`domain/settings/keys.ts`)가 결정한다.
**실측:** `domain/seed/index.ts:38-76`이 시드한 `EVIDENCE_TYPE_CODES`가 이미 이 모양을
보여준다 — 예: `{ value: "tax_invoice", taxRule: { ruleKind: "vat_surcharge",
roundingUnit: 1, roundingMethod: "round", minWithholdingAmount: 0, basisDate:
"evidence_date" } }`. `ruleKind`는 `TAX_RULE_KIND_VALUES = ["none", "vat_surcharge",
"withholding", "company_borne"]`(`domain/code-tables/tax-rule.ts:11`) — ROADMAP Phase 4
기준 5가 요구하는 "세금 규칙 4종"과 정확히 일치한다.

**⚠️ 리포지토리 함수 없음:** `repositories/code-tables.ts`에는 `findCodeItemById(id)`만
있고(코드 78행), "table_key + value로 한 행 찾기" 함수가 없다(grep 확인 — `listCodeItems`는
scope 기반 목록만 반환). `applyTaxRule()`이 평문 증빙 종류 문자열(예: `"tax_invoice"`)로
규칙을 찾으려면 새 리포지토리 함수(`findCodeItemByTableKeyAndValue`)가 필요하다 —
`domain/settings/registry.ts:78-85`가 `getSettingValue`에서 `SYSTEM_VIEWER`로 권한 판정
없이 읽는 것과 같은 패턴(계산 입력은 domain 전역에서 자유롭게 읽는다)을 따르면 된다.

```typescript
// domain/settings/registry.ts:65-89 (getSettingValue 시그니처, 실측)
export async function getSettingValue<T>(
  def: SettingDef<T>,
  opts?: { asOf?: Date },       // 이력형 키에서만 쓰임, opts?.asOf ?? new Date()
  deps?: Partial<RegistryDeps>,
): Promise<T>
```
`applyTaxRule()`은 `basisDate` 종류(`payment_date`/`scheduled_payment_date`/
`evidence_date`/`document_date`)에 맞는 실제 날짜를 호출자가 결정해(EXP-15/Eng OV-5
규칙: 미지급 시 지급 예정일로 대체 등) `opts.asOf`로 넘겨야 한다 — 레지스트리 자체는
그 대체 규칙을 모른다(주석: "opts.asOf는 이력형 키에서만 쓰이고... 「어느 날짜를
넘길지」는 호출자의 책임").

**등록된 세율 키 전부(readBy: {phase: "4"}, `domain/settings/keys.ts` 실측):**

| 키 | kind | default | 용도 |
|---|---|---|---|
| `tax.vat.rate` | historized | 0.1 | 부가세율 |
| `tax.withholding.other_income.rate` | historized | 0.088 | 기타소득 원천징수율 |
| `tax.withholding.business_income.rate` | historized | 0.033 | 사업소득 원천징수율 |
| `tax.withholding.other_income.exempt_threshold` | historized | 125000 | 기타소득 면제 기준(지급액) |
| `tax.company_borne.rate` | historized | 0.088 | 회사 대납 세율 |
| `tax.company_borne.method` | historized | "flat" | flat / gross_up |
| `tax.basis_date.withholding` | simple | "payment_date" | 원천징수 기준일 종류 |
| `tax.basis_date.vat` | simple | "evidence_date" | 부가세 기준일 종류 |
| `tax.rounding.vat_unit` | simple | 1 | 부가세 절사 단위(원) |
| `tax.rounding.withholding_unit` | simple | 10 | 원천징수 절사 단위(원) |
| `tax.rounding.min_withholding` | simple | 0 | 최소 징수액(원) |

**FX·통화 키는 등록 0건**(grep 확인, `domain/settings/keys.ts` 전체 — D-54의 근거가
정확함). `getSettingValue`를 FX 기본값에 쓸 수 없다 — 새 `exchange_rates` 리포지토리를
만들어야 한다(D-54).

### Anti-Patterns to Avoid

- **코드표(`code_items`)를 상태 머신으로 쓰기:** `project_status`가 이미 그렇게
  시드되어 있는데(`domain/seed/index.ts:19-25`), 관리자가 화면에서 값을 자유롭게
  추가·삭제(MAST-04)할 수 있는 표에 `domain/rules.gate`가 하드코딩으로 의존하는 전이
  로직(수주중→진행 등)을 얹으면, 관리자가 실수로 상태값을 지우거나 순서를 바꿀 때
  게이트 로직이 깨진다. Open Questions §1 참고.
- **`Money` 산술을 domain/money 밖에서 "그냥 숫자로" 처리:** `money-boundary` 린트가
  타입 문자열 매칭이라 원시 `number`로 캐스팅해 계산하고 마지막에 `as Money`로
  브랜딩하면 린트를 우회한다 — 우회 자체는 기술적으로 가능하지만 이 페이즈의 목적
  (반올림 정본 하나)을 무너뜨린다. 리뷰에서 `as Money` 캐스팅 위치를 감사해야 한다.
- **`rowCount`로 UPDATE 성공 판정:** node-postgres/drizzle 조합에서 이 리포지토리는
  전부 `.returning()` + 배열 길이를 쓴다(grep 확인 — `rowCount` 사용처 0건). 새 코드가
  `rowCount`를 쓰면 관례에서 벗어나고, drizzle이 `UpdateResult`에서 그 필드를 어떻게
  채우는지 이 코드베이스가 검증한 적이 없다.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| 반올림·절사 | 파일마다 개별 `Math.round`/`toFixed` | `domain/money.round(단위, 방식)` 단일 함수 | ROADMAP 기준 5·D-53 — 정본이 하나가 아니면 인트라넷의 66줄 차익 불일치가 재현된다 |
| DTO 필드 노출 판정 | 화면마다 `if (role === ...)` 조건문 | `domain/permissions/project()` + `visible()` | ADMN-03 — 강제 지점이 화면이면 우회 경로가 생긴다 |
| 낙관적 잠금 재발명 | 커스텀 버전 컬럼 + 비교 로직 | `updatedAt` 조건부 UPDATE + `.returning()` | 이미 있는 패턴(Pattern 4). 새 컬럼 불필요(D-48) |
| 문서 번호 채번 | 애플리케이션 메모리 카운터·UUID 접두어 | `document_counters` 행 잠금 원자적 증가 | 여러 Cloud Run 인스턴스가 동시에 쓰기 때문에 프로세스 내 카운터는 근본적으로 안전하지 않다 |
| 그리드 접근성 키보드 처리 | 커스텀 이벤트 위임을 처음부터 설계 | ARIA grid 패턴(role="grid", 단일 tabbable 셀, roving tabindex 원리)을 참고해 직접 구현 | 라이브러리는 D-45가 기각했지만 **패턴**(경계 계산·포커스 이동 규칙)까지 새로 발명할 필요는 없다 [CITED: MDN ARIA grid pattern, react-roving-tabindex 문서] |

**Key insight:** 이 페이즈가 "hand-roll 하지 말라"고 하는 대상은 전부 **계산·판정
로직**(반올림, 노출, 락, 채번)이지 **UI 컴포넌트**(그리드 자체)가 아니다 — D-45의
논리와 정확히 대칭이다: 계약이 프로세스마다 다른 문제(그리드 상호작용)는 라이브러리가
오히려 계약을 흐리고, 계약이 이미 코드로 고정된 문제(반올림 정본)는 라이브러리가
필요 없이 함수 하나면 충분하다.

## Common Pitfalls

### Pitfall 1: `Money` 타입 이름에 접미사/접두어를 붙이면 린트가 무력화된다

**What goes wrong:** `MoneyKrw`, `KrwMoney`, `Amount_Money` 같은 이름을 쓰면
`money-boundary` 린트가 그 타입의 산술을 domain 밖에서도 통과시킨다.
**Why it happens:** `/\bMoney\b/` 정규식이 단어 경계로만 판정하고, 이런 이름은 "Money"가
다른 단어 문자와 붙어 있어 경계가 생기지 않는다(위 Pattern 2 상세).
**How to avoid:** 타입 이름은 정확히 `Money`(제네릭이면 `Money<Scale>`)만 쓴다. 코드
리뷰에서 `grep -rn "type.*Money" domain/ app/` 결과에 `Money` 단독 토큰이 아닌 식별자가
있으면 반려한다.
**Warning signs:** `pnpm typecheck`는 통과하는데 `domain/money` 밖에 `+`/`-`/`*`/`/` 산술이
있고 그 산술의 피연산자 타입 이름에 "Money"가 포함되어 있다면 즉시 의심.

### Pitfall 2: `document-counters.test.ts`의 export 고정 단언을 빠뜨리면 CI가 막힌다

**What goes wrong:** 원자적 증가 함수를 리포지토리에 추가했는데 기존 테스트를 안
고치면 `test/integration/document-counters.test.ts:41-42`가 실패한다.
**Why it happens:** 그 테스트가 "지금은 이 두 함수만 있다"를 의도적으로 고정한
가드였는데, Phase 4 작업이 정확히 그 가드를 깨는 변경이기 때문이다.
**How to avoid:** 원자적 증가 함수를 추가하는 커밋에 이 테스트 파일 수정을 함께
포함한다(예: 정확한 export 목록을 세 개로 갱신하거나, "부재 증명" 테스트 자체를
"동시 증가 증명" 테스트로 교체).
**Warning signs:** `pnpm test:integration` 로그에서 `document counters` describe 블록의
실패.

### Pitfall 3: `project_status` 코드표와 PROJ-04 상태 머신의 불일치

**What goes wrong:** Phase 3이 이미 시드한 `code_items(table_key='project_status')`의
값(`planning/in_progress/on_hold/done/cancelled`, `domain/seed/index.ts:19-25`)을 그대로
쓰면 D-41이 요구하는 4상태(수주중/진행/완료(정산)/미수주)와 이름·개수가 다르고, 상태
전이 게이트(`domain/rules.gate`)가 하드코딩할 규칙(수주중→진행, 수주중→미수주, 진행→완료,
미수주→진행)을 관리자가 화면에서 자유 편집 가능한 코드표에 의존시키면 항목 삭제 시
게이트가 깨진다.
**Why it happens:** MAST-04(코드표 관리 화면)와 PROJ-04(엄격한 유한 상태 머신)이 같은
저장소(`code_items`)를 가정했지만 요구 성격이 다르다(하나는 "관리자가 자유롭게",
다른 하나는 "정해진 넷만, 전이 규칙 고정").
**How to avoid:** 계획 단계에서 명시적으로 하나를 고른다 — (a) `projects.status`를
고정 값 집합의 `text` 컬럼(+ CHECK 제약 또는 zod enum)으로 두고 `project_status`
코드표는 폐기/무시, 또는 (b) `code_items`를 유지하되 전이 규칙은 `value` 문자열
자체가 아니라 별도 `project_status_transitions` 규칙표로 분리. (a)가 D-56의
`domain/rules.gate` 계약(고정 규칙 키)과 더 잘 맞는다.
**Warning signs:** 리뷰에서 "관리자가 코드표에서 '수주중'을 지우면 무슨 일이
일어나는가"를 물었을 때 답이 궁색하면 이 함정에 걸린 것.

### Pitfall 4: F1/F2를 UI 작업과 섞으면 D-59의 "별도 커밋" 요구가 깨진다

**What goes wrong:** F1(`Dockerfile` 런타임 스테이지가 `APP_ENV` 미설정)·F2
(`repositories/vendors.ts:47`의 `findVendorById`가 `archivedAt` 필터 없음)을 다른
UI 작업 커밋에 섞어 넣으면 회귀 테스트 추적이 어려워진다.
**실측 확인:**
- F1: `Dockerfile:39-44`(runtime 스테이지)는 `NODE_ENV`/`PORT`/`HOSTNAME`만 설정하고
  `APP_ENV`를 설정하지 않는다(`Dockerfile:33`의 build 스테이지 더미값과 대비). `lib/env.ts:85`의
  `if (data.APP_ENV !== "local")` 분기가 `APP_ENV` 미설정 시 zod 기본값 `"local"`
  (`lib/env.ts:47`)로 떨어져 `BETTER_AUTH_SECRET` 길이 검사(`lib/env.ts:90`)가 통째로
  스킵된다. 단, `scripts/deploy.sh:315,440`은 실제 배포 시 `APP_ENV=${ENV}`를 Cloud Run
  환경 변수로 명시 주입하므로 **실제 배포 경로는 이 결함의 영향을 받지 않는다** —
  결함은 "deploy.sh를 거치지 않고 이 이미지를 실행하는 모든 경로"(로컬 `docker run`,
  향후 다른 오케스트레이터)에 남는다.
- F2: `repositories/vendors.ts:47`의 `findVendorById`는 `where(eq(vendors.id, id))`
  하나뿐이라 보관된 거래처도 반환한다. 바로 아래 `findVendorsByNormalizedName`
  (`repositories/vendors.ts:55-59`)은 `isNull(vendors.archivedAt)`을 건다 —
  `revealAccountNumber`(`domain/vendors/index.ts:376`, `app/(app)/admin/vendors/actions.ts:67`)가
  `findVendorById`를 거치므로 보관된 거래처의 계좌번호도 마스킹 해제 대상이 된다.
**How to avoid:** D-59 그대로 — 둘 다 회귀 테스트와 함께 별도 커밋, UI 컴포넌트
작업보다 먼저.

### Pitfall 5: Playwright 클립보드 테스트는 HTTPS/localhost, Chromium 전용 API에 걸린다

**What goes wrong:** ⌘C/⌘V 범위 복사·붙여넣기 E2E를 `navigator.clipboard.readText()`로
직접 호출하는 테스트로 짜면 CI(Chromium, `http://127.0.0.1:3100`)에서는 동작하지만
`browserContext.grantPermissions(['clipboard-read', 'clipboard-write'])`를 페이지 로드
**이전에** 호출해야 하고, Firefox/WebKit 프로젝트가 있다면 이 API 자체가 없어 실패한다.
**Why it happens:** Clipboard API는 보안 컨텍스트(HTTPS 또는 localhost)에서만 동작하고
권한 부여도 브라우저별로 다르다.
**How to avoid:** `test/e2e`가 이미 Chromium 단일 프로젝트로 보인다(`playwright.config.ts`
상단 확인 필요 — 이 리서치에서는 mobile/desktop 두 프로젝트만 확인했고 둘 다
Chromium 계열로 추정, 계획 단계에서 재확인). E2E에서는 `paste` 이벤트를
`page.evaluate`로 직접 디스패치하거나(`ClipboardEvent` 생성자 + `clipboardData`)
`grantPermissions`를 `test.beforeEach`에서 호출하는 두 방법 중 하나를 선택한다.
[CITED: Playwright 클립보드 권한 이슈·가이드 — playwright.dev, GitHub issue #19888]

### Pitfall 6: `bigint` 컬럼에 `mode: "number"`를 빠뜨리면 pg가 문자열을 반환한다

**What goes wrong:** Drizzle에서 `bigint("amount")`만 쓰고 `{ mode: "number" }`를 빠뜨리면
node-postgres 드라이버가 `bigint`를 JS 문자열로 반환해(정밀도 보존을 위한 기본 동작)
`Money` 산술이 문자열 + 문자열 연결이 되어 버린다.
**How to avoid:** `db/schema/action-log.ts:19`(`bigint("seq", { mode: "number" })`),
`db/schema/auth.ts:85`(`bigint("last_request", { mode: "number" })`) 선례를 그대로 따라
모든 `Money` 저장 컬럼에 `{ mode: "number" }`를 명시한다. D-53이 이미 "100억 원도
안전 정수 범위 안"이라고 명시했으므로(1e10 « 2^53) 정밀도 손실 걱정 없이 `number`
모드를 쓸 수 있다.

## Code Examples

### 문서 번호 서식 조립 (D-51·D-52, 설정 키 → 표시 문자열)

```typescript
// domain/document-numbers/format.ts (신규) — 설정 키 한 줄(D-52)에서 서식을 읽어
// 순번을 자릿수만큼 0-패딩하고 조립한다. 실제 값 예시는 docs/inputs/phase-04-project-quote.md
// §5(실측)에서: 프로젝트 "26001"(연도 끝 두 자리 + 4자리 순번), 지출결의
// "26001-0001"(프로젝트 번호 + 전사 순번 4자리).
export type DocumentNumberFormat = {
  prefix: string;          // 예: "" (프로젝트는 연도 두 자리 자체가 prefix 역할)
  yearDigits: 2 | 4;
  separator: string;       // 예: "-"
  sequenceDigits: number;  // 예: 4
  scope: "global" | "per_project";
};

export function formatDocumentNumber(
  fmt: DocumentNumberFormat,
  year: number,
  sequence: number,
  projectPrefix?: string,
): string {
  const yearPart = String(year).slice(-fmt.yearDigits);
  const seqPart = String(sequence).padStart(fmt.sequenceDigits, "0");
  const base = fmt.scope === "per_project" && projectPrefix ? `${projectPrefix}${fmt.separator}` : "";
  return `${base}${fmt.prefix}${yearPart}${fmt.scope === "global" ? seqPart : seqPart}`;
}
```
(위는 뼈대 예시 — 실제 서식 규칙은 설정 레지스트리에 `SettingDef<DocumentNumberFormat>`
형태 이력형/단순형 키로 등록해야 하고, ADMN-09가 요구하는 "접두어·연도·순번 자릿수·
구분자·순번 범위"를 zod 스키마로 그대로 반영한다.)

### `grossFromTotal()` — 합계에서 공급가액 역산 (PROJ-03, EXP-09와 공유)

```typescript
// domain/money/index.ts (신규) — 반올림은 이 함수 안에서만.
// 통장에 실제 오간 금액(부가세 포함 합계)에서 공급가액을 역산한다.
export function grossFromTotal(
  total: Money,
  vatRate: number,       // getSettingValue(TAX_VAT_RATE, { asOf }) 결과
  roundingUnit: 1 | 10,
  roundingMethod: "truncate" | "round" | "ceil",
): { supply: Money; vat: Money; diff: Money } {
  // supply = total / (1 + vatRate), 반올림은 round() 한 곳에서만
  // (구현 세부는 Claude's Discretion — 계약은 "합계 = 역산된 공급가 + 부가세"가
  // round() 이후에도 성립해야 한다는 것, splitWithRemainder()와 같은 보정 원리)
  throw new Error("스텁 — 실제 구현은 계획/실행 단계");
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| PROJECT.md 원안 "설정의 통화별 최근 환율" | `exchange_rates` 독립 표 | D-54, 2026-09-21 | ROADMAP 문구 자체를 이 결정에 맞게 고쳐야 함(이미 반영 확인 — `.planning/ROADMAP.md` Phase 4 섹션이 D-54를 인용) |
| PROJECT.md "수주 실패 비용" | "미수주 비용"(PNL-07) | D-41, 2026-09-21 | REQUIREMENTS.md·ROADMAP 모두 반영 완료(실측 확인) |

**Deprecated/outdated:** 해당 없음(이 페이즈는 그린필드 신규 테이블·모듈이 대부분).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Playwright E2E 프로젝트가 전부 Chromium 계열이라 `grantPermissions(['clipboard-read','clipboard-write'])`가 전 프로젝트에서 동작한다 | Common Pitfalls §5 | Firefox/WebKit 프로젝트가 있다면 클립보드 E2E가 그 프로젝트에서 실패 — `playwright.config.ts`의 `projects` 배열 전체를 계획 단계에서 재확인 필요 |
| A2 | `Money` 제네릭(`Money<Scale>`)을 쓰면 TypeScript checker의 `typeToString`이 항상 `"Money<...>"` 형태로 출력해 `\bMoney\b`가 매칭한다 | Pattern 2 | 제네릭 인스턴스화 방식(리터럴 vs 유니언)에 따라 TS가 타입을 구조적으로 펼쳐 출력할 가능성이 이론상 있음 — 실제 구현 직후 `pnpm lint`로 반드시 검증 |
| A3 | ARIA grid 패턴(role="grid" + roving tabindex)이 SYSTEM.md §7-3의 시각 계약(고정 오류 셀, 외화 2행)과 마찰 없이 결합된다 | Don't Hand-Roll | 실제 구현 중 role="grid"의 접근성 트리 요구(각 셀이 `gridcell` role)가 두 줄 셀(외화 병기) 렌더링과 충돌할 가능성 — axe-core 검사(02-07 선례)로 조기 발견 필요 |
| A4 | `document_counters` 원자적 증가에 `SELECT ... FOR UPDATE`가 아니라 단순 `UPDATE ... RETURNING`만으로 충분하다(Postgres 행 잠금 자동) | Pattern 3 | 표준 Postgres MVCC 동작이라 위험 낮음, 그러나 이 코드베이스에 선례가 전혀 없어(grep 0건) 동시 제출 통합 테스트로 반드시 실증해야 함 |

**해석 참고:** 이 페이즈 리서치의 핵심 발견(money-boundary 정규식 함정, document-counters
테스트 방화벽, project_status 코드표 충돌)은 전부 파일을 직접 읽어 확인한 `[VERIFIED:
file:line]`이다. `[ASSUMED]`는 위 4건뿐이며 전부 "구현 직후 자동 검사로 즉시 검증
가능한" 종류다 — 사용자 확인이 필요한 정책·비즈니스 판단이 아니라 기술적 재확인 항목.

## Open Questions

1. **`project_status` 코드표를 상태 머신으로 쓸 것인가, 폐기할 것인가?**
   - What we know: Phase 3이 이미 `code_items(table_key='project_status')`를
     `planning/in_progress/on_hold/done/cancelled`로 시드했다(`domain/seed/index.ts:19-25`).
     D-41은 4상태(수주중/진행/완료(정산)/미수주)를 요구하고 `domain/rules.gate`가
     전이 규칙을 강제해야 한다(D-56).
   - What's unclear: MAST-04("코드표를 관리 화면에서 추가·수정·비활성화")가 프로젝트
     상태에도 적용되어야 하는지, 아니면 상태 머신은 코드가 소유하는 고정 열거형이어야
     하는지 요구사항 문서가 명시하지 않는다.
   - Recommendation: 상태는 `projects.status`를 `text` + zod enum(4값)으로 두고
     `project_status` 코드표는 이 페이즈에서 시드 삭제 또는 무시(마이그레이션으로
     행 삭제는 하지 않되 참조하지 않음)한다. `domain/rules.gate`의 전이 규칙이
     하드코딩 값과 정확히 대응해야 하기 때문에 자유 편집 코드표와 결합하면 안전성이
     떨어진다. 계획 단계에서 사용자/CEO 리뷰로 확정 필요.

2. **Excel 그리드의 클립보드 구현이 `navigator.clipboard.read/write`(비동기, 권한 필요)인가
   `copy`/`paste` DOM 이벤트(동기, 권한 불필요)인가?**
   - What we know: SYSTEM.md §7-3은 "⌘C/⌘V 범위 복사·붙여넣기"만 요구하고 구현 방식은
     Claude's Discretion이다. `paste` 이벤트는 브라우저 권한 프롬프트 없이 동작하고
     Playwright에서 `dispatchEvent`로 시뮬레이션하기 쉽다. `navigator.clipboard` API는
     비동기·권한 기반이라 더 "정확"하지만 테스트·크로스 브라우저 복잡도가 높다.
   - What's unclear: 붙여넣기 범위가 표를 넘으면 "새 줄 자동" 요구(§7-3)를 `paste`
     이벤트의 `clipboardData.getData('text/plain')`으로 TSV 파싱하면 충분히 구현
     가능한지 실제 구현 전엔 확정 못함.
   - Recommendation: `paste` DOM 이벤트 + `clipboardData.getData("text/plain")` TSV 파싱을
     기본으로 채택(권한 프롬프트 없음, E2E 재현 쉬움). 복사(`⌘C`)는 `copy` 이벤트의
     `clipboardData.setData("text/plain", tsv)` + `event.preventDefault()`로 대응.

3. **`scripts/migrate/extract.ts`·`transform.ts`가 `scripts/build-cli.mjs`의 4개 CLI
   엔트리포인트 목록(`migrate-runner`·`seed-master`·`account-cli`·`db-bootstrap`)에
   포함되어야 하는가?**
   - What we know: 이 4개만 Cloud Run Job으로 배포되는 번들이다
     (`scripts/build-cli.mjs:8-13` 실측). D-57은 "사용자가 덤프를 지금 준비하고 계획에
     `extract`를 온전히 넣어 실데이터로 돌린다"고만 적었다.
   - What's unclear: extract·transform이 배포 환경에서 정기 실행되어야 하는지(예:
     리허설 자동화), 아니면 로컬 1회성 운영자 스크립트(`scripts/settings-import.ts`,
     `scripts/rotate-key.ts`와 같은 결)로 충분한지.
   - Recommendation: `scripts/settings-import.ts` 패턴(로컬 tsx 전용, CLI 번들에 넣지
     않음)을 기본으로 채택 — 적재(load)·리허설 자동화는 Phase 8 몫이고 이 페이즈는
     "픽스처 생성"이 목적이라 배포 번들에 넣을 이유가 약하다. 리허설 반복이 이
     페이즈 안에서 필요해지면 재검토.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL(로컬 `pnpm db:dev`) | 통합 테스트, `document_counters` 원자적 증가 검증 | ✓(Phase 1부터 확립) | — | — |
| Node.js | 전체 런타임 | ✓ | 24(Dockerfile `node:24-slim`) [VERIFIED: Dockerfile:9] | — |
| pnpm | 패키지 매니저 | ✓ | 10.33.0 [VERIFIED: Dockerfile:10] | — |
| Chromium(Playwright) | E2E 클립보드·키보드 그리드 테스트 | ✓(클라우드 세션 사전 설치 경로 확인됨) | — [VERIFIED: playwright.config.ts 26-38] | — |

**Missing dependencies with no fallback:** 없음 — 이 페이즈는 Phase 1이 이미 확립한
로컬/CI 인프라만 재사용한다.

**Missing dependencies with fallback:** 없음.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3계열(project 분리: unit/integration) + Playwright(e2e) [VERIFIED: vitest.config.ts, playwright.config.ts] |
| Config file | `vitest.config.ts`(unit/integration project), `playwright.config.ts`(e2e) |
| Quick run command | `pnpm test:unit` |
| Full suite command | `pnpm test`(unit → integration → e2e 순차, `package.json` script) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROJ-01 | 프로젝트 번호 원자적 증가, 동시 제출 중복 없음 | integration | `vitest run --project integration -t "document counter"` | ❌ Wave 0(신규 concurrency 테스트) |
| PROJ-02 | 견적가·실행가 입력 시 차익 서버 계산, 브라우저 값 미저장 | unit(`domain/quote-lines`) + integration | `vitest run --project unit -t "quote-lines"` | ❌ Wave 0 |
| PROJ-03 | 계약금액→부가세·합계 서버 계산, 입금액→공급가 역산 | unit(`domain/money.grossFromTotal`) | `vitest run --project unit -t "grossFromTotal"` | ❌ Wave 0 |
| PROJ-04 | 상태 전이 게이트(수주중→진행 등) 허용/차단 | unit(`domain/rules.gate`) | `vitest run --project unit -t "rules.gate"` | ❌ Wave 0 |
| PROJ-07 | 고객 승인 전 지출결의 버튼 비활성(게이트 경유) | integration + e2e | `vitest run --project integration -t "quote approval gate"` | ❌ Wave 0 |
| UX-05 | 키보드만으로 견적 줄 입력(Tab/Enter/방향키/복붙/Esc) | e2e(Playwright) | `playwright test test/e2e/quote-grid-keyboard.spec.ts` | ❌ Wave 0 |
| FX-01 | 통화 선택 시 `exchange_rates` 최신 행이 기본값으로 채워짐 | integration | `vitest run --project integration -t "exchange rate default"` | ❌ Wave 0 |
| RSV-01 | 리저브 대장 입금·출금·잔액 계산, 음수 잔액 DB 제약 거부 | integration | `vitest run --project integration -t "reserve ledger"` | ❌ Wave 0 |
| ADMN-09 | 문서 번호 서식 설정 키 등록·읽힘(`registry-coverage` 확장) | unit(`test/unit/settings/registry-coverage.test.ts`) | `vitest run --project unit -t "registry-coverage"` | ✅(기존 테스트가 새 키를 자동으로 검사) |

### Sampling Rate

- **Per task commit:** `pnpm test:unit` (money·gate·grid 순수 로직은 DB 없이 여기서 대부분 잡힌다)
- **Per wave merge:** `pnpm test` (전체: unit → integration → e2e)
- **Phase gate:** `pnpm test` 전체 그린 후 `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `domain/money/index.test.ts` — round/toKrw/splitWithRemainder/grossFromTotal/applyTaxRule 단위 테스트(세금 규칙 4종 × 절사 표 기반)
- [ ] `domain/rules/gate.test.ts` — 게이트 4개 규칙(수주중 면제, 승인 전 잠금, 완료 프로젝트 잠금, legacy 면제 자리) 단위 테스트
- [ ] `test/integration/document-counters.test.ts` 갱신 — export 고정 단언을 새 계약으로 교체 + 동시 증가 통합 테스트 추가(Pattern 3)
- [ ] `test/integration/quote-lines-conflict.test.ts` — D-48 조건부 UPDATE 충돌 감지(신규)
- [ ] `test/e2e/quote-grid-keyboard.spec.ts` — Tab/Enter/방향키/⌘C·V/Esc/⌘S 키보드 전용 시나리오(신규)
- [ ] `test/unit/settings/registry-coverage.test.ts`는 기존 파일 그대로 작동 — 새 문서 번호 서식 키를 `domain/settings/keys.ts`에 등록하면 자동으로 커버됨(추가 작업 불필요, 확인만)

## Security Domain

### Applicable ASVS Categories (Level 1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | no(변경 없음) | 기존 better-auth 세션 재사용 |
| V3 Session Management | no(변경 없음) | — |
| V4 Access Control | yes | `scopeFor(viewer)` 행 필터 + `project()` DTO 투영(기존 패턴 재사용) — 프로젝트·견적·리저브 전부 이 경로를 거쳐야 함 |
| V5 Input Validation | yes | zod 스키마(next-safe-action `.schema()`) — 그리드 일괄 저장 페이로드도 배열 전체를 zod로 검증 후 트랜잭션 진입 |
| V6 Cryptography | no(신규 암호화 대상 없음) | — |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| 문서 번호 경쟁(같은 번호 중복 발급) | Tampering | `UPDATE...RETURNING` 행 잠금(Pattern 3) + `UNIQUE(format_key, number)` 이중 방어 |
| 그리드 일괄 저장 시 IDOR(다른 프로젝트의 견적 줄 id를 페이로드에 끼워 넣기) | Tampering / Elevation of Privilege | 도메인 함수가 각 행 UPDATE 전에 해당 견적 줄이 요청자가 `scopeFor`로 접근 가능한 프로젝트 소속인지 재확인 — 클라이언트가 보낸 id를 그대로 믿지 않는다 |
| 상태 전이 우회(클라이언트가 `status=완료`를 직접 PATCH) | Tampering | `domain/rules.gate` 단일 진입점 — Server Action이 이 게이트를 거치지 않고 직접 `repositories.updateProjectStatus`를 부르면 안 됨(코드 리뷰 체크리스트 항목) |
| 리저브 대장 정보 노출(기획본부가 API 응답에서 리저브 필드를 봄) | Information Disclosure | `visible()` 등록(리저브를 정보 노출표 새 항목으로, 기획본부 기본 숨김) — `registerDto`에 반드시 등록해 누수 스캔이 포함하게 함 |
| 환율 입력 남용(비관리자가 아무 값이나 입력해 손익 조작) | Tampering | `exchange_rates` 쓰기는 `admin.settings` 게이트가 아니라 견적/지출 쓰기 권한(`scopeFor`)에 걸리되, **행동 로그에 반드시 기록**(누가 언제 어느 환율을 입력했는지 추적 가능해야 사후 감사가 가능) — CONTEXT.md D-54가 이미 이 트레이드오프를 명시적으로 선택함 |

## Sources

### Primary (HIGH confidence — 이 세션에서 직접 Read/Grep으로 확인)

- `eslint/rules/money-boundary.mjs` — MONEY_TYPE_PATTERN 정규식·exempt 경로 전문
- `test/unit/eslint-rules/money-boundary.test.ts` + `test/unit/eslint-rules/fixtures/money.ts` — Money 타입 실제 선언 형태
- `db/schema/document-counters.ts`, `repositories/document-counters.ts`, `test/integration/document-counters.test.ts` — 카운터 표·리포지토리·방화벽 테스트
- `domain/settings/registry.ts`, `domain/settings/keys.ts` — 설정 레지스트리 계약·세율 키 12종
- `domain/code-tables/tax-rule.ts`, `domain/seed/index.ts` — 세금 규칙 스키마·시드 값(project_status 포함)
- `repositories/vendors.ts`, `domain/vendors/index.ts`, `domain/permissions/project.ts`, `domain/permissions/dto-registry.ts` — DTO 투영·마스킹·F2 결함 확인
- `Dockerfile`, `lib/env.ts`, `scripts/deploy.sh` — F1 결함 확인(런타임 스테이지 vs 배포 스크립트)
- `.squawk.toml`, `db/migrations/*.sql` — lock_timeout 전문(9개 파일 전부), 예외 규칙 4개 근거
- `vitest.config.ts`, `playwright.config.ts`, `package.json` — 테스트 계층·명령어·CI 전용 프로덕션 빌드 분기
- `scripts/build-cli.mjs`, `scripts/settings-import.ts`, `scripts/seed-master.ts`, `scripts/migrate-runner.ts` — CLI 번들 4종 vs 로컬 운영자 스크립트 구분
- `eslint/rules/no-row-type-escape.mjs`, `eslint.config.mjs` — 4계층 경계·Row 타입 반환 금지 규칙

### Secondary (MEDIUM confidence — 공식 문서/이슈 트래커, 이 세션에서 웹 조사)

- Playwright 공식 이슈 #19888("Unknown permission: clipboard-read") — 브라우저별 클립보드 권한 차이
- ARIA grid 패턴(단일 tabbable 셀, roving tabindex 원리) — 여러 접근성 가이드가 일관되게 설명

### Tertiary (LOW confidence)

- 없음 — 이 리서치는 웹 검색을 클립보드 E2E·grid a11y 패턴 두 항목에만 썼고 둘 다 공식/신뢰 가능한 출처로 교차 확인됨.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 새 의존성이 없어 버전 확인만으로 완결
- Architecture: HIGH — 4계층 경계·DTO 투영·트랜잭션 패턴 전부 기존 코드에서 실측
- Pitfalls: HIGH — money-boundary 정규식 함정과 document-counters 테스트 방화벽은 소스 코드를 직접 실행 가능한 논리로 검증(정규식 word-boundary 수동 추적)
- 미해결 항목: MEDIUM — project_status 코드표 충돌은 사용자/CEO 판단이 필요한 설계 선택지 제시로 남김(Open Questions §1)

**Research date:** 2026-09-21
**Valid until:** 이 페이즈 계획·실행 기간 내 유효(30일) — `domain/settings/keys.ts`·
`eslint/rules/*.mjs`가 이 세션 이후 바뀌면 재검증 필요.
