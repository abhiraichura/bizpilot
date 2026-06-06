# BizPilot Setup Guide

## Step 1 — Supabase Database

1. Go to supabase.com and create a free account
2. Create a new project (choose any region, remember the password)
3. Wait for project to be ready (~2 minutes)
4. Go to SQL Editor > New Query
5. Paste the entire contents of database/schema.sql
6. Click Run
7. Go to Project Settings > API
8. Copy: Project URL and service_role key and anon key

## Step 2 — Anthropic API Key

1. Go to console.anthropic.com
2. Create account and add a payment method (pay-per-use, very cheap)
3. Go to API Keys > Create Key
4. Copy the key immediately (shown only once)

## Step 3 — Wati WhatsApp API

1. Go to wati.io and start free trial
2. Complete phone number verification for your business WhatsApp
3. From the Wati dashboard, go to Account > API
4. Copy: API Endpoint URL and Access Token
5. Under Webhooks, set webhook URL to: https://YOUR-RAILWAY-URL/webhook/whatsapp

## Step 4 — Deploy Backend to Railway

1. Go to railway.app and sign up with GitHub
2. Create New Project > Deploy from GitHub repo
3. Connect your GitHub account and select your bizpilot repository
4. Set root directory to: backend
5. Add these environment variables in Railway dashboard:
   - PORT = 3000
   - NODE_ENV = production
   - ANTHROPIC_API_KEY = (from Step 2)
   - SUPABASE_URL = (from Step 1)
   - SUPABASE_SERVICE_KEY = (from Step 1)
   - SUPABASE_ANON_KEY = (from Step 1)
   - WATI_API_ENDPOINT = (from Step 3)
   - WATI_ACCESS_TOKEN = (from Step 3)
   - WEBHOOK_SECRET = (any random string)
   - APP_URL = (your Railway URL, fill after first deploy)
6. Deploy. Copy your Railway URL (e.g. bizpilot-backend.railway.app)
7. Go back to Wati and set webhook to: https://YOUR-RAILWAY-URL/webhook/whatsapp

## Step 5 — Deploy Frontend to Vercel

1. Go to vercel.com and sign up with GitHub
2. Import your bizpilot repository
3. Set root directory to: frontend
4. Add environment variable:
   - REACT_APP_API_URL = https://YOUR-RAILWAY-URL
5. Deploy. Copy your Vercel URL.

## Step 6 — Test Everything

1. Run the test script against your live backend:
   TEST_URL=https://YOUR-RAILWAY-URL node test.js

2. All 11 tests should pass.

## Step 7 — Get Your First Client

1. Tell the client to send any message to your Wati WhatsApp number
2. BizPilot will guide them through 6-question setup automatically
3. After setup, send them their dashboard link:
   https://YOUR-VERCEL-URL/dashboard/THEIR-BUSINESS-ID
4. Business ID is visible in Supabase > businesses table

## Sending Your First Manual Test

Open WhatsApp on your test phone, message your Wati number:
- "10 strips paracetamol becha 120 cash" — records a sale
- "City Hospital ko 50 strips diya credit 4750" — credit sale
- "Heera Pharma ko 5000 diya" — supplier payment
- "Bijli bill 3200 bhar diya" — expense
- "Aaj ka summary do" — daily summary
- "Paracetamol kitna bacha" — inventory check

## Step 8 — Razorpay Payment Links (Optional but Recommended)

1. Go to dashboard.razorpay.com and create account
2. Complete KYC (takes 1-2 business days)
3. Go to Settings > API Keys > Generate Key
4. Copy Key ID and Key Secret to your .env
5. Go to Settings > Webhooks > Add Webhook
   - URL: https://YOUR-RAILWAY-URL/payment/webhook
   - Select events: payment.captured, payment_link.paid
   - Copy the webhook secret to RAZORPAY_WEBHOOK_SECRET in .env

Once configured, your clients can say:
"Ramesh ko payment link bhejo 5000 ka"
BizPilot will create a Razorpay link and you can forward it to Ramesh on WhatsApp.

## Step 9 — Subscription Management

BizPilot automatically:
- Gives new clients 14 days free trial
- Sends reminder on day 7, day 11, day 13 of trial
- Blocks access after trial expires
- Shows payment instructions to expired clients

To manually activate a client:
- Go to admin.html panel
- Find the business
- Click Activate

To change trial duration for a specific client:
- Go to Supabase > businesses table
- Update trial_ends_at field for that business

## Step 10 — Tally Integration (Optional — for clients using Tally)

BizPilot can automatically sync every transaction to the client's Tally software.

### What the client needs to do (one time)

1. Download TallyConnector from https://tallysolutions.com (free utility)
2. Install on the computer where Tally runs
3. Start TallyConnector — it runs on port 9000 by default
4. Make sure Tally is open with their company file active

### What you do as BizPilot admin

1. Get the client's computer IP address (they can check at whatismyip.com)
2. Test the connection from your Railway app:
   POST /api/tally/test
   Body: { "business_id": "UUID", "tally_url": "http://CLIENT_IP:9000" }
3. If connected = true, the URL is saved automatically
4. From that point every sale, purchase, payment, expense recorded via WhatsApp syncs to Tally automatically

### Tally ledgers BizPilot creates entries for

- Sales → "BUSINESS_NAME - Sales" ledger
- Purchases → "BUSINESS_NAME - Purchases" ledger  
- Expenses → Rent Expenses / Electricity Expenses / Salary Expenses etc
- Payments → Cash or Bank Account

The client needs to create these ledger names in Tally once. After that syncing is automatic.

## Step 11 — Customer Notifications

Business owners can send WhatsApp messages to their customers directly through BizPilot:

Via WhatsApp message to BizPilot:
- "Ramesh ko reminder bhejo" → sends payment reminder to Ramesh
- "City Hospital ko payment reminder do" → sends to City Hospital

Via Admin Panel:
- Click "💬 Remind All" button next to any business
- Sends payment reminders to ALL customers with outstanding balance

## Step 12 — Going Live Checklist

Before giving BizPilot to your first real client go through this:

[ ] Schema.sql run in Supabase — all 9 tables created
[ ] All env variables set in Railway — especially ANTHROPIC_API_KEY and SUPABASE keys
[ ] Wati webhook URL set to https://YOUR-RAILWAY-URL/webhook/whatsapp
[ ] node test.js passes all tests against live Railway URL
[ ] You have tested the full onboarding yourself on your own phone
[ ] Admin panel accessible at your-vercel-url/admin.html
[ ] Landing page live at your-vercel-url with correct Wati number in CTA buttons
[ ] ADMIN_SECRET set and tested
[ ] First client's phone number ready to register
