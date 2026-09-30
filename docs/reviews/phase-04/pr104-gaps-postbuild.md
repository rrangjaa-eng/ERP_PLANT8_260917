# PR #104 갭 묶음(04-52·04-53) Post-build 기록

| 항목 | 값 |
|---|---|
| 날짜 | 2026-09-29 |
| 브랜치 | claude/gsd-verify-work-4 (기준 origin/main ca7ead03, 검토 헤드 fd64b7d2) |
| 제품 파일 | domain/projects/auto-transition.ts · domain/rules/register.ts · repositories/projects.ts (+ playwright.config.ts, 테스트 7개) |

## 생략·해당 없음 (사용자에게 먼저 알림)
- `/design-review` 생략 — 04-52·04-53의 `app/`·`ui/`·토큰 diff 0.
- `/cso` 해당 없음 — 04-53은 시스템 행위자의 상태 전환·행 잠금. 인증·권한(`domain/auth`·`domain/permissions`)·라우트·외부 입력 diff 0.
- `/review`의 Codex 패스 생략 — CLAUDE.md 외부 검토 금지. Claude 적대 검토만.

## /review — critical 0 · 참고 2 (품질 9.0/10)
검토자(Opus): 핵심 패스 + 전문 5명(testing·maintainability·security·performance·simplification) + 적대 1 + Red Team 1.

| 출처 | 발견 | 판정 |
|---|---|---|
| testing | `loadProjectForGate`의 fail-closed throw(`project.auto_settle_gate_no_end_date`)를 확인하는 테스트 없음 (conf 6) | 미결 — 고칠지는 사용자 판단(다음 `/gsd-quick` 후보) |
| testing | 단위 fake `lockCandidates`에 보관·비진행 후보 음성 사례 없음 (conf 5) | 미결 — 위와 같이 |
| performance | 읽기 경로 왕복 1→2회, 잠금이 행별 gate 동안 유지 | 수용 — gate는 순수 JS, 평상시 후보 0이면 곧바로 반환 |
| performance | mobile-375 `workers: 1`로 폰 스펙 전체 직렬 | 수용 — /plan-eng-review D3 결정 |
| 적대 #1 | 규칙 미등록 시 읽기 경로가 조용히 정산 안 함 | 결함 아님 — `auto-transition.ts`가 `@/domain/rules/register`를 side-effect import, 등록 단위 테스트가 이름 고정 |
| 적대 #2·#6 | 후보 WHERE와 규칙이 어긋날 수 있음(주석만으로 지킴) | 수용 — 규칙은 현재 WHERE와 같음. 규칙을 넓힐 때 WHERE도 같이 볼 것 |
| 적대 #3 | 새 throw가 일반 서버 오류로 보임 | 수용 — 규칙이 종료일 null을 거르므로 도달 불가, fail-closed 의도 |
| 적대 #4·#5·#7·#8 | 문자열 날짜 비교 · 자정 경계 · `projectIds: []` · CI 샤드 DB 공유 | 이 PR 이전부터 있던 동작 또는 도달 불가 — 기록만 |
| Red Team | `settleProjectsByIds`가 종료일 null 행을 로그 없이 바꿀 수 있음 (conf 5) | 도달 불가 — 같은 tx에서 `isNotNull(endDate)` 후보만 잠근 id |

지정 점검:
- `repositories/projects.ts` 주석 수정 — 하위 선택 제거로 낡은 줄을 고친 것. 외과적 변경 규칙에 맞다.
- M6(`settleProjectsByIds`의 `eq(status, from)`) — 잠금 아래에서는 여분 방어. 무해해 그대로 둔다(nit).

## /qa — critical·high·medium 0 · low 1 (건강 점수 약 99, 잠정)
로컬 `CI=true pnpm build`(종료 0) → `pnpm start` :3100, DB erp_test, gstack 헤드리스 `$B`. 판정은 DOM·DB 실측.

| 확인 | 결과 |
|---|---|
| (a) 종료일 지난 진행·미보관 → 목록/상세 열면 정산 | PASS — 배지 「정산」, DB settling, action_log status_change 각 1행 (목록·상세 각각) |
| (b) 보관 · 종료일 오늘 | PASS — 진행 유지, 로그 0 |
| (c) 375 목록 오류 화면 · 다시 시도 | PASS — 「프로젝트 목록 불러오기 실패」+「다시 시도」, 복구 뒤 필터 폼, 가로 넘침 0 |
| (d) 상세 매출 섹션 1280·375 | PASS — 콘솔 오류 0 |

- ISSUE-001 (low, 콘솔): `/projects?new=1` 오류 경계 화면에서만 Minified React error #441 ×2. 화면·재시도 동작 영향 없음, 이 PR은 UI 변경 없음 → 보류.
- 오케스트레이터가 DB로 다시 확인: 정산 2건(로그 각 1) · 보관/오늘 종료 진행(로그 0) · `fx.recent_rate.USD` = 1300 복원.
