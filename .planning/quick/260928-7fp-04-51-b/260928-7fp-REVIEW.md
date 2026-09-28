# 260928-7fp 독립 검토 — 04-51 결정 ②(b) (9e286b2 RED · 3fc1bf6 fix)

범위: `git diff 7bd5496..3fc1bf6` — `domain/document-numbering/index.ts`, `test/integration/document-numbering.test.ts`
판정: **통과 (blocker 없음)** — should 2 · nit 3

## 1. 정확성

- 술어 `counterValue >= 1 && parsed.data < currentStart` — 요구(올해 발급 ≥1 AND 새 값 < 현재 값일 때만 거부)와 일치.
- 겹침 없음 증명: 올해 카운터 c, 현재 시작값 s일 때 올해 발급된 모든 번호 ≤ c + s − 1(시작값은 올해 안에서 올라가기만 하므로 이전 번호는 모두 이 값 이하). s' ≥ s로 저장하면 다음 번호 = (c+1) + s' − 1 ≥ c + s > 이미 매긴 최대. 이전 인상 이력과 무관하게 성립.
- 문자열 입력: `defs.seqStart.schema`는 `z.coerce.number().int().min(0)` → `parsed.data`는 number, `currentStart`도 `getSettingValue`가 schema.parse로 number. 비교는 숫자 비교("102" vs 100 문자열 비교 아님). `setSettingValue`에는 원값 `value`를 넘기지만 같은 스키마로 다시 parse해 저장하므로 일관.
- 연도 경계: 검증은 `kstYear(now)`의 카운터 행을 잠근다. 새해(카운터 행 없음 → `lockDocumentCounter`가 value 0으로 INSERT 후 FOR UPDATE)에는 어떤 값이든 허용 — 요구대로. createProject도 `kstYear(now)`로 연도를 잡는다.
- 동시성: 잠금 순서·트랜잭션 구조는 변경 없음(술어와 문구만 바뀜). 카운터 행이 없어도 INSERT…ON CONFLICT DO NOTHING 후 FOR UPDATE라 채번과 직렬화된다.

## 2. 테스트·변이 검증 (통합 파일 26건, 기준선 전부 통과)

| 변이 | 결과 |
|---|---|
| `<` → `<=` | 4건 실패(100 재저장, 기본값 1 재저장, 문자열 "100", createProject) — 검출 |
| 옛 술어(a) 복원(`!== currentStart` + `<= maxIssued`) | 3건 실패(101·102 인상 it.each 2건, createProject) — 검출 |
| `counterValue >= 1` 가드 제거 | 3건 실패(올해 0건 낮추기, 옛 서식 뒤 1 저장, createProject 새해) — 검출 |

네 경계 커버: 0건 발급 낮추기 통과 ✔ · ≥1건 낮추기 거부 + 정확한 문구(`toHaveProperty("message", …)`로 완전 일치) ✔ · 같은 값 통과 ✔ · 최대 이하 인상(101·102)과 최대 초과 인상(103) 통과 + 다음 번호 비충돌 ✔.
변이 후 `git checkout -- domain/`로 복원, `git status --short`는 `?? .planning/quick/260928-7fp-04-51-b/`만.

## 3. 발견 사항

### should-1 — 인상 뒤 낮추기 거부 문구의 숫자가 실제로 매기지 않은 번호다
`domain/document-numbering/index.ts` 거부 분기. `maxIssued = counterValue + currentStart − 1`은 "올해 번호가 단조 증가하므로 실제 최대"라는 주석과 달리, 발급 없이 시작값을 올린 뒤에는 실제 최대보다 크다.
재현(임시 프로브 테스트, 되돌림): 100으로 26100·26101·26102 발급 → 110 저장 → 105 저장 시도 → 문구 `순번 시작값이 이미 매긴 번호(112)와 겹침`. 실제 최대는 102이고 112는 매긴 적이 없으며, 105는 실제로 겹치지도 않는다(다음 번호 26108). 거부 자체는 결정 ②(b)대로 맞지만 사용자에게 사실과 다른 번호·"겹침"을 보인다.
제안(문구는 사용자 결정 영역): 숫자를 현재 시작값 기준으로 바꾸거나(예: 현재 시작값(110)보다 작은 값 불가 취지의 명사형) 숫자를 빼기. 최소한 index.ts 주석의 "올해 실제로 매긴 최대" 주장은 "인상 이력이 없을 때만 실제 최대, 아니면 상한"으로 정정. 이 경우(인상 → 발급 없이 되낮추기)를 고정하는 테스트도 함께.

### should-2 — 테스트 파일 머리 주석이 옛 규칙 (a)를 설명한다
`test/integration/document-numbering.test.ts:108-111` — "04-51 결정 ②(a) — 사용자 답 2026-09-24: 올해 이미 매긴 최대 표시 순번 이하로 시작값을 내리는 저장은 거부한다." (b)와 모순. index.ts 주석처럼 ②(b)·2026-09-28·"현재 시작값보다 낮출 때만 거부"로 갱신.

### nit-1 — "이상 입력" 잔존은 DECISIONS.md뿐 (범위 밖, 기록만)
repo 전체(.planning·node_modules 제외)에서 `이상 입력`은 `docs/design/DECISIONS.md:1002` 한 곳. 같은 줄이 존재하지 않는 함수 `assertSeqStartAvailable`와 "설정 저장 액션이 저장 전에 부른다"(실제는 `setSimpleSettingValue` 안 한 트랜잭션)도 적고 있어 함께 정정 대상.

### nit-2 — 1 낮추기(99) 경계는 타입만 확인
createProject 테스트의 `"99"`는 `toBeInstanceOf`만 본다. 직전 값보다 1 작은 경계의 문구까지 고정하려면 `saveSeqStart(…, 99)` 한 줄 추가. 변이 검증상 현재도 술어 변이는 모두 잡히므로 선택.

### nit-3 — 자정 경계 경쟁(기존, 이번 변경과 무관)
등록이 23:59 KST에 `kstYear(now())=2026`을 잡고 트랜잭션이 자정 뒤까지 열려 있을 때, 자정 뒤 저장은 2027 행(0건)을 잠그므로 낮추기가 허용되고, 그 등록은 tx 안에서 새(낮춘) 시작값을 읽어 2026 번호로 매긴다 → 이론상 2026 UNIQUE 충돌. 창이 극히 좁고 (a)에도 있던 구조라 기록만.

## 4. 명사형 오류 문구
`순번 시작값이 이미 매긴 번호(102)와 겹침` — 명사형 종결, 존대·마침표 없음. `test/unit/error-copy-noun-style.test.ts`는 `domain/document-numbering/`을 검사 대상에 포함하며 18/18 통과.
