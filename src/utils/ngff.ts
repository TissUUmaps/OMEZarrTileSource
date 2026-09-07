import { type Channel, getMinMaxValues, renderChunks } from "ome-zarr.js";

import type { ZarrChunk } from "./zarr";

/** Supported OME-NGFF axis names. */
export type Axis = "t" | "c" | "z" | "y" | "x";

/** All supported OME-NGFF axis names. */
export const AXES: Axis[] = ["t", "c", "z", "y", "x"];

/** Whether `name` is a supported OME-NGFF axis name. */
export function isAxis(name: string): name is Axis {
  return AXES.includes(name as Axis);
}

/** Maximum number of channels rendered at once, as in ome-zarr.js. */
export const MAX_ACTIVE_CHANNELS = 3;

/**
 * The channels to render, i.e. the first {@link MAX_ACTIVE_CHANNELS} channels
 * not marked inactive, each with its index in `channels`.
 */
export function getActiveChannels(
  channels: Channel[],
): (Channel & { index: number })[] {
  return channels
    .map((channel, index) => ({ ...channel, index }))
    .filter((channel) => channel.active ?? true)
    .slice(0, MAX_ACTIVE_CHANNELS);
}

/** Parses an RGB hex color such as `"#ff8800"` or `"FF8800"`. */
export function hexToRgb(color: string): [number, number, number] {
  const rgb = parseInt(color.replace(/^#/, ""), 16);
  return [(rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff];
}

/**
 * Additively renders one 2D plane per channel to RGBA, applying the channel's
 * window (or the plane's min/max if the window has no start/end), color,
 * LUT or colormap, and inversion.
 */
export function renderPlanes(
  planes: ZarrChunk[],
  channels: Channel[],
): Uint8ClampedArray {
  return renderChunks(
    planes,
    channels.map(({ window }, i): [number, number] =>
      window.start !== undefined && window.end !== undefined
        ? [window.start, window.end]
        : getMinMaxValues(planes[i]),
    ),
    channels.map(({ color }) => hexToRgb(color)),
    channels.map(({ lut, colorMap }) => lut ?? colorMap),
    channels.map(({ inverted }) => !!inverted),
    false,
  );
}
