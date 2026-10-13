---
phase: 06-payment-evidence-cards
plan: 16
subsystem: evidence 주인 종류 확장 (차수 승인 증빙 · 리저브 줄 증빙)
status: complete
tags: [EVID-03, D-56, D-60, C4, X-2, E-46, F10, DR-3, O-22, S21, S22]
requires: ["06-11", "06-17", "06-27"]
provides:
  - "05 OWNER_RULES에 quote_revision · reserve_entry 두 줄 — 선택 칸 rights · writeOpen · denyWrite · voidMenu, expense 줄 무변경"
  - "restoreEvidence / getOwnedEvidence (domain/evidence) + markRestored(단일 조건 UPDATE · NOT EXISTS) — F10 되돌리기"
  - "차수 요약 approvalEvidenceCount(quote.amount) · 리저브 줄 evidenceCount · evidenceWritable(reserve.amount) DTO 키"
  - "OwnedEvidenceSection / OwnedEvidenceFiles (app/(app)/expenses/owned-evidence.tsx) — 05 ui/attachments에 새 주인 액션을 묶는 펼침 섹션 · 읽기 전용 파일 행"
  - "S21 승인된 최신 차수 동작 칸 3차 `승인 증빙 {N}` + 이전 차수 읽기 섹션 안 블록, S22 리저브 `증빙` 열 · 표 아래 펼침 · 폰 행 시트 첨부 행"
affects: ["06-25", "06-29"]
tech-stack:
  added: []
  patterns:
    - "트랜잭션 밖 rights(can · visible · 행 범위) + 트랜잭션 안 주인 잠금 뒤 순수 writeOpen 재확인 (06-03 규약)"
    - "표를 감싼 div의 onKeyDownCapture로 격자 포커스 칸 안 [data-cell-action] 누르기 (06-17 선례, ui/table 무변경)"
    - "복원된 파일은 Attachments가 지운 id로 기억하므로 key 카운터로 다시 마운트"
key-files:
  created:
    - app/(app)/expenses/owned-evidence.tsx
    - app/(app)/expenses/owned-evidence.module.css
    - test/integration/approval-reserve-evidence.test.ts
    - test/e2e/approval-reserve-evidence.spec.ts
    - docs/design/checks/2026-10-13-06-16-approval-reserve-evidence.md
  modified:
    - domain/evidence/index.ts
    - repositories/files.ts
    - domain/expenses/index.ts
    - domain/quotes/revisions.ts
    - domain/reserves/index.ts
    - app/(app)/expenses/actions.ts
    - app/(app)/expenses/actions.registry.ts
    - app/(app)/projects/[id]/revision-section.tsx
    - app/(app)/projects/[id]/previous-revision.tsx
    - app/(app)/pnl/reserves/reserves-table.tsx
    - test/e2e/quote-revisions.spec.ts
    - test/e2e/reserves.spec.ts
    - test/unit/row-scope-disposition.test.ts
decisions:
  - "리저브 증빙 열은 세금계산서 번호 다음 P2 읽기 열(계획 그대로)이라 붙여넣기 논리 열에 계산 열로 남긴다 — 앱 복사 붙여넣기는 무시로 세고, 엑셀 붙여넣기 값이 그 칸에 닿으면 오류 칸이다(잔액 열 선례)"
  - "새 두 주인에는 06-11 훅(onApprovedEvidenceChange)을 달지 않는다 — 훅은 expense 줄의 선택 칸이고 호출은 optional 호출(`rule.onApprovedEvidenceChange?.`)"
metrics:
  duration: "약 2시간 30분 (다른 실행자와 공용 테스트 잠금 대기 포함)"
  completed: "2026-10-13"
commits: 4
plan_head_before: a5737022344c9262d9dd7c75017f36898848df72
actuals:
  tokens: 40000   # git diff base..HEAD 160,965자 / 4 (chars/4, 한글 바이트 포함)
  tasks: 3
  commits: 4
---

# Phase 6 Plan 16: 차수 승인 증빙(D-56) · 리저브 줄 증빙(D-60) Summary

05 `domain/evidence` 주인 표에 `quote_revision` · `reserve_entry` 두 줄을 더해, 담당 PM은 승인된 차수에 고객 승인 메일 · PDF를, 리저브 쓰기 권리자는 리저브 줄에 세금계산서를 붙이고 떼고 되돌릴 수 있게 했다(권리 · 보관 · 노출은 04 사실을 서버가 주인 행으로 다시 읽어 판정, 지출결의 version · 인스턴스 · 확인 기록 불변).

- 06-16 시작 커밋: `a5737022344c9262d9dd7c75017f36898848df72` (이 플랜 첫 커밋 전 HEAD, 웨이브 시작 origin/main 머지 뒤 값)
- drift ⑸ Task 2 시작 커밋: `d3315bd` (Task 1 커밋)
- `commits: 4`는 코드 커밋(`git rev-list --count a573702..HEAD`)이고 이 SUMMARY 커밋은 세지 않았다.
- 호출한 스킬: `superpowers:test-driven-development`, `design-gate`, `superpowers:verification-before-completion`(감사 반영 세션은 `systematic-debugging`도 호출). `systematic-debugging`은 부르지 않았다 — 실패는 모두 실패 출력에서 원인이 곧바로 드러난 것(열 개수 · 셀렉터 · 단언)이라 추측 수정이 없었다.

## 한 일

- **Task 1 (트레이서, d3315bd)** — 담당 PM이 승인된 차수에 PDF를 올리면 `listEvidence` 1 · 차수 요약 `approvalEvidenceCount` 1. `OwnerRule`에 선택 칸 `rights / writeOpen / denyWrite`를 더하고 두 새 주인 줄 · 요청 · 완료 · 삭제 · 읽기 경로에 rights 갈래를 달았다. 리저브 쪽 도메인(`reserveEvidenceOwner / Rights / WriteOpen`, DTO `evidenceCount · evidenceWritable`)과 액션 다섯(요청 둘 · 읽기 둘 · 되살리기)도 이 커밋에 들어 있다.
- **Task 2 (1513504)** — D-56 마감: 권리 밖 직접 호출 거부 · 승인 표시 꺼짐/완료 · 보관 프로젝트 읽기 전용 · 노출 없는 계급(개수 키 · 펼침 읽기 · 보기 주소 비움) · F10 되살리기(`restoreEvidence` → `markRestored` 단일 조건 UPDATE `NOT EXISTS`) · 이전 차수 읽기 섹션 안 블록 · drift ⑸(`restoreOwnerFilesRemovedAt`에 `scopeKinds`) · E-46 멱등 갈래 읽기 권리.
- **Task 3 (7a75cb9, 32ff277)** — D-60 리저브 줄 증빙(S22): `reserves-table.tsx`에 세금계산서 번호 다음 읽기 열 `증빙`(P2, 3차 `증빙` / `증빙 {N}`, `aria-expanded`, `data-cell-action`), 표 아래 펼침 섹션(한 번에 하나 · 제목 포커스 · 쪽 넘기면 닫힘 · 닫으면 3차로 포커스), 폭 갈래(≥1024 쓰기 / 700~1023 파일 행만 / 폰 글자 + 행 시트 첨부 행), 줄 삭제 모달 결과 줄 `증빙 {N}개 함께 보관`, 셀 `Enter` = 펼치기(`onKeyDownCapture`, `ui/table` 무변경). `OwnedEvidenceFiles`(파일 행만)를 `owned-evidence.tsx`에 더했다. 32ff277은 인수 grep(`@/domain/evidence` 0건)에 맞춘 주석 한 줄이다.

## 검증 (이 세션에서 실제로 돌린 것)

| 항목 | 결과 |
|---|---|
| 통합 `approval-reserve-evidence` · `reserve-entries` · `evidence-upload` · `leak-scan` (DB `erp_test_0616`) | 4파일 4203 통과 |
| 이름 그대로 녹색 | 「보관 뒤 완료 재시도 = 같은 파일 · 새 행 0」(E-46 리저브) · 「멱등 갈래 — 읽기 권리 잃으면 거부」 · 「되돌리기 — 카드 전표에 붙은 같은 영수증은 되살리지 않는다」 |
| Task 3 RED 확인 | `reserveEvidenceRights`의 `&& owner.status === "open"`를 지우면 「보관된 줄 …」 통합이 실패 → 복원 뒤 녹색. 같은 지점의 `writeOpen`만 바꾼 변이는 rights가 먼저 막아 통과했다(이중 방어) |
| E2E `CI=true` (DB `erp_0616_test`, `pnpm build` 뒤) `approval-reserve-evidence` · `reserves` · `quote-revisions` · `expense-form` | 96 통과 · 18 skip |
| 전체 단위 `--project unit` | 303파일 4566 통과 |
| `pnpm lint` · `pnpm typecheck` · `pnpm build` · `mark-legacy --audit`(reserves · projects/[id] · expenses) | 전부 종료 코드 0 |
| 옛 토큰 grep (`--faint` …) 다섯 파일 | 빈 출력 |
| `git diff a573702 -- ui/ docs/design/tokens.css package.json pnpm-lock.yaml project-detail.module.css reserves.module.css` | 빈 출력 |
| 인수 grep | `@/domain/evidence` in `domain/reserves/index.ts` = 0 · `evidenceCount|evidenceWritable` = 7 · `data-cell-action` = 3 · `onKeyDownCapture` = 1 · `scopeKinds` in `repositories/files.ts` = 8 · `eq(other.ownerKind, files.ownerKind)` = 0 · `domain/expenses/index.ts` numstat 2/1 |
| 점검표 `- [ ]` | 0개 |
| `grep -c "\.skip\|\.fixme" test/e2e/quote-revisions.spec.ts` | 0 (시작과 같다) |

C19 `git diff --name-only a573702...HEAD` (18개): 계획 `files_modified` 15개 중 `repositories/files.ts`를 포함해 전부 변경됨 + 계획 밖 3개 — `test/e2e/reserves.spec.ts`, `test/unit/row-scope-disposition.test.ts`, `docs/design/checks/2026-10-13-06-16-approval-reserve-evidence.md`(design-gate 점검표, 계획이 요구). `app/(app)/expenses/owned-evidence.module.css`는 신규.

## 계획 이름 → 실제 / 줄 번호

- **[r3 X-2] 06-11 훅 호출 줄:** `domain/evidence/index.ts:475`(추가), `:632`(무효) — 둘 다 `rule.onApprovedEvidenceChange?.(…)` **optional 호출**이고 이 칸은 `OWNER_RULES.expense` 줄(`:202`)에만 있다. 계획 문구의 `ownerKind === "expense"` 리터럴 조건은 쓰지 않았다(새 종류 줄에는 칸이 없어 훅이 탈 길이 없다 — 06-25가 새 종류를 더해도 그 줄에 칸을 안 달면 같다). 통합 「업로드 전후 지출결의 version · 인스턴스 version · 확인 기록 수 같음」이 증명한다.
- **[E-46] 멱등 갈래 rights 판정:** `domain/evidence/index.ts:391-395`(`findAliveFileOfIntent` 갈래 안 `if (rule.rights) … .read` 아니면 `EvidenceUploadRefusedError("restart")`). `expense`는 `rights`가 없어 05 동작 그대로.
- **drift ⑸ 전후:** 전 — 되돌리기의 중복 판정이 `eq(other.ownerKind, files.ownerKind)`로 같은 종류에만 걸려 지출결의 파일이 카드 전표에 이미 붙은 같은 영수증과 겹쳐도 되살아났다. 후 — `restoreOwnerFilesRemovedAt`이 `scopeKinds`(= `duplicateScopeKinds(EXPENSE_DOCUMENT_KIND)`, 지출결의 ↔ 카드 전표 한 묶음) 안 살아 있는 같은 SHA-256을 보고 막으며, 묶음 밖 종류에 붙은 같은 파일은 되살린다(통합 「[drift ⑸] …」).
- **⑤ 04 S5 개정 ⒝ ⒞ — `quote-revisions.spec.ts` 단언 전후:** 전 `expect(rows[0]?.[5]).toBe("")` (승인된 최신 차수 행 동작 칸이 빈 칸) → 후 `expect(rows[0]?.[5]).toBe("승인 증빙")` + `차수 열기` 버튼 수 1. 그 밖 단언은 건드리지 않았고 삭제하거나 약한 단언으로 바꾼 것 없음(`CI=true` 녹색 확인).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 리저브 E2E 열 인덱스 · 폭별 열 수 · 계산 열 무시 수**
- **Found during:** Task 3 (`test/e2e/reserves.spec.ts` 4건 빨강)
- **Issue:** 새 `증빙` 열(P2, ≥700에서 보임)이 세금계산서 번호 뒤에 끼어 `COL.note`(7→8) · `COL.client`(8→9), 1024에서 보이는 머리글 수(7→8), 1000에서 보이는 머리글 수(6→7), 앱 형식 붙여넣기 「계산 열 2칸 무시」(→4칸: 잔액 + 증빙, 2줄)가 달라졌다.
- **Fix:** `COL`에 `attachments: 7`을 더하고 note/client를 밀었고, 위 개수 단언을 새 열에 맞췄다. **약화 한 건:** 「1024에서 숨은 증빙 종류 · 세금계산서 번호 열도 붙여넣기 논리 순서에 남는다」는 원래 네 번째 값(메모)까지 붙였는데, 그 값이 이제 계산 열인 `증빙` 칸에 떨어져 엑셀 붙여넣기에서는 오류 칸이 되므로 세 번째(세금계산서 번호)까지만 붙이고 숨은 두 열이 논리 순서에 남는다는 핵심(프로젝트 · 증빙 종류 · 세금계산서 번호 저장)은 유지했다. 메모 칸 단언은 빠졌다 — 메모 붙여넣기는 다른 케이스(`COL.note`에서 시작)가 계속 덮는다.
- **Files modified:** `test/e2e/reserves.spec.ts`
- **Commit:** 7a75cb9

**2. [Rule 3 - Blocking] 행 범위 처분표에 새 입구 두 줄**
- **Found during:** Task 3 전체 단위 (`row-scope-disposition` 빨강)
- **Issue:** `revisionEvidenceOwner`가 `findQuoteRevisionById` · `findProjectById`를 부르는데 처분표에 없었다(ⓒ).
- **Fix:** 두 줄을 `post-gate`로 더했다 — 주인 상태 읽기이고 값은 05 `domain/evidence`가 `revisionEvidenceRights`(`findProjectInScope` · `quote.amount`) 판정 뒤에만 쓴다.
- **Files modified:** `test/unit/row-scope-disposition.test.ts`
- **Commit:** 7a75cb9

**3. [Rule 3 - Blocking] 자체 E2E 보정 (제품 동작 변경 아님)**
- 저장 버튼 글자가 `일괄 저장Ctrl+S`(단축키 글자 포함)라 정규식 단언으로 바꿨다. 로그인 사용자 이름이 `E2E 리저브 증빙`이라 폰 단언의 버튼 이름 정규식이 상단바 사용자 버튼과 겹쳐 표 범위로 좁혔다. 900 케이스는 1100에서 올린 파일이 `증빙 1`로 저장된 것을 확인한 뒤 다음 단계로 가도록 기다림을 더했다.
- **Files modified:** `test/e2e/approval-reserve-evidence.spec.ts`

## 독립 DOM 감사 반영 (감사: `/mnt/project-files/notes/06-review/06-16-dom-audit.md`)

| 지적 | 처리 | 커밋 |
|---|---|---|
| D-1 (중간) 되돌리기 뒤 포커스 BODY | `owned-evidence.tsx` — 되돌리기가 끝나(성공 · 거절) `되돌리기` 버튼이 사라질 때 포커스를 펼침 제목(tabindex -1)으로. e2e 두 건(S21 · S22)에 제목 포커스 단언. RED `Received: inactive` → GREEN | 7190cf4 |
| O-2 `aria-controls` | `revision-section.tsx` — 펼친 동안에만 제목 id를 단다. e2e `번갈아 열린다`에 닫힘 속성 없음 · 펼침 id 1개 단언. RED(속성 있음) → GREEN | 5d2ef25 |
| D-2 (중간) 엑셀 붙여넣기 회귀 | `reserves-table.tsx` — 읽기 열 `증빙`을 메모 · 클라이언트 뒤 맨 끝으로(열 정의 + `pasteColumns`). `ui/table/use-clipboard-paste.ts` 무변경, 폰 행 시트 순서는 이미 메모 뒤라 무변경. reserves.spec의 1024 붙여넣기 단언을 메모까지 되살림(RED: 메모 칸 `증빙읽기 전용·잠김 셀에 값 떨어짐` → GREEN), COL 순서 복원 | c46a54e |
| D-3 (낮음) 80자 파일명 | 코드 변경 없음 — SYSTEM §7-10 줄바꿈 계약대로 둠, 플랜 long-text 문구가 SYSTEM과 어긋남. `ui/attachments` 무변경. 점검표에 근거 줄 | (이 커밋) |
| O-1 · O-3 · O-4 · O-5 | 관찰 — 변경 없음. O-1 폰 `하나 더` 폭 35.9(05 공용 컴포넌트, 이 플랜 밖), O-3 마우스로 펼칠 때 제목 외곽선 없음(`:focus-visible` 정상 동작), O-4 다른 주인 중복 문구는 통합 테스트 몫, O-5 RDR 1280 펼침 실측 공백(900 · 768 갈래로 대신 확인) | - |

### 감사 반영으로 생긴 이탈 (위 Deviations 표에 이어서)

**4. [사용자 카드 승인(10/14 03:14 KST)] D-2 — 증빙 열을 메모 뒤로**
- 06-UI-SPEC S22는 증빙 열을 「세금계산서 번호 다음」으로 정했으나 엑셀 붙여넣기 회귀(메모가 읽기 열에 떨어짐)가 있어 맨 끝으로 옮긴다. 사용자가 카드에서 「맨 끝으로」를 골랐다. 06-UI-SPEC S22 열 문구 개정은 이 SUMMARY 기준 아직 안 했다(`.planning/` 수동 편집 금지) — 계획 쪽 후속.
- 위 이탈 1의 「약화 한 건」(1024 붙여넣기에서 메모 단언 제거)은 이 변경으로 되돌렸다. 붙여넣기 논리 순서는 `… 세금계산서 번호 · 메모 · 클라이언트 · 증빙`이고 `증빙`은 계산 열이라 앱 복사 붙여넣기의 「계산 열 N칸 무시」 개수(잔액 + 증빙 = 줄당 2)는 그대로다.
- 폰 접힌 줄 글자는 열 순서를 따르므로 `… · 메모 원래 · 증빙 10` 꼴로 증빙이 맨 뒤에 온다.

**5. [Rule 3 - Blocking] 테스트 보정** — `approval-reserve-evidence.spec.ts`의 셀 Enter 펼치기를 업로드 뒤 `router.refresh` 재그림과 겹쳐 키가 사라지는 경합(한 번 재현)에 대비해 `toPass`로 되풀이한다. 제품 동작 변경 아님. 이 두 스펙(공유 DB 한 개)은 `--workers=1`로 돌려야 한다 — 병렬이면 서로의 `reserve_entries`를 지워 가짜 실패가 난다.

### 감사 반영 검증

| 항목 | 결과 |
|---|---|
| `pnpm lint` · `pnpm typecheck` | 종료 코드 0 |
| 단위 `--project unit` 전체 | 303파일 4566 통과 |
| E2E `CI=true --workers=1` `reserves` + `approval-reserve-evidence` (DB `erp_0616f_test`) | 49 통과 · 18 skip(폰 프로젝트 전용) |

### 계획 밖 사실 (판단 필요 없이 기록)

- **폰 행 시트는 이 화면에 처음 생겼다.** 리저브 표에는 기존에 `onRowTap` · `RowSheet`가 없었다. 계획 S22(폰: 접힌 줄 글자 + 행 시트 첨부 행)를 따라 `RowSheet`를 붙였고, 시트는 접힌 P2/P3 값(잔액 · 프로젝트 · 증빙 종류 · 세금계산서 번호 · 메모)과 `증빙` 파일 행을 보인다. `ui/table` 수정은 필요 없었다(「규모 근거」 방아쇠 ⑶ 해당 없음). `onRowTap` 때문에 접힌 줄이 폰에서 `… 상세 보기` 버튼이 된다(다른 목록 화면과 같다).
- **증빙 파일 DTO(`evidenceFile`)의 칸은 모든 주인 종류에서 `expense.value`다**(05 `domain/evidence/dto.ts`, 파일 안 주석이 「Phase 6이 주인 종류를 더하면 그 종류의 항목」이라 적어 둔 자리). 새 두 주인의 권리 · 개수는 `quote.amount` / `reserve.amount`로 가르지만 파일 행(이름 · 크기)은 `expense.value`(staffDefault 참)도 있어야 보인다. 이 플랜이 `dto.ts`를 고치지 않았다(계획 files 밖) — 06.5 또는 06-25가 종류별 칸으로 가를지 정하면 된다. 통합 픽스처는 `expense.value`를 명시로 준다.

## 06.5 정리 대상

없음 — `evidence_amount` · `evidenceAmount` · `pickPaymentAmount`를 새로 읽는 곳이 없다(grep 확인).

## Known Stubs

없음.

## Threat Flags

없음 — 새 서버 입구는 계획 위협 모델(T-06-78~83, T-06-16-01~02)에 있는 액션 다섯(요청 둘 · 읽기 둘 · 되살리기)이고 모두 `registerAction`에 등록했다. 마이그레이션 없음(`files_owner_kind_check` 확장은 06-27 소관 — 통합이 새 주인 종류 파일을 실제로 넣는 것으로 베이스에 들어 있음을 확인).

## 오케스트레이터 몫(아직 안 함)

- (A4) 실행자가 아닌 별도 에이전트의 `CI=true` DOM 실측 감사 — S21 · S22를 375 · 320 · 768 · 1280(+ S22 1100 · 900), backstop 넷(파일 10개 · 80자 파일명 · 긴 클라이언트 이름 · 폰 시트). 실행자는 폭별 요소 수 · 포커스를 E2E로 단언했을 뿐 이 감사를 대신하지 않았다.
- `/design-review`(+ `bash scripts/codex-design-review.sh`) → `/qa` — PR 묶음마다 한 번. 점검표의 「스크린샷 경로: 없음」은 육안 판정 금지 규칙에 따른 것.
- `/review` — 코드 PR 게이트. 화면 영향 PR이라 `/design-review` + `/qa`가 함께 필요하다.
- `/cso` — `domain/reserves`가 돈 경로(리저브 보관 · 복원)라 독립 검토(A5). 인증 · 권한 위험 경로(`db/schema`, `domain/auth`, `domain/permissions`)는 건드리지 않았다.
- Opus 독립 검토 1명 — 이 플랜은 돈 · 권한 경로를 건드린다(리저브 권리 판정 · 주인 잠금).
- 이 SUMMARY 이후 STATE.md · ROADMAP.md · REQUIREMENTS.md 갱신(지시에 따라 건드리지 않았다).

## Self-Check: PASSED

- 파일 존재: `owned-evidence.tsx` · `owned-evidence.module.css` · `approval-reserve-evidence.test.ts` · `approval-reserve-evidence.spec.ts` · 점검표 · 이 SUMMARY — FOUND
- 커밋: d3315bd · 1513504 · 7a75cb9 · 32ff277 — FOUND (`git log a573702..HEAD`)
