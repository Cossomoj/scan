"""Check the deployed processor with synthetic pixels; no user data is sent."""
import io
import sys
import time
import urllib.request
from PIL import Image, ImageDraw

url = sys.argv[1].rstrip('/') + '/api/signature/enhance'
image = Image.new('RGB', (71, 49), 'white')
draw = ImageDraw.Draw(image)
draw.line((2, 24, 68, 24), fill=(140, 140, 140), width=1)
draw.line((20, 36, 32, 12, 42, 30), fill=(24, 35, 130), width=2)
draw.point((10, 38), fill=(80, 80, 80))
draw.line((5, 20, 65, 20), fill=(15, 24, 100), width=1)
draw.line((5, 30, 65, 30), fill=(100, 110, 180), width=1)
source = io.BytesIO()
image.save(source, format='PNG')
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

for attempt in range(8):
    try:
        request = urllib.request.Request(url, source.getvalue(), {'Content-Type': 'image/png'})
        with opener.open(request, timeout=8) as response:
            result = Image.open(io.BytesIO(response.read())).convert('RGBA')
        if result.size != image.size or result.getpixel((35, 20))[3] < 240 or result.getpixel((10, 18))[3] > 10:
            raise ValueError('Deployed processor did not preserve the thin line.')
        red, _, blue, alpha = result.getpixel((35, 30))
        if red >= 85 or blue <= red or alpha < 240:
            raise ValueError('Deployed processor did not strengthen the light blue stroke.')
        if result.getpixel((18, 24))[3] or result.getpixel((10, 38))[3]:
            raise ValueError('Deployed processor did not remove the printed rule and speck.')
        print('Signature processor deployment verified')
        break
    except Exception:
        if attempt == 7:
            raise
        time.sleep(3)
