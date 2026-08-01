#!/usr/bin/env python3
"""
R81 — Pulse Notes icon generator.
Renders the P+spark mark on Tokyo Night background at any size.

Output:
  - android/app/src/main/res/mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher.png
  - android/app/src/main/res/mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher_round.png
  - android/app/src/main/res/drawable/splash.png  (2732x2732)
  - workspace tools for visual verification
"""
import os
from PIL import Image, ImageDraw

# Tokyo Night palette
BG = (0x1a, 0x1b, 0x26, 255)         # #1a1b26
P_BLUE = (0x7a, 0xa2, 0xf7, 255)     # #7aa2f7
SPARK_PURPLE = (0xbb, 0x9a, 0xf7, 255)  # #bb9af7

# Rounded corner mask (legacy non-adaptive icons still get masked by the
# launcher, so we keep the corners clean — a slight 18% radius is the
# modern launcher default and looks correct on both circle and squircle masks).
CORNER_RADIUS_PCT = 0.18


def rounded_rect_mask(size: int, radius_pct: float = CORNER_RADIUS_PCT) -> Image.Image:
    """L mode alpha mask with rounded corners."""
    mask = Image.new("L", (size, size), 0)
    drw = ImageDraw.Draw(mask)
    r = int(size * radius_pct)
    drw.rounded_rectangle((0, 0, size - 1, size - 1), radius=r, fill=255)
    return mask


def draw_p_and_spark(drw: ImageDraw.ImageDraw, size: int) -> None:
    """
    Draws the P + spark mark scaled to the canvas.
    Reference viewport is 108x108 (vector drawable).
    """
    scale = size / 108.0
    # P (hollow, even-odd not directly supported in PIL — we use 2 paths)
    # Outer P outline
    p_outer = [
        (30, 28), (30, 80), (40, 80), (40, 64),
        (58, 64), (68, 64), (74, 57), (74, 48),
        (74, 39), (68, 28), (58, 28), (30, 28),
    ]
    # Inner P hole
    p_hole = [
        (40, 38), (58, 38), (62, 38), (65, 42),
        (65, 48), (65, 52), (62, 56), (58, 56),
        (40, 56), (40, 38),
    ]
    p_outer_px = [(x * scale, y * scale) for (x, y) in p_outer]
    p_hole_px = [(x * scale, y * scale) for (x, y) in p_hole]
    drw.polygon(p_outer_px, fill=P_BLUE)
    drw.polygon(p_hole_px, fill=BG)  # hole = background color

    # 4-point spark
    spark = [
        (84, 24), (86, 32), (94, 34), (86, 36),
        (84, 44), (82, 36), (74, 34), (82, 32),
    ]
    spark_px = [(x * scale, y * scale) for (x, y) in spark]
    drw.polygon(spark_px, fill=SPARK_PURPLE)


def render_icon(size: int) -> Image.Image:
    """Square icon at given px size, rounded corners, full Pulse mark."""
    img = Image.new("RGBA", (size, size), BG)
    drw = ImageDraw.Draw(img)
    draw_p_and_spark(drw, size)
    # Apply rounded corner mask (legacy launchers mask anyway, but this
    # also makes the icon look correct in a WebView / README preview).
    mask = rounded_rect_mask(size)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def render_splash(size: int = 2732) -> Image.Image:
    """Square splash: dark background + mark centered in the safe area.
    Center 1200x1200 of 2732x2732 is guaranteed visible on all screens.
    We render the mark at 1400px (so a 200px bleed sits inside the 1200
    safe area after Android's scale-type fit-center)."""
    img = Image.new("RGBA", (size, size), BG)
    drw = ImageDraw.Draw(img)
    # Reuse draw_p_and_spark by treating the canvas as 108 units of
    # 1400/108 ~= 12.96 px each, then centering.
    mark_size = 1400
    # Top-left of the mark canvas so the mark is centered in 2732
    off = (size - mark_size) // 2
    # Scale factor
    scale = mark_size / 108.0
    # Save current state, draw on a sub-image, paste it
    mark_img = Image.new("RGBA", (mark_size, mark_size), (0, 0, 0, 0))
    mdrw = ImageDraw.Draw(mark_img)
    # Outer P
    p_outer = [
        (30, 28), (30, 80), (40, 80), (40, 64),
        (58, 64), (68, 64), (74, 57), (74, 48),
        (74, 39), (68, 28), (58, 28), (30, 28),
    ]
    p_hole = [
        (40, 38), (58, 38), (62, 38), (65, 42),
        (65, 48), (65, 52), (62, 56), (58, 56),
        (40, 56), (40, 38),
    ]
    p_outer_px = [(x * scale, y * scale) for (x, y) in p_outer]
    p_hole_px = [(x * scale, y * scale) for (x, y) in p_hole]
    mdrw.polygon(p_outer_px, fill=P_BLUE)
    mdrw.polygon(p_hole_px, fill=(0, 0, 0, 0))  # transparent hole
    spark = [
        (84, 24), (86, 32), (94, 34), (86, 36),
        (84, 44), (82, 36), (74, 34), (82, 32),
    ]
    spark_px = [(x * scale, y * scale) for (x, y) in spark]
    mdrw.polygon(spark_px, fill=SPARK_PURPLE)
    img.alpha_composite(mark_img, (off, off))
    return img


def main():
    root = r"C:\Users\1\.minimax-agent\projects\pulse-android"
    res = os.path.join(root, "android", "app", "src", "main", "res")
    sizes = {
        "mdpi": 48,
        "hdpi": 72,
        "xhdpi": 96,
        "xxhdpi": 144,
        "xxxhdpi": 192,
    }
    for bucket, sz in sizes.items():
        out_dir = os.path.join(res, f"mipmap-{bucket}")
        os.makedirs(out_dir, exist_ok=True)
        icon = render_icon(sz)
        # Square
        icon.save(os.path.join(out_dir, "ic_launcher.png"), "PNG", optimize=True)
        # Round — Capacitor's legacy fallback uses a separate file name;
        # render the same image (the system applies the circle mask)
        icon.save(os.path.join(out_dir, "ic_launcher_round.png"), "PNG", optimize=True)
        print(f"  mipmap-{bucket}: {sz}x{sz} -> ic_launcher.png + ic_launcher_round.png")

    # Splash
    splash = render_splash(2732)
    splash_dir = os.path.join(res, "drawable")
    os.makedirs(splash_dir, exist_ok=True)
    splash_path = os.path.join(splash_dir, "splash.png")
    splash.save(splash_path, "PNG", optimize=True)
    print(f"  drawable/splash.png: 2732x2732 ({os.path.getsize(splash_path)} bytes)")

    # Preview copies (helpful for verification & report)
    preview_dir = r"C:\Users\1\.minimax\workspace\downloads\R81-previews"
    os.makedirs(preview_dir, exist_ok=True)
    for bucket, sz in sizes.items():
        icon = render_icon(sz)
        icon.save(os.path.join(preview_dir, f"pulse-icon-{bucket}-{sz}.png"), "PNG")
    # Splash preview at 540x540 (the report preview size)
    splash_small = render_splash(1080)
    splash_small.save(os.path.join(preview_dir, "pulse-splash-1080.png"), "PNG", optimize=True)
    print(f"  Previews -> {preview_dir}")


if __name__ == "__main__":
    main()
