# PR #104 Post-build `/review` 2차 기록

| 항목 | 값 |
|---|---|
| 날짜 | 2026-09-30 |
| 브랜치 | claude/gsd-verify-work-4 (기준 origin/main e539f17, 검토 헤드 0259991) |
| 범위 | PR 코드 diff 전체(`app` `domain` `repositories` `ui` `lib` `test` `playwright.config.ts`, 26파일 +988/−41). 1차 `/review`(fd64b7d2) 뒤 새 코드 우선: c1180ca+5218a03(T-04-31 구분자 허용 목록) · 43dd5de+2a7fc61(폰 44px) · 0aaa91a+9d64bd3(번호 열 숫자 규칙·등록 폼 첫 오류 포커스) · 1dbc516(Nyquist 테스트) |
| 검토자 | 핵심 패스(오케스트레이터) + 전문 6명(testing·maintainability·security·performance·design·simplification, Opus) + 적대 1 + Red Team 1(Opus). Codex 패스 생략 — CLAUDE.md 외부 검토 금지 |
| 결과 | critical 0 · 참고 4(아래 A~D) · 자동 수정 0 · 품질 8.0/10 · 코드 변경 없음 |

## 결함 — 사용자 결정 필요(ASK)

| # | 출처 | 발견 | 추천 |
|---|---|---|---|
| A | 적대 #1·#2·#3 + security (conf 8, 다중 확인) | c1180ca 뒤 읽기도 같은 스키마(`registry.ts:95` `def.schema.parse`)로 검증한다 — 허용 목록 밖 값이 이미 저장돼 있으면 `loadDocumentNumberFormat`(`domain/projects/index.ts:609`)이 ZodError를 던져 **프로젝트 등록 전부가 막힌다**. `handle-server-error.ts:23`이 ZodError를 로그 없이 「형식 오류 · 값 확인」으로 돌려줘 PM에겐 자기 입력 오류로 보인다. 설정 화면(`admin/settings/page.tsx:57-61`)은 빈 칸으로, 내보내기(`export.ts:56-59`)는 그 키를 조용히 빼고, 옛 백업 가져오기는 전부 거부된다. 현재 대책은 인계의 「배포 전 확인」(수동)뿐 | 결정 요청 — (1) 현 상태 유지 + 배포 전 수동 확인 (2) 읽기에서 허용 밖 값이면 기본값으로 대체하고 `log.error` 남김 (3) 읽기 실패를 일반 서버 오류로 바꿔 로그만 남김(등록은 계속 막힘) |
| B | Red Team + 적대 #4 (conf 7, 다중 확인) | 구분자 칸 힌트(`keys.ts:300`)가 허용 문자를 말하지 않고, 거부 문구는 일반 「형식 오류 · 값 확인」 — 관리자가 무엇이 허용되는지 알 수 없다(§7 「할 수 없는 선택지」) | 결정 요청 — 힌트를 「빈칸 또는 - _ . / 중 한 글자」로(화면 문구 변경) |
| C | 적대 #5 (conf 5) | 같은 번호에 붙는 접두어(`keys.ts:262` `z.string()`)는 제약이 없다. T-04-31 위협 문구(04-05-PLAN:264)는 「자릿수·구분자」라 접두어는 범위 밖 — 기록된 결정 없음 | 결정 요청 — 접두어도 제약할지(길이·문자). 안 하면 수락 위험으로 기록 |
| D | 적대 #6 (conf 6) | 프로젝트 검색 `ilike` 패턴(`repositories/projects.ts:164-165`)이 `%`·`_`를 이스케이프하지 않는다 — 이제 `_`가 허용 구분자라 `26_001` 검색이 `26-001`도 잡는다(더 넓게만 잡음, 누락·유출 없음). 이 PR 이전 코드 | 기록만 — 이 PR 밖 기존 코드. 후속 `/gsd-quick` 후보 |

## 알려진 질문(새 발견 아님)
- Red Team: 상세 머리 줄 「일괄 저장」·더보기 안 「프로젝트 복사」·「복사해 새 차수」가 폰 40px(SYSTEM.md:195) — 이미 올린 [사용자 결정 요청] 「폰 40px 3개」와 같은 건. 손대지 않음.

## 부록 — 낮은 신뢰도·수용·도달 어려움(보고만)
| 출처 | 발견 | 판정 |
|---|---|---|
| testing (conf 4) | 폰 `.alignRight > .sortLink { justify-content:flex-end }` 정렬을 재는 E2E 없음 | 부록 — D 후속과 함께 볼 후보 |
| testing (conf 4) | D-95 전수 검사 정규식이 `new` 없는 `Intl.NumberFormat(` 호출을 못 잡음(현재 호출 0) | 부록 |
| 적대 #7 | 자동 정산 `inArray(ids)` 바인드 수 — 기한 지난 진행 6.5만 행 이상에서 한도 | 도달 불가(10→30명 규모) |
| 적대 #8 | gate 규칙이 쓰기 경로의 단일 실패점 | 1차 리뷰에서 수용(fail-closed 의도) |
| 적대 #9 (conf 4) | 필드 없는 검증 오류(`_errors` 등)엔 포커스 이동 없음 | 부록 — 서버 오류는 FormAlert로 보임 |
| 적대 #10 | mobile-375 `workers: 1` | 1차 리뷰에서 수용(/plan-eng-review D3) |

## 핵심 패스 확인(결함 아님, 근거)
- `project-form.tsx:142-146` 포커스 effect는 `[result]` 의존 — 입력 중 다시 그리기로 포커스를 빼앗지 않음(E2E `project-register.spec.ts` (f1)이 고정). `Select`도 `aria-invalid`를 달아(`ui/select/Select.tsx:50`) DOM 순서상 첫 오류(클라이언트)로 간다.
- `Table.module.css` `.alignRight > .sortLink` — `Table.tsx:810-817`에서 Link가 th의 직계 자식이라 선택자가 맞음.
- 구분자 정규식 `/^[-_./]?$/` — m 플래그 없어 끝 줄바꿈 우회 없음(단위 테스트 `-\n` 거부).
- 유지보수·성능·디자인·단순화 전문가: 발견 없음.
