export interface FeedbackPointerPoint {
  x: number;
  y: number;
}

export function getPointerPoint(event: PointerEvent): FeedbackPointerPoint {
  return {
    x: Math.round(event.clientX),
    y: Math.round(event.clientY),
  };
}
