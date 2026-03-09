import { useEffect, useRef, useState } from "react";
import "./App.css";
import {
  disableThermostat,
  enableThermostat,
  getThermostatInfo,
  updateSetpoints,
} from "./lib/api";
import { WS_URL } from "./lib/config";
import type {
  ThermostatInfo,
  ThermostatSnapshotMessage,
  ThermostatStatus,
  UpdateSetpoints,
} from "./types/thermostat";

type ConnectionState = "connecting" | "live" | "reconnecting" | "offline";
type PendingAction = "setpoints" | "enable" | "disable" | null;
type SetpointKey = "coolSetpoint" | "heatSetpoint";
type TemperatureUnit = "C" | "F";

const STEP_CELSIUS = 0.1;

const statusMeta: Record<
  ThermostatStatus,
  { accent: string; label: string; tone: string }
> = {
  COOL: { accent: "status-cool", label: "Cooling", tone: "Cooling room now" },
  ERROR: { accent: "status-error", label: "Error", tone: "Needs attention" },
  HEAT: { accent: "status-heat", label: "Heating", tone: "Heating room now" },
  IDLE: { accent: "status-idle", label: "Idle", tone: "Holding range" },
  OFF: { accent: "status-off", label: "Off", tone: "Thermostat idle" },
  STOPPED: {
    accent: "status-stopped",
    label: "Stopped",
    tone: "Automation paused",
  },
};

const connectionCopy: Record<ConnectionState, string> = {
  connecting: "Connecting",
  live: "Live",
  offline: "Offline",
  reconnecting: "Reconnecting",
};

function convertTemperature(value: number, unit: TemperatureUnit): number {
  if (unit === "F") {
    return value * (9 / 5) + 32;
  }

  return value;
}

function convertToCelsius(value: number, unit: TemperatureUnit): number {
  if (unit === "F") {
    return (value - 32) * (5 / 9);
  }

  return value;
}

function convertTemperatureDelta(
  value: number,
  unit: TemperatureUnit,
): number {
  if (unit === "F") {
    return value * (9 / 5);
  }

  return value;
}

function roundToSingleDecimal(value: number): number {
  return Number(value.toFixed(1));
}

function getDisplayStep(unit: TemperatureUnit): number {
  return roundToSingleDecimal(convertTemperatureDelta(STEP_CELSIUS, unit));
}

function formatTemperature(value: number, unit: TemperatureUnit): string {
  return `${convertTemperature(value, unit).toFixed(1)}°${unit}`;
}

function hasSetpointChanges(
  thermostat: ThermostatInfo | null,
  draft: UpdateSetpoints | null,
): boolean {
  if (!thermostat || !draft) {
    return false;
  }
  return (
    thermostat.coolSetpoint !== draft.coolSetpoint ||
    thermostat.heatSetpoint !== draft.heatSetpoint
  );
}

function normalizeDraft(
  draft: UpdateSetpoints,
  bounds: Pick<ThermostatInfo, "highestTemperature" | "lowestTemperature">,
): UpdateSetpoints {
  const boundedHeat = Math.min(
    Math.max(draft.heatSetpoint, bounds.lowestTemperature),
    bounds.highestTemperature,
  );
  const boundedCool = Math.min(
    Math.max(draft.coolSetpoint, bounds.lowestTemperature),
    bounds.highestTemperature,
  );

  if (boundedHeat > boundedCool) {
    return {
      coolSetpoint: boundedHeat,
      heatSetpoint: boundedHeat,
    };
  }

  return {
    coolSetpoint: boundedCool,
    heatSetpoint: boundedHeat,
  };
}

function nextDraft(
  thermostat: ThermostatInfo,
  draft: UpdateSetpoints,
  key: SetpointKey,
  delta: number,
): UpdateSetpoints {
  return normalizeDraft(
    {
      ...draft,
      [key]: roundToSingleDecimal(draft[key] + delta),
    },
    thermostat,
  );
}

function App(): JSX.Element {
  const reconnectTimerRef = useRef<number | null>(null);
  const hasUnsavedDraftRef = useRef(false);
  const [thermostat, setThermostat] = useState<ThermostatInfo | null>(null);
  const [draft, setDraft] = useState<UpdateSetpoints | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");
  const [temperatureUnit, setTemperatureUnit] = useState<TemperatureUnit>("C");

  useEffect(() => {
    hasUnsavedDraftRef.current = hasSetpointChanges(thermostat, draft);
  }, [draft, thermostat]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap(): Promise<void> {
      try {
        const info = await getThermostatInfo();
        if (cancelled) {
          return;
        }
        setThermostat(info);
        setDraft({
          coolSetpoint: info.coolSetpoint,
          heatSetpoint: info.heatSetpoint,
        });
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Unable to load thermostat state",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    let socket: WebSocket | null = null;

    function connect(): void {
      setConnectionState((current) =>
        current === "live" ? current : "connecting",
      );
      socket = new WebSocket(WS_URL);

      socket.onopen = () => {
        if (isMounted) {
          setConnectionState("live");
        }
      };

      socket.onmessage = (event) => {
        if (!isMounted) {
          return;
        }
        const message = JSON.parse(
          String(event.data),
        ) as ThermostatSnapshotMessage;
        if (message.type !== "thermostat_snapshot") {
          return;
        }
        setThermostat(message.payload);
        if (!hasUnsavedDraftRef.current) {
          setDraft({
            coolSetpoint: message.payload.coolSetpoint,
            heatSetpoint: message.payload.heatSetpoint,
          });
        }
      };

      socket.onerror = () => {
        if (isMounted) {
          setConnectionState("offline");
        }
      };

      socket.onclose = () => {
        if (!isMounted) {
          return;
        }
        setConnectionState("reconnecting");
        reconnectTimerRef.current = window.setTimeout(connect, 2000);
      };
    }

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      socket?.close();
    };
  }, []);

  async function runAction(
    action: Exclude<PendingAction, null>,
    callback: () => Promise<ThermostatInfo>,
  ): Promise<void> {
    setPendingAction(action);
    setError(null);
    try {
      const nextInfo = await callback();
      setThermostat(nextInfo);
      setDraft({
        coolSetpoint: nextInfo.coolSetpoint,
        heatSetpoint: nextInfo.heatSetpoint,
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update thermostat",
      );
    } finally {
      setPendingAction(null);
    }
  }

  function updateDraft(key: SetpointKey, delta: number): void {
    if (!thermostat || !draft || pendingAction) {
      return;
    }
    setDraft(nextDraft(thermostat, draft, key, delta));
  }

  function handleSliderChange(key: SetpointKey, value: string): void {
    if (!thermostat || !draft || pendingAction) {
      return;
    }
    setDraft(
      normalizeDraft(
        {
          ...draft,
          [key]: roundToSingleDecimal(
            convertToCelsius(Number(value), temperatureUnit),
          ),
        },
        thermostat,
      ),
    );
  }

  const isDirty = hasSetpointChanges(thermostat, draft);
  const status = thermostat?.status ?? "OFF";
  const statusDetails = statusMeta[status];
  const displayStep = getDisplayStep(temperatureUnit);

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="hero-topline">
          <span className={`status-pill ${statusDetails.accent}`}>
            {statusDetails.label}
          </span>
          <span className={`connection-pill connection-${connectionState}`}>
            {connectionCopy[connectionState]}
          </span>
        </div>
        <div className="unit-toggle" role="group" aria-label="Temperature unit">
          <button
            type="button"
            className={`unit-toggle-button ${
              temperatureUnit === "C" ? "unit-toggle-button-active" : ""
            }`}
            onClick={() => setTemperatureUnit("C")}
          >
            Celsius
          </button>
          <button
            type="button"
            className={`unit-toggle-button ${
              temperatureUnit === "F" ? "unit-toggle-button-active" : ""
            }`}
            onClick={() => setTemperatureUnit("F")}
          >
            Fahrenheit
          </button>
        </div>

        <div className="hero-grid">
          <div>
            <p className="eyebrow">Room temperature</p>
            <h1 className="hero-reading">
              {thermostat
                ? formatTemperature(thermostat.sensorTemperature, temperatureUnit)
                : "--"}
            </h1>
            <p className="hero-copy">{statusDetails.tone}</p>
          </div>
          <div className="humidity-card">
            <p className="eyebrow">Humidity</p>
            <p className="support-reading">
              {thermostat ? `${thermostat.sensorHumidity}%` : "--"}
            </p>
          </div>
        </div>
      </section>

      <section className="controls-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Comfort range</p>
            <h2>Heat and cool setpoints</h2>
          </div>
          <p className="range-boundary">
            Range{" "}
            {thermostat
              ? formatTemperature(thermostat.lowestTemperature, temperatureUnit)
              : "--"}{" "}
            to{" "}
            {thermostat
              ? formatTemperature(thermostat.highestTemperature, temperatureUnit)
              : "--"}
          </p>
        </div>

        {error ? (
          <div className="message-banner" role="alert">
            {error}
          </div>
        ) : null}

        <div className="setpoint-grid">
          {([
            ["heatSetpoint", "Heat", "Keep the room from dropping too low."],
            ["coolSetpoint", "Cool", "Prevent the room from climbing too high."],
          ] as const).map(([key, label, copy]) => (
            <article className="setpoint-card" key={key}>
              <div className="setpoint-header">
                <div>
                  <p className="eyebrow">{label} setpoint</p>
                  <p className="setpoint-copy">{copy}</p>
                </div>
                <div className="setpoint-value">
                  {draft ? formatTemperature(draft[key], temperatureUnit) : "--"}
                </div>
              </div>
              <p className="setpoint-step-copy">Adjusts in 0.1°C increments.</p>

              <div className="stepper-row">
                <button
                  aria-label={`Decrease ${label.toLowerCase()} setpoint`}
                  className="stepper-button"
                  disabled={!thermostat || loading || pendingAction !== null}
                  onClick={() => updateDraft(key, -STEP_CELSIUS)}
                  type="button"
                >
                  -
                </button>
                <input
                  aria-label={`${label} setpoint slider`}
                  className="setpoint-slider"
                  disabled={!thermostat || loading || pendingAction !== null}
                  max={
                    thermostat
                      ? convertTemperature(
                          thermostat.highestTemperature,
                          temperatureUnit,
                        )
                      : 30
                  }
                  min={
                    thermostat
                      ? convertTemperature(
                          thermostat.lowestTemperature,
                          temperatureUnit,
                        )
                      : 10
                  }
                  onChange={(event) => handleSliderChange(key, event.target.value)}
                  step={displayStep}
                  type="range"
                  value={
                    draft && thermostat
                      ? convertTemperature(draft[key], temperatureUnit)
                      : thermostat
                        ? convertTemperature(thermostat[key], temperatureUnit)
                        : 0
                  }
                />
                <button
                  aria-label={`Increase ${label.toLowerCase()} setpoint`}
                  className="stepper-button"
                  disabled={!thermostat || loading || pendingAction !== null}
                  onClick={() => updateDraft(key, STEP_CELSIUS)}
                  type="button"
                >
                  +
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className="action-row">
          <button
            className="primary-action"
            disabled={!isDirty || pendingAction !== null || !draft}
            onClick={() =>
              draft
                ? void runAction("setpoints", () => updateSetpoints(draft))
                : undefined
            }
            type="button"
          >
            {pendingAction === "setpoints" ? "Applying..." : "Apply range"}
          </button>
          <button
            className="secondary-action"
            disabled={!thermostat || pendingAction !== null}
            onClick={() =>
              void runAction(
                thermostat?.status === "STOPPED" ? "enable" : "disable",
                () =>
                  thermostat?.status === "STOPPED"
                    ? enableThermostat()
                    : disableThermostat(),
              )
            }
            type="button"
          >
            {pendingAction === "enable"
              ? "Starting..."
              : pendingAction === "disable"
                ? "Stopping..."
                : thermostat?.status === "STOPPED"
                  ? "Resume automation"
                  : "Pause automation"}
          </button>
        </div>
      </section>

      <section className="details-panel">
        <div className="detail-card">
          <p className="eyebrow">Thermostat output</p>
          <strong>
            {thermostat
              ? formatTemperature(
                  thermostat.thermostatHeatSetpoint,
                  temperatureUnit,
                )
              : "--"}
          </strong>
          <span>Heat request</span>
        </div>
        <div className="detail-card">
          <p className="eyebrow">Thermostat output</p>
          <strong>
            {thermostat
              ? formatTemperature(
                  thermostat.thermostatCoolSetpoint,
                  temperatureUnit,
                )
              : "--"}
          </strong>
          <span>Cool request</span>
        </div>
        <div className="detail-card">
          <p className="eyebrow">Sensor polled</p>
          <strong>{thermostat?.sensorPolledLast ?? "--"}</strong>
          <span>Last reading</span>
        </div>
        <div className="detail-card">
          <p className="eyebrow">Device refreshed</p>
          <strong>{thermostat?.deviceUpdatedLast ?? "--"}</strong>
          <span>Daikin sync</span>
        </div>
      </section>
    </main>
  );
}

export default App;
