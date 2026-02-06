import { useRef, useState, useCallback } from 'react'
import './PolygonDrawer.css'

const VIEWBOX_WIDTH = 800
const VIEWBOX_HEIGHT = 600
const CLOSE_THRESHOLD = 15 // Distance to first point to close polygon

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
  const svgRef = useRef(null)
  const [draggingPoint, setDraggingPoint] = useState(null)
  const [hoverFirstPoint, setHoverFirstPoint] = useState(false)

  // Convert screen coordinates to SVG viewBox coordinates
  const getViewBoxCoords = useCallback((e) => {
    if (!svgRef.current) return null

    const rect = svgRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) * (VIEWBOX_WIDTH / rect.width)
    const y = (e.clientY - rect.top) * (VIEWBOX_HEIGHT / rect.height)

    return {
      x: Math.round(Math.max(0, Math.min(VIEWBOX_WIDTH, x))),
      y: Math.round(Math.max(0, Math.min(VIEWBOX_HEIGHT, y)))
    }
  }, [])

  // Handle click on the SVG canvas
  const handleSvgClick = useCallback((e) => {
    // Ignore if we're dragging or clicked on a control element
    if (draggingPoint || e.target.closest('.polygon-vertex')) return

    const coords = getViewBoxCoords(e)
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
  }, [isDrawing, newPolygonPoints, draggingPoint, getViewBoxCoords, onPointAdd, onPolygonComplete])

  // Handle mouse move for hover effects and dragging
  const handleMouseMove = useCallback((e) => {
    const coords = getViewBoxCoords(e)
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
  }, [isDrawing, newPolygonPoints, draggingPoint, getViewBoxCoords, onPointMove])

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
    <div className="polygon-drawer-container">
      <svg
        ref={svgRef}
        className={`polygon-drawer-svg ${isDrawing ? 'drawing-mode' : ''}`}
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        onClick={handleSvgClick}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Map background */}
        <image
          href="/template-map.png"
          width={VIEWBOX_WIDTH}
          height={VIEWBOX_HEIGHT}
          preserveAspectRatio="xMidYMid slice"
        />

        {/* Fallback if no map image - grid pattern */}
        <defs>
          <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#e0e0e0" strokeWidth="0.5" />
          </pattern>
        </defs>

        {/* Existing regions */}
        {regions.map(region => (
          <g key={region.id} className="region-group">
            {/* Polygon fill */}
            <polygon
              points={getPolygonPointsString(region.polygon)}
              fill={region.color || '#4a90d9'}
              fillOpacity={selectedRegionId === region.id ? 0.5 : 0.3}
              stroke={selectedRegionId === region.id ? '#2c3e50' : region.color || '#4a90d9'}
              strokeWidth={selectedRegionId === region.id ? 3 : 2}
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
                r={8}
                fill="white"
                stroke="#2c3e50"
                strokeWidth={2}
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
                fontSize="14"
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
              strokeWidth={2}
              strokeDasharray="8,4"
            />

            {/* Preview line to cursor would go here if we tracked cursor position */}

            {/* Vertex circles */}
            {newPolygonPoints.map((point, i) => (
              <circle
                key={i}
                cx={point.x}
                cy={point.y}
                r={i === 0 ? (hoverFirstPoint ? 12 : 10) : 6}
                fill={i === 0 ? (hoverFirstPoint ? '#27ae60' : '#2ecc71') : '#3498db'}
                stroke="white"
                strokeWidth={2}
                className={`drawing-vertex ${i === 0 ? 'first-vertex' : ''}`}
              />
            ))}

            {/* Close hint text */}
            {newPolygonPoints.length >= 3 && (
              <text
                x={newPolygonPoints[0].x}
                y={newPolygonPoints[0].y - 20}
                textAnchor="middle"
                fill="#27ae60"
                fontSize="12"
                fontWeight="bold"
              >
                Click to close
              </text>
            )}
          </g>
        )}

        {/* Drawing mode hint */}
        {isDrawing && newPolygonPoints.length === 0 && (
          <text
            x={VIEWBOX_WIDTH / 2}
            y={30}
            textAnchor="middle"
            fill="#3498db"
            fontSize="16"
            fontWeight="bold"
          >
            Click on the map to add points. Click first point to close.
          </text>
        )}
      </svg>

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
