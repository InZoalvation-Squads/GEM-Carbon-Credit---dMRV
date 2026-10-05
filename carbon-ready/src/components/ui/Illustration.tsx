/** Natural WebP dimensions inspected with sips; cropped art has varying ratios. */
const dimensions: Record<string, readonly [number, number]> = {
  'hiw-hero': [1200, 356],
  'hiw-1': [480, 431], 'hiw-2': [480, 220], 'hiw-3': [480, 416],
  'hiw-4': [480, 459], 'hiw-5': [480, 331], 'hiw-6': [480, 362], 'hiw-7': [348, 480],
};

export const illustrations = {
  steps: Array.from({ length: 7 }, (_, index) => `/illustrations/hiw-${index + 1}.webp`),
};

export function Illustration({ src, className }: { src: string; className?: string }) {
  const [width, height] = dimensions[src.split('/').pop()!.replace('.webp', '')];
  return <img src={src} alt="" aria-hidden="true" width={width} height={height}
    loading="lazy" decoding="async" className={className} />;
}
