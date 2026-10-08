const byId = (id) => document.getElementById(id);
const adminFields = {
  "admin-gold24": ["gold_rate_24", 1],
  "admin-gold14-factor": ["gold_14_factor", 1],
  "admin-gold18-factor": ["gold_18_factor", 1],
  "admin-diamond": ["diamond_rate", 1],
  "admin-stone": ["stone_rate", 1],
  "admin-making": ["making_rate", 0.01],
  "admin-gst": ["gst_rate", 0.01],
  "admin-rhodium": ["rhodium_charge", 1],
  "admin-certificate": ["certificate_charge", 1],
};
const daurDb = window.daurSupabase;

function showAdmin(authenticated) {
  byId("admin-login-card").hidden = authenticated;
  byId("admin-dashboard").hidden = !authenticated;
}

function showPasswordRecovery(show) {
  byId("admin-login-card").hidden = show;
  byId("password-recovery-card").hidden = !show;
  byId("admin-dashboard").hidden = true;
}

function isAdmin(user) {
  return user?.app_metadata?.daur_role === "admin";
}

async function requireAdmin() {
  if (!daurDb) throw new Error("Add your Supabase project URL and publishable key to supabase-config.js first.");
  const { data: { user }, error } = await daurDb.auth.getUser();
  if (error) throw error;
  if (!isAdmin(user)) {
    showAdmin(false);
    await daurDb.auth.signOut();
    throw new Error("This account is not enabled as the Daur admin.");
  }
}

async function loadRateCard() {
  const { data, error } = await daurDb.from("rate_card").select("*").eq("id", true).single();
  if (error) throw error;
  for (const [id, [column, factor]] of Object.entries(adminFields)) {
    byId(id).value = Number(data[column]) / factor;
  }
}

async function loadBatches() {
  const message = byId("inventory-message");
  const container = byId("import-batches-list");
  message.textContent = "Loading import batches…";
  container.replaceChildren();
  try {
    await requireAdmin();
    const { data: batches, error } = await daurDb
      .from("import_batches")
      .select("id,file_name,product_count,is_legacy,created_at")
      .order("created_at", { ascending: false });
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") {
        throw new Error("Batch tracking needs setup. Run supabase/batch_tracking.sql once in Supabase SQL Editor, then refresh.");
      }
      throw error;
    }
    if (!batches.length) {
      message.textContent = "No import batches yet. Import a workbook to create the first batch.";
      return;
    }

    const { data: links, error: linksError } = await daurDb
      .from("import_batch_products")
      .select("batch_id,model_number")
      .order("model_number", { ascending: true });
    if (linksError) throw linksError;
    const modelsByBatch = new Map();
    for (const link of links) {
      if (!modelsByBatch.has(link.batch_id)) modelsByBatch.set(link.batch_id, []);
      modelsByBatch.get(link.batch_id).push(link.model_number);
    }

    for (const batch of batches) {
      const card = document.createElement("article");
      card.className = "import-batch";
      const heading = document.createElement("div");
      heading.className = "import-batch-heading";
      const title = document.createElement("h3");
      title.textContent = batch.is_legacy ? "Existing products (upload history unavailable)" : `Batch of ${batch.product_count}`;
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "remove-batch-button";
      removeButton.textContent = "Remove batch";
      removeButton.addEventListener("click", async () => {
        const date = new Date(batch.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
        const label = batch.is_legacy ? "existing products with unavailable upload history" : `the batch of ${batch.product_count} imported on ${date}`;
        if (!window.confirm(`Remove ${label}? Products also present in another batch will be kept.`)) return;
        removeButton.disabled = true;
        try {
          await requireAdmin();
          const { error: deleteError } = await daurDb.rpc("delete_import_batch", { p_batch_id: batch.id });
          if (deleteError) throw deleteError;
          await loadBatches();
        } catch (deleteError) {
          message.textContent = deleteError.message;
          removeButton.disabled = false;
        }
      });
      heading.append(title, removeButton);
      const meta = document.createElement("p");
      meta.className = "import-batch-meta";
      meta.textContent = batch.is_legacy
        ? `${batch.product_count} existing products · original upload date unavailable`
        : `${batch.product_count} products · ${new Date(batch.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} · ${batch.file_name}`;
      const models = document.createElement("p");
      models.className = "import-batch-models";
      models.textContent = `Model IDs: ${(modelsByBatch.get(batch.id) ?? []).join(", ") || "none recorded"}`;
      card.append(heading, meta, models);
      container.append(card);
    }
    message.textContent = `${batches.length} import batch${batches.length === 1 ? "" : "es"} listed.`;
  } catch (error) {
    message.textContent = error.message;
  }
}

async function checkSession() {
  if (!daurDb) {
    byId("login-message").textContent = "Supabase is not configured. Add your project URL and publishable key to supabase-config.js.";
    return;
  }
  const { data: { session } } = await daurDb.auth.getSession();
  if (!session) return;
  try {
    await requireAdmin();
    showAdmin(true);
    await loadRateCard();
    await loadBatches();
  } catch (error) { byId("login-message").textContent = error.message; }
}

byId("admin-login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  byId("login-message").textContent = "";
  if (!daurDb) { byId("login-message").textContent = "Supabase is not configured."; return; }
  const { data, error } = await daurDb.auth.signInWithPassword({
    email: byId("admin-email").value.trim(),
    password: byId("admin-password").value,
  });
  if (error) { byId("login-message").textContent = error.message; return; }
  if (!isAdmin(data.user)) {
    await daurDb.auth.signOut();
    byId("login-message").textContent = "This account is not enabled as the Daur admin.";
    return;
  }
  byId("admin-password").value = "";
  showAdmin(true);
  try { await loadRateCard(); }
  catch (loadError) { byId("rates-message").textContent = loadError.message; }
  await loadBatches();
});

byId("forgot-password-button").addEventListener("click", async () => {
  const email = byId("admin-email").value.trim();
  byId("login-message").textContent = "";
  if (!email) {
    byId("login-message").textContent = "Enter your admin email first.";
    byId("admin-email").focus();
    return;
  }
  if (!daurDb) {
    byId("login-message").textContent = "Supabase is not configured.";
    return;
  }
  if (!/^https?:$/.test(window.location.protocol)) {
    byId("login-message").textContent = "Open the admin page through the local server at http://127.0.0.1:8081/admin.html before requesting a reset. Do not open the file directly.";
    return;
  }
  byId("forgot-password-button").disabled = true;
  try {
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error } = await daurDb.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
    byId("login-message").textContent = "If that email is registered, Supabase will send a password reset link. Check your inbox and spam folder.";
  } catch (error) {
    byId("login-message").textContent = error.message;
  } finally {
    byId("forgot-password-button").disabled = false;
  }
});

byId("password-recovery-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = byId("new-admin-password").value;
  byId("recovery-message").textContent = "";
  if (password.length < 8) {
    byId("recovery-message").textContent = "Use at least 8 characters for your new password.";
    return;
  }
  try {
    const { data, error } = await daurDb.auth.updateUser({ password });
    if (error) throw error;
    byId("new-admin-password").value = "";
    if (!isAdmin(data.user)) {
      await daurDb.auth.signOut();
      showPasswordRecovery(false);
      byId("login-message").textContent = "Password changed. Sign in with your admin email.";
      return;
    }
    showAdmin(true);
    byId("recovery-message").textContent = "Password changed. You are now signed in.";
    await loadRateCard();
  } catch (error) {
    byId("recovery-message").textContent = error.message;
  }
});

daurDb?.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") showPasswordRecovery(true);
});

byId("logout-button").addEventListener("click", async () => {
  if (daurDb) await daurDb.auth.signOut();
  showAdmin(false);
});

byId("save-rates-button").addEventListener("click", async () => {
  byId("rates-message").textContent = "";
  try {
    await requireAdmin();
    const values = {};
    for (const [id, [column, factor]] of Object.entries(adminFields)) {
      const raw = byId(id).value.trim().replaceAll(",", "");
      const value = Number(raw);
      if (!raw || !Number.isFinite(value) || value < 0) throw new Error("Enter a valid non-negative number in every rate field.");
      values[column] = value * factor;
    }
    if (values.gold_rate_24 === 0) throw new Error("24KT gold rate must be above zero.");
    values.updated_at = new Date().toISOString();
    const { error } = await daurDb.from("rate_card").update(values).eq("id", true);
    if (error) throw error;
    byId("rates-message").textContent = "Rate card saved and shared with the calculator.";
  } catch (error) { byId("rates-message").textContent = error.message; }
});

byId("refresh-batches-button").addEventListener("click", loadBatches);

function numeric(value, label) {
  const parsed = Number(String(value ?? "").replaceAll(",", "").trim() || 0);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be a valid non-negative number.`);
  return parsed;
}

function packingListProducts(workbook) {
  const sheetName = workbook.SheetNames.find((name) => name.trim().toLowerCase() === "packing list extract");
  if (!sheetName) throw new Error("Workbook must contain a 'Packing List Extract' sheet.");
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
  const products = [];
  for (const row of rows) {
    const model = String(row["Product ID"] ?? "").trim();
    if (!model) continue;
    const metal = String(row.Metal ?? "").toUpperCase();
    const purity = metal.includes("18") ? "18" : metal.includes("14") ? "14" : "";
    if (!purity) continue;
    products.push({
      model_number: model,
      // The item's printed model ID (for example 26/E/4714) is the scan key.
      qr_value: model,
      net_weight: numeric(row["Net Wt"], "Net Wt"),
      diamond_weight: numeric(row["Total Diam Wt (ct)"], "Total Diam Wt (ct)"),
      stone_weight: numeric(row["Stone Wt (ct)"], "Stone Wt (ct)"),
      purity,
      description: String(row["Product Name"] ?? "").trim(),
      labor_charge: numeric(row["Labour (₹)"], "Labour (₹)"),
      updated_at: new Date().toISOString(),
    });
  }
  if (!products.length) throw new Error("No 14KT or 18KT product rows were found in Packing List Extract.");
  return products;
}

function stockSheetProducts(workbook) {
  const sheetName = workbook.SheetNames.find((name) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: "", range: 0 });
    const headers = Object.keys(rows[0] ?? {}).map((header) => header.trim().toUpperCase());
    return headers.includes("MODEL NO") && headers.includes("TYPE") && headers.includes("NT WT");
  });
  if (!sheetName) return [];

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
  const groups = [];
  let current = null;
  for (const row of rows) {
    const model = String(row["MODEL NO"] ?? "").trim();
    if (model) {
      if (current) groups.push(current);
      current = { model, rows: [] };
    }
    if (current && [row.TYPE, row.CATEGORY, row.NAME].some((value) => String(value ?? "").trim())) {
      current.rows.push(row);
    }
  }
  if (current) groups.push(current);

  return groups.flatMap(({ model, rows: components }) => {
    const gold = components.find((row) => String(row.TYPE ?? "").trim().toUpperCase() === "GOLD");
    if (!gold) return [];

    const purityValue = String(gold.PURITY ?? "").trim();
    const purityNumber = Number(purityValue);
    const purity = /14/.test(purityValue) || (purityNumber >= 58 && purityNumber <= 60)
      ? "14"
      : /18/.test(purityValue) || (purityNumber >= 74 && purityNumber <= 76)
        ? "18"
        : "";
    if (!purity) return [];

    const weightFor = (kind) => components.reduce((total, row) => {
      const category = `${row.CATEGORY ?? ""} ${row.NAME ?? ""}`.toLowerCase();
      return category.includes(kind) ? total + numeric(row["NT WT"], `${model} ${kind} weight`) : total;
    }, 0);

    return [{
      model_number: model,
      qr_value: model,
      net_weight: numeric(gold["NT WT"], `${model} net weight`),
      diamond_weight: weightFor("diamond"),
      stone_weight: weightFor("stone"),
      purity,
      description: "",
      // Sheet1's LAB CHRGS is a per-unit rate, not an item amount. Keep the
      // app's admin making percentage in control instead of importing it.
      labor_charge: 0,
      updated_at: new Date().toISOString(),
    }];
  });
}

byId("import-products-button").addEventListener("click", async () => {
  const file = byId("product-file").files[0];
  if (!file) { byId("database-message").textContent = "Choose the Excel workbook first."; return; }
  byId("database-message").textContent = "";
  try {
    await requireAdmin();
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    // The stock sheet is the authoritative source when it contains model IDs.
    // Packing List Extract is a fallback for workbooks without a Model No sheet.
    const stockProducts = stockSheetProducts(workbook);
    const products = stockProducts.length ? stockProducts : packingListProducts(workbook);
    const { error } = await daurDb.rpc("import_products_batch", {
      p_file_name: file.name,
      p_products: products,
    });
    if (error) throw error;
    byId("database-message").textContent = `${products.length} products imported or updated as a new batch. Rates were left unchanged.`;
    byId("database-message").classList.add("success");
    await loadBatches();
  } catch (error) { byId("database-message").textContent = error.message; }
});

checkSession().catch((error) => { byId("login-message").textContent = error.message; });

const authHash = new URLSearchParams(window.location.hash.slice(1));
if (authHash.get("error_code") === "otp_expired") {
  byId("login-message").textContent = "That reset link has expired or was already used. Open the admin page from the local server and request a new link.";
}
