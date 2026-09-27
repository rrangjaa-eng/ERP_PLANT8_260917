---
quick_id: 260927-ipy
slug: pnl-start-gate-weeks-after-cutover
status: complete
date: 2026-09-27
commits:
  - 5bf2c37
  - d11f1d5
---

# 260927-ipy: 설정 pnl.start_gate.weeks_after_cutover 삭제

손익(Phase 9)을 전환 후 N주 실입력 대신 테스트 데이터로 검증하기로 한 결정(2026-09-27, ROADMAP 5ee66f1)에 따라, 읽는 곳 없이 관리자 설정 화면에만 보이던 "손익 착수 대기 주수" 설정을 지웠다.

## 변경
- `5bf2c37` test: `test/unit/settings/registry.test.ts`에 "SETTING_DEFS에 `pnl.start_gate.weeks_after_cutover`가 없다" 테스트 추가
- `d11f1d5` chore: `domain/settings/keys.ts`에서 정의와 `SETTING_DEFS` 항목 삭제(12줄)

## 검증
- RED: 삭제 전 `expected [...] to not include 'pnl.start_gate.weeks_after_cutover'` 1 failed
- GREEN: `test/unit/settings` 39 passed, `pnpm typecheck`·`pnpm lint` 통과
- 실행 에이전트가 중단 전 `pnpm test:unit` 110 files · 1510 tests 통과를 보고

## 남은 위험
- 이 변경 전에 내보낸 설정 파일을 가져오면 "등록되지 않은 키"로 거부된다. 그 줄을 지우고 가져오면 된다.
- 이미 시드된 DB 행은 남지만 화면·저장 액션이 SETTING_DEFS만 다루므로 영향이 없다.

## 비고
실행 에이전트가 사용자 요청으로 중단돼, 삭제 커밋과 이 요약은 오케스트레이터가 마무리했다.
