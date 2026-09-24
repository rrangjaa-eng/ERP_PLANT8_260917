# Phase 10: 팀 손익·연간 목표·인센티브·화면 항목 추가 - Context

**Gathered:** 2026-09-24
**Status:** Ready for planning (착수는 Phase 9 뒤)

<domain>
## Phase Boundary

팀장이 자기 팀의 손익(팀 프로젝트 손익 합 − 미수주 비용 − 팀 직접 관리비)과 연간 목표 달성률을 보고, 대표·경영관리가 팀별 인센티브 금액을 확인하며, 관리자가 코드 없이 프로젝트·견적 줄·거래처에 입력 칸(텍스트/숫자/날짜/선택)을 추가한다.

요구사항 5개: PNL-07, GOAL-01, GOAL-02, GOAL-03, ADMN-07.

**범위 밖:** 프로젝트 손익 계산·effectiveCost 식·매출 기준·연도 귀속 설정 자체(Phase 9 — 이 페이즈는 공유만 한다), 개인별 인센티브 배분(D10-09), 인센티브 지급 확정·스냅샷(D10-10), 공통비 배부·인건비(PROJECT.md 확정 제외).

**착수 시점:** Phase 9 뒤. 팀 손익·목표·인센티브는 전환일 이후 새 시스템 데이터로만 계산된다(2026-09-23 사용자 수용).

**2026-09-24 페이즈 분리:** 커스텀 필드 관리 화면·칸 정의 저장 구조(`label`·`archived_at`)·보관(D10-12)·정보 노출표 자동 등록(D10-13)은 Phase 04.5 「화면 항목 관리」로 옮겼고 결정은 `.planning/phases/04.5-custom-field-admin/04.5-CONTEXT.md`에 복사했다. 이 부분은 Phase 9를 기다릴 이유가 없어(손익 식·연도 귀속·실입력 데이터를 읽지 않는다) Phase 4와 나란히 진행한다. 이 페이즈에는 팀 손익·연간 목표·인센티브(D10-01~D10-11)와 ADMN-07의 폼 반영 — 04.5가 만든 칸을 프로젝트·견적 줄의 폼·목록·검색·Excel과 거래처 목록·검색·Excel에 붙이는 일 — 이 남는다(`.planning/ROADMAP.md` Phase 10 기준 4). ADMN-07 요구사항 ID도 이 페이즈에 남는다. 아래 결정은 논의 기록으로 그대로 둔다.

</domain>

<decisions>
## Implementation Decisions

**번호 규칙:** Phase 6~11 논의가 스레드별로 동시에 진행되어 연속 번호(D-102~)가 겹친다. 이 페이즈는 `D10-xx`를 쓴다. 앞 페이즈의 D-01~D-101은 그대로 유효하다.

**이 논의의 성격:** 2026-09-24 채팅 스레드에서 선택 카드 13개로 물었다. 12개는 사용자가 추천안을 골랐고, 이익 실적 기준(D10-06)은 사용자가 직접 적어 답했다.

### 이미 정해져 다시 묻지 않은 것 (앞 페이즈·입력 문서에서 이어받음)
- 팀 손익 공식과 구성 요소 정의는 PNL-07·EXP-08 그대로다(미수주 비용 = 미수주로 닫힌 프로젝트의 비용 + 팀 이름 '미수주 비용' 종류 지출, 팀 직접 관리비 = 팀 이름 '팀 관리비' 종류 지출 + 프로젝트 미연결 직원 개인 비용).
- 프로젝트 미연결 개인 비용의 팀은 사용일 시점 소속(`teamAtDate()`, MAST-02).
- 미수주 → 진행 복귀 건은 현재 상태 기준으로 계산한다(Phase 4 D-44).
- 비용 판정은 Phase 9의 effectiveCost 식 하나를 공유한다(ROADMAP Phase 10 기준 1, Eng OV-4). 읽기 시점 계산, 저장 컬럼 없음.
- 연도 귀속은 손익과 같은 설정을 쓴다(GOAL-03). 기본값은 프로젝트 종료일(`docs/inputs/phase-09-pnl.md` §1). Phase 4 D-92가 "인센티브 연도 기준은 Phase 10에서 다시 정한다"고 남겼으나, 인센티브는 목표 달성률에서 나오므로 목표와 같은 연도 귀속을 따른다 — 별도 설정을 두지 않는다.
- 열람 범위: 대표·경영관리 전사, 본부 책임자 자기 본부(`phase-09-pnl.md` §5를 팀 손익·목표에도 적용), 팀장 자기 팀, 기획 PM 비노출.

### 팀 손익
- **D10-01:** **수주중 프로젝트에 쌓인 비용은 팀 손익에서 빼지 않는다.** 팀 손익 화면에 「수주 중 비용 N원」을 참고 숫자로만 따로 보인다. 수주되면 프로젝트 비용이, 미수주로 닫히면 그때 미수주 비용이 된다. (Phase 4 Deferred "수주중 프로젝트의 비용 표시" 해소)
- **D10-02:** **미수주 비용의 연도는 비용마다 사용일의 해다.** 팀 관리비와 같은 규칙이다. 미수주 건은 종료일이 없을 수 있고(D-49·D-82) 닫은 날은 행동 로그에만 있어(D-50) 계산 근거로 쓰지 않는다. 사용일 = 지출결의·카드 사용의 사용일(Phase 5·6 날짜 원본). — **Reversibility:** reversible — 읽기 시점 계산이라 기준 날짜 칼럼만 바꾸면 된다.
- **D10-03:** **팀장은 자기 팀 손익을 건 목록까지 펼친다.** 프로젝트별 수익, 미수주 건별 비용, 관리비 지출 건(프로젝트 미연결 표시 포함, EXP-08) 목록까지 본다. 견적 줄·증빙 같은 근거 줄과 계산식은 보지 않는다(대표·경영관리만, PNL-04 원칙). DTO 투영으로 강제하고 누수 스캔 대상에 넣는다.

### 연간 목표
- **D10-04:** **팀별 연간 목표(매출·이익)는 대표·경영관리가 입력한다.** 팀장은 입력·수정하지 못한다. 수정은 행동 로그에 남는다.
- **D10-05:** **팀장은 자기 팀의 목표·달성률만 본다.** 다른 팀은 보이지 않는다(팀 손익과 같은 범위).
- **D10-06:** **이익 목표와 비교하는 실적은 기본 '팀 프로젝트 수익 합'이다. 관리자가 설정에서 '팀 손익'(미수주 비용·팀 관리비까지 뺀 최종)으로 바꿀 수 있다**(사용자가 직접 적은 답). 설정 키 하나(예: `goal.profit_basis` = `project_profit_sum` | `team_pnl`)이고, 화면에 현재 기준을 표시한다. 인센티브의 이익 달성률(D10-09)도 이 기준을 따른다. — **Reversibility:** reversible — 설정 값.
- **D10-07:** **진행 중 프로젝트는 완료 확정 실적과 나눠 두 숫자로 보인다.** 「확정 실적」(완료) + 「진행 중 예상」(진행·정산, Phase 9 예상 숫자)을 나란히 두고 달성률도 둘로 나눠 보인다(확정 / 확정+예상). 수주중은 넣지 않는다(D10-01과 같은 결).
- **D10-08:** **진행률 = 달성률 옆에 올해 경과율을 나란히 보인다.** 경과율은 오늘 날짜 기준 연 경과 비율(9월 말이면 75%)이다. 월별 목표 입력은 없다 — 목표는 연 1회 매출·이익 두 숫자만 넣는다. 시계는 주입해 테스트한다(Phase 9 기준 6과 같은 결).

### 인센티브
- **D10-09:** **규칙은 이익 달성률 구간표다.** 구간마다 비율을 두고 기준 금액에 곱한다(예: 달성률 100~110% → 초과 이익의 10%). 고정 비율 하나는 구간 하나짜리 표로 표현된다. 규칙은 설정 레지스트리의 이력형 값이고, 귀속 연도에 유효한 규칙으로 계산한다. **계산 단위는 팀 총액까지다** — 개인별 배분은 시스템 밖이다.
- **D10-10:** **인센티브는 계산만 한다.** 늘 현재 숫자로 읽기 시점 계산해 보이고, 확정 버튼·스냅샷·지급 기록은 없다. 지급 확정은 시스템 밖에서 한다. — **Reversibility:** reversible — 확정 스냅샷은 필요해지면 위에 얹는다.
- **D10-11:** 인센티브는 대표·경영관리만 본다(GOAL-02). 정보 노출표 항목 `incentive.amount`가 이미 있다(기획본부 기본 숨김). 팀장·본부 책임자에게도 화면·API·Excel 어디에도 없다. 열람은 행동 로그 대상이다(OPS-05 민감 정보).

### 화면 항목 추가 (커스텀 필드 관리) (관리 화면·보관·노출표 등록 → Phase 04.5로 옮김, 폼 반영은 이 페이즈)
- **D10-12:** **칸 삭제는 보관이다.** 보관한 칸은 입력·목록·검색·내보내기에서 숨고, 이미 입력된 값은 JSONB에 남아 복원하면 다시 보인다(Phase 3 보관함 규약).
- **D10-13:** **추가한 칸은 정보 노출표에 자동 등록된다.** 기본값은 전 계급 보임이고, 관리자가 계급별로 끌 수 있다. 지금 `domain/permissions/info-items.ts`의 `INFO_ITEMS`는 코드 상수 목록이므로, 노출표 열이 이 상수 + `field_definitions`(보관 제외) 두 출처를 합치도록 바뀐다. 누수 스캔도 커스텀 필드 항목을 포함한다. — **Reversibility:** costly — 노출표 격자·`visible()`·누수 스캔 생성기가 동적 항목을 전제하게 된다.

### Claude's Discretion
- 커스텀 필드 표시 이름: `field_definitions`에 `label`(한글 이름) 칼럼이 없다. 관리자는 이름을 적고 `key`는 자동 생성하는 방향 — 새 마이그레이션(`label`·`archived_at`)은 계획이 정한다.
- 필수 칸을 나중에 추가했을 때 기존 행: 새로 만들거나 고칠 때만 요구하고 기존 빈칸은 허용.
- 선택형 칸의 선택지 삭제: 선택지도 보관(새 입력에서 숨김, 기존 값은 그대로 표시).
- 커스텀 칸의 화면 위치: 견적 줄 표는 오른쪽 끝 열, 폼은 기본 칸 아래 묶음, 폰은 P3(접힘). UI 계약에서 확정.
- 목록 검색: 텍스트 칸은 키워드 검색에 포함, 선택 칸은 필터. 정렬용 표현식 인덱스는 실측 후에만(Issue 13).
- 인센티브 구간표 입력 화면의 모양(설정 레지스트리 자동 화면으로 충분한지, 전용 표가 필요한지).
- 팀 손익 Excel 내보내기 열 구성(기준 1: 노출표 적용, 원화 환산 + 원래 통화 병기).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 이 페이즈의 범위·기준
- `.planning/ROADMAP.md` — Phase 10 절(성공 기준 4개 + 트레일링 문단), Phase 9 절(effectiveCost 식·연도 귀속·스냅샷·DTO 투영 규약)
- `.planning/REQUIREMENTS.md` — PNL-07, GOAL-01~03, ADMN-07, 그리고 참조되는 PROJ-04·EXP-08·ADMN-02·OPS-05
- `.planning/PROJECT.md` — "손익이 왜 어려운가"·"정보 노출 원칙" 문단, 결정표(팀 손익 공식·목표/인센티브 열람 범위)
- Phase 10 전용 입력 문서는 `docs/inputs/`에 없다(README가 "Phase 10은 이번 범위가 아니다"라고 명시)

### 앞 페이즈의 결정
- `docs/inputs/phase-09-pnl.md` — §1(매출 기준·연도 귀속 = 종료일), §5(열람 범위: 본부 책임자 = 자기 본부), §3(effectiveCost)
- `.planning/phases/04-project-quote-ledger/04-CONTEXT.md` (브랜치 `claude/gsd-progress-e1nzgu`에서 main보다 앞섬) — D-41·D-44·D-45·D-49·D-50·D-75(프로젝트 다섯 상태)·D-82·D-90·D-92
- `.planning/phases/05-expense-approval-leave/05-CONTEXT.md` (초안 PR #41) — 팀 이름 지출 종류(미수주 비용/팀 관리비), 미연결 개인 비용 = `teamAtDate()`
- `.planning/phases/03-permissions-settings-masters/03-CONTEXT.md` — 설정 레지스트리(이력형/비이력형), 노출표, 누수 스캔 생성기(D-38), 보관함

### 아키텍처
- `docs/ARCHITECTURE.md` — §4-1(판정 함수·`scopeFor`·`project()` 출구), §4-2(`getSettingValue(def, {asOf})`), §4-5(`custom_fields` 규약: `.strict()` 검증, 타입 변경 금지)
- `docs/designs/plant8-erp-roadmap-eng-review-260917.md` — Issue 3(DTO 투영), Issue 13(커스텀 필드 인덱스), OV-4(읽기 시점 계산)

### 디자인
- `docs/design/SYSTEM.md` — 목록·폼 템플릿, §7-3 엑셀식 표(목표 입력 표·견적 줄 표의 커스텀 열)
- `docs/DESIGN.md` §4 — 새 화면 절차

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `domain/custom-fields/build-schema.ts` — `buildCustomFieldsSchema(defs)`가 텍스트/숫자/날짜/선택 4종을 `.strict()` zod로 조립. 관리 화면은 새 검증 코드 없이 이것을 쓴다(기준 4)
- `db/schema/field-definitions.ts` — `(entity, key)` unique, `type`·`options`·`required`·`sort_order`. `label`·`archived_at` 칼럼은 없다
- `domain/permissions/info-items.ts` — `INFO_ITEMS`에 `team.cost`·`target.amount`·`incentive.amount`·`pnl.amount`가 이미 등록(기획본부 기본 숨김). DTO만 붙이면 된다
- `domain/org/index.ts` `teamAtDate(viewer, userId, date)` — 미연결 개인 비용의 팀 귀속
- 설정 레지스트리 이력형 값 — 인센티브 구간표(D10-09), 비이력형 — 이익 실적 기준(D10-06)

### Established Patterns
- 읽기는 `scopeFor(viewer)` 행 필터 + `project(viewer, dto)` DTO 출구. 팀장 = 자기 팀 범위
- 누수 스캔은 런타임 등록 레지스트리(D-38) — 팀 손익·목표·인센티브 DTO와 Excel 함수를 등록
- 금액 산술은 `domain/money`만, 원화 정수·서버 단일 반올림

### Integration Points
- 노출표 격자(`domain/permissions/matrix.ts` `visibilityColumns()`)가 `INFO_ITEMS`만 읽는다 — D10-13이 `field_definitions`를 더한다
- Phase 9의 `domain/pnl` 서비스(아직 없음)의 프로젝트별 결과를 팀 합계가 재사용
- 프로젝트 목록·견적 줄 표·거래처 화면의 입력·목록·검색·Excel이 커스텀 칸을 읽는다

</code_context>

<specifics>
## Specific Ideas

- 이익 실적 기준은 사용자가 카드 대신 직접 적었다: "기본은 프로젝트 수익합으로 하되 관리자가 팀 손익으로도 바꿀 수 있게 해" (D10-06)
- 사용자는 선택 카드로 고르는 질문 방식을 원한다(글 목록 질문 거부)

</specifics>

<deferred>
## Deferred Ideas

- 개인별 인센티브 배분 — 급여 영역, v1 밖(D10-09)
- 인센티브 연도 확정·금액 고정 스냅샷 — 필요해지면 D10-10 위에 얹는다
- 월별 목표 입력 — 연 경과율로 대체(D10-08)

</deferred>

---

*Phase: 10-team-pnl-goals-incentive*
*Context gathered: 2026-09-24*
