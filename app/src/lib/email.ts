const RESEND_API = "https://api.resend.com/emails";

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

async function sendEmail(params: SendEmailParams): Promise<void> {
  const response = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: process.env.FROM_EMAIL ?? "orders@commercat.ge",
      to: params.to,
      subject: params.subject,
      html: params.html,
    }),
  });

  if (!response.ok) {
    console.error("Email send failed:", response.status, await response.text());
  }
}

/** Send order confirmation to user */
export async function sendOrderConfirmationEmail(params: {
  email: string;
  orderNumber: string;
  totalDisplay: string;
  totalGel: string;
  currency: string;
  items: { title: string; quantity: number }[];
}): Promise<void> {
  const itemList = params.items
    .map((i) => `<li>${i.title} x${i.quantity}</li>`)
    .join("");

  await sendEmail({
    to: params.email,
    subject: `Order confirmed — ${params.orderNumber}`,
    html: `
      <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #3C3C3B;">
        <h2 style="font-size: 18px; margin-bottom: 8px;">Payment confirmed!</h2>
        <p style="color: #888780; font-size: 14px;">Order ${params.orderNumber}</p>
        <hr style="border: none; border-top: 1px solid #EEEDE9; margin: 16px 0;" />
        <ul style="font-size: 14px; padding-left: 20px;">${itemList}</ul>
        <hr style="border: none; border-top: 1px solid #EEEDE9; margin: 16px 0;" />
        <p style="font-size: 14px;">
          <strong>Total: ${params.totalDisplay}</strong><br />
          <span style="color: #888780; font-size: 12px;">Charged: ${params.totalGel} GEL</span>
        </p>
        <p style="font-size: 13px; color: #888780; margin-top: 16px;">
          We'll purchase your item in China within 24 hours and update you in chat.
          Commercat purchases this order in your name, to your freight forwarder's personal cabinet.
        </p>
      </div>
    `,
  });
}

/** Notify admin team of new paid order */
export async function notifyAdmins(params: {
  orderNumber: string;
  totalGel: string;
  userEmail: string;
  productUrls: string[];
}): Promise<void> {
  const adminEmails = process.env.ADMIN_EMAILS?.split(",").map((e) =>
    e.trim()
  );
  if (!adminEmails?.length) return;

  const links = params.productUrls
    .map((url) => `<li><a href="${url}">${url}</a></li>`)
    .join("");

  for (const email of adminEmails) {
    await sendEmail({
      to: email,
      subject: `New order: ${params.orderNumber} — ${params.totalGel} GEL`,
      html: `
        <div style="font-family: Arial, sans-serif; font-size: 14px; color: #3C3C3B;">
          <p><strong>${params.orderNumber}</strong> — ${params.totalGel} GEL</p>
          <p>User: ${params.userEmail}</p>
          <p>Product links:</p>
          <ul>${links}</ul>
          <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/admin">Open admin panel</a></p>
        </div>
      `,
    });
  }
}
