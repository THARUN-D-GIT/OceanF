package com.oceanembed.backend.dto;

public class MlSurfaceObservation {
    private String variable;
    private Double value;
    private String unit;

    public String getVariable() { return variable; }
    public void setVariable(String variable) { this.variable = variable; }
    public Double getValue() { return value; }
    public void setValue(Double value) { this.value = value; }
    public String getUnit() { return unit; }
    public void setUnit(String unit) { this.unit = unit; }
}
