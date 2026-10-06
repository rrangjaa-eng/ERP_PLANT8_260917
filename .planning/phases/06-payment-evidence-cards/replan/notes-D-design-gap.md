# 06 계획 대 디자인·옛 시스템 대조 (origin/main 55647a0b, 2026-10-04, 읽기 전용)

06 = `.planning/phases/06-payment-evidence-cards/` (이하 U=06-UI-SPEC.md, C=06-CONTEXT.md, 06-NN=플랜). 06 계획은 79c95e6d(2026-10-01) 무렵, UI-SPEC rev 9는 2026-09-25 기준이다. 그 뒤 main에 54커밋(04.3·04.5·04.6)이 들어와 디자인 시스템이 바뀌었다.

## 0. 근거 규칙 줄 (맨 위)
- CLAUDE.md:23 (SYSTEM.md 없이 화면 만들기·새 색/서체/radius 금지) · :122-124 (§6 frontend.md 정본, UI 완료 = /design-review → /qa) · :128-129 (§7 사용성 원칙)
- .claude/rules/frontend.md:12 (화면 파일 수정 전 design-gate 호출) · :19-23 (안내 문구 최소 / 결정 최소 / 행동은 컴포넌트로)
- .claude/skills/design-gate/CHECKLIST.md:10 (한 건 등록·수정 폼(거래처·사람·**법인카드**·코드표)은 옆 패널) · :30(UQ-4: 아이콘 후보 4 뺌) · :33 (④ 폰 목록 1차 버튼은 필터 아래) · :34 (⑤ 상태 배지 고정) · :35 (⑥ 합계 글자 18→14 굵게)
- docs/DESIGN.md:88-95 (§4 통일: 템플릿에서 시작·새 토큰 금지·기존 컴포넌트 우선·같은 행동 같은 단어·시스템 이탈은 DECISIONS 기록 후 SYSTEM 수정)
- docs/design/SYSTEM.md: :79-118 §1-4 두 단 토큰(옛 이름 삭제) · :161-167 §2-2 글자 크기(title22/subtitle18/body14·폰15/aux13/tag11) · :237-249 §4-1 radius 5단 · :251-264 §4-2 선(2px 강한 선은 화면에서 사라짐) · :935 §7-5 상태 배지 · :987-1010 §7-8 한 건 폼=옆 패널, 모달=확인·「바꾸기」 목록만 · :1147 §7-15 Form(layout page|panel) · :1240 §7-20 ListScreen/DetailScreen/SidePanel/PanelForm · :363 §6-1 목록
- docs/design/DECISIONS.md:1434 (2026-10-02 radius 0·2px선 뒤집음) · :1456 (한 건 폼은 옆 패널, 뒤 `inert`+`--scrim-panel`)
- 04.6 UI-SPEC: `.planning/phases/04.6-a/04.6-UI-SPEC.md` 역할 토큰 절(:~35-60), Typography(:~75-95)

## 1. 디자인·화면 대조

### (a) 없어졌거나 이름이 바뀐 것
- U:194-200 Color: `--bg` `--surface` `--fg` `--muted` `--danger` `--warning` `--success` → tokens.css에 정의 0개. 기준: `--surface-base` `--surface-muted` `--text-strong` `--text-muted` `--status-danger` `--status-warning` `--status-success` (SYSTEM.md:79-118). 같은 옛 이름이 06-13:35, 06-19:37·43, 06-21:40, 06-22:36·40, 06-23:37 등 플랜 must_haves에도 있다(`--danger` `--warning` `--success` `--muted`).
- U:171-175·184 Typography: `--fs-xs/sm/base/lg` → 삭제. 기준 `--text-tag/aux/body/subtitle`(SYSTEM.md:161-167). 라벨·머리글 12px → **13px**(`--text-aux`). 06-13:35·47 `--fs-xs`, 06-UI-SPEC:319 `--fs-sm`.
- U:156·1090 · 06-17:68: `--modal-w` 480 → `--dialog-w`(SYSTEM.md 1-4 크기 행). `--line-w-strong` 계열 없음. `--row-min` 36 → `--row-h` 44(PC·폰 동일).
- U:48·80·152·1023: 「2px 선 섹션 제목」·`--s-6` 위 → 섹션 시작은 1px `--border-row`(SYSTEM.md:251-264, DetailScreen.Section :1240). U:173·1307 「합계 줄 금액 `--fs-lg` 18」 → 합계 글자 14 굵게(CHECKLIST.md:35).
- U:111-139 Component Inventory 「18/19 모듈@257c2ab」 → 현재 `ui/` 27개. 목록에 없는 신규: `ListScreen` `DetailScreen`(+Section) `SidePanel` `PanelForm` `RowActions` `Num` `StaticTable` `TableSkeleton` `status-map.ts`. U:97-109의 「신규 컴포넌트 0」「`ui/` 닫힌 목록 아님」은 성립하지만 화면 틀은 이 틀들을 써야 한다(SYSTEM.md:1240 「화면 파일은 제목·표 면·패널 모양을 직접 그리지 않는다」). U:111 `PageHeader`는 ListScreen/DetailScreen이 감쌌는지 확인 필요(ui/page-header 존속, Phase 4 이후 사용처 변경).
- 06-01(frontmatter:10, :25, :42-54) 「새 파일 `app/(app)/status-display.ts`에 SP-2 낱말→kind 매핑」 → 현재는 `ui/status-tag/status-map.ts` 하나가 닫힌 타입 표(「표에 없는 낱말은 타입 오류」, status-map.ts:1-2)다. 06은 같은 표에 낱말을 더해야 한다. `반려` `증빙 없음` `취소` `결재 중`은 이미 있고(같은 낱말·같은 색 일치), 새 낱말 `지출결의 중` `구매 요청` `지급 완료` `카드 사용` `확인 전` `확인됨` `면제` `선결제` `신청` `구매 완료` `요청` `발행됨`은 없다. `신청`(06, accent)과 04.3 `신청됨`(muted)이 겹치는 인상 — 낱말 충돌 검토. SP-2(U:1014-1020)는 SYSTEM.md §7-5(:935)에 04.3·04.1 보강 줄처럼 옮기는 것으로 바꾼다.
- U:104·746·1152 아이콘: Lucide 인라인(paperclip·external-link) → SYSTEM.md §9(:1272)가 유지, 04.6은 아이콘 후보 4를 뺌(CHECKLIST.md:30). 새 아이콘 없이 기존만이라 문제 없음. `components/icons/` 존재 여부는 미확인(ls 실패) — 06-11·14 착수 시 확인.

### (b) 스킨 A 규칙과 어긋나는 곳
- U:656-733 S9 · U:754-768 S12 · U:769-778 S13 · 06-05:33 · 06-09:32 · 06-12:155·168 · 06-14: 카드 사용 등록·수정·구매 완료, 구매 요청 신청 폼을 「한 열 720 · 라벨 왼쪽 96 · `/cards?new=1` 토글(§6-1)」 **페이지 배치**로 설계. → CHECKLIST.md:10 · SYSTEM.md:987-1010 · DECISIONS.md:1456: 법인카드 한 건 폼은 **옆 패널**(PC 오른쪽 480, 폰 아래 시트, 뒤 inert, 입력 있으면 닫을 때 「입력 버리기」 확인, 등록은 열어 둔 채 칸 비움 UQ-8 B, R9 D). URL 토글(`?new=1` `?editId=`)은 그대로 쓰되 `Form layout="panel"`/`PanelForm`/`SidePanel`로 옮겨야 한다. 영향: U:656-778 전체, 06-05·09·12·14·25의 폼 파일 경로·키 동작(`Ctrl+Enter` 제출 · 행동 줄 아래 고정).
- 같은 폼의 「바꾸기」 목록 S10(U:733, PC 모달 480 · 폰 시트): 모달은 「바꾸기」 목록에 허용(SYSTEM.md:987) — OK. 단 **옆 패널 안에서 모달을 여는 중첩**(패널은 inert 뒤) 규칙이 04.6에 있는지 확인 필요(04.6-UI-SPEC에서 「바꾸기」 언급 :207만 확인) → 06 플랜 전에 design-gate 점검표에서 포커스 복귀 규칙 결정.
- U:404-526 S1 · 06-15·17 「표 위 행동 줄 1차 `지급 완료 N`」 · SP-1(U:999-1013) selectable 표: 현재 `ui/table`에 selectable variant 없음(grep 0). ListScreen `primaryAction`은 필터 줄 오른쪽 끝 1개·폰은 필터 아래(CHECKLIST.md:33, SYSTEM.md:1240). 06-15는 `ui/table/Table.module.css`(04.6에서 217줄 변경)와 `use-grid-keyboard.ts`를 고치도록 되어 있어 04.6 Table에 맞춰 재작성 필요.
- U:473 S1 합계 줄 · 합계 면: `ListScreen.summary`(합계 면) 사용, 글자 14 굵게(CHECKLIST.md:35).
- U:97-109 · 06-UI-SPEC 「`git diff docs/design/tokens.css` 0줄」 검수조건: 토큰 이름이 바뀌었으니 「새 토큰 0개」는 유지하되 옛 이름 사용 0개(`test/unit/design/tokens.test.ts` 「옛 이름 없음」)로 바꿔야 CI가 통과한다. stylelint가 `app/**`에 `--text-body/aux/tag`만 허용(SYSTEM.md:163) — `--fs-*`는 CI 실패.
- U:32-48 「탭 없음」 · SP-4 하위 목록(U:1033-1038): SYSTEM.md에 「하위 목록」 규칙 없음(grep 0). 04.3이 관리 인덱스에 「확인증」 그룹 추가(role-menu.ts:77-130) — 06 하위 목록은 여전히 새 규칙으로 DECISIONS→SYSTEM에 올려야 한다(계획 첫 태스크, 06-01 범위 확인).
- 사용성 원칙(안내 문구 최소): U:~660-700 폼의 서버 계산 한 줄·코드표 설명 `Form.Hint`는 SYSTEM.md:1147 규칙이 허용하나, U:340-372 Copywriting의 설명형 문구는 점검 필요(06-05:396 M-5에서 설명형 일부 삭제함, 이미 대응). 확인 창: U:527(S2 일괄 지급 완료) · U:488(S1 제자리 증빙 확인 모달, SP-7)·U:1045(SP-6) — 되돌릴 수 없는 일이라 허용 논리 있음(U:1049-1058), 04.6 DR1(입력 있을 때만 확인)과 충돌 없음. 06 자체는 CLAUDE.md §7을 이미 인용(U:346·380·683) — 위반은 폼 형태(옆 패널)와 토큰 이름이 주.
- radius: U는 radius 신설 0이라 쓰지만 표 면 8·모달 12·패널 16(5단)이 새 기본(SYSTEM.md:237-249). U의 `<dialog>` 모달 서술에 radius 값이 없어 충돌은 없음(구현이 `ui/confirm-dialog` 사용하므로 자동 적용).

### (c) 04.5 화면 항목 관리 연동
- 04.5(`.planning/phases/04.5-custom-field-admin/04.5-CONTEXT.md` 도입부) 대상은 **거래처 하나**. 프로젝트·견적 줄 대상과 폼 반영은 Phase 10(ADMN-07 REQUIREMENTS.md:112, :260). 06 화면 엔티티(지출결의 증빙·지급, 카드 사용, 구매 요청, 발행 요청)는 `field_definitions` 대상이 아니고 06 문서에 `custom_fields`/화면 항목 언급 0(grep). **연동 필수 없음.** 단 06 화면은 `registerDto`·정보 노출표 항목 키(D-13)를 쓰므로 04.5가 바꾼 `domain/permissions/info-items.ts` 두 출처(코드 상수+field_definitions) 구조와 누수 스캔(`test/integration/leak-scan.test.ts`)에 06 DTO 등록이 맞는지만 확인(06-05:303 T-06-23).
- 부수: 06 화면이 거래처 계좌번호 셀 `AccountNumberCell`(U:136, `app/(app)/admin/vendors/account-number.tsx`) 이관을 말하는데 04.6/04.5가 거래처 화면을 옆 패널로 바꿨다 — 경로·구조 재확인(UA-613).

### (d) 04.3 QR 확인증과 관계
- 04.3(`.planning/phases/04.3-qr-certificate-intake/04.3-CONTEXT.md` 도입부)은 **경품 외부 수령자의 본인정보·서명 확인증**(행사 QR 하나). 지출결의 연결(CERT-03, D-1104)과 경품 세금(CERT-04, D-1105)은 Phase 11. 06 문서에는 확인증·QR 언급 0(grep) — 06은 그 연결 자리를 모른다.
- 겹침점: ① 06 증빙 종류 `other_income`(기타소득)/`business_income`에 대해 증빙 확인·면제·지급 게이트(06-06, U:551-592 S4)가 확인증 자동 첨부(Phase 11)를 증빙으로 인정해야 하는지 — 06이 정하지 않음. Phase 11 계획 때 06 `evidence status` API가 첨부 소유 타입 `certificate`를 받도록 06-06 `attachmentOwnerRights`(06-16:246 유사)에 여지를 둘 것. ② 낱말: 04.3이 status-map에 `접수 중/제출됨/신청됨/접수 전/닫힘/대조 제외`를 이미 넣음 — 06 신규 낱말과 충돌 없으나 `신청`≈`신청됨`. ③ 외부 수령자 화면(`app/c/**`, SYSTEM.md:536 §6-5, `--text-prose` 15)은 06이 쓰지 않음 — 겹침 없음. ④ 관리 인덱스 「확인증」 그룹(role-menu.ts:94·132)은 06 메뉴 키(`cards.*`, `projects.issue-requests`)와 별개. ⑤ 06-UI-SPEC UA-620(U:84)의 원천징수 incomeType은 확인증 세금 제안과 같은 `applyTaxRule`을 쓴다 — Phase 11 CERT-04 때 같은 호출 규칙 공유.

### 디자인 정리: 06 UI-SPEC 재작성 우선순위
1. 폼 3종(S9·S12·S13) → 옆 패널(가장 큼). 2. 토큰·컴포넌트 이름 치환(기계적). 3. status-display.ts → status-map.ts 통합(06-01). 4. SP-1 selectable·SP-4 하위 목록 SYSTEM 승격 + 04.6 Table 위에 재작성(06-15·17). 5. U 머리말 「Phase 4 브랜치판 SYSTEM」 기준 문장(U:20-25) 삭제 — 이제 main이 기준. 새 작업은 `/gsd-ui-phase 6` 재실행 또는 U 개정 + `/plan-design-review` 1회(CLAUDE.md §4 계획 게이트).

## 2. 옛 시스템 대조 (gap-audit.md, 다음 페이즈에 6 포함 · 빠짐/일부/모호)
참고: **ROADMAP·REQUIREMENTS·STATE에 「6.1」 표기가 없다**(grep 0, phases/에 6.1 디렉터리 없음). gap-audit만 「6.1로 결정됨」이라 쓴다 → 6.1 페이즈는 아직 문서화되지 않았다(먼저 ROADMAP 삽입 필요).

| 행 | 260907 규칙 | 지금 06 | 고칠 곳 |
|---|---|---|---|
| 38 일부 | 완료 뒤 사후 처리(구매 「구매 완료」·원천징수) | C:32·42(D-606)는 지급 완료·취소·조정 줄만. 구매 요청 처리가 완료 프로젝트에서 되는지 명시 없음(06-08:84 · 06-14:207-213 구매 완료 게이트는 요청 상태만 검사) | 06-12(구매 완료) must_haves에 「프로젝트 상태 무관 허용/차단」 한 줄 + 통합 테스트. 원천징수는 Phase 11 |
| 52 빠짐(6.1) | 외주 세금계산서: 경영관리가 증빙 공개→기획팀 붙임 | C:36 D-602 PM이 첨부하며 금액 | 6.1 (06 변경 없음, 단 D-602와 충돌 예정 → 6.1 계획이 D-602 개정) |
| 67 일부 | 카드 배정(개인→팀→공용)·카드사 파일이 이김 | C:27: 자기 카드·자기 팀 카드, 경영관리 대리(06-09:32). 공용 카드·파일 우선 없음 | 공용 카드: 06-05의 카드 자격 판정(T-06-21)에 「공용」 갈래 한 줄 또는 Phase 3 후속. 파일 규칙: 6.1 |
| 69·76·77 빠짐(6.1) | 경영관리 등록·공개→기획팀 2차 부착, 공개 범위 3단계 | C:36 PM 첨부만 | 6.1 |
| 79 일부 | 결재 중 증빙 못 뗌, 붙이기는 경영관리만, 결재 중 재계산 없음 | C:53 D-611은 미결 정의뿐. 06-11:트레이서(`확인됨` 문서 PM이 금액 수정→확인 풀림) · 06-16:246 소유권 · 05-09P는 Phase 5 | 06-11에 「결재 중 증빙·금액 변경 허용 여부」 결정 한 줄(사용자 확인 필요: 06 기본 = PM이 확인 전까지 수정) + 6.1과 정합 |
| 80 일부 | 증빙 종류별 파일 형식, 지급 방식↔증빙 종류 짝을 서버가 막음 | C:30·77은 지급 방식 3종 코드표만. 06-03:140·06-04:165 방식별 이체액 이름만. 짝 제약 없음 | 06-02(MAST-05 설정 키 넷) 또는 06-03 지급 게이트에 `payment.method-evidence-mismatch` 규칙 후보 |
| 81 빠짐 | 사업자번호 증빙 → 거래처 자동 생성/복원 | 06 계획에 없음 | 6.1 (06-UI-SPEC의 거래처 연결 없음) |
| 83 빠짐(6.1) | 증빙 일괄 등록·카드사/홈택스 파일 파서·자동 대사 | C:130 백로그 후보 | 6.1 |
| 129 일부 | 음수 허용, 미래 작성일 허용 | 음수는 Phase 4/5. 06 C·U에 미래 작성일 0(grep) — 06이 새로 받는 날짜는 카드 사용일·지급일·발행희망일 | 06-05(카드 사용일)·06-04(지급일) zod에 미래 허용·제한 결정 한 줄(사용자 확인) |
| 159 일부·모호 | 카드 매출 계산서 없이, 수수료=비용 | C:41·121 수수료는 조정 줄(D-83). 카드 매출은 06-19 「매출 미입력」(D-613)이 발행 줄 0이면 막힘 → 계산서 없는 카드 매출 입구 없음 | 06-19 완료 점검(D-613)에 「카드 매출 예외」 여부 결정. 매출 대장 범위 밖(REQ:176)이면 Phase 9 |
| 184 빠짐 | 회사명·로고·직인·회계연도 시작월 | 06 grep 0(06-02 자릿수는 번호 서식 관련) | 인쇄물 만드는 5·6: 06에는 인쇄 없음 → Phase 5 인쇄 템플릿 쪽, 06 변경 없음 |
| 186 빠짐 | 은행별 계좌번호 자릿수 서식 | 06 grep 0. S1·S5가 계좌번호를 표시만(U:136 AccountNumberCell, 뒤 4자리) | 06-04 payment-section 계좌 표시 규칙, 입력 서식은 Phase 3 후속(MAST-01) |
| MF:44 빠짐 | 증빙 붙은 구매요청 취소 → 전표가 주인 없음 복귀·확정 실행가 비움 | C:63 재량으로 남김. 06-14:38·144(O-9 취소는 `신청`에서만)·213 → 구매 완료 건 취소 경로 없음, 따라서 해당 규칙 자체가 발생 안 함 | 사용자 결정 필요: 구매 완료 취소를 허용할지. 허용하면 06-12/14에 취소+연결 해제 |
| DC:13 빠짐(6.1) | 파일은 붙고 증빙 미등록 → 홈 일감 띠 | 경영관리 등록 모델 없음 | 6.1. 06-23(내 차례)에 「증빙 확인 전」 일감은 이미 있음 |

## 3. 사용자 결정이 필요한 후보 (아침 브리핑용)
1. 06 폼 3종을 옆 패널로 재작성할지(규칙상 사실상 필수, 범위 큼) — UI-SPEC 개정 후 plan-design-review 1회.
2. 6.1 페이즈를 ROADMAP에 먼저 삽입(현재 gap-audit에만 존재).
3. 79·80·129·159·MF:44의 기본값(위 표 「사용자 확인」).
