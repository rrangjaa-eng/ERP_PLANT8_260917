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

## 05-13 (2026-10-05)

- 지출결의 폼 미리보기가 서버 오류(예: 공급가액 원화가 금액 상한 `999,999,999,999원`을 넘음)를 받으면 아무것도 바꾸지 않는다 — 계산 한 줄이 이전 값 그대로이고 칸 오류도 없다
  status: resolved (12297ba6 · 시험 08225bd6 — 게이트 감사 D2)
  **What:** `app/(app)/expenses/[id]/expense-form.tsx` 미리보기 효과의 `if (!result?.data) return;` — `previewExpense`가 `금액 상한 초과 · 999,999,999,999원 이하`를 던지면 serverError만 오고 화면에 안 나온다(05-13 임시 통합 실측: USD 7,407,407,407 × 1,350). 저장 · 제출 때는 오류가 난다. 05-13 범위 밖(05-06 미리보기 동작) — 독립 DOM 감사 · `/qa` 판단에 넘긴다.
- 로컬에서 `CI=true pnpm playwright test <mobile-* 스펙>`을 `--project … --no-deps` 없이 돌리면 mobile-375의 의존 사슬(desktop 전체)이 따라 돈다 — 05-13이 한 번 그렇게 돌려 desktop 20건 실패(w14-fixes · master-edit · permissions-grid · people · quote-table · roles · reserves · settlement-approval · single-column 등, 공유 erp_test 전체 실행)를 보고 중단했다. 원인 조사 안 함(전체 E2E는 CI 몫) — CI가 빨간불이면 그때 본다.
  status: open
- `test/e2e/mobile-expense-form.spec.ts:265` 「1280×800 D2 … D1 증빙 행 썸네일 radius 0」이 05-13 회귀 실행에서 한 번 `썸네일 radius` 폴링 시간 초과(받은 값 "")로 실패했다 — 같은 때 `pnpm test:unit`이 함께 돌아 기계가 붐볐고(`deploy-sh.test.ts`도 5초 시간 초과 · 단독 59 통과), 단독 `--repeat-each=3`은 9/9 통과. 스펙이 올리는 동안에만 있는 미리보기 `<img>`를 잡는 경합 구조다(05-13 변경 — 첨부 버튼 글자 묶음 — 과 무관). CI에서 다시 나오면 미리보기 행을 붙잡는 방법(업로드 지연 route)으로 고친다.
  status: resolved (a6374d5d — 게이트 감사 #4). 원인: 미리보기 `<img>`는 올리는 행에 약 0.4초(실측 380~776ms)만 있고 서버 목록이 새로 그려지면 클립 칸으로 바뀐다(UI-SPEC S4, 제품은 맞다). 스펙이 그 창을 폴링으로 쫓아 기계가 붐비면(CPU 부하 12 프로세스: 15번 중 4번 실패) 창이 지난 뒤에 읽었다. 서버 액션을 풀 때까지 붙잡아 행이 올리는 중으로 머물게 한 뒤 읽는다 — 같은 부하 15/15.

## 05 /review 배치 A — 고치지 않음 (2026-10-05)

- `upload_intents`에 files와 같은 CHECK(owner_kind · sha256 형식 · 크기 > 0)가 없고 완료되지 않은 · 만료된 의도 행을 지우는 코드가 없다 — 마이그레이션이 필요해 Phase 6 F8 고아 정리와 함께 한다. 출처: data-migration(`db/schema/files.ts:46` · `:48`, INFORMATIONAL). status: open
- 완료 증빙 객체마다 거는 `temporaryHold`를 `removeEvidence`가 풀지 않는다 — Phase 6 F8 고아 정리가 객체를 지우려면 hold 해제가 먼저여야 한다(F8 정리 계약에 짝으로 넣는다). 출처: red-team(`lib/gcp/storage.ts:356`) · adversarial F8. status: open
- 중복 증빙 검사의 sha256은 클라이언트 선언값이라 GCS가 바이트로 검증하지 않는다(F5) · 업로드 의도 발급에 사용자별 개수 · 빈도 상한이 없다 — 중복 검사는 편의 기능(우회해도 피해는 중복 첨부뿐) · 30명 내부 사용이라 이번에 고치지 않는다. 출처: security(`lib/gcp/storage.ts:311` · `domain/evidence/index.ts:226`, INFORMATIONAL) · adversarial F5. status: open

## 05 /review 재검토 cycle 2 — 고치지 않음 (2026-10-05)

- 업로드 완료 통보의 멱등(A10)이 의도 id가 아니라 같은 주인 · 올린 사람 · sha256 · 크기 · 의도 뒤 생성으로 파일을 찾는다(`repositories/files.ts` `findAliveFileOfIntent`) — 의도와 파일을 잇는 열이 없어서다. 지금은 같은 주인 중복 검사가 같은 파일 두 번을 막아 안전하고, 틀려도 같은 내용의 파일을 돌려준다. Phase 6 `upload_intents` 정리(마이그레이션) 때 `files.intent_id`를 더해 의도 id로 찾는다. 출처: adversarial-cycle1 F9. status: open
- 지운 작성 중 문서 되돌리기(`restoreOwnerFilesRemovedAt`)는 기간 제한 없이 그 삭제가 뗀 파일 행을 되살린다 — Phase 6 F8 고아 정리가 `removed_at` 행의 객체를 먼저 지우면 바이트 없는 행이 되살아난다. F8 정리 계약에 「주인이 지워진(soft delete) 행은 되돌리기 창 뒤에만 정리」를 넣는다. 출처: adversarial-cycle1 F10 · rereview 4. status: open
- 같은 모양의 달력 날짜 검사 복사본(`domain/people/index.ts` · `domain/org/index.ts`)은 C2(0000년 거부)를 받지 않았다 — 이번 PR 범위 밖(언급만). 출처: adversarial-cycle1 F2. status: open
- 견적 줄 문서를 만들거나 줄을 바꿀 때(`createExpenseFromLines` · `changeExpenseLine`) 줄 거래처의 기본 증빙 종류가 보관 · 비활성 코드여도 그대로 채운다 — 제출은 C4의 「쓰지 않는 증빙 종류 · 증빙 종류 고르기」로 막혀 돈 결함은 아니다. C5는 거래처 바꾸기(`changeExpenseVendor`)만 고쳤다. status: open

## 05-15 (2026-10-04)

- `test/e2e/quote-revisions.spec.ts:675` 「차수 열기」 … — 이전 차수 읽기 표 머리글(`quoteLineReadColumns`)에 현재 표의 맨 끝 `행동` 머리글(05-05 행 행동 열, `showColumn` 계급)이 없어 `thead th` 목록 비교가 어긋난다. 05-15 변경 밖(머리글 · 열 판정 불변). 후보 수정: 단언에서 `행동` 제외(읽기 표는 이전 차수라 행동 열이 없는 게 맞음). 05-05 이후 계속 실패였는지는 8df5e714에서 돌려 확인하지 않았다.
