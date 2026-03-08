# Digital Brain

Digital Brain is now set up for:

- GitHub Pages hosting for the frontend
- Google Apps Script for backend auth/data operations
- Google Drive + Google Sheets for per-user storage

## Domain

This repo includes:

- `CNAME`

with:

- `digitalbrain.art`

so GitHub Pages can serve the custom domain directly.

## Frontend config

The frontend reads the deployed Apps Script Web App URL from:

- `config.js`

Current expected format:

```js
window.DIGITAL_BRAIN_CONFIG = {
    appsScriptUrl: "YOUR_DEPLOYED_APPS_SCRIPT_WEB_APP_URL"
};
```

## Apps Script backend

Files:

- `apps-script/Code.gs`
- `apps-script/appsscript.json`

Current configuration in `Code.gs`:

- master auth sheet ID is set
- user spreadsheets are created in your target Google Drive folder
- admin password is set

The script will:

- create a user record in the master auth sheet
- create one Google Sheet per user in the configured Drive folder
- create tabs for `Movies`, `TV Shows`, `Music`, `Books`, and `Thoughts`
- read/write user entries from those tabs

## Admin

Admin UI:

- `/admin.html`

The admin page uses the same Apps Script backend as the main app.
