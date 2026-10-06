"use client";

import { useCallback, useRef } from "react";
import { PickDialog, type PickResult, type PickRow } from "@/ui/pick-dialog/PickDialog";
import { searchVendorsForPickAction } from "../actions";

// 05-07 골라내기 거래처 변형(`거래처 고르기` · `거래처 바꾸기`) — 서버 검색 결과(PickVendorOptionDto 행)를 `ui/pick-dialog`의 행으로 옮긴다.
// 컴포넌트는 지출결의를 모르므로 검색 함수 · 결과 줄 · 문구는 여기서 묶는다. 거래처가 바뀌면 증빙 종류가 그 거래처 기본값이 된다.

export type PickedVendor = { id: string; name: string; defaultEvidenceType: string | null; defaultEvidenceName: string | null };

export function VendorPickDialog({
  open,
  mode,
  onClose,
  onPick,
}: {
  open: boolean;
  mode: "pick" | "change";
  onClose: () => void;
  onPick: (vendor: PickedVendor) => void | boolean | Promise<void | boolean>;
}) {
  const known = useRef(new Map<string, PickedVendor>());

  const search = useCallback(async (query: string): Promise<PickResult | null> => {
    const data = (await searchVendorsForPickAction({ query }))?.data;
    if (!data) return null;
    const items: PickRow[] = [];
    for (const row of data.rows) {
      if (!row.id || row.name === undefined) continue;
      known.current.set(row.id, {
        id: row.id,
        name: row.name,
        defaultEvidenceType: row.defaultEvidenceType ?? null,
        defaultEvidenceName: row.defaultEvidenceName ?? null,
      });
      items.push({ type: "row", id: row.id, title: row.name, subtitle: row.defaultEvidenceName ? `기본 증빙 ${row.defaultEvidenceName}` : null, selectable: true });
    }
    return { items, truncated: data.truncated, subtitle: `거래처 ${items.length}` };
  }, []);

  return (
    <PickDialog
      open={open}
      onClose={onClose}
      title={mode === "change" ? "거래처 바꾸기" : "거래처 고르기"}
      searchLabel="거래처 이름 검색"
      noun="거래처"
      primaryLabel="이 거래처로"
      search={search}
      resultLine={(row) => {
        const name = row ? known.current.get(row.id)?.defaultEvidenceName : null;
        return name ? `증빙 종류 → ${name}` : null;
      }}
      onPick={(row) => {
        const vendor = known.current.get(row.id);
        return vendor ? onPick(vendor) : false;
      }}
    />
  );
}
