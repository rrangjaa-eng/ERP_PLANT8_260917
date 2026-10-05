# Deferred items — Phase 05

## 05-06 (2026-10-04)

- `test/e2e/safari-width-headroom.spec.ts:22`(@768 · @1280) — 설정 화면 `증빙 크기 한도` 행의 입력 칸 x가 라벨 열 + `--s-2`에서 20px 어긋난다(값 옆 정적 글자 `MB` 행 모양 추정). 05-06은 설정 화면 · 그 키를 건드리지 않았다(keys.ts 변경은 회사 대납 기본값 둘뿐). 격리 실행에서도 재현 — 05-06 범위 밖.
- 같은 묶음 실행에서 `quote-table.spec.ts:1524` · `single-column.spec.ts:158`은 전체 실행 부하에서만 실패하고 격리 실행에서 통과(흔들림 추정).

## 05-09 웨이브 11 검토 수정 (2026-10-05)

- `test/e2e/mobile-w5-review-fixes.spec.ts:47`(폰 320) — `/admin/code-tables?tableKey=project_status` CLS 0.1958(한도 0.1). 기준 498ebf82의 화면 파일(ui/confirm-dialog · ui/toast · 지출결의 · 연차 행동 줄)로 되돌려 `--repeat-each=3`으로 돌려도 같은 값으로 3/3 실패 — 이 수정 범위 밖(코드표 화면을 건드리지 않았다). 375는 통과.
  - **해결(05-16, 0bc648bb · e963076a):** 원인은 05-03이 코드표 선택 링크를 셋에서 넷(지급 방식)으로 늘린 것 — 폰 320에서 링크 줄이 글꼴 도착 전(두 줄) · 후(한 줄)로 다시 접혀 줄 아래가 60px 움직였다(origin/main은 링크 셋이라 CLS 0.024로 통과). `.tableNav`를 폰 2칸 격자로 고정(0bc648bb). 같은 화면의 `mobile-code-tables.spec.ts` 글자 간격 단언도 05-15 `.pendingSlot` 때문에 측정 상자만 어긋나 있어 라벨 span으로 한정(e963076a). `--repeat-each=3` 통과.

## 05-16 (2026-10-05)

- `test/integration/expense-pick.test.ts` 「번호 있는 문서는 같은 프로젝트 줄만 · 번호 있는 팀 비용 문서는 줄로 옮길 수 없다(F6)」 — 번호 있는(제출된) 문서에 `changeExpenseLine`을 부르면 기대한 `번호 있는 문서 · 같은 프로젝트 줄만` 대신 `ExpenseNotFoundError(없는 지출결의 · 새로 고침)`가 난다. 기준 4f99b079(05-16 변경 전)에서도 같은 값으로 실패 — 05-16 변경 밖. 후보 원인: 05-09에서 고칠 수 있는 문서 판정(`findEditableExpense`)이 제출된 문서를 먼저 거르는 순서가 되었다(F6 기대 문구가 그 앞 판정이었음). 시험이 맞는지 판정이 맞는지는 가리지 않았다.
  - **해결(15364fa9):** 깨뜨린 커밋은 9d1893e7(05-09) — c8f485f3 통과 · 9d1893e7 실패로 확인. `changeExpenseLine`이 `findEditableExpense`(번호 문서는 반려 · 회수만 편집 가능, 05-09-PLAN ①)를 쓰게 되어 결재 중 문서는 없는 문서가 된다. 제품이 맞고 05-07 시험 준비(제출 직후 결재 중 문서)가 05-09 규칙에서 무효였다 — 두 문서를 제출 뒤 되돌리기 회수하게 고쳐 F6 판정까지 닿게 했다(같은 프로젝트 판정 줄을 지우면 실패함을 확인). 05 통합 파일 21개 3004건 통과.

## 05-11 웨이브 13 검토 수정 (2026-10-05)

- 정산 결재를 올린 담당 PM이 없어지면(퇴사 · 비활성 · 계급에서 projects/write 회수) 반려 · 회수된 정산 결재를 아무도 다시 올릴 수 없다 — PM 바꾸기 기능 때 해결
  status: open
  **What:** Opus 검토 05-11 F2(MEDIUM, 추론). 다시 올리기는 엔진이 `viewer === instance.drafterId`, 종류 훅이 「지금 담당 PM ∧ projects/write」를 둘 다 요구한다(`domain/settlements/index.ts` · `domain/approvals/index.ts:388`). 직접 완료는 전원 차단이라 탈출구가 없어 프로젝트가 정산에 고정된다. 지금 PM 교체 경로가 없어 퇴사 · 권한표 변경으로만 생긴다.
  **Decision:** 사용자 확정(10/5 16:15) — 지금은 그대로 두고 PM 바꾸기 기능을 만들 때 해결한다(검토 선택지 (a)).
- `/admin/holidays` 연도 링크 줄은 데이터로 길이가 늘어난다 — 폰에서 넷 이상이 되면 SYSTEM.md §3 「폰 탭 줄(넷 이상) 2열 격자」(DECISIONS 2026-10-05) 대상이다. 지금은 flex wrap 그대로.
  status: open

## 05-15 (2026-10-04)

- `test/e2e/quote-revisions.spec.ts:675` 「차수 열기」 … — 이전 차수 읽기 표 머리글(`quoteLineReadColumns`)에 현재 표의 맨 끝 `행동` 머리글(05-05 행 행동 열, `showColumn` 계급)이 없어 `thead th` 목록 비교가 어긋난다. 05-15 변경 밖(머리글 · 열 판정 불변). 후보 수정: 단언에서 `행동` 제외(읽기 표는 이전 차수라 행동 열이 없는 게 맞음). 05-05 이후 계속 실패였는지는 8df5e714에서 돌려 확인하지 않았다.
