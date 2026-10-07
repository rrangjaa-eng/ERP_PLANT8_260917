# 06-18 발행 요청 표 (S16) — 점검표
화면: app/(app)/projects/[id]/issue-request-table.tsx, app/(app)/projects/[id]/issue-request-word.ts, app/(app)/projects/[id]/revenue-section.tsx, app/(app)/projects/[id]/quote-table.tsx, app/(app)/projects/[id]/page.tsx, app/(app)/projects/[id]/project-detail.module.css, ui/table/Table.tsx
기준: BRIEF.md · frontend.md 화면 사용성 원칙 · CHECKLIST.md §1 · SYSTEM.md §7-3 편집 표 · §7-5 상태 태그 · 06-UI-SPEC S16 · 「Empty — 상세 「발행 요청」 표(S16)」 · 「표시 — 발행 요청 표(S16)」

## 원칙
- [x] 안내 문구: 화면의 모든 설명문을 셌다. 남긴 것은 오류·되돌릴 수 없는 일·잠김뿐이고 명사형 한 줄이다 — 근거: 새 글자는 UI-SPEC 문구뿐 — 소제목 `발행 요청`, 빈 화면 `발행 요청이 없습니다`(+ `요청은 담당 PM {이름}`), 상태 2행 `발행 줄 입력 중` · `발행 {MM-DD} · {금액}`, 부가세 · 합계 2행. 설명문 · 도움말 없음. 새로 정한 글자 둘(`발행 줄 빼기` · 저장 거부 한 줄)은 SUMMARY 「사용자 질문 후보」
- [x] 결정 최소: 알 수 있는 값은 기본값으로 채웠고, 시스템이 계산할 것을 묻지 않는다 — 근거: 희망 발행일 기본 오늘(`newIssueRequestDraft`), `발행 줄로`가 발행일 · 발행액 · 메모를 요청에서 채운다, 부가세 · 합계는 서버 `computeVat` 값만 그린다(화면은 금액을 셈하지 않는다)
- [x] 할 수 없는 선택지는 숨기거나 비활성화했다 — 근거: 쓰기 권한 없음 · 수주중/진행/정산 밖 · 1024 미만이면 `발행 요청 추가` · 편집 칸 렌더 안 함, `발행 줄로`는 매출 기록 권한자 + `신청됨` 줄에만(권한 없는 1차 · 3차는 렌더하지 않는다 — UI-SPEC 권한·노출), 발행됨 · 취소 줄은 읽기
- [x] 주 버튼 하나: 이 화면의 다음 행동이 주 버튼 하나로 보인다 — 근거: 1차는 상세의 `일괄 저장 Ctrl+S N` 그대로(새 1차 없음 — D-610), 표 안은 3차 `발행 요청 추가` · `발행 줄로`뿐
- [x] 위험한 동작(삭제 등)은 떨어뜨려 두고 위험 색이다 — 근거: 이 플랜에 삭제 · 취소 동작 없음(`발행 요청 취소`는 06-21). 되돌리기는 저장 전 연결만 푸는 3차 `발행 줄 빼기`
- [x] 같은 말을 두 번 하지 않는다(라벨과 칸 안 글자, 태그와 줄 등) — 근거: 상태 열은 낱말 하나 + 2행(`발행 MM-DD · 금액`, 낱말 반복 없음), 금액 열 2행은 부가세 · 합계만
- [x] 빈 화면은 설명보다 첫 행동 버튼이 먼저다 — 근거: 쓰기 PM 빈 표 = `발행 요청이 없습니다` + 3차 `발행 요청 추가`(Table `emptyAction`), 그 밖의 사람은 담당 PM 이름 한 줄
- [x] 키보드만으로 끝난다(표는 엑셀 키 구성) — 근거: 칸은 Tab으로 이동하는 입력 칸(발행 줄 표와 같은 방식), 표 안 Ctrl+S = 일괄 저장(`keyboard.onSave`), `발행 줄로` 뒤 그 발행일 칸에 자동 포커스(E2E `toBeFocused`)
- [x] 같은 종류의 행동은 같은 모양이다(링크·버튼 섞지 않음) — 근거: 표 안 행동은 전부 3차 `Button`(발행 줄 표의 `발행 줄 추가`와 같은 컴포넌트)

## 사용자 결정(§1)
- [x] §1의 결정을 하나도 어기지 않았다(웜톤 · 견적 엑셀식 · 옆 패널 · 스킨 A …) — 근거: 표 안 입력(모달 · 옆 패널 없음), 같은 상세 화면 섹션 안, 스킨 무변경, 상태는 `StatusTag` text 변형(⑤ 상태 배지 고정)

## 시스템
- [x] 새 색·서체·radius·그림자를 만들지 않았다(tokens.css 변수만) — 근거: `project-detail.module.css`에 클래스 넷(`.tableSubheading` · `.requestMemo` · `.requestStatus` · `.requestStatusNote`)만 더했고 `--text-muted` · `--text-aux` · `--fw-medium` · `--fw-regular` · `--s-2` · `--s-4`만 쓴다. `docs/design/tokens.css` diff 0
- [x] 폰 320에서 가로 넘침 없음 · 터치 44px — 근거: 폰(<700)은 `Table`의 P1/P2 접기를 그대로 탄다(날짜 · 금액 · 상태 P1, 메모 P2). 메모는 두 줄 말줄임 + `max-width: 40ch`. 별도 에이전트 CI=true DOM 감사(backstop: overflow · long-text · zero-one-many)가 판정(SUMMARY 「화면 감사 대상」)
- [x] 실제 앱 화면(PC 1280 · 폰 390)을 찍어 보고 확인했다 — 스크린샷 경로: 육안 판정 금지(CLAUDE.md §6) — CI=true E2E `test/e2e/issue-requests.spec.ts`가 DOM으로 단언(포커스 · 토큰 색), 캡처는 `/design-review` 묶음(오케스트레이터)

## 검토 반영 (D-1 · D-2, 2026-10-07 — 위 항목을 이 변경 기준으로 다시 확인)
- [x] 안내 문구 · 같은 말 두 번 없음 — 근거: 새 글자 하나(금액 거부 한 줄 `0원 초과 · 금액 입력`, 기존 `… · 새로 고침` 명사형 한 줄 꼴). 폰 접힌 줄 메모는 문구 추가 없이 PC와 같은 두 줄 말줄임 + title
- [x] 새 색 · 서체 · radius 없음 · 폰 320 가로 넘침 없음 — 근거: 기존 `.requestMemo`(`max-width: 40ch` · line-clamp 2)를 접힌 줄에도 쓴다(CSS 변경 0). E2E가 375 · 320에서 clamp 2 · 높이 ≤ 줄높이 × 2 · 문서 가로 넘침 0을 DOM으로 단언
- [x] 키보드 · 포커스 — 근거: 요청 줄 저장 거부 뒤 첫 오류 칸으로 포커스(발행 줄 거부와 같은 `firstIssueSignal`). 편집 칸이 없는 오류 칸(상태)은 `ui/table/Table.tsx`가 `tabIndex=-1`을 줘 프로그램 포커스를 받는다(Tab 순서에는 안 낀다). E2E가 activeElement의 칸 `aria-describedby` 글자를 단언
