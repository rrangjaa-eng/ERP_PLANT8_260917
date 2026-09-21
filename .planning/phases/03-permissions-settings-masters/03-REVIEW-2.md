---
phase: 03-permissions-settings-masters
reviewed: 2026-09-21
depth: deep
scope: "f828fa8..b19590d (docs/phase3-reverify) — 소스 11파일"
files_reviewed: 11
files_reviewed_list:
  - app/(app)/admin/code-tables/actions.registry.ts
  - app/(app)/admin/code-tables/actions.ts
  - app/(app)/admin/code-tables/code-item-form.tsx
  - app/(app)/admin/code-tables/code-tables.module.css
  - app/(app)/admin/code-tables/page.tsx
  - app/(app)/admin/corp-cards/card-form.tsx
  - app/(app)/admin/corp-cards/corp-cards.module.css
  - app/(app)/admin/corp-cards/page.tsx
  - domain/code-tables/index.ts
  - domain/corp-cards/index.ts
  - repositories/code-tables.ts
findings:
  critical: 0
  high: 1
  medium: 3
  low: 5
  total: 9
status: issues_found
---

# 03-REVIEW-2.md — Phase 3 재검증 후속 커밋 코드 리뷰

- 대상: `b19590d` "feat(03): 코드표 항목 이름·법인카드 소유자 수정 화면" (`main` `f828fa8` 대비)
- 범위: 소스 11파일(`app/` `domain/` `repositories/`). 테스트 6파일은 **커버리지 판정 근거로만** 읽고 결함 대상에서 제외
- 방식: 전 파일 정독 → 호출 사슬 추적(액션→도메인→리포지토리, 페이지→클라이언트 컴포넌트) → `react-dom` 소스 실독으로 `<select>` 재조정 동작 확인
- 게이트: `pnpm typecheck` 통과 · `pnpm lint`(eslint + stylelint) 통과 (실행 확인)
- 제외: `03-OPEN-ITEMS.md`가 Phase 4/7로 이월한 항목(A-H2 폼 폭·A-H3 네이티브 검증·A-M3 `<caption>`·A-M4 오류 문구 형식·A-M6 편집용 표 머리글·A-M7 접근 가능한 이름)은 새 결함으로 세지 않았다
- 결과: **9건** (Critical 0 · High 1 · Medium 3 · Low 5)

---

## H-1 (High) 종류를 바꾸면 `<select>`가 DOM 노드를 재사용해, 고르지 않은 팀/소지자가 자동 선택된 채 제출된다

- 파일: `app/(app)/admin/corp-cards/card-form.tsx:164-193` (`CardOwnerForm`의 소지자/팀 분기)
- 내용: 두 분기가 **같은 위치의 같은 타입**(`<div className={styles.selectLabel}> > <label> + <select>`)이라 React는 새 노드를 만들지 않고 기존 `<select>` DOM 노드를 그대로 쓰고 `id`·`name`·`<option>` 자식만 갈아끼운다. 그리고 React는 업데이트 경로에서 `defaultValue`를 **다시 적용하지 않는다** — `node_modules/react-dom/cjs/react-dom-client.development.js:22634-22640`에서 `value` prop이 null이고 `multiple`이 안 바뀌면 `updateOptions`를 아예 호출하지 않는다(마운트 경로 `:22313`만 `defaultValue`를 적용한다).
- 실패 시나리오: 개인 카드의 「수정」을 열면 소지자 `<option>` 하나가 선택돼 있다. 종류를 「팀」으로 바꾸면 그 선택된 `<option>`이 DOM에서 사라지고, HTML 표준의 "ask for a reset"(single select · display size 1 · 선택된 option 없음 → **tree order의 첫 번째 비활성화되지 않은 option을 선택**)이 돌아 자리표시자(`<option value="" disabled>팀 선택`)를 건너뛰고 **팀 목록의 첫 팀**이 조용히 선택된다. 결과:
  - 사용자가 팀을 고르지 않아도 `required`가 통과한다 — "팀 선택" 자리표시자는 다시 뜨지 않는다.
  - 「소유자 변경」을 누르면 첫 팀으로 소유가 바뀌고, `updateCorpCardOwner`가 `kind='team'`·`team_id=<첫 팀>`으로 기록한다. 법인카드 소유는 Phase 4 이후 사용 등록·승인 경로가 읽는 값이다.
  - 같은 뿌리의 두 번째 증상: 마운트 시에도 `card.holderUserId`가 `holders` 목록에 없으면(보관된 사람 — 쓰기 권한자의 scope가 `includeArchived=false`인 경우) `updateOptions`가 일치하는 option을 못 찾고 같은 규칙으로 **첫 사람**을 선택한다(`:1980` `null !== multiple && (multiple.selected = !0)`). 현재 소유자가 아닌 사람이 "현재 값"인 것처럼 보이고, 그대로 제출하면 그 사람에게 카드가 넘어간다.
- 새 e2e가 못 잡는 이유: `test/e2e/master-edit.spec.ts:84-85`가 종류를 바꾼 **직후 `팀`을 `{ index: 1 }`로 명시 선택**한다. index 1 = 자리표시자 다음 = 자동 선택되는 바로 그 첫 팀이라, 결함이 있어도 없어도 같은 결과가 나온다.
- 같은 모양이 기존 `CardForm`(등록, `:91-119`)에도 있다 — 이번 커밋이 만든 것이 아니므로 고치지 말고 기록만 한다(CLAUDE.md 「수술적 변경」).
- 권장(한 줄): 분기마다 다른 `key`를 줘서 React가 노드를 재사용하지 못하게 한다.
  ```tsx
  {kind === "personal" ? (
    <div key="holder" className={styles.selectLabel}>…</div>
  ) : (
    <div key="team" className={styles.selectLabel}>…</div>
  )}
  ```
  (또는 `value`/`onChange`로 제어 컴포넌트화한다. 후자면 자리표시자가 계속 선택된 채로 남아 `required`도 제대로 걸린다.)
- 확인 방법: 이 환경엔 Playwright 브라우저가 설치돼 있지 않아 실측하지 못했다. `CI=true`로 `/admin/corp-cards?editId=<개인카드>`를 열고 종류만 「팀」으로 바꾼 뒤 `document.querySelector('#owner-teamId').value`를 읽으면 빈 문자열이 아니라 첫 팀 id가 나오는지로 1분 안에 판정된다.

## M-1 (Medium) 코드표 화면에 `canWrite` 게이트가 없다 — 쓰기 권한 없는 계급에게 편집 가능한 이름 입력칸이 뜬다

- 파일: `app/(app)/admin/code-tables/page.tsx:127-129` (+ 이 화면 전체에 `can(…, "write")` 호출이 0회)
- 내용: `CodeItemLabelInput`이 보관되지 않은 모든 행에 조건 없이 렌더된다. 같은 커밋의 법인카드 화면은 `canWrite && …`로 폼과 「수정」 링크를 둘 다 막는다(`corp-cards/page.tsx:85,169`). 권한표는 DB로 편집 가능하므로 `admin.code-tables` **보기만 허용·쓰기 불허**는 실재 가능한 설정이다(`domain/permissions/matrix.ts`가 메뉴 × 동작 격자를 그대로 노출한다).
- 실패 시나리오: 보기 전용 계급이 이름을 고치고 포커스를 옮기면 → `updateCodeItemLabel`이 `ForbiddenError("코드표 항목 수정 권한이 없습니다.")`로 막는다(데이터는 안전하다). 화면에는 **입력칸에 바뀐 값이 그대로 남고** 오류는 회색 힌트 한 줄로만 뜬다(M-2). 03-UI-SPEC의 "이유 있는 비활성" 대신 "버튼 자체가 없음" 계약 위반이고, 같은 커밋 안에서 두 화면의 규약이 갈린다.
- 기존 결함과의 경계: 이 화면은 `CodeItemForm`·`CodeItemActiveToggle`도 `canWrite` 없이 렌더하고 있었다(선재). 다만 **이번 커밋이 그 구멍에 텍스트 입력이라는 새 표면을 추가**했으므로 새 항목으로 센다.
- 권장: `page.tsx`에 `can(session.viewer, "admin.code-tables", "write")`를 `Promise.all`에 넣고 `canWrite ? <CodeItemLabelInput …/> : item.label`로 가른다(선재 토글까지 함께 막을지는 별도 판단 — 이 커밋 범위 밖).

## M-2 (Medium) onBlur 저장이 실패해도 입력칸은 되돌아가지 않고, 실패가 사용자에게 잘 보이지 않는다

- 파일: `app/(app)/admin/code-tables/code-item-form.tsx:69-88`
- 내용: 저장 결과를 화면에 반영하는 곳이 `result.serverError` 하나뿐이다.
  1. **되돌림 없음** — 실패해도 `value` 상태는 사용자가 친 값 그대로다. 서버는 예전 이름, 화면은 새 이름 — 새로고침 전까지 어긋난 채 남는다.
  2. **네트워크 실패는 완전 침묵** — next-safe-action은 전송 실패를 `result.fetchError`에 담는다. 이 컴포넌트는 그것을 안 본다. 셀 포커스를 옮기고 화면을 떠나면 사용자는 저장됐다고 믿는다(진행 표시도 없다 — `isExecuting`을 안 쓴다).
  3. **오류가 오류처럼 안 보인다** — `styles.taxRuleHint`(`code-tables.module.css:69` — `--fs-sm` · `color: var(--muted)`)를 재사용해서, 실패 문구가 화면의 다른 안내문과 글자 크기·색이 같다. `role="alert"`도 없어 스크린리더에 알려지지 않는다. 같은 파일이 폼 오류에는 `FormAlert`를 쓴다.
  - 이월 항목 A-M4(오류 **문구** 형식이 §8-3 밖)와는 다른 축이다 — 여기 지적은 문구가 아니라 *전달 실패*와 *상태 불일치*다.
- 선례: `app/(app)/admin/people/roles/roles-client.tsx:42-46`가 같은 모양이다. 컨벤션을 따른 것은 맞지만 선례도 같은 결함을 갖고 있다는 뜻이다.
- 권장:
  ```tsx
  const { execute, result, isExecuting } = useAction(updateCodeItemLabelAction, {
    onError: () => setValue(label),   // 서버 상태로 되돌린다
  });
  …
  {result.serverError || result.fetchError ? (
    <p role="alert" className={styles.rowError}>{result.serverError ?? "저장하지 못했습니다 · 다시 시도해 주세요"}</p>
  ) : null}
  ```
  (`.rowError`는 §8-3 오류 색으로 새로 두거나 기존 오류 클래스를 재사용한다 — `.taxRuleHint` 재사용은 이름·의미가 둘 다 어긋난다.)

## M-3 (Medium) 소유자 변경이 성공해도 수정 모드를 나가지 않는다 — 거래처 선례와 갈린다

- 파일: `app/(app)/admin/corp-cards/card-form.tsx:140-141`, `app/(app)/admin/corp-cards/page.tsx:85-99`
- 내용: 주석은 "거래처의 `?editId=` 토글과 같은 결"이라고 선언하는데, 실제 거래처 선례는 성공 시 수정 모드를 닫는다 — `vendor-form.tsx:83-89`의 `useAction(updateVendorAction, { onSuccess: () => router.replace(cancelHref) })`(뒤로가기가 수정 모드로 돌아오지 않도록 `replace`). `CardOwnerForm`에는 `onSuccess`가 없다.
- 실패 시나리오: 저장 후에도 `?editId=`가 URL에 남고 폼이 열린 채다. 성공 표시가 하나도 없어(목록 행이 바뀌는 것이 유일한 신호) 같은 버튼을 다시 누르기 쉽고, 그때마다 `document_update` 행동 로그가 한 줄씩 더 쌓인다(같은 값 재저장을 막는 멱등 검사가 `updateCorpCardOwner`에 없다 — `setCorpCardActive`는 있다).
- 권장: `useAction(updateCorpCardOwnerAction, { onSuccess: () => router.replace(cancelHref) })`로 선례와 맞춘다.

## L-1 공백이 붙은 이름은 blur마다 다시 저장된다 — 행동 로그에 같은 수정이 계속 쌓인다

- 파일: `code-item-form.tsx:78-80` ↔ `domain/code-tables/index.ts:135`
- 내용: 클라이언트는 `value`를 **trim하지 않고** 보내고(`execute({ id, label: value })`), 도메인은 `label.trim()`을 저장한다. 사용자가 `"계좌 이체 "`(꼬리 공백, 붙여넣기에서 흔하다)로 고치면 서버 값은 `"계좌 이체"`가 되고 클라이언트 상태는 `"계좌 이체 "`로 남는다 → 이후 그 칸에 포커스를 줬다 뺄 때마다 `value !== label`이 계속 참이라 같은 저장이 반복 실행되고, `document_update`가 매번 기록된다(OPS-05 감사 대상 로그에 실제 변경 없는 행이 쌓인다).
- 권장: `execute({ id, label: value.trim() })` + 비교도 `value.trim() !== label` 기준으로 맞춘다. (`roles-client.tsx`에 같은 결함 — 이번엔 손대지 않는다.)

## L-2 보관 판정과 UPDATE가 원자적이지 않다 — 같은 파일에 조건부 UPDATE 선례가 있다

- 파일: `repositories/code-tables.ts:57-60`(+ `domain/code-tables/index.ts:138-144`), `repositories/corp-cards.ts:60-74`(+ `domain/corp-cards/index.ts:145-156`)
- 내용: 둘 다 `find → archivedAt 확인 → 무조건 UPDATE` 순서다. 검사와 쓰기 사이에 다른 관리자가 보관하면 보관된 행에 값이 써진다. 같은 파일 `setCodeItemArchived:64-76`은 "멱등·경합 안전을 확보한다"며 조건부 UPDATE를 쓰고 있어, 규약이 파일 안에서 갈린다.
- 영향: 관리자 10~30명 규모 · 동시 편집 확률이 낮아 Low. 다만 고치는 비용도 한 줄이다.
- 권장: `.where(and(eq(codeItems.id, id), isNull(codeItems.archivedAt)))` (법인카드도 동일).

## L-3 `CardOwnerForm`이 `validationErrors`를 그리지 않는다 — 스키마 거절이 침묵으로 끝난다

- 파일: `card-form.tsx:230`(서버 오류만 렌더) ↔ `app/(app)/admin/corp-cards/actions.ts:44-51`(superRefine, `path: ["holderUserId"]`)
- 내용: "소지자 또는 팀 중 정확히 하나를 선택하세요"는 `serverError`가 아니라 `validationErrors`로 온다. 렌더하는 곳이 없어 버튼을 눌러도 화면에 아무 변화가 없다. 지금은 네이티브 `required`가 대부분 막아 주지만, H-1 때문에 `required`가 무력화되는 조합이 있고 A-H3(네이티브 검증 걷어내기, Phase 7 이관)이 실행되면 이 경로가 정면으로 열린다.
- 권장: `CardForm`이 `TextField`에 하듯 `result.validationErrors?.holderUserId?._errors?.[0]`를 선택 상자 아래에 그린다.

## L-4 `?editId=…&new=1`이면 등록 폼과 수정 폼이 동시에 렌더된다

- 파일: `app/(app)/admin/corp-cards/page.tsx:85,101`
- 내용: 두 렌더 조건이 배타적이지 않다. 화면 링크로는 도달하지 않지만(「수정」 링크가 `new`를 떨구고, 「법인카드 등록」은 `showForm`일 때 숨는다) 손으로 만든 URL·북마크·뒤로가기 조합으로 열 수 있다. 그때 "종류"·"소지자"·"팀" 라벨이 각각 둘이 되어 접근 가능한 이름이 충돌하고(`getByLabel` 기반 e2e가 strict mode 위반으로 깨진다), 사용자는 어느 폼이 무엇을 하는지 구분할 수 없다.
- 권장: `showCreateForm && !editingCard`로 배타화한다.

## L-5 없는 항목을 수정해도 성공으로 보인다

- 파일: `app/(app)/admin/code-tables/actions.ts:37-41` ↔ `domain/code-tables/index.ts:138-139`
- 내용: 도메인은 없는 id에 `null`을 돌려주는데 액션은 반환값을 버리고 `revalidatePath`만 한다 — 호출자는 성공과 구분할 수 없다. 화면에서는 id가 서버 렌더에서 오므로 실사용 경로가 아니다(`setCodeItemActive`도 같은 결). 기록만 한다.
- 권장: 굳이 고친다면 액션에서 `null`일 때 `UserFacingError`로 바꿔 던진다.

---

## 특별 확인 요청 4건 — 판정

1. **`value`를 수정 대상에서 뺀 결정이 코드에서 지켜지는가 → 지켜진다.** 액션 스키마는 `{ id, label }`뿐이고(`actions.ts:38`), 도메인 시그니처도 `(viewer, id, label)`이며(`domain/code-tables/index.ts:127`), 리포지토리는 `set({ label, updatedAt })`만 쓴다(`repositories/code-tables.ts:59`). UI에도 `value` 입력칸이 없다(`page.tsx:124`는 `<td>{item.value}</td>` 읽기 전용). `repositories/code-tables.ts`에서 `value`를 쓰는 경로는 `insertCodeItem`·`seedCodeItem` 둘뿐으로 이번 커밋이 건드리지 않았다. `vendors.default_evidence_type`의 고아 위험은 열리지 않았다.
2. **권한·누수 규약 → 따른다.** 두 쓰기 경로 모두 도메인 첫 줄에서 `can(viewer, <메뉴>, "write")`를 부르고, 실패 시 `ForbiddenError`(UserFacingError)다. 두 액션 다 `actions.registry.ts`에 `menu`/`action`/`dtoName`으로 등록됐고, `test/integration/leak-scan.test.ts`는 `ACTION_REGISTRY` 전체 × 시드 계급 5종으로 케이스를 생성하므로 **새 액션 2건이 자동으로 스캔에 들어간다**. 읽기 경로도 `project(… DTO_SPEC)`를 지나 행 객체를 흘리지 않는다. 다만 구조적 한계 하나는 기록해 둔다 — 스캔은 "등록된 액션"만 검사하고 "등록되지 않은 export"는 못 잡는다. 등록 누락 방지는 여전히 사람 눈에 의존한다(이번 커밋은 빠뜨리지 않았다).
3. **보관 차단이 두 겹인가 → 그렇다.** 코드표: 화면이 보관 행에 입력칸 대신 글자를 렌더(`page.tsx:128`) + 도메인 `ArchivedCodeItemError`(`index.ts:140-142`). 법인카드: 목록이 보관 행의 「수정」 링크를 감추고(`page.tsx:167`) + `editingCard` 조회에서 `archivedAt === null`로 한 번 더 거르고(`:75`) + 도메인 `ArchivedCorpCardError`(`index.ts:148-151`). 거래처 `updateVendor` 선례와 같은 모양이고, 통합 테스트 2개(`mast-04-code-item-label.test.ts:126`, `corp-card-owner-edit.test.ts:39,54`)가 도메인 겹을 고정한다. **다만 두 통합 테스트 모두 `SYSTEM_VIEWER`로 돌아 `can()` 거부 경로는 증명하지 않는다** — 보관 차단은 증명됐고 권한 차단은 안 됐다.
4. **`key={editingCard.id}`로 폼 상태가 카드마다 초기화되는가 → 그렇다.** `?editId=A → ?editId=B`로 옮기면 key가 달라 리마운트되고 `kind` 초기값이 새 카드 기준으로 다시 잡힌다. 다만 **key가 막아 주지 못하는 경로가 따로 있다** — 같은 카드 안에서 종류를 토글할 때의 uncontrolled `<select>` 재사용(H-1). 그리고 "팀을 안 고른 채 제출"의 답은 "브라우저가 막아 준다"가 아니라 "첫 팀이 자동 선택돼 그대로 저장된다"이다(H-1 참조, 브라우저 실측 필요).

## 참고 (결함으로 세지 않음)

- 기존 e2e 4개의 `getByLabel("이름")` → `#code-item-form` 스코프 변경은 회피가 아니라 필요한 수선이다: 행 입력의 접근 가능한 이름이 `"<label> 이름"`이라 부분 일치로 폼 입력과 충돌한다. 다만 코드 항목 `label`에는 유니크 제약이 없어 **같은 이름을 가진 항목 둘**이 생기면 행 입력끼리도 이름이 겹친다. 이월 항목 A-M7(접근 가능한 이름)과 같은 묶음으로 다룰 것.
- `.labelInput`(`code-tables.module.css:88-96`)의 토큰은 전부 `docs/design/tokens.css`에 실재한다(`--control-h` `--line-w` `--line-ui` `--bg` `--fs-base`). 새 색·서체·radius 생성 없음. stylelint 통과.
- `pnpm typecheck` · `pnpm lint` 실행 통과(경고는 `eslint-plugin-boundaries`의 선재 deprecation 안내뿐). 통합·e2e는 이 환경에 DB·브라우저가 없어 실행하지 않았다.

---

_Reviewed: 2026-09-21_
_Reviewer: Claude (gsd-code-reviewer, adversarial pass)_
_Depth: deep (cross-file — 액션→도메인→리포지토리 사슬 + react-dom 재조정 동작 실독)_
