# BizPilot — WhatsApp AI Business Operating System

Run your entire business through WhatsApp. Sales, inventory, payments, customer ledger, invoices, daily summaries, Tally sync — all through natural conversation in Hindi, Gujarati, or English. No app to download.

## Product Overview

Business owner sends: "10 strips paracetamol becha 120 cash"
BizPilot does: records sale, updates inventory, replies with confirmation, optionally syncs to Tally

Business owner sends: "Ramesh ko reminder bhejo"
BizPilot does: sends a polite payment reminder WhatsApp to Ramesh directly

Business owner sends: "Aaj ka summary do"
BizPilot does: generates a complete business summary from live database data

## Business Types Supported

- Medical Shop / Pharmacy — expiry tracking, schedule drugs, pharma GST
- Kirana / General Store — udhaar ledger, fast-moving goods, daily cash
- Restaurant / Cloud Kitchen — Swiggy/Zomato split, aggregator commissions
- Textile / Fabric Trader — meter-based inventory, 60-180 day credit cycles
- Contractor / Civil Works — project-wise tracking, labour payments, TDS

## Features

- WhatsApp-native — no app, no login, no learning curve
- Hindi + Gujarati + English — any mix understood
- GST invoice PDF generation and WhatsApp delivery
- Razorpay payment link creation via conversation
- Tally automatic sync for businesses using Tally ERP
- Customer payment reminder notifications
- Daily morning summary at 9am automatically
- 14-day free trial with automatic reminders
- Admin panel to manage all clients
- Public landing page for new client signups

## Tech Stack

Backend: Node.js + Express → Railway
AI: Anthropic Claude claude-sonnet-4-20250514
Database: Supabase PostgreSQL
WhatsApp: Wati API
Payments: Razorpay
PDF: PDFKit
Frontend: React → Vercel

## Repository Structure

```
bizpilot/
├── backend/
│   ├── server.js              Main Express server + all routes
│   ├── ai-engine.js           Claude AI processing + system prompts
│   ├── database.js            All Supabase operations
│   ├── action-executor.js     Executes AI-determined actions
│   ├── whatsapp.js            Wati API + voice transcription
│   ├── onboarding.js          New business setup via WhatsApp
│   ├── scheduler.js           Daily summaries + reminders cron
│   ├── business-configs.js    All 5 business type configurations
│   ├── payments.js            Razorpay payment links
│   ├── invoice-generator.js   GST PDF invoice generation
│   ├── subscription.js        Trial management + gate
│   ├── tally.js               Tally XML sync integration
│   ├── notifications.js       Customer WhatsApp notifications
│   ├── error-handler.js       Error recovery + process handlers
│   ├── logger.js              Winston logging
│   ├── package.json
│   ├── railway.json
│   └── .env.example
├── database/
│   └── schema.sql             Complete Supabase schema
├── frontend/
│   ├── src/
│   │   ├── App.js             React dashboard with 4 tabs
│   │   ├── index.js
│   │   └── index.css
│   ├── public/
│   │   ├── index.html         Public landing page
│   │   └── admin.html         Admin management panel
│   ├── package.json
│   ├── vercel.json
│   └── .env.example
├── test.js                    32-test automated test suite
├── README.md
├── SETUP.md                   Complete deployment guide
└── .gitignore
```

## Environment Variables

| Variable | Source | Required |
|---|---|---|
| ANTHROPIC_API_KEY | console.anthropic.com | Yes |
| SUPABASE_URL | supabase.com Project Settings | Yes |
| SUPABASE_SERVICE_KEY | supabase.com Project Settings | Yes |
| SUPABASE_ANON_KEY | supabase.com Project Settings | Yes |
| WATI_API_ENDPOINT | wati.io Account API | Yes |
| WATI_ACCESS_TOKEN | wati.io Account API | Yes |
| ADMIN_SECRET | Any random string | Yes |
| WEBHOOK_SECRET | Any random string | Yes |
| RAZORPAY_KEY_ID | dashboard.razorpay.com | Optional |
| RAZORPAY_KEY_SECRET | dashboard.razorpay.com | Optional |
| OPENAI_API_KEY | platform.openai.com | Optional (voice notes) |

## Quick Start

```bash
# 1. Run schema in Supabase SQL Editor
# 2. Copy and fill .env
cp backend/.env.example backend/.env

# 3. Install and start
cd backend && npm install && node server.js

# 4. Test
TEST_URL=http://localhost:3000 node test.js
```

## Pricing Model

- ₹999/month per business after 14-day free trial
- Setup fee: ₹2,000-5,000 (optional, your choice)
- 10 clients = ₹9,990/month recurring
- 50 clients = ₹49,950/month recurring

## Admin Access

URL: https://your-vercel-url/admin.html
Login: Your ADMIN_SECRET + Railway URL

Features: View all clients, activity logs, trial status, activate/deactivate, send bulk reminders
