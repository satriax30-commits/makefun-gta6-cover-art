// Neon Coast Cover Studio — the state model: layouts, colour grades, export sizes, sample
// photos, and the undo/redo history. Nothing here touches the network or the wall clock;
// every value is plain data, so a saved state always redraws the same cover.

/** The four sample photos shipped under app/samples/. `focus` is where the subject's
 * face sits (fractions of the photo), so a wide panel crops to the face, not the middle. */
export const SAMPLES = [
  { id: 'boulevard', label: 'Boulevard', src: 'samples/boulevard.jpg', focus: { x: 0.55, y: 0.28 } },
  { id: 'pier', label: 'Pier', src: 'samples/pier.jpg', focus: { x: 0.45, y: 0.30 } },
  { id: 'neon', label: 'Neon Street', src: 'samples/neon.jpg', focus: { x: 0.55, y: 0.50 } },
  { id: 'rooftop', label: 'Rooftop', src: 'samples/rooftop.jpg', focus: { x: 0.45, y: 0.35 } },
];

/** Multi-panel layouts. Each panel is [x, y, w, h] in fractions of the cover. */
export const LAYOUTS = {
  hero: {
    name: 'Hero + Three',
    hint: 'One big hero panel, three small ones',
    panels: [
      [0, 0, 0.62, 1],
      [0.62, 0, 0.38, 1 / 3],
      [0.62, 1 / 3, 0.38, 1 / 3],
      [0.62, 2 / 3, 0.38, 1 / 3],
    ],
  },
  grid4: {
    name: 'Four Grid',
    hint: 'Two by two comic panels',
    panels: [
      [0, 0, 0.5, 0.5],
      [0.5, 0, 0.5, 0.5],
      [0, 0.5, 0.5, 0.5],
      [0.5, 0.5, 0.5, 0.5],
    ],
  },
  grid9: {
    name: 'Nine Grid',
    hint: 'Three by three poster grid',
    panels: [
      [0, 0, 1 / 3, 1 / 3], [1 / 3, 0, 1 / 3, 1 / 3], [2 / 3, 0, 1 / 3, 1 / 3],
      [0, 1 / 3, 1 / 3, 1 / 3], [1 / 3, 1 / 3, 1 / 3, 1 / 3], [2 / 3, 1 / 3, 1 / 3, 1 / 3],
      [0, 2 / 3, 1 / 3, 1 / 3], [1 / 3, 2 / 3, 1 / 3, 1 / 3], [2 / 3, 2 / 3, 1 / 3, 1 / 3],
    ],
  },
  strips: {
    name: 'Triple Strip',
    hint: 'Three tall vertical strips',
    panels: [
      [0, 0, 1 / 3, 1],
      [1 / 3, 0, 1 / 3, 1],
      [2 / 3, 0, 1 / 3, 1],
    ],
  },
  full: {
    name: 'Full Bleed',
    hint: 'One photo, edge to edge',
    panels: [[0, 0, 1, 1]],
  },
};

/** Colour grades: a canvas filter for the photo plus a tint gradient laid over it. */
export const GRADES = {
  sunset: {
    name: 'Sunset',
    swatch: '#ff7a4d',
    filter: 'saturate(1.3) contrast(1.07)',
    top: 'rgba(255, 190, 90, 0.10)',
    bottom: 'rgba(214, 48, 130, 0.42)',
  },
  neon: {
    name: 'Neon Nights',
    swatch: '#ff2e88',
    filter: 'saturate(1.45) contrast(1.12)',
    top: 'rgba(34, 211, 238, 0.14)',
    bottom: 'rgba(255, 46, 136, 0.40)',
  },
  gold: {
    name: 'Vice Gold',
    swatch: '#ffc53d',
    filter: 'saturate(1.2) contrast(1.05) sepia(0.25)',
    top: 'rgba(255, 214, 90, 0.16)',
    bottom: 'rgba(160, 82, 12, 0.38)',
  },
  teal: {
    name: 'Teal Dusk',
    swatch: '#2dd4bf',
    filter: 'saturate(1.15) contrast(1.08)',
    top: 'rgba(45, 212, 191, 0.14)',
    bottom: 'rgba(10, 40, 90, 0.46)',
  },
  noir: {
    name: 'Mono Noir',
    swatch: '#9ca3af',
    filter: 'grayscale(1) contrast(1.18) brightness(1.04)',
    top: 'rgba(255, 255, 255, 0.06)',
    bottom: 'rgba(0, 0, 0, 0.42)',
  },
};

/** The three post sizes the app exports. */
export const SIZES = {
  square: { name: 'Square', w: 1080, h: 1080, label: '1080 x 1080' },
  portrait: { name: 'Story', w: 1080, h: 1350, label: '1080 x 1350' },
  wide: { name: 'Wide', w: 1920, h: 1080, label: '1920 x 1080' },
};

/** One panel's photo: `key` names a sample ('sample:<id>') or an upload ('upload:<id>'). */
export function defaultPanel(i) {
  return { key: `sample:${SAMPLES[i % SAMPLES.length].id}`, zoom: 1, ox: 0, oy: 0 };
}

/** The fresh cover state: a hero layout with all four samples already in place. */
export function defaultState() {
  return {
    layout: 'hero',
    grade: 'sunset',
    size: 'square',
    title: 'NEON COAST',
    subtitle: 'Sunset run',
    stars: 5,
    panels: [0, 1, 2, 3].map((i) => defaultPanel(i)),
  };
}

/** Resize the panel list for a new layout, keeping each panel's photo and crop. */
export function panelsForLayout(state, layoutKey) {
  const count = LAYOUTS[layoutKey].panels.length;
  const panels = state.panels.slice(0, count);
  while (panels.length < count) panels.push(defaultPanel(panels.length));
  return panels;
}

/** A plain-data snapshot of the state, for undo/redo and for the shot scenes. */
export function snapshotState(state) {
  return JSON.parse(JSON.stringify(state));
}

/** A bounded undo/redo history over plain-data snapshots. */
export class CoverHistory {
  constructor() {
    this.past = [];
    this.future = [];
  }

  /** Record the state before a committed change. */
  push(state) {
    this.past.push(snapshotState(state));
    if (this.past.length > 60) this.past.shift();
    this.future = [];
  }

  undo(state) {
    if (!this.past.length) return null;
    this.future.push(snapshotState(state));
    return this.past.pop();
  }

  redo(state) {
    if (!this.future.length) return null;
    this.past.push(snapshotState(state));
    return this.future.pop();
  }

  canUndo() { return this.past.length > 0; }
  canRedo() { return this.future.length > 0; }
}
