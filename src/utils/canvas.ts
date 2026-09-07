/** Draws RGBA pixel `data` of the given size onto a new canvas and returns its 2D context. */
export function toContext2D(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  context.putImageData(
    new ImageData(data as Uint8ClampedArray<ArrayBuffer>, width, height),
    0,
    0,
  );
  return context;
}
