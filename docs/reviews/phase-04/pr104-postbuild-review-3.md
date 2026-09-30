# PR #104 Post-build `/review` 3차 기록 — 고친 변경분 재확인

| 항목 | 값 |
|---|---|
| 날짜 | 2026-09-30 |
| 브랜치 | claude/gsd-verify-work-4 (origin/main d6b3e40 포함 — 앞선 main 커밋 0, 머지 불필요, 검토 헤드 49e709b) |
| 범위 | quick 260930-4xr 변경분 `0d7050e..49e709b`(`.planning` 제외 12파일 +206/−12): A(2) 구분자 읽기 기본값 대체 + `log.error`(a456205) · B 힌트 문구(e9b7796) · 폰 머리 줄 44(0149cc6) · DECISIONS 2026-09-30 · SYSTEM.md §3 · 점검표. 기준 보고서 `pr104-postbuild-review-2.md` |
| 검토자 | 핵심 패스(오케스트레이터) + 전문 6명(testing·maintainability·security·performance·design·simplification, Opus) + 적대 1 + Red Team 1(Opus, DIFF 218줄 > 200). Codex 패스 생략 — CLAUDE.md 외부 검토 금지 |
| 결과 | critical 0 · 참고 5(아래 E1~E5) · 부록 1 · 자동 수정 0 · 품질 7.5/10(10 − 참고 5 × 0.5) · **코드 변경 없음** |
| 확인 | typecheck rc=0 · lint rc=0(경고만) · 단위 `test/unit/settings` 77/77. 통합·E2E는 다시 돌리지 않음(260930-4xr 독립 검증: 통합 49/49 · E2E 4/4 · CI=true DOM 실측) |

## 2차 지적의 해소 여부(Red Team·적대 대조)

| 2차 항목 | 판정 | 근거 |
|---|---|---|
| A — 허용 밖 저장값이면 프로젝트 등록 전부 막힘 | 해소 | `createProject` → `loadDocumentNumberFormat`(`domain/document-numbering/index.ts:97-104`) → `getSettingValue` → `parseStoredSimpleValue`가 `""` 반환(`registry.ts:148-154`). 통합 `document-numbering.test.ts`가 `#` 저장 상태에서 번호 `26001` 생성 확인. 거래 안 재읽기는 `seqStart`만 |
| A — PM에게 「형식 오류 · 값 확인」만 보임 | 해소 | 구분자 읽기가 ZodError를 던지지 않음 |
| A — 서버 로그 없음 | 해소 | `log.error("settings.invalid_stored_value", { key, issues: codes })`(`registry.ts:152`). 원래 값은 로그에 없음(단위 단언). 등록·설정 화면·내보내기 한 번에 한 줄 — 범람 없음 |
| A — 설정 화면이 빈 칸 | 해소 | 화면(`page.tsx:91-97`)이 실제 채번 값 `""`을 보임. 칸을 벗어나면 `""`이 저장돼 `#`이 지워짐 |
| A — 내보내기에서 키가 빠짐 | 해소(E5 참고) | `export.ts:61`이 `""`을 씀. 통합 (j) |
| 가져오기는 여전히 거부 | 유지 | `export.ts:154` `def.schema.safeParse` · 통합 (e)가 `#` 거부 |
| 대체가 구분자 키에만 | 유지 | `readInvalidAsDefault: true`는 `DOCUMENT_NUMBER_PROJECT_SEPARATOR`에만(`keys.ts`), `default` 없으면 기존 `parse` |
| B — 힌트에 허용 문자 없음 | 해소 | `keys.ts:302` 「빈칸 또는 - _ . / 중 한 글자」([지시] 문구 그대로) |
| C — 접두어 무제약 | 수락 기록 | 260930-4xr SUMMARY 「Accepted risks」 |
| 폰 40px 3개 | 해소 | 세 요소 모두 `.headerActions` 안에서 `headerTouchButton`(`quote-table.tsx:2227`·`:2246`, `revision-dialogs.tsx:76` — 같은 `project-detail.module.css`). 선택자 (0,2,0) > `.btn` (0,1,0), `min-height`가 `height`를 이김, 규칙은 `<700` 미디어 블록 안. `Button`은 className을 `<button>`에 붙이고 `.btn`은 `inline-flex`라 `<a>`에도 적용 |

## 참고 — 코드 변경 없음(처리는 사용자 결정 E)

| # | 출처 | 발견 | 추천 수정 |
|---|---|---|---|
| E1 | maintainability (conf 8) | `registry.ts:326` `getSimpleSettingValues` 주석이 여전히 「행이 있으면 schema.parse」 — 본문은 `parseStoredSimpleValue`로 바뀌어 `readInvalidAsDefault` 키는 던지지 않고 default로 대체 | 주석을 `parseStoredSimpleValue`(표시된 키는 허용 밖 값을 default로)로 고침. 한 줄 |
| E2 | testing (conf 6) | 일괄 읽기 경로(`registry.ts:343`)에서 **표시 없는 키가 여전히 던지는지** 단위 테스트가 없다 — 엄격 경우는 `getSettingValue`만(`registry.test.ts:100-108`). 일괄 경로가 표시를 무시하게 바뀌어도 테스트가 안 깨짐 | `registry.test.ts`에 `getSimpleSettingValues([SIMPLE_DEF])` + 저장값 1.5 → reject, `log.error` 미호출 |
| E3 | design (conf 6) | SYSTEM.md §3(195)만 예외를 적었고 §7-1(692 「높이 PC 32 · 폰 40」, 예시가 「일괄 저장」·「복사해 새 차수」)·§7-8(901 「시트 밖 폰 버튼은 그대로 40(§7-1)」)은 §3 예외를 가리키지 않는다 — §7만 읽으면 지금 44인 버튼을 40으로 읽는다 | §7-1·§7-8에 「프로젝트 상세 머리 줄 예외는 §3」 역참조만. 일반 규칙화 아님(결정 범위 안) |
| E4 | Red Team (conf 6) | E2E PC 1280·700 가드(`mobile-touch-targets.spec.ts:170`)가 「프로젝트 복사」·「복사해 새 차수」 32만 단언하고, 이번에 같은 className을 받은 「일괄 저장」은 단언하지 않는다 — 폰 규칙이 PC로 새도 이 버튼은 못 잡음(독립 DOM 감사에서 32 실측은 있었음) | PC 루프에서 기간 칸을 바꿔 「일괄 저장」을 띄우고 높이 32 단언 추가 |
| E5 | 적대 (conf 5) + Red Team (conf 4), 다중 | 내보내기(`export.ts:61`)가 읽기 경로를 써서 저장된 `#` 대신 `""`을 백업 파일에 쓴다 — 파일이 DB와 다르고, 되가져오면 `#`이 `""`로 덮여 `log.error` 신호도 사라진다. 작업 기록은 `scope:'import'`뿐. 실효값은 같아 손상은 아님. A(2)(읽기 대체)의 결과이지만 어디에도 적혀 있지 않음 | 기록된 결정 안에서는 문서화만: export 주석에 「내보내기는 저장 원값이 아니라 실효값」 한 줄. 원값을 내보내는 쪽은 새 결정 |

## 부록 — 낮은 신뢰도(보고만)
| 출처 | 발견 | 판정 |
|---|---|---|
| 적대 (conf 4) | `readInvalidAsDefault?: true`가 모든 `SettingDef`에 열려 있으나 이력형 경로(`registry.ts:134`·`:318`)는 여전히 `parse` — 이력형 키에 붙이면 조용히 무효 | 지금 쓰는 곳은 비이력형 구분자 하나뿐. 타입 제한은 추측성 방어(CLAUDE.md §3.2) — 기록만 |

## 핵심 패스 확인(결함 아님, 근거)
- security·performance·simplification 0건. 로그에 원래 값 없음 · 쓰기 검증(관리자 저장·가져오기)은 그대로 · 대체는 표시된 키에만.
- 채번 충돌: `#`→`""`로 바뀌어도 순번은 계속 증가하고 `projects_number_key` 전역 UNIQUE가 있어 조용한 중복은 불가(적대).
- 되돌리면 깨지는 테스트: 플래그·헬퍼 제거 → 단위·통합 ZodError, className 제거 → E2E 40 < 44(적대).
- 계획 대조([지시] 5903477924): A(2)·B·C 수락·폰 44 모두 반영, 범위 밖 변경 없음(Scope Check: CLEAN).

## 게이트 기록(사용자 작성)
STATE 현재 페이즈가 2라 훅이 이 리뷰를 `.claude/gates/phase-02.log`(미추적)에 적었다 — 커밋하지 않음. `phase-04.log`에 들어갈 줄:
`review 2026-09-30T07:07Z session=486526e8-538d-537a-b95c-16713e3da5c0`
