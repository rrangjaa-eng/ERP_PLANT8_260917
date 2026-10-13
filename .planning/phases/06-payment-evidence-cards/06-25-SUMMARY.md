---
phase: 06-payment-evidence-cards
plan: 25
subsystem: card-slip-evidence
status: complete
tags: [EVID-01, card-slip, evidence-owner, duplicate-scope, T-06-201, drift-5, E-46, S7, S8, S9]
requires: ["06-09", "06-11", "06-14", "06-16"]
provides:
  - OWNER_RULES.corp_card_usage(05 주인 표 한 줄 — 읽기 = S8 목록 범위, 쓰기 = 수정 권리 ∧ 보관 아님, instance null)
  - cardSlipOwner · cardSlipRights · cardSlipWriteOpen · cardSlipNotFound · denyCardSlipWrite(domain/corp-card-usages)
  - hasCardSlip(목록 DTO · 6.1-12가 OR) · aliveFileExists · isCardUsageInListScope · lockCardUsageForUpdate · findLiveShaConflicts
  - requestCardSlipUploadAction(ownerKind 고정) · 카드 패널 `증빙` 줄(새 건 첫 저장 · 수정) · 목록 증빙 열 있음/—
affects: ["06.1-12"]
requirements: [EVID-01]
tech-stack:
  added: []
  patterns: [주인 표 한 줄 확장, 저장 먼저 → 주인 id → 올리기 → 수정 패널 전환, 보관 제외 SQL 조건 한 벌(notArchivedCardSlip)]
key-files:
  created:
    - test/integration/card-usage-evidence.test.ts
    - test/e2e/card-usage-evidence.spec.ts
    - docs/design/checks/2026-10-13-06-25-card-slips.md
  modified:
    - domain/evidence/index.ts
    - domain/evidence/upload-checks.ts
    - domain/corp-card-usages/index.ts
    - repositories/files.ts
    - repositories/corp-card-usages.ts
    - app/(app)/expenses/actions.ts
    - app/(app)/expenses/actions.registry.ts
    - app/(app)/cards/page.tsx
    - app/(app)/cards/card-usage-form.tsx
    - app/(app)/cards/card-usage-list.tsx
    - test/unit/app/cards-page.test.ts
decisions:
  - 카드 전표 읽기는 보관 무관(E-46), 쓰기는 보관 아님 — isCardUsageInListScope 몸통에 보관 조건 0
  - 보관 카드 사용 전표 제외는 repositories/files.ts의 notArchivedCardSlip 한 조건을 findActiveBySha · takenElsewhere(restoreOwnerFilesRemovedAt · markRestored) · findLiveShaConflicts가 나눠 쓴다
  - 되돌리기 재확인은 GateBlockedError(EVIDENCE_DUPLICATE_HIDDEN) — 06-09가 되돌리기 막힘에 쓰는 오류 꼴, 새 문구 0
  - 새 건 첫 저장은 첫 파일의 request 단계에서 1차와 같은 createCardUsageAction을 먼저 돌린다(single-flight, 같은 id 재사용)
metrics:
  duration: 약 3h30m
  completed: 2026-10-13
actuals:
  tokens: 23700
  tasks: 3
  commits: 2
plan_head_before: ba46b2f1103c2e6a536ba425e49779a9301c338e
---

# Phase 06 Plan 25: 카드 전표 증빙(EVID-01 카드 몫) Summary

카드 사용에 전표(이미지·PDF)를 붙인다 — 05 증빙 주인 표에 `corp_card_usage` 한 줄을 더하고, 수정 패널과 새 건 첫 저장(저장 → 주인 id → 올리기 → 수정 패널) 양쪽에서 첨부·삭제하며, 목록 증빙 열이 `있음`/`—`를 보인다. 중복은 지출결의 증빙과 한 종류로 세고, 보관된 카드 사용 전표는 중복 · 되살리기 · 되돌리기 재확인에서 모두 같은 조건으로 빠진다.

## 호출한 스킬

- `superpowers:test-driven-development` — 구현 전(Task 1 통합 RED · Task 3 통합 RED)
- `design-gate` — 화면 코드 전, 점검표 `docs/design/checks/2026-10-13-06-25-card-slips.md`
- `superpowers:systematic-debugging` — E2E 「카드 패널 중복 번호」 실패 추적(아래 Deviations 2)
- `superpowers:verification-before-completion` — 커밋 전(훅 요구) · 완료 판정 전

## 실행 게이트 · 이름 대응표

| 플랜 이름 | 실제 | 비고 |
|---|---|---|
| `OwnedEvidenceAttachments`(06-16 가칭) | `ui/attachments/Attachments`를 카드 폼 안에서 바로 연결 | 06-16에는 그 이름의 컴포넌트가 없다 — 지출결의 증빙 칸과 같은 `Attachments` 컨트롤드 컴포넌트(props mode · files · actions · maxMb · onChanged · openSignal · canAdd · deletableIds) |
| `loadCardUsageForEdit`(권리 판정 재사용) | `findCardUsageForWrite(includeArchived:true)` + `rightsOf` | `loadCardUsageForEdit`은 보관 건을 거부하고 무거운 DTO를 만든다 — 읽기는 보관 무관이어야 해서(E-46) 쓰기 권리 계산만 재사용 |
| `isCardUsageInListScope(viewer, id)` | `isCardUsageInListScope(viewer, {id, scope}, tx = db)` | repository viewer 첫 인자 lint 규칙 + scope를 도메인이 만들어 넘김 |
| 05-NEW 기법 | 새 지출결의의 「첫 저장」 선례를 따라 request 단계에서 저장 → 주인 id → 올리기 → `?editId=`로 `router.replace` | 주인 없는 대기 파일 없음 — 기법 차이 없어 멈추지 않음 |
| 06-16 훅 호출 줄 | `onApprovedEvidenceChange` · `lockParent`는 `OWNER_RULES.expense`의 선택 칸에만 있다 | `corp_card_usage` 줄에는 두지 않음(주석에 X-2 명시) — 지출결의 행 · version · 확인 기록 불변을 통합으로 고정 |
| 06-11 표 확인 | 「06-11 표 그대로 — 확장 없음」 | `DUPLICATE_SCOPES`에 expense ↔ corp_card_usage가 이미 있어 선언 위 주석 한 줄(「O-6 답이 바뀌면 이 함수만 고친다」)만 더함 |

## Task별 결과

| Task | 내용 | 커밋 |
|---|---|---|
| 1 (tracer) + 2 | 주인 표 한 줄 · 수정 패널 첨부/삭제 · 목록 증빙 열 · 새 건 첫 저장 · S13 첨부 없음 · 폰 사진 축소 | 1c53276 |
| 3 | 중복 한 종류 · 보관 제외 · `runRestore` 재확인 · E-46/drift ⑸/X-2 회귀 · 확인 창 없음 · 중복 번호 | cb713a1 |

Task 1과 2는 같은 폼 파일(`card-usage-form.tsx`)을 함께 바꿔서 한 커밋으로 묶었다(Deviations 1).

### RED / GREEN 증거

- Task 1 RED(구현 전): `card-usage-evidence.test.ts` 첫 케이스가 주인 종류 갈래 없음으로 빨강 — 정확한 메시지는 컨텍스트 압축 전 출력이라 보존하지 못했고, 구현 뒤 4건 GREEN을 다시 돌려 확인했다.
- Task 3 RED 1 — 「보관한 A와 같은 파일로 B 업로드 통과」: 보관 제외 전 `Error: 이미 첨부된 파일 · 다른 파일 고르기`로 빨강(3 failed 가운데 둘째 포함). `notArchivedCardSlip` 뒤 GREEN.
- Task 3 RED 2 — 「겹친 채 되돌리기 거부」: 보관 제외만 넣고 재확인 전 `Error: 거부되지 않았다`로 빨강(1 failed · 16 passed). `findLiveShaConflicts` 재확인 뒤 17 passed.
- E2E UI 층은 코드 뒤에 썼다(E2E RED 없음) — 통합 RED만 선행.

### 구조 grep

| 항목 | 결과 |
|---|---|
| `runRestore` 몸통의 `can(` · `getSettingValue(` · `loadCardUsageForEdit(` · `cardSlipRights(` · `isCardUsageInListScope(` (주석 제외) | 0 |
| `runRestore` 순서 grep | `lockQuoteLines( findLineLinks( card.dual-link-block card.execution-cap findLiveShaConflicts(` |
| `grep -c "export function duplicateScopeKinds"` upload-checks | 1 (새 선언 없음) |
| `grep -c "duplicateScopeKinds("` domain/evidence/index.ts | 2 |
| `grep -cE '^import .*domain/evidence' repositories/files.ts` | 0 |
| `grep -cE 'from "@/domain/evidence"' domain/corp-card-usages/index.ts` | 0 (`domain/evidence/upload-checks`만 import — 순환 없음) |
| `isCardUsageInListScope` 몸통의 `archived` | 0 (E-46) |
| 보관 카드 사용 제외 조건 자리 | `repositories/files.ts` 정의 19행 · `findActiveBySha` 54행 · `takenCondition`(takenElsewhere · findLiveShaConflicts 공용) 141행 — 한 판정 |

## 검증 (이 실행자가 돌린 것)

| 범위 | 결과 |
|---|---|
| 통합 card-usage-evidence (erp_test_0625) | 17 passed. `-t "보관 뒤 완료 재시도 = 같은 파일 · 새 행 0\|초안 되돌리기 — 카드 전표에 붙은 같은 영수증은 되살리지 않는다"` → 2 passed |
| 통합 card-usage-evidence · evidence-upload · evidence-void · approval-reserve-evidence · corp-card-usages · corp-card-usages-proxy · purchase-requests · leak-scan | 8 files, 4515 passed + 1 failed(내 테스트의 목록 키 단언 순서 오류 — 보관 뒤에는 목록 행이 없다) → 고친 뒤 card-usage-evidence 17 passed. 나머지 7개 파일은 전부 통과 |
| E2E CI=true (erp_0625_test) card-usage-evidence · card-usage · purchase-requests · card-proxy | 60 passed(card-usage-evidence 7건 포함) |
| 단위 전체 `pnpm vitest run --project unit`(마지막 코드 뒤) | 304 files · 4578 passed |
| `pnpm lint` · `pnpm typecheck` | 0 · 0 |
| C19 위험 경로(`git diff --name-only ba46b2f...HEAD`) | 0 |
| package.json · pnpm-lock.yaml · docs/design/tokens.css diff | 0 |

수치 설명: E2E의 18 skipped는 mobile 프로젝트 몫. `card-usage-panel-width` · 폰 카드 스펙을 더 돌리려던 명령이 인자 해석 때문에 E2E 전체를 돌렸고(1251 passed · 51 failed · 7 did not run, 41분) 실패는 전부 `people` · `vendors` · `side-panel`(거래처 패널) · `settings` · `quote-*` · `reserves` · `roles` 등 이번 변경과 무관한 스펙이다(해당 스펙에 `/cards` 참조 0, 카드 스펙은 실패 목록에 없음). 공용 DB · 동시 실행 조건의 영향으로 보이나 원인은 확인하지 못했다 — 오케스트레이터가 CI에서 확인.
단위 첫 실행에서 `mark-legacy` CLI 케이스가 5초 시간 초과로 한 번 빨갛게 나왔고 단독 · 전체 재실행에서 통과(부하 플레이크).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - 진행] Task 1·2를 한 커밋으로 묶음**
- **이유:** 같은 `card-usage-form.tsx`에 두 Task의 변경(수정 패널 첨부 · 새 건 첫 저장 · S13 분기)이 섞여 있어 Task 단위로 쪼개면 중간 커밋이 빌드되지 않는 상태가 된다.
- **커밋:** 1c53276

**2. [Rule 1 - 테스트 버그] E2E 「카드 패널 중복 번호」 경합**
- **Found during:** Task 3 E2E (systematic-debugging)
- **원인:** 파일 행은 올리는 중에도 보여서, 행이 보이자마자 DB에서 파일 소유를 지출결의로 옮기는 UPDATE가 0행이었다(완료 통보 전). 그래서 둘째 업로드가 「다른 카드 사용과 중복」이 되어 번호 없는 문구가 나왔다.
- **Fix:** 파일 행이 DB에 생길 때까지 폴링한 뒤 옮김. 제품 코드 변경 없음. 같은 바이트가 같은 sha가 되는 것도 확인됨.
- **커밋:** cb713a1

**3. [Rule 1 - 회귀] `cards-page` 단위 테스트의 모듈 모의**
- **이유:** `app/(app)/cards/page.tsx`가 `@/domain/evidence` · 설정 · `CARD_USAGE_ENTITY`를 읽게 되어 기존 모의가 `CARD_USAGE_ENTITY` 없음으로 스위트 실패(Task 1 커밋 직후 발생, Task 3 커밋에서 수정).
- **Files modified:** test/unit/app/cards-page.test.ts (플랜 files_modified 밖 — 테스트 모의만)
- **커밋:** cb713a1

**4. [설계 선택] 권리 판정 재사용 방식** — 대응표 참조(`findCardUsageForWrite(includeArchived:true)` + `rightsOf`). 읽기가 보관 무관이어야 해서 `loadCardUsageForEdit`을 쓰지 않았다.

플랜 files_modified 12개 밖에 더한 파일: `docs/design/checks/2026-10-13-06-25-card-slips.md`(design-gate 훅 요구) · `test/unit/app/cards-page.test.ts`(위 3).

### 열린 점(제품 결정 없음 · 기록)

- 새 건 첫 저장에서 「저장은 되었는데 모든 업로드가 실패」하면 건은 이미 생긴 상태다 — 이때 1차 제출은 새로 만들지 않고 그 건의 수정 패널로 보낸다(중복 건 방지). 실패한 파일 행은 지우기로 정리. 저장된 건은 S8 행 `삭제`로 되돌릴 수 있다(T-06-562 accept와 같은 선례).
- 막힌 새 건(결제 합계 없음 등)에 파일을 놓으면 저장이 거부되어 실패 행 + 막힘 이유가 보인다(E2E로 고정, 서버 행 0).

## Known Stubs

없음.

## Threat Flags

없음 — 새 서버 액션 `requestCardSlipUploadAction`은 플랜 threat_model(T-06-194 ~ 197)이 다루는 표면이고 `ownerKind`는 서버에서 고정한다.

## 06.5 정리 대상

없음 — 이번 변경에 `evidence_amount` · `pickPaymentAmount` 새 읽기 0건.

## 오케스트레이터 몫(아직 안 함)

이 실행자는 서브에이전트라 아래를 하지 않았다(완료로 표시하지 않음):

- 독립 DOM 감사(A4) — 실행자가 아닌 별도 에이전트가 `CI=true`로 UI-SPEC S7(카드 패널 첨부 영역 · 파일 행 · 오류 넷) · S8(증빙 열 `있음`/`—` · 폰 행 시트 P3 · 좁은 PC에서 P3 증빙부터 숨김) · S9(새 건 · 수정 두 모드의 `증빙` 줄 · 첫 저장 뒤 수정 패널) · S13(첨부 영역 없음) DOM 실측. backstop 2건: S7 overflow(파일 10개 이상 카드 사용의 수정 패널, 본문만 스크롤 · 행동 줄 고정)와 S7 long-text(80자 한글 파일명 말줄임 + `title`, 3차 `삭제`를 밀지 않음) — 1280 · 768 · 375 · 320 폭
- `/design-review`(+ Codex 디자인 검토 `bash scripts/codex-design-review.sh`) → `/qa` — 화면 영향(app/ `.tsx`)
- `/review` — 코드
- `/cso` — 돈 · 결재 경로 표에는 해당하지 않으나 외부 입력(새 서버 액션 · 파일 업로드)이 있어 판단 대상
- 위험 경로 변경 없음(C19 0) — origin/main 머지 뒤 재확인은 PR 단계
- 전체 E2E 한 번(CI) — 위 「검증」의 무관 스펙 51건 실패 원인 확인 포함

## Self-Check: PASSED

- 파일 존재: test/integration/card-usage-evidence.test.ts · test/e2e/card-usage-evidence.spec.ts · docs/design/checks/2026-10-13-06-25-card-slips.md — FOUND
- 커밋 존재: 1c53276 · cb713a1 — FOUND (`git log ba46b2f..HEAD`)
- `commits: 2`는 `git rev-list --count ${plan_head_before}..HEAD`로 측정(코드 커밋만, 이 SUMMARY 커밋 제외)

## 검토 후 고친 것

독립 DOM 감사(`/mnt/project-files/notes/06-review/06-25-dom-audit.md`)의 결함 3건. 실패 E2E를 먼저 두고(RED 확인) 고쳤다.

| 감사 | 심각도 | 고친 곳 | 내용 | 커밋 |
|---|---|---|---|---|
| D-1 | 중간 | `app/(app)/cards/card-usage-form.tsx` (`uploading` 상태 · `blockedReason` · `<Attachments onUploadingChange>`) | 올리는 행이 있는 동안 1차가 `aria-disabled` + 이유 줄 `증빙 올리는 중 · 잠시 뒤 제출`로 막힌다(지출결의 `UPLOADING_REASON` 재사용). 클릭 · Ctrl+Enter는 저장을 부르지 않는다(E2E: 이 건 id를 실은 서버 액션 0 · version 그대로). 첫 저장(`saveForSlip`)은 칸 막힘 `formBlock`만 본다 | 7549f6e |
| D-3 | 낮음 | `app/(app)/cards/card-usage-form.tsx` (`refuseWhileBlocked` · 증빙 칸 래퍼 `onChangeCapture`/`onDropCapture`) | 첫 저장을 못 하는 새 건(칸 막힘)에 놓은 파일은 받지 않는다 — 막힘 줄 한 곳만 남고 실패 파일 행은 만들지 않는다 | 38fc6b6 |
| D-2 | 낮음 | `ui/attachments/Attachments.module.css` (`.name`) · `ui/attachments/Attachments.tsx` (파일 행 · 올리는 행 · 무효 행 `title`) | 공용 컴포넌트. 한 줄 말줄임(`nowrap` · `ellipsis`) + `title`. E2E가 1280 · 375 · 320에서 한 줄 · title 일치 · 삭제가 행 밖으로 밀리지 않음을 단언 | 87db727 |
| D-1 보충 | 중간 | `app/(app)/cards/card-usage-form.tsx` (`uploading` 동안만 `beforeunload` 경고 효과) | 올리는 행이 있는 동안 떠나면 브라우저 기본 경고. 지출결의 폼(`expense-form.tsx:233-239`)과 같은 효과이고 올리는 행이 없으면 등록하지 않는다. E2E: 올리는 중 `page.close({ runBeforeUnload })`에 `beforeunload` 대화상자 1회, 끝난 뒤에는 대화상자 없이 닫힘 | 48d5c18 |
| 점검표 | — | `docs/design/checks/2026-10-13-06-25-card-slips.md` | 「화면:」에 Attachments 두 파일 추가 · 항목 근거 갱신 · 「감사 뒤 수정」 절 | ba01493 |

- 디버깅 기록: D-1 연결 직후 `새 건 첫 저장 첨부`가 실패했다. 원인은 올리는 행이 생기자 `blockedReason`에 올리는 중이 들어가 `saveForSlip`의 막힘 검사에 걸려 첫 저장이 거부된 것이다(실패 행 문구가 `증빙 올리는 중 · 잠시 뒤 제출`). 칸 막힘(`formBlock`)과 1차 막힘(`blockedReason`)을 나눠 고쳤다.
- D-1 E2E 첫 판은 금액 미리보기 서버 액션(`previewCardAmountsAction`) POST 1건을 저장으로 센 오탐이 있어, 이 건 id를 싣는 액션만 세도록 고쳤다.
- 위의 「Known/기록」 중 이전 문장 「막힌 새 건에 파일을 놓으면 … 실패 행 + 막힘 이유가 보인다」는 D-3으로 바뀌었다: 이제 막힘 이유 한 줄만 선다(실패 행 없음).

### 검토 후 고친 뒤 검증

- `pnpm lint` exit 0 · `pnpm typecheck` exit 0 · `pnpm test:unit` 304 파일 / 4578 테스트 통과
- 통합 테스트: 이번 수정은 UI 파일과 E2E뿐이라 건드린 통합 테스트 파일 없음(돌리지 않음)
- `CI=true` E2E(`--no-deps`, 격리 DB `erp_0625f_test`, `flock`)
  - desktop: card-usage-evidence · card-usage · card-usage-panel-width · expense-form · expense-submit-mobile-approval · expense-new · evidence-lifecycle · expense-a11y · approval-reserve-evidence — 86 통과 · 1 실패(`폰 전표 사진 축소`, 아래)
  - mobile-375: mobile-card-usage-320 · mobile-expense-form · mobile-expense-new · mobile-expense-320 · mobile-expense-wave11 — 33 통과
  - 최종 커밋 뒤 card-usage-evidence + card-usage 29 통과
  - `beforeunload` 추가 뒤(격리 DB `erp_0625g_test`) card-usage-evidence + card-usage 30 통과 · lint exit 0 · typecheck exit 0 · 단위 304 파일 / 4578 통과
- `폰 전표 사진 축소`는 병렬 부하에서 4000x3000 미리보기 디코딩이 5초 폴링을 넘긴 1회 실패였다. 같은 스펙 `--repeat-each=4`는 4/4 통과, 최종 커밋 뒤 재실행도 통과해 환경 지연으로 본다(수정과 무관: D-1 연결 전후 모두 통과한 기록이 있다).

## 검토 후 남긴 것

기록만 하고 고치지 않았다(감사 관찰 O-1 ~ O-9).

- **O-1**: 폰 `하나 더` 버튼 너비 35.9px(높이 44). 05 공용 컴포넌트 소유 · 지출결의와 같은 값. 높이를 44 영역으로 보는 §7-10 기준이면 통과에 가깝다
- **O-2**: 수정 권리가 있는 주인은 폰 목록 행 탭이 수정 패널로 가서 목록에서 증빙 `있음/—`을 볼 길이 없다(행 시트 `증빙` 줄은 권리 없는 사람에게만). 설계대로
- **O-3**: 폰 목록 행 128px(375)/159px(320) · 칸 2~6줄 — 적용 전과 같은 값(06-05 열 접기 구조)
- **O-4**: 새 건 첫 저장 뒤 수정 패널로 바뀔 때 포커스가 사용일 입력(첫 칸)으로 간다. 방금 놓은 파일 행/`하나 더`가 아니라 키보드 사용자는 증빙 칸까지 다시 Tab해야 한다
- **O-5**: 되돌리기 거부 문구 `이미 첨부된 파일 · 다른 파일 고르기`는 목록 화면에 「다른 파일 고르기」 자리가 없다 — UI-SPEC이 정한 문구라 바꾸지 않았다
- **O-6**: 13자리 금액은 도메인이 거부한다(10자리 9,999,999,999는 칸 안에 선다)
- **O-7**: 열림 애니메이션 중 패널 left 842 일시 값 — 1.5초 뒤 안정, 결함 아님
- **O-8**: `beforeunload` 경고와 업로드 중 저장 클릭 결과는 감사에서 측정하지 못했다. 이번에 둘 다 E2E로 고정했다 — 저장 클릭은 막힘(서버 액션 0), `beforeunload`는 올리는 중에만 경고가 뜨고 끝나면 없다(코디네이터 지시로 D-1 범위에 추가)
- **O-9**: 768(좁은 PC)에서는 증빙 열이 숨는다 — 플랜 must_have 「좁은 PC는 P3 증빙부터 숨긴다」 그대로

추가로 알린다.
- SYSTEM §7-10은 올리는 중 막힘을 `reasonTone: "info"`(진행 상태 톤)로 정한다. `PanelForm`에는 톤 속성이 없어(공용 `ui/side-panel`) 이번에는 막힘 톤 그대로 문구만 선다. 톤 지원은 PanelForm 변경이라 이번 범위 밖이다
- D-3은 막힌 새 건(칸 막힘)만 다룬다. 서버가 첫 저장을 거부하는 경우(예: 서버 오류)는 기존대로 실패 행 + `attachError` 줄이 같은 문구를 두 번 보일 수 있다 — 감사에서 측정된 바 없어 건드리지 않았다
