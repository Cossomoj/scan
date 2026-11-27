// Convert our canvas PNG data directly: fetching a data: URL is blocked by CSP.
export function pngDataUrlToBlob(value) {
  const prefix = 'data:image/png;base64,';
  if (typeof value !== 'string' || !value.startsWith(prefix)) {
    throw new Error('Не удалось подготовить изображение для обработки.');
  }
  try {
    const binary = atob(value.slice(prefix.length));
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return new Blob([bytes], {type: 'image/png'});
  } catch {
    throw new Error('Не удалось подготовить изображение для обработки.');
  }
}
