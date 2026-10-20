# Sketch Haven website

Static site for GitHub Pages, with an artist dashboard at `/admin.html`.

## Publishing this version
1. In the GitHub repo, delete the old files (`1.jpg`–`6.jpg`, `home.css`, `about.css`, `gallery.css`, `tnc.css`, `*.js`, old `*.html`, `logo.jpg`).
2. Upload everything from this folder to the repo root (keep the `images/` and `data/` folders).
3. Wait 1–2 minutes, then open your site.

## First-time dashboard setup (once per device)
1. Open `https://sketchhaven.github.io/admin.html`.
2. Create a fine-grained token at https://github.com/settings/personal-access-tokens/new
   - Repository access: only `SketchHaven/SketchHaven.github.io`
   - Permissions: **Contents → Read and write**
3. Paste the token, choose a dashboard password (8+ characters) and save.
4. From then on you only need the password on that device.

## What the dashboard edits
- **Gallery:** add many photos at once (auto-resized), edit titles, captions, categories, reorder, delete, choose which show on the home page.
- **Pricing:** add / edit / hide sketch types and prices, and the canvas sizes in the booking form.
- **Site settings:** open/closed commissions, announcement banner, home page text, social links, About text.

Changes go live after you press **Publish changes** (GitHub Pages then takes 1–2 minutes). Every publish is a normal Git commit, so you can undo mistakes from the repo history.

## Files
- `data/site.json` – all editable content (the dashboard writes this file)
- `images/` – artwork; photos added in the dashboard go to `images/gallery/`
- `styles.css`, `main.js`, `flowers.js` – public site
- `admin.html`, `admin.css`, `admin.js` – dashboard

## SEO
- Every page has a unique title/description, canonical URL, Open Graph + Twitter tags (preview image: `images/social-preview.jpg`, 1200×630) and JSON-LD.
- `sitemap.xml` and `robots.txt` are in the repo root. Submit `https://sketchhaven.github.io/sitemap.xml` in Google Search Console and Bing Webmaster Tools.
- Check structured data at https://search.google.com/test/rich-results and https://validator.schema.org after deploying.
- The dashboard keeps the JSON-LD gallery/prices in sync in the browser; the static HTML holds the baseline Google reads first.
- If you move to a custom domain, update every `https://sketchhaven.github.io` URL (canonical, og:url, sitemap, robots, JSON-LD).
