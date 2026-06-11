# IC Wearables Deployment Notes

IC Wearables has two parts:

- Static frontend files: `index.html`, `app.js`, `styles.css`, `female/`, `men/`, `assets/`.
- Vercel API routes: `api/*.js`.

GitHub Pages can serve the frontend only. It cannot run the `api/` backend routes.

For the full pipeline, deploy this repo to Vercel and configure the required environment variables there. Keep local secrets in `.env.local`; do not commit them.

When the frontend is opened from a non-local hostname, `config.js` points API calls to:

```text
https://ic-wearables.vercel.app
```

If the hosted site looks unstable, check:

- Vercel deployment status for this repo.
- Required API/provider environment variables in Vercel.
- Browser console errors for failed `/api/colour-profile`, `/api/generate-style-image`, or `/api/fetch-matching-clothes` calls.
- Whether product library assets in `assets/` are present after a build or sync.
