"""Check the deployed processor with synthetic pixels; no user data is sent."""
import io
import sys
import time
import urllib.request
from PIL import Image, ImageDraw

url = sys.argv[1].rstrip('/') + '/api/signature/enhance'
image = Image.new('RGB', (71, 49), 'white')
ImageDraw.Draw(image).line((5, 20, 65, 20), fill=(15, 24, 100), width=1)
source = io.BytesIO()
image.save(source, format='PNG')
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

for attempt in range(8):
    try:
        request = urllib.request.Request(url, source.getvalue(), {'Content-Type': 'image/png'})
        with opener.open(request, timeout=8) as response:
            result = Image.open(io.BytesIO(response.read())).convert('RGBA')
        if result.size != image.size or result.getpixel((35, 20))[3] < 240 or result.getpixel((35, 18))[3] > 10:
            raise ValueError('Deployed processor did not preserve the thin line.')
        print('Signature processor deployment verified')
        break
    except Exception:
        if attempt == 7:
            raise
        time.sleep(3)
