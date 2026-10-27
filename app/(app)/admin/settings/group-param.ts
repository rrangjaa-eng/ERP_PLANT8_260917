// `?group=` 값을 현재 묶음으로 푼다 — 목록에 없거나 비어 있으면 첫 묶음, 같은 이름이 여러 번 오면(배열) 첫 값으로 판정한다.
export function resolveSettingsGroup(groups: string[], param: string | string[] | undefined): string {
  const requested = Array.isArray(param) ? param[0] : param;
  return requested !== undefined && groups.includes(requested) ? requested : (groups[0] ?? "");
}
