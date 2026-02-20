const NEW_SITE_URL = 'https://hwgeoguessr.web.app';
const OLD_HOSTNAME = 'geogessr-a4adc.web.app';

/**
 * Redirects users from the old domain (geogessr-a4adc.web.app) to the new one
 * (hwgeoguessr.web.app), preserving the current path and query string.
 */
function MigrationBanner(): null {
  if (window.location.hostname === OLD_HOSTNAME) {
    window.location.replace(
      `${NEW_SITE_URL}${window.location.pathname}${window.location.search}${window.location.hash}`
    );
  }
  return null;
}

export default MigrationBanner;
