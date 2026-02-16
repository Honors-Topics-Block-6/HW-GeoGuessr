import { useRef, useState, useCallback, useEffect } from 'react'
import './PolygonDrawer.css'

const CLOSE_THRESHOLD = 2 // Distance to first point to close polygon (in percentage units)

// Drawing modes (must match MapEditor)
export const DRAW_MODE = {
  NONE: 'none',
  REGION: 'region',
  PLAYING_AREA: 'playing_area'
} as const

export type DrawModeType = typeof DRAW_MODE[keyof typeof DRAW_MODE]

export interface PolygonPoint {
  x: number
  y: number
}

export interface Region {
  id: string
  name: string
  polygon: PolygonPoint[]
  floors: number[]
  color?: string
  createdAt?: unknown
  updatedAt?: unknown
}

export interface PlayingArea {
  polygon?: PolygonPoint[]
  updatedAt?: unknown
}

export interface DraggingPointState {
  regionId: string
  pointIndex: number
}

export interface PolygonDrawerProps {
  regions: Region[]
  selectedRegionId: string | null
  isDrawing: boolean
  drawMode?: DrawModeType
  newPolygonPoints: PolygonPoint[]
  playingArea: PlayingArea | null
  onRegionSelect: (id: string) => void
  onPointAdd: (point: PolygonPoint) => void
  onPolygonComplete: () => void
  onPointMove: (regionId: string, pointIndex: number, newPosition: PolygonPoint) => void
}

function PolygonDrawer({
  regions,
  selectedRegionId,
  isDrawing,
  drawMode = DRAW_MODE.NONE,
  newPolygonPoints,
  playingArea,
  onRegionSelect,
  onPointAdd,
  onPolygonComplete,
  onPointMove
}: PolygonDrawerProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [draggingPoint, setDraggingPoint] = useState<DraggingPointState | null>(null)
  const [hoverFirstPoint, setHoverFirstPoint] = useState<boolean>(false)
  const [svgStyle, setSvgStyle] = useState<React.CSSProperties>({})

  // Update SVG position to match the image
  const updateSvgPosition = useCallback((): void => {
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
  const getPercentCoords = useCallback((e: MouseEvent | React.MouseEvent): PolygonPoint | null => {
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
  const handleSvgClick = useCallback((e: React.MouseEvent): void => {
    // Ignore if we're dragging or clicked on a control element
    if (draggingPoint || (e.target as HTMLElement).closest('.polygon-vertex')) return

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
  const handleMouseMove = useCallback((e: React.MouseEvent): void => {
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
  const handleVertexMouseDown = useCallback((e: React.MouseEvent, regionId: string, pointIndex: number): void => {
    e.stopPropagation()
    setDraggingPoint({ regionId, pointIndex })
  }, [])

  // Stop dragging
  const handleMouseUp = useCallback((): void => {
    setDraggingPoint(null)
  }, [])

  // Generate polygon points string
  const getPolygonPointsString = (points: PolygonPoint[]): string => {
    return points.map(p => `${p.x},${p.y}`).join(' ')
  }

  const isDrawingPlayingArea = drawMode === DRAW_MODE.PLAYING_AREA

  return (
    <div
      ref={containerRef}
      className={`polygon-drawer-container ${isDrawing ? 'drawing-mode' : ''} ${isDrawingPlayingArea ? 'drawing-playing-area' : ''}`}
      onClick={handleSvgClick}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Map background image */}
      <img
        ref={imageRef}
        src="/FINAL_MAP.png"
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
        {/* Playing area boundary (shown first, behind regions) */}
        {playingArea && playingArea.polygon && (
          <g className="playing-area-group">
            <polygon
              points={getPolygonPointsString(playingArea.polygon)}
              fill="#27ae60"
              fillOpacity="0.1"
              stroke="#27ae60"
              strokeWidth="0.5"
              strokeDasharray="2,1"
              className="playing-area-polygon"
            />
          </g>
        )}

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
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation()
                onRegionSelect(region.id)
              }}
            />

            {/* Vertex handles for selected region */}
            {selectedRegionId === region.id && region.polygon.map((point: PolygonPoint, i: number) => (
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
                onMouseDown={(e: React.MouseEvent) => handleVertexMouseDown(e, region.id, i)}
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
              stroke={isDrawingPlayingArea ? '#27ae60' : '#3498db'}
              strokeWidth={0.25}
              strokeDasharray="1,0.5"
            />

            {/* Vertex circles */}
            {newPolygonPoints.map((point: PolygonPoint, i: number) => (
              <circle
                key={i}
                cx={point.x}
                cy={point.y}
                r={i === 0 ? (hoverFirstPoint ? 1.5 : 1.25) : 0.75}
                fill={i === 0 ? (hoverFirstPoint ? '#27ae60' : '#2ecc71') : (isDrawingPlayingArea ? '#27ae60' : '#3498db')}
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
        <div className={`polygon-drawer-hint ${isDrawingPlayingArea ? 'playing-area' : ''}`}>
          {isDrawingPlayingArea
            ? 'Click on the map to draw the playing area boundary. Click first point to close.'
            : 'Click on the map to add points. Click first point to close.'}
        </div>
      )}

      {/* Instructions overlay */}
      {!isDrawing && regions.length === 0 && !playingArea && (
        <div className="polygon-drawer-empty">
          <p>No regions defined yet.</p>
          <p>Click "Draw Playing Area" or "New Region" to start.</p>
        </div>
      )}
    </div>
  )
}

// Calculate centroid of polygon for label placement
function getCentroid(points: PolygonPoint[]): PolygonPoint {
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
