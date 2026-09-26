"use client";

import { useRouter } from "next/navigation";
import {
  PermissionGrid,
  type PermissionGridRow,
  type PermissionGridColumn,
} from "@/ui/permission-grid/PermissionGrid";

// 권한표·정보 노출표 두 화면이 공유하는 클라이언트 래퍼(D-40) — 서버
// 액션을 onToggle로 격자에 꽂고, 격자 좌표(aria-label)·액션 입력 조립
// 규칙을 화면 종류(kind)에 따라 이 파일 안에서만 정한다.
//
// Server Action 참조(toggleAction)는 Next.js가 특별히 직렬화하는 예외라
// RSC 경계를 안전하게 넘을 수 있지만, 일반 클로저(aria-label 계산·액션
// 입력 조립 함수)는 넘길 수 없다 — 그래서 그 로직은 서버 컴포넌트(page.tsx)
// 에서 props로 받지 않고 이 클라이언트 모듈 안에서 kind로 분기해 만든다.
export type PermissionGridClientKind = "permission" | "visibility";

type SafeActionResultLike = { data?: unknown; serverError?: unknown; validationErrors?: unknown };

export type PermissionGridClientProps<TInput> = {
  kind: PermissionGridClientKind;
  caption: string;
  rowSelectLabel: string;
  rows: PermissionGridRow[];
  columns: PermissionGridColumn[];
  values: Record<string, boolean>;
  errorMessage?: string | null;
  toggleAction: (input: TInput) => Promise<SafeActionResultLike>;
};

function cellAriaLabelFor(
  kind: PermissionGridClientKind,
  row: PermissionGridRow,
  column: PermissionGridColumn,
): string {
  if (kind === "permission") {
    return `${row.label} · ${column.group ?? ""} · ${column.label}`;
  }
  return `${row.label} · ${column.label}`;
}

function columnAriaLabelFor(kind: PermissionGridClientKind, column: PermissionGridColumn): string {
  if (kind === "permission") {
    return `${column.group ?? ""} · ${column.label} 전체 선택`;
  }
  return `${column.label} 전체 선택`;
}

function buildActionInput(
  kind: PermissionGridClientKind,
  rowId: string,
  columnId: string,
  next: boolean,
): Record<string, unknown> {
  if (kind === "permission") {
    const [menu, action] = columnId.split("::");
    return { roleId: rowId, menu, action, allowed: next };
  }
  return { roleId: rowId, infoItem: columnId, visible: next };
}

export function PermissionGridClient<TInput>({
  kind,
  toggleAction,
  ...gridProps
}: PermissionGridClientProps<TInput>) {
  const router = useRouter();

  async function handleToggle(rowId: string, columnId: string, next: boolean): Promise<void> {
    const input = buildActionInput(kind, rowId, columnId, next) as unknown as TInput;
    const result = await toggleAction(input);
    if (result.serverError || result.validationErrors) {
      const message = typeof result.serverError === "string" ? result.serverError : "저장 실패";
      throw new Error(message);
    }
  }

  return (
    <PermissionGrid
      {...gridProps}
      cellAriaLabel={(row, column) => cellAriaLabelFor(kind, row, column)}
      columnAriaLabel={(column) => columnAriaLabelFor(kind, column)}
      onToggle={handleToggle}
      onRetry={() => router.refresh()}
    />
  );
}
