const RHODIUM_CHARGE = 1200;
const CERTIFICATE_CHARGE = 1500;
const MAKING_CHARGE_RATE = 0.18;
const GST_RATE = 0.03;
const rates = { goldRate: 9370, diamondRate: 35000 };
const PIN_HASH = "5f0e92362198dc68190b3e7ba044e6475ae036de70be6536a056de57290d3a03";

const input = (id) => document.getElementById(id);
const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
});

function numberFrom(id) {
  const value = input(id).value.trim().replaceAll(",", "");
  if (!value) return 0;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error("Please enter valid positive numbers.");
  return number;
}

function setValue(id, value) {
  input(id).textContent = money.format(value);
}

input("calculator-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const message = input("message");
  try {
    const grossWeight = numberFrom("gross-weight");
    const netWeight = numberFrom("net-weight");
    const diamondWeight = numberFrom("diamond-weight");
    if (grossWeight && netWeight > grossWeight) {
      throw new Error("Net weight cannot be greater than gross weight.");
    }

    const goldValue = netWeight * rates.goldRate;
    const makingCharges = goldValue * MAKING_CHARGE_RATE;
    const diamondValue = diamondWeight * rates.diamondRate;
    const subtotal = goldValue + makingCharges + diamondValue + RHODIUM_CHARGE + CERTIFICATE_CHARGE;
    const gstValue = subtotal * GST_RATE;

    setValue("gold-value", goldValue);
    setValue("making-charges", makingCharges);
    setValue("diamond-value", diamondValue);
    setValue("subtotal", subtotal);
    setValue("gst-value", gstValue);
    setValue("final-total", subtotal + gstValue);
    message.textContent = "";
  } catch (error) {
    input("message").textContent = error.message;
  }
});

input("reset-button").addEventListener("click", () => {
  input("calculator-form").reset();
  input("gold-rate").value = rates.goldRate;
  input("diamond-rate").value = rates.diamondRate;
  ["gold-value", "making-charges", "diamond-value", "subtotal", "gst-value", "final-total"].forEach((id) => setValue(id, 0));
  input("message").textContent = "";
});

async function hashPin(pin) {
  const bytes = new TextEncoder().encode(pin);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function unlockCalculator(goldRate) {
  rates.goldRate = goldRate;
  input("gold-rate").value = rates.goldRate;
  document.body.classList.remove("locked");
}

input("pin-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const pin = input("pin-input").value;
  const goldRate = Number(input("login-gold-rate").value.trim().replaceAll(",", ""));
  if (!Number.isFinite(goldRate) || goldRate < 0) {
    input("pin-message").textContent = "Enter a valid gold rate.";
    return;
  }
  if (await hashPin(pin) === PIN_HASH) {
    unlockCalculator(goldRate);
    return;
  }
  input("pin-message").textContent = "Incorrect PIN. Please try again.";
  input("pin-input").value = "";
  input("pin-input").focus();
});
