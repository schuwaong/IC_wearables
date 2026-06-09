(() => {
  const host = window.location.hostname;
  const isLocalHost = host === "localhost" || host === "127.0.0.1" || host === "";

  if (!isLocalHost) {
    window.IC_BACKEND_BASE_URL = window.IC_BACKEND_BASE_URL || "https://ic-wearables.vercel.app";
  }
})();
