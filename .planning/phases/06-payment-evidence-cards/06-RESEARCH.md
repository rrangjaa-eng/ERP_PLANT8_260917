# Phase 6: 지급·증빙·법인카드·구매 요청 (경영관리) - Research

**Researched:** 2026-09-24
**Domain:** 사내 ERP 도메인 로직 — 결재 통과 건 지급 처리, 증빙 확인·면제, 법인카드 사용·구매 요청, 완료 전 미결 점검. 새 외부 라이브러리 채택이 아니라 기존 4계층(`app/→domain/→repositories/→db/`) 위에 규칙·스키마를 얹는 작업이다.
**Confidence:** MEDIUM — 이 페이즈가 직접 다루는 코드(`domain/money`·`domain/rules/gate`·`domain/corp-cards`·`domain/revenue`·`domain/settings`)는 main에서 전부 실측했다(HIGH). 그러나 이 페이즈가 의존하는 Phase 4(다섯 상태 전환·조정 줄·계약 금액 파생)·Phase 5(지출결의 문서·증빙 업로드 경로)·Phase 04.1(결재 상태값)은 아직 main에 없고 브랜치의 계획 문서에만 있다(MEDIUM~LOW, 아래 의존 가정 표로 명시).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

결정 번호는 D-6xx 블록을 쓴다 — Phase 4·5가 D-1xx를 계속 쓰고 Phase 7~11 논의가 병렬로 돌아 번호가 겹치지 않게 페이즈별 블록을 나눴다.

**이미 확정된 입력 (다시 묻지 않음 — 출처가 정본):** 지급 게이트 둘(결재 미통과 불가·증빙 필수 on이면 증빙 없는 건 불가)은 `domain/rules.gate` 단일 진입점, 지급 완료된 견적 줄은 잠김, 지급 완료액 = 실제 이체액(부가세 포함·원천징수 차감 후) → `grossFromTotal()` 역산·차이 표시 — `docs/inputs/phase-06-payment.md` §4, ROADMAP 기준 1. 증빙: 10MB(설정)·이미지·PDF만·SHA-256 중복·폰 사진 최대 변 2000px JPEG, 증빙 금액(공급가) = 확정 비용, 떼면 예상으로 복귀 — 입력 §5. 증빙 면제는 경영관리가 혼자 닫는다. 사유·닫은 사람·시각을 행동 로그에 남기고 금액은 비용에 그대로 든다 — 입력 §5. 선결제: 표시·사유(자유 입력) 필수, 증빙 기한 14일(설정), 기한 초과는 독촉 알림만(Phase 7)이고 처리는 막지 않는다 — 입력 §6. 법인카드: 직원은 자기 카드·자기 팀 카드 등록, 견적 줄 / '견적 외 비용' / 팀 비용 중 하나 연결 필수(팀 비용은 사용일 소속 팀 자동), 경영관리 대리 등록은 결재 없이 「경영관리 등록」 표시 — 입력 §7. 구매 요청: 결재 없음, 견적 줄 협력사가 설정 키 '온라인구매'면 구매 요청만·그 밖이면 지출결의만(사람이 고르지 않음), 경영관리 1명이 법인카드로 구매 → 구매 완료 → 카드 사용 건 연결, 상태 신청/구매 완료/취소, 번호는 생성 시 `26001-C0001` — 입력 §8. 미결 점검: 미결 지출결의·미매칭 견적 줄·매출 미입력을 `rules.gate`로 막는다. 강행 허용 설정 키 셋(`project.force_complete.allow_*`)은 이미 있고 기본값 false(강행 불가) — 입력 §9, `domain/settings/keys.ts`. 지급 방식 3종(계좌이체·법인카드·현금) — 입력 §3. 세금 계산은 `domain/money.applyTaxRule()`·`grossFromTotal()` 호출만, 이 페이즈는 계산을 새로 쓰지 않는다 — ROADMAP 기준 1·2·3. 완료 뒤에도 경영관리는 결재 통과 건의 지급 완료·조정 줄 추가를 할 수 있다 — Phase 4 D-47·D-83.

**경영관리 운영:**
- **D-601:** 경영관리 부재 시 대행 규칙을 두지 않는다. 경영관리가 자리를 비우면 지급·증빙 확인·구매 완료는 돌아올 때까지 멈춘다. 대표 대행·임시 권한 기능을 만들지 않는다. 권한표(Phase 3)의 기본값도 바꾸지 않는다.
- **D-602:** 증빙 금액(공급가)은 PM이 첨부할 때 적고, 경영관리가 지급 전에 「증빙 확인」을 누른다. 경영관리는 확인하면서 금액을 고칠 수 있고, 고친 값·전 값·사람·시각이 행동 로그에 남는다. 증빙 금액이 확정 비용이 되는 시점(EVID-03)은 PM이 적은 순간이다 — 확인은 검수 표시이지 비용 우선순위의 새 단계가 아니다.
- **D-603:** 증빙 필수 규칙(EVID-02)의 기본값은 켬이다. 선결제 표시된 건과 경영관리가 면제한 건은 이 게이트에서 예외다.

**지급 완료:**
- **D-604:** 지급 완료는 지급 대상 목록에서 여러 건을 골라 한 번에 처리한다. 각 건의 이체액 칸은 계산된 지급 총액(`applyTaxRule()`의 payable)이 기본값이고, 실제로 다른 건만 고친다. 게이트는 건마다 판정하고, 막힌 건은 이유와 함께 남기고 나머지는 처리한다(일괄 전체 실패가 아님).
- **D-605:** 실제 이체액이 계산값과 다르면 차이를 표시하고 사유 한 줄을 필수로 받는다. 비용은 바뀌지 않는다(증빙 > 승인액 > 실행가, PNL-02). 이체 수수료 같은 차액을 비용으로 넣으려면 경영관리의 조정 줄(D-83)을 쓴다.
- **D-606:** 지급 완료는 경영관리가 사유를 적고 취소할 수 있다. 취소하면 견적 줄 잠금(EXP-06)이 풀리고 문서는 지급 전 상태로 돌아가며, 사유·사람·시각이 행동 로그에 남는다. 완료된 프로젝트에서도 경영관리의 지급 처리 예외(D-47)와 같은 범위에서 가능하다.

**법인카드·구매 요청:**
- **D-607:** 카드 사용 금액은 전표의 결제 합계로 적고 공급가는 서버가 역산한다(`grossFromTotal()` + 증빙 종류 규칙). 「통장·카드에서 실제 나간 돈은 합계로 적는다」는 OV-3 원칙을 지급 완료액과 똑같이 적용한다. 이 점에서 EXP-15의 「사람은 공급가액만 적는다」에 카드 사용이 예외가 되므로, 계획 단계에서 REQUIREMENTS EXP-07/EXP-15·ROADMAP 기준 3 문구를 `gsd_run`으로 맞춘다. 구매 완료 시 경영관리가 적는 카드 금액도 결제 합계다.
- **D-608:** 직원의 카드 사용 등록에는 결재가 없다. 저장 즉시 연결한 곳(견적 줄 / 견적 외 비용 / 팀 비용)의 비용에 든다. 결재 모듈의 문서 종류는 지출결의·연차·정산 결재 3종 그대로다(Phase 5 D-99와 같은 결).
- **D-609:** 견적 줄 하나는 「지출결의 쪽」 또는 「카드 쪽(카드 사용·구매 요청)」 중 한 쪽에만 연결된다. 같은 쪽 안에서는 여러 건을 허용한다(카드로 여러 번 나눠 결제, 분할 지급 회차 등). 반대쪽 연결은 서버가 막는다(EXP-07 이중 계산 차단, 판정은 `rules.gate`). 지급 방식이 법인카드인 지출결의는 지출결의 쪽으로 보고 카드 사용 건을 따로 만들지 않는다.

**매출 세금계산서 발행 요청 (Phase 5 D-99):**
- **D-610:** PM은 프로젝트 상세 매출 섹션에서 금액·희망 발행일·메모를 적어 발행을 요청한다. 여러 번 요청할 수 있다(선금·잔금 분할 발행). 요청은 경영관리 화면에 뜨고, 경영관리가 매출 발행 줄(Phase 4 매출 칸)을 입력해 요청에 연결하면 요청이 닫힌다. 결재 문서가 아니다. 상태는 요청/발행됨/취소 정도로 계획이 정한다.

**완료(정산) 전 미결 점검 (PROJ-06 + Phase 5 D-100):**
- **D-611:** 「미결 지출결의」 = 결재 중·반려 상태 문서 + 증빙 없는 문서(면제 제외, 선결제도 증빙이 없으면 포함). 결재 통과했지만 지급 안 된 문서는 막지 않는다 — 완료 뒤에도 경영관리가 지급할 수 있기 때문이다(D-47).
- **D-612:** 「미매칭 견적 줄」 = 실행가가 0이 아닌데 지출결의·카드 사용·구매 요청이 하나도 연결되지 않은 줄. 연결 금액 합이 실행가와 다른 것은 막지 않는다. '취소' 상태 줄과 경영관리 조정 줄은 점검 대상이 아니다.
- **D-613:** 「매출 미입력」 = 세금계산서 발행 줄이 하나도 없음. 발행 합계와 계약 금액(승인 차수 합계, D-84)의 차이는 막지 않고 점검 화면에 차이만 보여 준다. (카드 답이 도착하지 않아 추천안을 적용했다 — 사용자가 「답 다 했다」고 확인한 뒤 추천대로 정리.)
- 점검 시점: 정산 결재 문서(Phase 5) 기안 전(ROADMAP 기준 4). 강행 허용 설정 키 셋의 기본값 false를 유지한다.

### Claude's Discretion
- 미결 점검을 대표 승인 순간에 한 번 더 돌릴지(기안 뒤 상태가 바뀔 수 있다) — 계획이 정하되 같은 `rules.gate` 규칙을 재사용한다
- 경영관리 작업 화면 구성(지급 대상·증빙 확인·구매 요청·발행 요청을 한 화면 탭으로 둘지 메뉴별로 둘지)은 `/gsd-ui-phase 6`에서 SYSTEM.md §6-1(「이번 주 지급」 그룹)을 기준으로 정한다
- 거래처 계좌번호(Phase 3 암호화 헬퍼)를 지급 목록에서 복호화해 보여 주는 범위·권한 동작
- 카드 사용 외화 결제의 환율 = 카드사 청구 원화 ÷ 외화 금액으로 둘지 등 외화 세부
- 구매 요청 취소 주체(요청자는 구매 전까지, 경영관리는 언제든)와 구매 완료 시 금액 차이 처리
- 증빙 확인·면제·지급 완료·지급 취소의 상태 모델과 낙관적 잠금(Phase 4 04-32 잠금 규약)

### Deferred Ideas (OUT OF SCOPE)
- 선결제 14일 증빙 독촉·대리 등록 시 담당 PM 알림 → Phase 7 알림 규칙(ROADMAP Phase 7 기준 3)
- 지급 예정일 자동 계산·결재 마감 → Phase 7
- 카드사 명세 파일 가져오기로 카드 사용 대사 → 새 기능, 백로그 후보(이번 논의에서 묻지 않음)
- 경영관리 부재 대행 → 만들지 않음(D-601). 운영상 필요해지면 새로 논의
- 회사 대납 세금 계산 방식 기본값(flat vs gross-up)·필요경비 0% 기타소득 22% → 다른 페이즈 소관(Phase 5 EXP-15 또는 Phase 11 CERT-04), 이 페이즈에서 결정하지 않음
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| EXP-06 | 결재 통과 안 한 지출결의는 지급 완료 불가, 지급 완료된 견적 줄은 잠김(이중 지급 방지) | `domain/rules/gate.ts`의 기존 게이트 패턴(`project.completed-lock` 선례) 재사용 — `payment.approval-required` 신규 등록. A-606(결재 상태값)이 전제 |
| EXP-07 | 카드 사용은 견적 줄/견적 외 비용/팀 비용 중 하나 연결 필수, 이중 계산 서버 차단 | D-609 게이트(`card.dual-link-block`), Pitfall 3(서버 판정 필수) |
| EXP-09 | 경영관리 지급 완료 처리, 실제 이체액(합계) 입력 → 공급가 역산, 차이 표시 | `domain/money.grossFromTotal()`(코드 예시 포함), D-604·D-605 |
| EXP-10 | 온라인 구매 요청 흐름(문 가르기·신청/구매완료/취소, 결재 없음) | A-612(카운터 키), D-609 온라인구매 협력사 설정 키, `document_counters` 재사용 |
| EXP-13 | 선결제 표시·사유 필수, 14일 기한 초과는 독촉만(처리 안 막음) | `domain/settings/keys.ts` 신규 키(14일), 독촉 알림 자체는 Phase 7 |
| EXP-16 | 경영관리의 법인카드 사용 대리 등록, PM 화면 "경영관리 등록" 표시 | A-611(신규 스키마), D-608 |
| EVID-02 | 증빙 필수 규칙 on/off(기본 켬), 선결제·면제 예외 | `domain/rules/gate.ts` 신규 규칙, D-603 |
| EVID-03 | 증빙 금액(공급가) = 그 줄의 확정 비용(PM 입력 시점) | A-608(Phase 5 증빙 스키마 의존), D-602(확인은 검수 표시) |
| EVID-04 | 증빙을 떼면 비용이 다시 예상으로 복귀 | A-608, Phase 5 증빙 모듈 확장 |
| PROJ-06 | 완료(정산) 전 미결 점검 3종(미결 지출결의·미매칭 견적줄·매출 미입력), 강행 허용 설정 | `domain/settings/keys.ts`에 이미 등록된 강행 허용 키 3종(`[VERIFIED: domain/settings/keys.ts:192-223]`), D-611~D-613, A-601·A-604(다섯 상태·계약 금액 파생 의존) |
</phase_requirements>

## Summary

Phase 6은 새 프레임워크나 외부 서비스를 들이지 않는다. `domain/money`(`grossFromTotal`·`applyTaxRule`)·`domain/rules/gate`(단일 게이트 진입점)·`domain/settings`(레지스트리)·`domain/corp-cards`·`domain/revenue`·`domain/permissions`(DTO 투영)가 이미 main에 있고, 이 페이즈는 그 위에 지급 완료·증빙 확인/면제·법인카드 사용·구매 요청·미결 점검이라는 **새 도메인 모듈 5~6개**를 얹는다. 핵심 위험은 라이브러리 선택이 아니라 **Phase 4·5·04.1이 아직 미완성**이라는 점이다 — 프로젝트 상태 다섯 값(D-75)·경영관리 조정 줄(D-83)·계약 금액 파생(D-84)은 Phase 4 브랜치(`origin/claude/gsd-progress-e1nzgu`)의 계획에만 있고 main의 실제 스키마는 여전히 네 상태·계약 금액 입력 칸이다. 지출결의 문서·증빙 업로드 경로·결재 상태값은 Phase 5·04.1이 아직 PLAN조차 쓰지 않은(04.1은 계획만, Phase 5는 CONTEXT만) 상태다. 이 RESEARCH는 그래서 "무엇을 쓸지"보다 "무엇이 아직 안정되지 않았는지"를 표로 고정하는 데 무게를 둔다(아래 `## Phase 4·5 의존 가정` 표).

이 페이즈가 새로 쓰는 도메인 모듈은 기존 패턴 셋을 그대로 복제한다: (1) `domain/money.grossFromTotal()`/`applyTaxRule()` 호출만 하고 새 계산식을 만들지 않는다(D-607, EXP-15 5번째 예외), (2) `domain/rules.gate()` 단일 진입점에 규칙을 등록만 한다(증빙 필수·이중 연결 차단·미결 점검), (3) `domain/permissions.project()` DTO 투영 + `registerDto()`로 정보 노출표에 등록한다, (4) `version` 컬럼 낙관적 잠금(04-32 규약)으로 지급 완료·증빙 확인·면제·취소의 동시 조작을 막는다.

**Primary recommendation:** 계획 단계에서 새 스키마 5개(payments/payment_lines, corp_card_usages, purchase_requests, evidence_waivers 또는 evidences 확장, revenue_issue_requests)를 설계하되, 전부 Phase 4의 `quote_lines`·Phase 5의 지출결의 문서·04.1의 결재 인스턴스를 FK로 참조한다는 전제 자체가 Phase 4·5·04.1 머지 전까지 확정되지 않는다는 점을 계획에 명시하고, 실행 착수 게이트를 "Phase 4 머지 완료"로 건다.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 지급 대상 목록·일괄 지급 완료 | API/Backend (`domain/payments`) | Frontend Server(RSC 목록) | 게이트 판정·`grossFromTotal()` 역산은 서버 전용 계산(`plant8/money-boundary` 린트) |
| 증빙 확인·면제 | API/Backend (`domain/evidence` 확장) | — | 행동 로그·낙관적 잠금이 서버 트랜잭션에서만 보장됨 |
| 법인카드 사용 등록(직원·경영관리 대리) | API/Backend (`domain/corp-card-usages`, 가칭) | — | 결재 없음이지만 이중 연결 차단(`rules.gate`)이 서버 판정 |
| 구매 요청 흐름 | API/Backend (`domain/purchase-requests`, 가칭) | — | 문 가르기(온라인구매 협력사 판정)가 서버 로직, 번호 부여가 `document_counters` 트랜잭션 |
| 매출 세금계산서 발행 요청 | API/Backend (`domain/revenue` 확장) | Frontend Server | 기존 `domain/revenue.saveRevenue()`와 같은 트랜잭션 경계 재사용 |
| 완료 전 미결 점검 | API/Backend (`domain/rules.gate`) | Frontend Server(점검 결과 표시) | Phase 5 정산 결재 기안 버튼 앞에 서는 게이트 — 판정은 순수 서버 |
| 견적 줄 상태 열 파생값(지출결의 중·증빙 없음·지급 완료) | API/Backend (리포지토리 조회/집계 쿼리) | Frontend(상태 태그 렌더) | D-64: 저장 컬럼이 아니라 연결 문서에서 파생 — 계산은 서버, 태그 색만 클라이언트 |
| Browser/Client | (해당 없음) | — | 표 편집·붙여넣기 등 클라이언트 상호작용은 Phase 4가 이미 만든 표 컴포넌트를 재사용하고 이 페이즈는 새로 만들지 않는다 |

## Phase 4·5 의존 가정 (Phase 4 뒤 플랜 작성 때 재확인)

이 페이즈의 계획·실행은 Phase 4(진행 중, 브랜치 `origin/claude/gsd-progress-e1nzgu`, 42개 플랜 중 일부만 실행됨)·Phase 5(CONTEXT만 확정, PLAN 없음)·Phase 04.1(계획만, 브랜치 `origin/claude/phase-04.1-plan-1iqtwe`, 미실행)이 끝난 뒤에 시작된다. 아래 표의 모든 항목은 `/gsd-plan-phase 6` 실행 시점에 반드시 재확인해야 한다 — 특히 "Phase 4 브랜치에만 있음"·"계획에만 있음"·"아직 설계 없음" 행은 머지된 실제 코드와 어긋날 수 있다.

| ID | 가정 내용 | 근거(branch:file:line 또는 plan id) | 현재 상태 | 재확인 방법 |
|----|-----------|--------------------------------------|-----------|--------------|
| A-601 | 프로젝트 상태는 다섯 값(수주중·진행·정산·완료·미수주)이고 미결 점검은 "정산" 상태 문서(Phase 5 정산 결재) 기안 전에 돈다 | `origin/claude/gsd-progress-e1nzgu:.planning/phases/04-project-quote-ledger/04-CONTEXT.md` D-75(83행) | Phase 4 브랜치에만 있음 — main의 `db/schema/projects.ts:28`은 여전히 `status` 주석에 "bidding(수주중)·in_progress(진행)·settled(완료(정산))·lost(미수주)" **네 값**만 적고 있다(실측) | Phase 4 머지 후 `db/schema/projects.ts`·`code_items(table_key='project_status')` 실제 값을 다시 읽는다 |
| A-602 | `quote_lines.lineStatus`는 저장 컬럼이지만 "지출결의 중·증빙 없음·지급 완료"는 저장하지 않고 연결 문서(지출결의·카드 사용·구매 요청)에서 매 조회마다 파생한다 | `origin/claude/gsd-progress-e1nzgu:.planning/phases/04-project-quote-ledger/04-CONTEXT.md` D-64(60행) | Phase 4 브랜치에만 있음(결정) — main `db/schema/quote-lines.ts:28-29` 주석 "이 페이즈는 미착수·취소 둘뿐"과 main `domain/quotes/lines.ts:58` `lineStatus: string`은 이 결정을 아직 구현하지 않았다(실측, 값은 두 개뿐) | Phase 5·6 계획 때 파생 쿼리(어느 리포지토리가 담당하는지)를 다시 설계 — Phase 4 머지 후 `domain/quotes/lines.ts` 재확인 |
| A-603 | 경영관리의 "조정" 줄(외화 송금 수수료 등, 견적가 0·실행가 음수 허용, 상태 무관 추가 가능)이 '견적 외 비용'(D-48)과 같은 종류인지 별도 종류인지는 Phase 4 계획이 정한다 | `origin/claude/gsd-progress-e1nzgu:.planning/phases/04-project-quote-ledger/04-CONTEXT.md` D-83(99행, "계획이 정하되") | Phase 4 브랜치에도 미정 — 계획(PLAN.md) 단계에서도 해소 여부 미확인(04-06 재계획 대상으로만 표시) | Phase 4 머지 후 `domain/quotes/` 줄 종류 enum·`db/schema/quote-lines.ts` 실제 컬럼을 읽어 Phase 6의 "구매 요청/카드 사용이 어떤 줄 종류에 연결되는지" 문서화 |
| A-604 | 계약 금액 입력 칸이 없어지고 "계약 금액 = 고객 승인 표시된 현재 차수의 견적 합계(공급가)"로 파생값이 된다 — `projects.contract_*` 컬럼과 `domain/revenue.saveRevenue()`의 계약 금액 쓰기 경로가 제거되거나 파생 표시로 바뀐다 | `origin/claude/gsd-progress-e1nzgu:.planning/phases/04-project-quote-ledger/04-CONTEXT.md` D-84(100행) | Phase 4 브랜치에만 있음(결정, 아직 구현 미확인) — main `db/schema/projects.ts:33-37`·`domain/revenue/index.ts:38·309-322`(PROJECTS_MENU write로 계약 금액 저장)은 D-84 이전 모습 그대로다(실측) | Phase 4 머지 후 `db/schema/projects.ts`(contract 컬럼 존재 여부)·`domain/revenue/index.ts`(계약 금액 쓰기 경로 존재 여부) 재확인. Phase 6의 "완료 전 미결 점검 — 매출 미입력"(D-613)과 "계약 금액 vs 발행 합계 차이 표시"가 이 파생값을 전제로 하므로 실제 구현이 다르면 D-613 로직을 다시 짠다 |
| A-605 | 세금계산서 발행액(`revenue.issued_amount`)은 기획본부(PM)에게도 기본 공개, 입금액(`revenue.paid_amount`)은 기본 숨김 | `origin/claude/gsd-progress-e1nzgu:.planning/phases/04-project-quote-ledger/04-CONTEXT.md` D-85(101행) | Phase 4 브랜치에만 있음 — main `domain/permissions/info-items.ts:51-52`(실측, 인용: `{ key: "revenue.issued_amount", label: "매출 발행액", staffDefault: false }` / `{ key: "revenue.paid_amount", label: "매출 입금액", staffDefault: false }`)는 **둘 다 false**로 D-85 이전 상태다 | Phase 4 머지 후 `domain/permissions/info-items.ts`의 `revenue.issued_amount` staffDefault 값 재확인 — Phase 6의 PM 발행 요청 화면(D-610)이 발행액을 보여줄 때 이 정보 노출표 기본값에 의존한다 |
| A-606 | "결재를 통과했다"는 결재 인스턴스 상태가 `approved`(또는 자기 승인 `self_approved`)인 것을 뜻하며, 상태값 전체는 `draft→submitted→in_review→approved/rejected/withdrawn`이다 | `origin/claude/phase-04.1-plan-1iqtwe:.planning/phases/04.1-approvals-leave/04.1-01-PLAN.md`(19행 must_haves 첫 줄) | 04.1 브랜치의 **계획 문서**에만 있음, 미실행 — `db/schema/approvals.ts`가 이 브랜치에도 아직 커밋되지 않았다(`git ls-tree`로 부재 확인) | 04.1 머지 후 `db/schema/approvals.ts`·`domain/approvals/route.ts`의 실제 상태값·필드명을 재확인하고 Phase 6의 지급 게이트("결재 통과 안 한 건은 지급 불가", EXP-06)가 참조할 정확한 조회 함수(`getApprovalView` 등)를 계획에 못박는다 |
| A-607 | 지출결의 문서는 견적 줄 1개당 1개(분할 지급은 회차별), 제출 시 번호 `26001-0001` 부여, idempotency key로 중복 방지 | `.planning/phases/05-expense-approval-leave/05-CONTEXT.md`(24행, "이미 확정된 입력") | 계획에만 있음 — Phase 5는 PLAN.md가 하나도 없다(`git ls-tree`에 `05-*-PLAN.md` 없음, main·04.1 브랜치 모두) | Phase 5 실행 후 `db/schema/expenses.ts`(가칭) 실제 컬럼·상태값을 재확인. Phase 6의 지급 완료·조정 사유·차이 표시가 이 문서를 UPDATE하므로 스키마가 다르면 영향이 크다 |
| A-608 | 증빙 업로드 경로는 브라우저 축소(최대 변 2000px JPEG) → 서버 검사 → GCS 서명 PUT URL → 브라우저가 GCS 직접 업로드 → 완료 통보 → 서버 메타데이터 재확인 후 `files` 행 생성(SHA-256 중복 감지) — Phase 6은 이 경로 위에 한도·중복·선결제 규칙만 얹는다 | `.planning/phases/05-expense-approval-leave/05-CONTEXT.md`(Claude's Discretion, 46행) · `docs/inputs/phase-06-payment.md` §5(67행) | 아직 설계 없음 — `files` 테이블·GCS 연동 코드가 어느 브랜치에도 없다(main `db/schema/` 목록에 없음, `package.json`에 `@google-cloud/storage` 계열 의존성 없음, 실측) | Phase 5 실행 후 `db/schema/files.ts`(가칭)와 GCS 서명 URL 발급 액션의 실제 시그니처를 재확인. Phase 6의 증빙 면제(행동 로그 필드)·10MB 설정 키가 이 스키마에 어떤 컬럼을 더할지 다시 설계 |
| A-609 | 정산 결재는 **PM이 기안, 대표가 승인**한다(경영관리 기안이 아니다) — `docs/inputs/phase-06-payment.md` §9의 "정산 결재 문서(Phase 5) 기안 전" 문구가 가리키는 기안자는 PM이다 | `.planning/phases/05-expense-approval-leave/05-CONTEXT.md` D-98(34행) | **main에 결정으로 확정됨**(VERIFIED — 이 세션에서 05-CONTEXT.md를 Read로 직접 확인) — 하위 가정이 아니라 이미 해소된 사실이지만, `docs/inputs/phase-06-payment.md` §9(117행)의 "정산 결재 문서(Phase 5) 기안 전" 문구가 D-98 이전에 쓰여 기안자를 명시하지 않아 혼동 가능성이 있다 | 재확인 불필요 — 계획 때 `docs/inputs/phase-06-payment.md` §9 원문 대신 05-CONTEXT.md D-98을 인용한다 |
| A-610 | 견적 줄 상태 열(§7-3·§7-5)의 파생값 5종(미착수·취소·지출결의 중·증빙 없음·지급 완료)에 대응하는 `--danger`/`--warning`/`--accent`/`--success`/`--muted` 색 배정은 아직 SYSTEM.md에 없다(§6-1 예시 화면에 "증빙 없음"·"결재 중" 문구는 있으나 §7-5의 "의미 목록"에 새 값으로 등재되지 않음) | `docs/design/SYSTEM.md` §6-1(330-331행, 실측: `증빙 없음`·`결재 중` 태그 예시) · §7-5(793·796행, 실측: 의미 목록에 이 값들 없음) | 아직 설계 없음 | `/gsd-ui-phase 6`에서 SYSTEM.md §7-5에 새 상태 태그 값을 추가하고 DECISIONS.md에 기록(D-27 절차) |
| A-611 | 법인카드 사용 등록 문서(직원 등록·경영관리 대리 등록)를 위한 새 스키마(가칭 `corp_card_usages`)가 필요하며 `corp_cards`(마스터, main에 이미 있음)와는 별도 표다 | 추론 — main `db/schema/corp-cards.ts`는 카드 마스터(발급사·소지자·팀)만 담고 사용 건(날짜·금액·연결 대상)을 담을 컬럼이 없다(실측, 전체 파일 확인) | 아직 설계 없음 | Phase 6 계획에서 신규 스키마로 설계. `domain/corp-cards/index.ts`(마스터 CRUD)와 이름 충돌을 피해 별도 모듈(`domain/corp-card-usages/` 등)로 분리할지 계획이 정한다 |
| A-612 | 구매 요청 문서 번호의 카운터 키는 `"purchase_request"`가 될 가능성이 높다(확정 아님) | `db/schema/document-counters.ts`(13행, 실측 인용: `counterKey는 문서 종류(예: "expense" · "purchase_request")` — 이것은 **예시 주석**이지 실제 등록된 값이 아니다) | 아직 설계 없음 — 이 문자열은 스키마 주석의 예시일 뿐 코드 어디에도 실제로 쓰이지 않는다(`grep -r "purchase_request" repositories domain` 결과 없음, 재확인 요) | Phase 6 계획에서 `domain/document-numbering/`에 실제 `document_number.purchase_request.*` 키를 등록하며 카운터 키 문자열을 확정한다 |
| A-613 | 매출 세금계산서 발행 요청(D-610, PM이 금액·희망일·메모로 요청 → 경영관리가 발행 줄에 연결해 닫음)은 `revenue_entries`(kind: issue\|payment)와 별도 표 또는 새 kind가 필요하다 | 추론 — main `db/schema/revenue-entries.ts`(18행, 실측: `kind: text("kind").notNull()`, 도메인 코드 `domain/revenue/index.ts`(42행)는 `RevenueEntryKind = "issue" \| "payment"` 둘뿐)에 "요청" 상태를 표현할 자리가 없다 | 아직 설계 없음 | Phase 6 계획에서 신규 표(`revenue_issue_requests` 등) 또는 `revenue_entries`에 상태 컬럼 추가 중 선택 — `domain/revenue/index.ts`의 기존 DTO·정보 노출표 매핑(`REVENUE_DTO_SPEC`)과 충돌 없이 얹는 방법을 계획이 정한다 |

## Standard Stack

이 페이즈는 새 외부 패키지를 설치하지 않는다(`[VERIFIED: package.json 실측]` — `dependencies`에 `@better-auth/drizzle-adapter`·`@google-cloud/cloud-sql-connector`·`@googleapis/sqladmin`·`better-auth`·`drizzle-orm`·`google-auth-library`·`next`·`next-safe-action`·`pg`·`react`·`react-dom`·`zod` 열한 개뿐이고 GCS Storage SDK·엑셀·PDF 등 이 페이즈가 다룰 법한 패키지가 없다 — 그 부재는 이 페이즈가 그것들을 안 쓴다는 뜻이 아니라 **Phase 5가 아직 GCS 업로드 경로를 만들지 않았다**는 뜻이다). 이 페이즈가 실제로 쓰는 것은 전부 기존 `domain/` 모듈 호출이다.

### Core (전부 기존 코드 재사용 — 신규 설치 없음)
| 모듈 | 위치 | 용도 | 왜 표준인가 |
|------|------|------|-------------|
| `grossFromTotal()` | `domain/money/index.ts:124` | 지급 완료액(합계)→공급가 역산, 카드 사용 합계 역산 | D-607·EXP-09가 명시적으로 이 함수 재사용을 요구(새 계산식 금지) |
| `applyTaxRule()` | `domain/money/tax.ts:59` | 증빙 종류별 세금 계산(부가세 가산·원천징수·회사 대납) | `domain/code-tables/tax-rule.ts`의 `TaxRule`을 그대로 받는 유일한 계산 지점(`plant8/money-boundary` 린트가 강제) |
| `gate()` / `registerGateRule()` | `domain/rules/gate.ts:24·32` | 지급 게이트(결재·증빙)·이중 연결 차단·미결 점검 | Phase 4가 세운 단일 진입점(`UnknownGateRuleError`가 등록 누락을 막는다) |
| `project()` / `registerDto()` | `domain/permissions/project.ts`·`domain/permissions/dto-registry.ts` | 새 DTO(지급 대상·카드 사용·구매 요청) 필드 단위 투영 | 누수 스캔 테스트 생성기(D-38)가 이 레지스트리를 순회한다 |
| `getSettingValue()` | `domain/settings/registry.ts` | 새 설정 키(증빙 필수 on/off·10MB·14일·온라인구매 협력사명) 조회 | Phase 3가 세운 레지스트리 — 새 키는 `domain/settings/keys.ts`에 추가만 |

### Supporting
| 모듈 | 위치 | 용도 | 언제 쓰나 |
|------|------|------|-----------|
| `moneyColumns()` | `db/schema/money-columns.ts` | 카드 사용·구매 요청 금액 컬럼 정의 | 새 스키마마다 4컬럼 묶음(통화·외화·환율·원화) 재사용 |
| `withTransaction()` | `lib/db-transaction.ts` | 일괄 지급 완료(D-604, 건마다 게이트 판정 + 부분 성공) | 여러 건을 한 트랜잭션으로 묶을지 건별 트랜잭션으로 할지는 D-604의 "막힌 건은 남기고 나머지는 처리" 요구가 계획을 좌우 — 건별 트랜잭션이 이 요구와 더 맞다(단, 계획에서 확정) |
| `recordAction()` | `domain/action-log/record.ts:118` | 지급 완료·구매 완료·증빙 확인/면제·지급 취소 로그 | `payment_process`(19행)·`purchase_process`(20행)는 이미 등록된 핵심 행동 종류다(`[VERIFIED: domain/action-log/record.ts:19-20]`, 새 종류 추가 불필요). 증빙 확인·면제·지급 취소는 이 목록에 정확히 대응하는 종류가 없다 — `document_update`로 남길지 새 종류를 추가할지 계획이 정한다 |

### Alternatives Considered
| 대신 | 대안 | 트레이드오프 |
|------|------|--------------|
| 새 `domain/payments` 모듈 | `domain/quotes` 확장(견적 줄 도메인에 지급 로직 얹기) | 4계층·단일 책임 원칙과 Phase 4의 "domain은 db를 직접 import하지 않는다" 경계상 별도 모듈이 맞다 — 견적 줄은 Phase 4 소유, 지급은 Phase 6 소유 |
| `applyTaxRule()`의 `withholding` ruleKind로 카드 사용 세금 계산 | 카드 전용 계산 함수 신설 | D-607이 "증빙 종류 규칙"을 그대로 쓰라고 명시 — `applyTaxRule()`은 이미 `incomeType`·기준일을 매개변수로 받아 호출자가 다른 문서 종류에서도 재사용 가능(`[VERIFIED: domain/money/tax.ts:59-64]`) |

**Installation:** 없음(신규 패키지 없음).

## Package Legitimacy Audit

**Required 조건 미해당 — 이 페이즈는 외부 패키지를 설치하지 않는다.** `package.json`을 이 세션에서 직접 읽어 확인했다(`[VERIFIED: package.json 실측]`, 위 Standard Stack 절 인용). Phase 6 계획에서 만약 엑셀 내보내기·PDF 등 새 패키지가 필요하다고 판단되면(예: 구매 요청 인쇄물), 그 시점에 이 게이트를 다시 돈다.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
[PM] --증빙 첨부(공급가 입력, Phase 5)--> [지출결의 문서: 결재 통과]
                                              |
                                              v
                                   [지급 대상 목록] <--- rules.gate("payment.approval-required")
                                   (경영관리, §6-1 재사용)        rules.gate("payment.evidence-required")
                                              |
                       +----------------------+----------------------+
                       |                                              |
                 [증빙 확인/면제] --행동 로그(사유·시각)-->    [일괄 지급 완료]
                 (금액 수정 가능, D-602)                      (건별 게이트 판정, D-604)
                       |                                              |
                       |                                grossFromTotal(이체액) --차이 표시--> [견적 줄 잠금]
                       |                                              |
                       +----------------------+-----------------------+
                                              v
                                    [지급 취소](사유 필수, D-606)
                                    --견적 줄 잠금 해제

[직원] --카드 사용 등록(견적줄/견적외비용/팀비용 중 1)--> rules.gate("card.dual-link-block") --> [비용 반영, 결재 없음]
[경영관리] --대리 등록(같은 경로)--> [PM 알림 표시 "경영관리 등록"(Phase 7 발송)]

[직원] --구매 요청 신청--> 협력사가 '온라인구매' 설정값? --예--> [구매 요청: 신청]
                                              |--아니오--> [지출결의만 열림, 구매 요청 화면에 노출 안 됨]
                         [구매 요청: 신청] --경영관리 법인카드 구매--> [구매 완료] --카드 사용 건 자동 생성--> [비용 반영]

[PM] --매출 발행 요청(금액·희망일·메모, 분할 가능)--> [경영관리 화면] --발행 줄 입력(Phase4 매출 칸)--> [요청 닫힘]

[정산 결재 기안 버튼(Phase 5, PM)] <--- rules.gate("project.pre-settle-check")
                                          ├─ 미결 지출결의(결재중·반려·증빙없음) 0건?
                                          ├─ 미매칭 견적줄(실행가≠0 ∧ 연결문서 0) 0건?
                                          └─ 매출 미입력(발행줄 0건) 아님?
                                          (강행 허용 키 3종, 기본 false — 이미 domain/settings/keys.ts에 등록됨)
```

### Recommended Project Structure
```
domain/
├── payments/              # 지급 대상 조회·일괄 지급 완료·지급 취소(신규)
│   └── index.ts           #   grossFromTotal() 호출, rules.gate 등록 2건(결재·증빙)
├── evidence/               # Phase 5가 만든 증빙 모듈 확장(신규 컬럼: 면제 사유/시각/처리자)
│   └── waiver.ts           #   증빙 면제 — 경영관리 전용, 행동 로그
├── corp-card-usages/       # 법인카드 사용 등록(직원·경영관리 대리) — corp-cards(마스터)와 별도(신규)
│   └── index.ts            #   grossFromTotal() 역산, rules.gate("card.dual-link-block")
├── purchase-requests/      # 구매 요청 신청·구매 완료·취소(신규)
│   └── index.ts            #   문서 번호 부여(document-counters), 온라인구매 협력사 판정
├── revenue/                 # 기존 모듈 확장 — 발행 요청 추가(D-610)
│   └── issue-requests.ts    #   신규 파일, 기존 saveRevenue()와 같은 트랜잭션 경계
├── rules/
│   └── register.ts          # 기존 파일에 미결 점검·증빙 필수·이중 연결 차단 규칙 추가
├── settings/keys.ts          # 기존 파일에 새 키 추가(증빙 필수 on/off, 10MB, 14일, 온라인구매 협력사명)
└── quotes/                   # 기존 모듈 — 상태 열 파생 조회 함수만 추가(A-602 재확인 후)
```

### Pattern 1: 게이트 등록 — 신규 규칙은 `domain/rules/register.ts`에 사이드이펙트 import로 추가
**What:** `registerGateRule({ name, check })`로 등록하고 도메인 모듈이 `import "@/domain/rules/register"`로 불러 등록만 일으킨다.
**When to use:** 지급 게이트(결재 통과·증빙 필수), 카드/지출결의 이중 연결 차단, 완료 전 미결 점검 — 전부 이 패턴.
**Example:**
```typescript
// Source: domain/rules/register.ts:17-24 (main, 실측)
registerGateRule<unknown, ProjectCompletedLockCtx>({
  name: "project.completed-lock",
  check: (_doc, ctx) => {
    if (ctx.status !== "settled") return { allowed: true };
    if (ctx.actorCanAddOutOfQuoteLine) return { allowed: true };
    return { allowed: false, reason: "완료(정산) · 견적 줄이 잠김" };
  },
});
// Phase 6이 같은 파일에 "payment.approval-required" · "payment.evidence-required" ·
// "card.dual-link-block" · "project.pre-settle-check" 를 같은 형태로 추가한다.
```

### Pattern 2: 세금 계산 — `applyTaxRule()`은 항상 호출자가 두 기준일을 넘긴다
**What:** `paymentDate`(원천징수·회사 대납)·`evidenceDate`(부가세)를 호출자가 결정해서 넘긴다 — 함수 내부가 "미지급이면 지급 예정일" 같은 대체 규칙을 갖지 않는다.
**When to use:** 지급 완료액 역산, 카드 사용 합계 역산, 구매 완료 시 카드 금액 역산.
**Example:**
```typescript
// Source: domain/money/tax.ts:59-64, 27-29 (main, 실측)
export type ApplyTaxRuleOpts = {
  paymentDate: Date;
  evidenceDate: Date;
  incomeType?: TaxIncomeType;
};
// "미지급이면 지급 예정일"(EXP-15) 대체 규칙은 domain/money 밖, Phase 6의
// 호출부(domain/payments)가 실제 지급일 유무를 보고 어느 Date를 넘길지 고른다.
```

### Pattern 3: DTO 투영 + 정보 노출표 등록
**What:** 필드 단위 `DtoSpec`을 만들고 `registerDto()`로 누수 스캔 축에 등록한다. 배열 필드는 정보 항목을 통과 못 하면 **키 자체가 DTO에서 빠진다**(빈 배열이 아니다).
**When to use:** 지급 대상 목록·카드 사용 목록·구매 요청 목록 DTO 전부.
**Example:**
```typescript
// Source: domain/revenue/index.ts:131-145 (main, 실측)
export const REVENUE_DTO_SPEC: DtoSpec<RevenueProjectable, RevenueDto> = {
  fields: [
    { key: "contract", from: "contract", infoItem: "project.value" },
    { key: "issuedEntries", from: "issuedEntries", infoItem: "revenue.issued_amount" },
    // ...
  ],
};
registerDto({ name: "RevenueDto", fields: REVENUE_DTO_SPEC.fields.map(...) });
```

### Anti-Patterns to Avoid
- **`domain/money` 밖에서 금액 산술:** `plant8/money-boundary` type-aware 린트가 이미 켜져 있다(`[VERIFIED: domain/money/index.ts:1-9 주석]`) — 지급 완료액 차이 계산·카드 합계 역산도 전부 `domain/money` 함수 호출로만 한다.
- **게이트 판정을 화면 코드(`app/`)에 두는 것:** Phase 4가 `rules.gate()` 단일 진입점을 세운 이유가 "증빙 필수·마감·legacy 면제는 이후 페이즈가 등록만 한다"(`domain/rules/gate.ts` 헤더 주석)이다 — Phase 6이 새 `if` 분기를 화면에 심으면 이 계약을 어긴다.
- **`corp_cards`(마스터)와 카드 사용(트랜잭션 행)을 한 표에 넣는 것:** 마스터는 Phase 3 소유·이미 데이터가 있다(main에 실제 서비스 중). 사용 건을 이 표에 컬럼 추가로 넣으면 카드 하나당 사용 이력이 여러 줄이어야 하는 요구(EXP-07 "여러 건 허용")와 1:N 관계를 표현할 수 없다.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| 지급 완료액→공급가 역산 | 새 나눗셈 공식 | `domain/money.grossFromTotal()` | D-607·EXP-09가 명시적으로 요구, 반올림 지점이 이미 하나로 고정됨(D4) |
| 증빙 종류별 세금 계산 | 카드 전용 계산 로직 | `domain/money/tax.applyTaxRule()` | 규칙 4종(없음/부가세/원천징수/회사대납)이 이미 구현·테스트됨(Phase 4) |
| 동시 수정 충돌 방지 | 수동 락 또는 타임스탬프 비교 | `version` 컬럼 + `UPDATE ... WHERE version = $1` 패턴(04-32 규약) | Phase 4가 이미 이 패턴으로 견적 줄·매출 줄에 적용, 지급 완료·증빙 확인/면제·지급 취소도 같은 동시성 위험(경영관리 1인이지만 여러 탭·기기 가능) |
| 문서 번호 부여 | 자체 시퀀스 | `document_counters` 행 잠금(`UPDATE ... RETURNING`) | Phase 4가 `(counter_key, period)` PK로 세운 규약, 구매 요청 번호(`26001-C0001`)가 같은 카운터를 쓴다 |
| 행동 로그 | 별도 감사 테이블 | `domain/action-log.recordAction()` | `payment_process`·`purchase_process`가 이미 등록된 핵심 종류 |

**Key insight:** 이 페이즈가 "새로 만들 것"은 스키마(표 5개 안팎)와 그 표를 잇는 게이트 규칙뿐이다. 계산·잠금·로그·번호 부여 인프라는 전부 Phase 3·4가 이미 만들어 둔 단일 지점을 재사용한다 — 이 재사용 규율을 깨는 것이 이 페이즈에서 가장 흔할 위험(예: 카드 사용 합계 역산을 `applyTaxRule()` 대신 직접 구현)이다.

## Common Pitfalls

### Pitfall 1: Phase 4 브랜치 상태를 최신으로 가정하고 계획을 굳히기
**What goes wrong:** `04-CONTEXT.md`가 D-75~D-95로 다섯 상태·조정 줄·계약 금액 파생을 이미 "결정"으로 적어 두어서, 계획 단계에서 이것이 이미 코드에 구현됐다고 착각하기 쉽다.
**Why it happens:** CONTEXT.md는 계획 문서이지 실행 완료 증거가 아니다. Phase 4는 42개 플랜 중 일부만 실행됐다(main에 반영된 것은 04-01·02·04·05 근처까지로 보인다 — `[VERIFIED: git log ac862cf 기준 main의 domain/projects, db/schema/projects.ts 실측]`).
**How to avoid:** 이 RESEARCH의 `## Phase 4·5 의존 가정` 표를 계획 단계에서 다시 한번 Phase 4 머지 커밋 기준으로 재확인한다.
**Warning signs:** 계획서에 "D-75 다섯 상태를 가정하고 `status === '정산'`으로 게이트를 짠다"처럼 브랜치에만 있는 값을 곧바로 문자열 리터럴로 박는 것.

### Pitfall 2: EXP-15("사람은 공급가액만 적는다")와 D-607(카드는 결제 합계를 적는다)의 충돌을 문서에서 안 고치고 코드만 짜기
**What goes wrong:** REQUIREMENTS.md EXP-15·EXP-07 본문과 ROADMAP 기준 3이 D-607 이전 문구 그대로 남아 있으면, 나중에 `/gsd-verify-work`나 코드 리뷰에서 "요구사항과 다르다"는 오탐이 난다.
**Why it happens:** D-607 자체가 "계획 단계에서 REQUIREMENTS EXP-07/EXP-15·ROADMAP 기준 3 문구를 `gsd_run`으로 맞춘다"고 명시했다(06-CONTEXT.md 45행).
**How to avoid:** 계획의 첫 작업으로 `gsd_run`을 통해 REQUIREMENTS.md·ROADMAP.md 문구를 D-607에 맞게 갱신한다(수동 편집 금지, Phase 4 D-41 선례와 같은 절차).
**Warning signs:** 계획서에 "EXP-15 위반이지만 D-607이 예외"라고만 적고 REQUIREMENTS.md는 그대로 두는 것.

### Pitfall 3: 견적 줄 하나에 지출결의 쪽·카드 쪽이 동시에 연결되는 경로를 막는 게이트를 문서 저장 시점이 아니라 화면 노출 시점에만 두기
**What goes wrong:** D-609는 "반대쪽 연결은 서버가 막는다"고 명시한다. 화면에서 "카드 사용 등록" 버튼을 이미 지출결의가 연결된 줄에서 숨기는 것만으로는 안 된다 — 03-CONTEXT.md D-40 사례(권한표와 무관하게 `?editId=<보관된 id>` 직접 접근을 서버가 막아야 했던 선례)와 같은 패턴이다.
**Why it happens:** UI 숨김은 방어의 절반일 뿐이고, 서버 액션 자체가 이미 존재하는 문서와의 견적 줄 소유권을 재확인해야 한다.
**How to avoid:** `rules.gate("card.dual-link-block")`가 견적 줄 id로 기존 연결 문서 종류를 조회해 판정하도록 설계하고, 이 판정을 화면이 아니라 카드 사용 등록·지출결의 제출 두 서버 액션 모두에서 호출한다.
**Warning signs:** 게이트 함수가 `ctx`로 "화면이 이미 필터링한 목록"만 받는 시그니처.

### Pitfall 4: 미결 점검(D-611~D-613)의 세 조건을 하나의 SQL로 합치려다 "게이트 이유가 건마다 다르다"는 요구를 잃기
**What goes wrong:** PROJ-06은 "이유와 함께 막는다"고 명시한다. 세 조건(미결 지출결의/미매칭 견적줄/매출 미입력)을 한 쿼리·한 boolean으로 합치면 사용자가 "왜 막혔는지" 볼 수 없다.
**Why it happens:** `rules.gate()`가 단일 `GateDecision`(`{allowed, reason}`)을 돌려주는 시그니처라, 조건 셋을 하나의 게이트 규칙 안에서 순차 판정하고 첫 번째 걸린 이유만 반환하기 쉽다.
**How to avoid:** 계획에서 "막힘 화면이 세 조건 각각의 미결 건수·목록을 보여준다"는 요구(ROADMAP 성공 기준, D-611~613)를 게이트 하나가 아니라 점검 결과 DTO(세 조건 각각의 결과 배열)로 설계하고, `rules.gate()`는 그 DTO를 보고 최종 allow/block만 판정하게 분리한다.
**Warning signs:** `check()` 함수가 `reason: string` 하나만 반환하는데 화면 요구는 다중 항목 목록.

## Code Examples

### 지급 완료액 역산 (D-607·EXP-09가 요구하는 패턴)
```typescript
// Source: domain/money/index.ts:124-127 (main, 실측)
export function grossFromTotal(totalKrw: number, vatRate: number, unit: RoundingUnit, method: RoundingMethod): number {
  const raw = totalKrw / (1 + vatRate);
  return round(raw, unit, method);
}
// Phase 6 domain/payments가 실제 이체액(totalKrw)을 받아 이 함수로 공급가를
// 역산하고, 계산값(문서의 payable)과 차이가 있으면 D-605대로 사유를 필수로 받는다.
```

### 입금액 역산 시 "재계산 오차는 조정하지 않는다"는 계약을 그대로 따르는 예
```typescript
// Source: domain/revenue/index.ts:83-95 (main, 실측) — 이미 같은 문제(합계→공급가 역산 후 오차)를 푼 선례
async function computeGrossFromPayment(totalKrw, entryDate, deps) {
  const grossKrw = grossFromTotal(totalKrw, vatRate, unit, "round");
  const recomputedVat = round(grossKrw * vatRate, unit, "round");
  const recomputedTotal = grossKrw + recomputedVat;
  return { grossKrw, recomputeDeltaKrw: recomputedTotal - totalKrw };
}
// Phase 6의 지급 완료 차이 표시(D-605)·카드 사용 합계 역산(D-607)이 이 함수를
// 그대로 재사용하거나 domain/payments에 같은 패턴으로 복제한다.
```

## State of the Art

이 페이즈는 프레임워크·라이브러리가 진화하는 영역이 아니라 사내 업무 규칙 구현이라 "구식 vs 최신 접근"이 적용되지 않는다. 유일하게 해당하는 항목은 260907(구 인트라넷)과의 비교뿐이다.

| Old Approach (260907) | Current Approach (Phase 6) | When Changed | Impact |
|---|---|---|---|
| 경영관리 부재 시 대표 대행(대표 권한으로 직접 처리, 로그에 대표 이름) | 대행 없음 — 경영관리 복귀까지 처리 중단(D-601) | 06-CONTEXT.md 2026-09-24 | 계획에 대행·임시 권한 기능을 넣지 않는다. 운영 공백 리스크는 사용자가 알고 선택한 트레이드오프 |
| Y/N 승인 표시 4개(상태 컬럼 없음) | 결재 인스턴스 상태값 열거형(04.1, draft~withdrawn) | Phase 4.1 설계 | Phase 6은 "결재 통과"를 문자열 비교(`status === '승인'`류)가 아니라 04.1이 노출할 조회 함수로 판정해야 한다(A-606) |

**Deprecated/outdated:** 없음 — 260907은 참고만 하고 코드·화면을 계승하지 않는다(CLAUDE.md·REQUIREMENTS.md Out of Scope 표 "260907 코드 재사용" 행).

## Assumptions Log

> Phase 4·5·04.1 의존 가정(A-601~A-613)은 위 전용 표에 있다. 아래는 그 표에 들어가지 않는, 이 페이즈 자체의 설계 재량에 관한 가정이다.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| AS1 | 일괄 지급 완료(D-604)는 건별 트랜잭션이 낫다(막힌 건은 이유와 함께 남기고 나머지는 처리) — 전체를 한 트랜잭션으로 묶으면 이 요구를 만족할 수 없다 | Standard Stack "Supporting" `withTransaction()` 행 | 계획에서 한 트랜잭션으로 잘못 설계하면 "부분 성공" 요구(D-604)가 깨져 재작업 필요 |
| AS2 | 증빙 확인/면제·지급 취소는 새 `CoreActionType`을 추가하지 않고 기존 `document_update`로 남긴다 | Standard Stack "Supporting" `recordAction()` 행 | 감사 추적에서 "증빙 확인"과 "일반 수정"을 구분 못 하면 ADMN-10(핵심 로그 필터)이 요구하는 세밀도에 못 미칠 수 있다 — 계획에서 새 종류 추가 여부를 사용자 확인 필요 |
| AS3 | 카드 사용 등록(`domain/corp-card-usages`)은 마스터 모듈(`domain/corp-cards`)과 이름이 겹치지 않는 별도 도메인 모듈로 분리한다 | Recommended Project Structure | 한 모듈에 합치면 CRUD(마스터)와 트랜잭션(사용 건)의 권한 메뉴(`admin.corp-cards` vs 일반 직원 쓰기)가 뒤섞여 권한표 설계가 꼬일 수 있다 |

**Note:** 이 표가 비어 있지 않다 — AS1~AS3는 사용자 확인이 필요하다. A-601~A-613(별도 표)은 Phase 4·5·04.1 완료를 기다리는 항목이라 이번 확인이 아니라 "다음 계획 착수 시 재확인"이 처방이다.

## Open Questions

1. **Phase 4가 실제로 어디까지 main에 머지됐는가**
   - What we know: `git log`(main HEAD `ac862cf`)는 Phase 04.5(화면 항목 관리) 삽입까지 진행됐고 STATE.md(main)는 "current_phase: 4, current_plan: 5, total_plans: 26"으로 오래된 스냅샷이다. 실제 브랜치(`origin/claude/gsd-progress-e1nzgu`)는 플랜이 42개(04-01~04-51, 결번 있음)로 늘어나 있다.
   - What's unclear: main에 이미 머지된 Phase 4 플랜이 몇 개인지, D-75~D-95(2026-09-23 추가 결정)가 반영된 플랜이 머지됐는지.
   - Recommendation: `/gsd-plan-phase 6` 실행 직전에 `git log --oneline main` 최신 상태와 `origin/claude/gsd-progress-e1nzgu`의 머지 여부를 다시 확인한다. 이 RESEARCH는 이 세션 시점(2026-09-24, main HEAD `ac862cf`) 기준이다.

2. **경영관리 조정 줄(D-83)과 견적 외 비용(D-48)이 결국 같은 종류인가**
   - What we know: D-83이 "계획이 정하되, 화면 라벨은 「조정」"이라고 미뤘다.
   - What's unclear: Phase 6의 카드 사용·구매 요청이 조정 줄에도 연결될 수 있는지(연결 대상 후보에 포함되는지).
   - Recommendation: Phase 4 계획/실행이 이 종류를 확정하면 Phase 6 계획에서 "구매 요청/카드 사용이 연결 가능한 견적 줄 종류" 목록에 조정 줄 포함 여부를 명시한다.

3. **정보 노출표 새 항목 이름 — 지급·카드·구매 요청 금액을 몇 개의 `infoItem`으로 나눌 것인가**
   - What we know: 기존 패턴은 세분화된 편(`revenue.issued_amount`·`revenue.paid_amount`처럼 발행/입금을 나눔).
   - What's unclear: 지급 완료액·카드 사용 금액·구매 요청 금액을 하나의 `payment.amount`로 묶을지, 기존 `quote.amount`(견적·실행가·차익)에 얹을지.
   - Recommendation: 계획 단계에서 `domain/permissions/info-items.ts`에 등록할 신규 키 목록을 먼저 정하고 누수 스캔 테스트가 자동으로 걸리게 한다.

## Environment Availability

해당 없음 — 이 페이즈는 Phase 1이 이미 구성한 인프라(Cloud SQL·Cloud Run·Secret Manager)만 쓰고 새 외부 서비스를 도입하지 않는다. GCS(증빙 업로드)는 Phase 5의 책임이라 이 페이즈가 새로 확인할 의존성이 없다.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest(`[VERIFIED: vitest.config.ts 존재 실측]`) + Playwright(`[VERIFIED: playwright.config.ts 존재 실측]`) |
| Config file | `vitest.config.ts` · `playwright.config.ts` (둘 다 리포 루트) |
| Quick run command | `pnpm test`(단위→통합→E2E 순, CLAUDE.md 명령 절) |
| Full suite command | `pnpm test` + `CI=true pnpm build && pnpm test:e2e`(CLAUDE.md "로컬 dev 통과는 완료 신호가 아니다" 규칙) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXP-06 | 결재 미통과 지출결의는 지급 완료 불가, 지급 완료된 줄은 잠김 | unit(`domain/rules/register.ts` 새 규칙) | `pnpm vitest run test/unit/domain/rules` | ❌ Wave 0(신규 규칙 테스트 파일) |
| EXP-07 | 카드 사용은 견적줄/견적외비용/팀비용 중 하나 필수, 이중 연결 서버 차단 | integration | `pnpm vitest run test/integration/corp-card-usages` | ❌ Wave 0 |
| EXP-09 | 지급 완료액 역산·차이 표시 | unit(도메인 순수 함수) | `pnpm vitest run test/unit/domain/payments` | ❌ Wave 0 |
| EXP-10 | 구매 요청 문 가르기(협력사 설정값)·신청/구매완료/취소 상태 | integration | `pnpm vitest run test/integration/purchase-requests` | ❌ Wave 0 |
| EXP-13 | 선결제 표시·사유 필수, 14일 초과는 독촉만(처리 안 막음) | unit + integration | `pnpm vitest run test/unit/domain/payments` | ❌ Wave 0 |
| EXP-16 | 경영관리 대리 등록, PM 화면 "경영관리 등록" 표시 | integration | `pnpm vitest run test/integration/corp-card-usages` | ❌ Wave 0 |
| EVID-02 | 증빙 필수 규칙 on/off, 선결제·면제는 예외 | unit | `pnpm vitest run test/unit/domain/rules` | ❌ Wave 0 |
| EVID-03 | 증빙 금액 = 확정 비용(PM 입력 시점), 확인은 검수 표시 | integration(Phase 5 증빙 모듈 확장) | `pnpm vitest run test/integration/evidence` | ❌ Wave 0(Phase 5 파일 자체가 아직 없음) |
| EVID-04 | 증빙 떼면 비용이 예상으로 복귀 | integration | `pnpm vitest run test/integration/evidence` | ❌ Wave 0 |
| PROJ-06 | 완료 전 미결 점검 3종, 강행 허용 설정별 | integration + E2E | `pnpm vitest run test/integration/pre-settle-check` / `pnpm test:e2e` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm vitest run <해당 파일>`(빠른 단위 검증)
- **Per wave merge:** `pnpm test`(단위→통합→E2E 전체)
- **Phase gate:** `CI=true pnpm build && pnpm test`가 초록이어야 `/gsd-verify-work` 진입(CLAUDE.md 규칙)

### Wave 0 Gaps
- [ ] `test/unit/domain/payments/` — 지급 완료액 역산·차이 계산 단위 테스트(EXP-09)
- [ ] `test/unit/domain/rules/` 확장 — 증빙 필수·이중 연결·미결 점검 게이트 규칙 단위 테스트
- [ ] `test/integration/corp-card-usages.test.ts` — 카드 사용 등록·대리 등록·이중 연결 차단
- [ ] `test/integration/purchase-requests.test.ts` — 문 가르기·신청/구매완료/취소
- [ ] `test/integration/evidence.test.ts` — 확인/면제/취소(Phase 5 파일 확장 전제, Phase 5 완료 후 착수)
- [ ] `test/integration/pre-settle-check.test.ts` — 미결 점검 3종 + 강행 허용 키
- [ ] `test/integration/leak-scan.test.ts` 확장 — 신규 DTO·액션 등록(기존 파일에 항목 추가, `[VERIFIED: 04.1-01-PLAN.md files_modified에 이미 이 파일이 등장 — 같은 파일을 여러 페이즈가 누적 확장하는 패턴 확인]`)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | 아니오 | Phase 1이 이미 처리(better-auth) — 이 페이즈는 관여 없음 |
| V3 Session Management | 아니오 | 동일 |
| V4 Access Control | 예 | `can()`/`visible()`/`scopeFor()` 세 함수만(D-35, Phase 3) — 지급 처리·구매 완료는 경영관리 계급 전용 메뉴 권한(`can(viewer, 'payments', 'write')` 류)으로 게이트. **대리 등록이 결재 없이 즉시 비용 반영**(D-608·EXP-16)되는 경로이므로 이 액션의 쓰기 권한을 경영관리로 좁게 스코프해야 한다 — 잘못 넓히면 아무 직원이나 "경영관리 등록" 표시로 비용을 조작할 수 있다 |
| V5 Input Validation | 예 | Server Action은 전부 `authedActionClient` + zod 스키마(Phase 1 규약). 증빙 면제 사유·지급 취소 사유·차이 사유는 "자유 입력 필수" 항목이라 빈 문자열 거부 zod 검증이 필요 |
| V6 Cryptography | 아니오(이 페이즈 직접 해당 없음) | 거래처 계좌번호 복호화는 Phase 3의 `APP_DATA_KEY_v1` 헬퍼를 재사용만 한다(신규 암호화 로직 없음) — Claude's Discretion 항목("거래처 계좌번호를 지급 목록에서 복호화해 보여주는 범위")에서 기존 헬퍼 호출만 하도록 계획이 명시해야 한다 |

### Known Threat Patterns for 이 스택

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| 이중 지급(같은 견적 줄에 지출결의+카드 사용 동시 연결) | Tampering | `rules.gate("card.dual-link-block")` 서버 판정, 화면 숨김만으로 불충분(Pitfall 3) |
| 권한 없는 사용자의 경영관리 대리 등록으로 비용 조작 | Elevation of Privilege | 결재 없는 경로(D-608)는 쓰기 권한 메뉴를 경영관리로 좁게 한정, 서버 액션에서 매 호출마다 `can()` 재확인(캐시된 클라이언트 상태 신뢰 금지) |
| 지급 취소 남용(사유 없이 반복 취소→재처리로 이중 지급 우회) | Repudiation / Tampering | D-606이 사유 필수·행동 로그 명시 — `version` 낙관적 잠금과 결합해 동시 취소·재처리 경합도 막는다 |
| 거래처 계좌번호 마스킹 우회(지급 목록에서 과다 노출) | Information Disclosure | `vendor.account_number_unmasked` 정보 항목(`[VERIFIED: domain/permissions/info-items.ts:15]`)으로 이미 게이트되는 기존 메커니즘 재사용, 지급 목록 DTO가 이 항목을 안 거치고 계좌번호를 실어 보내지 않도록 계획에서 명시 |

## UI-SPEC 준비 — 화면·표면 목록 (`/gsd-ui-phase 6` 입력)

사실·제약만 정리한다. 레이아웃·탭 구성은 UI-SPEC이 정한다(Claude's Discretion 항목 — "경영관리 작업 화면 구성").

| 화면/표면 | 필요한 것 | 재사용할 기존 화면·컴포넌트 |
|-----------|-----------|------------------------------|
| 경영관리 지급 대상 목록 | 여러 건 선택 + 일괄 지급 완료(D-604), 건별 게이트 이유 표시, 이체액 칸 기본값 = 계산 총액 | `docs/design/SYSTEM.md` §6-1 목록 템플릿(지출결의 목록과 같은 골격 — "이번 주 지급" 그룹 머리글이 이미 §6-1 예시에 있음, 330-331행 실측). PM용 지출결의 목록과 **같은 컴포넌트를 경영관리 범위(전사, "내 것만" 필터 없음)로 재사용**할지, 별도 라우트로 둘지는 UI-SPEC이 정한다 |
| 지급 완료 처리(일괄) 결과 | D-604 "막힌 건은 이유와 함께 남기고 나머지는 처리" — 다섯 상태 중 PARTIAL(§7-7 825행: "계산 불가 N건"과 같은 배지 패턴) | §7-7 PARTIAL 행 패턴(표 컴포넌트의 "오류 셀 붉게 고정 + 합계 행 `오류 1칸 · 전부 거부`" 대신 "막힘 N건 · 이유 보기"로 문구만 바꾼 변형이 필요 — 새 패턴이면 DECISIONS.md에 기록 후 SYSTEM.md 개정) |
| 증빙 확인/면제 | 금액 수정 가능(D-602, 이전값·현재값 로그), 면제 사유 자유 입력 필수(D-603) | §6-3 폼 화면의 "서버 계산 값은 입력 바로 아래 한 줄" 패턴(408행) 재사용 가능 — 첨부 영역은 §7-10(Phase 5 소유) |
| 지급 취소 | 사유 필수(D-606), 취소 시 문서가 지급 전 상태로 복귀 | §7-8 모달/시트 골격(확인 행동 실패 시 "사유 칸 아래 원인·다음 행동", 827행) |
| 법인카드 사용 등록(직원) | 카드 선택(자기 카드/자기 팀 카드만) + 연결 대상 3종 중 1 | §6-3 폼 템플릿, "바꾸기" 목록 골라내기 패턴(407행, 견적 줄 바꾸기와 같은 골격을 카드 선택에 재사용 가능) |
| 법인카드 사용 등록(경영관리 대리) | 같은 폼이지만 대상자 지정 + "경영관리 등록" 표시(D-608) | 위와 동일 폼 + 대상자 선택 칸 추가 |
| 구매 요청 흐름 | 신청(직원) → 구매 완료(경영관리, 카드 선택 + 실제 결제 합계 입력) → 자동 카드 사용 건 생성 | §6-1 목록(신청 상태별 그룹) + §6-3 폼(신청 폼) — 새 화면 하나(신규, 기존 화면 없음) |
| 매출 세금계산서 발행 요청(PM 신청) | 프로젝트 상세 매출 섹션에 요청 폼(금액·희망일·메모), 여러 번 요청 가능 | Phase 4 UI-SPEC의 프로젝트 상세(§6-2) 매출 섹션 안에 하위 폼으로 추가 — Phase 4가 만드는 발행/입금 표(D-58)와 같은 섹션 |
| 매출 세금계산서 발행 요청(경영관리 처리) | 요청 목록 → 발행 줄 입력 → 요청 닫힘 | §6-1 목록 템플릿(신청 상태 그룹) |
| 완료 전 미결 점검 표시 | 정산 결재 기안 버튼 앞에 막힘 이유 3종(건수·목록), 강행 허용 시 우회 | §7-1 버튼 비활성 + 이유 패턴(UX-06), §7-7 EMPTY/PARTIAL 패턴 — Phase 5가 만드는 정산 결재 기안 화면에 얹는 게이트라 새 화면이 아니라 **기존 화면의 막힘 상태**로 표현 |
| 견적 줄 상태 열 파생값 | 미착수·취소(Phase 4 기존)에 지출결의 중·증빙 없음·지급 완료 3종 추가(D-64) | §7-5 상태 태그(A-610 — 새 값 3종을 의미 목록에 추가 필요), Phase 4의 견적 표(§7-3) 상태 열이 이미 자리를 갖고 있음(`db/schema/quote-lines.ts` `line_status` 컬럼 존재, 값만 확장) |

## Sources

### Primary (HIGH confidence — 이 세션에서 Read로 직접 확인한 main 코드)
- `domain/money/index.ts`, `domain/money/tax.ts` — `grossFromTotal`·`applyTaxRule`·`round`·`moneyColumns` 계약
- `domain/rules/gate.ts`, `domain/rules/register.ts` — 게이트 단일 진입점과 기존 규칙 1건
- `domain/settings/keys.ts` — 기존 설정 키 전체(세율·절사·강행 허용 3종)
- `domain/corp-cards/index.ts`, `db/schema/corp-cards.ts` — 법인카드 마스터
- `domain/revenue/index.ts`, `db/schema/revenue-entries.ts` — 매출 발행/입금 도메인(D-610 발행 요청의 재사용 대상)
- `domain/quotes/lines.ts`, `db/schema/quote-lines.ts` — 견적 줄 상태 열 현재 구현(A-602)
- `db/schema/projects.ts`, `db/schema/document-counters.ts`, `db/schema/vendors.ts` — 스키마 실측
- `domain/action-log/record.ts` — 핵심 행동 종류 목록(`payment_process`·`purchase_process` 확인)
- `domain/permissions/info-items.ts` — 정보 노출표 항목 실제 값(`revenue.issued_amount` staffDefault 확인)
- `package.json` — 의존성 전체(신규 패키지 미필요 확인)
- `docs/design/SYSTEM.md` §6-1·§6-3·§7-5·§7-7 — 목록/폼/상태 태그/다섯 상태 계약

### Secondary (MEDIUM confidence — 다른 브랜치의 계획 문서, 이 세션에서 `git show`로 확인)
- `origin/claude/gsd-progress-e1nzgu:.planning/phases/04-project-quote-ledger/04-CONTEXT.md` — D-41~D-95 전체(다섯 상태·조정 줄·계약 금액 파생 등)
- `origin/claude/phase-04.1-plan-1iqtwe:.planning/phases/04.1-approvals-leave/04.1-01-PLAN.md` — 결재 상태값·트랜잭션 규약(미실행 계획)

### Tertiary (LOW confidence — 미확인 추론)
- A-611(카드 사용 신규 스키마 필요)·A-612(구매 요청 카운터 키)·A-613(발행 요청 신규 표) — 코드 부재를 근거로 한 추론, Phase 6 계획에서 최초 설계

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 전부 main 코드 실측, 신규 패키지 없음이 package.json으로 직접 확인됨
- Architecture: MEDIUM — 이 페이즈 자체의 패턴(게이트·DTO·트랜잭션)은 HIGH, 그러나 이 패턴이 얹힐 Phase 4·5·04.1의 실제 스키마는 MEDIUM~LOW(브랜치 계획 문서 의존)
- Pitfalls: MEDIUM — 실제 코드 근거(D-40 선례, EXP-15/D-607 충돌 등)가 있는 항목과 패턴 추론이 섞여 있음

**Research date:** 2026-09-24
**Valid until:** Phase 4 머지 완료 시점(추정 불가 — Phase 4가 42개 플랜 중 일부만 진행 중이라 날짜 기반 유효기간보다 "Phase 4·5·04.1 머지 여부"가 이 문서의 유효성을 결정한다). 계획 단계(`/gsd-plan-phase 6`) 진입 직전 `## Phase 4·5 의존 가정` 표를 반드시 재확인할 것.
