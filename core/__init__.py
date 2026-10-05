"""The `core` package: detection, tracking, and speed-estimation logic
shared by the dashboard, the live-camera tab, and the standalone scripts.

This file is also Streamlit Community Cloud's configured "main file path"
for this deployment (set when the app was first created, apparently
pointing at the repo's original single-file layout before the real
dashboard moved to dashboard/app.py). That setting isn't editable from the
current Streamlit Cloud UI after an app already exists - there's no "main
file path" field in Settings any more, only App URL / Python version /
Sharing / Secrets - and deleting and recreating the app to fix it would
assign a new random URL, breaking every link already shared to this one
(README, the on-device page's cross-link, docs/roadmap.md).

So instead: when Streamlit actually executes this file as the app's entry
point (which happens with `__name__ == "__main__"`, the same way `python
script.py` behaves - never true for a normal `import core` or
`from core.detector import ...`), it hands off to the real dashboard. Any
ordinary import of this package, including everything in the test suite
and every other module under core/ and dashboard/ that does
`from core.X import Y`, is completely unaffected - this block never runs
for them.
"""
if __name__ == "__main__":
    import runpy
    import sys
    from pathlib import Path

    _repo_root = Path(__file__).resolve().parent.parent
    # runpy.run_path() doesn't reliably leave the repo root importable (it
    # manages sys.path[0] itself around the executed file), and
    # dashboard/app.py immediately does `from core.speed_estimator import
    # ...` etc. - so make sure the repo root is on sys.path *before*
    # handing off, regardless of whatever runpy does around it.
    if str(_repo_root) not in sys.path:
        sys.path.insert(0, str(_repo_root))
    _dashboard_app = _repo_root / "dashboard" / "app.py"
    runpy.run_path(str(_dashboard_app), run_name="__main__")
