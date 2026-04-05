"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { CurrencyInfo, FxRates } from "@/types";
import {
  detectCurrencyFromLocale,
  getCurrencyInfo,
  SUPPORTED_CURRENCIES,
  formatPrice as formatPriceUtil,
} from "./currency";

interface CurrencyContextValue {
  currency: CurrencyInfo;
  currencyCode: string;
  setCurrency: (code: string) => void;
  rates: Record<string, number> | null;
  formatPrice: (amountCny: number) => string;
  convertFromCny: (amountCny: number) => number;
  supportedCurrencies: CurrencyInfo[];
  isLoading: boolean;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

const STORAGE_KEY = "commercat_currency";

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currencyCode, setCurrencyCode] = useState("USD");
  const [rates, setRates] = useState<Record<string, number> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Auto-detect currency on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setCurrencyCode(stored);
    } else {
      const detected = detectCurrencyFromLocale(navigator.language);
      setCurrencyCode(detected);
      localStorage.setItem(STORAGE_KEY, detected);
    }
  }, []);

  // Fetch FX rates
  useEffect(() => {
    async function fetchRates() {
      try {
        const response = await fetch("/api/fx-rate");
        if (response.ok) {
          const data: FxRates = await response.json();
          setRates(data.rates);
        }
      } catch (error) {
        console.error("Failed to fetch FX rates:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchRates();

    // Refresh every 15 minutes
    const interval = setInterval(fetchRates, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const setCurrency = useCallback((code: string) => {
    setCurrencyCode(code);
    localStorage.setItem(STORAGE_KEY, code);
  }, []);

  const convertFromCny = useCallback(
    (amountCny: number): number => {
      if (!rates || !rates[currencyCode]) return amountCny;
      return Math.round(amountCny * rates[currencyCode] * 100) / 100;
    },
    [rates, currencyCode]
  );

  const formatPrice = useCallback(
    (amountCny: number): string => {
      const converted = convertFromCny(amountCny);
      return formatPriceUtil(converted, currencyCode);
    },
    [convertFromCny, currencyCode]
  );

  const value: CurrencyContextValue = {
    currency: getCurrencyInfo(currencyCode),
    currencyCode,
    setCurrency,
    rates,
    formatPrice,
    convertFromCny,
    supportedCurrencies: SUPPORTED_CURRENCIES,
    isLoading,
  };

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyContextValue {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error("useCurrency must be used within a CurrencyProvider");
  }
  return context;
}
