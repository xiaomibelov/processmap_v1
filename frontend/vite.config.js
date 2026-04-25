import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { appVersionInfo } from "./src/config/appVersion.js";

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8011";
const vitePort = Number(process.env.VITE_PORT || 5177);
const extraAllowedHosts = String(process.env.VITE_ALLOWED_HOSTS || "")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);
const allowedHosts = Array.from(
  new Set([
    "localhost",
    "127.0.0.1",
    "stage.processmap.ru",
    ...extraAllowedHosts,
  ])
);
const stageDeployFingerprintMeta = loadStageDeployFingerprintMeta();
const stageDeployFingerprintBanner = stageDeployFingerprintMeta
  ? `/* processmap-stage-deploy requested_ref=${stageDeployFingerprintMeta.requestedRef} resolved_sha=${stageDeployFingerprintMeta.resolvedSha} fingerprint=${stageDeployFingerprintMeta.fingerprint} */\n`
  : "";

function loadStageDeployFingerprintMeta() {
  const sourceFile = path.resolve(
    process.cwd(),
    process.env.STAGE_DEPLOY_FINGERPRINT_FILE || ".stage-deploy-fingerprint.json"
  );
  if (!fs.existsSync(sourceFile)) return null;

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(sourceFile, "utf8"));
  } catch (error) {
    throw new Error(
      `stage deploy fingerprint file is invalid (${sourceFile}): ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const requestedRef = String(parsed?.requested_ref || "").trim();
  const resolvedSha = String(parsed?.resolved_sha || "").trim();
  const fingerprint = String(parsed?.fingerprint || "").trim();

  if (!requestedRef || !resolvedSha || !fingerprint) {
    throw new Error(`stage deploy fingerprint file is incomplete (${sourceFile})`);
  }

  return {
    sourceFile,
    requestedRef,
    resolvedSha,
    fingerprint,
  };
}

export default defineConfig({
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersionInfo.currentVersion),
  },
  plugins: [
    react(),
    {
      name: "stage-deploy-fingerprint-banner",
      generateBundle(_, bundle) {
        if (!stageDeployFingerprintBanner) return;
        for (const artifact of Object.values(bundle)) {
          if (artifact.type !== "chunk") continue;
          if (!artifact.fileName.endsWith(".js")) continue;
          artifact.code = `${stageDeployFingerprintBanner}${artifact.code}`;
        }
      },
    },
  ],
  server: {
    host: true,
    port: vitePort,
    strictPort: true,
    allowedHosts,
    hmr: {
      port: Number(process.env.VITE_HMR_PORT || vitePort),
    },
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
        secure: false
      }
    }
  }
});
