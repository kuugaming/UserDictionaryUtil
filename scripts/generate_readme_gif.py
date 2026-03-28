from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path('/home/user/UserDictionaryUtil')
SRC = ROOT / 'docs' / 'screenshots'
OUT = SRC / 'workflow-demo.gif'

frames_src = [
    ('dashboard-overview.png', 'Dashboard overview', 'Apple / Google / CSV / JSON をまたいで辞書を一元管理'),
    ('import-preview.png', 'Import preview', '追加予定・重複・不正行を確認してから安全に取り込む'),
    ('duplicate-insight.png', 'Duplicate insight', '重複候補を見える化して整理と復元ポイント運用まで回す'),
]

font_candidates = [
    '/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
]

def get_font(size: int):
    for candidate in font_candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size=size)
    return ImageFont.load_default()

font_title = get_font(42)
font_sub = get_font(24)
font_small = get_font(20)

canvas_size = (1440, 960)
image_box = (60, 150, 1380, 860)
frames = []

def fit_image(img: Image.Image, box):
    x1, y1, x2, y2 = box
    target_w = x2 - x1
    target_h = y2 - y1
    ratio = min(target_w / img.width, target_h / img.height)
    resized = img.resize((int(img.width * ratio), int(img.height * ratio)), Image.LANCZOS)
    canvas = Image.new('RGBA', (target_w, target_h), (8, 15, 29, 0))
    px = (target_w - resized.width) // 2
    py = (target_h - resized.height) // 2
    canvas.paste(resized.convert('RGBA'), (px, py))
    return canvas

for filename, title, subtitle in frames_src:
    base = Image.new('RGBA', canvas_size, (7, 17, 31, 255))
    draw = ImageDraw.Draw(base)

    draw.rounded_rectangle((24, 24, 1416, 936), radius=36, fill=(11, 18, 32, 255), outline=(44, 64, 92, 255), width=2)
    draw.rounded_rectangle((60, 150, 1380, 860), radius=28, fill=(8, 15, 29, 255), outline=(52, 82, 120, 255), width=2)

    draw.text((68, 58), 'UserDictionaryUtil', font=font_title, fill=(236, 244, 255, 255))
    draw.text((70, 110), title, font=font_sub, fill=(125, 211, 252, 255))
    draw.text((70, 885), subtitle, font=font_sub, fill=(214, 229, 248, 255))
    draw.text((1170, 885), 'README demo', font=font_small, fill=(147, 169, 197, 255))

    img = Image.open(SRC / filename).convert('RGBA')
    framed = fit_image(img, image_box)
    base.alpha_composite(framed, (image_box[0], image_box[1]))
    frames.append(base.convert('P', palette=Image.ADAPTIVE))

frames[0].save(
    OUT,
    save_all=True,
    append_images=frames[1:],
    duration=[1800, 1800, 1800],
    loop=0,
    optimize=True,
    disposal=2,
)

print(OUT)
