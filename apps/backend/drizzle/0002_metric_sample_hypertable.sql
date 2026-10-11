CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE metric_sample (
  time timestamptz NOT NULL,
  computer_id uuid NOT NULL REFERENCES computer (id) ON DELETE CASCADE,
  payload jsonb NOT NULL
);
SELECT create_hypertable('metric_sample', 'time');
CREATE INDEX metric_sample_computer_id_time_idx ON metric_sample (computer_id, time DESC);
