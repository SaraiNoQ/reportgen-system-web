from typing import Any, Literal

from pydantic import BaseModel, Field


class ManifestValidateRequest(BaseModel):
    manifestPath: str = Field(min_length=1)


class RunWorkflowRequest(BaseModel):
    manifestPath: str = Field(min_length=1)
    mode: Literal["full", "staged"] = "full"


class FieldUpdateRequest(BaseModel):
    section: str = Field(min_length=1)
    field: str = Field(min_length=1)
    value: str


class OpenOutputRequest(BaseModel):
    target: Literal["final_report", "workspace"] = "final_report"


class StageRunRequest(BaseModel):
    section: str | None = None


class WorkflowJobResponse(BaseModel):
    jobId: str
    status: Literal["queued", "running", "succeeded", "failed"]
    message: str
    runPaths: dict[str, str] = Field(default_factory=dict)
    result: dict[str, Any] | None = None
    error: str | None = None
    progressEvents: list[dict[str, Any]] = Field(default_factory=list)


class RunStatusResponse(BaseModel):
    runId: str
    status: str
    businessStatus: str
    stage: str
    message: str
    artifacts: list[dict[str, Any]] = Field(default_factory=list)
    staleArtifacts: list[dict[str, Any]] = Field(default_factory=list)
    issues: list[dict[str, Any]] = Field(default_factory=list)
    outputs: dict[str, Any] = Field(default_factory=dict)
