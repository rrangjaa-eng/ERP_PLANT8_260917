---
gsd_state_version: '1.0'
status: planning
progress:
  total_phases: 10
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-17)

**Core value:** 기획본부와 경영관리본부가 프로젝트마다 같은 숫자(견적·예상 비용·확정 비용·손익)를 본다. 기획본부는 계산식·근거 없이 결과 숫자로 납득하고, 경영관리·대표는 근거 줄까지 본다.
**Current focus:** Phase 1 — 배포 스켈레톤·로그인

## Current Position

Phase: 1 of 10 (배포 스켈레톤·로그인)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-09-17 — 로드맵 수정: plan-ceo-review 결정 반영(23 findings + D3·D4·D5 + OV-1..8), OPS-06·OPS-07 Phase 1 추가, v1 요구사항 87/87. 10 페이즈, MVP 모드

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: -
- Trend: -

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: 배포 스켈레톤(Phase 1)을 디자인 시스템(Phase 2)보다 앞에 둔다. Phase 1 화면은 임시 로그인·내 계정뿐이고 업무 화면은 없다. Phase 2가 임시 화면을 SYSTEM.md 기준으로 교체한다
- [Roadmap]: 권한 핵심(can/visible/scopeFor)·설정 레지스트리·보관함·행동 로그·`custom_fields` JSONB 규약은 Phase 3에서 세운다. 돈을 보여주는 첫 화면(Phase 4)보다 앞
- [Roadmap]: 지출결의 흐름을 두 슬라이스로 나눈다 — Phase 5(PM 작성·결재자 승인·연차), Phase 6(경영관리 지급·증빙·법인카드·구매 요청·알림). 결재 모듈은 지출결의·연차 두 문서로 범용성을 검증
- [Roadmap]: 데이터 이전(Phase 7)은 인트라넷 패리티(Phase 6) 직후, 손익(Phase 8) 이전. 리허설 2회 이상 뒤 전환
- [Roadmap]: 호스팅은 Cloud Run + Cloud SQL(둘 다 서울) 확정 — 리서치의 Neon(싱가포르) 권고 대신 국내 보관 선택(PROJECT.md)
- [Roadmap]: 통화·환율·원화 환산 금액 모델(FX-01)과 클라이언트별 리저브 대장(RSV-01)은 Phase 4에서 세운다 — Phase 5·6이 지출결의·증빙·법인카드 금액을 넣기 전. 리저브 충당 → 매출 반영(RSV-02)은 매출 기준(PNL-03)이 생기는 Phase 8. 손익·목표·내보내기는 원화 환산액 기준이고 원래 통화를 병기한다
- [CEO 리뷰 D3]: 완료(정산) = 정산 결재 문서(경영관리 기안 → 대표 승인). 결재 모듈은 지출결의·연차·정산 결재 세 문서(Phase 5), 대표 승인 순간 손익 스냅샷(Phase 8). Phase 8의 "정산 시점" 연구 플래그는 이것으로 닫힘
- [CEO 리뷰 D4]: 금액 = 원화 정수 원, 외화 소수 2, 환율 소수 4, 반올림은 서버 단일 함수, 분할 시 마지막 회차 보정(Phase 4 금액 모델)
- [CEO 리뷰 D5=A]: 이메일 = 회사 Google 계정 SMTP(개인 GCP 단계는 개인 Gmail). 환경 변수 4개(host·user·password·from)는 Phase 1에서 정의만, 발송 활성은 Phase 6. 실패는 알림함·관리자 배너
- [CEO 리뷰 OV-1]: 인트라넷 추출·변환(extract/transform) 스크립트는 Phase 4부터 시작해 실제 데이터를 픽스처로 쓴다. Phase 7은 적재·검증·델타 이전·전환. Phase 8 착수 조건은 Phase 4~6 실사용 지표
- [CEO 리뷰 OV-5]: Phase 3은 메커니즘(can/visible/scopeFor, 리포지토리 viewer 투영, 설정 레지스트리, 누수 스캔 테스트 생성기, 보관함, 행동 로그) + 마스터로 좁힌다. ADMN-01/02/03/10의 전 메뉴 검수는 Phase 6 끝 성공 기준(요구사항 매핑은 Phase 3 유지)
- [CEO 리뷰 OV-6]: Phase 7 착수 게이트 = 회사 GCP에서 `scripts/deploy.sh` 1회 성공
- [CEO 리뷰 범위]: HOLD SCOPE — 새 기능 없음. OPS-06(관리자 시스템 상태 화면·JSON 로그)·OPS-07(ARCHITECTURE.md·OPERATIONS.md 각 300줄 상한)만 Phase 1에 추가(85→87)

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 2]: 디자인 절차 문서 `docs/DESIGN.md`(§1→§4)는 리포에 있다(CLAUDE.md 경로와 일치, 52f695a). `docs/design/`(BRIEF.md·EXPLORE.md·SYSTEM.md·tokens.css·DECISIONS.md)은 아직 없으며 Phase 2의 산출물이다 — SYSTEM.md 전에는 업무 화면을 만들지 않는 규칙은 그대로
- [Phase 4]: 11개 요구사항(금액 모델·리저브 대장 포함)으로 5플랜 상한에 닿을 수 있다 — 계획 단계에서 넘기면 리저브 대장(RSV-01)을 별도 페이즈로 뗀다
- [Phase 1]: CLAUDE.md의 스택·명령 자리(`[ ]`)가 비어 있다. Phase 1이 스택(Next.js + Drizzle + Postgres, 패키지 매니저, dev/test/lint/build 명령)을 확정하면 세션 끝에 CLAUDE.md에 한 번에 반영한다(세션 중 수정 금지 규칙)
- [Phase 7]: 착수 게이트가 회사 GCP에서 deploy.sh 1회 성공(OV-6)인데 회사 GCP 프로젝트 준비 시점은 미정 — Phase 6 진행 중에 확보
- [Phase 8]: 정산(완료) 시점은 D3(정산 결재 대표 승인)로 확정. 매출 기준·연도 귀속을 기획본부·경영관리가 합의하는 절차는 여전히 PROJECT.md에 없다 — 계획 단계에서 사용자와 확정. 착수 조건은 Phase 4~6 실사용 지표(OV-1)
- [Phase 10]: CERT 활성화 조건은 `/cso` 보안 감사 통과. 개인정보보호법 적용 범위·보존 기간은 감사에서 재확인(리서치 Gap)
- [All]: 과잉 설계 재발 방지 — 페이즈마다 "인트라넷보다 못한가"로 검증하고, 실제 사용자 로그인·입력이 있어야 완료로 본다

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| *(none)* | | | | |

## Session Continuity

Last session: 2026-09-17
Stopped at: 로드맵 수정(plan-ceo-review 결정 반영: 23 findings·D3·D4·D5·OV-1..8, OPS-06·OPS-07 Phase 1, 87/87), STATE.md 갱신. 오케스트레이터 커밋·사용자 승인 대기
Resume file: None
