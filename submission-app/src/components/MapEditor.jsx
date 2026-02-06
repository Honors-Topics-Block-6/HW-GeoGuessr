import { useState, useEffect, useCallback } from 'react'
import { collection, query, orderBy, onSnapshot, doc, addDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import PolygonDrawer from './PolygonDrawer'
import RegionPanel from './RegionPanel'
import './MapEditor.css'

function MapEditor() {
  const [regions, setRegions] = useState([])
  const [selectedRegionId, setSelectedRegionId] = useState(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [newPolygonPoints, setNewPolygonPoints] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Fetch regions from Firestore
  useEffect(() => {
    const q = query(collection(db, 'regions'), orderBy('createdAt', 'desc'))

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const regs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      setRegions(regs)
      setLoading(false)
    }, (err) => {
      console.error('Error fetching regions:', err)
      setError('Failed to load regions')
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const handleStartDrawing = useCallback(() => {
    setIsDrawing(true)
    setNewPolygonPoints([])
    setSelectedRegionId(null)
  }, [])

  const handleCancelDrawing = useCallback(() => {
    setIsDrawing(false)
    setNewPolygonPoints([])
  }, [])

  const handlePointAdd = useCallback((point) => {
    setNewPolygonPoints(prev => [...prev, point])
  }, [])

  const handlePolygonComplete = useCallback(async () => {
    if (newPolygonPoints.length < 3) return

    try {
      const newRegion = {
        name: `Region ${regions.length + 1}`,
        polygon: newPolygonPoints,
        floors: [1],
        color: getRandomColor(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }

      const docRef = await addDoc(collection(db, 'regions'), newRegion)
      setSelectedRegionId(docRef.id)
      setIsDrawing(false)
      setNewPolygonPoints([])
    } catch (err) {
      console.error('Error saving region:', err)
      setError('Failed to save region')
    }
  }, [newPolygonPoints, regions.length])

  const handleRegionSelect = useCallback((id) => {
    if (!isDrawing) {
      setSelectedRegionId(id)
    }
  }, [isDrawing])

  const handleRegionUpdate = useCallback(async (id, updates) => {
    try {
      await updateDoc(doc(db, 'regions', id), {
        ...updates,
        updatedAt: serverTimestamp()
      })
    } catch (err) {
      console.error('Error updating region:', err)
      setError('Failed to update region')
    }
  }, [])

  const handleRegionDelete = useCallback(async (id) => {
    try {
      await deleteDoc(doc(db, 'regions', id))
      if (selectedRegionId === id) {
        setSelectedRegionId(null)
      }
    } catch (err) {
      console.error('Error deleting region:', err)
      setError('Failed to delete region')
    }
  }, [selectedRegionId])

  const handlePointMove = useCallback(async (regionId, pointIndex, newPosition) => {
    const region = regions.find(r => r.id === regionId)
    if (!region) return

    const updatedPolygon = [...region.polygon]
    updatedPolygon[pointIndex] = newPosition

    try {
      await updateDoc(doc(db, 'regions', regionId), {
        polygon: updatedPolygon,
        updatedAt: serverTimestamp()
      })
    } catch (err) {
      console.error('Error moving point:', err)
      setError('Failed to update region')
    }
  }, [regions])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isDrawing) {
        handleCancelDrawing()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isDrawing, handleCancelDrawing])

  if (loading) {
    return (
      <div className="map-editor">
        <div className="map-editor-loading">Loading regions...</div>
      </div>
    )
  }

  return (
    <div className="map-editor">
      {error && (
        <div className="map-editor-error">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="map-editor-canvas">
        <PolygonDrawer
          regions={regions}
          selectedRegionId={selectedRegionId}
          isDrawing={isDrawing}
          newPolygonPoints={newPolygonPoints}
          onRegionSelect={handleRegionSelect}
          onPointAdd={handlePointAdd}
          onPolygonComplete={handlePolygonComplete}
          onPointMove={handlePointMove}
        />
      </div>

      <div className="map-editor-panel">
        <RegionPanel
          regions={regions}
          selectedRegionId={selectedRegionId}
          onRegionSelect={handleRegionSelect}
          onRegionUpdate={handleRegionUpdate}
          onRegionDelete={handleRegionDelete}
          onStartDrawing={handleStartDrawing}
          onCancelDrawing={handleCancelDrawing}
          isDrawing={isDrawing}
          newPolygonPoints={newPolygonPoints}
        />
      </div>
    </div>
  )
}

// Helper function to generate random colors
function getRandomColor() {
  const colors = [
    '#4a90d9', '#e74c3c', '#27ae60', '#9b59b6',
    '#f39c12', '#1abc9c', '#e67e22', '#3498db'
  ]
  return colors[Math.floor(Math.random() * colors.length)]
}

export default MapEditor
