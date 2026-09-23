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

export default function SurfaceInputs() {
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
        {SURFACE_VARIABLES.map((variable) => (
          <div
            className="surfaceInput"
            key={variable.name}
          >
            <div className="surfaceInputName">
              {variable.name}
            </div>

            <div className="surfaceInputDescription">
              {variable.description}
            </div>

            <div className="surfaceInputUnit">
              {variable.unit}
            </div>
          </div>
        ))}
      </div>

      <div className="controlNote">
        Daily surface observations are harmonized to the
        0.25° OceanEmbed grid and used as the model input.
      </div>
    </section>
  );
}
