package com.oceanembed.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.oceanembed.backend.dto.LiveAvailabilityStatus;
import com.oceanembed.backend.exception.ResourceNotFoundException;
import org.junit.jupiter.api.Test;

import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertThrows;

class LiveAvailabilityServiceTest {

    private final ObjectMapper objectMapper = new ObjectMapper()
            .findAndRegisterModules()
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

    @Test
    void mapsLiveStatusJsonFields() throws Exception {
        String json = """
                {
                  "latest_usable_date": "2026-09-20",
                  "input_window_start": "2026-09-14",
                  "input_window_end": "2026-09-20",
                  "status": "ready",
                  "variables_ready": 2,
                  "required_variables": 4,
                  "ready_variables": ["sst", "ssh"],
                  "ready": true,
                  "last_checked": "2026-09-21T08:30:00Z",
                  "message": "Waiting for source data"
                }
                """;

        LiveAvailabilityStatus status =
                objectMapper.readValue(json, LiveAvailabilityStatus.class);

        assertEquals("2026-09-20", status.getLatestUsableDate().toString());
        assertEquals("2026-09-14", status.getInputWindowStart().toString());
        assertEquals("2026-09-20", status.getInputWindowEnd().toString());
        assertEquals("ready", status.getStatus());
        assertEquals(2, status.getVariablesReady());
        assertEquals(4, status.getRequiredVariables());
        assertEquals(List.of("sst", "ssh"), status.getReadyVariables());
        assertTrue(status.getReady());
        assertEquals("2026-09-21T08:30:00Z", status.getLastChecked().toString());
        assertEquals("Waiting for source data", status.getMessage());

        String responseJson = objectMapper.writeValueAsString(status);
        org.assertj.core.api.Assertions.assertThat(responseJson)
                .contains("\"latestUsableDate\":\"2026-09-20\"")
                .contains("\"inputWindowStart\":\"2026-09-14\"")
                .contains("\"variablesReady\":2")
                .contains("\"requiredVariables\":4")
                .contains("\"readyVariables\":[\"sst\",\"ssh\"]")
                .contains("\"ready\":true")
                .contains("\"lastChecked\":\"2026-09-21T08:30:00Z\"");
    }

    @Test
    void missingStatusFileUsesRepositoryNotFoundBehavior() {
        Path missingFile = Path.of("target", "missing-live-status-test.json");
        LiveAvailabilityService service =
                new LiveAvailabilityService(objectMapper, missingFile.toString());

        assertThrows(ResourceNotFoundException.class, service::getStatus);
    }
}
