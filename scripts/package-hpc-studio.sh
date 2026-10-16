#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# HPC Studio - Linux Packaging Utility
# ==============================================================================
# This script builds and packages HPC Studio Desktop for Linux:
#   - Debian / Ubuntu package:  hpc-studio_<version>_<deb_arch>.deb
#   - RedHat / Fedora package:   hpc-studio-<version>.<rpm_arch>.rpm
#   - Portable tarball:          hpc-studio-linux-<arch>-<version>.tar.gz
#   - Built-in VSIX extension:   hpc-studio-<ext_version>.vsix
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

ARCH="${ARCH:-x64}"
SKIP_BUILD="${SKIP_BUILD:-0}"
OUTPUT_DIR="${OUTPUT_DIR:-${ROOT_DIR}/dist}"

# Read product & version information
VERSION="$(node -p 'require("./package.json").version')"
APP_NAME="$(node -p 'require("./product.json").applicationName')"

case "${ARCH}" in
  x64)
    DEB_ARCH="amd64"
    RPM_ARCH="x86_64"
    ;;
  arm64)
    DEB_ARCH="arm64"
    RPM_ARCH="aarch64"
    ;;
  armhf)
    DEB_ARCH="armhf"
    RPM_ARCH="armv7hl"
    ;;
  *)
    echo "[-] Error: Unsupported architecture: ${ARCH}" >&2
    exit 1
    ;;
esac

echo "=================================================================="
echo " Packaging HPC Studio Desktop"
echo " Version:      ${VERSION}"
echo " Application:  ${APP_NAME}"
echo " Architecture: ${ARCH} (deb: ${DEB_ARCH}, rpm: ${RPM_ARCH})"
echo " Output Dir:   ${OUTPUT_DIR}"
echo "=================================================================="

mkdir -p "${OUTPUT_DIR}"
cd "${ROOT_DIR}"

# 1. Package the built-in extension (VSIX)
echo ""
echo "[1/4] Packaging hpc-studio extension (VSIX)..."
(
  cd extensions/hpc-studio
  if [ ! -f "media/icons/hpc-studio.png" ] && [ -f "media/icons/hpc-studio.svg" ] && command -v rsvg-convert >/dev/null 2>&1; then
    rsvg-convert -w 256 -h 256 media/icons/hpc-studio.svg -o media/icons/hpc-studio.png
  fi
  if [ ! -d "node_modules" ]; then
    npm install --prefer-offline || true
  fi
  if [ -f "../../node_modules/.bin/tsc" ]; then
    ../../node_modules/.bin/tsc -p tsconfig.json
  elif [ -f "./node_modules/.bin/tsc" ]; then
    ./node_modules/.bin/tsc -p tsconfig.json
  else
    npx --package typescript tsc -p tsconfig.json
  fi
  npx --yes @vscode/vsce package --no-dependencies --out "${OUTPUT_DIR}/hpc-studio.vsix"
  # Also keep a copy named with version
  cp "${OUTPUT_DIR}/hpc-studio.vsix" "${OUTPUT_DIR}/hpc-studio-1.0.0.vsix"
  echo "[+] VSIX extension generated at ${OUTPUT_DIR}/hpc-studio.vsix"
)

# 2. Build VS Code client binary if needed
BINARY_DIR="$(cd "${ROOT_DIR}/.." && pwd)/VSCode-linux-${ARCH}"
if [ "${SKIP_BUILD}" = "1" ] && [ -d "${BINARY_DIR}" ]; then
  echo ""
  echo "[2/4] Skipping IDE compilation (--skip-build requested and ${BINARY_DIR} exists)..."
else
  echo ""
  echo "[2/4] Compiling HPC Studio client binary for linux-${ARCH}..."
  npm run gulp -- "vscode-linux-${ARCH}-min"
  echo "[+] Client binary compiled at: ${BINARY_DIR}"
fi

# 3. Create portable tarball
echo ""
echo "[3/4] Creating portable tarball..."
TARBALL_NAME="${APP_NAME}-linux-${ARCH}-${VERSION}.tar.gz"
tar -czf "${OUTPUT_DIR}/${TARBALL_NAME}" -C "$(dirname "${BINARY_DIR}")" "$(basename "${BINARY_DIR}")"
echo "[+] Tarball created at: ${OUTPUT_DIR}/${TARBALL_NAME}"

# 4. Generate Linux distribution packages (.deb and .rpm)
echo ""
echo "[4/4] Generating distribution packages..."

# Debian / Ubuntu package
if command -v dpkg-deb >/dev/null 2>&1 && command -v fakeroot >/dev/null 2>&1; then
  echo "  -> Building Debian package..."
  npm run gulp -- "vscode-linux-${ARCH}-prepare-deb"
  npm run gulp -- "vscode-linux-${ARCH}-build-deb"
  
  BUILT_DEB="$(find .build/linux/deb/${DEB_ARCH}/deb -name "*.deb" -type f | head -n 1)"
  if [ -n "${BUILT_DEB}" ] && [ -f "${BUILT_DEB}" ]; then
    TARGET_DEB="${OUTPUT_DIR}/${APP_NAME}_${VERSION}_${DEB_ARCH}.deb"
    cp "${BUILT_DEB}" "${TARGET_DEB}"
    echo "  [+] Debian package ready: ${TARGET_DEB}"
  fi
else
  echo "  [!] Note: dpkg-deb or fakeroot not installed. Skipping .deb creation."
fi

# RPM package
if command -v rpmbuild >/dev/null 2>&1; then
  echo "  -> Building RPM package..."
  npm run gulp -- "vscode-linux-${ARCH}-prepare-rpm"
  npm run gulp -- "vscode-linux-${ARCH}-build-rpm"
  
  BUILT_RPM="$(find .build/linux/rpm/${RPM_ARCH} -name "*.rpm" -type f | head -n 1)"
  if [ -n "${BUILT_RPM}" ] && [ -f "${BUILT_RPM}" ]; then
    TARGET_RPM="${OUTPUT_DIR}/${APP_NAME}-${VERSION}.${RPM_ARCH}.rpm"
    cp "${BUILT_RPM}" "${TARGET_RPM}"
    echo "  [+] RPM package ready: ${TARGET_RPM}"
  fi
else
  echo "  [!] Note: rpmbuild not installed. Skipping .rpm creation."
fi

echo ""
echo "=================================================================="
echo " HPC Studio packaging completed successfully!"
echo " Artifacts located in: ${OUTPUT_DIR}"
ls -lh "${OUTPUT_DIR}"
echo "=================================================================="
