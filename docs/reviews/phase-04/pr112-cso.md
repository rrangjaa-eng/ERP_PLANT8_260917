# /cso — PR #112 (quick 260930-kc9, PR #104 후속 F(2)) 해당 여부 판단

- 판단: **해당 없음 — `/cso`를 호출하지 않았다.** CLAUDE.md §4는 인증·권한·암호화·외부 입력(결제 포함)을 건드릴 때 `/cso`를 필수로 둔다. 이 PR의 diff는 그 넷 중 어느 것도 바꾸지 않는다(아래 파일 단위 표).
- 범위: `f3242c8..3e02740`(30파일). origin/main `9d695fc`는 이미 포함되어 있다(`git log HEAD..origin/main` 0줄).
- 위험 경로(§4 머지 목록: `db/`·`domain/auth/`·`domain/permissions/`·`lib/crypto*`·`scripts/`·`.github/`·`infra/`·`.claude/`·CLAUDE.md): 변경 0.
- diff 전체(app·ui·domain·lib)에서 `use server`·서버 액션 정의·`can(`·session·auth·`dangerouslySetInnerHTML`·`fetch(`·SQL·`db.` 추가: 0줄.
- 이전 보고: `pr104-cso.md`(PR #104, No supported findings). 이 PR은 그 뒤 화면·접근성 후속이다.
- Codex 외부 검토는 하지 않았다.

## 파일 단위 판단

| 파일 | 변경 | 인증·권한·암호화·외부 입력 |
|---|---|---|
| `app/(app)/admin/settings/page.tsx` | 설정 이력 숫자 포맷(`formatNumberValue` — numberKind별 포맷터, 없으면 정수 쉼표·소수 원값) | 없음. 서버 렌더 읽기 전용 표시. 값은 React 텍스트로 이스케이프된다. 권한 가드(`can(session.viewer, "admin.settings", "view")`, 155행)는 diff 밖이며 그대로다 |
| `app/(app)/admin/settings/settings-form-client.tsx` | 힌트·오류 `<p>`에 id, 칸에 `aria-describedby`·`role="group"`·`aria-labelledby` | 없음. id 재료 `fieldKey`는 코드 레지스트리의 `def.key`(정적)다. `execute({ key, value })` 호출과 입력 파싱은 바뀌지 않았다 |
| `ui/input/TextField.tsx` | `hintId` prop → `aria-describedby`에 합침 | 없음. 속성 연결만 |
| `app/(app)/projects/[id]/quote-table.tsx` | 머리 줄 버튼 묶음을 변수로 빼고 폰(<700)에서 렌더 순서만 바꿈(`usePhoneWidth`) · 행 번호 `<span>` | 없음. 버튼 노출 조건(`newRevision`·`copyProjectHref`·`statusChange`·`canSave`)은 그대로다. 서버 액션·권한 판정은 서버 쪽이며 바뀌지 않았다 |
| `app/(app)/projects/[id]/previous-revision.tsx` | 번호 열 `cell`을 `<span>`으로 | 없음 |
| `domain/settings/export.ts` | 주석 두 줄만 | 없음. 코드 동작 변경 0 |
| `*.module.css`·`ui/button/Button.module.css` | 스타일 | 없음 |
| `test/**` | E2E·단위 테스트 | 해당 없음 |
| `docs/**`·`.planning/**`·`TODOS.md` | 기록 | 해당 없음 |

## 남긴 것

- 인계의 「(후속 범위, /cso) 프로젝트 번호가 내보내기 파일 이름에 들어가는지 · 구분자 `/` 정규화 확인」은 PR #104 `/cso`에서 넘어온 메모이고 이 diff와 관계없다. 이 PR에서 범위를 넓히지 않았다.
- 사용자 결정 D1(5918701321)·D2(5919814462)는 보안과 무관하며 아직 답이 없다.
