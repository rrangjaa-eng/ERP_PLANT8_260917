# Deferred items — Phase 05

## 05-15 (2026-10-04)

- `test/e2e/quote-revisions.spec.ts:675` 「차수 열기」 … — 이전 차수 읽기 표 머리글(`quoteLineReadColumns`)에 현재 표의 맨 끝 `행동` 머리글(05-05 행 행동 열, `showColumn` 계급)이 없어 `thead th` 목록 비교가 어긋난다. 05-15 변경 밖(머리글 · 열 판정 불변). 후보 수정: 단언에서 `행동` 제외(읽기 표는 이전 차수라 행동 열이 없는 게 맞음). 05-05 이후 계속 실패였는지는 8df5e714에서 돌려 확인하지 않았다.
