import json
import shutil
import time
import zipfile
from json import JSONDecodeError
from pathlib import Path

from fastapi.testclient import TestClient

from app.api.v1.gen_report import ManifestBuilder
from app.dependencies import get_store
from app.main import app
from app.schemas.domain import ExtractedField
from app.services.gen_report_service import get_gen_report_service
from app.services.manifest_builder import _WORKSPACES_ROOT
from app.services.mock_store import MockStore
from app.services.postgres_store import PostgresStore


def _write_minimal_docx(path: Path, paragraphs: list[str]) -> None:
    escaped_paragraphs = "".join(
        f"<w:p><w:r><w:t>{paragraph}</w:t></w:r></w:p>" for paragraph in paragraphs
    )
    document_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body>{escaped_paragraphs}</w:body>"
        "</w:document>"
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("word/document.xml", document_xml)


def test_system_and_auth_endpoints() -> None:
    client = TestClient(app)

    login_response = client.post(
        "/api/v1/auth/login",
        json={"username": "zhanggong", "password": "password123"},
    )
    forgot_password_response = client.post(
        "/api/v1/auth/forgot-password",
        json={"account": "zhanggong", "contact": "zhanggong@example.com"},
    )
    users_response = client.get("/api/v1/system/users")
    logs_response = client.get("/api/v1/system/logs")

    assert login_response.status_code == 200
    assert login_response.json()["ok"] is True
    token = login_response.json()["accessToken"]
    auth_headers = {"Authorization": f"Bearer {token}"}
    me_response = client.get("/api/v1/auth/me", headers=auth_headers)
    preferences_response = client.get("/api/v1/auth/preferences", headers=auth_headers)
    update_preferences_response = client.patch(
        "/api/v1/auth/preferences",
        json={"currentProjectId": "p2"},
        headers=auth_headers,
    )
    messages_response = client.get("/api/v1/messages", headers=auth_headers)
    read_response = client.patch("/api/v1/messages/m1/read", json={}, headers=auth_headers)
    logout_response = client.post("/api/v1/auth/logout", json={}, headers=auth_headers)
    assert me_response.status_code == 200
    assert me_response.json()["user"]["status"] == "启用"
    assert preferences_response.status_code == 200
    assert preferences_response.json()["userId"] == "u1"
    assert update_preferences_response.status_code == 200
    assert update_preferences_response.json()["currentProjectId"] == "p2"
    assert messages_response.status_code == 200
    assert read_response.json()["read"] is True
    assert logout_response.json()["ok"] is True
    assert forgot_password_response.status_code == 200
    assert forgot_password_response.json()["ticketId"].startswith("PWD-")
    assert forgot_password_response.json()["expiresInMinutes"] == 30
    assert users_response.status_code == 200
    assert users_response.json()[0]["name"] == "张工"
    assert logs_response.status_code == 200
    assert len(logs_response.json()) >= 1


def test_postgres_log_ids_are_unique_without_flush() -> None:
    class FakeSession:
        def __init__(self) -> None:
            self.added = []

        def add(self, obj) -> None:
            self.added.append(obj)

    fake_session = FakeSession()
    store = PostgresStore(fake_session)  # type: ignore[arg-type]

    store._add_log("测试模块", "测试用户", "第一条日志")
    store._add_log("测试模块", "测试用户", "第二条日志")

    assert fake_session.added[0].id.startswith("l-")
    assert fake_session.added[1].id.startswith("l-")
    assert fake_session.added[0].id != fake_session.added[1].id


def test_system_user_actions_and_log_actions() -> None:
    client = TestClient(app)

    create_response = client.post(
        "/api/v1/system/users",
        json={
            "name": "测试用户",
            "role": "编制员",
            "department": "测试部",
            "status": "启用",
        },
    )
    user = create_response.json()
    status_response = client.patch(
        f"/api/v1/system/users/{user['id']}/status?status=禁用",
        json={},
    )
    import_response = client.post("/api/v1/system/users/import", json={})
    export_users_response = client.get("/api/v1/system/users/export")
    logs_response = client.get("/api/v1/system/logs?module=用户管理&result=成功")
    export_response = client.get("/api/v1/system/logs/export?module=用户管理")
    detail_response = client.get(f"/api/v1/system/logs/{logs_response.json()[0]['id']}")

    assert create_response.status_code == 200
    assert user["name"] == "测试用户"
    assert status_response.status_code == 200
    assert status_response.json()["status"] == "禁用"
    assert import_response.status_code == 200
    assert import_response.json()["imported"] == 2
    assert export_users_response.status_code == 200
    assert export_users_response.json()["status"] == "ready"
    assert export_users_response.json()["rows"] >= 1
    assert logs_response.status_code == 200
    assert len(logs_response.json()) >= 1
    assert export_response.status_code == 200
    assert export_response.json()["status"] == "ready"
    assert detail_response.status_code == 200
    assert "detail" in detail_response.json()


def test_record_upload_and_field_update_endpoints(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("INSPECTION_DATA_DIR", str(tmp_path / "data"))
    test_store = MockStore()
    app.dependency_overrides[get_store] = lambda: test_store

    try:
        client = TestClient(app)
        upload_response = client.post(
            "/api/v1/records/uploads",
            json={
                "files": [
                    {
                        "name": "主轴精度检测记录.pdf",
                        "type": "PDF",
                        "size": "2.00 MB",
                        "detectedType": "几何精度",
                    }
                ]
            },
        )

        assert upload_response.status_code == 200
        uploaded = upload_response.json()["files"][0]
        assert uploaded["parseStatus"] == "解析中"
        assert upload_response.json()["parseEvents"][uploaded["id"]]
        assert upload_response.json()["fields"][uploaded["id"]] == []

        type_response = client.patch(
            f"/api/v1/records/files/{uploaded['id']}/type",
            json={"detectedType": "位置精度"},
        )
        success_status_response = client.patch(
            f"/api/v1/records/files/{uploaded['id']}/status",
            json={"parseStatus": "解析成功"},
        )
        events_response = client.get(f"/api/v1/records/files/{uploaded['id']}/parse-events")
        fields_by_file_response = client.get("/api/v1/records/fields-by-file")
        field_response = client.post(
            f"/api/v1/records/files/{uploaded['id']}/fields",
            json={"name": "人工备注", "value": "复核通过"},
        )

        assert type_response.status_code == 200
        assert type_response.json()["detectedType"] == "位置精度"
        assert success_status_response.status_code == 200
        assert success_status_response.json()["parseStatus"] == "解析成功"
        assert any(event["label"] == "结构化结果已写入字段库" for event in events_response.json())
        assert uploaded["id"] in fields_by_file_response.json()
        assert fields_by_file_response.json()[uploaded["id"]]
        assert field_response.status_code == 200
        assert field_response.json()["confidence"] == 100

        preview_response = client.get(f"/api/v1/records/files/{uploaded['id']}/preview")
        export_response = client.post(
            "/api/v1/records/exports",
            json={"projectId": "p1", "formats": ["excel", "json", "package"]},
        )

        assert preview_response.status_code == 200
        assert preview_response.json()["file"]["id"] == uploaded["id"]
        assert export_response.status_code == 200
        assert export_response.json()["status"] == "ready"
    finally:
        app.dependency_overrides.pop(get_store, None)


def test_record_multipart_upload_keeps_file_size(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("INSPECTION_DATA_DIR", str(tmp_path / "data"))
    test_store = MockStore()
    app.dependency_overrides[get_store] = lambda: test_store

    try:
        client = TestClient(app)
        upload_response = client.post(
            "/api/v1/records/upload-files",
            data={"projectId": "p1"},
            files={
                "files": (
                    "size-check.docx",
                    b"x" * 2048,
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                )
            },
        )

        assert upload_response.status_code == 200
        uploaded = upload_response.json()["files"][0]
        assert uploaded["projectId"] == "p1"
        assert uploaded["name"] == "size-check.docx"
        assert uploaded["size"] == "2 KB"
        assert uploaded["parseStatus"] == "解析中"
        assert upload_response.json()["fields"][uploaded["id"]] == []
    finally:
        app.dependency_overrides.pop(get_store, None)


def test_record_files_are_scoped_by_project(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("INSPECTION_DATA_DIR", str(tmp_path / "data"))
    test_store = MockStore()
    app.dependency_overrides[get_store] = lambda: test_store

    try:
        client = TestClient(app)
        p1_upload = client.post(
            "/api/v1/records/uploads",
            json={
                "projectId": "p1",
                "files": [
                    {
                        "name": "p1-record.pdf",
                        "type": "PDF",
                        "size": "1 KB",
                        "detectedType": "几何精度",
                    }
                ],
            },
        )
        p2_upload = client.post(
            "/api/v1/records/uploads",
            json={
                "projectId": "p2",
                "files": [
                    {
                        "name": "p2-record.pdf",
                        "type": "PDF",
                        "size": "1 KB",
                        "detectedType": "位置精度",
                    }
                ],
            },
        )

        assert p1_upload.status_code == 200
        assert p2_upload.status_code == 200
        p1_file = p1_upload.json()["files"][0]
        p2_file = p2_upload.json()["files"][0]
        assert p1_file["projectId"] == "p1"
        assert p2_file["projectId"] == "p2"

        p1_files = client.get("/api/v1/records/files?projectId=p1")
        p2_files = client.get("/api/v1/records/files?projectId=p2")

        assert [file["name"] for file in p1_files.json()] == ["p1-record.pdf"]
        assert [file["name"] for file in p2_files.json()] == ["p2-record.pdf"]

        client.patch(
            f"/api/v1/records/files/{p1_file['id']}/status",
            json={"parseStatus": "解析成功"},
        )
        p1_fields = client.get("/api/v1/records/fields-by-file?projectId=p1").json()
        p2_fields = client.get("/api/v1/records/fields-by-file?projectId=p2").json()

        assert p1_file["id"] in p1_fields
        assert p2_file["id"] not in p1_fields
        assert p1_file["id"] not in p2_fields
    finally:
        app.dependency_overrides.pop(get_store, None)


def test_project_workflow_marks_uploaded_files_parse_success(monkeypatch, tmp_path) -> None:
    test_store = MockStore()

    class FakeGenReportService:
        def register_run_path(self, run_id: str, run_path) -> None:
            self.run_id = run_id
            self.run_path = str(run_path)

        def run_workflow(self, manifest_path: str, mode: str, progress_callback=None) -> dict:
            if progress_callback:
                progress_callback("Extract completed")
                progress_callback("Generated: 1 section(s), 0 issue(s)")
            return {
                "status": "ok",
                "message": "Workflow completed.",
                "runs": [
                    {
                        "run_id": "report-p1",
                        "run_path": str(tmp_path / "workspace" / "work" / "report-p1"),
                    }
                ],
            }

        def register_result_runs(self, result: dict) -> dict[str, str]:
            return {run["run_id"]: run["run_path"] for run in result.get("runs", [])}

        def get_fields(self, run_id: str) -> dict:
            return {
                "sections": ["main"],
                "fields": [
                    {
                        "id": "main-inspection_item",
                        "section": "main",
                        "name": "{{inspection_item}}",
                        "value": "平面度",
                        "confidence": 95,
                    }
                ],
            }

    def fake_build(self, project, rule_templates, source_files=None):
        workspace = tmp_path / "workspace"
        run_path = workspace / "work" / "report-p1"
        run_path.mkdir(parents=True)
        (run_path / "status.json").write_text(
            '{"run_id":"report-p1","status":"generated"}', encoding="utf-8"
        )
        manifest_path = workspace / "manifest.yaml"
        manifest_path.write_text("project: test\n", encoding="utf-8")
        return {
            "manifest_path": str(manifest_path),
            "workspace_path": str(workspace),
            "run_id": "report-p1",
            "items": [],
        }

    app.dependency_overrides[get_store] = lambda: test_store
    app.dependency_overrides[get_gen_report_service] = lambda: FakeGenReportService()
    monkeypatch.setattr(ManifestBuilder, "build", fake_build)

    try:
        client = TestClient(app)
        upload_response = client.post(
            "/api/v1/records/uploads",
            json={
                "projectId": "p1",
                "files": [
                    {
                        "name": "工作流状态回写测试.docx",
                        "type": "Word",
                        "size": "10 KB",
                        "detectedType": "几何精度",
                    }
                ]
            },
        )
        uploaded = upload_response.json()["files"][0]
        assert uploaded["parseStatus"] == "解析中"

        run_response = client.post("/api/v1/gen-report/projects/runs", json={"projectId": "p1"})
        assert run_response.status_code == 202
        job_id = run_response.json()["jobId"]

        job = None
        for _ in range(20):
            job_response = client.get(f"/api/v1/gen-report/jobs/{job_id}")
            job = job_response.json()
            if job["status"] == "succeeded":
                break
            time.sleep(0.01)

        assert job is not None
        assert job["status"] == "succeeded"

        files_response = client.get("/api/v1/records/files")
        updated_file = next(file for file in files_response.json() if file["id"] == uploaded["id"])
        assert updated_file["parseStatus"] == "解析成功"
        assert updated_file["parseJobId"] == job_id
        assert updated_file["parseRunId"] == "report-p1"
        assert updated_file["parseRunPath"].endswith("workspace/work/report-p1")
        assert updated_file["fieldsApproved"] is False

        events_response = client.get(f"/api/v1/records/files/{uploaded['id']}/parse-events")
        assert any(event["label"] == "结构化结果已写入字段库" for event in events_response.json())
    finally:
        app.dependency_overrides.pop(get_store, None)
        app.dependency_overrides.pop(get_gen_report_service, None)


def test_project_extract_marks_uploaded_files_parse_success(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("INSPECTION_DATA_DIR", str(tmp_path / "data"))
    test_store = MockStore()

    class FakeExtractService:
        def register_run_path(self, run_id: str, run_path) -> None:
            self.run_id = run_id
            self.run_path = str(run_path)

        def prepare_manifest(self, manifest_path: str) -> dict:
            return {
                "status": "ok",
                "message": "prepared",
                "runs": [
                    {
                        "run_id": "report-p1",
                        "run_path": str(tmp_path / "workspace" / "work" / "report-p1"),
                    }
                ],
            }

        def extract_run(self, run_id: str, section=None) -> dict:
            return {"status": "extracted", "message": "Extraction completed."}

        def register_result_runs(self, result: dict) -> dict[str, str]:
            return {run["run_id"]: run["run_path"] for run in result.get("runs", [])}

        def get_fields(self, run_id: str) -> dict:
            return {
                "sections": ["main"],
                "fields": [
                    {
                        "id": "main-report-no",
                        "section": "main",
                        "name": "{{report_no}}",
                        "value": "R-001",
                        "confidence": 96,
                    }
                ],
            }

    def fake_build(self, project, rule_templates, source_files=None):
        workspace = tmp_path / "workspace"
        run_path = workspace / "work" / "report-p1"
        run_path.mkdir(parents=True)
        (run_path / "status.json").write_text(
            '{"run_id":"report-p1","status":"extracted"}', encoding="utf-8"
        )
        manifest_path = workspace / "manifest.yaml"
        manifest_path.write_text("project: test\n", encoding="utf-8")
        return {
            "manifest_path": str(manifest_path),
            "workspace_path": str(workspace),
            "run_id": "report-p1",
            "items": [],
        }

    app.dependency_overrides[get_store] = lambda: test_store
    app.dependency_overrides[get_gen_report_service] = lambda: FakeExtractService()
    monkeypatch.setattr(ManifestBuilder, "build", fake_build)

    try:
        client = TestClient(app)
        upload_response = client.post(
            "/api/v1/records/uploads",
            json={
                "projectId": "p1",
                "files": [
                    {
                        "name": "字段提取测试.docx",
                        "type": "Word",
                        "size": "10 KB",
                        "detectedType": "几何精度",
                    }
                ]
            },
        )
        uploaded = upload_response.json()["files"][0]

        run_response = client.post("/api/v1/gen-report/projects/extract", json={"projectId": "p1"})
        assert run_response.status_code == 202
        job_id = run_response.json()["jobId"]

        job = None
        for _ in range(20):
            job_response = client.get(f"/api/v1/gen-report/jobs/{job_id}")
            job = job_response.json()
            if job["status"] == "succeeded":
                break
            time.sleep(0.01)

        assert job is not None
        assert job["status"] == "succeeded"
        assert job["result"]["runs"][0]["status"] == "extracted"

        files_response = client.get("/api/v1/records/files?projectId=p1")
        updated_file = next(file for file in files_response.json() if file["id"] == uploaded["id"])
        assert updated_file["parseStatus"] == "解析成功"
        assert updated_file["parseJobId"] == job_id
        assert updated_file["parseRunId"] == "report-p1"
        assert updated_file["parseRunPath"].endswith("workspace/work/report-p1")
        assert updated_file["fieldsApproved"] is False

        fields = client.get("/api/v1/records/fields-by-file?projectId=p1").json()
        assert fields[uploaded["id"]][0]["name"] == "{{report_no}}"
    finally:
        app.dependency_overrides.pop(get_store, None)
        app.dependency_overrides.pop(get_gen_report_service, None)


def test_approve_marks_bound_file_approved_and_field_edit_resets(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("INSPECTION_DATA_DIR", str(tmp_path / "data"))
    test_store = MockStore()
    run_path = tmp_path / "workspace" / "work" / "report-p1"
    run_path.mkdir(parents=True)
    (run_path / "status.json").write_text(
        '{"run_id":"report-p1","status":"extracted"}', encoding="utf-8"
    )

    class FakeApproveService:
        def register_run_path(self, run_id: str, run_path_arg) -> None:
            self.run_id = run_id
            self.run_path = str(run_path_arg)

        def approve_run(self, run_id: str) -> dict:
            assert run_id == "report-p1"
            assert self.run_path == str(run_path)
            return {"status": "ok", "approval": True, "message": "Approved."}

        def set_field(self, run_id: str, section: str, field: str, value: str) -> dict:
            assert run_id == "report-p1"
            return {"status": "ok", "message": "updated"}

    app.dependency_overrides[get_store] = lambda: test_store
    app.dependency_overrides[get_gen_report_service] = lambda: FakeApproveService()

    try:
        client = TestClient(app)
        upload_response = client.post(
            "/api/v1/records/uploads",
            json={
                "projectId": "p1",
                "files": [
                    {
                        "name": "审核状态回写.docx",
                        "type": "Word",
                        "size": "10 KB",
                        "detectedType": "几何精度",
                    }
                ],
            },
        )
        uploaded = upload_response.json()["files"][0]
        test_store.bind_file_run_metadata(
            [uploaded["id"]],
            job_id="job-1",
            run_id="report-p1",
            run_path=str(run_path),
        )
        test_store.update_file_status(uploaded["id"], "解析成功")
        test_store.replace_file_fields(
            uploaded["id"],
            [
                ExtractedField(
                    id="inspection_item",
                    name="inspection_item",
                    value="旧值",
                    confidence=95,
                    section="main",
                )
            ],
        )

        approve_response = client.post("/api/v1/gen-report/runs/report-p1/approve")
        assert approve_response.status_code == 200
        approved_files = client.get("/api/v1/records/files?projectId=p1").json()
        approved_file = next(file for file in approved_files if file["id"] == uploaded["id"])
        assert approved_file["fieldsApproved"] is True
        assert approved_file["approvedAt"]

        edit_response = client.post(
            "/api/v1/gen-report/runs/report-p1/set-field",
            json={"section": "main", "field": "inspection_item", "value": "平面度"},
        )
        assert edit_response.status_code == 200
        edited_files = client.get("/api/v1/records/files?projectId=p1").json()
        edited_file = next(file for file in edited_files if file["id"] == uploaded["id"])
        assert edited_file["fieldsApproved"] is False
        assert edited_file["approvedAt"] is None
        edited_fields = client.get("/api/v1/records/fields-by-file?projectId=p1").json()
        assert edited_fields[uploaded["id"]][0]["value"] == "平面度"
        assert edited_fields[uploaded["id"]][0]["confidence"] == 100
    finally:
        app.dependency_overrides.pop(get_store, None)
        app.dependency_overrides.pop(get_gen_report_service, None)


def test_set_field_repairs_corrupt_fill_payload(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("INSPECTION_DATA_DIR", str(tmp_path / "data"))
    test_store = MockStore()
    run_path = tmp_path / "workspace" / "work" / "report-p1"
    fill_dir = run_path / "fill_payloads"
    fill_dir.mkdir(parents=True)
    (run_path / "status.json").write_text(
        '{"run_id":"report-p1","status":"extracted"}', encoding="utf-8"
    )
    (fill_dir / "main.json").write_text("", encoding="utf-8")

    class FakeRepairService:
        def __init__(self) -> None:
            self.calls = 0
            self.run_path = ""

        def register_run_path(self, run_id: str, run_path_arg) -> None:
            assert run_id == "report-p1"
            self.run_path = str(run_path_arg)

        def set_field(self, run_id: str, section: str, field: str, value: str) -> dict:
            assert run_id == "report-p1"
            self.calls += 1
            if self.calls == 1:
                raise JSONDecodeError("Expecting value", "", 0)
            payload = json.loads((Path(self.run_path) / "fill_payloads" / "main.json").read_text())
            assert any(entry["placeholder"] == field for entry in payload)
            return {"status": "ok", "message": "updated"}

    fake_service = FakeRepairService()
    app.dependency_overrides[get_store] = lambda: test_store
    app.dependency_overrides[get_gen_report_service] = lambda: fake_service

    try:
        client = TestClient(app)
        upload_response = client.post(
            "/api/v1/records/uploads",
            json={
                "projectId": "p1",
                "files": [
                    {
                        "name": "修复空payload.docx",
                        "type": "Word",
                        "size": "10 KB",
                        "detectedType": "几何精度",
                    }
                ],
            },
        )
        uploaded = upload_response.json()["files"][0]
        test_store.bind_file_run_metadata(
            [uploaded["id"]],
            job_id="job-1",
            run_id="report-p1",
            run_path=str(run_path),
        )
        test_store.update_file_status(uploaded["id"], "解析成功")
        test_store.replace_file_fields(
            uploaded["id"],
            [
                ExtractedField(
                    id="inspection_item",
                    name="inspection_item",
                    value="旧值",
                    confidence=95,
                    section="main",
                )
            ],
        )

        response = client.post(
            "/api/v1/gen-report/runs/report-p1/set-field",
            json={"section": "main", "field": "inspection_item", "value": "平面度"},
        )

        assert response.status_code == 200
        assert fake_service.calls == 2
        repaired_payload = json.loads((fill_dir / "main.json").read_text(encoding="utf-8"))
        assert repaired_payload[0]["placeholder"] == "inspection_item"
    finally:
        app.dependency_overrides.pop(get_store, None)
        app.dependency_overrides.pop(get_gen_report_service, None)


def test_records_files_downgrades_when_workspace_is_missing(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("INSPECTION_DATA_DIR", str(tmp_path / "data"))
    test_store = MockStore()
    app.dependency_overrides[get_store] = lambda: test_store

    try:
        client = TestClient(app)
        upload_response = client.post(
            "/api/v1/records/uploads",
            json={
                "projectId": "p1",
                "files": [
                    {
                        "name": "丢失工作区.docx",
                        "type": "Word",
                        "size": "10 KB",
                        "detectedType": "几何精度",
                    }
                ],
            },
        )
        uploaded = upload_response.json()["files"][0]
        missing_run_path = tmp_path / "missing-workspace" / "work" / "report-p1"
        test_store.bind_file_run_metadata(
            [uploaded["id"]],
            job_id="job-1",
            run_id="report-p1",
            run_path=str(missing_run_path),
        )
        test_store.update_file_status(uploaded["id"], "解析成功")

        files_response = client.get("/api/v1/records/files?projectId=p1")
        updated_file = next(file for file in files_response.json() if file["id"] == uploaded["id"])
        assert updated_file["parseStatus"] == "解析失败"
        assert updated_file["fieldsApproved"] is False
        events_response = client.get(f"/api/v1/records/files/{uploaded['id']}/parse-events")
        assert any("工作区不存在" in event["label"] for event in events_response.json())
    finally:
        app.dependency_overrides.pop(get_store, None)


def test_project_workflow_persists_fields_when_review_is_required(monkeypatch, tmp_path) -> None:
    test_store = MockStore()

    class FakeReviewRequiredService:
        def register_run_path(self, run_id: str, run_path) -> None:
            self.run_id = run_id
            self.run_path = str(run_path)

        def run_workflow(self, manifest_path: str, mode: str, progress_callback=None) -> dict:
            if progress_callback:
                progress_callback("Run report-p1: extract completed")
            return {
                "status": "error",
                "message": "All 1 run(s) need human handling (review).",
                "runs": [
                    {
                        "run_id": "report-p1",
                        "run_path": str(tmp_path / "workspace" / "work" / "report-p1"),
                        "status": "review_required",
                    }
                ],
            }

        def register_result_runs(self, result: dict) -> dict[str, str]:
            return {run["run_id"]: run["run_path"] for run in result.get("runs", [])}

        def get_fields(self, run_id: str) -> dict:
            return {
                "sections": ["main"],
                "fields": [
                    {
                        "id": "main-judgement",
                        "section": "main",
                        "name": "{{judgement}}",
                        "value": "合格",
                        "confidence": 92,
                    }
                ],
            }

    def fake_build(self, project, rule_templates, source_files=None):
        workspace = tmp_path / "workspace"
        run_path = workspace / "work" / "report-p1"
        run_path.mkdir(parents=True)
        (run_path / "status.json").write_text(
            '{"run_id":"report-p1","status":"review_required"}', encoding="utf-8"
        )
        manifest_path = workspace / "manifest.yaml"
        manifest_path.write_text("project: test\n", encoding="utf-8")
        return {
            "manifest_path": str(manifest_path),
            "workspace_path": str(workspace),
            "run_id": "report-p1",
            "items": [],
        }

    app.dependency_overrides[get_store] = lambda: test_store
    app.dependency_overrides[get_gen_report_service] = lambda: FakeReviewRequiredService()
    monkeypatch.setattr(ManifestBuilder, "build", fake_build)

    try:
        client = TestClient(app)
        upload_response = client.post(
            "/api/v1/records/uploads",
            json={
                "projectId": "p1",
                "files": [
                    {
                        "name": "需要审核但字段已抽取.docx",
                        "type": "Word",
                        "size": "10 KB",
                        "detectedType": "几何精度",
                    }
                ]
            },
        )
        uploaded = upload_response.json()["files"][0]

        run_response = client.post("/api/v1/gen-report/projects/runs", json={"projectId": "p1"})
        assert run_response.status_code == 202
        job_id = run_response.json()["jobId"]

        job = None
        for _ in range(20):
            job_response = client.get(f"/api/v1/gen-report/jobs/{job_id}")
            job = job_response.json()
            if job["status"] == "failed":
                break
            time.sleep(0.01)

        assert job is not None
        assert job["status"] == "failed"
        assert "human handling" in job["message"]

        files_response = client.get("/api/v1/records/files?projectId=p1")
        updated_file = next(file for file in files_response.json() if file["id"] == uploaded["id"])
        assert updated_file["parseStatus"] == "解析成功"

        fields = client.get("/api/v1/records/fields-by-file?projectId=p1").json()
        assert fields[uploaded["id"]][0]["name"] == "{{judgement}}"
    finally:
        app.dependency_overrides.pop(get_store, None)
        app.dependency_overrides.pop(get_gen_report_service, None)


def test_project_create_delete_and_restore_endpoints() -> None:
    client = TestClient(app)

    login_resp = client.post(
        "/api/v1/auth/login",
        json={"username": "zhanggong", "password": "password123"},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["accessToken"]
    headers = {"Authorization": f"Bearer {token}"}

    create_response = client.post(
        "/api/v1/projects",
        json={"name": "接口联调测试项目", "owner": "测试员", "type": "综合检测"},
        headers=headers,
    )
    project = create_response.json()
    delete_response = client.delete(
        f"/api/v1/projects/{project['id']}", headers=headers,
    )
    deleted_response = client.get("/api/v1/projects/deleted", headers=headers)
    restore_response = client.post(
        f"/api/v1/projects/{project['id']}/restore", json={}, headers=headers,
    )
    projects_response = client.get("/api/v1/projects")

    assert create_response.status_code == 200
    assert project["name"] == "接口联调测试项目"
    assert project["status"] == "待上传"
    assert delete_response.status_code == 200
    assert delete_response.json()["project"]["id"] == project["id"]
    assert any(record["project"]["id"] == project["id"] for record in deleted_response.json())
    assert restore_response.status_code == 200
    assert restore_response.json()["restored"] is True
    assert any(item["id"] == project["id"] for item in projects_response.json())


def test_report_generation_and_reorder_endpoints() -> None:
    client = TestClient(app)

    workspace_response = client.get("/api/v1/reports/workspace")
    generate_response = client.post(
        "/api/v1/reports/generate",
        json={"projectId": "p1", "sectionCategories": {}},
    )
    sections = generate_response.json()["sections"]
    reordered_ids = [section["id"] for section in reversed(sections)]

    reorder_response = client.patch(
        "/api/v1/reports/sections/order",
        json={"sectionIds": reordered_ids},
    )

    assert generate_response.status_code == 200
    assert sections[0]["title"] == "封面"
    assert generate_response.json()["versionEntry"]["kind"] == "generated"
    assert reorder_response.status_code == 200
    assert [section["id"] for section in reorder_response.json()] == reordered_ids

    preview_response = client.post(
        "/api/v1/reports/previews",
        json={"scope": "section", "sectionId": sections[0]["id"]},
    )
    rollback_response = client.post(
        "/api/v1/reports/versions/rollback",
        json={"versionId": "initial-1", "label": "V1.0 系统 生成初稿"},
    )
    export_response = client.post(
        "/api/v1/reports/exports",
        json={"scope": "整份报告", "format": "word"},
    )

    assert workspace_response.status_code == 200
    assert workspace_response.json()["versions"]
    assert workspace_response.json()["sectionMeta"]
    assert preview_response.status_code == 200
    assert preview_response.json()["status"] == "ready"
    assert preview_response.json()["delivery"]["kind"] == "preview"
    assert rollback_response.status_code == 200
    assert rollback_response.json()["sections"]
    assert rollback_response.json()["versionEntry"]["kind"] == "rollback"
    assert export_response.status_code == 200
    assert export_response.json()["delivery"]["kind"] == "export"


def test_report_export_downloads_generated_word() -> None:
    client = TestClient(app)
    run_dir = _WORKSPACES_ROOT / "test-export" / "work" / "report-test-export"
    report_path = run_dir / "final_report.docx"
    pdf_path = report_path.with_suffix(".pdf")
    word_scope = f"测试报告 {time.time_ns()}"
    pdf_scope = f"测试报告 PDF {time.time_ns()}"
    run_dir.mkdir(parents=True, exist_ok=True)
    report_path.write_bytes(b"fake docx bytes")
    pdf_path.write_bytes(b"fake pdf bytes")

    try:
        word_response = client.post(
            "/api/v1/reports/exports",
            json={"scope": word_scope, "format": "word", "filePath": str(report_path)},
        )
        initial_pdf_status = client.post(
            "/api/v1/reports/export-status",
            json={"scope": pdf_scope, "format": "pdf", "filePath": str(report_path)},
        )
        pdf_response = client.post(
            "/api/v1/reports/exports",
            json={"scope": pdf_scope, "format": "pdf", "filePath": str(report_path)},
        )
        final_pdf_status = client.post(
            "/api/v1/reports/export-status",
            json={"scope": pdf_scope, "format": "pdf", "filePath": str(report_path)},
        )
    finally:
        shutil.rmtree(_WORKSPACES_ROOT / "test-export", ignore_errors=True)

    assert word_response.status_code == 200
    assert word_response.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    assert "attachment" in word_response.headers["content-disposition"]
    assert word_response.content == b"fake docx bytes"
    assert initial_pdf_status.status_code == 200
    assert initial_pdf_status.json()["exists"] is False
    assert initial_pdf_status.json()["deliveryRecorded"] is False
    assert pdf_response.status_code == 200
    assert pdf_response.headers["content-type"].startswith("application/pdf")
    assert pdf_response.content == b"fake pdf bytes"
    assert final_pdf_status.status_code == 200
    assert final_pdf_status.json()["exists"] is True
    assert final_pdf_status.json()["deliveryRecorded"] is True


def test_report_export_converts_pdf_without_libreoffice(monkeypatch) -> None:
    monkeypatch.setattr("app.api.v1.reports.shutil.which", lambda _: None)
    client = TestClient(app)
    run_dir = _WORKSPACES_ROOT / "test-export-fallback" / "work" / "report-test-export"
    report_path = run_dir / "final_report.docx"
    pdf_scope = f"兜底转换 {time.time_ns()}"
    _write_minimal_docx(report_path, ["智能检测报告", "PDF 导出兜底转换"])

    try:
        initial_pdf_status = client.post(
            "/api/v1/reports/export-status",
            json={"scope": pdf_scope, "format": "pdf", "filePath": str(report_path)},
        )
        pdf_response = client.post(
            "/api/v1/reports/exports",
            json={"scope": pdf_scope, "format": "pdf", "filePath": str(report_path)},
        )
        final_pdf_status = client.post(
            "/api/v1/reports/export-status",
            json={"scope": pdf_scope, "format": "pdf", "filePath": str(report_path)},
        )
    finally:
        shutil.rmtree(_WORKSPACES_ROOT / "test-export-fallback", ignore_errors=True)

    assert initial_pdf_status.status_code == 200
    assert initial_pdf_status.json()["exists"] is False
    assert pdf_response.status_code == 200
    assert pdf_response.headers["content-type"].startswith("application/pdf")
    assert pdf_response.content.startswith(b"%PDF-1.4")
    assert final_pdf_status.status_code == 200
    assert final_pdf_status.json()["exists"] is True
    assert final_pdf_status.json()["deliveryRecorded"] is True


def test_rules_and_report_submit_endpoints() -> None:
    client = TestClient(app)

    templates_response = client.get("/api/v1/rules/templates")
    template = templates_response.json()[0]
    create_response = client.post(
        "/api/v1/rules/templates",
        json={"name": "规则接口测试模板", "category": "综合检测"},
    )
    copy_response = client.post(f"/api/v1/rules/templates/{template['id']}/copy", json={})
    update_response = client.patch(
        f"/api/v1/rules/templates/{create_response.json()['id']}",
        json={"name": "规则接口测试模板-已编辑"},
    )
    field_update_response = client.patch(
        f"/api/v1/rules/templates/{template['id']}/fields/{template['fields'][0]['id']}",
        json={"name": "检验项目-已编辑", "required": False},
    )
    save_response = client.post(
        "/api/v1/rules/save",
        json={"templateId": template["id"], "fieldId": template["fields"][0]["id"]},
    )
    versions_response = client.get(f"/api/v1/rules/templates/{template['id']}/versions")
    submit_response = client.post("/api/v1/reports/submit", json={})

    assert templates_response.status_code == 200
    assert template["fields"]
    assert create_response.status_code == 200
    assert create_response.json()["name"] == "规则接口测试模板"
    assert copy_response.status_code == 200
    assert copy_response.json()["name"].endswith("副本")
    assert update_response.status_code == 200
    assert update_response.json()["name"] == "规则接口测试模板-已编辑"
    assert field_update_response.status_code == 200
    assert field_update_response.json()["fields"][0]["name"] == "检验项目-已编辑"
    assert field_update_response.json()["fields"][0]["required"] is False
    assert save_response.status_code == 200
    assert save_response.json()["ok"] is True
    assert save_response.json()["version"] != template["version"]
    assert versions_response.status_code == 200
    assert versions_response.json()["versions"]
    assert submit_response.status_code == 200
    assert submit_response.json() == {"ok": True, "status": "待审核"}
