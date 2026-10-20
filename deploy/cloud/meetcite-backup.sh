#!/bin/bash
# Nightly MeetCite backup: a consistent snapshot of the SQLite database plus uploaded recordings.
# Keeps 7 daily and 4 weekly (Sunday) archives in /var/backups/meetcite.
set -euo pipefail
DEST=/var/backups/meetcite
VOL=$(docker volume inspect -f "{{.Mountpoint}}" meetcite_meetcite-data)
STAMP=$(date +%Y-%m-%d_%H%M)
mkdir -p "$DEST/daily" "$DEST/weekly"
chmod 700 "$DEST"

# Skip rather than fill the disk.
FREE_KB=$(df --output=avail / | tail -1)
if [ "$FREE_KB" -lt 2000000 ]; then echo "$(date) SKIPPED: less than 2 GB free"; exit 1; fi

# SQLite online backup API: safe while MeetCite is running.
docker exec meetcite-api-1 python -c "import sqlite3; s=sqlite3.connect(\"/data/meetcite.db\"); d=sqlite3.connect(\"/data/.backup-snapshot.db\"); s.backup(d); d.close(); s.close()"

ARCHIVE="$DEST/daily/meetcite-$STAMP.tar.gz"
tar -czf "$ARCHIVE" -C "$VOL" --transform "s|^.backup-snapshot.db|meetcite.db|" .backup-snapshot.db uploads
rm -f "$VOL/.backup-snapshot.db"
chmod 600 "$ARCHIVE"

# Check the archive can be read back.
tar -tzf "$ARCHIVE" >/dev/null

if [ "$(date +%u)" = "7" ]; then cp -p "$ARCHIVE" "$DEST/weekly/"; fi
ls -1t "$DEST/daily"/*.tar.gz | tail -n +8 | xargs -r rm -f
{ ls -1t "$DEST/weekly"/*.tar.gz 2>/dev/null || true; } | tail -n +5 | xargs -r rm -f
echo "$(date) OK $(du -h "$ARCHIVE" | cut -f1) $ARCHIVE"
