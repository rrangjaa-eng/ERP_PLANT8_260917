---
phase: 06-payment-evidence-cards
plan: 09
subsystem: payments
status: complete
tags: [corp-card-usages, proxy-registration, rights, archive-undo, next-safe-action, drizzle, playwright]

requires:
  - phase: 06-27
    provides: corp_card_usages 보관 칸 · registered_via CHECK(self_check · purchase_link_check) · cards.proxy 메뉴 키 · card_usage.amount
  - phase: 06-05 · 06-30
    provides: cardOptionsForUsage · precheckCardUsage · createCardUsage(runCreate) · 공용 카드 kind
  - phase: 06-07
    provides: lockProjectForLinkWrite · currentLineForFixedLink · lockQuoteLines · findLineLinks(계보) · card.dual-link-block · card.execution-cap · lineRoom · createOutOfQuoteLine · project.line-edit completedOutOfQuote · searchProjectsForCardLink · cardUsageFormDefaults · listProjectCardUsages
provides:
  - cardUsageRights(rights.ts — 순수, O-11)
  - usedByCandidates(사용일 기준 후보) · usedByCandidatesAction
  - 대리 등록(EXP-16) — 권한자 = 활성 카드 전부 · proxyHint · choosesUser
  - precheckCardUsageUpdate / updateCardUsage(runUpdate — pre.lockProjects id 오름차순 · E-9) · updateCardUsageAction · loadCardUsageForEdit(`?editId=`)
  - precheckCardUsageRemoval / deleteCardUsage(runDelete) / restoreCardUsage(runRestore) · deleteCardUsageAction · restoreCardUsageAction
  - 완료 프로젝트 권한자 견적 외 비용 예외(Q-B · U-4 · X-6)
  - S8 행동 칸 · 결과 줄(delete-undo.tsx) · 폰 행 탭(S8 · S15)
affects: [06-12, 06-25, 6.1-06, 06-19, 06-22]

actuals:
  tokens: 55870
  tasks: 3
  commits: 7
plan_head_before: 171d5f785d2459b56f019555af69c1931166b436

tech-stack:
  added: []
  patterns:
    - "삭제 = 보관 + 표 위 결과 줄 되돌리기(클라이언트 상태 · 화면 전체를 감싼 provider — 빈 화면이 되어도 줄이 남는다)"
    - "되돌리기도 저장과 같은 잠금 · 게이트(runRestore — 프로젝트 행 → 현재 줄 → lockQuoteLines 1회 → findLineLinks → 이중 연결 → 실행가)"
    - "registeredVia = 사용한 사람이 등록자면 self, 아니면 proxy(DB self_check와 한 판정)"

key-files:
  created:
    - domain/corp-card-usages/rights.ts
    - app/(app)/cards/delete-undo.tsx
    - test/unit/domain/card-usage-rights.test.ts
    - test/integration/corp-card-usages-proxy.test.ts
    - test/e2e/card-proxy.spec.ts
    - docs/design/checks/2026-10-07-06-09-card-edit.md
  modified:
    - domain/corp-card-usages/index.ts
    - domain/corp-card-usages/link-targets.ts
    - repositories/corp-card-usages.ts
    - app/(app)/cards/actions.ts
    - app/(app)/cards/actions.registry.ts
    - app/(app)/cards/page.tsx
    - app/(app)/cards/card-usage-form.tsx
    - app/(app)/cards/card-usage-list.tsx
    - app/(app)/cards/cards.module.css
    - app/(app)/projects/[id]/card-usage-section.tsx
    - test/integration/corp-card-usages.test.ts

key-decisions:
  - "registeredVia: 사용한 사람 = 등록자면 self, 아니면 proxy — 플랜 기본값(공용 카드 = self)은 공용 카드로 남을 고르면 DB corp_card_usages_self_check를 어긴다"
  - "choosesUser = 권한자 · 본인 개인 카드 밖 — 남의 개인 카드 팀 비용도 소지자 텍스트 + 소지자 팀(등록자 팀 표시 버그 수정, UI-SPEC S9 개인 카드 줄)"
  - "폰 삭제 자리 = 행 끝 RowAction danger(플랜 열린 선택 기본값)"
  - "결과 줄 상태는 목록 화면 전체를 감싼 CardUsageDeleteUndo(필터 · 월 · 쪽 key) — 마지막 행을 지워도 되돌리기가 남는다"

duration: 85min
completed: 2026-10-07
---

# Phase 06 Plan 09: 법인카드 사용 대리 등록 · 수정 · 삭제 · 되돌리기 Summary

**경영관리(cards.proxy)가 남의 카드 사용을 대신 등록하고(S15에 `경영관리 등록`), 권리 한 함수(cardUsageRights)로 열리는 수정 옆 패널 · 확인 창 없는 삭제(보관) · 같은 잠금과 게이트를 다시 지나는 `되돌리기`를 붙였다.**

## ⓪ 결과 여섯 줄 (main 기준 재확인 — 2026-10-07, base 171d5f7)

- C15: ok — 05-13-SUMMARY · `remainingForInstallments` · `PickDialog`
- 06-27: ok — `corp_card_usages_registered_via_check` · `archived_by` · `"cards.proxy"` · `"card_usage.amount"`
- 06-30 · 06-05: ok — `"shared"` · `cardOptionsForUsage` · `const runCreate = async` · `splitCardTotal`
- 06-07: ok — 06-07-SUMMARY · `lockQuoteLines` · `lockProjectForLinkWrite` · `completedOutOfQuote` · `"card.execution-cap"` · `createOutOfQuoteLine` · `searchProjectsForCardLink` · `lineRoom` · `card-usage-section.tsx`
- A-601: ok — `"completed"` · `CompletedProjectError` · `quoteLockReason`
- 04.x: ok — PanelForm `intent: "create" | "edit"` · `RowAction` · holidays `delete-undo.tsx` · `RowSheet.tsx`

06-05 · 06-07 · 06-27의 실제 이름이 플랜 표와 같아 대응표는 없다.

## 한 일

| Task | 커밋 | 내용 |
|---|---|---|
| 1 RED | f69a124 | 권리 단위 7 · 대리 등록 · 수정 · N-1/N-2 통합 · 트레이서 E2E |
| 1 GREEN | 635c3f8 | `cardUsageRights` · 대리 등록(권한자 = 활성 카드 전부 · proxyHint) · `precheckCardUsageUpdate` / `updateCardUsage`(runUpdate) · `?editId=` 옆 패널 · S8 행 `수정` |
| 2 RED | a76d177 | 사용한 사람 · 완료 프로젝트 · 수정 연결 변경(E-9 네 갈래) · Q3 수정 · 수정 모드 막힘 · M-4 통합 + E2E 세 케이스 |
| 2 GREEN | b80e0df | `usedByCandidatesAction` · 폼 `사용한 사람` · 완료 프로젝트 권한자 견적 외 비용 예외 · 프로젝트 고르기 selectable · M-4 · registeredVia 판정 · 수정 모드 증빙 막힘 · 구매 건 연결 텍스트 |
| 3 RED | d9712a1 | 삭제 · 되돌리기 통합 20건(E-9 · X-1 · X-2 · N-1 · N-2 · 이중 연결 · 실행가) |
| 3 GREEN | b6c079b | `precheckCardUsageRemoval` · `deleteCardUsage`(runDelete) · `restoreCardUsage`(runRestore) · 액션 둘 · `delete-undo.tsx` · 행동 칸 `삭제` · 결과 줄 · 폰 행 탭(S8 · S15) · E2E 다섯 |
| 수정 | 49ba77b | 남의 개인 카드 팀 비용의 사용한 사람 = 소지자 텍스트 · 팀 = 소지자 팀, 카드를 바꾸면 고른 사람 비움 |

## 검증 (실제 실행)

- 통합 `corp-card-usages-proxy` · `corp-card-usages` · `leak-scan`(격리 DB erp_e0609_test): 3684 통과 · 0 실패(proxy 파일 67건)
- 단위 전체 `--project unit`: 4278 통과 · 0 실패(280 파일) / 끝 재확인 card-usage-rights · leak-scan-coverage · error-copy-noun-style · action-registry-completeness 36 통과
- E2E `CI=true` card-proxy(9) + card-usage(20): 29 통과 · 0 실패(desktop · 프로젝트 전체 둘 다)
- `pnpm lint` 0 · `pnpm typecheck` 0 · `CI=true pnpm build` 0
- acceptance grep: runUpdate · runCreate · runDelete · runRestore 범위 전역 판정 0 · 순서(`lockProjectForLinkWrite( lockQuoteLines( findLineLinks( card.dual-link-block card.execution-cap` · `currentLineForFixedLink( lockQuoteLines(` · `project.line-edit createOutOfQuoteLine(` · runDelete `lockProjectForLinkWrite( recordAction(`) · recordAction `{ tx: innerTx }` · `lockProjectForLinkWrite(` 호출 자리 1 · archive.ts 미등록 0 · toast/ConfirmDialog import 0 · link-picker.tsx 무변경 · 점검표 `- [ ]` 0

## 260907 대조

| 항목 | 260907 file:line | 우리 file:line | 분류 |
|---|---|---|---|
| 남의 이름으로 등록하는 사람 | 조회 범위 팀 이상이면 누구나(`server/src/card-uses.ts:957` canPickOthers · `:1028-1030`) — 실측 팀장 대리 23%(06-vs-260907-code.md) | `cards.proxy` write만(`domain/corp-card-usages/index.ts:380` precheckCardUsage → resolveUsedBy · `usedByCandidates` :212) | **숨은 규칙(사용자 결정 필요)** — 팀장은 권한을 따로 받지 않으면 팀원 대리 등록이 막힌다 |
| 대신 고를 수 있는 사람 | 지금 재직 · 보관 아님 · 내 조회 범위(`card-uses.ts:627-642`, left_date null) | 사용일 기준 후보 — 팀 카드 = 사용일 그 팀 소속(지금 다른 팀 · 퇴사 포함), 공용 = 사용일 재직자(`index.ts:206` employedOn · :212) | 계획 결정(Q5 · EXP-07) |
| 대리 등록에 쓰는 카드 | 등록자 본인에게 배정된 카드(개인 = 본인 · 팀 = 내 팀 · 공용)(`card-uses.ts:655-668`) | 권한자는 활성 카드 전부(남의 개인 · 팀 · 공용)(`index.ts:149` eligibleCards) | 계획 결정(EXP-16 · D-608) |
| 등록 뒤 고치기 | 카드 사용은 등록 즉시 `handled_by = 등록자` · `card_paid_date`가 채워져(`card-uses.ts:716` · `:721` · `:724`) 고치기 「경영관리가 이미 손을 댄 요청」(`purchases.ts:2321-2323`) · 보관 「이미 결제한 요청은 보관할 수 없습니다」(`purchases.ts:3231-3236`) — 등록 즉시 고치기 · 보관이 막힌 불변 기록 | 등록자(완료 프로젝트 전) · 대리 등록 권한자, 구매 건은 연결 변경 없음(`domain/corp-card-usages/rights.ts:18`) | 계획 결정(O-11 · D-609 · rev 10 · U-6) — 독립 검토가 정정(이전 표기 「요청자만 · 경영관리가 손대기 전까지」는 구매 요청 규칙이었다) |
| 지우기 | 결제일 있으면 보관 불가 「합계에서 빠지면 나간 돈이 사라집니다」(`purchases.ts:3231-3236`) | 확인 없이 보관 + 되돌리기(`index.ts:682` precheckCardUsageRemoval · :700 deleteCardUsage) — 카드사 대사는 6.1 | 계획 결정(D-609 · rev 10) |
| 완료 뒤 사후 처리 | 가능(ERP260907-CONTEXT:38) | 권한자의 견적 외 비용만(`index.ts:347` completedOutOfQuote → runCreate/runUpdate `project.line-edit`) · 완료 프로젝트 견적 줄은 누구도 새로 잇지 않음 | 계획 결정(U-4 · Q-B · D-47 ③) |
| 사용일 미래 | 받는다(`card-uses.ts:984` · `:1040-1048`) | 새 건 · 수정 모두 오늘까지(`index.ts:381` · `:544` assertUsageBasics) | 계획 결정(Q6) |

숨은 규칙 1건.

## 캡처·GPT 검사 대상 경로

| 경로 | 바뀐 요소 | 보는 데 필요한 데이터 조건 |
|---|---|---|
| `/cards` | 행동 칸 `수정` · `삭제`(danger), 표 위 결과 줄 `카드 사용 삭제됨 · {합계}` + `되돌리기`, 막힘 줄(`--status-danger`), 폰 행 탭 | 이번 달 · 본인 등록 건(권리 있음) · 남이 등록한 건(칸 빔) · 구매 완료 건(`수정`만). 결과 줄은 행 `삭제`를 누른 뒤에만 선다. 13자리 금액 결과 줄 320 폭(UI-SPEC backstop) |
| `/cards?editId={id}` | 수정 옆 패널 `카드 사용 수정`(카드 읽기 텍스트 · 대리 힌트 · 주 버튼 `카드 사용 저장` · 패널 안 삭제 없음), 구매 건 연결 텍스트, 저장된 증빙이 옵션 밖일 때 막힘 | 권리 있는 건 id. 구매 건 = `registered_via=purchase` 행. 증빙 막힘 = 저장된 `evidence_type_code`가 카드 규칙 밖(예: other_income) |
| `/cards?new=1` (경영관리 계정) | 남의 카드 아래 `경영관리 등록 · 카드 소지자 {이름}`, 팀 비용 `사용한 사람`(남의 개인 카드 = 소지자 텍스트 · 팀/공용 카드 여럿 = Select 기본값 없음) · 팀 값 = 그 사람 사용일 팀, 완료 프로젝트 고르기 2행 `완료 · 견적 줄 잠김`(고를 수 있음) | `cards.proxy` write 계정 · 남의 개인 카드 · 팀 카드(팀원 둘 이상) · 완료 프로젝트 |
| `/projects/{id}` S15 | 폰(375) 행 탭 → 권리 있으면 `/cards?editId=`, 없으면 RowSheet | 그 프로젝트 견적 줄에 이은 카드 사용(본인 등록 · 남 등록 각 1) |
| `/cards` (검토 반영) | 결과 줄 금액 없는 갈래 `카드 사용 삭제됨`(D-1) · `되돌리기 실패 · 다시 시도` + `되돌리기`(D-2) · 되돌리기 거부 줄(` · 다른 줄 고르기` 뗌, O-3) · 되돌리기 뒤 포커스(D-4) | `card_usage.amount` 숨김 계정의 자기 건 · 되돌리기 요청 실패(네트워크 끊김) · 지운 사이 그 줄 지출결의 |
| `/cards?editId={id}` (검토 반영) | 금액 숨김 계정 결제 합계 읽기 `—`(D-3) | `card_usage.amount` 숨김 계정의 자기 건 |
| `/cards?new=1` (검토 반영) | 카드 `Select` 말줄임(D-5) | 권한자 · 64자 카드 이름 |

## 화면 검토 증거

(오케스트레이터가 채움)

## 사용자 질문 후보

1. **팀장 대리 등록(260907 숨은 규칙)** — 고른 것: 플랜대로 `cards.proxy` 권한자만 남의 이름으로 등록. 260907은 조회 범위 팀 이상이면 팀원 이름으로 올렸다(실측 23%). 다른 안: 팀장 계급에 `cards.proxy`를 주거나, 팀 범위 대리를 따로 연다.
2. **공용 카드 등록 경로** — 고른 것: 사용한 사람이 등록자면 `self`, 남을 고르면 `proxy`(목록 `경영관리 등록`). 이유: 플랜 기본값(공용 = 늘 `self`)은 DB `corp_card_usages_self_check`(self면 사용한 사람 = 등록자)를 어겨 저장이 500으로 깨진다. 다른 안: 공용 카드에서 남 고르기 금지 · 또는 CHECK 변경(마이그레이션 — 위험 경로).
3. **남의 개인 카드 팀 비용의 `사용한 사람`** — 고른 것: UI-SPEC S9대로 소지자 텍스트 + 팀 값 = 소지자 사용일 팀(플랜 문구는 「팀 · 공용 카드일 때만」). 이유: 칸이 없으면 팀 값이 등록자(경영관리) 팀으로 보이는데 서버는 소지자 팀으로 저장해 화면과 저장이 달랐다.
4. **새 문구 3개** — `사용한 사람 후보 아님 · 사용한 사람 고르기`(후보 밖 조작 요청) · `카드 사용 수정 권리 없음`(수정 · 삭제 · 되돌리기 권리 없음) · `카드 대리 등록 권한 없음`(후보 조회 권한 없음). UI-SPEC에 없어 새로 정했다. 카드 바꾸기 거부는 기존 `카드 자격 없음 · 카드 고르기`, 낡은 version은 기존 `다른 저장이 먼저 됨 · 새로 고침`(approvals에 있던 문구), 연결 실패 결과 줄은 기존 `처리 중 오류 · 잠시 후 다시 시도`.
5. **폰 삭제 자리** — 고른 것: 플랜 열린 선택 기본값(행 끝 `RowAction danger`). UI-SPEC S8 「폰 행동 칸은 행 시트 안」과 겹친다 — `/design-review`가 볼 곳.
6. **수정에서 사용한 사람을 바꾸면 등록 경로 · 등록자가 바뀜(검토 I-2 — 추천안 ㉯로 진행)** — 고른 것: 권한자가 수정으로 사용한 사람을 바꾸면 그 수정을 새 등록으로 본다 — 등록자 = 수정한 권한자, 경로는 새 건과 같은 판정(남의 개인 · 팀 카드나 남을 고르면 `proxy`). 원래 등록한 직원의 수정 · 삭제 권리는 사라지고 행동 로그(`document_create` · `document_update`)에만 남는다. 사용한 사람이 그대로면 저장된 경로 · 등록자 그대로. 다른 안: ㉮ 남이 등록한 건에서는 권한자도 사용한 사람을 못 바꾸게 막음.
7. **(검토 I-1) 공용 카드로 남을 고른 건 = `경영관리 등록` 표시** — 고른 것: 남의 개인 · 팀 카드는 늘 `proxy`(플랜 must_have 1행 · 폼 힌트와 일치), 공용 · 본인 자격 카드는 사용한 사람 = 등록자면 `self` · 남이면 `proxy`. 공용 카드 · 남 고름이 `proxy`인 것은 DB `self_check`상 사실상 강제(후보 2를 좁힌 것). 다른 안: 공용 카드에서 남 고르기 금지.
8. **(DOM D-1) 금액 없는 결과 줄 문구 `카드 사용 삭제됨`** — 금액을 못 보는 사람에게는 `· {합계}`를 뺀 한 줄. UI-SPEC Copywriting에 없는 갈래다. 다른 안: `카드 사용 삭제됨 · {MM-DD} {가맹점}`(감사 제안 — 식별자를 더함).
9. **(DOM D-3) 금액을 못 보는 사람의 수정** — 고른 것(최소안): 결제 합계를 읽기 `—`로 세우고 금액을 보내지 않는다. 서버는 `card_usage.amount`를 못 보는 사람의 결제 합계를 늘 무시하고 저장값을 지킨다(보내도 덮어쓰지 않음 — 그 사람은 증빙 종류를 바꾸면 저장된 합계로 공급가 · 부가세만 다시 셈). 금액을 보는 사람도 금액을 null로 보내면 저장값 유지. UI-SPEC에 숨김 계정 수정 갈래가 없다(규칙 공백). 다른 안: 금액을 못 보는 사람에게는 카드 사용 수정 권리를 주지 않음.
10. **(DOM D-2 · O-3) 되돌리기 실패 문구** — 요청이 닿지 않으면 SYSTEM §7-8 그대로 `되돌리기 실패 · 다시 시도` + `되돌리기` 남김. 서버 거부는 UI-SPEC S8대로 머리 없이 서버 문구 그대로 두되 끝의 ` · 다른 줄 고르기`(지운 행이 없어 할 수 없음)만 뗀다. 다른 안: SYSTEM 꼴 `되돌리기 실패 · {원인}`으로 통일(UI-SPEC S8 error 행 수정 필요).
11. **(검토 B-1 부수) 비활성 카드 건의 수정** — 비권한자의 수정은 새 건과 같은 `eligibleCards`(활성 카드만)를 지나므로, 카드가 비활성 · 보관된 뒤에는 등록자가 그 건을 고칠 수 없다(`카드 자격 없음 · 카드 고르기`). 권한자는 그대로 고친다. 다른 안: 자격 판정에서 활성 여부는 빼고 소지자 · 팀만 본다.

## 플랜 밖 변경

- (검토 반영) `test/integration/leak-scan.test.ts`: 카드 사용 삭제 · 되돌리기 · 수정 반환의 금액 누수 검사 한 블록(DOM D-1 — 감사 제안 「누수 스캔이 삭제 · 되돌리기 반환을 덮는지」).
- (검토 반영) `repositories/corp-card-usages.ts` `CardUsageUpdateValues`에 `registeredBy` 한 칸(I-2).

- `test/integration/corp-card-usages.test.ts` 기대 1줄(Task 1): 06-05 기대 「대리 권한자의 카드 옵션에 본인 카드 없음」 → EXP-16으로 권한자는 활성 카드 전부라 `expect.arrayContaining([ownId, otherTeamCardId])`로 정정.
- `app/(app)/cards/cards.module.css`: 결과 줄 클래스 3개(`.undoLine` · `.undoFailed` · `.undoAmount`, 토큰만 — 04.2 공휴일 값과 같음). 플랜 Task 3 files 목록에 css가 없었다.
- (커밋 안 함) `next.config.ts`에 `turbopack.root` · `outputFileTracingRoot`를 로컬에서만 넣고 E2E/빌드를 돌린 뒤 되돌렸다 — worktree의 `node_modules`가 메인 트리로 가는 심볼릭 링크라 Turbopack이 「Symlink [project]/node_modules is invalid, it points out of the filesystem root」로 빌드를 멈춘다. CI(실제 node_modules)에는 해당 없음.

## 넘김

- 6.1-06(K-7): `runDelete` · `runRestore` 몸통에 증빙 붙임 떼기 리포지토리 한 줄을 더할 자리 — 이름 그대로(`deleteCardUsage` · `restoreCardUsage`, 둘 다 `tx?`).
- 06-12: 구매 완료 건의 카드 고치기(수정은 지금 카드 변경을 막는다 — `CARD_NOT_ELIGIBLE`).
- 06-25: 결과 줄 수명(클라이언트 상태 · 마지막 한 건 — B-C9)을 쓴다.
- 06-08(link-picker.tsx 소유): 권한자에게 완료 프로젝트가 `selectable: true`로 오는 것은 `searchProjectsForCardLink` 한 곳이다 — 06-08이 구매 요청 모드에 같은 함수를 쓰면 완료 프로젝트가 고를 수 있게 보일 수 있어, 그 모드는 자기 판정을 확인할 것.
- 수정 모드 비권한자의 팀 비용 「소속 없음」 막힘은 06-05 판정(등록자 사용일 소속) 그대로다 — 사용한 사람 = 등록자라 맞지만, 권한자가 칸 없는 경우(본인 개인 카드)는 없다. 별도 조치 없음.

## 검토 반영 (독립 검토 06-09-review.md · DOM 감사 06-09-dom-audit.md)

커밋: b61f547(RED 통합) · 36b06c1(도메인 · 액션 · leak-scan) · 6336f1c(화면 · E2E · 점검표).

| 지적 | 처리 | 위치 · 테스트 |
|---|---|---|
| B-1 수정이 카드 자격(사용일 소속)을 다시 보지 않음 | 비권한자 · 구매 건 밖이면 새 건과 같은 `eligibleCards(viewer, teamIdOn(viewer, usedOn))`로 재판정 → `카드 자격 없음 · 카드 고르기` | `index.ts:572` · 통합 「(B-1)」(재현 → 거부 · 행 그대로) |
| I-1 남의 팀 카드 대리 등록이 `self` | `viaOf` — 남의 개인 · 팀 카드는 늘 `proxy`, 공용 · 본인 자격은 사용한 사람 = 등록자면 `self` | `index.ts:166` · `:399` · 통합 「(I-1)」 셋(견적 줄 proxy · `경영관리 등록` 필터 · 본인/공용 self · 금액만 고쳐도 proxy 유지) |
| I-2 사용한 사람 변경 시 등록자가 원래 직원으로 남음 | 사용한 사람이 바뀌면 등록자 = 수정한 사람 · 경로 = 새 건 판정, 그대로면 저장값 유지 | `index.ts:583` · 통합 「(I-2 · M34)」(proxy · 등록자 = 권한자 · 원래 직원 `?editId=` null) |
| I-3 생존 돌연변이 M25 · M27 · M34 | 통합 3개 추가. M25(`lockProjects: []`) · M27(`isNotNull(archivedAt)` 제거)을 다시 넣어 두 테스트가 빨개지는 것을 확인 후 되돌림, M34는 I-2 테스트가 잡음(RED에서 실패 확인) | 통합 「(I-3 · M25)」 · 「(I-3 · M27)」 |
| D-1 금액 숨김 계정에 지운 건 금액 노출 | `precheckCardUsageRemoval` · `runUpdate` 반환 `totalKrw`를 `card_usage.amount`로 투영(못 보면 null), 결과 줄 `카드 사용 삭제됨` | `index.ts:739` · 통합 「(D-1)」 · leak-scan · E2E [D-1](응답 본문 `"totalKrw":null`) |
| D-2 되돌리기 일시 실패 뒤 재시도 길 없음 | 요청 실패는 `되돌리기 실패 · 다시 시도` + `되돌리기` 남김(포커스 유지), 서버 거부만 버튼 치움 | `delete-undo.tsx:16` · `:91` · E2E [D-2] |
| D-3 금액 숨김 계정 수정 막힘 · 덮어쓰기 | 화면 읽기 `—`(막힘 제외) · 금액 null 전송, 서버는 못 보는 사람의 금액을 무시하고 저장값 유지 | `actions.ts`(amount nullable) · `index.ts:569` · `card-usage-form.tsx:226` · 통합 「(D-3)」 둘 · E2E [D-3] |
| D-4 되돌리기 뒤 포커스 BODY | 성공 → 되살린 행 `삭제`(공휴일 `focusDate` 선례), 거부 → 결과 줄 글자(`tabIndex=-1`) | `delete-undo.tsx:82` · E2E 첫 케이스 · 지출결의 케이스 |
| D-5 긴 카드 이름 말줄임 없음 | 카드 `Select`에 `.cardSelect`(ellipsis) | `cards.module.css` · E2E [D-5] |
| O-3 되돌리기 거부 줄의 `다른 줄 고르기` | 끝의 ` · 다른 줄 고르기`만 뗌 | `delete-undo.tsx:18` · E2E 지출결의 케이스 기대 정정 |
| 260907 표 「등록 뒤 고치기」 | 「카드 사용은 등록 즉시 고치기 · 보관이 막힌 불변 기록」으로 정정 | 위 「260907 대조」 |

고치지 않은 것(지시대로): 팀장 대리 등록(질문 1), 거부 문구 결정(m-3 · 질문 4), O-1 · O-2 · O-4 · O-5 · O-6 · O-7, m-1 · m-2 · m-4 · m-6. m-5는 D-3으로 함께 풀림.

검증(검토 반영): 통합 `corp-card-usages-proxy` + `corp-card-usages` 155/155 · leak-scan 3540/3540 · `pnpm lint` 0 · `pnpm typecheck` 0 · E2E `CI=true` card-proxy + card-usage 33 통과 · 0 실패(18 skipped = visual 프로젝트). 화면 쪽 E2E는 구현 뒤에 썼다(RED를 화면으로 먼저 보지 않음 — D-1 응답 본문 · D-2 · D-3은 옛 코드에서 실패할 단언이지만 옛 빌드로 돌려 확인하지는 않았다).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] usedByUserId 스키마가 uuid였다**
- **Found during:** Task 1 E2E(수정 저장 뒤 패널이 닫히지 않음)
- **Issue:** 사용자 id는 better-auth 문자열이라 `z.uuid()` 검증 오류 → 화면에 안 보이는 validationErrors로 저장이 조용히 멈춤
- **Fix:** `z.string().min(1).max(64)`(프로젝트 사용자 id 규약)
- **Commit:** 635c3f8

**2. [Rule 1 - Bug] 공용 카드 대리 등록이 DB self_check를 어김**
- **Found during:** Task 2 RED(공용 카드로 남 고르기 저장 → 23514)
- **Fix:** registeredVia = 사용한 사람이 등록자면 self, 아니면 proxy(새 건 · 수정 공통, 구매 건은 그대로)
- **Commit:** b80e0df

**3. [Rule 1 - Bug] 남의 개인 카드 팀 비용의 팀 값이 등록자 팀으로 보임 · 카드를 바꿔도 고른 사람이 남음**
- **Found during:** 마무리 점검 · E2E
- **Fix:** choosesUser를 권한자 · 본인 개인 카드 밖으로 넓힘, 카드 변경 시 선택 비움
- **Commit:** 49ba77b

**4. [Rule 1 - Bug] 마지막 행을 지우면 결과 줄이 사라짐(빈 화면 갈래가 children을 갈아끼움)**
- **Found during:** Task 3 구현
- **Fix:** provider를 목록 화면 전체 바깥에 두고 결과 줄(`CardUsageUndoLine`)을 표 위 · 빈 화면 두 자리에 둠
- **Commit:** b6c079b

**5. [Rule 3 - Blocking] E2E 목록 행이 다른 스펙의 행과 섞임** — 권한자(회사 범위)는 같은 달 모든 건을 본다. 행 찾기를 픽스처 카드 rowgroup으로 좁힘(b80e0df).

## 독립 검토 메모 (risk: [permissions])

실행자(이 에이전트)는 독립 검토자가 아니다 — 플랜 verification의 「실행자가 아닌 Opus 한 명」 검토는 아직 없다(오케스트레이터 몫). 볼 곳: `rights.ts` 판정 · `precheckCardUsage`/`precheckCardUsageUpdate`/`precheckCardUsageRemoval`의 권한 → 권리 순서 · `runUpdate`의 `pre.lockProjects` 반복(id 오름차순 · 같은 프로젝트 합침) · `runDelete` 프로젝트 행 잠금(E-9) · `runRestore` 게이트 재통과 · `precheckLink` 완료 프로젝트 예외(권한자 · 견적 외 비용만) · registeredVia 판정(질문 후보 2) · `usedByCandidates`가 전 사용자 이름을 권한자에게 돌려주는 범위(dtoName null — 메뉴 `cards.proxy` write).

## Known Stubs

없음.

## Threat Flags

없음 — 새 액션 넷(update · delete · restore · usedByCandidates)은 플랜 threat_model(T-06-41~45 · 192 · 156 · 531~535) 안이다.

## Self-Check: PASSED

- 파일: rights.ts · delete-undo.tsx · card-usage-rights.test.ts · corp-card-usages-proxy.test.ts · card-proxy.spec.ts · 점검표 — 모두 있음
- 커밋: f69a124 · 635c3f8 · a76d177 · b80e0df · d9712a1 · b6c079b · 49ba77b — 모두 `git log`에 있음
- `git rev-list --count 171d5f7..HEAD` = 7(SUMMARY 커밋 전)
