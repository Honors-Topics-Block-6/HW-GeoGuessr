import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Cropper, { type Area } from 'react-easy-crop';
import { cropImageToBlob } from '../../utils/cropImage';
import './ImageCropModal.css';

export interface ImageCropModalProps {
  imageSrc: string;
  filename?: string;
  onCancel: () => void;
  onConfirm: (file: File) => Promise<void> | void;
}

function ImageCropModal({ imageSrc, filename = 'profile.jpg', onCancel, onConfirm }: ImageCropModalProps): React.ReactElement {
  const [crop, setCrop] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const safeFilename = useMemo(() => {
    const trimmed = filename.trim();
    if (!trimmed) return 'profile.jpg';
    return trimmed.toLowerCase().endsWith('.jpg') || trimmed.toLowerCase().endsWith('.jpeg') ? trimmed : `${trimmed}.jpg`;
  }, [filename]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !isSaving) onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSaving, onCancel]);

  const handleCropComplete = (_croppedArea: Area, croppedAreaPixels: Area): void => {
    setCroppedAreaPixels(croppedAreaPixels);
  };

  const handleSave = async (): Promise<void> => {
    if (!croppedAreaPixels) return;
    setError('');
    setIsSaving(true);

    try {
      const blob = await cropImageToBlob(imageSrc, croppedAreaPixels, {
        size: 512,
        type: 'image/jpeg',
        quality: 0.9
      });
      const file = new File([blob], safeFilename, { type: blob.type });
      await onConfirm(file);
    } catch (err) {
      setError((err as Error).message || 'Failed to crop image.');
      setIsSaving(false);
      return;
    }
  };

  return createPortal(
    <div className="image-crop-overlay" onClick={() => !isSaving && onCancel()}>
      <div className="image-crop-content" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <button className="image-crop-close" onClick={onCancel} disabled={isSaving} aria-label="Close">
          &times;
        </button>

        <h3 className="image-crop-title">Crop your profile picture</h3>

        {error && <div className="image-crop-error">{error}</div>}

        <div className="image-crop-cropper">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={handleCropComplete}
            zoomWithScroll={false}
          />
        </div>

        <div className="image-crop-controls">
          <label className="image-crop-zoom-row">
            <span className="image-crop-zoom-label">Zoom</span>
            <input
              className="image-crop-zoom"
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              disabled={isSaving}
            />
          </label>
        </div>

        <div className="image-crop-actions">
          <button className="image-crop-cancel" type="button" onClick={onCancel} disabled={isSaving}>
            Cancel
          </button>
          <button
            className="image-crop-save"
            type="button"
            onClick={handleSave}
            disabled={isSaving || !croppedAreaPixels}
          >
            {isSaving ? 'Saving...' : 'Use this crop'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ImageCropModal;
