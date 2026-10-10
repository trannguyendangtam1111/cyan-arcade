# Stockfish

Chess hints, games against the computer, evaluations and game reviews are worked out by
[Stockfish](https://stockfishchess.org/), the free and open-source chess engine. The arcade runs
Stockfish's **official release binaries**, unmodified, as separate processes on the backend server and
talks to them over the UCI protocol. Nothing here is a chess engine of the arcade's own, and no paid
service or API key is involved.

## Version and source

| | |
| --- | --- |
| Engine | Stockfish 19 (`id name Stockfish 19`) |
| Release | <https://github.com/official-stockfish/Stockfish/releases/tag/sf_19> (5 September 2026, tag commit `edb0d9db6731067ec50ce619ff372b463bc4dd5d`) |
| Licence | GNU General Public License v3.0 (`Copying.txt` in every release archive) |
| Source code | Included in every release archive (`src/`), and at the tag above |

The version is pinned: the Docker image and the install scripts download exactly these assets and check
each against its SHA-256 (GitHub's published digest for the asset) before using it. Nothing is
downloaded when the application starts, and no binary is committed to this repository.

| Asset | SHA-256 | Used by |
| --- | --- | --- |
| `stockfish-linux-x86-64-universal.tar.gz` | `9defc0d4e55d49c65a6d042f3e571a39fcea499ade6dbe741b53b8c65e03611f` | Docker image (default), `install.sh` on Linux x86-64 |
| `stockfish-linux-arm64-universal.tar.gz` | `fe26cfd1d9db4c8af3d21e24d9ff34cacb31c1f940085a7583da11796f2bac01` | `install.sh` on Linux arm64; Docker with the build arguments below |
| `stockfish-macos-universal.tar.gz` | `a1f0e3bcc5a6927a11fe6fc8e54a779754645f3c2bae2cf13420fd1957adaa77` | `install.sh` on macOS |
| `stockfish-windows-x86-64-universal.zip` | `3c8bf1f9ea66a09350a40df4f632288285ac206d99f33ab5842c408fc30b48a7` | `install.ps1`, `install.sh` in Git Bash |

The "universal" builds pick the fastest code path the CPU supports at run time and carry their neural
network inside the binary (about 100 MB), so nothing else needs downloading.

## Installing

**Docker** needs nothing: `backend/Dockerfile` downloads the Linux asset in a build stage, checks it,
and copies the binary, its licence, authors and source into `/opt/stockfish/` of the backend image
(`STOCKFISH_PATH=/opt/stockfish/stockfish`). The backend runtime image is Ubuntu-based
(`eclipse-temurin:21-jre-noble`) because the official Linux build needs glibc. On an arm64 host build
with `--build-arg STOCKFISH_ASSET=stockfish-linux-arm64-universal --build-arg STOCKFISH_SHA256=<its digest>`.

**Running the backend natively**, install the engine once:

```bash
sh tools/stockfish/install.sh                                     # Linux, macOS, Git Bash on Windows
powershell -ExecutionPolicy Bypass -File tools\stockfish\install.ps1   # Windows PowerShell
```

Either puts the binary in `tools/stockfish/dist/` (ignored by Git), with the release's licence, authors
and source in `tools/stockfish/dist/stockfish-19/`. The backend looks for
`../tools/stockfish/dist/stockfish` (`.exe` on Windows) by default, which is right when it runs from
`backend/`; anywhere else, set `STOCKFISH_PATH` to the binary. A Stockfish installed some other way
(a package manager, a build from source) works too through `STOCKFISH_PATH`, as long as it speaks UCI;
the cache keys then carry its own name and version.

## Licence and source availability

Stockfish is free software under the GNU GPL v3. The arcade does not modify, link or embed it: the
backend starts the unmodified official binary as a separate program and exchanges text with it. Where
the arcade's Docker image is distributed, it carries the binary together with the source code and the
licence text, as the release archive provides them, in `/opt/stockfish/` (`src/`, `scripts/`,
`Copying.txt`, `AUTHORS`, `README.md`), and the exact source is also available at the release tag
above. The evaluation network (`nn-1a298aa575a0.nnue`) is not in the archive: it is embedded in the
binary, `make net` in `src/` downloads it from the Stockfish project, and the engine's `export_net`
command writes the embedded copy out. The arcade's own code is not a derivative of Stockfish and keeps
its own licence. See also `THIRD_PARTY_NOTICES.md` at the root of the repository.

## Troubleshooting

- **The backend logs `Chess engine not found at …` at startup**, and hints, games against Stockfish and
  analysis answer `503 ENGINE_UNAVAILABLE`: run the install script, or set `STOCKFISH_PATH`. The rest of
  the arcade works without the engine. The default path is found whether the backend starts in
  `backend/` or in the repository root (as IDE run configurations often do); a relative `STOCKFISH_PATH`
  is looked for the same two ways, so an absolute one is the safest anywhere else.
- **`ENGINE_UNAVAILABLE` although the binary is there**: run it by hand (`tools/stockfish/dist/stockfish`,
  then type `uci`); it must answer `uciok`. On Linux, check that it is executable and that the machine is
  64-bit x86 (or use the arm64 asset). The official Linux build needs glibc: it does not run on Alpine.
- **The first engine request is slow**: a new engine process loads its network (about 100 MB) before its
  first answer; `app.chess.engine.ready-timeout` (default 30 s) allows for it. Later requests reuse the
  running processes.
- **`ENGINE_BUSY`**: every engine process is searching and the short wait ran out. Raise
  `STOCKFISH_POOL_SIZE` if the server has the cores and memory for it.
- **`ENGINE_FAILED`**: an engine stopped answering or crashed; it has been ended and the next request
  starts a fresh one. Nothing in the game was changed. The server log has the details.
