import React, { useRef, useState, useEffect } from 'react';
import { useIntl } from 'react-intl';

interface ScreenshotPreviewProps {
  screenshot: string;
  coordinates: [number, number];
  viewportDimensions?: { width: number; height: number };
  className?: string;
  zoomLevel?: number;
}

export function ScreenshotPreview({
  screenshot,
  coordinates,
  viewportDimensions,
  className = '',
  zoomLevel = 2.5
}: ScreenshotPreviewProps) {
  const intl = useIntl();
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [transformOrigin, setTransformOrigin] = useState({ x: 50, y: 50 });

  // Calculate transform origin based on click coordinates
  useEffect(() => {
    const calculateOrigin = () => {
      if (imgRef.current && containerRef.current) {
        const img = imgRef.current;
        const container = containerRef.current;

        const viewportWidth = viewportDimensions?.width || img.naturalWidth;
        const viewportHeight = viewportDimensions?.height || img.naturalHeight;

        const scaleX = img.naturalWidth / viewportWidth;
        const scaleY = img.naturalHeight / viewportHeight;

        const clickX = coordinates[0] * scaleX;
        const clickY = coordinates[1] * scaleY;

        const containerWidth = container.offsetWidth;
        const containerHeight = container.offsetHeight;

        const widthRatio = containerWidth / img.naturalWidth;
        const heightRatio = containerHeight / img.naturalHeight;
        const fitScale = Math.min(widthRatio, heightRatio);

        const displayWidth = img.naturalWidth * fitScale;
        const displayHeight = img.naturalHeight * fitScale;

        const offsetX = (containerWidth - displayWidth) / 2;
        const offsetY = (containerHeight - displayHeight) / 2;

        const displayClickX = clickX * fitScale + offsetX;
        const displayClickY = clickY * fitScale + offsetY;

        // Calculate bounds for zoom
        const minX = (offsetX * zoomLevel) / (zoomLevel - 1);
        const maxX = ((offsetX + displayWidth) * zoomLevel - containerWidth) / (zoomLevel - 1);
        const minY = (offsetY * zoomLevel) / (zoomLevel - 1);
        const maxY = ((offsetY + displayHeight) * zoomLevel - containerHeight) / (zoomLevel - 1);

        const zoomedMinX = (displayClickX * zoomLevel - containerWidth) / (zoomLevel - 1);
        const zoomedMaxX = (displayClickX * zoomLevel) / (zoomLevel - 1);
        const zoomedMinY = (displayClickY * zoomLevel - containerHeight) / (zoomLevel - 1);
        const zoomedMaxY = (displayClickY * zoomLevel) / (zoomLevel - 1);

        const boundedMinX = Math.max(minX, zoomedMinX);
        const boundedMaxX = Math.min(maxX, zoomedMaxX);
        const boundedMinY = Math.max(minY, zoomedMinY);
        const boundedMaxY = Math.min(maxY, zoomedMaxY);

        let finalX = displayClickX;
        let finalY = displayClickY;

        if (boundedMinX <= boundedMaxX) {
          finalX = Math.max(boundedMinX, Math.min(boundedMaxX, displayClickX));
        }

        if (boundedMinY <= boundedMaxY) {
          finalY = Math.max(boundedMinY, Math.min(boundedMaxY, displayClickY));
        }

        setTransformOrigin({
          x: (finalX / containerWidth) * 100,
          y: (finalY / containerHeight) * 100
        });
      }
    };

    const img = imgRef.current;
    if (img) {
      if (!img.complete) {
        img.addEventListener('load', calculateOrigin);
        return () => img.removeEventListener('load', calculateOrigin);
      }
      calculateOrigin();
    }

    window.addEventListener('resize', calculateOrigin);
    return () => window.removeEventListener('resize', calculateOrigin);
  }, [screenshot, coordinates, viewportDimensions, zoomLevel]);

  // Animate zoom
  useEffect(() => {
    setScale(1);
    const timeout = setTimeout(() => {
      setScale(zoomLevel);
    }, 300);
    return () => clearTimeout(timeout);
  }, [screenshot, zoomLevel]);

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${className}`}>
      <div
        ref={wrapperRef}
        className="w-full h-full"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: `${transformOrigin.x}% ${transformOrigin.y}%`,
          transition: 'transform 0.6s ease-out'
        }}
      >
        <img
          ref={imgRef}
          src={screenshot}
          alt={intl.formatMessage({
            defaultMessage: 'Screenshot with click location',
            id: 'screenshot_with_click_location'
          })}
          className="w-full h-full"
          style={{ objectFit: 'contain' }}
        />
      </div>
    </div>
  );
}
