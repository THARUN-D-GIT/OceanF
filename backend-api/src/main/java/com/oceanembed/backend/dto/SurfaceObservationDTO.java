package com.oceanembed.backend.dto;

public class SurfaceObservationDTO {
    private String variable;
    private Double value;
    private String unit;

    public SurfaceObservationDTO() {}

    public SurfaceObservationDTO(String variable, Double value, String unit) {
        this.variable = variable;
        this.value = value;
        this.unit = unit;
    }

    public String getVariable() { return variable; }
    public void setVariable(String variable) { this.variable = variable; }
    public Double getValue() { return value; }
    public void setValue(Double value) { this.value = value; }
    public String getUnit() { return unit; }
    public void setUnit(String unit) { this.unit = unit; }
}
