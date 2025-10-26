require('dotenv').config();
const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 4000;
const RZP_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RZP_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// ===== MongoDB Connection =====
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB connected'))
.catch(err => console.error('MongoDB connection error', err));

// ===== Mongoose Schema =====
const orderSchema = new mongoose.Schema({
  orderId: String,
  amount: Number,
  currency: String,
  receipt: String,
  status: { type: String, default: 'created' },
  plan: String,
  payment_id: String,
  verified_at: Date,
  created_at: { type: Date, default: Date.now }
});

const Order = mongoose.model('Order', orderSchema);

// ===== Drive Links per Plan =====
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

// ===== Razorpay instance =====
const razorpay = new Razorpay({
  key_id: RZP_KEY_ID,
  key_secret: RZP_KEY_SECRET
});

// ===== Routes =====
app.get('/', (req, res) => {
  res.send(`Reelverse server running. POST /create-order with plan to start.`);
});

// ===== Create Order =====
app.post('/create-order', async (req, res) => {
  try {
    const { plan } = req.body;
    if (!plan || !['basic','medium','advanced'].includes(plan))
      return res.status(400).json({ error: 'Invalid or missing plan' });

    const amountMap = { basic: 499, medium: 699, advanced: 999 };
    const amountPaise = amountMap[plan] * 100;

    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `receipt_${Date.now()}`,
      notes: { plan }
    });

    // Save order in MongoDB
    const newOrder = new Order({
      orderId: order.id,
      amount: amountMap[plan],
      currency: order.currency,
      receipt: order.receipt,
      plan
    });
    await newOrder.save();

    res.json({ 
      success: true,
      orderId: order.id,
      amount: amountPaise,
      currency: order.currency,
      plan,
      key: RZP_KEY_ID
    });
  } catch(err) {
    console.error('[CREATE ORDER ERROR]', err);
    res.status(500).json({ error: 'Server error creating order' });
  }
});

// ===== Verify Payment =====
app.post('/verify-payment', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature)
      return res.status(400).json({ success: false, error: 'Missing payment parameters' });

    const generated_signature = crypto.createHmac('sha256', RZP_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generated_signature !== razorpay_signature)
      return res.status(400).json({ success: false, error: 'Invalid signature' });

    const order = await Order.findOne({ orderId: razorpay_order_id });
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

    order.status = 'paid';
    order.payment_id = razorpay_payment_id;
    order.verified_at = new Date();
    await order.save();

    const driveUrl = `${BASE_URL}/drive/${razorpay_order_id}`;
    return res.json({ success: true, driveUrl });
  } catch(err) {
    console.error('[VERIFY PAYMENT ERROR]', err);
    res.status(500).json({ success: false, error: 'Server error verifying payment' });
  }
});

// ===== Serve Drive Links =====
app.get('/drive/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findOne({ orderId });
    if (!order) return res.status(404).send('Order not found.');
    if (order.status !== 'paid') return res.status(403).send('Payment not verified. Access denied.');

    const plan = order.plan || 'basic';
    const links = DRIVE_LINKS[plan] || [];

    const html = `
      <!doctype html>
      <html lang="en">
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <title>Reelverse — Your Drive Links</title>
        <style>
          /* === keep your existing CSS from previous version === */
        </style>
      </head>
      <body>
        <div class="box">
          <h1>Payment Verified ✅</h1>
          <p>Order: ${orderId} • Plan: <strong>${plan}</strong></p>
          <div class="links">
            ${links.map((l,idx)=>`<a class="drive-btn" href="${l}" target="_blank">Open Drive Link ${idx+1}</a>`).join('')}
          </div>
          <div class="small">If a link doesn't open, check that your Google Drive is set to "Anyone with link can view".</div>
        </div>
      </body>
      </html>
    `;
    res.send(html);
  } catch(err) {
    console.error('[DRIVE PAGE ERROR]', err);
    res.status(500).send('Server error loading drive links');
  }
});

// ===== Start Server =====
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}, BASE_URL=${BASE_URL}`);
});
