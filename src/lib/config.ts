type RuntimeConfig = {
  readonly restBaseUrl?: string;
  readonly wsUrl?: string;
};

declare global {
  interface Window {
    __THERMO_CONFIG__?: RuntimeConfig;
  }
}

function inferBaseHost(): string {
  if (typeof window === "undefined") {
    return "localhost";
  }
  return window.location.hostname || "localhost";
}

function getRuntimeConfig(): RuntimeConfig {
  if (typeof window === "undefined") {
    return {};
  }

  return window.__THERMO_CONFIG__ ?? {};
}

function pickConfiguredValue(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value !== undefined && value !== "");
}

const runtimeConfig = getRuntimeConfig();

export const REST_BASE_URL =
  pickConfiguredValue(
    runtimeConfig.restBaseUrl,
    import.meta.env.VITE_REST_BASE_URL,
  ) ??
  `http://${inferBaseHost()}:3001`;

export const WS_URL =
  pickConfiguredValue(runtimeConfig.wsUrl, import.meta.env.VITE_WS_URL) ??
  `ws://${inferBaseHost()}:3002`;
