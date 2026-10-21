"""Upstream media host allowlist — 「哪些外站域名允许被代理/抓取」的唯一实现。

放在 ``app/core/`` 而不是 ``app/api/v1/media.py``：同一份策略有两个消费者 ——
公开的 ``/media/proxy`` 路由与后台的 ``thumbnail_service`` 抓缩略图。后者原先
从 ``app.api.v1.media`` 反向 import 两个 helper（service → api 的分层倒置），
而且那还是**函数内惰性 import** 才能避开循环依赖。

一个事实只放一个家：域名表、Referer 表和两个判定函数都在这里，路由与 service
都从这里取，路由侧保留同名薄封装以免改动面扩散。
"""

from __future__ import annotations

__all__ = [
    "PROXY_HOST_SUFFIXES",
    "PROXY_REFERER",
    "host_allowed",
    "referer_for",
]

# Hostname suffixes whose URLs we will proxy. Keep in sync with the frontend
# allowlist in frontend/src/lib/api.ts (mediaUrl).
# NOTE: aliyuncs.com is deliberately NOT here — OSS bucket domains are
# attacker-controllable ({bucket}.oss-{region}.aliyuncs.com), and with
# redirect-following disabled upstreams cannot jump to internal hosts anyway.
# OSS-hosted images should be served directly via signed/CDN URLs instead.
PROXY_HOST_SUFFIXES = (
    "ytimg.com",
    "hdslb.com",
    "biliimg.com",
    "douyinpic.com",
    "douyincdn.com",
    "douyinstatic.com",
)

# Per-host Referer to satisfy hotlink protection. Bilibili's CDN rejects
# requests whose Referer isn't a bilibili.com origin.
PROXY_REFERER = {
    "hdslb.com": "https://www.bilibili.com/",
    "biliimg.com": "https://www.bilibili.com/",
    "douyinpic.com": "https://www.douyin.com/",
    "douyincdn.com": "https://www.douyin.com/",
    "douyinstatic.com": "https://www.douyin.com/",
}


def host_allowed(host: str) -> bool:
    """True when ``host`` is one of the allowlisted upstream media domains.

    Suffix match, not equality: ``img.hdslb.com`` is allowed, ``hdslb.com.evil.com``
    is not (the check is ``host == suf or host.endswith("." + suf)``).
    """
    host = host.lower()
    return any(host == suf or host.endswith("." + suf) for suf in PROXY_HOST_SUFFIXES)


def referer_for(host: str) -> str:
    """The Referer header an upstream host expects, or its own origin."""
    host = host.lower()
    for suf, ref in PROXY_REFERER.items():
        if host == suf or host.endswith("." + suf):
            return ref
    return f"https://{host}/"
