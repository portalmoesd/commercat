import { NextRequest, NextResponse } from "next/server";
import { searchByImage } from "@/lib/elimapi";
import type { Platform } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      image_url,
      platform = "taobao",
    }: { image_url: string; platform?: Platform } = body;

    if (!image_url || typeof image_url !== "string") {
      return NextResponse.json(
        { error: "image_url is required" },
        { status: 400 }
      );
    }

    const products = await searchByImage(image_url, platform);

    return NextResponse.json({ products });
  } catch (error) {
    console.error("Image search error:", error);
    return NextResponse.json(
      { error: "Image search failed" },
      { status: 500 }
    );
  }
}
