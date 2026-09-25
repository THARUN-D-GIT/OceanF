import { useMemo, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import Plot from "react-plotly.js";

import "./App.css";
import SurfaceInputs from "./components/SurfaceInputs";
import { OceanEmbedError, reconstructOcean } from "./api";
import { DEPTHS } from "./types";
import type { Region } from "./types";

type DemoStage = "idle" | "surface" | "embedding" | "subsurface" | "complete";

interface Point {
  lat: number;
  lon: number;
}

const REGION_CONFIG: Record<
  Region,
  {
    center: [number, number];
    latMin: number;
    latMax: number;
    lonMin: number;
    lonMax: number;
  }
> = {
  "Arabian Sea": {
    center: [15.5, 65.5],
    latMin: 8,
    latMax: 24,
    lonMin: 52,
    lonMax: 76,
  },
  "Bay of Bengal": {
    center: [15.5, 88],
    latMin: 8,
    latMax: 24,
    lonMin: 80,
    lonMax: 98,
  },
};

const DEFAULT_DATE = "2026-09-20";
const DOMAIN = {
  latitudeMin: 5,
  latitudeMax: 30,
  longitudeMin: 45,
  longitudeMax: 105,
} as const;

type ReconstructionError =
  | { kind: "domain"; message: string }
  | { kind: "unsupported-location" }
  | { kind: "request-failed" };

const UNSUPPORTED_LOCATION_MESSAGE =
  "This location is within the North Indian Ocean domain, but it cannot currently be represented by the model's prediction tile.";
const UNSUPPORTED_LOCATION_HELPER =
  "Please select a nearby location inside the supported reconstruction area.";

function MapRecenter({ center }: { center: [number, number] }) {
  const map = useMap();
  map.setView(center, 5);
  return null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatCoordinate(value: number, axis: "lat" | "lon") {
  const sign = axis === "lat" ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W";
  return `${Math.abs(value).toFixed(2)}°${sign}`;
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
  const [date, setDate] = useState(DEFAULT_DATE);
  const [depth, setDepth] = useState<number>(100);
  const [latitude, setLatitude] = useState(15.5);
  const [longitude, setLongitude] = useState(65.5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ReconstructionError | null>(null);
  const [demoStage, setDemoStage] = useState<DemoStage>("idle");
  const [apiResult, setApiResult] = useState<Awaited<ReturnType<typeof reconstructOcean>> | null>(null);

  const config = REGION_CONFIG[region];
  const selectedPoint: Point = { lat: latitude, lon: longitude };

  const mapPoints = useMemo(() => {
    const points: Point[] = [];

    for (let lat = config.latMin; lat <= config.latMax; lat += 2) {
      for (let lon = config.lonMin; lon <= config.lonMax; lon += 2) {
        points.push({ lat, lon });
      }
    }

    return points;
  }, [config]);

  const selectedPrediction =
    apiResult?.predictions.find((prediction) => prediction.depthM === depth) ?? null;

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
        return "Preparing 7-day observation window";
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
    setLatitude(nextConfig.center[0]);
    setLongitude(nextConfig.center[1]);
    setApiResult(null);
    setError(null);
    setDemoStage("idle");
  }

  async function runReconstruction() {
    if (selectedPoint.lat < DOMAIN.latitudeMin || selectedPoint.lat > DOMAIN.latitudeMax) {
      setApiResult(null);
      setError({ kind: "domain", message: "Latitude must be between 5°N and 30°N." });
      setDemoStage("idle");
      return;
    }

    if (selectedPoint.lon < DOMAIN.longitudeMin || selectedPoint.lon > DOMAIN.longitudeMax) {
      setApiResult(null);
      setError({ kind: "domain", message: "Longitude must be between 45°E and 105°E." });
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

      const result = await reconstructOcean({
        latitude: selectedPoint.lat,
        longitude: selectedPoint.lon,
        date,
        depths: [...DEPTHS],
      });

      setApiResult(result);
      setDemoStage("subsurface");
      await sleep(450);
      setDemoStage("complete");
    } catch (err) {
      setError({
        kind: err instanceof OceanEmbedError ? err.kind : "request-failed",
      });
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
            <strong>2026-09-20</strong>
          </div>
          <div className="context-item">
            <span className="context-label">INPUT WINDOW</span>
            <strong>2026-09-14 → 2026-09-20</strong>
          </div>
          <div className="context-item">
            <span className="context-label">SURFACE VARIABLES</span>
            <strong>7</strong>
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
            <strong>LIVE / READY</strong>
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
                  min={5}
                  max={30}
                  step="0.01"
                  value={latitude}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (Number.isNaN(next)) return;
                    setLatitude(next);
                    setApiResult(null);
                    setError(null);
                    setDemoStage("idle");
                  }}
                />
              </div>

              <div className="control-block">
                <label htmlFor="longitude">Longitude</label>
                <input
                  id="longitude"
                  type="number"
                  min={45}
                  max={105}
                  step="0.01"
                  value={longitude}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (Number.isNaN(next)) return;
                    setLongitude(next);
                    setApiResult(null);
                    setError(null);
                    setDemoStage("idle");
                  }}
                />
              </div>

              <div className="control-block">
                <label htmlFor="date">Date</label>
                <input
                  id="date"
                  type="date"
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

              <button className="reconstruct-button" type="button" onClick={runReconstruction} disabled={loading}>
                {loading ? "RUNNING..." : "RUN RECONSTRUCTION"}
              </button>
            </div>

            <div className="location-panel">
              <div className="map-shell">
                <MapContainer center={config.center} zoom={5} scrollWheelZoom className="ocean-map">
                  <MapRecenter center={config.center} />
                  <TileLayer
                    attribution="&copy; OpenStreetMap contributors"
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />

                  {mapPoints.map((point, index) => {
                    const isSelected =
                      Math.abs(point.lat - selectedPoint.lat) < 0.001 &&
                      Math.abs(point.lon - selectedPoint.lon) < 0.001;

                    return (
                      <CircleMarker
                        key={`${point.lat}-${point.lon}-${index}`}
                        center={[point.lat, point.lon]}
                        radius={isSelected ? 8 : 4}
                        pathOptions={{
                          color: isSelected ? "#dfeef4" : "#58c2ef",
                          fillColor: isSelected ? "#dfeef4" : "#58c2ef",
                          fillOpacity: isSelected ? 1 : 0.4,
                          weight: isSelected ? 3 : 1,
                        }}
                        eventHandlers={{
                          click: () => {
                            setLatitude(point.lat);
                            setLongitude(point.lon);
                            setApiResult(null);
                            setError(null);
                            setDemoStage("idle");
                          },
                        }}
                      >
                        <Popup>
                          <div className="map-popup">
                            <strong>OceanEmbed grid point</strong>
                            <span>{formatCoordinate(point.lat, "lat")}</span>
                            <span>{formatCoordinate(point.lon, "lon")}</span>
                          </div>
                        </Popup>
                      </CircleMarker>
                    );
                  })}

                  <CircleMarker
                    center={[selectedPoint.lat, selectedPoint.lon]}
                    radius={12}
                    pathOptions={{
                      color: "#dfeef4",
                      fillColor: "#ffffff",
                      fillOpacity: 1,
                      weight: 3,
                    }}
                  >
                    <Popup>
                      <div className="map-popup">
                        <strong>Selected location</strong>
                        <span>{formatCoordinate(selectedPoint.lat, "lat")}</span>
                        <span>{formatCoordinate(selectedPoint.lon, "lon")}</span>
                        {selectedPrediction ? (
                          <span>{selectedPrediction.temperatureC.toFixed(2)} °C at {depth} m</span>
                        ) : (
                          <span>Run reconstruction to obtain temperature.</span>
                        )}
                      </div>
                    </Popup>
                  </CircleMarker>
                </MapContainer>

                <div className="map-badge">{region}</div>
              </div>

              <div className="location-summary">
                <div>
                  <div className="label-small">SELECTED LOCATION</div>
                  <div className="location-value">{formatCoordinate(selectedPoint.lat, "lat")} / {formatCoordinate(selectedPoint.lon, "lon")}</div>
                </div>
                <div>
                  <div className="label-small">OBSERVATION WINDOW</div>
                  <div className="location-value">{date}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="pipeline-panel">
            {[
              { id: "surface", label: "SATELLITE / SURFACE OBSERVATIONS" },
              { id: "quality", label: "QUALITY CONTROL + HARMONIZATION" },
              { id: "window", label: "7-DAY FEATURE WINDOW" },
              { id: "model", label: "OCEANEMBED-CNN" },
              { id: "output", label: "15-DEPTH RECONSTRUCTION" },
              { id: "validation", label: "GLORYS / ARGO VALIDATION" },
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

          <div className={`status-banner ${demoStage === "complete" ? "success" : ""}`}>
            <div className="status-banner-icon">{demoStage === "complete" ? "✓" : "◉"}</div>
            <div>
              <div className="status-banner-title">{stageLabel(demoStage)}</div>
              <div className="status-banner-copy">
                {loading
                  ? "Processing live OceanEmbed inference."
                  : demoStage === "complete"
                    ? "REAL BACKEND RESULT AVAILABLE"
                    : "Select a location and run the reconstruction."}
              </div>
            </div>
          </div>

          {error && (
            <div className={`status-banner ${error.kind === "unsupported-location" ? "warning-banner" : "error-banner"}`}>
              <div className="status-banner-icon">{error.kind === "unsupported-location" ? "!" : "×"}</div>
              <div>
                <div className="status-banner-title">
                  {error.kind === "unsupported-location"
                    ? "LOCATION NOT SUPPORTED"
                    : error.kind === "domain"
                      ? "CHECK LOCATION"
                      : "RECONSTRUCTION UNAVAILABLE"}
                </div>
                <div className="status-banner-copy">
                  {error.kind === "unsupported-location"
                    ? UNSUPPORTED_LOCATION_MESSAGE
                    : error.kind === "domain"
                      ? error.message
                      : "The reconstruction could not be completed. Please try again."}
                </div>
                {error.kind === "unsupported-location" && (
                  <div className="status-banner-copy">{UNSUPPORTED_LOCATION_HELPER}</div>
                )}
              </div>
            </div>
          )}
        </section>

        <SurfaceInputs
          observations={apiResult?.surfaceObservations}
          targetDate={apiResult?.date ?? date}
          inputWindowStart={apiResult?.inputWindowStart ?? shiftIsoDate(date, -6)}
          inputWindowEnd={apiResult?.inputWindowEnd ?? date}
          snappedLatitude={apiResult?.latitude}
          snappedLongitude={apiResult?.longitude}
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
              <div className="model-row"><span>EXPERIMENT</span><strong>E2 — 7-day retrospective</strong></div>
              <div className="model-row"><span>INPUT</span><strong>49 channels</strong></div>
              <div className="model-row"><span>LATENT</span><strong>128 channels</strong></div>
              <div className="model-row"><span>OUTPUT</span><strong>15 depth levels</strong></div>
              <div className="model-row"><span>GRID</span><strong>0.25°</strong></div>
              <div className="model-row"><span>ENSEMBLE</span><strong>3 seeds</strong></div>
              <div className="model-row"><span>TARGET</span><strong>GLORYS thetao</strong></div>
            </div>

            <div className="validation-block">
              <div className="validation-header">GLORYS</div>
              <p>Held-out evaluation</p>
              <div className="validation-text">Evaluation metrics available in project validation reports.</div>
            </div>

            <div className="validation-block argostage">
              <div className="validation-header">ARGO</div>
              <p>Independent observational validation</p>
              <div className="validation-text">STATUS: INTEGRATION STAGE</div>
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
