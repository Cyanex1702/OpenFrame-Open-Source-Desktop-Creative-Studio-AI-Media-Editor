"""Generate deterministic OpenFrame application icons from the product mark."""

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "src-tauri" / "icons"
LIME = (185, 247, 90, 255)
INK = (8, 10, 13, 255)


def make_icon(size: int) -> Image.Image:
    scale = size / 256
    image = Image.new("RGBA", (size, size), INK)
    draw = ImageDraw.Draw(image)

    outer = tuple(round(value * scale) for value in (35, 35, 221, 221))
    radius = round(42 * scale)
    draw.rounded_rectangle(outer, radius=radius, fill=LIME)

    inner = tuple(round(value * scale) for value in (83, 83, 173, 173))
    inner_radius = round(12 * scale)
    draw.rounded_rectangle(inner, radius=inner_radius, fill=INK)

    dot_center = (round(207 * scale), round(50 * scale))
    dot_radius = round(25 * scale)
    draw.ellipse(
        (
            dot_center[0] - dot_radius,
            dot_center[1] - dot_radius,
            dot_center[0] + dot_radius,
            dot_center[1] + dot_radius,
        ),
        fill=INK,
        outline=LIME,
        width=max(2, round(7 * scale)),
    )
    return image


def main() -> None:
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    make_icon(32).save(ICON_DIR / "32x32.png")
    make_icon(128).save(ICON_DIR / "128x128.png")
    make_icon(256).save(ICON_DIR / "128x128@2x.png")
    make_icon(256).save(
        ICON_DIR / "icon.ico",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )


if __name__ == "__main__":
    main()
