"""Frame the two dark home cards like their light references without distortion."""

from pathlib import Path

from PIL import Image, ImageOps


HOME = Path(__file__).resolve().parents[1] / "public" / "home-assets"


def visible_bounds(art: Image.Image) -> tuple[int, int, int, int]:
    bounds = art.getchannel("A").point(
        lambda alpha: 255 if alpha >= 128 else 0
    ).getbbox()
    if bounds is None:
        raise ValueError("Artwork has no visible pixels")
    return bounds


def align_home_feature_assets(folder: Path = HOME) -> None:
    light_cat = Image.open(folder / "daily-practice.png")
    dark_cat = Image.open(folder / "daily-practice-dark.png")
    ImageOps.fit(
        dark_cat, light_cat.size, Image.Resampling.LANCZOS
    ).save(folder / "daily-practice-dark.webp", "WEBP", quality=90, method=6)

    light_kanji = Image.open(folder / "kanji-practice.png").convert("RGBA")
    dark_kanji = Image.open(folder / "kanji-practice-dark.png").convert("RGBA")
    rx0, ry0, rx1, ry1 = visible_bounds(light_kanji)
    x0, y0, x1, y1 = visible_bounds(dark_kanji)
    scale = min((rx1 - rx0) / (x1 - x0), (ry1 - ry0) / (y1 - y0))
    dark_kanji = dark_kanji.resize(
        (round(dark_kanji.width * scale), round(dark_kanji.height * scale)),
        Image.Resampling.LANCZOS,
    )
    x = round((rx0 + rx1) / 2 - (x0 + x1) * scale / 2)
    y = round((ry0 + ry1) / 2 - (y0 + y1) * scale / 2)
    aligned = Image.new("RGBA", light_kanji.size)
    aligned.alpha_composite(dark_kanji, (x, y))
    aligned.save(folder / "kanji-practice-dark.webp", "WEBP", quality=90, method=6)


if __name__ == "__main__":
    align_home_feature_assets()
