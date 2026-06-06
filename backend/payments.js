// ============================================================
// BIZPILOT PAYMENT MODULE
// Razorpay payment link generation and webhook handling
// Sends payment links to customers via WhatsApp
// ============================================================

require('dotenv').config();
const Razorpay = require('razorpay');
const logger = require('./logger');

// Lazily initialize so missing keys don't crash server at startup
let razorpay = null;

function getRazorpay() {
  if (!razorpay) {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new Error('Razorpay keys not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env');
    }
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
  }
  return razorpay;
}

// ── CREATE PAYMENT LINK ──────────────────────────────────
// Creates a Razorpay payment link and returns the short URL
// the business owner can forward to their customer

async function createPaymentLink({ amount, customerName, customerPhone, description, businessName, notifyWhatsapp = true }) {
  const rz = getRazorpay();

  const options = {
    amount: Math.round(amount * 100), // Razorpay uses paise
    currency: 'INR',
    accept_partial: false,
    description: description || ('Payment to ' + businessName),
    customer: {
      name: customerName || 'Customer',
      contact: customerPhone ? '+91' + String(customerPhone).replace(/\D/g, '').replace(/^91/, '') : undefined
    },
    notify: {
      sms: false,
      email: false,
      whatsapp: notifyWhatsapp && !!customerPhone
    },
    reminder_enable: true,
    notes: {
      business: businessName || 'BizPilot Business',
      generated_by: 'BizPilot'
    },
    callback_url: process.env.APP_URL ? process.env.APP_URL + '/payment/success' : undefined,
    callback_method: 'get'
  };

  // Remove undefined fields
  if (!options.customer.contact) delete options.customer.contact;
  if (!options.callback_url) delete options.callback_url;

  try {
    const link = await rz.paymentLink.create(options);
    logger.info('Payment link created: ' + link.id + ' for ' + amount);
    return {
      id: link.id,
      shortUrl: link.short_url,
      amount: amount,
      status: link.status
    };
  } catch (e) {
    logger.error('createPaymentLink error: ' + e.message);
    throw e;
  }
}

// ── CHECK PAYMENT LINK STATUS ────────────────────────────
async function getPaymentLinkStatus(linkId) {
  const rz = getRazorpay();
  try {
    const link = await rz.paymentLink.fetch(linkId);
    return {
      id: link.id,
      status: link.status, // created, partially_paid, expired, cancelled, paid
      amountPaid: link.amount_paid / 100,
      amount: link.amount / 100
    };
  } catch (e) {
    logger.error('getPaymentLinkStatus error: ' + e.message);
    return null;
  }
}

// ── VERIFY RAZORPAY WEBHOOK SIGNATURE ───────────────────
function verifyWebhookSignature(body, signature, secret) {
  const crypto = require('crypto');
  const expected = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(body))
    .digest('hex');
  return expected === signature;
}

// ── FORMAT PAYMENT MESSAGE FOR WHATSAPP ─────────────────
// Generates the WhatsApp message to send to the business owner
// when a customer pays via the link

function formatPaymentReceivedMessage(paymentData, business) {
  const amount = (paymentData.payload.payment.entity.amount / 100).toLocaleString('en-IN');
  const method = paymentData.payload.payment.entity.method || 'online';
  return '✅ *Payment Received!*\n\n' +
    'Amount: ₹' + amount + '\n' +
    'Method: ' + method + '\n' +
    'Payment ID: ' + paymentData.payload.payment.entity.id + '\n\n' +
    'BizPilot mein automatically record ho gaya hai.';
}

module.exports = {
  createPaymentLink,
  getPaymentLinkStatus,
  verifyWebhookSignature,
  formatPaymentReceivedMessage
};
