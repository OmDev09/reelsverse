// server.js
require('dotenv').config();
const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const PORT = process.env.PORT || 4000;
const RZP_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RZP_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// Simple JSON file DB (orders)
const DB_FILE = path.join(__dirname, 'orders-db.json');

function readDb() {
  try {
    if (!fs.existsSync(DB_FILE)) return { orders: {} };
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (e) {
    console.error('DB read error', e);
    return { orders: {} };
  }
}
function writeDb(obj) {
  fs.writeFileSync(DB_FILE, JSON.stringify(obj, null, 2));
}

// init db if not exists
if (!fs.existsSync(DB_FILE)) writeDb({ orders: {} });

// Configure drive links per plan
// Replace placeholders with your actual Google Drive shareable links (anyone with link can view)
const DRIVE_LINKS = {
  basic: [
    'https://drive.google.com/drive/folders/1mmNWXU52geX9IDvSaky979kerUXYP26T',
    'https://drive.google.com/drive/folders/1LljZEOq7pN3dPCHeTWSWZY0VsoNL-xO5'
  ],
  medium: [
    'https://drive.google.com/drive/folders/1mmNWXU52geX9IDvSaky979kerUXYP26T',
    'https://drive.google.com/drive/folders/1LljZEOq7pN3dPCHeTWSWZY0VsoNL-xO5',
    'https://drive.google.com/drive/folders/1wT71Sg_MvY_L2NRdeNd6dM8-8J9aRqJU',
    'https://drive.google.com/drive/folders/1qEF65utjenJYTHzmzY767-KujR1snmOb'
  ],
  advanced: [
    'https://drive.google.com/drive/folders/1mmNWXU52geX9IDvSaky979kerUXYP26T',
    'https://drive.google.com/drive/folders/1LljZEOq7pN3dPCHeTWSWZY0VsoNL-xO5',
    'https://drive.google.com/drive/folders/1wT71Sg_MvY_L2NRdeNd6dM8-8J9aRqJU',
    'https://drive.google.com/drive/folders/1qEF65utjenJYTHzmzY767-KujR1snmOb',
    'https://drive.google.com/drive/folders/1sWI2iGYFpO5fyIY-a5PxMk-7kVEBa4j7',
    'https://drive.google.com/drive/folders/1ev4YgEAw55izgE5mO6NTe0fswrrQTTva',
    'https://drive.google.com/drive/folders/1NR5s--uOgAYpvursdFTe964cEu9rGMmB',
    'https://drive.google.com/drive/folders/1sezdPNNNGbjlTSaMYPg5-tsFYJnE2XKv'
  ]
};

// initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: RZP_KEY_ID,
  key_secret: RZP_KEY_SECRET
});

// Simple route to check server
app.get('/', (req, res) => {
  res.send(`Reelverse server running. POST /create-order with plan to start.`);
});

/**
 * Create order endpoint
 * Request body: { plan: "basic" | "medium" | "advanced" }
 * Response: { orderId, amount, currency, plan }
 */
app.post('/create-order', async (req, res) => {
  try {
    const { plan } = req.body;

    // 1️⃣ Validate plan
    if (!plan || !['basic', 'medium', 'advanced'].includes(plan)) {
      return res.status(400).json({ error: 'Invalid or missing plan' });
    }

    // 2️⃣ Amount mapping
    const amountMap = { basic: 499, medium: 699, advanced: 999 }; // in INR
    const amountRupees = amountMap[plan];
    const amountPaise = amountRupees * 100; // Razorpay expects paise

    console.log(`[CREATE ORDER] Plan: ${plan}, Amount: ₹${amountRupees}`);

    // 3️⃣ Create Razorpay order
    const options = {
      amount: amountPaise,
      currency: 'INR',
      receipt: `receipt_${Date.now()}`,
      notes: { plan }
    };

    const order = await razorpay.orders.create(options);
    console.log('[CREATE ORDER] Razorpay order created:', order.id);

    // 4️⃣ Save locally (optional, for order tracking)
    const db = readDb(); // your readDb function
    db.orders[order.id] = {
      orderId: order.id,
      amount: amountRupees,
      currency: order.currency,
      receipt: order.receipt,
      status: 'created',
      plan,
      created_at: Date.now()
    };
    writeDb(db);

    // 5️⃣ Send response to frontend
    res.json({
      success: true,
      orderId: order.id,
      amount: amountPaise,
      currency: order.currency,
      plan,
      key: process.env.RAZORPAY_KEY_ID // frontend needs this
    });
  } catch (err) {
    console.error('[CREATE ORDER ERROR]', err);
    res.status(500).json({ error: 'Server error creating order' });
  }
});

/**
 * Verify payment endpoint
 * Client sends: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 * Server verifies signature and marks order as paid.
 */
app.post('/verify-payment', (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ success: false, error: 'Missing payment parameters' });
  }

  // create expected signature
  const generated_signature = crypto
    .createHmac('sha256', RZP_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (generated_signature === razorpay_signature) {
    // signature valid -> mark order as paid
    const db = readDb();
    const orderRec = db.orders[razorpay_order_id];
    if (!orderRec) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    orderRec.status = 'paid';
    orderRec.payment_id = razorpay_payment_id;
    orderRec.verified_at = Date.now();

    // Optionally store which drive links were used (if dynamic)
    writeDb(db);

    // return secure drive url
    const driveUrl = `${BASE_URL}/drive/${razorpay_order_id}`;
    return res.json({ success: true, driveUrl });
  } else {
    return res.status(400).json({ success: false, error: 'Invalid signature' });
  }
});

/**
 * Serve drive links page for a verified order.
 * This renders a small HTML with the correct drive links for the order's plan.
 */
app.get('/drive/:orderId', (req, res) => {
  const orderId = req.params.orderId;
  const db = readDb();
  const orderRec = db.orders[orderId];
  if (!orderRec) return res.status(404).send('Order not found.');
  if (orderRec.status !== 'paid') return res.status(403).send('Payment not verified. Access denied.');

  const plan = orderRec.plan || 'basic';
  const links = DRIVE_LINKS[plan] || [];

  const html = `
  <!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width,initial-scale=1"/>
    <title>Reelverse — Your Drive Links</title>
    <style>
      /* ==== Reset ==== */
      * { margin:0; padding:0; box-sizing:border-box; }
      body {
        font-family: 'Inter', Arial, sans-serif;
        background: #0c0c0c;
        color: #e0e0e0;
        min-height:100vh;
        display:flex;
        justify-content:center;
        align-items:center;
        padding:40px 20px;
        overflow:hidden;
        position:relative;
      }
      /* ==== Animated Background ==== */
      body::before {
        content:'';
        position:absolute;
        top:-50%; left:-50%;
        width:200%; height:200%;
        background: radial-gradient(#ffffff22 1px, transparent 1px) repeat;
        background-size:40px 40px;
        animation: moveBg1 40s linear infinite;
        z-index:0;
        pointer-events:none;
      }
      body::after {
        content:'';
        position:absolute;
        top:-50%; left:-50%;
        width:200vw; height:200vh;
        background: radial-gradient(#cccccc11 2px, transparent 3px) repeat;
        background-size:80px 80px;
        animation: moveBg2 60s linear infinite;
        z-index:0;
        pointer-events:none;
      }
      @keyframes moveBg1 { 0%{transform:translate(0,0);} 100%{transform:translate(-150px,-150px);} }
      @keyframes moveBg2 { 0%{transform:translate(0,0);} 100%{transform:translate(150px,150px);} }

      /* ==== Box ==== */
      .box {
        background:#121212;
        border-radius:20px;
        padding:50px 40px;
        max-width:800px;
        border:1px solid #222;
        box-shadow:0 12px 50px rgba(0,0,0,0.85);
        position:relative;
        overflow:hidden;
        z-index:1;
        text-align:center;
      }
      .box::before {
        content:'';
        position:absolute;
        top:-50%; left:-50%;
        width:200%; height:200%;
        background: radial-gradient(circle, #00f0ff 0%, #ff3ec1 60%, transparent 70%);
        opacity:0.12;
        filter: blur(60px);
        transition: opacity 0.5s ease;
      }
      .box:hover::before { opacity:0.25; }

      h1 {
        font-size:3rem;
        color:#00f0ff;
        margin-bottom:25px;
        text-shadow:0 0 8px #629195ff, 0 0 25px #a56591ff;
        position:relative;
      }
      h1::after {
        content:'';
        position:absolute;
        left:50%;
        bottom:-8px;
        transform:translateX(-50%);
        width:140px; height:3px;
        background: linear-gradient(90deg,#00f0ff,#ff3ec1,#ff3ec1,#00f0ff);
        border-radius:2px;
        animation:titleGlow 2.5s infinite alternate;
      }
      @keyframes titleGlow {
        from { opacity:0.6; transform:translateX(-50%) scaleX(0.8);}
        to { opacity:1; transform:translateX(-50%) scaleX(1.2);}
      }

      p {
        font-size:1.2rem;
        color:#aaa;
        margin-bottom:30px;
        line-height:1.6;
      }

      .links {
        display:flex;
        flex-wrap:wrap;
        justify-content:center;
        gap:15px;
      }

      .drive-btn {
        position:relative;
        background:#0c0c0c;
        border:1px solid #00f0ff;
        color:#00f0ff;
        padding:14px 28px;
        border-radius:14px;
        font-weight:600;
        text-decoration:none;
        transition: all 0.3s ease;
        overflow:hidden;
        z-index:1;
      }
      .drive-btn:hover {
        color:#0c0c0c;
        background: linear-gradient(90deg,#00f0ff,#ff3ec1);
        box-shadow:0 10px 30px rgba(0,255,255,0.6),0 5px 20px rgba(255,62,193,0.5);
        transform: translateY(-2px) scale(1.05);
      }

      .small {
        color:#888;
        margin-top:20px;
        font-size:0.95rem;
      }

      @media(max-width:800px){
        .box{padding:40px 30px;width:90%;}
        h1{font-size:2.5rem;}
      }
    </style>
  </head>
  <body>
    <div class="box">
      <h1>Payment Verified ✅</h1>
      <p>Order: ${orderId} • Plan: <strong>${plan}</strong></p>

      <div class="links">
        ${links.map((l,idx)=>`<a class="drive-btn" href="${l}" target="_blank" rel="noopener">Open Drive Link ${idx+1}</a>`).join('')}
      </div>

      <div class="small">If a link doesn't open, check that your Google Drive is set to "Anyone with link can view".</div>
    </div>
  </body>
  </html>
  `;

  res.send(html);
});


/**
 * OPTIONAL: Razorpay webhook endpoint (recommended for production)
 * You can configure Razorpay webhooks to notify your server about payment events.
 * For this demo we skip implementing webhook verification but you can add it later.
 */

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`BASE_URL = ${BASE_URL}`);
});
