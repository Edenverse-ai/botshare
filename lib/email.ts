import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY!);
  }
  return _resend;
}

/**
 * Booking mail is conversational — a customer may well reply to it — so it
 * keeps a monitored mailbox. Account mail (verification codes, password
 * resets) is machine-generated and must never invite a reply, so it goes out
 * from no-reply. Both are on hifivebot.com, so one domain verification in
 * Resend covers them — but a sender on any other domain needs its own.
 */
const FROM = `Hifivebot <${process.env.RESEND_FROM_EMAIL ?? "bookings@hifivebot.com"}>`;
const AUTH_FROM = `Hifivebot <${
  process.env.RESEND_AUTH_FROM_EMAIL ?? "no-reply@hifivebot.com"
}>`;
const LOGO_URL = "https://hifivebot.com/hifivebot-logo.png";
const SITE_URL = "https://hifivebot.com";

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function emailLayout(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <!-- Header -->
        <tr>
          <td style="background:#ffffff;padding:24px 32px;border-bottom:1px solid #e5e7eb;">
            <img src="${LOGO_URL}" alt="Hifivebot" width="150" style="display:block;height:auto;">
          </td>
        </tr>
        <!-- Body -->
        <tr><td style="padding:32px;">${body}</td></tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f3f4f6;padding:20px 32px;border-top:1px solid #e5e7eb;text-align:center;">
            <p style="margin:0;font-size:12px;color:#6b7280;">
              <strong style="color:#111827;">HIFIVEBOT</strong> &nbsp;·&nbsp;
              <a href="${SITE_URL}" style="color:#6b7280;text-decoration:none;">${SITE_URL}</a> &nbsp;·&nbsp;
              <a href="mailto:info@usrobotx.com" style="color:#6b7280;text-decoration:none;">info@usrobotx.com</a>
            </p>
            <p style="margin:8px 0 0;font-size:11px;color:#9ca3af;">
              Robot Service Rentals &mdash; Powered by Hifivebot
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function sectionTable(rows: { label: string; value: string }[]): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin:16px 0;">
    ${rows
      .map(
        (r, i) => `
    <tr style="background:${i % 2 === 0 ? "#f9fafb" : "#ffffff"};">
      <td style="padding:10px 16px;font-size:13px;color:#6b7280;width:40%;">${r.label}</td>
      <td style="padding:10px 16px;font-size:13px;color:#111827;font-weight:500;">${r.value}</td>
    </tr>`
      )
      .join("")}
  </table>`;
}

function ctaButton(label: string, href: string): string {
  return `<div style="text-align:center;margin:24px 0;">
    <a href="${href}" style="display:inline-block;background:#000000;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;">${label}</a>
  </div>`;
}

export interface BookingEmailData {
  reservation: {
    id: string;
    startDate: Date;
    endDate: Date;
    totalPrice: number;
  };
  customer: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    userType?: string | null;
  } | null;
  listing: {
    title: string;
    category?: string | null;
    locationValue?: string | null;
  } | null;
}

export async function sendAdminBookingNotification(data: BookingEmailData) {
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  if (adminEmails.length === 0) return;

  const { reservation, customer, listing } = data;
  const title = listing?.title ?? "Service";

  const body = `
    <h2 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#111827;">New Booking Received</h2>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">A booking has been confirmed and payment processed.</p>

    <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#111827;text-transform:uppercase;letter-spacing:0.05em;">Booking Details</p>
    ${sectionTable([
      { label: "Booking ID", value: `<span style="font-family:monospace;font-size:12px;">${reservation.id}</span>` },
      { label: "Service", value: title },
      { label: "Category", value: listing?.category ?? "—" },
      { label: "Location", value: listing?.locationValue ?? "—" },
      { label: "Start date", value: formatDate(reservation.startDate) },
      { label: "End date", value: formatDate(reservation.endDate) },
      { label: "Total paid", value: `$${reservation.totalPrice.toLocaleString()}` },
    ])}

    <p style="margin:20px 0 8px;font-size:13px;font-weight:600;color:#111827;text-transform:uppercase;letter-spacing:0.05em;">Customer Info</p>
    ${sectionTable([
      { label: "Name", value: customer?.name ?? "—" },
      { label: "Email", value: customer?.email ?? "—" },
      { label: "Phone", value: customer?.phone ?? "—" },
      { label: "Account type", value: customer?.userType ?? "—" },
    ])}

    ${ctaButton("View Orders", `${SITE_URL}/admin/orders`)}
  `;

  const { error } = await getResend().emails.send({
    from: FROM,
    to: adminEmails,
    subject: `New Booking — ${title} | Hifivebot`,
    html: emailLayout(body),
  });
  if (error) throw new Error(`Resend admin email failed: ${JSON.stringify(error)}`);
}

export async function sendCustomerBookingConfirmation(data: BookingEmailData) {
  const { reservation, customer, listing } = data;
  if (!customer?.email) return;

  const title = listing?.title ?? "Service";

  const body = `
    <h2 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#111827;">Your Booking is Confirmed</h2>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">
      Hi ${customer.name ?? "there"}, your booking has been received and payment processed successfully.
    </p>

    <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#111827;text-transform:uppercase;letter-spacing:0.05em;">Booking Summary</p>
    ${sectionTable([
      { label: "Booking ID", value: `<span style="font-family:monospace;font-size:12px;">${reservation.id}</span>` },
      { label: "Service", value: title },
      { label: "Location", value: listing?.locationValue ?? "—" },
      { label: "Start date", value: formatDate(reservation.startDate) },
      { label: "End date", value: formatDate(reservation.endDate) },
      { label: "Total paid", value: `$${reservation.totalPrice.toLocaleString()}` },
    ])}

    <p style="font-size:14px;color:#6b7280;margin:20px 0 0;">
      Our team will reach out shortly to coordinate deployment details and confirm your service schedule.
      If you have any questions, reply to this email or contact us at
      <a href="mailto:info@usrobotx.com" style="color:#111827;">info@usrobotx.com</a>.
    </p>

    ${ctaButton("View My Bookings", `${SITE_URL}/trips`)}
  `;

  const { error } = await getResend().emails.send({
    from: FROM,
    to: customer.email,
    subject: `Booking Confirmed — ${title} | Hifivebot`,
    html: emailLayout(body),
  });
  if (error) throw new Error(`Resend customer email failed: ${JSON.stringify(error)}`);
}

export async function sendVerificationCode(
  email: string,
  code: string,
  name?: string | null
) {
  const body = `
    <h2 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#111827;">Verify your email</h2>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">
      Hi ${name ?? "there"}, use the code below to finish creating your Hifivebot account.
      It expires in 10 minutes.
    </p>
    <div style="text-align:center;margin:8px 0 24px;">
      <div style="display:inline-block;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:12px;
                  padding:18px 28px;font-family:monospace;font-size:34px;font-weight:700;
                  letter-spacing:10px;color:#111827;">${code}</div>
    </div>
    <p style="font-size:13px;color:#9ca3af;margin:0;">
      If you didn't request this, you can safely ignore this email.
    </p>
  `;

  const { error } = await getResend().emails.send({
    from: AUTH_FROM,
    to: email,
    subject: `Your Hifivebot verification code: ${code}`,
    html: emailLayout(body),
  });
  if (error) throw new Error(`Resend verification email failed: ${JSON.stringify(error)}`);
}

export async function sendPasswordResetCode(
  email: string,
  code: string,
  name?: string | null
) {
  const body = `
    <h2 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#111827;">Reset your password</h2>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">
      Hi ${name ?? "there"}, use the code below to reset your Hifivebot password.
      It expires in 10 minutes.
    </p>
    <div style="text-align:center;margin:8px 0 24px;">
      <div style="display:inline-block;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:12px;
                  padding:18px 28px;font-family:monospace;font-size:34px;font-weight:700;
                  letter-spacing:10px;color:#111827;">${code}</div>
    </div>
    <p style="font-size:13px;color:#9ca3af;margin:0;">
      If you didn't request this, you can safely ignore this email &mdash; your password won't change.
    </p>
  `;

  const { error } = await getResend().emails.send({
    from: AUTH_FROM,
    to: email,
    subject: `Your Hifivebot password reset code: ${code}`,
    html: emailLayout(body),
  });
  if (error) throw new Error(`Resend password reset email failed: ${JSON.stringify(error)}`);
}
