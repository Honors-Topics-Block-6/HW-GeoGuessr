import { useRef } from 'react';
import './MapPicker.css';

function MapPicker({ markerPosition, onMapClick }) {
  const mapRef = useRef(null);

  const handleClick = (event) => {
    if (!mapRef.current) return;

    const rect = mapRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;

    // Clamp values between 0 and 100
    const clampedX = Math.max(0, Math.min(100, x));
    const clampedY = Math.max(0, Math.min(100, y));

    onMapClick({ x: clampedX, y: clampedY });
  };

  return (
    <div className="map-picker-container">
      <div className="map-header">
        <span className="map-icon">🗺️</span>
        <span>Click to place your guess</span>
      </div>
      <div
        className="map-picker"
        ref={mapRef}
        onClick={handleClick}
      >
        {/* Placeholder map SVG */}
        <svg
          className="map-svg"
          viewBox="0 0 400 300"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Background */}
          <rect x="0" y="0" width="400" height="300" fill="#1a1a2e" />

          {/* Grid lines */}
          <g stroke="#2a2a4a" strokeWidth="0.5">
            {[...Array(9)].map((_, i) => (
              <line key={`v${i}`} x1={(i + 1) * 40} y1="0" x2={(i + 1) * 40} y2="300" />
            ))}
            {[...Array(7)].map((_, i) => (
              <line key={`h${i}`} x1="0" y1={(i + 1) * 40} x2="400" y2={(i + 1) * 40} />
            ))}
          </g>

          {/* Buildings - Sample campus layout */}
          <g fill="#16213e" stroke="#3a3a5a" strokeWidth="1">
            {/* Main Building */}
            <rect x="50" y="80" width="120" height="80" rx="4" />
            <text x="110" y="125" fill="#6b6b6b" fontSize="10" textAnchor="middle">Main</text>

            {/* Library */}
            <rect x="200" y="60" width="80" height="60" rx="4" />
            <text x="240" y="95" fill="#6b6b6b" fontSize="10" textAnchor="middle">Library</text>

            {/* Gym */}
            <rect x="300" y="100" width="70" height="100" rx="4" />
            <text x="335" y="155" fill="#6b6b6b" fontSize="10" textAnchor="middle">Gym</text>

            {/* Science Building */}
            <rect x="100" y="190" width="100" height="70" rx="4" />
            <text x="150" y="230" fill="#6b6b6b" fontSize="10" textAnchor="middle">Science</text>

            {/* Arts Center */}
            <rect x="230" y="180" width="90" height="80" rx="4" />
            <text x="275" y="225" fill="#6b6b6b" fontSize="10" textAnchor="middle">Arts</text>
          </g>

          {/* Paths */}
          <g stroke="#3a3a5a" strokeWidth="2" fill="none" strokeDasharray="4,4">
            <path d="M170 120 L200 90" />
            <path d="M170 130 L200 200 L230 220" />
            <path d="M280 90 L300 150" />
            <path d="M200 230 L230 220" />
          </g>
        </svg>

        {/* Marker */}
        {markerPosition && (
          <div
            className="marker"
            style={{
              left: `${markerPosition.x}%`,
              top: `${markerPosition.y}%`
            }}
          >
            <div className="marker-pin"></div>
            <div className="marker-pulse"></div>
          </div>
        )}
      </div>
    </div>
  );
}

export default MapPicker;
