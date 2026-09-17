# Architecture Research

**Domain:** config-driven internal business system (project / expense-approval / P&L / leave / evidence), 10–30 users, single non-developer maintainer + Claude Code
**Researched:** 2026-09-17
**Confidence:** HIGH (표준 패턴 조합, 세 번 실패한 전임 프로젝트의 반례가 명확함)

## Standard Architecture

### System Overview

이 규모(동시 사용자 수십 명, 표 10~20개면 충분한 도메인)에서 정답은 "레이어가 적은 모놀리스"다. 260907/260807의 실패는 기능 부족이 아니라 **레이어·표·화면이 너무 많아 한 사람이 규율을 지킬 수 없었던 것**이므로, 이 리서치는 의도적으로 레이어 수를 최소화한다.

```
┌───────────────────────────────────────────────────────────────────┐
│  Browser (React, thin) — 서버가 준 데이터를 그리기만 한다            │
└───────────────────────────────────┬─────────────────────────────────┘
                                     │ HTTPS (session cookie)
┌────────────────────────────────────▼────────────────────────────────┐
│  Cloud Run: single Node/TS service                                  │
│  ┌───────────┐  routes/ (thin HTTP handlers, no business logic)     │
│  │  routes   │──┐                                                   │
│  └───────────┘  │                                                   │
│  ┌───────────┐  ▼  ┌─────────────┐  ┌─────────────┐                │
│  │  authz    │◄─┼──│  domain/*   │──│ notifications│               │
│  │ (can/scope│  │  │ services    │  │ (scheduler   │               │
│  │  /field)  │  │  │ (projects,  │  │  endpoint)   │               │
│  └───────────┘  │  │ quotes,     │  └──────┬──────┘                │
│  ┌───────────┐  │  │ expenses,   │         │                        │
│  │ settings  │◄─┼──│ approvals,  │         │                        │
│  │ registry  │  │  │ pnl, ...)   │         │                        │
│  └───────────┘  │  └──────┬──────┘         │                        │
│  ┌───────────┐  │         ▼                ▼                        │
│  │  audit    │◄─┴──  repositories/ (모든 SQL은 여기로만)             │
│  └───────────┘         │                                            │
└─────────────────────────┼────────────────────────────────────────────┘
                           │ pg (single pool)
              ┌────────────▼───────────┐   ┌───────────────┐  ┌──────────────┐
              │  Cloud SQL / Postgres  │   │  GCS (evidence)│  │ Secret Mgr   │
              └────────────────────────┘   └───────────────┘  └──────────────┘
                           ▲
                           │ HTTP (인증 헤더/토큰)
                  ┌────────┴────────┐
                  │ Cloud Scheduler │  (알림 계산 트리거, 큐 없음)
                  └─────────────────┘
```

핵심 원칙: **API 서버는 하나, DB는 하나, 백그라운드 실행기는 없다.** 알림도 큐가 아니라 "Cloud Scheduler가 5~15분마다 같은 API를 두드리는" 방식으로 처리한다. 이렇게 하면 실행 경로가 하나뿐이라 디버깅이 "코드 읽기"로 끝난다.

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|-----------------|-------------------------|
| `routes/` | HTTP 요청을 받아 세션을 읽고, `authz`로 1차 차단하고, `domain/*` 서비스를 호출해 응답만 만든다. 비즈니스 로직·SQL 없음 | Express/Hono 라우터, zod로 입력 검증 |
| `authz/` | 계급×메뉴×동작 권한 판정(`can()`), 계급×정보항목 노출 판정(`visible()`), 팀 스코프 필터(`scopeFor(viewer)`) — 단일 진입점 | 순수 함수 모듈, DB 조회는 캐시된 permission map |
| `settings/` | 설정 키 레지스트리(타입·기본값·그룹), 값 읽기/쓰기, 날짜효력 조회, JSON export/import | 코드의 typed registry + DB의 값 저장 표 |
| `domain/*` | 업무 로직 한 곳(프로젝트·견적·지출결의·승인·카드·손익·목표·연차·거래처). 트랜잭션 경계가 여기 | TS 서비스 함수, 트랜잭션은 `withTx()` 헬퍼 |
| `repositories/` | 모든 SQL이 사는 유일한 곳. 스코프 필터가 여기서 항상 적용됨 | `pg` + SQL 문자열(파라미터 바인딩), ORM 없음 |
| `notifications/` | 규칙 평가(마감 임박 등), 중복 방지 로그, 인앱함·이메일 발송 | Cloud Scheduler → `/internal/notify-tick` HTTP 핸들러 |
| `files/` | GCS 서명 URL 발급, 메타데이터 저장, PII 필드 앱단 암호화 | `@google-cloud/storage`, KMS 또는 env 키 |
| `audit/` | 모든 쓰기 작업의 변경 이력(누가·언제·무엇을) | 제네릭 `audit_log` 표 + repository 훅 |
| `db/migrations/` | 스키마 변경 이력, 배포 시 자동 실행 | SQL 파일 + 간단한 러너(node-pg-migrate 등) |
| `app/` (프론트) | 서버가 준 것을 그린다. 권한·노출 판단은 서버 응답을 신뢰하되, 화면은 UX상 숨김만 함 | React, API 응답 그대로 렌더 |

## Recommended Project Structure

```
/
├── db/
│   ├── migrations/            # 0001_..sql, 0002_..sql — 순서대로 실행, 되돌리기는 새 마이그레이션으로
│   └── seed/                  # 계급 5종, 메뉴, 코드표 기본값 (idempotent upsert)
├── server/
│   ├── src/
│   │   ├── routes/            # 얇은 HTTP 핸들러. 도메인 서비스만 호출
│   │   ├── authz/             # can(), visible(), scopeFor() — 권한의 유일한 진입점
│   │   ├── settings/          # registry.ts(타입 정의) + service.ts(읽기/쓰기/날짜효력)
│   │   ├── domain/
│   │   │   ├── people/        # 직원·계급·팀
│   │   │   ├── projects/
│   │   │   ├── quotes/        # 견적 줄
│   │   │   ├── expenses/      # 지출결의
│   │   │   ├── approvals/     # 결재 상태기계 — expenses·leave가 공유
│   │   │   ├── cards/         # 법인카드 사용
│   │   │   ├── evidence/      # 증빙 첨부 연결
│   │   │   ├── pnl/           # 손익 계산 + 드릴다운
│   │   │   ├── targets/       # 연간 목표·인센티브
│   │   │   ├── leave/         # 연차
│   │   │   ├── vendors/       # 거래처·클라이언트
│   │   │   ├── confirmations/ # 기타소득 확인증 (외부 링크)
│   │   │   └── custom-fields/ # 필드 정의 레지스트리 + JSONB 검증
│   │   ├── notifications/     # 규칙 평가, dedupe, 발송
│   │   ├── files/             # GCS 클라이언트, 서명 URL, 암호화 헬퍼
│   │   ├── db/                 # pg pool, repository 공통 헬퍼(withTx 등)
│   │   ├── audit/             # audit_log 기록기
│   │   └── auth/              # 세션, 비밀번호, CSRF, rate limit
│   └── test/                  # 각 domain 옆이 아니라 여기 집중 — TDD 우선순위 명확화
├── app/
│   └── src/
│       ├── pages/             # 화면 단위 (인트라넷 대체 4 + 손익/목표/연차/설정 등)
│       ├── components/
│       └── admin/             # 설정/권한/노출표/커스텀필드 — 레지스트리에서 자동 생성
├── scripts/
│   ├── migrate-intranet/      # 일회 이전: extract.ts → transform.ts → load.ts → verify.ts
│   └── deploy.sh              # 프로젝트ID·리전 파라미터화된 단일 배포 스크립트
└── docs/
```

### Structure Rationale

- **`repositories/`를 domain 서비스와 분리한다:** SQL이 한 곳에만 있어야 "스코프 필터를 빼먹은 새 쿼리"가 생기지 않는다. 260907의 미결 54건 중 다수가 "설정을 서버가 안 읽는다"는 종류였다 — 진입점을 하나로 줄이면 이런 누락을 검사 하나(코드 검색)로 막을 수 있다.
- **`approvals/`를 `expenses/`·`leave/`가 공유한다:** 지출결의 결재와 연차 결재는 둘 다 "N단계, 계급별 담당, 빈 자리 건너뜀"이라는 같은 상태기계다. 워크플로 엔진을 만들지 않되, 이 하나의 도메인 모듈은 재사용한다.
- **`admin/` 화면은 손으로 하나씩 만들지 않는다:** `settings/registry.ts`, `custom-fields` 정의, 권한표가 이미 데이터이므로 화면은 그 데이터를 읽어 렌더링하는 제네릭 컴포넌트 하나로 충분하다. 이것이 "코드 수정 없는 운영" 요구의 실제 구현 지점이다.
- **`test/`를 server 최상위에 둔다:** 계급×메뉴×동작, 설정 키 강제, 손익 드릴다운 같은 교차 도메인 검증이 많다. domain 폴더별로 쪼개면 "이 조합이 맞는지" 보는 테스트가 흩어진다.

## Architectural Patterns

### 1. Authorization: rank × menu × action + rank × information-item + team scope

**What:** 세 가지 별개의 권한 축을 하나의 `authz/` 모듈로 모은다.

1. **메뉴 권한** — `positions` × `menus` × `action(view/write/approve)` 표. 라우트 진입 시 1차 차단.
2. **정보 노출** — `positions` × `info_items`(손익 숫자, 팀 비용, 목표, 인센티브, 거래처 금액 등) 표. **응답 직렬화 시점**에 필드/섹션을 제거.
3. **행 스코프** — 팀장은 자기 팀만, 대표·경영관리는 전체. **repository 쿼리 시점**에 WHERE 조건으로 강제.

**Where to enforce (핵심 결정):** 세 곳 모두에 걸치되, **최종 방어선은 repository 레이어**다.
- **라우트 레이어**: `can(viewer, menu, action)` 통과 못 하면 404/403. UX 목적(빠른 차단)이지 유일한 방어선이 아니다.
- **repository 레이어**: 모든 조회 함수는 `viewer` 컨텍스트를 필수 인자로 받고, 내부에서 `scopeFor(viewer)`가 만든 WHERE 절을 **항상** 붙인다. `viewer` 없이 호출하는 repository 함수를 아예 만들지 않는다(타입 시그니처로 강제). 새 화면·API를 추가할 때 권한 체크를 깜빡해도 데이터가 새지 않는다 — 이것이 260807/260907이 못 지킨 지점("정한 것을 지키는 장치가 없어")이다.
- **응답 직렬화 레이어**: `visible(viewer, infoItem)`이 false면 필드 자체를 응답 객체에서 삭제(값을 `null`로 두지 않는다 — 프론트가 실수로 노출할 수 있음). 손익·팀비용·목표·인센티브처럼 "같은 화면인데 계급별로 숫자가 빠지는" 요구에 정확히 맞는다.

**Postgres RLS는 기본으로 쓰지 않는다.** RLS(`CREATE POLICY`)는 "DB가 자동으로 필터링해 앱 버그가 유출로 안 이어진다"는 장점이 있지만, 세션 변수(`SET app.viewer_id`)를 커넥션 풀에서 매 요청 관리해야 하고, 정책 디버깅에 SQL 실행계획 이해가 필요해 비개발자 1인 유지보수와 맞지 않는다. 대신 "모든 SQL이 repository 한 곳에만 있고, 그 함수들이 예외 없이 스코프를 강제한다"는 **아키텍처 규율**로 같은 효과를 얻는다 — 코드가 적고(표 10~20개) 사람이 한 명이라 이 규율이 실제로 지켜질 수 있는 규모다. 예외: 확인증(주민등록번호) 표처럼 유출 시 피해가 큰 단일 표에 한해 RLS를 추가 방어선으로 얹는 것은 검토할 만하다(정책 1~2개로 단순하게).

**Trade-off:**
| 방식 | 장점 | 단점 |
|---|---|---|
| App-layer repository 강제 (권장) | 테스트하기 쉬움(순수 함수 `scopeFor`), 디버깅이 TS 스택트레이스로 끝남, 비개발자가 읽을 수 있음 | 규율이 깨지면(새 raw query) 방어 안 됨 → lint 규칙으로 "repositories/ 밖 SQL 금지"를 강제 |
| Postgres RLS | 앱 버그와 무관하게 DB가 막음 | 세션 변수 관리 복잡, 정책 디버깅 어려움, 비개발자에게 안 보임 |

**Example (repository 레이어 강제):**
```typescript
// repositories/projects.ts
export async function listProjects(viewer: Viewer, filter: ProjectFilter) {
  const scope = scopeFor(viewer, 'projects'); // { where: 'team_id = $1', params: [viewer.teamId] } | { where: '1=1', params: [] }
  return db.query(
    `SELECT * FROM projects WHERE ${scope.where} AND ...`,
    [...scope.params, ...]
  );
}
```
```typescript
// authz/visible.ts — 응답 직렬화 시점에 정보 노출표 적용
export function redactPnl(viewer: Viewer, row: ProjectPnlRow): Partial<ProjectPnlRow> {
  if (!visible(viewer, 'pnl_profit')) delete (row as any).profit;
  if (!visible(viewer, 'team_cost')) delete (row as any).teamOverhead;
  return row;
}
```

**Testability:** `can()`, `visible()`, `scopeFor()`는 순수 함수라 계급×메뉴×동작 조합 표를 그대로 테스트 케이스로 돌릴 수 있다(테이블 기반 테스트 — 실제 표 데이터를 fixture로 씀).

---

### 2. Configurable approval workflow: table-driven state machine

**What:** N단계, 계급별 담당, 빈 자리 건너뜀, 업무유형별 경로를 **표 구조**로 표현하고, "다음 상태"는 코드 한 함수가 판정한다. 워크플로 엔진(BPMN 등)을 도입하지 않는다.

**스키마 (개념):**
```sql
approval_routes(id, business_type, name, active)          -- 업무유형별 경로 정의(예: 지출결의 기본, 연차)
approval_route_steps(route_id, step_order, required_position_id, skip_if_absent)
approval_instances(id, business_type, entity_id, route_id, status, current_step_order)
approval_actions(instance_id, step_order, actor_id, action, comment, acted_at)  -- 감사 이력
```
`status`: `draft | submitted | in_review | approved | rejected | withdrawn`. 상태 전이는 표(허용된 (현재상태, action) → 다음상태) 하나로 코드에 박아둔다 — 이것 자체는 설정 화면 대상이 아니다(상태 이름·전이는 업무 자체의 불변식이므로). **바뀌는 것은 단계 수·담당 계급뿐**이며 그것이 `approval_route_steps`다.

**빈 자리 건너뜀:** `submitted` 시점에 route의 step들을 순회하며 `required_position_id`를 가진 사람이 0명이면 그 step을 스킵하고 `current_step_order`를 다음으로 미리 이동시킨다(승인 시점이 아니라 제출 시점에 유효 경로를 미리 계산해 `approval_instances`에 "이번 건의 실제 단계 목록"을 굳혀 저장 — 담당자가 중간에 바뀌어도 이미 진행 중인 건의 경로가 흔들리지 않는다).

**Why table-driven, not a workflow engine:** BPMN/상태기계 라이브러리는 "조건부 분기·병렬·타이머"까지 표현하려다 추상화 비용이 커진다. 이 시스템은 "순서대로 N명이 승인/반려"뿐이므로, 표 3개 + 함수 하나(`nextStep()`, `canAct()`)로 충분하고, 비개발자가 SQL을 보고 무슨 일이 있었는지 바로 읽을 수 있다.

**Trade-off:** 업무유형이 늘어 분기가 복잡해지면(예: 금액에 따라 경로가 갈림) 이 패턴은 `approval_routes`를 금액 구간별로 여러 개 두는 식으로 버틸 수 있지만, "조건 자체가 설정 가능해야" 하면 규칙 엔진이 필요해진다 — 이 프로젝트 범위에서는 발생하지 않는다(범위에 없음, out of scope 확인됨).

---

### 3. Settings registry

**What:** 설정 키 하나의 **원본은 코드의 typed registry**이고, **값은 DB**에 저장한다. 관리 화면은 registry를 읽어 자동 생성한다.

```typescript
// settings/registry.ts — 이 파일이 유일한 진실. 여기 없는 키는 존재하지 않는다
export const SETTINGS_REGISTRY = {
  revenueBasis: {
    type: 'enum', options: ['invoice_issued', 'contract', 'paid'],
    default: 'invoice_issued', group: 'pnl',
    label: '매출 기준',
  },
  yearAttributionDate: {
    type: 'enum', options: ['issued_date', 'end_date', 'paid_date'],
    default: 'end_date', group: 'pnl', label: '연도 귀속 날짜',
  },
  taxRate: {
    type: 'decimal', default: 0.033, group: 'finance',
    dateEffective: true, label: '원천세율',   // 날짜효력: 값이 여러 개, 유효 시작일이 붙는다
  },
  approvalStepsExpense: {
    type: 'json', default: [...], group: 'approval', label: '지출결의 결재 단계',
  },
  // ...
} as const satisfies Record<string, SettingDef>;
```
```sql
settings_values(key, value_json, effective_from, created_at)   -- 날짜효력 값은 (key, effective_from) 복수 행
```

**날짜효력 값 조회:** `getSetting(key, asOfDate)` → `effective_from <= asOfDate`인 행 중 가장 최근 것. 세율·수식처럼 "몇 월부터 바뀐다"는 요구를 자연스럽게 표현하고, 과거 손익을 재계산해도 그 시점 세율이 적용된다(감사 가능성).

**모든 등록 키가 실제로 읽히는지 테스트로 강제:** registry의 키 목록을 순회하며 서버 코드에서 `getSetting('<key>', ...)` 호출이 존재하는지 정적 검사(간단히는 `grep`을 테스트에서 실행하거나, 커버리지 계측으로 registry 접근이 0인 키를 실패 처리)한다. 이것이 260807/260807이 "설정 65개 중 서버가 읽는 것 6개"로 무너진 지점을 정확히 겨냥한 방지책이다.

```typescript
// test/settings-registry.test.ts (개념)
test('모든 등록된 설정 키는 서버 코드에서 읽힌다', () => {
  const usedKeys = grepSourceFor(/getSetting\(['"](\w+)['"]/g, 'server/src');
  for (const key of Object.keys(SETTINGS_REGISTRY)) {
    expect(usedKeys).toContain(key);
  }
});
```

**JSON export/import:** `settings_values` 전체를 registry 타입으로 검증하며 JSON으로 내보내고, 가져올 때도 registry에 없는 키는 거부(스키마 드리프트 차단).

**관리 화면 자동 생성:** `group`별로 묶어 `type`에 따라 입력 컴포넌트를 매핑하는 제네릭 폼 하나(`admin/SettingsForm.tsx`)면 충분 — 새 설정 키를 추가해도 화면 코드를 따로 안 짠다.

---

### 4. Profit & loss calculation

**요구:** 줄 단위 단계적 원가(증빙 > 지출결의 승인액 > 견적 실행가), 설정 가능한 매출 기준·연도 귀속, 팀 손익 = 프로젝트 손익 합 − 수주실패비용 − 팀 직접관리비, 모든 숫자의 드릴다운, 계산식 노출.

**비교:**

| 방식 | 장점 | 단점 | 이 프로젝트 적합성 |
|---|---|---|---|
| SQL views | 쿼리 한 번으로 집계, DB가 최적화 | 계산식이 SQL 안에 묻혀 "설정 화면에 계산식 노출" 요구와 상충, 단계적 원가 우선순위(COALESCE 체인)가 뷰 안에서 읽기 어려워짐, 설정값(매출기준 등)을 뷰에서 파라미터로 받기 번거로움(뷰는 인자를 못 받음 → 함수 필요) | 부적합(단독으로는) |
| Computed-in-TypeScript service (권장) | 계산식이 TS 함수로 존재해 그대로 "계산식 노출" 화면에 문자열/구조로 보여줄 수 있음, 설정값을 함수 인자로 받아 매 호출 반영, 드릴다운 트레이스 객체를 계산과 동시에 만들 수 있음 | N+1 쿼리 위험 → 배치 조회로 완화 필요, 대량 데이터에서 SQL보다 느림(이 규모에선 무관: 프로젝트 수백 건) | **적합** |
| Materialized snapshots | 조회 빠름, 과거 시점 재현 쉬움 | "설정을 바꾸면 과거 숫자도 다시 계산돼야 납득 가능"이라는 요구와 충돌(스냅샷은 계산 시점에 고정), 갱신 트리거·무효화 관리가 추가 복잡도 | 부적합(v1) |

**권장: computed-in-TypeScript service, thin SQL views는 목록/합계 보조용으로만.**

이유: 이 프로젝트의 손익 요구는 "숫자가 왜 그런지 기획본부가 납득해야 한다"이다. 이는 계산이 **한 곳의 읽을 수 있는 함수**로 존재해야 함을 뜻한다. SQL 뷰나 materialized 스냅샷은 계산식을 감추거나 시점에 고정시켜 "지금 설정 기준으로 다시 계산해서 보여달라" + "이 숫자가 어느 줄에서 왔는지 보여달라"를 동시에 만족시키기 어렵다. 규모(프로젝트 125건, 견적 줄 1,379행, 30명 성장 후에도 비슷한 자릿수)에서 TS로 매 요청 계산해도 성능 문제가 없다.

**패턴 — 계산과 동시에 드릴다운 트레이스를 만든다:**
```typescript
// domain/pnl/calculateProjectPnl.ts
type CostLineResult = {
  quoteLineId: string;
  amount: number;
  basis: 'evidence' | 'approved_expense' | 'quoted_expected'; // 어느 단계 값을 썼는지
  sourceRowId: string; // 드릴다운 대상: evidence.id | expense.id | quote_line.id
};

export function resolveCostBasis(line: QuoteLineWithCosts): CostLineResult {
  if (line.evidenceAmount != null) {
    return { quoteLineId: line.id, amount: line.evidenceAmount, basis: 'evidence', sourceRowId: line.evidenceId! };
  }
  if (line.approvedExpenseAmount != null) {
    return { quoteLineId: line.id, amount: line.approvedExpenseAmount, basis: 'approved_expense', sourceRowId: line.expenseId! };
  }
  return { quoteLineId: line.id, amount: line.quotedExpectedCost, basis: 'quoted_expected', sourceRowId: line.id };
}

export async function calculateProjectPnl(projectId: string, asOf: DateSettings) {
  const revenue = resolveRevenue(project, asOf.revenueBasis);       // 설정값을 인자로 받음
  const costLines = quoteLines.map(resolveCostBasis);
  const totalCost = sum(costLines.map(c => c.amount));
  return {
    revenue, totalCost, profit: revenue.amount - totalCost,
    trace: { revenue, costLines },   // 이 객체 자체가 "근거 줄까지 드릴다운" 화면의 데이터
  };
}
```
팀 손익은 `sum(팀 프로젝트 pnl.profit) - sum(팀 소속 lost-pitch 지출) - sum(팀 직접관리비 지출)`로, 같은 방식(trace 배열 합산)을 한 단계 더 쌓는다. **계산식 노출 화면**은 이 함수의 로직을 문자열 템플릿(설정 그룹 `pnl`의 라벨과 함께)으로 그대로 보여주면 된다 — 별도 "수식 엔진"을 만들 필요 없음.

**설정 가능한 매출기준·연도귀속:** `resolveRevenue(project, revenueBasis)`가 `invoice_issued | contract | paid` 세 경로로 분기하고, 연도 귀속은 `resolveAttributionDate(project, yearAttributionDate)`가 별도 함수로 분리되어 목표·인센티브 계산도 동일 함수를 재사용한다(같은 기준이 두 곳에 따로 구현되면 반드시 어긋난다).

---

### 5. Admin-defined custom fields

**비교:**

| 방식 | 검증 | 목록/검색/정렬 | 내보내기 | TS 타입 안전성 |
|---|---|---|---|---|
| JSONB + field-definition table (권장) | 정의 표의 타입에 맞춰 앱단(zod 동적 스키마)에서 검증 | GIN 인덱스로 필터 가능, 정렬은 표현식 인덱스 필요 시 추가 | JSON 그대로 export 가능 | 정의 표를 읽어 `Record<string, unknown>` + 런타임 zod로 좁힘, 표준 컬럼은 그대로 타입 있음 |
| EAV (attribute 별 행) | 각 attribute 표에서 타입별 컬럼 강제 가능 | 조건마다 EXISTS/self-join 필요 → 필드 3~4개만 넘어도 쿼리 급격히 복잡 | join 재구성 필요 | 강하게 타입화 가능하나 코드량 큼 |
| ALTER TABLE (고정 컬럼 추가) | DB 제약으로 가장 강함 | 가장 빠름, 표준 SQL | 그대로 | 가장 안전 |

**권장: JSONB custom_fields 컬럼 + `field_definitions` 표.** 근거: 검색 결과([Replacing EAV with JSONB in PostgreSQL](https://coussej.github.io/2016/01/14/Replacing-EAV-with-JSONB-in-PostgreSQL/), [PostgreSQL JSONB vs EAV](https://www.razsamuel.com/postgresql-jsonb-vs-eav-dynamic-data/))도 "동적 속성엔 JSONB가 기본값이고 EAV는 조인 폭발이 문제"라고 일관되게 정리한다. `ALTER TABLE`은 "관리자가 코드 수정 없이 칸을 추가한다"는 요구 자체와 충돌하므로 배제.

**스키마:**
```sql
field_definitions(id, entity_type, field_key, label, data_type, options_json, required, list_visible, created_at)
-- entity_type: 'project' | 'quote_line' | 'vendor' | ...
-- projects, quote_lines, vendors 등 각 표에 custom_fields JSONB DEFAULT '{}' 컬럼 하나씩
```

**검증:** `field_definitions`를 읽어 zod 스키마를 런타임에 조립(`z.object(Object.fromEntries(defs.map(d => [d.field_key, zodForType(d.data_type)])))`)하고, 저장 전 검증한다.

**목록/검색/정렬:** `list_visible=true`인 필드만 목록 컬럼 후보로 노출. 검색은 `custom_fields @> '{"key":"value"}'` 또는 `custom_fields->>'key' ILIKE`, GIN 인덱스(`CREATE INDEX ... USING gin(custom_fields)`)로 뒷받침. 정렬이 잦은 필드는 표현식 인덱스(`(custom_fields->>'key')`)를 개별 추가 — 다만 이 규모(수백~수천 행)에서는 인덱스 없이도 체감 문제 없을 가능성이 높다(과최적화 금지).

**내보내기:** 엑셀/CSV export 시 `field_definitions`로 컬럼 헤더를 동적 생성 — 표준 컬럼과 동일한 코드 경로로 처리 가능.

**TS 타입 안전성:** 표준 컬럼은 그대로 강타입(`Project` 인터페이스), `customFields: Record<string, string | number | boolean | null>`는 화면단에서 `field_definitions` 메타를 기준으로 렌더링 컴포넌트를 선택(텍스트/숫자/날짜/선택 넷뿐이므로 스위치 하나로 충분).

---

### 6. Notifications: no queue

**What:** Cloud Scheduler가 5~15분 간격으로 `/internal/notify-tick`을 HTTP로 호출한다. 이 엔드포인트가 규칙을 평가하고, 대상자별로 "보낼 알림" 목록을 만들고, dedupe 로그를 확인해 안 보낸 것만 인앱함에 적재 + 이메일 발송한다.

```sql
notification_rules(id, rule_type, active, params_json)   -- '지출결의 누락', '지급일 임박' 등, 시점·대상은 params
notifications(id, recipient_id, rule_type, entity_id, message, channel, created_at, read_at)
notification_dedupe_log(rule_type, entity_id, recipient_id, sent_on_date, PRIMARY KEY(rule_type, entity_id, recipient_id, sent_on_date))
```

**중복 발송 방지:** `notification_dedupe_log`에 `(rule_type, entity_id, recipient_id, sent_on_date)`를 기본키로 두고, 발송 전 `INSERT ... ON CONFLICT DO NOTHING`으로 원자적으로 막는다 — 같은 날 두 번 tick이 겹쳐도 안전(멱등).

**Why no queue:** 규칙 수가 적고(마감 임박류 4종), 지연 허용치가 크며(분 단위), 실행 로그가 "이 tick이 뭘 보냈는지" HTTP 응답 하나로 다 보인다. 큐(Pub/Sub 등)는 재시도·순서·DLQ 개념을 끌고 들어와 비개발자가 디버깅하기 어렵게 만든다. Cloud Scheduler → HTTP는 실패해도 다음 tick이 같은 계산을 다시 해서 자연히 복구된다(계산이 항상 "지금 시점 기준 상태"에서 다시 도출되므로 상태를 누적하지 않음).

---

### 7. Files/evidence: GCS + app-level PII encryption

**흐름:** 클라이언트가 서버에 업로드 의도를 알림 → 서버가 GCS 서명 URL(PUT) 발급 → 클라이언트가 GCS에 직접 업로드(서버를 거치지 않아 Cloud Run 메모리·시간 절약) → 클라이언트가 서버에 완료 통보 → 서버가 메타데이터를 Postgres에 기록.

```sql
files(id, gcs_object_key, original_name, mime_type, size_bytes, uploaded_by, linked_entity_type, linked_entity_id, created_at)
```

**PII(주민등록번호) 암호화:** 확인증 표의 주민등록번호 필드만 앱단 봉투암호화(envelope encryption) — Cloud KMS의 키(또는 개인 GCP 단계에서는 env의 대칭키, 회사 GCP 이전 시 KMS로 승격 가능하게 인터페이스 통일)로 데이터 키를 감싸고, 데이터는 AES-256-GCM으로 암호화해 DB에는 암호문만 저장. 조회 시에만 복호화, 목록 화면엔 마스킹(`***-**-****`)만 노출.
```typescript
// files/pii.ts
export async function encryptRRN(plain: string): Promise<{ ciphertext: Buffer; iv: Buffer; authTag: Buffer }> { /* AES-256-GCM */ }
export async function decryptRRN(row: EncryptedField, viewer: Viewer): Promise<string> {
  if (!can(viewer, 'confirmations', 'view_pii')) throw new ForbiddenError();
  /* 복호화 + audit 기록 */
}
```
**보존/파기:** 확인증 보존기간이 지나면 배치(수동 실행 스크립트, 큐 아님)로 `resident_registration_number` 컬럼만 NULL 처리(파일은 별도 정책). 구체 기간·열람권한은 PROJECT.md대로 `/cso` 보안 감사 후 확정 — 이 문서는 구조(암호화 지점, 삭제 지점)만 고정한다.

---

### 8. Auth: session + CSRF + rate limit + audit

- **세션:** DB 세션 표(`sessions(id, user_id, expires_at, created_at)`) + httpOnly, Secure, SameSite=Lax 쿠키. JWT 불필요(사용자 수십 명, 세션 무효화가 즉시 되어야 함 — 퇴사 시 로그아웃 강제).
- **비밀번호:** scrypt 또는 argon2 해시(평문 금지 — 인트라넷의 결함을 반복하지 않음).
- **CSRF:** SameSite=Lax만으로 대부분의 CSRF를 막되, 상태 변경 요청(POST/PUT/DELETE)에 이중 제출 토큰(double-submit cookie) 추가 — 구현 단순.
- **Rate limiting:** 로그인 시도에 한해 `login_attempts(email, ip, attempted_at)` 표 기반 카운트(인메모리 캐시 불필요, 사용자 규모가 작아 DB 조회로 충분).
- **Auth 전환(이메일 → Google OIDC):** `AUTH_PROVIDER=password|google` 환경변수 스위치. `auth/` 모듈이 `AuthProvider` 인터페이스(로그인 검증만 다름, 세션 발급 로직은 공유) 하나로 두 구현을 감싼다 — 회사 GCP 이전 시 코드 추가 없이 설정만 바뀌게.
- **감사 로그:** `audit_log(id, actor_id, action, entity_type, entity_id, before_json, after_json, created_at)` — repository의 쓰기 함수(`update*/delete*`)가 공통 헬퍼를 통해 자동 기록(수작업으로 각 서비스에서 호출하게 하면 빠뜨리는 곳이 생김 → repository 공통 wrapper에서 강제).

---

### 9. One-time migration from MySQL intranet

**10표 · 2,849행**(repo-audit-260917.md §1b) — 규모가 작아 "리허설 가능한 스크립트"가 핵심이지 성능은 문제되지 않는다.

```
scripts/migrate-intranet/
├── extract.ts     # MySQL(RDS)에서 읽기 전용으로 덤프 → JSON 스냅샷 파일로 저장 (원본 DB에 절대 쓰지 않음)
├── transform.ts   # 스냅샷 → 새 스키마 형태로 변환, KST 타임존 명시 변환, id-map 생성
├── load.ts        # 새 Postgres에 upsert (idempotent — 같은 입력 두 번 실행해도 결과 동일)
├── verify.ts       # 표별 행수 일치, 고아 참조(견적 줄 5건 등) 표시, 금액 불일치(차익 66줄) 플래그만 하고 고치지 않음
└── id_map.sql      # legacy_table, legacy_id, new_table, new_id — 재실행·역추적용
```

**멱등성 패턴:** `load.ts`는 `INSERT ... ON CONFLICT (legacy_id, legacy_table) DO UPDATE`로 재실행 안전하게 만들고, 새 PK는 `id_map` 표를 거쳐서만 결정(legacy_id를 새 PK로 재사용하지 않음 — 새 스키마의 PK 정책과 독립적으로 유지).

**KST 타임스탬프:** RDS는 서버 타임존 설정에 의존하는 경우가 많으므로, `extract.ts` 단계에서 원본 컬럼이 KST 로컬시간(타임존 정보 없음)이라고 명시적으로 가정하고 `AT TIME ZONE 'Asia/Seoul'`로 UTC로 변환해 새 스키마(모든 timestamp는 UTC 저장 관례)에 넣는다 — 이 가정을 `transform.ts` 상단에 주석으로 고정해 향후 재실행 시 흔들리지 않게 한다.

**행수 검증:** `verify.ts`가 legacy 표별 행수 vs 새 표에서 `legacy_id IS NOT NULL`인 행수를 비교해 리포트를 stdout + 파일로 남긴다. 불일치·고아(예: 프로젝트 삭제됐는데 남은 견적 줄 5건)는 **자동으로 고치지 않고** 사람이 볼 수 있는 목록으로만 낸다(PROJECT.md 요구와 일치).

**리허설:** 개인 GCP의 별도 스테이징 DB에 여러 번 돌려보고, 매번 `id_map`을 초기화(TRUNCATE)한 뒤 처음부터 재실행 가능하게 한다 — "이전 스크립트는 멱등·재실행 가능"이라는 요구가 곧 리허설 가능성이다.

**순서:** 새 스키마의 대상 표(projects, quote_lines, expense_requests, card_usages, vendors, clients, employees, code lists)가 **먼저 안정화된 뒤에** 이 스크립트를 작성한다 — 스키마가 바뀌면 스크립트도 바뀌므로, 마이그레이션은 "일회성 도구"로 취급하고 도메인 코드와 강결합시키지 않는다(별도 `scripts/` 폴더, 프로덕션 서버 코드에 포함 안 함).

---

### 10. Deployment topology

```
Cloud Run (server, min-instances=0)  ── Cloud SQL (Postgres, 최소 사양, PAYG)
        │                                        │
        ├── GCS bucket (evidence, 서명 URL)       │
        ├── Secret Manager (DB 비밀번호, KMS 키, 세션 시크릿)
        └── Cloud Scheduler (notify-tick 주기 호출, OIDC 인증 헤더)
```

- **min-instances=0(request-based billing)** — 내부 시스템은 사용 없는 시간(야간·주말)이 많아 요청 기반 과금이 스케줄에 맞는다. 사용자가 콜드스타트(수백 ms~1~2초)를 감내할 수 있는 내부 도구라 min-instances를 올릴 이유가 없다([Best practices for cost-optimized Cloud Run services](https://docs.cloud.google.com/run/docs/tips/services-cost-optimization)).
- **Cloud SQL PAYG, 최소 티어** — 상시 켜져 있어야 하므로(Cloud Run처럼 0으로 안 내려감) 여기가 고정비의 대부분이다. 초기엔 가장 작은 shared-core 티어로 시작하고, 필요해지면 올린다(비용·유지관리 우선 원칙과 일치). STACK.md 단계에서 "Cloud SQL보다 싼 대안"(예: Neon 등 서버리스 Postgres)을 별도로 비교할 여지를 남긴다 — 이 문서는 구조만 고정.
- **단일 배포 스크립트:** `scripts/deploy.sh <project-id> <region>` 하나가 (1) 이미지 빌드·푸시, (2) DB 마이그레이션 실행(별도 Cloud Run Job 또는 배포 전 로컬에서 Cloud SQL Proxy로 실행), (3) Cloud Run 배포, (4) Cloud Scheduler 잡 upsert까지 전부 처리 — 개인 GCP → 회사 GCP 이식이 "프로젝트 ID·리전 인자만 바꿔 다시 실행"이 되게 한다.
- **마이그레이션은 배포 파이프라인의 일부:** 새 이미지가 트래픽을 받기 전에 `db/migrations/`를 순서대로 적용 — 배포 스크립트 안에서 순차 실행하고 실패 시 배포 중단.
- **백업:** Cloud SQL 자동 백업(일 1회) + PITR(가능하면) 활성화. 복원 절차는 `docs/runbooks/restore.md`에 "언제 무엇을 눌러야 하는지" 스크린샷 수준으로 문서화(비개발자가 혼자 복원할 수 있어야 함).

## Data Flow

### Request Flow (일반 CRUD)

```
[화면 액션] → routes/*.ts (세션 확인 → can() 1차 차단)
    → domain/*/service.ts (트랜잭션 시작, 업무 규칙 적용)
        → authz.scopeFor(viewer) 로 스코프 계산
        → repositories/*.ts (스코프 WHERE 강제된 SQL 실행)
        → audit.record() (쓰기 시)
    ← 응답 조립 시 authz.visible() 로 정보 노출표 적용(필드 삭제)
[화면] ← JSON 응답 (권한·노출이 이미 반영된 상태)
```
**방향:** 요청은 항상 routes → domain → repositories → DB로 한 방향, 응답은 그 역순이지만 **직렬화 직전에 authz.visible()이 한 번 더 개입**한다(이중 방어: 스코프는 "행"을, visible은 "필드"를 막는다).

### P&L Drill-down Flow

```
[손익 화면 숫자 클릭] → GET /pnl/projects/:id/trace
    → domain/pnl.calculateProjectPnl(id, settingsAsOf)
        → domain/pnl.resolveCostBasis() 가 각 quote_line마다 evidence/expense/quote 중 하나를 가리키는 trace 생성
    ← { revenue, totalCost, profit, trace: { revenue: {...}, costLines: [{quoteLineId, amount, basis, sourceRowId}, ...] } }
[화면] → trace.costLines[i].sourceRowId 로 근거 표(증빙/지출결의/견적줄) 상세 페이지로 이동
```
**핵심:** 계산 함수가 "결과"와 "근거"를 **같은 호출에서 함께** 반환하므로, 별도의 "왜 이 숫자인지 역추적하는 쿼리"를 따로 만들 필요가 없다 — 계산이 곧 감사 로그다.

### Approval Flow

```
[지출결의 제출] → expenses.submit(id)
    → approvals.createInstance(businessType='expense', entityId, routeId)
        → route_steps 순회 → 담당자 0명인 step skip → 첫 유효 step으로 status='submitted' 전이
    → notifications 대상: 첫 단계 담당자 (다음 notify-tick에서 "결재 대기" 알림 후보로 잡힘)
[담당자 승인/반려] → approvals.act(instanceId, action)
    → approval_actions에 기록(감사 이력) → nextStep() 계산 → 마지막이면 status='approved', 아니면 다음 담당자로
```

### Notification Flow

```
Cloud Scheduler (매 N분) → POST /internal/notify-tick (OIDC 토큰으로 인증)
    → notifications.evaluateRules(now)
        → 각 rule_type 별로 대상 엔티티 조회(예: '지급일 임박'인 미결 지출결의)
        → notification_dedupe_log에 INSERT ... ON CONFLICT DO NOTHING (이미 오늘 보냈으면 skip)
        → 신규 건만 notifications 표 적재 + 이메일 발송
    ← { sent: N, skipped: M } (로그로 확인 가능한 응답)
```

## Suggested Build Order

각 단계는 "이전 단계가 존재해야 다음 단계를 검증할 수 있다"는 의존성 기준으로 정렬했다. 괄호 안은 이 문서의 해당 패턴 번호.

1. **배포 스켈레톤 (패턴 10)** — 빈 서버 하나를 Cloud Run에 올리고, Cloud SQL·Secret Manager·`scripts/deploy.sh`를 먼저 연결한다. 기능이 하나도 없어도 "배포가 된다"를 가장 먼저 증명해야, 이후 모든 단계가 실제 환경에서 계속 검증된다(260907/260807의 "운영 DB 없음"을 반복하지 않기 위한 최우선 순위).
2. **스키마 베이스라인 + 마이그레이션 러너** — `people`, `positions`(계급), `teams`, `menus` 등 인증·인가가 기대는 최소 마스터 표. `db/migrations/` 러너를 배포 스크립트에 연결.
3. **인증(auth) + 인가 핵심(authz) (패턴 1, 8)** — 세션·로그인과 `can()/visible()/scopeFor()`를 가장 먼저 만든다. 이후 모든 화면·API가 이 위에 얹히므로, 이 순서를 지켜야 "권한 체크를 나중에 끼워 넣는" 실수(260907의 반복 원인)가 구조적으로 불가능해진다.
4. **설정 레지스트리 골격 (패턴 3)** — 키 2~3개(예: `revenueBasis`)만으로 registry → DB 저장 → 관리 화면 자동생성 → "읽히는지 테스트" 파이프라인을 먼저 굳힌다. 이후 단계마다 새 설정 키를 추가하는 것은 이 패턴을 재사용하기만 하면 된다.
5. **핵심 엔티티 CRUD: 프로젝트·견적 줄·거래처·클라이언트·직원 (패턴 5 포함)** — 인트라넷 대체 대상. 커스텀 필드(JSONB + `field_definitions`)는 이 표들을 만들 때부터 함께 넣는다(나중에 얹으면 초기 컬럼 설계와 충돌).
6. **일회 이전 스크립트 실행 (패턴 9)** — 5번의 스키마가 안정된 뒤에만 작성 가능. 리허설 여러 번 → 행수 검증 → 실제 전환.
7. **지출결의 + 결재 상태기계 (패턴 2)** — 3번(authz)·4번(settings, 결재 단계 설정)이 있어야 만들 수 있다. `approvals/` 모듈은 여기서 범용으로 만들어 8번(연차)이 재사용.
8. **법인카드 사용 (견적 줄과 연결)** — 5, 7번 위에 얹는 단순 CRUD.
9. **증빙/파일 (패턴 7)** — GCS 연동 + 지출결의·법인카드에 첨부. 7, 8번이 있어야 "무엇에 첨부하는지"가 존재.
10. **손익 계산 서비스 (패턴 4)** — 5(견적 줄), 7(지출결의 승인액), 9(증빙 금액)가 모두 존재해야 단계적 원가 우선순위를 계산할 데이터가 갖춰진다. 이 시점에 4번의 설정(매출기준·연도귀속)도 실제로 소비된다.
11. **연간 목표 + 인센티브** — 10번(프로젝트/팀 손익)이 있어야 진행률을 계산할 수 있다.
12. **연차 신청·승인** — 3(authz)·7(approvals 모듈)만 있으면 독립적으로 만들 수 있어 9~11번과 병렬 진행 가능.
13. **알림 (패턴 6)** — 7번(결재 대기), 9번(증빙 미첨부), 지급일(5~8번 데이터)이 이미 존재해야 규칙이 평가할 대상이 생긴다. 가장 마지막에 두는 이유는 "무엇의 마감을 알릴지"가 그 전 단계들의 산출물이기 때문.
14. **기타소득 확인증 (외부 링크 + PII 암호화)** — 9번(파일)의 암호화 인프라를 재사용. 보안 감사(`/cso`) 완료 후 확정 항목이 많아 이 정도 순서(늦은 편)가 자연스럽다.
15. **관리 화면 마감(전체 통합)** — 권한표·정보노출표·코드표·커스텀필드 관리 화면을 한 번에 정리. 각 도메인이 만들어질 때 데이터는 이미 존재하므로, 이 단계는 "제네릭 admin 렌더러가 모든 레지스트리를 실제로 다 커버하는지" 마무리 점검에 가깝다.

**한 줄 요약:** 배포 → 인증/인가 → 설정 레지스트리 → 인트라넷 4기능(+커스텀필드) → 이전 → 결재 → 증빙 → 손익 → 목표/연차 → 알림 → 확인증 → 관리 화면 마감.



## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|---------------------------|
| 10–30 users (현재 목표) | 단일 Cloud Run 인스턴스 min=0~1, 단일 Postgres, 위 구조 그대로. 최적화 불필요 |
| 30–100 users | Cloud Run min-instances=1(콜드스타트 체감 줄이기), Postgres 티어 한 단계 상향. 코드 구조 변경 없음 |
| 100+ users (범위 밖) | 이 시점에도 표 10~20개·행 수만 원 단위 자릿수 성장이라 모놀리스 유지가 맞음. 굳이 나눈다면 읽기 전용 리포트(P&L 집계)에 read replica 정도 — 이 프로젝트 수명 내 도달 가능성 낮음 |

### Scaling Priorities

1. **첫 병목은 성능이 아니라 사람의 인지 부하다.** 260907/260807이 증명한 실패 축은 "표·화면·설정 수가 한 사람의 파악 범위를 넘는 것"이었다 — 따라서 "먼저 최적화할 것"은 쿼리가 아니라 **표·라우트·화면 개수를 계속 세어보는 습관**이다.
2. **DB 성능은 사실상 문제되지 않는다.** 프로젝트 수백 건, 견적 줄 수천 행 규모에서 인덱스 없는 순차 스캔도 밀리초 단위다. 인덱스는 필요해질 때(실측 후) 추가한다.

## Anti-Patterns

### Anti-Pattern 1: 워크플로 엔진 도입

**What people do:** "결재 단계가 설정 가능해야 한다"를 보고 범용 워크플로/규칙 엔진(BPMN, 상태기계 라이브러리, 규칙 DSL)을 도입한다.
**Why it's wrong:** N단계 순차 승인 하나를 표현하는 데 필요 이상의 추상화가 들어가고, 비개발자가 엔진의 개념(토큰, 게이트웨이 등)을 배워야 디버깅할 수 있게 된다.
**Do this instead:** 표 3개(`routes/steps/instances`) + 순수 함수 하나(`nextStep()`)로 표현한다(패턴 2 참조).

### Anti-Pattern 2: 마이크로서비스/큐 조기 도입

**What people do:** "알림", "이전 파이프라인"처럼 비동기로 보이는 일을 보고 Pub/Sub·별도 워커 서비스를 둔다.
**Why it's wrong:** 실행 경로가 둘 이상이 되는 순간 "지금 뭐가 어디서 실패했나"를 추적하는 데 별도 관측 도구가 필요해진다 — 사용자 규모(10~30명)에 걸맞지 않다.
**Do this instead:** Cloud Scheduler → 같은 서버의 HTTP 엔드포인트. 실행 경로 하나.

### Anti-Pattern 3: SQL을 여러 레이어에 흩어두기(ORM 매직 포함)

**What people do:** 일부는 raw SQL, 일부는 ORM 쿼리 빌더, 일부는 서비스 레이어에서 직접 pool.query() 호출.
**Why it's wrong:** 권한 스코프 필터를 "항상 붙이는" 규율이 깨지기 쉬워진다 — 260907의 "권한 안 켜짐 6회"류 결함의 전형적 원인.
**Do this instead:** SQL은 `repositories/`에만, 그 함수들은 예외 없이 `viewer` 인자를 받는다(패턴 1).

### Anti-Pattern 4: "완성 뒤 이전" (Big-bang migration)

**What people do:** 새 시스템을 기능적으로 다 만든 뒤에야 인트라넷 데이터를 옮기고 전환한다.
**Why it's wrong:** PROJECT.md가 명시한 세 번의 실패 공통 원인("다 만든 뒤 옮긴다")과 정확히 같다. 실사용 데이터 없이 몇 달을 진행하면 화면·설정이 실제 업무와 어긋나도 아무도 모른다.
**Do this instead:** 인트라넷 4기능(프로젝트/견적/지출결의/법인카드) 대체가 끝나는 즉시 이전 스크립트를 리허설하고 전환한다 — 손익·목표·확인증 같은 신규 기능은 그 다음 위에 얹는다(build order 참조).

### Anti-Pattern 5: 손익 계산을 표 여러 곳(SQL 뷰 + 프론트 재계산)에 중복 구현

**What people do:** 목록 화면은 SQL 뷰로 합계를 내고, 상세 드릴다운 화면은 프론트에서 다시 합산한다.
**Why it's wrong:** 인트라넷의 "차익 불일치 66줄" 결함이 정확히 이 패턴(서버 계산 없이 각자 다시 계산)에서 나왔다.
**Do this instead:** `domain/pnl` 서비스 함수 하나가 유일한 계산 지점이고, 목록·상세·드릴다운·계산식 노출 화면 모두 이 함수(혹은 이 함수가 반환한 trace)만 소비한다.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|-----------------------|-------|
| Cloud SQL (Postgres) | `pg` 커넥션 풀, Cloud SQL Auth Proxy(로컬/CI) 또는 Unix socket(Cloud Run) | 단일 DB, 스키마 하나 |
| GCS | 서명 URL(PUT/GET), 서버는 메타데이터만 소유 | 버킷 하나, prefix로 entity 유형 구분 |
| Cloud Scheduler | HTTP 타깃 + OIDC 인증 토큰 | `notify-tick` 하나 (또는 필요시 2개: 알림, 날짜효력 만료 체크) |
| Secret Manager | 배포 스크립트가 시크릿을 Cloud Run 환경변수로 주입 | DB 비밀번호, KMS 키, 세션 서명 키 |
| Google OIDC (v2, 회사 GCP) | `AUTH_PROVIDER=google` 환경변수 스위치, `auth/providers/google.ts` | 개인 GCP 단계에서는 미사용 — 인터페이스만 준비 |
| Email (알림 발송) | 표준 SMTP 또는 SendGrid류 API, 서버가 직접 호출(큐 없음) | 발송 실패는 재시도 없이 다음 tick에서 자연 재시도(멱등 dedupe 덕분에 안전) |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|-----------------|-------|
| `routes/` ↔ `domain/*` | 직접 함수 호출(같은 프로세스) | HTTP도 이벤트도 아님 — 모놀리스이므로 가장 단순한 결합 |
| `domain/*` ↔ `repositories/*` | 직접 함수 호출, 트랜잭션은 `withTx()`로 domain이 경계를 정함 | repository는 SQL만, 트랜잭션 시작 권한 없음 |
| `domain/expenses` ↔ `domain/approvals` | approvals가 제공하는 제네릭 API(`createInstance`, `act`)를 expenses/leave가 호출 | approvals는 "무엇을 승인하는지" 모름(entityType/entityId만 앎) — 결합도 최소화 |
| `domain/pnl` ↔ `domain/{quotes,expenses,evidence}` | pnl이 읽기 전용으로 다른 도메인의 repository를 통해 조회 | pnl은 쓰기 권한 없음 — 계산만 함 |
| `app/` ↔ `server/` | REST(JSON), 세션 쿠키 | 프론트는 authz 판정을 하지 않음(서버 응답을 신뢰), UX 숨김만 |

## Sources

- [Best practices for cost-optimized Cloud Run services (Google Cloud)](https://docs.cloud.google.com/run/docs/tips/services-cost-optimization) — MEDIUM/HIGH(공식 문서), min-instances=0 및 request-based billing 권장 근거
- [About instance autoscaling in Cloud Run services (Google Cloud)](https://docs.cloud.google.com/run/docs/about-instance-autoscaling) — HIGH(공식 문서)
- [Row Level Security for Tenants in Postgres (Crunchy Data)](https://www.crunchydata.com/blog/row-level-security-for-tenants-in-postgres) — MEDIUM, RLS 장단점 근거
- [Postgres RLS Implementation Guide (Permit.io)](https://www.permit.io/blog/postgres-rls-implementation-guide) — MEDIUM, "RLS만으로는 감사 추적이 없다" 근거
- [Replacing EAV with JSONB in PostgreSQL](https://coussej.github.io/2016/01/14/Replacing-EAV-with-JSONB-in-PostgreSQL/) — MEDIUM, JSONB 권장 근거
- [PostgreSQL JSONB vs. EAV: Which is Better for Storing Dynamic Data](https://www.razsamuel.com/postgresql-jsonb-vs-eav-dynamic-data/) — MEDIUM, 성능·복잡도 비교
- `/home/user/ERP_PLANT8_260917/.planning/PROJECT.md` — HIGH(프로젝트 1차 소스), 요구사항·제약·이전 실패 근거
- `/home/user/ERP_PLANT8_260917/docs/research/repo-audit-260917.md` — HIGH(프로젝트 1차 소스), 인트라넷 표·행 수·결함, 260907/260807 실패 근거

---
*Architecture research for: config-driven internal business system (PLANT8 ERP)*
*Researched: 2026-09-17*
