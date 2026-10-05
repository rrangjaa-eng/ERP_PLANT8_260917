# notes-C: Phase 6.1 vs Phase 06 겹침·경계 (읽기 전용 조사, 2026-10-04)
출처: 6.1 = origin/claude/phase-06.1-evidence-bulk-discuss-a6nbbs (.planning/phases/06.1-evidence-bulk-intake/), 06 = origin/main (.planning/phases/06-payment-evidence-cards/, 계획만 — main에 05·06 코드 없음, 06 STATE "계획 완료, PR #78 머지 대기" .continue-here.md). 06 계획 어디에도 6.1·evidence_records·approval_no·evidence.intake 언급 0건(grep). 즉 06은 6.1을 모르고, 6.1이 06 이름(가칭)을 전부 가정한다.

## 1. 6.1 플랜 표 (wave | depends_on | 목표 | files_modified 요지 | 06 의존)
- 01 | w1 | [] | 표 셋(evidence_import_batches·evidence_records·evidence_record_links)+corp_card_usages.approval_no, 메뉴키 evidence·evidence.intake, 정보항목 evidence.value·amount, evidenceScopeFor, D-6113 시드, 끌 수 없는 행동 evidence_amount_change. risk migration,permissions(사용자 머지 PR-A) | db/schema/evidence-records.ts, corp-card-usages.ts, index.ts, migrations+_journal+snapshot, domain/permissions/{menus,info-items,scope-for}.ts, domain/seed, action-log/record.ts, 테스트4 | 06-03 tx 규약, 06-05 corp_card_usages 표(승인번호 칸 없음→추가), 05 결재 중 첨부 규칙 UA-6106 확인(⓪)
- 02 | w1 | [] | SheetJS tarball, 바이트·서식 판별, 서식 규칙 4(롯데·신한·비씨·홈택스 세금계산서), 중복 열쇠, 금액. risk money | package.json, domain/money/index.ts, domain/evidence-import/*, 테스트 | 06-02 sumKrw/diffKrw, 06-03 loadTaxRates/TaxRates, 06-05 splitCardTotal (P-05/P-06/NET 확인 표 :165-170)
- 03 | w1 | [] | SP-6101/6102/6105, 상태낱말 6, G-1 첨부영역 엑셀 변형, G-4 PickDialog | docs/design/{DECISIONS,SYSTEM}.md, ui/status-tag/status-map.ts, ui/attachments/Attachments.tsx, ui/pick-dialog/*, dev/components 갤러리+스냅샷 | 06-01 SP-1~6, status-display.ts
- 04 | w2 | 01,02 | 엑셀 1개→액션→한 트랜잭션→증빙 기록(권한·세율·카드 판정·거래처 자동 생성·중복 건너뜀). risk money,db-lock | domain/evidence-import/{index,cards,vendor-autocreate}, repositories/{evidence-import-batches,evidence-records,vendors,corp-cards}, app/(app)/expenses/evidence/actions*, test/integration/leak-scan.test.ts | 06-03 tx 규약, loadTaxRates
- 12 | w2 | 01 | 「증빙 있음」 한 판정(hasEvidence=파일 OR 붙은 기록), 05·06 게이트 5곳 연결, 비용기준 기록 갈래, D-6117. risk money,approvals | domain/evidence-records/has-evidence.ts, repositories/{evidence-presence,evidence-record-links,files,expense-evidence-reviews,pre-settle-check,corp-card-usages,payment-targets}, domain/{expenses,payments,evidence-reviews(+cost-basis),next-turn/phase6-items,evidence/signals,expenses/evidence,payments/action-row} | 06-04 지급 게이트·action-row 면제 자리, 06-06 resolveEvidenceStatus·expense_evidence_reviews, 06-10 waiveEvidence, 06-11 expenseCostBasis·lastEvidenceDeleteNeedsConfirm, 06-15/20 지급 대상, 06-19 점검, 06-23 홈 수집, 06-25 카드 목록 증빙 열, 05-09 listEvidenceVoidSignals (:48)
- 05 | w3 | 03,04 | /expenses/evidence 화면(S1+S2), 서버 행 범위 집행, 공개 저장, 보관/되살림, 설정 evidence.visibility.division_org_unit. risk permissions | domain/settings/keys.ts, domain/seed, evidence-records/*, ui/select, app/(app)/expenses/evidence/*, app/(app)/expenses/page.tsx, leak-scan | 06-02 settings 키 패턴
- 11 | w3 | 02,04 | 현금영수증·계산서(면세) 서식 규칙(견본 2026-10-04 도착). risk money | evidence-import/formats/hometax-*, 테스트 | 없음
- 06 | w4 | 05,12 | 경영관리 1차 붙이기·떼기, documentEvidenceRights(S7 9줄), 결재 중 version 올림, listLinkedEvidence. risk money,approvals,db-lock,permissions | domain/evidence-records/{attach,score,linked}, repositories/{evidence-record-links,evidence-attach-candidates}, domain/{expenses,purchase-requests,corp-card-usages}/index.ts, app/(app)/expenses/[id]/{evidence-records-section,evidence-review-section,page}.tsx, app/(app)/cards/link-picker.tsx | 06-06 증빙 금액 칸·evidence-review-section, 06-11 invalidateEvidenceReview·expenseCostBasis, 06-08/12 구매 요청, 06-12 확정 실행가, S10 link-picker(06-07/09/14), 05-09 bumpInstanceVersion·무효 낱말(:59-80)
- 10 | w4 | 05,11,12 | 지급 대상 [증빙 전체 ▾]에 `파일만 있음` 값 | repositories/payment-targets.ts, domain/payments/targets.ts, app/(app)/expenses/page.tsx | 06-15/06-17/06-20 필터 zod 열거(:105-156)
- 07 | w5 | 06 | S3 증빙 패널 공급가 고침(경영관리만), 결재 중 잠김, 확인 필요 풀기. risk money,approvals,db-lock | evidence-records/amount.ts, repositories/evidence-record-detail.ts, evidence-panel.tsx | 06-06 confirmEvidence 꼴·DA-23 문구, 06-11 invalidateEvidenceReview
- 08 | w5 | 06 | 작성자 2차 고르기(자기 문서·내 미배정 구매 요청), 자기 떼기. risk 4종 | evidence-records/{pool,attach,score,linked}, repositories/evidence-pool.ts, expenses/[id]/page.tsx, cards/purchases/{page,purchase-request-list}.tsx | 06-08/12 구매 요청 행, 06 S4·S11 자리
- 09 | w6 | 06,07,08 | 카드 대사 1·2단계 자동, 파일이 카드·합계를 덮음, 3단계 사람. risk money,db-lock,permissions | domain/evidence-records/reconcile.ts, repositories/corp-card-usages.ts, domain/corp-card-usages/index.ts, app/(app)/cards/{page,card-usage-form,actions}.tsx 등 32개 | 06-05 createCardUsage(viewer,input,pre,tx?)·runCreate·splitCardTotal·cardUsageFormDefaults, 06-12 registered_via, 06-09 cards.proxy·cardUsageRights·대리 등록, 06-25 증빙 열 (P-CU/P-RV/P-CULOCK/P-PROXY/P-FORM/P-SRC :162-176)
- 13 | w7 | 07,09 | G-2 공개 칸 붙여넣기(SP-6104) | DECISIONS/SYSTEM.md, dev/components, publish-paste.ts, evidence-table.tsx | 없음

## 2. 6.1 결정 중 06을 바꾸거나 대체하는 것
(a) D-6106 vs 06 D-602 (06-CONTEXT:36; 06-06 :34-43): 06은 PM이 첨부하며 금액 기재+경영관리 「증빙 확인」(금액 고쳐 확인 가능). 6.1은 파일 값이 증빙 금액, 작성자는 안 적음, 경영관리만 고침(evidence_amount_change 끌 수 없는 기록); D-602는 「작성자가 직접 올리는 파일 증빙」에만 존속(6.1 CONTEXT:46). 모순 아님·범위 분할이지만 06-06의 「증빙 금액 칸」이 두 출처(파일 입력 vs 기록 합)를 갖게 됨 — 6.1-06 :75가 06-06 칸을 「붙은 기록 있으면 입력 아닌 합+등록 증빙 n건」으로 변경.
(b) D-6117 「등록이 곧 확인」 vs 06-06 resolveEvidenceStatus(다섯 값: 증빙 있음+확인 기록 없음→확인 전, :34): 기록만 붙은 문서는 확인됨; 작성자 붙임(attach_mode=author)이 확인 뒤에 있으면 다시 확인 전 — 6.1-12 :50이 resolveEvidenceStatus 입력(fileCount·recordCount·authorLinkAfterConfirm)을 바꿈. 06-04 게이트·06-15/17/20 「확인 전」 필터가 영향.
(c) D-6104/6105 「목록 한 줄=증빙 완료」 vs 06-04 증빙 필수 게이트(D-603, evidenceGateDecision)·06-11 비용기준(증빙 금액=확정, 06-CONTEXT:36)·06-19 점검 D-611(증빙 없는 문서): 모두 파일 수만 셈 → 6.1-12가 hasEvidence/evidencePresenceSql로 일괄 교체 (06-10 waive 「증빙 0」, 06-23 홈 수집, 06-25 카드 열 포함).
(d) 외주 세금계산서: 옛 260907:52(경영관리 공개→기획팀 붙임)를 6.1이 되살림(gap-audit 53). 06 D-602(PM 첨부·금액)와 직접 모순은 아님(D-6106이 분할)이나 UX가 둘로 갈림: PM이 파일 올리는 길(06) vs 공개 증빙 고르는 길(6.1 S5). 06-06 확인 흐름 적용 여부는 D-6117로 정리.
(e) 카드 대사/「파일이 이김」 D-6111: 06 D-607(카드 금액=결제 합계 직접 입력)·06-CONTEXT:130 「카드사 명세 대사 = 백로그」를 6.1이 승격. 06-05/09 카드 사용 수정·삭제(O-11)·잠김 판정과 충돌 가능: 6.1-09가 06 카드 사용 합계·카드를 외부 경로로 덮고 끌 수 없는 기록 남김. 06-25 「붙이거나 떼도 version 불변」과 구별(06-25는 파일 첨부, 6.1은 증빙 기록 붙임).
(f) 거래처 자동 생성·되살림 D-6114: 06에 없음(Phase 3 vendors 위). 06 겹침 없음, 단 06-05 카드 사용의 merchant_vendor_id가 대사로 채워질 수 있음.
(g) 공개 3단계·본인만 붙이기·2차 붙이기(구매 요청은 내가 올린 미배정만): 06-08/12 구매 요청에 「증빙 붙임」 개념 없음 → 6.1-06/08이 06 domain/purchase-requests·구매 요청 목록 행에 3차 `증빙 고르기` 추가(6.1-08 :59). 06-12 「확정 실행가는 경영관리 구매 완료가 정함」과 6.1 :69 같은 뜻, 충돌 없음.
(h) 06 D-609/D-608 카드 사용 결재 없음 vs 6.1-09 대사가 승인번호로 카드 사용을 자동 갱신: 결재 없는 경로라 모순 없음.
(i) 기획 PM·팀장 `evidence` view 시드 D-6113 vs 06 D-601(권한표 기본값 안 바꿈, 06-CONTEXT:35): D-601은 대행 규칙 맥락이라 직접 충돌 아님.
(j) 결재 중 규칙 D-6110: 05-09 몫(05 지시서 /mnt/project-files/05-prep/evidence-in-approval-rule.md). 06-11 증빙 변경 훅(PM 변경이 확인 해제+version+1)과 6.1-06 결재 중 붙이기(bumpInstanceVersion)가 같은 목적 두 갈래 — 6.1은 evidence 붙임에도 같은 훅 정신 적용.

## 3. 파일 겹침 (경로 | 06 플랜 | 6.1 플랜)
db/schema/corp-card-usages.ts | 06-05,12 | 01
db/schema/index.ts | 06-03,05,08 | 01
db/migrations/meta/_journal.json | 06-03,05,06,08,10,12,16,18,24,25 | 01 (번호 충돌 시 6.1이 db:generate 재생성, 6.1-01 execution_gate)
domain/permissions/menus.ts | 06-02 | 01
domain/money/index.ts | 06-02 | 02
docs/design/DECISIONS.md, SYSTEM.md | 06-01 | 03, 13
ui/attachments/Attachments.tsx | 06-11 | 03
test/integration/leak-scan.test.ts | 06-03,05,08,15,18,19,24 | 04,05,06,08
domain/settings/keys.ts | 06-02,04,08,10,11,19 | 05
app/(app)/expenses/page.tsx | 06-15,20 | 05,10
domain/expenses/index.ts | 06-10,13 | 06,12
domain/purchase-requests/index.ts | 06-08,12,14,25 | 06
domain/corp-card-usages/index.ts | 06-05,07,09,12,14,25 | 06,09
app/(app)/expenses/[id]/evidence-review-section.tsx | 06-06,10 | 06
app/(app)/expenses/[id]/page.tsx | 06-03,04,06,20 | 06,08
app/(app)/cards/link-picker.tsx | 06-07,09,14 | 06
app/(app)/cards/purchases/page.tsx | 06-08,12,14 | 08
repositories/corp-card-usages.ts | 06-05,07,09,25 | 09,12
app/(app)/cards/{page,card-usage-form,actions}.tsx | 06-05,07,09,12,14,25 | 09
repositories/payment-targets.ts | 06-15,20 | 10,12
domain/payments/targets.ts | 06-15,17,20 | 10
repositories/files.ts | 06-11,25 | 12
domain/payments/index.ts | 06-03,04,06,13,20 | 12
domain/evidence-reviews/{index,cost-basis}.ts | 06-06,10,11 / 06-11 | 12
repositories/expense-evidence-reviews.ts | 06-06,11 | 12
repositories/pre-settle-check.ts | 06-19 | 12
domain/payments/action-row.ts | 06-03,04,06 | 12
domain/next-turn/phase6-items.ts | 06-23 | 12
domain/expenses/evidence.ts | 06-11,16 | 12
test/unit/domain/{evidence-reviews,evidence-cost-basis}.test.ts | 06-06 / 06-11 | 12
=> 6.1 후행이라 실제는 「06 머지 후 위에 쌓기」: 충돌 아닌 순차 수정. 겹침 최대: 06.1-12(돈 게이트, 06 파일 12개 이상), 06.1-09(카드 폼·액션), 06.1-06.

## 4. 테이블·마이그레이션·권한 키
- 6.1이 만드는 것: evidence_import_batches, evidence_records, evidence_record_links(부분 유니크: 살아 있는 붙임 1건/증빙), corp_card_usages.approval_no + (corp_card_id, approval_no) 인덱스(6.1-01 :40~), 행동 종류 evidence_amount_change, 설정 키 evidence.visibility.division_org_unit(6.1-05), 메뉴 키 evidence·evidence.intake, 정보 항목 evidence.value·evidence.amount. 06에 같은 이름·역할 없음(중복 없음).
- 6.1이 06에서 가정하는 것(06에서 먼저 만들어져야): corp_card_usages(06-05)+registered_via(06-12, 값 self/proxy/purchase), purchase_requests(06-08)+purchase_request_id(06-12), expense_evidence_reviews(06-06), 메뉴키 cards.proxy·expenses.payments·cards.purchases(06-02/09), createCardUsage tx 인자(06-05), loadTaxRates/TaxRates(06-03), splitCardTotal(06-05), evidenceGateInputs·resolveEvidenceStatus(06-06), expenseCostBasis·invalidateEvidenceReview(06-11), 06-20 필터, 05의 files·expenses.evidence_attach/evidence_void·bumpInstanceVersion·voidEvidence(05-09).
- 순서: 05 → 06 → 6.1-01(PR-A 사용자 머지) → 6.1-02/04/11/12(PR-B) → … 6.1-01 :execution_gate "Phase 05·06 main 머지 뒤"; 6.1-09 P-CU: approval_no 칸은 6.1-01이 선행.
- 마이그레이션: 06은 B-2 절차로 Phase 5 표(files 해시·선결제 칸, 06-10) 변경, 06-16이 files.owner_kind CHECK 확장(quote_revision·reserve_entry), 06-25가 corp_card_usage 주인 추가. 6.1은 files를 넓히지 않고 별도 표(RESEARCH Pattern 1). 즉 카드 사용 첨부가 두 갈래로 존재: 파일(06-25, files.owner_kind=corp_card_usage) vs 증빙 기록 붙임(6.1, evidence_record_links 주인 종류 corp_card_usage). hasEvidence가 둘을 OR.
- 06-24 「PR 전 마이그레이션 재생성(R-4)」와 6.1-01 재생성 규칙이 같은 방식. 번호 겹침 가능성 높음(둘 다 CLAUDE.md 규칙: 내 것 지우고 db:generate).
- 권한: domain/permissions/menus.ts·settings/keys.ts를 06-02와 6.1-01/05가 각각 수정 → 텍스트 충돌만(키 이름 겹침 없음). 6.1-01은 05 evidence_attach/void 키를 경영관리 권한표에서 함께 켜야 한다고 명시(C5).

## 5. 실행 순서·06이 남겨 줄 것
- 6.1-CONTEXT:13, ROADMAP(6.1 Depends on: Phase 5, Phase 6), 6.1-01 execution_gate: 05·06 main 머지 뒤 착수, 직후 플랜 13개 plan-checker 재검(E36)+/gsd-validate-phase 06.1, 가칭→실제 이름 대조(UA-6102/6106/6108/6109/6110). 개발은 06.1-01이 페이즈 브랜치에 있으면 됨, 묶음 PR 머지는 PR-A 머지 후.
- 06 쪽이 6.1을 위해 남겨 둘 것(현 06 계획엔 의도한 훅 없음, 6.1이 사후 개조): (1) evidenceGateInputs/resolveEvidenceStatus/expenseCostBasis/waive/증빙 열/지급 대상/홈 수집/점검 — 증빙 유무 판정을 한 함수로 호출하게(현재 파일 수 직접), (2) createCardUsage tx 인자·runCreate·cardUsageRights 잠김 판정 노출, (3) 문서 「증빙」 섹션 S4·카드 폼 S9·구매 요청 S11 트리거 자리와 S10 link-picker, (4) 06-20 [증빙 전체 ▾] zod 열거 확장 가능, (5) registered_via·purchase_request_id 칸 이름, (6) 06 UI-SPEC rev9 SYSTEM 변경(SP-1~7)이 03의 전제.

## 6. 6.1이 06에 기대하나 06 플랜에 없는 것(빈틈)
1. 05에 「증빙 금액 칸」 없음(RESEARCH :117, 06-06 A-608 가정) — 06이 어디 둘지가 6.1 금액 연결 입력. 6.1-12는 06-06 칸 가칭 사용.
2. corp_card_usages 승인번호 칸·카드 번호 끝4자리 대사 키 — 06-05에 없음(6.1-01이 추가). 06-05의 createCardUsage가 tx 인자를 받는지는 계획 확인 필요(받지 않으면 6.1-09 멈춤).
3. 06 증빙 유무 판정 단일 함수 없음(파일 수 직접) → 6.1-12가 06 파일 12개+ 개조해야 함(후행 변경 비용 큼, 06에서 hasEvidence 시그니처를 먼저 두면 줄어듦).
4. 카드 사용 보관 시(06-09 삭제=보관) 붙임 떼기 훅·구매 요청 취소 시 붙임 떼기 훅 없음(6.1-06 :E22).
5. 06-11 invalidateEvidenceReview는 PM 파일 변경 경로 전제 — 6.1 붙임(경영관리/대사) 경로는 훅 대상 아님(6.1-12가 resolveEvidenceStatus로 처리).
6. 06-06 「확인 전→지급 막힘」 O-2 기본값과 「등록이 곧 확인」 D-6117의 사용자 결정 반영은 6.1-12에서만(06 문서엔 없음).
7. 05-09 결재 중 증빙 규칙(D-6110)·`무효 처리` 낱말·conflictMessageOf 문구 — 05 몫, 6.1은 UA-6106/6109/6110로 확인만; 05 미반영이면 6.1 전체 착수 안 함.
8. 06-25 카드 전표 파일 중복 판정(지출결의 증빙과 한 종류)이 증빙 기록(6.1) 중복(dedupe_key)과 별개 — 두 경로 사이 이중 증빙 방지 규칙 없음(둘 다 hasEvidence에 OR로 들어갈 뿐).
