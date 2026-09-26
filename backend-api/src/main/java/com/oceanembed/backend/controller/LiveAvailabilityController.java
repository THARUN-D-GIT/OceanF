package com.oceanembed.backend.controller;

import com.oceanembed.backend.dto.LiveAvailabilityStatus;
import com.oceanembed.backend.service.LiveAvailabilityService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;

@RestController
@RequestMapping("/api/v1/live")
public class LiveAvailabilityController {

    private final LiveAvailabilityService liveAvailabilityService;

    public LiveAvailabilityController(LiveAvailabilityService liveAvailabilityService) {
        this.liveAvailabilityService = liveAvailabilityService;
    }

    @GetMapping("/status")
    public LiveAvailabilityStatus getStatus() throws IOException {
        return liveAvailabilityService.getStatus();
    }
}
