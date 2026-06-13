(() => {
  const host = window.location.hostname;
  const isLocalHost = host === "localhost" || host === "127.0.0.1" || host === "";

  if (window.IC_FEMALE_IMAGE_GENERATION_LIMIT === undefined) {
    window.IC_FEMALE_IMAGE_GENERATION_LIMIT = 1;
  }

  if (!isLocalHost) {
    window.IC_BACKEND_BASE_URL = window.IC_BACKEND_BASE_URL || "https://ic-wearables.vercel.app";
  }
})();
