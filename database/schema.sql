-- BIZPILOT DATABASE SCHEMA
-- Run this entire file in Supabase SQL Editor
-- Project: supabase.com > Your Project > SQL Editor > New Query

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE businesses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  owner_phone TEXT NOT NULL UNIQUE,
  business_type TEXT NOT NULL DEFAULT 'medical_shop',
  city TEXT,
  state TEXT DEFAULT 'Gujarat',
  is_gst_registered BOOLEAN DEFAULT FALSE,
  gstin TEXT,
  gst_scheme TEXT DEFAULT 'regular',
  language TEXT DEFAULT 'hindi',
  plan TEXT DEFAULT 'trial',
  trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  subscription_active BOOLEAN DEFAULT TRUE,
  summary_time INTEGER DEFAULT 9,
  onboarding_complete BOOLEAN DEFAULT FALSE,
  onboarding_step TEXT DEFAULT '0',
  settings JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  message_text TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',
  whatsapp_message_id TEXT,
  intent TEXT,
  processed BOOLEAN DEFAULT FALSE,
  actions_taken JSONB DEFAULT '[]'::jsonb
);

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  outstanding_balance NUMERIC(12,2) DEFAULT 0,
  customer_type TEXT DEFAULT 'retail',
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  outstanding_balance NUMERIC(12,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  UNIQUE(business_id, name)
);

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit TEXT DEFAULT 'strip',
  purchase_price NUMERIC(12,2) DEFAULT 0,
  selling_price NUMERIC(12,2) DEFAULT 0,
  current_stock NUMERIC(12,2) DEFAULT 0,
  minimum_stock NUMERIC(12,2) DEFAULT 10,
  gst_rate NUMERIC(5,2) DEFAULT 0,
  hsn_code TEXT,
  batch_number TEXT,
  expiry_date DATE,
  manufacturer TEXT,
  category TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  UNIQUE(business_id, name)
);

CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  direction TEXT NOT NULL,
  description TEXT NOT NULL,
  customer_id UUID REFERENCES customers(id),
  supplier_id UUID REFERENCES suppliers(id),
  payment_method TEXT DEFAULT 'cash',
  category TEXT,
  transaction_date DATE DEFAULT CURRENT_DATE,
  notes TEXT
);

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id),
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  subtotal NUMERIC(12,2) DEFAULT 0,
  tax_amount NUMERIC(12,2) DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL,
  paid_amount NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT 'unpaid',
  payment_type TEXT DEFAULT 'cash',
  customer_name TEXT,
  UNIQUE(business_id, invoice_number)
);

CREATE TABLE invoice_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  product_name TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL,
  unit TEXT DEFAULT 'strip',
  unit_price NUMERIC(12,2) NOT NULL,
  gst_rate NUMERIC(5,2) DEFAULT 0,
  gst_amount NUMERIC(12,2) DEFAULT 0,
  total_price NUMERIC(12,2) NOT NULL
);

CREATE TABLE staff (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT,
  monthly_salary NUMERIC(12,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL,
  title TEXT NOT NULL,
  trigger_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending',
  customer_id UUID REFERENCES customers(id),
  message_template TEXT
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_businesses_updated BEFORE UPDATE ON businesses FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Indexes for performance
CREATE INDEX idx_conv_business ON conversations(business_id);
CREATE INDEX idx_conv_msgid ON conversations(whatsapp_message_id) WHERE whatsapp_message_id IS NOT NULL;
CREATE INDEX idx_txn_business ON transactions(business_id);
CREATE INDEX idx_txn_date ON transactions(transaction_date);
CREATE INDEX idx_products_expiry ON products(expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX idx_customers_outstanding ON customers(outstanding_balance) WHERE outstanding_balance > 0;
