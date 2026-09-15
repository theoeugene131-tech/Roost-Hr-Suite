/**
 * PAYE per the (pre-2026) Personal Income Tax Act graduated bands, applied
 * to income after the Consolidated Relief Allowance and pension are
 * deducted.
 *
 * IMPORTANT: Nigeria's tax rules changed under the Tax Reform Act effective
 * Jan 2026. Verify current bands/reliefs with FIRS or a qualified accountant
 * before relying on this for real payslips or statutory filings. This
 * function is a clear improvement over a flat-subtraction approach, but it
 * is not compliance-certified — treat it as a well-reasoned estimate, and
 * update the bands/CRA logic below once you've confirmed the current rules.
 */
export interface Deductions {
  monthlyPAYE: number;
  pensionEmployee: number;
  pensionEmployer: number;
  nhf: number;
  net: number;
}

const PAYE_BANDS: [number, number][] = [
  [300000, 0.07],
  [300000, 0.11],
  [500000, 0.15],
  [500000, 0.19],
  [1600000, 0.21],
  [Infinity, 0.24],
];

export function estimateDeductions(grossMonthly: number): Deductions {
  const annual = grossMonthly * 12;

  const cra = Math.max(200000, annual * 0.01) + annual * 0.2;
  const pensionEmployeeAnnual = annual * 0.08;
  const pensionEmployerAnnual = annual * 0.1;

  const taxable = Math.max(annual - cra - pensionEmployeeAnnual, 0);

  let tax = 0;
  let remaining = taxable;
  for (const [size, rate] of PAYE_BANDS) {
    if (remaining <= 0) break;
    const amt = Math.min(size, remaining);
    tax += amt * rate;
    remaining -= amt;
  }

  const monthlyPAYE = Math.round(tax / 12);
  const pensionEmployee = Math.round(pensionEmployeeAnnual / 12);
  const pensionEmployer = Math.round(pensionEmployerAnnual / 12);
  const nhf = Math.round(grossMonthly * 0.025);
  const net = grossMonthly - monthlyPAYE - pensionEmployee - nhf;

  return { monthlyPAYE, pensionEmployee, pensionEmployer, nhf, net };
}
