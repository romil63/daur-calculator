const rates = { goldRate24: 9370, gold14Factor: 0.60, gold18Factor: 0.76, goldRate14: 5622, goldRate18: 7121.2, diamondRate: 35000, stoneRate: 0, makingRate: 0.18, gstRate: 0.03, rhodiumCharge: 1200, certificateCharge: 1500 };
const estimates = [];
let currentCalculation = null;
let currentProductModel = "";
let currentProductLabor = 0;
let currentProductSaleStatus = "unavailable";

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

function showRates() {
  rates.goldRate14 = rates.goldRate24 * rates.gold14Factor;
  rates.goldRate18 = rates.goldRate24 * rates.gold18Factor;
  input("gold-rate-24").value = rates.goldRate24.toFixed(2);
  input("gold-rate-14").value = rates.goldRate14.toFixed(2);
  input("gold-rate-18").value = rates.goldRate18.toFixed(2);
  input("diamond-rate").value = rates.diamondRate;
  input("stone-rate").value = rates.stoneRate;
  input("rhodium-charge").textContent = money.format(rates.rhodiumCharge);
  input("certificate-charge").textContent = money.format(rates.certificateCharge);
  input("making-label").textContent = `Making Charges (${(rates.makingRate * 100).toFixed(2).replace(/\.00$/, "")}% when no item labour is supplied)`;
  input("gst-label").textContent = `GST (${(rates.gstRate * 100).toFixed(2).replace(/\.00$/, "")}%)`;
}

function showSaleControl(status) {
  const button = input("request-sale-button");
  const message = input("sale-request-message");
  currentProductSaleStatus = status;
  button.hidden = status === "unavailable" || status === "sold";
  input("sale-request-note").hidden = button.hidden;
  button.disabled = status === "pending";
  button.textContent = status === "pending" ? "Pending admin approval" : "Mark as sold";
  message.textContent = status === "pending"
    ? "This model is waiting for admin approval."
    : status === "sold"
      ? "This model has already been approved as sold."
      : "";
}

async function loadRates() {
  try {
    if (!window.daurSupabase) throw new Error("Supabase is not configured yet. Add the project URL and publishable key in supabase-config.js.");
    const { data, error } = await window.daurSupabase.from("rate_card").select("*").eq("id", true).single();
    if (error) throw error;
    Object.assign(rates, {
      goldRate24: Number(data.gold_rate_24), gold14Factor: Number(data.gold_14_factor), gold18Factor: Number(data.gold_18_factor),
      diamondRate: Number(data.diamond_rate), stoneRate: Number(data.stone_rate), makingRate: Number(data.making_rate),
      gstRate: Number(data.gst_rate), rhodiumCharge: Number(data.rhodium_charge), certificateCharge: Number(data.certificate_charge),
    });
    showRates();
    return true;
  } catch (error) { input("message").textContent = error.message; return false; }
}
const ratesReady = loadRates();

function calculate() {
  const netWeight = numberFrom("net-weight");
  const diamondWeight = numberFrom("diamond-weight");
  const stoneWeight = numberFrom("stone-weight");
  const purity = document.querySelector('input[name="gold-purity"]:checked').value;
  const goldRate = purity === "18" ? rates.goldRate18 : rates.goldRate14;
  const goldValue = netWeight * goldRate;
  const makingCharges = currentProductLabor || goldValue * rates.makingRate;
  const diamondValue = diamondWeight * rates.diamondRate;
  const stoneValue = stoneWeight * rates.stoneRate;
  const subtotal = goldValue + makingCharges + diamondValue + stoneValue + rates.rhodiumCharge + rates.certificateCharge;
  const gstValue = subtotal * rates.gstRate;
  return { modelNumber: currentProductModel, purity: `${purity}KT`, netWeight, diamondWeight, stoneWeight, goldValue, makingCharges, diamondValue, stoneValue, subtotal, gstValue, finalTotal: subtotal + gstValue };
}

function displayCalculation(calculation) {
  input("gold-value-label").textContent = `Gold Value (${calculation.purity})`;
  setValue("gold-value", calculation.goldValue);
  setValue("making-charges", calculation.makingCharges);
  setValue("diamond-value", calculation.diamondValue);
  setValue("stone-value", calculation.stoneValue);
  setValue("subtotal", calculation.subtotal);
  setValue("gst-value", calculation.gstValue);
  setValue("final-total", calculation.finalTotal);
}

input("calculator-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = input("message");
  try {
    if (!await ratesReady) throw new Error("Shared rates did not load. Refresh the page before calculating.");
    currentCalculation = calculate();
    displayCalculation(currentCalculation);
    message.textContent = "";
  } catch (error) {
    input("message").textContent = error.message;
  }
});

input("reset-button").addEventListener("click", () => {
  input("calculator-form").reset();
  currentProductModel = "";
  currentProductLabor = 0;
  showSaleControl("unavailable");
  input("stone-weight").value = 0;
  input("gold-rate-24").value = rates.goldRate24;
  input("gold-rate-14").value = rates.goldRate14.toFixed(2);
  input("gold-rate-18").value = rates.goldRate18.toFixed(2);
  input("diamond-rate").value = rates.diamondRate;
  input("stone-rate").value = rates.stoneRate;
  ["gold-value", "making-charges", "diamond-value", "stone-value", "subtotal", "gst-value", "final-total"].forEach((id) => setValue(id, 0));
  input("gold-value-label").textContent = "Gold Value (14KT)";
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
      <div><h3>${escapeHtml(estimate.name)}</h3><p>${estimate.modelNumber ? `Model ${escapeHtml(estimate.modelNumber)} · ` : ""}${estimate.purity} gold · ${estimate.netWeight}g · ${estimate.diamondWeight} ct diamond · ${estimate.stoneWeight} ct stone</p></div>
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

async function lookupProduct() {
  if (!await ratesReady) { input("lookup-message").textContent = "Shared rates did not load. Refresh the page before looking up a product."; return; }
  if (!window.daurSupabase) { input("lookup-message").textContent = "Supabase is not configured. Set up the project connection first."; return; }
  const code = input("product-code").value.trim();
  if (!code) { input("lookup-message").textContent = "Scan the model ID or enter it manually."; return; }
  currentProductModel = "";
  currentProductLabor = 0;
  showSaleControl("unavailable");
  try {
    const { data, error } = await window.daurSupabase.rpc("lookup_product", { p_code: code });
    if (error) throw error;
    const product = Array.isArray(data) ? data[0] : data;
    if (!product) throw new Error("No product matches that model ID.");
    if (product.sale_status === "sold") {
      currentCalculation = null;
      input("lookup-message").textContent = `${product.model_number} is already marked as sold.`;
      showSaleControl("sold");
      return;
    }
    input("net-weight").value = product.net_weight;
    input("diamond-weight").value = product.diamond_weight;
    input("stone-weight").value = product.stone_weight || 0;
    currentProductModel = product.model_number;
    currentProductLabor = Number(product.labor_charge || 0);
    showSaleControl(product.sale_status === "pending" ? "pending" : "available");
    document.querySelector(`input[name="gold-purity"][value="${product.purity}"]`).checked = true;
    input("lookup-message").textContent = `${product.model_number}${product.description ? ` · ${product.description}` : ""} loaded.`;
    currentCalculation = calculate();
    displayCalculation(currentCalculation);
  } catch (error) { input("lookup-message").textContent = error.message; }
}

input("lookup-button").addEventListener("click", lookupProduct);
input("product-code").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); lookupProduct(); } });
input("product-code").addEventListener("input", () => {
  currentProductModel = "";
  currentProductLabor = 0;
  showSaleControl("unavailable");
});

input("request-sale-button").addEventListener("click", async () => {
  const button = input("request-sale-button");
  const message = input("sale-request-message");
  if (!currentProductModel || currentProductSaleStatus !== "available") return;
  const modelNumber = currentProductModel;
  button.disabled = true;
  message.textContent = "Sending sale for admin approval…";
  try {
    const { error } = await window.daurSupabase.rpc("submit_sale", { p_model_number: modelNumber });
    if (error) throw error;
    showSaleControl("pending");
    input("lookup-message").textContent = `${modelNumber} submitted to admin for sale approval.`;
  } catch (error) {
    button.disabled = false;
    message.textContent = error.message;
  }
});

let qrStream = null;
input("scan-button").addEventListener("click", async () => {
  const video = input("qr-video");
  if (qrStream) { qrStream.getTracks().forEach((track) => track.stop()); qrStream = null; video.hidden = true; input("scan-button").textContent = "Scan QR"; return; }
  if (!("BarcodeDetector" in window)) { input("lookup-message").textContent = "Camera QR scanning is unavailable in this browser; use the model field or a scanner that types its code."; return; }
  try {
    const detector = new BarcodeDetector({ formats: ["qr_code"] });
    qrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = qrStream; video.hidden = false; await video.play(); input("scan-button").textContent = "Stop scanning";
    const scan = async () => {
      if (!qrStream) return;
      try {
        const codes = await detector.detect(video);
        if (codes.length) {
          input("product-code").value = codes[0].rawValue;
          qrStream.getTracks().forEach((track) => track.stop()); qrStream = null; video.hidden = true; input("scan-button").textContent = "Scan QR";
          await lookupProduct(); return;
        }
      } catch { /* Keep scanning while the camera settles. */ }
      requestAnimationFrame(scan);
    };
    requestAnimationFrame(scan);
  } catch (error) { input("lookup-message").textContent = `Could not start camera: ${error.message}`; }
});

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
    ctx.fillText(`${estimate.modelNumber ? `Model ${estimate.modelNumber} · ` : ""}${estimate.purity} gold · Subtotal: ${money.format(estimate.subtotal)}`, 52, y + 42);
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
