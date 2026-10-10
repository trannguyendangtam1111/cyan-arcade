# Third-party notices

## Stockfish

The chess features (move hints, games against the computer, evaluations and game reviews) use
**Stockfish 19**, a free and open-source UCI chess engine by the Stockfish developers
(<https://stockfishchess.org/>, <https://github.com/official-stockfish/Stockfish>).

- **Licence**: GNU General Public License, version 3 (GPL-3.0). The full text is `Copying.txt` in the
  Stockfish release archive, and <https://www.gnu.org/licenses/gpl-3.0.html>.
- **How it is used**: the unmodified official release binary runs as a separate process, started by the
  backend and spoken to over the UCI text protocol. The arcade's own code does not include, link or
  modify Stockfish's code.
- **Where it is**: the binary is not in this repository. The backend Docker image downloads the pinned
  release asset at build time, checks its SHA-256, and places the binary in `/opt/stockfish/` together
  with the licence (`Copying.txt`), `AUTHORS`, `README.md` and the **source code** (`src/` with its
  `Makefile`, and `scripts/`) from the same release archive. For local development,
  `tools/stockfish/install.sh` and `install.ps1` do the same into `tools/stockfish/dist/`.
- **Evaluation network**: the one input to the build that the archive does not carry is the neural
  network Stockfish evaluates with (`nn-1a298aa575a0.nnue`, named in `src/evaluate.h`). It is embedded
  in the binary; the source's `make net` (`scripts/net.sh`) downloads it from the Stockfish project
  (<https://tests.stockfishchess.org/api/nn/nn-1a298aa575a0.nnue>, or the
  `official-stockfish/networks` repository), and the engine's own `export_net` command writes the
  embedded copy to a file.
- **Source code**: the exact source of the version used is in the image as above, and at
  <https://github.com/official-stockfish/Stockfish/releases/tag/sf_19> (tag commit
  `edb0d9db6731067ec50ce619ff372b463bc4dd5d`). Anyone who receives the image may obtain, modify and
  redistribute Stockfish under the terms of the GPL-3.0.

Version, checksums, installation and troubleshooting: `tools/stockfish/README.md`.

## Card data and images

Card names, text and images are © their publishers and are loaded from the TCGdex and OPTCG API
services at run time; see the README, "Card games" and "Licensing and usage".
