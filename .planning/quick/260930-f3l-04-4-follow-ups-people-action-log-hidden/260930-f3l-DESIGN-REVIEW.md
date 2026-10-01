# /design-review — PR #108 (quick 260930-f3l)

- 날짜: 2026-09-30 · 감사자: 독립 에이전트(실행자·DOM 감사자·QA와 다름), 보고만 하고 고치지 않음
- 분류: **OPERATE** (관리자·업무 앱 화면 — 원장 표·필터 줄·dl·토스트)
- 방법: `pnpm db:reset:test` → `CI=true` 프로덕션 빌드(`pnpm build && pnpm start`, erp_test) 위에서 임시 Playwright 스펙(`test/e2e/zz-design-f3l.spec.ts`, 삭제함)으로 getComputedStyle · getBoundingClientRect · Range 글리프 상자 · `:focus-visible` 실측. 스크린샷 판정 없음. 폭 1280 · 768 · 375(+ 넘침은 320).
- 기준: CHECKLIST.md §1 · frontend.md 「화면 사용성 원칙」 · SYSTEM.md §2-4 · §3 · §4-4 · §6-1 · §6-8 · §7-1 · §7-3 · §7-6 · §7-7 · §8 · §11 · DECISIONS.md 2026-09-30 두 항목(LOCKED — 지적 대상 아님).
- 앞선 DOM 감사(1005 PASS)·QA(145 PASS)가 이미 잰 것(열 머리글 · colSpan · 행 머리글 · 접힌 줄 구분자 · 밑줄 1→2px hover · 행 높이 ≥ --row-min · 새 탭 속성 · 44×44)은 다시 판정하지 않았다. 이 보고서는 그 둘이 다루지 않은 **디자인 판단**(같은 행동의 같은 모양, 위계, 간격 규칙의 화면 간 일관성, 글자, 문구)에 집중한다.

## 요약

| 구분 | 건수 |
|---|---|
| 이 PR이 만든 결함 | **0** |
| 기존 결함(이 PR이 손댄 화면·규칙과 맞닿음) | high 1 · medium 1 · polish 3 |

- 이 PR의 변경(사람 목록 열 가림 · 잠김 한 줄 · 등록 권한 · 상세/삭제 16px · 행동 로그 사람 칸 · 상태 일시 tabular · 새 탭 · 밑줄 hover · 행 높이)은 SYSTEM.md와 일치한다. 토큰 밖 색 0, 넘침 0(320–1280), 포커스 링 누락 0.
- 발견 5건은 전부 이 PR 이전부터 있던 것이다. 다만 FINDING-001 · 002는 이 PR이 고친 규칙(DR-7 간격, 항목 5 3차 밑줄)이 **한 화면 · 한 구현에만** 적용되어 나머지와 어긋나게 된 자리라 후속 과제로 올릴 것을 권한다(frontend.md 「화면 하나만 예외 금지」).

## 등급 (A에서 시작 · high −1글자 · medium −½글자 · polish는 감점 없음)

| 범주 | 등급 | 근거 |
|---|---|---|
| 시각 위계(화면당 주 버튼 하나) | A | 사람 · 행동 로그 · 상태 · 거래처 · 법인카드 · 코드표 · 보관함의 채운 accent 버튼 0개. /leave 1개(「연차 신청」). 사람 삭제 확인 상태는 1차 「삭제」 1개뿐 |
| 글자(토큰 · 숫자 tabular) | A | 3차 링크 · 버튼 전부 12px/600(`--fs-sm`/`--fw-medium`), 머리글 12px/600 --muted, 본문 14px(폰 15px). 날짜 칸(행동 로그 · 보관함) tabular-nums. FINDING-003(polish) |
| 색(토큰만) | A | 실측 색이 전부 토큰 값과 일치: accent rgb(0,84,70) · muted rgb(78,93,89) · fg rgb(11,21,18) · line rgb(207,219,215) · line-strong rgb(0,49,42). 새 색 0 |
| 간격(토큰 단위 · 3차 행동 --s-4) | A | 사람 행 상세↔삭제 16px(1280·768), 폰 세로 16px. 잠김 줄 h1 아래 24px(--s-6). 화면 간 불일치는 일관성에서 셈(FINDING-001) |
| 상호작용 상태(hover · focus-visible · 44px) | A | 사람 등록 · 상세 · 삭제 · 필터 지우기 · 실행 기록 · 토스트 닫기 전부 `:focus-visible` 2px solid rgb(0,84,70) offset 2px. /leave 행 링크는 ::after 행 전체 링(설계대로). 폰 3차 전부 44×44, 확인 줄 1·2차 46×40(§3 40px 예외) |
| 반응형(320–1280 가로 넘침 없음) | A | 모든 대상 화면 scrollWidth = clientWidth(1280 · 768 · 375 · 320), 삭제 확인 상태 포함 |
| 문구(명사형 한 줄 · 설명 없음 · 같은 말 두 번 없음) | A | 새 문구는 「정보 노출표 · 사람 정보 잠김」 하나(LOCKED). FINDING-004(polish, 기존) |
| 일관성(같은 종류의 행동은 같은 모양) | **B−** | FINDING-001(high) · FINDING-002(medium) |

**Design Score: A−** (8범주 평균 3.81/4 — A=4 · A−=3.5 · B=3 · B−=2.5)
**이 PR의 변경만 판정하면: A** (PR이 만든 결함 0)

**AI-slop score: 0 / A** — 그라데이션 · 카드 · 둥근 모서리 · 그림자 · 아이콘 장식 · 이모지 · 가운데 정렬 히어로 · 「~할 수 있습니다」 안내 문장(새로 생긴 것) 모두 0. 잠김 줄은 설명문 대신 「원인 · 대상 잠김」 한 줄이다.

## 발견

### FINDING-001 — high (기존, 일관성) — 다른 관리자 마스터 표의 행 행동 사이가 0px(사람 목록만 16px)

- 화면 · 폭: /admin/vendors · /admin/corp-cards · /admin/code-tables, 1280 · 768 · 375
- 실측(행 마지막 칸의 행동 사이 가로 간격):
  - 거래처 `수정 · 숨기기 · 삭제` = **0px · 0px**(1280 · 768), 375는 `0px` + 「삭제」 줄바꿈 세로 0px
  - 법인카드 `수정 · 비활성화 · 삭제` = **0px · 0px**(1280 · 768), 375는 세로 0px · 0px
  - 코드표 `비활성화 · 삭제` = **0px**(1280), 768은 세로 3px
  - 사람(이 PR 뒤) `상세 · 삭제` = 16px(1280 · 768), 세로 16px(375)
  - 글자 상자가 맞붙어 PC에서 「수정숨기기삭제」가 한 낱말처럼 읽히고, 위험 행동 「삭제」가 되돌릴 수 있는 옆 행동에 붙어 있다.
- 기준: SYSTEM.md §6-1 「행 안 `승인`↔`반려` 사이 `--s-4` 이상」 · frontend.md 「위험한 동작은 떨어뜨려 둔다」 · 「화면 하나만 예외 금지」 · CHECKLIST.md §2 「같은 종류의 행동은 같은 모양이다」. 이 PR의 DR-7이 사람 목록에만 이 규칙을 적용했다(SUMMARY 「범위 밖 관찰」: 「다른 관리자 표의 동작 칸 … 행동 사이 간격을 재지 않았다」).
- 출처: `app/(app)/admin/vendors/page.tsx:161-174`(칸 안 Fragment, 감싸는 요소 없음) · `app/(app)/admin/corp-cards/page.tsx:188-194` · `app/(app)/admin/code-tables/page.tsx:173-174`. 조직 · 계급 표도 같은 모양이면 같은 결함(이번에 재지 않음).
- 최소 수정: 사람 목록 `.rowActions` 규칙(`app/(app)/admin/people/people.module.css:164-179` — `display: inline-flex; flex-wrap: nowrap; align-items: center; gap: var(--s-4)`, `<700`에서만 `flex-wrap: wrap`)을 각 모듈 CSS에 같은 이름으로 두고, 각 page.tsx의 행동 묶음을 `<span className={styles.rowActions}>`로 감싼다. 한 곳에 두려면 공유 CSS(예: `archive.module.css` — 이미 여섯 마스터가 쓰는 DeleteToArchive의 파일)로 올리는 편이 「화면 하나만 예외 금지」에 맞다. PR #108 범위 밖이면 후속 quick으로.

### FINDING-002 — medium (기존, 일관성 · 상호작용) — 공용 3차 버튼(`ui/button` `.tertiary`)만 밑줄이 `border-bottom`이라, 같은 칸의 3차 링크와 밑줄 자리가 다르다

- 화면 · 폭: /admin/people 행 「상세」(링크) 옆 「삭제」(Button tertiary), /admin/archive 「복원」, 거래처 · 법인카드 · 코드표의 「숨기기」「비활성화」「삭제」 — 1280 · 375
- 실측:
  - 1280 「상세」: `text-decoration: underline 1px`, offset 2px, 글리프 아래 바로. 「삭제」: `text-decoration: none`, `border-bottom: 1px solid rgb(0,84,70)`, 상자 높이 19px(상세 18px) — 밑줄이 상세보다 약 2px 낮다.
  - 1280 「삭제」 hover: border 2px → 상자 19→**20px**, `align-items: center`라 글자가 0.5px 위로 움직인다(상세는 hover에 상자 그대로 18px).
  - **375 「삭제」: 44×44 상자 바닥에 밑줄 — 글자 줄 상자 아래 13.5px**(글자 줄 bottom 303.7, 상자 bottom 317.2). 같은 칸 「상세」는 44×44 상자여도 밑줄이 글자 바로 아래(text-decoration). 375 보관함 「복원」도 12.9px 떠 있다.
- 기준: SYSTEM.md §4-4 「3차 버튼 밑줄 | `text-underline-offset: 2px`, 두께 1px → hover 2px」 · §7-1 3차 「아래 1px 밑줄 · hover 밑줄 2px」. 같은 결함을 `ui/list-empty/ListEmpty.module.css:22-25` 주석이 이미 고쳤다(「border-bottom이면 아래 폰 44px 상자의 바닥에 붙어 글자에서 12px 떠 있었다(/design-review FINDING-005)」). 이 PR의 항목 5 스윕 테스트는 `text-decoration-thickness` 규칙만 보므로 `border-bottom-width`를 쓰는 이 규칙이 빠졌다.
- 출처: `ui/button/Button.module.css:53-65`(`.tertiary` border-bottom · hover border-bottom-width), `:73-82`(폰 44 상자).
- 최소 수정:
  ```css
  .tertiary {
    /* border-bottom: var(--line-w) solid var(--accent);  삭제 */
    text-decoration: underline;
    text-decoration-thickness: var(--line-w);
    text-underline-offset: var(--underline-offset);
  }
  .tertiary:hover:not([aria-disabled="true"]) {
    text-decoration-thickness: var(--line-w-strong); /* border-bottom-width 대신 */
  }
  ```
  `aria-disabled` 3차의 밑줄 색은 지금 `.btn[aria-disabled]`의 `border-color: var(--line)`이 흐리게 만들고 있으니, 바꿀 때 `text-decoration-color`로 같은 흐림을 옮겨야 한다. 공용 컴포넌트라 `test/unit/app/tertiary-underline-css.test.ts`에 `ui/button`을 더하는 것까지 한 묶음.

### FINDING-003 — polish (기존, 글자) — 상태 화면 dl에서 숫자 값의 tabular-nums가 섞여 있다

- 화면 · 폭: /admin/system-status, 전 폭
- 실측: `복원 리허설` 일시 span · 백업 id · `알림 발송` · `이메일` 꼬리 = `tabular-nums`. `DB 커넥션` 「8 / 100」 · `배포 버전`(배포 시각) · `마지막 백업`(종료 시각) = `normal`.
- 기준: SYSTEM.md §2-4 「모든 숫자 칸은 … `tabular-nums`」. 값이 왼쪽 정렬 dl이라 눈에 띄는 차이는 작다(SUMMARY 「범위 밖 관찰」에 이미 있음).
- 출처: `app/(app)/admin/system-status/page.tsx:95-121`
- 최소 수정: 세 값을 `<span className={styles.num}>`로 감싸거나, dl 바깥 `.single-column` 안 dd 전체에 모듈 규칙 하나(`.statusList dd { font-variant-numeric: tabular-nums; }` — 감싸는 클래스가 필요).

### FINDING-004 — polish (기존, 문구) — 행 삭제 확인 줄이 행 머리글의 이름을 다시 쓰고 「-습니다」 설명문 두 개

- 화면 · 폭: /admin/people 긴 이름 행 「삭제」 확인 상태, 1280 · 768 · 375
- 실측: 문구 `{이름} 삭제 · 보관함으로 이동합니다 · 관리자가 복원할 수 있습니다`(12px/400 --muted). 44자 이름 행에서 1280 동작 칸이 412px로 넓어져 이름 칸 364→229px, 행 높이 55→97px. 768 118→160px, 375 124.5→236.5px. 넘침은 없다.
- 기준: §8 규칙 3 · 6(명사형 종결, `-습니다` 금지) · 규칙 5 「안심·사용법 문장(「…할 수 있습니다」)을 두지 않는다」 · CHECKLIST §2 「같은 말을 두 번 하지 않는다」(이름이 같은 행 머리글에 이미 있음). 행 안 확인 줄 모양 자체는 DECISIONS.md 2026-09-24 임시 예외라 지적하지 않는다 — 문구만이다.
- 출처: `app/(app)/admin/archive/delete-to-archive.tsx:50`(일곱 마스터 화면 공유).
- 최소 수정(문구): `보관함으로 이동 · 관리자 복원 가능` 같은 명사형 한 줄로, 이름은 빼기(행 머리글과 `aria-describedby`가 대상을 말함). CSS 아님.

### FINDING-005 — polish (기존, 반응형 · 위계) — 행동 로그 「사람」 select 폭이 가장 긴 이름을 따라가 PC 필터 줄이 두 줄이 된다

- 화면 · 폭: /admin/action-log(관리자), 1280
- 실측: 44자 이름 한 명이 있으면 「사람」 select 502px → 「문서 번호」「정리 포함」이 둘째 줄(필터 폼 높이 126.4px). 같은 폭에서 「사람」 칸이 없는 계급은 한 줄(55.2px).
- 기준: SYSTEM.md §6-1 「필터는 표 위 한 줄」 · §11 실제 데이터(긴 이름). 이 PR의 사람 칸 숨김과는 무관하다.
- 출처: `app/(app)/admin/action-log/action-log.module.css:45-63`(`.selectLabel` max-width 100%만, `.select`에 상한 없음)
- 최소 수정: `.select { max-width: 24ch; text-overflow: ellipsis; }`(선택지 글자는 펼침 목록에서 전부 보인다). 문자 폭 리터럴이 싫다면 `--form-max` 계열 새 토큰은 만들지 말고 `ch` 단위로(§7-3 숫자 열이 이미 `ch`를 쓴다).

## 지적하지 않은 것 (확인했고 문제없음)

- **사람 목록 폰 「상세」「삭제」 세로 쌓기(행 124px)**: 폰에서 `nowrap`으로 바꾸는 실험(페이지에 스타일 주입, 소스 불변)은 375에서 보통 행 124→64px로 줄지만 320에서 긴 이름 행이 155.5→**313px**로 부풀었다. 지금의 폰 wrap + 세로 16px가 긴 데이터에서 더 낫다.
- **잠김 한 줄**(세 항목 꺼짐): 표 0 · 링크 0, h1 아래 24px(--s-6), 15px(폰)/14px, 글자 --muted. ListEmpty 모양 = DECISIONS.md 2026-09-30(LOCKED). §7-3의 「표 위 --fs-sm 잠김 줄」과 모양이 다른 것도 같은 결정의 범위.
- **쓰기 권한 계급 + 세 항목 꺼짐**: 「사람 등록」(오른쪽, 44×44 폰) 아래 12px에 잠김 줄. 그 계급이 실제로 할 수 있는 행동이라 §6-1 자리에 남는 게 맞다. 잠김 줄 자체는 행동이 없다(QA 관찰 1과 같은 판단).
- **person.value 꺼짐 계급의 폰 접힌 줄이 「—」 하나**(현재 소속 —, 28.5px): §7-3 「P2는 접힌 줄」 · 「있는데 값이 없을 때만 —」의 기계적 적용. 두 열뿐이라 접지 않아도 들어가지만, 화면 하나만 예외는 금지라 지적하지 않는다.
- **행동 로그 사람 칸 숨김 뒤 필터 줄**: 남은 칸이 왼쪽부터 빈틈 없이 채워지고(시작일 x=20), 컨트롤 높이 32(PC)/40(폰) 고르고 「정리 포함」 44 상자 바닥이 다른 칸 바닥과 같은 선(233.6). 「필터 지우기」 12px/600 accent 밑줄 1px offset 2px — 다른 3차 링크와 같다.
- **상태 화면 「실행 기록」**: 12px/600 accent 밑줄 1px/2px, 폰 44×44, 포커스 링 정상. 새 탭 표시 아이콘 · 글자 없음은 DECISIONS.md 2026-09-30 + §8 문구 최소로 맞다.
- **3차 링크 모양 일관성(링크 계열)**: 사람 등록 · 상세 · 필터 지우기 · 실행 기록 · 거래처 수정 · 토스트 닫기 모두 12px/600/rgb(0,84,70), `text-underline-offset: 2px`, 1px → hover 2px. 다른 것은 FINDING-002의 Button 구현 하나뿐.
- **/leave 행 링크 14px/400**: 3차 버튼이 아니라 문서 식별 행 링크(행 전체 ::after 덮개)다. 포커스 링은 행 ::after에 2px 안쪽 offset(§4-4 전체 폭 목록 행 예외와 같은 결).
- **토스트**: 2px --line-strong 테두리, 12px, 액션 「닫기」 3차 밑줄(offset 2px), 폰 44×44 · 하단 탭 위. 포커스 링 정상.
- **숫자 · 날짜 칸**: 행동 로그 「발생 시각」 · 보관함 「보관 시각」 tabular-nums.
- **1차 버튼 수**: 목록 화면 0 또는 1, 사람 삭제 확인 상태 1(확인의 「삭제」), /leave 1.
- **넘침**: 대상 화면 전부 320 · 375 · 768 · 1280에서 scrollWidth = clientWidth(삭제 확인 · 긴 이름 · 긴 이메일 포함).
- **새 색 · 서체 · radius**: 실측 색 전부 토큰, 글자 크기 11/12/14/15/18px 토큰 단계만.
- **LOCKED로 다루지 않은 것**: 가린 열을 그리지 않음 · 잠김 한 줄 문구 · 「실행 기록」 새 탭(DECISIONS.md 2026-09-30), 관리자 마스터 행 안 확인 줄(2026-09-24 예외), person.value 꺼짐 목록에서 사람을 구별할 수 없는 것(DR-4 결정의 결과).

## 권장 다음 행동

1. PR #108은 디자인 관점에서 막을 것이 없다(이 PR이 만든 결함 0).
2. FINDING-001(high) · FINDING-002(medium)는 후속 quick 하나로 묶는다 — 둘 다 「이 PR이 한 화면 · 한 구현에만 적용한 규칙을 나머지에 맞추기」다. 공용 `ui/button` 변경이라 `/design-review` + 폰 44 E2E를 함께.
3. FINDING-003 · 004 · 005(polish)는 백로그.
