# Deploying CafePOS — Vercel (frontend) + Railway (API + Postgres)

The React app runs on **Vercel**; the Fastify API and its **PostgreSQL** database run on
**Railway**. Vercel proxies `/api/*` to Railway, so the browser sees one origin (no CORS).

You do the two "Deploy" clicks (they use your accounts); everything else is preconfigured.

---

## 0. One-time: put the code on GitHub

Railway and Vercel both deploy from a Git repo.

```bash
cd R:/Code/cafepos
git add -A && git commit -m "CafePOS ready for deploy"   # already committed for you
# create an empty GitHub repo, then:
git remote add origin https://github.com/<you>/cafepos.git
git branch -M main
git push -u origin main
```

---

## 1. Railway — API + Postgres  (do this first, to get the API URL)

1. Railway → your project (the same one AquaLab uses) → **New → GitHub Repo → cafepos**.
   Railway reads `railway.json` and builds the `Dockerfile` automatically.
2. In that project: **New → Database → Add PostgreSQL**.
3. Open the **cafepos service → Variables** and add:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | reference the Postgres service's `DATABASE_URL` (Railway: "Add Reference") |
   | `JWT_SECRET` | a long random string — `openssl rand -hex 32` |
   | `STORE_NAME` | the client's store name |
   | `TAX_RATE` | e.g. `0.05` |
   | `KIOSK_PIN` | manager PIN for the kiosk (default `1010`) |
   | `SEED_ADMIN_USERNAME` | `admin` |
   | `SEED_ADMIN_PASSWORD` | **a strong password** (this is the real admin login) |
   | `CHANNEL_WEBHOOK_SECRET` | random string (only needed for Swiggy/Zomato) |
   | `CORS_ORIGINS` | your Vercel URL (fill in after step 2) — optional but recommended |
   | `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | leave blank until you have keys (payments run in mock mode) |

4. **Settings → Networking → Generate Domain.** Copy it, e.g.
   `https://cafepos-production.up.railway.app`.
   On deploy the container runs migrations, seeds the catalog + admin, and starts the API.
   Check it: open `https://<railway-domain>/api/health` → should return `{ "ok": true, ... }`.

---

## 2. Vercel — the React app

1. Edit **`vercel.json`** → replace `REPLACE-WITH-RAILWAY-DOMAIN.up.railway.app` with your
   Railway domain from step 1. Commit + push.
2. Vercel → **Add New → Project → import the cafepos repo.**
   - Framework preset: **Other** (config is in `vercel.json`).
   - Root directory: **/** (repo root). Build & output are already set in `vercel.json`.
3. **Deploy.** You get a URL like `https://cafepos.vercel.app`.
4. Put that URL into Railway's `CORS_ORIGINS` (step 1) for defense-in-depth, and redeploy Railway.

Open the Vercel URL → log in with the admin username/password you set. Done.

---

## Notes

- **Custom domain:** add it in Vercel (e.g. `pos.theclient.com`). Keep the Railway API on its
  own subdomain or leave it internal behind the `/api` proxy.
- **Payments:** blank Razorpay keys = mock mode. Add **test** keys to Railway to take real test
  payments, then live keys for production.
- **Swiggy/Zomato:** point their webhook at `https://<railway-domain>/api/channels/webhook`
  with header `x-channel-secret: <CHANNEL_WEBHOOK_SECRET>` once you're an approved partner.
- **Cost:** Railway ~$5/mo credit tier covers one small store; Vercel Hobby is free for this.
- **Updates:** `git push` → both Vercel and Railway auto-redeploy.
