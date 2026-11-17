"""
F3K Fashion Atelier
Fashion atelier combine node for Flux 3 Klein.
"""

import os

PACKAGE_DIR      = os.path.dirname(os.path.abspath(__file__))
ASSETS_DIR       = os.path.join(PACKAGE_DIR, "assets")
WEB_DIR          = os.path.join(PACKAGE_DIR, "web")
PROMPTS_DIR      = os.path.join(ASSETS_DIR, "prompts")
SLOTS_DIR        = os.path.join(ASSETS_DIR, "slots")

for _d in (ASSETS_DIR, WEB_DIR, PROMPTS_DIR, SLOTS_DIR):
    os.makedirs(_d, exist_ok=True)

try:
    from .combine_node import F3K_FashionAtelier
    NODE_CLASS_MAPPINGS = {"F3K_FashionAtelier": F3K_FashionAtelier}
    NODE_DISPLAY_NAME_MAPPINGS = {"F3K_FashionAtelier": "👗 F3K Fashion Atelier"}
except Exception as e:
    print(f"[F3K Atelier] combine_node import failed: {e}")
    NODE_CLASS_MAPPINGS = {}
    NODE_DISPLAY_NAME_MAPPINGS = {}

WEB_DIRECTORY = "./web"

try:
    from .server.routes import register_routes
    register_routes()
except Exception as e:
    print(f"[F3K Atelier] server routes skipped: {e}")

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]