export type Money = number & { readonly __brand: "Money" };
export type OtherBrand = number & { readonly __other: "Other" };
