#!/bin/sh
set -eu

RUNTIME_CONFIG_FILE="/usr/share/nginx/html/runtime-config.js"

cat > "${RUNTIME_CONFIG_FILE}" <<EOF
window.__THERMO_CONFIG__ = {
  restBaseUrl: "${THERMO_UI_REST_BASE_URL:-}",
  wsUrl: "${THERMO_UI_WS_URL:-}"
};
EOF
