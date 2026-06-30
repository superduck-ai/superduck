export async function addClickMarkerToScreenshot(
  base64Screenshot: string,
  clickPosition: { x: number; y: number },
  viewportDimensions: { width: number; height: number }
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scaleX = img.width / viewportDimensions.width;
        const scaleY = img.height / viewportDimensions.height;
        const scaledX = clickPosition.x * scaleX;
        const scaledY = clickPosition.y * scaleY;

        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0);

        const radius = Math.max(40, Math.min(120, 0.05 * Math.min(img.width, img.height)));
        ctx.beginPath();
        ctx.arc(scaledX, scaledY, radius, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(44, 132, 219, 0.3)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(44, 132, 219, 1)';
        ctx.lineWidth = 2;
        ctx.stroke();

        const markedBase64 = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
        resolve(markedBase64);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => {
      reject(new Error('Failed to load screenshot image'));
    };
    img.src = `data:image/jpeg;base64,${base64Screenshot}`;
  });
}
