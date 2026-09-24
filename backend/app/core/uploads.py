"""Bounded reads for user uploads.

``UploadFile.read()`` without a size argument materializes the whole part in
memory, so a size cap checked *after* that call protects nothing. With nginx's
``client_max_body_size 500m`` a single authenticated request could therefore
put hundreds of megabytes on the heap before the 413 was raised. Upload routes
read through :func:`read_upload_bounded` instead.

Two layers, because neither alone is enough:

* the declared ``Content-Length`` is checked first, so an honest oversized
  request is refused before any of its content is read into memory;
* the part is then read in chunks and aborted the moment the cumulative size
  exceeds the cap — a client may omit ``Content-Length`` (chunked upload) or
  simply lie about it.
"""

from fastapi import HTTPException, Request, UploadFile

_CHUNK = 1024 * 1024

# The multipart envelope (boundaries, other form fields) counts towards the
# request's Content-Length but not towards the part's size, so the pre-check
# has to leave room for it — otherwise a file of exactly ``max_bytes`` would
# be refused when the client declares the request length honestly.
_ENVELOPE_SLACK = 8 * 1024


async def read_upload_bounded(
    request: Request,
    file: UploadFile,
    max_bytes: int,
    *,
    status_code: int,
    detail: str,
) -> bytes:
    """Read ``file``, enforcing a hard ``max_bytes`` ceiling.

    Raises ``HTTPException(status_code, detail)`` as soon as the upload is
    known to be oversized — before the excess reaches memory.
    """
    declared = request.headers.get("content-length")
    if declared is not None and declared.isdigit() and int(declared) > max_bytes + _ENVELOPE_SLACK:
        raise HTTPException(status_code=status_code, detail=detail)

    buf = bytearray()
    while True:
        chunk = await file.read(_CHUNK)
        if not chunk:
            break
        buf.extend(chunk)
        if len(buf) > max_bytes:
            raise HTTPException(status_code=status_code, detail=detail)
    return bytes(buf)
