## 1. 총평

원장형 색·직각·선 위계는 전 화면에서 안정적으로 유지됐고, 46개 메트릭 모두 200 응답·콘솔 오류 0건이며 새 색·radius·그림자 이탈도 확인되지 않았다.  
가장 큰 결함은 관리자 표가 모바일 칸 접기를 구현하지 않아 일부 화면에서 실제 문서 가로 스크롤과 글자 단위 줄바꿈이 발생하는 점이다.  
데스크톱에서는 단일 기둥 콘텐츠의 최대 폭 규칙이 없어 폼·목록·설정이 1240px까지 늘어난다. 이는 화면별 수정보다 전역 규칙 보강이 먼저다.  
Phase 4 원장 표를 만들기 전에 모바일 표·숫자 정렬·편집표 신호를 고쳐야 현재의 임시 관리자 패턴이 프로젝트·견적·금액 열로 복제되지 않는다.

## 2. Findings table

| ID | 심각도 | 종류 | 화면(route) | 근거 | 제안 |
|---|---|---|---|---|---|
| F-01 | blocker | 위반 | `/admin/action-log`, `/admin/vendors`, `/admin/code-tables`, `/admin/corp-cards`, `/admin/people`, `/admin/people/roles` | [SYSTEM.md §7-3](/home/user/ERP_PLANT8_260917/docs/design/SYSTEM.md:724)은 폰에서 P1 최대 3열·P2 접힌 줄·P3 숨김·가로 스크롤 금지. `action-log-375`: `scrollWidth 463 > 375`, 표 폭 449.0px. `vendors-375`: `473 > 375`, 표 폭 459.3px. 가로 넘침이 없는 화면도 `people` 표 347×1406.2px, `code-tables` 347×722.4px, 법인카드 한 행 표가 213.4px 높이로 글자가 세로로 분해된다. 각 CSS는 모바일 열 접기 없이 `table{width:100%}`만 둔다([action-log CSS](</home/user/ERP_PLANT8_260917/app/(app)/admin/action-log/action-log.module.css:67>)). | 표마다 P1/P2/P3를 선언한다. 예: 사람=`이름·계급·동작` / `이메일·소속·상태`; 거래처=`이름·상태·동작` / `사업자번호·증빙·계좌`; 행동 로그=`발생 시각·행동 종류·대상` / `행위자·계급·문서`, 상세=P3. 폰 행 탭은 상세 시트로 연결한다. |
| F-02 | major | 공백 | `/admin`, `/account`, `/admin/settings`, `/admin/people/[id]`, `/admin/people/org` | [SYSTEM.md §2-3](/home/user/ERP_PLANT8_260917/docs/design/SYSTEM.md:149)은 산문 64ch와 “표·폼은 컨테이너 폭”만, [§3](/home/user/ERP_PLANT8_260917/docs/design/SYSTEM.md:179)은 전체 컨테이너 1280px만 규정한다. 반면 `--form-max:720px`는 이미 존재한다([tokens.css](/home/user/ERP_PLANT8_260917/docs/design/tokens.css:116)). 1280 메트릭: `/admin` 목록 1240px, `/account` form 1240px·입력 1136px, `/admin/settings` 섹션 1240px·입력 1136px, 사람 상세 select 1240px, 조직 input 1200px. | 새 토큰을 만들지 말고 `--form-max:720px`를 “단일 기둥 최대 폭”으로 전역 승격한다. 폼뿐 아니라 `dl`, 링크/계층 목록, 설정 필드 묶음에 적용하고 표·매트릭스·대시보드는 제외한다. |
| F-03 | major | 위반 | 공통 셸 전체 | [SYSTEM.md §7-9](/home/user/ERP_PLANT8_260917/docs/design/SYSTEM.md:798)은 `⌘K`가 검색·이동 팔레트를 연다고 규정한다. 실제 PC는 동작 없는 `<span><kbd>`([TopBar.tsx](/home/user/ERP_PLANT8_260917/ui/shell/TopBar.tsx:137)), 폰의 검색 행은 `aria-disabled="true"`인 `<span>`이다([MoreSheet.tsx](/home/user/ERP_PLANT8_260917/ui/shell/MoreSheet.tsx:98)). | 하나의 검색 다이얼로그를 만들고 PC `⌘K` 버튼·키보드 단축키·폰 검색 행이 동일 컴포넌트를 열게 한다. 구현 전까지 죽은 검색 표시는 제거해야 한다. |
| F-04 | major | 위반 | 폰 `더보기` 시트 | [SYSTEM.md §7-8](/home/user/ERP_PLANT8_260917/docs/design/SYSTEM.md:787)은 “하단에서 올라옴”을 명시하지만 `more-sheet-open-375.png`는 시트가 화면 상단 `y=0`에 붙는다. `.sheet`가 `inset-block-end:0`만 지정하고 네이티브 dialog의 시작 inset을 해제하지 않았다([MoreSheet.module.css](/home/user/ERP_PLANT8_260917/ui/shell/MoreSheet.module.css:5)). | `.sheet`에 `inset-block-start:auto; inset-block-end:0`을 지정한다. 열림/닫힘은 기존 `--dur-sheet`·`--ease-sheet`를 사용한다. |
| F-05 | major | 위반 | 공통 셸, `/admin/settings`, `/login`, `/account` 등 | [SYSTEM.md §3](/home/user/ERP_PLANT8_260917/docs/design/SYSTEM.md:179)·[§10](/home/user/ERP_PLANT8_260917/docs/design/SYSTEM.md:948)은 폰 터치 목표 44×44를 요구한다. 모바일 사용자 메뉴 트리거는 55.78×19.19px, 설정 체크박스 18개는 20×20px, 공통 버튼·입력은 `--control-h:40px`이다([tokens.css](/home/user/ERP_PLANT8_260917/docs/design/tokens.css:156)). | 폰 `--control-h`를 `var(--touch-min)`=44px로 통일한다. 사용자 트리거는 `min-height:var(--touch-min)`, 설정 체크박스는 glyph 20px를 유지하되 `<label>` 전체를 최소 44px 높이로 만든다. |
| F-06 | major | 위반 | `/admin/code-tables`, `/admin/people/roles` | [SYSTEM.md §7-2](/home/user/ERP_PLANT8_260917/docs/design/SYSTEM.md:667)는 표 안 입력을 “테두리 없음 + accent 밑줄 + `--g-50`”, [§7-3](/home/user/ERP_PLANT8_260917/docs/design/SYSTEM.md:701)은 편집표 머리글을 `--g-100/--g-950`으로 규정한다. 실제 입력은 각각 115.4×40px·199.2×40px의 사방 `1px --line-ui` 박스이고, 머리글은 흰 바탕이다([code CSS](/home/user/ERP_PLANT8_260917/app/(app)/admin/code-tables/code-tables.module.css:35), [role input](</home/user/ERP_PLANT8_260917/app/(app)/admin/people/roles/roles-client.tsx:37>)). | 공용 편집표 변형을 사용한다. `th{background:var(--g-100);color:var(--g-950)}`, 편집 셀/행 `background:var(--g-50)`, 입력 `border:0;border-bottom:1px solid var(--accent)`. 견적 원장이 현재의 박스 입력 패턴을 복사하지 않게 한다. |
| F-07 | major | 위반 | `/admin/action-log`, `/admin/code-tables`, `/admin/people/roles`, `/admin/settings` | [SYSTEM.md §2-4](/home/user/ERP_PLANT8_260917/docs/design/SYSTEM.md:157)은 숫자 칸을 우측 정렬·`tabular-nums`·nowrap으로 고정한다. 코드표·계급의 `sortOrder`는 클래스 없는 `<td>`([code page](</home/user/ERP_PLANT8_260917/app/(app)/admin/code-tables/page.tsx:145>), [roles](</home/user/ERP_PLANT8_260917/app/(app)/admin/people/roles/roles-client.tsx:49>)); 이력 값도 구분 없이 좌측 정렬된다([HistoryList](/home/user/ERP_PLANT8_260917/ui/history-list/HistoryList.tsx:241)). 행동 로그는 같은 해인데 `2026-09-22 16:59:31` 전체를 표시한다. | 공유 숫자 셀 규칙 `text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; letter-spacing:var(--ls-num)`을 만든다. 숫자형 이력 값에만 적용하고, 행동 로그 현재 연도 표기는 `09-22 16:59`로 맞춘다. |
| F-08 | minor | 위반 | `/admin/vendors`, `/admin/corp-cards`, `/admin/code-tables`, `/admin/people` | [SYSTEM.md §2-4](/home/user/ERP_PLANT8_260917/docs/design/SYSTEM.md:157)은 빈 값을 `—`로, [§10](/home/user/ERP_PLANT8_260917/docs/design/SYSTEM.md:948)은 상태를 항상 글자로 표시하도록 한다. 정상 상태에서는 상태 `<td>`가 `null`이라 화면에 빈칸이 남는다([vendors](</home/user/ERP_PLANT8_260917/app/(app)/admin/vendors/page.tsx:139>), [corp-cards](</home/user/ERP_PLANT8_260917/app/(app)/admin/corp-cards/page.tsx:170>), [people](</home/user/ERP_PLANT8_260917/app/(app)/admin/people/page.tsx:89>)). | 실제 정상 상태라면 `활성`/`사용 중`을 `StatusTag kind="success" variant="text"`로 표시한다. 정말 값이 없을 때만 `—`를 쓴다. |
| F-09 | minor | 위반 | `/login` | [SYSTEM.md §6-7](/home/user/ERP_PLANT8_260917/docs/design/SYSTEM.md:527)은 최대 폭 360px. 실제 데스크톱 form은 480px, input은 376px이며 `AuthFrame`이 `--modal-w` 480px을 재사용한다([AuthFrame CSS](/home/user/ERP_PLANT8_260917/ui/auth-frame/AuthFrame.module.css:14)). `DECISIONS.md`에 이탈 기록은 없다. | `--auth-max:360px`을 추가하고 로그인 frame에 사용한다. 480px을 유지하려면 먼저 `DECISIONS.md`와 SYSTEM.md를 함께 바꿔야 한다. |
| F-10 | minor | 위반 | `/account` | 타입 스케일은 11/12/14(폰 15)/18/24/32px뿐이다([SYSTEM.md §2-2](/home/user/ERP_PLANT8_260917/docs/design/SYSTEM.md:134)). 클래스 없는 `<h2>`([change-password-form.tsx](</home/user/ERP_PLANT8_260917/app/(app)/account/change-password-form.tsx:35>))가 브라우저 기본값으로 PC 21px·폰 22.5px이 된다. | 섹션 제목 클래스를 적용해 `font-size:var(--fs-lg); line-height:var(--lh-head); letter-spacing:var(--ls-head); font-weight:var(--fw-bold)`로 고정한다. |

## 3. SYSTEM.md 개정 제안

F-02는 먼저 `DECISIONS.md`에 “새 목록 토큰을 만들지 않고 기존 `--form-max`를 단일 기둥 공통 토큰으로 확장한다”는 결정을 기록해야 한다.

### §2-3 마지막 줄 교체

```md
- 줄 길이: 산문(안내·설정 설명)은 `max-width: 64ch`. 데이터 표·체크박스 매트릭스·대시보드는 컨테이너 폭을 따른다. 가로 비교가 목적이 아닌 단일 기둥 콘텐츠는 §3의 단일 기둥 최대 폭을 따른다.
```

### §3 컨테이너 규칙 다음에 추가

```md
- 단일 기둥 최대 폭: 폼·설정 필드 묶음·`dl` 상세·계층 목록·한 칸짜리 링크 목록처럼 가로 비교가 목적이 아닌 한 열 콘텐츠는 `width: 100%; max-width: var(--form-max)`로 하고 컨테이너 왼쪽에 정렬한다. 폰에서는 가용 폭 전부를 쓴다. 데이터 표·체크박스 매트릭스·대시보드에는 적용하지 않는다.
```

사용 토큰은 새 토큰이 아니라 기존 `--form-max: 720px`이다. `tokens.css` 주석만 다음처럼 넓힌다.

```css
--form-max: 720px; /* 단일 기둥 콘텐츠(폼·설정·dl·계층/링크 목록) 최대 폭 */
```

### §3 터치 목표 문장 교체

```md
- 터치 목표: 폰에서 모든 행동 요소의 실제 클릭 영역은 최소 44×44px이다. 공용 버튼·입력의 폰 높이는 `--control-h: var(--touch-min)`(44px), PC는 32px, 외부 수령자 입력은 48px이다. 체크박스·라디오 glyph는 20px일 수 있으나 이를 감싸는 `label` 또는 셀 전체가 최소 44×44px이어야 한다.
```

이에 맞춰 §7-1의 “폰 40”을 “폰 44”, §7-2의 `32/40/48`을 `32/44/48`로 교체하고 모바일 토큰을 다음처럼 바꾼다.

```css
--control-h: var(--touch-min);
```

### §6-7 로그인 폭 표기 교체

```md
PC · 폰 공통 (`max-width: var(--auth-max)` = 360px, 가운데 정렬)
```

연동 토큰:

```css
--auth-max: 360px; /* 로그인·재인증처럼 셸 없는 단일 목적 인증 폼 */
```

나머지 findings는 SYSTEM.md에 이미 충분히 명시되어 있으므로 문서 추가 없이 구현을 기존 규칙에 맞추는 것이 옳다.