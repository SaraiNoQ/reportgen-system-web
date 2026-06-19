from app.services import gen_report_service as service_module
from app.services.gen_report_service import GenReportService


def test_run_path_recovers_from_workspace_after_restart(monkeypatch, tmp_path) -> None:
    workspace_root = tmp_path / "genreport-workspaces"
    run_path = workspace_root / "p1" / "work" / "report-p1"
    run_path.mkdir(parents=True)
    (run_path / "status.json").write_text('{"run_id":"report-p1","status":"extracted"}')
    monkeypatch.setattr(service_module, "_WORKSPACES_ROOT", workspace_root)

    class FakeWorkflow:
        def approve(self, raw_run_path: str) -> dict:
            assert raw_run_path == str(run_path.resolve())
            return {"status": "ok", "approval": True, "message": "Approved."}

    service = GenReportService(workflow_service=FakeWorkflow())

    assert service.approve_run("report-p1")["approval"] is True
