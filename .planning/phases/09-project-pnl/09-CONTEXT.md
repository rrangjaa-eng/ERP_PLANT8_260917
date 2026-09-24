# Phase 9: 프로젝트 손익 - Context

**Gathered:** 2026-09-24
**Status:** Ready for planning

<domain>
## Phase Boundary

기획본부·경영관리·대표가 프로젝트마다 같은 네 숫자(견적 / 예상 비용 / 확정 비용 / 수익금액·수익률)를 보고, 경영관리·대표는 근거 줄까지 내려가며, 기획본부는 결과 숫자만 본다. 숫자는 원화 환산액 기준이고 리저브 충당 매출도 같은 숫자에 들어간다. 정산 결재 대표 승인 순간 스냅샷, 역할별 첫 화면, 손익 목록 Excel이 이 페이즈다.

요구사항 10개: PNL-01·02·03·04·05·06·08·09, UX-02, RSV-02. 성공 기준 6개는 `.planning/ROADMAP.md` Phase 9 절.

**범위 밖:** 팀 손익 공식(미수주 비용·팀 직접 관리비, PNL-07)·연간 목표·인센티브(Phase 10), 매출 세금계산서 발행 요청 흐름(Phase 6, Phase 5 D-99), 정산 단계 마감 점검(Phase 6 PROJ-06, D-100), 결재 모듈 자체(Phase 5).

**번호 규칙:** Phase 5까지 D-101을 썼고 Phase 6~11 논의가 동시에 진행 중이라 번호가 겹치지 않도록 이 페이즈는 **D-901부터** 쓴다(Phase 9 전용 구간).

</domain>

<decisions>
## Implementation Decisions

Phase 1~5의 D-01~D-101은 그대로 유효하다. 이번 논의는 사용자가 카드 9장에 직접 답했다(2026-09-24, 전부 권장안).

### 이미 확정되어 다시 묻지 않은 것 (출처)

- 매출 기준 = **세금계산서 발행액**, 수익률 = **소수 첫째 자리 버림**(12.37% → 12.3%), 착수 대기 **2주**(설정) — `docs/inputs/phase-09-pnl.md` §1·§4·§9 (2026-09-18 문답)
- 비용 우선순위 증빙액 > 지출결의 승인액 > 견적 실행가, 프로젝트 비용 = 줄별 공급가액 + 회사 대납 세금(EXP-15) + 견적 외 비용 줄(EXP-16) + 조정 줄(Phase 4 D-83), effectiveCost SQL 식 하나를 목록·Excel·팀 합계·상세(trace)가 공유, 저장은 정산 스냅샷뿐 — PNL-02, Eng OV-4
- 손익 열람 범위: 대표·경영관리 전사, 본부 책임자 자기 본부, 팀장 자기 팀 — `docs/inputs/phase-09-pnl.md` §5
- 계보: 이전 차수 줄의 지출결의·증빙은 현재 차수 대응 줄에서 비용 우선순위를 계산한다 — Phase 4 D-55. 현재 차수 = 최신 차수 — D-54
- 진행 중 분모 fallback: 상세 견적 합 → 사전 견적(총 매출 예상가) → 없으면 '—'(계산 불가) — PNL-03, D-52
- **스냅샷 시점 = PM이 올린 정산 결재(정산 → 완료)를 대표가 승인하는 순간** — Phase 4 D-79, Phase 5 D-98. ROADMAP 기준 5의 「경영관리 기안」 문구는 D-98이 대체했다. 완료 뒤 정정·리저브 충당은 재계산 없이 차이만 표시 — PNL-06, ROADMAP 기준 3
- 프로젝트 상태 다섯 가지(수주중·진행·정산·완료·미수주) — D-75. 「완료(정산)」은 「완료」로 읽는다

### 네 숫자 정의

- **D-901:** **기획 PM(staff)도 프로젝트 상세 상단의 네 숫자 줄을 본다 — 결과 숫자만.** 드릴다운·계산식·근거 id는 없다(DTO 투영으로 타입 수준에서 빠짐, 성공 기준 4). `docs/design/SYSTEM.md` §6-2의 「경영관리·대표만. 기획본부엔 이 줄 자체가 없음」 주석은 PNL-05와 어긋나므로 계획 단계에서 `docs/design/DECISIONS.md`에 이유를 적고 SYSTEM.md를 고친다. 근거: 요구사항 PNL-05·ROADMAP 목표, 그리고 PM은 프로젝트 목록(D-87)에서 이미 수익금·수익률을 본다.
- **D-902:** **매출(분모) 전환 규칙은 프로젝트 목록 규칙과 하나다: 상태가 정산·완료이고 매출 발행 줄(또는 리저브 충당 줄, D-908)이 하나라도 있으면 발행 합계, 아니면 견적(상세 견적 합 → 사전 견적).** PNL-03의 「완료 뒤에만 설정된 매출 기준」 문구를 이 규칙으로 맞춘다(계획 단계에서 REQUIREMENTS·ROADMAP 문구를 `gsd_run`으로 수정). Phase 4 D-87과 그 대체(DR-8·DR-38, `docs/designs/plant8-erp-phase4-design-review-260923.md`)가 원천이다. 근거: 「목록 합계 = 상세 합계」 테스트가 성립하려면 규칙이 하나여야 한다. — **Reversibility:** costly — 목록·상세·Excel·대시보드·스냅샷이 같은 분모 함수를 공유한다
- **D-903:** **수익금액 = 매출(D-902) − 예상 비용. 예상 비용 = 줄마다 effectiveCost(증빙액 > 승인액 > 실행가)의 합 + 대납 세금 + 견적 외 비용·조정 줄.** 수익률 = 수익금액 ÷ 매출, 매출이 0이면 '—'. 확정 비용은 수익 계산에 쓰지 않는다. 근거: 진행 중 수익이 부풀지 않는다.
- **D-904:** **확정 비용 = 증빙이 붙은 금액만의 합**(EVID-03). 결재만 끝나고 증빙이 없는 지출결의 금액은 확정 비용이 아니다. 조정 줄·견적 외 비용 줄·회사 대납 세금은 그 근거 줄이 증빙을 가졌을 때만 확정 비용에 든다(계획이 줄 종류별 판정을 정하되 이 원칙을 지킨다). 예상 비용 − 확정 비용의 차가 사실상 「미증빙·미집행」 규모다.
- Phase 4 목록(D-87)의 「실행가」 열은 Phase 9에서 예상 비용(effectiveCost 합)으로 바꿔 상세와 같은 숫자를 쓴다. 열 라벨은 UI 계약이 정한다(Claude's Discretion).

### 연도 귀속

- **D-905:** **연도별 손익(대시보드 연간 숫자·연도 필터·Excel 연도)은 프로젝트 종료일이 속한 해에 프로젝트 전액을 넣는다.** 매출·비용을 발행일·증빙일로 나누지 않는다. Phase 4 D-90(목록 연간 합계 = 종료일)과 `docs/inputs/phase-09-pnl.md` §1과 같다. Phase 4 D-92가 「대표가 Phase 9에서 다시 정한다」로 남긴 항목을 이것으로 닫는다. 종료일 없는(수주중 「기간 미정」) 프로젝트는 연간 합계에서 빼고 제외 건수를 표시한다(D-90과 같음). 연도 귀속 설정 키(PNL-03)는 남기되 기본값은 종료일이다. 인센티브 연도 기준은 Phase 10에서 따로 정한다.

### 역할별 첫 화면·대시보드

- **D-906:** **경영관리 첫 화면 = 나갈 돈·결재·미증빙(「내 차례」 템플릿, UX-02).** 전사 손익 대시보드(`docs/design/SYSTEM.md` §6-4)는 손익 메뉴에서 연다. 대표 첫 화면 = 전사 대시보드, 팀장 첫 화면 = 자기 팀 대시보드, PM 첫 화면 = 내 프로젝트·내 지출결의. SYSTEM.md §6-4 머리의 「대표·경영관리 첫 화면 = 전사」는 계획 단계에서 DECISIONS.md를 거쳐 고친다.
- **D-907:** **대시보드는 Phase 9에서 프로젝트 손익 합으로 먼저 세운다.** 목표 달성 블록과 팀 손익 공식(미수주 비용·팀 직접 관리비 차감)은 Phase 10에서 채운다. Phase 9의 팀장 대시보드는 「자기 팀 프로젝트 손익 합」이며, 화면에 팀 손익이 아니라 프로젝트 합임을 표시한다(표시 방식은 UI 계약). 대시보드 라벨 「연간 매출 = 견적 합계」 「실행가 = 확정 비용」(SYSTEM.md §6-4)은 D-902·D-903과 어긋나므로 매출 = D-902 분모, 비용 = 예상 비용으로 고친다(DECISIONS.md 경유).

### 리저브 충당 (RSV-02)

- **D-908:** **리저브 충당액은 매출 발행 줄과 똑같이 매출에 더한다**(원화 환산액). D-902의 「발행 줄이 하나라도 있으면」 판정에도 충당 줄이 포함된다. 리저브 입금 쪽에 세금계산서 번호가 붙으므로(Phase 4 D-60) 같은 돈을 두 번 세지 않도록 계획이 확인한다. 잔액 부족 시 잔액·부족액과 함께 막힘(음수 금지) — 확정.

### 노출

- **D-909:** **본부 책임자는 자기 본부 손익 숫자만 보고 드릴다운·계산식은 보지 않는다.** 근거 줄·계산식은 경영관리·대표만. 노출표에 계급으로 등록만 해 두면 임명 시 저절로 열린다(`docs/inputs/phase-09-pnl.md` §5).

### 착수 조건

- **D-910:** **「전환 후 실입력 2주」는 개발 착수 조건이 아니라 직원에게 손익 화면을 여는 조건이다.** Phase 9 개발·테스트는 앞 페이즈가 끝나는 대로 합성 데이터(성공 기준 6의 시계 주입 단위 테스트)로 한다. 전환 후 N주(설정, 기본 2주) 동안 source가 'demo'가 아닌 행이 쌓이기 전에는 손익 화면(네 숫자 줄·대시보드·손익 Excel)이 직원에게 열리지 않고, 관리자 시스템 상태 화면에 남은 기간·실입력 건수가 보인다. 계획 단계에서 ROADMAP Phase 9 「Depends on」 착수 조건 문구를 `gsd_run`으로 맞춘다. — **Reversibility:** reversible — 설정 키와 표시 조건 하나

### Claude's Discretion

- 전년 대비 칩(대시보드 KPI): 데이터 이전이 없어 전년 데이터가 없는 동안 숨긴다. 월별 차트의 월 귀속은 종료월(D-905와 같은 축).
- 확정 비용의 줄 종류별 판정 세부(D-904 원칙 안에서), 목록 열 라벨, 「프로젝트 합」 표시 방식.
- '계산 불가(이유)' 이유 코드 목록: 최소 환율 없음·매출 기준 미입력·분모 없음. 건수는 상세 배지와 관리자 시스템 상태 화면에 더한다(성공 기준 1).
- 스냅샷 저장 형태(표 구조·차이 계산 방식)와 effectiveCost SQL 식 위치(`domain/pnl` 서비스 함수, 성공 기준 4).
- 비용 구성 도넛 항목(SYSTEM.md §6-4 표대로).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 페이즈 범위·요구사항
- `.planning/ROADMAP.md` — Phase 9 절(성공 기준 6개, 연구 플래그, 손익의 출발점 문단), Overview의 Eng OV-1·OV-4 문단
- `.planning/REQUIREMENTS.md` — PNL-01~06·08·09, UX-02, RSV-02, 연관 EVID-03(확정 비용), EXP-15·16, FX-01, PROJ-04
- `.planning/PROJECT.md` — 핵심 가치(같은 네 숫자), 계산식 노출 원칙

### 사용자 입력값
- `docs/inputs/phase-09-pnl.md` — **2026-09-18 문답 확정값.** 매출 기준·연도 귀속·수익률 표기·열람 범위·스냅샷·리저브·첫 화면·착수 조건
- `docs/inputs/phase-06-payment.md` §2(대납 세금 gross-up)·§9(완료 점검 매출 미입력 강행 불가)
- `docs/inputs/phase-04-project-quote.md` §6(리저브 잔액 음수 금지)·§9(사전 견적 선택 입력)

### 앞 페이즈 결정
- `.planning/phases/04-project-quote-ledger/04-CONTEXT.md` — 진행 중 브랜치 `claude/gsd-progress-e1nzgu`가 main보다 앞선다. D-52(사전 견적)·D-54·D-55(현재 차수·계보)·D-57~D-60(매출 칸·리저브)·D-75~D-79(상태 5개·정산→완료)·D-83(조정 줄)·D-84(계약 금액 = 승인 차수 합)·D-85(발행액 PM 공개)·D-87·D-90·D-92(목록 금액 열·연간 합계·연도 기준 이월)
- `docs/designs/plant8-erp-phase4-design-review-260923.md` — DR-8·DR-38(목록 수익금 기준 전환 규칙, D-902의 원천)
- `.planning/phases/05-expense-approval-leave/05-CONTEXT.md` — PR #41. D-98(정산 결재 PM 기안 → 대표 승인)·D-99·D-100·D-101(세율 기준일)

### 디자인
- `docs/design/SYSTEM.md` §6-2(상세 네 숫자 줄 — D-901로 노출 주석 수정 필요)·§6-4(손익 대시보드 — D-906·D-907로 첫 화면·라벨 수정 필요)·§6-1(목록·「내 차례」 첫 화면 템플릿)
- `docs/design/DECISIONS.md` — SYSTEM.md 수정 전 이유 기록 위치
- `docs/designs/plant8-erp-roadmap-eng-review-260917.md` — Issue 3(DTO 투영)·Issue 14(테스트 3계층)·OV-1·OV-4
- `docs/designs/plant8-erp-roadmap-ceo-review-260917.md` — D3(완료 = 정산 결재)·D4(원화 정수·서버 단일 반올림)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `domain/money` — Money 모델·원화 환산·단일 반올림. `applyTaxRule()`(Phase 5 EXP-15)이 대납 세금을 준다
- `domain/permissions` — `scopeFor(viewer)` 행 필터 + `project(viewer, dto)` 투영. 손익 DTO의 trace·근거 id를 staff·팀장·본부 책임자에게서 타입 수준으로 뺀다. 누수 스캔 생성기(D-38)에 손익 DTO × 계급을 등록
- `domain/revenue`·`repositories/revenue-entries.ts` — 발행·입금 줄(D-58). 매출 분모의 원천
- `domain/quotes`·`repositories/quote-lines.ts`·`quote-revisions.ts` — 현재 차수·실행가·조정 줄
- `domain/settings` — 매출 기준·연도 귀속·착수 대기 N주·세율 이력형 설정 키
- `domain/system-status` — '계산 불가' 건수·착수 조건 진행 표시를 더할 자리
- `domain/rules`(gate) — 완료 잠금 게이트

### Established Patterns
- 4계층 `app/ → domain/ → repositories/(viewer 필수) → db/`, Server Action은 `lib/actions/client.ts`의 `authedActionClient`
- 금액 산술은 `domain/money` 밖 금지(린트), 저장 파생 컬럼 금지(Eng OV-4)
- 모든 행에 `source` 컬럼 — 착수 조건(D-910)이 'demo'가 아닌 행을 센다

### Integration Points
- 새 `domain/pnl` 서비스(결과 + trace), effectiveCost SQL 식을 목록·상세·Excel·대시보드가 공유
- 프로젝트 상세 상단 네 숫자 줄(Phase 4가 비워 둠), 프로젝트 목록 금액 열(D-87)
- Phase 5 정산 결재 승인 훅 → 스냅샷 기록
- `/pnl` 메뉴(대시보드)·`/pnl/reserves`(리저브 충당, D-59), `ui/shell/role-menu.ts`의 역할별 첫 화면

</code_context>

<specifics>
## Specific Ideas

- 수익률 표기 예: 12.37% → 12.3%(버림)
- 12월 행사의 계산서가 1월에 나와도 행사 연도(종료일 해) 실적이다
- 본부 책임자 자리는 비어 있어도 노출표에 계급으로 미리 등록한다

</specifics>

<deferred>
## Deferred Ideas

- 팀 손익 공식(미수주 비용·팀 직접 관리비), 대시보드 목표 달성 블록 — Phase 10 (D-907)
- 인센티브 계산의 연도 기준 — Phase 10 (D-905)
- 매출 세금계산서 발행 요청 흐름 — Phase 6 (Phase 5 D-99)
- 정산 단계 지출결의·증빙 마감 점검 — Phase 6 PROJ-06 (Phase 5 D-100)
- 계획 단계 첫 일(이 논의의 산출물 아님): REQUIREMENTS PNL-03(분모 전환 규칙, D-902)·ROADMAP Phase 9 기준 5(정산 결재 기안자, D-98)·「Depends on」 착수 조건(D-910) 문구를 `gsd_run`으로 수정, SYSTEM.md §6-2·§6-4를 DECISIONS.md 경유로 수정(D-901·D-906·D-907)

</deferred>

---

*Phase: 09-project-pnl*
*Context gathered: 2026-09-24*
