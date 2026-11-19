// Fixed scenes for screenshots: ?shot=editor shows the page with sample photos loaded,
// ?shot=editor9 the nine-panel neon editor, and ?shot=cover the exported cover alone,
// drawn by the app's own cover engine at the export size. Query parameters override the
// scene (layout, grade, size, title, subtitle, stars, photo, photos). window.__shotReady
// is set once the scene is painted, so a screenshot can wait for it.

import { panelsForLayout } from './state.js';

/** The editor scenes, by shot name. */
const SCENES = {
  editor: {
    layout: 'hero', grade: 'sunset', size: 'square',
    title: 'NEON COAST', subtitle: 'Sunset run', stars: 5,
    photos: ['boulevard', 'pier', 'neon', 'rooftop'],
  },
  editor9: {
    layout: 'grid9', grade: 'neon', size: 'wide',
    title: 'NIGHT SHIFT', subtitle: 'Neon nights', stars: 4,
    photos: ['neon', 'boulevard', 'rooftop', 'pier', 'neon', 'boulevard', 'rooftop', 'pier', 'neon'],
  },
};

/** Applies a scene (with query overrides) and paints it. */
export async function runShot(shot, query, api) {
  const { state, photos, loadSample, ensurePhotos, redraw, drawCover, fontsReady, canvas } = api;
  const isCover = shot === 'cover';
  const scene = SCENES[shot] ?? SCENES.editor;
  const layout = query.get('layout') ?? scene.layout;
  const grade = query.get('grade') ?? scene.grade;
  const size = query.get('size') ?? scene.size;
  const title = query.get('title') ?? scene.title;
  const subtitle = query.get('subtitle') ?? scene.subtitle;
  const stars = Number(query.get('stars') ?? scene.stars);
  const list = query.get('photos')
    ? query.get('photos').split(',').map((s) => s.trim()).filter(Boolean)
    : (query.get('photo') ? [query.get('photo')] : scene.photos);

  api.setState({ layout, grade, size, title, subtitle, stars });
  state.panels = panelsForLayout(state, layout);
  state.panels.forEach((panel, i) => {
    const id = list[i % list.length];
    panel.key = `sample:${id}`;
    panel.zoom = 1; panel.ox = 0; panel.oy = 0;
  });
  await ensurePhotos();
  await fontsReady();
  redraw();

  if (isCover) {
    // The cover alone, drawn at its export size and fitted to the window.
    document.body.classList.add('shot-cover');
    const w = canvas.width;
    const h = canvas.height;
    const scale = Math.min(window.innerWidth / w, window.innerHeight / h);
    canvas.style.width = `${Math.floor(w * scale)}px`;
    canvas.style.height = `${Math.floor(h * scale)}px`;
    canvas.style.aspectRatio = 'auto';
  }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  window.__shotReady = true;
}
