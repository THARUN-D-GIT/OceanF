package com.oceanembed.backend.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "prediction_surface_observation")
public class SurfaceObservationResult {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "job_id", nullable = false)
    private PredictionJob job;

    @Column(nullable = false)
    private String variable;

    @Column(name = "observation_value")
    private Double value;

    @Column(nullable = false)
    private String unit;

    public SurfaceObservationResult() {}

    public SurfaceObservationResult(
            PredictionJob job,
            String variable,
            Double value,
            String unit) {
        this.job = job;
        this.variable = variable;
        this.value = value;
        this.unit = unit;
    }

    public Long getId() { return id; }
    public PredictionJob getJob() { return job; }
    public String getVariable() { return variable; }
    public Double getValue() { return value; }
    public String getUnit() { return unit; }
}
