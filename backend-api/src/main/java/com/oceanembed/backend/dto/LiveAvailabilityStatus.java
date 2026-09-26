package com.oceanembed.backend.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public class LiveAvailabilityStatus {

    @JsonAlias("latest_usable_date")
    private LocalDate latestUsableDate;

    @JsonAlias("input_window_start")
    private LocalDate inputWindowStart;

    @JsonAlias("input_window_end")
    private LocalDate inputWindowEnd;

    private String status;

    @JsonAlias("variables_ready")
    private Integer variablesReady;

    @JsonAlias("required_variables")
    private Integer requiredVariables;

    @JsonAlias("ready_variables")
    private List<String> readyVariables;

    private Boolean ready;

    @JsonAlias("last_checked")
    private Instant lastChecked;

    private String message;

    public LocalDate getLatestUsableDate() {
        return latestUsableDate;
    }

    public void setLatestUsableDate(LocalDate latestUsableDate) {
        this.latestUsableDate = latestUsableDate;
    }

    public LocalDate getInputWindowStart() {
        return inputWindowStart;
    }

    public void setInputWindowStart(LocalDate inputWindowStart) {
        this.inputWindowStart = inputWindowStart;
    }

    public LocalDate getInputWindowEnd() {
        return inputWindowEnd;
    }

    public void setInputWindowEnd(LocalDate inputWindowEnd) {
        this.inputWindowEnd = inputWindowEnd;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Integer getVariablesReady() {
        return variablesReady;
    }

    public void setVariablesReady(Integer variablesReady) {
        this.variablesReady = variablesReady;
    }

    public Integer getRequiredVariables() {
        return requiredVariables;
    }

    public void setRequiredVariables(Integer requiredVariables) {
        this.requiredVariables = requiredVariables;
    }

    public List<String> getReadyVariables() {
        return readyVariables;
    }

    public void setReadyVariables(List<String> readyVariables) {
        this.readyVariables = readyVariables;
    }

    public Boolean getReady() {
        return ready;
    }

    public void setReady(Boolean ready) {
        this.ready = ready;
    }

    public Instant getLastChecked() {
        return lastChecked;
    }

    public void setLastChecked(Instant lastChecked) {
        this.lastChecked = lastChecked;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }
}
