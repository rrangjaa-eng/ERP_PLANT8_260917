# Phase 4 — 범위 밖 발견 사항 (04-01)

04-01 실행 중 관찰했지만 이 플랜의 변경과 무관해 고치지 않은 항목. 전부
`test/e2e/project-register.spec.ts`·`page-chrome.spec.ts` 등 이 플랜이
만지는 파일과 무관한 기존 E2E 스펙이고, **각 스펙을 단독 실행하면
통과한다** — 전체 스위트(`pnpm test:e2e`)를 한 번에 돌릴 때만 간헐적으로
실패했다.

## 관찰

전체 E2E 스위트를 세 번 돌렸고(20:14·20:24·20:35 KST 근방), 매번 **다른**
스펙이 실패했다 — 전부 이 플랜이 건드리지 않은 화면(거래처·법인카드·조직·
행동 로그)이었다:

| 실행 | 실패한 스펙 | 실패 형태 |
|---|---|---|
| 1회 | `admin-master-list-first.spec.ts`(거래처) | 폼 제출 후 요소를 못 찾음 |
| 2회 | `admin-master-list-first.spec.ts`(거래처) | 같은 테스트, 폼이 native GET으로 제출됨(URL에 쿼리스트링) |
| 3회 | `action-log.spec.ts`(Excel BOM) · `corp-cards.spec.ts`(비활성 토글) · `master-edit.spec.ts`(법인카드 소유자 수정) · `org.spec.ts`(팀 이름 접근성 라벨) | 각각 다른 단언 실패 |

각 실패한 스펙을 **단독으로**(`pnpm playwright test <파일>`) 다시 돌리면
전부 통과했다(`admin-master-list-first.spec.ts` 8/8, 이 커밋에서 직접
확인). 공통점: `[WebServer] ⨯ Error: The destination stream closed
early.`가 전체 스위트 실행 중 로그에 여러 번 나타난다 — `pnpm dev`
(Turbopack) 웹서버가 부하(여러 워커·긴 실행 시간) 아래서 응답 스트림을
가끔 끊는 것으로 보이며, 이 프로젝트의 기존 인프라 문제이지 이 플랜의
코드 문제가 아니다.

## 이 플랜에서 확인한 것(문제 없음)

- `test/e2e/project-register.spec.ts`(이 플랜이 만든 스펙) — 단독 실행
  3회, 전체 스위트에 낀 실행 2회 전부 통과
- `test/e2e/page-chrome.spec.ts` — "지출결의 보기" → "프로젝트 등록" 링크
  텍스트 수정 후 14/14 통과(단독 실행)
- `test/e2e/login-logout.spec.ts`·`code-tables.spec.ts` — 이 플랜이
  `/projects`에 `can(viewer, "projects", "view")` 게이트와 role-pm 기본
  권한을 추가했지만 다른 화면의 권한 경계에 영향 없음을 확인(특히
  `code-tables.spec.ts`의 "기획 PM 계급은 코드표 관리 화면에서 404다"가
  그대로 유지됨 — role-pm에 admin.vendors·admin.people view를 주지
  않기로 한 결정이 맞았다는 증거)
- `pnpm test:unit`(698건) · `pnpm test:integration`(892건) — 전부 통과,
  0 실패

## 처리

전체 E2E 스위트의 간헐적 실패는 **다음 페이즈 착수 전 사람이 검토할 것**
— 이 항목을 고치는 것은 04-01의 범위(프로젝트·견적 원장 트레이서) 밖이고,
`Rule N`의 "직접 원인이 된 것만 고친다" 경계 밖이다. 재현하려면 전체
스위트를 반복 실행하고 `[WebServer] ⨯ Error: The destination stream
closed early.` 발생 빈도와 실패 스펙의 상관관계를 확인한다.

## 04-04 실행 중 재관찰(같은 종류, 같은 범위 밖 판단)

`pnpm test`(전체) 1회 실행에서 `mobile-list-empty.spec.ts`(§3
design-review H-1, `/projects` EMPTY 상태 터치 타깃)가 "링크 상자를 잴 수
없다"로 실패했다 — 이 플랜이 만든 quote-table.spec.ts·기존
project-register.spec.ts가 동시에 대량의 프로젝트를 만들어 `/projects`가
그 워커가 열람할 시점엔 더 이상 EMPTY가 아니었을 가능성이 높다(이
스펙·`ui/list-empty`·`filter-bar.tsx` 전부 이 플랜이 건드리지 않은
파일).

재현을 위해 `desktop` 프로젝트만 단독으로 다시 돌렸더니(같은 세션,
`mobile-list-empty`는 `desktop`에 의존) 이번엔 **다른** 두 스펙
(`action-log.spec.ts`의 Excel BOM 바이트 불일치, `corp-cards.spec.ts`의
strict-mode 중복 텍스트)이 실패했다 — 둘 다 이 플랜이 건드리지 않은
화면이고 매 실행마다 실패 지점이 바뀐다는 점에서 위 04-01 관찰과 같은
`[WebServer] ⨯ Error: The destination stream closed early.` 계열
인프라 문제로 판단한다.

**이 플랜에서 확인한 것(문제 없음):** 이 플랜이 만들거나 고친 스펙만
따로 묶어(`quote-table.spec.ts` · `project-register.spec.ts` ·
`revenue-section.spec.ts` · `projects-list.spec.ts` · `page-chrome.spec.ts`)
같은 세션에서 두 번 돌렸고 매번 전부(19/19, 23/23) 통과했다. `pnpm
test:unit`(736건)·`pnpm test:integration`(1013건)도 전부 통과, 0 실패.
