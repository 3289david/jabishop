#!/usr/bin/env bash
# tsx가 내부적으로 쓰는 @esbuild/<platform> 네이티브 바이너리가 이 서버에서 이유 없이
# 종종 사라지거나 깨져서(원인 미상 - 아마 호스트 쪽 정리 스크립트?) 봇이 시작하자마자
# 크래시하는 일이 반복됐다. pm2가 재시작할 때마다 이 스크립트가 먼저 실행되므로,
# 매번 바이너리 존재를 확인하고 없으면 재설치한 뒤에 봇을 띄운다.
set -e
cd "$(dirname "$0")/.."

ESBUILD_BIN="node_modules/@esbuild/linux-x64/bin/esbuild"
if [ ! -f "$ESBUILD_BIN" ]; then
  echo "[start-bot] esbuild 바이너리가 없어 재설치합니다..."
  rm -rf node_modules/@esbuild/linux-x64
  npm install --no-audit --no-fund > /tmp/start-bot-npm-install.log 2>&1 || true
fi

exec node_modules/.bin/tsx src/bot/index.ts
