import { NextRequest, NextResponse } from "next/server";
import { getProductDetailFull } from "@/lib/elimapi";
import type { Platform } from "@/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const platform = (req.nextUrl.searchParams.get("platform") ?? "taobao") as Platform;

    const { product, pictures, description } = await getProductDetailFull(
      id,
      platform
    );

    return NextResponse.json({
      id: product.id,
      platform: product.platform,
      title_cn: product.title_cn,
      pictures,
      description,
      price_cny: product.price_cny,
      shop_name: product.shop_name,
      sales_count: product.sales_count,
      product_url: product.product_url,
      skus: product.skus,
    });
  } catch (error) {
    console.error("Product detail error:", error);
    return NextResponse.json(
      { error: "Failed to fetch product details" },
      { status: 500 }
    );
  }
}
