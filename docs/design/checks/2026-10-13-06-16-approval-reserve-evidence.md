# 06-16 차수 승인 증빙(S21) · 리저브 줄 증빙(S22) — 점검표
화면: app/(app)/projects/[id]/revision-section.tsx, app/(app)/projects/[id]/previous-revision.tsx, app/(app)/expenses/owned-evidence.tsx, app/(app)/expenses/owned-evidence.module.css
기준: BRIEF.md · frontend.md 화면 사용성 원칙 · CHECKLIST.md §1 · SYSTEM.md §7-8(목록 행 삭제 · 첨부 행) · §7-10(파일 행) · 06-UI-SPEC S21 · S22

지금 화면(고치기 전): 상세의 차수 섹션은 승인된 최신 차수 행의 동작 칸이 빈 칸이라 고객 승인 메일 · PDF를 붙일 자리가 없다(메일함 · 공유 폴더에 흩어져 있다). 이전 차수 읽기 섹션(「차수 열기」)은 견적 줄 표뿐이다. 지운 파일은 되돌릴 길이 없다. 리저브 대장 줄에는 세금계산서를 붙일 자리가 없다.

## Task 1 · 2 — S21 차수 승인 증빙(revision-section · previous-revision · owned-evidence)

## 원칙
- [x] 안내 문구: 화면의 모든 설명문을 셌다. 남긴 것은 오류·되돌릴 수 없는 일·잠김뿐이고 명사형 한 줄이다 — 근거: 새 글자는 3차 라벨 `승인 증빙 {N}`, 펼침 제목 `상세 견적 {n}차 승인 증빙` · 부제 `승인 {승인일}`(값), 읽기 · 파일 0의 `승인 증빙 없음 · 올리기는 담당 PM {이름}`(잠김 한 줄), 삭제 결과 줄 `증빙 삭제 · {파일명}`, 실패 `되돌리기 실패 · {원인}` 뿐. 설명문 · 자리 표시 문장 없음, 토스트 없음(grep 0)
- [x] 결정 최소: 알 수 있는 값은 기본값으로 채웠고, 시스템이 계산할 것을 묻지 않는다 — 근거: 승인 직후 3차가 저절로 선다(안내 문구 · 자동 펼침 없음 — DR-12). 올리기 한도 · 쓰기 권리(canAdd · deletableFileIds)는 서버가 정해 주고 화면은 추론하지 않는다. 삭제는 확인 창 없이 되돌리기(결과 줄)
- [x] 할 수 없는 선택지는 숨기거나 비활성화했다 — 근거: quote.amount 없는 사람은 3차 · 블록 · 개수가 DOM에 없다(DTO 키 자체가 투영으로 빠진다). 담당 PM · projects 쓰기가 아니거나 승인 표시가 꺼졌거나 완료 · 보관이면 첨부 영역 · `삭제`가 없고 파일 행만(mode read), 표시 취소 뒤 파일 0이면 3차 자체가 없다
- [x] 주 버튼 하나: 이 화면의 다음 행동이 주 버튼 하나로 보인다 — 근거: 1차 버튼을 더하지 않았다 — 3차 `승인 증빙 {N}` 하나가 승인된 차수 행의 유일한 행동이고, 펼친 안은 05 첨부 영역(올리기 영역 하나)이다
- [x] 위험한 동작(삭제 등)은 떨어뜨려 두고 위험 색이다 — 근거: 파일 행 `삭제`는 05 RowAction danger(맨 끝 · 위험 색) 그대로. 삭제 뒤 `되돌리기`는 일반 행동 링크
- [x] 같은 말을 두 번 하지 않는다 — 근거: 접근 이름 `{n}차 승인 증빙 {N}`은 보이는 글자 `승인 증빙 {N}`을 포함하고 숫자는 한 번만. 부제는 승인일(값)만 쓰고 `승인`이라는 상태 낱말은 차수 표의 상태 열이 말한다
- [x] 빈 화면은 설명보다 첫 행동 버튼이 먼저다 — 근거: 쓰기 권리면 05 첨부 영역(`증빙 올리기`)만 서고 설명 문장 없음. 읽기 권리만이면 담당 PM 이름이 있는 한 줄(잠김 이유), 버튼 없음
- [x] 키보드만으로 끝난다 — 근거: 3차는 button이라 Tab/Enter, 펼치면 포커스가 제목(tabindex -1)으로, 닫으면 그 3차로 돌아간다. 결과 줄 `되돌리기`는 autoFocus. 파일 올리기는 05 첨부 영역의 키보드 경로 그대로
- [x] 같은 종류의 행동은 같은 모양이다(링크·버튼 섞지 않음) — 근거: 3차는 04 `차수 열기`와 같은 tertiary Button + aria-expanded, `되돌리기`는 04.2 공휴일 결과 줄과 같은 RowAction

## 사용자 결정(§1)
- [x] §1의 결정을 하나도 어기지 않았다 — 근거: 모달 · 옆 패널 없이 차수 섹션 안 펼침(목록을 밀어내지 않는다), 확인 창 대신 되돌리기(frontend.md), 웜톤 · 새 색 없음

## 시스템
- [x] 새 색·서체·radius·그림자를 만들지 않았다(tokens.css 변수만) — 근거: `owned-evidence.module.css`는 `--s-2` `--s-3` `--s-4` `--s-6` `--text-aux` `--text-muted` `--status-danger` `--fw-medium` `--line-w` `--border-row`만 쓴다(기존 04 `.section` · `.previousTitle` · `.sectionSubtitle` 규칙과 같은 값). project-detail.module.css 무변경
- [x] 폰 320에서 가로 넘침 없음 · 터치 44px — 근거: 펼침 안은 05 Attachments(이미 320 검증) 그대로, 결과 줄은 flex-wrap + overflow-wrap anywhere. 4폭 DOM 실측은 독립 DOM 감사 몫(SUMMARY 「오케스트레이터 몫」)
- [x] 실제 앱 화면(PC 1280 · 폰 390)을 찍어 보고 확인했다 — 스크린샷 경로: 없음 — 육안 판정 금지(CLAUDE.md §6). `CI=true` E2E(approval-reserve-evidence.spec.ts)로 aria-expanded · 포커스 · 파일 행 · 3차 글자를 DOM 단언했고 4폭 독립 DOM 감사 · Codex 검토는 PR의 `/design-review` 게이트 몫
