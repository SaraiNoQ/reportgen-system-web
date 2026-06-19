import shutil
import subprocess
import zipfile
from html import unescape
from pathlib import Path
from typing import Annotated
from xml.etree import ElementTree

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from app.dependencies import Store, get_store
from app.schemas.domain import (
    AddReportSectionRequest,
    DraftResponse,
    ExportRequest,
    ExportResponse,
    ExportStatusResponse,
    ReorderReportSectionsRequest,
    ReportDelivery,
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
from app.services.manifest_builder import _WORKSPACES_ROOT

router = APIRouter(prefix="/reports", tags=["reports"])

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def _safe_generated_report_path(raw_path: str) -> Path:
    path = Path(raw_path).expanduser().resolve()
    try:
        path.relative_to(_WORKSPACES_ROOT.resolve())
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail="Report export path must be inside the gen-report workspace.",
        ) from exc
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Generated report file does not exist.")
    if path.suffix.lower() != ".docx":
        raise HTTPException(
            status_code=400,
            detail="Generated report export only accepts .docx files.",
        )
    return path


def _download_name(scope: str, suffix: str) -> str:
    safe_scope = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in scope).strip("_")
    return f"{safe_scope or 'report'}_检测报告.{suffix}"


def _export_format(format_name: str) -> str:
    return "docx" if format_name == "word" else format_name


def _pdf_path_for_docx(docx_path: Path) -> Path:
    return docx_path.with_suffix(".pdf")


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _extract_docx_text(docx_path: Path) -> list[str]:
    try:
        with zipfile.ZipFile(docx_path) as archive:
            xml_content = archive.read("word/document.xml")
    except (KeyError, OSError, zipfile.BadZipFile):
        return [docx_path.stem]

    try:
        root = ElementTree.fromstring(xml_content)
    except ElementTree.ParseError:
        return [docx_path.stem]

    body = next((child for child in root.iter() if _local_name(child.tag) == "body"), root)
    lines: list[str] = []
    for child in body:
        tag = _local_name(child.tag)
        if tag == "p":
            text = _paragraph_text(child)
            if text:
                lines.append(text)
        elif tag == "tbl":
            lines.extend(_table_lines(child))

    return lines or [docx_path.stem]


def _paragraph_text(node: ElementTree.Element) -> str:
    parts: list[str] = []
    for child in node.iter():
        tag = _local_name(child.tag)
        if tag == "t" and child.text:
            parts.append(child.text)
        elif tag == "tab":
            parts.append("    ")
        elif tag in {"br", "cr"}:
            parts.append("\n")
    return unescape("".join(parts)).strip()


def _table_lines(node: ElementTree.Element) -> list[str]:
    rows: list[str] = []
    for row in node.iter():
        if _local_name(row.tag) != "tr":
            continue
        cells = [
            _paragraph_text(cell)
            for cell in row
            if _local_name(cell.tag) == "tc" and _paragraph_text(cell)
        ]
        if cells:
            rows.append(" | ".join(cells))
    return rows


def _display_width(text: str) -> int:
    return sum(2 if ord(ch) > 127 else 1 for ch in text)


def _wrap_pdf_line(text: str, max_width: int = 88) -> list[str]:
    lines: list[str] = []
    current = ""
    for ch in text:
        if ch == "\n":
            lines.append(current)
            current = ""
            continue
        next_line = f"{current}{ch}"
        if current and _display_width(next_line) > max_width:
            lines.append(current)
            current = ch
        else:
            current = next_line
    lines.append(current)
    return lines


def _pdf_text_operand(text: str) -> str:
    return f"<{text.encode('utf-16-be').hex().upper()}>"


def _write_text_pdf(lines: list[str], pdf_path: Path) -> None:
    wrapped_lines: list[str] = []
    for line in lines:
        wrapped_lines.extend(_wrap_pdf_line(line))
        if not line:
            wrapped_lines.append("")

    page_line_limit = 46
    pages = [
        wrapped_lines[index : index + page_line_limit]
        for index in range(0, len(wrapped_lines), page_line_limit)
    ] or [[""]]

    objects: list[bytes] = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"",
        (
            b"<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light "
            b"/Encoding /UniGB-UCS2-H /DescendantFonts [4 0 R] >>"
        ),
        (
            b"<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light "
            b"/CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 2 >> >>"
        ),
    ]
    page_object_numbers: list[int] = []

    for page_lines in pages:
        commands = ["BT", "/F1 11 Tf", "15 TL", "48 800 Td"]
        for index, line in enumerate(page_lines):
            if index:
                commands.append("T*")
            commands.append(f"{_pdf_text_operand(line)} Tj")
        commands.append("ET")
        stream = "\n".join(commands).encode("ascii")
        content = b"<< /Length %d >>\nstream\n%s\nendstream" % (len(stream), stream)
        page_number = len(objects) + 1
        content_number = page_number + 1
        page_object_numbers.append(page_number)
        objects.append(
            (
                "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
                f"/Resources << /Font << /F1 3 0 R >> >> /Contents {content_number} 0 R >>"
            ).encode("ascii")
        )
        objects.append(content)

    kids = " ".join(f"{number} 0 R" for number in page_object_numbers)
    objects[1] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_object_numbers)} >>".encode(
        "ascii"
    )

    output = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets: list[int] = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(output))
        output.extend(f"{index} 0 obj\n".encode("ascii"))
        output.extend(obj)
        output.extend(b"\nendobj\n")

    xref_offset = len(output)
    output.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    output.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    output.extend(
        (
            f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_offset}\n%%EOF\n"
        ).encode("ascii")
    )
    pdf_path.write_bytes(bytes(output))


def _fallback_convert_docx_to_pdf(docx_path: Path, pdf_path: Path) -> Path:
    _write_text_pdf(_extract_docx_text(docx_path), pdf_path)
    if not pdf_path.is_file():
        raise HTTPException(
            status_code=500,
            detail="Fallback PDF conversion did not produce an output file.",
        )
    return pdf_path


def _find_delivery(
    store: Store,
    scope: str,
    format_name: str,
    file_path: Path,
) -> ReportDelivery | None:
    expected_format = _export_format(format_name)
    expected_name = _download_name(scope, expected_format)
    resolved_path = file_path.resolve()
    for delivery in store.snapshot(store.report_deliveries):
        if (
            delivery.kind != "export"
            or delivery.scope != scope
            or delivery.format != expected_format
        ):
            continue
        if delivery.filePath and Path(delivery.filePath).expanduser().resolve() == resolved_path:
            return delivery
        if not delivery.filePath and delivery.fileName == expected_name:
            return delivery
    return None


def _add_export_delivery(
    store: Store,
    scope: str,
    format_name: str,
    file_path: Path,
) -> ReportDelivery:
    expected_format = _export_format(format_name)
    existing = _find_delivery(store, scope, format_name, file_path)
    if existing is not None:
        return existing
    return store.add_report_delivery(
        "export",
        scope,
        _download_name(scope, expected_format),
        expected_format,
        file_path=str(file_path.resolve()),
    )


def _convert_docx_to_pdf(docx_path: Path) -> Path:
    pdf_path = _pdf_path_for_docx(docx_path)
    if pdf_path.is_file():
        return pdf_path

    converter = shutil.which("soffice") or shutil.which("libreoffice")
    if converter is None:
        return _fallback_convert_docx_to_pdf(docx_path, pdf_path)

    try:
        subprocess.run(
            [
                converter,
                "--headless",
                "--convert-to",
                "pdf",
                "--outdir",
                str(docx_path.parent),
                str(docx_path),
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=60,
        )
    except (subprocess.SubprocessError, OSError) as exc:
        raise HTTPException(status_code=500, detail=f"PDF conversion failed: {exc}") from exc

    if not pdf_path.is_file():
        raise HTTPException(
            status_code=500,
            detail="PDF conversion did not produce an output file.",
        )
    return pdf_path


@router.get("/sections", response_model=list[ReportSection])
def list_sections(
    store: Annotated[Store, Depends(get_store)],
) -> list[ReportSection]:
    return store.snapshot(store.report_sections)


@router.get("/workspace", response_model=ReportWorkspaceResponse)
def get_report_workspace(
    store: Annotated[Store, Depends(get_store)],
) -> ReportWorkspaceResponse:
    return ReportWorkspaceResponse(
        sections=store.snapshot(store.report_sections),
        versions=store.snapshot(store.report_versions),
        deliveries=store.snapshot(store.report_deliveries),
        sectionMeta=store.snapshot(store.report_section_meta),
    )


@router.post("/generate", response_model=ReportGenerateResponse)
def generate_report(
    _: ReportGenerateRequest,
    store: Annotated[Store, Depends(get_store)],
) -> ReportGenerateResponse:
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
def add_section(
    payload: AddReportSectionRequest,
    store: Annotated[Store, Depends(get_store)],
) -> ReportSection:
    return store.add_report_section(payload.title, payload.content)


@router.patch("/sections/order", response_model=list[ReportSection])
def reorder_sections(
    payload: ReorderReportSectionsRequest,
    store: Annotated[Store, Depends(get_store)],
) -> list[ReportSection]:
    return store.reorder_report_sections(payload.sectionIds)


@router.patch("/sections/{section_id}", response_model=ReportSection)
def update_section(
    section_id: str,
    payload: UpdateReportSectionRequest,
    store: Annotated[Store, Depends(get_store)],
) -> ReportSection:
    section = store.update_report_section(section_id, payload)
    if not section:
        raise HTTPException(status_code=404, detail="section not found")
    return section


@router.delete("/sections/{section_id}")
def delete_section(
    section_id: str,
    store: Annotated[Store, Depends(get_store)],
) -> dict[str, bool]:
    if not store.delete_report_section(section_id):
        raise HTTPException(status_code=404, detail="section not found or last section")
    return {"ok": True}


@router.post("/sections/{section_id}/revision", response_model=DraftResponse)
def upload_revision(
    section_id: str,
    payload: RevisionUploadRequest,
    store: Annotated[Store, Depends(get_store)],
) -> DraftResponse:
    version = store.upload_report_revision(section_id, payload.fileName)
    if not version:
        raise HTTPException(status_code=404, detail="section not found")
    return DraftResponse(version=version.label, versionEntry=version)


@router.post("/drafts", response_model=DraftResponse)
def save_draft(
    store: Annotated[Store, Depends(get_store)],
) -> DraftResponse:
    version = store.save_report_draft()
    return DraftResponse(version=version.label, versionEntry=version)


@router.post("/exports", response_model=None)
def export_report(
    payload: ExportRequest,
    store: Annotated[Store, Depends(get_store)],
) -> ExportResponse | FileResponse:
    if payload.filePath:
        docx_path = _safe_generated_report_path(payload.filePath)
        if payload.format == "word":
            delivery = _add_export_delivery(store, payload.scope, payload.format, docx_path)
            return FileResponse(
                docx_path,
                media_type=DOCX_MIME,
                filename=delivery.fileName,
            )

        pdf_path = _convert_docx_to_pdf(docx_path)
        delivery = _add_export_delivery(store, payload.scope, payload.format, pdf_path)
        return FileResponse(
            pdf_path,
            media_type="application/pdf",
            filename=delivery.fileName,
        )

    delivery = store.export_report(payload.scope, payload.format)
    return ExportResponse(fileName=delivery.fileName, status="ready", delivery=delivery)


@router.post("/export-status", response_model=ExportStatusResponse)
def get_export_status(
    payload: ExportRequest,
    store: Annotated[Store, Depends(get_store)],
) -> ExportStatusResponse:
    if not payload.filePath:
        raise HTTPException(
            status_code=400,
            detail="filePath is required for generated report export status.",
        )

    docx_path = _safe_generated_report_path(payload.filePath)
    target_path = docx_path if payload.format == "word" else _pdf_path_for_docx(docx_path)
    delivery = _find_delivery(store, payload.scope, payload.format, target_path)
    file_exists = target_path.is_file()
    return ExportStatusResponse(
        format=payload.format,
        exists=file_exists and delivery is not None,
        fileName=_download_name(payload.scope, _export_format(payload.format)),
        filePath=str(target_path.resolve()) if file_exists else None,
        deliveryRecorded=delivery is not None,
    )


@router.post("/previews", response_model=ReportPreviewResponse)
def preview_report(
    payload: ReportPreviewRequest,
    store: Annotated[Store, Depends(get_store)],
) -> ReportPreviewResponse:
    file_name = store.register_report_preview(payload.scope, payload.sectionId)
    return ReportPreviewResponse(
        fileName=file_name,
        status="ready",
        delivery=store.report_deliveries[0],
    )


@router.post("/versions/rollback", response_model=RollbackResponse)
def rollback_report(
    payload: RollbackRequest,
    store: Annotated[Store, Depends(get_store)],
) -> RollbackResponse:
    version = store.rollback_report(payload.versionId, payload.label)
    return RollbackResponse(
        version=version,
        sections=store.snapshot(store.report_sections),
        versionEntry=store.report_versions[0],
    )


@router.post("/submit", response_model=SubmitReportResponse)
def submit_report(
    store: Annotated[Store, Depends(get_store)],
) -> SubmitReportResponse:
    store.submit_report()
    return SubmitReportResponse(ok=True, status="待审核")
