"""Private, in-memory adapter for signature-remove-bg (MIT, see LICENSE)."""
import asyncio
import io

from fastapi import FastAPI, Request
from fastapi.responses import Response
import numpy as np
from PIL import Image, ImageFilter, UnidentifiedImageError
from backend.processing import extract_signature

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
semaphore = asyncio.Semaphore(1)
MAX_BYTES = 2 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 900 * 700

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
    reduction = np.minimum(0.5 * light, 0.2 * light + 0.75 * edge) * midtones
    gain = 1 - reduction / np.maximum(light, 1)
    pixels = np.array(result)
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
