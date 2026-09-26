import type { Viewer } from "@/domain/viewer";
import { visible as defaultVisible } from "@/domain/permissions/visible";

// domain의 유일한 출구 — 리포지토리 행 객체를 DTO로 투영한다. spec의 fields를
// 선언 순서대로 순회하며 각 항목의 정보 항목을 visible()로 확인해 통과한 것만
// 결과 객체에 싣는다 — 그래서 결과 키 순서는 spec 선언 순서이고 노출표 행
// 순서와 무관하다. 원본에 from 키가 없으면 조용히 건너뛰어 이미 투영된 결과를
// 다시 투영해도 같은 결과가 나오게 한다(멱등). spec 밖의 키는 결코 결과에
// 실리지 않는다.
//
// Phase 4(04-32, ENG-D3 ②): infoItem은 문자열(정보 항목 하나) 또는 목록
// (all-of — 전부 볼 수 있을 때만 키가 실린다)이다.
export type InfoItemRef = string | readonly string[];

export type DtoSpec<Row, Dto> = {
  readonly fields: ReadonlyArray<{ key: keyof Dto & string; from: keyof Row & string; infoItem: InfoItemRef }>;
};

export type ProjectDeps = {
  visible: typeof defaultVisible;
};

// infoItem 하나를 항상 배열로 — 문자열이면 한 원소, 이미 목록이면 그대로.
function asInfoItemList(ref: InfoItemRef): readonly string[] {
  return typeof ref === "string" ? [ref] : ref;
}

// spec에 나오는 서로 다른 정보 항목을 선언 순서대로 한 번씩만 모은다.
function distinctInfoItems(fields: ReadonlyArray<{ infoItem: InfoItemRef }>): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const field of fields) {
    for (const item of asInfoItemList(field.infoItem)) {
      if (!seen.has(item)) {
        seen.add(item);
        items.push(item);
      }
    }
  }
  return items;
}

// 여러 행을 한 spec으로 투영한다 — 노출 판정은 서로 다른 정보 항목 수만큼만
// (행 수와 무관하게) 순서대로 한 번씩 부른다(같은 요청의 풀을 한꺼번에 잡지
// 않는다). 각 행의 결과는 project()를 그 행에 부른 것과 같다.
export async function projectMany<Row extends object, Dto extends object>(
  viewer: Viewer,
  rows: readonly Row[],
  spec: DtoSpec<Row, Dto>,
  deps?: Partial<ProjectDeps>,
): Promise<Array<Partial<Dto>>> {
  const visibleFn = deps?.visible ?? defaultVisible;
  const visibility = new Map<string, boolean>();
  for (const item of distinctInfoItems(spec.fields)) {
    visibility.set(item, await visibleFn(viewer, item));
  }

  return rows.map((row) => {
    const source = row as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const field of spec.fields) {
      if (!(field.from in source)) continue;
      const ok = asInfoItemList(field.infoItem).every((item) => visibility.get(item) === true);
      if (!ok) continue;
      result[field.key] = source[field.from];
    }

    return result as Partial<Dto>;
  });
}

export async function project<Row extends object, Dto extends object>(
  viewer: Viewer,
  row: Row,
  spec: DtoSpec<Row, Dto>,
  deps?: Partial<ProjectDeps>,
): Promise<Partial<Dto>> {
  const [result] = await projectMany(viewer, [row], spec, deps);
  return result ?? {};
}
