# Phase 6 계획 조사 노트 A (읽기 전용 조사, origin/main 55647a0b 기준, 2026-10-04)

경로 약칭: P=`.planning/phases/06-payment-evidence-cards/`. 줄 번호는 해당 파일 기준. 25개 플랜 모두 `type: execute`, `estimate.confidence: low`, 토큰 60k~115k.
Phase 6 폴더는 main에 #122(79c95e6d, 2026-10-01)로 한꺼번에 들어옴(PR #78 plan 브랜치 2adbedf5는 main 조상이 아님, `origin/claude/phase-05-execute-pxok9w` 등에 있음).

## 핵심 관찰 (먼저)
1. 25개 플랜 어디에도 `risk:` 태그가 없다(grep risk = 0). CLAUDE.md §4는 돈·권한·DB 잠금·마이그레이션 플랜에 `risk:` 태그 + Opus 실행자를 요구. 마이그레이션 8개 플랜(03,05,06,08,10,12,16,18,25)과 돈 플랜(03,04,05,12,15,17)이 해당 → 실행 전 태그 부여 필요.
2. 모든 플랜이 Phase 5 산출물을 "가칭"으로 가정(`domain/expenses/*`, `db/schema/files.ts`, `ui/attachments/Attachments.tsx`, `submitExpense`, `updateEvidence` 등). 각 플랜 Task 1 ⓪이 `git ls-files`/grep으로 확인하고 없으면 멈춘다(06-01:73 R-7, `.continue-here.md:12`). 그래서 Phase 5 실제 이름과 대조 필요.
3. ROADMAP Phase 6 요구사항에 MAST-05, OPS-09가 있으나(ROADMAP main 719행 부근) 플랜 `requirements:`·CONTEXT 어디에도 없음(grep 0). CONTEXT:9는 10개만 나열.
4. 05 브랜치 06-CONTEXT가 추가한 "반려·회수 지출결의 종결(취소) 경로"(Phase 5 U2 이관)를 다루는 Phase 6 플랜은 없다(grep 종결/rejected-expense: 06-03 반려·회수 게이트 문구만).
5. 키워드 부재 확인: 거래처 생성, 카드 대사·카드사 명세 가져오기(CONTEXT:130 백로그로 명시 제외), 금액 상한(돈 한도), 실행가 초과 판정 — 전부 0건. D-612는 "연결 금액 합이 실행가와 다른 것은 막지 않는다"(CONTEXT:54). 유일한 한도는 증빙 크기 `evidence.max_size_mb`(10MB, 06-02:30, 06-11:40).
6. 코디네이터 보정: 05 브랜치 ROADMAP은 정산 결재를 "PM 기안 → 대표 승인(D-98)"로 바꿈. 06-19(A-609/UA-610)·UI-SPEC UA-610도 PM 기안으로 이미 맞음.

## 1. 플랜 표
컬럼: id | wave | depends_on | 목표 | files_modified(요약, 테스트 제외, `a:`=`app/(app)/`) | requirements | D-6xx(본문 언급) | 키워드(줄)
risk 태그: 전부 없음. 마이그: `db/migrations/meta/_journal.json`을 만지는 플랜 표시(M). 권한키: `expenses.payments`(EP) `cards.purchases`(CP) `cards.proxy`(CX).

| id | W | depends | 목표 (P/06-NN:objective 줄) | files_modified | req | D | 키워드 줄 |
|---|---|---|---|---|---|---|---|
| 01 | 1 | - | SP-1~7 디자인 기준 DECISIONS→SYSTEM, 상태 낱말 매핑 한 파일, D-607/R-9 ROADMAP·REQUIREMENTS 문구 정렬(:61) | docs/design/{DECISIONS,SYSTEM}.md, a:status-display.ts, .planning/{ROADMAP,REQUIREMENTS}.md | EXP-07,09 | 601-611,613 | 결재 -, 증빙 문서·한도 189 |
| 02 | 1 | - | 공용 조각: 설정 키 넷·메뉴 키 셋·`sumKrw/diffKrw`·구매요청 번호 서식·`resolveLineDoor`(:77) | domain/settings/keys.ts, domain/permissions/menus.ts, domain/money/index.ts, domain/document-numbering/index.ts, domain/quotes/line-door.ts | EVID-02,EXP-09,10,13,16 | 601,605,611 | 권한키 EP/CP/CX 31; 설정키 30; 크기한도 30,37 |
| 03 | 2 | 01,02 | 결재 통과 지출결의 단건 지급 완료 트레이서(:101) | db/schema/expense-payments.ts(+index), M, domain/rules/register.ts, domain/money/tax.ts, domain/payments/{index,action-row}.ts, repositories/expense-payments.ts, a:expenses/[id]/{page,payment-action-row,actions,actions.registry} | EXP-06,09 | 601,604,605 | 결재 엔진 139(A-606),37,192; 마이그 182,199; EP 36,143 |
| 04 | 3 | 03 | 지급 섹션 S5: 이체액·차이사유·예정일·증빙 게이트·지급 취소·동시성(:90) | domain/payments/*, domain/rules/register.ts, domain/settings/keys.ts, repositories/expense-payments.ts, a:expenses/[id]/{page,payment-section,payment-action-row,actions,registry} | EXP-09,EVID-02,EXP-06 | 601,603-606 | 결재 68; EP 281 |
| 05 | 3 | 01,02,03 | 법인카드 사용 첫 경로: 새 표·본인등록·팀비용 연결·합계→공급가 역산·외화·/cards(:91) | db/schema/corp-card-usages.ts(+index), M, domain/corp-card-usages/{index,amounts}.ts, repositories/corp-card-usages.ts, a:cards/{page,card-usage-list,card-usage-form,actions,registry} | EXP-07 | 607-609 | 마이그 160,176; CP/CX 137,179; 거래처 기본 증빙종류 39 |
| 06 | 4 | 04 | 증빙 확인 S4: 확인/면제 표·상태 5값·금액 고쳐 확인·`evidenceGateInputs`(:88) | db/schema/expense-payments.ts(+표 `expense_evidence_reviews`), M, domain/payments/*, domain/evidence-reviews/index.ts, repositories/expense-evidence-reviews.ts, a:expenses/[id]/{evidence-review-section,page,actions,registry} | EVID-02,03 | 601,602 | 마이그 154,164; EP 41,166 |
| 07 | 4 | 05 | 카드 사용→견적 줄·견적 외 비용 연결, 카드쪽 이중연결 차단, 연결 고르기 S10, 상세 S15(:103) | domain/corp-card-usages/{index,link-targets}.ts, domain/quotes/lines.ts, domain/rules/register.ts, repositories/{quote-line-links,corp-card-usages}.ts, a:cards/{card-usage-form,page,link-picker,actions,registry}, a:projects/[id]/{page,card-usage-section} | EXP-07 | 609,612 | 마이그 173,377; A-603/607 136-137 |
| 08 | 5 | 07 | 온라인 구매 요청 신청 경로(문 판정·이중연결·번호·목록)(:83) | db/schema/purchase-requests.ts(+index), M, domain/purchase-requests/index.ts, domain/rules/register.ts, domain/settings/keys.ts, repositories/purchase-requests.ts, a:cards/purchases/{page,purchase-request-form,actions,registry} | EXP-10,07 | 609,611 | 마이그 148,159; CP 40,232; 설정 `purchase.online_vendor_name` 37 |
| 09 | 5 | 07 | 경영관리 대리 등록(EXP-16)·카드 사용 수정·삭제(:93) | domain/corp-card-usages/{index,rights,link-targets}.ts, repositories/corp-card-usages.ts, a:cards/{page,card-usage-list,card-usage-form,link-picker,actions,registry} | EXP-16,07 | 601,608,609 | CP/CX 32-41,163; A-601 128 |
| 10 | 6 | 06,08 | 증빙 면제·선결제(S6)·Phase 5 표 칸 추가 마이그(B-2 절차)(:87) | db/schema/{expenses,files}.ts, M, domain/evidence-reviews/{index,prepaid}.ts, repositories/expense-payments.ts, domain/expenses/index.ts, domain/settings/keys.ts, a:expenses/{expense-form,[id]/evidence-review-section,[id]/actions,registry} | EXP-13,EVID-02 | 601,603,611 | 마이그 43,189,191(NOT VALID+--custom VALIDATE); A-607/608 120-121 |
| 11 | 7 | 10 | 증빙 수명 주기: 변경 시 확인 풀림 훅+version, 비용 기준, 업로드 검사(크기·형식·SHA-256), 마지막 증빙 삭제, 고아 객체 청소(:117) | domain/evidence-reviews/{index,cost-basis,upload-checks}.ts, domain/expenses/evidence.ts, domain/settings/keys.ts, repositories/{expense-evidence-reviews,files}.ts, ui/attachments/Attachments.tsx, a:expenses/expense-form.tsx, docs/OPERATIONS.md | EVID-03,04,02 | 602 | 저장소/GCS 40,41,45(15건); 크기한도 40,46; 결재 모듈 36,94,153; A-608/608-T 154-155 |
| 12 | 7 | 08,09,10 | 구매 완료: 카드 사용 생성+요청 완료 한 트랜잭션 S13, 구매 전용 갈래(:85) | db/schema/corp-card-usages.ts, M, domain/purchase-requests/{index,policy}.ts, domain/corp-card-usages/{index,rights}.ts, a:cards/{page,card-usage-form}, a:cards/purchases/{page,actions,registry} | EXP-10 | 607 | 마이그 147,160; CP 33,35,82 |
| 13 | 7 | 08,10 | 지출결의쪽 이중연결 입구·견적 줄 상태 파생·지급 완료 줄 잠금·3입구 병렬 테스트(:103) | domain/quotes/{line-status,lines,edit-scope}.ts, repositories/quote-line-links.ts, domain/rules/register.ts, domain/expenses/index.ts, domain/payments/index.ts, a:projects/[id]/quote-table.tsx | EXP-06,07 | 606,609 | 분할 지급 공백 143; A-602/607 137-138 |
| 14 | 8 | 12 | 구매 요청 마감: 팀비용 요청·취소·외화·목록·카드목록 하위링크(:97) | domain/purchase-requests/{index,policy}.ts, domain/corp-card-usages/index.ts, repositories/purchase-requests.ts, a:cards/purchases/*, a:cards/{link-picker,card-usage-list,card-usage-form} | EXP-10 | 609 | CP 221,294; `teamAtDate` A-606 134 |
| 15 | 8 | 11 | 일괄 지급 뼈대: 지급 대상 보기 S1·확인 모달 S2·선택 열 SP-1·낡은 행 스냅숏(:90) | domain/payments/{targets,batch}.ts, repositories/payment-targets.ts, ui/table/{Table.tsx,types.ts,Table.module.css}, a:expenses/{page,payment-targets-table,batch-payment-dialog,actions,registry} | EXP-09,06 | 604 | EP 172,291; A-607/UA-605 `/expenses` ListEmpty 125 |
| 16 | 8 | 11,12 | Phase 4 이월 증빙: D-56 차수 승인 증빙·D-60 리저브 증빙(:100) | db/schema/files.ts, M, domain/evidence-attachments/index.ts, domain/expenses/evidence.ts, domain/quotes/revisions.ts, domain/reserves/index.ts, a:projects/{actions,registry,[id]/revision-section}, a:pnl/reserves/{actions,registry,reserves-table} | EVID-03 | (없음, CONTEXT:11 인용) | 마이그 180,190; 저장소 38,185 |
| 17 | 9 | 15 | 일괄 지급 마감: 이체액 편집·서버 합·지급일 재계산 막힘·키보드·50건 페이지·제자리 증빙 확인 모달(:114) | domain/payments/{targets,batch}.ts, ui/table/{Table,use-grid-keyboard}.ts(x), ui/confirm-dialog/*, a:expenses/{payment-targets-table,batch-payment-dialog,actions,registry} | EXP-09 | 601,602,604,605 | EP 323,376; ConfirmDialog 첨부 칸(SP-7) |
| 18 | 9 | 01,02,13,16 | 매출 세금계산서 발행 요청(D-610): 상세 매출 섹션 표 S16(:89) | db/schema/revenue-entries.ts(+`revenue_issue_requests`), M, domain/issue-requests/index.ts, repositories/revenue-issue-requests.ts, domain/{projects/ledger,revenue/index}.ts, a:projects/{actions,[id]/page,[id]/quote-table,[id]/revenue-section,[id]/issue-request-table} | PROJ-06 | 610,613 | 마이그 155,167; `projects.revenue`/`revenue.issued_amount` 35,39; A-604/605/613 122-124 |
| 19 | 10 | 13,18 | 완료 전 미결 점검(D-611~613): 서버 함수 하나·정산 결재 기안 막힘·강행 허용 설정(:90) | repositories/pre-settle-check.ts, domain/pre-settle-check/{index,summary}.ts, domain/rules/register.ts, domain/settings/keys.ts, domain/approvals/settlement.ts, a:projects/[id]/{page,quote-table,pre-settle-check} | PROJ-06 | 611-613 | 결재 13,68,72(8건, 정산 기안 A-609); A-601/604 125-127 |
| 20 | 10 | 17 | 지급 읽기쪽: 계좌 노출(O-17)·지급 완료 보기 S3·목록 상태 열·지급 섹션 계좌 행(:82) | domain/payments/{targets,index}.ts, repositories/payment-targets.ts, a:expenses/{page,paid-list,payment-targets-table,[id]/payment-section,[id]/page,[id]/payment-action-row} | EXP-09 | (없음) | EP 67,195; `vendor.account_number_unmasked` UA-613; A-607 119 |
| 21 | 10 | 18 | 발행 요청 마감: 취소(O-12)·상태 전이·목록 S17·프로젝트 목록 링크(:77) | domain/issue-requests/index.ts, repositories/revenue-issue-requests.ts, a:projects/{actions,page,filter-bar,[id]/issue-request-table,issue-requests/{page,*.module.css}} | PROJ-06 | 610,613 | `projects.revenue` 35,185 |
| 22 | 11 | 19 | 대표 승인 앞 재점검(O-16)·S18 표시 상태(:76) | domain/approvals/index.ts, a:approvals/[id]/page.tsx, a:status-display.ts, a:projects/[id]/{page,quote-table,pre-settle-check,project-detail.module.css} | PROJ-06 | 601,611,613 | 결재 8,62,66(A-606 승인 함수 109) |
| 23 | 11 | 14,19,20,21 | 홈 「내 차례」 S19: 경영관리·PM 몫(:84) | domain/next-turn/{index,phase6-items}.ts, ui/next-turn/{build-next-turn-view.ts,NextTurn.tsx}, a:page.tsx | EXP-09,10,13,PROJ-06 | 601,611 | EP/CP 28-30; A-606 119 |
| 24 | 12 | 16,22,23,25 | 경영관리 전체 E2E(이미지·PDF), 누수 스캔 완전성, 마이그 재생성(R-4), 페이즈 게이트(:54) | test/e2e/management-flow.spec.ts, test/integration/leak-scan.test.ts, db/migrations/meta/_journal.json | 10개 전부 | 601-604,613 | 마이그 26,62,64; A-608-T 86 |
| 25 | 10 | 11,14,16,18 | 카드 사용 전표 첨부(EVID-01 카드 몫): S7·S8·S9·S13 증빙(:114) | db/schema/files.ts, M, domain/evidence-attachments/index.ts, domain/evidence-reviews/upload-checks.ts, domain/corp-card-usages/index.ts, repositories/{corp-card-usages,files}.ts, domain/purchase-requests/index.ts, a:cards/{actions,registry,card-usage-form,card-usage-list}, a:cards/purchases/actions | EVID-01 | 607,608 | 저장소 37,197; CP 41,247; A-608/UA-606 154 |

신규 표 이름: `expense_payments`(03:198) `expense_evidence_reviews`(06:164) `corp_card_usages`(05:175) `purchase_requests`(08:159) `revenue_issue_requests`(18:97). 기존(Phase 5) 표에 칸 추가: 지출결의 `prepaid`·`prepaid_reason`, 파일 `sha256`·주인 종류(10:200, 16, 25), 카드 사용 구매 갈래 칸(12:93, `--custom` VALIDATE 마이그).
설정 키 4개 신규(02:30): `evidence.required`(켬), `evidence.max_size_mb`(10), `evidence.prepaid_due_days`(14), `purchase.online_vendor_name`(빈 값). 메뉴 키 3개 신규(02:31): `expenses.payments`, `cards.purchases`, `cards.proxy`. 문서번호 키 `document_number.purchase_request.*` 4개(02:32).
키워드 정리: 결재 엔진(domain/approvals)은 읽기·게이트 입력만, 결재 문서 종류 추가 없음(D-608); 증빙 저장은 Phase 5 GCS 경로 재사용(06-11:40, COVERAGE.md:3) + 테스트 모드 A-608-T; 거래처 생성·카드 대사·금액 상한·실행가 초과 = 없음.

## 2. 플랜이 "Phase 5(·04.1·Phase 4)가 만든다고 가정한" 것 (원문 표현 + 줄)
공통 표지: 각 플랜 「선행 의존(A-6xx)」 표 + ⓪ 멈춤 조건.
- 06-02:110 A-607 Phase 5 지출결의 번호(`{프로젝트 번호}-{순번}`)의 프로젝트 단위 카운터 경로와 팀 비용 지출결의 번호 규칙 (없으면 멈추고 「번호 공백」 질문, :112)
- 06-03:139 A-606 04.1 `db/schema/approvals.ts`, `domain/approvals/*`, 조회 함수(가칭 `getApprovalView`)
- 06-03:140 A-607 Phase 5 `db/schema/expenses.ts`(가칭)의 상태·승인액·증빙 종류·지급 방식(UA-618)·지급 예정일(UA-617)·`version` 칸, `domain/expenses/`, `app/(app)/expenses/[id]/page.tsx`
- 06-03:141 A-608 Phase 5 증빙 첨부 — 파일 표(가칭 `db/schema/files.ts`)와 증빙 금액(공급가)·증빙일 칸(UA-606)
- 06-04:126 담당 PM 이름을 문서에서 읽는 경로(`grep pm|manager domain/expenses/`)
- 06-06:124 A-608 증빙 금액·증빙일 칸, PM 증빙 편집 domain 함수(가칭 `updateEvidence`), 증빙 행 생성 함수(E2E 준비용)
- 06-07:136 A-603 Phase 4 04-13 견적 줄 종류(`quote`·`out_of_quote`·`adjustment`) 컬럼(`out_of_quote`); :137 A-607 지출결의의 견적 줄 연결 칸(가칭 `expenses.quote_line_id`)과 지급 방식(UA-618)
- 06-09:128 A-601 프로젝트 완료 상태 값(`settled` — main 4값)
- 06-10:120 A-607 제출 함수(가칭 `submitExpense`, 「증빙 없음」 제출 막힘 포함)와 폼(가칭 `app/(app)/expenses/expense-form.tsx`); :121 A-608 파일 표(내용 해시 칸 유무)
- 06-11:151 A-607 PM 증빙 추가·삭제·금액 고침 domain 함수(가칭 `domain/expenses/evidence.ts`); :152 A-607-V 증빙 저장 모양(폼과 한 트랜잭션 vs 즉시 저장)·version 비교 방식; :153 A-606-S 결재 상태를 잠근 문서와 같은 tx로 읽는 조회; :154 A-608 업로드 의도(서명 PUT URL 발급)·완료 통보·파일 표·첨부 컴포넌트(가칭 `ui/attachments/Attachments.tsx`); :155 A-608-T Phase 5 저장소의 테스트 모드(CI=true E2E에서 GCS 없이 업로드, 가칭 저장소 어댑터·환경 변수)
- 06-13:137 A-602 Phase 4 견적 줄 상태(`line_status`)·D-66 읽기 전용 이유(`linkedDocumentReason`); :138 A-607 `submitExpense`·지출결의 상태(결재 중·반려)·견적 줄 연결 칸
- 06-14:134 A-606 `teamAtDate`(`domain/org/index.ts`)
- 06-15:125 A-607·UA-605 Phase 5 지출결의 목록 `/expenses`(상태 필터·그룹 머리글·합계 줄)와 액션 파일 (main은 ListEmpty 자리)
- 06-16:141 A-608·A-608-T Phase 5 업로드 경로·테스트 모드(06-11 ⓪ 결과)
- 06-17:155 A-608 첨부 파일 읽기 경로(파일 행·썸네일·원본 열기)
- 06-18:123 A-605 `revenue.issued_amount` 정보 항목; :124 A-604 `issuedEntries`(`domain/revenue/index.ts`)
- 06-19:125 A-601 프로젝트 상태 값(다섯 vs 네 값)·Phase 5 정산 결재 기안이 받는 상태; :126 A-604 계약 금액(D-84 파생값 또는 `projects.contract_*`); :127 A-609·UA-610 Phase 5 정산 결재 기안 함수(가칭 `domain/approvals/settlement.ts`)와 프로젝트 상세 「정산 결재 올리기」 버튼
- 06-20:119 A-607·UA-605 지출결의 목록의 상태 열 자리
- 06-22:109 A-606 04.1 승인 함수(가칭 `domain/approvals/index.ts`)와 결재 문서 화면(가칭 `app/(app)/approvals/[id]/page.tsx`)
- 06-23:119 A-606 04.1 결재 항목이 「내 차례」에 `[결재]`로 이미 들어오는지; UA-611 「내 차례」 공급 함수
- 06-24:86 A-608-T 재확인; 06-25:154 A-608·UA-606 Phase 5 첨부 컴포넌트가 업로드·삭제 동작을 prop으로 받는지; 06-25 A-608-P 저장 전 첨부(대기 결합) 함수(06-01:73 R-7, `.continue-here.md:12`)
- UI-SPEC UA-605~610(P/06-UI-SPEC.md:58 표): 지출결의 목록·문서 화면, 폼 증빙 칸+증빙 금액 칸, 결재 상태 낱말, 견적 줄 행 행동 `Ctrl+E`, 상태 열, 정산 결재 올리기 버튼; UA-613 `AccountNumberCell`+`maskTail4()`; UA-617 `지급 예정일`; UA-618 `지급 방식`
- 06-CONTEXT:111 「Phase 5의 지출결의 문서·결재 상태·증빙 첨부(files 행)」; :13 「증빙 업로드 경로(브라우저 축소+SHA-256+GCS 서명 URL)는 Phase 5가 만든다」

## 3. 06-CONTEXT.md 결정 (줄)
- :35 D-601 경영관리 부재 대행 규칙 없음, 권한표 기본값 안 바꿈
- :36 D-602 증빙 금액(공급가)은 PM이 첨부 때 적고 경영관리가 지급 전 「증빙 확인」(금액 수정 가능, 로그), 확정 비용 시점은 PM 입력 순간
- :37 D-603 증빙 필수 기본값 켬, 선결제·면제는 예외
- :40 D-604 지급 완료는 여러 건 일괄, 이체액 기본값 = payable, 건별 게이트·부분 처리
- :41 D-605 이체액≠계산값이면 차이 표시+사유 필수, 비용 불변(조정 줄 D-83)
- :42 D-606 지급 취소(사유 필수, 줄 잠금 해제, 로그)
- :45 D-607 카드 사용 금액은 결제 합계 입력, 공급가는 서버 역산(`grossFromTotal`)
- :46 D-608 카드 사용 등록에 결재 없음, 결재 문서 종류는 3종 그대로
- :47 D-609 견적 줄은 지출결의 쪽 또는 카드 쪽 한쪽에만 연결(같은 쪽 다건 허용), 서버가 반대쪽 차단
- :50 D-610 PM 매출 세금계산서 발행 요청(분할 가능), 경영관리가 발행 줄에 연결, 결재 아님
- :53 D-611 「미결 지출결의」 정의(결재 중·반려+증빙 없음, 통과·미지급은 안 막음)
- :54 D-612 「미매칭 견적 줄」 정의(실행가≠0 & 연결 0건, 취소·조정 줄 제외)
- :55 D-613 「매출 미입력」 = 발행 줄 0, 계약금액 차이는 표시만
- :56 점검 시점 = 정산 결재 기안 전, 강행 허용 키 기본 false
- 이월(:134-135) 세금 기본값(`tax.company_borne.method` flat vs gross-up) · 필요경비 0% 기타소득 22% → Phase 5/11 소관, Phase 6 미결정

## 4. 게이트 이력 (P=Phase 폴더, 커밋 해시는 원 브랜치 소멸 — 아래는 보고서/로그에 적힌 값)
| 파일 | 무엇 | 날짜 | 결론·미해결 | 반영 |
|---|---|---|---|---|
| (없음) ceo-review.md | /plan-ceo-review | 2026-09-24T23:52Z(로그) | 보고서는 저장소에 없음(`.continue-here.md:50`), 결정만 남음: 「한 페이즈 유지」(분할 안 함), O-2 「막기」 | `.claude/gates/phase-06.log:1` commit=a7f2f4e(원 기록 유실, 사용자 승인 2026-09-26로 보고서 근거 기록) — **CEO 리뷰 기록 있음(로그만)** |
| eng-review.md | plan-eng-review(Opus 5.5, 무인) | 브랜치 a7f2f4e | 판정: E-1(막음, 06-19·06-22 tx 안 전역 db 풀 교착)·E-2·E-3(고침), 빈칸 2; 「E-1 반영 전 Build 진입 불가」(:80) | log:2 commit=333f7bf(2026-09-24T23:59Z). 이후 5번째 라운드(r5)까지 플랜 ledger에 반영 |
| eng-cross-opus.md | Opus 교차(Codex 대체, 한도 2026-09-29까지) | 〃 | 막음 E-1(06-03 tx 안 세율 읽기)·E-2(번호 부여 PR#75 꼴) / 고침 E-3~E-5 / 참고 R-1~3 | 06-03:340,349 ledger에 반영 표시 |
| design-review.md | /plan-design-review 통합(본 Opus+교차) | 2026-09-25(검토) | 막음 2(DR-1 S21, DR-2 S22) 고침 8 참고 14, 점수 7/10; 사용자 확정 DR-4/DR-3/DR-2 (2026-09-25 11:13 KST) | UI-SPEC rev 9, log:3 session=99102bb1 (2026-09-25T00:37Z) |
| design-apply-cross-r2.md | 디자인 반영 교차 r2(Opus), HEAD 050d71a | ~2026-09-25/26 | 막음 1(X-1 훅이 PM 저장을 version 충돌시킴)·고침 5(X-2~X-6)·참고 3(X-7~9) | final-review-fable.md가 X-1~X-9 전부 반영 확인(:65-76); X-8 REQUIREMENTS EVID-01 줄만 06-01 Task 3으로 이월 |
| final-review-fable.md | Fable 최종 전체 검토(Codex 대체) | 2026-09-26 | FIX_NEEDED, 막음 0·고침 4(F-F1 domain의 db 전달 lint 위반, F-F2 payments 순환 import, F-F3 06-21 취소 vs UI-SPEC 일괄 저장, F-F4 06-10 repositories 누락)·참고 3(F-N1 `/mnt/project-files` 인용, F-N2 잘못된 해시 70a39d4→71eba82, F-N3 REQUIREMENTS EVID-01) | 0f3f653 에 반영(.continue-here:39) |
| final-review-fable-r4.md | Fable r4 재확인 | 2026-09-26 | FIX_NEEDED 막음 0·고침 3(R4-F1 06-15 행에 `prepaid`, R4-F2 `deferRecord` 낡음, R4-F3 줄 번호 낡음)·참고 3 | acca39f(r5) 반영(.continue-here:43): 행동 로그를 같은 tx `recordAction(..., { tx })`로, `edit-scope.ts` 추가 등; be8d015 main #82 병합 |
- 계획 체커 결과: 별도 파일 없음. `.continue-here.md:32`: 「플랜 25개·12 웨이브, 25개 모두 verify.plan-structure valid · 0 오류 · 0 경고」; 각 플랜 끝 Review Dispositions ledger(r1~r5); checker-r1/r2·cross-review-r1/r2·ceo-review 파일은 저장소에 없음(`.continue-here.md:50`, design-apply-cross-r2:6 「r1 보고서 원본은 없어」). 게이트 로그 `.claude/gates/phase-06.log`에 review(2026-09-24T18:00Z, 2026-09-26T10:10Z)+ship(2026-09-26T11:14Z).
- 미해결(참고, 막지 않음; `.continue-here.md:50`): VALIDATION 「세율 읽기 횟수」 `-t` 누락, 06-21 TOCTOU, 06-17·06-20 4태스크(체커 W3), 삭제한 카드 사용 되돌릴 수 없음(`되돌리기` 토스트와 상충 여부 재확인), 06-16 파일 표 ⒝ 모양이면 재분할, R4-N3 `tx?` 선택 인자 tx 안 호출에서 누락 금지, 2026-09-29 이후 **Codex 재확인 필요**(design-review.md:5, eng-review.md:62, final-review-fable.md:88), REQUIREMENTS EVID-01 행(06-01 Task 3 체크포인트), 실행 착수 게이트 M-9(「Phase 5 UI-SPEC과 UA-605~610 대조」, UI-SPEC:89).
- 상태: `.continue-here.md` status paused, 「Phase 6 계획 완료」 — 실행 선행 = Phase 4·04.1·Phase 5 main 반영 후 `/gsd-execute-phase 6`(:12). 2026-09-26 이후 플랜 갱신 없음(main 마지막 변경 #122).

## 5. origin/main 55647a0b vs origin/claude/phase-05-execute-pxok9w 17a0a41b (06 관련)
- `.planning/ROADMAP.md` Phase 6 절(main 714-795, 05 브랜치 770-851, 82줄)은 **완전 동일**(diff 0). Plans 목록 25개·`**Plans**: 25 plans`, 요구사항에 MAST-05·OPS-09 포함, 기준 3의 D-607 문구도 양쪽 같음(06-01이 실행 때 고칠 예정). ROADMAP 차이는 Phase 6 밖: Phase 5 Goal/기준 5~7 재작성(연차는 04.1 소유, 정산 결재 PM 기안 D-98), Phase 5 Plans 15개 파일 목록(`0/15 Planned`; main은 `0/TBD Not started`), Phase 9 기준 5 「PM 기안 → 대표 승인(D-98)」. 진행표 6행은 양쪽 `0/TBD Not started`.
- `06-CONTEXT.md` 차이 1줄(:11): 05 브랜치가 「Phase 5에서 넘어온 것」에 추가 — 「반려·회수 지출결의 종결(취소) 경로 — 종결 문서는 회차 상한·줄 문 판정에서 제외(Phase 5 U2 이관 — 사용자 결정 2026-09-26, 코디네이터 PR #89 · `.planning/todos/pending/2026-09-26-phase-6-rejected-expense-close-path.md`)」. 다른 06 파일 차이 없음. 이 항목을 구현하는 플랜 없음(관찰 4) — 06-03/06-13에 새 플랜·재계획 필요 후보.

## 6. 06-UI-SPEC.md 디자인 요소 (04.6 스킨 A 대조용; 1350줄, rev 9)
선언: 새 색·서체·radius·그림자·간격·토큰 0(:26, :997), `git diff docs/design/tokens.css` 0줄이 검수 조건(:107). 기준 SYSTEM.md Phase 4판 §7-15 폼·§7-16 페이지 줄·§7-17 확인 모달·§7-5·§8 규칙3·§7-3 (가)~(자)(:15-19, UA-601).
- 컴포넌트(:111-140): `ui/table/Table`(편집 표·읽기 표·`selectable` 선택 열 variant SP-1), `ui/form/Form`(+Field/Hint/Error/Actions), `ui/select/Select`, `ui/confirm-dialog/ConfirmDialog`(슬롯: 제목·부제·결과 줄 0~3·확인 근거·막힘 이유·1차, SP-7 첨부 보기 칸 72×96 썸네일), `ui/pagination/Pagination`(50건, href 갈래), `ui/button/Button`(`reasonTone: block|info`, `aria-disabled`), `ui/status-tag/StatusTag`(`text`/`tag` 변형), `ui/list-empty/ListEmpty`, `ui/page-header/PageHeader`, `ui/kv-list/KvList`, `ui/next-turn/NextTurn`, `ui/toast/Toast`(3차 `되돌리기`), 첨부 영역(§7-10, Phase 5, 가칭 `ui/attachments`), `AccountNumberCell`(`app/(app)/admin/vendors/account-number.tsx`). 미사용: Banner·FormAlert·HistoryList·PermissionGrid·Shell·AuthFrame·logout. 신규 컴포넌트 0(:138). 아이콘 Lucide 인라인(paperclip·external-link·x·정렬)(:105). Tool/shadcn 없음, CSS Modules, Pretendard Variable(:103-107).
- 토큰(:142-247, 사용 빈도순): 색 `--bg`(#FFFFFF) `--surface` `--accent-weak` `--g-50` `--g-100` `--g-600` `--g-700`(#005446 = `--accent`) `--g-950` `--fg` `--muted` `--faint` `--line-strong` `--danger`(#9B1C1C) `--danger-weak` `--warning`(#8A5A00) `--success`(`--g-600`) `--focus` `--native-accent`(체크박스) `--auto`; 간격 `--s-1/2/3/4/5/6/8/12`, `--cell-pad-x` `--cell-pad-y`(6/폰10), `--row-min`(36/폰44), `--label-w`(96), `--form-max`(720), `--modal-w`(480), `--control-h`(32/폰40), `--touch-min`(44); 글자 `--fs-xs`(11) `--fs-sm`(12) `--fs-base`(14/폰15) `--fs-lg`(18) (`--fs-xl` 사용 안 함), `--fw-regular/medium/bold`(400/600/700). 칸 폭 3종: select 200 · 짧은 칸 280 · 긴 칸 480. 선택 열 폭 44(28+cell-pad-x×2).
- radius: UI-SPEC은 radius 값·토큰을 한 번도 명시하지 않음(:26, :997의 「radius 0 추가」 선언뿐) → 04.6 스킨 A가 radius/그림자를 바꾸면 이 문서와 대조 필요.
- 색 역할(:188-): 60% `--bg` / 30% `--surface`→`--accent-weak`→`--g-100`(중첩 금지, 선택 행=`--accent-weak` 면) / 10% `--accent` 다섯 종류만(내 차례·3차 버튼·상태 글자, 편집 중 셀 2px 외곽선, 1차 버튼 화면당 하나, 포커스 링 2px `--focus`, 현재 메뉴 밑줄); 붉은 버튼 없음(위험 행동도 모달로, destructive는 글자만); 상태 매핑표(:221 부근, `StatusTag` `kind`): 미착수·취소·면제·`확인됨`/muted계, `반려`·`증빙 없음`=danger, `선결제`=warning, `지출결의 중`·`구매 요청`·`확인 전`·`신청`·`요청`=accent, `지급 완료`·`카드 사용`·`확인됨`·`구매 완료`·`발행됨`=success; 견적 줄 우선순위 취소>반려>증빙 없음>지출결의 중>구매 요청>지급 완료>카드 사용>미착수.
- 레이아웃 패턴: 목록 §6-1 읽기 목록/편집 표 + 그룹 머리글(「이번 주 지급」)+합계 줄+50건 페이지(S1·S3·S8·S11·S17); 문서 화면 §6-3 한 열 720 + 2px 선 섹션(증빙 S4·지급 S5, SP-3 「상태×권한 1차 하나」 행동 줄); 폼 §7-15(S6·S9·S12·S13); 프로젝트 상세 §6-2 섹션 2px 선+`일괄 저장 Ctrl+S N`(S15·S16·S18·S21); 모달 480폭 확인 모달 S2·S4·S5 등(:127); 폰은 행 시트(§7-3 (바), KvList)·하단 탭 44·고정 행동 줄; SP-4 하위 목록 진입 3차 링크; 여백 24(섹션 2px 선 위)/32(표→섹션 제목)/48(화면 하단); 결과 글자 `14:02 지급 완료 5건 · 막힘 2건` aria-live; 키보드 `Space`·`Ctrl+Enter`(화면 1차)·`Ctrl+S`.
- 표면 인덱스: S1 지급 대상(404) S2 일괄 확인 모달(527) S3 지급 완료 보기(543) S4 증빙 확인(551) S5 지급 섹션(593) S6 선결제(615) S7 첨부 규칙(622) S8 카드 목록(633) S9 카드 폼(656) S10 연결 고르기(733) S11 구매 목록(742) S12 구매 신청(754) S13 구매 완료(769) S14 견적 줄 표(780) S15 상세 카드 섹션(792) S16 발행 요청 표(800) S17 발행 요청 목록(814) S18 완료 전 점검(823) S19 내 차례(851) S20 설정 키(859) S21 차수 승인 증빙(871) S22 리저브 증빙(901); 시스템 변경 제안 SP-1~SP-7(995-1062): 일괄 처리 표·상태 낱말·제출 뒤 문서 화면·하위 목록·용어·마지막 증빙 삭제 확인·확인 모달 첨부 보기 칸; 열린 선택 표(1255); GSTACK REVIEW REPORT(1311).
