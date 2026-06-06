require('dotenv').config();
const axios = require('axios');
const logger = require('./logger');

function normalizeForWati(phone) {
  if (!phone) return null;
  return String(phone).replace(/[\+\s\-]/g, '').replace(/^0+/, '');
}

async function sendMessage(phone, message) {
  const normalized = normalizeForWati(phone);
  try {
    const url = process.env.WATI_API_ENDPOINT + '/api/v1/sendSessionMessage/' + normalized;
    await axios.post(url, { messageText: message }, {
      headers: {
        Authorization: 'Bearer ' + process.env.WATI_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });
    logger.info('Message sent to ' + normalized);
  } catch(e) {
    const status = e.response ? e.response.status : 'no_response';
    const data = e.response ? JSON.stringify(e.response.data) : e.message;
    logger.error('sendMessage failed status=' + status + ' body=' + data + ' phone=' + normalized);
    try { await sendNotification(phone, message); }
    catch(e2) {
      const s2 = e2.response ? e2.response.status : 'no_response';
      const d2 = e2.response ? JSON.stringify(e2.response.data) : e2.message;
      logger.error('Fallback failed status=' + s2 + ' body=' + d2);
    }
  }
}

async function sendNotification(phone, message) {
  const normalized = normalizeForWati(phone);
  const url = process.env.WATI_API_ENDPOINT + '/api/v1/sendTemplateMessage';
  await axios.post(url, {
    template_name: 'bizpilot_notification',
    broadcast_name: 'bizpilot_' + Date.now(),
    receivers: [{ whatsappNumber: normalized, customParams: [{ name: 'message', value: message.substring(0, 1000) }] }]
  }, { headers: { Authorization: 'Bearer ' + process.env.WATI_ACCESS_TOKEN, 'Content-Type': 'application/json' } });
}

function parseWebhook(body) {
  try {
    const phone = body.waId || body.from || (body.contact && body.contact.wa_id);
    if (!phone) return null;
    const msg = { phone: String(phone), messageId: body.id || body.messageId || null, type: 'text', text: null, mediaUrl: null };
    if (body.type === 'audio' || body.type === 'voice') {
      msg.type = 'voice'; msg.mediaUrl = body.audio ? body.audio.url : null;
    } else if (body.type === 'image') {
      msg.type = 'image'; msg.mediaUrl = body.image ? body.image.url : null; msg.text = body.image ? (body.image.caption || '') : '';
    } else {
      msg.text = body.text || body.body || (body.text_body && body.text_body.body) || '';
    }
    return msg;
  } catch(e) { logger.error('parseWebhook: ' + e.message); return null; }
}

async function transcribeVoice(mediaUrl) {
  if (!mediaUrl || !process.env.OPENAI_API_KEY) return null;
  try {
    const FormData = require('form-data');
    const audioRes = await axios.get(mediaUrl, { responseType: 'arraybuffer', headers: { Authorization: 'Bearer ' + process.env.WATI_ACCESS_TOKEN } });
    const form = new FormData();
    form.append('file', Buffer.from(audioRes.data), { filename: 'audio.ogg', contentType: 'audio/ogg' });
    form.append('model', 'whisper-1');
    form.append('language', 'hi');
    const res = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, { headers: { ...form.getHeaders(), Authorization: 'Bearer ' + process.env.OPENAI_API_KEY } });
    return res.data.text;
  } catch(e) { logger.error('transcribeVoice: ' + e.message); return null; }
}

module.exports = { sendMessage, parseWebhook, transcribeVoice, normalizeForWati };
