"""
icons/make_icons.py - regenerates icon16/32/48/128.png from logo.png.

logo.png (512x512, transparent) is the source of truth: the author's "R" mark,
used for the toolbar icon, OS notifications, the modal header and the options
page. Everything else is a LANCZOS downsample of it, produced here rather than
committed by hand so the sizes never drift apart.

Requires Pillow:
    pip install pillow
    python icons/make_icons.py        # or: npm run icons

Sizes: 16 (toolbar), 32 (HiDPI toolbar), 48 (extensions page), 128 (store /
install dialog / notifications). Chrome and Edge pick the closest size for each
surface, so these four cover everything.

Toolbar sizes get a shadow lift: the logo's near-black bezel disappears against
a dark browser toolbar at 16px, so for 16 and 32 we apply a gamma curve
(TOOLBAR_GAMMA) to the RGB channels before downsampling. That turns the bezel
charcoal and brightens the blue field while leaving the metal "R" alone. 48 and
128 are large enough to keep the original tones. Adjust TOOLBAR_GAMMA (1.0 =
untouched, lower = lighter) and re-run to taste.
"""
from PIL import Image, ImageEnhance
import os

TOOLBAR_GAMMA = 0.6
TOOLBAR_SIZES = {16, 32}


def lift_shadows(im, gamma):
    """Apply x**gamma to R, G, B (alpha untouched) via a 256-entry LUT."""
    r, g, b, a = im.split()
    lut = [round(255 * ((i / 255) ** gamma)) for i in range(256)]
    return Image.merge("RGBA", (r.point(lut), g.point(lut), b.point(lut), a))


HERE = os.path.dirname(os.path.abspath(__file__))
src = Image.open(os.path.join(HERE, "logo.png")).convert("RGBA")
if src.size[0] != src.size[1]:
    raise SystemExit("logo.png must be square")

for size in (16, 32, 48, 128):
    base = lift_shadows(src, TOOLBAR_GAMMA) if size in TOOLBAR_SIZES else src
    out = base.resize((size, size), Image.LANCZOS)
    if size in TOOLBAR_SIZES:
        # A touch more contrast so the R edge survives the downsample.
        out = ImageEnhance.Contrast(out).enhance(1.15)
    out.save(os.path.join(HERE, f"icon{size}.png"))
print(f"wrote icon16/32/48/128.png from logo.png (toolbar gamma {TOOLBAR_GAMMA})")
