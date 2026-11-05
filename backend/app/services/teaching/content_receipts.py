"""Verify gateway-issued content evidence using public keys only.

This attests an observed model input/result, not material rights, model quality,
provider billing or the truth of a source document.
"""

import re
from typing import Any

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

AUDIENCE = "seeword-content-publication"
TOKEN_TYPE = "seeword-content-receipt+jwt"
CHECKS = {"evidence_entails_answer", "distractors_supported", "hints_non_revealing", "one_correct_option"}
_BASE_FIELDS = {"model", "model_family", "provider_attempt_id", "logical_call_id", "input_sha256"}


def public_key(value: str) -> Ed25519PublicKey:
    key = serialization.load_pem_public_key(value.encode())
    if not isinstance(key, Ed25519PublicKey):
        raise ValueError("Content receipts require an Ed25519 public key")
    return key


def _kind(value: dict[str, Any]) -> str | None:
    if not all(isinstance(value.get(k), str) and 0 < len(value[k]) <= 300 for k in _BASE_FIELDS):
        return None
    if re.fullmatch(r"[a-f0-9]{64}", value["input_sha256"]) is None:
        return None
    if set(value) == _BASE_FIELDS | {"option_order", "selected_position"}:
        order = value["option_order"]
        position = value["selected_position"]
        if (
            isinstance(order, list)
            and len(order) == 4
            and set(order) == set("ABCD")
            and type(position) is int
            and 0 <= position < 4
        ):
            return "blind-answer-v1"
    if set(value) == _BASE_FIELDS | {"checks"}:
        checks = value["checks"]
        if isinstance(checks, dict) and set(checks) == CHECKS and all(type(v) is bool for v in checks.values()):
            return "teaching-review-v1"
    return None


def verify_receipt(receipt: dict, *, keys: dict[str, str], issuer: str, max_age_seconds: int) -> bool:
    try:
        token = receipt.get("gateway_receipt")
        if not isinstance(token, str) or not 0 < len(token) <= 16384:
            return False
        expected = {key: value for key, value in receipt.items() if key != "gateway_receipt"}
        kind = _kind(expected)
        if kind is None:
            return False
        header = jwt.get_unverified_header(token)
        if set(header) != {"alg", "kid", "typ"} or header["alg"] != "EdDSA" or header["typ"] != TOKEN_TYPE:
            return False
        kid = header["kid"]
        if not isinstance(kid, str) or kid not in keys:
            return False
        claims = jwt.decode(
            token,
            public_key(keys[kid]),
            algorithms=["EdDSA"],
            issuer=issuer,
            audience=AUDIENCE,
            options={"require": ["iss", "aud", "iat", "exp", "jti", "v", "kind", "prompt_version", "receipt"]},
        )
        if type(claims["iat"]) is not int or type(claims["exp"]) is not int:
            return False
        signed = claims["receipt"]
        return (
            type(claims["v"]) is int
            and claims["v"] == 1
            and claims["aud"] == AUDIENCE
            and claims["kind"] == kind
            and claims["prompt_version"] == kind
            and isinstance(claims["jti"], str)
            and 0 < len(claims["jti"]) <= 100
            and 0 < claims["exp"] - claims["iat"] <= max_age_seconds
            and isinstance(signed, dict)
            and _kind(signed) == kind
            and signed == expected
        )
    except (jwt.PyJWTError, ValueError, TypeError, KeyError, AttributeError):
        return False
