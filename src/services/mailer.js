import nodemailer from 'nodemailer'
import { ORDER_STATUS } from '../payments/constants.js'
import { config } from '../config.js'
import { SiteSetting } from '../models/SiteSetting.js'

// Setup Gmail SMTP transporter
const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.port === 465,
  auth: {
    user: config.smtp.user,
    pass: config.smtp.pass,
  },
  tls: {
    rejectUnauthorized: false,
  },
})

async function getAdminAlertEmail() {
  try {
    const setting = await SiteSetting.findOne({ key: 'adminAlertEmail' }).lean()
    return setting?.value || config.company.email
  } catch {
    return config.company.email
  }
}

async function deliver(kind, emailAddress, subject, bodyText, bodyHtml) {
  // eslint-disable-next-line no-console
  console.log(`✉  [mail:${kind}] → ${emailAddress} · subject: "${subject}"`)

  if (!config.smtp.pass) {
    // eslint-disable-next-line no-console
    console.log(`ℹ [mail:SMTP] Skipping SMTP delivery: SMTP_PASS environment variable is not configured in .env. Falling back to log only.`)
    return { sent: false, logged: true, kind, to: emailAddress }
  }

  try {
    const info = await transporter.sendMail({
      from: `"${config.company.name}" <${config.smtp.user}>`,
      to: emailAddress,
      subject: subject,
      text: bodyText,
      html: bodyHtml,
    })
    // eslint-disable-next-line no-console
    console.log(`✉ [mail:SMTP] Sent successfully: ${info.messageId}`)
    return { sent: true, kind, to: emailAddress, messageId: info.messageId }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`❌ [mail:SMTP] Failed to send email via SMTP:`, err.message)
    return { sent: false, error: err.message }
  }
}

function assertPaid(order, kind) {
  if (order.status !== ORDER_STATUS.PAID) {
    // eslint-disable-next-line no-console
    console.warn(`✋ Refusing to send "${kind}" for order ${order.ref}: status is ${order.status}, not PAID`)
    return false
  }
  return true
}

export const mailer = {
  /** Allowed only when PAID. */
  async sendOrderConfirmation(order) {
    if (!assertPaid(order, 'order-confirmation')) return null
    const subject = `Order Confirmed: ${order.ref} - ${config.company.name}`
    const text = `Hi ${order.customer?.name},\n\nYour order ${order.ref} has been confirmed. Thank you for shopping with us!\n\nTotal Amount: Rs. ${order.total}\nPayment Method: Cash on Delivery`
    const html = `<div style="font-family:sans-serif;padding:20px;color:#333;">
      <h2>Order Confirmed!</h2>
      <p>Hi <strong>${order.customer?.name}</strong>,</p>
      <p>Your order <strong>${order.ref}</strong> has been confirmed. Thank you for shopping with ${config.company.name}!</p>
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />
      <p><strong>Total Amount:</strong> Rs. ${order.total}</p>
      <p><strong>Payment Method:</strong> Cash on Delivery (COD)</p>
    </div>`
    return deliver('order-confirmation', order.customer?.email, subject, text, html)
  },

  async sendInvoice(order) {
    if (!assertPaid(order, 'invoice')) return null
    const subject = `Invoice for Order ${order.ref} - ${config.company.name}`
    const text = `Hi ${order.customer?.name},\n\nHere is your invoice for order ${order.ref}.\n\nTotal Paid: Rs. ${order.total}`
    const html = `<div style="font-family:sans-serif;padding:20px;color:#333;">
      <h2>Invoice</h2>
      <p>Order Reference: <strong>${order.ref}</strong></p>
      <table style="width:100%;border-collapse:collapse;margin:15px 0;">
        <thead>
          <tr style="background:#f5f5f5;">
            <th style="padding:8px;border:1px solid #ddd;text-align:left;">Item</th>
            <th style="padding:8px;border:1px solid #ddd;text-align:right;">Qty</th>
            <th style="padding:8px;border:1px solid #ddd;text-align:right;">Price</th>
          </tr>
        </thead>
        <tbody>
          ${order.lines.map(l => `<tr>
            <td style="padding:8px;border:1px solid #ddd;">${l.name}</td>
            <td style="padding:8px;border:1px solid #ddd;text-align:right;">${l.qty}</td>
            <td style="padding:8px;border:1px solid #ddd;text-align:right;">Rs. ${l.price}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <p style="text-align:right;font-size:1.1rem;"><strong>Total:</strong> Rs. ${order.total}</p>
    </div>`
    return deliver('invoice', order.customer?.email, subject, text, html)
  },

  async sendReceipt(order) {
    if (!assertPaid(order, 'receipt')) return null
    const subject = `Payment Receipt for Order ${order.ref}`
    const text = `Hi ${order.customer?.name},\n\nPayment received for order ${order.ref}.\n\nTotal: Rs. ${order.total}`
    const html = `<p>Hi ${order.customer?.name}, payment has been received for order ${order.ref}.</p>`
    return deliver('receipt', order.customer?.email, subject, text, html)
  },

  /** Optional, allowed pre-payment: "we received your order, awaiting payment". */
  async sendPendingPaymentNotice(order) {
    if (order.status !== ORDER_STATUS.PENDING_PAYMENT) return null
    const subject = `Order Placed: ${order.ref} - Pending Payment`
    const text = `Hi ${order.customer?.name},\n\nYour order ${order.ref} has been placed. We will dispatch it shortly.\n\nTotal Amount: Rs. ${order.total}`
    const html = `<div style="font-family:sans-serif;padding:20px;color:#333;">
      <h2>Order Placed!</h2>
      <p>Hi <strong>${order.customer?.name}</strong>,</p>
      <p>Your order <strong>${order.ref}</strong> has been successfully placed. We will dispatch it via Cash on Delivery.</p>
    </div>`
    return deliver('pending-payment-notice', order.customer?.email, subject, text, html)
  },

  async sendAdminOrderNotification(order) {
    const adminEmail = await getAdminAlertEmail()
    const subject = `⚠️ [New Order Alert] Reference: ${order.ref}`
    const text = `A new order has been placed on Industrial Edge!\n\nReference: ${order.ref}\nCustomer Name: ${order.customer?.name}\nCustomer Email: ${order.customer?.email}\nCustomer Phone: ${order.customer?.phone}\nTotal Amount: Rs. ${order.total}\n\nView details in the admin panel: http://localhost:5173/admin`
    const html = `<div style="font-family:sans-serif;padding:20px;color:#333;">
      <h2>New Order Placed!</h2>
      <p>A new order has been received on <strong>Industrial Edge</strong>.</p>
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />
      <p><strong>Order Reference:</strong> ${order.ref}</p>
      <p><strong>Customer Name:</strong> ${order.customer?.name}</p>
      <p><strong>Customer Email:</strong> ${order.customer?.email}</p>
      <p><strong>Customer Phone:</strong> ${order.customer?.phone}</p>
      <p><strong>Total Amount:</strong> Rs. ${order.total}</p>
      <p><strong>Payment Method:</strong> Cash on Delivery (COD)</p>
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />
      <p><a href="http://localhost:5173/admin" style="background: #f59e0b; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">Go to Admin Panel</a></p>
    </div>`
    return deliver('admin-order-notification', adminEmail, subject, text, html)
  },

  async sendNewsletterWelcome(emailAddress) {
    const subject = `Welcome to Member Club - ${config.company.name}`
    const text = `Thank you for joining our Member Club! You will receive exclusive discounts and product launches.\n\nBest regards,\nThe Team`
    const html = `<div style="font-family:sans-serif;padding:20px;color:#333;">
      <h2>Welcome to the Member Club!</h2>
      <p>Thank you for joining our Member Club. Get ready for exclusive discounts and next-gen technology updates directly in your inbox.</p>
    </div>`
    return deliver('newsletter-welcome', emailAddress, subject, text, html)
  },
}
