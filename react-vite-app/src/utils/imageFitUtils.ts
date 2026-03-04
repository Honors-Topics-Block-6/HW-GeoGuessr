/**
 * Utilities for mapping image-space coordinates to container-space
 * when using object-fit: contain (full image visible, letterboxing).
 */

export interface ImageFit {
  offsetXPct: number;
  offsetYPct: number;
  scaleX: number;
  scaleY: number;
}

export interface MapPoint {
  x: number;
  y: number;
}

/**
 * Compute the rendered bounds of an image with object-fit: contain.
 * Returns offset and scale so image-space percentages (0-100) can be
 * mapped to container-space percentages.
 */
export function computeContainFit(img: HTMLImageElement): ImageFit {
  const { naturalWidth, naturalHeight, clientWidth, clientHeight } = img;
  if (!naturalWidth || !naturalHeight || !clientWidth || !clientHeight) {
    return { offsetXPct: 0, offsetYPct: 0, scaleX: 1, scaleY: 1 };
  }

  const containerAR = clientWidth / clientHeight;
  const imageAR = naturalWidth / naturalHeight;

  let renderedW: number;
  let renderedH: number;

  if (imageAR > containerAR) {
    renderedW = clientWidth;
    renderedH = clientWidth / imageAR;
  } else {
    renderedH = clientHeight;
    renderedW = clientHeight * imageAR;
  }

  const offsetX = (clientWidth - renderedW) / 2;
  const offsetY = (clientHeight - renderedH) / 2;

  return {
    offsetXPct: (offsetX / clientWidth) * 100,
    offsetYPct: (offsetY / clientHeight) * 100,
    scaleX: renderedW / clientWidth,
    scaleY: renderedH / clientHeight,
  };
}

/** Map a point from image-percentage space to container-percentage space. */
export function toContainerPct(point: MapPoint, fit: ImageFit): MapPoint {
  return {
    x: fit.offsetXPct + (point.x / 100) * fit.scaleX * 100,
    y: fit.offsetYPct + (point.y / 100) * fit.scaleY * 100,
  };
}
