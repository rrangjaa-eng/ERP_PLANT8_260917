# PR #104 Post-build `/review` 4차 기록 — E1~E5 변경분 재확인

| 항목 | 값 |
|---|---|
| 날짜 | 2026-09-30 |
| 브랜치 | claude/gsd-verify-work-4 (origin/main a53762b(#106) 이미 반영 — 머지 불필요, 검토 헤드 dceea4f) |
| 범위 | quick 260930-ee9 코드 5커밋 `0c9384b..eb20fef`(`.planning` 제외 6파일 +63/−4): E1 d84123d `registry.ts` 주석 · E2 2888ba0 단위 테스트 · E5 156a8ec `export.ts` 주석 · E3 f2010c3 SYSTEM.md §7-1·§7-8 역참조 + 점검표 · E4 ab9b818 E2E 단언. 기준 보고서 `pr104-postbuild-review-3.md` |
| 검토자 | 핵심 패스(오케스트레이터) + 전문 3명(testing·maintainability·performance, Opus) + 적대 1(Opus). scope 신호는 범위 끝(eb20fef) 기준 backend·tests·docs — security(≤100줄)·design(frontend false)·simplification(≤100줄)·Red Team(≤200줄) 제외. Codex 패스 생략 — CLAUDE.md 외부 검토 금지 |
| 결과 | critical 0 · 참고 3(아래 G1~G3) · 부록 5 · 자동 수정 0 · 품질 8.5/10(10 − 참고 3 × 0.5) · **코드 변경 없음** |
| 확인 | typecheck rc=0 · lint rc=0 · 단위 `test/unit/settings` 78/78. 통합·E2E는 다시 돌리지 않음(260930-ee9 독립 검증: `CI=true` E2E 530/530 · 변이 RED E2·E4) |

## E1~E5 반영 여부(3차 대조)

| 3차 항목 | 판정 | 근거 |
|---|---|---|
| E1 `getSimpleSettingValues` 주석 | 해소 | 주석(`registry.ts:326-329`)이 본문 `parseStoredSimpleValue`(`:345`)·분기(`:148-154` — 표시+default면 대체·`log.error`, 아니면 `schema.parse`)와 일치 |
| E2 일괄 경로 엄격 테스트 | 해소 | `registry.test.ts:129-137` — `SIMPLE_DEF`(표시 없음 · `max(1)` · default 0.5)에 1.5 → reject · `log.error` 미호출 · 조회 1회. 일괄 경로가 표시를 무시하고 default로 바꾸면 0.5를 돌려 실패(변이 RED, 260930-ee9). 표시 키의 일괄 경로는 기존 `document-number-separator.test.ts:69`가 덮음 |
| E3 SYSTEM.md 역참조 | 해소(G3 참고) | §7-1(692)·§7-8(901)이 「프로젝트 상세 머리 줄 예외는 §3」을 가리키고, §3 「터치 목표」에 해당 예외가 실제로 있음 |
| E4 PC 「일괄 저장」 32 | 해소(G2 참고) | `mobile-touch-targets.spec.ts:202-215` — 한 번 편집 뒤 폭만 바꿔 1280·700에서 32 단언. 44 규칙은 `@media (max-width: 699.98px)`(CSS)라 재로드 없이 폭 변경으로 충분. Playwright 테스트마다 새 컨텍스트라 localStorage 누수 없음 |
| E5 내보내기 실효값 주석 | 해소(G1 참고) | `export.ts:61` 주석 추가. 3차 결정(문서화만) 범위 그대로 — 동작 변경 없음 |

Scope Check: CLEAN — Intent: 3차 참고 E1~E5를 동작 변경 없이 반영 · Delivered: 주석 2 · 단위 1 · E2E 단언 1 · 문서 역참조. 런타임 코드 경로 변경 0(performance 확인).

## 참고 — 코드 변경 없음(처리는 사용자 결정)

| # | 출처 | 발견 | 추천 수정 |
|---|---|---|---|
| G1 | maintainability (conf 7) + 적대 (conf 7), 다중 | 새 주석 `export.ts:61` 「허용 밖 저장값은 기본값으로 읽히므로(readInvalidAsDefault)」가 모든 키에 해당하는 것처럼 읽힌다. 실제로 표시 키는 하나(`keys.ts` 구분자)뿐이고, 나머지 비이력형 키는 `schema.parse`가 던져 바로 아래 `catch {}`(`:63-65`, 기존 코드)가 **로그 없이 그 키를 내보내기에서 뺀다** — 기존 catch 주석은 「기본값도 없고 값도 없는 키」만 적음 | 주석만: 「readInvalidAsDefault 표시 키는 …」으로 좁히고, catch 주석에 「표시 없는 키의 허용 밖 저장값도 여기서 건너뛴다」 추가. catch를 `SettingNotFoundError`로 좁히는 것은 동작 변경 — 별도 결정 |
| G2 | maintainability (conf 6) | E4 단언이 들어간 PC 테스트 제목(`mobile-touch-targets.spec.ts:169`)이 「상태 바꾸기」 32 · 「더보기」 없음 · 정렬 머리글만 적고 「일괄 저장」을 안 적음 — 실패 시 제목이 원인을 안 가리킴 | 제목에 「일괄 저장」 추가: `「상태 바꾸기」·「일괄 저장」 높이 32 · …` |
| G3 | 적대 (conf 5, 중간 신뢰도 — 확인 필요) | §7-1 「폰 40(프로젝트 상세 머리 줄 예외는 §3)」이 예외를 하나만 적어 목록처럼 읽힌다. §3 「터치 목표」는 폰 3차 버튼·시트·고정 줄도 44다(같은 §7-1 표에 3차 행이 있음). 변경 전엔 침묵이었고, 지금은 하나만 이름 붙여 나머지를 40으로 오독할 수 있음 | 역참조를 일반화: `폰 40(44 예외 — 3차 · 시트 · 고정 줄 · 프로젝트 상세 머리 줄 — 는 §3 「터치 목표」)`. 규칙 변경 아님, 문서 포인터만 |

## 부록 — 억제·낮은 신뢰도·반박(보고만)

| 출처 | 발견 | 판정 |
|---|---|---|
| testing (conf 6) + 적대 (conf 5) | `registry.test.ts:133` `.rejects.toThrow()`가 아무 오류나 받음 — `toBeInstanceOf(z.ZodError)` 제안 | 억제(체크리스트 「이미 동작을 덮는 단언을 더 조이라」). 지키려는 회귀(default 0.5 반환)는 이미 잡힌다. G 수정 때 같이 조여도 무방 |
| testing (conf 6) | E4의 `toBeVisible()`은 1280에서 편집이 안 먹어도 통과(≥1024는 `editableWidth`로 항상 렌더, `quote-table.tsx:2241`) — 편집 실패면 700 회차에서 「bounding box 없음」으로 실패 | 거짓 통과 아님(실패 위치만 늦음). `toBeEnabled()` 한 줄이면 실패 위치가 정확해짐 — 선택 |
| performance (conf 6) + 적대 | E4 블록 첫 줄 `login(page, seed.pm)`이 중복(앞 루프 마지막 회차가 이미 PM) — 로그인 1회분 시간 | 억제(무해한 중복, 읽기 쉬움). 블록을 독립적으로 읽히게 함 |
| maintainability (conf 5) + 적대 (conf 4) | 점검표 `docs/design/checks/2026-09-30-머리줄-44-역참조.md:5`의 「(195행)」은 SYSTEM.md 편집 시 낡음 · `:25` 스크린샷 항목이 `[x]`인데 본문은 「없음 — 육안 판정 금지 · 화면 변경 0」 | 기록물(그 시점 점검표) — 고치지 않음. N/A를 `[x]`로 적는 관행은 design-gate 템플릿 문제로 기록만 |
| 적대 #3 (conf 6) | 「일괄 경로에서 표시 키가 default로 대체되는 테스트가 없다」 | **반박** — `document-number-separator.test.ts:69` 「getSimpleSettingValues — 허용 밖 저장값도 기본값(빈 값)으로 읽고 log.error를 남긴다」가 이미 있음 |
| 적대 #2 (conf 6) | 내보내기→가져오기 왕복이 원값과 `log.error` 신호를 지운다 — 결정 기록 필요 | 기존 결정 — 3차 E5 「문서화만」(사용자 결정 E(1)). 다시 묻지 않음 |

## 핵심 패스 확인(결함 아님, 근거)
- CRITICAL 범주(SQL·경쟁·LLM 경계·셸·enum) 해당 없음 — 런타임 코드 변경 0(주석 2줄 블록, 테스트 2, 문서).
- 공유 코드 추출 제안 0 — 새 헬퍼·중복 로직 없음.
- 문서 낡음: SYSTEM.md 자체가 변경 대상, 루트 문서 영향 없음.

## 운영 메모
- gstack 1.91.9 업그레이드 안내가 떴으나 묶음 중간 도구 변경이라 건너뜀(1.91.2 그대로).
- 전문가 기본 diff는 main merge-base(= PR 전체)라, 프롬프트로 범위 `0c9384b..eb20fef`를 고정했다. scope 신호도 eb20fef 임시 worktree에서 계산(HEAD엔 main #106 머지가 섞임).

## 게이트 기록(사용자 작성)
STATE 현재 페이즈가 2라 훅이 이 리뷰를 `.claude/gates/phase-02.log`(미추적)에 적었다 — 커밋하지 않음. `phase-04.log`에 들어갈 줄:
`review 2026-09-30T11:31Z session=56ab3f54-01c4-5f2a-b586-0384ac8499e2`

[지시] 5909847801의 5줄은 이 세션 시작 시점(11:31Z)에도 `phase-04.log`에 없다(사용자 미반영 확인). 세션은 재시도하지 않았다.
