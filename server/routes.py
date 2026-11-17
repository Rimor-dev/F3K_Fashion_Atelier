"""
F3K Fashion Atelier — HTTP routes.

Endpoints:
    POST /f3k_atelier/slot_upload       — upload slot image
    GET  /f3k_atelier/slot_file         — serve slot image by name (for preview)
    GET  /f3k_atelier/library           — prompt library JSON
"""

import os

try:
    from aiohttp import web
except ImportError:
    web = None

try:
    from server import PromptServer
except ImportError:
    PromptServer = None


_PACKAGE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_ASSETS_DIR  = os.path.join(_PACKAGE_DIR, "assets")
_SLOTS_DIR   = os.path.join(_ASSETS_DIR, "slots")
_PROMPTS_DIR = os.path.join(_ASSETS_DIR, "prompts")


def _safe_join(base: str, name: str):
    if not name:
        return None
    name = name.replace("\\", "/").lstrip("/")
    parts = name.split("/")
    if ".." in parts:
        return None
    full = os.path.abspath(os.path.join(base, *parts))
    if not full.startswith(os.path.abspath(base) + os.sep):
        return None
    return full


async def handle_slot_upload(request):
    if "multipart" not in (request.content_type or ""):
        return web.json_response({"error": "expected multipart"}, status=400)
    try:
        reader = await request.multipart()
        file_bytes = None
        filename = "slot.png"
        async for part in reader:
            if part.name == "file":
                filename = part.filename or filename
                file_bytes = await part.read()
        if file_bytes is None:
            return web.json_response({"error": "missing file"}, status=400)
        os.makedirs(_SLOTS_DIR, exist_ok=True)
        name = os.path.basename(filename)
        # Prevent overwrite collisions: prefix with a short hash of contents
        import hashlib
        h = hashlib.md5(file_bytes).hexdigest()[:8]
        base, ext = os.path.splitext(name)
        name = f"{base}_{h}{ext}"
        path = os.path.join(_SLOTS_DIR, name)
        with open(path, "wb") as f:
            f.write(file_bytes)
        return web.json_response({"status": "ok", "name": name})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def handle_slot_file(request):
    """Serve a slot image by ?name=... for preview in the UI."""
    name = request.query.get("name", "")
    path = _safe_join(_SLOTS_DIR, name)
    if not path or not os.path.isfile(path):
        return web.json_response({"error": "not found"}, status=404)
    import mimetypes
    mime, _ = mimetypes.guess_type(path)
    return web.FileResponse(path, headers={
        "Content-Type": mime or "application/octet-stream",
        "Cache-Control": "no-store",
    })


async def handle_library(request):
    path = os.path.join(_PROMPTS_DIR, "library_studio.json")
    if not os.path.isfile(path):
        return web.json_response({"error": "library not found"}, status=404)
    return web.FileResponse(
        path,
        headers={"Cache-Control": "no-store"},
    )


def register_routes():
    if PromptServer is None or web is None:
        print("[F3K Atelier] routes skipped (no aiohttp/PromptServer)")
        return
    if PromptServer.instance is None:
        print("[F3K Atelier] routes skipped (no PromptServer.instance)")
        return
    try:
        app = PromptServer.instance.app
        app.add_routes([
            web.post("/f3k_atelier/slot_upload", handle_slot_upload),
            web.get ("/f3k_atelier/slot_file",   handle_slot_file),
            web.get ("/f3k_atelier/library",     handle_library),
        ])
        print("[F3K Atelier] routes registered:")
        print("  POST /f3k_atelier/slot_upload")
        print("  GET  /f3k_atelier/slot_file")
        print("  GET  /f3k_atelier/library")
    except Exception as e:
        print(f"[F3K Atelier] route registration failed: {e}")