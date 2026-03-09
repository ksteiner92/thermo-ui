export type ThermostatStatus =
  | "OFF"
  | "COOL"
  | "HEAT"
  | "IDLE"
  | "ERROR"
  | "STOPPED";

export interface ThermostatInfo {
  readonly sensorTemperature: number;
  readonly sensorHumidity: number;
  readonly coolSetpoint: number;
  readonly heatSetpoint: number;
  readonly status: ThermostatStatus;
  readonly thermostatHeatSetpoint: number;
  readonly thermostatCoolSetpoint: number;
  readonly lowestTemperature: number;
  readonly highestTemperature: number;
  readonly deviceUpdatedLast: string;
  readonly thermostatUpdatedLast: string;
  readonly sensorPolledLast: string;
}

export interface UpdateSetpoints {
  readonly coolSetpoint: number;
  readonly heatSetpoint: number;
}

export interface ThermostatSnapshotMessage {
  readonly type: "thermostat_snapshot";
  readonly payload: ThermostatInfo;
}
