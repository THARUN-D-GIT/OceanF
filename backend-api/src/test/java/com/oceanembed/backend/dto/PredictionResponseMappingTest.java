package com.oceanembed.backend.dto;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class PredictionResponseMappingTest {

    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    @Test
    void mapsFastApiSnakeCaseSpreadAndSurfaceFields() throws Exception {
        String fastApiJson = """
            {
              "latitude": 15.5,
              "longitude": 65.5,
              "date": "2026-09-20",
              "input_window_start": "2026-09-14",
              "input_window_end": "2026-09-20",
              "model_version": "oceanembed-v1.0",
              "grid_resolution_deg": 0.25,
              "predictions": [
                {"depth_m": 0, "temperature_c": 29.1, "uncertainty_c": 0.08}
              ],
              "surface_observations": [
                {"variable": "SST", "value": 28.4, "unit": "°C"}
              ]
            }
            """;

        MlPredictionResponse response =
            objectMapper.readValue(fastApiJson, MlPredictionResponse.class);

        assertEquals(LocalDate.parse("2026-09-14"), response.getInputWindowStart());
        assertEquals(LocalDate.parse("2026-09-20"), response.getInputWindowEnd());
        assertEquals(0.08, response.getPredictions().get(0).getUncertainty_c(), 1e-9);
        assertEquals("SST", response.getSurfaceObservations().get(0).getVariable());
        assertEquals(28.4, response.getSurfaceObservations().get(0).getValue(), 1e-9);
    }

    @Test
    void serializesSpringResponseWithFrontendCamelCaseFields() throws Exception {
        PredictionResponseDTO response = new PredictionResponseDTO();
        response.setPredictions(List.of(new DepthPredictionDTO(0, 29.1, 0.08)));
        response.setSurfaceObservations(List.of(
            new SurfaceObservationDTO("SST", 28.4, "°C")
        ));

        String json = objectMapper.writeValueAsString(response);

        org.assertj.core.api.Assertions.assertThat(json)
            .contains("\"uncertaintyC\":0.08")
            .contains("\"surfaceObservations\"")
            .contains("\"value\":28.4")
            .doesNotContain("\"uncertainty_c\"");
    }
}
