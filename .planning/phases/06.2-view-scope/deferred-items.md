# 06.2 deferred items (실행 중 발견 · 범위 밖)

## 06.2-04 실행 중 (2026-10-08)

이 플랜 변경이 원인이 아닌 기존 실패 — 06.2-03의 입구 관문(D-6206 · listQuoteLines 차수 관문)에 맞춰 갱신되지 않은 테스트. CI 전체 통합에서 붉다.

| 테스트 | 실패 | 원인(판단) | 확인 |
|---|---|---|---|
| test/integration/project-status.test.ts:378 「(j) D11 — 다른 팀 팀장은 거부 …」 | 「다른 팀 프로젝트 · 상태 바꾸기 권한 없음」 대신 「존재하지 않는 프로젝트」 | 06.2-03 changeProjectStatus가 트랜잭션 전 findProjectInScope — view_scope team인 다른 팀 팀장에게 프로젝트가 안 보여 404가 먼저 | status.ts를 5f4da3ee로 되돌려도 같은 2건 실패 |
| test/integration/project-status.test.ts:483 「M1 — 전환 권한이 없는 담당 PM·다른 팀 팀장 …」 | GateBlockedError 대신 「존재하지 않는 프로젝트」(다른 팀 팀장 갈래) | 같음 | 같음 |
| test/integration/vendor-kind.test.ts:239 「고정 — 견적 줄 거래처를 client로 바꿔도 …」 | 「존재하지 않는 차수」 | 06.2-03 listQuoteLines → canOpenRevision 관문 — 테스트 계급이 view_scope team · 팀 없음(Pitfall 2) 추정 | 이 플랜은 listQuoteLines · canOpenRevision을 고치지 않았다 |

결정(06.2-06에서 반영 · 독립 검토 F-1): project-status 2건은 테스트 기대를 「존재하지 않는 프로젝트」(ProjectNotFoundError)로 바꾼다 — D-6203 · D-6219가 본부 책임자를 company에서 org_unit으로 좁혔고 D-6206이 범위 밖을 404로 숨긴다. 옛 「다른 팀 프로젝트 · 상태 바꾸기 권한 없음」 문구는 보는 범위 company · 업무 범위 team 계급(프로젝트는 보이는데 업무 범위가 안 덮음)으로 따로 고정했다. 본부 책임자는 자기 본부 팀 프로젝트만 통과, 다른 본부는 없음. vendor-kind 1건은 Pitfall 2 픽스처(viewScope company)로 고쳤다.
