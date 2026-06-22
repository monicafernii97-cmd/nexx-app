#!/bin/sh
set -eu

java -jar /opt/tika-server-standard.jar --host 127.0.0.1 --port 9998 >/tmp/tika.log 2>&1 &
TIKA_PID="$!"

shutdown() {
  kill "$TIKA_PID" 2>/dev/null || true
}

trap shutdown EXIT INT TERM

echo "Waiting for Tika to start..."
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:9998/version >/dev/null 2>&1; then
    echo "Tika is ready"
    break
  fi
  if ! kill -0 "$TIKA_PID" 2>/dev/null; then
    echo "Tika process died during startup" >&2
    cat /tmp/tika.log >&2
    exit 1
  fi
  sleep 1
done

if ! curl -fsS http://127.0.0.1:9998/version >/dev/null 2>&1; then
  echo "Tika failed to become ready within 30 seconds" >&2
  cat /tmp/tika.log >&2
  exit 1
fi

npm start &
APP_PID="$!"

wait "$APP_PID"
STATUS="$?"
shutdown
exit "$STATUS"
