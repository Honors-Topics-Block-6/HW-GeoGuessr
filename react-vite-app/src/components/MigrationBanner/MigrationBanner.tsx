import React from 'react';
import './MigrationBanner.css';

const NEW_SITE_URL = 'https://hwgeoguessr.web.app/';
const OLD_HOSTNAME = 'geogessr-a4adc.web.app';

/**
 * Permanent banner shown only on the old domain (geogessr-a4adc.web.app)
 * informing users the app has moved to hwgeoguessr.web.app.
 */
function MigrationBanner(): React.ReactElement | null {
  if (window.location.hostname !== OLD_HOSTNAME) {
    return null;
  }

  return (
    <a
      href={NEW_SITE_URL}
      className="migration-banner"
      aria-label="This app has moved to hwgeoguessr.web.app — click to go there"
    >
      <span className="migration-banner-text">
        This app has moved to{' '}
        <span className="migration-banner-link">hwgeoguessr.web.app</span>
        {' '}— click here to go there
      </span>
    </a>
  );
}

export default MigrationBanner;
