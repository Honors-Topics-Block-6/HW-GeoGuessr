import { useEffect, useState } from 'react';
import './ImageViewer.css';

export interface ImageViewerProps {
  imageUrl: string;
  alt?: string;
  onImageLoad?: () => void;
}

function ImageViewer({ imageUrl, alt = "Mystery location", onImageLoad }: ImageViewerProps): React.ReactElement {
  const [isPortraitImage, setIsPortraitImage] = useState(false);

  useEffect(() => {
    setIsPortraitImage(false);
  }, [imageUrl]);

  const handleImageLoad = (event: React.SyntheticEvent<HTMLImageElement>): void => {
    const imageElement = event.currentTarget;
    setIsPortraitImage(imageElement.naturalHeight > imageElement.naturalWidth);
    onImageLoad?.();
  };

  return (
    <div className="image-viewer">
      <div className="image-container">
        <img
          src={imageUrl}
          alt={alt}
          className={`mystery-image ${isPortraitImage ? 'portrait-image' : ''}`}
          loading="eager"
          decoding="async"
          onLoad={handleImageLoad}
        />
      </div>
      <div className="image-hint">
        <span className="hint-icon">📍</span>
        <span>Where was this photo taken?</span>
      </div>
    </div>
  );
}

export default ImageViewer;
