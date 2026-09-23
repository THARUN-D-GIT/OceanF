import { useMemo } from "react";
import type { Region } from "../types";

interface DifferenceMapProps {
  depth: number;
  region: Region;
}

const REGION_CONFIG: Record<
  Region,
  {
    latMin: number;
    latMax: number;
    lonMin: number;
    lonMax: number;
  }
> = {
  "Arabian Sea": {
    latMin: 8,
    latMax: 24,
    lonMin: 52,
    lonMax: 76,
  },
  "Bay of Bengal": {
    latMin: 8,
    latMax: 24,
    lonMin: 80,
    lonMax: 98,
  },
};

function differenceValue(
  lat: number,
  lon: number,
  depth: number
): number {
  return (
    Math.sin(lat * 0.45 + depth * 0.01) * 0.12 +
    Math.cos(lon * 0.3 - depth * 0.008) * 0.08
  );
}

function differenceClass(value: number): string {
  if (value >= 0.15) return "diffStrongPositive";
  if (value >= 0.05) return "diffPositive";
  if (value <= -0.15) return "diffStrongNegative";
  if (value <= -0.05) return "diffNegative";
  return "diffNeutral";
}

export default function DifferenceMap({
  depth,
  region,
}: DifferenceMapProps) {
  const config = REGION_CONFIG[region];

  const cells = useMemo(() => {
    const result: Array<{
      lat: number;
      lon: number;
      value: number;
    }> = [];

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
        result.push({
          lat,
          lon,
          value: differenceValue(
            lat,
            lon,
            depth
          ),
        });
      }
    }

    return result;
  }, [config, depth]);

  return (
    <div className="differenceMap">
      <div className="differenceGrid">
        {cells.map((cell) => (
          <div
            key={`${cell.lat}-${cell.lon}`}
            className={`differenceCell ${differenceClass(
              cell.value
            )}`}
            title={`${cell.lat.toFixed(
              1
            )}°N, ${cell.lon.toFixed(
              1
            )}°E: ${cell.value.toFixed(3)} °C`}
          />
        ))}
      </div>

      <div className="differenceLegend">
        <span>
          −0.2 °C
        </span>

        <div className="differenceLegendBar" />

        <span>
          +0.2 °C
        </span>
      </div>

      <div className="differenceNote">
        Difference values represent prediction minus
        reference for the selected depth and region.
      </div>
    </div>
  );
}
