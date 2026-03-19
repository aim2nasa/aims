"""
Insurance Domain Adapter (Layer 3) — AIMS 보험 도메인 구현

DomainAdapter ABC를 상속하여 보험 도메인에 특화된 로직을 구현한다.
Phase 1: 스텁만. Phase 2에서 실제 로직 이동.
"""
from insurance.adapter import InsuranceDomainAdapter

__all__ = ["InsuranceDomainAdapter"]
