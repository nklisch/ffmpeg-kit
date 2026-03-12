# Post-Setup Checklist

Tasks to complete before the first npm publish.

## 1. Add NPM_TOKEN to GitHub

1. Go to [npmjs.com](https://www.npmjs.com) → Account → Access Tokens
2. Generate a new token — type: **Automation**
3. Go to GitHub repo → Settings → Secrets and variables → Actions
4. Add secret named `NPM_TOKEN` with the token value

## 2. Enable GitHub Pages

1. Go to GitHub repo → Settings → Pages
2. Set source to **GitHub Actions**
3. Push to `main` (or touch `docs/`) to trigger the first deploy
4. Site will be live at `https://nklisch.github.io/ffmpeg-kit`

## 3. First Release

Once the above are done:

```bash
pnpm release patch   # bumps version, tags, pushes — CI publishes to npm
```
