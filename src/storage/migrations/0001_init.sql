-- OpenPit schema, version 1.
-- Conflicts are data: nothing here forbids a conflicted schedule. Only structural
-- integrity is enforced (keys, references, valid time blocks).

CREATE TABLE workspace_config (
  id integer PRIMARY KEY CHECK (id = 1),
  config jsonb NOT NULL
);

CREATE TABLE schedule_day (
  date text PRIMARY KEY CHECK (date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  revision integer NOT NULL CHECK (revision >= 0)
);

CREATE TABLE session (
  day text NOT NULL REFERENCES schedule_day (date) ON DELETE CASCADE ON UPDATE CASCADE,
  id text NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  label text NOT NULL,
  activity_type_id text NOT NULL,
  layout_id text,
  start_minute integer NOT NULL,
  end_minute integer NOT NULL,
  status text NOT NULL CHECK (status IN ('planned', 'cancelled')),
  PRIMARY KEY (day, id),
  CHECK (start_minute >= 0 AND start_minute < end_minute AND end_minute <= 1440)
);

CREATE TABLE session_vehicle (
  day text NOT NULL,
  session_id text NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  vehicle_id text NOT NULL,
  PRIMARY KEY (day, session_id, vehicle_id),
  FOREIGN KEY (day, session_id) REFERENCES session (day, id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE session_pit_box (
  day text NOT NULL,
  session_id text NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  pit_box_id text NOT NULL,
  PRIMARY KEY (day, session_id, pit_box_id),
  FOREIGN KEY (day, session_id) REFERENCES session (day, id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE track_closure (
  day text NOT NULL REFERENCES schedule_day (date) ON DELETE CASCADE ON UPDATE CASCADE,
  id text NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  section_id text NOT NULL,
  start_minute integer NOT NULL,
  end_minute integer NOT NULL,
  reason text NOT NULL,
  PRIMARY KEY (day, id),
  CHECK (start_minute >= 0 AND start_minute < end_minute AND end_minute <= 1440)
);

CREATE TABLE vehicle_unavailability (
  day text NOT NULL REFERENCES schedule_day (date) ON DELETE CASCADE ON UPDATE CASCADE,
  id text NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  vehicle_id text NOT NULL,
  start_minute integer NOT NULL,
  end_minute integer NOT NULL,
  reason text NOT NULL,
  PRIMARY KEY (day, id),
  CHECK (start_minute >= 0 AND start_minute < end_minute AND end_minute <= 1440)
);
