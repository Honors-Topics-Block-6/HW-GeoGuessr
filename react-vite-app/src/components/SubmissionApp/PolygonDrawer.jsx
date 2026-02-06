import { useRef, useState, useCallback, useEffect } from 'react'
import './PolygonDrawer.css'

const CLOSE_THRESHOLD = 2 // Distance to first point to close polygon (in percentage units)

function PolygonDrawer({
  regions,
  selectedRegionId,
  isDrawing,
  newPolygonPoints,
  onRegionSelect,
  onPointAdd,
  onPolygonComplete,
  onPointMove
}) {
  const containerRef = useRef(null)
  const imageRef = useRef(null)
  const [draggingPoint, setDraggingPoint] = useState(null)
  const [hoverFirstPoint, setHoverFirstPoint] = useState(false)
  const [svgStyle, setSvgStyle] = useState({})

  // Update SVG position to match the image
  const updateSvgPosition = useCallback(() => {
    if (!imageRef.current || !containerRef.current) return

    const img = imageRef.current
    const container = containerRef.current
    const containerRect = container.getBoundingClientRect()
    const imgRect = img.getBoundingClientRect()

    // Calculate the offset of the image within the container
    const left = imgRect.left - containerRect.left
    const top = imgRect.top - containerRect.top

    setSvgStyle({
      left: `${left}px`,
      top: `${top}px`,
      width: `${imgRect.width}px`,
      height: `${imgRect.height}px`
    })
  }, [])

  // Update SVG position when image loads or window resizes
  useEffect(() => {
    const img = imageRef.current
    if (img) {
      if (img.complete) {
        updateSvgPosition()
      }
      img.addEventListener('load', updateSvgPosition)
    }

    window.addEventListener('resize', updateSvgPosition)

    return () => {
      if (img) {
        img.removeEventListener('load', updateSvgPosition)
      }
      window.removeEventListener('resize', updateSvgPosition)
    }
  }, [updateSvgPosition])

  // Convert screen coordinates to percentage coordinates (0-100) relative to the image
  const getPercentCoords = useCallback((e) => {
    if (!imageRef.current) return null

    const rect = imageRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100

    return {
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y))
    }
  }, [])

  // Handle click on the SVG canvas
  const handleSvgClick = useCallback((e) => {
    // Ignore if we're dragging or clicked on a control element
    if (draggingPoint || e.target.closest('.polygon-vertex')) return

    const coords = getPercentCoords(e)
    if (!coords) return

    if (isDrawing) {
      // Check if clicking near the first point to close polygon
      if (newPolygonPoints.length >= 3) {
        const first = newPolygonPoints[0]
        const distance = Math.sqrt(
          Math.pow(coords.x - first.x, 2) + Math.pow(coords.y - first.y, 2)
        )
        if (distance < CLOSE_THRESHOLD) {
          onPolygonComplete()
          return
        }
      }
      onPointAdd(coords)
    }
  }, [isDrawing, newPolygonPoints, draggingPoint, getPercentCoords, onPointAdd, onPolygonComplete])

  // Handle mouse move for hover effects and dragging
  const handleMouseMove = useCallback((e) => {
    const coords = getPercentCoords(e)
    if (!coords) return

    // Update hover state for first point
    if (isDrawing && newPolygonPoints.length >= 3) {
      const first = newPolygonPoints[0]
      const distance = Math.sqrt(
        Math.pow(coords.x - first.x, 2) + Math.pow(coords.y - first.y, 2)
      )
      setHoverFirstPoint(distance < CLOSE_THRESHOLD)
    } else {
      setHoverFirstPoint(false)
    }

    // Handle point dragging
    if (draggingPoint) {
      onPointMove(draggingPoint.regionId, draggingPoint.pointIndex, coords)
    }
  }, [isDrawing, newPolygonPoints, draggingPoint, getPercentCoords, onPointMove])

  // Start dragging a vertex
  const handleVertexMouseDown = useCallback((e, regionId, pointIndex) => {
    e.stopPropagation()
    setDraggingPoint({ regionId, pointIndex })
  }, [])

  // Stop dragging
  const handleMouseUp = useCallback(() => {
    setDraggingPoint(null)
  }, [])

  // Generate polygon points string
  const getPolygonPointsString = (points) => {
    return points.map(p => `${p.x},${p.y}`).join(' ')
  }

  return (
    <div
      ref={containerRef}
      className={`polygon-drawer-container ${isDrawing ? 'drawing-mode' : ''}`}
      onClick={handleSvgClick}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Map background image */}
      <img
        ref={imageRef}
        src="/map.png"
        alt="Map"
        className="polygon-drawer-image"
        draggable={false}
      />

      {/* SVG overlay for polygons - positioned exactly over the image */}
      <svg
        className="polygon-drawer-svg"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={svgStyle}
      >
        {/* Existing regions */}
        {regions.map(region => (
          <g key={region.id} className="region-group">
            {/* Polygon fill */}
            <polygon
              points={getPolygonPointsString(region.polygon)}
              fill={region.color || '#4a90d9'}
              fillOpacity={selectedRegionId === region.id ? 0.5 : 0.3}
              stroke={selectedRegionId === region.id ? '#2c3e50' : region.color || '#4a90d9'}
              strokeWidth={selectedRegionId === region.id ? 0.4 : 0.25}
              className="region-polygon"
              onClick={(e) => {
                e.stopPropagation()
                onRegionSelect(region.id)
              }}
            />

            {/* Vertex handles for selected region */}
            {selectedRegionId === region.id && region.polygon.map((point, i) => (
              <circle
                key={i}
                cx={point.x}
                cy={point.y}
                r={1}
                fill="white"
                stroke="#2c3e50"
                strokeWidth={0.25}
                className="polygon-vertex"
                style={{ cursor: 'move' }}
                onMouseDown={(e) => handleVertexMouseDown(e, region.id, i)}
              />
            ))}

            {/* Region label */}
            {region.polygon.length > 0 && (
              <text
                x={getCentroid(region.polygon).x}
                y={getCentroid(region.polygon).y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#2c3e50"
                fontSize="2"
                fontWeight="bold"
                className="region-label"
                pointerEvents="none"
              >
                {region.name}
              </text>
            )}
          </g>
        ))}

        {/* In-progress polygon while drawing */}
        {isDrawing && newPolygonPoints.length > 0 && (
          <g className="drawing-group">
            {/* Lines connecting points */}
            <polyline
              points={getPolygonPointsString(newPolygonPoints)}
              fill="none"
              stroke="#3498db"
              strokeWidth={0.25}
              strokeDasharray="1,0.5"
            />

            {/* Vertex circles */}
            {newPolygonPoints.map((point, i) => (
              <circle
                key={i}
                cx={point.x}
                cy={point.y}
                r={i === 0 ? (hoverFirstPoint ? 1.5 : 1.25) : 0.75}
                fill={i === 0 ? (hoverFirstPoint ? '#27ae60' : '#2ecc71') : '#3498db'}
                stroke="white"
                strokeWidth={0.25}
                className={`drawing-vertex ${i === 0 ? 'first-vertex' : ''}`}
              />
            ))}

            {/* Close hint text */}
            {newPolygonPoints.length >= 3 && (
              <text
                x={newPolygonPoints[0].x}
                y={newPolygonPoints[0].y - 2.5}
                textAnchor="middle"
                fill="#27ae60"
                fontSize="1.5"
                fontWeight="bold"
              >
                Click to close
              </text>
            )}
          </g>
        )}
      </svg>

      {/* Drawing mode hint overlay */}
      {isDrawing && newPolygonPoints.length === 0 && (
        <div className="polygon-drawer-hint">
          Click on the map to add points. Click first point to close.
        </div>
      )}

      {/* Instructions overlay */}
      {!isDrawing && regions.length === 0 && (
        <div className="polygon-drawer-empty">
          <p>No regions defined yet.</p>
          <p>Click "New Region" to start drawing.</p>
        </div>
      )}
    </div>
  )
}

// Calculate centroid of polygon for label placement
function getCentroid(points) {
  if (points.length === 0) return { x: 0, y: 0 }

  let sumX = 0
  let sumY = 0
  for (const point of points) {
    sumX += point.x
    sumY += point.y
  }
  return {
    x: sumX / points.length,
    y: sumY / points.length
  }
}

export default PolygonDrawer
