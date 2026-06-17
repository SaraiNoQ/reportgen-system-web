from __future__ import annotations

import os
import platform
import subprocess
from collections.abc import Callable
from pathlib import Path
from typing import Any

from fastapi import HTTPException
from gen_report.workflow.service import WorkflowService

STATUS_LABELS = {
    "prepared": "解析中",
    "preparing": "解析中",
    "extracting": "解析中",
    "extracted": "待生成",
    "review_required": "待审核",
    "generated": "已完成",
    "failed": "错误",
    "error": "错误",
}


class GenReportService:
    def __init__(self, workflow_service: WorkflowService | None = None) -> None:
        self._workflow = workflow_service or WorkflowService()
        self._run_paths: dict[str, Path] = {}

    def validate_manifest(self, manifest_path: str) -> dict[str, Any]:
        path = self._resolve_existing_file(manifest_path, "Manifest")
        return self._workflow.validate_config(str(path))

    def run_workflow(
        self,
        manifest_path: str,
        mode: str,
        progress_callback: Callable[[str], None] | None = None,
    ) -> dict[str, Any]:
        path = self._resolve_existing_file(manifest_path, "Manifest")
        if mode != "full":
            raise HTTPException(
                status_code=400,
                detail="Staged mode is reserved for the UI review flow and is not implemented yet.",
            )

        result = self._workflow.run(
            str(path),
            progress_callback=progress_callback,
        )
        self.register_result_runs(result)
        return result

    def prepare_manifest(self, manifest_path: str) -> dict[str, Any]:
        path = self._resolve_existing_file(manifest_path, "Manifest")
        result = self._workflow.prepare(str(path))
        self.register_result_runs(result)
        return result

    def extract_run(self, run_id: str, section: str | None = None) -> dict[str, Any]:
        run_path = self._require_run_path(run_id)
        return self._workflow.extract(str(run_path), section=section)

    def review_run(self, run_id: str) -> dict[str, Any]:
        run_path = self._require_run_path(run_id)
        return self._workflow.review(str(run_path))

    def approve_run(self, run_id: str) -> dict[str, Any]:
        run_path = self._require_run_path(run_id)
        return self._workflow.approve(str(run_path))

    def generate_run(self, run_id: str, section: str | None = None) -> dict[str, Any]:
        run_path = self._require_run_path(run_id)
        return self._workflow.generate(str(run_path), section=section)

    def register_result_runs(self, result: dict[str, Any]) -> dict[str, str]:
        run_paths: dict[str, str] = {}
        for run in result.get("runs", []):
            run_id = run.get("run_id")
            run_path = run.get("run_path")
            if not run_id or not run_path:
                continue
            resolved = Path(run_path).resolve()
            self._run_paths[str(run_id)] = resolved
            run_paths[str(run_id)] = str(resolved)
        return run_paths

    def get_run_status(self, run_id: str) -> dict[str, Any]:
        run_path = self._require_run_path(run_id)
        raw = self._workflow.status(str(run_path))
        return self._normalize_status(run_id, run_path, raw)

    def set_field(self, run_id: str, section: str, field: str, value: str) -> dict[str, Any]:
        run_path = self._require_run_path(run_id)
        return self._workflow.set_field(str(run_path), section, field, value)

    def refresh_inputs(self, run_id: str) -> dict[str, Any]:
        run_path = self._require_run_path(run_id)
        return self._workflow.refresh_inputs(str(run_path))

    def open_output(self, run_id: str, target: str) -> dict[str, Any]:
        run_path = self._require_run_path(run_id)
        status = self._workflow.status(str(run_path))
        if target == "workspace":
            path = run_path
        else:
            final_report = status.get("outputs", {}).get("final_report")
            path = Path(final_report).resolve() if final_report else run_path / "final_report.docx"

        self._assert_inside_run_path(run_path, path)
        if not path.exists():
            raise HTTPException(status_code=404, detail=f"Output does not exist: {path}")
        _open_path(path)
        return {"status": "ok", "message": "Opened output.", "path": str(path)}

    @staticmethod
    def _resolve_existing_file(raw_path: str, label: str) -> Path:
        path = Path(raw_path).expanduser().resolve()
        if not path.is_file():
            raise HTTPException(status_code=404, detail=f"{label} file does not exist: {path}")
        return path

    def _require_run_path(self, run_id: str) -> Path:
        run_path = self._run_paths.get(run_id)
        if run_path is None:
            raise HTTPException(
                status_code=404,
                detail=f"Unknown run_id '{run_id}'. Start a workflow run first.",
            )
        return run_path

    @staticmethod
    def _assert_inside_run_path(run_path: Path, path: Path) -> None:
        try:
            path.resolve().relative_to(run_path.resolve())
        except ValueError as exc:
            raise HTTPException(
                status_code=400,
                detail="Requested output is outside the registered run workspace.",
            ) from exc

    @staticmethod
    def _normalize_status(run_id: str, run_path: Path, raw: dict[str, Any]) -> dict[str, Any]:
        status = str(raw.get("status", "unknown"))
        artifacts = []
        for artifact in raw.get("artifacts", []):
            normalized = dict(artifact)
            artifact_path = normalized.get("path")
            if artifact_path:
                normalized["absolutePath"] = str((run_path / artifact_path).resolve())
            artifacts.append(normalized)

        issues_raw = raw.get("issues", [])
        if isinstance(issues_raw, dict):
            issues = issues_raw.get("key_issues", [])
            if not isinstance(issues, list):
                issues = []
            if issues_raw.get("conversion_count", 0) and not issues:
                issues = [issues_raw]
        elif isinstance(issues_raw, list):
            issues = issues_raw
        else:
            issues = []

        outputs = raw.get("outputs", {})
        normalized_outputs: dict[str, Any] = {}
        if isinstance(outputs, dict):
            normalized_outputs.update(outputs)
            final_report = outputs.get("final_report")
            if final_report:
                normalized_outputs["finalReport"] = str(Path(final_report).resolve())

        return {
            "runId": str(raw.get("run_id") or run_id),
            "status": status,
            "businessStatus": STATUS_LABELS.get(status, status),
            "stage": str(raw.get("stage", "")),
            "message": str(raw.get("message", "")),
            "artifacts": artifacts,
            "staleArtifacts": raw.get("stale_artifacts", []),
            "issues": issues,
            "outputs": normalized_outputs,
        }


def _open_path(path: Path) -> None:
    if os.environ.get("GEN_REPORT_DESKTOP_DISABLE_OPEN") == "1":
        return
    system = platform.system()
    if system == "Darwin":
        subprocess.Popen(["open", str(path)])
    elif system == "Windows":
        os.startfile(str(path))  # type: ignore[attr-defined]
    else:
        subprocess.Popen(["xdg-open", str(path)])


_service = GenReportService()


def get_gen_report_service() -> GenReportService:
    return _service
