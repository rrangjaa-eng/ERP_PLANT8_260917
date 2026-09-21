# 03-REVIEW.md — Phase 3 코드 리뷰

- 대상: `claude/gsd-execute-phase-3-uofrn0` 전체(main 대비, `git diff main...HEAD`)
- 범위: 513 파일 / +49,435 −572 중 소스(`domain/` `repositories/` `lib/` `app/` `ui/` `db/` `scripts/` 설정). `.planning/`·`public/fonts`·스크린샷·lock 파일 제외
- 방식: minimal prompt → single careful diff pass → ≤15 findings (정확성 결함 위주, 스타일 지적 없음)
- 결과: **10건** (Critical 1 · High 1 · Medium 5 · Low 3)

---

## C-1 (Critical) 배포 파이프라인에 시드 단계가 없다 — 스테이징·프로덕션이 전면 잠금된다

- 파일: `scripts/deploy.sh:646` (`run_migrate` 뒤), `domain/seed/index.ts`, `scripts/build-cli.mjs:7`
- 내용: `permission_matrix`·`visibility_matrix`를 채우는 유일한 경로는 `seedMasterData()`이고, 이것을 부르는 곳은 `scripts/seed-master.ts`(로컬 `pnpm db:seed`)·`test/integration/setup.ts`·`test/e2e/global-setup.ts` **셋뿐**이다. `scripts/build-cli.mjs`의 `entryPoints`는 `migrate-runner`·`account-cli`·`db-bootstrap` 셋이고, `deploy.sh`가 만드는 Cloud Run Job도 그 셋뿐이다. 마이그레이션 `0003`은 계급 5행과 `users.role_id` 백필만 하고 권한표·노출표는 비워 둔다.
- 실패 시나리오: 이 브랜치를 staging/prod에 배포하면 `permission_matrix`가 비어 `can()`이 모든 계급·모든 메뉴에서 false를 반환한다 →
  - `/admin/**` 전부 `notFound()`, `getSystemStatus()`는 `NotAdminError`
  - `app/(app)/layout.tsx`의 `allowedMenus`가 빈 배열 → 셸에서 시스템 상태 진입점이 사라짐
  - `visible()`도 전부 false → 모든 DTO 투영이 빈 객체
  - **복구 경로도 막힌다**: `createAccount`/`resetPassword`/`unlockAccount`가 이제 `can(viewer, "admin.people", "write")`를 요구하므로(`domain/auth/accounts.ts:26,74,100`), `account` Cloud Run Job(`account.yml`)이 "계정 생성 권한이 없습니다"로 실패한다. 화면에서도, CLI에서도 고칠 수 없고 DB 직접 조작만 남는다.
- `docs/OPERATIONS.md`는 `pnpm db:seed`를 **로컬 개발 순서**에만 적어 두었고(§3), 배포·운영 절에는 언급이 없다.
- 권장: `seed-master.ts`를 CLI 번들 엔트리에 추가하고 `plant8-{env}-seed` Job을 만들어 `run_migrate` 직후 실행(시드는 멱등하다). 최소한 `docs/OPERATIONS.md`에 "배포 후 반드시 1회 실행"으로 못박고 `/ship` 전 수동 절차에 넣어야 한다.

## H-1 (High) `updateCorpCardOwner`가 `kind` 컬럼을 갱신하지 않는다

- 파일: `domain/corp-cards/index.ts:128`
- 내용: `cardOwnerKind(owner)`를 검증 목적으로만 호출하고 반환값을 버린다. `repositories/corp-cards.ts:updateCorpCardOwner`는 `holderUserId`·`teamId`·`updatedAt`만 `set`한다.
- 실패 시나리오: `kind='personal'`인 카드의 소유자를 팀으로 바꾸면 `holder_user_id=NULL, team_id=<팀>`이 되지만 `kind`는 `'personal'`로 남는다. `app/(app)/admin/corp-cards/page.tsx`가 `card.kind === "personal" ? holderNameById.get(card.holderUserId ?? "") : teamNameById.get(...)`로 그리므로 그 행은 **종류 "개인" · 소유 "—"** 로 표시된다. Phase 4의 법인카드 사용 등록이 `kind`로 개인/팀을 가르면 같은 오분류가 전파된다.
- 권장: `const kind = cardOwnerKind(owner);`를 리포지토리 `set`에 함께 넘긴다(생성 경로와 대칭).

## M-1 (Medium) `PermissionGrid`의 셀 상태가 마운트 시 1회만 만들어진다 — 오류 후 재시도하면 격자가 전부 꺼진 채 그려진다

- 파일: `ui/permission-grid/PermissionGrid.tsx:112`
- 내용: `useState(() => buildInitialCells(rows, columns, values))`는 lazy initializer라 **첫 마운트에서만** 실행된다. `rows`/`values`가 뒤에 바뀌어도 `cells`는 재동기화되지 않는다.
- 실패 시나리오: `readPermissionGrid()`가 DB 일시 장애로 던지면 `page.tsx`가 `errorMessage`를 세우고 `rows=[] columns=[] values={}`로 렌더한다 → `cells = {}`. 사용자가 "다시 시도"(`router.refresh()`)를 누르면 RSC만 다시 그려지고 클라이언트 컴포넌트는 **리마운트되지 않으므로** `cells`가 `{}`인 채 격자가 나타난다. 모든 셀이 `cells[key] ?? {checked:false}`로 떨어져 실제 권한표와 무관하게 전부 체크 해제로 보이고, 관리자가 "권한이 다 날아갔다"고 판단해 다시 켜기 시작하면 잘못된 쓰기가 발생한다.
- 권장: `PermissionGridClient`에서 `key`를 주어 강제 리마운트하거나, `values`·`rows` 변화에 맞춰 `cells`를 재구성한다.

## M-2 (Medium) `archivePerson`이 원자적이지 않고, 세션은 `archivedAt`을 보지 않는다

- 파일: `domain/people/index.ts:247`
- 내용: `archive()`는 `admin.archive:write`를, `revokeAllSessions()`는 `admin.people:write`(또는 본인)를 요구한다. 두 권한은 서로 독립이다. `lib/viewer.ts:getSession()`은 `roleId`만 확인하고 `archivedAt`을 보지 않으며, 보관된 사용자 차단은 **로그인 훅**(`domain/auth/hooks.ts`)에만 있다.
- 실패 시나리오: `admin.archive:write`만 가진 계급이 사람 목록에서 「삭제」를 누르면(화면은 `canArchive`만 보고 버튼을 렌더한다 — `app/(app)/admin/people/page.tsx:71`) 보관은 성공하고 `revokeAllSessions`가 `ForbiddenError`로 던진다. 화면에는 "삭제하지 못했습니다"가 뜨지만 행은 이미 보관됐고, **그 사용자의 기존 세션 쿠키는 만료일까지 그대로 동작한다**. 인프라 오류로 두 번째 단계만 실패해도 같다.
- 권장: `getSession()`에서 `archivedAt`을 확인해 fail-closed로 만들거나(정본 게이트), 최소한 두 단계의 권한을 하나로 맞추고 부분 실패를 명시적으로 알린다.

## M-3 (Medium) `HistoryList`의 추가 폼이 하드코딩된 DOM id를 쓴다 — 설정 화면에서 중복된다

- 파일: `ui/history-list/HistoryList.tsx:89`, `:180`
- 내용: `id="history-list-add-value"`, `id="history-list-effective-from"`가 상수다. `app/(app)/admin/settings/page.tsx`는 이력형 키마다 `HistorizedFieldEditor` → `HistoryList`를 하나씩 렌더한다(현재 `SETTING_DEFS`의 이력형 키 6개).
- 실패 시나리오: 부가세율의 「새 이력 추가」를 연 채 기타소득 원천징수율의 「새 이력 추가」를 열면 같은 id를 가진 input이 둘이 된다. `<label htmlFor>`는 문서의 첫 일치 요소를 잡으므로 두 번째 폼의 "적용 시작일" 라벨을 클릭하면 **첫 번째 폼의 입력**에 포커스가 간다(axe의 duplicate-id 위반이기도 하다).
- 권장: `fieldKey`에 해당하는 prefix를 `HistoryList`에 받아 id를 유일하게 만든다.

## M-4 (Medium) `HistoryList.handleCancel`이 예외를 잡지 않는다 — 이력 취소 실패가 조용히 사라진다

- 파일: `ui/history-list/HistoryList.tsx:142`
- 내용: `handleSubmit`은 `try/catch`로 `submitError`를 세우지만 `handleCancel`은 `try/finally`뿐이다. 호출부(`settings-form-client.tsx`의 `onCancel`, `person-detail-client.tsx`의 `onCancel`)는 `serverError`가 있으면 `throw new Error(...)`를 한다.
- 실패 시나리오: 이미 적용된 이력 행을 취소하려다 `FutureCancelOnlyError`가 나거나 권한이 없으면, 버튼의 `void handleCancel(...)` 때문에 rejection이 삼켜진다(브라우저 콘솔의 unhandled rejection만 남는다). 사용자에게는 **아무 문구도 뜨지 않고** 행도 그대로라 "버튼이 안 먹는다"로만 보인다.
- 권장: `handleSubmit`과 같은 모양으로 `catch`에서 오류 문구를 세운다.

## M-5 (Medium) `updateVendor`가 빈 문자열 계좌번호를 "지우기"로 해석한다

- 파일: `domain/vendors/index.ts:256`, `app/(app)/admin/vendors/actions.ts` (`updateVendorAction`)
- 내용: 액션 스키마가 `accountNumber: z.string().optional()`이라 `""`가 통과하고, 도메인은 `if (input.accountNumber !== undefined)`로 분기한 뒤 `accountNumber ? encrypt(...) : null`로 두 컬럼을 **null로 덮어쓴다**. 같은 함수가 `customFields`도 무조건 통째로 교체한다.
- 실패 시나리오: 거래처 수정 폼이 계좌번호 칸을 비워 둔 채(= 안 바꿈의 자연스러운 표현) 제출하면 저장된 암호문과 뒤 4자리가 영구 삭제된다. 현재 화면에 수정 폼이 없어 실사용 경로는 없지만, `updateVendorAction`은 이미 등록·노출된 서버 액션이고 Phase 4가 수정 화면을 붙이는 순간 바로 터진다.
- 권장: "비움"과 "안 바꿈"을 구분하는 표현(`accountNumber: z.string().nullable().optional()` + `null`만 지우기)으로 계약을 좁힌다.

## L-1 (Low) 행동 로그 화면: 메뉴 보기 권한과 정보 항목 노출이 어긋나면 500이 난다

- 파일: `app/(app)/admin/action-log/page.tsx:59`
- 내용: 페이지는 `can(viewer,"admin.action-log","view")`로 게이트하지만, `queryActionLog()`는 `visible(viewer,"action_log.detail")`가 거짓이면 `ForbiddenError`를 던진다. 두 게이트는 서로 독립이다(D-35).
- 실패 시나리오: 관리자가 어떤 계급에 행동 로그 메뉴 보기만 켜고 노출표의 「행동 로그 상세」는 끈 상태(= 시드 기본값, `staffDefault: false`)로 두면, 그 계급은 메뉴에 들어가는 순간 `app/(app)/error.tsx`("문제가 생겼습니다")를 본다. 404나 안내가 아니라 오류 화면이라 원인을 알 수 없다.
- 권장: 페이지에서 `visible()`도 함께 확인해 `notFound()` 또는 빈 상태로 떨어뜨린다.

## L-2 (Low) `archiveRoleAction`만 `/admin/archive`를 revalidate하지 않는다

- 파일: `app/(app)/admin/people/actions.ts:79-84`
- 내용: 나머지 다섯 보관 액션(`archiveCodeItemAction`·`archivePersonAction`·`archiveOrgUnitAction`·`archiveTeamAction`·`archiveVendorAction`·`archiveCorpCardAction`)은 전부 `revalidatePath("/admin/archive")`를 함께 부르는데 계급만 빠져 있다.
- 실패 시나리오: 계급을 보관한 뒤 보관함으로 이동하면 방금 보관한 계급이 목록에 없다(캐시된 RSC 페이로드). 새로고침해야 나타나서 "삭제가 안 됐나" 하고 다시 시도하게 된다.

## L-3 (Low) 로그인 오류 문구가 403 전체를 그대로 노출한다

- 파일: `app/(auth)/login/login-error.ts:18`
- 내용: `if (error?.status === 403 && error.message) return error.message;` — 잠금 메시지(한국어)만 통과시키려는 의도지만 판정 기준이 상태 코드 하나다.
- 실패 시나리오: `BETTER_AUTH_URL`이 서빙 origin과 어긋나면 better-auth가 403 + `"Invalid origin"`을 돌려주고(그 상황은 `deploy.sh`의 스모크가 실제로 감시하는 케이스다) 로그인 화면에 영문 내부 메시지가 그대로 찍힌다. §8 카피 규칙 위반이자, 사용자가 할 수 있는 일이 없는 문구다.
- 권장: 상태 코드가 아니라 잠금 여부를 식별하는 코드(`error.code`)나 `LOCKED_MESSAGE` 대조로 좁힌다.

---

## 참고로 확인했으나 결함이 아닌 것

- `scripts/deploy.sh`의 `app-data-key-v1` 48→32바이트 수정: 이미 배포된 환경의 옛 시크릿은 `docs/OPERATIONS.md` §9에 수동 절차가 문서화돼 있고, 48바이트 키로는 `encrypt()`가 실행된 적이 없어 잃을 데이터가 없다 — 의도된 상태.
- `repositories/vendors.ts:35`의 `ilike(..., \`%${q}%\`)`: 드리즐이 바인딩 파라미터로 넘기므로 SQL 주입은 없다. 사용자가 `%`/`_`를 입력하면 와일드카드로 동작하지만 자동완성 후보가 넓어질 뿐이다.
- `domain/*`의 `todayIsoDate()`가 UTC 기준인 점: `teamAtDate`·`findEffectiveValue`·`cancelHistorizedValue`가 **모두** 같은 UTC 기준을 쓰므로 내부 일관성은 있다(KST 00:00–09:00에 하루 밀려 보이는 것은 별도 UX 과제).
- `Toast`의 타이머가 `tone`에만 반응하는 것(WR-05), `useLogout`의 실패 시 pending 해제(WR-06): 둘 다 의도된 수정이고 정확하다.
