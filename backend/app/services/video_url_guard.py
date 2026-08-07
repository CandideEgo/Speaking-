"""视频 URL 安全校验 — 防 SSRF（域名白名单 + 私网 IP 拦截）。

Scheme 层（``schemas.video.validate_source_url``）已把 URL 限制为 http/https；
这里补充两层防线：

1. **域名后缀白名单**：仅允许 YouTube / Bilibili 系域名，从入口杜绝
   指向内网（169.254.169.254、10.x、127.x…）的 URL；
2. **解析结果 IP 拦截**：``getaddrinfo`` 解析全部 A/AAAA 记录，任一为
   私网 / 回环 / 链路本地 / 保留 / 组播 / 未指定地址即拒绝（防 DNS
   将公共域名解析到内网）；
3. **DNS rebinding 防护**：延时后二次解析比对 IP 集，不一致则拒绝
   （首次校验通过后解析被换到内网地址的攻击面）。

失败抛 ``AppError(400, VALIDATION_ERROR, ...)``，由全局 handler 转统一
envelope，各 seed/submit 路由无需额外 try/except。
"""

from __future__ import annotations

import asyncio
import ipaddress
import socket
from urllib.parse import urlparse

from app.core.errors import AppError, ErrorCode

# 平台域名后缀（host == 后缀 或 host.endswith("." + 后缀) 均视为合法）。
# 新增支持平台时在此扩展，并同步前端/文档。
ALLOWED_HOST_SUFFIXES = (
    "youtube.com",
    "youtu.be",
    "bilibili.com",
    "b23.tv",
    "bilibili.tv",
)


def _host_allowed(host: str) -> bool:
    h = host.lower().rstrip(".")
    return any(h == suf or h.endswith("." + suf) for suf in ALLOWED_HOST_SUFFIXES)


def _is_blocked_ip(ip_str: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return True  # 无法解析的地址一律按危险处理
    return ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified


def _resolve_ips(host: str) -> set[str]:
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError:
        return set()
    return {info[4][0] for info in infos}


async def validate_video_url(url: str, *, rebinding_delay: float = 1.0) -> None:
    """校验视频 URL 是否为允许的平台域名且解析结果不含内网地址。

    Args:
        url: 用户提交的视频链接（http/https）。
        rebinding_delay: DNS rebinding 二次解析前的等待秒数；测试传 0。
    """
    parsed = urlparse(url)
    host = parsed.hostname
    if not host:
        raise AppError(400, ErrorCode.VALIDATION_ERROR, "视频链接缺少主机名")
    if not _host_allowed(host):
        raise AppError(400, ErrorCode.VALIDATION_ERROR, "仅支持 YouTube / Bilibili 视频链接")

    ips1 = _resolve_ips(host)
    if not ips1:
        raise AppError(400, ErrorCode.VALIDATION_ERROR, "视频域名解析失败")
    if any(_is_blocked_ip(ip) for ip in ips1):
        raise AppError(400, ErrorCode.VALIDATION_ERROR, "不支持内网/本地视频地址")

    # DNS rebinding 防护：延时后二次解析，IP 集不一致说明解析被换过，拒绝。
    if rebinding_delay > 0:
        await asyncio.sleep(rebinding_delay)
    ips2 = _resolve_ips(host)
    if not ips2 or ips1 != ips2:
        raise AppError(400, ErrorCode.VALIDATION_ERROR, "视频域名解析不稳定，请稍后重试")
