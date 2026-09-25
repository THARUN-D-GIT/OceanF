
-- Reference schema (JPA will also auto-create/update these via ddl-auto: update).
-- Kept here for documentation and for manual DB setup / migrations tooling.

CREATE TABLE IF NOT EXISTS prediction_job (
    id              BIGSERIAL PRIMARY KEY,
    latitude        DOUBLE PRECISION NOT NULL,
    longitude       DOUBLE PRECISION NOT NULL,
    request_date    DATE NOT NULL,
    sst             DOUBLE PRECISION,
    sss             DOUBLE PRECISION,
    ssh             DOUBLE PRECISION,
    wind_u          DOUBLE PRECISION,
    wind_v          DOUBLE PRECISION,
    region_name     VARCHAR(255),
    status          VARCHAR(20) NOT NULL,
    model_version   VARCHAR(100),
    input_window_start DATE,
    input_window_end DATE,
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL,
    completed_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS prediction_result (
    id              BIGSERIAL PRIMARY KEY,
    job_id          BIGINT NOT NULL REFERENCES prediction_job(id) ON DELETE CASCADE,
    depth_m         INTEGER NOT NULL,
    temperature_c   DOUBLE PRECISION NOT NULL,
    uncertainty_c   DOUBLE PRECISION
);

CREATE INDEX IF NOT EXISTS idx_prediction_result_job_id ON prediction_result(job_id);

CREATE TABLE IF NOT EXISTS prediction_surface_observation (
    id              BIGSERIAL PRIMARY KEY,
    job_id          BIGINT NOT NULL REFERENCES prediction_job(id) ON DELETE CASCADE,
    variable        VARCHAR(255) NOT NULL,
    observation_value DOUBLE PRECISION,
    unit            VARCHAR(32) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prediction_surface_observation_job_id
    ON prediction_surface_observation(job_id);