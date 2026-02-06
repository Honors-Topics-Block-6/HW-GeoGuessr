import { useState, useEffect } from 'react'
import './RegionPanel.css'

// Floor range for toggle buttons
const FLOOR_OPTIONS = [-2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

// Preset colors for regions
const COLOR_PRESETS = [
  '#4a90d9', '#e74c3c', '#27ae60', '#9b59b6',
  '#f39c12', '#1abc9c', '#e67e22', '#34495e'
]

function RegionPanel({
  regions,
  selectedRegionId,
  onRegionSelect,
  onRegionUpdate,
  onRegionDelete,
  onStartDrawing,
  onCancelDrawing,
  isDrawing,
  newPolygonPoints
}) {
  const [editName, setEditName] = useState('')
  const [editFloors, setEditFloors] = useState([])
  const [editColor, setEditColor] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

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

  const formatFloors = (floors) => {
    if (!floors || floors.length === 0) return 'None'
    const sorted = [...floors].sort((a, b) => a - b)
    if (sorted.length === 1) return `Floor ${sorted[0]}`
    return `Floors ${sorted.join(', ')}`
  }

  return (
    <div className="region-panel">
      {/* Toolbar */}
      <div className="region-panel-toolbar">
        {isDrawing ? (
          <>
            <div className="drawing-status">
              <span className="drawing-indicator"></span>
              Drawing: {newPolygonPoints.length} points
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
            onClick={onStartDrawing}
          >
            + New Region
          </button>
        )}
      </div>

      {/* Region list */}
      <div className="region-list">
        <h3>Regions ({regions.length})</h3>
        {regions.length === 0 ? (
          <p className="no-regions">No regions yet. Create one to get started.</p>
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
                  <span className="region-item-name">{region.name}</span>
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
