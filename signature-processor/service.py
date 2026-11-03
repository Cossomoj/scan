"""Private, in-memory adapter for signature-remove-bg (MIT, see LICENSE)."""
import asyncio
import io

from fastapi import FastAPI, Request
from fastapi.responses import Response
import cv2
import numpy as np
from PIL import Image, ImageFilter, UnidentifiedImageError
from backend.processing import extract_signature

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
semaphore = asyncio.Semaphore(1)
MAX_BYTES = 2 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 900 * 700

def remove_form_rules(alpha, neutral, min_fraction):
    """Remove long straight neutral runs, retaining ink that crosses them."""
    ink = (alpha >= 64).astype(np.uint8)
    height, width = ink.shape
    length = max(26, int(np.ceil(min_fraction * width)))
    if width < length or height < 6:
        return
    runs = cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((1, length), np.uint8),
                            borderType=cv2.BORDER_CONSTANT, borderValue=0)
    _, _, bands, _ = cv2.connectedComponentsWithStats(runs)
    for x, y, span, thick, _ in bands[1:]:
        if thick > max(2, round(height * 0.02)):
            continue
        left, right = max(0, x - 1), min(width, x + span + 1)
        band = np.s_[y:y + thick, left:right]
        if neutral[band].mean() < 0.55:
            continue
        # A line by itself is a valid pen stroke. Require handwriting outside it.
        if np.count_nonzero(ink.any(axis=1)) < thick + 4:
            continue
        above = ink[max(0, y - 2):y, left:right].any(axis=0)
        below = ink[y + thick:y + thick + 2, left:right].any(axis=0)
        crossing = np.convolve(above, [1, 1, 1], 'same') * np.convolve(below, [1, 1, 1], 'same')
        alpha[band][neutral[band] & (crossing == 0)] = 0


def clean_mask(pixels):
    alpha = pixels[:, :, 3]
    neutral = np.ptp(pixels[:, :, :3], axis=2) <= 22
    remove_form_rules(alpha, neutral, 0.55)
    remove_form_rules(alpha.T, neutral.T, 0.85)
    # Remove only compact flecks that are tiny compared with the handwriting.
    _, labels, stats, _ = cv2.connectedComponentsWithStats((alpha > 0).astype(np.uint8))
    components = stats[1:]
    if len(components) < 2:
        return
    largest = components[:, cv2.CC_STAT_AREA].max()
    max_area = min(64, largest * 0.015)
    max_side = max(3, np.sqrt(max_area) * 1.8)
    flecks = ((components[:, cv2.CC_STAT_AREA] <= max_area) &
              (components[:, cv2.CC_STAT_WIDTH] <= max_side) &
              (components[:, cv2.CC_STAT_HEIGHT] <= max_side))
    alpha[np.r_[False, flecks][labels]] = 0


def process_image(image):
    # Extract the mask without blurring one-pixel strokes.
    result, _ = extract_signature(image, mode='auto', steps=[('threshold', 200), ('blue_tolerance', 30), ('clean_lines', 0), ('contrast', 0), ('smoothing', 0)])
    # Reinforce the darker side of a soft edge. Scale RGB together to keep
    # the pen hue, and leave the darkest ink and the extracted alpha intact.
    gray = result.convert('L')
    light = np.asarray(gray, dtype=np.float32)
    surround = np.asarray(gray.filter(ImageFilter.GaussianBlur(1)), dtype=np.float32)
    edge = np.maximum(surround - light, 0)
    midtones = np.clip((light - 36) / 48, 0, 1)
    reduction = np.minimum(0.24 * light, 0.35 * edge) * midtones
    gain = 1 - reduction / np.maximum(light, 1)
    pixels = np.array(result)
    clean_mask(pixels)
    pixels[:, :, :3] = np.rint(pixels[:, :, :3] * gain[:, :, None]).astype(np.uint8)
    output = io.BytesIO()
    Image.fromarray(pixels).save(output, format='PNG')
    return output.getvalue()

@app.get('/health')
def health():
    return {'ok': True}

@app.post('/extract')
async def extract(request: Request):
    if request.headers.get('content-type') != 'image/png':
        return Response(status_code=415)
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > MAX_BYTES:
            return Response(status_code=413)
    try:
        image = Image.open(io.BytesIO(data))
        if image.format != 'PNG' or image.width > 900 or image.height > 700:
            return Response(status_code=400)
        image.load()
    except (ValueError, OSError, UnidentifiedImageError, Image.DecompressionBombError):
        return Response(status_code=400)

    async with semaphore:
        try:
            result = await asyncio.to_thread(process_image, image)
        except Exception:
            return Response(status_code=422)
    return Response(result, media_type='image/png', headers={'Cache-Control': 'no-store'})
