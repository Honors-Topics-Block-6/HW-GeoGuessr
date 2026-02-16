import { useState, useRef } from 'react'
import './MapSelector.css'

export interface MapPosition {
  x: number
  y: number
}

export interface MapSelectorProps {
  onLocationSelect: (position: MapPosition) => void
  selectedLocation: MapPosition | null
}

function MapSelector({ onLocationSelect, selectedLocation }: MapSelectorProps): React.JSX.Element {
  const [clickPosition, setClickPosition] = useState<MapPosition | null>(selectedLocation || null)
  const imageRef = useRef<HTMLImageElement>(null)

  const handleMapClick = (e: React.MouseEvent<HTMLImageElement>): void => {
    if (!imageRef.current) return

    const rect = imageRef.current.getBoundingClientRect()
    const x = Math.round(e.clientX - rect.left)
    const y = Math.round(e.clientY - rect.top)

    // Ensure coordinates are within bounds
    const boundedX = Math.max(0, Math.min(x, imageRef.current.naturalWidth))
    const boundedY = Math.max(0, Math.min(y, imageRef.current.naturalHeight))

    const position: MapPosition = { x: boundedX, y: boundedY }
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
          src="/FINAL_MAP.png"
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
