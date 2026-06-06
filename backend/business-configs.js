// ============================================================
// BIZPILOT BUSINESS CONFIGURATIONS
// All business type specific logic in one place
// Add new business types here without touching ai-engine.js
// ============================================================

const CONFIGS = {

  medical_shop: {
    name: 'Medical Shop / Pharmacy',
    emoji: '💊',
    modules: ['inventory', 'sales', 'purchases', 'customers', 'suppliers', 'expenses', 'staff'],
    inventory_units: ['strips', 'tablets', 'capsules', 'vials', 'bottles', 'tubes', 'sachets'],
    gst_rates: [0, 5, 12, 18],
    context: `Medical shop/pharmacy. Key concerns:
- Expiry date and batch number tracking for all medicines
- Multiple GST rates: 0% on essential medicines, 5% on OTC, 12% on devices
- Supplier credit management with pharma distributors (Heera Pharma, city wholesale etc)
- Walk-in cash sales and institutional credit sales to hospitals/clinics
- Schedule H drug log for prescription medicines
- Daily cash reconciliation
- Low stock alerts — medicines run out fast`,
    sample_messages: [
      '10 strips paracetamol becha 120 cash',
      'City Hospital ko 50 strips diya credit 4750',
      'Heera Pharma se maal aaya 50 strips augmentin rate 180 expiry jun 2027',
      'Bijli bill 3200 bhar diya',
      'Paracetamol kitna bacha',
      'Aaj ka summary do'
    ]
  },

  kirana: {
    name: 'Kirana / General Store',
    emoji: '🏪',
    modules: ['inventory', 'sales', 'purchases', 'customers', 'suppliers', 'expenses'],
    inventory_units: ['piece', 'kg', 'gram', 'litre', 'packet', 'box', 'bottle', 'dozen', 'bag'],
    gst_rates: [0, 5, 12, 18],
    context: `Kirana/general store. Key concerns:
- Udhaar (credit) tracking is the #1 priority — who owes how much
- Daily cash balance — opening cash, sales, expenses, closing cash
- Fast-moving goods: atta, dal, oil, biscuits, soap — reorder alerts
- Supplier payment management — when to pay which distributor
- Very informal communication — short messages, voice notes
- Many walk-in customers, most on udhaar with familiar names
- Monthly reconciliation with udhaar customers
- No complex GST — mostly below threshold or composition scheme`,
    sample_messages: [
      'Sharma ji ne 450 ka saman liya udhaar',
      'Ramesh ne 1200 diye',
      'Tata salt 5 bag aaya 1250 ka cash',
      'Bijli 2400 bhar di',
      'Kaun kaun ka udhaar baaki hai',
      'Aaj kitna hua'
    ]
  },

  restaurant: {
    name: 'Restaurant / Cloud Kitchen',
    emoji: '🍽️',
    modules: ['sales', 'expenses', 'staff', 'inventory'],
    inventory_units: ['kg', 'gram', 'litre', 'piece', 'portion', 'dozen'],
    gst_rates: [5],
    context: `Restaurant or cloud kitchen. Key concerns:
- Daily revenue split: dine-in, takeaway, Swiggy, Zomato
- Aggregator commission tracking (Swiggy ~18%, Zomato ~20%)
- Daily cash reconciliation — cash vs UPI vs aggregator
- Raw material consumption tracking — daily kitchen stock
- Staff attendance and wages
- Food wastage recording for cost control
- No complex inventory — perishables tracked daily
- End of day summary is critical`,
    sample_messages: [
      'Aaj: dine-in 12400, swiggy 8300, zomato 6100, cash 9200, upi 7300',
      'Paneer khatam ho gaya, kal 5kg mangana hai',
      'Helper Raju aaj absent tha',
      'Gas cylinder 2 aaye 1800 ka',
      'Aaj ka summary',
      'Is hafte ka total kitna hua'
    ]
  },

  textile_trader: {
    name: 'Textile / Fabric Trader',
    emoji: '🧵',
    modules: ['inventory', 'sales', 'purchases', 'customers', 'suppliers', 'expenses'],
    inventory_units: ['meter', 'running meter', 'kg', 'piece', 'roll', 'thaan'],
    gst_rates: [5, 12],
    context: `Textile/fabric trader. Key concerns:
- Long credit cycles: customers buy on 60-180 day credit
- Outstanding collection is the biggest pain — who owes how much for how long
- Fabric measured in meters, running meters, or kg depending on type
- GST mostly 5% on fabric
- Supplier credit from mills — track what you owe
- Seasonal stock — festival demands create stock pressure
- Many regular customers with named accounts
- Tally likely used — parallel tracking`,
    sample_messages: [
      'Patel Garments ko 450 meter georgette diya rate 185 60 din credit',
      'Mehta Textiles ne 45000 diye aaj',
      'Surat se maal aaya 500 meter silk 220 rate credit 90 din',
      'Kaun 90 din se upar outstanding hai',
      'Is mahine kitna collection hua',
      'Sharma ka kitna baaki hai'
    ]
  },

  contractor: {
    name: 'Contractor / Civil Works',
    emoji: '🏗️',
    modules: ['projects', 'expenses', 'staff', 'purchases'],
    inventory_units: ['bag', 'tonne', 'piece', 'sqft', 'rft', 'kg', 'litre'],
    gst_rates: [12, 18],
    context: `Construction contractor. Key concerns:
- Project-wise tracking — each project has separate budget and expenses
- Daily labour payment — wage workers paid daily or weekly
- Material purchase per project — cement, steel, sand, bricks
- Client billing by milestone — foundation done, slab done etc
- TDS deduction by clients — track certificates due
- Project profitability — how much billed vs how much spent
- Labour muster roll — daily headcount per site`,
    sample_messages: [
      'Sharma project mein aaj 12 workers, 500 per head, 6000 cash diya',
      'Ultratech cement 50 bag aaye 19500 ka Sharma project',
      'Patel ji ne 2 lakh diye milestone 2 complete',
      'Sharma project mein abtak kitna kharch hua',
      'Aaj ka summary',
      'Kitne projects active hain'
    ]
  }
};

function getConfig(businessType) {
  return CONFIGS[businessType] || CONFIGS.medical_shop;
}

function buildContextBlock(businessType) {
  const config = getConfig(businessType);
  return config.context;
}

function getAllTypes() {
  return Object.keys(CONFIGS).map(function(key) {
    return { id: key, name: CONFIGS[key].name, emoji: CONFIGS[key].emoji };
  });
}

module.exports = { CONFIGS, getConfig, buildContextBlock, getAllTypes };
