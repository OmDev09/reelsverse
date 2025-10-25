// ✅ payment.js — Handles Razorpay flow
const SERVER_URL = "http://localhost:4000"; // ⚠️ Change to Render URL after deploy

export async function buyPlan(plan) {
  try {
    const res = await fetch(`${SERVER_URL}/create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });

    if (!res.ok) throw new Error("Failed to create order");

    const data = await res.json();
    console.log("CREATE ORDER RESPONSE:", data);

    if (!data.orderId) {
      alert("Order creation failed!");
      return;
    }

    const options = {
      key: data.key || "rzp_test_RViLiDuYLKnagX",
      amount: data.amount,
      currency: "INR",
      name: "Reelverse",
      description: `Payment for ${plan} plan`,
      order_id: data.orderId,
      handler: async function (response) {
        console.log("RAZORPAY RESPONSE:", response);

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
        console.log("VERIFY RESPONSE:", verifyData);

        if (verifyData.success && verifyData.driveUrl) {
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

    const rzp = new window.Razorpay(options);
    rzp.open();
  } catch (error) {
    console.error("Payment error:", error);
    alert("Error starting payment: " + error.message);
  }
}
