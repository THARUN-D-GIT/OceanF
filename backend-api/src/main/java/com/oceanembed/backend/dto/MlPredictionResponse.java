package com.oceanembed.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.LocalDate;
import java.util.List;

/** Mirrors ml-service/app/schemas.py:PredictionResponse exactly. */
public class MlPredictionResponse {
    private Double latitude;
    private Double longitude;
    private LocalDate date;
    @JsonProperty("input_window_start")
    private LocalDate inputWindowStart;
    @JsonProperty("input_window_end")
    private LocalDate inputWindowEnd;
    @JsonProperty("model_version")
    private String modelVersion;
    @JsonProperty("grid_resolution_deg")
    private Double gridResolutionDeg;
    private List<MlDepthPrediction> predictions;
    @JsonProperty("surface_observations")
    private List<MlSurfaceObservation> surface_observations;

    public Double getLatitude() { return latitude; }
    public void setLatitude(Double latitude) { this.latitude = latitude; }
    public Double getLongitude() { return longitude; }
    public void setLongitude(Double longitude) { this.longitude = longitude; }
    public LocalDate getDate() { return date; }
    public void setDate(LocalDate date) { this.date = date; }
    public LocalDate getInputWindowStart() { return inputWindowStart; }
    public void setInputWindowStart(LocalDate inputWindowStart) { this.inputWindowStart = inputWindowStart; }
    public LocalDate getInputWindowEnd() { return inputWindowEnd; }
    public void setInputWindowEnd(LocalDate inputWindowEnd) { this.inputWindowEnd = inputWindowEnd; }
    public String getModelVersion() { return modelVersion; }
    public void setModelVersion(String modelVersion) { this.modelVersion = modelVersion; }
    public Double getGridResolutionDeg() { return gridResolutionDeg; }
    public void setGridResolutionDeg(Double gridResolutionDeg) { this.gridResolutionDeg = gridResolutionDeg; }
    public List<MlDepthPrediction> getPredictions() { return predictions; }
    public void setPredictions(List<MlDepthPrediction> predictions) { this.predictions = predictions; }
    public List<MlSurfaceObservation> getSurfaceObservations() { return surface_observations; }
    public void setSurfaceObservations(List<MlSurfaceObservation> surfaceObservations) { this.surface_observations = surfaceObservations; }
}
