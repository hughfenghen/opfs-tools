export function detectFileType(
  path: string
): 'video' | 'audio' | 'image' | 'text' {
  if (/\.(mp4|av1|ogg|webm|mov)$/.test(path)) return 'video';
  if (/\.(m4a|mp3)$/.test(path)) return 'audio';
  if (/\.(png|jpe?g|webp|gif|avif)$/.test(path)) return 'image';

  return 'text';
}
