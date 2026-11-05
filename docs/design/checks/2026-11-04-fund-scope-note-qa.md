# 권한표 자금 본부 표지 — /qa 보고서 (PR #355 · 07.3-04)

- 일자: 2026-11-04 · 브랜치 `claude/project-thread-mwhru5` · 검사 HEAD `741f8a43`
- 방식: gstack /qa Standard · diff 기준(`app/(app)/admin/permissions/page.tsx` · `fund-notes.ts` · `ui/permission-grid/PermissionGrid.tsx` · `.module.css`)
- 환경: `CI=true` 프로덕션 빌드(:3100, erp_test) · Playwright chromium · 폭 1280 · 768 · 375 · 320(높이 900, 이동 확인은 320×480 · 1280×360도)
- 계정: 시스템 관리자(설정 보기 있음) · 권한표 보기만 있는 계급(설정 보기 없음). 자격 증명은 기록하지 않는다
- 판정: DOM 실측만(getBoundingClientRect · 계산된 스타일 · aria 속성). 스크린샷 육안 판정 없음

## 결과 요약

| 상태 | 폭 | 실측 | 판정 |
|---|---|---|---|
| 본부 지정(경영관리본부) · 관리자 | 1280 · 768 | 그룹 38개 중 자금 8개만 표지 「경영관리본부만」, 그룹마다 체크박스 21/21이 표지 id를 aria-describedby로 가리킴, id 유일, 표지 오른쪽 ≤ th 오른쪽, 표지 없는 그룹의 aria-describedby 0, 끊긴 참조 0, 잠김 줄 0 | PASS |
| 본부 지정 · 관리자 | 375 · 320 | 값 칸 111개 중 자금 24칸(8메뉴×3동작)에 표지, 24/24 described · 값 칸 안 · 체크박스와 같은 줄(중심차 <6px) · 1줄, 끊긴 참조 0, 잠김 줄 0 | PASS |
| 본부 미지정 · 관리자 | 4폭 | 표지 「자금 본부 미지정」(PC 8그룹 · 폰 24칸 같은 규칙), 잠김 줄 「자금 기능 본부 미지정 · 설정」이 격자 · 목록 위(above=true), 링크 href `/admin/settings?group=권한#setting-permissions.fund.division_org_unit`, 줄 높이 PC 22.8px · 폰 44px(링크 터치 영역 44×44) | PASS |
| 본부 미지정 · 설정 보기 없음 | 4폭 | 잠김 줄 「자금 기능 본부 미지정」 링크 0개 · 높이 20.8px · 격자 위, 표지는 같음 | PASS |
| 본부 지정 · 설정 보기 없음 | 4폭 | 잠김 줄 0, 표지 「경영관리본부만」 | PASS |
| 「설정」 클릭(클라이언트 이동) | 4폭 + 320×480 · 1280×360(키보드 Enter) | 도착 URL 해시 그대로, 대상 SELECT 존재 · 라벨 「자금 기능 본부」 · 값 「—」 · 화면 안(예: 320×480 top 327 · bottom 367 ≤ 480), 새로고침해도 같음, 뒤로 가기 → /admin/permissions · 잠김 줄 다시 보임 | PASS |
| 토글 · 저장 | 1280 · 375 × 지정/미지정 | 「감사 권한표 보기 · 매출 정산 · 보기」 클릭 → POST 200 · 체크됨 → 새로고침 뒤 유지 · aria-describedby 표지 글자 유지 → 다시 클릭으로 원래 값 복구 확인 | PASS |
| 키보드 Tab 순서 | 4폭 | 미지정: 본문 첫 초점이 「설정」 → (PC) 「프로젝트 · 보기 전체 선택」 / (폰) 계급 SELECT → 칸 순. 지정: 첫 초점이 격자 · SELECT. 초점 링 outline 2px | PASS |
| 표지 조회 실패(org_units 테이블 임시 개명으로 throw 재현) | 1280 · 375 | h1 「권한표」, 격자 38그룹 · 폰 111칸 그대로, 표지 0, 잠김 줄 0, role=alert 0, 콘솔 오류 0 | PASS |
| 가로 넘침 | 전 상태 · 4폭 | scrollWidth = innerWidth(320/375/768/1280), 표 감싸개 scrollW = clientW | PASS |
| 콘솔 · 네트워크 | 전 실행 | console.error 0 · pageerror 0 · HTTP 4xx/5xx 0 | PASS |

## 점검표

화면: app/(app)/admin/permissions/, ui/permission-grid/

- [x] 본부 지정 표지 — 근거: 위 결과 요약 1·2행(PC 8그룹 · 폰 24칸, aria-describedby 21/21 · 24/24)
- [x] 본부 미지정 표지 · 잠김 한 줄, 설정 보기 계정만 「설정」 링크 — 근거: 결과 요약 3~5행
- [x] 「설정」 링크가 설정 화면 「자금 기능 본부」 칸을 화면 안에 연다 — 근거: 결과 요약 6행(4폭 · 키보드 Enter)
- [x] 토글 · 저장이 그대로 된다 — 근거: 결과 요약 7행(POST 200, 새로고침 뒤 유지)
- [x] Tab 순서 · 초점 링 — 근거: 결과 요약 8행(outline 2px)
- [x] 표지 조회 실패 때 표가 그대로 선다 — 근거: 결과 요약 9행
- [x] 가로 넘침 · 콘솔 · 네트워크 오류 0 — 근거: 결과 요약 10·11행

## 이슈

| ID | 심각도 | 분류 | 내용 | 근거(DOM) | 수정 상태 | 커밋 |
|---|---|---|---|---|---|---|
| ISSUE-001 | 중간(Medium) | UX · 기존 결함(이 PR 이전) | 권한표 보기만 있는 계정에도 체크박스가 활성이다. 누르면 저장 실패 토스트만 뜬다 — 「할 수 없는 선택지는 비활성」 원칙 위반 | 설정 보기 없는 계정 1280: 활성 체크박스 777개(폰 111개), 「대표 · 매출 정산 · 보기」 클릭 → 체크 false 유지 · 토스트 「권한 저장 실패 · 다시 시도」 · 새로고침 뒤 false. origin/main의 page.tsx에도 읽기 전용 전달이 없다 | 보류(deferred) — 이 PR diff 밖 기존 동작. 별도 quick 작업 권장 | — |
| ISSUE-002 | 낮음(Low) | 접근성 · 기존 패턴 | 「설정」으로 설정 화면에 도착하면 대상 칸이 화면에는 보이지만 초점은 body에 남는다. 다음 Tab은 페이지 맨 위(건너뛰기 링크 · 메뉴)로 간다 | 320×480 · 1280×360: activeElement = BODY, 대상 SELECT focused=false, Tab 1회 → 「내 차례」 링크 / BODY. `projects/budget`의 `#setting-` 링크도 같은 구조 | 보류(deferred) — 설정 화면 해시 도착 처리라 이 PR 범위 밖 | — |

이미 받아들인 경고(재수정 안 함): 「설정」 링크 14/15px 대 힌트 13px · 설정 힌트 6개 용어만 · 설정 보기 없는 계정의 다음 행동 없음 · 폰 잠김 줄 44px(링크 터치 영역).

## 건강 점수

| 분류 | 가중치 | 기준 | 최종 |
|---|---|---|---|
| Console | 15% | 100 | 100 |
| Links | 10% | 100 | 100 |
| Visual | 10% | 100 | 100 |
| Functional | 20% | 100 | 100 |
| UX | 15% | 92(ISSUE-001) | 92 |
| Performance | 10% | 미측정(제외) | 미측정 |
| Content | 5% | 100 | 100 |
| Accessibility | 15% | 97(ISSUE-002) | 97 |

점수 = 88.35 / 0.90 = **98 → 98**(수정 없음 · Performance 제외 잠정 점수). 두 이슈 모두 이 PR이 들인 결함이 아니다.

## 확인하지 못한 것
- Performance(로드 시간)는 재지 않았다.
- 조회 실패는 org_units 테이블 임시 개명으로만 재현했다(다른 실패 원인 — can() 단독 실패 등 — 은 같은 catch 경로라 따로 돌리지 않음). 실험 뒤 테이블 이름과 설정 값을 원래대로 돌렸다.

## PR 요약
> QA found 2 issues (both pre-existing, out of PR scope), fixed 0, health score 98 → 98.
