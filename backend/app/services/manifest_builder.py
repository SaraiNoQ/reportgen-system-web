"""Generates gen-report manifest YAML from project configuration data.

The builder reads the project's rule templates, source files, and
project metadata, then creates a workspace directory with a manifest.yaml
and all required supporting files (templates, schemas, rules).
"""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path
from typing import Any

import yaml


# Absolute path to the demo_project templates — used as the default
# template library until per-project template upload is supported.
_DEMO_PROJECT = (
    Path(__file__).resolve().parents[4]
    / "GenReportAgent"
    / "demo_project"
)

# Where per-project workspaces are created, relative to this file.
_WORKSPACES_ROOT = Path(tempfile.gettempdir()) / "genreport-workspaces"


class ManifestBuilder:
    """Builds a gen-report manifest from project data."""

    def __init__(self, workspace_root: Path | None = None) -> None:
        self._workspace_root = workspace_root or _WORKSPACES_ROOT

    def build(
        self,
        project: dict[str, Any],
        rule_templates: list[dict[str, Any]],
        source_files: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """Create workspace and return manifest metadata dict.

        Returns a dict with keys:
          - manifest_path: absolute path to generated manifest.yaml
          - workspace_path: workspace directory path
          - run_id: the run identifier
          - items: list of inspection item ids
        """
        project_id = str(project["id"])
        project_name = str(project.get("name", project_id))
        workspace = self._workspace_root / project_id
        workspace.mkdir(parents=True, exist_ok=True)

        self._copy_template_library(workspace)
        self._copy_schemas(workspace)
        self._copy_rules(workspace)

        source_paths = self._resolve_source_paths(source_files or [], workspace)

        items = self._build_registry_items(rule_templates, workspace)
        self._write_registry(workspace, items)

        manifest = self._build_manifest(
            workspace=workspace,
            project_id=project_id,
            project_name=project_name,
            source_paths=source_paths,
            items=items,
        )
        manifest_path = self._write_manifest(workspace, manifest)

        return {
            "manifest_path": str(manifest_path),
            "workspace_path": str(workspace),
            "run_id": f"report-{project_id}",
            "items": items,
        }

    # ------------------------------------------------------------------
    # Template / schema / rule copying
    # ------------------------------------------------------------------

    def _copy_template_library(self, workspace: Path) -> None:
        dst_templates = workspace / "templates"
        if dst_templates.exists():
            return
        src = _DEMO_PROJECT / "templates"
        if src.is_dir():
            shutil.copytree(str(src), str(dst_templates))

    def _copy_schemas(self, workspace: Path) -> None:
        dst = workspace / "schemas"
        if dst.exists():
            return
        src = _DEMO_PROJECT / "schemas"
        if src.is_dir():
            shutil.copytree(str(src), str(dst))

    def _copy_rules(self, workspace: Path) -> None:
        dst = workspace / "rules"
        if dst.exists():
            return
        src = _DEMO_PROJECT / "rules"
        if src.is_dir():
            shutil.copytree(str(src), str(dst))

    # ------------------------------------------------------------------
    # Source documents
    # ------------------------------------------------------------------

    def _resolve_source_paths(
        self,
        source_files: list[dict[str, Any]],
        workspace: Path,
    ) -> list[str]:
        """Return relative source document paths for the manifest.

        Copies real uploaded files (via serverPath) into the workspace
        sources/ directory. Falls back to demo sources when no uploaded
        files have a server-side path.
        """
        src_dir = workspace / "sources"
        # Always start with a fresh sources/ directory so previously
        # copied files don't linger.
        if src_dir.exists():
            shutil.rmtree(str(src_dir))
        src_dir.mkdir(parents=True)

        paths: list[str] = []

        for sf in source_files:
            server_path = sf.get("serverPath")
            if not server_path:
                continue
            spath = Path(server_path)
            if spath.is_file() and spath.suffix.lower() in (".docx", ".pdf", ".xlsx"):
                dest = src_dir / spath.name
                if not dest.exists():
                    shutil.copy2(str(spath), str(dest))
                paths.append(f"./sources/{spath.name}")

        # Fallback to demo sources when no real files are available.
        # Only copy demo source files whose names contain a known
        # inspection-item keyword, so the agent does not identify
        # items missing from the registry.
        if not paths:
            demo_sources = _DEMO_PROJECT / "sources"
            if demo_sources.is_dir():
                known = {"geometry", "parameter", "position"}
                for f in demo_sources.iterdir():
                    stem = f.stem.lower()
                    if not any(key in stem for key in known):
                        continue
                    if f.is_file() and not (src_dir / f.name).exists():
                        shutil.copy2(str(f), str(src_dir / f.name))
                paths = sorted(
                    f"./sources/{f.name}"
                    for f in src_dir.iterdir()
                    if f.is_file() and f.suffix.lower() in (".docx", ".pdf")
                )

        return paths

    # ------------------------------------------------------------------
    # Registry
    # ------------------------------------------------------------------

    def _build_registry_items(
        self,
        rule_templates: list[dict[str, Any]],
        workspace: Path,
    ) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        template_dir = workspace / "templates" / "attachments"

        category_to_item: dict[str, dict[str, Any]] = {
            "几何精度": {
                "item_id": "geometry_precision",
                "template": str(template_dir / "geometry_precision.docx"),
                "rules": "./rules/geometry_precision.md",
                "schema": "./schemas/geometry_precision.yaml",
            },
            "位置精度": {
                "item_id": "position_precision",
                "template": str(template_dir / "position_precision.docx"),
                "rules": "./rules/position_precision.md",
                "schema": "./schemas/position_precision.yaml",
            },
            "电气参数": {
                "item_id": "parameter",
                "template": str(template_dir / "parameter.docx"),
                "rules": "./rules/parameter.md",
                "schema": "./schemas/parameter.yaml",
            },
        }

        seen: set[str] = set()
        for order, rt in enumerate(rule_templates, start=1):
            category = rt.get("category", "")
            mapping = category_to_item.get(category)
            if not mapping:
                continue
            item_id = mapping["item_id"]
            if item_id in seen:
                continue
            seen.add(item_id)

            items.append({
                "item_id": item_id,
                "label": rt.get("name", item_id),
                "template": mapping["template"],
                "rules": mapping["rules"],
                "schema": mapping["schema"],
                "order": order,
                "summary_table": {
                    "field": "{{summary_result}}",
                    "column": "summary_result",
                },
            })

        # Register remaining known items whose template files exist,
        # even when no matching rule template is in the store.
        # This prevents the Claude agent from flagging them as
        # "unknown" when they appear in source documents.
        for mapping in category_to_item.values():
            item_id = mapping["item_id"]
            if item_id in seen:
                continue
            if not Path(mapping["template"]).is_file():
                continue
            seen.add(item_id)
            items.append({
                "item_id": item_id,
                "label": item_id,
                "template": mapping["template"],
                "rules": mapping["rules"],
                "schema": mapping["schema"],
                "order": len(items) + 1,
                "summary_table": {
                    "field": "{{summary_result}}",
                    "column": "summary_result",
                },
            })
        return items

    def _write_registry(self, workspace: Path, items: list[dict[str, Any]]) -> None:
        path = workspace / "registry.yaml"
        with open(path, "w", encoding="utf-8") as f:
            yaml.safe_dump({"items": items}, f, allow_unicode=True, default_flow_style=False)

    # ------------------------------------------------------------------
    # Manifest
    # ------------------------------------------------------------------

    def _build_manifest(
        self,
        workspace: Path,
        project_id: str,
        project_name: str,
        source_paths: list[str],
        items: list[dict[str, Any]],
    ) -> dict[str, Any]:
        return {
            "report_runs": [
                {
                    "run_id": f"report-{project_id}",
                    "source_documents": source_paths,
                    "output_dir": str(workspace / "work"),
                    "main_template": str(workspace / "templates" / "main.docx"),
                    "main_rules": str(workspace / "rules" / "main.md"),
                    "main_schema": str(workspace / "schemas" / "main.yaml"),
                    "registry": str(workspace / "registry.yaml"),
                    "review": {"required": False},
                    "agent_provider": {
                        "name": "claude_code",
                        "model": "default",
                        "trace": True,
                    },
                }
            ]
        }

    def _write_manifest(self, workspace: Path, manifest: dict[str, Any]) -> Path:
        path = workspace / "manifest.yaml"
        with open(path, "w", encoding="utf-8") as f:
            yaml.safe_dump(manifest, f, allow_unicode=True, default_flow_style=False)
        return path
