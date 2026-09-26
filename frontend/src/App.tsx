import { useEffect, useMemo, useState } from "react";
import Plot from "react-plotly.js";

import "./App.css";
import NorthIndianOceanMap from "./components/NorthIndianOceanMap";
import SurfaceInputs from "./components/SurfaceInputs";
import { fetchLiveStatus, OceanEmbedError, reconstructOcean } from "./api";
import { DEPTHS } from "./types";
import type { Region } from "./types";

type DemoStage = "idle" | "surface" | "embedding" | "subsurface" | "complete";

const REGION_CONFIG: Record<
  Region,
  { center: [number, number] }
> = {
  "Arabian Sea": {
    center: [15.5, 65.5],
  },
  "Bay of Bengal": {
    center: [15.5, 88],
  },
};

const DOMAIN = {
  latitudeMin: 5,
  latitudeMax: 30,
  longitudeMin: 45,
  longitudeMax: 105,
} as const;

type ReconstructionError = "unsupported-location" | "request-failed";
type ValidationState =
  | "CHECKING"
  | "LIVE_STATUS_UNAVAILABLE"
  | "INCOMPLETE_INPUTS"
  | "OUTSIDE_DOMAIN"
  | "DATE_UNAVAILABLE"
  | "INCOMPLETE_OBSERVATIONS"
  | "LOCATION_NOT_SUPPORTED"
  | "REQUEST_FAILED"
  | "VALID";

interface SurfaceCoverage {
  observations: NonNullable<
    Awaited<ReturnType<typeof reconstructOcean>>["surfaceObservations"]
  >;
  count: number;
}

const REQUIRED_SURFACE_VARIABLES = [
  "SST",
  "SSS",
  "SLA",
  "U Current",
  "V Current",
  "U Wind",
  "V Wind",
] as const;

const UNSUPPORTED_LOCATION_MESSAGE =
  "This location is within the North Indian Ocean domain, but it cannot currently be represented by the model's prediction tile.";
const UNSUPPORTED_LOCATION_HELPER =
  "Please select a nearby location inside the supported reconstruction area.";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatCoordinate(value: number, axis: "lat" | "lon") {
  const sign = axis === "lat" ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W";
  return `${Math.abs(value).toFixed(2)}°${sign}`;
}

function parseCoordinate(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCoordinateInput(value: string): string {
  const parsed = parseCoordinate(value);
  return parsed === null ? value : String(parsed);
}

function requestKey(latitude: number, longitude: number, date: string) {
  return `${latitude}|${longitude}|${date}`;
}

function countSurfaceVariables(
  observations: SurfaceCoverage["observations"] | undefined,
) {
  if (!observations) return 0;
  const values = new Map(
    observations.map((observation) => [observation.variable, observation.value]),
  );
  return REQUIRED_SURFACE_VARIABLES.filter((variable) => {
    const value = values.get(variable);
    return typeof value === "number" && Number.isFinite(value);
  }).length;
}

function formatLiveDate(isoDate: string) {
  const parsedDate = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsedDate.getTime())) return isoDate;
  return parsedDate
    .toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    })
    .toUpperCase();
}

function shiftIsoDate(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

function App() {
  const [region, setRegion] = useState<Region>("Arabian Sea");
  const [date, setDate] = useState("");
  const [depth, setDepth] = useState<number>(100);
  const [latitudeInput, setLatitudeInput] = useState("15.5");
  const [longitudeInput, setLongitudeInput] = useState("65.5");
  const [liveStatus, setLiveStatus] = useState<Awaited<ReturnType<typeof fetchLiveStatus>> | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ReconstructionError | null>(null);
  const [surfaceCoverageByRequest, setSurfaceCoverageByRequest] =
    useState<Record<string, SurfaceCoverage>>({});
  const [demoStage, setDemoStage] = useState<DemoStage>("idle");
  const [apiResult, setApiResult] = useState<Awaited<ReturnType<typeof reconstructOcean>> | null>(null);

  const selectedPoint = {
    lat: parseCoordinate(latitudeInput),
    lon: parseCoordinate(longitudeInput),
  };
  const latestUsableDate = liveStatus?.latestUsableDate ?? null;
  const readyVariableCount = liveStatus?.variablesReadyCount ?? 0;
  const requiredVariableCount = liveStatus?.requiredVariablesCount ?? 7;
  const selectedCoverage = selectedPoint.lat !== null
    && selectedPoint.lon !== null
    && date
    ? surfaceCoverageByRequest[
        requestKey(selectedPoint.lat, selectedPoint.lon, date)
      ]
    : undefined;
  const coordinateRangeMessage = selectedPoint.lat !== null
    && (selectedPoint.lat < DOMAIN.latitudeMin
      || selectedPoint.lat > DOMAIN.latitudeMax)
    ? "Latitude must be between 5°N and 30°N."
    : selectedPoint.lon !== null
      && (selectedPoint.lon < DOMAIN.longitudeMin
        || selectedPoint.lon > DOMAIN.longitudeMax)
      ? "Longitude must be between 45°E and 105°E."
      : "Select a coordinate inside 5°N–30°N and 45°E–105°E.";

  let validationState: ValidationState;
  if (selectedPoint.lat === null || selectedPoint.lon === null) {
    validationState = "INCOMPLETE_INPUTS";
  } else if (
    selectedPoint.lat < DOMAIN.latitudeMin
    || selectedPoint.lat > DOMAIN.latitudeMax
    || selectedPoint.lon < DOMAIN.longitudeMin
    || selectedPoint.lon > DOMAIN.longitudeMax
  ) {
    validationState = "OUTSIDE_DOMAIN";
  } else if (!date) {
    validationState = "INCOMPLETE_INPUTS";
  } else if (statusLoading) {
    validationState = "CHECKING";
  } else if (statusError) {
    validationState = "LIVE_STATUS_UNAVAILABLE";
  } else if (
    !liveStatus?.ready
    || !latestUsableDate
    || date > latestUsableDate
  ) {
    validationState = "DATE_UNAVAILABLE";
  } else if (selectedCoverage && selectedCoverage.count < REQUIRED_SURFACE_VARIABLES.length) {
    validationState = "INCOMPLETE_OBSERVATIONS";
  } else if (error === "unsupported-location") {
    validationState = "LOCATION_NOT_SUPPORTED";
  } else if (error === "request-failed") {
    validationState = "REQUEST_FAILED";
  } else {
    validationState = "VALID";
  }

  const reconstructionAllowed = validationState === "VALID" && !loading;

  useEffect(() => {
    let cancelled = false;
    fetchLiveStatus()
      .then((status) => {
        if (cancelled) return;
        setLiveStatus(status);
        setStatusError(false);
        if (status.latestUsableDate) {
          setDate(status.latestUsableDate);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatusError(true);
          setLiveStatus(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setStatusLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const profileDepths = apiResult?.predictions.map((prediction) => prediction.depthM) ?? DEPTHS;
  const profileTemperatures = apiResult?.predictions.map((prediction) => prediction.temperatureC) ?? [];

  const hasRealProfile = Boolean(apiResult && apiResult.predictions.length > 0);

  const gradientData = useMemo(() => {
    if (!hasRealProfile || profileDepths.length < 2) {
      return [] as Array<{ depth: number; gradient: number }>;
    }

    const gradients: Array<{ depth: number; gradient: number }> = [];

    for (let index = 0; index < profileDepths.length - 1; index += 1) {
      const currentDepth = profileDepths[index];
      const nextDepth = profileDepths[index + 1];
      const currentTemp = profileTemperatures[index];
      const nextTemp = profileTemperatures[index + 1];
      const deltaDepth = nextDepth - currentDepth;
      const deltaTemp = nextTemp - currentTemp;

      gradients.push({
        depth: (currentDepth + nextDepth) / 2,
        gradient: deltaDepth === 0 ? 0 : deltaTemp / deltaDepth,
      });
    }

    return gradients;
  }, [hasRealProfile, profileDepths, profileTemperatures]);

  const maxGradient = useMemo(() => {
    if (gradientData.length === 0) {
      return null as null | { depth: number; gradient: number };
    }

    return gradientData.reduce((strongest, current) =>
      Math.abs(current.gradient) > Math.abs(strongest.gradient) ? current : strongest,
    gradientData[0]);
  }, [gradientData]);

  const surfaceTemp = profileTemperatures[0] ?? null;
  const deepTemp = profileTemperatures[profileTemperatures.length - 1] ?? null;

  function stageLabel(stage: DemoStage) {
    switch (stage) {
      case "surface":
        return "Preparing retrospective 7-day input window";
      case "embedding":
        return "Running OceanEmbed-CNN";
      case "subsurface":
        return "Reconstructing 15 depth levels";
      case "complete":
        return "Complete";
      default:
        return "Ready to run reconstruction";
    }
  }

  function applyRegion(regionValue: Region) {
    const nextConfig = REGION_CONFIG[regionValue];
    setRegion(regionValue);
    setLatitudeInput(String(nextConfig.center[0]));
    setLongitudeInput(String(nextConfig.center[1]));
    setApiResult(null);
    setError(null);
    setDemoStage("idle");
  }

  async function runReconstruction() {
    if (
      !reconstructionAllowed
      || selectedPoint.lat === null
      || selectedPoint.lon === null
      || (selectedCoverage && selectedCoverage.count < REQUIRED_SURFACE_VARIABLES.length)
    ) {
      setApiResult(null);
      setDemoStage("idle");
      return;
    }

    setLoading(true);
    setError(null);
    setApiResult(null);
    setDemoStage("surface");

    try {
      await sleep(450);
      setDemoStage("embedding");
      await sleep(450);

      const coverageKey = requestKey(
        selectedPoint.lat,
        selectedPoint.lon,
        date,
      );
      const result = await reconstructOcean({
        latitude: selectedPoint.lat,
        longitude: selectedPoint.lon,
        date,
        depths: [...DEPTHS],
      });

      const observations = result.surfaceObservations ?? [];
      const coverage: SurfaceCoverage = {
        observations,
        count: countSurfaceVariables(observations),
      };
      setSurfaceCoverageByRequest((current) => ({
        ...current,
        [coverageKey]: coverage,
      }));
      if (coverage.count < REQUIRED_SURFACE_VARIABLES.length) {
        setApiResult(null);
        setError(null);
        setDemoStage("idle");
        return;
      }

      setApiResult(result);
      setDemoStage("subsurface");
      await sleep(450);
      setDemoStage("complete");
    } catch (err) {
      setError(
        err instanceof OceanEmbedError
          ? err.kind
          : "request-failed",
      );
      setDemoStage("idle");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <div className="ocean-background" aria-hidden="true" />
      <div className="ocean-overlay" aria-hidden="true" />
      <div className="app-content">
        <header className="topbar">
          <div className="brand-block">
            <div className="brand-mark">OE</div>
            <div>
              <div className="brand-name">OCEANEMBED</div>
              <div className="brand-subtitle">SUBSURFACE OCEAN INTELLIGENCE</div>
            </div>
          </div>

          <div className="topbar-status">
            <span className="status-dot" />
            SYSTEM ONLINE
          </div>
        </header>

        <main className="content-shell">
        <div className="context-bar">
          <div className="context-item">
            <span className="context-label">LATEST USABLE DATE</span>
            <strong>
              {latestUsableDate
                ? formatLiveDate(latestUsableDate)
                : statusLoading ? "Checking…" : "Unavailable"}
            </strong>
          </div>
          <div className="context-item">
            <span className="context-label">RETROSPECTIVE 7-DAY INPUT WINDOW</span>
            <strong>
              {liveStatus?.inputWindowStart && liveStatus.inputWindowEnd
                ? `${formatLiveDate(liveStatus.inputWindowStart)} → ${formatLiveDate(liveStatus.inputWindowEnd)}`
                : "Unavailable"}
            </strong>
          </div>
          <div className="context-item">
            <span className="context-label">VARIABLES READY</span>
            <strong>
              {liveStatus
                ? `${readyVariableCount} / ${requiredVariableCount}${liveStatus.variablesReady.length > 0 ? ` · ${liveStatus.variablesReady.join(", ")}` : ""}`
                : statusLoading ? "Checking…" : "Unavailable"}
            </strong>
          </div>
          <div className="context-item">
            <span className="context-label">GRID</span>
            <strong>0.25°</strong>
          </div>
          <div className="context-item">
            <span className="context-label">DEPTH LEVELS</span>
            <strong>15</strong>
          </div>
          <div className="context-item status-item">
            <span className="context-label">DATA STATUS</span>
            <strong>
              {statusLoading
                ? "CHECKING"
                : statusError
                  ? "UNAVAILABLE"
                  : liveStatus?.ready
                    ? "LIVE / READY"
                    : "NOT READY"}
            </strong>
            {liveStatus?.lastChecked && (
              <small className="context-meta">Last checked: {liveStatus.lastChecked}</small>
            )}
          </div>
        </div>

        <section className="workspace card">
          <div className="section-header">
            <div>
              <div className="section-kicker">RECONSTRUCTION WORKSPACE</div>
              <h2>Surface observations to subsurface reconstruction</h2>
            </div>
            <div className="header-pill">Indian Ocean</div>
          </div>

          <div className="workspace-grid">
            <div className="controls-panel">
              <div className="control-block">
                <label htmlFor="region">Region</label>
                <select
                  id="region"
                  value={region}
                  onChange={(event) => applyRegion(event.target.value as Region)}
                >
                  <option value="Arabian Sea">Arabian Sea</option>
                  <option value="Bay of Bengal">Bay of Bengal</option>
                </select>
              </div>

              <div className="control-block">
                <label htmlFor="latitude">Latitude</label>
                <input
                  id="latitude"
                  type="number"
                  min={DOMAIN.latitudeMin}
                  max={DOMAIN.latitudeMax}
                  step="any"
                  autoComplete="off"
                  value={latitudeInput}
                  onChange={(event) => {
                    setLatitudeInput(event.target.value);
                    setApiResult(null);
                    setError(null);
                    setDemoStage("idle");
                  }}
                  onBlur={() => setLatitudeInput((value) => normalizeCoordinateInput(value))}
                />
              </div>

              <div className="control-block">
                <label htmlFor="longitude">Longitude</label>
                <input
                  id="longitude"
                  type="number"
                  min={DOMAIN.longitudeMin}
                  max={DOMAIN.longitudeMax}
                  step="any"
                  autoComplete="off"
                  value={longitudeInput}
                  onChange={(event) => {
                    setLongitudeInput(event.target.value);
                    setApiResult(null);
                    setError(null);
                    setDemoStage("idle");
                  }}
                  onBlur={() => setLongitudeInput((value) => normalizeCoordinateInput(value))}
                />
              </div>

              <div className="control-block">
                <label htmlFor="date">Date</label>
                <input
                  id="date"
                  type="date"
                  max={latestUsableDate ?? undefined}
                  value={date}
                  onChange={(event) => {
                    setDate(event.target.value);
                    setApiResult(null);
                    setError(null);
                    setDemoStage("idle");
                  }}
                />
              </div>

              <div className="control-block">
                <label htmlFor="depth">Depth</label>
                <select
                  id="depth"
                  value={depth}
                  onChange={(event) => setDepth(Number(event.target.value))}
                >
                  {DEPTHS.map((depthValue) => (
                    <option key={depthValue} value={depthValue}>{depthValue} m</option>
                  ))}
                </select>
              </div>

              <button
                className="reconstruct-button"
                type="button"
                onClick={runReconstruction}
                disabled={!reconstructionAllowed}
              >
                {loading ? "RUNNING..." : "RUN RECONSTRUCTION"}
              </button>
            </div>

            <div className="location-panel">
              <div className="map-shell">
                <NorthIndianOceanMap
                  latitude={selectedPoint.lat}
                  longitude={selectedPoint.lon}
                  onSelect={(nextLatitude, nextLongitude) => {
                    setLatitudeInput(String(nextLatitude));
                    setLongitudeInput(String(nextLongitude));
                    setApiResult(null);
                    setError(null);
                    setDemoStage("idle");
                  }}
                />

                <div className="map-badge">{region}</div>
              </div>

              <div className="location-summary">
                <div>
                  <div className="label-small">SELECTED LOCATION</div>
                  <div className="location-value">
                    {selectedPoint.lat !== null && selectedPoint.lon !== null
                      ? `${formatCoordinate(selectedPoint.lat, "lat")} / ${formatCoordinate(selectedPoint.lon, "lon")}`
                      : "Enter latitude and longitude"}
                  </div>
                </div>
                <div>
                  <div className="label-small">TARGET DATE</div>
                  <div className="location-value">{date || "Select a date"}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="pipeline-panel">
            {[
              { id: "surface", label: "SATELLITE / SURFACE OBSERVATIONS" },
              { id: "quality", label: "QUALITY CONTROL + HARMONIZATION" },
              { id: "window", label: "RETROSPECTIVE 7-DAY INPUT WINDOW" },
              { id: "model", label: "OCEANEMBED-CNN" },
              { id: "output", label: "15-DEPTH RECONSTRUCTION" },
              { id: "validation", label: "GLORYS TEST COMPLETE · ARGO PLANNED" },
            ].map((step, index) => {
              const active =
                (demoStage === "surface" && index === 0) ||
                (demoStage === "embedding" && index >= 3 && index <= 4) ||
                (demoStage === "subsurface" && index >= 3 && index <= 4) ||
                (demoStage === "complete" && index >= 3);

              const completed =
                (demoStage === "complete" && index <= 4) ||
                (demoStage === "subsurface" && index <= 4) ||
                (demoStage === "embedding" && index <= 3);

              return (
                <div key={step.id} className={`pipeline-step ${active ? "active" : ""} ${completed ? "completed" : ""}`}>
                  <span className="pipeline-index">{index + 1}</span>
                  <span>{step.label}</span>
                  {index !== 5 && <span className="pipeline-arrow">↓</span>}
                </div>
              );
            })}
          </div>

          <div
            className={`status-banner ${
              validationState === "VALID"
                ? demoStage === "complete" ? "success" : ""
                : validationState === "REQUEST_FAILED"
                    || validationState === "LOCATION_NOT_SUPPORTED"
                  ? "error-banner"
                  : "warning-banner"
            }`}
            role="status"
          >
            <div className="status-banner-icon">
              {validationState === "VALID" && demoStage === "complete" ? "✓" : "◉"}
            </div>
            <div>
              <div className="status-banner-title">
                {loading
                  ? stageLabel(demoStage)
                  : validationState === "CHECKING"
                    ? "CHECKING LIVE DATA"
                    : validationState === "LIVE_STATUS_UNAVAILABLE"
                      ? "LIVE DATA STATUS UNAVAILABLE"
                      : validationState === "INCOMPLETE_INPUTS"
                        ? "INCOMPLETE INPUTS"
                        : validationState === "OUTSIDE_DOMAIN"
                          ? "OUTSIDE SUPPORTED DOMAIN"
                          : validationState === "DATE_UNAVAILABLE"
                            ? "DATA NOT READY"
                            : validationState === "INCOMPLETE_OBSERVATIONS"
                              ? "RECONSTRUCTION UNAVAILABLE"
                              : validationState === "LOCATION_NOT_SUPPORTED"
                                ? "LOCATION NOT SUPPORTED"
                                : validationState === "REQUEST_FAILED"
                                  ? "RECONSTRUCTION UNAVAILABLE"
                                  : demoStage === "complete"
                                    ? "COMPLETE"
                                    : "READY TO RUN RECONSTRUCTION"}
              </div>
              <div className="status-banner-copy">
                {loading
                  ? "Processing OceanEmbed inference using the retrospective 7-day input window."
                  : validationState === "CHECKING"
                    ? "Checking the latest usable date and available input variables."
                    : validationState === "LIVE_STATUS_UNAVAILABLE"
                      ? "Live data availability could not be checked. Please try again later."
                      : validationState === "INCOMPLETE_INPUTS"
                        ? "Enter a numeric latitude, longitude, and target date."
                        : validationState === "OUTSIDE_DOMAIN"
                          ? coordinateRangeMessage
                          : validationState === "DATE_UNAVAILABLE"
                            ? `Latest usable date: ${latestUsableDate ? formatLiveDate(latestUsableDate) : "unavailable"}. The selected date does not have a complete retrospective input window.`
                            : validationState === "INCOMPLETE_OBSERVATIONS"
                              ? "Required surface observations are incomplete."
                              : validationState === "LOCATION_NOT_SUPPORTED"
                                ? UNSUPPORTED_LOCATION_MESSAGE
                                : validationState === "REQUEST_FAILED"
                                  ? "The reconstruction could not be completed. Please try again."
                                  : demoStage === "complete"
                                    ? "REAL BACKEND RESULT AVAILABLE"
                                    : "Location is inside the supported domain and the selected date is available."}
              </div>
              {validationState === "LOCATION_NOT_SUPPORTED" && (
                <div className="status-banner-copy">{UNSUPPORTED_LOCATION_HELPER}</div>
              )}
            </div>
          </div>

        </section>

        <SurfaceInputs
          observations={selectedCoverage?.observations ?? apiResult?.surfaceObservations}
          coverageCount={selectedCoverage?.count ?? 0}
          coverageKnown={selectedCoverage !== undefined}
          targetDate={apiResult?.date ?? date}
          inputWindowStart={apiResult?.inputWindowStart ?? shiftIsoDate(date, -6)}
          inputWindowEnd={apiResult?.inputWindowEnd ?? date}
          snappedLatitude={apiResult?.latitude ?? selectedPoint.lat ?? undefined}
          snappedLongitude={apiResult?.longitude ?? selectedPoint.lon ?? undefined}
        />

        <section className="analysis-grid">
          <div className="card chart-card">
            <div className="section-header condensed">
              <div>
                <div className="section-kicker">SUBSURFACE TEMPERATURE PROFILE</div>
                <h2>Temperature profile</h2>
              </div>
              <div className="header-pill">{hasRealProfile ? "LIVE" : "DATA UNAVAILABLE"}</div>
            </div>

            <Plot
              data={
                hasRealProfile
                  ? [
                      {
                        x: profileTemperatures,
                        y: profileDepths,
                        mode: "lines+markers",
                        type: "scatter",
                        name: "OceanEmbed",
                        line: { color: "#7fe3ff", width: 3 },
                        marker: { color: "#7fe3ff", size: 7 },
                        customdata: apiResult?.predictions.map(
                          (prediction) => prediction.uncertaintyC,
                        ),
                        hovertemplate:
                          "Temperature: %{x:.2f} °C<br>Depth: %{y} m<br>Ensemble spread: %{customdata:.2f} °C<extra></extra>",
                      },
                    ]
                  : []
              }
              layout={{
                autosize: true,
                margin: { l: 52, r: 20, t: 20, b: 42 },
                paper_bgcolor: "rgba(0,0,0,0)",
                plot_bgcolor: "rgba(0,0,0,0)",
                font: { family: "Inter, system-ui, sans-serif", color: "#dfeef4" },
                xaxis: {
                  title: "Temperature (°C)",
                  titlefont: { color: "#dfeef4" },
                  tickfont: { color: "#8aa7b8" },
                  gridcolor: "rgba(130, 175, 198, 0.15)",
                  zerolinecolor: "rgba(130, 175, 198, 0.15)",
                },
                yaxis: {
                  title: "Depth (m)",
                  titlefont: { color: "#dfeef4" },
                  tickfont: { color: "#8aa7b8" },
                  gridcolor: "rgba(130, 175, 198, 0.15)",
                  autorange: "reversed",
                },
                legend: { orientation: "h", y: 1.15, font: { color: "#dfeef4" } },
                annotations: hasRealProfile
                  ? []
                  : [
                      {
                        text: "Run reconstruction to display the real temperature profile.",
                        x: 0.5,
                        y: 0.5,
                        xref: "paper",
                        yref: "paper",
                        showarrow: false,
                        font: { size: 14, color: "#dfeef4" },
                      },
                    ],
              }}
              style={{ width: "100%", height: "430px" }}
              config={{ responsive: true, displayModeBar: false }}
            />

            <div className="profile-summary">
              <div className="summary-chip">
                <span>Surface temperature</span>
                <strong>{surfaceTemp !== null ? `${surfaceTemp.toFixed(2)} °C` : "Not available"}</strong>
              </div>
              <div className="summary-chip">
                <span>Deep temperature</span>
                <strong>{deepTemp !== null ? `${deepTemp.toFixed(2)} °C` : "Not available"}</strong>
              </div>
              <div className="summary-chip">
                <span>Strongest gradient</span>
                <strong>
                  {maxGradient
                    ? `${Math.abs(maxGradient.gradient).toFixed(3)} °C m⁻¹ at ${maxGradient.depth.toFixed(0)} m`
                    : "Not available"}
                </strong>
              </div>
            </div>
          </div>

          <div className="card chart-card">
            <div className="section-header condensed">
              <div>
                <div className="section-kicker">SCIENTIFIC ANALYSIS</div>
                <h2>Depth gradient</h2>
              </div>
              <div className="header-pill">dT/dz</div>
            </div>

            <Plot
              data={
                gradientData.length > 0
                  ? [
                      {
                        x: gradientData.map((item) => item.gradient),
                        y: gradientData.map((item) => item.depth),
                        mode: "lines+markers",
                        type: "scatter",
                        line: { color: "#8be7d0", width: 3 },
                        marker: { color: "#8be7d0", size: 6 },
                        name: "Gradient",
                      },
                    ]
                  : []
              }
              layout={{
                autosize: true,
                margin: { l: 52, r: 20, t: 20, b: 42 },
                paper_bgcolor: "rgba(0,0,0,0)",
                plot_bgcolor: "rgba(0,0,0,0)",
                font: { family: "Inter, system-ui, sans-serif", color: "#dfeef4" },
                xaxis: {
                  title: "dT/dz (°C m⁻¹)",
                  titlefont: { color: "#dfeef4" },
                  tickfont: { color: "#8aa7b8" },
                  gridcolor: "rgba(130, 175, 198, 0.15)",
                },
                yaxis: {
                  title: "Depth (m)",
                  titlefont: { color: "#dfeef4" },
                  tickfont: { color: "#8aa7b8" },
                  gridcolor: "rgba(130, 175, 198, 0.15)",
                  autorange: "reversed",
                },
                annotations: gradientData.length > 0 ? [] : [
                  {
                    text: "Gradient analysis becomes available after a successful reconstruction.",
                    x: 0.5,
                    y: 0.5,
                    xref: "paper",
                    yref: "paper",
                    showarrow: false,
                    font: { size: 14, color: "#dfeef4" },
                  },
                ],
              }}
              style={{ width: "100%", height: "430px" }}
              config={{ responsive: true, displayModeBar: false }}
            />
          </div>
        </section>

        <section className="details-grid">
          <div className="card table-card">
            <div className="section-header condensed">
              <div>
                <div className="section-kicker">DEPTH PROFILE TABLE</div>
                <h2>15-depth reconstruction</h2>
              </div>
              <div className="header-pill">API OUTPUT</div>
            </div>

            <div className="depth-table">
              <div className="table-head">
                <span>Depth</span>
                <span>Temperature</span>
                <span>Ensemble Spread</span>
              </div>

              {DEPTHS.map((depthValue) => {
                const prediction = apiResult?.predictions.find((item) => item.depthM === depthValue);
                const temperature = prediction ? prediction.temperatureC : null;
                const ensembleSpread = prediction ? prediction.uncertaintyC : null;

                return (
                  <div key={depthValue} className={`table-row ${depthValue === depth ? "selected" : ""}`}>
                    <span>{depthValue} m</span>
                    <strong>{temperature !== null && temperature !== undefined ? `${temperature.toFixed(2)} °C` : "N/A"}</strong>
                    <span>{ensembleSpread !== null && ensembleSpread !== undefined ? `± ${ensembleSpread.toFixed(2)} °C` : "N/A"}</span>
                  </div>
                );
              })}
            </div>
            <div className="controlNote">
              Ensemble spread = standard deviation across 3 model seeds; it is not absolute physical uncertainty.
            </div>
          </div>

          <div className="card info-card">
            <div className="section-header condensed">
              <div>
                <div className="section-kicker">MODEL + VALIDATION</div>
                <h2>OceanEmbed model card</h2>
              </div>
            </div>

            <div className="model-grid">
              <div className="model-row"><span>MODEL</span><strong>OceanEmbed-CNN</strong></div>
              <div className="model-row"><span>EXPERIMENT</span><strong>E2 — Retrospective 7-day input window</strong></div>
              <div className="model-row"><span>INPUT</span><strong>49 channels</strong></div>
              <div className="model-row"><span>LATENT</span><strong>128 channels</strong></div>
              <div className="model-row"><span>OUTPUT</span><strong>15 depth levels</strong></div>
              <div className="model-row"><span>GRID</span><strong>0.25°</strong></div>
              <div className="model-row"><span>ENSEMBLE</span><strong>3 seeds</strong></div>
              <div className="model-row"><span>TARGET</span><strong>GLORYS thetao</strong></div>
            </div>

            <div className="validation-block">
              <div className="validation-header">GLORYS</div>
              <p>Test complete</p>
              <div className="validation-text">GLORYS held-out test evaluation is complete.</div>
            </div>

            <div className="validation-block argostage">
              <div className="validation-header">ARGO</div>
              <p>Planned</p>
              <div className="validation-text">Independent ARGO observational validation is planned.</div>
            </div>
          </div>
        </section>
        </main>

        <footer className="footer-bar">
          <span>OCEANEMBED · SIH 2026</span>
          <span>5°N–30°N / 45°E–105°E</span>
        </footer>
      </div>
    </div>
  );
}

export default App;
