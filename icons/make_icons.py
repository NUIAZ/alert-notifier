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
"""
from PIL import Image
import os

HERE = os.path.dirname(os.path.abspath(__file__))
src = Image.open(os.path.join(HERE, "logo.png")).convert("RGBA")
if src.size[0] != src.size[1]:
    raise SystemExit("logo.png must be square")

for size in (16, 32, 48, 128):
    src.resize((size, size), Image.LANCZOS).save(os.path.join(HERE, f"icon{size}.png"))
print("wrote icon16/32/48/128.png from logo.png")
