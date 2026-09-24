# Phase 5: 지출결의·결재·연차 - Context

**Gathered:** 2026-09-24
**Status:** Ready for planning

<domain>
## Phase Boundary

기획 PM이 견적 줄에서 지출결의를 한 화면에서 증빙 첨부까지 끝내 제출하면 결재자가 폰에서 승인·반려하고, 같은 결재 모듈(`domain/approvals`)로 연차와 정산 결재(정산 → 완료)도 처리된다. 요구사항: EXP-01, EXP-02, EXP-03, EXP-04, EXP-05, EXP-08, EXP-14, EXP-15, EVID-01, ADMN-04, LEAV-01, UX-03, UX-06 (`.planning/ROADMAP.md` Phase 5 성공 기준 1~7).

범위 밖: 지급·지급 완료액·법인카드·구매 요청·증빙 한도/중복/선결제 규칙·미결 점검(Phase 6), 알림·SMTP·마감(Phase 7), 손익 스냅샷(Phase 9), 기타소득 확인증(Phase 11).

</domain>

<decisions>
## Implementation Decisions

### 이미 확정된 입력 (다시 묻지 않음 — 출처가 정본)
- 결재선 기본 4단(팀장 → 본부 책임자 → 경영관리 → 대표), 단계 = 계급 × 조직 범위, 제출 시 고정, 사람은 표시 시점 현재 담당으로 해석 — `docs/inputs/phase-05-approval.md` §1, ROADMAP 기준 2
- 빈 자리는 건너뛰고, 전부 비면 대표가 받는다. 결재 없이 통과하는 문서는 없다 — 입력 §2
- 자기 승인 기본값은 문서 종류별 설정: 지출결의·정산 결재 = 본인이 직접 눌러 통과(「본인 승인」 표시), 연차 = 건너뜀 — 입력 §3
- 반려 사유는 자유 입력 필수, 사유 코드표 없음 — 입력 §4
- 연차: 종일 1 · 반차 0.5 · 반반차 0.25 · 재택 0(기록만, 횟수 제한 없음), 회계연도(1월 시작) 부여, 이월 없음, 일수는 관리자 연 1회 설정, 잔여 초과는 막지 않고 경고(신청 창·결재 옆판에 남은/결재 중/이번 신청 일수) — 입력 §5
- 지출결의: 견적 줄 1개 = 문서 1개, 분할 지급은 회차별 문서(회차 합계 ≤ 실행가), idempotency key, 금액 > 0, 공급가액만 입력, 번호는 제출 시 부여(`26001-0001`, 프로젝트 번호와 같은 `document_counters`) — 입력 §6, Phase 4 D-42
- 팀 이름 지출 종류 = 미수주 비용 / 팀 관리비. 미연결 개인 비용은 사용일 기준 소속 팀(`teamAtDate()`) — 입력 §7
- 수주중 프로젝트는 고객 승인 게이트 없이 지출결의 가능(Phase 4 D-43). 연결 문서가 있는 줄의 금액 셀은 읽기 전용(D-66). 폰 시트의 「지출결의 올리기」를 이 페이즈에서 켠다(D-69). 현재 차수 = 최신 차수(D-54)
- 세금 계산은 `domain/money.applyTaxRule()` 호출 하나, 이 페이즈는 계산을 새로 쓰지 않는다 — ROADMAP 기준 7

### 연차 — 입사 첫해 (입력 §9 미정 5-A 해소)
- **D-96:** **입사한 해에는 법정 월차를 자동으로 준다.** 입사일부터 1개월을 채울 때마다 1일, 그해 최대 11일이며, 입사 다음 회계연도 말에 소멸한다(260907의 근로기준법 검토 결과와 같음). 회계연도 연차(관리자 연 1회 설정)와는 별도 잔고로 보인다. — **Reversibility:** costly — 잔고가 두 종류가 되어 신청·결재 옆판·차감 로직이 함께 바뀐다
- **D-97:** **퇴직 시에는 잔여 일수만 보여 주고 금액 정산은 하지 않는다.** 연차 수당 계산은 이 시스템 범위 밖이다.

### 정산 → 완료 결재
- **D-98:** **정산 결재는 PM이 올리고 대표가 승인한다**(Phase 4 D-79 유지). `docs/inputs/phase-05-approval.md` §8과 ROADMAP Phase 5 기준 6의 「경영관리 기안」 문구는 D-79 이전 기록이라 이 결정으로 대체한다 — 계획 단계에서 ROADMAP·REQUIREMENTS 문구를 `gsd_run`으로 맞춘다. Phase 4의 「대표·시스템 관리자 직접 완료」 전환 함수는 그대로 두고 호출자만 결재 승인으로 바꾼다

### Phase 5·6 경계 (Phase 4 Deferred 해소)
- **D-99:** **PM의 매출 세금계산서 발행 요청(D-77)은 Phase 6 경영관리 증빙 화면에서 받는다.** 결재 모듈의 문서 종류는 지출결의·연차·정산 결재 3종 그대로다
- **D-100:** **정산 단계의 지출결의·증빙 마감 점검(D-77)은 Phase 6 미결 점검(PROJ-06)과 함께 한다.** Phase 5의 정산 결재 제출은 이 점검으로 막지 않는다

### 세율 적용 기준일
- **D-101:** **ROADMAP 기준 7의 초안을 설정 기본값으로 둔다** — 원천징수·회사 대납 = 지급일(미지급이면 지급 예정일), 부가세 = 증빙일(없으면 작성일). 경영관리가 나중에 설정 화면에서 바꾼다. 계획 전 경영관리 확인은 받지 않는다

### Claude's Discretion
- 월차 「1개월 채움」 판정은 입사일 기준 매월 같은 날 적립으로 하고 결근 차감은 관리자 수동 조정으로 둔다(시스템에 근태 기록이 없다). 신청 시 차감 순서는 소멸이 빠른 월차부터를 기본으로 계획이 정한다
- 결재 모듈 3표(routes/steps/instances) 스키마 세부, `nextStep()` 시그니처, 문서 종류별 자기 승인 설정 키 모양
- 증빙 업로드 경로(브라우저 축소 + SHA-256 + GCS 서명 URL)는 ROADMAP Phase 5 비고대로 이 페이즈가 만들고, Phase 6은 한도·중복·선결제 규칙만 얹는다
- 연차 신청·승인 화면은 SYSTEM.md에 정본이 없으므로 `/gsd-ui-phase 5`에서 UI 계약을 먼저 세운다

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 범위·요구사항
- `.planning/ROADMAP.md` Phase 5 (기준 1~7, 결재 모듈 비고) — 범위 정본
- `.planning/REQUIREMENTS.md` — EXP-01~05·08·14·15, EVID-01, ADMN-04, LEAV-01, UX-03, UX-06
- `docs/inputs/phase-05-approval.md` — 사용자 문답 입력(§8 기안자는 D-98로 대체)

### 선행 결정
- `.planning/phases/04-project-quote-ledger/04-CONTEXT.md` — D-42·D-43·D-54·D-64·D-66·D-69·D-75~D-80(진행 중 브랜치 최신본 기준)
- `.planning/phases/03-permissions-settings-masters/03-CONTEXT.md` — 계급 5종, 본부·팀 발령 이력, 코드표(증빙 종류·세금 규칙), 설정 레지스트리
- `.planning/STATE.md` Decisions — CEO D3·D4, Eng OV-2·OV-3, 비용이 새는 곳 셋

### 화면
- `docs/design/SYSTEM.md` §6-1(목록) · §6-3(지출결의 폼, 실물 `docs/design/system/form-expense.html`) · §6-6(인쇄) · §7-1 · §7-4 · §7-5 · §7-7 — 연차 화면 정본 없음

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `domain/rules/gate.ts`·`register.ts`: 제출 버튼 비활성 이유·거래처 필수·완료 잠금 판정 — 규칙 추가만
- `domain/money/` (`applyTaxRule`·`toKrw`·`splitWithRemainder`): 금액·세금 계산 전부
- `repositories/document-counters.ts`: 제출 시 번호 부여
- `domain/permissions/` (`can`·`visible`·`scopeFor`·DTO 투영), `domain/settings/registry.ts`, `domain/org` `teamAtDate()`, `domain/code-tables/`, `domain/action-log/`, `domain/archive/`
- `lib/actions/client.ts` `authedActionClient`
- `ui/table`·`ui/form`·`ui/select`·`ui/status-tag`·`ui/next-turn`·`ui/list-empty`·`ui/page-header`·`ui/toast`·`ui/kv-list`·`ui/history-list`

### Established Patterns
- 4계층 `app/ → domain/ → repositories/(viewer 필수) → db/`, 도메인 출구는 DTO만, 금액 산술은 `domain/money` 밖 금지(린트)
- 상태 문서는 version 컬럼 낙관적 잠금, 잠금 트랜잭션 규약은 Phase 4 04-32(ENG-D3)

### Integration Points
- `app/(app)/approvals/page.tsx`, `app/(app)/expenses/page.tsx` — EMPTY 자리만 있음
- 견적 표 「지출결의 올리기」(⌘E·폰 시트), 프로젝트 상태 전환 함수(정산 → 완료 호출자 교체)
- 연차·업로드 코드는 아직 없음

</code_context>

<specifics>
## Specific Ideas

- 월차 규칙은 260907의 근로기준법 검토 결과를 그대로 따른다(D-96)

</specifics>

<deferred>
## Deferred Ideas

- 매출 세금계산서 발행 요청 흐름 → Phase 6 (D-99)
- 정산 단계 마감 점검 → Phase 6 PROJ-06 (D-100)
- 연차 수당 금액 정산 → 범위 밖 (D-97)

</deferred>

---

*Phase: 05-expense-approval-leave*
