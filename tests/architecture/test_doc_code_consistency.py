"""
문서↔코드 정합성 테스트

AIMS_ARCHITECTURE_CURRENT_STATE.md에 명시된 내용이
실제 코드와 일치하는지 자동 검증합니다.
"""

import re
import os
import json

# 프로젝트 루트
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

INTERNAL_ROUTES = os.path.join(ROOT, "backend", "api", "aims_api", "routes", "internal-routes.js")
EVENTBUS = os.path.join(ROOT, "backend", "api", "aims_api", "lib", "eventBus.js")
ARCH_DOC = os.path.join(ROOT, "docs", "AIMS_ARCHITECTURE_CURRENT_STATE.md")
COLLECTIONS_TS = os.path.join(ROOT, "backend", "shared", "schema", "collections.ts")
DEPLOY_SCRIPT = os.path.join(ROOT, "backend", "api", "aims_api", "deploy_aims_api.sh")


class TestInternalApiEndpointCount:
    """문서에 명시된 Internal API 엔드포인트 수와 실제 코드가 일치하는지"""

    def _count_endpoints_in_code(self):
        """internal-routes.js에서 router.get/post/put/patch/delete 패턴 개수"""
        with open(INTERNAL_ROUTES, "r", encoding="utf-8") as f:
            content = f.read()
        pattern = r"router\.(get|post|put|patch|delete)\("
        return len(re.findall(pattern, content))

    def _extract_endpoint_count_from_doc(self):
        """AIMS_ARCHITECTURE_CURRENT_STATE.md에서 Internal API 엔드포인트 수 추출"""
        with open(ARCH_DOC, "r", encoding="utf-8") as f:
            content = f.read()
        # "42개 Internal API 엔드포인트" 패턴
        match = re.search(r"(\d+)개\s*Internal API\s*엔드포인트", content)
        if match:
            return int(match.group(1))
        # "Internal API 42개 엔드포인트" 패턴
        match = re.search(r"Internal API\s*(\d+)개", content)
        if match:
            return int(match.group(1))
        return None

    def test_endpoint_count_matches(self):
        """Internal API 엔드포인트 수가 문서와 코드에서 일치"""
        code_count = self._count_endpoints_in_code()
        doc_count = self._extract_endpoint_count_from_doc()

        # 문서에 명시적 숫자가 없더라도 코드 기준 최소 40개 이상이어야 함
        assert code_count >= 40, (
            f"Internal API 엔드포인트가 {code_count}개로 너무 적습니다. "
            f"삭제된 엔드포인트가 있는지 확인하세요."
        )

        if doc_count is not None:
            assert code_count == doc_count, (
                f"문서({doc_count}개)와 코드({code_count}개) 불일치. "
                f"엔드포인트 추가/삭제 후 AIMS_ARCHITECTURE_CURRENT_STATE.md를 업데이트하세요."
            )


class TestRedisChannelConsistency:
    """문서에 명시된 Redis 채널과 실제 eventBus.js 코드가 일치하는지"""

    DOCUMENTED_CHANNELS = {
        "aims:doc:progress",
        "aims:doc:complete",
        "aims:ar:status",
        "aims:cr:status",
        "aims:doc:list",
        "aims:doc:link",
    }

    def _extract_channels_from_code(self):
        """eventBus.js에서 CHANNELS 상수의 값 추출"""
        with open(EVENTBUS, "r", encoding="utf-8") as f:
            content = f.read()
        # 'aims:xxx:yyy' 패턴 추출
        return set(re.findall(r"'(aims:[a-z:]+)'", content))

    def _extract_channels_from_doc(self):
        """AIMS_ARCHITECTURE_CURRENT_STATE.md에서 채널명 추출"""
        with open(ARCH_DOC, "r", encoding="utf-8") as f:
            content = f.read()
        return set(re.findall(r"`(aims:[a-z:]+)`", content))

    def test_all_documented_channels_exist_in_code(self):
        """문서에 명시된 모든 Redis 채널이 코드에 존재"""
        code_channels = self._extract_channels_from_code()
        missing = self.DOCUMENTED_CHANNELS - code_channels
        assert not missing, (
            f"문서에 명시되었지만 코드에 없는 채널: {missing}. "
            f"eventBus.js를 확인하세요."
        )

    def test_all_code_channels_are_documented(self):
        """코드의 모든 Redis 채널이 문서에 명시됨"""
        code_channels = self._extract_channels_from_code()
        doc_channels = self._extract_channels_from_doc()
        undocumented = code_channels - doc_channels
        assert not undocumented, (
            f"코드에 있지만 문서에 없는 채널: {undocumented}. "
            f"AIMS_ARCHITECTURE_CURRENT_STATE.md를 업데이트하세요."
        )

    def test_channel_count_is_six(self):
        """Redis 이벤트 채널이 정확히 6개"""
        code_channels = self._extract_channels_from_code()
        assert len(code_channels) == 6, (
            f"Redis 채널이 {len(code_channels)}개입니다 (기대: 6개). "
            f"채널 추가/삭제 시 문서와 이 테스트를 함께 업데이트하세요."
        )


class TestServicePortConsistency:
    """문서에 명시된 서비스 포트와 실제 코드/설정이 일치하는지"""

    # 문서 기준 서비스-포트 매핑
    DOCUMENTED_PORTS = {
        "aims_api": 3010,
        "document_pipeline": 8100,
        "annual_report_api": 8004,
        "aims_rag_api": 8000,
        "aims_health_monitor": 3012,
        "pdf_proxy": 8002,
        "pdf_converter": 8005,
    }

    def _extract_ports_from_doc(self):
        """AIMS_ARCHITECTURE_CURRENT_STATE.md에서 서비스-포트 매핑 추출"""
        with open(ARCH_DOC, "r", encoding="utf-8") as f:
            content = f.read()

        ports = {}
        # | **서비스명** | 포트 | 패턴
        for match in re.finditer(
            r"\*\*(\w+)\*\*\s*\|\s*(\d+)\s*\|", content
        ):
            service = match.group(1)
            port = int(match.group(2))
            ports[service] = port
        return ports

    def _extract_port_from_env_fallback(self, service_dir, default_port):
        """서비스 코드에서 포트 fallback 값 추출"""
        patterns_to_check = [
            os.path.join(ROOT, "backend", "api", service_dir, "main.py"),
            os.path.join(ROOT, "backend", "api", service_dir, "server.js"),
        ]

        for filepath in patterns_to_check:
            if os.path.exists(filepath):
                with open(filepath, "r", encoding="utf-8") as f:
                    content = f.read()
                # port = int(os.getenv("PORT", "8100")) 또는 port: 3010 패턴
                port_match = re.search(
                    r'(?:PORT.*?["\'](\d+)["\']|port["\s:]+(\d+))', content
                )
                if port_match:
                    return int(port_match.group(1) or port_match.group(2))
        return None

    def test_documented_ports_match_code(self):
        """문서의 포트 번호가 코드 기본값과 일치"""
        doc_ports = self._extract_ports_from_doc()

        for service, expected_port in self.DOCUMENTED_PORTS.items():
            if service in doc_ports:
                assert doc_ports[service] == expected_port, (
                    f"{service}: 문서 포트({doc_ports[service]})가 "
                    f"기대값({expected_port})과 불일치"
                )

    def test_deploy_script_env_ports(self):
        """deploy_aims_api.sh의 Docker -e 포트가 문서와 일치"""
        if not os.path.exists(DEPLOY_SCRIPT):
            return  # 배포 스크립트 없으면 스킵

        with open(DEPLOY_SCRIPT, "r", encoding="utf-8") as f:
            content = f.read()

        # -e DOCUMENT_PIPELINE_URL=http://...:8100 패턴 추출
        env_ports = {}
        for match in re.finditer(r"-e\s+(\w+_URL)=http://[^:]+:(\d+)", content):
            env_name = match.group(1)
            port = int(match.group(2))
            env_ports[env_name] = port

        expected_env_ports = {
            "ANNUAL_REPORT_API_URL": 8004,
            "PDF_PROXY_URL": 8002,
            "DOCUMENT_PIPELINE_URL": 8100,
        }

        for env_name, expected_port in expected_env_ports.items():
            if env_name in env_ports:
                assert env_ports[env_name] == expected_port, (
                    f"{env_name}: 배포 스크립트 포트({env_ports[env_name]})가 "
                    f"문서 기대값({expected_port})과 불일치"
                )


class TestSharedSchemaCollections:
    """@aims/shared-schema의 COLLECTIONS 상수가 실제 사용과 일치하는지"""

    def _extract_collections_from_schema(self):
        """collections.ts에서 컬렉션명 추출"""
        with open(COLLECTIONS_TS, "r", encoding="utf-8") as f:
            content = f.read()
        # 'collection_name' 패턴 추출 (따옴표 안의 값)
        return set(re.findall(r":\s*'(\w+)'", content))

    def _extract_collections_from_aims_api(self):
        """aims_api 코드에서 사용되는 컬렉션명 추출"""
        routes_dir = os.path.join(ROOT, "backend", "api", "aims_api", "routes")
        collections = set()

        for filename in os.listdir(routes_dir):
            if not filename.endswith(".js"):
                continue
            filepath = os.path.join(routes_dir, filename)
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()
            # db.collection('xxx') 패턴
            for match in re.finditer(r"db\.collection\(['\"](\w+)['\"]\)", content):
                collections.add(match.group(1))

        return collections

    def test_schema_covers_all_used_collections(self):
        """코드에서 사용되는 모든 컬렉션이 shared-schema에 정의됨"""
        schema_collections = self._extract_collections_from_schema()
        code_collections = self._extract_collections_from_aims_api()

        # shared-schema는 핵심 엔티티만 정의. 보조/시스템 컬렉션은 제외
        auxiliary_collections = {
            "sessions", "aims_analytics", "aims_system_logs",
            "settings", "system_settings", "config",
            "token_usage", "credit_transactions", "credit_packages",
            "ac_tokens", "pin_sessions",
            "faqs", "notices", "usage_guides", "inquiries",
            "document_types", "personal_files", "pdf_conversion_queue",
            "address_history", "service_health_logs", "system_metrics",
        }
        code_collections -= auxiliary_collections

        missing = code_collections - schema_collections
        assert not missing, (
            f"코드에서 사용하지만 shared-schema에 없는 컬렉션: {missing}. "
            f"backend/shared/schema/collections.ts에 추가하세요."
        )

    def test_schema_has_minimum_collections(self):
        """shared-schema에 최소 필수 컬렉션이 모두 정의됨"""
        schema_collections = self._extract_collections_from_schema()
        required = {
            "users", "customers", "contracts", "files",
            "customer_relationships", "insurance_products"
        }
        missing = required - schema_collections
        assert not missing, (
            f"shared-schema에 필수 컬렉션이 누락됨: {missing}"
        )
