# gsd-ui-checker 재검토 (d138427→ba6b3b6, opus)
APPROVED, BLOCK 0, FLAG 3. D1 FLAG · D2 FLAG · D3–D7 PASS. Codex r6 4건 모두 해결 확인.
1. D1 L243/L491: 닫힌 행사에서도 `잠금 풀기 필요` 2행 → 접수 중일 때만, 닫히면 `미제출`만.
2. D2 L376/L612: tabindex=-1 묶음에 aria-live까지 있어 두 번 읽힘 → aria-live 제거, 포커스 이동만.
3. L131-132/139/142: 개정 기록 1차 항목에 바뀐 문구가 남음 → "2차·3차가 1차를 덮는다; 문구 정본은 Copywriting 표" 한 줄.
