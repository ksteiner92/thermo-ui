import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import type {
  ThermostatInfo,
  ThermostatSnapshotMessage,
} from "./types/thermostat";

const thermostatInfo: ThermostatInfo = {
  coolSetpoint: 25,
  deviceUpdatedLast: "now",
  heatSetpoint: 19,
  highestTemperature: 30,
  lowestTemperature: 16,
  sensorHumidity: 40,
  sensorPolledLast: "now",
  sensorTemperature: 22,
  status: "IDLE",
  thermostatCoolSetpoint: 24,
  thermostatHeatSetpoint: 20,
  thermostatUpdatedLast: "now",
};

const updatedThermostatInfo: ThermostatInfo = {
  ...thermostatInfo,
  heatSetpoint: 19.1,
};

class MockWebSocket {
  public static readonly instances: MockWebSocket[] = [];
  public onclose: (() => void) | null = null;
  public onerror: (() => void) | null = null;
  public onmessage: ((event: { data: string }) => void) | null = null;
  public onopen: (() => void) | null = null;

  public constructor(public readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  public emitMessage(message: ThermostatSnapshotMessage): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  public emitOpen(): void {
    this.onopen?.();
  }

  public close(): void {
    this.onclose?.();
  }
}

describe("App", () => {
  beforeEach(() => {
    MockWebSocket.instances.length = 0;
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders thermostat data and updates live from websocket snapshots", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(thermostatInfo), {
        status: 200,
      }),
    );

    render(<App />);

    expect(await screen.findByText("22.0°C")).toBeInTheDocument();
    expect(MockWebSocket.instances).toHaveLength(1);

    MockWebSocket.instances[0].emitOpen();
    MockWebSocket.instances[0].emitMessage({
      payload: {
        ...thermostatInfo,
        sensorHumidity: 48,
        sensorTemperature: 23.5,
        status: "COOL",
      },
      type: "thermostat_snapshot",
    });

    expect(await screen.findByText("23.5°C")).toBeInTheDocument();
    expect(screen.getByText("48%")).toBeInTheDocument();
    expect(screen.getByText("Cooling")).toBeInTheDocument();
  });

  it("submits setpoint updates through the REST endpoint", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(thermostatInfo), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(updatedThermostatInfo),
          {
            status: 200,
          },
        ),
      );

    render(<App />);

    await screen.findByText("22.0°C");
    await user.click(screen.getByLabelText("Increase heat setpoint"));
    await user.click(screen.getByRole("button", { name: "Apply range" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        "http://localhost:3001/v1/thermostat/setpoints",
        expect.objectContaining({
          body: JSON.stringify({
            coolSetpoint: 25,
            heatSetpoint: 19.1,
          }),
          method: "PUT",
        }),
      );
    });

    expect(await screen.findByText("19.1°C")).toBeInTheDocument();
  });

  it("can display temperatures in fahrenheit while keeping backend values in celsius", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(updatedThermostatInfo), {
        status: 200,
      }),
    );

    render(<App />);

    expect(await screen.findByText("22.0°C")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Fahrenheit" }));

    expect(screen.getByText("71.6°F")).toBeInTheDocument();
    expect(screen.getByText("66.4°F")).toBeInTheDocument();
    expect(screen.getByText("77.0°F")).toBeInTheDocument();
  });
});
