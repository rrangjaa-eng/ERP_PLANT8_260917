// D8-08: 복원본 확인이 읽는 핵심 표 목록. 뒤 페이즈는 이 목록에 항목만 더한다 ·
// 운영 현재 행 수와 비교하지 않는다(D8-08). requireRows는 시드나 계정이 반드시
// 채우는 표만 켠다 — 0행이 정상일 수 있는 표는 읽히는지만 본다.
export const RESTORE_CHECK_TABLES: readonly { table: string; requireRows: boolean }[] = [
  { table: "users", requireRows: true },
  { table: "roles", requireRows: true },
  { table: "permission_matrix", requireRows: true },
  { table: "visibility_matrix", requireRows: true },
  { table: "code_items", requireRows: true },
  { table: "org_units", requireRows: true },
  { table: "teams", requireRows: true },
  { table: "settings_simple", requireRows: true },
  { table: "settings_historized", requireRows: true },
  { table: "team_memberships", requireRows: false },
  { table: "vendors", requireRows: false },
  { table: "action_log", requireRows: false },
];
