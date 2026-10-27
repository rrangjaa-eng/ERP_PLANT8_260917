# 07.1-18 재계획 디자인 검토 — Fable 판정 R1b (B-R2 · B-R3)

- 저장소 `/home/user/ERP_PLANT8_260917` head 41a5fe2 · 계획 `.planning/phases/07.1-carryover-followup/07.1-18-PLAN.md`(이하 18). 읽기 전용 — 저장소 파일 수정 0.
- 기준: 막음 = 그대로 실행하면 실행 불가이거나 SYSTEM.md · DESIGN.md · CLAUDE.md · frontend.md 위반(파일:줄 근거). 아니면 참고.
- 재현은 **합성 HTML을 Playwright Chromium 153(`/opt/pw-browsers`)으로 320 폭에서 돌린 것**이지 실제 화면 DOM이 아니다(토큰 값 15px · 44 · 12/8 · 16 여백 · 288 표 폭만 옮김). 수치는 글자 길이에 따라 달라지므로 방향(넘침 유무 · 바닥 적용 유무 · 말줄임 유무)만 근거로 쓴다.

## B-R2 — 발행 요청 목록 `합계`의 폰 판독기 경로 (Codex 막음 · Claude 참고) → **참고**

### 사실 확인
1. 18 :146 · :257(다)은 `issue-request-list.tsx` 금액 열 `합계 {금액}`을 `secondaryText`로 옮기고, :196(다)·:255(가)로 폰(<700) 주 행 `.cellSecondary`를 `display: none`(판독 트리에서 빠짐). 글자가 가는 접힌 줄은 행 시트 없는 표라 `ui/table/Table.tsx:1168` `aria-hidden={onRowTap ? undefined : "true"}` — 발행 요청 목록은 `phoneRowLink`(issue-request-list.tsx:116)이고 `onRowTap` 0건(grep). 행 링크 접근 이름은 프로젝트 글자뿐(issue-request-list.tsx:40-44 `${projectNumber} · ${projectName}`) — `합계`는 없다.
2. 도착 상세(`/projects/{id}?issueRequest=`): `app/(app)/projects/[id]/issue-request-table.tsx:225-227` 금액 `secondaryLine`이 `부가세 · 합계`를 `.pcSecondary`로 그리고, `project-detail.module.css:306-311`이 <700에서 `display: none`. 그 열에 `summary` 없음(:254 메모 · :293 상태만) · 표에 `onRowTap` · `phoneRowLink` 없음(:300-312) → 상세 폰에는 `합계`가 시각·판독 어디에도 없다. **주장대로 폰 판독기에는 `합계` 경로가 없다**(지금 main에서는 주 행 `.cellSecondary`가 보여 읽힌다 — 18 뒤 판독기만 잃는다).
3. 18 :150 대체 갈래 「그 표 행 시트 `items`에 한 줄」은 행 링크 표에 시트가 없어 적용 불가 — 맞다. 다만 그 갈래의 조건(「`secondaryText` 글자가 320 접힌 줄 말줄임에 잘림」)은 `합계`가 접힌 줄 **맨 앞**(:197 「열 순서 → P2 값」)이라 보통 걸리지 않는다. 18 :146은 「확인하지 않는다」라고 스스로 적어 두었다.
4. 07.1-15-PLAN :162(behavior) · :167(action ①) D-E7 문장 「행 링크 표는 전체 글자가 상세 화면과 링크 접근 이름에 있으므로 함께 한 줄 말줄임」 — 사용자 카드(D-E7 2026-10-27 추천안)가 정한 전제다. 이 열에서는 전제가 사실이 아니다(위 2).
5. SYSTEM.md §10 접근성 계약(:1385-1396)에 「모든 셀 정보가 보조기술에 닿아야 한다」는 문장은 없다(표 caption · aria-live · 색 단독 금지 · 포커스 · 터치 · 320 리플로만). §7-3 :878 「P1 셀 안의 2행은 폰에서 숨긴다 — 같은 정보를 두 번 보이지 않는다」는 이미 숨김을 허용한다. `Table.tsx:1168`의 `aria-hidden`은 18이 만든 것이 아니라 기존 설계다 — 행 링크 표의 P2 값도 지금 폰 판독기에 읽히지 않는다(같은 줄).

### 판정
- **참고.** 실행 불가 아님(테스트 · 수용 기준이 막지 않음), 명시 규칙 위반 아님(§10에 해당 문장 없음, D-E7 사용자 결정 안). 다만 18 :258(라) 「폰 판독기 사용자의 전체 정보는 상세 화면이다」는 이 열에서 **거짓 서술**이다 — 점검표에 그대로 옮기면 /design-review가 틀린 근거를 판정 근거로 삼는다.
- 권고(한 줄): :258(라)를 사실대로 「발행 요청 `합계`는 상세 폰에서도 숨겨져(`project-detail.module.css:306-311`) 폰 판독기 경로가 없다 — D-E7 범위로 사용자 결정에 올린다」로 고치거나, `Table.tsx:1168` 조건을 「`onRowTap`도 `secondaryText` 글자도 없을 때만 `aria-hidden`」으로 좁혀 접힌 줄이 읽히게 한다(파일은 files_modified 안 · 새 문구 0).

## B-R3 — `width:0 · min-width:max(100%,5em)`를 td에 거는 지시 (Claude만 막음) → **막음**

### 원본 확인 — 「검증된 꼴」은 td가 아니라 칸 안 block span이다
- `app/(app)/expenses/expenses.module.css:112-117` `.titleCell { display: block; min-width: 9em; … }`, :187-190 폰에서 `.titleCell { width: 0; min-width: max(100%, 5em) }`, :192-197 `.titleCell .link { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }` — 말줄임은 **그 안쪽 block 링크**에, 폭 규칙은 **block span**에 있고 td에는 아무 규칙도 없다.
- 그 span은 `<span className={styles.titleCell}>`로 td 안에 있다: `expenses-table.tsx:37`, `paid-list.tsx:112`, `payment-targets-table.tsx:1052·1056`. td는 공용 `.cell`(Table.module.css:97-104 — height · padding · border만).
- 결재함 `inbox-table.module.css:113-119` `.rowLink`도 td가 아니라 칸 안 `Link`/`button`(inbox-table.tsx:123-132, 폰 `display: block` :130-131)이다.
- 18 Task 1 ④(나) :195는 이 꼴을 「칸(`.cell` = td)에 `width: 0` · `min-width: max(100%, 5em)`」로 옮기고 세 속성을 「칸 자신(아래 줄이 있으면 :820 `<div>`)」에 걸라고 지시하며, Task 2 ①(가) :255는 같은 규칙을 행 링크 표로 넓힌다. 즉 **옮기는 대상이 원본과 다르다.**

### 합성 재현(실제 화면 DOM 아님 · 320 뷰포트 · 288 표 · 문자 칸 + 숫자 nowrap 칸 둘)
| 꼴 | 표 폭 | 문자 칸 | 판정 |
|---|---|---|---|
| V1 td에 `width:0·min-width:max(100%,5em)·overflow·ellipsis·nowrap`(18 ④(나) 그대로) | **959**(288 넘침) | 776px · 말줄임 없음 | 실패 — 자동 표 배치에서 td의 `width:0`은 min-content(nowrap 글자 폭)를 깎지 못한다 |
| V5 td에 폭 규칙 + :820 `<div>`에 세 속성(18의 아래 줄 있는 칸 갈래) | **959** | 776px | 실패 — 같은 이유 |
| V6 문자 칸 둘(증빙 목록 거래처·상태 꼴) | **1670** | 776 · 768 | 실패 |
| V7 td 규칙 + 짧은 글자 `짧은` | 288 | **56px**(5em = 75 미만) | `max(100%, 5em)`의 % 가 표 셀 고유 폭에서 못 풀려 식 전체가 바닥으로 안 먹는다 — Claude 보고 「td에 5em 바닥 미적용」 확인 |
| V3 td에 `max-width:0`(18 :195이 접힌 줄 칸에만 거론한 대안) | 288 | **33px** · `짧은`도 잘림 | 넘침은 없으나 5em 바닥이 없어 짧은 글자까지 「…」 |
| V4 td 규칙 + 발행 요청 `.projectLink`(격자 `minmax(0,max-content)` · issue-requests.module.css:4-9·36-40) | 288 | **16px**(여백뿐 · 글자 0) | Claude 보고 「16~29px 붕괴」 확인 — 격자 min-content 0 + td `width:0`이 칸을 0으로 접는다. 지금 main 꼴(V4b)은 97px 1줄 말줄임으로 정상 |
| V2 원본 꼴(td 안 block span에 폭 규칙 · 안쪽 block에 세 속성) | 288 | 104px(안쪽 80 ≥ 5em) · 1줄 · 말줄임 | 정상 |
| V4c 원본 꼴 감싸개 안에 `.projectLink` | 288 | 96px · 1줄 · 말줄임 | 정상 |
| V9 td 규칙 + `/projects` `.nameCell`(projects.module.css:301-314 block · 폰 `min-width:5em`) | **959** | 말줄임 없음 | 실패 |
| V10 원본 꼴 감싸개 안에 `.nameCell` | 288 | 1줄이지만 **「…」 없이 잘림**(합성 스크린샷으로 글리프만 확인 — 판정 근거는 위 수치) | 안쪽 block(`.nameCell`)이 자기 line box를 가져 감싸개의 `text-overflow`가 닿지 않는다 |

### 왜 막음인가
1. **실행 불가(그대로 하면 320 가로 넘침)**: ④(나)·①(가)를 글자 그대로 옮기면 행 시트 표 · 행 링크 표 전부가 320에서 넘친다(V1·V5·V6·V9). 18의 behavior(:172 「`scrollWidth ≤ innerWidth`」) · verify(:213 `mobile-320-no-overflow`)가 이를 잡기는 한다. 그러나 고치는 길은 ④(나)의 「칸(td)에 건다」 문장 자체를 버리는 것뿐이고, 18에는 그 갈래가 없다(:195의 선택지는 접힌 줄 칸 `width:0`/`max-width:0`뿐 — 둘 다 V3처럼 5em 바닥을 잃는다). CLAUDE.md §4 공통 「절차를 건너뛰거나 즉석 방법으로 대체하지 않는다 — 먼저 말하고 승인」·§3.1에 따라 실행자는 멈춰야 하므로, 18이 정한 「320 실측으로 정하고 못 맞추면 멈춤」(:263은 C-93 사람 표에만 있다)이 이 문제를 안전하게 흡수한다고 볼 수 없다 — 멈춤은 있되 다음 수가 계획에 없다.
2. **`/projects` 이름 칸은 18의 파일 경계 안에서 못 고친다(규칙 위반 잔존)**: D-E7 · 07.1-15 SP-71-1(:162·:167)·18 truth :58은 프로젝트 목록을 한 줄 말줄임 대상으로 못 박는다. 그런데 `.nameCell`(projects.module.css:301-314)은 td 규칙이면 넘치고(V9) 감싸개 규칙이면 「…」 없이 잘린다(V10). 고치려면 `projects-table.tsx:141` 또는 `projects.module.css`를 만져야 하는데 전자는 files_modified(:7-38)에 없고 후자는 수용 기준 :221(`app/(app)/projects/` 아래 `.css` diff 0)·:324(`projects.module.css` diff 0)가 막는다. Task 2 behavior(:247)는 「줄 수 ≤ 1」만 재서 「…」 없는 절단을 통과시킨다 → 머지 뒤 SYSTEM §7-3 :877(07.1-15가 일반화하는 「한 줄 말줄임」)과 어긋난 화면이 남고 /design-review 판정 문장이 없다.

### 최소 수정 방향(한 줄)
④(나)·①(가)의 `width:0 · min-width:max(100%,5em)`와 세 속성을 td가 아니라 **Table.tsx가 글자 칸마다 두는 block 감싸개(:820 `<div>` 꼴을 `secondaryLine` 유무와 무관하게)**에 걸도록 고치고(expenses.module.css:112-117 · 187-197 원형 그대로 — td 규칙 0), 감싸개 안에 자체 block 칸을 가진 `/projects`는 `projects-table.tsx`(+ `.nameCell` 폰 말줄임 한 줄)를 files_modified와 :221·:324 예외에 넣어 같은 플랜에서 함께 고친다.
