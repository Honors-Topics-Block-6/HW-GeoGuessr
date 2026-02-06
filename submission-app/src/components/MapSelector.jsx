import { useState, useRef } from 'react'
import './MapSelector.css'

function MapSelector({ onLocationSelect, selectedLocation }) {
  const [clickPosition, setClickPosition] = useState(selectedLocation || null)
  const imageRef = useRef(null)

  const handleMapClick = (e) => {
    if (!imageRef.current) return

    const rect = imageRef.current.getBoundingClientRect()
    const x = Math.round(e.clientX - rect.left)
    const y = Math.round(e.clientY - rect.top)

    // Ensure coordinates are within bounds
    const boundedX = Math.max(0, Math.min(x, imageRef.current.naturalWidth))
    const boundedY = Math.max(0, Math.min(y, imageRef.current.naturalHeight))

    const position = { x: boundedX, y: boundedY }
    setClickPosition(position)
    onLocationSelect(position)
  }

  return (
    <div className="map-selector">
      <h3>Select Location on Map</h3>
      <p className="instructions">Click on the map to select the pixel location where the photo was taken</p>

      <div className="map-container">
        <img
          ref={imageRef}
          src="/template-map.png"
          alt="Campus Map"
          className="map-image"
          onClick={handleMapClick}
        />
        {clickPosition && (
          <div
            className="location-marker"
            style={{
              left: `${clickPosition.x}px`,
              top: `${clickPosition.y}px`
            }}
          />
        )}
      </div>

      {clickPosition && (
        <div className="selected-coordinates">
          <strong>Selected Location:</strong> X: {clickPosition.x}, Y: {clickPosition.y}
        </div>
      )}
    </div>
  )
}

export default MapSelector
