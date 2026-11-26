# Derives app icons from the ORIGINAL logo file by technical crop/pad/resize only.
# The artwork itself is never redrawn or altered. Run: python3 scripts/build-icons.py
from PIL import Image
SRC = 'public/img/logo-original.jpg'
im = Image.open(SRC).convert('RGB')
# The original has a pure black background; find the artwork bounds and center it in a square.
bbox = im.convert('L').point(lambda v: 255 if v > 40 else 0).getbbox()
cx, cy = (bbox[0] + bbox[2]) // 2, (bbox[1] + bbox[3]) // 2
side = int(max(bbox[2] - bbox[0], bbox[3] - bbox[1]) * 1.08)
def square(scale_pad=1.0):
    s = int(side * scale_pad)
    canvas = Image.new('RGB', (s, s), (0, 0, 0))
    canvas.paste(im, (s // 2 - cx, s // 2 - cy))
    return canvas
sq = square()
for size in (512, 192, 180, 96, 48, 32):
    sq.resize((size, size), Image.LANCZOS).save(f'public/icons/icon-{size}.png', optimize=True)
# Maskable: extra black safe-zone padding so launchers that crop to a circle never cut the logo.
mk = square(1.45)
for size in (512, 192):
    mk.resize((size, size), Image.LANCZOS).save(f'public/icons/maskable-{size}.png', optimize=True)
sq.resize((32, 32), Image.LANCZOS).save('public/favicon.png')
# Web-optimised copy of the original for in-app use (same artwork, resized only)
im.resize((540, int(540 * im.height / im.width)), Image.LANCZOS).save('public/img/logo.jpg', quality=90)
print('icons built from', SRC, 'bbox', bbox)
