---
quick_id: 261002-0jy
status: complete
date: 2026-10-02
commit: 5478f90
files:
  - domain/quotes/lines.ts
  - test/integration/quote-lines-conflict.test.ts
---

# 261002-0jy — #133 Codex P2 후속: 충돌 거래처 이름 묶음 조회

## 한 일
- `writeQuoteLinesInTx`의 `conflictVendorLabel`(줄마다 `findVendorNamesByIds` 1회)을 `conflictsWithVendorNames(candidates)`로 바꿨다. 루프에서 충돌 후보(rowId · baseline · current)를 모으고, 루프 뒤 `gateErrors` 거부 전에 한 번에 conflicts를 채운다(입력 줄 순서 그대로).
- 거래처 칸 충돌 id가 없으면 조회 0회, 있으면 같은 tx로 1회.
- 표시 규칙 그대로: 이름 못 봄 · baseline 없음 · 거래처 칸 변화 없음 · 이름 못 찾음 → 「다른 값」, 비움 → 「—」.
- 쓰기 시점 경합 경로는 같은 함수를 한 줄로 부른다. baseline 없는 폴백은 라벨을 읽지 않으므로 `HIDDEN_CONFLICT_VALUE`를 넘긴다(출력 동일).

## 검증
- RED: 새 테스트 「거래처 칸 충돌 줄이 여럿이어도 … 한 번만 묶어 조회한다」가 수정 전 호출 2회로 실패(나머지 14건 통과).
- GREEN: 견적 줄 통합 7파일(quote-lines-conflict · quote-line-vendor-name · quote-lines-hidden-vendor · quote-lines · quote-line-cap · quote-line-kinds · quote-line-visibility) 112/112.
- `pnpm lint` 0 · `pnpm typecheck` 0.
- 전체 통합·E2E는 돌리지 않았다(CI 몫, CLAUDE.md §5).

## 절차 메모
- gsd-executor 실행이 스킬 관문 훅(현재 페이즈 04.3의 Pre-build 게이트 요구)에 막혀, 사용자 승인을 받아 메인 세션이 같은 계획을 직접 실행했다.
