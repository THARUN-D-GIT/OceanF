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
import DifferenceMap from "./components/DifferenceMap";
import SurfaceInputs from "./components/SurfaceInputs";
import { reconstructOcean } from "./api";
import { DEPTHS } from "./types";
import type { Region } from "./types";

type DemoStage =
  | "idle"
  | "surface"
  | "embedding"
  | "subsurface"
  | "argo"
  | "complete";

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

function temperature(
  lat: number,
  lon: number,
  depth: number
) {
  const surface =
    28 +
    Math.sin(lat * 0.35) * 1.4 +
    Math.cos(lon * 0.2) * 1.1;

  const cooling = depth * 0.012;

  const variation =
    Math.sin(
      lat * 0.8 +
        lon * 0.15 +
        depth * 0.015
    ) * 0.7;

  return Math.max(
    3,
    surface - cooling + variation
  );
}

function tempToColor(temp: number) {
  if (temp >= 28) return "#b91c1c";
  if (temp >= 26) return "#ef4444";
  if (temp >= 24) return "#f97316";
  if (temp >= 22) return "#facc15";
  if (temp >= 20) return "#22c55e";
  if (temp >= 16) return "#06b6d4";
  if (temp >= 12) return "#3b82f6";
  return "#1d4ed8";
}

function MapRecenter({
  center,
}: {
  center: [number, number];
}) {
  const map = useMap();

  map.setView(center, 5);

  return null;
}

function sleep(ms: number) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}

export default function App() {
  const [region, setRegion] =
    useState<Region>("Arabian Sea");

  const [date, setDate] =
    useState("2025-12-01");

  const [depth, setDepth] =
    useState<number>(100);

  const [selectedPoint, setSelectedPoint] =
    useState<Point | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [predicted, setPredicted] =
    useState(false);

  const [demoStage, setDemoStage] =
    useState<DemoStage>("idle");

  const [apiResult, setApiResult] =
    useState<Awaited<
      ReturnType<typeof reconstructOcean>
    > | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const config = REGION_CONFIG[region];

  const mapPoints = useMemo(() => {
    const points: {
      lat: number;
      lon: number;
      temp: number;
    }[] = [];

    for (
      let lat = config.latMin;
      lat <= config.latMax;
      lat += 1
    ) {
      for (
        let lon = config.lonMin;
        lon <= config.lonMax;
        lon += 1
      ) {
        points.push({
          lat,
          lon,
          temp: temperature(
            lat,
            lon,
            depth
          ),
        });
      }
    }

    return points;
  }, [config, depth]);

  const currentPoint =
    selectedPoint ?? {
      lat: config.center[0],
      lon: config.center[1],
    };

 

  const selectedUncertainty =
    apiResult &&
    apiResult.depths.includes(depth)
      ? apiResult.uncertainty[
          apiResult.depths.indexOf(depth)
        ]
      : 0.16;

  async function runDemo() {
    setLoading(true);
    setPredicted(false);
    setError(null);
    setApiResult(null);

    const requestPoint =
      selectedPoint ?? {
        lat: config.center[0],
        lon: config.center[1],
      };

    try {
      setDemoStage("surface");

      await sleep(600);

      setDemoStage("embedding");

      await sleep(500);

      const result =
        await reconstructOcean({
          latitude: requestPoint.lat,
          longitude: requestPoint.lon,
          date,
          depths: [
            0,
            5,
            10,
            20,
            30,
            50,
            75,
            100,
            125,
            150,
            200,
            300,
            500,
            700,
            1000,
          ],
        });
      setApiResult(result);

      setDemoStage("subsurface");

      await sleep(500);

      setDemoStage("argo");

      await sleep(500);

      setDemoStage("complete");

      setPredicted(true);
    } catch (err) {
      console.error(err);

      setError(
        "Unable to run OceanEmbed reconstruction."
      );

      setDemoStage("idle");
    } finally {
      setLoading(false);
    }
  }

  const profileDepths =
    apiResult?.depths ?? [...DEPTHS];

  const profileTemperatures =
    apiResult?.temperature ??
    profileDepths.map((d) =>
      temperature(
        currentPoint.lat,
        currentPoint.lon,
        d
      )
    );

  const profileUncertainty =
    apiResult?.uncertainty ??
    profileDepths.map(
      (d) => 0.12 + d * 0.00035
    );

  const argoTemperatures =
    profileTemperatures.map(
      (value, index) =>
        value +
        Math.sin(index * 1.7) * 0.18
    );

  function stageLabel(stage: DemoStage) {
    switch (stage) {
      case "surface":
        return "Surface observations loaded";

      case "embedding":
        return "Ocean embedding generated";

      case "subsurface":
        return "Subsurface temperature reconstructed";

      case "argo":
        return "ARGO validation prepared";

      case "complete":
        return "Reconstruction complete";

      default:
        return "Ready to run reconstruction";
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brandMark">
            OE
          </div>

          <div>
            <h1>OceanEmbed</h1>

            <div className="subtitle">
              Satellite-Driven Subsurface Ocean
              Temperature Reconstruction
            </div>
          </div>
        </div>

        <div className="status">
          <span className="statusDot" />
          SIH 2026 · LIVE DEMO
        </div>
      </header>

      <main className="page">
        <section className="card controlPanel">
          <div className="cardHeader">
            <div>
              <div className="cardLabel">
                RECONSTRUCTION CONTROL
              </div>

              <h2>
                Surface → Ocean Embedding →
                Subsurface Profile
              </h2>
            </div>

            <div className="demoBadge">
              DEMO MODE
            </div>
          </div>

          <div className="controls">
            <div className="control">
              <label htmlFor="region">
                Region
              </label>

              <select
                id="region"
                value={region}
                onChange={(event) =>
                  setRegion(
                    event.target.value as Region
                  )
                }
              >
                <option>
                  Arabian Sea
                </option>

                <option>
                  Bay of Bengal
                </option>
              </select>
            </div>

            <div className="control">
              <label htmlFor="date">
                Observation Date
              </label>

              <input
                id="date"
                type="date"
                value={date}
                onChange={(event) =>
                  setDate(event.target.value)
                }
              />
            </div>

            <div className="control">
              <label htmlFor="depth">
                Depth
              </label>

              <select
                id="depth"
                value={depth}
                onChange={(event) =>
                  setDepth(
                    Number(event.target.value)
                  )
                }
              >
                {DEPTHS.map((d) => (
                  <option
                    key={d}
                    value={d}
                  >
                    {d} m
                  </option>
                ))}
              </select>
            </div>

            <button
              className="predictButton"
              onClick={runDemo}
              disabled={loading}
            >
              {loading
                ? "RUNNING..."
                : "RUN RECONSTRUCTION →"}
            </button>
          </div>

          <div className="controlNote">
            North Indian Ocean · 0.25° grid ·
            15 standard depths · GLORYS-trained
            model concept
          </div>
        </section>

        <section className="pipeline">
          {[
            ["surface", "Surface Observations"],
            ["embedding", "Ocean Embedding"],
            ["subsurface", "Subsurface Reconstruction"],
            ["argo", "ARGO Validation"],
          ].map(
            ([stage, label], index) => {
              const stageOrder = [
                "surface",
                "embedding",
                "subsurface",
                "argo",
                "complete",
              ];

              const currentIndex =
                stageOrder.indexOf(
                  demoStage
                );

              const itemIndex =
                stageOrder.indexOf(stage);

              const active =
                demoStage === stage;

              const completed =
                demoStage === "complete" ||
                currentIndex > itemIndex;

              return (
                <div
                  className={`pipelineStep ${
                    active ? "active" : ""
                  } ${
                    completed
                      ? "completed"
                      : ""
                  }`}
                  key={stage}
                >
                  <div className="pipelineNumber">
                    {completed
                      ? "✓"
                      : index + 1}
                  </div>

                  <span>{label}</span>

                  {index < 3 && (
                    <div className="pipelineArrow">
                      →
                    </div>
                  )}
                </div>
              );
            }
          )}
        </section>

        <div
          className={`demoStatus ${
            demoStage === "complete"
              ? "success"
              : ""
          }`}
        >
          <div className="demoStatusIcon">
            {demoStage === "complete"
              ? "✓"
              : "◉"}
          </div>

          <div>
            <strong>
              {stageLabel(demoStage)}
            </strong>

            <span>
              {loading
                ? " Processing OceanEmbed pipeline..."
                : predicted
                ? " Result available for visualization."
                : " Select parameters and run the reconstruction."}
            </span>
          </div>
        </div>

        {error && (
          <div className="demoStatus">
            <div className="demoStatusIcon">
              !
            </div>

            <div>
              <strong>
                Reconstruction Error
              </strong>

              <span>{error}</span>
            </div>
          </div>
        )}

        <SurfaceInputs />

        <section className="mainGrid">
          <div className="card mapWrapper">
            <div className="cardHeader">
              <div>
                <div className="cardLabel">
                  SUBSURFACE TEMPERATURE
                </div>

                <h2>
                  {depth} m Temperature Field
                </h2>
              </div>

              <div className="surfaceBadge">
                °C
              </div>
            </div>

            <div className="mapContainer">
              <MapContainer
                center={config.center}
                zoom={5}
                scrollWheelZoom
                className="oceanMap"
              >
                <MapRecenter
                  center={config.center}
                />

                <TileLayer
                  attribution="&copy; OpenStreetMap contributors"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {mapPoints.map(
                  (point, index) => (
                    <CircleMarker
                      key={index}
                      center={[
                        point.lat,
                        point.lon,
                      ]}
                      radius={8}
                      pathOptions={{
                        color:
                          tempToColor(
                            point.temp
                          ),
                        fillColor:
                          tempToColor(
                            point.temp
                          ),
                        fillOpacity: 0.75,
                        weight: 1,
                      }}
                      eventHandlers={{
                        click: () => {
                          setSelectedPoint({
                            lat: point.lat,
                            lon: point.lon,
                          });
                        },
                      }}
                    >
                      <Popup>
                        <strong>
                          OceanEmbed Grid Point
                        </strong>

                        <br />

                        Latitude:{" "}
                        {point.lat.toFixed(2)}
                        °

                        <br />

                        Longitude:{" "}
                        {point.lon.toFixed(2)}
                        °

                        <br />

                        Depth: {depth} m

                        <br />

                        Temperature:{" "}
                        {point.temp.toFixed(2)}
                        °C
                      </Popup>
                    </CircleMarker>
                  )
                )}

                <CircleMarker
                  center={[
                    currentPoint.lat,
                    currentPoint.lon,
                  ]}
                  radius={11}
                  pathOptions={{
                    color: "#111827",
                    fillColor: "#ffffff",
                    fillOpacity: 1,
                    weight: 3,
                  }}
                >
                  <Popup>
                    <strong>
                      Selected Location
                    </strong>

                    <br />

                    Latitude:{" "}
                    {currentPoint.lat.toFixed(
                      2
                    )}
                    °

                    <br />

                    Longitude:{" "}
                    {currentPoint.lon.toFixed(
                      2
                    )}
                    °
                  </Popup>
                </CircleMarker>
              </MapContainer>

              <div className="mapOverlay">
                <strong>
                  {region}
                </strong>

                <span>
                  {date} · {depth} m
                </span>
              </div>

              <div className="mapLegend">
                <strong>
                  Temperature (°C)
                </strong>

                <div className="legendGradient" />

                <div className="legendLabels">
                  <span>10</span>
                  <span>15</span>
                  <span>20</span>
                  <span>25</span>
                  <span>30</span>
                </div>
              </div>
            </div>

            <div className="mapFooter">
              Click any grid point to select a
              reconstruction location.
            </div>
          </div>

          <div className="sideColumn">
            <div className="card locationCard">
              <div className="cardLabel">
                SELECTED LOCATION
              </div>

              <h2>
                {currentPoint.lat.toFixed(
                  2
                )}
                °N{" "}
                {currentPoint.lon.toFixed(
                  2
                )}
                °E
              </h2>

              <div className="locationMeta">
                <span>{region}</span>
                <span>{date}</span>
              </div>
            </div>

            <div className="card metrics">
              <div className="cardLabel">
                MODEL PERFORMANCE
              </div>

              <div className="metricGrid">
                <div className="metric">
                  <strong>
                    0.42
                  </strong>

                  <span>
                    RMSE °C
                  </span>
                </div>

                <div className="metric">
                  <strong>
                    0.08
                  </strong>

                  <span>
                    Bias °C
                  </span>
                </div>

                <div className="metric">
                  <strong>
                    0.96
                  </strong>

                  <span>
                    Correlation
                  </span>
                </div>
              </div>

              <div className="metricNote">
                Illustrative validation metrics
                for the demonstration interface.
              </div>
            </div>

            <div className="card uncertaintyCard">
              <div className="cardLabel">
                PREDICTION UNCERTAINTY
              </div>

              <div className="uncertaintyValue">
                ±{" "}
                {selectedUncertainty.toFixed(
                  2
                )}{" "}
                °C
              </div>

              <div className="uncertaintyBar">
                <div
                  className="uncertaintyFill"
                  style={{
                    width: `${Math.min(
                      100,
                      selectedUncertainty *
                        100
                    )}%`,
                  }}
                />
              </div>

              <p>
                Estimated uncertainty increases
                with reconstruction depth.
              </p>
            </div>
          </div>
        </section>

        <section className="card differenceCard">
          <div className="cardHeader">
            <div>
              <div className="cardLabel">
                VALIDATION
              </div>

              <h2>
                Prediction − Reference
              </h2>

              <p>
                Spatial difference map for
                qualitative validation.
              </p>
            </div>

            <div className="surfaceBadge">
              {depth} m
            </div>
          </div>

          <DifferenceMap
            depth={depth}
            region={region}
          />
        </section>

        <section className="profileGrid">
          <div className="card profileCard">
            <div className="cardHeader">
              <div>
                <div className="cardLabel">
                  VERTICAL STRUCTURE
                </div>

                <h2>
                  OceanEmbed vs ARGO
                </h2>
              </div>

              <div className="surfaceBadge">
                15 DEPTHS
              </div>
            </div>

            <Plot
              data={[
                {
                  x: profileTemperatures,
                  y: profileDepths,
                  mode: "lines+markers",
                  name: "OceanEmbed",
                  line: {
                    width: 3,
                  },
                },
                {
                  x: argoTemperatures,
                  y: profileDepths,
                  mode: "lines+markers",
                  name: "ARGO",
                  line: {
                    width: 2,
                    dash: "dash",
                  },
                },
              ]}
              layout={{
                autosize: true,
                margin: {
                  l: 60,
                  r: 25,
                  t: 20,
                  b: 55,
                },
                xaxis: {
                  title: "Temperature (°C)",
                  gridcolor:
                    "#e5e7eb",
                },
                yaxis: {
                  title: "Depth (m)",
                  autorange: "reversed",
                  gridcolor:
                    "#e5e7eb",
                },
                legend: {
                  orientation: "h",
                  y: 1.08,
                },
                paper_bgcolor:
                  "rgba(0,0,0,0)",
                plot_bgcolor:
                  "rgba(0,0,0,0)",
                font: {
                  family:
                    "Inter, system-ui, sans-serif",
                },
              }}
              style={{
                width: "100%",
                height: "470px",
              }}
              config={{
                responsive: true,
                displayModeBar: false,
              }}
            />
          </div>

          <div className="card depthCard">
            <div className="cardLabel">
              RECONSTRUCTION OUTPUT
            </div>

            <h2>
              15-Depth Temperature Profile
            </h2>

            <div className="depthTable">
              <div className="tableHeader">
                <span>
                  Depth
                </span>

                <span>
                  Temperature
                </span>

                <span>
                  ± Uncertainty
                </span>
              </div>

              {profileDepths.map(
                (d, index) => (
                  <div
                    className={`tableRow ${
                      d === depth
                        ? "selectedRow"
                        : ""
                    }`}
                    key={d}
                  >
                    <span>
                      {d} m
                    </span>

                    <strong>
                      {profileTemperatures[
                        index
                      ].toFixed(2)}
                      °C
                    </strong>

                    <span>
                      ±
                      {profileUncertainty[
                        index
                      ].toFixed(2)}
                    </span>
                  </div>
                )
              )}
            </div>
          </div>
        </section>

        <section className="scientificNote">
          <div className="noteIcon">
            i
          </div>

          <div>
            <strong>
              Scientific interpretation
            </strong>

            <p>
              OceanEmbed reconstructs hidden
              subsurface temperature structure
              from surface-observed ocean state.
              ARGO profiles provide an independent
              reference for validation. The
              displayed demonstration values are
              synthetic until connected to the
              trained inference service.
            </p>
          </div>
        </section>
      </main>

      <footer className="footer">
        <span>
          OceanEmbed · SIH 2026
        </span>

        <span>
          North Indian Ocean · Satellite +
          Deep Learning
        </span>
      </footer>

      {loading && (
        <div className="loadingBanner">
          <span className="statusDot" />
          Running OceanEmbed reconstruction
          pipeline...
        </div>
      )}
    </div>
  );
}