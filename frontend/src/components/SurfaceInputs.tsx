import type { SurfaceObservation } from "../api";

const SURFACE_VARIABLES = [
  {
    name: "SST",
    description: "Sea Surface Temperature",
    unit: "°C",
  },
  {
    name: "SSS",
    description: "Sea Surface Salinity",
    unit: "PSU",
  },
  {
    name: "SLA",
    description: "Sea Level Anomaly",
    unit: "m",
  },
  {
    name: "U Current",
    description: "Zonal Surface Current",
    unit: "m/s",
  },
  {
    name: "V Current",
    description: "Meridional Surface Current",
    unit: "m/s",
  },
  {
    name: "U Wind",
    description: "Zonal Surface Wind",
    unit: "m/s",
  },
  {
    name: "V Wind",
    description: "Meridional Surface Wind",
    unit: "m/s",
  },
];

interface SurfaceInputsProps {
  observations?: SurfaceObservation[];
  targetDate: string;
  inputWindowStart: string;
  inputWindowEnd: string;
  snappedLatitude?: number;
  snappedLongitude?: number;
}

export default function SurfaceInputs({
  observations,
  targetDate,
  inputWindowStart,
  inputWindowEnd,
  snappedLatitude,
  snappedLongitude,
}: SurfaceInputsProps) {
  const observationByVariable = new Map(
    observations?.map((observation) => [observation.variable, observation]),
  );
  const snappedLocation =
    typeof snappedLatitude === "number"
    && Number.isFinite(snappedLatitude)
    && typeof snappedLongitude === "number"
    && Number.isFinite(snappedLongitude)
      ? `${Math.abs(snappedLatitude).toFixed(2)}°${snappedLatitude >= 0 ? "N" : "S"} / ${Math.abs(snappedLongitude).toFixed(2)}°${snappedLongitude >= 0 ? "E" : "W"}`
      : null;

  return (
    <section className="card surfaceInputs">
      <div className="cardHeader">
        <div>
          <div className="cardLabel">
            SURFACE OBSERVATIONS
          </div>

          <h2>
            Ocean State Inputs
          </h2>
        </div>

        <div className="surfaceBadge">
          7 VARIABLES
        </div>
      </div>

      <div className="surfaceInputGrid">
        {SURFACE_VARIABLES.map((variable) => {
          const observation = observationByVariable.get(variable.name);
          const value = observation?.value;
          const formattedValue =
            typeof value === "number" && Number.isFinite(value)
              ? new Intl.NumberFormat("en", {
                  maximumSignificantDigits: 5,
                }).format(value)
              : "N/A";

          return (
            <div className="surfaceInput" key={variable.name}>
              <div className="surfaceInputName">
                {variable.name}
              </div>

              <div className="surfaceInputValue">{formattedValue}</div>

              <div className="surfaceInputDescription">
                {variable.description}
              </div>

              <div className="surfaceInputUnit">
                {observation?.unit ?? variable.unit}
              </div>
            </div>
          );
        })}
      </div>

      <div className="controlNote">
        Values shown are for {targetDate}, the final day of the 7-day model input window:
        {" "}{inputWindowStart} → {inputWindowEnd}. Cards show that final day only, at the snapped 0.25° grid location.
        {snappedLocation && <> Snapped observation location: {snappedLocation}.</>}
      </div>
    </section>
  );
}
