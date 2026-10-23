# 07-17 독립 DOM 감사 — 사람 목록 `/admin/people` · 사람 상세 `/admin/people/[id]`

- 대상: worktree `/home/user/wt/07-17`, 브랜치 `claude/07-17-people-unlock`, head `188f1fa9`
- 감사자: 실행자가 아닌 독립 에이전트(Opus). 판정은 DOM 실측만 사용했고, 스크린샷을 눈으로 보고 판정하지 않았다.
- 실행 방식: `CI=true pnpm build && pnpm start`(프로덕션 빌드, :3100), DB는 `erp_w0717a_test`(psql로 만들고 `pnpm db:migrate` · `pnpm db:seed`로 채움). 빌드와 측정은 모두 `flock /tmp/claude-0/e2e-3100.lock` 아래에서 돌렸다.
- 측정 스크립트: Playwright(소스 밖 scratchpad) `audit.spec.ts` 11/11, `audit2.spec.ts` 1/1 녹색.
- 원자료: `/home/user/wt/logs/07-17-audit/measure.json` · `measure2.json` · `audit-run-1.log` · `build.log`
- 데이터: 사람 61명 이상(쪽 나눔 확인용). 그 안에 다음을 넣었다.
  - 잠긴 재직자 다수(5자 이름 `남궁민수아`, 긴 이메일 `…marketing-team@plant8-agency.co.kr`).
  - 퇴직+잠김, 퇴직만, 보관+잠김, **보관된 계급 소속 + 잠김**, 정상(첫 로그인 끝 · 임시 아님), 임시 비밀번호 상태.
  - 상한 밖 대상(시스템 관리자) + 위임자 계정(`admin.people` 보기·쓰기만).

## 판정: **통과 (조건부 — P0·P1 없음, P2 1건)**

P2 1건(결과 단계 값의 이름 · `임시 비밀번호` 카피)은 머지 전 수정을 권한다. 나머지는 P3 관찰·문서 항목이다.

## 결함 표

| # | 등급 | 선택자 | 측정값 | 기대값 | file:line |
|---|---|---|---|---|---|
| 1 | **P2** | `dialog[open] [data-ui=confirm-result-value]` | `P tabindex=0`. role · aria-label · aria-labelledby가 모두 없음. 창 글자 전체에 `임시 비밀번호`가 없음(`hasTempPasswordLabel=false`, 4폭 모두). 첫 포커스가 이름 없는 일반 요소에 떨어진다. | UI-SPEC SC-12 카피 목록에 `임시 비밀번호`가 있고, 값 한 줄에 접근 가능한 이름이 있어야 한다. 예: 값에 `aria-label="임시 비밀번호"`, 또는 KvList식 라벨 `임시 비밀번호`. 화면 리더가 포커스만으로 무슨 값인지 알 수 있어야 한다. | `ui/confirm-dialog/ConfirmDialog.tsx:182` |
| 2 | P3 | `tbody tr:has(th[scope=row]) td:last-child` (375 · 320) | 실제형 이름(`김민준`)은 행 높이 129px이고 행동이 2줄이다(`상세 · 잠금 풀기` / `삭제`, 44×44). 2줄 이내라 통과. 다만 같은 쪽에 긴 이름(12~14자)이 있으면 이름 열이 넓어진다. 그러면 잠긴 행의 행동이 **3줄 · 188px**이 된다(행동이 2개인 행은 128px). | 폰 행은 2줄 이내. 데이터에 따라 생기는 일이라 P3로 둔다. 긴 이름이 실제로 쓰이면 `잠금 풀기`가 줄바꿈 없이 `상세`와 한 줄에 서야 한다. | `app/(app)/admin/people/page.tsx:241` (RowActions 폰 wrap — `ui/row-actions/RowActions.module.css:12`) |
| 3 | P3 (문서) | 목록 상태 칸 | 퇴직·잠김만 한 낱말이다. 그 밖에는 `첫 로그인 전 · 임시 비밀번호 사용 중` 두 배지(320에서 2줄)가 그대로다. 상세 `로그인 상태`는 엄격한 한 값(`임시 비밀번호 사용 중`)이다. | UI-SPEC SC-11 문장(「한 값만」 · 4단 우선순위)과 구현이 글자 그대로는 다르다. → 열린 질문 1 판정에 따라 UI-SPEC/DECISIONS 문장을 고친다. | `app/(app)/admin/people/person-status.ts:20-27` |
| 4 | P3 (문서) | 상세 `로그인 상태` | 잠긴 임시 비밀번호 사용자를 풀면 값이 `정상`이 아니라 `임시 비밀번호 사용 중`이 된다(4폭). | 한 값 규칙에 맞는 결과다. must_have 「`정상`으로 바뀌는 것」은 「다음 우선 값으로」로 고치면 된다. | `.planning/…/07-17-PLAN.md` must_haves 4번째 줄 |
| 5 | P3 (절차) | — | 플랜 Task 3 수락 기준은 보고서를 `.planning/phases/07-schedule-notify-audit/audit/07-17-dom-audit.md`에 두라고 한다. 이 보고서는 지시대로 `/mnt/project-files/07-review/`에 있다. | 오케스트레이터가 같은 내용을 플랜 경로로 옮겨야 수락 기준이 선다. | 07-17-PLAN.md Task 3 acceptance |

범위 밖 관찰(이 플랜이 바꾸지 않은 것 — 결함 판정 제외):

- 보관된 사람 상세에도 `연차 조정 추가` · `새 이력 추가`가 렌더된다. 로그인 섹션의 두 행동은 숨는다.
- 등록 패널을 연 320 화면에서 accent 채움 요소가 2개다(머리 `사람 등록` 링크 + 패널 제출 `사람 등록`). 기존 ListScreen + SidePanel 구조에서 온 것이다.
- 결과 단계 모달에서 Tab이 `닫기` 다음 `BODY`를 거친다. 이것은 네이티브 `showModal`이 브라우저 UI를 거쳐 한 바퀴 도는 동작이다. 페이지 컨트롤에는 닿지 않으며, 다음 Tab에 값으로 돌아온다. 확인 단계와 같은 공용 동작이다.

## 측정 요약 (4폭)

| 항목 | 375 | 320 | 768 | 1280 | 판정 |
|---|---|---|---|---|---|
| 가로 넘침(doc scrollWidth − clientWidth · 잘리지 않은 바깥 요소) — 목록 1쪽 · 검색 · 풀기 뒤 · `?locked=1` · 상세 · 확인 · 결과 · 복사 실패 · 등록 패널 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 통과 |
| 가로 스크롤 컨테이너 넘침 | 없음 | 없음 | 없음 | 없음 | 통과 |
| 주 버튼(accent 채움 a/button, 숨은 skip link 제외) — 목록 | 1 `사람 등록` | 1 | 1 | 1 | 통과 |
| 상세 페이지 | 0 (SC-12상 행동은 3차) | 0 | 0 | 0 | 통과(명세대로) |
| 확인 단계 / 결과 단계 | 1 `비밀번호 초기화` / 1 `닫기` | 1/1 | 1/1 | 1/1 | 통과 |
| 토큰 밖 색(color · bg · border · outline) | 0 | 0 | 0 | 0 | 통과 ※ |
| 토큰 밖 서체 · 글자 크기 · radius | 0 · 0 · 0 | 0 · 0 · 0 | 0 · 0 · 0 | 0 · 0 · 0 | 통과 |
| axe(wcag2a/aa · 21aa · best-practice) — main · dialog | — | 0건 | — | 0건 | 통과 |
| 폰 P1 행(실제형 이름) | 이름 · 상태 · 행동 한 행, 행동 2줄, 129px, P2는 접힌 줄 | 같음 | 표 1행 44px | 1줄 | 통과(#2 참고) |
| 검색칸 | 라벨 `검색`, placeholder `이름·이메일`, `form[role=search][aria-label=사람 검색]`, 343×40 | 288×40 | 280×32 | 280×32 | 통과 |

※ 측정에서 처음에는 `rgb(19, 32, 28)`(상속 글자색)이 「토큰 밖」으로 잡혔다. 이 값은 `--text-strong`과 같다(같은 페이지에서 probe로 실측). 이 값을 빼면 0건이다.

### SC-11 목록

| 계약 | 실측 | 판정 |
|---|---|---|
| `잠김` 색 = `--status-danger` | `rgb(155, 28, 28)` = `--status-danger` | 통과 |
| 퇴직 > 잠김 | 퇴직+잠김 행이 `퇴직`이고 `잠금 풀기`가 없다(목록 · 상세 모두) | 통과 |
| 보관됨 | `보관됨`, 행동은 `상세`만 | 통과 |
| 보관된 계급 소속 잠김 | `잠김` + `잠금 풀기`. 상세에서도 두 행동이 있고 이유 줄은 없다 | 통과 |
| 위임자 화면 | 상한 밖(시스템 관리자) 행에는 `잠금 풀기`가 없다. 상한 안 잠긴 행에는 있다. 퇴직+잠김 행에는 없다 | 통과 |
| `잠금 풀기` 요청 중 | `aria-busy="true"` · `aria-disabled="true"`, 글자 `잠금 풀기…처리 중`(요청을 1.5초 지연시킨 상태에서 측정) | 통과 |
| 연타 | Enter를 3번 눌러도 액션 POST는 1회 | 통과 |
| 결과 줄 | `role=status` `잠금 풀기 · {이름}`, 13px(`--text-aux`) · `rgb(82,97,92)`(`--text-muted`), 표 위, 6초 뒤에도 남음, 토스트 0 | 통과 |
| 키보드 | Tab만으로 `잠금 풀기`에 닿음(폰 9회 · PC 14회) → Enter | 통과 |
| 풀기 뒤 포커스 | 같은 행 `상세` 링크(`:focus-visible`, outline 2px `--focus`), 4폭 모두 | 통과(열린 질문 2) |
| `잠김 N` | 1쪽 `잠김 13` → 한 명 풀 때마다 1씩 줄어듦. `?locked=1` 행 수 = N(퇴직 · 보관 제외) | 통과 |
| 50명/쪽 | 1쪽 50행(PC) | 통과 |

### SC-12 상세 · 결과 단계

| 계약 | 실측(4폭 같음) | 판정 |
|---|---|---|
| 로그인 섹션 `region[name=로그인]` | 값 `잠김`(danger), 3차 `잠금 풀기` · `비밀번호 초기화` | 통과 |
| 상세 `잠금 풀기` | Tab → Enter → 값이 바뀌고(#4), 토스트 0, 포커스는 `#person-password-reset` | 통과 |
| 확인 모달 | `aria-labelledby` → `비밀번호 초기화`. 본문 `기존 비밀번호는 쓸 수 없게 됨 · 잠금도 풀림`. 첫 포커스는 1차. 폰은 아래 시트(0,700,375×200) | 통과 |
| 결과 단계 첫 포커스 · 선택 | 값 요소에 포커스, `getSelection()` = 값 전체(12자) | 통과 |
| Tab 순서 | 값 → `복사` → `닫기` → (브라우저 UI) → 값. Shift+Tab은 `닫기` | 통과 |
| Esc ×2 · 바깥 누름 | 창이 열린 채 남고 값도 그대로. 닫기 x 없음 | 통과 |
| `복사` 성공 | 같은 자리 `복사됨`, 클립보드 = 값 | 통과 |
| `복사` 실패(writeText reject) 320 · 375 | `복사 실패 · 직접 선택` `rgb(155,28,28)` 13px. 값이 다시 선택되고 포커스는 값. 넘침 0 | 통과 |
| `닫기`(Enter) | 창이 닫히고 포커스는 `비밀번호 초기화`. 다시 열면 확인 단계부터이고 값 없음. URL에 값 없음 | 통과 |
| aux `닫으면 다시 볼 수 없음` | `--text-aux` 13px · `--text-muted` | 통과 |
| 값 이름 · `임시 비밀번호` 카피 | 없음 | **#1 P2** |
| R15 위임자 → 상한 밖 상세 | `계급 지정 권한 없음 · 시스템 관리자` 1건, main 버튼 0개(연차 조정 추가 · 새 이력 추가 · 잠금 풀기 · 비밀번호 초기화 모두 없음) | 통과 |

### SC-15 (이 플랜 화면)

선택자 `select, input:not([type=checkbox]):not([type=radio]):not([type=hidden])`로 셌다(4폭).

- 등록 패널 6개: `#name` · `#email` · `#effectiveFrom` · `#hireDate`는 TextField, `#roleId` · `#teamId`는 Select.
- 상세 6개: `#person-role-change` · `#adjustBucket`는 Select, `#hireDate` · `#resignationDate` · `#adjustDays` · `#adjustReason`는 TextField.
- `ui/` 밖 요소는 `#people-search` 하나뿐이다. 이 칸은 필터 줄 검색칸으로 플랜이 명시해 제외한 자리다. → **0, 통과**

## 플랜 수락 기준 (grep · 실측)

- Task 1:
  - `unlockPersonAction` 등록 1, `listLockedEmails` 2, `lower(` 2, `role="status"` 1, `toast` 0.
  - `isRetiredOn` export 1 · person-status 호출 1. actions.ts `retire|퇴직` 0.
  - `git diff origin/main...HEAD -- domain/auth domain/permissions db` 0줄.
  - aria-busy는 grep으로는 주석 1건뿐이지만, DOM 실측으로 공용 `RowAction pending`에서 `aria-busy="true"`를 확인했다.
  - → 통과
- Task 2: `listPeoplePage` 2, 도우미 `?q=` 2, `<select` 0/0, leave-section `<input` 0 → 통과
- Task 3:
  - 결과 단계 문구 4종 모두 1 이상. spec `복사됨` 3 · `Escape` 3. registry 1. `TempPasswordResultDto` 0. person-detail-client `toast` 0.
  - DOM 감사 보고서 경로 조건만 #5로 미충족.
- Backstop 세 줄:
  - ① 375 · 320에서 P1이 한 행에 서고, `잠김 N` · 검색칸이 가로 스크롤 없이 접힌다 → 통과.
  - ② 결과 단계 Tab이 모달 안을 돌고(값 → 복사 → 닫기), 닫은 뒤 포커스가 `비밀번호 초기화`로 온다 → 통과.
  - ③ 풀기 뒤 포커스가 같은 행에 있다 → 통과(이름 링크 대신 `상세` — 아래 판단).

## 실행자 열린 질문 판단

1. **SC-11 한 값 규칙 — 실행자 안 (b)를 받아들인다.** UI-SPEC 문장의 목적은 「할 일 없는 빨간 `잠김`을 퇴직자에게 남기지 않는다」이고, 퇴직 > 잠김 한 낱말로 그 목적을 이룬다. 실측도 그렇다. 나머지 두 배지는 이미 정해진 D8-07이라 바꾸지 않는 쪽이 원칙(「사용자가 이미 정한 결정은 바꾸지 않는다」)에 맞는다. 320에서도 상태 칸은 2줄 이내다. 다만 UI-SPEC SC-11 「한 값만」 문장과 must_have를 「퇴직 · 잠김은 한 낱말, 그 밖은 D8-07 두 배지」로 고쳐 문서를 맞춘다(#3).
2. **풀기 뒤 포커스를 같은 행 `상세`로 — 받아들인다.** 목록의 이름은 링크가 아니라 행 머리글 글자라서 플랜이 말한 「이름 링크」는 존재하지 않는다. 사라진 동작 칸 컨트롤의 이웃으로 보내는 것은 SYSTEM 04.2-09 근거(지운 행의 동작 칸 컨트롤이 사라지므로)와 같은 결이다. 4폭 실측에서 `상세`에 `:focus-visible` 링이 보였다. 행이 빠지는 `?locked=1`에서는 결과 줄(`tabindex=-1`)로 간다(E2E :284). 플랜 backstop 문장의 「이름 링크」는 「같은 행 `상세`」로 고친다.
