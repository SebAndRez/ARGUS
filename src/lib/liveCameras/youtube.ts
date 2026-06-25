const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

export function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!YOUTUBE_HOSTS.has(host)) return null;

    if (host === "youtu.be") {
      return sanitizeVideoId(parsed.pathname.slice(1));
    }

    const watchId = parsed.searchParams.get("v");
    if (watchId) return sanitizeVideoId(watchId);

    const match = parsed.pathname.match(/\/(?:embed|live|shorts)\/([^/?#]+)/);
    return match?.[1] ? sanitizeVideoId(match[1]) : null;
  } catch {
    return null;
  }
}

export function buildYouTubeEmbedUrl(videoId: string): string {
  const safeId = sanitizeVideoId(videoId);
  if (!safeId) return "";

  const params = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    playsinline: "1",
    controls: "1",
    modestbranding: "1",
  });

  return `https://www.youtube-nocookie.com/embed/${safeId}?${params.toString()}`;
}

function sanitizeVideoId(videoId: string) {
  const trimmed = videoId.trim();
  return /^[a-zA-Z0-9_-]{6,20}$/.test(trimmed) ? trimmed : null;
}
