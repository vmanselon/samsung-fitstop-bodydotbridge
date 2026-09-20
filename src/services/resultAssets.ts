import type { BodyResult } from "../types/bodyResult";

const RESULT_FONT_WEIGHTS = [400, 500, 700, 800] as const;
const RESULT_STATIC_IMAGES = [
  "/images/global/logo_samsung.svg",
  "/images/global/logo_min.svg",
  "/images/global/flag.svg",
  "/images/character/character_guide.svg",
];

async function preloadImage(source: string): Promise<void> {
  const image = new Image();
  await new Promise<void>((resolve) => {
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = source;
    if (image.complete) resolve();
  });

  try {
    await image.decode();
  } catch {
    // A failed asset will still render its normal browser fallback; never trap the UI on loading.
  }
}

export async function preloadResultAssets(result: BodyResult): Promise<void> {
  const sectionImages = result.sections.flatMap((section) =>
    section.imageUrl
      ? [section.imageUrl]
      : [0, 1].map((frame) => `/images/character/character_${section.view}_${frame}.svg`),
  );
  const imageSources = [...new Set([...RESULT_STATIC_IMAGES, ...sectionImages])];
  const fontLoads = RESULT_FONT_WEIGHTS.map((weight) =>
    document.fonts.load(`${weight} 1em "Samsung Gothic"`).catch(() => []),
  );

  await Promise.all([
    ...imageSources.map(preloadImage),
    ...fontLoads,
  ]);
}
