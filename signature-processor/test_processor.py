import io
import unittest
from PIL import Image, ImageDraw
from service import process_image


class ProcessingTest(unittest.TestCase):
    def test_white_background_is_removed_and_line_is_not_removed(self):
        image = Image.new('RGB', (400, 150), 'white')
        draw = ImageDraw.Draw(image)
        draw.line((10, 120, 390, 120), fill='black', width=2)
        draw.line((100, 90, 200, 20, 300, 90), fill=(0, 30, 180), width=5)
        result = Image.open(io.BytesIO(process_image(image))).convert('RGBA')
        self.assertEqual(result.size, image.size)
        self.assertEqual(result.getpixel((20, 20))[3], 0)
        self.assertGreater(result.getpixel((20, 120))[3], 0)
        self.assertGreater(result.getpixel((200, 20))[3], 200)


if __name__ == '__main__':
    unittest.main()
