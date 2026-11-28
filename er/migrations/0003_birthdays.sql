-- أعياد ميلادنا: birth dates (Gregorian + original Hijri) and hidden birthday letters.
INSERT OR IGNORE INTO space_settings (key, value) VALUES ('birthdays', '{"E":{"greg":"2002-10-06","hijri":"1423-07-29"},"R":{"greg":"2004-02-27","hijri":"1425-01-07"}}');

-- One letter per author → target. The target can read it only from the unlock date (their birthday) on.
CREATE TABLE bday_letters (
  id TEXT PRIMARY KEY,
  author TEXT NOT NULL,
  target TEXT NOT NULL,
  title TEXT,
  body TEXT NOT NULL,
  unlock_date TEXT NOT NULL,
  opened_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_bday_letters ON bday_letters (author, target);
