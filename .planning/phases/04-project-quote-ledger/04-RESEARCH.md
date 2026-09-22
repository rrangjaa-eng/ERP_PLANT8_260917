# Phase 4: 프로젝트·견적 원장 - Research

**Researched:** 2026-09-22
**Domain:** 금액 도메인 모델(`domain/money`) · 단일 게이트(`domain/rules.gate`) · 엑셀식 편집 표(자체 구현) · Postgres 카운터 동시성 · 인트라넷 추출 스크립트
**Confidence:** MEDIUM (구현 패턴은 리포에서 직접 읽어 HIGH, 인트라넷 원본 스키마 세부는 문서에 없어 LOW — Gaps 참고)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

D-41~D-74 전부(2026-09-22 사용자가 다섯 영역 44문항에 직접 답함). 요지만 옮긴다 — 원문은 `.planning/phases/04-project-quote-ledger/04-CONTEXT.md` `<decisions>`를 그대로 따른다.

- **D-41** 프로젝트 상태는 수주중 → 진행 → 완료(정산) + 미수주 네 가지. 상태 값은 Phase 3 코드표 `project_status`, 전이 규칙은 `domain/`. — Reversibility: costly
- **D-42** 프로젝트 번호는 등록 시 부여(수주중 포함). 미수주 건 결번 허용. `document_counters` 행 잠금(`UPDATE … RETURNING`), 지출결의 번호(Phase 5)와 같은 카운터.
- **D-43** 수주중 상태에서는 고객 승인 게이트를 걸지 않는다. `rules.gate`가 `ctx.status === '수주중'`이면 통과.
- **D-44** 미수주 → 진행 복귀 허용. 번호·줄·비용 그대로 살아남고 변경 이력은 행동 로그.
- **D-45** 미수주는 잠기지 않는다(비권장안, 사용자 선택). 잠기는 상태는 완료(정산) 하나뿐.
- **D-46** 상태 전환 주체는 팀장 이상(비권장안 — "각 기획팀의 팀장까지만"). PM은 전환 불가. — 완료 전환의 기안자 정의는 Phase 5에서 재확인 필요
- **D-47** 완료(정산) 뒤 경영관리가 고칠 수 있는 것(권장안보다 넓음): 매출 발행·입금 줄, 결재 통과 건 지급 완료 처리, '견적 외 비용' 줄 추가로 원가 보정. 견적 줄 편집·PM의 새 지출결의는 잠김.
- **D-48** 완료·미수주 뒤 원가 보정 줄 = '견적 외 비용' 줄과 같은 종류(견적가 0). 별도 '조정' 종류 없음. 완료 프로젝트에서는 경영관리만 추가. 실행가 음수 허용(EXP-14).
- **D-49** 수주중 단계 기간은 선택, 수주중 → 진행 전환이 기간 입력을 요구(게이트 규칙).
- **D-50** 상태 변경 이력은 `action_log`에 '상태 변경' 종류로만. 상세에는 현재 상태 + 마지막 변경일만.
- **D-51** 프로젝트 목록 기본 보기는 전체 상태, 그룹은 종료일 기준 월별(비권장안, 사용자 선택). 상태 필터는 표 위 한 줄. 「더 보기 50건」.
- **D-52** 사전 견적 = 프로젝트의 총 매출 예상가 한 칸(견적 줄 없는 프로젝트 속성, 선택 입력, `domain/money`). 고객 승인 표시 없음, 이 칸에서 지출결의 불가. "차수"는 상세 견적 1차·2차부터만.
- **D-53** 새 차수는 이전 차수 전체 복사 후 편집. 복사 줄은 `copied_from_line_id` 계보. 빈 차수 없음. 차수 되돌리기 불가.
- **D-54** 최신 차수만 '현재 차수'. 지출결의·합계·손익은 전부 현재 차수 기준. — Reversibility: costly
- **D-55** 이전 차수 줄의 지출결의·증빙은 계보로 현재 차수 대응 줄에 이어 보임. 문서 행은 옮기지 않음.
- **D-56** 차수 고객 승인 표시는 담당 PM이 승인일과 함께 켬(결재 없음, 행동 로그). 취소는 연결 문서 없을 때만. 견적 번호(`26001-1차`)는 표시용 파생값, 저장 컬럼 없음.
- **D-57** 매출 칸 작성 주체 갈림: 계약 금액(공급가액)은 PM, 세금계산서 발행·입금은 경영관리. 발행액·입금액은 정보 노출표 항목(기획본부 기본 숨김).
- **D-58** 발행과 입금은 각각 줄 목록(날짜·금액·메모). 입금 합계 ≠ 발행액이면 미수 표시. 발행액 = 공급가액 입력 + 서버 계산, 입금액 = 통장 합계 입력 + `grossFromTotal()` 역산 + 차이 표시. 매출·조정은 음수 허용.
- **D-59** 리저브 대장은 손익 메뉴 안 화면(`/pnl/reserves`). 경영관리·대표·팀장만.
- **D-60** 리저브 줄 = 날짜·입출금 구분·금액(Money)·프로젝트(선택)·메모 + 증빙 종류·세금계산서 번호(권장안보다 넓음). 잔액은 서버 계산 열. 직접 수정 허용(행동 로그), 삭제는 보관함, 잔액 음수 되면 서버 거부.
- **D-61** 표는 자체 구현(HTML `<table>` + 키보드·범위 선택·붙여넣기 직접 구현). 새 런타임 의존성 0. — Reversibility: costly (이후 페이즈 표가 이 컴포넌트를 씀)
- **D-62** 대분류 = 그룹 머리글(소분류에서 파생), 소분류 = 줄의 열. 그룹 순서는 코드표 `sort_order`, 줄 순서는 입력 순서 값 + Alt+↑/↓.
- **D-63** 견적가 = 수량(기본 1) × 단가, 서버 계산·저장. 실행가는 금액 한 칸. 차익 = 견적가 − 실행가도 서버 계산. 브라우저 계산값 미저장.
- **D-64** 열 구성: 번호·소분류·항목·거래처(선택)·수량·단가·견적가·실행가·차익·상태·비고. 상태 값은 이 페이즈에서 미착수·취소 둘뿐. 외화는 외화 금액·환율 두 칸, 원화는 계산값.
- **D-65** 충돌 감지는 줄 단위 `version`. 저장 시 읽은 버전과 다르면 실제 바뀐 셀만 충돌 표시. 충돌 하나라도 있으면 전부 거부.
- **D-66** 연결 문서가 있는 줄의 금액 셀(수량·단가·실행가·환율)은 읽기 전용(항목명·비고는 편집 가능). 고치려면 새 차수.
- **D-67** 엑셀 붙여넣기 지원: 클립보드 TSV를 활성 셀부터 오른쪽·아래로 채움. 숫자는 쉼표·공백 제거. 표를 넘으면 새 줄 자동.
- **D-68** 미저장 편집은 이탈 경고(`beforeunload`) + 브라우저 저장소 임시 보관. 서버 초안 없음.
- **D-69** 폰에서 줄 탭 시 열리는 시트는 보기 + 「지출결의 올리기」(Phase 5 활성화)만. 편집은 PC 전용.
- **D-70** 프로젝트 복사는 기본 정보 + 현재 차수 줄(금액 포함). 새 프로젝트는 상세 1차·미승인·수주중. 다른 프로젝트 줄은 표 간 범위 복사·붙여넣기로.
- **D-71** 통화별 최근 환율 설정 키는 단일값·통화별 키(`fx.recent_rate.USD`), 환율 적은 모든 저장에서 자동 갱신. 통화는 USD + KRW.
- **D-72** extract 입력은 MySQL 덤프 파일(`INTRANET_DUMP_PATH` 환경 변수). 네트워크·계정 불필요, 재실행 결정적.
- **D-73** `amount_basis` 판정은 스크립트 규칙(비율 1.1 근접 등) + 경영관리 확인(표본 20~30건, 사람 체크포인트). 불명은 '계산 불가'.
- **D-74** 결과는 표별 JSON 픽스처(리포 커밋, 개인정보 열 제외) + Markdown 보고서. 이전 문서 번호는 옛 id에서 결정적으로 파생.

### Claude's Discretion

- 페이즈 크기 — 5플랜 상한을 넘겨 5~7플랜으로 나뉘는 것 허용. 절단선은 리저브 대장(RSV-01) 하나로 고정(넘기면 별도 페이즈로).
- `ui/form`·`ui/select` 제작 범위 — 이 페이즈에서 만드는 폼(프로젝트 등록·매출 줄·리저브 줄)만 신규 컴포넌트를 씀. 관리자 폼 8개·`/account` 이관은 Phase 7.
- 문서 번호 서식 설정 키 형태(ADMN-09) — 문서 종류별 키 묶음 대 JSON 한 개.
- 견적 줄·프로젝트·리저브 표의 `custom_fields` JSONB 적용 방식(Phase 3 규약: 저장 전 zod 조립 검증·GIN 인덱스, 관리 UI 없음).
- 목록·검색 인덱스 목록(`docs/ARCHITECTURE.md`에 적음, 300줄 상한), p99 500ms 측정 방법, 요청 본문 1MB 한도 위치.
- `domain/money` 함수 시그니처 세부와 `getSettingValue(def, {asOf})` 기준일 결정.
- `rules.gate(doc, rule, ctx)` 시그니처와 규칙 등록 방식.
- 표 컴포넌트의 파일 배치·서버/클라이언트 분할·범위 선택 모델, 브라우저 임시 보관 키 설계.
- 프로젝트 상세(§6-2) 섹션 순서, 네 숫자 줄(PNL-01)은 Phase 9까지 비워 둠.

### Deferred Ideas (OUT OF SCOPE)

- REQUIREMENTS·ROADMAP 보강(D-41) — `/gsd-plan-phase 4` 전에 `gsd_run`으로 이미 반영 완료(처리 완료 대장 참고, `edd0d73`)
- 완료 전환의 정산 결재 기안자(D-46 vs D3) — Phase 5 토론에서 재확인
- 수주중 프로젝트의 비용 표시(팀 손익의 미수주 비용) — Phase 10
- 진행 중 손익 분모에 사전 견적 fallback — Phase 9(D-52)
- 리저브 충당 → 매출 반영(RSV-02) — Phase 9, D-59의 같은 화면
- 승인 증빙 첨부·리저브 증빙 첨부 — Phase 6(첨부 저장)
- 관리자 폼 8개·`/account`의 `ui/form` 이관 — Phase 7
- 폰 375px 관리자 표 칸 접기 — 이 페이즈의 표 컴포넌트가 구현하면 이관은 Phase 7 검수에서
- 통화 추가(USD 외) — 키 추가로. 실시간 환율 API는 Out of Scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| PROJ-01 | 프로젝트 등록·목록·상세(클라이언트·PM·팀·기간·상태), 번호 자동 부여, 집계 쿼리·인덱스·p99 500ms | Pattern 3(카운터 원자적 증가), Validation Architecture 표, Architectural Responsibility Map "목록 합계" 행 |
| PROJ-02 | 견적가·차익 서버 계산, 브라우저 계산값 미저장, 연결 문서 있는 줄은 '취소' 상태만 | Pattern 1·2(Money 컬럼·정수 안전 공식), Code Examples "서버 계산 견적가·차익", Anti-Patterns 2번째 항목 |
| PROJ-03 | 매출 최소 칸(계약 금액·발행일/액·입금일/액), 입금액 합계→공급가 역산 | Pattern 2(`grossFromTotal()` 정수 안전 공식과 1원 오차 함정) |
| PROJ-04 | 프로젝트 상태 4종·전환 4종, 완료만 잠금 | Architectural Responsibility Map "게이트 판정" 행, Pitfall 2(action_log 상태 변경 종류 부재) |
| PROJ-05 | 이전 프로젝트·견적 줄 복사, 기본값 채움 | D-70(User Constraints), 표 간 붙여넣기가 Pattern 4(TSV)로 처리됨 |
| PROJ-07 | 사전→상세 차수, 차수마다 고객 승인, 승인 전 게이트 | Code Examples "게이트 등록 패턴", Anti-Patterns 4번째 항목 |
| ADMN-09 | 문서 번호 서식 설정(접두어·연도·순번 자릿수·구분자) | Pattern 3, Pitfall 1(실제 `document_counters` 스키마와 CONTEXT.md 요약 불일치), Open Question 1 |
| UX-04 | 서버 검증 즉시 안내, 저장 실패·중복 저장·입력값 유실 없음 | Pattern 3(트랜잭션 원자성), D-65·D-68(User Constraints, 충돌·임시 보관) |
| UX-05 | 엑셀식 키보드 입력(Tab/Enter/방향키/복사·붙여넣기/Esc/단축키), 전부 저장 또는 전부 거부 | Standard Stack(D-61 근거 재확인), Pattern 4(TSV 붙여넣기 파서), Recommended Project Structure `ui/table/` |
| RSV-01 | 클라이언트별 리저브 대장, 잔액 서버 계산, 프로젝트 연결, Money 모델 | Architectural Responsibility Map "리저브 잔액 계산" 행, Validation Architecture(RSV-01 테스트 행) |
| FX-01 | 통화·외화 금액·환율·원화 환산액 병기, 서버 단일 반올림, 분할 보정 | Pattern 1·2, Don't Hand-Roll(세금 계산 행), Validation Architecture(FX-01 테스트 행) |

</phase_requirements>

## Summary

Phase 4는 세 가지 "단일 지점"을 실제로 짓는 첫 페이즈다: `domain/money`(현재는 린트 규칙과 브랜드 타입 자리만 있음, [VERIFIED: eslint/rules/money-boundary.mjs:1-40, test/unit/eslint-rules/fixtures/money.ts:1-2]), `domain/rules.gate`(아직 코드 없음, `docs/ARCHITECTURE.md` §2에 자리만 예고), 그리고 문서 번호 카운터의 원자적 증가(현재 `document_counters` 표는 `(counter_key, period)` 복합 PK + `value` 컬럼과 읽기·upsert 함수만 있고 증가 함수는 없음, [VERIFIED: db/schema/document-counters.ts:8-19, repositories/document-counters.ts:1-31]). 엑셀식 표(UX-04·05)는 CONTEXT.md D-61이 이미 "자체 구현, 새 런타임 의존성 0"으로 잠갔으므로 이 리서치는 그 선택을 재검토하지 않고 구현 방법(키보드 계약·붙여넣기 정규화·충돌 표시)에 예산을 썼다.

가장 위험한 지점 셋: (1) `document_counters`의 실제 스키마가 CONTEXT.md 요약(`format_key, scope_key, next_no`)과 다르다 — 실제 컬럼은 `counter_key, period, value`이므로 플래너는 이 실제 스키마를 기준으로 증가 함수를 설계해야 한다. (2) Drizzle의 `numeric()` 컬럼은 기본 모드에서 JS `string`을 반환한다(정밀도 보존, 하지만 산술 전 반드시 파싱 필요) — `domain/money`의 Money 브랜드 타입이 이 문자열 경계를 어떻게 감쌀지가 설계의 핵심이다. (3) `action_log`의 `CORE_ACTION_TYPES`(18종)에는 "상태 변경"에 대응하는 종류가 없다 — D-50이 요구하는 로그를 남기려면 새 종류를 추가하거나 기존 종류(`document_update`)를 재사용할지 계획 단계에서 정해야 한다.

**Primary recommendation:** `domain/money`는 원화를 `integer`(원 단위 정수), 외화 금액을 `numeric(14,2)`, 환율을 `numeric(12,4)`로 저장하고 Drizzle에서 문자열로 받은 뒤 `domain/money`의 파서 한 곳에서만 브랜드 `Money`로 변환한다. 표는 CONTEXT D-61대로 `<table>` + roving tabindex 자체 구현을 유지하고, 카운터 증가는 `UPDATE document_counters SET value = value + 1 WHERE counter_key = $1 AND period = $2 RETURNING value`를 트랜잭션 안에서 실행해 Postgres의 행 잠금(READ COMMITTED 기본에서 두 번째 트랜잭션이 첫 번째 커밋까지 블록됨)에 기댄다.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 견적가·차익 계산 | API/Backend (`domain/money`, Server Action) | — | PROJ-02·ROADMAP 기준 2 — 브라우저 계산값은 저장하지 않는다. 서버가 유일한 산술 지점 |
| 게이트 판정(고객 승인·완료 잠금·수주중 예외·기간 필수) | API/Backend (`domain/rules.gate`) | — | 화면은 게이트가 돌려준 이유 문자열만 표시(UX-06), 판정 로직은 절대 클라이언트에 없음 |
| 문서 번호 부여 | API/Backend + Database(행 잠금) | — | `UPDATE...RETURNING`은 반드시 서버 트랜잭션 안에서, DB의 행 잠금이 실제 동시성 방어를 한다 |
| 엑셀식 표 렌더·키보드·클립보드 | Browser/Client (React Client Component) | API/Backend(셀 편집 가능성 판정) | 키보드·붙여넣기는 DOM 이벤트라 클라이언트 몫이지만, 셀이 편집 가능한지는 서버가 판정해 보낸다(§7-3 (가), 클라이언트 추론 금지) |
| 환율 기본값 조회 | API/Backend (`getSettingValue`) | Database(`settings` 표) | 설정 레지스트리는 domain 안에서만 읽히고 화면은 값만 받는다 |
| 목록 합계(견적·실행가·차익) | Database(집계 쿼리) | API/Backend(DTO 투영) | ROADMAP 기준 1 — 집계 쿼리 1회, p99 500ms 요구가 인덱스 설계를 강제 |
| 리저브 잔액 계산 | Database(계산값) 또는 API/Backend | — | "잔액은 서버 계산 열"(D-60) — DB window function 또는 애플리케이션 합산, 계획 단계에서 성능 대비 단순성으로 결정 |
| 인트라넷 추출·변환 | Backend 스크립트(`scripts/migrate/`, Node/tsx) | — | 기존 `scripts/*.ts`(tsx 실행) 관례를 그대로 잇는다. DB 접속 없음(덤프 파일 파싱) |

## Standard Stack

### Core

이 페이즈는 새 런타임 의존성을 추가하지 않는다(D-61, D-19·D-25·D-39의 연장). 이미 설치된 스택만 쓴다.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | 0.45.2 [VERIFIED: package.json] | ORM, `numeric`/`integer` 컬럼, 트랜잭션 | 이미 전 페이즈가 사용 중, 새 의존성 아님 |
| pg | 8.23.0 [VERIFIED: package.json] | Postgres 드라이버, `Pool` | `db/client.ts`가 이미 pool을 노출([VERIFIED: db/client.ts:41]) |
| zod | 4.6.5 [VERIFIED: package.json] | 서버 액션 입력 검증, `custom_fields` 스키마 조립 | 기존 관례(`buildCustomFieldsSchema`) |
| next-safe-action | 8.7.3 [VERIFIED: package.json] | `authedActionClient` | 유일한 Server Action 진입점(Issue 2, 이미 강제됨) |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tsx | (이미 devDependency로 추정, scripts/*.ts가 tsx로 실행됨) | `scripts/migrate/extract.ts`·`transform.ts` 실행 | 인트라넷 덤프 파싱 스크립트 — 기존 `scripts/seed-master.ts` 등과 같은 실행 방식 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| 자체 구현 편집 표(D-61, 잠긴 결정) | TanStack Table + custom cell editing | TanStack Table은 헤드리스라 마크업·스타일은 여전히 직접 짜야 하고 CSS Modules + `stylelint`(색·서체·radius 금지, D-20) 계약과 별개로 API 학습 비용만 추가된다. §7-3 계약(외화 2행·폰 칸 접기·`role="grid"`)이 이미 매우 구체적이라 라이브러리의 "일반화된" 셀 모델이 오히려 걸림돌 |
| 〃 | react-datasheet-grid | MIT지만 가상 스크롤·고정 열 폭 가정이 §7-3의 그룹 머리글(대분류 파생, 그룹 안에서만 새 줄) 요구와 맞지 않고, 스타일 오버라이드가 라이브러리 CSS 변수를 거쳐야 해 `docs/design/tokens.css` 단일 출처 원칙과 마찰 |
| 〃 | Glide Data Grid (Canvas 렌더) | Canvas 렌더는 `role="grid"`/`aria-readonly`/`aria-invalid` 같은 접근성 요구(§10, D-64의 `aria-*` 계약)를 DOM이 아니라 라이브러리의 접근성 레이어에 위임해야 하는데, 이 프로젝트가 이미 만든 `@axe-core/playwright` 검증 파이프라인([VERIFIED: STATE.md:141 `02-07: 체크포인트 승인 — @axe-core/playwright@4.13.0`])과 맞물리기 어렵다 |
| 〃 | Handsontable | 상용 라이선스(Non-commercial/Commercial 이원화 — [ASSUMED, 이 세션에서 라이선스 페이지를 직접 확인하지 않음]). 회사 내부 ERP라도 상용 라이선스 비용·조달 승인이 걸림. D-61이 이미 "새 런타임 의존성 0"을 이유로 배제 |
| 〃 | AG Grid Community | Community 버전은 MIT이지만 Enterprise 기능(범위 선택 붙여넣기 등 일부)이 갈려 있어 요구사항(D-67 붙여넣기, D-65 버전 충돌 표시)을 Community만으로 완전히 커버하는지 이 세션에서 검증하지 않았다. D-61이 재검토를 배제 |

**표 구현 비용 참고(D-61 근거 확인):** 열 10여 개·줄 수십 개(인트라넷 실측: `QUOTATION_LINE` 1,379행 / `fone_project` 125건, [VERIFIED: docs/research/repo-audit-260917.md:32-33]) 규모에서는 가상 스크롤이 필요 없고, 라이브러리가 절감하는 것은 "가상 스크롤·대량 데이터 성능"인데 이 페이즈는 그 문제가 없다. 자체 구현 비용의 실체는 (a) roving tabindex 키보드 이동, (b) TSV 파싱·정규화, (c) 셀 단위 `version` 충돌 렌더 — 셋 다 §7-3이 이미 문구 단위로 계약해 놓아 "설계"가 아니라 "구현"만 남는다. D-61은 유지한다.

**Installation:** 없음(신규 패키지 없음).

**Version verification:** `package.json`에서 직접 확인([VERIFIED: package.json]). 별도 레지스트리 조회 불필요 — 이미 설치·고정된 버전이다.

## Package Legitimacy Audit

이 페이즈는 새 외부 패키지를 설치하지 않는다(D-61·D-19·D-25·D-39). Package Legitimacy Gate는 스킵한다.

**Packages removed due to [SLOP] verdict:** 없음(신규 설치 없음).
**Packages flagged as suspicious [SUS]:** 없음(신규 설치 없음).

## Architecture Patterns

### System Architecture Diagram

```
[PM 브라우저] ── Server Action(authedActionClient) ──▶ [domain/quotes 등 신규 domain 모듈]
     │  Tab/Enter/방향키/⌘V(TSV)                              │
     │  클라이언트 정규화(숫자 파싱 시도, 최종 검증 아님)         ├─▶ domain/money.round()/toKrw()/splitWithRemainder()
     ▼                                                        │      /grossFromTotal()/applyTaxRule()
[표 dirty 상태 + 브라우저 저장소 임시 보관]                        ├─▶ domain/rules.gate(doc, rule, ctx) ── 상태 전환·차수 승인·완료 잠금 판정
     │  ⌘S 일괄 저장(트랜잭션 1개)                                │
     ▼                                                        ├─▶ domain/settings.getSettingValue(TAX_VAT_RATE, {asOf}) ── 세율·환율 기본값
[서버: 버전 비교 → 셀별 재계산 → 충돌 감지] ◀────────────────────┘      (Phase 3 레지스트리, 이력형)
     │  하나라도 충돌/오류면 배치 전체 거부                          │
     ▼                                                        ▼
[repositories/quote-lines 등] ──scopeFor(viewer)──▶ [Postgres: quote_lines, projects, quote_revisions,
     │                                                revenue_entries, reserve_entries, document_counters]
     ▼
[project(viewer, row, spec)] ── DTO 투영(정보 노출표) ──▶ [클라이언트가 받는 최종 JSON]

[문서 번호 부여] Server Action 트랜잭션 안:
  BEGIN → UPDATE document_counters SET value = value+1 WHERE (counter_key, period)=(...) RETURNING value
        → INSERT project/quote_revision ... number = 서식(value) → COMMIT
  (실패 시 ROLLBACK, value 증가분은 결번으로 허용됨 — D-42)

[인트라넷 추출·변환] scripts/migrate/extract.ts(MySQL 덤프 파일 파싱, INTRANET_DUMP_PATH)
        → scripts/migrate/transform.ts(amount_basis 판정 + 결정적 번호 파생)
        → test/fixtures/*.json(리포 커밋) + Markdown 보고서
  (이 페이즈는 여기서 끝 — DB 적재·load는 Phase 8)
```

### Recommended Project Structure

```
domain/
├── money/
│   ├── index.ts          # Money 브랜드 타입 + round/toKrw/splitWithRemainder/grossFromTotal/applyTaxRule
│   └── currency.ts        # 통화 목록(USD, KRW), fx.recent_rate.<통화> 키 조회 래퍼
├── rules/
│   └── gate.ts             # rules.gate(doc, rule, ctx) 단일 진입점 + 규칙 레지스트리
├── projects/
│   ├── index.ts            # 프로젝트 CRUD, 상태 전환(수주중/진행/완료/미수주), DTO
│   └── status.ts           # 상태 전이표(허용된 전환 목록), 게이트 규칙 등록
├── quotes/
│   ├── revisions.ts         # 차수 생성(전체 복사)·승인 표시·현재 차수 판정
│   └── lines.ts             # 견적 줄 CRUD, 서버 계산(견적가/차익), version 충돌 검사, 붙여넣기 반영
├── revenue/
│   └── index.ts             # 계약 금액·발행/입금 줄, grossFromTotal 역산
└── reserves/
    └── index.ts             # 리저브 대장, 잔액 계산, 음수 거부

repositories/
├── projects.ts
├── quote-revisions.ts
├── quote-lines.ts
├── revenue-entries.ts
├── reserve-entries.ts
└── document-counters.ts     # (기존 파일에 증가 함수 추가)

db/schema/
├── projects.ts
├── quote-revisions.ts
├── quote-lines.ts
├── revenue-entries.ts
└── reserve-entries.ts

ui/table/                    # 신규 — 편집/읽기 겸용 표 컴포넌트(D-61)
├── Table.tsx
├── Table.module.css
├── use-grid-keyboard.ts     # roving tabindex, 방향키, Esc, Delete
├── use-clipboard-paste.ts   # TSV 파싱·정규화(D-67)
└── use-dirty-storage.ts     # 브라우저 저장소 임시 보관(D-68)

scripts/migrate/
├── extract.ts                # MySQL 덤프 파일(INTRANET_DUMP_PATH) → 원시 JSON
└── transform.ts               # amount_basis 판정 + 결정적 번호 파생 → fixtures + 보고서
```

### Pattern 1: `domain/money`의 브랜드 타입과 Drizzle 문자열 경계

**What:** Drizzle의 `numeric()` 컬럼은 기본 모드(`mode` 생략)에서 `mapFromDriverValue`가 항상 JS `string`을 반환한다 — 부동소수점 정밀도 손실을 피하기 위해서다. `mode: "number"`를 쓰면 `Number()`로 변환하지만 큰 값이나 소수 4자리 환율에서 부동소수점 오차가 생길 수 있다.

**When to use:** 원화(정수 원)는 `integer` 컬럼(JS `number`, 정수라 안전)로, 외화 금액(`numeric(14,2)`)과 환율(`numeric(12,4)`)은 기본 `string` 모드로 두고 `domain/money`의 파서 함수 하나에서만 `Money` 브랜드로 변환한다. 이렇게 하면 "문자열→숫자 변환"이라는 위험한 경계가 코드베이스에 정확히 한 곳만 존재한다(money-boundary 린트가 이미 요구하는 "Money 산술은 domain/money 안에서만"과 정확히 같은 경계).

**Example:**
```typescript
// Source: [VERIFIED: node_modules/drizzle-orm/pg-core/columns/numeric.js
//          (drizzle-orm 0.45.2, package.json 고정 버전) — mapFromDriverValue가
//          typeof value === "string" ? value : String(value) 를 그대로 반환한다]
import { pgTable, integer, numeric, uuid } from "drizzle-orm/pg-core";

export const quoteLines = pgTable("quote_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  currency: text("currency").notNull().default("KRW"),      // "KRW" | "USD"
  foreignAmount: numeric("foreign_amount", { precision: 14, scale: 2 }), // string | null
  fxRate: numeric("fx_rate", { precision: 12, scale: 4 }).notNull().default("1.0000"), // string
  amountKrw: integer("amount_krw").notNull(), // 원화 환산액, 정수 원
  // ...
});
```

```typescript
// domain/money/index.ts — 파서는 이 모듈 안에서만 문자열을 숫자로 바꾼다
export type Money = { readonly __brand: "Money" } & {
  currency: "KRW" | "USD";
  amount: number;      // 표시용 소수 2자리(외화) 또는 정수(KRW)
  fxRate: number;      // 소수 4자리
  amountKrw: number;   // 정수 원
};

export function moneyFromRow(row: { currency: string; foreignAmount: string | null; fxRate: string; amountKrw: number }): Money {
  const fxRate = Number(row.fxRate); // 유일한 문자열→숫자 변환 지점
  const amount = row.foreignAmount !== null ? Number(row.foreignAmount) : row.amountKrw;
  return { currency: row.currency as "KRW" | "USD", amount, fxRate, amountKrw: row.amountKrw } as Money;
}
```

**공용 컬럼 묶음(Drizzle 재사용):** CONTEXT.md가 요구하는 "통화·외화 금액·환율·원화 환산액" 묶음을 여러 표(quote_lines·revenue_entries·reserve_entries)에서 반복하지 않으려면, 컬럼 정의를 반환하는 헬퍼 함수를 만든다.

```typescript
// domain/money/columns.ts — 여러 db/schema/*.ts 파일이 스프레드로 재사용
import { text, numeric, integer } from "drizzle-orm/pg-core";

export function moneyColumns(prefix = "") {
  return {
    [`${prefix}currency`]: text(`${prefix}currency`).notNull().default("KRW"),
    [`${prefix}foreign_amount`]: numeric(`${prefix}foreign_amount`, { precision: 14, scale: 2 }),
    [`${prefix}fx_rate`]: numeric(`${prefix}fx_rate`, { precision: 12, scale: 4 }).notNull().default("1.0000"),
    [`${prefix}amount_krw`]: integer(`${prefix}amount_krw`).notNull(),
  };
}
```
[ASSUMED — 이 헬퍼 패턴은 Drizzle 공식 문서에 "column set" 유틸리티로 소개되지만, 이 세션에서 Drizzle 0.45.2 문서를 직접 열어 시그니처를 확인하지 않았다. `pgTable("t", { ...moneyColumns(), other: text("other") })` 형태로 스프레드하는 것은 Drizzle의 `pgTable` 두 번째 인자가 평범한 객체이므로 타입상 동작할 것으로 보이나, computed key(`[${prefix}currency]`)를 쓰면 컬럼명 타입 추론이 깨질 수 있어 계획 단계에서 실제로 `drizzle-kit generate`를 돌려 확인이 필요하다.]

### Pattern 2: `splitWithRemainder()`와 `grossFromTotal()`의 정수 안전 공식

**What:** 분할 시 마지막 회차 보정과, 합계(부가세 포함)에서 공급가액을 역산하는 두 함수는 원 단위 반올림 오차가 누적되지 않도록 정수 연산으로 짜야 한다.

**Why it matters (D-58, PNL-09):** 입금액은 통장 합계(부가세 포함)로만 입력되고 `grossFromTotal()`이 공급가액을 역산한다. 부가세율 10%일 때 `공급가 = round(합계 / 1.1)`인데, 이 나눗셈은 원 단위에서 반드시 나머지가 생긴다.

**Integer-safe formula:**
```typescript
// domain/money/index.ts
// grossFromTotal: 합계(포함세) → 공급가액(정수 원). 세율은 이력형 설정에서 옴.
export function grossFromTotal(totalKrw: number, vatRate: number, method: "truncate" | "round" | "ceil" = "round"): number {
  // 공급가 = 합계 / (1 + vatRate). 부동소수점 나눗셈 뒤 정수 반올림 한 곳에서만.
  const raw = totalKrw / (1 + vatRate);
  return applyRounding(raw, 1, method); // round() 함수 재사용 — 반올림 지점은 하나
}

// splitWithRemainder: n개 회차로 나눌 때 마지막 회차가 나머지를 흡수해 합계 = 원금을 보장.
export function splitWithRemainder(totalKrw: number, count: number): number[] {
  const base = Math.floor(totalKrw / count);
  const remainder = totalKrw - base * count; // 항상 0 <= remainder < count
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? base + remainder : base));
}
```

**Rounding pitfall — "계산값과 다르면 차이를 표시"(D-58):** `grossFromTotal()`로 역산한 공급가액에 다시 부가세(10%)를 곱해 합계를 재계산하면, 반올림 때문에 원래 통장 합계와 **1원 어긋날 수 있다**(예: 합계 52,800,001원 입력 시 공급가 역산 48,000,001원, 재계산 합계 52,800,001.1 → 반올림 52,800,001원이면 일치하지만 절사/올림 방식에 따라 어긋날 수 있음). ROADMAP 기준 5가 "계산값과 다르면 차이를 표시"를 요구하는 이유가 바로 이 구조적 1원 오차다 — 이것을 "버그"로 보고 강제로 맞추려 하면 안 된다. `applyTaxRule()`도 같은 이유로 절사 단위·방식을 코드표(`code_items.tax_rule`, [VERIFIED: db/schema/code-tables.ts:8-33])에서 읽어야 한다.

### Pattern 3: Postgres 카운터 원자적 증가 — `UPDATE ... RETURNING` + 행 잠금

**What:** `document_counters`는 현재 `(counter_key, period)` 복합 PK + `value integer default 0` 컬럼만 있고 증가 함수가 없다 [VERIFIED: db/schema/document-counters.ts:8-19, repositories/document-counters.ts:1-31 — export된 함수는 `findDocumentCounter`·`upsertDocumentCounter` 둘뿐임을 통합 테스트가 명시적으로 고정: test/integration/document-counters.test.ts:39-43 `"이 리포지토리에 없다(Phase 4 경계) — 읽기·upsert 두 함수만 export된다"`].

**Correct pattern:** PostgreSQL의 기본 격리 수준(READ COMMITTED)에서, 한 트랜잭션이 `UPDATE`로 행을 잠그면 동시에 같은 행을 `UPDATE`하려는 다른 트랜잭션은 첫 트랜잭션이 커밋(또는 롤백)할 때까지 **자동으로 블록**된다 — 명시적 `SELECT ... FOR UPDATE`가 없어도 `UPDATE` 자체가 행 잠금을 건다. [CITED: https://www.postgresql.org/docs/current/transaction-iso.html — "Read Committed" 절, `UPDATE`/`DELETE`/`SELECT FOR UPDATE`가 대상 행을 찾은 뒤 그 행에 이미 다른 트랜잭션이 건 잠금이 있으면 그 트랜잭션이 끝날 때까지 대기한다].

```typescript
// domain/document-numbering/index.ts (신규)
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { documentCounters } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function allocateNumber(
  counterKey: string,
  period: string,
  tx: typeof db = db,
): Promise<number> {
  // upsert로 행이 없으면 0으로 만든 뒤, 같은 트랜잭션 안에서 UPDATE...RETURNING으로 증가.
  await tx
    .insert(documentCounters)
    .values({ counterKey, period, value: 0 })
    .onConflictDoNothing({ target: [documentCounters.counterKey, documentCounters.period] });

  const [row] = await tx
    .update(documentCounters)
    .set({ value: sql`${documentCounters.value} + 1`, updatedAt: new Date() })
    .where(and(eq(documentCounters.counterKey, counterKey), eq(documentCounters.period, period)))
    .returning({ value: documentCounters.value });

  return row.value; // 실패한 트랜잭션의 증가분은 롤백되어 결번 허용(D-42)
}
```

**호출 위치:** 이 함수는 프로젝트/견적 등록 Server Action의 `db.transaction(async (tx) => { ... allocateNumber(key, period, tx) ... })` 안에서 호출되어야 한다 — 별도 트랜잭션으로 번호만 먼저 커밋하면 이후 INSERT가 실패했을 때 번호가 이미 소비되어 버려(결번은 허용되므로 괜찮지만, 번호 채번과 실제 문서 생성이 분리되면 "번호는 있는데 문서가 없는" 상태가 생겨 재시도 로직이 복잡해진다).

**동시성 통합 테스트 — 두 개의 실제 연결:** `db/client.ts`는 모듈 수준에서 `pool`을 export한다([VERIFIED: db/client.ts:41 `export const pool: Pool = await createPool();`]). `db.transaction()`을 `Promise.all`로 동시에 두 번 호출하면 Drizzle이 풀에서 서로 다른 커넥션을 자동으로 배정한다(풀의 `max`가 2 이상이면, 로컬 테스트 환경의 `DB_POOL_MAX` 기본값을 확인해야 함 — 계획 단계에서 실측). 이것이 "같은 접속에서 쿼리 2개"가 아니라 "서로 다른 트랜잭션/연결"이 되는 이유다.

```typescript
// test/integration/document-counters-concurrency.test.ts (신규, 계획 예시)
import { describe, it, expect } from "vitest";
import { db } from "@/db/client";
import { allocateNumber } from "@/domain/document-numbering";

describe("document counter 동시 증가(Issue 10)", () => {
  it("두 트랜잭션이 동시에 증가시켜도 값이 겹치지 않는다", async () => {
    const [a, b] = await Promise.all([
      db.transaction((tx) => allocateNumber("project", "2026", tx)),
      db.transaction((tx) => allocateNumber("project", "2026", tx)),
    ]);
    expect(new Set([a, b]).size).toBe(2); // 두 값이 서로 다름 — 중복 채번 없음
  });
});
```
[ASSUMED — Drizzle의 `db.transaction(callback)` 콜백 인자 `tx`의 타입 시그니처와, 풀에서 실제로 별도 커넥션이 배정되는지는 이 세션에서 `node_modules/drizzle-orm`의 node-postgres 어댑터 소스를 직접 읽어 확인하지 않았다(numeric 컬럼만 확인함). 계획 단계에서 `drizzle-orm/node-postgres`의 `transaction` 구현을 실측하거나, 최소한 로컬 통합 테스트로 이 테스트 자체를 먼저 실행해 통과를 확인해야 한다.]

### Pattern 4: 클립보드 TSV 붙여넣기(D-67, §7-3 (다))

**What:** Excel·Google Sheets에서 여러 셀을 복사하면 클립보드의 `text/plain` MIME 타입에 TSV(탭 구분, 줄바꿈으로 행 구분)가 담긴다 [CITED: 웹서치 결과, SheetJS 문서 요약 및 다수 커뮤니티 소스 — "Excel/Google Sheets/LibreOffice에서 Ctrl+C하면 클립보드에 TSV가 담기며, 셀 안에 탭이나 줄바꿈이 있으면 그 셀 전체를 큰따옴표로 감싼다(CSV의 RFC 4180 인용 규칙과 유사하되 TSV에는 공식 표준이 없다)"].

**핵심 함정 — 인용된 셀(quoted cell):** 셀 안에 줄바꿈이 포함되면 Excel은 그 셀을 큰따옴표로 감싸 출력한다. 순진하게 `text.split("\n")`으로 행을 나누면 인용된 셀 내부의 줄바꿈에서 잘못 끊긴다. 이 페이즈의 표는 비고(자유 텍스트) 열이 있어 실제로 줄바꿈을 입력할 수 있는 유일한 열이다 — 파서가 이 케이스를 처리하지 못하면 붙여넣기 결과가 조용히 어긋난다(§7-3 (다)의 "조용히 버리지 않는다" 원칙과 정면으로 충돌).

```typescript
// ui/table/use-clipboard-paste.ts (신규, 계획 예시)
// RFC 4180과 유사한 인용 규칙으로 TSV를 2차원 배열로 파싱한다.
// 탭(\t)이 필드 구분자, 줄바꿈(\n 또는 \r\n)이 행 구분자, 단 큰따옴표로
// 감싼 필드 안의 탭·줄바꿈·큰따옴표(""로 이스케이프)는 리터럴로 취급한다.
export function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"' && field === "") { inQuotes = true; i++; continue; }
    if (ch === "\t") { row.push(field); field = ""; i++; continue; }
    if (ch === "\n" || (ch === "\r" && text[i + 1] === "\n")) {
      row.push(field); rows.push(row); row = []; field = "";
      i += ch === "\r" ? 2 : 1; continue;
    }
    field += ch; i++;
  }
  row.push(field); rows.push(row);
  return rows;
}
```
[ASSUMED — 이 파서는 일반적으로 알려진 TSV/CSV 인용 규칙(RFC 4180 계열)을 이 세션이 직접 짠 것이며, 실제 Excel/Google Sheets 출력물로 단위 테스트하지 않았다. 계획 단계에서 실제 Excel에서 줄바꿈 포함 셀을 복사해 `event.clipboardData.getData("text/plain")` 값을 콘솔에 찍어 이 파서를 검증하는 태스크가 필요하다(§7-3이 요구하는 "조용히 버리지 않는다" 보장을 테스트 없이 주장할 수 없음).]

**활성 셀 기준 채우기(D-67):** 파싱된 2차원 배열을 활성 셀 좌표(row, col)에서 오른쪽·아래로 매핑한다. 표를 넘는 아래쪽은 새 줄 자동 생성(§7-3 원문), 오른쪽을 넘는 칸은 버리고 경고(D-67·UI-SPEC (다)). 숫자 열은 붙여넣기 전에 쉼표·공백·통화 기호를 제거한 뒤 `Number()`로 파싱을 시도하고, `NaN`이면 오류 셀로 고정한다(값을 버리지 않고 사용자에게 보이는 것이 핵심).

### Anti-Patterns to Avoid

- **환율을 JS `number`로 컬럼 정의:** `numeric(12,4)` 대신 `real`/`double precision`을 쓰면 부동소수점 저장 오차가 생겨 "반올림은 `round()` 한 곳에서만"이라는 CEO D4 결정과 충돌한다. 반드시 `numeric` + 문자열 경계를 유지한다.
- **클라이언트에서 견적가·차익 계산 후 그 값을 저장 페이로드에 포함:** PROJ-02·ROADMAP 기준 2가 명시적으로 금지("브라우저 계산값은 저장하지 않는다") — 서버 액션은 클라이언트가 보낸 견적가·차익 필드를 무시하고 서버에서 재계산해야 한다.
- **카운터 증가를 문서 INSERT와 별도 트랜잭션으로 분리:** 번호만 먼저 커밋하면 이후 실패 시 "번호는 소비됐지만 문서는 없음" 상태에서 재시도 멱등성 설계가 복잡해진다. 같은 트랜잭션 안에서 증가 + INSERT를 묶는다.
- **`domain/rules.gate` 규칙을 화면(app/) 코드에 인라인으로 다시 구현:** UX-06·ROADMAP 기준 3이 "화면이 이유를 따로 만들지 않는다"를 요구한다. 새 규칙(기간 필수·거래처 필수)도 반드시 `rules.gate`의 규칙 레지스트리에 등록하는 형태로 짠다.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 부가세/원천징수 계산 | 화면·액션마다 개별 세금 계산 로직 | `domain/money.applyTaxRule()`(이 페이즈가 구현, Phase 5·6·9·11은 참조만) | `plant8/money-boundary` 린트가 모듈 밖 Money 산술을 이미 차단([VERIFIED: eslint/rules/money-boundary.mjs:1-90]) — 다른 곳에 계산을 두면 CI가 즉시 거부한다 |
| 게이트 판정(승인 여부·완료 잠금) | 각 액션에 `if (project.status === '완료') throw ...` 산재 | `domain/rules.gate(doc, rule, ctx)` 단일 진입점 | Issue 9 — 이후 페이즈(증빙 필수·마감·legacy 면제)가 모두 이 진입점을 지나야 하므로 지금 산재시키면 나중에 전부 재작성해야 한다 |
| 커스텀 필드 검증 | quote_lines·projects마다 개별 zod 스키마 | `buildCustomFieldsSchema(defs)`([VERIFIED: domain/custom-fields/build-schema.ts:1-36]) | 이미 Phase 3이 만든 조립기 — `.strict()`로 미등록 키를 거부하는 로직을 재발명할 필요 없음 |
| DTO 투영/정보 노출 필터링 | 화면 코드에서 `if (viewer.role === 'staff') delete dto.revenue` | `project(viewer, row, spec)`([VERIFIED: domain/permissions/project.ts:18-36]) | 노출표 항목(`infoItem`) 선언만 하면 투영이 자동으로 필드를 거른다. 화면 코드에 계급 분기를 두면 D-38 누수 스캔이 잡지 못하는 경로가 생긴다 |
| Excel 클립보드 파싱 | 정규식 하나로 `text.split("\t").split("\n")` | 인용(quote) 인식 상태 기계 파서(위 Pattern 4) | 비고 열의 줄바꿈 포함 셀이 있으면 단순 split이 행을 잘못 나눈다 |

**Key insight:** 이 페이즈가 만드는 세 "단일 지점"(`domain/money`·`domain/rules.gate`·문서 카운터 증가)은 전부 "지금 옳게 만들지 않으면 이후 6개 페이즈가 각자 다르게 재발명한다"는 성격을 공유한다. 커스텀 로직을 짜고 싶은 유혹이 드는 곳(세금 계산·게이트·번호 부여)은 전부 Phase 1·3이 이미 린트·스키마·표 규약으로 "여기서만 하라"고 못박아 둔 자리다 — 새로 판단할 필요 없이 그 자리를 채우면 된다.

## Runtime State Inventory

이 페이즈는 리네임·리팩터·마이그레이션이 아니라 신규 기능 구축이므로 이 섹션은 생략한다(트리거 조건 미해당). 단, `scripts/migrate/extract.ts`·`transform.ts`가 다루는 인트라넷 원본 데이터의 "무엇이 새 시스템에 없는가"는 Phase 8(적재)의 몫이며 이 페이즈는 변환 결과를 픽스처로만 커밋한다(D-74) — 실제 DB 적재로 인한 런타임 상태 이관은 이 페이즈 범위 밖이다.

## Common Pitfalls

### Pitfall 1: `document_counters`의 실제 스키마와 CONTEXT.md 요약의 불일치
**What goes wrong:** CONTEXT.md와 ROADMAP 기준 1은 `document_counters(format_key, scope_key, next_no)`라는 이름을 쓰지만, 실제 표는 `(counter_key, period)` PK + `value` 컬럼이다([VERIFIED: db/schema/document-counters.ts:8-19]). 계획을 문서 이름 그대로 따라 짜면 존재하지 않는 컬럼을 참조하는 코드가 나온다.
**Why it happens:** ROADMAP/CONTEXT.md는 개념을 요약한 산문이고, 실제 구현은 Phase 3(03-06)이 먼저 정했다.
**How to avoid:** 플랜은 반드시 `db/schema/document-counters.ts`를 실제로 열어 컬럼명을 확인한 뒤 증가 함수·서식 조립 로직을 짠다. `format_key`·`next_no` 같은 이름은 코드 어디에도 없다.
**Warning signs:** 마이그레이션 생성 시 `column "format_key" does not exist` 같은 타입 에러.

### Pitfall 2: `action_log`에 "상태 변경" 종류가 없음
**What goes wrong:** D-50은 "상태 변경 이력은 행동 로그에 '상태 변경' 종류로만 남긴다"고 요구하지만, `CORE_ACTION_TYPES`(18종: login·document_create·document_update·document_submit·document_approve·document_reject·document_withdraw·document_delete·payment_process·purchase_process·settings_change·permission_change·sensitive_view·archive·restore·excel_export·mask_reveal·action_log_prune)에는 대응하는 종류가 없다([VERIFIED: domain/action-log/record.ts:9-27, 정확한 배열 값 인용됨]).
**Why it happens:** 이 목록은 Phase 3이 그 시점까지 필요한 종류만 시드했다 — Phase 4가 첫 상태 전환 기능이다.
**How to avoid:** 계획 단계에서 `document_update`를 재사용할지 새 종류(`status_change` 등)를 추가할지 결정한다. 새 종류를 추가하면 `ACTION_TYPE_LABELS`(한국어 라벨)와 `domain/settings/keys.ts`의 `ACTION_LOG_OPTIONAL_TYPES`(핵심 로그 여부 판단) 둘 다 갱신해야 한다 — 하나만 고치면 타입 에러 없이 조용히 라벨이 빈 문자열이 되거나 설정 화면에 안 뜨는 종류가 생긴다.
**Warning signs:** `recordAction`을 호출하는데 `actionType` 파라미터 타입이 `CoreActionType`이라 컴파일 에러가 나거나(새 값을 추가 안 함), 반대로 컴파일은 되는데 행동 로그 화면에서 라벨이 비어 보임(라벨만 안 채움).

### Pitfall 3: GIN 인덱스는 `CONCURRENTLY` 없이 마이그레이션 트랜잭션 안에서만 생성 가능
**What goes wrong:** `custom_fields` GIN 인덱스를 "나중에 무중단으로 추가하자"며 `CREATE INDEX CONCURRENTLY`를 마이그레이션에 넣으면 CI가 실패한다.
**Why it happens:** `drizzle-orm`의 `migrate()`는 실행할 SQL 파일 전체를 하나의 트랜잭션으로 감싸고([VERIFIED: .squawk.toml:2-3, 주석 "drizzle의 migrate()는 이번에 실행할 마이그레이션 전부를 하나의 트랜잭션으로 감싼다(drizzle-orm/pg-core/dialect.js의 session.transaction(...) 참고, 실측 확인)"]), `CREATE INDEX CONCURRENTLY`는 트랜잭션 밖에서만 실행 가능하다는 Postgres 제약과 충돌한다. `.squawk.toml`이 `require-concurrent-index-creation`을 이미 배제 목록에 넣어 이 상황을 예상하고 있다([VERIFIED: .squawk.toml:5-9]).
**How to avoid:** 새 표(quote_lines 등)는 어차피 신규 생성이라 락 경합이 없으므로 일반 `CREATE INDEX`(비-concurrent)로 GIN 인덱스를 같은 마이그레이션에 포함한다(Phase 3 규약, [VERIFIED: docs/ARCHITECTURE.md:109-112]).
**Warning signs:** Squawk 린트가 아니라 Postgres 자체가 "CREATE INDEX CONCURRENTLY cannot run inside a transaction block" 에러를 낸다.

### Pitfall 4: `numeric` 컬럼을 조건 없이 산술에 바로 사용
**What goes wrong:** Drizzle이 돌려주는 `string`을 서버 액션이나 리포지토리에서 바로 `+`, `*` 연산에 쓰면 타입 에러 없이 문자열 연결(`"10.50" + "5"` → `"10.505"`가 아니라 실제로는 TS가 컴파일 에러를 낼 것이므로 정확히는 개발자가 강제로 `Number()` 캐스팅을 여기저기 흩어놓게 된다).
**Why it happens:** `numeric()` 기본 모드가 `string`을 반환한다는 사실이 코드 어디에도 문서화돼 있지 않다(타입 시스템이 알려주긴 하지만 개발자가 `as number`로 강제 캐스팅해버리면 막을 수 없다).
**How to avoid:** `plant8/money-boundary` 린트가 `Money` 브랜드 타입 산술은 이미 막지만, "raw numeric 컬럼 문자열"은 `Money` 타입이 아니므로 이 린트가 잡지 못한다. `domain/money`의 파서 함수(`moneyFromRow` 등) 하나만 raw string을 만지고, 그 함수가 리턴하는 `Money` 브랜드 밖으로는 raw string이 나가지 않도록 리포지토리 반환 타입을 설계해야 한다 — 이 경계는 린트가 아니라 타입 설계로 지켜야 한다(계획 단계에서 명시할 것).
**Warning signs:** 코드 리뷰에서 `Number(row.someAmount)`가 `domain/money` 밖에서 발견됨.

## Code Examples

### 게이트 등록 패턴(참고 — `domain/code-tables`의 기존 구조를 차용)

```typescript
// domain/rules/gate.ts (신규, 계획 예시 — 기존 domain/code-tables/index.ts의
// "판정 함수 하나가 여러 규칙을 순회" 구조를 참고했다. 실제 시그니처는 계획
// 단계에서 확정한다(CONTEXT.md "Claude's Discretion" 항목).)
export type GateRule<Doc, Ctx> = {
  name: string;
  check: (doc: Doc, ctx: Ctx) => Promise<{ allowed: true } | { allowed: false; reason: string }>;
};

const registry: GateRule<unknown, unknown>[] = [];

export function registerGateRule<Doc, Ctx>(rule: GateRule<Doc, Ctx>): void {
  registry.push(rule as GateRule<unknown, unknown>);
}

export async function gate<Doc, Ctx>(doc: Doc, ruleName: string, ctx: Ctx): Promise<{ allowed: boolean; reason?: string }> {
  const rule = registry.find((r) => r.name === ruleName) as GateRule<Doc, Ctx> | undefined;
  if (!rule) throw new Error(`등록되지 않은 게이트 규칙: ${ruleName}`);
  const result = await rule.check(doc, ctx);
  return result.allowed ? { allowed: true } : { allowed: false, reason: result.reason };
}
```
[ASSUMED — 이 시그니처는 CONTEXT.md "Claude's Discretion"이 명시적으로 계획 단계 재량으로 남긴 항목("`rules.gate(doc, rule, ctx)` 시그니처와 규칙 등록 방식")이다. 여기 제시한 형태는 기존 `domain/code-tables`·`domain/settings/registry.ts`의 "정의 객체 등록 + 조회 함수" 패턴을 일반화한 것일 뿐, 리포에 실제로 존재하는 코드가 아니다.]

### 서버 계산 견적가·차익(D-63)

```typescript
// domain/quotes/lines.ts (신규, 계획 예시)
// 견적가 = 수량(기본 1) × 단가. 차익 = 견적가 − 실행가. 둘 다 서버 계산·저장.
export function computeLineAmounts(quantity: number, unitPrice: number, executionAmount: number) {
  const quoteAmount = quantity * unitPrice; // Money 브랜드 도입 전 원시 계산 예시 — 실제로는 domain/money를 거친다
  const profit = quoteAmount - executionAmount;
  return { quoteAmount, profit };
}
```
[ASSUMED — 실제로는 `quantity × unitPrice`도 `Money` 타입이 개입하면 `plant8/money-boundary` 린트에 걸리므로, 이 계산 자체가 `domain/money` 안에 있어야 한다는 것이 위 Pattern 1의 요지다. 여기서는 계산 공식만 보이기 위해 원시 숫자로 단순화했다.]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| 인트라넷: 브라우저가 견적가·차익을 계산해 그 값을 그대로 저장 | 서버가 유일한 계산 지점, 브라우저 계산값 미저장 | 이 페이즈(PROJ-02) | 인트라넷의 "차익 불일치 66줄"([VERIFIED: docs/research/repo-audit-260917.md:20 "서버 검증 없음(견적가·차익은 브라우저 계산값 저장, 차익 불일치 66줄)"])이 구조적으로 재현 불가능해짐 |
| 인트라넷: 승인·삭제가 GET 요청 | Server Action(POST, next-safe-action) | Phase 1부터 이미 강제([VERIFIED: docs/ARCHITECTURE.md:159-167 §8 린트 규칙]) | CSRF·의도치 않은 크롤러 트리거 방지 |
| 인트라넷: 문서 번호에 채번 잠금 없음(추정, 문서에 명시 없음) | `UPDATE...RETURNING` 행 잠금 트랜잭션 | 이 페이즈 | 동시 제출 시 번호 중복 방지 |

**Deprecated/outdated:** 없음(그린필드 기능, 대체 대상 코드 없음 — 인트라넷 PHP 코드는 이관 참고용일 뿐 코드 재사용 대상이 아님, `Out of Scope` 표 참고).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | `domain/money`의 공용 컬럼 헬퍼(`moneyColumns()`)가 Drizzle `pgTable`에서 스프레드로 정상 동작한다 | Pattern 1 | 계획이 이 헬퍼를 전제로 여러 표 스키마를 설계했는데 실제로 타입 추론이 깨지면 스키마 재작성 필요 |
| A2 | `db.transaction()`을 `Promise.all`로 두 번 호출하면 풀에서 서로 다른 커넥션이 배정된다 | Pattern 3 | 동시성 통합 테스트가 실제로는 같은 커넥션에서 순차 실행되어 "가짜 통과"를 낼 수 있음 — Issue 10이 요구하는 실제 증명이 안 됨 |
| A3 | Excel/Google Sheets가 줄바꿈 포함 셀을 큰따옴표로 인용해 TSV에 담는다(RFC 4180 유사 규칙) | Pattern 4 | 실제 이스케이프 규칙이 다르면(예: 줄바꿈을 다른 문자로 치환) 파서가 조용히 데이터를 깨뜨림 |
| A4 | Handsontable이 상용 라이선스라 D-61의 "새 의존성 0" 근거 중 하나로 언급 가능하다 | Alternatives Considered | 라이선스가 실제로 무엇이든 D-61은 이미 잠긴 결정이라 재검토 대상이 아니지만, 이 사실 자체가 틀리면 근거 문장만 삭제하면 됨(결정에는 영향 없음) |
| A5 | `rules.gate(doc, rule, ctx)`·게이트 규칙 등록 방식 예시 코드가 실제 계획에서 채택할 형태와 유사하다 | Code Examples | CONTEXT.md가 이 시그니처를 명시적으로 "Claude's Discretion"에 남겼으므로 계획 단계가 완전히 다른 형태(예: 클래스 기반)를 선택해도 무방 — 예시는 참고용일 뿐 |
| A6 | 인트라넷 `QUOTATION_LINE`/`fone_project`의 실제 컬럼명·타입(금액 컬럼이 정수인지 소수인지, 통화 컬럼 존재 여부)이 `amount_basis` 판정 규칙(D-73)에 그대로 대응한다 | Don't Hand-Roll / Gaps | extract 스크립트를 짤 때 실제 덤프 파일을 열어보지 않으면 표본 대조 규칙(지급액÷견적가 비율 1.1 근접) 구현이 추측에 머무름 |

**If this table is empty:** 해당 없음 — 위 6건이 존재한다.

## Open Questions

1. **`document_counters`의 (counter_key, period) 조합에서 "전사 범위"는 어떤 `period` 값을 쓰는가?**
   - What we know: D-42는 프로젝트 번호와 지출결의 번호가 같은 카운터를 쓴다고 명시한다. `period` 컬럼 자체는 이미 존재하지만 "전사 범위는 고정 문자열"이라는 설명은 `db/schema/document-counters.ts` 주석에만 있고([VERIFIED: db/schema/document-counters.ts:6 "전사 범위는 고정 문자열"], 실제 어떤 문자열을 쓰는지는 코드 어디에도 정의돼 있지 않다.
   - What's unclear: `period`가 연도("2026")인지, 프로젝트별 범위(`scope_key`처럼 프로젝트 id)인지 — CONTEXT.md의 문서 번호 서식 예시(`26001`, `26001-0001`)를 보면 연도가 서식에 들어가므로 `period="2026"`이 유력하지만 확정된 코드가 없다.
   - Recommendation: 계획 단계 첫 태스크로 `document_counters`의 `period` 의미를 프로젝트 번호(연도 범위 전사 단일 카운터)와 견적 표시 번호(카운터 없음, 파생값, D-56)에 대해 명시적으로 정의한다.

2. **인트라넷 MySQL 덤프의 실제 컬럼 스키마(금액·통화·날짜 컬럼명)는 무엇인가?**
   - What we know: 표 이름(`fone_project`, `QUOTATION_LINE` 등)과 행 수·상태 분포는 `docs/research/repo-audit-260917.md`에 집계돼 있다([VERIFIED: 위 인용]).
   - What's unclear: 실제 컬럼명·타입은 이 리서치 세션에서 확인하지 못했다(덤프 파일 자체는 이 리포에 없고 `INTRANET_DUMP_PATH` 환경 변수로 별도 위치에서 제공됨, D-72).
   - Recommendation: `scripts/migrate/extract.ts`의 첫 태스크로 덤프 파일의 `CREATE TABLE` 구문만 먼저 파싱해 컬럼 목록을 출력하는 정찰 스크립트를 만들고, 그 결과를 바탕으로 `transform.ts`의 `amount_basis` 판정 로직을 짠다.

3. **`ui/table`이 편집 표와 읽기 표(차수 섹션 S5) 사이에서 컴포넌트를 어떻게 공유하는가?**
   - What we know: UI-SPEC S5는 차수 섹션이 "편집 가능한 셀이 구조적으로 0"이라 `ui/table`의 "읽기 모드"(모드 토글이 아니라 자동 파생 렌더 형태)를 쓴다고 명시한다([VERIFIED: .planning/phases/04-project-quote-ledger/04-UI-SPEC.md:668-679]).
   - What's unclear: 이 세션은 실제 `Table.tsx` prop 인터페이스를 설계하지 않았다 — "서버가 셀마다 판정해 보낸다"(가)를 만족하려면 각 셀에 `editability: "edit" | "readonly" | "locked"` 같은 필드가 필요할 텐데 이 데이터 모양이 quote_lines DTO와 어떻게 매핑되는지는 계획 단계 설계 대상이다.
   - Recommendation: 계획의 첫 플랜(트레이서)에서 이 컴포넌트 계약을 스키마부터 화면까지 관통시켜 확정한다(Phase 3의 03-01 트레이서 선례를 따름).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL(로컬 dev-db) | 통합 테스트, 카운터 동시성 테스트 | ✓(추정 — Phase 1~3이 이미 이 환경에서 통합 테스트를 실행 중) | — | — |
| `INTRANET_DUMP_PATH`가 가리키는 MySQL 덤프 파일 | `scripts/migrate/extract.ts` | ✗(이 세션에서 확인 안 됨 — 리포 밖 경로, D-72) | — | 파일이 없으면 extract 스크립트는 실행 불가 — 계획 단계가 이 파일의 실제 위치를 사람에게 확인해야 한다(체크포인트 필요) |
| Node.js / tsx | `scripts/migrate/*.ts` 실행 | ✓(기존 `scripts/*.ts` 전부 이 방식 사용) | — | — |

**Missing dependencies with no fallback:**
- `INTRANET_DUMP_PATH` 파일 자체 — extract 스크립트를 실행하려면 실제 MySQL 덤프(`db_backup_260915.sql` 계열, [VERIFIED: docs/research/repo-audit-260917.md:9])가 있어야 한다. 계획은 이 파일 확보를 human-verify 체크포인트로 넣어야 한다.

**Missing dependencies with fallback:**
- 없음.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest(`test/unit`, `test/integration`) + Playwright(`test/e2e`) — [VERIFIED: vitest.config.ts, docs/ARCHITECTURE.md §7] |
| Config file | `vitest.config.ts`(2-project 구성: `unit`/`integration`) |
| Quick run command | `pnpm vitest run --project unit` |
| Full suite command | `pnpm test`(단위→통합→E2E, [VERIFIED: CLAUDE.md "명령: ... test `pnpm test`(단위→통합→E2E)"]) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|--------------------|--------------|
| PROJ-02 | 견적가·차익이 서버에서 계산되고 브라우저 계산값은 저장되지 않는다 | unit(`domain/quotes`) | `pnpm vitest run --project unit domain/quotes` | ❌ Wave 0 |
| PROJ-01 | 문서 번호가 `document_counters` 행 잠금으로 원자적으로 부여된다(동시 제출) | integration(두 트랜잭션) | `pnpm vitest run --project integration document-counters-concurrency` | ❌ Wave 0 |
| PROJ-07 | 승인 전 차수의 줄에서 지출결의·구매 요청 동작이 게이트로 막힌다 | unit(`domain/rules.gate`) | `pnpm vitest run --project unit domain/rules` | ❌ Wave 0 |
| PROJ-04 | 상태 전환 4종(수주중→진행·수주중→미수주·진행→완료·미수주→진행)이 게이트를 지나고 완료만 잠긴다 | unit + integration | `pnpm vitest run --project unit domain/projects/status` | ❌ Wave 0 |
| FX-01 | `domain/money`의 4종 규칙 × 절사 표 기반 단위 테스트 | unit | `pnpm vitest run --project unit domain/money` | ❌ Wave 0 |
| PROJ-03 | 입금액(합계) → 공급가액 역산, 계산값과 다르면 차이 표시 | unit(`grossFromTotal`) | `pnpm vitest run --project unit domain/money` | ❌ Wave 0 |
| UX-04·UX-05 | 표 키보드 이동·붙여넣기·Esc·저장/새 줄 단축키, 전부 저장 또는 전부 거부 | E2E(Playwright) | `pnpm test:e2e -- quote-lines` | ❌ Wave 0 |
| RSV-01 | 리저브 잔액이 음수가 되면 서버가 거부 | integration | `pnpm vitest run --project integration reserve-entries` | ❌ Wave 0 |
| ADMN-09 | 문서 번호 서식이 설정에서 정의되고 실제 번호에 반영 | integration | `pnpm vitest run --project integration document-numbering` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm vitest run --project unit`(빠른 도메인 로직 검증)
- **Per wave merge:** `pnpm test`(단위→통합→E2E 전체)
- **Phase gate:** 전체 스위트 그린 후 `/gsd-verify-work`(CLAUDE.md "로컬 dev 통과는 완료 신호가 아니다" — CI=true 프로덕션 빌드 기준)

### Wave 0 Gaps

- [ ] `test/unit/domain/money.test.ts` — FX-01(규칙 4종 × 절사), `splitWithRemainder`·`grossFromTotal` 정수 안전성
- [ ] `test/unit/domain/rules-gate.test.ts` — PROJ-07·PROJ-04(게이트 등록·판정)
- [ ] `test/integration/document-counters-concurrency.test.ts` — PROJ-01(Issue 10, 두 커넥션 동시 증가)
- [ ] `test/integration/quote-lines.test.ts` — PROJ-02(서버 계산·버전 충돌)
- [ ] `test/integration/reserve-entries.test.ts` — RSV-01(음수 잔액 거부)
- [ ] `test/e2e/quote-table.spec.ts` — UX-04·UX-05(키보드·붙여넣기·전부 저장/거부)
- [ ] Framework install: 없음(기존 Vitest/Playwright 설정 재사용, 새 devDependency 불필요)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|-------------------|
| V2 Authentication | no | Phase 1이 이미 구현, 이 페이즈는 참조만 |
| V3 Session Management | no | 〃 |
| V4 Access Control | yes | `can`/`visible`/`scopeFor`(Phase 3) — 매출 칸 쓰기 권한 분리(PM vs 경영관리, D-57), 리저브 대장 정보 노출표 항목(D-59) |
| V5 Input Validation | yes | zod(next-safe-action 입력 검증) + `domain/money`의 서버 재계산(클라이언트 값 신뢰 안 함) |
| V6 Cryptography | no | 이 페이즈는 암호화 대상 데이터(계좌번호 등)를 새로 만들지 않음(Phase 3의 `lib/crypto.ts` 재사용 대상 없음) |

### Known Threat Patterns for {stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| 클라이언트가 조작한 견적가·차익·환율을 그대로 저장 | Tampering | Server Action이 클라이언트 페이로드의 계산 필드를 무시하고 `domain/money`로 서버 재계산(PROJ-02) |
| 문서 번호 채번 경쟁 조건으로 중복 번호 발급 | Tampering/DoS | `UPDATE...RETURNING` 행 잠금 트랜잭션(Pattern 3), `UNIQUE(format_key/counter_key 조합, number)` DB 제약이 최후 방어선 |
| 권한 없는 계급(기획본부)이 매출 발행/입금액 DTO 필드를 API 응답에서 읽음 | Information Disclosure | `project(viewer, dto)` 투영이 `infoItem` 미통과 필드를 아예 결과 객체에 싣지 않음([VERIFIED: domain/permissions/project.ts:28-33 — `if (!ok) continue;`]) |
| 완료(정산) 프로젝트의 견적 줄을 API를 직접 호출해 우회 수정 | Tampering | `domain/rules.gate`가 모든 쓰기 액션의 게이트이므로 화면 우회와 무관하게 서버가 거부 |

## Sources

### Primary (HIGH confidence — 이 리포에서 직접 읽음)

- `db/schema/document-counters.ts`, `repositories/document-counters.ts`, `test/integration/document-counters.test.ts` — 카운터 표의 실제 스키마·현재 export 목록
- `eslint/rules/money-boundary.mjs`, `test/unit/eslint-rules/fixtures/money.ts`, `test/unit/eslint-rules/fixtures/domain/money/index.ts` — Money 브랜드 타입·린트 경계
- `db/schema/code-tables.ts`, `domain/code-tables/tax-rule.ts`, `domain/code-tables/index.ts` — 세금 규칙 스키마·판정 함수 패턴
- `domain/settings/keys.ts`, `domain/settings/registry.ts` — 설정 레지스트리 계약, `getSettingValue(def, {asOf})`
- `domain/permissions/project.ts`, `domain/archive/index.ts`, `domain/action-log/record.ts` — DTO 투영·행동 로그 종류 목록
- `db/client.ts` — 커넥션 풀 export, Cloud SQL 커넥터 스위칭
- `.squawk.toml`, `docs/ARCHITECTURE.md` — 마이그레이션 트랜잭션 제약, GIN 인덱스 규약, 4계층 경계, 린트 규칙 표
- `node_modules/drizzle-orm/pg-core/columns/numeric.{js,d.ts}`(drizzle-orm 0.45.2, package.json 고정) — `numeric()` 컬럼의 `mapFromDriverValue` 반환 타입(string/number/bigint 3모드)
- `docs/research/repo-audit-260917.md` — 인트라넷 실사용 행 수·표 이름·차익 불일치 66줄·고아 견적 줄 5

### Secondary (MEDIUM confidence — 웹서치로 확인, 공식 문서 인용)

- [PostgreSQL 18 Documentation: 13.2. Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html) — READ COMMITTED에서 UPDATE가 대상 행에 잠금을 걸어 동시 UPDATE를 블록시키는 근거
- SheetJS 문서 요약(웹서치 스니펫, 원문 페이지는 이 세션의 네트워크 정책상 직접 열람 불가) — Excel/Google Sheets 클립보드 TSV 형식과 인용 규칙

### Tertiary (LOW confidence — 훈련 지식, 이 세션에서 검증 안 됨)

- Handsontable 라이선스 이원화, AG Grid Community/Enterprise 기능 분리 — D-61이 이미 재검토를 배제하므로 참고용으로만 남김
- `moneyColumns()` 헬퍼가 Drizzle `pgTable`에서 스프레드로 정상 동작한다는 가정
- `db.transaction()`의 `Promise.all` 동시 호출이 실제로 별도 커넥션을 쓴다는 가정(Drizzle node-postgres 어댑터 소스 미확인)

## Gaps

이 세션이 검증하지 못했거나 도구 접근이 막혀 확인할 수 없었던 항목을 추측 대신 명시한다.

1. **인트라넷 MySQL 덤프의 실제 컬럼 스키마.** `docs/research/repo-audit-260917.md`는 행 수·표 이름·`pay_status` 분포는 집계했지만 `QUOTATION_LINE`·`fone_project`의 실제 컬럼명·타입은 문서화하지 않았다. 덤프 파일 자체는 이 리포에 없다(D-72, `INTRANET_DUMP_PATH` 환경 변수로 별도 제공). `amount_basis` 판정 규칙(지급액÷견적가 비율 1.1 근접)을 구현하려면 계획/실행 단계에서 실제 덤프의 `CREATE TABLE` 구문을 먼저 읽어야 한다.
2. **Drizzle `db.transaction()`이 풀에서 실제로 별도 커넥션을 배정하는지.** `drizzle-orm/node-postgres` 어댑터의 `transaction()` 구현 소스를 이 세션에서 읽지 않았다(numeric 컬럼 소스만 확인). 두 트랜잭션 동시 실행 통합 테스트가 "가짜 통과"(실제로는 순차 실행)를 내지 않는지 계획 단계에서 실제로 그 테스트를 실행해 확인이 필요하다.
3. **SheetJS 클립보드 문서 원문.** `docs.sheetjs.com`이 이 세션의 네트워크 정책(egress proxy)에 의해 차단되어 WebFetch로 원문을 확인하지 못했다. 웹서치 스니펫으로 대체했으며 인용 규칙(큰따옴표 이스케이프)의 정확한 사양은 계획/실행 단계에서 실제 Excel 복사본으로 직접 검증해야 한다.
4. **Handsontable/AG Grid의 정확한 현재 라이선스 조항.** D-61이 자체 구현을 이미 잠갔으므로 이 세션은 라이선스 페이지를 직접 열어 확인하지 않았다(훈련 지식 기반 `[ASSUMED]`로만 남김). 결정에 영향 없음.
5. **`moneyColumns()` 스프레드 헬퍼의 Drizzle 타입 추론 정확성.** 실제로 `drizzle-kit generate`를 이 헬퍼로 돌려보지 않았다 — 계획 단계 태스크로 검증 필요.

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — 이미 설치·고정된 버전만 사용, 재검증 완료(package.json)
- Architecture: HIGH — 4계층·단일 지점 패턴은 리포에 이미 존재하는 3개 페이즈 분량의 선례(domain/code-tables, domain/permissions, domain/settings)에서 직접 읽어 도출
- Money 컬럼 설계(Drizzle numeric): HIGH(컬럼 동작) / MEDIUM(공용 컬럼 헬퍼 패턴, 미실측)
- 카운터 동시성: MEDIUM — Postgres 잠금 이론은 공식 문서로 확인, Drizzle 풀 동시 트랜잭션 배정은 미확인
- 클립보드 붙여넣기: MEDIUM — 일반 원칙은 웹서치로 확인, 이 프로젝트의 실제 Excel 데이터로 검증 안 됨
- 인트라넷 추출·변환: LOW — 실제 덤프 스키마 미확인(Gap 1)

**Research date:** 2026-09-22
**Valid until:** 이 페이즈 계획·실행 기간 동안 유효(리포 내부 패턴은 코드가 바뀌지 않는 한 안정적, 30일 추정). 외부 라이브러리 관련 내용 없음(신규 의존성 0)이라 외부 변화 리스크 낮음.
