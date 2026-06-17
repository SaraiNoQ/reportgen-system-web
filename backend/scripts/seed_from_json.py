"""Seed PostgreSQL from data/*.json files — idempotent, truncates first."""
from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import MetaData, Table, create_engine, text

from app.core.config import settings
from app.core.security import hash_password

DATA_DIR = Path(__file__).resolve().parents[2] / "data"

TRUNCATE_TABLES = [
    "report_deliveries", "report_section_meta", "report_versions",
    "report_sections", "rule_template_versions", "rule_fields",
    "rule_templates", "extracted_fields", "parse_events", "parse_timeline",
    "raw_files", "deleted_projects", "user_preferences", "system_messages",
    "operation_logs", "project_metrics", "projects", "users",
]


def load_json(name: str):
    path = DATA_DIR / f"{name}.json"
    if not path.exists():
        print(f"  SKIP {name}.json (not found)")
        return [] if name in {"report_section_meta", "fields_by_file", "parse_events_by_file"} else {}
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def main() -> None:
    engine = create_engine(settings.database_url)
    metadata = MetaData()
    metadata.reflect(bind=engine)

    # Load all JSON
    users_data = load_json("users")
    projects_data = load_json("projects")
    raw_files_data = load_json("raw_files")
    parse_timeline_data = load_json("parse_timeline")
    parse_events_by_file = load_json("parse_events_by_file")
    extracted_fields_data = load_json("extracted_fields")
    fields_by_file = load_json("fields_by_file")
    rule_templates_data = load_json("rule_templates")
    rule_template_versions_data = load_json("rule_template_versions")
    report_sections_data = load_json("report_sections")
    report_section_meta_data = load_json("report_section_meta")
    report_versions_data = load_json("report_versions")
    report_deliveries_data = load_json("report_deliveries")
    user_preferences_data = load_json("user_preferences")
    messages_data = load_json("messages")
    operation_logs_data = load_json("operation_logs")
    deleted_projects_data = load_json("deleted_projects")
    project_metrics_data = load_json("project_metrics")

    # Name → id lookup
    name_to_id: dict[str, str] = {u["name"]: u["id"] for u in users_data}
    print(f"  Built name→id map for {len(name_to_id)} users")

    def actor_id(name: str) -> str | None:
        return name_to_id.get(name)

    with engine.begin() as conn:
        # 1. Truncate all tables
        for t in TRUNCATE_TABLES:
            conn.execute(text(f"TRUNCATE TABLE {t} RESTART IDENTITY CASCADE"))

        # 2. Insert users
        table = Table("users", metadata, autoload_with=engine)
        users_rows = []
        for u in users_data:
            users_rows.append({
                "id": u["id"], "name": u["name"], "role": u["role"],
                "department": u["department"], "status": u.get("status", "启用"),
                "last_login": u.get("lastLogin"),
                "password_hash": u.get("password_hash") or hash_password("password123"),
            })
        if users_rows:
            conn.execute(table.insert(), users_rows)
        print(f"  Seeded {len(users_rows)} rows into users")

        # 3. project_metrics
        table = Table("project_metrics", metadata, autoload_with=engine)
        if project_metrics_data:
            conn.execute(table.insert(), project_metrics_data)
        print(f"  Seeded {len(project_metrics_data)} rows into project_metrics")

        # 4. projects
        table = Table("projects", metadata, autoload_with=engine)
        proj_rows = []
        for p in projects_data:
            owner = p.get("owner", "")
            proj_rows.append({
                "id": p["id"], "name": p["name"], "code": p["code"],
                "type": p.get("type", ""), "owner": owner,
                "owner_id": actor_id(owner), "status": p.get("status", "待上传"),
                "progress": p.get("progress", 0),
            })
        if proj_rows:
            conn.execute(table.insert(), proj_rows)
        print(f"  Seeded {len(proj_rows)} rows into projects")

        # 5. raw_files
        table = Table("raw_files", metadata, autoload_with=engine)
        rf_rows = []
        for f in raw_files_data:
            rf_rows.append({
                "id": f["id"], "project_id": None, "name": f["name"],
                "type": f.get("type", ""), "size": f.get("size", ""),
                "uploaded_at": f.get("uploadedAt"),
                "parse_status": f.get("parseStatus", "解析中"),
                "detected_type": f.get("detectedType", "未识别"),
                "type_confirmed": f.get("typeConfirmed", False),
            })
        if rf_rows:
            conn.execute(table.insert(), rf_rows)
        print(f"  Seeded {len(rf_rows)} rows into raw_files")

        # 6. parse_timeline
        table = Table("parse_timeline", metadata, autoload_with=engine)
        pt_rows = []
        for i, ev in enumerate(parse_timeline_data):
            pt_rows.append({"time": ev["time"], "label": ev["label"], "state": ev["state"], "sort_order": i})
        if pt_rows:
            conn.execute(table.insert(), pt_rows)
        print(f"  Seeded {len(pt_rows)} rows into parse_timeline")

        # 7. parse_events (from dict-of-list)
        table = Table("parse_events", metadata, autoload_with=engine)
        pe_rows = []
        for file_id, events in parse_events_by_file.items():
            for i, ev in enumerate(events):
                pe_rows.append({"file_id": file_id, "time": ev["time"], "label": ev["label"], "state": ev["state"], "sort_order": i})
        if pe_rows:
            conn.execute(table.insert(), pe_rows)
        print(f"  Seeded {len(pe_rows)} rows into parse_events")

        # 8. extracted_fields (base + by-file)
        table = Table("extracted_fields", metadata, autoload_with=engine)
        ef_rows = []
        for ef in extracted_fields_data:
            ef_rows.append({"id": ef["id"], "file_id": None, "name": ef["name"], "value": ef["value"], "confidence": ef["confidence"], "is_base": True})
        for file_id, fields in fields_by_file.items():
            for ef in fields:
                ef_rows.append({"id": ef["id"], "file_id": file_id, "name": ef["name"], "value": ef["value"], "confidence": ef["confidence"], "is_base": False})
        if ef_rows:
            conn.execute(table.insert(), ef_rows)
        print(f"  Seeded {len(ef_rows)} rows into extracted_fields")

        # 9. rule_templates
        table = Table("rule_templates", metadata, autoload_with=engine)
        rt_rows = []
        rf_rows_all = []
        for rt in rule_templates_data:
            rt_rows.append({"id": rt["id"], "category": rt["category"], "name": rt["name"], "version": rt["version"]})
            for i, field in enumerate(rt.get("fields", [])):
                rf_rows_all.append({
                    "id": field["id"], "template_id": rt["id"], "name": field["name"],
                    "code": field["code"], "type": field["type"], "required": field["required"],
                    "source": field["source"], "format": field.get("format", ""),
                    "validation": field.get("validation", ""), "example": field.get("example", ""),
                    "sort_order": i,
                })
        if rt_rows:
            conn.execute(table.insert(), rt_rows)
        print(f"  Seeded {len(rt_rows)} rows into rule_templates")

        # 10. rule_fields
        table = Table("rule_fields", metadata, autoload_with=engine)
        if rf_rows_all:
            conn.execute(table.insert(), rf_rows_all)
        print(f"  Seeded {len(rf_rows_all)} rows into rule_fields")

        # 11. rule_template_versions
        table = Table("rule_template_versions", metadata, autoload_with=engine)
        rtv_rows = []
        for v in rule_template_versions_data:
            rtv_rows.append({
                "id": v["id"], "template_id": v.get("templateId"), "version": v["version"],
                "label": v["label"], "status": v["status"], "actor": v.get("actor", ""),
                "actor_id": actor_id(v.get("actor", "")), "created_at": v.get("createdAt"),
            })
        if rtv_rows:
            conn.execute(table.insert(), rtv_rows)
        print(f"  Seeded {len(rtv_rows)} rows into rule_template_versions")

        # 12. report_sections
        table = Table("report_sections", metadata, autoload_with=engine)
        rs_rows = []
        for i, s in enumerate(report_sections_data):
            rs_rows.append({"id": s["id"], "project_id": None, "title": s["title"], "content": s["content"], "status": s["status"], "sort_order": i})
        if rs_rows:
            conn.execute(table.insert(), rs_rows)
        print(f"  Seeded {len(rs_rows)} rows into report_sections")

        # 13. report_section_meta (from dict)
        table = Table("report_section_meta", metadata, autoload_with=engine)
        rsm_rows = []
        for section_id, meta in report_section_meta_data.items():
            rsm_rows.append({"section_id": section_id, "category_id": meta.get("categoryId", ""), "revision_name": meta.get("revisionName")})
        if rsm_rows:
            conn.execute(table.insert(), rsm_rows)
        print(f"  Seeded {len(rsm_rows)} rows into report_section_meta")

        # 14. report_versions
        table = Table("report_versions", metadata, autoload_with=engine)
        rv_rows = []
        for v in report_versions_data:
            rv_rows.append({
                "id": v["id"], "project_id": None, "label": v["label"],
                "actor": v.get("actor", ""), "actor_id": actor_id(v.get("actor", "")),
                "kind": v["kind"], "created_at": v.get("createdAt"),
            })
        if rv_rows:
            conn.execute(table.insert(), rv_rows)
        print(f"  Seeded {len(rv_rows)} rows into report_versions")

        # 15. report_deliveries
        table = Table("report_deliveries", metadata, autoload_with=engine)
        rd_rows = []
        for d in report_deliveries_data:
            rd_rows.append({
                "id": d["id"], "project_id": None, "kind": d["kind"], "scope": d["scope"],
                "file_name": d.get("fileName", ""), "format": d["format"], "status": d["status"],
                "section_id": d.get("sectionId"), "actor_id": None, "created_at": d.get("createdAt"),
            })
        if rd_rows:
            conn.execute(table.insert(), rd_rows)
        print(f"  Seeded {len(rd_rows)} rows into report_deliveries")

        # 16. user_preferences
        table = Table("user_preferences", metadata, autoload_with=engine)
        up_rows = []
        for up in user_preferences_data:
            up_rows.append({"user_id": up.get("userId"), "current_project_id": up.get("currentProjectId")})
        if up_rows:
            conn.execute(table.insert(), up_rows)
        print(f"  Seeded {len(up_rows)} rows into user_preferences")

        # 17. system_messages
        table = Table("system_messages", metadata, autoload_with=engine)
        sm_rows = []
        for m in messages_data:
            sm_rows.append({
                "id": m["id"], "title": m["title"], "content": m["content"],
                "module": m["module"], "type": m["type"], "read": m.get("read", False),
                "time": m["time"], "project_id": m.get("projectId"), "user_id": None,
            })
        if sm_rows:
            conn.execute(table.insert(), sm_rows)
        print(f"  Seeded {len(sm_rows)} rows into system_messages")

        # 18. operation_logs
        table = Table("operation_logs", metadata, autoload_with=engine)
        ol_rows = []
        for ol in operation_logs_data:
            ol_rows.append({
                "id": ol["id"], "module": ol["module"], "actor": ol.get("actor", ""),
                "actor_id": actor_id(ol.get("actor", "")), "action": ol["action"],
                "result": ol["result"], "time": ol["time"], "project_id": None, "detail": None,
            })
        if ol_rows:
            conn.execute(table.insert(), ol_rows)
        print(f"  Seeded {len(ol_rows)} rows into operation_logs")

        # 19. deleted_projects
        table = Table("deleted_projects", metadata, autoload_with=engine)
        dp_rows = []
        for dp in deleted_projects_data:
            project = dp.get("project", {})
            a = dp.get("actor", "")
            dp_rows.append({
                "id": dp.get("id", f"del-{project.get('id', 'unknown')}"),
                "project_id": project.get("id"),
                "project_data": project,
                "deleted_at": dp.get("deletedAt"),
                "actor": a,
                "actor_id": actor_id(a),
                "log_id": dp.get("logId"),
            })
        if dp_rows:
            conn.execute(table.insert(), dp_rows)
        print(f"  Seeded {len(dp_rows)} rows into deleted_projects")

    # Verify row counts
    print()
    with engine.connect() as conn:
        for t in TRUNCATE_TABLES:
            count = conn.execute(text(f"SELECT count(*) FROM {t}")).scalar()
            print(f"  {t:30s} {count} rows")
    print("\nSeed complete.")


if __name__ == "__main__":
    main()
