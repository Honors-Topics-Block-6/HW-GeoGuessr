import './ImageViewer.css';

export interface ImageViewerProps {
  imageUrl: string;
  alt?: string;
  onImageLoad?: () => void;
}

function ImageViewer({ imageUrl, alt = "Mystery location", onImageLoad }: ImageViewerProps): React.ReactElement {
  return (
    <div className="image-viewer">
      <div className="image-container">
        <img
          src={imageUrl}
          alt={alt}
          className="mystery-image"
          loading="eager"
          decoding="async"
          onLoad={onImageLoad}
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
