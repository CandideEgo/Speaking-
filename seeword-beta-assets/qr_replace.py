# -*- coding: utf-8 -*-
"""通用：把来源图的真实二维码替换进目标图，并验证可扫描。
用法: python qr_replace.py <二维码来源图> <待替换目标图> <输出图>
"""
import sys
import cv2
import numpy as np

def load_cv2(path):
    return cv2.imdecode(np.fromfile(path, dtype=np.uint8), cv2.IMREAD_COLOR)

def save_cv2(path, img):
    ok, buf = cv2.imencode('.png', img)
    buf.tofile(path)
    return ok

def quad_with_margin(pts, ratio):
    c = pts.reshape(4, 2).mean(axis=0)
    return np.array([c + (p - c) * (1 + ratio) for p in pts.reshape(4, 2)], dtype=np.float32)

src_path, dst_img_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
src_img = load_cv2(src_path)
dst_img = load_cv2(dst_img_path)

det = cv2.QRCodeDetector()
data_src, pts_src, _ = det.detectAndDecode(src_img)
data_dst, pts_dst, _ = det.detectAndDecode(dst_img)
print('SRC qr:', repr(data_src))
print('DST qr before:', repr(data_dst))

if pts_src is None:
    print('ERROR: 来源图二维码未检测到'); sys.exit(1)

src = quad_with_margin(pts_src, 0.12)
if pts_dst is not None:
    dst = quad_with_margin(pts_dst, 0.06)
else:
    print('目标图二维码未检测到，按来源同比例坐标映射')
    sh, sw = src_img.shape[:2]
    dh, dw = dst_img.shape[:2]
    sx, sy = dw / sw, dh / sh
    dst = src * np.array([sx, sy], dtype=np.float32)

M = cv2.getPerspectiveTransform(src, dst)
h, w = dst_img.shape[:2]
warped = cv2.warpPerspective(src_img, M, (w, h))
mask = np.zeros((h, w), dtype=np.uint8)
cv2.fillConvexPoly(mask, np.int32(dst), 255)
mask = cv2.erode(mask, np.ones((3, 3), np.uint8), iterations=1)
out = dst_img.copy()
out[mask > 0] = warped[mask > 0]

data_final, _, _ = det.detectAndDecode(out)
if not data_final:
    x, y, bw, bh = cv2.boundingRect(np.int32(dst))
    crop = out[max(0, y-20):y+bh+20, max(0, x-20):x+bw+20]
    data_final, _, _ = det.detectAndDecode(crop)
print('FINAL qr:', repr(data_final))
save_cv2(out_path, out)
print('SAVED', out_path, '; QR OK =', bool(data_final))
sys.exit(0 if data_final else 2)
