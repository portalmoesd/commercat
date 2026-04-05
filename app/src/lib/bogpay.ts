import { createHmac } from "crypto";

const BOG_API_BASE = "https://api.bog.ge/payments/v1";

interface CreatePaymentParams {
  orderId: string;
  amountGel: number;
  description: string;
  successUrl: string;
  failUrl: string;
}

interface CreatePaymentResult {
  paymentUrl: string;
  paymentId: string;
}

/** Initiate a BOG Pay payment. Always charges in GEL. */
export async function createPayment(
  params: CreatePaymentParams
): Promise<CreatePaymentResult> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;

  const response = await fetch(`${BOG_API_BASE}/payment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.BOG_PAY_API_KEY}`,
    },
    body: JSON.stringify({
      callback_url: `${appUrl}/api/webhooks/bogpay`,
      purchase_units: [
        {
          currency: "GEL",
          total_amount: params.amountGel,
          basket: [
            {
              quantity: 1,
              unit_price: params.amountGel,
              product_id: params.orderId,
            },
          ],
        },
      ],
      redirect_urls: {
        success: params.successUrl,
        fail: params.failUrl,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`BOG Pay error ${response.status}: ${text}`);
  }

  const data = await response.json();
  return {
    paymentUrl: data.redirect_url,
    paymentId: data.id,
  };
}

/** Verify BOG Pay webhook signature using HMAC-SHA256 */
export function verifyBogSignature(
  body: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false;

  const expected = createHmac("sha256", secret).update(body).digest("hex");
  return signature === expected;
}
