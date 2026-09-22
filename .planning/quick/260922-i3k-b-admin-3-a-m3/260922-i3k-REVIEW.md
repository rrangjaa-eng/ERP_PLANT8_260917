---
phase: quick/260922-i3k-b-admin-3-a-m3
reviewed: 2026-09-22T14:14:05Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - app/(app)/admin/page.tsx
  - app/(app)/admin/admin-index.module.css
  - ui/shell/role-menu.ts
  - ui/shell/MoreSheet.tsx
  - ui/shell/TopBar.tsx
  - ui/history-list/HistoryList.tsx
  - app/(app)/admin/code-tables/page.tsx
  - app/(app)/admin/corp-cards/page.tsx
  - app/(app)/admin/people/page.tsx
  - app/(app)/admin/people/roles/roles-client.tsx
  - app/(app)/admin/people/[id]/person-detail-client.tsx
  - app/(app)/admin/settings/settings-form-client.tsx
  - app/(app)/admin/vendors/page.tsx
  - docs/design/SYSTEM.md
  - docs/design/DECISIONS.md
  - test/unit/ui/role-menu.test.ts
  - test/unit/ui/admin-table-caption.test.ts
  - test/unit/design-system-docs.test.ts
  - test/e2e/admin-nav.spec.ts
  - test/e2e/mobile-admin-nav.spec.ts
findings:
  critical: 0
  warning: 7
  info: 7
  total: 14
status: issues_found
---

# quick/260922-i3k: Code Review Report

**Reviewed:** 2026-09-22T14:14:05Z
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

두 갈래를 봤다: (1) 관리자 진입점을 「관리」 한 줄 + `/admin` 인덱스로 접은 변경, (2) A-M3 표 `<caption>`·`th scope` 보강.

**권한 누출은 없다 — 추적해서 확인했다.** 「무엇이 안전한지」를 가정하지 않고 다음을 실제로 읽어 확인했다.

- `app/(app)/admin/page.tsx:21-24`가 `app/(app)/layout.tsx:24-27`과 **문자 그대로 같은** `MENUS × can(viewer, key, "view")` 루프를 돈다. 두 곳 다 같은 `MENUS` 배열(`domain/permissions/menus.ts`)을 원본으로 쓰므로 계산이 어긋날 통로가 없다.
- `adminIndexGroups`(`ui/shell/role-menu.ts:140-151`)는 `allowedMenus.includes(menu.key)`로만 항목을 고르고, `groupOrder.map(...).filter(items.length > 0)`가 **빈 그룹의 머리글까지 제거**한다. 항목 0개 → `groups.length === 0` → `notFound()`(`page.tsx:29`). D-17·§6-10의 계약대로다.
- `ADMIN_MENUS`의 키 10개를 `MENUS`의 `admin.*` 키 10개와 문자열 단위로 대조했다 — 전부 일치. 한쪽에만 있는 키는 **fail-closed**(항목이 아예 안 나온다)로 떨어진다.
- 직접 URL 우회: `app/(app)/admin/` 아래 **12개 라우트 전부**가 자기 `can(..., "view")` 게이트 + `notFound()`를 갖고 있다(`permissions`·`visibility`는 `ForbiddenError → notFound()`). 즉 `/admin` 인덱스의 링크가 잘못된 화면을 가리켜도 그 화면이 스스로 막는다 — 이중 방어가 실재한다.
- 「관리」 한 줄 자체: `buildAdminMenu`(`role-menu.ts:130-133`)가 `ADMIN_MENUS.some(...)`로 판정하고, `TopBar`·`MoreSheet` 어느 쪽에도 계급 분기·클라이언트 숨김이 없다. 서버가 안 보내면 DOM에도 없다 — CLAUDE.md의 「보낼 수 없는 컨트롤은 안 보낸다」 규칙을 지킨다.
- 전역 `.sr-only`(`app/globals.css:60`)는 `clip: rect(0,0,0,0)` + `1px` + `position: absolute` 방식이다 — `display:none`/`visibility:hidden`이 아니므로 caption 6개가 접근성 트리에 **남는다**. 실제 빌드 산출 CSS(`.next/static/chunks/0hpqro8as_ltr.css`)로도 확인했다.
- `th scope`: 코드표뿐 아니라 이번에 caption을 받은 5개 표(코드표·법인카드·사람·계급·거래처)와 `HistoryList` 모두 머리글 `<th>` 전부에 `scope="col"`이 붙어 있다. 조건부 「동작」 칸(`canWrite || canArchive`)도 포함된다.
- `HistoryList` 호출부 2곳은 서로 다르고 의미 있는 caption을 넘긴다 — `person-detail-client.tsx:56` `"소속 발령 이력"`, `settings-form-client.tsx:201` `` `${label} 이력` ``. `domain/settings/keys.ts`의 18개 라벨은 전부 서로 달라 한 화면 안에서 caption이 겹치지 않는다.

**그래서 남은 것은 Critical이 아니라 시각 계약 위반·테스트 공백·중복 정본이다.** 특히 `/admin` 인덱스 화면은 새로 생긴 화면인데 그 화면의 CSS가 `SYSTEM.md` §6-10이 직접 지정한 토큰과 다르고(WR-02), 그룹 머리글과 항목이 가로로 어긋난다(WR-01). 그리고 「관리」가 이제 **유일한** 관리자 진입점이 되면서, 관리자 화면 키 목록의 누락이 「드롭다운에서 빠짐」이 아니라 「완전히 도달 불가」로 승격됐는데 그것을 잡는 테스트가 없다(WR-04).

## Critical Issues

없다. 위 Summary의 추적 결과가 근거다.

## Warnings

### WR-01: `/admin` 그룹 머리글과 항목 링크가 가로로 어긋난다 (§6-10 도해 위반)

**File:** `app/(app)/admin/admin-index.module.css:7`, `app/(app)/admin/admin-index.module.css:33`

**Issue:** `.groupLabel`은 `padding: var(--s-3) 0 var(--s-1)`(좌우 0)인데 `.link`는 `padding: 0 var(--pad-page)`다. 이 화면은 `ui/shell/Shell.module.css`의 `.main { padding: var(--pad-page) }` **안**에 렌더된다 — 즉 본문 여백이 이미 한 번 들어간 상태다. 결과적으로 항목 텍스트가 그룹 머리글보다 `--pad-page`(PC 20px / 폰 14px)만큼 오른쪽으로 밀린다.

`MoreSheet.module.css`에서는 `.group`도 `.link`도 둘 다 `--pad-page`를 쓰고 시트에는 바깥 여백이 없어 두 줄이 맞았다. 이 파일은 머리글만 0으로 바꾸고 링크는 그대로 복사해 그 균형을 깼다 — 파일 머리 주석이 “`MoreSheet.module.css`의 `.group`·`.list`·`.link` 규칙을 그 토큰 그대로 옮겨 쓴다”라고 적은 것과도 어긋난다.

`SYSTEM.md` §6-10 도해는 머리글과 항목을 같은 열에 그린다:
```
│ 마스터    │ ← 그룹 머리글
│ 사람      │ ← 항목 행
```
게다가 hover 배경(`.link:hover { background: var(--surface) }`)이 시트에서처럼 화면 끝까지 가지 않고 본문 박스 안에만 깔리므로, 20px 들여쓰기가 「의도한 계층」이 아니라 「어긋난 여백」으로 읽힌다. 단위 테스트는 소스 문자열만 보고 E2E는 링크 존재만 보므로 아무도 못 잡는다.

**Fix:**
```css
/* 머리글과 항목을 같은 좌측 기준선에 둔다 — 본문(.main)이 이미 --pad-page를 준다. */
.link {
  padding: 0;
}
```
(세로 리듬을 유지한 채 full-bleed hover를 원한다면 반대로 `.groupLabel`에 `--pad-page`를 주고 두 요소를 `margin-inline: calc(-1 * var(--pad-page))`로 본문 밖으로 빼는 방법도 있다. 어느 쪽이든 **한쪽만** 고치지 말고 둘을 같은 기준선에 맞춰야 한다.)

---

### WR-02: `.groupLabel` 토큰이 방금 신설한 `SYSTEM.md` §6-10 규정과 다르다

**File:** `app/(app)/admin/admin-index.module.css:8-10`

**Issue:** `SYSTEM.md` §6-10이 같은 커밋(c5e6bd3)에서 명시한다: “그룹 머리글은 §7-3 그룹 머리글 행과 같은 결(`--fs-sm --muted` 600)”. §7-3(`SYSTEM.md:706`)도 “그룹 머리글 행: `--fs-sm --muted` 600”이다.

구현은 `MoreSheet.module.css`의 `.group`(시트 전용 톤)을 복사해 다음과 같다:

| 항목 | §6-10/§7-3 요구 | admin-index.module.css |
|---|---|---|
| font-size | `--fs-sm` (12px) | `--fs-xs` (11px) |
| color | `--muted` (#4E5D59) | `--faint` (#5F6E6A) |
| font-weight | 600 | `--fw-medium` (= 600) ✓ |

CSS 주석이 “§7-3 그룹 머리글 행과 같은 결”이라고 **주장**하지만 실제 토큰은 §7-3이 아니라 §7-8 시트의 것이다. 문서와 코드가 같은 작업 안에서 서로 다르게 커밋됐다. `role-menu.test.ts`·`design-system-docs.test.ts`는 §6-10의 **표**만 읽고 스타일 문장은 읽지 않아 잡히지 않는다.

**Fix:** 둘 중 하나로 정본을 하나로 만든다. 코드를 문서에 맞추는 쪽:
```css
.groupLabel {
  margin: 0;
  padding: var(--s-3) 0 var(--s-1);
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  color: var(--muted);
}
```
시트 톤(`--fs-xs`/`--faint`)을 의도한 것이라면 §6-10의 “(`--fs-sm --muted` 600)” 문장을 고치고 `docs/design/DECISIONS.md`에 왜 §7-3이 아닌지 한 줄 남긴다(CLAUDE.md 프론트엔드 규칙: 시스템을 벗어나면 DECISIONS.md에 기록 후 SYSTEM.md 수정, 화면 하나만 예외 금지).

---

### WR-03: `/admin` 인덱스가 `next/link` 대신 생 `<a>`를 써 관리자 화면 진입이 전부 전체 문서 로드가 된다

**File:** `app/(app)/admin/page.tsx:40`

**Issue:** 이 변경으로 관리자 화면 진입은 1단계(드롭다운 → 화면)에서 2단계(드롭다운 「관리」 → `/admin` → 화면)가 됐다. 그런데 두 단계 모두 생 `<a>`다(셸의 `TopBar`/`MoreSheet`는 `<a>`, 인덱스도 `<a>`) — 즉 관리자 화면 하나를 여는 데 **전체 문서 로드가 2번** 일어나고, 그때마다 `(app)/layout.tsx`의 `MENUS × can()` 15회 조회가 다시 돈다.

이 저장소의 페이지 본문 규칙은 다르다: 라우트 이동은 `Link`, 쿼리 토글만 `<a>`다.
- `app/(app)/admin/people/page.tsx:97` — 상세 이동은 `<Link>`
- `app/(app)/admin/vendors/page.tsx:98,155` — 등록·수정 이동은 `<Link>`, `includeHidden` 토글(`:91`)만 `<a>`
- `app/(app)/admin/corp-cards/page.tsx:133,187` — 같은 패턴

`/admin` 인덱스의 10개 링크는 순수한 라우트 이동이다. 셸(`<dialog>` 안)과 달리 클라이언트 라우터를 끊을 이유가 없다.

**Fix:**
```tsx
import Link from "next/link";
// ...
<Link href={item.href} className={styles.link}>
  {item.label}
</Link>
```
(E2E `test/e2e/admin-nav.spec.ts:36`·`test/e2e/mobile-admin-nav.spec.ts:40`는 `getByRole("link")`로 찾으므로 그대로 통과한다.)

---

### WR-04: 관리자 메뉴 키 목록이 서로 검증되지 않는 사본 3개로 존재한다 — 이제 누락 = 완전 도달 불가

**File:** `ui/shell/role-menu.ts:79-120`, `test/unit/ui/role-menu.test.ts:131-142`, `domain/permissions/menus.ts:12-29`

**Issue:** 같은 `admin.*` 키 10개가 세 곳에 하드코딩돼 있다.
1. `domain/permissions/menus.ts`의 `MENUS` (권한 판정 정본)
2. `ui/shell/role-menu.ts`의 `ADMIN_MENUS` (D-26 경계 때문에 domain을 import 못 해 복제)
3. `test/unit/ui/role-menu.test.ts:131`의 `ADMIN_MENU_KEYS` (테스트가 또 복제 — 파일 경로에 `ui/`가 있어 같은 경계에 걸린다고 주석이 밝힌다)

`grep`으로 확인했다 — **셋을 대조하는 테스트가 하나도 없다.** `test/unit/ui/role-menu.test.ts`는 `MENUS`를 주석에서만 언급하고, `MENUS`를 실제 import하는 테스트는 `test/integration/leak-scan.test.ts` 하나인데 메뉴 진입점과 무관하다.

이 변경 전에는 `ADMIN_MENUS` 누락이 「드롭다운에 안 보이지만 URL로는 감」이었다. 이제 `/admin` 인덱스가 **유일한 진입점**이므로(§6-10: “진입점은 …「관리」 한 줄뿐”), `MENUS`에 새 `admin.*` 키를 등록하고 라우트를 만든 뒤 `ADMIN_MENUS`에 추가하는 것을 잊으면 그 화면은 UI에서 **완전히 도달 불가**가 되고 `pnpm test`는 637/637 그대로 녹색이다. DECISIONS.md가 예고한 Phase 7(공휴일·지급일·알림·SMTP 설정)이 정확히 이 시나리오다.

**Fix:** `ui/` 경계 밖(`test/unit/domain/` 또는 `test/unit/permissions/`)에 domain을 import할 수 있는 대조 테스트를 하나 둔다. `role-menu.ts`는 값만 export하므로 domain import 없이 읽을 수 있다.
```ts
// test/unit/admin-menu-registry.test.ts  ← 경로에 "ui/"를 넣지 않는다
import { MENUS } from "@/domain/permissions/menus";
import { adminIndexGroups } from "@/ui/shell/role-menu";

it("MENUS의 admin.* 키 전부가 /admin 인덱스에 항목으로 나타난다", () => {
  const adminKeys = MENUS.map((m) => m.key).filter((k) => k.startsWith("admin."));
  const hrefs = adminIndexGroups({ roleId: "role-sysadmin", allowedMenus: adminKeys })
    .flatMap((g) => g.items)
    .map((i) => i.href);
  expect(new Set(hrefs)).toEqual(new Set(adminKeys.map((k) => `/admin/${k.slice("admin.".length)}`)));
});
```
그리고 `test/unit/ui/role-menu.test.ts`의 `ADMIN_MENU_KEYS`는 이 새 테스트가 정본을 지키므로 고정 픽스처로 남겨도 된다.

---

### WR-05: `/admin` 페이지 자체(권한 루프 + `notFound()`)에 테스트가 0건이다 — 모든 E2E가 전권 sysadmin이다

**File:** `app/(app)/admin/page.tsx:21-29`, `test/e2e/admin-nav.spec.ts:14`, `test/e2e/mobile-admin-nav.spec.ts:11`

**Issue:** 이 변경의 핵심 보안 계약은 §6-10의 두 줄이다 — “서버가 거른다”, “볼 수 있는 항목이 0개인 계급에게는 이 화면이 404이고 「관리」 줄도 없다”. 그런데:

- `test/unit/ui/role-menu.test.ts`는 순수 함수 `adminIndexGroups`만 검증한다. `page.tsx`의 `MENUS × can()` 루프와 `if (groups.length === 0) notFound()`는 **한 줄도** 실행되지 않는다(`role-menu.test.ts:151-157`은 파일 존재 여부만 `existsSync`로 본다).
- E2E 3개는 전부 `loginAsSysadmin`이다 — seed가 `MENUS × PERMISSION_ACTIONS` 전부를 주는 계급이라 필터가 **한 번도 작동하지 않는 경로**만 검증한다.
- 따라서 “권한 없는 계급이 `/admin`을 직접 쳤을 때 404”, “일부 권한만 있는 계급이 자기 그룹만 본다”, “`admin.*`가 0개면 「관리」 줄이 없다”를 실제 화면에서 증명하는 테스트가 없다. `page.tsx`에서 `notFound()` 줄을 지워도 전 스위트가 녹색이다.

**Fix:** `test/e2e/admin-nav.spec.ts`에 제한 계급 케이스를 더한다.
```ts
test("관리자 메뉴가 0개인 계급은 /admin이 404이고 사용자 메뉴에 「관리」가 없다", async ({ page }) => {
  const pm = await createFixtureUser({ roleId: PM_ROLE_ID }); // admin.* view 없음
  await login(page, pm);
  await page.getByRole("button", { name: pm.name }).click();
  await expect(page.getByRole("menu").getByRole("menuitem", { name: "관리" })).toHaveCount(0);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "관리", exact: true })).toHaveCount(0);
});
```
한 그룹 권한만 가진 계급으로 “머리글 1개 + 그 그룹 항목만 보인다”도 함께 덮으면 WR-04의 회귀도 일부 잡힌다.

---

### WR-06: 코드표 caption이 화면이 보이는 두 표를 구분하지 못한다

**File:** `app/(app)/admin/code-tables/page.tsx:119`

**Issue:** 이 화면은 `tableKey`에 따라 **서로 다른 표 두 개**(프로젝트 상태 / 증빙 종류)를 렌더한다(`:21-26`, `:56`). 화면 제목 아래 부제(`currentLabel`, `:71`)로만 구분되는데, caption은 `tableKey`와 무관하게 항상 `"코드표"`다. A-M3의 목적이 “표에 구조상 이름을 붙인다”(§10)인데, 표를 바꿔도 접근 가능한 이름이 똑같으면 스크린 리더 사용자에게는 이름이 구분 정보를 주지 못한다 — caption이 이미 있는 `<h1>`을 한 번 더 읽는 것에 그친다.

`test/unit/ui/admin-table-caption.test.ts:48`이 `toContain("코드표")`라서 부제를 덧붙여도 통과한다.

**Fix:**
```tsx
<caption className="sr-only">{`코드표 · ${currentLabel}`}</caption>
```

---

### WR-07: §6-10 표 연동 테스트가 라벨↔href 짝을 검증하지 않아, 두 링크가 바뀌어도 전부 통과한다

**File:** `test/unit/ui/role-menu.test.ts:198-241`

**Issue:** focus area 6(“빈 표가 조용히 통과하지 않는가”)은 **통과한다** — `expectedAdminIndexGroups`는 `rows.length === 0`이면 throw하고(`:77-79`), 셀이 비면 throw하며(`:82-84`), 그룹 수·항목 총합도 단언한다(`:192-196`). 거기까지는 견고하다.

그런데 검증이 세 축으로 **따로** 돈다:
1. 라벨 집합·순서 ↔ SYSTEM.md 표 (`:201-204`)
2. href 형태 정규식 `^\/admin\/[a-z-]+$` (`:237`)
3. href에서 역산한 키 집합 ↔ `ADMIN_MENU_KEYS` (`:239-240`)

세 축 어디에도 “이 라벨의 href는 이것”이라는 단언이 없다. 같은 그룹 안 두 항목의 `href`만 맞바꾸면(예: `사람 → /admin/vendors`, `거래처 → /admin/people`) 라벨 순서도, href 정규식도, 키 집합도 전부 그대로라 **7개 테스트가 전부 통과한다**. 실제 영향은 대상 화면이 각자 `can()`으로 막으므로 권한 누출이 아니라 「잘못된 화면으로 가거나 404」지만, 테스트가 §6-10 표를 정본으로 삼았다는 주장에는 못 미친다.

**Fix:** `:233`의 테스트에 짝 단언을 추가한다.
```ts
const KEY_BY_LABEL: Record<string, string> = {
  사람: "admin.people", 거래처: "admin.vendors", "법인카드 마스터": "admin.corp-cards",
  코드표: "admin.code-tables", 권한표: "admin.permissions", "정보 노출표": "admin.visibility",
  "시스템 설정": "admin.settings", "시스템 상태": "admin.system-status",
  "행동 로그": "admin.action-log", 보관함: "admin.archive",
};
for (const item of allItems) {
  expect(item.href).toBe(`/admin/${KEY_BY_LABEL[item.label]?.slice("admin.".length)}`);
}
```

## Info

### IN-01: `/admin`만 `export const dynamic = "force-dynamic"`이 없다

**File:** `app/(app)/admin/page.tsx`
**Issue:** `app/(app)/admin/` 아래 나머지 12개 `page.tsx`는 전부 `export const dynamic = "force-dynamic"`을 선언한다. `/admin`만 없다. 실제 영향은 없다 — `getSession()`이 `headers()`를 읽어 강제로 동적이 되고, `.next/prerender-manifest.json`을 확인해 보니 정적 프리렌더된 라우트는 `/_not-found`·`/favicon.ico`·`/_global-error`뿐이다. 다만 `next.config.ts`에 `cacheComponents`/PPR이 켜지는 날 이 한 줄의 부재가 형제 파일과 다르게 동작한다.
**Fix:** 형제 파일과 같은 주석(`// D-18과 같은 결: 캐시·별도 저장 없음.`)과 함께 한 줄 추가.

### IN-02: `adminIndexGroups`가 `roleId`를 읽지 않고, 호출부의 `?? ""`는 도달 불가다

**File:** `ui/shell/role-menu.ts:140`, `app/(app)/admin/page.tsx:26`
**Issue:** `adminIndexGroups(viewer: RoleMenuViewer)`는 `viewer.allowedMenus`만 쓰고 `roleId`는 한 번도 읽지 않는다. 호출부는 `roleId: session.viewer.roleId ?? ""`를 만들어 넘기는데, `lib/viewer.ts:33-36`의 `getSession()`은 `roleId`가 없으면 아예 `null`을 돌려주므로(D-36 fail-closed) `?? ""`는 절대 실행되지 않는다 — `layout.tsx:29`에서 복사된 죽은 기본값이다.
**Fix:** `adminIndexGroups(allowedMenus: readonly string[])`로 좁히거나, 최소한 `?? ""`를 빼고 `session.viewer.roleId`를 그대로 넘긴다.

### IN-03: `.link`에 `<a>`에 무의미한 버튼 리셋이 남아 있다

**File:** `app/(app)/admin/admin-index.module.css:34-35,40`
**Issue:** `border: 0; background: none; cursor: pointer;`는 `MoreSheet.module.css`의 `.link`가 `<a>`와 `<button>`(로그아웃)을 동시에 받기 때문에 필요한 선언이다. `/admin` 인덱스의 `.link`는 `<a>`에만 붙으므로 셋 다 죽은 선언이다.
**Fix:** 세 줄 제거.

### IN-04: caption 5개가 같은 화면의 `<h1>`을 그대로 반복한다

**File:** `app/(app)/admin/people/page.tsx:71`, `vendors/page.tsx:111`, `corp-cards/page.tsx:146`, `people/roles/roles-client.tsx:127`, `code-tables/page.tsx:119`
**Issue:** `<h1>사람</h1>` + `<caption>사람</caption>`처럼 제목과 caption 문자열이 동일하다. §10의 기술적 요구(“읽기용은 `<table>` + `<caption>`”)는 충족하지만, 화면에 표가 하나뿐일 때 스크린 리더 사용자는 같은 단어를 연달아 두 번 듣는다. 실질적 이득이 있는 곳은 표가 여럿인 화면(코드표=WR-06, `HistoryList` 호출부 2곳)인데 거기가 오히려 덜 구체적이다.
**Fix:** 필수는 아니다. 고친다면 표가 담는 내용으로 구체화한다(예: `"등록된 사람 목록"`, `"등록된 거래처 목록"`). `admin-table-caption.test.ts`의 `toContain` 단언이라 통과한다.

### IN-05: DECISIONS.md의 「범위」가 실제 변경 파일 2개를 빠뜨렸다

**File:** `docs/design/DECISIONS.md` (2026-09-22 항목, “**범위**” 줄)
**Issue:** “문서(`SYSTEM.md`) + `ui/shell/role-menu.ts`·`ui/shell/MoreSheet.tsx`·`app/(app)/admin/page.tsx`”라고 적었지만 `ui/shell/TopBar.tsx`(주석만 변경)와 신설 파일 `app/(app)/admin/admin-index.module.css`도 이 결정의 산물이다. 신설 CSS 파일이 범위에 없는 것이 WR-02(문서-코드 토큰 불일치)가 리뷰 전까지 눈에 안 띈 한 가지 이유다.
**Fix:** 범위 줄에 두 파일 추가.

### IN-06: `role-menu.test.ts`의 §6-0 전제 단언이 이제 우연히 통과한다

**File:** `test/unit/ui/role-menu.test.ts:317`
**Issue:** `expect(SHELL_SECTION).toContain("시스템 상태")`는 §6-0이 「시스템 상태」를 관리자 진입점으로 규정하던 시절의 단언이다. 개정 후 그 문자열은 “개별 관리자 화면(시스템 상태 · 코드표 · 권한표 …)의 이름은 이 메뉴에 나오지 않고”라는 **괄호 속 예시**로만 남았다 — 단언의 이름(“이 계약들의 근거 문장을 담고 있다”)과 실제로 지키는 것이 어긋난다. 예시 목록을 다른 화면 이름으로 바꾸면 이유 없이 깨진다.
**Fix:** 바로 아래 줄의 `toContain("「관리」")`가 새 계약을 지키므로 `"시스템 상태"` 단언은 지우거나 `toContain("/admin")` 같은 실제 계약 문자열로 바꾼다.

### IN-07: 그룹 순서의 정본이 둘이다 (`groupOrder` 배열 + `ADMIN_MENUS` 배열 순서)

**File:** `ui/shell/role-menu.ts:141-142`
**Issue:** `ADMIN_MENUS`의 주석은 “배열 순서와 group은 SYSTEM.md §6-10 표와 원소 단위로 같아야 한다”고 적지만, 실제 그룹 **순서**를 정하는 것은 그 배열이 아니라 바로 아래에서 새로 만드는 `const groupOrder = [MASTER, SETTINGS_PERMISSIONS, OPERATIONS]`다. `ADMIN_MENUS`를 그룹이 섞이도록 재정렬해도 결과 그룹 순서는 바뀌지 않는다(항목 순서만 바뀐다). 순서 정본이 두 군데라 주석이 말하는 불변식이 실제 코드와 다르다.
**Fix:** `groupOrder`를 함수 안에서 매번 만들지 말고 모듈 상수로 올리고, 주석을 “그룹 **순서**는 `ADMIN_GROUP_ORDER`, 그룹 **안 항목 순서**는 `ADMIN_MENUS` 배열 순서”로 정확히 고친다.

---

_Reviewed: 2026-09-22T14:14:05Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
