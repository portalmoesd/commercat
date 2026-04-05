import { NextRequest, NextResponse } from "next/server";
import {
  searchByImage as lensSearch,
  extractSearchTerms,
  findBrandPrice,
} from "@/lib/lens";
import { searchByKeyword } from "@/lib/elimapi";
import { translateQuery, filterResults } from "@/lib/gemini";
import { calculatePrice } from "@/lib/pricing";
import { getFxRates } from "@/lib/currency";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { image_url, currency = "USD" } = body;

    if (!image_url || typeof image_url !== "string") {
      return NextResponse.json(
        { error: "image_url is required" },
        { status: 400 }
      );
    }

    // 1. Google Lens — get visual matches
    const lensMatches = await lensSearch(image_url);
    const brandPrice = findBrandPrice(lensMatches);
    const searchTerms = extractSearchTerms(lensMatches);

    // 2. Translate to Chinese and search marketplace
    const allProducts: object[] = [];
    for (const term of searchTerms.slice(0, 2)) {
      const cnTerms = await translateQuery(term);
      for (const cnTerm of cnTerms.slice(0, 2)) {
        const results = await searchByKeyword(cnTerm, "taobao");
        allProducts.push(...results);
      }
    }

    // 3. Filter with Gemini
    const filtered = await filterResults(searchTerms.join(", "), allProducts);

    // 4. Apply pricing
    const rates = await getFxRates();
    const fxRate = rates[currency] ?? rates["USD"];

    const priced = filtered.map((p) => ({
      ...p,
      ...calculatePrice(p.price_cny, 0, fxRate, currency),
    }));

    return NextResponse.json({
      products: priced,
      brand_price: brandPrice,
      lens_matches: lensMatches.slice(0, 3),
    });
  } catch (error) {
    console.error("Image search error:", error);
    return NextResponse.json(
      { error: "Image search failed" },
      { status: 500 }
    );
  }
}
