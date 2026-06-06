const db = require('./database');
const whatsapp = require('./whatsapp');
const logger = require('./logger');

const STEPS = [
  { field: 'name', q: '🙏 *BizPilot mein swagat hai!*\n\nMain aapka AI business assistant hun. Aapka poora business WhatsApp pe manage karunga.\n\nShuru karte hain — aapke *business ka naam* kya hai?' },
  { field: 'owner_name', q: 'Aapka naam kya hai? (Owner/Manager ka naam)' },
  { field: 'business_type', q: 'Aapka business kaunsa type ka hai?\n\n1️⃣ Medical Shop / Pharmacy\n2️⃣ Kirana / General Store\n3️⃣ Restaurant / Cloud Kitchen\n4️⃣ Textile / Fabric Trader\n5️⃣ Contractor / Civil Works\n\nSirf number bhejiye (1-5):', choices: { '1':'medical_shop','2':'kirana','3':'restaurant','4':'textile_trader','5':'contractor' } },
  { field: 'city', q: 'Aap kis city mein hain? (e.g. Rajkot, Ahmedabad, Surat)' },
  { field: 'is_gst_registered', q: 'GST registered hain?\n\n1️⃣ Haan — GST number hai\n2️⃣ Nahi — GST nahi hai', choices: { '1':true,'2':false } },
  { field: 'language', q: 'Aap kaunsi language mein baat karna pasand karenge?\n\n1️⃣ Hindi\n2️⃣ Gujarati (gu)\n3️⃣ English\n4️⃣ Mixed (Hindi + English)', choices: { '1':'hindi','2':'gujarati','3':'english','4':'mixed' } }
];

// Language-specific welcome messages
const WELCOME_MSGS = {
  gujarati: '✅ *Setup complete! BizPilot ready che!*\n\nNamaste {name} ji! {biz} hun BizPilot thi connected.\n\n*Aa rite use karo:*\n\n📦 Sale: "10 strips paracetamol vechai, 120 cash"\n💳 Credit: "City Hospital ne 50 strips api credit 4750"\n💰 Payment: "Ramesh e 5000 aapya"\n🛒 Purchase: "Heera thi maal avyo 15000 no"\n💸 Expense: "Light bill 3200 bharyu"\n📊 Summary: "Aaj nu summary apo"\n📋 Stock: "Paracetamol ketlu bachi gayu"\n\n*Hindi, Gujarati, English — koi pan chale!* 🙏\n\nDar roj subhe 9 vage business summary malse.',
  hindi: '✅ *Setup complete! BizPilot ready hai!*\n\nNamaste {name} ji! {biz} ab BizPilot se connected hai.\n\n*Aise use karein:*\n\n📦 Sale: "10 strips paracetamol becha 120 cash"\n💳 Credit: "City Hospital ko 50 strips diya credit 4750"\n💰 Payment: "Ramesh ne 5000 diye"\n🛒 Purchase: "Heera se maal aaya 15000 ka"\n💸 Expense: "Bijli bill 3200 bhar diya"\n📊 Summary: "Aaj ka summary do"\n📋 Stock: "Paracetamol kitna bacha"\n\n*Hindi, Gujarati, English — koi bhi chalega!* 🙏\n\nHar roz subah 9 baje business summary milegi.',
  english: '✅ *Setup complete! BizPilot is ready!*\n\nHello {name}! {biz} is now connected to BizPilot.\n\n*How to use:*\n\n📦 Sale: "sold 10 strips paracetamol 120 cash"\n💳 Credit: "gave 50 strips to City Hospital on credit 4750"\n💰 Payment: "received 5000 from Ramesh"\n🛒 Purchase: "stock arrived from Heera 15000"\n💸 Expense: "paid electricity bill 3200"\n📊 Summary: "give me today\'s summary"\n📋 Stock: "how much paracetamol left"\n\n*Hindi, Gujarati, or English — all work!* 🙏\n\nYou will receive a daily summary at 9am every morning.',
  mixed: null // falls back to hindi
};

function isInOnboarding(business) {
  return !business || !business.onboarding_complete;
}

async function handleOnboarding(phone, message, business) {
  try {
    if (!business) {
      const newBiz = await db.createBusiness({ name: 'Setting up...', owner_name: 'Owner', owner_phone: db.normalizePhone(phone), business_type: 'medical_shop', onboarding_complete: false, onboarding_step: 0 });
      await db.saveConversation({ business_id: newBiz.id, direction: 'outbound', message_text: STEPS[0].q, intent: 'onboarding' });
      await whatsapp.sendMessage(phone, STEPS[0].q);
      return;
    }

    const step = Number(business.onboarding_step) || 0;
    if (step >= STEPS.length) { await completeOnboarding(business, phone); return; }

    const stepCfg = STEPS[step];
    const text = message.trim();
    let value;

    if (stepCfg.choices) {
      value = stepCfg.choices[text];
      if (value === undefined) {
        const validKeys = Object.keys(stepCfg.choices).join(', ');
        await whatsapp.sendMessage(phone, 'Kripya sirf ' + validKeys + ' mein se choose karein.');
        return;
      }
    } else {
      if (!text) { await whatsapp.sendMessage(phone, 'Kuch toh likhiye 😊'); return; }
      value = text;
    }

    const updates = {};
    updates[stepCfg.field] = value;

    // After GST yes, ask for GSTIN
    if (stepCfg.field === 'is_gst_registered' && value === true) {
      updates.onboarding_step = 'gstin';
      await db.updateBusiness(business.id, updates);
      const q = 'Aapka GSTIN number kya hai? (15 characters)';
      await whatsapp.sendMessage(phone, q);
      return;
    }

    const nextStep = step + 1;
    updates.onboarding_step = nextStep;
    await db.updateBusiness(business.id, updates);

    if (nextStep >= STEPS.length) {
      const updated = Object.assign({}, business, updates);
      await completeOnboarding(updated, phone);
    } else {
      const nextQ = STEPS[nextStep].q;
      await whatsapp.sendMessage(phone, nextQ);
    }

  } catch(e) {
    logger.error('handleOnboarding: ' + e.message);
    await whatsapp.sendMessage(phone, 'Kuch problem aayi. Dobara try karein.');
  }
}

async function handleGstinStep(phone, message, business) {
  const gstin = message.trim().toUpperCase();
  if (gstin.length !== 15) {
    await whatsapp.sendMessage(phone, 'GSTIN 15 characters ka hona chahiye. Dobara enter karein:');
    return;
  }
  const nextStep = 4; // language step index
  await db.updateBusiness(business.id, { gstin: gstin, onboarding_step: nextStep });
  await whatsapp.sendMessage(phone, STEPS[nextStep].q);
}

async function completeOnboarding(business, phone) {
  await db.updateBusiness(business.id, { onboarding_complete: true, onboarding_step: 99 });
  const msg = generateWelcomeMessage(business);
  await whatsapp.sendMessage(phone, msg);
}

function generateWelcomeMessage(business) {
  const lang = business.language || 'hindi';
  const template = WELCOME_MSGS[lang] || WELCOME_MSGS.hindi;
  return template
    .replace('{name}', business.owner_name || 'Owner')
    .replace('{biz}', business.name || 'Aapka business');
}

module.exports = { isInOnboarding, handleOnboarding, handleGstinStep, generateWelcomeMessage };
