---
phase: "06"
slug: "payment-evidence-cards"
status: draft
shadcn_initialized: false
preset: none
created: "2026-09-24"
revision: 1
---

# Phase 6 — UI Design Contract (지급·증빙·법인카드·구매 요청, 경영관리)

> **미리 쓴 계약이다.** 이 문서는 Phase 4(견적 원장, 브랜치 `origin/claude/gsd-progress-e1nzgu` 진행 중) ·
> Phase 04.1(결재 모듈, 브랜치 `origin/claude/phase-04.1-plan-1iqtwe` 계획만) · Phase 5(지출결의, CONTEXT만)가 끝나기 **전에**
> 썼다. 이 페이즈의 화면 대부분은 아직 없는 화면(지출결의 목록·문서 화면, 견적 줄 표의 행 행동, 정산 결재 버튼) 위에 얹힌다.
> 그래서 main에 없는 것에 기대는 요소마다 본문에 **`UA-6xx`**(이 문서의 UI 가정) 또는 **`A-6xx`**(`06-RESEARCH.md`의 의존 가정)를
> 붙였다. `/gsd-plan-phase 6` 직전에 아래 「Phase 4·5 의존 가정 (UI)」 표를 한 줄씩 다시 확인하고, 어긋난 줄이 있으면
> 이 문서를 먼저 고친다(rev 2).
>
> **기준 문서:** `docs/design/SYSTEM.md`는 **Phase 4 브랜치판**(`git show origin/claude/gsd-progress-e1nzgu:docs/design/SYSTEM.md`,
> main 대비 +180/-52)을 따른다 — §7-15 폼 · §7-16 페이지 줄 · §7-17 확인 모달 · §7-5 보강 · §8 규칙 3 담당 표기 · §7-3 (가)~(자)가
> 그 판에만 있고 Phase 4 머지와 함께 main에 들어온다(UA-601). 아래에서 「§」 번호와 줄 번호는 그 브랜치판 기준이다.
> `tokens.css`는 두 판이 같다(`diff` 0줄).
>
> 이 문서는 **새 시각 언어를 만들지 않는다.** 새 색·서체·radius·그림자·간격·토큰 0개. 시스템 수준 규칙이 필요한 곳은 전부
> 「시스템 변경 제안」(SP-1~SP-6)으로 올렸고, 화면 하나만의 예외는 0건이다. 이 문서는 `SYSTEM.md`·`DECISIONS.md`·`tokens.css`를
> 고치지 않는다 — 제안은 계획의 첫 태스크가 `DECISIONS.md` → `SYSTEM.md` 순서로 옮긴다(CLAUDE.md 프론트엔드 규칙).

---

## 경영관리 작업 화면 구성 — 결정 (CONTEXT Claude's Discretion)

**결정: 한 화면 탭을 만들지 않는다. 일은 그 문서가 사는 1차 메뉴 안에서 하고, 「내 차례」(`/`)가 한데 모은다.**

| 일 | 자리 | 근거 |
|---|---|---|
| 지급 대상 고르기 · 일괄 지급 완료 | **지출결의 목록 `/expenses`의 「지급 대상」 보기**(지급 권한자의 기본 보기) — S1·S2 | `SYSTEM.md` §6-1(317~362행)의 예시 화면이 곧 「지출결의 목록 + `이번 주 지급` 그룹 머리글」이다(332행). CONTEXT가 기준으로 지목한 그룹이 이미 이 목록의 것이다 |
| 증빙 확인 · 금액 수정 · 증빙 면제 · 한 건 지급 · 지급 예정일 바꾸기 · 지급 취소 | **지출결의 문서 화면 `/expenses/[id]`**의 「증빙」·「지급」 섹션 — S4·S5 | 증빙 파일을 보면서 확인해야 한다. 모달은 화면을 가린다(§7-8 「폼은 화면이다」) |
| 카드 사용 등록 · 경영관리 대리 등록 | **법인카드 `/cards`** 목록 + 같은 폼 — S8·S9 | 1차 메뉴 「법인카드」가 이 원장이다(§6-0 · `ui/shell/role-menu.ts` `TOP_BAR_MENU`) |
| 구매 요청 처리(구매 완료 · 취소) | **`/cards/purchases`**(법인카드 안의 하위 목록) — S11~S13 | 구매 완료의 결과가 카드 사용 건이다(EXP-10) |
| 매출 세금계산서 발행 요청 처리 | **`/projects/issue-requests`**(프로젝트 안의 하위 목록) + 프로젝트 상세 매출 섹션 — S16·S17 | 처리 = 매출 섹션 발행 줄 입력(D-610). 발행 줄 표가 거기 있다 |
| 한눈에 보기 | **「내 차례」 `/`** — S19 | 워드마크가 늘 `/`로 간다(§6-0 295행). 「내 차례」가 역할별 첫 화면이다(§6-1 357행 · UX-02) |

- **버린 안 ① 한 화면 탭(「경영관리」 화면에 지급·증빙·구매·발행 탭):** 시스템에 탭 컴포넌트가 없고 「탭 없음」이 규칙이다(§6-2 392행 · §7-2 724행 설정 화면).
  1차 메뉴는 다섯 고정이라(D-22 · `TOP_BAR_MENU`) 여섯째 메뉴가 필요하고, 탭마다 1차가 달라 「한 화면 1차 1개」(§7-1)가 깨진다.
- **버린 안 ② 한 화면 섹션(지급·구매·발행을 2px 선 섹션으로 세로로):** 네 목록의 행 모양·1차·페이지가 서로 달라 한 화면에 1차가 넷이 된다.
  진입도 1차 메뉴 밖이라 「내 차례」 말고는 들어갈 길이 없다.
- **하위 목록(`/cards/purchases` · `/projects/issue-requests`)의 진입**은 부모 목록 필터 줄 오른쪽의 3차 링크(건수 붙임, `구매 요청 3`)와
  「내 차례」 두 곳이다. `/pnl` 안의 「리저브 대장」 링크(04-UI-SPEC B-13) 선례를 규칙으로 올린다 — SP-4.
- **D-601 — 대행 없음:** 어느 화면에도 대표·대리 처리 UI가 없다. 경영관리 권한이 없는 사람에게 지급·증빙 확인·구매 완료 버튼은
  비활성으로도 서지 않고(렌더하지 않음) 막힘 줄·EMPTY 줄에 담당만 적는다: `· 지급은 경영관리` · `· 구매는 경영관리`(§8 규칙 3, 1083행).
- 이 선택은 「열린 선택」 O-1로 사용자 확인 후보에 올린다.

---

## Phase 4·5 의존 가정 (UI)

`06-RESEARCH.md`의 A-601~A-613과 **같은 가정은 그 id를 그대로 쓴다**(아래 표 맨 끝 「A-6xx 참조」). 이 표는 화면 쪽 가정만 더한다.
「현재 상태」 네 값: **main에 있음 / Phase 4 브랜치에만 / 계획에만 / 설계 없음.** 2026-09-24, main `ac862cf` · Phase 4 브랜치 `1fcd4d8` 기준.

| ID | 가정 내용 | 근거(branch:file:line 또는 doc) | 현재 상태 | 플랜 작성 때 재확인 방법 |
|----|-----------|----------------------------------|-----------|--------------------------|
| UA-601 | `SYSTEM.md`의 Phase 4 개정(§7-3 (가)~(자) · §7-5 보강 · §7-15 폼 · §7-16 페이지 줄 · §7-17 확인 모달 · §8 규칙 3 담당 표기 · 규칙 5 P0)이 main에 들어온다. 이 문서의 모든 「§」 인용은 그 판 기준 | `origin/claude/gsd-progress-e1nzgu:docs/design/SYSTEM.md` 728~827 · 836~841 · 1018~1075 · 1083 · 1086행 | Phase 4 브랜치에만 | `git diff main -- docs/design/SYSTEM.md docs/design/DECISIONS.md`가 0줄인지, 인용한 절 번호가 그대로인지 |
| UA-602 | 확인 모달 공용 컴포넌트 `ui/confirm-dialog/ConfirmDialog`(슬롯: 제목·부제·결과 줄 0~3·확인 근거 한 칸·막힘 이유·2차 자동 파생·1차)가 있다 | `git ls-tree -d --name-only 5b1ac10:ui`(브랜치, 19개) — main `257c2ab:ui`(18개)에는 없음 · 04-UI-SPEC.md S16 | Phase 4 브랜치에만 | `ls ui/confirm-dialog` · props에 `evidence`(확인 근거 한 칸) 슬롯이 날짜·사유 둘 다 받는지 |
| UA-603 | 번호 페이지 `ui/pagination/Pagination`(§7-16, `href`/`onPageChange` 유니언)이 있다 | 04-UI-SPEC.md 149행 · `.planning/phases/04-project-quote-ledger/04-29-PLAN.md` | 계획에만(두 브랜치 `ui/`에 없음) | `ls ui/pagination` |
| UA-604 | `ui/table/Table`이 읽기 표 · 편집 표(`role="grid"`) · 그룹 머리글 · 폰 칸 접기 · 좁은 PC 열 접기를 한다. **선택 열(체크박스)과 행 단위 부분 처리는 없다** — SP-1이 더한다 | main `ui/table/Table.tsx` · `use-grid-keyboard.ts`(범위 선택만, 행 선택 없음 — 실측) | main에 있음(선택 열은 설계 없음) | `grep -n "rowSelect\|selectable" ui/table/*.tsx` |
| UA-605 | 지출결의 목록 `/expenses`(§6-1, 상태 필터·그룹 머리글·합계 줄)와 문서 화면 `/expenses/[id]`(§6-3 한 열, 제출 뒤 읽기 전용)를 Phase 5가 만든다. 이 페이즈는 그 목록에 보기 둘(「지급 대상」·「지급 완료」)과 문서 화면에 섹션 둘(「증빙」 확인부·「지급」)을 얹는다 | main `app/(app)/expenses/page.tsx`(빈 `ListEmpty` 자리표시자, 실측) · 05-CONTEXT.md | 설계 없음(Phase 5는 CONTEXT만, UI-SPEC·PLAN 없음) | Phase 5 UI-SPEC의 라우트·필터 이름·문서 화면 섹션 순서·1차 규칙을 읽고 S1·S3·S4·S5를 맞춘다 |
| UA-606 | 지출결의 폼의 증빙 칸 묶음 = 첨부 영역(§7-10) + **증빙 금액(공급가) 칸**(PM이 첨부 때 적는다, D-602) + 서버 계산 한 줄(§6-3 423행). 제출 뒤에도 PM은 증빙을 더하거나 뗄 수 있다 | 05-CONTEXT.md Claude's Discretion(업로드 경로 담당) · `docs/inputs/phase-06-payment.md` §5 · A-608 | 설계 없음 | Phase 5 UI-SPEC에서 증빙 금액 칸의 자리·이름, 제출 뒤 증빙 편집 허용 여부를 확인 |
| UA-607 | 결재 상태의 화면 낱말은 04.1 UI-SPEC을 따른다 — 제목 옆 `결재 중`(accent) · 표 `{단계} 결재 중` · `반려`(danger) · `회수`(muted) · 승인 `승인 09-18`(success). 지출결의 자기 승인은 「본인 승인」 표시로 통과(05-CONTEXT) | `origin/claude/phase-04.1-plan-1iqtwe:.planning/phases/04.1-approvals-leave/04.1-UI-SPEC.md` 164~171행 · 05-CONTEXT.md 「이미 확정된 입력」 셋째 줄 · A-606 | 계획에만(04.1 브랜치 UI-SPEC, 미실행) | 04.1 머지 뒤 `app/(app)/approvals`·`ui/status-tag` 매핑 표에서 낱말을 다시 읽는다 |
| UA-608 | 견적 줄 표의 행 행동 「지출결의 올리기」(`Ctrl+E`, 힌트 줄 표기 포함)와 폰 행 시트의 같은 행동을 Phase 5가 켠다. 이 페이즈는 그 **같은 자리**에서 문을 가른다(구매 요청 / 지출결의) | `SYSTEM.md` §6-2 385행 힌트 줄 `지출결의 올리기 Ctrl+E` · 05-CONTEXT.md(「폰 시트의 「지출결의 올리기」를 이 페이즈에서 켠다」) | 설계 없음(행동의 자리 — 행 끝 3차인지 표 위 버튼인지 — 미정) | Phase 5 UI-SPEC에서 행동의 자리·라벨·단축키를 읽고 S14의 「구매 요청」을 같은 자리에 둔다 |
| UA-609 | 견적 줄 표 상태 열은 `StatusTag` `text` 변형이고 D-66 읽기 전용 셀 이유는 `지출결의 26001-0004 연결됨 · 고치려면 새 차수` 꼴이다 | 04-UI-SPEC.md 300~301 · 372행 · A-602 | Phase 4 브랜치에만(04-UI-SPEC은 main에도 있으나 구현은 브랜치) | 머지 뒤 `app/(app)/projects/[id]/quote-table.tsx` 상태 열 렌더와 읽기 전용 이유 함수 이름 |
| UA-610 | 정산 상태 프로젝트 상세에 PM의 「정산 결재 올리기」 1차(또는 2차)가 있고, 대표가 정산 결재 문서 화면에서 승인한다 | 05-CONTEXT.md D-98 · A-609 · A-601 | 설계 없음(버튼 자리·라벨 미정) | Phase 5 UI-SPEC에서 기안 버튼 라벨·자리, 기안이 폼 화면인지 확인 모달인지 |
| UA-611 | 「내 차례」 블록(`ui/next-turn`)에 도메인이 항목을 공급하는 경로가 생긴다. 지금 홈은 항상 빈 배열을 넘긴다 | main `app/(app)/page.tsx` `buildNextTurnView([])`(실측) · `SYSTEM.md` §7-4 | 설계 없음 | Phase 5가 「내 차례」 공급 함수를 만들었는지 — 없으면 S19는 이 페이즈 계획이 그 함수를 처음 만든다(열린 선택 O-15) |
| UA-612 | 「경영관리」는 계급이 아니라 **권한표에서 배정되는 메뉴 권한**이다. 이 문서의 「경영관리」 = 지급 처리 권한(가칭 `payments` write) · 구매 처리 권한(가칭 `purchases` write) · 카드 대리 등록 권한(가칭 `cards.proxy` write) · 매출 기록 권한(`projects.revenue` write, 이미 있음)을 가진 사람 | `.planning/STATE.md` [Phase 04] 04-02 결정(「경영관리는 SEED_ROLES 5종에 없어 … 권한표에서 배정」) · RESEARCH Security V4 · Open Question 3 | 계획에만(메뉴 키 이름 미정, `projects.revenue`만 main에 있음) | 계획이 `domain/permissions/menus.ts`에 더할 키 이름을 정하면 이 문서의 가칭을 바꾼다 |
| UA-613 | 거래처 계좌는 `accountBank` + `maskTail4()`(`****-**-1234`)로 보이고, 정보 항목 `vendor.account_number_unmasked`가 있는 사람에게만 3차 「번호 보기」/「가리기」가 서며 누르면 `mask_reveal` 행동 로그가 남는다. 지금 관리자 거래처 화면의 `AccountNumberCell`을 지급 화면이 두 번째로 쓴다 | main `db/schema/vendors.ts:20-23` · `lib/crypto.ts:91-94` · `app/(app)/admin/vendors/account-number.tsx` · `domain/vendors/index.ts:370-390`(실측) | main에 있음 | 두 번째 사용처가 생기므로 `ui/account-number/`로 옮길지(DESIGN §4 규칙 3) — 계획이 정한다 |
| UA-614 | 설정 화면(`/admin/settings`)은 레지스트리 키를 §7-2 규칙으로 자동 렌더한다 — 새 키 넷(증빙 필수 on/off · 증빙 크기 한도 · 선결제 증빙 기한 · 온라인구매 협력사)은 화면 코드 없이 나온다 | main `domain/settings/keys.ts` · `SYSTEM.md` §7-2 702~726행 | main에 있음 | 새 키가 boolean·number·string 셋 안인지. 거래처를 고르는 타입이 필요하면 설계 없음(열린 선택 O-13) |
| UA-615 | 견적 외 비용 줄(D-48)은 견적가 0인 견적 줄의 한 종류이고, 카드 사용의 연결 대상 「견적 외 비용」은 저장 때 그 종류의 줄을 하나 새로 만든다. 조정 줄(D-83)과 같은 종류인지는 A-603 | 04-CONTEXT D-48 · D-83(브랜치 99행) · A-603 | Phase 4 브랜치에만(결정) · 줄 종류 enum은 설계 없음 | 머지 뒤 `domain/quotes/` 줄 종류 값과 「견적 외 비용 줄 추가」 경로를 읽고 S9 연결 「견적 외 비용」을 그 경로 호출로 고정 |
| UA-616 | 프로젝트 상세는 섹션이 2px 선으로 이어지는 한 화면이고(§6-2 392행), 「일괄 저장 Ctrl+S N」 하나가 화면의 모든 편집 표를 한 트랜잭션으로 저장한다(§7-3 (사) 802행). 매출 섹션 = 계약 금액(파생) + 발행 줄 표 + 입금 줄 표 | 04-UI-SPEC.md S6(1284~1317행) · `SYSTEM.md` 802행 | Phase 4 브랜치에만(main `revenue-section.tsx`에는 계약 금액 입력 칸이 아직 있다 — D-84 이전) | 머지 뒤 `app/(app)/projects/[id]/revenue-section.tsx`에서 발행 줄 표 컴포넌트·저장 배선을 읽고 S16의 「발행 요청」 표를 같은 배선에 얹는다 |
| **A-6xx 참조** | A-601(다섯 상태·정산) · A-602(견적 줄 상태 파생) · A-603(조정 줄 종류) · A-604(계약 금액 파생) · A-605(발행액 PM 공개) · A-606(결재 상태값) · A-607(지출결의 1줄 1문서·번호 `26001-0004`) · A-608(증빙 업로드 경로) · A-609(정산 결재 = PM 기안·대표 승인) · A-610(상태 태그 새 값 — 이 문서 SP-2가 해소 제안) · A-611(카드 사용 새 표) · A-612(구매 요청 번호 카운터) · A-613(발행 요청 새 표) | `06-RESEARCH.md` 「Phase 4·5 의존 가정」 표 | 그 표 그대로 | 그 표의 재확인 방법 그대로 |

<!-- gsd:write-continue -->
