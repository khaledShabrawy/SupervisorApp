#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
pnpm build
