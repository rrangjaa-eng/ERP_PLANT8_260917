"use client";

import { useCallback, useRef } from "react";
import { PickDialog, type PickResult, type PickRow } from "@/ui/pick-dialog/PickDialog";
import { SidePanel } from "@/ui/side-panel/SidePanel";
import { VendorForm, type WorkplaceVendor } from "@/app/(app)/admin/vendors/vendor-form";
import { searchPayeeUsersForPickAction, searchVendorsForPickAction } from "../actions";
import { mergePayeePickRows } from "./payee-pick-merge";

// 05-07 골라내기 거래처 변형 — 서버 검색 결과(PickVendorOptionDto 행)를 `ui/pick-dialog`의 행으로 옮긴다.
// 컴포넌트는 지출결의를 모르므로 검색 함수 · 결과 줄 · 문구는 여기서 묶는다. 거래처가 바뀌면 증빙 종류가 그 거래처 기본값이 된다.
// 06.5 V12(D-6517 · 결정 맥락 9): 지급처 = 거래처 또는 직원 — 두 검색을 함께 불러 한 목록으로 섞는다(R-1 mergePayeePickRows). 하나라도 실패하면
// 전체 실패(반쪽 목록을 보이지 않는다 — V12 PARTIAL). 직원 행 id는 `user:{id}`로 거래처 id와 섞이지 않게 한다.

export type PickedVendor = { id: string; name: string; defaultEvidenceType: string | null; defaultEvidenceName: string | null };
export type PickedPayeeUser = { id: string; name: string; teamName: string | null };
export type PickedPayee = { kind: "vendor"; vendor: PickedVendor } | { kind: "user"; user: PickedPayeeUser };

export function VendorPickDialog({
  open,
  mode,
  bankTransfer,
  onClose,
  onPick,
  onRegisterNew,
}: {
  open: boolean;
  mode: "pick" | "change";
  // 계좌이체 문서에서만 계좌 없는 후보 부제 끝에 ` · 계좌 없음`(V12 행).
  bankTransfer: boolean;
  onClose: () => void;
  onPick: (payee: PickedPayee) => void | boolean | Promise<void | boolean>;
  /** 07-23 SC-18 — 검색어가 있으면 목록 끝 3차 `새 거래처 · "{검색어}"`: 고르기 창을 닫고 그 이름으로 등록 패널을 연다. */
  onRegisterNew?: (name: string) => void;
}) {
  const known = useRef(new Map<string, PickedPayee>());

  const search = useCallback(
    async (query: string): Promise<PickResult | null> => {
      const [vendorData, userData] = await Promise.all([
        searchVendorsForPickAction({ query }).then((result) => result?.data),
        searchPayeeUsersForPickAction({ query }).then((result) => result?.data),
      ]);
      if (!vendorData || !userData) return null;
      const tail = (accountMissing: boolean | undefined) => (bankTransfer && accountMissing ? " · 계좌 없음" : "");
      const vendors = vendorData.rows.flatMap((row) => (row.id && row.name !== undefined ? [{ ...row, id: row.id, name: row.name }] : []));
      const users = userData.rows.flatMap((row) => (row.id && row.name !== undefined ? [{ ...row, id: row.id, name: row.name }] : []));
      const merged = mergePayeePickRows({ vendors, users, vendorsTruncated: vendorData.truncated, usersTruncated: userData.truncated });
      const items: PickRow[] = merged.rows.map((entry) => {
        if (entry.kind === "vendor") {
          const vendor = entry.row;
          known.current.set(vendor.id, {
            kind: "vendor",
            vendor: { id: vendor.id, name: vendor.name, defaultEvidenceType: vendor.defaultEvidenceType ?? null, defaultEvidenceName: vendor.defaultEvidenceName ?? null },
          });
          const subtitle = `${vendor.defaultEvidenceName ? `기본 증빙 ${vendor.defaultEvidenceName}` : ""}${tail(vendor.accountMissing)}`.replace(/^ · /, "");
          return { type: "row", id: vendor.id, title: vendor.name, subtitle: subtitle || null, selectable: true };
        }
        const user = entry.row;
        const id = `user:${user.id}`;
        known.current.set(id, { kind: "user", user: { id: user.id, name: user.name, teamName: user.teamName ?? null } });
        return { type: "row", id, title: user.name, subtitle: `${user.teamName ? `직원 · ${user.teamName}` : "직원"}${tail(user.accountMissing)}`, selectable: true };
      });
      return { items, truncated: merged.truncated, subtitle: `지급처 ${items.length}` };
    },
    [bankTransfer],
  );

  return (
    <PickDialog
      open={open}
      onClose={onClose}
      title={mode === "change" ? "지급처 바꾸기" : "지급처 고르기"}
      searchLabel="지급처 이름 검색"
      noun="지급처"
      primaryLabel="이 지급처로"
      search={search}
      searchTail={onRegisterNew ? (query) => ({ label: `새 거래처 · "${query}"`, onSelect: () => onRegisterNew(query) }) : undefined}
      resultLine={(row) => {
        const payee = row ? known.current.get(row.id) : undefined;
        const name = payee?.kind === "vendor" ? payee.vendor.defaultEvidenceName : null;
        return name ? `증빙 종류 → ${name}` : null;
      }}
      onPick={(row) => {
        const payee = known.current.get(row.id);
        return payee ? onPick(payee) : false;
      }}
    />
  );
}

// 07-23 SC-18 · AQ-21 · K20: 지급처 고르기에서 연 거래처 등록 패널 — 07-20 거래처 등록 폼을 그대로 쓰고 저장(지출결의 쓰기 권한 등록) · 충돌 줄(`이 거래처로`)만
// 바꾼다. 지급 기한 · 기본 증빙 종류 · 담당자 · 사용자 정의 칸은 그리지 않는다(거래처 화면에서 경영관리가 확인할 때). 실패하면 패널이 열린 채 칸 오류,
// `취소 Esc`는 고르기 창을 다시 열지 않고 연 자리(지급처 칸 단추)로 포커스가 돌아간다.
export function WorkVendorPanel({
  name,
  onClose,
  onVendor,
}: {
  name: string;
  onClose: () => void;
  onVendor: (vendor: WorkplaceVendor, how: "registered" | "picked") => void | Promise<void>;
}) {
  return (
    <SidePanel title="거래처 등록" onClose={onClose} returnFocusTo={() => document.getElementById("vendor-pick")}>
      <VendorForm evidenceTypes={[]} fieldDefs={[]} newKind="supplier" paymentTermDefault={0} workplace={{ name, onVendor }} />
    </SidePanel>
  );
}
