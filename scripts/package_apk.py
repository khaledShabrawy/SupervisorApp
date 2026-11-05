"""Retired APK repackaging helper. Build the current Android project from source instead."""
import sys

if __name__ == '__main__':
    print('This legacy APK repackaging helper is retired.', file=sys.stderr)
    print('From the repository root, run pnpm apk:debug or pnpm apk:release.', file=sys.stderr)
    print('See docs/mydan-android-launch-plan.md for prerequisites and signing.', file=sys.stderr)
    raise SystemExit(2)
