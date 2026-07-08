/* Central configuration. Every value is overridable via environment variable
   and falls back to a sane default, so nothing is silently hardcoded across
   the codebase. Business data (company details, shipping, currency, marketing
   claims) and engineering constants (TTLs, rate limits, pagination) all live
   here instead of being scattered as literals. */

const num = (v, d) => (v == null || v === '' || Number.isNaN(Number(v)) ? d : Number(v))
const str = (v, d) => (v == null || v === '' ? d : String(v))

export const config = {
  // ---- Business / brand (Category A — was hardcoded in the UI) ----
  company: {
    name: str(process.env.COMPANY_NAME, 'Industrial Edge'),
    legalName: str(process.env.COMPANY_LEGAL_NAME, 'Industrial Edge Ltd'),
    email: str(process.env.COMPANY_EMAIL, 'info@industrialedge.pk'),
    phone: str(process.env.COMPANY_PHONE, '0332-2316225'),
    address1: str(process.env.COMPANY_ADDRESS1, 'Unit 7, Forge Park'),
    address2: str(process.env.COMPANY_ADDRESS2, 'Sheffield Industrial Estate'),
    hours: str(process.env.COMPANY_HOURS, 'MON–FRI 07:00–18:00'),
    foundedYear: num(process.env.COMPANY_FOUNDED, 1998),
    region: str(process.env.COMPANY_REGION, ''),
  },

  // ---- Currency (Category C — single source for money formatting) ----
  currency: {
    code: str(process.env.CURRENCY, 'USD'),
    locale: str(process.env.CURRENCY_LOCALE, 'en-US'),
  },

  // ---- Shipping rules (Category C — business config) ----
  shipping: {
    freeThreshold: num(process.env.SHIP_FREE_THRESHOLD, 250),
    standardRate: num(process.env.SHIP_STANDARD_RATE, 18),
    expressRate: num(process.env.SHIP_EXPRESS_RATE, 39),
  },

  // ---- Marketing claims surfaced on the storefront (Category A/C) ----
  marketing: {
    sameDayCutoff: str(process.env.MARKETING_CUTOFF, '16:00'),
    fulfilmentRate: str(process.env.MARKETING_FULFILMENT_RATE, '99.2%'),
  },

  // ---- Engineering constants (Category B — defaults are fine, env optional) ----
  auth: {
    tokenTtlSeconds: num(process.env.TOKEN_TTL_SECONDS, 60 * 60 * 2),
  },
  rateLimit: {
    windowMs: num(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
    max: num(process.env.RATE_LIMIT_MAX, 300),
    authWindowMs: num(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60_000),
    authMax: num(process.env.AUTH_RATE_LIMIT_MAX, 20),
  },
  pagination: {
    productSearchMax: num(process.env.PRODUCT_SEARCH_MAX, 100),
    ordersListMax: num(process.env.ORDERS_LIST_MAX, 200),
  },
  inventory: {
    lowStockThreshold: num(process.env.LOW_STOCK_THRESHOLD, 100),
  },
  smtp: {
    host: str(process.env.SMTP_HOST, 'mail.industrialedge.pk'),
    port: num(process.env.SMTP_PORT, 465),
    user: str(process.env.SMTP_USER, 'info@industrialedge.pk'),
    pass: str(process.env.SMTP_PASS, ''),
  },
}

/* Shipping resolver used by order creation AND exposed to the storefront so
   the client never re-implements (and drifts from) the server's rates. */
export function shippingFor(deliveryCode, subtotal) {
  const s = config.shipping
  switch (deliveryCode) {
    case 'PIK': return 0          // self pickup
    case 'FRT': return 0          // freight quoted separately
    case 'EXP': return s.expressRate
    case 'COD':
    case 'STD':
    default: return subtotal >= s.freeThreshold ? 0 : s.standardRate
  }
}
