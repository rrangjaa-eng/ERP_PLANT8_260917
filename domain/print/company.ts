import { getSimpleSettingValuesOrDefault } from "@/domain/settings/registry";
import {
  PRINT_COMPANY_ADDRESS,
  PRINT_COMPANY_BUSINESS_NO,
  PRINT_COMPANY_NAME,
  PRINT_COMPANY_PHONE,
  PRINT_COMPANY_REPRESENTATIVE,
} from "@/domain/settings/keys";

// 07.4-01 D-7405: 인쇄 서류 머리의 회사 정보 — 설정 「회사 정보」 다섯 키를 SELECT 한 번으로 읽는다(공백은 걷는다).
export type PrintCompany = { name: string; address: string; businessNo: string; representative: string; phone: string };

export async function loadPrintCompany(): Promise<PrintCompany> {
  const [name, address, businessNo, representative, phone] = await getSimpleSettingValuesOrDefault([
    PRINT_COMPANY_NAME,
    PRINT_COMPANY_ADDRESS,
    PRINT_COMPANY_BUSINESS_NO,
    PRINT_COMPANY_REPRESENTATIVE,
    PRINT_COMPANY_PHONE,
  ] as const);
  // 값은 `| undefined`로 오지만 다섯 키 모두 default ""가 있어 비는 경우는 없다.
  const text = (value: string | undefined): string => (value ?? "").trim();
  return { name: text(name), address: text(address), businessNo: text(businessNo), representative: text(representative), phone: text(phone) };
}
