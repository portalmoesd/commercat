import type { CurrencyInfo } from "@/types";
import { redis } from "./redis";

const FX_CACHE_TTL = 15 * 60; // 15 minutes in seconds
const FX_CACHE_KEY = "fx:rates";

/** All supported currencies with display info */
export const SUPPORTED_CURRENCIES: CurrencyInfo[] = [
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "GEL", symbol: "₾", name: "Georgian Lari" },
  { code: "TRY", symbol: "₺", name: "Turkish Lira" },
  { code: "AED", symbol: "د.إ", name: "UAE Dirham" },
  { code: "SAR", symbol: "﷼", name: "Saudi Riyal" },
  { code: "KZT", symbol: "₸", name: "Kazakhstani Tenge" },
  { code: "AZN", symbol: "₼", name: "Azerbaijani Manat" },
  { code: "UAH", symbol: "₴", name: "Ukrainian Hryvnia" },
  { code: "RUB", symbol: "₽", name: "Russian Ruble" },
  { code: "INR", symbol: "₹", name: "Indian Rupee" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen" },
  { code: "KRW", symbol: "₩", name: "South Korean Won" },
  { code: "THB", symbol: "฿", name: "Thai Baht" },
  { code: "MYR", symbol: "RM", name: "Malaysian Ringgit" },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar" },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar" },
  { code: "CHF", symbol: "CHF", name: "Swiss Franc" },
  { code: "SEK", symbol: "kr", name: "Swedish Krona" },
  { code: "NOK", symbol: "kr", name: "Norwegian Krone" },
  { code: "DKK", symbol: "kr", name: "Danish Krone" },
  { code: "PLN", symbol: "zł", name: "Polish Zloty" },
  { code: "CZK", symbol: "Kč", name: "Czech Koruna" },
  { code: "HUF", symbol: "Ft", name: "Hungarian Forint" },
  { code: "RON", symbol: "lei", name: "Romanian Leu" },
  { code: "BGN", symbol: "лв", name: "Bulgarian Lev" },
  { code: "ILS", symbol: "₪", name: "Israeli Shekel" },
  { code: "BRL", symbol: "R$", name: "Brazilian Real" },
  { code: "MXN", symbol: "$", name: "Mexican Peso" },
  { code: "ZAR", symbol: "R", name: "South African Rand" },
  { code: "NGN", symbol: "₦", name: "Nigerian Naira" },
  { code: "EGP", symbol: "E£", name: "Egyptian Pound" },
  { code: "PKR", symbol: "₨", name: "Pakistani Rupee" },
  { code: "BDT", symbol: "৳", name: "Bangladeshi Taka" },
  { code: "VND", symbol: "₫", name: "Vietnamese Dong" },
  { code: "IDR", symbol: "Rp", name: "Indonesian Rupiah" },
  { code: "PHP", symbol: "₱", name: "Philippine Peso" },
];

const SUPPORTED_CODES = new Set(SUPPORTED_CURRENCIES.map((c) => c.code));

/** Map browser locale to default currency */
export function detectCurrencyFromLocale(locale: string): string {
  const mapping: Record<string, string> = {
    en_US: "USD",
    en_GB: "GBP",
    en_AU: "AUD",
    en_CA: "CAD",
    en_SG: "SGD",
    ka_GE: "GEL",
    ka: "GEL",
    tr_TR: "TRY",
    tr: "TRY",
    ar_AE: "AED",
    ar_SA: "SAR",
    ar_EG: "EGP",
    kk_KZ: "KZT",
    az_AZ: "AZN",
    uk_UA: "UAH",
    uk: "UAH",
    ru_RU: "RUB",
    ru: "RUB",
    hi_IN: "INR",
    ja_JP: "JPY",
    ja: "JPY",
    ko_KR: "KRW",
    ko: "KRW",
    th_TH: "THB",
    th: "THB",
    ms_MY: "MYR",
    de_DE: "EUR",
    de_AT: "EUR",
    fr_FR: "EUR",
    it_IT: "EUR",
    es_ES: "EUR",
    nl_NL: "EUR",
    pt_PT: "EUR",
    fi_FI: "EUR",
    el_GR: "EUR",
    de_CH: "CHF",
    fr_CH: "CHF",
    sv_SE: "SEK",
    sv: "SEK",
    nb_NO: "NOK",
    nn_NO: "NOK",
    da_DK: "DKK",
    da: "DKK",
    pl_PL: "PLN",
    pl: "PLN",
    cs_CZ: "CZK",
    cs: "CZK",
    hu_HU: "HUF",
    hu: "HUF",
    ro_RO: "RON",
    ro: "RON",
    bg_BG: "BGN",
    bg: "BGN",
    he_IL: "ILS",
    he: "ILS",
    pt_BR: "BRL",
    es_MX: "MXN",
    zu_ZA: "ZAR",
    id_ID: "IDR",
    id: "IDR",
    vi_VN: "VND",
    vi: "VND",
    fil_PH: "PHP",
    bn_BD: "BDT",
  };

  // Normalize: "en-US" → "en_US"
  const normalized = locale.replace("-", "_");

  // Try exact match, then language-only match
  return mapping[normalized] ?? mapping[normalized.split("_")[0]] ?? "USD";
}

/** Get currency info by code */
export function getCurrencyInfo(code: string): CurrencyInfo {
  return (
    SUPPORTED_CURRENCIES.find((c) => c.code === code) ?? {
      code,
      symbol: code,
      name: code,
    }
  );
}

/** Format a price with currency symbol */
export function formatPrice(amount: number, currencyCode: string): string {
  const info = getCurrencyInfo(currencyCode);
  const formatted = amount.toFixed(2);
  return `${info.symbol}${formatted}`;
}

/** Fetch all FX rates from API, cache in Redis */
export async function getFxRates(): Promise<Record<string, number>> {
  // Try cache first
  const cached = await redis.get<Record<string, number>>(FX_CACHE_KEY);
  if (cached) return cached;

  // Fetch fresh rates from exchangerate-api.com
  const apiKey = process.env.FX_API_KEY;
  const response = await fetch(
    `https://v6.exchangerate-api.com/v6/${apiKey}/latest/CNY`
  );

  if (!response.ok) {
    throw new Error(`FX API error: ${response.status}`);
  }

  const data = await response.json();
  const allRates: Record<string, number> = data.conversion_rates;

  // Filter to only supported currencies
  const rates: Record<string, number> = {};
  for (const code of SUPPORTED_CODES) {
    if (allRates[code] !== undefined) {
      rates[code] = allRates[code];
    }
  }

  // Cache for 15 minutes
  await redis.set(FX_CACHE_KEY, rates, { ex: FX_CACHE_TTL });

  return rates;
}

/** Get a single FX rate for CNY → target currency */
export async function getFxRate(targetCurrency: string): Promise<number> {
  const rates = await getFxRates();
  const rate = rates[targetCurrency];
  if (rate === undefined) {
    throw new Error(`Unsupported currency: ${targetCurrency}`);
  }
  return rate;
}
