const RHODIUM_CHARGE = 1200;
const CERTIFICATE_CHARGE = 1500;
const MAKING_CHARGE_RATE = 0.18;
const GST_RATE = 0.03;
const rates = { goldRate24: 9370, goldRate14: 5622, goldRate18: 7121.2, diamondRate: 35000 };
const PIN_HASH = "5f0e92362198dc68190b3e7ba044e6475ae036de70be6536a056de57290d3a03";
const estimates = [];
let currentCalculation = null;

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

function calculate() {
  const netWeight = numberFrom("net-weight");
  const diamondWeight = numberFrom("diamond-weight");
  const goldValue = netWeight * rates.goldRate14;
  const makingCharges = goldValue * MAKING_CHARGE_RATE;
  const diamondValue = diamondWeight * rates.diamondRate;
  const subtotal = goldValue + makingCharges + diamondValue + RHODIUM_CHARGE + CERTIFICATE_CHARGE;
  const gstValue = subtotal * GST_RATE;
  return { netWeight, diamondWeight, goldValue, makingCharges, diamondValue, subtotal, gstValue, finalTotal: subtotal + gstValue };
}

function displayCalculation(calculation) {
  setValue("gold-value", calculation.goldValue);
  setValue("making-charges", calculation.makingCharges);
  setValue("diamond-value", calculation.diamondValue);
  setValue("subtotal", calculation.subtotal);
  setValue("gst-value", calculation.gstValue);
  setValue("final-total", calculation.finalTotal);
}

input("calculator-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const message = input("message");
  try {
    currentCalculation = calculate();
    displayCalculation(currentCalculation);
    message.textContent = "";
  } catch (error) {
    input("message").textContent = error.message;
  }
});

input("reset-button").addEventListener("click", () => {
  input("calculator-form").reset();
  input("gold-rate-24").value = rates.goldRate24;
  input("gold-rate-14").value = rates.goldRate14.toFixed(2);
  input("gold-rate-18").value = rates.goldRate18.toFixed(2);
  input("diamond-rate").value = rates.diamondRate;
  ["gold-value", "making-charges", "diamond-value", "subtotal", "gst-value", "final-total"].forEach((id) => setValue(id, 0));
  input("message").textContent = "";
  currentCalculation = null;
});

function renderEstimateList() {
  const list = input("estimate-list");
  const grandTotal = estimates.reduce((total, estimate) => total + estimate.finalTotal, 0);
  input("estimate-grand-total").textContent = money.format(grandTotal);
  if (!estimates.length) {
    list.innerHTML = '<p class="empty-list">No products have been added yet.</p>';
    return;
  }
  list.innerHTML = estimates.map((estimate, index) => `
    <article class="estimate-item">
      <div><h3>${escapeHtml(estimate.name)}</h3><p>${estimate.netWeight}g gold · ${estimate.diamondWeight} ct diamond</p></div>
      <div class="estimate-item-total"><span>Subtotal: ${money.format(estimate.subtotal)}</span><strong>${money.format(estimate.finalTotal)}</strong><button type="button" class="remove-estimate" data-index="${index}" aria-label="Remove ${escapeHtml(estimate.name)}">Remove</button></div>
    </article>`).join("");
}

function escapeHtml(value) {
  const element = document.createElement("div");
  element.textContent = value;
  return element.innerHTML;
}

input("add-estimate-button").addEventListener("click", () => {
  const name = input("person-name").value.trim();
  if (!name) {
    input("message").textContent = "Enter a person name before adding to the estimate list.";
    input("person-name").focus();
    return;
  }
  try {
    currentCalculation = calculate();
    displayCalculation(currentCalculation);
    estimates.push({ name, ...currentCalculation });
    renderEstimateList();
    input("message").textContent = `${name} was added to the estimate list.`;
  } catch (error) {
    input("message").textContent = error.message;
  }
});

input("open-estimate-button").addEventListener("click", () => {
  renderEstimateList();
  input("estimate-dialog").showModal();
});
input("close-estimate-button").addEventListener("click", () => input("estimate-dialog").close());
input("estimate-list").addEventListener("click", (event) => {
  const button = event.target.closest(".remove-estimate");
  if (!button) return;
  estimates.splice(Number(button.dataset.index), 1);
  renderEstimateList();
});

input("download-estimate-button").addEventListener("click", downloadEstimatePng);

function downloadEstimatePng() {
  if (!estimates.length) return;
  const dateTime = new Date();
  const rows = estimates.length;
  const width = 960;
  const height = 230 + rows * 100 + 110;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fffaf2";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#8a5b2b";
  ctx.fillRect(0, 0, width, 12);
  ctx.fillStyle = "#2d241d";
  ctx.font = "bold 38px Georgia";
  ctx.fillText("Daur Estimate List", 52, 75);
  ctx.fillStyle = "#736459";
  ctx.font = "22px Arial";
  ctx.fillText(`Created: ${dateTime.toLocaleString("en-IN")}`, 52, 112);
  let y = 170;
  estimates.forEach((estimate, index) => {
    ctx.strokeStyle = "#dfd1bf";
    ctx.beginPath(); ctx.moveTo(52, y - 26); ctx.lineTo(width - 52, y - 26); ctx.stroke();
    ctx.fillStyle = "#2d241d";
    ctx.font = "bold 25px Arial";
    ctx.fillText(`${index + 1}. ${estimate.name}`, 52, y + 8);
    ctx.font = "20px Arial";
    ctx.fillStyle = "#736459";
    ctx.fillText(`Subtotal: ${money.format(estimate.subtotal)}`, 52, y + 42);
    ctx.textAlign = "right";
    ctx.fillStyle = "#16713a";
    ctx.font = "bold 24px Arial";
    ctx.fillText(money.format(estimate.finalTotal), width - 52, y + 25);
    ctx.textAlign = "left";
    y += 100;
  });
  const grandTotal = estimates.reduce((total, estimate) => total + estimate.finalTotal, 0);
  ctx.fillStyle = "#e7f7d9";
  ctx.fillRect(40, height - 92, width - 80, 56);
  ctx.fillStyle = "#16713a";
  ctx.font = "bold 27px Arial";
  ctx.fillText("Final Total", 58, height - 55);
  ctx.textAlign = "right";
  ctx.fillText(money.format(grandTotal), width - 58, height - 55);
  const link = document.createElement("a");
  link.download = `daur-estimate-${dateTime.toISOString().slice(0, 19).replaceAll(":", "-")}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

async function hashPin(pin) {
  const bytes = new TextEncoder().encode(pin);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function unlockCalculator(goldRate) {
  rates.goldRate24 = goldRate;
  rates.goldRate14 = goldRate * 0.60;
  rates.goldRate18 = goldRate * 0.76;
  input("gold-rate-24").value = rates.goldRate24.toFixed(2);
  input("gold-rate-14").value = rates.goldRate14.toFixed(2);
  input("gold-rate-18").value = rates.goldRate18.toFixed(2);
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
