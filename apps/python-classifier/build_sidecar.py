"""
Build the Python classifier into a standalone executable using PyInstaller,
then copy it into src-tauri/binaries/ with the correct target-triple naming
so that Tauri can bundle it as a sidecar.

Usage:
    python build_sidecar.py          # build for the current platform
    python build_sidecar.py --clean  # remove previous build artifacts first
"""

import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
BINARIES_DIR = PROJECT_ROOT / "src-tauri" / "binaries"


def get_target_triple() -> str:
    machine = platform.machine().lower()
    system = platform.system().lower()

    arch_map = {
        "x86_64": "x86_64",
        "amd64": "x86_64",
        "aarch64": "aarch64",
        "arm64": "aarch64",
    }
    arch = arch_map.get(machine, machine)

    if system == "windows":
        return f"{arch}-pc-windows-msvc"
    elif system == "linux":
        return f"{arch}-unknown-linux-gnu"
    elif system == "darwin":
        return f"{arch}-apple-darwin"
    else:
        return f"{arch}-unknown-{system}"


def main():
    clean = "--clean" in sys.argv

    target_triple = get_target_triple()
    ext = ".exe" if platform.system() == "Windows" else ""
    output_name = f"classifier-{target_triple}{ext}"

    print(f"Building classifier sidecar for {target_triple}...")

    if clean:
        for d in (SCRIPT_DIR / "build", SCRIPT_DIR / "dist"):
            if d.exists():
                shutil.rmtree(d)
        spec = SCRIPT_DIR / "classifier.spec"
        if spec.exists():
            spec.unlink()

    # Ensure all dependencies are installed in the current Python environment
    requirements_file = SCRIPT_DIR / "requirements.txt"
    if requirements_file.exists():
        print("Installing dependencies from requirements.txt...")
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "-r", str(requirements_file)],
            check=True,
        )

    hidden_imports = [
        "groq",
        "fastapi",
        "uvicorn",
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        "dotenv",
        "pydantic",
        "httpx",
        "anyio",
        "sniffio",
        "starlette",
        "starlette.routing",
        "starlette.responses",
        "starlette.middleware",
        "starlette.middleware.cors",
    ]

    pyinstaller_args = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--onefile",
        "--name",
        "classifier",
        "--distpath",
        str(SCRIPT_DIR / "dist"),
        "--workpath",
        str(SCRIPT_DIR / "build"),
        "--specpath",
        str(SCRIPT_DIR),
        "--noconfirm",
        "--clean",
    ]

    for imp in hidden_imports:
        pyinstaller_args.extend(["--hidden-import", imp])

    pyinstaller_args.append(str(SCRIPT_DIR / "main.py"))

    print(f"Running: {' '.join(pyinstaller_args)}")
    subprocess.run(pyinstaller_args, check=True, cwd=str(SCRIPT_DIR))

    built_exe = SCRIPT_DIR / "dist" / f"classifier{ext}"
    if not built_exe.exists():
        print(f"ERROR: Expected output not found at {built_exe}")
        sys.exit(1)

    BINARIES_DIR.mkdir(parents=True, exist_ok=True)

    dest = BINARIES_DIR / output_name
    shutil.copy2(str(built_exe), str(dest))
    print(f"Copied {built_exe} -> {dest}")
    print(f"Sidecar binary ready: {dest}")


if __name__ == "__main__":
    main()
