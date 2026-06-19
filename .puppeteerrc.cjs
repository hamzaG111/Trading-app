// Keep `npm install` fast: do NOT auto-download Chromium for the optional
// preview-screenshot tool (scripts/shots.mjs). If you want to regenerate the
// preview images, fetch a browser once with:
//   npx puppeteer browsers install chrome
module.exports = {
  skipDownload: true,
};
