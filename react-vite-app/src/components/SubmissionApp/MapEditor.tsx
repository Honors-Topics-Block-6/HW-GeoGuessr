import { useState, useEffect, useCallback } from 'react'
import { collection, query, orderBy, onSnapshot, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { getBuildingPolygons, setBuildingPolygons } from '../../services/buildingPolygonService'
import type { BuildingPolygonData } from '../../services/buildingPolygonService'
import PolygonDrawer from './PolygonDrawer'
import RegionPanel from './RegionPanel'
import type { Region, PolygonPoint, PlayingArea, DrawModeType, BuildingPolygonItem } from './PolygonDrawer'
import type { RegionUpdateData } from './RegionPanel'
import './MapEditor.css'

// Drawing modes
const DRAW_MODE = {
  NONE: 'none',
  REGION: 'region',
  PLAYING_AREA: 'playing_area',
  BUILDING_POLYGON: 'building'
} as const

export interface MapEditorProps {}

function MapEditor(_props: MapEditorProps): React.JSX.Element {
  const [regions, setRegions] = useState<Region[]>([])
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null)
  const [isDrawing, setIsDrawing] = useState<boolean>(false)
  const [drawMode, setDrawMode] = useState<DrawModeType>(DRAW_MODE.NONE)
  const [newPolygonPoints, setNewPolygonPoints] = useState<PolygonPoint[]>([])
  const [playingArea, setPlayingArea] = useState<PlayingArea | null>(null)
  const [buildingPolygons, setBuildingPolygonsState] = useState<BuildingPolygonItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch regions from Firestore
  useEffect(() => {
    const q = query(collection(db, 'regions'), orderBy('createdAt', 'desc'))

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const regs: Region[] = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      } as Region))
      setRegions(regs)
      setLoading(false)
    }, (err) => {
      console.error('Error fetching regions:', err)
      setError('Failed to load regions')
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  // Fetch playing area from Firestore
  useEffect(() => {
    const playingAreaRef = doc(db, 'settings', 'playingArea')

    const unsubscribe = onSnapshot(playingAreaRef, (docSnap) => {
      if (docSnap.exists()) {
        setPlayingArea(docSnap.data() as PlayingArea)
      } else {
        setPlayingArea(null)
      }
    }, (err) => {
      console.error('Error fetching playing area:', err)
    })

    return () => unsubscribe()
  }, [])

  // Fetch building polygons from Firestore
  useEffect(() => {
    const buildingPolygonsRef = doc(db, 'settings', 'buildingPolygons')
    const unsubscribe = onSnapshot(buildingPolygonsRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data()
        const polygons = data?.polygons
        setBuildingPolygonsState(Array.isArray(polygons) ? polygons : [])
      } else {
        setBuildingPolygonsState([])
      }
    }, (err) => {
      console.error('Error fetching building polygons:', err)
    })
    return () => unsubscribe()
  }, [])

  const handleStartDrawing = useCallback((mode: DrawModeType = DRAW_MODE.REGION): void => {
    setIsDrawing(true)
    setDrawMode(mode)
    setNewPolygonPoints([])
    setSelectedRegionId(null)
  }, [])

  const handleStartDrawingPlayingArea = useCallback((): void => {
    handleStartDrawing(DRAW_MODE.PLAYING_AREA)
  }, [handleStartDrawing])

  const handleCancelDrawing = useCallback((): void => {
    setIsDrawing(false)
    setDrawMode(DRAW_MODE.NONE)
    setNewPolygonPoints([])
  }, [])

  const handlePointAdd = useCallback((point: PolygonPoint): void => {
    setNewPolygonPoints(prev => [...prev, point])
  }, [])

  const handlePolygonComplete = useCallback(async (): Promise<void> => {
    if (newPolygonPoints.length < 3) return

    try {
      if (drawMode === DRAW_MODE.PLAYING_AREA) {
        // Save playing area to settings collection
        await setDoc(doc(db, 'settings', 'playingArea'), {
          polygon: newPolygonPoints,
          updatedAt: serverTimestamp()
        })
      } else if (drawMode === DRAW_MODE.BUILDING_POLYGON) {
        // Building polygon: prompt for name, add to list, save to Firestore
        const name = window.prompt('Building / location name for this polygon:')?.trim() || `Building ${buildingPolygons.length + 1}`
        const newItem: BuildingPolygonData = { name, polygon: newPolygonPoints }
        const updated = [...buildingPolygons, newItem]
        setBuildingPolygonsState(updated)
        await setBuildingPolygons(updated)
      } else {
        // Save regular region
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
      }

      setIsDrawing(false)
      setDrawMode(DRAW_MODE.NONE)
      setNewPolygonPoints([])
    } catch (err) {
      console.error('Error saving:', err)
      setError(drawMode === DRAW_MODE.PLAYING_AREA ? 'Failed to save playing area' : drawMode === DRAW_MODE.BUILDING_POLYGON ? 'Failed to save building polygon' : 'Failed to save region')
    }
  }, [newPolygonPoints, regions.length, drawMode, buildingPolygons])

  const handleRegionSelect = useCallback((id: string): void => {
    if (!isDrawing) {
      setSelectedRegionId(id)
    }
  }, [isDrawing])

  const handleRegionUpdate = useCallback(async (id: string, updates: RegionUpdateData): Promise<void> => {
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

  const handleRegionDelete = useCallback(async (id: string): Promise<void> => {
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

  const handleDeletePlayingArea = useCallback(async (): Promise<void> => {
    try {
      await deleteDoc(doc(db, 'settings', 'playingArea'))
    } catch (err) {
      console.error('Error deleting playing area:', err)
      setError('Failed to delete playing area')
    }
  }, [])

  const handleStartDrawingBuildingPolygon = useCallback((): void => {
    handleStartDrawing(DRAW_MODE.BUILDING_POLYGON as DrawModeType)
  }, [handleStartDrawing])

  const handleDeleteBuildingPolygon = useCallback(async (index: number): Promise<void> => {
    const updated = buildingPolygons.filter((_, i) => i !== index)
    setBuildingPolygonsState(updated)
    try {
      await setBuildingPolygons(updated)
    } catch (err) {
      console.error('Error deleting building polygon:', err)
      setError('Failed to delete building polygon')
    }
  }, [buildingPolygons])

  const handlePointMove = useCallback(async (regionId: string, pointIndex: number, newPosition: PolygonPoint): Promise<void> => {
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
    const handleKeyDown = (e: KeyboardEvent): void => {
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
          drawMode={drawMode}
          newPolygonPoints={newPolygonPoints}
          playingArea={playingArea}
          buildingPolygons={buildingPolygons}
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
          drawMode={drawMode}
          newPolygonPoints={newPolygonPoints}
          playingArea={playingArea}
          onStartDrawingPlayingArea={handleStartDrawingPlayingArea}
          onDeletePlayingArea={handleDeletePlayingArea}
          buildingPolygons={buildingPolygons}
          onStartDrawingBuildingPolygon={handleStartDrawingBuildingPolygon}
          onDeleteBuildingPolygon={handleDeleteBuildingPolygon}
        />
      </div>
    </div>
  )
}

// Helper function to generate random colors
function getRandomColor(): string {
  const colors: string[] = [
    '#4a90d9', '#e74c3c', '#27ae60', '#9b59b6',
    '#f39c12', '#1abc9c', '#e67e22', '#3498db'
  ]
  return colors[Math.floor(Math.random() * colors.length)]
}

export default MapEditor
