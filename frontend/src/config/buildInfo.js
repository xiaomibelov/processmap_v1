// Build metadata injected at build time via Vite define.
// In CI: VITE_BUILD_ID is set to the first 7 characters of the git commit hash.

export const buildInfo = {
  buildId: import.meta.env.VITE_BUILD_ID || "dev",
  appVersion: import.meta.env.VITE_APP_VERSION || "unknown",
  gitBranch: import.meta.env.VITE_GIT_BRANCH || "unknown",
  buildTime: import.meta.env.VITE_BUILD_TIME || "",
};

export function formatBuildLabel() {
  const { buildId, appVersion } = buildInfo;
  return `${appVersion} (${buildId})`;
}
