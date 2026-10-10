# -*- coding: utf-8 -*-
"""生成拾词生词本扩展图标：深蓝圆角底 + 金色开卷书 + 深蓝文字线 + 奶油色书签。
运行：python tools/make_icons.py（在项目根目录下执行）
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "icons")

BLUE = (31, 58, 95, 255)          # #1F3A5F 深蓝
GOLD = (212, 175, 55, 255)        # #D4AF37 金
GOLD_SPINE = (255, 220, 115, 255)  # 亮金（书脊，更亮更醒目）
BOOKMARK_EDGE = (146, 106, 15, 255)  # 书签描边（暗金，与金色书页拉开层次）
CREAM = (245, 230, 184, 255)      # #F5E6B8 奶油色（书签）
SIZE = 512


def draw_book(img):
    m = SIZE
    d = ImageDraw.Draw(img)
    # 圆角深蓝背景
    d.rounded_rectangle([0, 0, m - 1, m - 1], radius=int(m * 0.21), fill=BLUE)

    top, bottom = int(m * 0.34), int(m * 0.68)

    # 书脊（先画，被左右页微微压住，顶部露出一截）
    d.rounded_rectangle([int(m * 0.476), int(m * 0.31), int(m * 0.524), int(m * 0.71)],
                        radius=int(m * 0.02), fill=GOLD_SPINE)

    # 左右书页
    d.rounded_rectangle([int(m * 0.15), top, int(m * 0.462), bottom],
                        radius=int(m * 0.03), fill=GOLD)
    d.rounded_rectangle([int(m * 0.538), top, int(m * 0.85), bottom],
                        radius=int(m * 0.03), fill=GOLD)

    # 文字线（每页 2 条，小尺寸下更干净）
    lh = max(int(m * 0.028), 4)
    for y in (int(m * 0.44), int(m * 0.53)):
        d.rounded_rectangle([int(m * 0.21), y, int(m * 0.41), y + lh],
                            radius=lh // 2, fill=BLUE)
        d.rounded_rectangle([int(m * 0.59), y, int(m * 0.66), y + lh],
                            radius=lh // 2, fill=BLUE)

    # 书签：从右页顶部探出并插入约 1/5 页高，底边 V 形缺口；
    # 先画暗金描边再填奶油色，与金色书页拉开对比
    def bookmark_poly(pad):
        return [
            (int(m * 0.655) - pad, int(m * 0.22)),
            (int(m * 0.745) + pad, int(m * 0.22)),
            (int(m * 0.745) + pad, int(m * 0.425)),
            (int(m * 0.70), int(m * 0.38)),
            (int(m * 0.655) - pad, int(m * 0.425)),
        ]

    d.polygon(bookmark_poly(int(m * 0.012)), fill=BOOKMARK_EDGE)
    d.polygon(bookmark_poly(0), fill=CREAM)

    # 书签与书页交界处压一条深蓝细线，制造"页边在前"的插入层次
    d.rectangle([int(m * 0.643), top, int(m * 0.757), top + int(m * 0.013)], fill=BLUE)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    base = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw_book(base)
    for px in (16, 32, 48, 128):
        img = base.resize((px, px), Image.LANCZOS)
        path = os.path.join(OUT_DIR, f"icon{px}.png")
        img.save(path)
        print("saved", path)


if __name__ == "__main__":
    main()
