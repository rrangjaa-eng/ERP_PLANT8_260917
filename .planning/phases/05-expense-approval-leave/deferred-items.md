# Deferred items — Phase 05

## 05-06 (2026-10-04)

- `test/e2e/safari-width-headroom.spec.ts:22`(@768 · @1280) — 설정 화면 `증빙 크기 한도` 행의 입력 칸 x가 라벨 열 + `--s-2`에서 20px 어긋난다(값 옆 정적 글자 `MB` 행 모양 추정). 05-06은 설정 화면 · 그 키를 건드리지 않았다(keys.ts 변경은 회사 대납 기본값 둘뿐). 격리 실행에서도 재현 — 05-06 범위 밖.
- 같은 묶음 실행에서 `quote-table.spec.ts:1524` · `single-column.spec.ts:158`은 전체 실행 부하에서만 실패하고 격리 실행에서 통과(흔들림 추정).

## 05-09 웨이브 11 검토 수정 (2026-10-05)

- `test/e2e/mobile-w5-review-fixes.spec.ts:47`(폰 320) — `/admin/code-tables?tableKey=project_status` CLS 0.1958(한도 0.1). 기준 498ebf82의 화면 파일(ui/confirm-dialog · ui/toast · 지출결의 · 연차 행동 줄)로 되돌려 `--repeat-each=3`으로 돌려도 같은 값으로 3/3 실패 — 이 수정 범위 밖(코드표 화면을 건드리지 않았다). 375는 통과.

## 05-15 (2026-10-04)

- `test/e2e/quote-revisions.spec.ts:675` 「차수 열기」 … — 이전 차수 읽기 표 머리글(`quoteLineReadColumns`)에 현재 표의 맨 끝 `행동` 머리글(05-05 행 행동 열, `showColumn` 계급)이 없어 `thead th` 목록 비교가 어긋난다. 05-15 변경 밖(머리글 · 열 판정 불변). 후보 수정: 단언에서 `행동` 제외(읽기 표는 이전 차수라 행동 열이 없는 게 맞음). 05-05 이후 계속 실패였는지는 8df5e714에서 돌려 확인하지 않았다.
