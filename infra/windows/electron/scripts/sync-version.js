#!/usr/bin/env node

/**
 * Copia la version del archivo VERSION de la raiz del repo al "version" de
 * package.json, que es de donde electron-builder saca el nombre del
 * instalador (LICS Setup <version>.exe) y la version que Windows muestra en
 * "Aplicaciones instaladas".
 *
 * VERSION es la unica fuente de verdad de la version del sistema: ya la usan
 * scripts/build-offline-release.sh, scripts/install.sh,
 * scripts/install-preflight.sh y scripts/backup.sh. Este script evita tener
 * que acordarse de subir el numero tambien aca.
 *
 * Corre solo, como hook "predist" de package.json, antes de electron-builder:
 * tanto en el workflow build-windows-installer.yml como en un build local.
 */

const fs = require("node:fs");
const path = require("node:path");

// __dirname = infra/windows/electron/scripts
const PACKAGE_DIRECTORY = path.join(__dirname, "..");
const PROJECT_ROOT = path.join(PACKAGE_DIRECTORY, "..", "..", "..");

const VERSION_FILE = path.join(PROJECT_ROOT, "VERSION");
const PACKAGE_FILE = path.join(PACKAGE_DIRECTORY, "package.json");

// Mismo criterio que scripts/build-offline-release.sh.
const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+[-a-zA-Z0-9.]*$/;

function die(message) {
  console.error(`sync-version: ${message}`);
  process.exit(1);
}

function readVersion() {
  let contents;

  try {
    contents = fs.readFileSync(VERSION_FILE, "utf8");
  } catch {
    die(`no se pudo leer ${VERSION_FILE}.`);
  }

  const version = contents.trim();

  if (!version) {
    die("el archivo VERSION esta vacio.");
  }

  if (!VERSION_PATTERN.test(version)) {
    die(`la version no tiene un formato permitido: "${version}".`);
  }

  return version;
}

function main() {
  const version = readVersion();
  const contents = fs.readFileSync(PACKAGE_FILE, "utf8");

  if (JSON.parse(contents).version === version) {
    console.log(`sync-version: package.json ya esta en ${version}.`);
    return;
  }

  // Se reemplaza solo la linea del "version" de primer nivel (la primera del
  // archivo) en vez de volver a serializar el JSON, para no reformatear el
  // resto del manifiesto.
  const updated = contents.replace(
    /("version"\s*:\s*")[^"]*(")/,
    `$1${version}$2`,
  );

  if (JSON.parse(updated).version !== version) {
    die("no se pudo fijar la version en package.json.");
  }

  fs.writeFileSync(PACKAGE_FILE, updated, "utf8");
  console.log(`sync-version: package.json actualizado a ${version}.`);
}

main();
