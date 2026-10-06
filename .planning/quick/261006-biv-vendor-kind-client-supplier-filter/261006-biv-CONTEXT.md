# 261006-biv 거래처 갈래(클라이언트·협력사) — 결정과 조사

## 왜
사용자 질문(2026-10-06 17:07 KST): 「거래처에서 클라이언트와 협력사 구분은 안되어있는거야?」 → 카드에서 「정식 구분 칸」 선택(17:14).
지금은 vendors 표에 구분이 없고, 프로젝트 클라이언트·견적 줄 협력사·지출결의 거래처·리저브 고객사가 같은 목록 전체를 보여 준다.

## 옛 시스템 규칙 (ERP_PLANT8_260907 docs/06_업무/01_거래처.md)
- 거래처 갈래는 둘: 고객사(매출을 발행하는 곳, 리저브가 붙는다) · 협력사(비용을 지불하는 곳, 지급 기한이 붙는다).
- 한 메뉴 안에서 갈래로 가른다. 한 회사가 둘 다일 수 있다 → 갈래를 여럿 고를 수 있다. 갈래는 필수.
- 지금 앱의 화면 낱말은 「클라이언트」(app/(app)/projects/project-form.tsx:204) → 화면 글자는 「클라이언트」·「협력사」·「둘 다」.

## 결정 (잠김 — 바꾸지 않는다)
1. DB: `vendors.kind text NOT NULL DEFAULT 'both'`, 값 `client | supplier | both` (CHECK). 마이그레이션 0027(필요하면 0028 VALIDATE) — `pnpm db:generate` 번호 그대로, 머리 `SET LOCAL lock_timeout='1s'; SET LOCAL statement_timeout='5s';`, `pnpm lint:sql`(squawk) 통과. 기존 CHECK 패턴 db/schema/quote-lines.ts:49, NOT VALID/VALIDATE 짝 0025·0026.
2. 기존 값 채우기: 기본 'both'. 그다음 같은 마이그레이션(또는 다음)에서 데이터 갱신 —
   - 클라이언트 쪽에서만 쓰인 거래처(projects.client_id 또는 reserve_entries의 client 참조에는 있고, quote_lines.vendor_id·expenses.vendor_id에는 없음) → 'client'
   - 협력사 쪽에서만 쓰인 거래처 → 'supplier'
   - 양쪽 다 쓰였거나 아무 데도 안 쓰인 거래처 → 'both' 유지
   (실제 열 이름은 db/schema에서 확인해 맞출 것)
3. 등록 화면 기본값: 「협력사」(옛 인트라넷 거래처 278곳 중 클라이언트 22곳 — .planning/research/FEATURES.md:23). 수정 화면은 저장된 값.
4. 입력 방식: 셋 중 하나를 고르는 선택 칸(기존 vendor-form.tsx 의 native select 패턴 l.213 따름). 새 색·서체·radius 금지.
5. 목록(app/(app)/admin/vendors/page.tsx): 「구분」 열 추가, URL `kind=client|supplier` 걸러보기(기존 「숨김 포함」 Link 토글 패턴, page.tsx l.23-30·~80). `kind=client`는 client+both, `kind=supplier`는 supplier+both. 값 없음 = 전체.
6. 고르는 곳 거르기:
   - 프로젝트 클라이언트 선택: domain/projects/references.ts:80-130 의 `clients` → client+both 만. 같은 함수의 `vendors`(견적 줄 협력사) → supplier+both 만.
   - 지출결의 거래처 고르기: domain/expenses/pick.ts:53-65 → repositories/vendors.ts:48 listVendorsForPick → supplier+both.
   - 리저브 고객사 선택: domain/reserves/index.ts:~670-685 listReserveReferences → client+both.
   - 지금 저장된 값이 다른 갈래여도 편집 화면에서 사라지면 안 된다(가린 거래처와 같은 방식 — docs/design/checks/2026-10-01-가린-참조-화면.md:32-40 확인 후 같은 규칙).
   - 이름 표시용 조회(findVendorNamesByIds, domain/expenses/pick.ts:166, domain/quotes/lines.ts:64·310)는 거르지 않는다.
7. 서버 저장 검사(다른 갈래 거래처를 고르면 막기)는 이번 범위가 아니다 — 고르는 목록만 거른다.
8. 지급 기한·수금 기한·리저브를 갈래에 따라 숨기는 일은 범위 밖.

## 조사 메모 (파일:줄)
- db/schema/vendors.ts — 열 목록(id, name, normalizedName, businessNo, hidden l.18, defaultEvidenceType, account*, customFields, archived*, timestamps). check·sql import 추가 필요.
- 마지막 마이그레이션 0026_phase6_tables_validate, journal idx 26.
- repositories/vendors.ts: listVendors(l.10, scope·includeHidden), listVendorsForPick(l.48), insertVendor(l.105, 입력 l.93), updateVendor(l.136, l.124).
- domain/vendors/index.ts: VendorDto(~l.28), VENDOR_DTO_SPEC(~l.42, infoItem "vendor.value"), VendorInput(~l.233), createVendor(~l.288), updateVendor(~l.340), recordAction document_create/update.
- app/(app)/admin/vendors/actions.ts: createVendorSchema l.15-24, updateVendorSchema l.26-40 (zod).
- app/(app)/admin/vendors/vendor-form.tsx: EditingVendor l.31, baseFields l.118-124, select l.213.
- app/(app)/admin/vendors/page.tsx: searchParams l.41-49, vendorsHref l.23-30, StaticTable columns ~l.106-114, cells ~l.116-150.
- project-form.tsx clients prop l.67·render l.208; projects/[id]/page.tsx:139·254·281; quote-table.tsx vendors l.944/995·options l.1911-1914·붙여넣기 l.2160.
- reserves-table.tsx references.clients l.628·641·1042·1071.
- 테스트: test/integration/vendors.test.ts, project-form-references-visibility.test.ts, expense-pick.test.ts, reserve-entries.test.ts, quote-lines-hidden-vendor.test.ts; e2e vendors.spec.ts, vendor-edit.spec.ts, mobile-vendors.spec.ts, hidden-references.spec.ts. 단위 test/unit/ui/admin-master-list-first.test.ts·list-screen.test.ts.
- 겹침: PR #171(06-pr-B)은 위 파일을 건드리지 않음(2026-10-06 17:20 확인). 「거래처 계좌번호 보기 실패」 스레드가 admin/vendors 목록 정렬을 고치는 중(아직 원격 브랜치 없음) — page.tsx 변경은 작게.
