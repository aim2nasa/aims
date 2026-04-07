"""
upload.fileSize / upload.mimeType SSoT 저장 regression 테스트 (#21)

큐잉 경로와 동기 경로 모두에서 upload 단계에 fileSize/mimeType이 저장되는지 검증.
메타 저장 실패 시에도 파일 크기/타입이 0B로 표시되지 않도록 하기 위함.
"""
import os


def _read_source():
    """doc_prep_main.py 소스 코드를 읽어 반환"""
    source_path = os.path.join(os.path.dirname(__file__), '..', 'routers', 'doc_prep_main.py')
    with open(source_path, 'r', encoding='utf-8') as f:
        return f.read()


class TestUploadFileSizeSSoT:
    """upload.fileSize/mimeType이 모든 경로에서 저장되는지 코드 레벨 검증"""

    def test_큐잉_doc_data에_fileSize_포함(self):
        """정상 큐잉 경로의 doc_data에 upload.fileSize가 있어야 함"""
        source = _read_source()
        # 정상 경로 doc_data 블록: "progressStage": "queued" 포함하는 블록에서 fileSize 확인
        queued_idx = source.find('"progressStage": "queued"')
        assert queued_idx > 0, "큐잉 경로 doc_data를 찾을 수 없음"
        # queued 근처 ±500자 범위에서 fileSize 확인
        block = source[max(0, queued_idx - 500):queued_idx + 200]
        assert '"fileSize": file_size' in block or "'fileSize': file_size" in block, \
            "큐잉 경로 doc_data에 upload.fileSize가 없음"

    def test_큐잉_doc_data에_mimeType_포함(self):
        """정상 큐잉 경로의 doc_data에 upload.mimeType이 있어야 함"""
        source = _read_source()
        queued_idx = source.find('"progressStage": "queued"')
        assert queued_idx > 0
        block = source[max(0, queued_idx - 500):queued_idx + 200]
        assert 'mimeType' in block, "큐잉 경로 doc_data에 upload.mimeType이 없음"

    def test_큐잉_update_file에_fileSize_포함(self):
        """큐잉 경로의 파일 저장 update_file에 upload.fileSize가 있어야 함"""
        source = _read_source()
        # "upload.saveName" 업데이트 블록에서 fileSize 확인
        save_name_idx = source.find('"upload.saveName": saved_name')
        assert save_name_idx > 0, "큐잉 경로 update_file을 찾을 수 없음"
        block = source[save_name_idx:save_name_idx + 300]
        assert '"upload.fileSize"' in block, \
            "큐잉 경로 update_file에 upload.fileSize가 없음"

    def test_동기_step_save_file에_fileSize_포함(self):
        """동기 경로 _step_save_file에 upload.fileSize가 있어야 함"""
        source = _read_source()
        step_idx = source.find('async def _step_save_file')
        assert step_idx > 0
        block = source[step_idx:step_idx + 1000]
        assert '"upload.fileSize"' in block or "'upload.fileSize'" in block, \
            "_step_save_file에 upload.fileSize가 없음"

    def test_credit_pending_경로에_fileSize_포함(self):
        """credit_pending 경로의 doc_data에 upload.fileSize가 있어야 함"""
        source = _read_source()
        credit_idx = source.find('"overallStatus": "credit_pending"')
        assert credit_idx > 0
        # credit_pending doc_data 블록에서 fileSize 확인 (nested dict: "fileSize": file_size)
        block = source[max(0, credit_idx - 600):credit_idx + 200]
        assert 'fileSize' in block, \
            "credit_pending 경로에 upload.fileSize가 없음"

    def test_api_응답에_fallback_체인(self):
        """aims_api documents-routes.js에 fileSize fallback 체인이 있어야 함"""
        routes_path = os.path.join(
            os.path.dirname(__file__), '..', '..', 'aims_api', 'routes', 'documents-routes.js'
        )
        with open(routes_path, 'r', encoding='utf-8') as f:
            source = f.read()
        assert 'doc.upload?.fileSize' in source, \
            "documents-routes.js에 upload.fileSize fallback이 없음"
        assert 'doc.upload?.mimeType' in source, \
            "documents-routes.js에 upload.mimeType fallback이 없음"
