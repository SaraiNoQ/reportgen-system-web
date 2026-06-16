from fastapi import APIRouter, HTTPException

from app.schemas.domain import (
    CreateRuleTemplateRequest,
    RuleTemplate,
    RuleVersionsResponse,
    SaveRuleRequest,
    SaveRuleResponse,
    UpdateRuleFieldRequest,
    UpdateRuleTemplateRequest,
)
from app.services.mock_store import store

router = APIRouter(prefix="/rules", tags=["rules"])


@router.get("/templates", response_model=list[RuleTemplate])
def list_rule_templates() -> list[RuleTemplate]:
    return store.snapshot(store.rule_templates)


@router.post("/templates", response_model=RuleTemplate)
def create_rule_template(payload: CreateRuleTemplateRequest) -> RuleTemplate:
    return store.create_rule_template(payload)


@router.post("/templates/{template_id}/copy", response_model=RuleTemplate)
def copy_rule_template(template_id: str) -> RuleTemplate:
    template = store.copy_rule_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="rule template not found")
    return template


@router.patch("/templates/{template_id}", response_model=RuleTemplate)
def update_rule_template(template_id: str, payload: UpdateRuleTemplateRequest) -> RuleTemplate:
    template = store.update_rule_template(template_id, payload)
    if not template:
        raise HTTPException(status_code=404, detail="rule template not found")
    return template


@router.get("/templates/{template_id}/versions", response_model=RuleVersionsResponse)
def list_rule_template_versions(template_id: str) -> RuleVersionsResponse:
    if not any(template.id == template_id for template in store.rule_templates):
        raise HTTPException(status_code=404, detail="rule template not found")
    return RuleVersionsResponse(versions=store.snapshot(store.get_rule_versions(template_id)))


@router.patch("/templates/{template_id}/fields/{field_id}", response_model=RuleTemplate)
def update_rule_field(
    template_id: str,
    field_id: str,
    payload: UpdateRuleFieldRequest,
) -> RuleTemplate:
    template = store.update_rule_field(template_id, field_id, payload)
    if not template:
        raise HTTPException(status_code=404, detail="rule template or field not found")
    return template


@router.post("/save", response_model=SaveRuleResponse)
def save_rule(payload: SaveRuleRequest) -> SaveRuleResponse:
    message, template = store.save_rule(payload)
    if not template:
        raise HTTPException(status_code=404, detail=message)
    return SaveRuleResponse(
        ok=True,
        message=message,
        version=template.version,
        template=template,
    )
