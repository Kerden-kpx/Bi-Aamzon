from __future__ import annotations

from dataclasses import dataclass
from typing import List, Set

from ..repositories import rbac_repo


ROLE_PRIORITY = ("admin", "team_lead", "operator")


@dataclass
class ScopeDecision:
    allow_all: bool = False
    team_userids: List[str] | None = None


def resolve_user_roles(userid: str, fallback_role: str) -> Set[str]:
    roles = rbac_repo.get_user_roles(userid)
    if roles:
        return roles
    fallback = (fallback_role or "operator").strip().lower() or "operator"
    return {fallback}


def pick_primary_role(roles: Set[str]) -> str:
    for role in ROLE_PRIORITY:
        if role in roles:
            return role
    return next(iter(roles), "operator")


def resolve_product_read_scope(userid: str, roles: Set[str], product_scope: str) -> ScopeDecision:
    if rbac_repo.has_scope_rule(userid, "product", "read", "all"):
        return ScopeDecision(allow_all=True)
    if "team_lead" in roles:
        if (product_scope or "").strip().lower() == "restricted":
            # Admin can explicitly configure restricted ASIN+site visibility for team leads.
            return ScopeDecision()
        return ScopeDecision(allow_all=True)

    if "admin" in roles:
        return ScopeDecision(allow_all=True)
    if (product_scope or "").strip().lower() == "restricted":
        return ScopeDecision()
    return ScopeDecision(allow_all=True)


def resolve_strategy_read_scope(userid: str, roles: Set[str]) -> ScopeDecision:
    if rbac_repo.has_scope_rule(userid, "strategy", "read", "all"):
        return ScopeDecision(allow_all=True)
    if rbac_repo.has_scope_rule(userid, "strategy", "read", "team"):
        return ScopeDecision(team_userids=rbac_repo.list_lead_team_member_userids(userid))
    if rbac_repo.has_scope_rule(userid, "strategy", "read", "self"):
        return ScopeDecision(team_userids=[userid])
    if "team_lead" in roles:
        return ScopeDecision(team_userids=rbac_repo.list_lead_team_member_userids(userid))

    if "admin" in roles:
        return ScopeDecision(allow_all=True)
    return ScopeDecision(team_userids=[userid])
