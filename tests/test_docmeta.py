import unittest
from src.docmeta.core import get_file_metadata

class TestDocMeta(unittest.TestCase):

    def test_pdf_sample(self):
        meta = get_file_metadata("samples/application/pdf/캐치업코리아-낙하리_현대해상.pdf")
        self.assertEqual(meta["extension"], ".pdf")
        self.assertTrue(meta["mime"].startswith("application/pdf"))

    def test_image_sample(self):
        meta = get_file_metadata("samples/image/jpeg/캐치업자동차견적.jpg")
        self.assertEqual(meta["extension"], ".jpg")
        self.assertTrue(meta["mime"].startswith("image/"))

    def test_empty_pdf(self):
        meta = get_file_metadata("samples/corrupt/empty.pdf")
        self.assertEqual(meta["extension"], ".pdf")
        self.assertTrue(meta["size_bytes"] == 0 or meta["size_bytes"] > 0)

    def test_fake_image(self):
        meta = get_file_metadata("samples/corrupt/fake.jpg")
        self.assertEqual(meta["extension"], ".jpg")

    def test_random_bin(self):
        meta = get_file_metadata("samples/corrupt/random.bin")
        self.assertEqual(meta["extension"], ".bin")

