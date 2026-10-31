"""重新生成 GPU worker 的完整依赖锁（A11 / OPS-07）。

做法：让 pip 在**不安装**的前提下解析 ``requirements.txt`` 的全部传递依赖
（``pip install --dry-run --report``），再把 ``name==version`` 排序写回
``requirements.lock.txt``。锁的作用不是让安装更快，而是让审计与 SBOM 有确定
的输入：CUDA 机器上装到的版本 = 这里钉住的版本。

用法（仓库根目录，用 GPU worker 目标平台的解释器）::

    python gpu-worker/scripts/lock_requirements.py

平台警告：解析结果与平台相关（Windows/Linux 的 torch 轮子不同）。换部署平台
必须重新生成，并在锁文件头部写清平台；不能跨平台复用。
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

GPU_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = GPU_ROOT.parent
LOCK_FILE = GPU_ROOT / "requirements.lock.txt"

HEADER = """# GPU worker 运行依赖完整锁（含传递依赖）。
#
# 生成：python gpu-worker/scripts/lock_requirements.py
# 平台：{platform} / CPython {py}
# 说明：
#   - torch/torchaudio 的版本号与 CUDA 轮子一致；GPU 机器上先按 README 用
#     `--index-url https://download.pytorch.org/whl/cu128` 装好 CUDA 版，
#     再 `pip install -r requirements.lock.txt` 时这两行已是同一版本，不会降级。
#   - 换部署平台必须重新生成；跨平台复用锁等于没锁。
#   - 审计：python backend/scripts/pip_audit_gate.py
#       -r ../gpu-worker/requirements.lock.txt
#       --ignore-file ../gpu-worker/.pip-audit-ignore --no-deps
"""


def main() -> int:
    with tempfile.TemporaryDirectory() as tmpdir:
        report = Path(tmpdir) / "resolution.json"
        cmd = [
            sys.executable,
            "-m",
            "pip",
            "install",
            "--dry-run",
            "--ignore-installed",
            "--quiet",
            "--report",
            str(report),
            "-r",
            str(GPU_ROOT / "requirements.txt"),
        ]
        result = subprocess.run(cmd, cwd=REPO_ROOT)
        if result.returncode != 0 or not report.is_file():
            print("pip 解析失败；锁文件未更新（不使用旧结果冒充新结果）。", file=sys.stderr)
            return 1
        data = json.loads(report.read_text(encoding="utf-8"))

    pins: dict[str, str] = {}
    for item in data.get("install", []):
        metadata = item.get("metadata") or {}
        name, version = metadata.get("name"), metadata.get("version")
        if name and version:
            pins[name] = version

    header = HEADER.format(platform=sys.platform, py=f"{sys.version_info.major}.{sys.version_info.minor}")
    body = "\n".join(f"{name}=={version}" for name, version in sorted(pins.items(), key=lambda kv: kv[0].lower()))
    LOCK_FILE.write_text(f"{header}\n{body}\n", encoding="utf-8")
    print(f"写入 {LOCK_FILE.relative_to(REPO_ROOT)}：{len(pins)} 个包")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
