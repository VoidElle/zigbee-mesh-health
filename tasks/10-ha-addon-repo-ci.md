# 10 — Home Assistant add-on: add-on repository + CI (multi-arch images on GHCR)

**Depends on:** 08 (09 not required — can run in parallel with it).

Goal: make the repo a valid **add-on repository** HA can add to its Add-on Store, with prebuilt multi-arch images so users don't build locally.

## Step 1 — `repository.yaml` (repo root)

```yaml
name: Zigbee Mesh Health add-on repository
url: https://github.com/lucadelc/zigbee-mesh-health
maintainer: lucadelc
```

No `addons` list needed — the HA builder/store scans directories containing a `config.yaml`; that directory is `addon/`.

## Step 2 — Pin the image in `addon/config.yaml`

Add (replace `<owner>` with the actual GitHub owner):

```yaml
image: ghcr.io/<owner>/{arch}-zigbee-mesh-health
```

With `image:` set, the store pulls prebuilt images instead of building on the HA box.

## Step 3 — `.github/workflows/addon.yml`

Build with the official HA builder for all four arches and push to GHCR on tag push:

```yaml
name: Build add-on
on:
  push:
    tags: ["v*"]
  workflow_dispatch:
jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    strategy:
      matrix:
        arch: ["aarch64", "amd64", "armv7", "i386"]
    steps:
      - uses: actions/checkout@v4
      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.repository_owner }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Build ${{ matrix.arch }}
        run: >
          docker run --rm --privileged -v "${{ github.workspace }}:/data" --
          ghcr.io/home-assistant/builder:latest
          --${{ matrix.arch }}
          --target /addon
          --image "ghcr.io/${{ github.repository_owner }}/{arch}-zigbee-mesh-health"
          --version "$(cat addon/config.yaml | grep -m1 '^version:' | cut -d'"' -f2)"
```

Notes:
- The `{arch}` placeholder in `--image` is substituted by the builder itself.
- `--version` tags the image with the version from `addon/config.yaml` and `latest` (builder default). Tags pushed to the Git repo should bump BOTH `addon/config.yaml` `version:` and `package.json`.
- armv7/i386 builds are slow (better-sqlite3 compiles from source on musl) — expected, set a generous timeout (30+ min).

## Step 4 — Local build fallback (documented, not scripted)

The store can also build locally when no `image:` is present — document in `DOCS.md` or repo README that a git tag like `v1.0.0` triggers image publication.

## Acceptance criteria

- [ ] `repository.yaml` at repo root, valid YAML.
- [ ] `addon/config.yaml` contains the `image:` line with the correct owner.
- [ ] Workflow file valid YAML; builder invocation syntax matches the current `ghcr.io/home-assistant/builder` CLI (`--<arch>`, `--target`, `--image`, `--version`).
- [ ] Version single-source rule documented: release = tag + bump `version` in `addon/config.yaml` (and `package.json`).
- [ ] Mark your checkbox in `tasks/README.md`.
