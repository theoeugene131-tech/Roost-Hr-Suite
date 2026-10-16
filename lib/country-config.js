// International settings defaults. These settings control presentation and HR
// defaults; they are not a substitute for jurisdiction-specific legal advice.
export const COUNTRY_CONFIG = {
  NG: {
    label: "Nigeria",
    currency: "NGN",
    locale: "en-NG",
    timezone: "Africa/Lagos",
    payrollStatus: "existing-estimator-needs-current-rule-validation",
  },
  US: {
    label: "United States",
    currency: "USD",
    locale: "en-US",
    timezone: "America/New_York",
    payrollStatus: "not-implemented",
  },
  GB: {
    label: "United Kingdom",
    currency: "GBP",
    locale: "en-GB",
    timezone: "Europe/London",
    payrollStatus: "not-implemented",
  },
};

export function formatMoney(amount, settings = {}) {
  const country = COUNTRY_CONFIG[settings.country] || COUNTRY_CONFIG.NG;
  const currency = settings.currency || country.currency;
  const locale = settings.locale || country.locale;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);
}
