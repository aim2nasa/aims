# -*- coding: utf-8 -*-
"""
Test: X button relative offset from Select button
"""
import os
import sys
import shutil
import codecs
from java.awt import Color, BasicStroke, Font
from javax.imageio import ImageIO
from java.io import File

# SikuliX imports
from sikuli import *

# Image paths
IMG_SELECT_BTN = "img/1769515056052.png"
IMG_VARIABLE_REPORT_CLOSE_BTN = "img/1769493031653.png"

# Offset (Select btn -> X btn)
OFFSET_DX = 13
OFFSET_DY = -62

# Output
OUTPUT_DIR = "D:\\tmp"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "test_x_offset.png")

def draw_multi_markers(img_path, markers, output_path):
    """Draw multiple markers on image
    markers: [(x, y, label, color), ...]
    """
    img = ImageIO.read(File(img_path))
    g = img.createGraphics()

    for (x, y, label, color) in markers:
        g.setColor(color)
        g.setStroke(BasicStroke(3))
        # crosshair
        g.drawLine(x - 30, y, x + 30, y)
        g.drawLine(x, y - 30, x, y + 30)
        # circle
        g.drawOval(x - 15, y - 15, 30, 30)
        # label
        font = Font("SansSerif", Font.BOLD, 14)
        g.setFont(font)
        g.drawString(label, x + 20, y - 10)

    # draw line between first two markers
    if len(markers) >= 2:
        g.setColor(Color.ORANGE)
        g.setStroke(BasicStroke(2))
        g.drawLine(markers[0][0], markers[0][1], markers[1][0], markers[1][1])

    g.dispose()
    ImageIO.write(img, "png", File(output_path))

print("=" * 60)
print("X-button offset test")
print("=" * 60)

# 1. Capture screen
print("[1] Screen capture...")
screen = Screen()
capture_path = screen.capture(screen.getBounds()).getFile()
print("    Captured: %s" % capture_path)

# 2. Find Select button
print("[2] Finding SELECT button...")
select_pattern = Pattern(IMG_SELECT_BTN).similar(0.7)
if exists(select_pattern, 5):
    select_match = find(select_pattern)
    sx = int(select_match.getCenter().getX())
    sy = int(select_match.getCenter().getY())
    print("    SELECT btn: (%d, %d)" % (sx, sy))

    # 3. Calculate X button position
    x_btn_x = sx + OFFSET_DX
    x_btn_y = sy + OFFSET_DY
    print("    X btn CALC: (%d, %d)  [offset: dx=%d, dy=%d]" % (x_btn_x, x_btn_y, OFFSET_DX, OFFSET_DY))

    # 4. Also try to find X button image (for comparison)
    print("[3] Finding X button image (comparison)...")
    x_btn_actual = None
    if exists(IMG_VARIABLE_REPORT_CLOSE_BTN, 3):
        x_match = find(IMG_VARIABLE_REPORT_CLOSE_BTN)
        ax = int(x_match.getCenter().getX())
        ay = int(x_match.getCenter().getY())
        x_btn_actual = (ax, ay)
        print("    X btn ACTUAL: (%d, %d)" % (ax, ay))
        print("    ERROR: dx=%d, dy=%d" % (x_btn_x - ax, x_btn_y - ay))
    else:
        print("    X btn image NOT FOUND (this is why fallback is needed)")

    # 5. Draw markers on screenshot
    print("[4] Drawing markers...")
    markers = [
        (sx, sy, "SELECT (%d,%d)" % (sx, sy), Color.BLUE),
        (x_btn_x, x_btn_y, "X-CALC (%d,%d)" % (x_btn_x, x_btn_y), Color.RED),
    ]
    if x_btn_actual:
        markers.append((x_btn_actual[0], x_btn_actual[1], "X-ACTUAL (%d,%d)" % x_btn_actual, Color(0, 180, 0)))

    draw_multi_markers(capture_path, markers, OUTPUT_FILE)
    print("    Saved: %s" % OUTPUT_FILE)

    print("")
    print("=== RESULT ===")
    print("  SELECT btn : (%d, %d)" % (sx, sy))
    print("  X btn CALC : (%d, %d)  [dx=%d, dy=%d]" % (x_btn_x, x_btn_y, OFFSET_DX, OFFSET_DY))
    if x_btn_actual:
        print("  X btn REAL : (%d, %d)" % x_btn_actual)
        print("  OFFSET ERR : dx=%d, dy=%d px" % (x_btn_x - x_btn_actual[0], x_btn_y - x_btn_actual[1]))
else:
    print("    [ERROR] SELECT button NOT FOUND!")
    print("    Make sure the popup is open.")
    shutil.copy(capture_path, OUTPUT_FILE)

print("=" * 60)
print("Done. Output: %s" % OUTPUT_FILE)
print("=" * 60)
