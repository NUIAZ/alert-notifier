"""
icons/make_icons.py - regenerates icon16/48/128.png (and the README hero icon).

The icon is a bell-in-a-rounded-square, drawn procedurally so the repo carries no
binary source assets and anyone can tweak colours and re-run. Requires Pillow:
    pip install pillow
    python icons/make_icons.py
Everything is drawn at 512px and downsampled with LANCZOS so the 16px version
stays crisp rather than aliased.
"""
from PIL import Image, ImageDraw
import math, os

HERE = os.path.dirname(os.path.abspath(__file__))
S = 512
BG = (13, 110, 253)      # accent blue, same as --accent in styles.css
FG = (255, 255, 255)
DOT = (220, 53, 69)      # 'serious' red for the notification dot

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# Rounded square background
d.rounded_rectangle((0, 0, S - 1, S - 1), radius=int(S * 0.22), fill=BG)

# Bell body: a dome (ellipse top) + trapezoid skirt + a flat rim
cx, cy = S / 2, S / 2 + 10
top = cy - 150
d.ellipse((cx - 110, top - 20, cx + 110, top + 200), fill=FG)             # dome
d.polygon([(cx - 110, top + 90), (cx + 110, top + 90),
           (cx + 165, cy + 105), (cx - 165, cy + 105)], fill=FG)          # skirt
d.rounded_rectangle((cx - 180, cy + 95, cx + 180, cy + 130), radius=18, fill=FG)  # rim
d.rounded_rectangle((cx - 22, top - 55, cx + 22, top + 10), radius=20, fill=FG)   # top knob
d.ellipse((cx - 55, cy + 135, cx + 55, cy + 200), fill=FG)                # clapper
# Notification dot, top-right, with a background-coloured ring for separation
d.ellipse((S - 195, 55, S - 45, 205), fill=BG)
d.ellipse((S - 180, 70, S - 60, 190), fill=DOT)

for size in (16, 48, 128, 256):
    img.resize((size, size), Image.LANCZOS).save(os.path.join(HERE, f"icon{size}.png"))
print("wrote icon16/48/128/256.png")
