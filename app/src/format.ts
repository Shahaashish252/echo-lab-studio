// Frame size per video. Plates draw in these units (W x H) whatever the render scale.
// Videos not listed are 1920x1080. Vertical videos (Shorts, Reels, TikTok) are 1080x1920; the
// channel art and thumbnails are one-plate "videos" at their platform sizes.

export const DEFAULT_VIDEO = 'rutherford';

const SIZES: Record<string, [number, number]> = {
  ultrasonic: [1080, 1920],
  auto: [1080, 1920],
  'ultrasonic-cover': [1080, 1920],
  'ultrasonic-thumb': [1280, 720],
  'brand-banner': [2560, 1440],
  'brand-avatar': [800, 800],
};

const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : undefined;
export const VIDEO = params?.get('video') ?? DEFAULT_VIDEO;
export const [W, H] = SIZES[VIDEO] ?? [1920, 1080];
export const VERTICAL = H > W;
