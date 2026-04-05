import { NextResponse } from "next/server";
import { getFxRates, SUPPORTED_CURRENCIES } from "@/lib/currency";

export async function GET() {
  try {
    const rates = await getFxRates();

    return NextResponse.json({
      rates,
      base: "CNY",
      currencies: SUPPORTED_CURRENCIES,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("FX rate fetch failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch exchange rates" },
      { status: 500 }
    );
  }
}
