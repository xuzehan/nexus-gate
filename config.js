// Local LAN API. Replace this with the Cloudflare HTTPS hostname in production.
window.NEXUS_CONFIG = Object.freeze({
  API_BASE_URL: "https://api.u4162692.nyat.app:36744",
  // MHD-EES uses a separate API service in local development. Replace this
  // with the public HTTPS tunnel before publishing GitHub Pages.
  MHDEES_API_BASE_URL: "http://127.0.0.1:8001"
});
