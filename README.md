# 🚀 Vercel Storage Cleaner & Purger

An automated, cross-platform utility to safely purge inactive historical Vercel deployments and keep your account under the 10 GB Deployment Storage limit on the Hobby/Pro plans.

---

## ⚡ Why Do You Need This?

On Vercel, **Deployment Storage $\neq$ repository code size**.

Every single time you push a commit or test a branch, Vercel creates and stores a **full snapshot** of:
- All static assets (images, PDFs, 3D models, SVGs)
- Serverless function bundles and runtime outputs
- Build caches and traced dependencies

If you deploy 20–40 times across several projects, these old historical snapshots accumulate to **15 GB – 30 GB+**, triggering Vercel's **"Exceeded free resources ⚠️"** alert.

**This tool safely solves that problem in seconds.**

---

## 🛡️ Safety First

- **Zero Downtime:** Your **active live production deployment** for every single project is detected and protected.
- **Selective Purge:** Only dead, inactive historical snapshots (past commits and stale previews) are deleted.
- **Rate-Limit Resilient:** Automatically handles Vercel API `429 Too Many Requests` with smart exponential backoff.
- **Dry Run Mode:** Preview exactly what would be deleted before making changes.

---

## 🚀 Quickstart (3 Ways to Run)

### Method 1: Double-Click on Windows (Fastest)
Just double-click **`run-cleaner.bat`** in this folder!
It will automatically find your Vercel credentials, scan all projects, and purge old deployments.

---

### Method 2: Node.js (Cross-Platform)

Zero npm dependencies required! Uses native Node.js 18+ `fetch`.

```bash
# Preview what would be deleted (Safe Test)
npm run dry-run

# Run full cleanup immediately
npm start
```

---

### Method 3: PowerShell (Windows Terminal)

```powershell
# Preview only
.\clean.ps1 -DryRun

# Run full cleanup
.\clean.ps1
```

---

## 🤖 100% Automated Weekly Cleanup (GitHub Actions)

Tired of having to clean manually every week? You can let GitHub do it for you in the cloud for free!

1. Go to your repository on GitHub: `https://github.com/Virus1260/vercel-storage-cleaner`
2. Click **Settings** $\rightarrow$ **Secrets and variables** $\rightarrow$ **Actions**.
3. Click **New repository secret**.
   - **Name:** `VERCEL_TOKEN`
   - **Value:** Your Vercel token from [vercel.com/account/tokens](https://vercel.com/account/tokens).
4. **Done!** 
   - The included workflow (`.github/workflows/auto-clean.yml`) runs **every Sunday at midnight (UTC)** automatically.
   - You can also trigger it on-demand anytime from the **Actions** tab on GitHub by clicking **Run workflow**.

---

## 🔑 Authentication

The cleaner automatically finds your Vercel credentials in this priority order:

1. CLI argument: `node clean.mjs --token=YOUR_TOKEN`
2. Environment variable: `VERCEL_TOKEN`
3. Local Vercel CLI session:
   - Windows: `%APPDATA%\com.vercel.cli\Data\auth.json`
   - macOS/Linux: `~/.vercel/auth.json`

If you are logged into Vercel via `npx vercel login`, **no configuration is required**.

---

## ⚙️ CLI Options

| Flag | Description |
| :--- | :--- |
| `--dry-run` | Shows what would be deleted without making any API delete calls. |
| `--token=<token>` | Provide a custom Vercel token directly. |

---

## 📄 License
MIT License - Free to use and modify. Created for Shekhar Mishra (Virus1260).
