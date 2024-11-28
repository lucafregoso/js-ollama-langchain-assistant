export function isValidUrl(string, options = {}) {
  const {
    protocols = ["http:", "https:"],
    requireTLD = true,
    allowLocalhostDev = false,
    maxLength = 2083, // IE max URL length
  } = options;

  try {
    if (string.length > maxLength) {
      return false;
    }

    const url = new URL(string);

    if (!protocols.includes(url.protocol)) {
      return false;
    }

    if (requireTLD) {
      // Check if hostname has at least two parts (except localhost)
      const hostnameParts = url.hostname.split(".");
      if (
        hostnameParts.length < 2 &&
        !(allowLocalhostDev && url.hostname === "localhost")
      ) {
        return false;
      }
    }

    // Check for invalid hostname characters
    if (/[^a-zA-Z0-9-.]/.test(url.hostname)) {
      return false;
    }

    // Validate localhost for development
    if (
      !allowLocalhostDev &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    ) {
      return false;
    }

    return true;
  } catch (err) {
    return false;
  }
}

export default {
  isValidUrl,
};
