# 06.1 UAT 재측정 결과 (STAGING, 2026-10-27)

- 대상: https://plant8-staging-67rumhdgba-du.a.run.app — `/api/health` sha `86dadabf0b0a6d9b9e1070c00a91265643aa28a3` (deployedAt 2026-10-27T04:34:46Z)
- a17eba8(#256, G-06.1-29/40 수정)은 이 sha의 조상이다(`git merge-base --is-ancestor` 참). 저장소 main 21e3b8d와의 차이(86dadab..21e3b8d)는 `.planning`·`notes`·`docs`·`.claude` 문서뿐이라 코드는 같다.
- 증거 파일(PNG·JSON·스크립트): /mnt/project-files/06.1-review/reverify-1027/
- 방법: Playwright(chromium) DOM 실측만으로 판정. PNG는 증거일 뿐. 스크립트 사본 `scripts/`, 원자료 JSON은 이 폴더.
- 계정: 시스템 관리자(환경변수 로그인, 값은 어디에도 적지 않음) + 이번에 만든 [테스트] 계정 2개(아래 §5).
- 한계: 이 샌드박스는 GCS(storage.googleapis.com) PUT이 막혀 **사진·PDF 파일 올리기(05 업로드)는 측정할 수 없다**(`net::ERR_FAILED`). 엑셀·CSV 가져오기(서버 액션)는 된다.

## 1. 결과표

| 항목 | 이전 결과 | 새 결과 | 측정값 | 증거 | 근거(file:line) |
|---|---|---|---|---|---|
| #29 붙인 직후 제출 1차 활성 | issue | **pass** | [테스트] 임시 문서(증빙 없음, 작성자 [테스트] 재검증 PM1027). 증빙 고르기→Enter 직후 0s `aria-disabled=true`(사유 `증빙 없음 · 증빙 올리기 Ctrl+U`), 1.5s·4.5s 모두 활성(`aria-disabled` 없음, 새로 고침 없음). 40ms 폴링: 붙은 증빙 표 등장 1015ms → 제출 활성 1585ms. 비고(저장 안 한 값) 그대로 유지. 마지막 기록을 떼면: 떼기 확인 후 699ms에 표 사라짐과 **같은 순간** 제출 비활성(사유 `증빙 없음 …`)·1.5s·4.5s 유지 | T29.json · T29b.json · T29c.json · T29-after-attach.png · T29-after-detach.png | 회귀 가드 test/e2e/evidence-pick.spec.ts:66(붙임)·:158(대칭) · 원인 expense-form.tsx(06.1-15) |
| #40 「목록으로」 = 출발 목록 | issue | **pass** | 출발 4종(기본 `/expenses/evidence`, `?state=all`, `?state=published&type=card_receipt`, `?state=unmatched&type=card_receipt`) × (Esc, 취소) = 8회 모두 도착 URL == 출발 URL(거르개 보존), 포커스 = 같은 증빙 행의 `대리 등록` 링크(`focusOnSameRowLink=true` 8/8). 링크에 `from=` 실림(`…&from=%2Fexpenses%2Fevidence%3Fstate%3Dall`). 저장: 기본→`/expenses/evidence?registered={id}`, `state=all&type=card_receipt`→`…&type=card_receipt&registered={id}`(거르개 보존, 토스트 `카드 사용 등록 · 220,000`), 저장 뒤 포커스는 H1(`증빙`, 행이 사라지므로 링크 없음). 공개+카드 출발의 저장은 **데이터 때문에 못 함**: 공개 카드 줄은 전부 `[테스트] 06.1 PM-A 09-15 소속 없음 · 소속 발령은 관리자`로 등록 버튼 비활성(20줄 확인) — 결함 아님 | T40-close.json · T40-save.json · T40-save-*.png | .planning/.../06.1-UAT.md G-06.1-40 · 해당 E2E test/e2e/evidence-proxy-return-capture.spec.ts |
| #1 한 창 여러 파일 | blocked | **부분 pass** (실물 서식 판별은 로컬 파서로, 스테이징은 픽스처) | 실물 견본 6종은 `/mnt/project-files/06.1-prep/samples-private/`에 있다(신한·비씨·롯데 2026-10-26, 홈택스 세금계산서 2026-10-26, 계산서·현금영수증 2026-10-04). 로컬 `EVIDENCE_SAMPLES_DIR=… pnpm vitest run --project unit test/unit/evidence-import/samples.test.ts` → **6/6 통과**(신한 회계양식 162줄·비씨 9·롯데 115·홈택스 세금계산서 254·현금영수증 1·계산서 3). 스테이징에는 실물을 올리지 **않았다**(§6 사유). 스테이징 픽스처 롯데 1파일: `롯데카드 매입내역 등록 2 · 카드 사용에 붙음 1 · 짝 없음 1`, 홈택스 1파일: `홈택스 매입 세금계산서 등록 1 · 이름 다름 1` | samples-unit.log · T1-36-45-upload.json/.png · T45-upload.json | test/unit/evidence-import/samples.test.ts:32,41,49,55,63,72 |
| #36 자동 대사 | blocked | **부분 pass** (2단계), 승인번호 1단계 **확인 못 함** | 스테이징에 [테스트] 카드 사용(롯데 2222, 10-22, 합계 44,000, 증빙 없음) 하나를 UI로 만든 뒤 같은 카드·날짜·합계 줄이 든 롯데 픽스처 업로드 → `카드 사용에 붙음 1`, 다른 줄 `짝 없음 1`(후보 0). 승인번호 1단계는 UI에 카드 사용 승인번호 칸이 없어(`/cards` 등록 칸: 카드·사용일·결제 합계·증빙 종류·연결·메모) 스테이징에서 줄을 만들 수 없다 | T1-36-45-upload.json | 1단계: test/integration/evidence-reconcile.test.ts:116,196,317 · test/unit/domain/evidence-records/reconcile.test.ts:29 · domain/evidence-records/reconcile.ts:5 |
| #45 거래처 자동 생성/되살림/이름 다름 | blocked | **부분 pass** (이름 다름), 되살림·고객→둘 다 **확인 못 함** | 사업자번호 `123-45-67891`(기존 `[테스트]공급사가`)에 파일 상호 `[테스트]재검1027상호` → 결과 `이름 다름 1 123-45-67891 · 파일 [테스트]재검1027상호 · 등록 [테스트]공급사가`. 되살림은 보관 거래처가 필요한데 거래처 보관 UI가 없다(이전 보고와 같음) | T45-upload.json | domain/evidence-import/vendor-autocreate.ts:95 |
| 현금영수증 취소 · 비씨 취소 · 롯데 면세 | skipped/미측정 | **확인 못 함: 실물 견본 없음** | 견본 폴더에 해당 서식 줄이 든 파일 없음(현금영수증 1줄=승인, 비씨 9줄, 롯데 115줄 단위 검증만) | — | prep-260907.md #3 열림(취소 낱말/부호·PA-CASH-TOTAL 실물 없음) |
| #22 지급 방식 짝 | blocked | **blocked: 공용 설정 변경 필요(07.1 공용 스테이징)** | 현재 설정에서는 계좌이체·현금 × 세금계산서/카드 전표 조합이 막히지 않는다(현금 지급 방식 임시 문서의 증빙 고르기 목록 20줄 중 `짝 아님` 막힌 행 0; 제출은 시도하지 않음). 짝 아닌 조합을 만들려면 P0-2 짝 설정 변경이 필요해 하지 않음 | T22.json · T22-picker.png | test/integration/evidence-attach.test.ts:463(짝 아님 문구 :473) · test/integration/evidence-pool.test.ts:175 · test/integration/payment-batch.test.ts:382 |
| #53 최소 용량 | blocked | **blocked: 공용 설정 변경 필요(07.1 공용 스테이징)** | `evidence.min_size_kb` 변경 안 함. 올리기도 이 샌드박스에서 GCS PUT 불가 | — | test/integration/evidence-upload-guards.test.ts:103,106(20KB 설정에서 15KB 선언 거절·0 복귀 통과) · domain/settings/keys.ts:1180 |
| #27 팀장 대리 불가 | blocked | **pass** | 같은 팀 팀장을 [테스트]로 만들 수 있었다: [테스트]06.4팀의 기존 팀장 `[테스트]06.4 사원C`(첫 로그인 전 계정) 비밀번호를 초기화해 쓰고, 같은 팀에 새 [테스트] 기획 PM `재검증 PM1027-B`를 만들어 팀 관리비 문서(T26-0016)를 제출·회수. 팀장(작성자 아님)의 `증빙 고르기` 트리거: 결재 중 0, 회수 뒤 0, `떼기` 0, 붙은 증빙 표 1(보기만). 작성자도 결재 중 트리거 0·잠김 줄 `결재 중 · 증빙은 경영관리` | T27.json · T27-withdrawn.json · T27-*.png | domain/evidence/index.ts:81 · test/e2e/evidence-pick.spec.ts:379 |
| #13 개인카드 전표 공개 불가 | skipped | **skipped (재현 불가 유지)** | 증빙 목록의 종류 거르개는 4종뿐이고 파일 가져오기·UI로 `개인카드 전표` 종류 줄을 만들 길이 없다. 공개 셀 `—`·상태 `미공개 · 개인카드 전표 · 경영관리만` 규칙은 코드·시험으로만 확인 | — | domain/evidence-records/status.ts:40-42 · test/unit/domain/evidence-records/status.test.ts:68-70 · test/integration/evidence-row-scope.test.ts:100 · test/e2e/evidence-private-type.spec.ts:94(문서 화면) |
| #23 후보 0이면 붙이기 트리거 없음 | skipped | **pass** (이제 재현됨) | 미공개 줄 14개 중 `대리 등록`만 7, `붙이기`만 7, 둘 다 0 — `붙이기`와 `대리 등록`이 한 행에 같이 뜬 경우 0(`state=unmatched`: 50줄 중 대리 등록만 46·붙이기만 4). 후보 0 줄(예 `[테스트]무효1`, `=CMD()`)은 `붙이기` 트리거 없음. 전에는 이 줄이 없어 측정 못 했다 | T23.json | test/integration/evidence-card-attach.test.ts:389 |
| #49 확인 필요 풀기 | skipped | **풀기 동작 pass · 이력 표시는 deferred 유지(07)** | `확인 필요` 줄 3개(`[테스트]취소시험`, `[테스트]중복C`, `[테스트]카페B`)를 패널 1차 `확인 필요 풀기 Ctrl+Enter`로 풀기 → 패널 닫힘, 필터 `state=needs-check` 3→0, 행 상태 `확인 필요` 사라짐. 풀고 난 패널 이력은 `10-20 22:44 admin 등록 / 10-20 22:56 붙임 …`뿐으로 **풀기 한 줄이 이력에 없음**(풀기 전과 같음) | F49.json · F49-panel-before.png · F49-panel-after.png | 설계 06.1-07-PLAN :50·:271 · domain/evidence-records/amount.ts:215-221 · 이월 UAT「Deferred Follow-Ups」(07) |
| #59 260907 시안 비교 | skipped | **구조 비교 완료(차이 4건, 아래 §3)** | 4폭 캡처 + DOM 구조표 | S-evidence-{1280,768,375,320}.png · S-evidence-all-*.png · staging-evidence-structure.json · prop-evidence.json · P-prop-evidence-{375,1280}.png | §3 |
| #60 폰 증빙 목록 행 두 줄 | skipped | **issue (미개선)** | 375: 행 40개 중 1줄 22 · 2줄 8 · **3줄 10**(최대 행 높이 111px, `state=all` 102행 중 3줄 42). 320: 1줄 22 · **3줄 12 · 4줄 6**(최대 131px; `state=all` 4줄 40). 최악 행: 375 `확인 필요 취소 줄 등록됨 · 원거래 확인`(상태 칸 150px, 3줄), 320 `확인 필요 같은 승인번호 다른 금액 · 원거래 확인`(117px, 4줄). 기준(≤2줄) 불충족 | rows-phone.json | .planning/debug/0601-evidence-phone-3lines.md · SYSTEM §7-3:855(미구현) |

## 2. 왼쪽 레일(#298)·삼각형(#296) 회귀 (#10)

변경 이력: `git log --since=2026-10-20` → 06.1 화면에 닿은 변경은 #298(8e677d4 레일, fca56d5, 8c64635), #296(6e8d262 삼각형), 07의 ui/table 개정(bfe9998 amendment 11 · 434c243 · 41d87df · c3922dd), 07-28 지출결의 상세 칸 제출 필수(f619925), 07 희망 지급일(f91636b), cards/page.tsx(+9)·expense-form.tsx(+226)·evidence-table(+22).

| 확인 | 결과 | 측정 | 증거 |
|---|---|---|---|
| 증빙 메뉴 ≥1280 레일 3번째 | pass | `nav[aria-label="주 메뉴"]` 순서 `프로젝트·지출결의·증빙·법인카드·결재·손익`, 증빙 클릭 → `/expenses/evidence`, 현재 항목 `aria-current` | nav-boundaries.json · nav.json |
| 700–1279 ≡ | pass | 1279·1023·768·700: 레일 없음, `≡ 메뉴` 버튼, 열면 목록에 증빙 3번째, 클릭 → `/expenses/evidence` | nav-boundaries.json |
| <700 하단 탭 | pass(부분) | 375·320: `하단 탭`(내 차례·결재·손익·더보기), `더보기` 안 `증빙`(`/expenses/evidence`) 있음. 699px 클릭 이동은 선택자 오류로 끝까지 못 함 | nav.json · N-more-375.png |
| 가로 넘침(scrollWidth ≤ clientWidth) 320/375/768/1280 | pass | 증빙 목록(기본·`state=all`), 대리 등록 패널(`/cards?new=1&evidence=`), 증빙 패널, 지출결의 문서, 증빙 고르기 대화상자 — 5화면×4폭 전부 `overflow=false`, 대화상자는 뷰포트 안(폰 x=0 폭=뷰포트, 768 480폭 중앙) | regression-layout.json · R-*.png |
| 삼각형 표시 | pass | 고친·제안 칸 `td[class*=dirtyCell]`만 `background-image: linear-gradient(135deg, #0e7a66 6px, transparent 6px)`, `box-shadow none`·`border 0`·면 색 없음. 기본 목록 13칸·`state=all` 5칸 모두 **공개 열(index 5) 안**(다른 열 0), 삼각형 아닌 모양 0, 다른 칸의 초록 그림자 0 | TRI.json · TRI-columns.json · TRI-editing.png · TRI-edited.png |
| 초록 박스 편집 테두리 없음 | pass(참고 1건) | 편집 중·편집 뒤 칸의 `box-shadow none`. 단 **포커스된 편집 칸에 2px 실선 outline `rgb(0,84,70)`(진한 초록)과 흰 면**이 있다 — 07 amendment 11 「2px 강조 포커스 칸」 설계(Table.module.css, bfe9998)로 보이며 저장 안 한 표시와는 별개 | TRI.json |
| 다시 돌린 이전 pass 항목 | 번호 | #7(1023·768·375·320: 파일 입력 0·업로드 영역 숨김·결과 행 0·tbody 안 입력 0·넘침 0, pass) · #8(열 8/5/3개 유지, pass) · #9·#10(삼각형·저장 `공개 범위 저장 1`→Ctrl+S 후 dirty 0·`state=published`에 `[테스트]06.4팀 공개`, pass) · #14(음수 줄 공개 셀 `—`, 잠긴 줄 50/50 `aria-disabled`, pass) · #17(필터 결과 0건이면 `파일 받기` `aria-disabled=true`+`조건에 맞는 증빙이 없습니다`, CSV 헤더 `날짜,거래처·가맹점,공급가,세액,합계,공개,상태`, 긴 숫자 0, pass) · #23·#27·#29·#40·#46(패널 폰 시트 폭=뷰포트 pass) · #39(대리 등록 패널 읽기 항목·`카드 사용 등록` 버튼 보임 pass) · #24(고르기 대화상자 열림·20줄 상한, pass) | regression-items.json · regression-csv0.json |

## 3. #59 260907 시안 구조 비교 (육안 판정 없음)

260907 기준(실제 옛 저장소는 이 컨테이너에 없어 notes에 인용된 file:line만 쓴다 — prep-260907.md 출처 한계와 같음):
- 옛 화면: `ERP_PLANT8_260907/app/src/pages/Receipts.tsx:144-1101`(탭 5개·숫자띠·일괄 등록·내려받기, 인용: /mnt/project-files/notes/260907-screen-compare/REPORT.md:209), 옛 /receipts→`?tab=incoming`(screens.md:22), 열·행동 `receipts.ts:3898 4419-4583`(prep-260907.md #6·#10).
- 시안(「260907 시안」): /mnt/project-files/notes/260907-screen-compare/proposal/evidence.html, 항목표 feature-map.md:275-293(16항목), 결정 REPORT.md:208-221, compare/index.md:10.

| 구조 | 시안 1280 | 스테이징 1280 | 시안 375 | 스테이징 375 | 판정 |
|---|---|---|---|---|---|
| 열 | 날짜·거래처·가맹점·공급가·세액·합계·공개·상태·행동(8) | 같음(8) | 거래처·가맹점·합계(2) | 거래처·가맹점·합계·**상태**(3) | 1280 같음 / 375 다름(상태 열 추가) |
| 거르개 | 상태·종류·기간 select | 같음 | `거르개 2`(접힘) + `더보기` | select 3개 그대로 노출 | 375 다름 |
| 종류 선택지 | …·카드·**개인카드 전표** | 전체·세금계산서·계산서·현금영수증·카드(개인카드 전표 없음) | — | 같음 | 다름(#13 재현 불가와 같은 뿌리) |
| 기간 선택지 순서 | 전체·이번 달·지난달 | 이번 달·지난달·전체 | — | 같음 | 다름(순서) |
| 주 버튼·보조 | `파일 고르기 Ctrl+U`(주) · `내려받기` · `공개 범위 저장 N Ctrl+S` | `파일 고르기 Ctrl+U` · **`파일 받기`** · `공개 범위 저장 N Ctrl+S` | 업로드·내려받기·저장 없음(보기 전용) | 같음(업로드 없음) | 1280 같음(이름만 `내려받기`↔`파일 받기`) / 375 같음 |
| 행 행동 | 붙이기·보관·떼기·대리 등록 | 붙이기·보관·대리 등록(+붙은 문서 링크 `26T-K…`); `떼기`는 목록에 없음(작성 중 문서는 작성자 전용) | 없음(행 시트) | 행 행동 열 없음 | 떼기 다름(설계 06.1 UI-SPEC S7) |
| 합계 줄 | `합계 5줄 …` | `합계 206줄 · 공급가 … · 세액 … · 합계 …`(768·1280), 375/320은 `합계 {금액}`만 | `합계 5줄 2,918,500` | `합계 10,491,888`(줄 수 없음) | 폰 합계에 줄 수 없음 |
| 파일 결과 행 | 시안에 샘플 2행 | 업로드 전 없음(업로드하면 `파일명 · 서식 ⏎ 조각`) | — | 폰 없음(1024 미만 보기 전용) | 같음(설계) |
| 단축키 힌트 줄 | 있음 | `Tab ↑↓←→ · 복사 Ctrl+C · 붙여넣기 Ctrl+V · 취소 Esc · 파일 Ctrl+U · 붙이기 Ctrl+E` (1280) | — | 없음 | 같음 |
| 넘침 | 시안 375·1280 넘침 0 | 4폭 모두 0 | | | 같음 |

캡처 4폭: S-evidence-1280/768/375/320.png(기본 목록), S-evidence-all-*.png(전체). 구조 JSON: staging-evidence-structure.json, prop-evidence.json. 차이 4건(375 거르개 접힘·375 상태 열·종류 `개인카드 전표` 선택지·`내려받기` 이름/기간 순서)은 사람 판정 거리다 — 의도한 변경인지 DECISIONS.md/UI-SPEC에서 확인하지 못했다(확인 못 함).

## 4. 새 결함·관찰 (고치지 않음)

| 심각도 | 내용 | 재현 |
|---|---|---|
| 낮음 | #60 폰 증빙 목록 행이 3~4줄(07에서 미해결 → 07.1-18에서 처리: .planning/phases/07.1-carryover-followup/07.1-18-PLAN.md:146·:168) | 375/320에서 `/expenses/evidence?state=all` — 상태 칸 문구(`확인 필요 … · 원거래 확인`, `카드 미등록 … · 카드 등록은 관리자`)가 좁은 열에서 줄바꿈 |
| 낮음(관찰) | #29 붙인 뒤 제출 1차 활성까지 약 0.6초(표 등장 1015ms → 활성 1585ms), 붙이는 순간(0s)은 비활성이다. 서버 미리보기 왕복 시간이라 결함 아님으로 보임 | `/expenses/{임시 문서}` 증빙 고르기→Enter |
| 낮음(관찰) | 포커스된 편집 칸에 2px 진한 초록 outline + 흰 면(`rgb(0,84,70)`)이 남아 있다. 「초록 박스 편집 표시를 없앴다」는 #296 의도와 다르게 보일 수 있으나 amendment 11 설계상 포커스 표시 | `?state=unpublished&period=all&type=invoice` 공개 칸 Enter→선택 |
| 낮음 | #49 확인 필요 풀기 이력 한 줄 없음(이월 07 유지) | 패널 이력 |
| 참고 | 증빙 목록 공개 카드 줄 20건은 카드 소지자 `[테스트] 06.1 PM-A`가 09-15 시점 소속이 없어 대리 등록 불가(`소속 없음 · 소속 발령은 관리자`) — 테스트 데이터 상태 | `/cards?new=1&evidence={09-15 줄}` |

## 5. 이번에 만든 데이터 ([테스트] 접두, 삭제한 것 없음, 공용 설정 변경 0)

- 계정: `[테스트] 재검증 PM1027`(기획 PM·기획1팀, t1027-pm@example.com), `[테스트] 재검증 PM1027-B`(기획 PM·[테스트]06.4팀, t1027-pmb@example.com). 기존 `[테스트]06.4 사원C`(팀장) 비밀번호 초기화(그 계정의 임시 비밀번호가 바뀜 — 06.4 시험 잔여 계정).
- 거래처 `[테스트] 재검증공급사1027`(협력사·계좌 포함). 홈택스 이름 다름 시험은 기존 `[테스트]공급사가`(123-45-67891) 사용, 새 거래처 생성 없음.
- 지출결의(모두 [테스트]): `[테스트] 재검증 29 A/B/C`(임시, 29 C=7a0ebad8…에서 붙임·뗌 반복), `재검증 29 현금`·`재검증 22 현금`(임시), `[테스트] 재검증 27 팀장`(T26-0016, 제출 뒤 회수).
- 카드 사용: `26T-K0009`(10-22, 44,000, 롯데 2222) — 증빙 대리 등록 저장 2건(`[테스트]확정1`→, `[테스트]확정2`→ 각 K000x) 포함, 롯데 픽스처 대사로 K0009에 증빙 붙음.
- 증빙: 픽스처 롯데 2줄(`[테스트]재검1027-대사`·`-짝없음`), 홈택스 1줄; `[테스트]면세사다`(계산서) 공개 범위를 `[테스트]06.4팀 공개`로 저장 → 27 문서에 붙음; 확인 필요 3줄 풀기.
- 로그인 비밀번호·임시 비밀번호는 파일 `pw-*.txt`(scratchpad)에만 있고 이 폴더에는 없다.

## 6. 하지 않은 것 · 확인 못 한 것

- 실물 카드·홈택스 파일을 **스테이징에 올리지 않았다**: 실제 상호·사업자번호가 든 파일을 올리면 공용 스테이징에 실제 거래처가 자동 생성되고 삭제 UI가 없어 되돌릴 수 없으며, 작업 규칙(「[테스트] 접두 데이터만」)과 부딪친다. 대신 실물 6종은 로컬 단위 시험으로 파서에 통과시켰다(6/6). 스테이징 실물 업로드가 필요하면 지시 바람.
- #36 승인번호 1단계, #45 되살림·고객→둘 다, 현금영수증 취소·비씨 취소·롯데 면세: 확인 못 함(위 표).
- #22·#53: 공용 설정 변경 필요 → 하지 않음.
- 사진·PDF 올리기(05 업로드)는 샌드박스에서 GCS PUT 불가로 측정 못 함(이 경로를 쓰는 #52/#54 재측정 안 함).
- #59 시안의 의도(375 접힘 거르개·상태 열 등)와 옛 코드 file:line 직접 열람은 못 함(옛 저장소 없음).
