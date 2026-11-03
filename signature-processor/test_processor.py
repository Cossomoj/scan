import io
import unittest
from PIL import Image, ImageDraw
from service import process_image


class ProcessingTest(unittest.TestCase):
    def test_light_blue_stroke_gains_contrast_without_a_halo(self):
        image = Image.new('RGB', (71, 49), 'white')
        ImageDraw.Draw(image).line((5, 20, 65, 20), fill=(100, 110, 180), width=1)
        result = Image.open(io.BytesIO(process_image(image))).convert('RGBA')
        red, green, blue, alpha = result.getpixel((35, 20))
        self.assertEqual(alpha, 255)
        self.assertLess(red, 85)
        self.assertAlmostEqual(blue / red, 1.8, delta=0.05)
        self.assertGreater(green, red)
        self.assertEqual(result.getpixel((35, 19))[3], 0)

    def test_small_thin_signature_remains_opaque_and_background_clear(self):
        image = Image.new('RGB', (71, 49), 'white')
        draw = ImageDraw.Draw(image)
        draw.line((5, 20, 65, 20), fill=(15, 24, 100), width=1)
        result = Image.open(io.BytesIO(process_image(image))).convert('RGBA')
        self.assertEqual(result.getpixel((35, 20)), (15, 24, 100, 255))
        self.assertEqual(result.getpixel((35, 18))[3], 0)
        self.assertEqual(result.getpixel((0, 0))[3], 0)

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
