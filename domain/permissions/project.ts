import type { Viewer } from "@/domain/viewer";
import { visible as defaultVisible } from "@/domain/permissions/visible";

// domain의 유일한 출구 — 리포지토리 행 객체를 DTO로 투영한다. spec의 fields를
// 선언 순서대로 순회하며 각 항목의 정보 항목을 visible()로 확인해 통과한 것만
// 결과 객체에 싣는다 — 그래서 결과 키 순서는 spec 선언 순서이고 노출표 행
// 순서와 무관하다. 원본에 from 키가 없으면 조용히 건너뛰어 이미 투영된 결과를
// 다시 투영해도 같은 결과가 나오게 한다(멱등). spec 밖의 키는 결코 결과에
// 실리지 않는다.
export type DtoSpec<Row, Dto> = {
  readonly fields: ReadonlyArray<{ key: keyof Dto & string; from: keyof Row & string; infoItem: string }>;
};

export type ProjectDeps = {
  visible: typeof defaultVisible;
};

export async function project<Row extends object, Dto extends object>(
  viewer: Viewer,
  row: Row,
  spec: DtoSpec<Row, Dto>,
  deps?: Partial<ProjectDeps>,
): Promise<Partial<Dto>> {
  const visibleFn = deps?.visible ?? defaultVisible;
  const source = row as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const field of spec.fields) {
    if (!(field.from in source)) continue;
    const ok = await visibleFn(viewer, field.infoItem);
    if (!ok) continue;
    result[field.key] = source[field.from];
  }

  return result as Partial<Dto>;
}
