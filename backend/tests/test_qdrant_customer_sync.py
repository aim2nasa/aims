#!/usr/bin/env python3
"""
Qdrant customer_id 동기화 자동화 테스트
세 가지 시나리오:
1. 신규 연결
2. 관계 변경 (A→B)
3. 연결 해제
"""

import sys
import os
import requests
import time
from pymongo import MongoClient
from bson.objectid import ObjectId
from qdrant_client import QdrantClient

# 테스트 설정
MONGODB_URI = 'mongodb://localhost:27017/'
QDRANT_URL = 'http://localhost:6333'
API_BASE_URL = 'http://localhost:3010/api'
DB_NAME = 'docupload'
FILES_COLLECTION = 'files'
CUSTOMERS_COLLECTION = 'customers'
QDRANT_COLLECTION = 'docembed'

# 색상 출력
class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'

def log_success(msg):
    print(f"{Colors.GREEN}✅ {msg}{Colors.RESET}")

def log_error(msg):
    print(f"{Colors.RED}❌ {msg}{Colors.RESET}")

def log_info(msg):
    print(f"{Colors.BLUE}ℹ️  {msg}{Colors.RESET}")

def log_warning(msg):
    print(f"{Colors.YELLOW}⚠️  {msg}{Colors.RESET}")

class QdrantCustomerSyncTest:
    def __init__(self):
        self.mongo_client = MongoClient(MONGODB_URI)
        self.db = self.mongo_client[DB_NAME]
        self.qdrant_client = QdrantClient(url=QDRANT_URL)

        # 테스트용 ID들
        self.test_doc_id = None
        self.customer_a_id = None
        self.customer_b_id = None
        self.chunk_ids = []

    def setup(self):
        """테스트 환경 준비"""
        log_info("테스트 환경 준비 중...")

        # 1. 테스트용 문서 생성
        test_document = {
            'upload': {
                'originalName': 'test_document.pdf',
                'uploadedBy': 'test_user_123',
                'uploaded_at': '2025-01-14T00:00:00Z'
            },
            'meta': {
                'mime': 'application/pdf',
                'full_text': '이것은 테스트 문서입니다. ' * 50  # 충분한 길이의 텍스트
            },
            'ocr': {},
            'tags': []
        }

        result = self.db[FILES_COLLECTION].insert_one(test_document)
        self.test_doc_id = str(result.inserted_id)
        log_success(f"테스트 문서 생성: {self.test_doc_id}")

        # 2. 테스트용 고객 A, B 생성
        customer_a = {
            'personal_info': {'name': '테스트고객A'},
            'meta': {'created_at': '2025-01-14T00:00:00Z'},
            'documents': []
        }
        customer_b = {
            'personal_info': {'name': '테스트고객B'},
            'meta': {'created_at': '2025-01-14T00:00:00Z'},
            'documents': []
        }

        result_a = self.db[CUSTOMERS_COLLECTION].insert_one(customer_a)
        result_b = self.db[CUSTOMERS_COLLECTION].insert_one(customer_b)
        self.customer_a_id = str(result_a.inserted_id)
        self.customer_b_id = str(result_b.inserted_id)
        log_success(f"테스트 고객 A 생성: {self.customer_a_id}")
        log_success(f"테스트 고객 B 생성: {self.customer_b_id}")

        # 3. Qdrant에 임베딩 생성 (간단한 더미 벡터)
        log_info("Qdrant에 테스트 임베딩 생성 중...")
        import uuid
        from qdrant_client.models import PointStruct

        # 3개의 청크 생성
        points = []
        for i in range(3):
            chunk_id = f"{self.test_doc_id}_{i}"
            self.chunk_ids.append(chunk_id)

            point = PointStruct(
                id=str(uuid.uuid4()),
                vector=[0.1] * 1536,  # 더미 벡터
                payload={
                    'doc_id': self.test_doc_id,
                    'chunk_id': chunk_id,
                    'owner_id': 'test_user_123',
                    'original_name': 'test_document.pdf',
                    'preview': f'청크 {i} 내용...'
                }
            )
            points.append(point)

        self.qdrant_client.upsert(
            collection_name=QDRANT_COLLECTION,
            points=points
        )
        log_success(f"Qdrant에 {len(points)}개 청크 생성 완료")

    def verify_qdrant_customer_id(self, expected_customer_id=None):
        """Qdrant payload의 customer_id 확인"""
        scroll_result = self.qdrant_client.scroll(
            collection_name=QDRANT_COLLECTION,
            scroll_filter={
                'must': [
                    {'key': 'doc_id', 'match': {'value': self.test_doc_id}}
                ]
            },
            limit=100,
            with_payload=True,
            with_vector=False
        )

        points = scroll_result[0]

        if not points:
            log_error("Qdrant에서 청크를 찾을 수 없습니다")
            return False

        all_match = True
        for point in points:
            actual = point.payload.get('customer_id')

            if expected_customer_id is None:
                # customer_id가 없어야 함
                if 'customer_id' in point.payload:
                    log_error(f"청크 {point.payload.get('chunk_id')}: customer_id가 있으면 안됨 (실제: {actual})")
                    all_match = False
            else:
                # customer_id가 있어야 함
                if actual != expected_customer_id:
                    log_error(f"청크 {point.payload.get('chunk_id')}: customer_id 불일치 (예상: {expected_customer_id}, 실제: {actual})")
                    all_match = False

        return all_match

    def test_scenario_1_new_link(self):
        """시나리오 1: 신규 연결"""
        log_info("\n" + "="*60)
        log_info("시나리오 1: 신규 연결 테스트")
        log_info("="*60)

        # 1. 초기 상태 확인 (customer_id 없음)
        log_info("1. 초기 상태 확인 (customer_id 없어야 함)")
        if self.verify_qdrant_customer_id(expected_customer_id=None):
            log_success("초기 상태 확인 성공: customer_id 없음")
        else:
            log_error("초기 상태 확인 실패")
            return False

        # 2. API를 통해 고객 A에 문서 연결
        log_info(f"2. API 호출: 고객 A({self.customer_a_id})에 문서 연결")
        response = requests.post(
            f"{API_BASE_URL}/customers/{self.customer_a_id}/documents",
            json={
                'document_id': self.test_doc_id,
                'relationship_type': 'test',
                'notes': '테스트 연결'
            }
        )

        if response.status_code != 200:
            log_error(f"API 호출 실패: {response.status_code} - {response.text}")
            return False

        result = response.json()
        log_success(f"API 호출 성공: {result.get('message')}")
        log_info(f"Qdrant 동기화 결과: {result.get('qdrant_sync')}")

        # 3. Qdrant에서 customer_id 확인
        time.sleep(1)  # 동기화 대기
        log_info(f"3. Qdrant 확인 (customer_id={self.customer_a_id} 있어야 함)")
        if self.verify_qdrant_customer_id(expected_customer_id=self.customer_a_id):
            log_success("신규 연결 성공: customer_id 올바르게 설정됨")
            return True
        else:
            log_error("신규 연결 실패: customer_id 설정 안됨")
            return False

    def test_scenario_2_change_link(self):
        """시나리오 2: 관계 변경 (A → B)"""
        log_info("\n" + "="*60)
        log_info("시나리오 2: 관계 변경 (A → B) 테스트")
        log_info("="*60)

        # 1. 현재 상태 확인 (customer_id = A)
        log_info(f"1. 현재 상태 확인 (customer_id={self.customer_a_id} 있어야 함)")
        if not self.verify_qdrant_customer_id(expected_customer_id=self.customer_a_id):
            log_error("현재 상태 확인 실패")
            return False

        # 2. 고객 A에서 문서 연결 해제
        log_info(f"2. 고객 A에서 문서 연결 해제")
        response = requests.delete(
            f"{API_BASE_URL}/customers/{self.customer_a_id}/documents/{self.test_doc_id}"
        )

        if response.status_code != 200:
            log_error(f"연결 해제 실패: {response.status_code} - {response.text}")
            return False

        log_success("고객 A에서 연결 해제 성공")

        # 3. 고객 B에 문서 연결
        log_info(f"3. 고객 B({self.customer_b_id})에 문서 연결")
        response = requests.post(
            f"{API_BASE_URL}/customers/{self.customer_b_id}/documents",
            json={
                'document_id': self.test_doc_id,
                'relationship_type': 'test',
                'notes': '테스트 변경'
            }
        )

        if response.status_code != 200:
            log_error(f"API 호출 실패: {response.status_code} - {response.text}")
            return False

        result = response.json()
        log_success(f"API 호출 성공: {result.get('message')}")
        log_info(f"Qdrant 동기화 결과: {result.get('qdrant_sync')}")

        # 4. Qdrant에서 customer_id 확인
        time.sleep(1)  # 동기화 대기
        log_info(f"4. Qdrant 확인 (customer_id={self.customer_b_id} 있어야 함)")
        if self.verify_qdrant_customer_id(expected_customer_id=self.customer_b_id):
            log_success("관계 변경 성공: customer_id가 B로 업데이트됨")
            return True
        else:
            log_error("관계 변경 실패: customer_id 업데이트 안됨")
            return False

    def test_scenario_3_unlink(self):
        """시나리오 3: 연결 해제"""
        log_info("\n" + "="*60)
        log_info("시나리오 3: 연결 해제 테스트")
        log_info("="*60)

        # 1. 현재 상태 확인 (customer_id = B)
        log_info(f"1. 현재 상태 확인 (customer_id={self.customer_b_id} 있어야 함)")
        if not self.verify_qdrant_customer_id(expected_customer_id=self.customer_b_id):
            log_error("현재 상태 확인 실패")
            return False

        # 2. 고객 B에서 문서 연결 해제
        log_info(f"2. 고객 B에서 문서 연결 해제")
        response = requests.delete(
            f"{API_BASE_URL}/customers/{self.customer_b_id}/documents/{self.test_doc_id}"
        )

        if response.status_code != 200:
            log_error(f"연결 해제 실패: {response.status_code} - {response.text}")
            return False

        result = response.json()
        log_success(f"API 호출 성공: {result.get('message')}")
        log_info(f"Qdrant 동기화 결과: {result.get('qdrant_sync')}")

        # 3. Qdrant에서 customer_id 확인 (없어야 함)
        time.sleep(1)  # 동기화 대기
        log_info(f"3. Qdrant 확인 (customer_id 없어야 함)")
        if self.verify_qdrant_customer_id(expected_customer_id=None):
            log_success("연결 해제 성공: customer_id 제거됨")
            return True
        else:
            log_error("연결 해제 실패: customer_id 제거 안됨")
            return False

    def cleanup(self):
        """테스트 환경 정리"""
        log_info("\n테스트 환경 정리 중...")

        # MongoDB 정리
        if self.test_doc_id:
            self.db[FILES_COLLECTION].delete_one({'_id': ObjectId(self.test_doc_id)})
            log_success(f"테스트 문서 삭제: {self.test_doc_id}")

        if self.customer_a_id:
            self.db[CUSTOMERS_COLLECTION].delete_one({'_id': ObjectId(self.customer_a_id)})
            log_success(f"테스트 고객 A 삭제: {self.customer_a_id}")

        if self.customer_b_id:
            self.db[CUSTOMERS_COLLECTION].delete_one({'_id': ObjectId(self.customer_b_id)})
            log_success(f"테스트 고객 B 삭제: {self.customer_b_id}")

        # Qdrant 정리
        if self.test_doc_id:
            try:
                self.qdrant_client.delete(
                    collection_name=QDRANT_COLLECTION,
                    points_selector={
                        'filter': {
                            'must': [
                                {'key': 'doc_id', 'match': {'value': self.test_doc_id}}
                            ]
                        }
                    }
                )
                log_success(f"Qdrant 청크 삭제: {self.test_doc_id}")
            except Exception as e:
                log_warning(f"Qdrant 정리 오류: {e}")

    def run_all_tests(self):
        """모든 테스트 실행"""
        try:
            self.setup()

            results = {
                '신규 연결': self.test_scenario_1_new_link(),
                '관계 변경': self.test_scenario_2_change_link(),
                '연결 해제': self.test_scenario_3_unlink()
            }

            # 결과 요약
            log_info("\n" + "="*60)
            log_info("테스트 결과 요약")
            log_info("="*60)

            for name, passed in results.items():
                if passed:
                    log_success(f"{name}: 성공")
                else:
                    log_error(f"{name}: 실패")

            all_passed = all(results.values())

            if all_passed:
                log_success("\n🎉 모든 테스트 통과!")
                return 0
            else:
                log_error("\n❌ 일부 테스트 실패")
                return 1

        except Exception as e:
            log_error(f"테스트 실행 중 오류: {e}")
            import traceback
            traceback.print_exc()
            return 1
        finally:
            self.cleanup()

if __name__ == '__main__':
    test = QdrantCustomerSyncTest()
    exit_code = test.run_all_tests()
    sys.exit(exit_code)
