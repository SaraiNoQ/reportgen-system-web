from fastapi import APIRouter, HTTPException

from app.schemas.domain import (
    AddReportSectionRequest,
    DraftResponse,
    ExportRequest,
    ExportResponse,
    ReorderReportSectionsRequest,
    ReportGenerateRequest,
    ReportGenerateResponse,
    ReportPreviewRequest,
    ReportPreviewResponse,
    ReportSection,
    ReportWorkspaceResponse,
    RevisionUploadRequest,
    RollbackRequest,
    RollbackResponse,
    SubmitReportResponse,
    UpdateReportSectionRequest,
)
from app.services.mock_store import store

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/sections", response_model=list[ReportSection])
def list_sections() -> list[ReportSection]:
    return store.snapshot(store.report_sections)


@router.get("/workspace", response_model=ReportWorkspaceResponse)
def get_report_workspace() -> ReportWorkspaceResponse:
    return ReportWorkspaceResponse(
        sections=store.snapshot(store.report_sections),
        versions=store.snapshot(store.report_versions),
        deliveries=store.snapshot(store.report_deliveries),
        sectionMeta=store.snapshot(store.report_section_meta),
    )


@router.post("/generate", response_model=ReportGenerateResponse)
def generate_report(_: ReportGenerateRequest) -> ReportGenerateResponse:
    sections = store.generate_report()
    version = store.report_versions[0]
    return ReportGenerateResponse(
        sections=sections,
        version=version.label,
        versionEntry=version,
        message=(
            "报告已生成。请通过 PDF 预览核对排版；"
            "如发现内容错误，可下载对应章节 Word 修改后重新上传。"
        ),
    )


@router.post("/sections", response_model=ReportSection)
def add_section(payload: AddReportSectionRequest) -> ReportSection:
    return store.add_report_section(payload.title, payload.content)


@router.patch("/sections/order", response_model=list[ReportSection])
def reorder_sections(payload: ReorderReportSectionsRequest) -> list[ReportSection]:
    return store.reorder_report_sections(payload.sectionIds)


@router.patch("/sections/{section_id}", response_model=ReportSection)
def update_section(section_id: str, payload: UpdateReportSectionRequest) -> ReportSection:
    section = store.update_report_section(section_id, payload)
    if not section:
        raise HTTPException(status_code=404, detail="section not found")
    return section


@router.delete("/sections/{section_id}")
def delete_section(section_id: str) -> dict[str, bool]:
    if not store.delete_report_section(section_id):
        raise HTTPException(status_code=404, detail="section not found or last section")
    return {"ok": True}


@router.post("/sections/{section_id}/revision", response_model=DraftResponse)
def upload_revision(section_id: str, payload: RevisionUploadRequest) -> DraftResponse:
    version = store.upload_report_revision(section_id, payload.fileName)
    if not version:
        raise HTTPException(status_code=404, detail="section not found")
    return DraftResponse(version=version.label, versionEntry=version)


@router.post("/drafts", response_model=DraftResponse)
def save_draft() -> DraftResponse:
    version = store.save_report_draft()
    return DraftResponse(version=version.label, versionEntry=version)


@router.post("/exports", response_model=ExportResponse)
def export_report(payload: ExportRequest) -> ExportResponse:
    delivery = store.export_report(payload.scope, payload.format)
    return ExportResponse(fileName=delivery.fileName, status="ready", delivery=delivery)


@router.post("/previews", response_model=ReportPreviewResponse)
def preview_report(payload: ReportPreviewRequest) -> ReportPreviewResponse:
    file_name = store.register_report_preview(payload.scope, payload.sectionId)
    return ReportPreviewResponse(
        fileName=file_name,
        status="ready",
        delivery=store.report_deliveries[0],
    )


@router.post("/versions/rollback", response_model=RollbackResponse)
def rollback_report(payload: RollbackRequest) -> RollbackResponse:
    version = store.rollback_report(payload.versionId, payload.label)
    return RollbackResponse(
        version=version,
        sections=store.snapshot(store.report_sections),
        versionEntry=store.report_versions[0],
    )


@router.post("/submit", response_model=SubmitReportResponse)
def submit_report() -> SubmitReportResponse:
    store.submit_report()
    return SubmitReportResponse(ok=True, status="待审核")
