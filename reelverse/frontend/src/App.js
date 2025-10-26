import React from "react";
import { buyPlan } from "./utils/payment";
import { motion } from "framer-motion";
import "./styles.css";

const orbs = Array.from({ length: 12 }, () => ({
  size: 60 + Math.random() * 100,
  top: Math.random() * 80 + "%",
  left: Math.random() * 90 + "%",
  delay: Math.random() * 5,
  duration: 8 + Math.random() * 6,
  color: ["#f58529", "#dd2a7b", "#8134af", "#515bd4"][Math.floor(Math.random() * 4)],
}));

function HolographicOrb({ size, top, left, delay, duration, color }) {
  return (
    <motion.div
      initial={{ y: 0, x: 0, scale: 0.8, opacity: 0.2 }}
      animate={{
        y: [0, -20, 0, 20, 0],
        x: [0, 15, -15, 0],
        scale: [0.8, 1, 0.9, 1.1, 0.8],
        opacity: [0.2, 0.4, 0.3, 0.5, 0.2],
      }}
      transition={{
        duration: duration,
        delay: delay,
        repeat: Infinity,
        repeatType: "loop",
        ease: "easeInOut",
      }}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        position: "absolute",
        top,
        left,
        background: color,
        filter: "blur(15px) brightness(1.5)",
        mixBlendMode: "screen",
        zIndex: 1,
      }}
    />
  );
}

const plans = [
  { id: "basic", name: "Basic Plan", price: 499, links: 2 },
  { id: "medium", name: "Medium Plan", price: 699, links: 4 },
  { id: "advanced", name: "Pro Plan", price: 999, links: 8 },
];

export default function App() {
  return (
    <div className="main-container">
      {/* Holographic Orbs */}
      {orbs.map((orb, i) => (
        <HolographicOrb key={i} {...orb} />
      ))}

      {/* App Content */}
      <h1>🎬 Reelverse Plans</h1>

      <motion.div
        className="card-container"
        initial="hidden"
        animate="visible"
        variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.2 } } }}
      >
        {plans.map((plan, index) => (
          <motion.div
            key={plan.id}
            className="card"
            initial={{ opacity: 0, y: 30 }}
            animate={{
              opacity: 1,
              y: [0, -8, 0],
              rotate: [0, 1, -1, 0],
              transition: {
                y: { duration: 4 + index, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" },
                rotate: { duration: 5 + index, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" },
                opacity: { duration: 0.6 },
              },
            }}
            whileHover={{
              scale: 1.05,
              y: -12,
              rotate: [0, 2, -2, 0],
              transition: { duration: 0.5, yoyo: Infinity },
              boxShadow: "0 15px 40px rgba(221,42,123,0.4), 0 5px 20px rgba(245,133,41,0.3)",
            }}
          >
            <h2>{plan.name}</h2>
            <p>₹{plan.price} – {plan.links} Drive Links</p>
            <button onClick={() => buyPlan(plan.id)}>Pay Now</button>
          </motion.div>
        ))}
      </motion.div>

      {/* ---- Policy Links Section ---- */}
      <div className="policy-links" style={{ marginTop: "60px", textAlign: "center", zIndex: 5, position: "relative" }}>
        <a href="/privacy" style={{ margin: "0 15px", color: "#fff", textDecoration: "none" }}>Privacy Policy</a>
        <a href="/terms" style={{ margin: "0 15px", color: "#fff", textDecoration: "none" }}>Terms & Conditions</a>
        <a href="/refunds" style={{ margin: "0 15px", color: "#fff", textDecoration: "none" }}>Refund Policy</a>
        <a href="/contact" style={{ margin: "0 15px", color: "#fff", textDecoration: "none" }}>Contact Us</a>
      </div>
    </div>
  );
}
