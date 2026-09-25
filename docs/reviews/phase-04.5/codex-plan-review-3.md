| 라운드 2 항목 | 상태 | 근거 |
|---|---|---|
| D1 백필 재생성 누락 | RESOLVED | `04.5-07-PLAN.md` Task 3③(a)·(d)에 노출 백필 SQL·주석 보존과 재적용 명시. ③(h)·verify에 전 계급 행 존재, 기존 `false` 보존, 거래처 한정 검사 추가. |
| D2 작업 브랜치에 Phase 4 미반영 | RESOLVED | `04.5-01-PLAN.md` 「실행 순서 — Phase 4 선행」에서 먼저 `origin/main` 병합 후 필요한 플랜 ID 합집합을 HEAD에서 검사. 03·04·05·06·07·09도 HEAD 기준으로 변경. |
| D3 재시드가 회수 권한 복구 | RESOLVED | `04.5-09-PLAN.md` Task 1⑥에서 기존 upsert 루프의 해당 메뉴 제외, view·write만 `insertPermissionIfAbsent`로 생성, 회수 후 재시드 회귀 테스트와 정리 명시. 실제 함수도 충돌 시 덮지 않음(`repositories/permissions.ts:70`). |
| NOTE 승인본 밖 오류 문구 | RESOLVED | `04.5-02-PLAN.md` OPEN 2-B, `04.5-05-PLAN.md` OPEN 5-A·5-B에 기존 오류 자리만 사용하고 도움말·확인 단계는 추가하지 않도록 명시. |

- **[MINOR] 백필 검증이 새 행의 `visible=true`를 확인하지 않음** — **근거:** `04.5-07-PLAN.md` Task 3③(h)6·verify의 `0|1|0` 검사는 행 존재와 PM의 `false`만 확인하므로, 나머지 계급까지 모두 `false`여도 통과한다. 실제 노출은 `true`여야 한다(`domain/permissions/visible.ts:22`). **수정:** PM 이외 모든 계급의 해당 행이 `visible=true`인지 검사하는 조건을 추가한다.

판정: 막는 문제 없음
