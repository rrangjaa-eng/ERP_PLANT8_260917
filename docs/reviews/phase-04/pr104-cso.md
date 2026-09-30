# /cso — PR #104 자체 커밋 (T-04-31 구분자 허용 목록 · 읽기 대체)

- 상태: **partial**. 정적 감사만 했다. 명령은 `--code --diff --offline`, 기준 `d6b3e40`(origin/main), 대상 HEAD `de3618c`, run `1790755400956-b1e667c201b51b88`(helper `gstack-cso` 3.0.0, finish 완료). 별도 worktree(스크래치패드 `cso-wt`, detached)에서 실행했다.
- 결과: **No supported findings in the assessed scope.**
- 기준: `.planning/phases/04-project-quote-ledger/04-SECURITY.md`(T-04-31 CLOSED · T-04-78 CLOSED). 이전 보고: `bundle4-cso.md` · `260929-9zo-cso.md`.
- 코드 변경: 없음. 헬퍼는 저장소를 고치거나 커밋하지 않았다. worktree `git status` 0줄, HEAD `de3618c` 그대로인 것을 확인했다.
- 런타임 재현·스캐너: 실행하지 않았다(daily static, `--offline`, 정성 프로필 없음).
- 절차 기록:
  - 첫 submit이 스키마 오류(`gaps must be an array`)로 한 번 거부됐다. 한 번만 고쳐 다시 제출해 받아들여졌고, finish는 별도 명령으로 했다(260929-9zo의 「finish가 먼저 닫음」 반복 없음).
  - 독립 에이전트 반박 대신 **sequential challenge; independent agent unavailable**(10분 예산 안).
  - Codex 외부 검토는 하지 않았다.

## 범위

지난 /cso(260929-9zo, PR #85 — main에 머지됨) 뒤 PR #104의 코드 커밋. docs/·.planning/·.claude/는 뺐다.

| 커밋 | 파일 | 보안 관련 |
|---|---|---|
| 5218a03 → c1180ca | `domain/settings/keys.ts` | 구분자 쓰기 허용 목록 `^[-_./]?$` (T-04-31) |
| 6d3474b → a456205 | `domain/settings/registry.ts` · `keys.ts` | 허용 밖 저장값 읽기 대체 + `log.error` |
| 4c4d16c → e9b7796 | `keys.ts` hint | 문구만 |
| 7be9072 (wip, 04-52·04-53) | `domain/projects/auto-transition.ts` · `domain/rules/register.ts` · `repositories/projects.ts` | 자동 정산 판정을 gate 규칙으로 옮김 — 아래 「보충 점검」 |
| 2a7fc61·43dd5de · 9d64bd3·0aaa91a · 7d2ffa0·0149cc6 | app/·ui/ tsx·css, playwright.config.ts, 테스트 | 화면(44px·첫 오류 포커스)·테스트 설정. 새 sink 없음 |

## 지정 항목 판단 (c1180ca · a456205)

| 점검 | 위치 (HEAD de3618c) | 판정 |
|---|---|---|
| 쓰기 허용 목록 | `keys.ts` `DOCUMENT_NUMBER_PROJECT_SEPARATOR` `schema: z.string().regex(/^[-_./]?$/)` | 빈 값 또는 `- _ . /` 한 글자만 통과. JS 정규식 `$`는 끝의 개행 앞에서 매치하지 않아(`m` 플래그 없음) `"-\n"` 같은 값도 거부된다 |
| 쓰기 경로 | `registry.ts` `setSettingValue` | `can(admin.settings, write)` → `schema.parse` → upsert 순서. 대체 로직을 타지 않는다(쓰기 검증은 그대로) |
| 읽기 대체 범위 | `registry.ts` `parseStoredSimpleValue` 149-154 | `readInvalidAsDefault && default !== undefined`인 키만 대체한다. 다른 키는 `schema.parse`가 그대로 던진다. 단건 `getSettingValue`와 일괄 `getSimpleSettingValues`(343)가 같은 함수를 쓴다. `readInvalidAsDefault: true`는 프로젝트 구분자 하나뿐이다(연차 구분자 `DOCUMENT_NUMBER_LEAVE_SEPARATOR`에는 없다) |
| 로그에 원값이 없는가 | `registry.ts:152` · `lib/log.ts` `write` | 필드는 `key`(정의 상수)와 `issues`(zod issue `code` 배열)뿐이다. `lib/log.ts`는 `{severity, message, time, event, ...fields}`만 `JSON.stringify`한다 — 저장값·메시지·path가 들어갈 경로가 없다. **원값 0** |
| 채번 sink | `domain/document-numbering/index.ts:54` | `${prefix}${year}${separator}${seq}` 문자열 조합뿐이다. LIKE·정규식·SQL에 구분자가 들어가지 않는다. 충돌은 `projects_number_key` UNIQUE가 막는다(T-04-31 증거와 같음) |
| 대체의 fail-safe | 위 | 허용 밖 값이 채번을 막지 않고 빈 구분자로 계속 채번한다. 과거 허용 밖 값(예: 두 글자)으로 이미 나간 번호와 새 번호는 문자열이 달라 겹치지 않는다. 겹치더라도 UNIQUE가 거부한다 |

## 보충 점검 — 7be9072 자동 정산 gate (헬퍼 밖)

헬퍼 `history`가 `MISSING_INPUT`(Git 로그 출력 한도 초과)을 돌려줘 이 커밋의 변경 부분을 run 안에서 따로 떼어 보지 못했다. 그래서 run이 끝난 뒤 `git diff origin/main..HEAD`로 89줄을 직접 읽었다. 이 점검은 **헬퍼 기록 밖**이다.

- 행위자는 `SYSTEM_VIEWER`(T-04-78 그대로)다. `settleProjectsByIds(SYSTEM_VIEWER, …, tx)`를 쓴다. 사용자 입력이 새로 들어오는 곳은 없다.
- `lockAutoSettleCandidates`가 FOR UPDATE SKIP LOCKED로 후보를 잠근다. gate `project.auto-settle`이 전이표 쌍·종료일 < 오늘(KST)·보관 아님을 판정한다. `settleProjectsByIds`는 같은 tx에서 허용된 id만 `status = from` 가드로 바꾼다. 잠금 뒤에 판정하므로 TOCTOU가 없다.
- `inArray(projects.id, input.ids)`는 drizzle 파라미터다. 허용된 id가 0개면 바로 끝난다.
- 쓰기 입구 `loadProjectForGate`가 같은 규칙을 쓴다. 허용됐는데 종료일이 null이면 throw해 tx를 되돌린다(fail-closed).
- 판정: 권한·주입·경합 경계에서 새 결함을 찾지 못했다.

## 순차 반박 (sequential challenge; independent agent unavailable)

- **관리자가 허용 밖 값을 넣을 수 있나?** 설정 저장은 `schema.parse`에서 거부된다. 가져오기도 거부한다(/review 3차 확인). 허용 밖 값은 DB에 직접 쓰거나 T-04-31 이전에 저장된 행에서만 생긴다.
- **대체가 권한 우회나 정보 노출이 되나?** 읽기 대체는 값을 빈 문자열로 바꿀 뿐이고, 권한 판정과는 관계가 없다. 로그 필드는 위와 같다.
- **대체가 감사 추적을 흐리나?** 대체는 서버 로그(`settings.invalid_stored_value`)만 남기고 action log에는 남지 않는다. 설정을 바꾸는 쓰기가 아니라 읽기라서 action log 대상이 아니다. /review 3차 E5(내보내기가 실제로 쓰이는 값을 담음)와 같은 결이다. 새 발견이 아니라 기록된 참고 항목이다.
- **`/`가 번호에 들어가 경로 문제를 만드나?** 사용자가 허용 목록에 넣은 값이다(PR #104 결정). 프로젝트 라우트는 번호가 아니라 id(`/projects/[id]`)를 쓴다. 파일 이름에 번호가 쓰이는지는 이번 범위 밖이다 — 아래 후속 범위.

## 커버리지 (헬퍼 제출값)

| domain | status | 비고 |
|---|---|---|
| snapshot-inputs | partial | .planning 이미지 등 바이너리는 읽지 않음(범위 밖) |
| history-inputs | not_assessed | 헬퍼 Git 로그 `MISSING_INPUT` |
| application-model | assessed | 설정·채번·로그 경로 |
| attack-surface | partial | 7be9072 헝크 격리 못 함 → 보충 점검으로 메움(헬퍼 밖) |
| llm-agentic-mcp | not_applicable | 변경 경로에 없음 |
| owasp-2025 | partial | A01·A05·A09·A10 정적. 런타임 없음 |
| stride | partial | T·I·D 점검. R은 서버 로그만(수용) |
| data-classification | assessed | 로그 필드 추적 |

## 후속 범위 (이번 범위 밖 · 발견 아님)

- 프로젝트 번호가 내보내기 파일 이름(`Content-Disposition`)에 들어가는 경로가 있는지 확인. 구분자 `/`가 허용되므로 파일 이름 정규화 여부를 본다.
- 배포 전 운영·스테이징의 「프로젝트 번호 구분자」 값 확인(인계의 사람 확인 항목 그대로).

## 게이트 기록 (사용자 작성)

훅이 이번 /cso를 `.claude/gates/phase-02.log`(미추적)에 잘못 적었다. 그 파일은 커밋하지 않는다. `phase-04.log`에 들어갈 줄은 아래와 같다(훅이 적은 시각 그대로).

`cso 2026-09-30T08:02Z session=efcaa672-fc1d-5f87-90e1-a41d52429074`
