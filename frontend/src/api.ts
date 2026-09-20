export interface OceanEmbedRequest {
  latitude: number;
  longitude: number;
  date: string;
  depths: number[];
}

export interface DepthPrediction {
  depthM: number;
  temperatureC: number;
  uncertaintyC: number | null;
}

export interface OceanEmbedResponse {
  jobId: number;
  status: string;
  latitude: number;
  longitude: number;
  date: string;
  modelVersion: string;
  gridResolutionDeg: number;
  createdAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  predictions: DepthPrediction[];

  depths: number[];
  temperature: number[];
  uncertainty: number[];
  model_version: string;
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  "http://127.0.0.1:8080";

export async function reconstructOcean(
  request: OceanEmbedRequest
): Promise<OceanEmbedResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/predictions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    }
  );

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `OceanEmbed API request failed (${response.status}): ${responseText}`
    );
  }

  const backendResult = JSON.parse(responseText);

  const predictions: DepthPrediction[] =
    backendResult.predictions ?? [];

  return {
    ...backendResult,

    predictions,

    depths: predictions.map(
      (prediction) => prediction.depthM
    ),

    temperature: predictions.map(
      (prediction) => prediction.temperatureC
    ),

    uncertainty: predictions.map(
      (prediction) => prediction.uncertaintyC ?? 0
    ),

    model_version:
      backendResult.modelVersion ?? "oceanembed-v1.0",
  };
}