---
phase: 04-project-quote-ledger
plan: 22
subsystem: projects
status: complete
tags: [project-period, seen-status, dirty-storage, next-safe-action, drizzle, postgres, playwright]

requires:
  - phase: 04-11
    provides: loadProjectForGate(잠금 안 판정) · applyAutoSettlement · projectResponsibles · coversProjectTeam · 상세 「종료일 지남」
  - phase: 04-20
    provides: StatusChangedError · statusChangedMessage · listProjectStatusCatalog · updateProjectStatusIfCurrent · recordAction { tx }
  - phase: 04-28
    provides: 거부 봉투(rejected) · FIELD_TO_COLUMN · 충돌 칸
  - phase: 04-32
    provides: withTransaction · tx-safety 풀 2 스위트
provides:
  - domain/projects/period.ts — periodEditRights · resolvePeriodSave · validatePeriodChange · previewPeriodChange(저장될 값 위에서)
  - 게이트 규칙 project.period-edit · 메뉴 키 projects.period(「프로젝트 기간 변경」) + 팀장·본부 책임자·대표 시드(insert-if-absent)
  - updateProjectPeriod(기준값 IS NOT DISTINCT FROM 조건부 UPDATE)
  - saveProjectLedger의 period 입력 + 필수 seenStatus(첫 loadProjectForGate 직후 비교 → 전체 롤백)
  - 액션 결과 { periodRejected: { errors } } · { statusChanged: { message } }
  - 상세 기간 칸(period-field.tsx) · 「기간 바꾸기」 3차 · openPeriodField(04-44가 잇는다)
  - D-68 미저장 보관 배선(편집 순간 persist · 「복원」 병합 · 실제 dirtyCount · recount)
affects: [04-12, 04-24, 04-30, 04-44]

actuals:
  tokens: 32600
  tasks: 2
  commits: 4
plan_head_before: 8c3ede04edbb4dae7d48338fa39fc84912244fd8

tech-stack:
  added: []
  patterns:
    - "합성 저장 tx 순서(ENG-D6): 잠금·판정 → seenStatus 비교 → 기간 권리·검증 게이트 → 기간 쓰기·로그 → 재판정 → 견적 줄 → 매출"
    - "기간 낙관 검사는 version이 아니라 화면이 읽은 {startDate,endDate} 기준값(IS NOT DISTINCT FROM) — 상태만 바뀐 행은 헛충돌하지 않는다"
    - "액션의 판별 봉투는 명시 반환 타입의 도우미 함수로 만든다(객체 리터럴 합집합 정규화가 'x' in data 좁히기를 깨뜨림)"
    - "미저장 보관: 편집 핸들러가 ref를 켜고 상태 반영 뒤 효과가 전체 스냅숏을 persist — 서버 값으로 다시 그리는 경로는 켜지 않는다"
    - "status prop 변화는 렌더 중 조정(useState 이전 값 비교)으로 감지해 편집 상태를 서버 props로 되돌리고 recount"

key-files:
  created:
    - domain/projects/period.ts
    - app/(app)/projects/[id]/period-field.tsx
    - test/unit/domain/project-period.test.ts
    - test/integration/project-period.test.ts
    - test/e2e/ledger-save-flow.spec.ts
  modified:
    - domain/projects/ledger.ts
    - domain/permissions/menus.ts
    - domain/seed/index.ts
    - domain/rules/register.ts
    - repositories/projects.ts
    - app/(app)/projects/actions.ts
    - app/(app)/projects/[id]/page.tsx
    - app/(app)/projects/[id]/quote-table.tsx
    - app/(app)/projects/[id]/project-detail.module.css
    - ui/table/use-dirty-storage.ts
    - test/unit/ui/dirty-storage.test.ts
    - test/integration/tx-safety.test.ts
    - test/integration/ledger-ownership.test.ts
    - test/integration/revenue-entries.test.ts
    - test/e2e/project-period.spec.ts
    - test/e2e/revenue-section.spec.ts

key-decisions:
  - "사용자 결정 2026-09-25 「기간만 수정」: 팀장 이상의 기간 권리는 새 메뉴 키 projects.period 쓰기 + 자기 팀(또는 전사) — projects.status가 아니다. 팀장은 projects 쓰기를 받지 않는다. 담당 PM 권리는 계속 projects 쓰기가 필요하다"
  - "권리 판정을 충돌·검증보다 먼저(한 게이트 project.period-edit) — 권한 없는 사람에게 충돌·검증 결과를 내보이지 않는다"
  - "합성 저장의 findProject 선확인(풀에서 자동 정산 커밋)을 범위 + uuid 모양 확인으로 바꿨다 — (g) 자정 넘김 롤백 의미를 지키기 위해(A-13)"
  - "seenStatus 거부는 권한 위반이 아니므로 write.denied를 남기지 않는다. 같은 tx의 자동 정산도 되돌아가고 다음 읽기 경로가 다시 판정한다(시스템 로그 1줄)"

patterns-established:
  - "04-44는 총 매출 예상가 칸 키 preEstimate:*를 editsSnapshot/mergeRestoredEdits에 더한다 — persist 배선을 다시 만들지 않는다"
  - "04-30은 새 줄 키 {clientKey}:new를 화면 uuid로 바꾼다"

requirements-completed: [PROJ-04, UX-04]

coverage:
  - id: P1
    description: "기간 권리·검증·미리보기·저장 해석 결정표(저장될 값 · 달력 · 팀 범위 · projects.period)"
    requirement: PROJ-04
    verification:
      - kind: unit
        ref: "test/unit/domain/project-period.test.ts"
        status: pass
    human_judgment: false
  - id: P2
    description: "정산 연장·앞당김·종료일 기본값·로그 행위자·경합·자정·로그 실패 롤백·기준값 충돌·판정 순서·차수 불일치"
    requirement: PROJ-04
    verification:
      - kind: integration
        ref: "test/integration/project-period.test.ts#(a)~(n) · 사용자 결정 lead-only-period · seed projects.period"
        status: pass
      - kind: integration
        ref: "test/integration/tx-safety.test.ts#풀 2 · 동시 기간 저장 셋(04-22)"
        status: pass
    human_judgment: false
  - id: P3
    description: "상태 바뀜 저장 전부 거부(DR-6) → 태그 다시 그림 → 복원 줄로 편집 회수(D-68)"
    requirement: UX-04
    verification:
      - kind: integration
        ref: "test/integration/project-period.test.ts#(g)(g2)(g3)"
        status: pass
      - kind: e2e
        ref: "test/e2e/ledger-save-flow.spec.ts"
        status: pass
      - kind: unit
        ref: "test/unit/ui/dirty-storage.test.ts#readRestorableCount · recount"
        status: pass
    human_judgment: false
  - id: P4
    description: "상세 기간 칸 화면 — 팀장 연장 트레이서 · PM 앞당김 오류 + U-6 합계 행 · 「저장하면 정산이 됨」 → 정산 태그 · Esc 되돌리기/닫기 포커스"
    requirement: PROJ-04
    verification:
      - kind: e2e
        ref: "test/e2e/project-period.spec.ts#(3)(4)(5)(6)"
        status: pass
    human_judgment: false
---

# Phase 4 Plan 22: 상세 기간 칸 · 상태 바뀜 전부 거부 · 미저장 보관 배선 Summary

**팀장은 새 `projects.period` 권한(기간만), 담당 PM은 `projects` 쓰기로 상세에서 기간을 고친다. 판정은 합성 저장 한 트랜잭션 안에서 저장될 값 위에서 이뤄진다(정산 연장 → 진행 되돌리기, 앞당김 → 정산). 화면이 본 상태와 서버 상태가 다르면 `seenStatus`로 저장 전체가 거부되고, 편집은 브라우저 보관본의 복원 줄로 돌아온다.**

## Performance

- **Duration:** 약 42분(마지막 세션 기준: 8c3ede0 06:35 UTC → d105dfe 07:17 UTC, 앞선 컨텍스트 세션 포함 시 더 길다)
- **Completed:** 2026-09-25
- **Tasks:** 2/2
- **Files:** 21개(생성 5 · 수정 16)

## Accomplishments

- `domain/projects/period.ts`를 추가했다. 권리(`lead`/`pm`/`none`), 저장 해석(D-80 되돌리기 · D-82 종료일 = 시작일), 검증, 미리보기를 한 모듈의 순수 함수로 둔다.
- 합성 저장(`saveProjectLedger`)이 `period`를 받는다. 트랜잭션 안의 순서는 잠금 → `seenStatus` 비교 → 게이트 `project.period-edit` → 조건부 UPDATE → `document_update` 로그 → (필요 시) 진행 되돌리기와 사람 행위자 `status_change`(`trigger: end_date_extended`) → 재판정 → 견적 줄 → 매출이다.
- 필수 `seenStatus`를 받는다. 다르면 `StatusChangedError`를 던져 전체를 롤백한다. 액션은 롤백 뒤 라벨을 조회해 `{ statusChanged: { message } }`를 돌려준다.
- 상세 머리 줄에 `기간 X ~ Y` 한 줄과 3차 「기간 바꾸기」를 두었다. 기간 칸(두 날짜 입력, Enter 막음, Esc 되돌리기/닫기, Ctrl+S 저장, `Form.Hint` 미리보기, `Form.Error` 칸 오류)은 같은 1차 「일괄 저장」으로 저장된다.
- D-68 보관 배선을 수리했다(04-04 실행분은 `persist`를 부르지 않고 「복원」 반환값을 버렸다):
  - 편집 순간 persist;
  - 복원 값을 dirty 모양으로 병합;
  - 실제 `dirtyCount`를 넘겨 이탈 경고가 동작함;
  - 상태 바뀜 거부 뒤 `router.refresh()`, status prop 변화 감지, `recount()`.
- 1차 N = 0 이유를 `바뀐 칸 없음`(info)으로 바꿨다. 기간 칸 오류로 거부되면 합계 행에 `전부 거부 · 다른 칸 오류 N칸`을 붙인다(U-6).

## Task Commits

1. **Task 1 RED:** `fc52150` test(04-22): tracer RED for period field lead extension
2. **Task 1 GREEN:** `49c2603` feat(04-22): period field tracer — lead extends settling back to in progress
3. **Task 2 RED:** `404fb1b` test(04-22): RED for period validation, preview, seenStatus rejection and restore
4. **Task 2 GREEN:** `d105dfe` feat(04-22): period decision table, seenStatus full rejection and dirty-storage wiring

## TDD 증거 (RED → GREEN)

- **Task 1 RED:** 트레이서(E2E (3), 통합 (a)(m)(m2))가 기간 입력이 없어 실패했다. GREEN 뒤 통합 49/49(5파일)와 E2E 5개가 통과했다.
- **Task 2 RED:**
  - 단위 17개가 함수 없음으로 실패했다.
  - 통합 10개가 실패했다.
  - E2E (4)(5)와 ledger-save-flow가 실패했다.
  - E2E (6)은 Task 1에서 Esc를 이미 구현해 RED에서도 통과했다(편차 7).
- **Task 2 GREEN:** 처음에 E2E 3개가 실패했다. 원인은 셋 다 테스트 준비 쪽이었다(편차 8~10). 고친 뒤 전부 통과했다.

## Gates Run (실행자)

| 게이트 | 결과 |
|---|---|
| `pnpm lint` | 0 오류 |
| `pnpm typecheck` | 0 오류 |
| `pnpm lint:sql` | 0 issues(14 files) |
| `pnpm build` | exit 0 |
| 단위 `project-period` + `dirty-storage` | 46/46 |
| 통합 `project-period` | 24/24 |
| 통합 `tx-safety` | 6/6 |
| 통합 `ledger-ownership` | 5/5 |
| 통합 `revenue-entries` | 11/11 |
| 통합 `project-auto-settlement` | 22/22 |
| 통합 `project-status` | 22/22 |
| 통합 `quote-lines` | 6/6 |
| E2E(CI=true) `project-period` · `ledger-save-flow` · `quote-table` · `revenue-section` · `permissions-grid` · `number-format` | 40/40 |
| E2E(CI=true) `project-lifecycle` | 12/12 |

전체 `pnpm test`는 지시대로 돌리지 않았다. `package.json`과 `pnpm-lock.yaml`은 바뀌지 않았다.

## 사용자 결정 적용 (2026-09-25 15:29 KST 「기간만 수정」)

- `domain/permissions/menus.ts`의 `projects.status` 옆에 `{ key: "projects.period", label: "프로젝트 기간 변경" }`를 추가했다.
- `domain/seed/index.ts`의 statusDefaults(insert-if-absent)에 팀장·본부 책임자·대표의 `projects.period` 쓰기를 추가했다.
- `periodEditRights`의 lead 조건은 `canEditPeriod`(= `projects.period` 쓰기)와 `actorCoversTeam`이다. PM 조건은 담당 PM이면서 `projects` 쓰기를 가진 경우다.
- 통합 테스트가 결정을 증명한다:
  - 시드 권한만 가진 팀장은 기간 저장이 통과한다.
  - 같은 저장에 견적 줄 변경을 실으면 전체가 거부된다.
  - 시드 테스트로 `projects.period`가 세 계급에 들어간 것을 확인했다.
- 권한 표 E2E(`permissions-grid`)는 행을 숨기지 않은 채 초록이다.
- 04-11의 「없는 프로젝트 응답 코드」 카드는 「지금대로」 두었다.

## 새 문구

| 자리 | 문구 |
|---|---|
| 게이트 거부(권리 없음, 종료 칸) | `기간 바꾸기 권한 없음` |
| 권한 표 행 라벨 | `프로젝트 기간 변경` |
| 머리 줄 기간 | `기간 미정` · `기간 {시작} ~ {종료}`(빈 쪽은 `—`) |
| 3차 버튼 | `기간 바꾸기` |
| 칸 오류 — 형식 | `날짜 형식이 아닙니다 · 2026-09-18처럼 적어 주세요` |
| 칸 오류 — 시작일 필수 | `진행부터는 시작일이 있어야 합니다 · 시작일을 적어 주세요` |
| 칸 오류 — 종료<시작 | `종료일이 시작일보다 빠릅니다 · 종료일을 고쳐 주세요` |
| 칸 오류 — PM 앞당김 | `종료일이 오늘보다 빠름 · 앞당기기는 팀장 {이름}`(이름 없으면 `종료일이 오늘보다 빠름`) |
| 칸 오류 — 동시 수정 | `다른 사람이 먼저 기간을 바꿈 · 새로 고침` |
| 차수 불일치 | `차수와 프로젝트가 맞지 않음 · 새로 고침` |
| 미리보기 | `저장하면 진행으로 돌아감` · `저장하면 정산이 됨` · `종료일이 비어 시작일로 저장됨` |
| 합계 행(U-6) | `전부 거부 · 다른 칸 오류 N칸` |
| 합계 행(DR-6) | `상태가 {라벨}로 바뀜 · 전부 거부`(statusChangedMessage) |
| 1차 N = 0 이유 | `바뀐 칸 없음`(info) |

## Decisions Made

frontmatter `key-decisions` 참조.

## Deviations from Plan

### Auto-fixed Issues / 계획 대비 편차

1. **[사용자 결정] 기간 권리의 출처를 `projects.status`에서 `projects.period`로 바꿨다.** 플랜이 `projects.status`라 적은 모든 자리가 해당된다. 입력 이름은 `canEditPeriod`다. 담당 PM 권리는 계속 `projects` 쓰기다.
2. **[Rule 1 - Bug] 합성 저장 앞의 `findProject` 선확인을 범위 + uuid 모양 확인으로 바꿨다.**
   - 원인: `findProject`는 풀에서 자동 정산을 커밋한다. 그러면 (g) 자정 넘김 거부가 「DB 무변경」을 지킬 수 없었다(A-13).
   - 파일: `domain/projects/ledger.ts`.
   - 테스트: 통합 (g).
3. **판정 순서: 권리를 충돌·검증보다 먼저 본다.** 권리·충돌·검증을 게이트 `project.period-edit` 하나로 판정한다(anti-pattern M1). 그래서 권한 없는 사람에게는 충돌 문구 대신 `기간 바꾸기 권한 없음`이 나간다.
4. **ledger-save-flow E2E는 편집자를 팀장이 아니라 담당 PM으로 둔다.**
   - 이유: 사용자 결정으로 팀장에게 `projects` 쓰기가 없어 견적 줄 셀을 고칠 수 없다.
   - 미수주로 닫는 쪽은 다른 컨텍스트의 동료 팀장이다.
   - 이 때문에 플랜 문구의 「진행으로 되돌리기가 보이며」는 단언하지 않았다(PM에게는 상태 바꾸기 권리가 없다).
5. **통합 (g2)는 액션 파일을 직접 import하지 않는다.** vitest에서 `"use server"` 파일과 next-safe-action 클라이언트를 불러올 수 없어서다. 대신 액션이 쓰는 같은 함수 `listProjectStatusCatalog`와 `statusChangedMessage(label, "전부 거부")`로 문구 `상태가 미수주로 바뀜 · 전부 거부`를 단언한다. 액션 경로 자체는 E2E ledger-save-flow가 덮는다.
6. **`projectResponsibles`의 팀장 이름 후보는 여전히 `projects.status` 쓰기 보유자(04-11)다.** 시드상 같은 세 계급이라 PM 문구 `앞당기기는 팀장 {이름}`은 맞다. 두 권한을 따로 주는 경우 이름이 달라질 수 있어 남은 항목으로 적는다.
7. **E2E (6) Esc는 Task 2 RED에서도 통과했다.** Task 1 트레이서 구현이 이미 Esc 되돌리기와 닫기를 넣었기 때문이다.
8. **[Rule 1 - 테스트 준비] E2E (4)(5) 고정물의 시작일.**
   - 원인: `makeProject`의 시작일이 종료일 − 3일(= 오늘 + 2일)이었다. 그래서 어제로 앞당긴 종료일이 「시작일보다 빠름」 오류에 먼저 걸렸다.
   - 수정: 선택 인자 `startDate`를 추가하고 두 테스트에 과거 시작일을 준다. 단언은 바꾸지 않았다.
9. **[Rule 1 - 테스트 준비] E2E (4)에 견적 줄 하나를 추가했다.** 빈 표에는 합계 행(tfoot)이 없어 U-6 줄이 붙을 자리가 없었다. 단언은 그대로다.
10. **[Rule 1 - 테스트 준비] ledger-save-flow의 셀 편집을 `Enter → Control+a → 입력`으로 바꿨다(number-format.spec과 같은 패턴).**
    - 원인: 편집 칸이 기존 값을 채운 채 열려 `777000`이 뒤에 붙었다(500000777000).
    - 편집 직후 `777,000` 단언을 더했다(강화).
11. **Zod의 기간 날짜 스키마는 느슨하게 둔다**(`string().max(10).nullable()`). 형식과 달력 검증은 도메인 `validatePeriodChange`가 칸 오류로 돌려준다(Zod 오류는 칸에 붙지 않는다). 기준값은 `\d{4}-\d{2}-\d{2}` 정규식으로 받는다.
12. **동시 수정 거부의 칸은 `end`로 둔다.** 두 칸 중 한 곳에만 문구를 둔다.
13. **옛 차수 불일치 문구를 rev 5 문구 `차수와 프로젝트가 맞지 않음 · 새로 고침`으로 바꿨다.** 기록은 `denyWrite`(`quote.revision-project`)로 한 번 남긴다.
14. **[Rule 1] `ledger.ts`에서 불필요한 `as ProjectStatus` 단언 하나를 뺐다(lint).**
15. **보관 범위.** 매출 칸(계약 금액·발행·입금)은 D-68 보관 키 목록(플랜 ⑤ (i))에 없어 보관하지 않는다. 기존 줄의 Alt+↑↓ 「이동만」 변경(값 차이 없음)도 보관 키가 없다. 줄 삭제는 스냅숏에서 빠지는 것으로 반영한다(04-04 이래 기존 줄 삭제는 서버로 보내지 않는다 — 기존 동작 그대로).

## Issues Encountered

- TS가 객체 리터럴 반환 합집합을 정규화해(`key?: undefined`) `"x" in data` 좁히기가 깨졌다. 명시 타입 도우미 함수 `periodRejected`와 `statusChanged`로 해결했다.

## Known Stubs

없음.

## Threat Flags

없음. 새 권한 키 `projects.period`는 플랜 threat_model의 게이트 규칙 `project.period-edit` 안에 있다. 거부는 `denyWrite`로 `write.denied`를 남긴다.

## Next Phase Readiness

- 04-44: `openPeriodField(focus)`로 상태 모달의 「기간 적기」와 결과 줄 「기간 바꾸기」를 잇는다. `preEstimate:*` 키는 `editsSnapshot`/`mergeRestoredEdits`에 더한다.
- 04-12: 합성 저장 순서의 재판정 뒤 자리에 정산 편집 매트릭스를 얹는다.
- 04-30: 저장 중 잠금 케이스를 ledger-save-flow에 더하고, 새 줄 키를 화면 uuid로 바꾼다.

## 남은 확인

- **한도 풀리면 Codex 재확인 필요** — Codex 한도가 소진돼 이 플랜의 교차 검토를 돌리지 못했다.
- 편차 6(`projectResponsibles` 후보 권한)은 두 권한을 따로 주는 운영이 생기면 다시 본다.

## Self-Check: PASSED

- 생성 파일 5개 존재 확인
- 커밋 fc52150 · 49c2603 · 404fb1b · d105dfe 존재 확인
- `git rev-list --count 8c3ede0..HEAD` = 4

## 리뷰 반영

- Opus 독립 검토(`phase4-prep/04-22-review-opus.md`): BLOCKING 0 · SHOULD-FIX 5 · NIT 7.
- **S1 반영** — 견적 줄 게이트가 트랜잭션 안의 새 행(기간 쓰기·재판정 뒤)으로 판정한다(`findProjectById`가 tx를 받음). 통합 (n)이 gate 호출의 행·ctx(`settling`)를 단언하도록 조였고, 줄 저장을 기간 쓰기 앞으로 옮긴 변이에서 실패함을 확인했다. RED 9bd3134 · GREEN a138b25.
- **S4 반영** — 기간 거부 문구의 팀장 이름을 `projects.period` 쓰기 보유자에서 찾는다. `teamLeadCandidatesAtDate`에 `menu`(기본 `projects.status`, 04-11 안내 뜻 유지). 통합 (b3)(b4). RED 16fb3a1 · GREEN 31a2249. 편차 6의 걱정은 이로써 닫힌다.
- **S5 반영** — 화면의 `seenStatus`를 저장 결과로 갱신한다. E2E (3b)가 RSC 새로 고침을 붙잡아 둘째 저장을 재현하고, `seenStatus: status` 변이에서 실패함을 확인했다. RED 7636ac0 · 테스트 정리 f5a9dc5 · GREEN c2d72ee.
- 넘김(미반영):
  - S2 — 복원이 줄 version·기간 기준값을 보관하지 않아 동료 변경을 조용히 덮을 수 있다 → 04-30/04-49 truths에 명시.
  - S3 — DR-6 거부 뒤 매출 편집(계약·발행·입금)이 보관 없이 사라진다 → 그룹 B 또는 04-30 truths로.
  - N1 — `seenStatus` 비교가 쓰기 권한 판정보다 앞(누출 없음).
  - N2 — `ledger-save-flow.spec.ts` 끝의 `page.reload()`가 이탈 경고로 무의미할 수 있다.
  - N3 — 트랜잭션 안 `StatusChangedError` 메시지에 상태 코드값이 들어간다.
  - N4 — `closePeriodFieldAfterSave`의 `setTimeout(600)` 정리 누락.
  - N5 — `PeriodField`의 `inputMode="numeric"`(모바일 `-` 없음) → 04-44 DOM 감사에서.
  - N6 — 완료 프로젝트에서 계약 칸 편집 가능 조건과 `canSave` 불일치 → 04-12.
  - N7 — 기존 줄 삭제가 서버로 가지 않아 복원 뒤 지운 줄이 되살아나 보인다 → 소유 플랜 지정 필요.
- 검증: lint · typecheck · lint:sql 통과. 통합 project-period 26/26 · tx-safety 6/6 · project-auto-settlement 22/22 · quote-lines 6/6 · project-status 22/22. 단위 70/70. E2E(CI=true) project-period 8/8 · ledger-save-flow 1/1.
- **한도 풀리면 Codex 재확인 필요.**
