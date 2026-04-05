"use client";

import { CurrencyProvider } from "@/lib/currency-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return <CurrencyProvider>{children}</CurrencyProvider>;
}
