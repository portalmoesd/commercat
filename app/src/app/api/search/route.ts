import { NextRequest, NextResponse } from "next/server";
import { searchByKeyword } from "@/lib/elimapi";
import type { Platform } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      query,
      platforms = ["taobao"],
    }: { query: string; platforms?: Platform[] } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "query is required" },
        { status: 400 }
      );
    }

    // Search across requested platforms
    const results = await Promise.all(
      platforms.map((platform) => searchByKeyword(query, platform))
    );

    const products = results.flat();

    return NextResponse.json({
      products,
      query_cn: [query], // will be replaced by Claude-translated terms in /api/chat
    });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 }
    );
  }
}
