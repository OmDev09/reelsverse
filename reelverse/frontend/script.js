// ✅ Corrected script.js for Reelverse

const SERVER_URL = "http://localhost:3000"; // backend port

async function buyPlan(plan) {
  try {
    // 1️⃣ Send the plan name to backend
    const res = await fetch(`${SERVER_URL}/create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });

    if (!res.ok) throw new Error("Failed to create order");

    const data = await res.json();
    console.log("CREATE ORDER RESPONSE:", data); // debug

    if (!data.orderId) return alert("Order creation failed!");

    // 2️⃣ Razorpay options
    const options = {
      key: data.key || "rzp_test_RViLiDuYLKnagX", // backend sends key_id
      amount: data.amount, // already in paise
      currency: "INR",
      name: "Reelverse",
      description: `Payment for ${plan} plan`,
      order_id: data.orderId,
      handler: async function (response) {
        console.log("RAZORPAY RESPONSE:", response); // debug

        // 3️⃣ Verify payment on backend
        const verifyRes = await fetch(`${SERVER_URL}/verify-payment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          }),
        });

        const verifyData = await verifyRes.json();
        console.log("VERIFY RESPONSE:", verifyData); // debug

        if (verifyData.success && verifyData.driveUrl) {
          // Redirect to secure drive page
          window.location.href = verifyData.driveUrl;
        } else {
          alert(
            "Payment verification failed: " +
              (verifyData.error || "Unknown error")
          );
        }
      },
      theme: { color: "#007bff" },
    };

    const rzp = new Razorpay(options);
    rzp.open();
  } catch (error) {
    console.error("Payment error:", error);
    alert("Error starting payment: " + error.message);
  }
}
