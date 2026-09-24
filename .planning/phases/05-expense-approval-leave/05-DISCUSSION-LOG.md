# Phase 5: 지출결의·결재·연차 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-24
**Phase:** 5-지출결의·결재·연차
**Areas discussed:** 입사 첫해 연차, 정산 결재 기안자, 매출 세금계산서 발행 요청, 정산 단계 마감 점검, 세율 적용 기준일

진행 방식: 채팅 스레드라 영역 선택과 영역별 질문을 한 메시지로 묶어 추천안과 함께 제시했고, 사용자가 번호로 답했다(「1.b 2.a 3.a 4.a 5.a」). 나머지 결정은 `docs/inputs/phase-05-approval.md`와 Phase 4 CONTEXT에 이미 있어 묻지 않았다.

---

## 입사 첫해 연차

| Option | Description | Selected |
|--------|-------------|----------|
| a | 관리자가 사람별로 그해 일수를 직접 적는다(추천) | |
| b | 법정 월차 자동 — 1개월 개근마다 1일, 최대 11일, 다음 회계연도 말 소멸 | ✓ |
| c | 첫해 근무 월수 비례 자동 부여 | |

**User's choice:** b
**Notes:** 퇴직 시 잔여 일수만 표시·금액 정산 없음은 제안에 포함해 함께 받았다.

## 정산 → 완료 결재 기안자

| Option | Description | Selected |
|--------|-------------|----------|
| a | PM 기안 → 대표 승인 (Phase 4 D-79, 추천) | ✓ |
| b | 경영관리 기안 → 대표 승인 (입력 §8·ROADMAP 기준 6) | |

**User's choice:** a

## 매출 세금계산서 발행 요청 (Phase 4 D-77)

| Option | Description | Selected |
|--------|-------------|----------|
| a | Phase 6 경영관리 증빙 화면에서 받는다, 결재 문서 3종 유지(추천) | ✓ |
| b | Phase 5 네 번째 결재 문서 | |

**User's choice:** a

## 정산 단계 지출결의·증빙 마감 점검

| Option | Description | Selected |
|--------|-------------|----------|
| a | Phase 6 미결 점검(PROJ-06)과 함께(추천) | ✓ |
| b | Phase 5 완료 결재 제출 때 막는다 | |

**User's choice:** a

## 세율 적용 기준일 기본값

| Option | Description | Selected |
|--------|-------------|----------|
| a | ROADMAP 초안을 설정 기본값으로, 경영관리가 나중에 설정에서 변경(추천) | ✓ |
| b | 계획 전 경영관리 답을 받아 온다 | |

**User's choice:** a

---

## Claude's Discretion

- 월차 적립 판정(입사일 기준 매월 같은 날), 결근은 관리자 수동 조정, 차감 순서
- 결재 모듈 스키마·`nextStep()` 시그니처·자기 승인 설정 키 모양
- 증빙 업로드 경로는 Phase 5에서 만든다(ROADMAP 비고)
- 연차 화면 UI 계약은 `/gsd-ui-phase 5`

## Deferred Ideas

- 발행 요청 흐름·정산 마감 점검 → Phase 6
- 연차 수당 금액 정산 → 범위 밖
