from fastapi.testclient import TestClient

from app.main import app


def test_system_and_auth_endpoints() -> None:
    client = TestClient(app)

    login_response = client.post(
        "/api/v1/auth/login",
        json={"username": "zhanggong", "password": "report-demo"},
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


def test_record_upload_and_field_update_endpoints() -> None:
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


def test_project_create_delete_and_restore_endpoints() -> None:
    client = TestClient(app)

    create_response = client.post(
        "/api/v1/projects",
        json={"name": "接口联调测试项目", "owner": "测试员", "type": "综合检测"},
    )
    project = create_response.json()
    delete_response = client.delete(f"/api/v1/projects/{project['id']}")
    deleted_response = client.get("/api/v1/projects/deleted")
    restore_response = client.post(f"/api/v1/projects/{project['id']}/restore", json={})
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
