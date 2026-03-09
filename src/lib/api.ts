import type { ThermostatInfo, UpdateSetpoints } from "../types/thermostat";
import { REST_BASE_URL } from "./config";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${REST_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const message =
      (await response.text()) || `Request failed: ${response.status}`;
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export function getThermostatInfo(): Promise<ThermostatInfo> {
  return request<ThermostatInfo>("/v1/thermostat/info");
}

export function updateSetpoints(
  payload: UpdateSetpoints,
): Promise<ThermostatInfo> {
  return request<ThermostatInfo>("/v1/thermostat/setpoints", {
    body: JSON.stringify(payload),
    method: "PUT",
  });
}

export function enableThermostat(): Promise<ThermostatInfo> {
  return request<ThermostatInfo>("/v1/thermostat/enable", {
    method: "PUT",
  });
}

export function disableThermostat(): Promise<ThermostatInfo> {
  return request<ThermostatInfo>("/v1/thermostat/disable", {
    method: "PUT",
  });
}
