# Daur Calculator

A two-panel jewellery estimator. The calculator is public; `admin.html` is for the administrator. GitHub hosts the static pages, and Supabase provides login, the shared product/rate database, and database-side access control.

## Configure Supabase

1. Create a Supabase project.
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the project's SQL Editor.
3. Run [`supabase/batch_tracking.sql`](supabase/batch_tracking.sql) in the SQL Editor. This creates import batch history and groups any existing products into one legacy batch because their original upload dates were not recorded.
4. In Supabase Authentication, create the admin user with an email and password. Disable public sign-ups so only users you create can authenticate.
5. Give that user the admin role by running this in the SQL Editor, replacing the email:

   ```sql
   update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"daur_role":"admin"}'::jsonb
   where email = 'admin@example.com';
   ```

   Sign out and back in after assigning the role.
6. In `supabase-config.js`, set the Supabase project URL and **publishable** key from Project Settings → API Keys. Never use a secret or service-role key in this file. The publishable key is safe to include in the static site because database access is controlled by Row Level Security policies in `schema.sql`.
7. Publish the repository with GitHub Pages. In Supabase Auth → URL Configuration, add the exact local URL `http://127.0.0.1:8081/admin.html` and your deployed `admin.html` URL to the allowed redirect URLs. The admin page's “Forgot password?” link emails a recovery link; open it on the same device as the app when using the local URL, then set a new password. Do not open the HTML file directly (`file://`); sign-in and password recovery need the local server or hosted site.

## Use the panels

- Open the site root for the calculator. It reads the shared rate card and finds a product by its exact model ID.
- Open `admin.html` for the password sign-in, rate card, and Excel import.
- Admin lists workbook upload batches by date, file name, product count, and model IDs. An admin can remove a whole batch after confirmation; products also present in another batch are kept. Product rows imported before batch tracking are grouped in one legacy batch with an unavailable original date.
- Import the original workbook from the admin panel. When present, it reads stock rows from the sheet containing `Model No`, `Type`, and `NT WT`, grouping each Model No with its following gold/diamond/stone rows; the Model No (for example `26/E/4760`) becomes the scan value. If no such stock rows exist, it falls back to `Packing List Extract` and uses Product ID. HUID is ignored for lookup. The stock sheet's per-unit labour rate is not imported; the admin making percentage remains in control.
- Imported workbook rows do not change the rate card. The card initially uses the app's existing defaults: 24KT gold ₹9,370/g, 14KT factor 0.60, 18KT factor 0.76, diamond ₹35,000/ct, stone ₹0/ct, making 18%, GST 3%, rhodium ₹1,200, and certificate ₹1,500.
- Item labour from the workbook is used as the making amount. If no item labour is available, the configured making percentage is used.

The database permits public reads of the rate card and a single exact product lookup. Product writes and rate updates require the authenticated admin role. The full workbook is parsed in the browser; only the product fields listed above are sent to Supabase. The old local SQLite file is ignored by Git; after configuring the hosted Supabase project, upload the workbook once from `admin.html` to populate its product table.

## Run locally

After configuring `supabase-config.js`, run a static server from this folder:

```sh
python3 -m http.server 8081
```

Then open http://127.0.0.1:8081. Camera scanning works on localhost or an HTTPS deployment where the browser grants camera access.

## Calculation

- Gold value = net gold weight × selected 14KT or 18KT rate (derived from 24KT and its configured multiplier).
- Making = the product labour amount, or gold value × configured making percentage.
- Diamond value = diamond weight × diamond rate; stone value = stone weight × stone rate.
- Subtotal includes gold, making, diamond, stone, rhodium, and certificate values. GST is added using the configured percentage.
