/** 1 PKR = 100 paisa */
export const PAISA_PER_RUPEE = 100;

export function rupeesToPaisa(rupees: number): number {
  return Math.round(rupees * PAISA_PER_RUPEE);
}

export function paisaToRupees(paisa: number): number {
  return paisa / PAISA_PER_RUPEE;
}

export function formatPkr(paisa: number, decimals = 2): string {
  return `Rs. ${paisaToRupees(paisa).toLocaleString("en-PK", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function assertIntegerPaisa(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer paisa amount, got ${value}`);
  }
}
