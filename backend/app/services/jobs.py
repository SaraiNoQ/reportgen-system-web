from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from threading import Lock
from typing import Any, Literal
from uuid import uuid4

JobState = Literal["queued", "running", "succeeded", "failed"]


def _now() -> str:
    return datetime.now(UTC).isoformat()


@dataclass
class WorkflowJob:
    job_id: str
    status: JobState = "queued"
    message: str = "Queued."
    run_paths: dict[str, str] = field(default_factory=dict)
    result: dict[str, Any] | None = None
    error: str | None = None
    progress_events: list[dict[str, Any]] = field(default_factory=list)
    created_at: str = field(default_factory=_now)
    updated_at: str = field(default_factory=_now)

    def to_response(self) -> dict[str, Any]:
        return {
            "jobId": self.job_id,
            "status": self.status,
            "message": self.message,
            "runPaths": self.run_paths,
            "result": self.result,
            "error": self.error,
            "progressEvents": self.progress_events,
        }


class JobRegistry:
    def __init__(self) -> None:
        self._jobs: dict[str, WorkflowJob] = {}
        self._lock = Lock()

    def create(self) -> WorkflowJob:
        job = WorkflowJob(job_id=uuid4().hex)
        with self._lock:
            self._jobs[job.job_id] = job
        return job

    def get(self, job_id: str) -> WorkflowJob | None:
        with self._lock:
            return self._jobs.get(job_id)

    def update(self, job_id: str, **changes: Any) -> WorkflowJob:
        with self._lock:
            job = self._jobs[job_id]
            for key, value in changes.items():
                setattr(job, key, value)
            job.updated_at = _now()
            return job

    def add_progress(self, job_id: str, message: str) -> None:
        with self._lock:
            job = self._jobs[job_id]
            job.progress_events.append({"at": _now(), "message": message})
            job.updated_at = _now()


job_registry = JobRegistry()
