#!/bin/sh
Xvfb :99 -screen 0 1280x800x24 -nolisten tcp &
export DISPLAY=:99
exec bun run src/index.ts
