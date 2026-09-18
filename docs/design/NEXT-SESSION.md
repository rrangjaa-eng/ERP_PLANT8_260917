# 다음 세션 — §4(통일) 이 세션 몫은 끝: **C 3개 확정 · B 1~3 끝.** 남은 것은 Phase 1 머지 뒤 B-4·5(앱 코드)뿐

§1·§2·§3은 끝났고 §4(통일)가 진행 중이다. 판단의 근거는 `BRIEF.md` → `EXPLORE.md` → `SYSTEM.md`·`DECISIONS.md` 순서. 어긋나면 `SYSTEM.md`가 맞다.

## 0. 상태 (2026-09-18, 세 번째 세션)

- 채택: **안 A 원장**, 색 구성은 안 C의 그린 톤온톤 흡수(사용자 결정)
- 실물이 있는 것: 원장 화면(`system/preview.html`) · 시트·모달(`system/sheet-modal.html`) · 인쇄 템플릿 2종(`system/print-expense.html` · `print-cert.html`, 2026-09-18 재디자인 확정) · **폼 화면(`system/form-expense.html`, C-1 끝)** · **손익 대시보드 전사·팀(`system/dashboard-ceo.html` · `dashboard-team.html`, C-2 끝)** · **외부 수령자(`system/external-cert.html`, C-3 끝 — 경품 수령 확인으로 바뀜)**
- PR #8(시트·모달) · #10(인쇄 재디자인) 머지됨. C는 브랜치 **`design/c-templates-260918`**(PR #11, 드래프트, base `main`). 시작 때 머지 상태를 보고 머지 안 됐으면 체크아웃
- Phase 1(배포 스켈레톤·로그인): 계획 PR #5 머지됨(플랜 8개, 실행 0/8). 다른 세션이 플랜 CEO·엔지니어링 리뷰 게이트(PR #9, `docs/phase1-plan-reviews-260918`)를 진행 중. **GSD 명령은 그 세션에서만.** 시작 때 열린 PR과 `.planning/STATE.md`를 다시 본다
- CI 없음. 스크린샷은 `system/shoot.mjs`(아래 4)

## 1. 시작 순서

1. `.planning/STATE.md`와 열린 PR(#9 등)로 Phase 1 진행 여부 확인 → 진행 중이면 GSD 명령 금지
2. C는 전부 끝, B는 1~3 끝. 디자인 §4에서 이 리포(`docs/design/`)로 할 일은 없다. Phase 1이 머지되면 앱 코드 세션이 B-4·5와 실물 → 앱 이관(§6 실물 7개)을 한다
3. 결정이 필요한 것은 **실물(HTML → 스크린샷 → 보드 아티팩트)을 먼저** 보이고 **한 건씩** 묻는다. 「고칠 것이 있음」이라고만 답하면 무엇인지 되묻는다 — 첫 답이 질문일 수 있다
4. 끝나면 `DECISIONS.md`(결정) → `SYSTEM.md`(규칙) → `system/README.md`(실물 목록) → 이 파일(상태) 순서로 갱신, 커밋(영어 접두어 + 한국어 본문), 푸시, 드래프트 PR

---

## A. 인쇄물 재디자인 — 끝 (2026-09-18 확정)

안 4개(양식·레터·명세·인장)를 보드(https://claude.ai/artifact/GAnoqBTbE7GK4gGyFvTjeL)로 보이고 사용자가 골랐다. **지출결의서 = P2 레터 골격 + P3 명세 표, 확인증 = P2. 색 = 글자 검정 · 구조 선 2px 그린(`--print-rule`) · 구분선 1px 회색(`--print-line`).** 「검정 하나」 결정은 뒤집혔다. `DECISIONS.md` 「인쇄물 재디자인 확정」 4건, `SYSTEM.md` §6-6 다시 씀, `tokens.css` 토큰 2개 추가, `system/print-expense.html`·`print-cert.html` 승격, 발산 기록 `system/print/`.

남은 것 없음. 앱 코드의 `/print/…` 라우트는 이 두 실물을 그대로 옮긴다(Phase 5·11).

---

## B. Pretendard Variable 파일 준비 — **1~3 끝(2026-09-18), 4·5는 Phase 1 머지 뒤**

### 결정된 것 (`SYSTEM.md` §2-1, `DECISIONS.md` 서체 · 서체 파일 리포 커밋)
자체 호스팅 `/public/fonts/pretendard/`, 동적 서브셋 woff2 92개(3.1MB) + css + OFL 라이선스를 **리포에 커밋**(사용자 결정 「커밋해」). `font-display: swap`, 외부 CDN 금지. 폴백 `'Pretendard Variable', Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif`. 실제 파일은 Phase 2 앱 코드에서(U3).

### 확인된 출처 (2026-09-18)
npm `pretendard@1.3.9`(2023-11-05, `license: OFL-1.1`, repo `orioncactus/pretendard`). GitHub 릴리스 v1.3.9와 같은 파일. 이 세션의 실행 환경에서 GitHub(HTML·API)는 403, `/browse`는 인증서 오류였고 `registry.npmjs.org`는 허용 목록이라 tarball로 확인했다. `@font-face` 계획과 파일 배치는 `SYSTEM.md` §2-1에 코드 블록으로 적었다.

### 남은 절차 (Phase 1 머지 뒤, 앱 코드 세션에서)
```bash
# 의존성으로 넣지 않는다 — tarball에서 파일만 복사
cd "$(mktemp -d)" && npm pack pretendard@1.3.9 >/dev/null && tar xzf pretendard-1.3.9.tgz
mkdir -p "$REPO/public/fonts/pretendard"
cp package/dist/LICENSE.txt                                   "$REPO/public/fonts/pretendard/LICENSE.txt"
cp package/dist/web/variable/pretendardvariable-dynamic-subset.css "$REPO/public/fonts/pretendard/pretendard-dynamic-subset.css"
cp -r package/dist/web/variable/woff2-dynamic-subset          "$REPO/public/fonts/pretendard/"
# 확인: 92개 · 3.1MB
ls "$REPO/public/fonts/pretendard/woff2-dynamic-subset" | wc -l
```
4. `app/layout.tsx` `<head>`에 `<link rel="stylesheet" href="/fonts/pretendard/pretendard-dynamic-subset.css">` 한 줄. 전역 CSS는 `--font-sans`만
5. **검수**: Windows Chrome/Edge에서 표의 자릿수 정렬 스크린샷 — 맑은 고딕 폴백과 Pretendard `tnum` 나란히. 첫 로드 전송량 200–300KB

물을 것 없음.

---

## C. §6 템플릿 남은 실물 — **전부 끝(2026-09-18)**

C-1 폼은 보드(https://claude.ai/artifact/Ts4ScSj1hD2AiiWD17Evkc)로 확정했다 — `DECISIONS.md` 「폼 화면 실물 확정 7건」, `SYSTEM.md` §6-3. C-1 폼(보드 https://claude.ai/artifact/Ts4ScSj1hD2AiiWD17Evkc) · C-2 손익(https://claude.ai/artifact/5kQyygb3hLbiQpo38BNznr, 원장 → 대시보드) · C-3 외부 수령자(https://claude.ai/artifact/LF5FZgn2Qqbp7VMVHdfgSD, 현금 → 경품) 전부 확정. `DECISIONS.md` 세 절, `SYSTEM.md` §6-3 · §6-4 · §6-5, `tokens.css` 토큰 3종.

### 다음 세션이 할 일
1. (없음 — 다음은 앱 코드 세션) Phase 1 머지 확인 → B-4·5 → `system/*.html` 실물을 앱 컴포넌트로 옮길 때 `SYSTEM.md` §6 규칙과 `DECISIONS.md`를 근거로
2. C에서 배운 것: 사용자는 실물을 보고서야 전제(현금 vs 경품)를 말한다 — 첫 보드에 **업무 전제를 한 줄로 적어 두고** 「이 전제가 맞나」부터 묻는다. 「다 빼라」는 말은 글자 그대로 뺀다(안내 문구까지)

### 초안이 임시로 정한 것 (SYSTEM.md에 없는 것 — 보드에서 「내가 정한 것」 표로 보이고 물어야 한다)
- **C-1 폼**: 전부 확정(2026-09-18) — `DECISIONS.md` 폼 화면 7건. (a) 입력 아래 한 줄 (b) 탭 위에 제출 줄 (c) 「바꾸기」 = 목록(모달·시트) (d) 건너뜀은 그리지 않고 한 마디
- **C-2 손익**: 전부 확정(2026-09-18) — `DECISIONS.md` 손익 화면 = 대시보드 6건. 원장 초안의 (a)(b)는 대시보드로 바뀌며 소멸
- **C-3 외부 수령자**: 전부 확정(2026-09-18) — `DECISIONS.md` 외부 수령자 화면 6건. 원안의 (a)(b)(c)에 더해 경품명만 · 주소는 택배일 때만 · 주민등록번호 검사 규칙만

### 원래 계획 (참고)

공통: `system/preview.html`의 CSS·마크업을 그대로 복사해 시작(상단 바·내 차례·버튼·표·폰 규칙이 들어 있다). 토큰은 `../tokens.css`만. 같은 샘플 세계(위 A 참고). 각 실물은 §7-7 다섯 상태 중 그 컴포넌트 표에 있는 상태를 **최소 하나씩 장면으로** 보인다. 캡처는 `shoot.mjs` 장면 목록에 추가.

### C-1. 폼 화면 (§6-3, 지출결의 한 건) — `system/form-expense.html` — **끝(2026-09-18 확정)**
- 규칙: 한 열 max 720 왼쪽 정렬, 라벨 96 왼쪽(폰은 위), 자동 채움 칸 = 텍스트 + 「바꾸기」, 첨부 영역(§7-10), 결재선 읽기 전용, 제출 줄(1차 「지출결의 제출 ⌘↵」 + 막힘 이유 + 「임시 저장」 2차), 폰은 하단 제출 줄 고정
- 장면: ① 막힘(증빙 없음) ② 서버 오류(입력 아래 `원인 · 다음 행동`, 값 보존) ③ 제출됨(버튼 자리 `결재 요청됨 → 김도윤` + 토스트) ④ 폰 390
- **SYSTEM.md에 없어 물어야 할 것**(실물로 먼저 보이고 한 건씩): (a) EXP-15 세금 자동 계산의 표시 — 사람은 공급가만 적고 서버가 부가세·합계(원천징수 종류면 원천징수액·실지급액)를 계산해 보여 준다. 금액 입력 아래 한 줄? 별도 읽기 전용 행? (b) 폰에서 하단 탭 44 + 고정 제출 줄이 겹칠 때 — 제출 줄이 탭 위에 얹히는가, 탭이 숨는가 (c) 「바꾸기」가 무엇을 여는가(시트/인라인 선택) (d) 결재선에 자기 승인 건너뜀(Eng OV-2)을 어떻게 표시하나

### C-2. 손익 원장 (§6-4, 팀장·대표 첫 화면) — `system/dashboard-pnl.html` — **끝(2026-09-18 대시보드로 확정, 아래 원안은 기록)**
- 규칙: 내 차례 + 「2026 팀 손익」 원장, 필터 한 줄(팀 ▾ · 연도 ▾, 네이티브 select), 그룹(진행 중 N / 완료 N), 열 = 프로젝트 · 견적 · 확정 비용 · 수익 · 수익률 · **목표 대비 막대**(`--g-100` 위 `--g-700`, 8×72, 오른쪽 `--fs-sm` 숫자, 100% 초과는 숫자만, 목표 없으면 `—`, 합계 행에도), 합계 행 = KPI, 다른 차트 없음
- 장면: ① 대표(전체 열) ② 팀장(자기 팀만) ③ 기획본부 렌더 = 이 화면 자체가 없음을 적기만(§6-4) ④ EMPTY(`이 기간에 프로젝트가 없습니다 · 기간 바꾸기`) ⑤ PARTIAL(`계산 불가 N건` 배지 + 계산된 합계만) ⑥ 폰 390 칸 접기
- **물어야 할 것**: (a) 폰 P1 3열 — 프로젝트 · 수익 · 그리고 「목표 대비 막대」를 P1로 두는가 수익률을 두는가(§7-3 P1 규칙은 문자 1 + 숫자 1 + 상태/행동 1) (b) 완료 프로젝트의 정산 스냅샷(PNL 결정 D3)을 진행 중과 같은 표에 그룹으로 두는가

### C-3. 외부 수령자 화면 (§6-5, 폰 전용, 로그인 없음) — `system/external-cert.html` — **끝(2026-09-18 확정, 아래 원안은 기록)**
- 규칙: 딥그린 바(워드마크만), 제목 `--fs-xl` 「기타소득 지급 확인」, 읽기 전용 지급 정보(프로젝트 · 항목 · 지급액 · 원천징수), 입력 48px `--fs-md` 한 열(이름 · 주민등록번호 앞/뒤 · 주소 · 연락처 · 계좌 = 은행 select + 번호), 터치 서명 캔버스(`1px --line-ui`), 제출 줄(1차 버튼은 §8 규칙상 실제 동작명 「확인증 제출」 + 막힘 이유 `이름·계좌·서명을 채우면 제출할 수 있습니다`), 오류는 `~해 주세요`체
- 장면: ① 빈 폼(막힘 이유) ② 서명만 남음(`서명을 해 주세요`) ③ 오류(주민등록번호 형식) ④ 제출됨(`제출되었습니다 · 이 링크는 닫혔습니다`, PDF 링크 없음 = v1) ⑤ 링크 만료(이미 제출된 링크로 재진입)
- **물어야 할 것**: (a) **개인정보 수집·이용 동의**(주민등록번호·계좌, CERT-02, 개인정보보호법) — 체크박스 + 고지 문장이 필요하다. SYSTEM.md 「안내 문구 없음」은 화면 규칙이고 이것은 법적 고지다. 문장·위치를 실물로 보이고 확정(`/cso` 감사 항목이기도 하다) (b) 서명 「다시 쓰기」 3차 버튼 유무 (c) 링크 만료 화면 문구

---

## 4. 도구 — 스크린샷

`docs/design/system/shoot.mjs`: Playwright(전역 설치, `npm root -g`)로 장면 목록을 찍는다. 실행 `node docs/design/system/shoot.mjs [장면이름 …]` (리포 루트에서, 인자 없으면 전부). 장면을 추가할 때는 파일 안의 `scenes` 배열에 `[이름, 파일, 해시, 폭, 높이, isMobile, fullPage, 출력]` 한 줄. 보드 아티팩트는 이 PNG를 `files`로 붙인다. 2026-09-18 실행 확인(기존 PNG와 바이트 동일).

## 5. 지킨 제약 (다음 세션도 확인)

- 변경 범위 `docs/design/`만. `.planning/`·`CLAUDE.md`·`.claude/`·앱 코드 무변경(B의 4단계는 Phase 1 머지 후 별도 세션)
- GSD 명령 미실행(Phase 1이 다른 세션에서 진행 중)
- 260907의 화면·정보구조·UI 흐름·틀·토큰 참고 안 함(업무 규칙·용어만)
- 웹은 `/browse`만. 새 의존성 없음(폰트는 파일 복사)
- 모델: 판단·검토는 Fable, 조사·캡처·정리는 낮은 모델을 명시해 서브에이전트에
