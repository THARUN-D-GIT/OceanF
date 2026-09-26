package com.oceanembed.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.oceanembed.backend.dto.LiveAvailabilityStatus;
import com.oceanembed.backend.exception.ResourceNotFoundException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

@Service
public class LiveAvailabilityService {

    private final ObjectMapper objectMapper;
    private final Path statusFile;

    public LiveAvailabilityService(
            ObjectMapper objectMapper,
            @Value("${live.status-file:../data/processed/live/live_status.json}") String statusFile) {
        this.objectMapper = objectMapper;
        this.statusFile = Path.of(statusFile);
    }

    public LiveAvailabilityStatus getStatus() throws IOException {
        if (!Files.isRegularFile(statusFile)) {
            throw new ResourceNotFoundException(
                    "Live availability status file was not found: " + statusFile);
        }

        LiveAvailabilityStatus status =
                objectMapper.readValue(statusFile.toFile(), LiveAvailabilityStatus.class);
        if (status == null) {
            throw new IOException("Live availability status file is empty: " + statusFile);
        }
        return status;
    }
}
