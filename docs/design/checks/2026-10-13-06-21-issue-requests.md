# 06-21 발행 요청 취소(S16) · 발행 요청 목록(S17) — 점검표
화면: app/(app)/projects/[id]/issue-request-table.tsx, app/(app)/projects/[id]/quote-table.tsx, ui/table/Table.tsx, app/(app)/projects/issue-requests/page.tsx, app/(app)/projects/issue-requests/issue-request-list.tsx, app/(app)/projects/issue-requests/loading.tsx, app/(app)/projects/issue-requests/error.tsx, app/(app)/projects/issue-requests/issue-requests.module.css
기준: BRIEF.md · frontend.md 화면 사용성 원칙 · CHECKLIST.md §1 · SYSTEM.md §7-3 편집 표 · §7-17 확인 모달 · §7-7 LOADING · §7-16 페이지 · 06-UI-SPEC S16 · S17 · Copywriting 「Destructive — 발행 요청 취소(S16)」 · 「Empty — 발행 요청 목록(S17)」 · 「Error — 목록 로드」

## 원칙
- [x] 안내 문구: 화면의 모든 설명문을 셌다. 남긴 것은 오류·되돌릴 수 없는 일·잠김뿐이고 명사형 한 줄이다 — 근거: S16 새 글자는 UI-SPEC 문구뿐 — 모달 제목 `발행 요청 취소` · 부제 `희망 {YYYY-MM-DD} · {금액}` · 결과 줄 `경영관리 목록에서 빠짐` · 1차 `발행 요청 취소` · 2차 `닫기 Esc`(ConfirmDialog가 1차 라벨에서 파생). 서버 거부 글자는 06-18 재사용(새 글자 0). S17은 부제 없음(`grep -c subtitle page.tsx` 0) · 설명문 0 — 빈 화면 `처리할 발행 요청이 없습니다`, 오류 `발행 요청 목록 불러오지 못함`(명사형, error-copy-noun-style 단위 통과), 필터 0건 `조건에 맞는 발행 요청이 없습니다`(카드 사용 · 지급 대상 필터 0건 문구와 같은 꼴)
- [x] 결정 최소: 알 수 있는 값은 기본값으로 채웠고, 시스템이 계산할 것을 묻지 않는다 — 근거: 취소는 확인 한 번, 사유 칸 없음. S17 기본 보기 = `신청됨`(처리할 것), 그룹 · 합계 · 부가세 합계는 서버(`listIssueRequests` · `issueRequestGroup`)가 정한다
- [x] 할 수 없는 선택지는 숨기거나 비활성화했다 — 근거: S16 Delete는 쓰기 PM · ≥1024 · 저장된 `신청됨` · 미연결 줄만(`canCancelRow`). S17 행 3차는 `projects.revenue` write일 때만 열이 생기고(`canLink`), 1024 미만은 `collapseBelow: 1024`로 숨는다(E2E 900폭 `발행 줄 입력` 0개). 금액 열 · 합계 금액은 발행액을 볼 때만(A-605)
- [x] 주 버튼 하나: 이 화면의 다음 행동이 주 버튼 하나로 보인다 — 근거: S16은 상세 1차 `일괄 저장 Ctrl+S N` 하나. S17은 UI-SPEC대로 1차 없음(`primaryAction` 없음) — 다음 행동은 행 3차 `발행 줄 입력`
- [x] 위험한 동작(삭제 등)은 떨어뜨려 두고 위험 색이다 — 근거: 취소는 화면 버튼이 아니라 Delete 키 → 확인 모달(04 줄 삭제와 같은 흐름). S17에는 위험 동작 없음(읽기 · 링크)
- [x] 같은 말을 두 번 하지 않는다(라벨과 칸 안 글자, 태그와 줄 등) — 근거: 상태는 StatusTag 낱말 하나. S17 금액 2행은 `합계 {금액}`만(부가세 글자 없음 — UI-SPEC 「금액(2행 합계)」). 프로젝트 칸 링크와 행 3차가 같은 주소를 가리키는 것은 식별자형 링크 + 행 행동(S1 번호 링크 선례)이다
- [x] 빈 화면은 설명보다 첫 행동 버튼이 먼저다 — 근거: S17 기본 보기 0건 = `처리할 발행 요청이 없습니다 · 전체 보기`(3차 → `?status=all`, E2E 단언), 필터 0건 = `· 필터 지우기`
- [x] 키보드만으로 끝난다(표는 엑셀 키 구성) — 근거: S16 칸 포커스 → Delete → 모달(Ctrl+Enter / Esc) → Ctrl+S. S17은 상태 select(키보드 선택 → GET 이동) · 행마다 링크(Tab 순서)
- [x] 같은 종류의 행동은 같은 모양이다(링크·버튼 섞지 않음) — 근거: S16은 04 줄 삭제와 같은 ConfirmDialog · Delete. S17 행 3차는 S11 `구매 완료`와 같은 `RowActions`/`RowAction href`, 필터 select는 프로젝트 · 구매 요청 필터와 같은 클래스

## 사용자 결정(§1)
- [x] §1의 결정을 하나도 어기지 않았다(웜톤 · 견적 엑셀식 · 옆 패널 · 스킨 A …) — 근거: 표 안 Delete → 가운데 모달(2026-09-27 결정), S17은 경영관리 전용 화면 없이 프로젝트 메뉴의 하위 목록(O-1 확정 · SP-4) · ListScreen 틀 그대로, 스킨 · 토큰 무변경

## 시스템
- [x] 새 색·서체·radius·그림자를 만들지 않았다(tokens.css 변수만) — 근거: `issue-requests.module.css`는 말줄임 · 폭 · 행 링크 누름 자리만, 색은 `--status-warning`(그룹 머리글 `희망일 지남`) 하나 — 옛 토큰 grep 0. `docs/design/tokens.css` diff 0
- [x] 폰 320에서 가로 넘침 없음 · 터치 44px — 근거: S17 폰은 P1 = 희망 발행일 · 프로젝트 · 금액(프로젝트 칸 9em 말줄임 — 구매 요청 품목 칸 선례), P2 요청자 · 메모 · 상태는 접힌 줄, 행 전체가 링크(phoneRowLink — 누름 자리 = 행). 메모는 `max-width: min(24em, 100%)` 말줄임. 판정은 별도 에이전트 CI=true DOM 감사(SUMMARY 「오케스트레이터 몫」)
- [x] 실제 앱 화면(PC 1280 · 폰 390)을 찍어 보고 확인했다 — 스크린샷 경로: 육안 판정 금지(CLAUDE.md §6) — CI=true E2E가 DOM으로 단언: S16 `발행 요청 취소 — 일괄 저장 때 반영`, S17 1280 그룹 순서 · 경고 색 · 합계 줄 · 행 3차 접근 이름, 900 행동 칸 없음 · 행 누름 → 상세, 375 오류 경계(`mobile-issue-requests-error.spec.ts`). 캡처는 `/design-review` 묶음(오케스트레이터)
