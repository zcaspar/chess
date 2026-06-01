# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: build lc0 from source with a CPU (BLAS/OpenBLAS) backend.
# Built on Ubuntu 22.04 so the binary's glibc matches the runtime stage.
# ─────────────────────────────────────────────────────────────────────────────
FROM ubuntu:22.04 AS lc0build
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates build-essential ninja-build meson \
      libopenblas-dev zlib1g-dev pkg-config python3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /src
# Pin to a release branch for reproducibility (override with --build-arg LC0_REF=...).
ARG LC0_REF=release/0.31
RUN git clone -b "${LC0_REF}" --recurse-submodules --depth 1 \
      https://github.com/LeelaChessZero/lc0.git

WORKDIR /src/lc0
# Release build, OpenBLAS CPU backend, no GPU backends, no tests.
RUN meson setup build/release \
      --buildtype=release \
      -Dgtest=false \
      -Dblas=true \
      -Dopenblas=true \
      -Dcudnn=false \
      -Dopencl=false \
      -Dmkl=false \
  && ninja -C build/release lc0 \
  && /src/lc0/build/release/lc0 --help >/dev/null 2>&1 || true

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: runtime — Node + the lc0 binary. Weights are fetched at startup
# (see server.js), so a weights-URL problem can never break the image build.
# ─────────────────────────────────────────────────────────────────────────────
FROM ubuntu:22.04 AS runtime
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl wget libopenblas0 \
  && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=lc0build /src/lc0/build/release/lc0 /app/lc0/lc0

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./

ENV LC0_PATH=/app/lc0/lc0 \
    LC0_WEIGHTS=/app/weights.pb.gz \
    PORT=3006
EXPOSE 3006
CMD ["node", "server.js"]
