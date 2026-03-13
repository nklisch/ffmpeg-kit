# Post-Setup Checklist

Tasks to complete before the first npm publish.

## 1. Configure npm Trusted Publishing

1. Go to [npmjs.com](https://www.npmjs.com) → Package → Settings → Publishing access → Trusted Publishers
2. Add GitHub Actions as a trusted publisher:
   - **Repository owner**: `nklisch`
   - **Repository**: `ffmpeg-kit`
   - **Workflow**: `release.yml`
3. No secrets or tokens needed — GitHub OIDC handles authentication

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
