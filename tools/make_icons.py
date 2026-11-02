#!/usr/bin/env python3
"""Draw the app icons (three gauge bars under a target line) as PNGs, stdlib only.

Usage: python3 -I tools/make_icons.py <icons_dir>
"""
import os
import struct
import sys
import zlib

BG = (0x12, 0x31, 0x3A)
LINE = (0xEE, 0xF3, 0xF1)
BARS = [((0xEB, 0x68, 0x34), 0.38), ((0x2A, 0x78, 0xD6), 0.28), ((0x1B, 0xAF, 0x7A), 0.46)]  # colour, top (fraction of size)
BOTTOM, WIDTH, GAP, LEFT = 0.74, 0.13, 0.06, 0.245


def inside_round_rect(x, y, x0, y0, x1, y1, r):
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def shapes(n):
    out = []
    for i, (colour, top) in enumerate(BARS):
        x0 = (LEFT + i * (WIDTH + GAP)) * n
        out.append((colour, (x0, top * n, x0 + WIDTH * n, BOTTOM * n, WIDTH * n / 2)))
    out.append((LINE, (0.19 * n, 0.32 * n, 0.81 * n, 0.345 * n, 0.0125 * n)))
    return out


def draw(n, ss=3):
    sh = shapes(n)
    px = bytearray()
    for y in range(n):
        row = bytearray()
        for x in range(n):
            acc = [0, 0, 0]
            for sy in range(ss):
                for sx in range(ss):
                    fx, fy = x + (sx + 0.5) / ss, y + (sy + 0.5) / ss
                    col = BG
                    for colour, rect in sh:
                        if inside_round_rect(fx, fy, *rect):
                            col = colour
                    for k in range(3):
                        acc[k] += col[k]
            row += bytes(round(a / (ss * ss)) for a in acc)
        px += b"\x00" + row
    return px


def write_png(path, n, raw):
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", n, n, 8, 2, 0, 0, 0))
                + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b""))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    os.makedirs(sys.argv[1], exist_ok=True)
    for n in (180, 192, 512):
        write_png(os.path.join(sys.argv[1], f"icon-{n}.png"), n, draw(n))
        print("wrote", n)
