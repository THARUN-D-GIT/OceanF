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
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function App() {
  const [region, setRegion] =
    useState<Region>("Arabian Sea");

  const [date, setDate] =
    useState("2026-09-20");

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

  const currentPoint =
    selectedPoint ?? {
      lat: config.center[0],
      lon: config.center[1],
    };

  /*
   * These are geographic grid points only.
   *
   * We deliberately do NOT generate synthetic temperatures here.
   * The actual OceanEmbed API currently returns a point reconstruction,
   * not a complete 2D temperature field.
   */
  const mapPoints = useMemo(() => {
    const points: {
      lat: number;
      lon: number;
    }[] = [];

    for (
      let lat = config.latMin;
      lat <= config.latMax;
      lat += 2
    ) {
      for (
        let lon = config.lonMin;
        lon <= config.lonMax;
        lon += 2
      ) {
        points.push({
          lat,
          lon,
        });
      }
    }

    return points;
  }, [config]);

  const selectedPrediction =
    apiResult?.predictions.find(
      (prediction) =>
        prediction.depthM === depth
    ) ?? null;

  const profileDepths =
    apiResult?.predictions.map(
      (prediction) => prediction.depthM
    ) ?? DEPTHS;

  const profileTemperatures =
    apiResult?.predictions.map(
      (prediction) =>
        prediction.temperatureC
    ) ?? [];

  const profileUncertainty =
    apiResult?.predictions.map(
      (prediction) =>
        prediction.uncertaintyC
    ) ?? [];

  const hasRealProfile =
    apiResult !== null &&
    apiResult.predictions.length > 0;

  const selectedUncertainty =
    selectedPrediction?.uncertaintyC ?? null;

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

      await sleep(400);

      setDemoStage("embedding");

      await sleep(400);

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

      await sleep(400);

      /*
       * ARGO is an independent validation source in the
       * scientific workflow, but is not yet connected to
       * this live frontend.
       */
      setDemoStage("argo");

      await sleep(300);

      setDemoStage("complete");

      setPredicted(true);
    } catch (err) {
      console.error(err);

      const message =
        err instanceof Error
          ? err.message
          : "Unable to run OceanEmbed reconstruction.";

      setError(message);
      setDemoStage("idle");
    } finally {
      setLoading(false);
    }
  }

  function stageLabel(stage: DemoStage) {
    switch (stage) {
      case "surface":
        return "Surface observations loaded";

      case "embedding":
        return "Ocean embedding generated";

      case "subsurface":
        return "Subsurface temperature reconstructed";

      case "argo":
        return "Independent ARGO validation stage";

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
              LIVE MODEL
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
                onChange={(event) => {
                  setRegion(
                    event.target.value as Region
                  );
                  setSelectedPoint(null);
                  setApiResult(null);
                  setPredicted(false);
                  setDemoStage("idle");
                }}
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
                onChange={(event) => {
                  setDate(event.target.value);
                  setApiResult(null);
                  setPredicted(false);
                  setDemoStage("idle");
                }}
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
            15 standard depths · OceanEmbed V1
          </div>
        </section>

        <section className="pipeline">
          {[
            ["surface", "Surface Observations"],
            ["embedding", "Ocean Embedding"],
            [
              "subsurface",
              "Subsurface Reconstruction",
            ],
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
                ? " Processing live OceanEmbed inference..."
                : predicted
                ? " Real backend result available for visualization."
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
                  RECONSTRUCTION LOCATION
                </div>

                <h2>
                  {depth} m Temperature
                  Request
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
                  (point, index) => {
                    const isSelected =
                      Math.abs(
                        point.lat -
                          currentPoint.lat
                      ) < 0.001 &&
                      Math.abs(
                        point.lon -
                          currentPoint.lon
                      ) < 0.001;

                    return (
                      <CircleMarker
                        key={index}
                        center={[
                          point.lat,
                          point.lon,
                        ]}
                        radius={
                          isSelected ? 8 : 4
                        }
                        pathOptions={{
                          color:
                            isSelected
                              ? "#111827"
                              : "#2563eb",
                          fillColor:
                            isSelected
                              ? "#ffffff"
                              : "#3b82f6",
                          fillOpacity:
                            isSelected
                              ? 1
                              : 0.45,
                          weight:
                            isSelected
                              ? 3
                              : 1,
                        }}
                        eventHandlers={{
                          click: () => {
                            setSelectedPoint({
                              lat: point.lat,
                              lon: point.lon,
                            });

                            setApiResult(null);
                            setPredicted(false);
                            setDemoStage("idle");
                          },
                        }}
                      >
                        <Popup>
                          <strong>
                            OceanEmbed Grid
                            Point
                          </strong>

                          <br />

                          Latitude:{" "}
                          {point.lat.toFixed(
                            2
                          )}
                          °

                          <br />

                          Longitude:{" "}
                          {point.lon.toFixed(
                            2
                          )}
                          °
                        </Popup>
                      </CircleMarker>
                    );
                  }
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

                    <br />

                    {selectedPrediction ? (
                      <>
                        Depth: {depth} m
                        <br />
                        Temperature:{" "}
                        {selectedPrediction.temperatureC.toFixed(
                          2
                        )} °C
                      </>
                    ) : (
                      <>
                        Run reconstruction to
                        obtain temperature.
                      </>
                    )}
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
                  OceanEmbed Selection Map
                </strong>

                <div className="legendLabels">
                  <span>
                    Click a grid point to
                    reconstruct
                  </span>
                </div>
              </div>
            </div>

            <div className="mapFooter">
              Select a 0.25° grid location,
              then run the real OceanEmbed
              reconstruction.
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
                MODEL INFORMATION
              </div>

              <div className="metricGrid">
                <div className="metric">
                  <strong>
                    {apiResult
                      ? apiResult.modelVersion
                      : "V1.0"}
                  </strong>

                  <span>
                    MODEL VERSION
                  </span>
                </div>

                <div className="metric">
                  <strong>
                    0.25°
                  </strong>

                  <span>
                    GRID RESOLUTION
                  </span>
                </div>

                <div className="metric">
                  <strong>
                    15
                  </strong>

                  <span>
                    DEPTH LEVELS
                  </span>
                </div>
              </div>

              <div className="metricNote">
                Live predictions use the
                OceanEmbed V1 three-seed
                ensemble.
              </div>
            </div>

            <div className="card uncertaintyCard">
              <div className="cardLabel">
                PREDICTION UNCERTAINTY
              </div>

              <div className="uncertaintyValue">
                {selectedUncertainty !==
                null
                  ? `± ${selectedUncertainty.toFixed(
                      2
                    )} °C`
                  : "Not available"}
              </div>

              <div className="uncertaintyBar">
                <div
                  className="uncertaintyFill"
                  style={{
                    width:
                      selectedUncertainty !==
                      null
                        ? `${Math.min(
                            100,
                            selectedUncertainty *
                              100
                          )}%`
                        : "0%",
                  }}
                />
              </div>

              <p>
                The current backend does not
                expose ensemble spread as a
                prediction uncertainty value.
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
                GLORYS Evaluation Status
              </h2>

              <p>
                Independent evaluation is
                performed against held-out GLORYS
                target data. Spatial difference
                fields are not fabricated in the
                live demo.
              </p>
            </div>

            <div className="surfaceBadge">
              V1
            </div>
          </div>

          <div className="demoStatus">
            <div className="demoStatusIcon">
              ✓
            </div>

            <div>
              <strong>
                Held-out GLORYS evaluation
                completed
              </strong>

              <span>
                RMSE, MAE, bias and Pearson
                correlation were evaluated
                across the 15 target depths.
              </span>
            </div>
          </div>
        </section>

        <section className="profileGrid">
          <div className="card profileCard">
            <div className="cardHeader">
              <div>
                <div className="cardLabel">
                  VERTICAL STRUCTURE
                </div>

                <h2>
                  OceanEmbed Temperature
                  Profile
                </h2>
              </div>

              <div className="surfaceBadge">
                {hasRealProfile
                  ? "LIVE"
                  : "15 DEPTHS"}
              </div>
            </div>

            <Plot
              data={
                hasRealProfile
                  ? [
                      {
                        x: profileTemperatures,
                        y: profileDepths,
                        mode: "lines+markers",
                        name: "OceanEmbed",
                        line: {
                          width: 3,
                        },
                      },
                    ]
                  : []
              }
              layout={{
                autosize: true,
                margin: {
                  l: 60,
                  r: 25,
                  t: 20,
                  b: 55,
                },
                xaxis: {
                  title:
                    "Temperature (°C)",
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
                annotations: hasRealProfile
                  ? []
                  : [
                      {
                        text:
                          "Run reconstruction to display the real temperature profile",
                        showarrow: false,
                        x: 0.5,
                        y: 0.5,
                        xref: "paper",
                        yref: "paper",
                        font: {
                          size: 14,
                        },
                      },
                    ],
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
                      {hasRealProfile
                        ? `${profileTemperatures[
                            index
                          ].toFixed(2)} °C`
                        : "—"}
                    </strong>

                    <span>
                      {hasRealProfile &&
                      profileUncertainty[
                        index
                      ] !== null
                        ? `± ${profileUncertainty[
                            index
                          ]!.toFixed(2)}`
                        : "N/A"}
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
              The live demo currently uses a
              7-day retrospective surface window
              and predicts the 15 specified
              subsurface depths. GLORYS is used
              for held-out model evaluation, while
              ARGO is designated as the
              independent observational validation
              source. ARGO observations are not
              yet connected to this live dashboard.
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
          Running live OceanEmbed
          reconstruction pipeline...
        </div>
      )}
    </div>
  );
}