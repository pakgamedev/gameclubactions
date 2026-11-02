#!/usr/bin/env python3
"""Build the weekly Game Dev Club square share cover.

Stacked, center-aligned layout (1080x1080):
  Let's
  PLAY, ANALYSE & DISCUSS
  {wide game cover with accent outline}
  Discuss {game} this week over on PakGameDev discord

Accent color is sampled from the game cover.

Example:
  python3 scripts/build_weekly_cover.py \\
    --name "Ballionaire" \\
    --image-url "https://cdn.example/header.jpg" \\
    --out-dir outreach
"""

from __future__ import annotations

import argparse
import colorsys
import io
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

WHITE = (255, 255, 255)
NAVY = (15, 23, 42)
FALLBACK_ACCENT = (34, 197, 94)

FONT_DIR = Path(__file__).resolve().parent.parent / "fonts"
FONT_TITAN = str(FONT_DIR / "TitanOne-Regular.ttf")
FONT_HEAVY = "/usr/share/fonts/opentype/fira/FiraSansCondensed-Heavy.otf"
FONT_BOLD = "/usr/share/fonts/opentype/fira/FiraSansCondensed-Bold.otf"
FONT_FALLBACK = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

SIZE = 1080


def load_font(path: str, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for candidate in (path, FONT_FALLBACK):
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def fetch_image(url: str | None, local: Path | None) -> Image.Image | None:
    if local and local.exists():
        return Image.open(local).convert("RGB")
    if not url:
        return None
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "PakGameDevClubCover/1.0"},
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        data = resp.read()
    return Image.open(io.BytesIO(data)).convert("RGB")


def fit_cover(im: Image.Image, tw: int, th: int) -> Image.Image:
    sw, sh = im.size
    scale = max(tw / sw, th / sh)
    nw, nh = int(sw * scale + 0.5), int(sh * scale + 0.5)
    resized = im.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - tw) // 2
    top = (nh - th) // 2
    return resized.crop((left, top, left + tw, top + th))


def pick_accent(im: Image.Image) -> tuple[int, int, int]:
    """Pick a vivid accent from the cover (prefer saturated mid-tones)."""
    sample = im.copy()
    sample.thumbnail((80, 80), Image.Resampling.BOX)
    raw = (
        sample.convert("RGB").get_flattened_data()
        if hasattr(sample, "get_flattened_data")
        else list(sample.getdata())
    )
    if raw and not isinstance(raw[0], tuple):
        pixels = list(zip(raw[0::3], raw[1::3], raw[2::3]))
    else:
        pixels = list(raw)

    best = None
    best_score = -1.0
    for r, g, b in pixels:
        rf, gf, bf = r / 255.0, g / 255.0, b / 255.0
        h, s, v = colorsys.rgb_to_hsv(rf, gf, bf)
        if v < 0.22 or v > 0.95 or s < 0.28:
            continue
        score = s * 1.6 + v * 0.7
        if 0.25 <= h <= 0.55:
            score += 0.15
        if score > best_score:
            best_score = score
            best = (r, g, b)
    if best is None:
        return FALLBACK_ACCENT
    h, s, v = colorsys.rgb_to_hsv(best[0] / 255, best[1] / 255, best[2] / 255)
    s = min(1.0, s * 1.15)
    v = min(1.0, max(0.45, v))
    rf, gf, bf = colorsys.hsv_to_rgb(h, s, v)
    return (int(rf * 255), int(gf * 255), int(bf * 255))


def wrap_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    font: ImageFont.ImageFont,
    max_width: int,
) -> list[str]:
    words = text.split()
    if not words:
        return [""]
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        trial = f"{current} {word}"
        if draw.textlength(trial, font=font) <= max_width:
            current = trial
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def text_with_outline(
    draw: ImageDraw.ImageDraw,
    xy: tuple[float, float],
    text: str,
    font: ImageFont.ImageFont,
    fill: tuple[int, int, int],
    outline: tuple[int, int, int] = (0, 0, 0),
    width: int = 4,
) -> None:
    x, y = xy
    for dx in range(-width, width + 1):
        for dy in range(-width, width + 1):
            if dx == 0 and dy == 0:
                continue
            if dx * dx + dy * dy > width * width:
                continue
            draw.text((x + dx, y + dy), text, font=font, fill=outline)
    draw.text((x, y), text, font=font, fill=fill)


def build_cover(game_name: str, header: Image.Image | None) -> Image.Image:
    canvas = Image.new("RGBA", (SIZE, SIZE), (*NAVY, 255))
    accent = FALLBACK_ACCENT

    if header:
        accent = pick_accent(header)
        bg = fit_cover(header, SIZE, SIZE)
        bg = ImageEnhance.Brightness(bg).enhance(0.36)
        bg = ImageEnhance.Color(bg).enhance(0.75)
        bg = bg.filter(ImageFilter.GaussianBlur(22))
        canvas.paste(bg)
        veil = Image.new("RGBA", (SIZE, SIZE), (8, 12, 24, 90))
        canvas = Image.alpha_composite(canvas, veil)

    draw = ImageDraw.Draw(canvas)

    lets_font = load_font(FONT_TITAN, 86)
    verbs_font = load_font(FONT_TITAN, 52)
    sub_font = load_font(FONT_BOLD, 28)

    lets = "Let's"
    verbs = "PLAY, ANALYSE & DISCUSS"
    # Shrink verbs line until it fits with side margins
    verbs_size = 58
    while draw.textlength(verbs, font=verbs_font) > SIZE - 80 and verbs_size > 34:
        verbs_size -= 2
        verbs_font = load_font(FONT_TITAN, verbs_size)

    border = 14
    cover_w = 920
    cover_h = int(cover_w / 2.14)
    frame_w = cover_w + border * 2
    frame_h = cover_h + border * 2

    sub = f"Discuss {game_name} this week over on PakGameDev discord"
    sub_max = SIZE - 120
    sub_lines = wrap_text(draw, sub, sub_font, sub_max)
    sub_line_h = sub_font.size + 6
    sub_pad_x, sub_pad_y = 22, 14
    longest_sub = max(draw.textlength(line, font=sub_font) for line in sub_lines)
    pill_w = longest_sub + sub_pad_x * 2
    pill_h = len(sub_lines) * sub_line_h + sub_pad_y * 2

    gap_lets_verbs = 8
    gap_verbs_cover = 36
    gap_cover_sub = 36

    total_h = (
        lets_font.size
        + gap_lets_verbs
        + verbs_font.size
        + gap_verbs_cover
        + frame_h
        + gap_cover_sub
        + pill_h
    )
    y = (SIZE - total_h) / 2

    # Let's
    tw = draw.textlength(lets, font=lets_font)
    draw.text(((SIZE - tw) / 2, y), lets, font=lets_font, fill=WHITE)
    y += lets_font.size + gap_lets_verbs

    # PLAY, ANALYSE & DISCUSS
    tw = draw.textlength(verbs, font=verbs_font)
    draw.text(((SIZE - tw) / 2, y), verbs, font=verbs_font, fill=accent)
    y += verbs_font.size + gap_verbs_cover

    # Wide framed game cover
    frame_x = (SIZE - frame_w) / 2
    frame_y = y
    draw.rounded_rectangle(
        (frame_x, frame_y, frame_x + frame_w, frame_y + frame_h),
        radius=10,
        fill=(*accent, 255),
    )
    inner = (
        frame_x + border,
        frame_y + border,
        frame_x + frame_w - border,
        frame_y + frame_h - border,
    )
    draw.rounded_rectangle(inner, radius=6, fill=(10, 14, 22, 255))
    if header:
        art = fit_cover(header, cover_w, cover_h)
        canvas.paste(art, (int(inner[0]), int(inner[1])))
    else:
        draw.rectangle(inner, fill=(30, 41, 59, 255))
    y += frame_h + gap_cover_sub

    # Subline pill, centered
    pill_x = (SIZE - pill_w) / 2
    draw.rounded_rectangle(
        (pill_x, y, pill_x + pill_w, y + pill_h),
        radius=14,
        fill=(0, 0, 0, 180),
    )
    for i, line in enumerate(sub_lines):
        tw = draw.textlength(line, font=sub_font)
        draw.text(
            ((SIZE - tw) / 2, y + sub_pad_y + i * sub_line_h),
            line,
            font=sub_font,
            fill=WHITE,
        )

    return canvas.convert("RGB")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build weekly club square cover")
    parser.add_argument("--name", required=True, help="Game display name")
    parser.add_argument("--image-url", default="", help="Steam/Itch header image URL")
    parser.add_argument("--image", type=Path, default=None, help="Local header image path")
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "outreach",
    )
    args = parser.parse_args()

    header = fetch_image(args.image_url or None, args.image)
    args.out_dir.mkdir(parents=True, exist_ok=True)

    cover = build_cover(args.name, header)
    out_path = args.out_dir / "weekly-cover.png"
    cover.save(out_path, "PNG", optimize=True)
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
