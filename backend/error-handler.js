// ============================================================
// BIZPILOT ERROR HANDLER
// Catches errors at every layer and ensures the business
// owner always gets a response, never silence
// ============================================================

const logger = require('./logger');

// ── SAFE MESSAGE SENDER ──────────────────────────────────
// Wraps whatsapp.sendMessage so it never throws
async function safeSend(whatsapp, phone, message) {
  try {
    await whatsapp.sendMessage(phone, message);
  } catch(e) {
    logger.error('safeSend failed for ' + phone + ': ' + e.message);
  }
}

// ── ERROR MESSAGES BY TYPE ───────────────────────────────
function getErrorMessage(error, language) {
  const lang = language || 'hindi';

  const msgs = {
    ai_failed: {
      hindi: 'Kuch technical problem aayi. Thoda wait karein aur dobara try karein. 🙏',
      gujarati: 'Thodi technical problem aayi che. Thodi var raho ane pharthi try karo. 🙏',
      english: 'A technical issue occurred. Please wait a moment and try again. 🙏'
    },
    db_failed: {
      hindi: 'Data save karne mein problem aayi. Dobara message karein. 🙏',
      gujarati: 'Data save karvama problem aayi. Pharthi message karo. 🙏',
      english: 'Could not save data. Please send the message again. 🙏'
    },
    payment_failed: {
      hindi: 'Payment link banana mein problem aayi. Razorpay settings check karein ya manually link share karein.',
      gujarati: 'Payment link banavama problem aayi. Razorpay settings check karo.',
      english: 'Could not create payment link. Check Razorpay settings or share manually.'
    },
    invoice_failed: {
      hindi: 'Invoice generate karne mein problem aayi. Baad mein try karein.',
      gujarati: 'Invoice generate karvama problem aayi. Pachhal try karo.',
      english: 'Could not generate invoice. Please try again later.'
    },
    generic: {
      hindi: 'Kuch problem aayi. Dobara try karein. Agar problem bani rahe toh support se contact karein. 🙏',
      gujarati: 'Koi problem aayi. Pharthi try karo. 🙏',
      english: 'Something went wrong. Please try again. 🙏'
    }
  };

  const type = (error.type || 'generic');
  const msgSet = msgs[type] || msgs.generic;
  return msgSet[lang] || msgSet.hindi;
}

// ── CLASSIFY ERROR ───────────────────────────────────────
function classifyError(error) {
  const msg = error.message || '';
  if (msg.includes('Anthropic') || msg.includes('claude') || msg.includes('AI')) return 'ai_failed';
  if (msg.includes('supabase') || msg.includes('database') || msg.includes('DB')) return 'db_failed';
  if (msg.includes('razorpay') || msg.includes('payment') || msg.includes('Razorpay')) return 'payment_failed';
  if (msg.includes('pdf') || msg.includes('invoice') || msg.includes('PDFKit')) return 'invoice_failed';
  return 'generic';
}

// ── WRAPPED WEBHOOK HANDLER ──────────────────────────────
// Wraps the main processing function with full error recovery
function withErrorRecovery(handler, whatsapp) {
  return async function(phone, messageText, business, ...args) {
    try {
      return await handler(phone, messageText, business, ...args);
    } catch(e) {
      logger.error('Handler error for ' + phone + ': ' + e.message + '\n' + e.stack);
      const errorType = classifyError(e);
      const lang = business ? business.language : 'hindi';
      e.type = errorType;
      const errMsg = getErrorMessage(e, lang);
      await safeSend(whatsapp, phone, errMsg);
    }
  };
}

// ── EXPRESS ERROR MIDDLEWARE ─────────────────────────────
function expressErrorMiddleware(err, req, res, next) {
  logger.error('Express error: ' + err.message);
  res.status(500).json({ error: 'Internal server error', message: err.message });
}

// ── PROCESS-LEVEL UNCAUGHT EXCEPTION HANDLERS ────────────
function setupProcessHandlers() {
  process.on('uncaughtException', function(err) {
    logger.error('Uncaught Exception: ' + err.message + '\n' + err.stack);
    // Don't exit — keep server running
  });

  process.on('unhandledRejection', function(reason, promise) {
    logger.error('Unhandled Rejection: ' + String(reason));
    // Don't exit — keep server running
  });
}

module.exports = {
  safeSend,
  getErrorMessage,
  classifyError,
  withErrorRecovery,
  expressErrorMiddleware,
  setupProcessHandlers
};
