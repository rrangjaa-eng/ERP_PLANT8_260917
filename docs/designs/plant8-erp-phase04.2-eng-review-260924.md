# Phase 04.2 알림·공휴일 기반 — /plan-eng-review (2026-09-24)

- 대상: `.planning/phases/04.2-notify-holidays-foundation/04.2-01..15-PLAN.md` (+ CONTEXT·RESEARCH·UI-SPEC·VALIDATION)
- 브랜치: claude/plan-phase-04-2-rnbvuq (origin/main 병합 후 4991abe 기준)
- 방식: Sonnet 1차 대조 3묶음(엔지니어링 4관점, 저장소 코드 대조) + Codex 전체 세트 최종 검토 3묶음 동시 실행 → Opus 판정.
  원문: `/mnt/project-files/04.2-gates/eng-first-pass-{A,B,C}.md`, `codex-final-{A,B,C}.md`
- 비대화 스레드 세션: 결정은 추천안으로 자동 선택, 적용은 다음 세션(D-01 세션 경계 — 이 세션에서 gsd-planner 불가).

## Step 0 범위 점검
- 15개 플랜·7웨이브, 요구사항 4/4·결정 5/5 담당 플랜 있음. wave/depends_on 순환 없음, 같은 웨이브 files_modified 겹침 없음(1차 C, Codex C 모두 확인).
- 범위 축소 제안 없음(락된 D-7xx 결정 범위). 복잡도 관문은 계획 단계에서 이미 통과한 구성을 유지.

## 섹션 1~4 (Sonnet 1차 대조)
- 아키텍처·코드 품질·테스트·성능: 3묶음 모두 file:line 근거를 갖춘 막는 문제 없음. 저장소 참조 약 35곳 대조 일치.
- 참고(비차단): 04.2-01 `notification_log.id` bigint `mode` 명시 권장(action_log.seq 선례 `mode:"number"`), 04.2-05 빈 `NOTIFY_TICK_SCHEDULER_SA` 정규화, 04.2-08 `--operator` 39자 경계 테스트, 04.2-10이 참조하는 04-32 커밋(b395483·c9e70ea)은 Phase 4 브랜치 fetch 필요.

## Outside Voice — Codex 최종 전체 검토 (4회차): Request changes
Opus 판정: 아래 7건 모두 저장소 근거를 직접 확인해 **막는 문제로 인정**. 같은 지적이 세 묶음에서 겹친 1건(DB 응답 무기한 대기)은 하나로 합침.

| # | 플랜:줄 | 문제 | 근거 확인 | 수정 방향(추천) |
|---|---|---|---|---|
| E1 | 04.2-04:178 | 모니터링 `conditionAbsent` 25시간(`90000s`)은 GCP 상한 23.5시간 초과 → 배포 시 정책 생성 실패 | 현재 템플릿 `infra/monitoring/tick-stale.json.tpl:11` `84600s` | 지원되는 방식(예: 25시간 성공 건수 집계 조건)으로 바꾸고 0건·시계열 없음 둘 다 검증 |
| E2 | 04.2-01:229 | 배치 상한 10,000 × 후보 7필드 = 70,000 파라미터 > PostgreSQL 65,535 → tick 롤백 | 계획 `max(10000)` | 상한을 안전한 값(예: 5,000 이하)으로 낮추거나 배열/UNNEST 단일 문장 명시 + 최대값 테스트 |
| E3 | 04.2-01:178·231, 04.2-10:127 | 조건 평가 실패 시 그 종류가 미완료 목록에서 빠져, 일부만 만든 묶음이 메일로 나감(“다 만들어진 뒤 한 통” 계약 위반) | 계획 본문 | 최신 평가에 실패가 있으면 해당 수신자(또는 전체) 메일 선점 보류, 성공 평가 뒤 재개 + `부분 삽입→평가 실패→복구` 테스트 |
| E4 | 04.2-01:140, 04.2-06:119, 04.2-10:131·198 | 연결을 잡은 뒤 DB 응답이 멈추면 무기한 대기(BEGIN·SET·COMMIT·ROLLBACK 포함) → 170초 종료 보장 불성립 | `node_modules/pg/lib/defaults.js:76` `query_timeout: false`, `lib/db-transaction.ts:9` | 클라이언트 측 마감(query_timeout 또는 연결 파기)을 트랜잭션 시작~종료 전체에 적용, 예산에 포함, 응답 정지 회귀 테스트 |
| E5 | 04.2-03:163 | 로그인 실패 트랜잭션이 잠금을 쥔 채 전역 풀로 `findUserByEmail` 호출 → 풀 5개가 차면 교착 | `repositories/users.ts:10`(전역 `db`), `lib/env.ts:54` `DB_POOL_MAX` 5 | 사용자 조회를 트랜잭션 밖으로 옮기거나 tx 전달 + 연결 1개 풀 회귀 테스트 |
| E6 | 04.2-06:264 | 재계산 롤백 테스트가 더는 호출되지 않는 `insertHolidayRows`에 실패를 주입 → 필수 테스트가 성립 안 함 | 계획 06:120·278은 `insertSubstituteRows` 사용 | 주입 대상을 `insertSubstituteRows`(삭제 뒤)로 교체 |
| E7 | 04.2-14:101·134 | 사용자 확인 질문이 `deploy.sh` 직접 실행만 물음. 브랜치 수동 스테이징 배포(Actions)는 조회 범위(최근 1,000건) 밖이면 놓침 | `.github/workflows/deploy.yml:22·46·51` workflow_dispatch staging | 조회 페이지네이션으로 브랜치 이력 전체 포괄, 불완전하면 중단. 질문을 “Actions·직접 실행 등 모든 경로로 초안 적용 여부”로 넓히고 모름·무응답이면 중단(운영 DB 직접 조회는 여전히 안 함) |

비차단(참고): 요약 메일 20건 제한은 있으나 항목 길이·전체 바이트 상한 없음 / UI-SPEC R1~R10·R10 선행조건은 다음 /plan-design-review 몫.

3회차 이월 판정: 미완료 목록 경쟁·교차 연도 대체일·누적 요약 건수는 해결. 실행 예산은 E4로, 마이그레이션 이력은 E7로 남음.

## 테스트 검토 요약
- 기존 계획의 테스트는 구체 단언·실제 경합(두 번째 풀 연결·장벽) 방식이며 1차 대조에서 빈틈 없음.
- 추가 필요(위 수정과 함께): E2 최대 배치 테스트, E3 평가 실패 복구 테스트, E4 응답 정지 테스트, E5 1연결 풀 교착 회귀, E6 주입 대상 교정.

## 성능 검토
- keyset 페이지네이션·인덱스(recipient_id, created_at, id)·배치 상한 구조는 적절. E2(파라미터 한도)만 문제.

## 이관 문구(예약 마이그레이션 번호) — 다음 세션에서 계획 경로로 수정
- `04.2-CONTEXT.md:29`, `:45`, `:107`, `04.2-RESEARCH.md:336`, `:345`가 0011~0016/0017~/0020~/0021~0024 같은 예약 범위를 현재 입력처럼 적음. 플랜 15개에는 없음(04.2-06:124는 올바른 방식 서술).
- 대체 문구 제안: `/mnt/project-files/04.2-gates/eng-first-pass-C.md` 표. 원칙: 예약 번호 없음, `pnpm db:generate`, 머지 전 main 병합 후 자기 마이그레이션 삭제·재생성, 가드 테스트 `test/unit/db/migration-journal.test.ts`.

## 자동 선택한 결정
- D1 범위: 원래 구성 유지(축소 없음).
- D2 E1~E7: 모두 “수정”(추천안). 적용은 다음 세션 `/gsd-plan-phase 04.2` 수정 모드 + 검사기 + Codex 2회차(이 7건 해결 여부와 바뀐 부분만). 막는 문제 없음이 나오면 04.2 최종 Codex 조건 충족.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|---|---|---|---|---|---|
| Eng Review | /plan-eng-review 04.2 | 실행 전 계획 게이트 | 1 | ISSUES_OPEN | 막는 문제 7(E1~E7), 참고 5 |
| Outside Voice | Codex (전체 세트 3분할) | 최종 교차 검토 | 1 | Request changes | E1~E7의 출처 |

- VERDICT: 계획 수정 필요 — 수정 후 Codex 2회차(지난 지적+바뀐 부분)에서 막는 문제 없음이 나와야 실행 가능.
- CROSS-MODEL: Sonnet 1차 대조는 막는 문제 0, Codex는 7. Opus가 7건 모두 저장소 근거로 확인해 Codex 쪽을 채택.

**UNRESOLVED DECISIONS:**
- 스킬 관문 훅은 gsd-executor 실행 전 phase-04.2.log에 plan-ceo-review를 요구하나 소수점 페이즈는 CEO 검토 생략(사용자 결정 대기, 이 세션에서 건드리지 않음)
