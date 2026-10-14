# 06-22 대표 승인 재점검(O-16) · 정산 결재 문서 막힘 · S18 섹션 마감 — 점검표
화면: app/(app)/projects/[id]/settlement/, app/(app)/leave/[id]/document-actions.tsx, app/(app)/projects/[id]/pre-settle-check.tsx, app/(app)/projects/[id]/quote-table.tsx, app/(app)/projects/[id]/page.tsx, app/(app)/projects/[id]/project-detail.module.css, app/(app)/projects/[id]/loading.tsx
기준: BRIEF.md · frontend.md 화면 사용성 원칙 · CHECKLIST.md §1 · SYSTEM.md §7-1 버튼 위계 · §7-7 다섯 상태 · 06-UI-SPEC.md S18 · Copywriting 「막힘 — 대표 승인(S18, O-16)」 「막힘 — 정산 결재 올리기」

지금 화면(고치기 전, Task 3 — 상세 「완료 전 점검」): 점검 실패면 섹션이 통째로 사라지고(기안 버튼만 막힘), 매출 미입력 행 · `고객 승인 전`에 다음 한 수가 없고, 긴 항목 이름이 PC에서 줄을 늘린다.

지금 화면(고치기 전, Task 1 · 2 — 정산 결재 문서): 정산 결재 문서의 `승인`은 진행 복귀(`진행으로 바뀜 · 반려`) · 결재 중 지출결의(A8)만 막는다 — 기안 뒤 새 미결(반려 · 증빙 없음 · 미매칭 줄 · 매출 미입력)이 생겨도 대표 승인이 살아 있고, 막혀도 다음 한 수가 없다.

## 원칙
- [x] 안내 문구: 화면의 모든 설명문을 셌다. 남긴 것은 오류·되돌릴 수 없는 일·잠김뿐이고 명사형 한 줄이다 — 근거: 더한 글자는 `승인` 막힘 이유 `완료 전 점검 {N}건 · 담당 PM {이름}`(잠김 · 명사형 한 줄) · 계산 실패 `점검 결과 없음 · 다시 시도` 둘뿐이다. 설명 문장 · 부제 없음. Task 2: 강행 결과 줄 `강행 · 미결 지출결의 {N}건`(되돌릴 수 없는 결정의 사실 한 줄 · 기존 `styles.muted`) · 다시 올리기 막힘 `완료 전 점검 {N}건`(머리 줄 06-19와 같은 문자열 `preSettleBlockReason`)
- [x] 결정 최소: 알 수 있는 값은 기본값으로 채웠고, 시스템이 계산할 것을 묻지 않는다 — 근거: 막힘 건수 · 이유 · 순서(진행 복귀 > A8 > 점검)는 서버 훅(`settlementApproveBlockedReason`)이 계산하고 화면은 문자열만 싣는다. 사용자 입력 칸 없음
- [x] 할 수 없는 선택지는 숨기거나 비활성화했다 — 근거: 막히면 `승인`이 aria-disabled + 이유(Button `disabledReason` · `reasonTone="block"`), 2차 `반려`는 결재 모듈 규칙대로 산다(E2E 「대표 승인 막힘 — 점검 보기」가 `반려` aria-disabled 아님을 단언). 다시 올리기도 막히면 `정산 결재 다시 올리기` aria-disabled + 이유 + 3차(E2E 「다시 올리기 막힘」), Ctrl+Enter는 막힘이면 무동작(`resubmit()`이 `block`이면 반환)
- [x] 주 버튼 하나: 이 화면의 다음 행동이 주 버튼 하나로 보인다 — 근거: 1차는 `승인` 하나 그대로. `점검 보기`는 이유 옆 3차(§7-1 「이유 + 다음 한 수」)
- [x] 위험한 동작(삭제 등)은 떨어뜨려 두고 위험 색이다 — 근거: 이 변경에 위험 동작 없음. 반려는 기존 04.1 확인 모달 그대로
- [x] 같은 말을 두 번 하지 않는다(라벨과 칸 안 글자, 태그와 줄 등) — 근거: 이유 문자열은 서버 거부와 표시가 한 함수(`preSettleApproveReason`)를 쓰고 화면 한 자리(버튼 이유)에만 선다
- [x] 빈 화면은 설명보다 첫 행동 버튼이 먼저다 — 근거: 해당 없음 — 문서 화면은 빈 상태가 없다(문서가 없으면 404)
- [x] 키보드만으로 끝난다(표는 엑셀 키 구성) — 근거: 막힌 `승인`은 aria-disabled라 탭 순서에 남고(DR-11) 바로 다음 탭이 3차 링크 `점검 보기`(Enter로 상세 `#pre-settle-check` 이동 — 제목 h2 id · tabIndex -1, 06-19). Ctrl+Enter는 막힘이면 무동작(`approve()`가 `approveBlockedReason`이면 반환)
- [x] 같은 종류의 행동은 같은 모양이다(링크·버튼 섞지 않음) — 근거: 다른 화면으로 가는 `점검 보기`는 링크 3차(`buttonStyles.btn` · `tertiary` — 같은 화면의 `프로젝트` 링크 선례), 같은 화면 안 이동(머리 줄 `점검 보기`)은 06-19 버튼 3차 그대로

- [x] (Task 3) 상세 「완료 전 점검」 — 근거: 오류는 섹션 자리 `점검 불러오지 못함` + 2차 `다시 시도`(카드 사용 섹션 선례 `ListEmpty tone="error"`) · 매출 3차는 권한별 하나(PS-3 — 매출 기록 → `발행 줄 추가`, 발행 요청만 → `발행 요청 추가`, 1024 미만은 없음 · 비활성 아님) · `{n}차 고객 승인 전`은 트리거가 있을 때만 3차(누르면 `고객 승인 표시`로 포커스) · 쓰기 없음은 `담당 PM {이름}`(버튼 0) · 새 설명문 없음. E2E 「섹션 마감」 7건이 DOM으로 단언
- [x] (Task 3) 검토 D-4 `거래처 없음 · 거래처 고르기` — 근거: 정산의 기존 줄은 거래처 칸이 잠김(`domain/quotes/edit-scope.ts` — 정산은 실행가만 edit)이라 견적 줄 표 문에도 `거래처 고르기`가 없다. 갈 칸 없는 3차는 세우지 않고 `거래처 없음`만 둔다(할 수 없는 선택지는 숨김). 규칙을 바꿀지는 오케스트레이터 결정(SUMMARY 「갈림」)

## 사용자 결정(§1)
- [x] §1의 결정을 하나도 어기지 않았다(웜톤 · 견적 엑셀식 · 옆 패널 · 스킨 A …) — 근거: 새 바탕 · 패널 · 모달 없음. 04.1 행동 줄(`DocumentActions`)에 종류 중립 선택 prop `approveNextStep` 하나만 더했다 — 넘기지 않는 연차 · 지출결의 문서 화면은 그대로

## 시스템
- [x] 새 색·서체·radius·그림자를 만들지 않았다(tokens.css 변수만) — 근거: Task 1 · 2 새 CSS 없음. Task 3은 `project-detail.module.css`에 말줄임(`.preSettleItem` — ≥700 한 줄 · `max-width: 40ch` · 매출 메모 `.noteText` 선례)과 `display: contents` 묶음(`.layoutContents`)만 — 색 · 간격 값 없음, 옛 토큰 0(acceptance grep). 3차 링크는 기존 `ui/button/Button.module.css`의 `btn` · `tertiary` 클래스, 이유 색은 Button의 `reasonTone="block"`(`--status-danger`)
- [x] 폰 320에서 가로 넘침 없음 · 터치 44px — 근거: 이유 + 3차는 Button의 `reasonLine` 묶음이라 좁은 폭에서 버튼 아래 줄로 함께 내려간다(06-19 실측 — 머리 줄 같은 컴포넌트). 폭별 실측은 오케스트레이터의 독립 DOM 감사(CI=true · 320/375) 몫
- [x] 실제 앱 화면(PC 1280 · 폰 390)을 찍어 보고 확인했다 — 스크린샷 경로: 실행자(서브에이전트)는 스크린샷 육안 판정을 하지 않는다(CLAUDE.md §6). CI=true E2E `test/e2e/pre-settle-check.spec.ts`가 실제 앱 DOM으로 `승인` aria-disabled · 이유 글자 · `점검 보기` href · `반려` 활성을 단언하고, 폭별 실측은 오케스트레이터의 독립 DOM 감사 · `/design-review`가 한다

## 검토 반영(06-22 독립 DOM 감사 D-1 · D-2 · D-3)
지금 화면(고치기 전): PC 점검 행 항목 이름이 칸 폭이 아니라 고정 `max-width: 40ch`(334px)에서 잘린다(1280 칸 676px인데 42자가 `…`) · 오류 → `다시 시도` 회복 뒤 포커스가 BODY로 사라진다 · 대표 문서 `점검 보기` 느린 응답(1.5초+)에 뼈대 · 진행 표시가 하나도 없다(`/projects/[id]`에 loading.tsx 없음).
- [x] (D-1) 말줄임은 칸 폭에서 — 근거: `.preSettleItem`(≥700)을 `display: grid` · `grid-template-columns: minmax(0, max-content)`로, 글자는 안쪽 `.preSettleItemText`(nowrap · ellipsis)로 옮겼다. 트랙 최소 0 · 최대 글자 폭이라 표에 자리가 있으면 이름 전체, 좁으면 칸까지 줄어 말줄임. 고정 `40ch` 없음 · 색 · 간격 값 없음(레이아웃 값만). title은 바깥 span 그대로. 폰(<700)은 두 span 다 인라인이라 줄바꿈 그대로(SYSTEM §7-3). E2E 「긴 항목(42자)」이 1280 sw ≤ cw · 768 cw ≥ min(sw, 칸 폭) − 1 · 섹션 넘침 0 · title 전체를 DOM으로 단언(수정 전 sw 470 > cw 334로 실패 확인)
- [x] (D-2) 오류 회복 뒤 포커스 — 근거: 오류 갈래를 별도 컴포넌트(`PreSettleCheckError`)에서 `PreSettleCheckSection`의 `check` null 갈래로 합쳤다 — 오류 · 정상이 같은 컴포넌트의 같은 `DetailScreen.Section`이라 refresh 뒤에도 제목 h2 노드가 이어진다. 2차 `다시 시도`는 refresh 전에 제목(`#pre-settle-check`, tabIndex −1 — 06-19 `점검 보기` 자리)으로 포커스를 옮긴다. E2E 「점검 실패」가 원인을 고친 뒤 `다시 시도` → 섹션 회복 · 제목 toBeFocused를 단언(수정 전 inactive로 실패 확인)
- [x] (D-3) 느린 이동 백스톱 — 근거: `app/(app)/projects/[id]/loading.tsx` 신설. §7-7 「라우트 loading.tsx는 화면 제목 + TableSkeleton만」 · `certs/events/[id]/loading.tsx` 선례 그대로(제목은 아직 모르므로 `" "` · `aria-hidden` · 견적 줄 표의 P1 열 이름 항목 · 실행가 · 상태 + 편집 표 합계 줄 뼈대). 새 CSS · 토큰 없음(공용 `TableSkeleton`의 300ms 지연 표시 · 반짝임 없음). 열을 P1 셋으로 한 것은 폰 320에서 11열 머리글이 넘치지 않게(실제 표도 폰은 P1만). E2E 「대표 승인 막힘」이 상세 RSC 2.5초 지연에서 `table-skeleton` opacity 1(2초 안) · 도착 뒤 점검 행을 단언(수정 전 요소 없음으로 실패 확인). 상세를 여는 다른 스펙(project-lifecycle · period · members · copy · settlement-approval · 폰 CLS · 폰 정산 · 폰 사람) 85건 CI=true 통과
