#!/usr/bin/env python3
"""Build Rock Hard app icons from the final official logo (logo-final.jpg).

Outputs icons/icon-180.png (apple-touch-icon), icon-192.png, icon-512.png,
and icons/icon-512-maskable.png (Chrome Add to Home Screen safe zone: the
logo scaled to 368px, centered on the app background #0B0B0E).
Also writes logo-header.jpg (256px) for the in-app header.

Run: python3 scripts/make_icons.py
"""
from PIL import Image
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "logo-final.jpg")
OUT = os.path.join(ROOT, "icons")
os.makedirs(OUT, exist_ok=True)

BG = (11, 11, 14)

logo = Image.open(SRC).convert("RGB")
print("source: logo-final.jpg", logo.size)

for size in (180, 192, 512):
    icon = logo.resize((size, size), Image.LANCZOS)
    icon.save(os.path.join(OUT, "icon-%d.png" % size))
    print("wrote icons/icon-%d.png (%dx%d)" % (size, size, size))

# Maskable: logo must survive cropping to the 80% safe zone, so scale it
# down with padding on the app background color.
maskable = Image.new("RGB", (512, 512), BG)
small = logo.resize((368, 368), Image.LANCZOS)
maskable.paste(small, (72, 72))
maskable.save(os.path.join(OUT, "icon-512-maskable.png"))
print("wrote icons/icon-512-maskable.png (512x512, maskable)")

# Header image: small version of the logo for the in-app header.
header = logo.resize((256, 256), Image.LANCZOS)
header.save(os.path.join(ROOT, "logo-header.jpg"), quality=88)
print("wrote logo-header.jpg (256x256)")
