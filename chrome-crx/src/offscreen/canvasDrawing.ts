export interface ActionMetadata {
  type: string;
  coordinate?: [number, number];
  start_coordinate?: [number, number];
  description?: string;
}

export interface GifOptions {
  quality?: number;
  showClickIndicators?: boolean;
  showDragPaths?: boolean;
  showActionLabels?: boolean;
  showProgressBar?: boolean;
  showWatermark?: boolean;
}

function drawClickIndicator(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scaleFactor = 1
): void {
  ctx.save();

  ctx.beginPath();
  ctx.arc(x, y, 15 * scaleFactor, 0, 2 * Math.PI);
  ctx.fillStyle = 'rgba(207, 107, 60, 0.3)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, 11 * scaleFactor, 0, 2 * Math.PI);
  ctx.fillStyle = 'rgba(207, 107, 60, 0.5)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, 11 * scaleFactor, 0, 2 * Math.PI);
  ctx.strokeStyle = 'rgba(207, 107, 60, 1)';
  ctx.lineWidth = 2 * scaleFactor;
  ctx.stroke();

  ctx.restore();
}

function drawDragPath(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  scaleFactor = 1
): void {
  ctx.save();

  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 3 * scaleFactor;
  ctx.stroke();

  const angle = Math.atan2(endY - startY, endX - startX);
  const arrowLength = 15 * scaleFactor;

  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(
    endX - arrowLength * Math.cos(angle - Math.PI / 6),
    endY - arrowLength * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    endX - arrowLength * Math.cos(angle + Math.PI / 6),
    endY - arrowLength * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fillStyle = '#dc2626';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(startX, startY, 6 * scaleFactor, 0, 2 * Math.PI);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#cf6b3c';
  ctx.lineWidth = 2 * scaleFactor;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(endX, endY, 6 * scaleFactor, 0, 2 * Math.PI);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 2 * scaleFactor;
  ctx.stroke();

  ctx.restore();
}

function drawActionLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  scaleFactor = 1
): void {
  ctx.save();

  const fontSize = 14 * scaleFactor;
  ctx.font = `${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;
  const textHeight = 20 * scaleFactor;
  const padding = 8 * scaleFactor;

  let labelX = x + 20 * scaleFactor;
  let labelY = y - 10 * scaleFactor;

  if (labelX + textWidth + padding * 2 > ctx.canvas.width) {
    labelX = x - textWidth - padding * 2 - 20 * scaleFactor;
  }

  if (labelY < 0) {
    labelY = y + 20 * scaleFactor;
  }

  const bgX = labelX;
  const bgY = labelY;
  const bgWidth = textWidth + padding * 2;
  const bgHeight = textHeight + padding;
  const radius = 6 * scaleFactor;

  ctx.beginPath();
  ctx.moveTo(bgX + radius, bgY);
  ctx.lineTo(bgX + bgWidth - radius, bgY);
  ctx.quadraticCurveTo(bgX + bgWidth, bgY, bgX + bgWidth, bgY + radius);
  ctx.lineTo(bgX + bgWidth, bgY + bgHeight - radius);
  ctx.quadraticCurveTo(bgX + bgWidth, bgY + bgHeight, bgX + bgWidth - radius, bgY + bgHeight);
  ctx.lineTo(bgX + radius, bgY + bgHeight);
  ctx.quadraticCurveTo(bgX, bgY + bgHeight, bgX, bgY + bgHeight - radius);
  ctx.lineTo(bgX, bgY + radius);
  ctx.quadraticCurveTo(bgX, bgY, bgX + radius, bgY);
  ctx.closePath();

  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = 4 * scaleFactor;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2 * scaleFactor;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, bgX + padding, bgY + padding);

  ctx.restore();
}

export function drawProgressBar(
  ctx: CanvasRenderingContext2D,
  progress: number,
  scaleFactor = 1
): void {
  ctx.save();

  const barHeight = 4 * scaleFactor;
  const barWidth = ctx.canvas.width;
  const progressWidth = barWidth * progress;
  const y = ctx.canvas.height - barHeight;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(0, y, barWidth, barHeight);

  ctx.fillStyle = '#C96442';
  ctx.fillRect(0, y, progressWidth, barHeight);

  ctx.restore();
}

export function drawWatermark(ctx: CanvasRenderingContext2D, scaleFactor = 1): void {
  ctx.save();

  const padding = 8 * scaleFactor;
  const logoSize = 32 * scaleFactor;
  const x = ctx.canvas.width - padding - logoSize;
  const y = ctx.canvas.height - padding - logoSize - 4 * scaleFactor;

  const radius = logoSize * 0.234;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + logoSize - radius, y);
  ctx.quadraticCurveTo(x + logoSize, y, x + logoSize, y + radius);
  ctx.lineTo(x + logoSize, y + logoSize - radius);
  ctx.quadraticCurveTo(x + logoSize, y + logoSize, x + logoSize - radius, y + logoSize);
  ctx.lineTo(x + radius, y + logoSize);
  ctx.quadraticCurveTo(x, y + logoSize, x, y + logoSize - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();

  const gradient = ctx.createLinearGradient(x, y + logoSize, x, y);
  gradient.addColorStop(0, '#DC6038');
  gradient.addColorStop(1, '#D97757');
  ctx.fillStyle = gradient;
  ctx.fill();

  const logoPath = new Path2D(
    'M189.531 430.72L288.951 374.971L290.59 370.088L288.951 367.369H284.035L267.374 366.355L210.562 364.835L161.399 362.807L113.6 360.273L101.583 357.739L90.3843 342.788L91.4768 335.439L101.583 328.597L116.059 329.864L148.015 332.145L196.086 335.439L230.774 337.467L282.396 342.788H290.59L291.682 339.494L288.951 337.467L286.766 335.439L237.056 301.736L183.249 266.259L155.117 245.733L140.094 235.344L132.447 225.714L129.169 204.428L142.826 189.223L161.399 190.491L166.042 191.758L184.888 206.202L225.038 237.371L277.48 275.889L285.127 282.224L288.207 280.145L288.678 278.676L285.127 272.848L256.722 221.406L226.404 168.951L212.747 147.158L209.197 134.234C207.821 128.811 207.012 124.324 207.012 118.776L222.58 97.4901L231.32 94.7026L252.351 97.4901L261.092 105.092L274.202 134.994L295.233 181.875L328.009 245.733L337.569 264.739L342.758 282.224L344.67 287.545H347.948V284.505L350.679 248.521L355.595 204.428L360.512 147.665L362.15 131.7L370.071 112.441L385.913 102.051L398.204 107.88L408.31 122.324L406.944 131.7L400.935 170.725L389.19 231.796L381.543 272.848H385.913L391.102 267.526L411.86 240.158L446.548 196.572L461.843 179.341L479.87 160.335L491.342 151.212H513.192L529.034 175.033L521.932 199.613L499.536 227.995L480.963 252.068L454.332 287.747L437.808 316.434L439.29 318.8L443.271 318.461L503.359 305.537L535.862 299.709L574.647 293.12L592.127 301.229L594.039 309.592L587.211 326.57L545.695 336.706L497.077 346.589L424.68 363.632L423.878 364.277L424.824 365.68L457.473 368.636L471.403 369.396H505.545L569.184 374.211L585.845 385.107L595.678 398.538L594.039 408.927L568.365 421.851L533.95 413.742L453.376 394.483L425.79 387.641H421.966V389.922L444.909 412.475L487.245 450.486L539.959 499.647L542.69 511.811L535.862 521.44L528.761 520.427L482.328 485.456L464.302 469.745L423.878 435.535H421.147V439.083L430.433 452.767L479.87 527.015L482.328 549.822L478.778 557.171L465.94 561.732L452.011 559.198L422.786 518.399L393.014 472.786L368.979 431.734L366.076 433.567L351.771 586.312L345.216 594.168L329.921 599.996L317.084 590.367L310.255 574.656L317.084 543.487L325.278 502.941L331.833 470.759L337.842 430.72L341.511 417.345L341.187 416.45L338.255 416.943L308.07 458.342L262.184 520.427L225.858 559.198L217.117 562.746L202.095 554.89L203.461 540.953L211.928 528.536L262.184 464.677L292.502 424.892L312.042 402.055L311.851 398.751L310.773 398.659L177.24 485.71L153.478 488.751L143.099 479.121L144.464 463.41L149.381 458.342L189.531 430.72Z'
  );

  const scale = logoSize / 691;
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.fillStyle = 'rgba(250, 249, 245, 0.9)';
  ctx.fill(logoPath);

  ctx.restore();
}

export function applyActionIndicators(
  canvas: HTMLCanvasElement,
  action: ActionMetadata,
  options: Required<Omit<GifOptions, 'quality'>>,
  scaleFactor = 1
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx || !action) return;

  if (
    options.showClickIndicators &&
    action.coordinate &&
    (action.type.includes('click') || action.type === 'scroll')
  ) {
    const [x, y] = action.coordinate;
    const scaledX = x * scaleFactor;
    const scaledY = y * scaleFactor;
    drawClickIndicator(ctx, scaledX, scaledY, scaleFactor);

    if (options.showActionLabels && action.description) {
      drawActionLabel(ctx, action.description, scaledX, scaledY, scaleFactor);
    }
  }

  if (
    options.showDragPaths &&
    action.type === 'left_click_drag' &&
    action.start_coordinate &&
    action.coordinate
  ) {
    const [startX, startY] = action.start_coordinate;
    const [endX, endY] = action.coordinate;
    const scaledStartX = startX * scaleFactor;
    const scaledStartY = startY * scaleFactor;
    const scaledEndX = endX * scaleFactor;
    const scaledEndY = endY * scaleFactor;
    drawDragPath(ctx, scaledStartX, scaledStartY, scaledEndX, scaledEndY, scaleFactor);

    if (options.showActionLabels && action.description) {
      drawActionLabel(ctx, action.description, scaledEndX, scaledEndY, scaleFactor);
    }
  }

  if (
    options.showActionLabels &&
    action.description &&
    !action.coordinate &&
    (action.type === 'type' || action.type === 'key' || action.type === 'wait')
  ) {
    drawActionLabel(ctx, action.description, 20 * scaleFactor, 20 * scaleFactor, scaleFactor);
  }
}
