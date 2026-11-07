"""Generates the demo catalogue photography.

These are procedural studio mockups (backdrop + soft shadow + product silhouette),
not photographs — they exist so the image pipeline is exercised end to end and the
storefront shows real <img> files instead of flat gradients. Replace them by
uploading actual photos from the admin panel.
"""
import math, os
from PIL import Image, ImageDraw, ImageFilter

W, H = 900, 720
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'uploads', 'demo')

PALETTE = {
    'footwear': [('#F3F1FF', '#C9BEFF'), ('#FFF6F0', '#FFC9A8'), ('#EFF4FF', '#B9CDFF')],
    'apparel':  [('#EFF4FF', '#B9CDFF'), ('#F6F3FF', '#CFC4FF'), ('#FFF4F7', '#FFC4D6')],
    'bags':     [('#FFF6F0', '#FFC9A8'), ('#F7F1E8', '#E0C8A8'), ('#F3F1FF', '#C9BEFF')],
    'home':     [('#EFF9F3', '#B7E3CC'), ('#F7F1E8', '#E0C8A8'), ('#EFF4FF', '#B9CDFF')],
    'beauty':   [('#FFF4F7', '#FFC4D6'), ('#F7F1E8', '#E0C8A8'), ('#EFF9F3', '#B7E3CC')],
    'tech':     [('#F3F1FF', '#C9BEFF'), ('#F1F3F7', '#C6CFDC'), ('#EFF4FF', '#B9CDFF')],
}

def hex2rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def backdrop(top, bottom):
    img = Image.new('RGB', (W, H), top)
    d = ImageDraw.Draw(img)
    for y in range(H):
        d.line([(0, y), (W, y)], fill=mix(top, bottom, y / H))
    # soft vignette
    v = Image.new('L', (W, H), 0)
    dv = ImageDraw.Draw(v)
    dv.ellipse([-W * 0.25, -H * 0.25, W * 1.25, H * 1.25], fill=90)
    v = v.filter(ImageFilter.GaussianBlur(120))
    img = Image.composite(img, Image.new('RGB', (W, H), mix(bottom, (255, 255, 255), 0.45)), v)
    return img

def shadow(img, box):
    s = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ds = ImageDraw.Draw(s)
    ds.ellipse(box, fill=(60, 50, 90, 110))
    s = s.filter(ImageFilter.GaussianBlur(38))
    return Image.alpha_composite(img.convert('RGBA'), s)

def draw_shoe(d, cx, cy):
    d.rounded_rectangle([cx - 200, cy - 40, cx + 210, cy + 120], radius=70, fill=255)
    d.ellipse([cx - 210, cy - 130, cx + 20, cy + 40], fill=255)
    d.rounded_rectangle([cx - 220, cy + 96, cx + 230, cy + 140], radius=22, fill=255)

def draw_tee(d, cx, cy):
    pts = [(cx - 150, cy - 150), (cx - 60, cy - 200), (cx + 60, cy - 200), (cx + 150, cy - 150),
           (cx + 230, cy - 40), (cx + 150, cy + 10), (cx + 130, cy - 20), (cx + 130, cy + 190),
           (cx - 130, cy + 190), (cx - 130, cy - 20), (cx - 150, cy + 10), (cx - 230, cy - 40)]
    d.polygon(pts, fill=255)
    d.ellipse([cx - 60, cy - 215, cx + 60, cy - 160], fill=0)

def draw_bag(d, cx, cy):
    d.rounded_rectangle([cx - 190, cy - 110, cx + 190, cy + 200], radius=40, fill=255)
    d.arc([cx - 90, cy - 210, cx + 90, cy - 20], 180, 360, fill=255, width=22)

def draw_home(d, cx, cy):
    d.ellipse([cx - 210, cy - 40, cx + 210, cy + 210], fill=255)
    d.rounded_rectangle([cx - 40, cy - 220, cx + 40, cy - 10], radius=26, fill=255)

def draw_bottle(d, cx, cy):
    d.rounded_rectangle([cx - 95, cy - 110, cx + 95, cy + 220], radius=40, fill=255)
    d.rounded_rectangle([cx - 42, cy - 210, cx + 42, cy - 105], radius=16, fill=255)

def draw_tech(d, cx, cy):
    d.rounded_rectangle([cx - 150, cy - 200, cx + 150, cy + 200], radius=44, fill=255)
    d.ellipse([cx - 60, cy - 60, cx + 60, cy + 60], fill=255)

SHAPES = {'footwear': draw_shoe, 'apparel': draw_tee, 'bags': draw_bag,
          'home': draw_home, 'beauty': draw_bottle, 'tech': draw_tech}

def vertical_gradient(a, b):
    g = Image.new('RGB', (W, H), a)
    d = ImageDraw.Draw(g)
    for y in range(H):
        d.line([(0, y), (W, y)], fill=mix(a, b, y / H))
    return g

def make(slug, category, variant_index):
    top, bottom = PALETTE[category][variant_index % 3]
    base = hex2rgb(bottom)
    img = backdrop(hex2rgb(top), base)
    img = shadow(img, [W * 0.16, H * 0.68, W * 0.84, H * 0.88])

    cx, cy = W // 2, int(H * 0.52)
    mask = Image.new('L', (W, H), 0)
    SHAPES[category](ImageDraw.Draw(mask), cx, cy)

    # rim light: the silhouette nudged up-left, blurred, drawn beneath the body
    rim = Image.new('L', (W, H), 0)
    rim.paste(mask, (-7, -9))
    rim = rim.filter(ImageFilter.GaussianBlur(3))
    img = Image.composite(Image.new('RGB', (W, H), mix(base, (255, 255, 255), 0.75)), img, rim.point(lambda v: int(v * 0.85)))

    # body: vertical gradient from a lit top to a shaded base
    body = vertical_gradient(mix(base, (255, 255, 255), 0.28), mix(base, (40, 30, 70), 0.30))
    img = Image.composite(body, img, mask)

    # contact shadow directly under the object
    contact = Image.new('L', (W, H), 0)
    ImageDraw.Draw(contact).ellipse([cx - 200, cy + 150, cx + 200, cy + 230], fill=90)
    contact = contact.filter(ImageFilter.GaussianBlur(26))
    img = Image.composite(Image.new('RGB', (W, H), (58, 48, 88)), img, contact.point(lambda v: int(v * 0.55)))
    # top light
    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([-W * 0.3, -H * 0.7, W * 0.9, H * 0.25], fill=(255, 255, 255, 60))
    glow = glow.filter(ImageFilter.GaussianBlur(90))
    img = Image.alpha_composite(img, glow)
    return img.convert('RGB')

PRODUCTS = [
    ('aero-runner-pro', 'footwear'), ('trail-grip-runner', 'footwear'), ('court-low-sneaker', 'footwear'),
    ('everyday-slide-sandal', 'footwear'), ('linen-oversized-shirt', 'apparel'), ('cotton-crew-tee', 'apparel'),
    ('merino-crew-sweater', 'apparel'), ('relaxed-chino-trousers', 'apparel'), ('everyday-canvas-tote', 'bags'),
    ('commuter-backpack-22l', 'bags'), ('leather-card-holder', 'bags'), ('weekender-duffel', 'bags'),
    ('ceramic-pour-over-set', 'home'), ('stoneware-dinner-plates', 'home'), ('cotton-throw-blanket', 'home'),
    ('brass-table-lamp', 'home'), ('vitamin-c-serum', 'beauty'), ('rose-face-mist', 'beauty'),
    ('shea-body-butter', 'beauty'), ('charcoal-face-wash', 'beauty'), ('wireless-earbuds-air', 'tech'),
    ('65w-gan-charger', 'tech'), ('braided-usb-c-cable', 'tech'), ('bluetooth-speaker-mini', 'tech'),
]

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for i, (slug, cat) in enumerate(PRODUCTS):
        make(slug, cat, i).save(os.path.join(OUT, f'{slug}.jpg'), quality=82, optimize=True)
        make(slug, cat, i + 1).save(os.path.join(OUT, f'{slug}-2.jpg'), quality=82, optimize=True)
    print(f'wrote {len(PRODUCTS) * 2} images to {OUT}')
