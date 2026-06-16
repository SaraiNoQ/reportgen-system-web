import os
import tempfile

os.environ.setdefault(
    "INSPECTION_DATA_DIR",
    tempfile.mkdtemp(prefix="inspection-report-core-api-test-data-"),
)
