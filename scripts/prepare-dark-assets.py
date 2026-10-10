from collections import deque
from pathlib import Path
from shutil import copyfile

import numpy as np
from PIL import Image

from align_home_feature_assets import align_home_feature_assets


SITE = Path(__file__).resolve().parents[1] / "public"
HOME = SITE / "home-assets"
KANJI = SITE / "kanji-assets"

# The checkerboard in this ChatGPT export is actual RGB pixels. Recover each
# card's silhouette from its navy border, then make everything outside clear.
sheet = np.asarray(Image.open(KANJI / "grade-1-6.png").convert("RGB"))
seams = [(11, 366), (366, 717), (717, 1068), (1068, 1418), (1418, 1767), (1767, 2120)]
for grade, (left, right) in enumerate(seams, 1):
    piece = sheet[110:634, left:right]
    blue = ((piece[:, :, 2].astype(int) > piece[:, :, 0].astype(int) + 9)
            & (piece[:, :, 2].astype(int) > piece[:, :, 1].astype(int) + 2)
            & (piece[:, :, 0] < 160))
    mask = np.zeros(blue.shape, dtype=np.uint8)
    for y, row in enumerate(blue):
        xs = np.flatnonzero(row)
        if xs.size >= 4:
            mask[y, xs[0]:xs[-1] + 1] = 255
    bounds = Image.fromarray(mask).getbbox()
    if bounds is None:
        raise RuntimeError(f"Could not locate grade {grade}")
    x0, y0, x1, y1 = bounds
    output = np.dstack((piece[y0:y1, x0:x1], mask[y0:y1, x0:x1]))
    Image.fromarray(output, "RGBA").save(KANJI / f"grade-{grade}-dark.png", optimize=True)

# The hero was delivered with a black backdrop instead of transparency.
# Only the black or near-black area connected to the canvas edge is removed;
# dark details inside the illustration remain intact.
hero = np.asarray(Image.open(HOME / "hero-garden-dark.png").convert("RGB"))
height, width, _ = hero.shape
dark = hero.max(axis=2) < 56
outside = np.zeros((height, width), dtype=bool)
queue = deque()
for x in range(width):
    if dark[0, x]: outside[0, x] = True; queue.append((0, x))
    if dark[height - 1, x]: outside[height - 1, x] = True; queue.append((height - 1, x))
for y in range(height):
    if dark[y, 0]: outside[y, 0] = True; queue.append((y, 0))
    if dark[y, width - 1]: outside[y, width - 1] = True; queue.append((y, width - 1))
while queue:
    y, x = queue.popleft()
    for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
        if 0 <= ny < height and 0 <= nx < width and dark[ny, nx] and not outside[ny, nx]:
            outside[ny, nx] = True
            queue.append((ny, nx))
alpha = np.full((height, width), 255, dtype=np.uint8)
alpha[outside] = 0
Image.fromarray(np.dstack((hero, alpha)), "RGBA").save(HOME / "hero-garden-dark-cutout.png", optimize=True)

# The new banner has 500+ transparent rows; crop to the actual banner so the
# site's existing fixed-height frame shows it at the intended scale.
banner = Image.open(HOME / "footer-banner-trimmed-dark.png").convert("RGBA")
banner.crop((0, 268, banner.width, 451)).save(
    HOME / "footer-banner-trimmed-dark-cropped.png", optimize=True)

copyfile(HOME / "practice-card-dark.png", KANJI / "practice-card-dark.png")

# Keep every supplied PNG untouched and serve compact WebP copies. Fine paper
# grain survives at quality 90 while the selector stops loading multi-MB PNGs.
home_ready = [
    "paper-texture-dark.png", "hero-garden-dark-cutout.png",
    "daily-practice-dark.png", "kanji-practice-dark.png",
    "footer-banner-trimmed-dark-cropped.png", "mode-vocabulary-dark.png",
    "icon-book-2-dark.png",
]
kanji_ready = ([f"grade-{grade}-dark.png" for grade in range(1, 7)]
               + [f"jlpt-N{level}-dark.png" for level in range(1, 6)]
               + ["practice-card-dark.png", "practice-garden-dark.png",
                  "practice-mountains-dark.png", "practice-brush-dark.png",
                  "tree-dark.png"])
for folder, names in ((HOME, home_ready), (KANJI, kanji_ready)):
    for name in names:
        image = Image.open(folder / name)
        image.save((folder / name).with_suffix(".webp"), "WEBP", quality=90, method=6)
align_home_feature_assets(HOME)

# The supplied PNGs stay as references. Remove only the normalized PNGs this
# script produced; the site serves their smaller WebP counterparts.
for name in ["hero-garden-dark-cutout.png", "footer-banner-trimmed-dark-cropped.png"]:
    (HOME / name).unlink()
for name in [f"grade-{grade}-dark.png" for grade in range(1, 7)] + ["practice-card-dark.png"]:
    (KANJI / name).unlink()

# Keep the exact Japanese brush strokes; image generators can corrupt kanji.
inscription = np.array(Image.open(KANJI / "practice-inscription.png").convert("RGBA"))
shade = inscription[:, :, 2].astype(np.float32) * 0.35
inscription[:, :, :3] = np.clip(
    np.array([130, 149, 170])[None, None, :] + shade[:, :, None], 0, 255
).astype(np.uint8)
Image.fromarray(inscription, "RGBA").save(
    KANJI / "practice-inscription-dark.webp", "WEBP", quality=90, method=6
)
print("Prepared six grade cards, hero cutout, cropped banner, practice card, and compact WebP copies.")
