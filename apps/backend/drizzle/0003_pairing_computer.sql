ALTER TABLE pairing_code ADD COLUMN computer_id uuid REFERENCES computer (id) ON DELETE CASCADE;
