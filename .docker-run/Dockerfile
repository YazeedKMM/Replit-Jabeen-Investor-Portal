# Linux-x64 (glibc) image — matches the *-linux-x64-gnu native binaries that
# pnpm-workspace.yaml keeps (and the win32/musl ones it strips).
FROM node:24-bookworm

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# Pin pnpm 10 — the version this workspace targets. pnpm 11 makes ignored
# build scripts fatal in non-TTY builds, which breaks the install.
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

WORKDIR /app
COPY . .

# Install deps. Non-frozen because the committed lockfile's overrides hash
# doesn't match this pnpm version; locked versions are still reused.
RUN pnpm install

EXPOSE 8080 5173
