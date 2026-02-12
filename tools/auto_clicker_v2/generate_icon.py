# -*- coding: utf-8 -*-
"""AutoClicker 커스텀 아이콘 생성 스크립트
웹페이지 SVG 커서 아이콘과 동일한 디자인으로 .ico 생성
배경: 투명, 커서: 파란색(#2563eb), 도트: 반투명 파란색
"""
from PIL import Image, ImageDraw


def draw_cursor_icon(size):
    """투명 배경 + 파란색 커서 아이콘"""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    s = size / 24.0
    blue = '#2563eb'

    # 커서 화살표 (SVG path: M5 2l12 10-5 .5 3 6.5-2 1-3-6.5L5 18V2z)
    cursor_points = [
        (5 * s, 2 * s),
        (17 * s, 12 * s),
        (12 * s, 12.5 * s),
        (15 * s, 19 * s),
        (13 * s, 20 * s),
        (10 * s, 13.5 * s),
        (5 * s, 18 * s),
    ]

    # 파란색 커서 + 진한 테두리 (작은 아이콘에서도 식별 가능)
    if size >= 32:
        draw.polygon(cursor_points, fill=blue, outline='#1e40af')
        draw.line(cursor_points + [cursor_points[0]], fill='#1e40af', width=max(1, int(s * 0.6)))
    else:
        draw.polygon(cursor_points, fill=blue)

    # 클릭 도트 1: (19, 5) r=1.5
    cx1, cy1, r1 = 19 * s, 5 * s, 1.5 * s
    draw.ellipse(
        [cx1 - r1, cy1 - r1, cx1 + r1, cy1 + r1],
        fill=(37, 99, 235, 128)  # 반투명 파란색
    )

    # 클릭 도트 2: (21, 10) r=1
    cx2, cy2, r2 = 21 * s, 10 * s, 1.0 * s
    draw.ellipse(
        [cx2 - r2, cy2 - r2, cx2 + r2, cy2 + r2],
        fill=(37, 99, 235, 90)  # 더 반투명
    )

    return img


if __name__ == '__main__':
    import os

    out_dir = os.path.dirname(os.path.abspath(__file__))

    # 투명 배경 + 파란색 커서
    sizes = [16, 32, 48, 64, 128, 256]
    images = [draw_cursor_icon(sz) for sz in sizes]

    ico_path = os.path.join(out_dir, 'autoclicker.ico')
    images[0].save(
        ico_path,
        format='ICO',
        sizes=[(sz, sz) for sz in sizes],
        append_images=images[1:]
    )
    print(f"Created: {ico_path}")

    # PNG 미리보기 (256px)
    png_path = os.path.join(out_dir, 'autoclicker_icon_preview.png')
    images[-1].save(png_path)
    print(f"Preview: {png_path}")
