# 리포 감사 보고

- 대상: `rrangjaa-eng` 비공개 리포 3개, 2026-09-17 기본 브랜치 `--depth 200` 클론. 클론 위치 `scratchpad/repos/{intranet,erp260907,erp260807}`. GitHub에 아무것도 쓰지 않았다.
- PLANT8 = BTL 광고·마케팅 대행사(행사 기획). 인트라넷은 전 직원(10명)이 매일 쓴다.
- 비밀값(.env, DB 비밀번호, 개인정보)은 읽지 않았고 싣지 않았다. `server/.env.보기`는 secret guard가 막아 키 이름도 확인 불가.

## 1. PLANT8_INTRANET_BACKUP_260915 (현재 사용 중)

이 리포는 **소스 리포가 아니라 백업 스냅샷**이다. 커밋 3개(전부 2026-09-15), 내용은 `db_backup_260915.sql`(20MB RDS 덤프), `intranet_backup_260915.tar`(107MB `/var/www/html`), `web_backup_260915.tar`(회사 홈페이지), 분석 보고서 3건, `분석도구/`(node 파서). 소스는 tar에서 `application/`만 풀어 봤다(`intranet/src_intranet/`).

- 스택: PHP **CodeIgniter 3**(`composer.json` `codeigniter/framework`, php>=5.3.7) · MySQL 8.0.45 **AWS RDS**(ap-northeast-2) · 화면은 Bootstrap 4.6.1 CDN + jQuery 3.4/3.6(+`js/jquery-1.9.1.js`) + Pretendard + FontAwesome 5.7 · `third_party/PHPExcel`, `views/class.phpmailer.php` · 배포: EC2 `/var/www/html` + `.htaccess`. Docker·CI·테스트·린트 없음. `config/database.php`에 RDS 접속 비밀번호 평문(보고서 확인).
- 규모: `application/` PHP 89파일 — controllers 6,766 · models 3,020 · views 5,864 = **15,650줄**(보고서 집계 17,758줄은 helpers·config 포함). tar 6,357항목 중 대부분은 행사 사이트 잔재(`backup/` 118MB, `inc/` 45MB).
- 업무 기능 (메뉴 원문 `views/include/menu.php`): **프로젝트 · 페이먼트 · 업체등록 · 법인카드 · 클라이언트 등록** (5개). `login_include/left.php`: `/project/index`, `/payment/index`, `/card`, `/card/cardlist`, `/client`, `/partners`, `/member`, `/member/profile`.
  - `controllers/Project.php`: `write/write_ok`(프로젝트 등록), `list`, `quotation/quotation_ok`(견적 줄), `payment/paymentwrite/payment_ok/payment_modi/paymentdel`(실행가 줄), `projectdel`, `confirmMagr/confirmKuck/confirmAdmin/confirmCeo/cancelCeo`(4단 승인 플래그)
  - `Preview.php`: `list`(견적미리보기), `paymentwrite`(페이먼트 팝업), `poppaymentsubmit`, `payrequest`(승인요청), `project_copy`
  - `Confirm.php`: `success`(팀장승인) · `cancel` · `del` · `payrequest` — **전부 GET `_remap` 인자**
  - `Card.php`: `cardlist`, `cardUsedinsert`, `cardusedsubmit`, `cardsubmit`, `carddel`… · `Client.php`/`Partners.php`/`Member.php`: `list/insert/modify/submit/del` · `Ajax.php`: 자동완성(client/partner/project/subcate) · `Login.php`, `Logchk.php`
  - 인트라넷과 무관한 행사 등록 사이트 코드가 섞임: `Register.php`, `Event.php`, `Nmanager.php`, `notice.php`, `Excel_write.php`, `Index.php(survey/live)`
- DB 테이블/모델: DB `PLANT8_INTRANET` 14표 — `fone_project`, `QUOTATION_LINE`, `QUOTATION_PAYMENT`, `CARD_USED`, `fone_partners`, `fone_client`, `fone_member`, `fone_card`, `REPORT_CATEGORY1/2`, `ci_sessions`, 빈 표 `fone_team`·`new_table`·`tb_admin_member`. 같은 RDS에 행사 참가자 DB 7개(32표)와 홈페이지 DB `PLANT8_DATA`(2표) — ERP 대상 아님. models는 `Card_m`(27 메서드) `Client_m`(23) `Login_m`(55) `Partner_m`(19) `Nmanager_m` `Notice_m` `Payment_m` `Confirm_m` `Index_m`.
- 완성도 신호: TODO 4 · 복사본 파일 그대로 배포(`controllers/Payment - 복사본.php`, `views/card/CardUsedwrite - 복사본 (2).php`) · `sign/` 빈 폴더, `attach_file` 전부 NULL(첨부 미사용) · 서버 검증 없음(견적가·차익은 브라우저 계산값 저장, 차익 불일치 66줄).
- 오류/버그 신호: `addslashes` 315회 / `db->escape` 0회 · 비밀번호 평문 비교(`models/Login_m.php:205`) · 승인·삭제 GET · CSRF 꺼짐 · 권한은 `controllers/inc/common.php` 상수(`KUCKARR`·`TEAMARR`) 한글 문자열 비교 · 고아 견적 줄 5(프로젝트 삭제 시 하위 미삭제) · 테스트 0 · 린트 0 · 공개망 노출(세션 IP 8,620개).
- git 활동: 3커밋 · 2026-09-15 · 브랜치 1(`main`) · PR 0 · fix 커밋 0. **원본 개발 이력 확인 불가**(서버에 git 없이 있던 코드).
- 디자인 시스템: 없음. Bootstrap 4 CDN + `/asset/css/style.css`·`base_style.css` ad-hoc.
- 한 줄 판정: **실제로 쓰이는 기능은 4개** — 프로젝트+견적 줄(원장), 페이먼트 지급요청+3단 승인, 법인카드 사용 등록, 거래처/클라이언트 마스터. 나머지 컨트롤러는 행사 사이트 잔재.

## 1b. 인트라넷 실제 사용 데이터

출처 `db_backup_260915.sql` → `분석도구/parse_dump.js` → 집계 스크립트(`scratchpad/table_dates.js`, `monthly.js`, `sessions.js`). 개인 식별값은 집계하지 않았다.

| 기능/테이블 | 행 수 | 최초 날짜 | 최근 날짜 | 판정 |
|---|---|---|---|---|
| 프로젝트 `fone_project` (`project_appdate`) | 125 | 2026-01-21 | 2026-09-14 | **활발** — 월별 4월 7 · 6월 26 · 7월 36 · 8월 27 · 9월(14일까지) 18 |
| 견적 줄 `QUOTATION_LINE` | 1,379 | (등록시각 전부 NULL) | — | **활발** — `pay_status` 분포: 페이먼트등록 460 · 법카사용 433 · 대표승인 392 · 팀장승인 51 · 관리팀승인 41 |
| 지급요청 `QUOTATION_PAYMENT` (`app_date`) | 464 | 2026-03-11 | 2026-09-15 | **활발** — 월별 4월 78 · 5월 79 · 6월 88 · 7월 126 · 8월 63 · 9월 22 · 요청자 11명 · 지정 팀장 5명 · `PAY_STATUS` Y 440 / R 9 |
| 법인카드 사용 `CARD_USED` (`app_date`) | 433 | 2026-02-23 | 2026-09-15 | **활발** — 월별 4월 81 · 6월 108 · 8월 73 · 9월 53 · 작성자 10명 · 견적 줄과 433:433 1:1 |
| 로그인 세션 `ci_sessions`(MEMBERIDX 포함분) | 5,134 / 40,968 | 2026-01-07 | 2026-09-15 | **활발** — 월별 3월 197 · 4월 743 · 6월 1,061 · **7월 1,453** · 8월 625 · 9월 444 |
| 거래처 `fone_partners` | 278 | (날짜 칸 없음) | — | **간헐** — 마스터. 보고서: 149곳은 한 번도 안 쓰임 |
| 클라이언트 `fone_client` | 22 | — | — | 간헐 — 마스터. 프로젝트에 쓰인 곳 14 |
| 직원 `fone_member` | 10 | `enter_date` 2026-06-29 | 2026-09-15 | 마스터(입사일 아니라 계정 갱신 시각) |
| 법인카드 마스터 `fone_card` | 9 | — | — | 마스터 |
| 분류 `REPORT_CATEGORY1` / `2` | 16 / 113 | — | — | 마스터(설정) |
| `fone_team`, `new_table`, `tb_admin_member` | 0 | — | — | **사장** |
| 프로젝트 4단 승인 플래그 (`confirm_*`) | 125 중 YYYY 42 · NNNN 58 | — | — | 간헐 — 관리팀 승인 43건만 「완료」 기준으로 유효 |
| 행사 참가자 DB 7개 (LGCNS 1,174 · snowflake 647 · fortinet 444+410+133 · Verkada 275+54+51+91 · Sivantos 324 · AWS 159) | 3,766 | 2025-02-06 | 2026-09-15(AWS_GAMES 진행 중) | 인트라넷 아님 — 고객사 위탁 개인정보, 별도 파기 결정 필요 |
| 홈페이지 `PLANT8_DATA.board_free` / `plant8_contact` | 18 / 27 | 2025-08-13 / 2025-11-04 | 2025-12-22 / 2026-09-14 | 인트라넷 아님 |

읽는 법: **덤프에는 2026년만 있다**(사내번호 전부 `26xxx`). 2025년 자료는 옛 cafe24 사이트 몫이라 여기 없다. 9-01 화면 긁기 이후 2주간 프로젝트 8 · 견적 줄 68 · 지급요청 35 · 법카 53건이 늘었다 — 시스템은 절체일까지 계속 갈라진다.

## 2. ERP_PLANT8_260907 (ERP 시도 #2 · 현재 진행)

- 스택: TypeScript 단일 언어. `app/`: React 19 · Vite 8 · react-router 8 · TanStack Query/Virtual · Radix popover · dnd-kit · recharts · xlsx · IBM Plex Sans KR. `server/`: **Hono 4** on Node 22 `--experimental-strip-types`(빌드 없이 실행) · `pg`(PostgreSQL, Google Cloud SQL) · zod · `@google-cloud/storage` · exceljs · pdfkit/pdf-lib · qrcode. 인증: 자체 `sessions` 표 + scrypt(`server/src/password.ts`) + `login_policies`(잠금). 시험: vitest(app) · `node --test`(server) · vitest `guards/` · Playwright `e2e/`. 린트 oxlint · tsc. 배포: `Dockerfile`(node:22-slim 2단) → **Cloud Run**(`docs/91_클라우드런-올리기.md`, `.gcloudignore`). CI `.github/workflows/`: `answer-contract`, `baseline-due`, `codeql`, `e2e`, `guards`. `.githooks/` + `.claude/hooks/` 11개(`fable-gate`, `round-gate`, `agent-roster`…).
- 규모: 4,338파일. ts 414파일 189,302줄 · tsx 199파일 113,903줄 → `app/src` **149,954** · `server/src` **134,649**. sql 218파일 99,362줄 · mjs 25,402줄 · **md 888파일 159,310줄**. 시험 파일 360(app 129 · server 171 · guards 43 · e2e 11) · `it/test(` 약 6,543.
- 업무 기능 (메뉴 원문 `db/schema/040_seed_roles_permissions.sql`): **대시보드 · 프로젝트 · 견적 · 지출결의 · 결재함 · 증빙 · 구매 요청 · 법인카드 · 매출 · 수금 · 손익 · 리저브 · 확인증 · 연차 · 거래처 · 조직과 권한 · 설정** (16). 라우트 `/`, `/projects`, `/quotes`, `/expenses`, `/approvals`, `/receipts`, `/purchases`, `/card-use`, `/sales`, `/pnl`, `/reserve`, `/confirmations`, `/leave`, `/vendors`, `/org`, `/settings`, `/g/:token`(확인증 외부 열람). 화면 컴포넌트 36장(`app/src/pages/*.tsx` 비시험) · 틀 6종(`frames/`: AppShell·List·Form·Detail·Dashboard·Phone). 서버 `/api` 길 **236개**.
- DB 테이블: **70표**(`db/schema/010_tables.sql`) — `projects`+documents/members/schedules/statuses, `quotes`+items/adjustments/statuses, `expenses`+files/statuses/urgencies, `approval_routes/route_steps/steps/delegations`, `receipts`+files/kind_file_types, `purchase_requests`, `corporate_cards`, `invoices`+files/requests, `sales`, `collections`, `reserve_entries`, `settlement_records`, `team_targets`, `confirmations`+7표, `leave_requests/grants/days`, `holidays`, `notices`, `people`, `positions`, `position_permissions`, `permissions`, `roles`, `divisions`, `division_menus`, `teams`, `view_scopes`, `settings`+groups, `code_lists/items`, `formulas`, `money_rules`, `audit_log`, `login_policies`, `sessions`, `schema_version`, `vendors`+contacts/documents, `screen_prefs`.
- .planning/ 요약: **`.planning/` 없음**(GSD 아님). 대신 `docs/00_목적.md`~`91`, `docs/90_결정-기록.md`, `CLAUDE.md`(85KB), `00_이어하기-지시문.md`(**1MB · 9,955줄 · 인수인계 74절**).
  - 핵심 가치 (`docs/00_목적.md`): 「**행사 하나의 돈줄기를 한 곳에서 본다**」 · 「이 ERP는 회계·세무 프로그램이 아니다」 · 목표 여섯(들어온 돈/나간 돈 한 화면 · 증빙 · 수금·지불 날짜 · 결재 ERP 안에서 · 늦은 지출결의 가시화 · 연간·월간·팀별 수익률).
  - 페이즈 (`docs/09_설계/30_처음부터-다시-만든다면.md` 단계 0~8: 낱말 → 장치 → 판·씨앗 → 서버 → 부품·틀 → 돈줄기 → 곁 → 알림·폰 → 관리자): 이어하기 쉰일곱째(09-12) 「6단계 화면 넷 · 7단계 알림·폰 · 8단계 결재 경로」까지 진행. 09-17 현재 **미결 대장 54건**(정본 `docs/11_보관/미결.md`) · 사용자 결정 대기 6 · 브라우저 e2e 미실행 · Fable 끝 판정 생략.
  - **운영 DB 없음** — `00_이어하기-지시문.md` §24 「⚠⚠ 운영 DB 는 없다 — 문서가 낡아 지휘가 틀린 답을 냈다 (2026-09-16 사용자 지적)」. 실사용 데이터 0.
- 완성도 신호: TODO/FIXME 1 · `any` 29 · 빈 catch 0 · `console.error` 11 / `console.log` 8 · 게시판은 「1차 범위 밖」(표·서버·화면 0). 인트라넷 이관 파이프라인 `server/도구/이관/`(harvest·transform·load·gates·verify·hometax_match) 있으나 「E4 미완」.
- 오류/버그 신호: fix|bug|error|오류|수정 커밋 15/519(3%) · 한국어 고침·수리·결함·빨강 커밋 **84/519(16%)** · 화면 시험 CI 빨강 고침, 답 계약 어긋남, 대표 흰 화면 급1 등이 이어하기에 기록.
- git 활동: 2026-09-07 「새 저장소 세움 — 빈 뿌리」 → 2026-09-17 · **519커밋/11일**(하루 최대 116) · 원격 브랜치 30 · PR 22 · 작성자 Claude 496 / rrangjaa-eng 21 / rrangjaa 2. **리포가 public**(`gh repo view` isPrivate=false).
  - 최근 15: `Merge pull request #21 …` · `인수인계 일흔넷째 절을 마무리했다 - 라운드 결과와 다음 세션이 알아야 할 것 여섯` · `물결 B2 - 증빙 종류 아홉 · 지급 방식 · 설정 키 · 판 이름 2026-09-17.1 · 알림 서랍 · 경계 위반 하나 (미결 64 → 54)` · `F-05 판정 - 물결 B 를 셋으로 끊고 미결 59 를 전수로 갈랐다` · `CI 화면 시험 4/4 빨강을 고쳤다 - 쇼케이스 시험 상한 5초 → 20초` · `F-05 지시서 - 물결 B 시작 판정 …` · `답 계약 어긋남 하나를 고쳤다 - 어긋난 줄 1 → 0` · `물결 B1 - 코드 고침 셋 + CodeQL 경고 판정 · 사용자 결정 다섯 반영` · `F-04 판정 - 열둘 중 일곱은 지금 친다 · 넷은 이미 닫힌 낡은 줄 (미결 53 → 57)` · `물결 A 끝 - S-01 · S-05 보고 …` · `S-04 · S-06 보고 - 놓친 열셋을 미결 대장에 넣었다 (41 → 53)` · `S-03 보고 - 구매 요청 진입점 「0 곳」은 낡았다 · 알림은 서버만 갖췄다` · `S-02 보고 - CodeQL 경고는 가를 것이 0 이었다` · `물결 A 지시서 여섯 …` · `PR #21 줄을 이어하기 일흔넷째 절에 채웠다`
- 디자인 시스템: 있음 — `app/src/index.css` CSS 변수 124개 · `app/design/부품-견본.html`·`인쇄물-양식.html`·`홈-지휘실.html`·`후보/` 시안 4 · 틀 6종 · guards가 강제(`screen-hardcoded-style`, `screen-look`, `screen-four-states`, `screen-text-dictionary`).
- 한 줄 판정: 인트라넷의 14배 범위를 장치(guards 43·CI 5·훅 11)로 지키며 짓고 있으나, **실사용자·운영 DB·실측 편의성 0**이고 문서(159K줄)가 코드의 절반 크기다.

## 3. ERP_PLANT8_260807 (ERP 시도 #1 · 2026-09-07 종료)

- 스택: 260907과 동일(React 19 · Hono 4 · pg · Cloud Run). 차이: `Dockerfile` node:24-slim · Pretendard 폰트 · CI 2개(`e2e`, `guards`) · guards 21 · Claude 훅 6 · 2026-08-24 Cloud Run 첫 배포·「실운영 개시 청소」.
- 규모: 2,055파일. ts 291파일 142,872줄 · tsx 389파일 231,720줄 → `app/src` **247,648** · `server/src` **101,640**. sql 266파일 80,571줄 · md 405파일 100,032줄. 시험 파일 480(app 353 · server 104 · guards 21 · e2e 2) · `it/test(` 약 7,108. `00_이어하기-지시문.md` 508KB/6,3xx줄 · `CLAUDE.md` 34KB.
- 업무 기능 (메뉴 `040_seed`): **홈 · 프로젝트 · 견적 · 지출결의 · 결재함 · 증빙 · 구매 요청 · 매출 · 수금 · 손익 · 리저브 · 확인증 · 연차 · 거래처 · 조직과 권한 · 설정**(15) + 탭 `지급`(`/payments`), `권한 · 결재 경로`(`/access`). 라우트에 한글 별칭 `/결재 /증빙 /지출결의 /프로젝트`. 화면 **54장**(`App.tsx` `BUILT`가 정본). `/api` 길 219개.
- DB 테이블: **68표**(`db/schema/010_tables.sql`) — 260907과 같은 집합에서 `formulas`·`schema_version`만 없음. `db/새판/001~185`(누적 마이그레이션) + `db/` 루트 028 + 날짜 SQL 15개(임시판·연습판 청소).
- .planning/ 요약: **없음**. 같은 `docs/` 체계. `docs/10_점검/` **73파일** — 직책별 관찰기록(08-23), e2e 관찰기록(08-25), 2차 R0~R7(08-26), 적대분석(08-27·08-31), 미관점검(08-29), 부품활용 실측(09-02). `docs/09_설계/18_남은-작업-전수.md`(09-03) · `30_처음부터-다시-만든다면.md`(09-04) · `33_새-저장소로-오기까지.md`(09-07).
  - 종료 사유 (`33` §1 원문): 「9월 초 전수 점검에서 **정한 것을 지키는 장치가 없어**(규칙 284 중 사람만 30 · 설정 65 중 서버가 읽는 것 6 · 새 권한 안 켜짐 6회 · 문서↔판 어긋남 33) 사람이 쌓은 자리가 224줄이 됐고, 화면 54장이 서로 다른 무늬였다」. 「옮기는 까닭은 「다시 만들기」가 아니다. 판(9할) · 서버(8할) · 부품(9할) · 문서(9할)는 그대로 가져간다」.
  - **실판 비어 있음**: 이어하기 서른아홉째(09-04) 「⚠ 실판은 여전히 비어 있다(8월 11일부터)」.
  - 그 앞에 **시도 #0**이 있다: `00_시작-지시문.md` §3 「옛 저장소 `F:\GPT\ERP_plant8`(GitHub `plant8-erp-rebuild`) … 9일간(2026-07-30 ~ 08-07) 마이그레이션 48개/45,405줄 · 표 48 · 함수 257 · 회귀 시험 15,494줄」 → 「20명이 쓸 것에 비해 너무 크다」로 폐기.
- 완성도 신호: TODO/FIXME 1 · `any` 29 · 빈 catch 0 · 「새잎」 전면 리디자인 적용 후 **전체 되돌림**(08-31) · 견적 메뉴 삭제(08-22)→부활(09-03), 고객 견적서 안 만듦(08-27)→부활(09-02) 등 뒤집힌 결정 23건.
- 오류/버그 신호: fix 정규식 16/927 · 한국어 고침·결함 61/927 · 관찰기록에 서버 500(연차 취소, `approval_steps_reason_when_needed` 제약), 알림 교착(웅덩이 재빌림) 등 실물 결함 다수.
- git 활동: 리포 생성 2026-08-08 · GitHub 전체 **1,326커밋** · depth-200 창(2026-08-31~09-07) 927커밋 — **09-03 311 · 09-04 356** · 원격 브랜치 63 · PR 0 · 작성자 rrangjaa 758 / Claude 158. 마지막 커밋 2026-09-07 「합침 — 옛 저장소 CI 끔」.
  - 최근 15: `합침 — 옛 저장소 CI 끔` · `옛 저장소 CI 끔 — 저절로 도는 것 0 · 손으로만 · 액션 한도 90%` · `합침 — 결정 기록 마무리 한 줄` · `결정 기록 마무리 한 줄 — 양쪽 합침 · 정본은 새 저장소` · `합침 — 09-07 저녁 · 열아홉 점검 · v3.1 열일곱 · 새 저장소 첫날 ②③④ · 틀 방향 셋 견줌` · `견줌표 칸 안 별표 걷음` · `틀 방향 셋 견줌 · 권장 B 바탕 · 인계(넷째) · 이어하기 마흔째 마무리` · `틀 방향 C 세 기둥 작업대 — …` · `견줌표 초안 — A · B · D 칸 …` · `틀 방향 D 탭 작업 공간 — …` · `틀 방향 B 위 띠 작업대 — …` · `틀 방향 넷 견줌 캔버스 조립 손 — …` · `씨앗 SQL 끝 — 새 저장소 master 합침 …` · `2차 정정 끝 — 열일곱 어긋남 0 …` · `작업 중 저장 — 2차 정정 보고 · 새 틀 방향 셋 진행분`
- 디자인 시스템: `index.css` 변수 228개 · `app/design/부품-견본.html` · 시안 후보 4 — 있었으나 「화면 54장이 서로 다른 무늬」로 판정됨.
- 한 줄 판정: 한 달에 54화면·68표·7천 시험을 지었고 실사용 관찰기록 73건을 남겼으나, 운영 데이터 0인 채 규율 문제로 리포를 닫고 #2로 옮겼다.

## 4. 세 리포 비교

| 항목 | 인트라넷 | 260807 (ERP #1) | 260907 (ERP #2) |
|---|---|---|---|
| 스택 | PHP CI3 · MySQL RDS · Bootstrap 4 | TS · React 19 · Hono · Postgres(Cloud SQL) · Cloud Run | 동일 + guards 43 · CI 5 · CodeQL |
| 코드 LOC | PHP 15,650 (app 폴더) | app 247,648 + server 101,640 = **349K** | app 149,954 + server 134,649 = **285K** |
| 문서 LOC | md 3건 | md 405파일 100K줄 | md 888파일 **159K줄** |
| 업무 기능 수 | 메뉴 5 · 화면 8 · 표 10 | 메뉴 15+2 · 화면 54 · 표 68 | 메뉴 16 · 화면 36 · 표 70 |
| 완료 페이즈 | n/a (운영 중) | 돈줄기 전 업무 구현 → 규율 부재로 종료 | 단계 8/8 손댐 · 미결 54 · 실측 미완 |
| 실사용 데이터 | **2,849행 · 10명 · 9개월** | 실판 비어 있음 | 운영 DB 없음 |
| 마지막 커밋 | 2026-09-15 (백업) | 2026-09-07 | 2026-09-17 |
| 총 커밋 / 기간 | 3 | 1,326 / 31일 | 519 / 11일 |
| fix 커밋 비율 | 0 (백업) | 16 영문 · 61 한국어 / 927 (7%) | 15 · 84 / 519 (16%) |
| 테스트 | 0 | 480파일 · ~7,108케이스 · e2e 2 | 360파일 · ~6,543케이스 · e2e 11 · guards 43 |
| 공개 여부 | private | private | **public** |

## 5. 겹치는 기능과 빠진 기능

- 인트라넷에 있는데 ERP에 없는 것: 기능 집합으로는 **없음**. 차이는 「규칙이 없음」이다 — 클릭 1회 GET 승인, 관리팀이 팀장 건너뛰기, 증빙·사유 없이 저장, 견적 줄 1행이 곧 원장(조인 없이 수익률). ERP는 이것을 관문(결재선 강제·증빙 필수·완료 잠금)으로 바꿨고, 그 손 수 증가는 미실측(`과제_기획사원동선시간측정.md`).
- ERP(어느 쪽이든)에 있는데 인트라넷에 없는 것: 증빙(`receipts`) · 구매요청 · 매출·계산서 대장(`invoices`,`sales`) · 수금(`collections`) · 지급 묶음·통장 파일 · 손익·정산·성과(`settlement_records`,`team_targets`) · 리저브 · 확인증(소득신고, `/g/:token`) · 연차 · 알림 · 결재선/위임/반려 사유 · 감사 기록 · 설정 136 · 직책 권한 · 공휴일 · 인쇄물(견적서·정산서·확인증 PDF) · 폰 화면. — ERP 표 70 중 인트라넷과 겹치는 것은 열댓 개.
- 세 곳 모두에서 다시 만든 것 (반복 재구현 신호): **프로젝트(행사) 등록·목록 · 견적 줄(대분류 16/소분류 113) · 지급요청→지출결의 + 팀장→관리→대표 3단 결재 · 법인카드 사용 등록 · 거래처/협력사 마스터 · 직원·로그인·권한**. ERP #1→#2 사이에도 화면 54장 전부를 틀 위에 새로(36장), `db/새판` 185장 → `db/schema` 한 벌, 문서 전체 복사. 시도 #0(`plant8-erp-rebuild`)까지 치면 ERP 골격은 **세 번째** 재구현이다.

## 6. 진단에 필요한 사실 5개

1. **인트라넷은 살아 있고 좁다.** 10명이 월 최대 1,453 로그인 세션(2026-07), 지급요청 464건(마지막 2026-09-15 14:31), 법카 433건, 프로젝트 125건 — 실제 쓰는 기능은 4개뿐이고 표 10개에 2,849행이다. 근거: `db_backup_260915.sql` 집계(§1b), `views/include/menu.php`.
2. **ERP 두 시도는 41일간 1,845커밋·63만 LOC·13,600 시험을 만들었으나 실사용자·운영 데이터가 0이다.** 근거: `erp260907/00_이어하기-지시문.md` §24 「운영 DB 는 없다」(2026-09-16), `erp260807/00_이어하기-지시문.md` 「실판은 여전히 비어 있다(8월 11일부터)」.
3. **#1→#2 재시작 이유는 기능 부족이 아니라 규율 장치 부재였고, #2는 장치를 세웠지만 미결이 54건 남았다.** 근거: `erp260907/docs/09_설계/33_새-저장소로-오기까지.md` §1(규칙 284 중 사람만 30 · 설정 65 중 서버가 읽는 것 6), `guards/README.md`, 이어하기 일흔넷째 §3.
4. **범위 격차 14배 · 편리성 실측 0건.** 인트라넷 5메뉴/8화면 vs ERP 16메뉴/36~54화면/설정 136. ERP 기능의 4/5는 인트라넷에 없던 새 업무다. 기획 사원 동선 비교는 과제서만 있고 측정값이 없다(임시판 점검표 172항목 판정 0). 근거: `intranet/평가_구인트라넷수준과ERP비교_260915.md`, `과제_기획사원동선시간측정.md`.
5. **유지 비용 신호: 문서가 코드의 절반, 커밋의 96%가 AI 작성, 하루 356커밋.** 260907 md 159K줄 vs 코드 303K줄, `00_이어하기-지시문.md` 1MB/74절, 작성자 Claude 496/519; 260807 09-04 하루 356커밋. 덧붙여 `ERP_PLANT8_260907`이 **public** 리포이고 인트라넷 백업 리포는 직원 비밀번호 평문·계좌 732건·RDS 비밀번호를 담고 있다(`intranet/README.md` ⚠ 절). 근거: `gh repo view` isPrivate, `git log --format=%an`.
