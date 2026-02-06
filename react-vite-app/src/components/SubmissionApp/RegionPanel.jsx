import { useState, useEffect } from 'react'
import './RegionPanel.css'

// Floor range for toggle buttons
const FLOOR_OPTIONS = [1, 2, 3]

// Preset colors for regions
const COLOR_PRESETS = [
  '#4a90d9', '#e74c3c', '#27ae60', '#9b59b6',
  '#f39c12', '#1abc9c', '#e67e22', '#34495e'
]

// Drawing modes (must match MapEditor)
const DRAW_MODE = {
  NONE: 'none',
  REGION: 'region',
  PLAYING_AREA: 'playing_area'
}

function RegionPanel({
  regions,
  selectedRegionId,
  onRegionSelect,
  onRegionUpdate,
  onRegionDelete,
  onStartDrawing,
  onCancelDrawing,
  isDrawing,
  drawMode = DRAW_MODE.NONE,
  newPolygonPoints,
  playingArea,
  onStartDrawingPlayingArea,
  onDeletePlayingArea
}) {
  const [editName, setEditName] = useState('')
  const [editFloors, setEditFloors] = useState([])
  const [editColor, setEditColor] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showDeletePlayingAreaConfirm, setShowDeletePlayingAreaConfirm] = useState(false)

  const selectedRegion = regions.find(r => r.id === selectedRegionId)

  // Update edit state when selection changes
  useEffect(() => {
    if (selectedRegion) {
      setEditName(selectedRegion.name || '')
      setEditFloors(selectedRegion.floors || [1])
      setEditColor(selectedRegion.color || '#4a90d9')
      setShowDeleteConfirm(false)
    }
  }, [selectedRegion])

  const handleSave = () => {
    if (!selectedRegionId) return

    onRegionUpdate(selectedRegionId, {
      name: editName,
      floors: editFloors.sort((a, b) => a - b),
      color: editColor
    })
  }

  const handleFloorToggle = (floor) => {
    setEditFloors(prev => {
      if (prev.includes(floor)) {
        // Remove floor (but keep at least one)
        const newFloors = prev.filter(f => f !== floor)
        return newFloors.length > 0 ? newFloors : prev
      } else {
        // Add floor
        return [...prev, floor].sort((a, b) => a - b)
      }
    })
  }

  const handleDelete = () => {
    if (showDeleteConfirm) {
      onRegionDelete(selectedRegionId)
      setShowDeleteConfirm(false)
    } else {
      setShowDeleteConfirm(true)
    }
  }

  const handleDeletePlayingArea = () => {
    if (showDeletePlayingAreaConfirm) {
      onDeletePlayingArea()
      setShowDeletePlayingAreaConfirm(false)
    } else {
      setShowDeletePlayingAreaConfirm(true)
    }
  }

  const formatFloors = (floors) => {
    if (!floors || floors.length === 0) return 'None'
    const sorted = [...floors].sort((a, b) => a - b)
    if (sorted.length === 1) return `Floor ${sorted[0]}`
    return `Floors ${sorted.join(', ')}`
  }

  return (
    <div className="region-panel">
      {/* Playing Area Section */}
      <div className="playing-area-section">
        <h3>Playing Area</h3>
        {isDrawing && drawMode === DRAW_MODE.PLAYING_AREA ? (
          <div className="drawing-active">
            <div className="drawing-status playing-area">
              <span className="drawing-indicator"></span>
              Drawing playing area: {newPolygonPoints.length} points
            </div>
            <button
              className="cancel-drawing-button"
              onClick={onCancelDrawing}
            >
              Cancel (Esc)
            </button>
          </div>
        ) : playingArea ? (
          <div className="playing-area-info">
            <div className="playing-area-status">
              <span className="playing-area-icon">&#9654;</span>
              <span>Playing area defined ({playingArea.polygon?.length || 0} points)</span>
            </div>
            <p className="playing-area-hint">
              Players can only place markers within this boundary.
            </p>
            <div className="playing-area-actions">
              <button
                className="redraw-button"
                onClick={onStartDrawingPlayingArea}
                disabled={isDrawing}
              >
                Redraw
              </button>
              <button
                className={`delete-button small ${showDeletePlayingAreaConfirm ? 'confirm' : ''}`}
                onClick={handleDeletePlayingArea}
                onBlur={() => setShowDeletePlayingAreaConfirm(false)}
                disabled={isDrawing}
              >
                {showDeletePlayingAreaConfirm ? 'Confirm' : 'Remove'}
              </button>
            </div>
          </div>
        ) : (
          <div className="no-playing-area">
            <p>No playing area defined. Players can click anywhere on the map.</p>
            <button
              className="draw-playing-area-button"
              onClick={onStartDrawingPlayingArea}
              disabled={isDrawing}
            >
              + Draw Playing Area
            </button>
          </div>
        )}
      </div>

      {/* Toolbar for regions */}
      <div className="region-panel-toolbar">
        {isDrawing && drawMode === DRAW_MODE.REGION ? (
          <>
            <div className="drawing-status">
              <span className="drawing-indicator"></span>
              Drawing region: {newPolygonPoints.length} points
            </div>
            <button
              className="cancel-drawing-button"
              onClick={onCancelDrawing}
            >
              Cancel (Esc)
            </button>
          </>
        ) : (
          <button
            className="new-region-button"
            onClick={() => onStartDrawing()}
            disabled={isDrawing}
          >
            + New Region
          </button>
        )}
      </div>

      {/* Region list */}
      <div className="region-list">
        <h3>Floor Regions ({regions.length})</h3>
        {regions.length === 0 ? (
          <p className="no-regions">No floor regions yet. Create one to enable floor selection in specific areas.</p>
        ) : (
          <ul>
            {regions.map(region => (
              <li
                key={region.id}
                className={`region-item ${selectedRegionId === region.id ? 'selected' : ''}`}
                onClick={() => onRegionSelect(region.id)}
              >
                <span
                  className="region-color-swatch"
                  style={{ backgroundColor: region.color || '#4a90d9' }}
                />
                <div className="region-item-info">
                  <span className="region-item-name">
                    {region.name}
                  </span>
                  <span className="region-item-floors">
                    {formatFloors(region.floors)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Region editor */}
      {selectedRegion && (
        <div className="region-editor">
          <h3>Edit Region</h3>

          <div className="form-group">
            <label htmlFor="region-name">Name</label>
            <input
              id="region-name"
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Region name"
            />
          </div>

          <div className="form-group">
            <label>Floors</label>
            <div className="floor-toggles">
              {FLOOR_OPTIONS.map(floor => (
                <button
                  key={floor}
                  className={`floor-toggle ${editFloors.includes(floor) ? 'active' : ''}`}
                  onClick={() => handleFloorToggle(floor)}
                  title={floor < 0 ? `Basement ${Math.abs(floor)}` : `Floor ${floor}`}
                >
                  {floor < 0 ? `B${Math.abs(floor)}` : floor}
                </button>
              ))}
            </div>
            <span className="floor-hint">
              Selected: {editFloors.sort((a, b) => a - b).join(', ') || 'None'}
            </span>
          </div>

          <div className="form-group">
            <label>Color</label>
            <div className="color-presets">
              {COLOR_PRESETS.map(color => (
                <button
                  key={color}
                  className={`color-preset ${editColor === color ? 'active' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setEditColor(color)}
                  title={color}
                />
              ))}
            </div>
          </div>

          <div className="editor-actions">
            <button className="save-button" onClick={handleSave}>
              Save Changes
            </button>
            <button
              className={`delete-button ${showDeleteConfirm ? 'confirm' : ''}`}
              onClick={handleDelete}
              onBlur={() => setShowDeleteConfirm(false)}
            >
              {showDeleteConfirm ? 'Click again to confirm' : 'Delete'}
            </button>
          </div>
        </div>
      )}

      {/* Instructions when nothing selected */}
      {!selectedRegion && !isDrawing && regions.length > 0 && (
        <div className="region-panel-hint">
          <p>Click on a region in the list or on the map to edit it.</p>
        </div>
      )}
    </div>
  )
}

export default RegionPanel
