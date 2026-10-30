"""生成 PWA 图标：品牌紫底 + 白色「久」字。

输出三种：
- icon-192.png / icon-512.png    普通图标（圆角矩形，用于桌面/启动画面）
- icon-maskable-512.png          maskable 图标（满底 + 文字收进中心安全区，避免被系统裁形切掉）
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ACCENT = (79, 70, 229)  # --accent: #4f46e5
WHITE = (255, 255, 255)
OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "icons"
# Windows 自带的中文字体；找不到就退回默认字体
FONT_CANDIDATES = [
    "C:/Windows/Fonts/msyhbd.ttc",
    "C:/Windows/Fonts/msyh.ttc",
    "C:/Windows/Fonts/simhei.ttf",
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def draw_glyph(draw: ImageDraw.ImageDraw, box: int, center_ratio: float) -> None:
    """把「久」字画在画布中心，字号 = 画布 * center_ratio。"""
    size = int(box * center_ratio)
    font = load_font(size)
    text = "久"
    left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
    x = (box - (right - left)) / 2 - left
    y = (box - (bottom - top)) / 2 - top
    draw.text((x, y), text, font=font, fill=WHITE)


def make_rounded(size: int, radius_ratio: float = 0.22) -> Image.Image:
    """圆角矩形图标（普通用途）。"""
    scale = 4  # 先大图再缩小，边缘更平滑
    box = size * scale
    img = Image.new("RGBA", (box, box), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle((0, 0, box - 1, box - 1), radius=int(box * radius_ratio), fill=ACCENT)
    draw_glyph(draw, box, 0.52)
    return img.resize((size, size), Image.LANCZOS)


def make_maskable(size: int) -> Image.Image:
    """maskable 图标：底色铺满整个画布，字形收进中心安全区（约 66%）。"""
    scale = 4
    box = size * scale
    img = Image.new("RGBA", (box, box), ACCENT)
    draw = ImageDraw.Draw(img)
    draw_glyph(draw, box, 0.40)
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    outputs = {
        "icon-192.png": make_rounded(192),
        "icon-512.png": make_rounded(512),
        "icon-maskable-512.png": make_maskable(512),
    }
    for name, image in outputs.items():
        path = OUT_DIR / name
        image.save(path, "PNG")
        print(f"{path.name}: {image.size[0]}x{image.size[1]}")


if __name__ == "__main__":
    main()
