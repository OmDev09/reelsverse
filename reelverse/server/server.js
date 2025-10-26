require("dotenv").config();
const express = require("express");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 4000;
const RZP_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RZP_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// ===== MongoDB Connection =====
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error", err));

// ===== Mongoose Schema =====
const orderSchema = new mongoose.Schema({
  orderId: String,
  amount: Number,
  currency: String,
  receipt: String,
  status: { type: String, default: "created" },
  plan: String,
  payment_id: String,
  verified_at: Date,
  created_at: { type: Date, default: Date.now },
});

const Order = mongoose.model("Order", orderSchema);

// ===== Drive Links per Plan =====
const DRIVE_LINKS = {
  basic: [
    "https://drive.google.com/drive/folders/1mmNWXU52geX9IDvSaky979kerUXYP26T",
    "https://drive.google.com/drive/folders/1LljZEOq7pN3dPCHeTWSWZY0VsoNL-xO5",
  ],
  medium: [
    "https://drive.google.com/drive/folders/1mmNWXU52geX9IDvSaky979kerUXYP26T",
    "https://drive.google.com/drive/folders/1LljZEOq7pN3dPCHeTWSWZY0VsoNL-xO5",
    "https://drive.google.com/drive/folders/1wT71Sg_MvY_L2NRdeNd6dM8-8J9aRqJU",
    "https://drive.google.com/drive/folders/1qEF65utjenJYTHzmzY767-KujR1snmOb",
  ],
  advanced: [
    "https://drive.google.com/drive/folders/1mmNWXU52geX9IDvSaky979kerUXYP26T",
    "https://drive.google.com/drive/folders/1LljZEOq7pN3dPCHeTWSWZY0VsoNL-xO5",
    "https://drive.google.com/drive/folders/1wT71Sg_MvY_L2NRdeNd6dM8-8J9aRqJU",
    "https://drive.google.com/drive/folders/1qEF65utjenJYTHzmzY767-KujR1snmOb",
    "https://drive.google.com/drive/folders/1sWI2iGYFpO5fyIY-a5PxMk-7kVEBa4j7",
    "https://drive.google.com/drive/folders/1ev4YgEAw55izgE5mO6NTe0fswrrQTTva",
    "https://drive.google.com/drive/folders/1NR5s--uOgAYpvursdFTe964cEu9rGMmB",
    "https://drive.google.com/drive/folders/1sezdPNNNGbjlTSaMYPg5-tsFYJnE2XKv",
  ],
};

// ===== Razorpay instance =====
const razorpay = new Razorpay({
  key_id: RZP_KEY_ID,
  key_secret: RZP_KEY_SECRET,
});

// ===== Routes =====
app.get("/", (req, res) => {
  res.send(`Reelverse server running. POST /create-order with plan to start.`);
});

// ===== Create Order =====
app.post("/create-order", async (req, res) => {
  try {
    const { plan } = req.body;
    if (!plan || !["basic", "medium", "advanced"].includes(plan))
      return res.status(400).json({ error: "Invalid or missing plan" });

    const amountMap = { basic: 499, medium: 699, advanced: 999 };
    const amountPaise = amountMap[plan] * 100;

    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
      notes: { plan },
    });

    // Save order in MongoDB
    const newOrder = new Order({
      orderId: order.id,
      amount: amountMap[plan],
      currency: order.currency,
      receipt: order.receipt,
      plan,
    });
    await newOrder.save();

    res.json({
      success: true,
      orderId: order.id,
      amount: amountPaise,
      currency: order.currency,
      plan,
      key: RZP_KEY_ID,
    });
  } catch (err) {
    console.error("[CREATE ORDER ERROR]", err);
    res.status(500).json({ error: "Server error creating order" });
  }
});

// ===== Verify Payment =====
app.post("/verify-payment", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature)
      return res
        .status(400)
        .json({ success: false, error: "Missing payment parameters" });

    const generated_signature = crypto
      .createHmac("sha256", RZP_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generated_signature !== razorpay_signature)
      return res
        .status(400)
        .json({ success: false, error: "Invalid signature" });

    const order = await Order.findOne({ orderId: razorpay_order_id });
    if (!order)
      return res.status(404).json({ success: false, error: "Order not found" });

    order.status = "paid";
    order.payment_id = razorpay_payment_id;
    order.verified_at = new Date();
    await order.save();

    const driveUrl = `${BASE_URL}/drive/${razorpay_order_id}`;
    return res.json({ success: true, driveUrl });
  } catch (err) {
    console.error("[VERIFY PAYMENT ERROR]", err);
    res
      .status(500)
      .json({ success: false, error: "Server error verifying payment" });
  }
});

// ===== Serve Drive Links =====
app.get("/drive/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findOne({ orderId });
    if (!order) return res.status(404).send("Order not found.");
    if (order.status !== "paid")
      return res.status(403).send("Payment not verified. Access denied.");

    const plan = order.plan || "basic";
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
        ${links
          .map(
            (l, idx) =>
              `<a class="drive-btn" href="${l}" target="_blank" rel="noopener">Open Drive Link ${
                idx + 1
              }</a>`
          )
          .join("")}
      </div>

      <div class="small">If a link doesn't open, check that your Google Drive is set to "Anyone with link can view".</div>
    </div>
  </body>
  </html>
    `;
    res.send(html);
  } catch (err) {
    console.error("[DRIVE PAGE ERROR]", err);
    res.status(500).send("Server error loading drive links");
  }
});

// ===== Start Server =====
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}, BASE_URL=${BASE_URL}`);
});
