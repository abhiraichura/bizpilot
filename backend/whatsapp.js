require('dotenv').config();
const axios = require('axios');
const logger = require('./logger');

function normalizeForWati(phone) {
  if (!phone) return null;
  return String(phone).replace(/[\+\s\-]/g, '').replace(/^0+/, '');
}

// ── SEND MESSAGE ───────────────────────────────────────────
// messageText must be a query parameter for Wati sendSessionMessage API
async function sendMessage(phone, message) {
  const normalized = normalizeForWati(phone);
  if (!normalized) { logger.error('sendMessage: invalid phone'); return; }

  try {
    const url = process.env.WATI_API_ENDPOINT +
      '/api/v1/sendSessionMessage/' + normalized +
      '?messageText=' + encodeURIComponent(message);

    const response = await axios.post(url, {}, {
      headers: {
        Authorization: 'Bearer ' + process.env.WATI_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    const data = response.data || {};
    if (data.result === false) {
      logger.error('Wati rejected message: ' + (data.info || JSON.stringify(data)) + ' phone=' + normalized);
    } else {
      logger.info('Message sent to ' + normalized);
    }

  } catch(e) {
    const status = e.response ? e.response.status : 'no_response';
    const body = e.response ? JSON.stringify(e.response.data) : e.message;
    logger.error('sendMessage failed status=' + status + ' body=' + body + ' phone=' + normalized);
  }
}

// ── PARSE INCOMING WEBHOOK ─────────────────────────────────
function parseWebhook(body) {
  try {
    const phone = body.waId || body.from || (body.contact && body.contact.wa_id);
    if (!phone) return null;

    const msg = {
      phone: String(phone),
      messageId: body.id || body.messageId || null,
      type: 'text',
      text: null,
      mediaUrl: null
    };

    if (body.type === 'audio' || body.type === 'voice') {
      msg.type = 'voice';
      msg.mediaUrl = body.audio ? body.audio.url : null;
    } else if (body.type === 'image') {
      msg.type = 'image';
      msg.mediaUrl = body.image ? body.image.url : null;
      msg.text = body.image ? (body.image.caption || '') : '';
    } else {
      msg.text = body.text || body.body ||
        (body.text_body && body.text_body.body) || '';
    }

    return msg;
  } catch(e) {
    logger.error('parseWebhook: ' + e.message);
    return null;
  }
}

// ── TRANSCRIBE VOICE NOTE ──────────────────────────────────
async function transcribeVoice(mediaUrl) {
  if (!mediaUrl || !process.env.OPENAI_API_KEY) return null;
  try {
    const FormData = require('form-data');
    const audioRes = await axios.get(mediaUrl, {
      responseType: 'arraybuffer',
      headers: { Authorization: 'Bearer ' + process.env.WATI_ACCESS_TOKEN }
    });
    const form = new FormData();
    form.append('file', Buffer.from(audioRes.data), { filename: 'audio.ogg', contentType: 'audio/ogg' });
    form.append('model', 'whisper-1');
    form.append('language', 'hi');
    const res = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
      headers: { ...form.getHeaders(), Authorization: 'Bearer ' + process.env.OPENAI_API_KEY }
    });
    return res.data.text;
  } catch(e) {
    logger.error('transcribeVoice: ' + e.message);
    return null;
  }
}

module.exports = { sendMessage, parseWebhook, transcribeVoice, normalizeForWati };
