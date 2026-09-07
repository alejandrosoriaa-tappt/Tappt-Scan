#!/usr/bin/env bash
# Prueba de humo de un APK sobre un dispositivo real, con adb.
#
# Hace lo mínimo que v8 habría necesitado para no llegar al usuario:
# instalación limpia, tres arranques en frío y logcat sin excepciones
# fatales. No sustituye la matriz de pruebas manuales
# (docs/CHECKLIST-ANDROID.md), la habilita.
#
#   ./scripts/smoke-android.sh build.apk [--conservar]
#
# --conservar: no desinstala antes (sirve para probar ACTUALIZACIÓN encima
# de la versión anterior, que es un caso distinto a la instalación limpia).

set -euo pipefail

APK="${1:-}"
MODO="${2:-}"
PAQUETE="lat.tappt.scan"
ACTIVIDAD="$PAQUETE/.MainActivity"
EVIDENCIA="work/smoke-$(date +%Y%m%d-%H%M%S)"

if [ -z "$APK" ] || [ ! -f "$APK" ]; then
  echo "uso: ./scripts/smoke-android.sh <archivo.apk> [--conservar]" >&2
  exit 2
fi
command -v adb >/dev/null || { echo "falta adb en el PATH" >&2; exit 2; }
[ -n "$(adb devices | sed -n '2p')" ] || { echo "ningún dispositivo conectado (adb devices)" >&2; exit 2; }

mkdir -p "$EVIDENCIA"
echo "▸ evidencia en $EVIDENCIA"

echo "▸ verificando el artefacto antes de instalarlo"
node scripts/verificar-apk.js "$APK" | tee "$EVIDENCIA/artefacto.txt"

if [ "$MODO" != "--conservar" ]; then
  echo "▸ desinstalando para probar instalación limpia"
  adb uninstall "$PAQUETE" >/dev/null 2>&1 || true
fi

echo "▸ instalando"
adb install -r "$APK" | tee "$EVIDENCIA/install.txt"

echo "▸ versión instalada según el dispositivo"
adb shell dumpsys package "$PAQUETE" | grep -E "versionName|versionCode|firstInstallTime|lastUpdateTime" | tee "$EVIDENCIA/version.txt"

echo "▸ permisos concedidos"
adb shell dumpsys package "$PAQUETE" | sed -n '/requested permissions/,/User 0/p' | tee "$EVIDENCIA/permisos.txt"

echo "▸ tres arranques en frío"
adb logcat -c
for intento in 1 2 3; do
  adb shell am force-stop "$PAQUETE"
  adb shell am start -W -n "$ACTIVIDAD" | tee -a "$EVIDENCIA/arranques.txt"
  sleep 6
  if ! adb shell pidof "$PAQUETE" >/dev/null; then
    echo "❌ el proceso NO sigue vivo tras el arranque $intento" | tee -a "$EVIDENCIA/arranques.txt"
  else
    echo "✅ arranque $intento: proceso vivo" | tee -a "$EVIDENCIA/arranques.txt"
  fi
done

echo "▸ logcat"
adb logcat -d > "$EVIDENCIA/logcat.txt"
FALLAS=$(grep -nE "FATAL EXCEPTION|Cannot find native module|ReactNativeJS.*Error|AndroidRuntime.*E " "$EVIDENCIA/logcat.txt" || true)

echo
if [ -n "$FALLAS" ]; then
  echo "❌ logcat con señales de falla:"
  echo "$FALLAS" | head -20
  echo "(completo en $EVIDENCIA/logcat.txt)"
  exit 1
fi

echo "✅ humo limpio. Sigue la matriz manual: docs/CHECKLIST-ANDROID.md"
