#!/bin/sh
# Installs the pinned official Stockfish release for local development, into tools/stockfish/dist/.
#
#   sh tools/stockfish/install.sh
#
# Downloads the release asset from the official repository's GitHub release, checks its SHA-256
# against the value pinned below (GitHub's published digest for that asset), and unpacks it. Run it
# once; the backend finds dist/stockfish by default, or set STOCKFISH_PATH. The Docker image does
# the same in backend/Dockerfile and needs nothing from here. See tools/stockfish/README.md.
set -eu

VERSION=19
BASE_URL="https://github.com/official-stockfish/Stockfish/releases/download/sf_${VERSION}"

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64)
    ASSET=stockfish-linux-x86-64-universal.tar.gz
    SHA256=9defc0d4e55d49c65a6d042f3e571a39fcea499ade6dbe741b53b8c65e03611f ;;
  Linux-aarch64 | Linux-arm64)
    ASSET=stockfish-linux-arm64-universal.tar.gz
    SHA256=fe26cfd1d9db4c8af3d21e24d9ff34cacb31c1f940085a7583da11796f2bac01 ;;
  Darwin-*)
    ASSET=stockfish-macos-universal.tar.gz
    SHA256=a1f0e3bcc5a6927a11fe6fc8e54a779754645f3c2bae2cf13420fd1957adaa77 ;;
  MINGW*-x86_64 | MSYS*-x86_64 | CYGWIN*-x86_64)
    ASSET=stockfish-windows-x86-64-universal.zip
    SHA256=3c8bf1f9ea66a09350a40df4f632288285ac206d99f33ab5842c408fc30b48a7 ;;
  *)
    echo "No pinned Stockfish ${VERSION} asset for $(uname -s) $(uname -m). See tools/stockfish/README.md." >&2
    exit 1 ;;
esac

HERE="$(cd "$(dirname "$0")" && pwd)"
DIST="${HERE}/dist"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "Downloading ${ASSET} (Stockfish ${VERSION})..."
curl -fsSL -o "${WORK}/${ASSET}" "${BASE_URL}/${ASSET}"

if command -v sha256sum >/dev/null 2>&1; then
  ACTUAL="$(sha256sum "${WORK}/${ASSET}" | cut -d' ' -f1)"
else
  ACTUAL="$(shasum -a 256 "${WORK}/${ASSET}" | cut -d' ' -f1)"
fi
if [ "$ACTUAL" != "$SHA256" ]; then
  echo "Checksum mismatch for ${ASSET}: expected ${SHA256}, got ${ACTUAL}. Nothing was installed." >&2
  exit 1
fi

rm -rf "$DIST"
mkdir -p "$DIST"
case "$ASSET" in
  *.zip) unzip -q "${WORK}/${ASSET}" -d "$WORK/unpacked" ;;
  *) mkdir -p "$WORK/unpacked" && tar xzf "${WORK}/${ASSET}" -C "$WORK/unpacked" ;;
esac
# The release's licence, authors and source code go along with the binary (GPL-3.0).
mv "$WORK/unpacked/stockfish" "$DIST/stockfish-${VERSION}"
BINARY="$(find "$DIST/stockfish-${VERSION}" -maxdepth 1 -type f -name 'stockfish-*' | head -n 1)"
case "$ASSET" in
  *.zip) mv "$BINARY" "$DIST/stockfish.exe" ;;
  *) mv "$BINARY" "$DIST/stockfish" && chmod +x "$DIST/stockfish" ;;
esac

echo "Installed Stockfish ${VERSION} in ${DIST} (licence and source in ${DIST}/stockfish-${VERSION})."
