from fastapi import FastAPI, HTTPException, Path, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient
from bson import ObjectId, json_util
from bson.errors import InvalidId
from typing import Optional, Dict, Any, List
from pydantic import BaseModel
from datetime import datetime
import os
import json
import asyncio
import threading
from concurrent.futures import ThreadPoolExecutor

app = FastAPI(title="Document Status API", version="1.0.0")

# CORS 미들웨어 추가
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 모든 도메인 허용 (개발용)
    # allow_origins=["http://localhost:3000"],  # 특정 도메인만 허용 (프로덕션용)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB 설정
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
DB_NAME = os.getenv("DB_NAME", "docupload")
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "files")

# MongoDB 클라이언트 초기화
client = MongoClient(MONGO_URI)
db = client[DB_NAME]
collection = db[COLLECTION_NAME]

# WebSocket 연결 관리
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.lock = threading.Lock()
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        with self.lock:
            self.active_connections.append(websocket)
        print(f"WebSocket connected. Total connections: {len(self.active_connections)}")
    
    def disconnect(self, websocket: WebSocket):
        with self.lock:
            if websocket in self.active_connections:
                self.active_connections.remove(websocket)
        print(f"WebSocket disconnected. Total connections: {len(self.active_connections)}")
    
    async def broadcast(self, message: dict):
        if not self.active_connections:
            return
            
        disconnected = []
        with self.lock:
            connections = self.active_connections.copy()
        
        for connection in connections:
            try:
                # WebSocket 상태 확인
                if connection.client_state.name != 'CONNECTED':
                    disconnected.append(connection)
                    continue
                    
                await connection.send_text(json.dumps(message))
            except Exception as e:
                print(f"Error sending message to WebSocket: {e}")
                disconnected.append(connection)
        
        # 연결이 끊어진 WebSocket 정리
        if disconnected:
            with self.lock:
                for conn in disconnected:
                    if conn in self.active_connections:
                        self.active_connections.remove(conn)
            print(f"Cleaned up {len(disconnected)} disconnected WebSocket(s). Active connections: {len(self.active_connections)}")

manager = ConnectionManager()

# MongoDB Change Stream 모니터링
def start_change_stream_monitor():
    """MongoDB Change Stream을 모니터링하는 백그라운드 스레드"""
    def monitor():
        try:
            # MongoDB가 replica set인지 확인
            server_status = db.command("serverStatus")
            replica_set = server_status.get("repl", {}).get("setName")
            
            if not replica_set:
                print("MongoDB is not running as replica set. Change Stream monitoring disabled.")
                print("WebSocket will still work for real-time connections, but automatic document updates won't be broadcasted.")
                return
            
            # Change Stream 설정 - 모든 변경사항 감지
            pipeline = [
                {
                    '$match': {
                        'operationType': {'$in': ['insert', 'update', 'replace']}
                    }
                }
            ]
            
            print("Starting MongoDB Change Stream monitor...")
            with collection.watch(pipeline) as stream:
                for change in stream:
                    try:
                        # 변경된 문서 정보 추출
                        operation_type = change['operationType']
                        document_id = str(change['documentKey']['_id'])
                        
                        print(f"Document changed: {document_id} ({operation_type})")
                        
                        # 변경된 문서의 현재 상태 조회
                        document = collection.find_one({"_id": ObjectId(document_id)})
                        if document:
                            overall_status, progress = get_overall_status(document)
                            
                            # WebSocket으로 브로드캐스트할 메시지
                            message = {
                                "type": "document_update",
                                "data": {
                                    "id": document_id,
                                    "status": overall_status,
                                    "progress": progress,
                                    "filename": document.get('upload', {}).get('originalName') or 
                                              document.get('originalName', 'Unknown File'),
                                    "uploaded_at": document.get('upload', {}).get('uploaded_at') or 
                                                  document.get('uploaded_at'),
                                    "operation_type": operation_type,
                                    "timestamp": datetime.utcnow().isoformat()
                                }
                            }
                            
                            # 비동기 브로드캐스트 실행
                            loop = asyncio.new_event_loop()
                            asyncio.set_event_loop(loop)
                            loop.run_until_complete(manager.broadcast(message))
                            loop.close()
                        
                    except Exception as e:
                        print(f"Error processing change event: {e}")
                        
        except Exception as e:
            print(f"Change stream error: {e}")
            # 에러 발생 시 5초 후 재시작
            threading.Timer(5.0, start_change_stream_monitor).start()
    
    # 백그라운드 스레드에서 실행
    thread = threading.Thread(target=monitor, daemon=True)
    thread.start()

# 앱 시작 시 Change Stream 모니터 시작
@app.on_event("startup")
async def startup_event():
    start_change_stream_monitor()

class DocumentStatus(BaseModel):
    """문서 상태 응답 모델"""
    id: str
    overall_status: str
    upload_status: str
    meta_status: str
    ocr_status: str
    embed_status: str
    progress_percentage: int
    stages: Dict[str, Any]
    created_at: Optional[str] = None
    last_updated: Optional[str] = None

def get_overall_status(doc: Dict) -> tuple[str, int]:
    """새로운 상태 코드 기준에 따른 전체 처리 상태와 진행률 계산"""
    
    # 기본 정보 추출
    upload_info = doc.get('upload', {})
    meta_info = doc.get('meta', {})
    ocr_info = doc.get('ocr', {})
    embed_info = doc.get('embed', {}) or doc.get('docembed', {})
    
    # [U] Upload 체크
    if not upload_info:
        return 'pending', 0
    
    # [M] Meta 체크  
    if not meta_info or meta_info.get('meta_status') != 'ok':
        return 'processing', 25  # Upload만 완료
    
    # Meta에서 full_text 확인
    full_text = meta_info.get('full_text')
    has_meaningful_text = full_text and full_text.strip()
    
    if has_meaningful_text:
        # [Mt] -> [Mts] -> [E] 경로
        summary = meta_info.get('summary')
        if not summary:
            return 'processing', 50  # Meta 완료, Summary 대기
            
        # [Mts] 완료, Embed 체크
        embed_status = embed_info.get('status')
        if embed_status == 'done':
            return 'completed', 100  # [U][Mts][E] 완료
        elif embed_status == 'failed':
            return 'error', 100     # [U][Mts][Ef] 완료 (실패)
        else:
            return 'processing', 75  # Embed 진행중
    else:
        # [Mx] full_text 비어있음 - MIME 타입 체크
        mime_type = meta_info.get('mime', '')
        
        # 지원하지 않는 MIME 타입들 (OCR 불가)
        unsupported_mimes = [
            'text/plain', 'text/csv', 'text/markdown',
            'application/json', 'application/xml',
            'audio/', 'video/', 'application/zip',
            'application/x-rar-compressed'
        ]
        
        is_unsupported = any(mime_type.startswith(unsupported) for unsupported in unsupported_mimes)
        
        if is_unsupported:
            return 'completed', 100  # [U][Mx] MIME 미지원으로 완료
        
        # OCR 지원 MIME - OCR 상태 체크
        ocr_status = ocr_info.get('status', 'pending')
        
        if ocr_status == 'pending':
            return 'processing', 50  # [U][Mx] OCR 대기
        elif ocr_status == 'queued':
            return 'processing', 60  # [U][Mx][Oq] OCR 큐 대기
        elif ocr_status == 'running':
            return 'processing', 70  # [U][Mx][Or] OCR 실행중
        elif ocr_status == 'error':
            return 'error', 100      # [U][Mx][Oe] OCR 오류로 완료
        elif ocr_status == 'done':
            # OCR 완료 - OCR 결과 텍스트 확인
            ocr_full_text = ocr_info.get('full_text')
            has_ocr_text = ocr_full_text and ocr_full_text.strip()
            
            if not has_ocr_text:
                return 'completed', 100  # [U][Mx][Ox] OCR 텍스트 없음으로 완료
            
            # [Ot] OCR 텍스트 존재 - Summary 체크
            ocr_summary = ocr_info.get('summary')
            if not ocr_summary:
                return 'processing', 80  # OCR Summary 대기
            
            # [Ots] OCR Summary 완료 - Embed 체크  
            embed_status = embed_info.get('status')
            if embed_status == 'done':
                return 'completed', 100  # [U][Mx][Ots][E] 완료
            elif embed_status == 'failed':
                return 'error', 100     # [U][Mx][Ots][Ef] 완료 (실패)
            else:
                return 'processing', 90  # Embed 진행중
        else:
            return 'processing', 50   # 기타 상태

def format_document_status(doc: Dict) -> DocumentStatus:
    """MongoDB 문서를 API 응답 형식으로 변환"""
    doc_id = str(doc['_id'])
    
    # 각 단계별 상태 추출
    upload_info = doc.get('upload', {})
    meta_info = doc.get('meta', {})
    ocr_info = doc.get('ocr', {})
    embed_info = doc.get('embed', {}) or doc.get('docembed', {})
    
    # 전체 상태 계산
    overall_status, progress = get_overall_status(doc)
    
    # 각 단계별 상태 문자열
    upload_status = 'completed' if upload_info else 'pending'
    meta_status = 'completed' if meta_info.get('meta_status') == 'ok' else ('error' if meta_info else 'pending')
    
    ocr_status = ocr_info.get('status', 'pending')
    if ocr_status == 'done':
        ocr_status = 'completed'
    
    embed_status = embed_info.get('status', 'pending')
    if embed_status == 'done':
        embed_status = 'completed'
    
    # 생성/수정 시간 추출
    created_at = upload_info.get('uploaded_at')
    last_updated = None
    
    # 마지막 업데이트 시간 찾기
    update_times = [
        upload_info.get('uploaded_at'),
        meta_info.get('created_at'),
        ocr_info.get('done_at') or ocr_info.get('failed_at') or ocr_info.get('started_at'),
        embed_info.get('updated_at')
    ]
    update_times = [t for t in update_times if t is not None]
    if update_times:
        last_updated = max(update_times)
    
    # 상세 단계 정보
    stages = {
        'upload': {
            'status': upload_status,
            'originalName': upload_info.get('originalName'),
            'saveName': upload_info.get('saveName'),
            'uploaded_at': upload_info.get('uploaded_at')
        },
        'meta': {
            'status': meta_status,
            'filename': meta_info.get('filename'),
            'mime': meta_info.get('mime'),
            'size_bytes': meta_info.get('size_bytes'),
            'pdf_pages': meta_info.get('pdf_pages'),
            'created_at': meta_info.get('created_at')
        },
        'ocr': {
            'status': ocr_status,
            'confidence': ocr_info.get('confidence'),
            'queued_at': ocr_info.get('queued_at'),
            'started_at': ocr_info.get('started_at'),
            'done_at': ocr_info.get('done_at'),
            'failed_at': ocr_info.get('failed_at'),
            'error_message': ocr_info.get('statusMessage')
        },
        'embed': {
            'status': embed_status,
            'dims': embed_info.get('dims'),
            'chunks': embed_info.get('chunks'),
            'updated_at': embed_info.get('updated_at'),
            'error_message': embed_info.get('error_message')
        }
    }
    
    return DocumentStatus(
        id=doc_id,
        overall_status=overall_status,
        upload_status=upload_status,
        meta_status=meta_status,
        ocr_status=ocr_status,
        embed_status=embed_status,
        progress_percentage=progress,
        stages=stages,
        created_at=created_at,
        last_updated=last_updated
    )

@app.get("/")
async def root():
    """API 기본 정보"""
    return {
        "message": "Document Status API",
        "version": "1.0.0",
        "endpoints": {
            "status": "/status/{document_id}",
            "document": "/document/{document_id}",
            "health": "/health"
        }
    }

@app.get("/health")
async def health_check():
    """헬스 체크"""
    try:
        # MongoDB 연결 테스트
        client.admin.command('ping')
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Database connection failed: {str(e)}")

@app.get("/status/{document_id}", response_model=DocumentStatus)
async def get_document_status(
    document_id: str = Path(..., description="Document ObjectId")
):
    """문서 ID로 처리 상태 조회"""
    try:
        # ObjectId 유효성 검사
        try:
            obj_id = ObjectId(document_id)
        except InvalidId:
            raise HTTPException(status_code=400, detail="Invalid document ID format")
        
        # MongoDB에서 문서 조회
        document = collection.find_one({"_id": obj_id})
        
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")
        
        # 상태 정보 포맷팅 후 반환
        return format_document_status(document)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.get("/status/{document_id}/simple")
async def get_simple_status(
    document_id: str = Path(..., description="Document ObjectId")
):
    """간단한 상태 정보만 반환"""
    try:
        obj_id = ObjectId(document_id)
        document = collection.find_one({"_id": obj_id})
        
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")
        
        overall_status, progress = get_overall_status(document)
        
        return {
            "id": document_id,
            "status": overall_status,
            "progress": progress,
            "filename": document.get('upload', {}).get('originalName') or document.get('originalName')
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@app.get("/document/{document_id}", response_model=Dict[str, Any])
async def get_full_document(
    document_id: str = Path(..., description="Document ObjectId")
):
    """문서 ID로 원본 MongoDB 문서를 조회합니다."""
    try:
        # ObjectId 유효성 검사
        try:
            obj_id = ObjectId(document_id)
        except InvalidId:
            raise HTTPException(status_code=400, detail="Invalid document ID format")
        
        # MongoDB에서 문서 조회
        document = collection.find_one({"_id": obj_id})
        
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")
        
        # BSON을 JSON으로 직렬화 가능한 dict로 변환
        # json_util.dumps가 BSON을 JSON 문자열로 만들고, json.loads가 이를 다시 Python dict로 변환
        return json.loads(json_util.dumps(document))
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@app.get("/status")
async def get_recent_documents(limit: int = 10):
    """최근 문서들의 상태 목록 조회"""
    try:
        documents = collection.find().sort("_id", -1).limit(limit)
        
        results = []
        for doc in documents:
            overall_status, progress = get_overall_status(doc)
            results.append({
                "id": str(doc['_id']),
                "status": overall_status,
                "progress": progress,
                "filename": doc.get('upload', {}).get('originalName') or doc.get('originalName'),
                "uploaded_at": doc.get('upload', {}).get('uploaded_at') or doc.get('uploaded_at')
            })
        
        return {"documents": results, "total": len(results)}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket 엔드포인트 - 실시간 문서 상태 업데이트"""
    await manager.connect(websocket)
    
    # 핑 타임아웃 방지를 위한 태스크
    ping_task = None
    update_task = None
    
    try:
        # 연결 즉시 현재 상태 전송 - 전체 문서 목록
        try:
            # 폴링 모드와 동일하게 1000개 문서까지 가져오기 (클라이언트에서 페이지네이션)
            documents = collection.find().sort("_id", -1).limit(1000)
            results = []
            for doc in documents:
                overall_status, progress = get_overall_status(doc)
                results.append({
                    "id": str(doc['_id']),
                    "status": overall_status,
                    "progress": progress,
                    "filename": doc.get('upload', {}).get('originalName') or doc.get('originalName', 'Unknown File'),
                    "uploaded_at": doc.get('upload', {}).get('uploaded_at') or doc.get('uploaded_at')
                })
            
            # 초기 데이터 전송
            await websocket.send_text(json.dumps({
                "type": "initial_data",
                "data": {
                    "documents": results,
                    "total": len(results),
                    "timestamp": datetime.utcnow().isoformat()
                }
            }))
            print(f"Sent initial data with {len(results)} documents")
            
            # 별도 태스크로 핑과 업데이트 체크 분리
            async def ping_task_func():
                while websocket.client_state.name == 'CONNECTED':
                    try:
                        await asyncio.sleep(15)  # 15초마다 핑 (더 자주)
                        if websocket.client_state.name == 'CONNECTED':
                            await websocket.send_text(json.dumps({
                                "type": "ping",
                                "timestamp": datetime.utcnow().isoformat()
                            }))
                    except Exception as e:
                        print(f"Ping error: {e}")
                        break
            
            async def update_task_func():
                last_check_time = datetime.utcnow()
                last_document_count = None  # 이전 문서 수 추적
                
                while websocket.client_state.name == 'CONNECTED':
                    try:
                        await asyncio.sleep(2)  # 2초마다 체크 (폴링보다 빠르게)
                        
                        if websocket.client_state.name != 'CONNECTED':
                            break
                            
                        current_time = datetime.utcnow()
                        
                        # 전체 문서 수 확인 (빠른 카운트)
                        total_documents = collection.count_documents({})
                        
                        # 데이터베이스가 비어있는 경우 처리
                        if total_documents == 0:
                            # 이전에 문서가 있었다면 빈 상태를 브로드캐스트
                            if last_document_count is None or last_document_count > 0:
                                empty_message = {
                                    "type": "database_empty",
                                    "data": {
                                        "documents": [],
                                        "total": 0,
                                        "timestamp": current_time.isoformat(),
                                        "message": "All documents have been deleted"
                                    }
                                }
                                
                                if websocket.client_state.name == 'CONNECTED':
                                    await manager.broadcast(empty_message)
                                    print("Broadcasted database empty state")
                            
                            last_document_count = 0
                            last_check_time = current_time
                            continue
                        
                        # 문서가 있는 경우 - 최근 문서들 체크
                        recent_docs = collection.find().sort("_id", -1).limit(10)
                        recent_docs_list = list(recent_docs)
                        
                        updates_found = 0
                        current_documents = []
                        
                        for doc in recent_docs_list:
                            try:
                                doc_id = str(doc['_id'])
                                overall_status, progress = get_overall_status(doc)
                                
                                doc_data = {
                                    "id": doc_id,
                                    "status": overall_status,
                                    "progress": progress,
                                    "filename": doc.get('upload', {}).get('originalName') or 
                                              doc.get('originalName', 'Unknown File'),
                                    "uploaded_at": doc.get('upload', {}).get('uploaded_at') or 
                                                  doc.get('uploaded_at')
                                }
                                current_documents.append(doc_data)
                                
                                update_message = {
                                    "type": "document_update",
                                    "data": {
                                        **doc_data,
                                        "operation_type": "update",
                                        "timestamp": current_time.isoformat()
                                    }
                                }
                                
                                if websocket.client_state.name == 'CONNECTED':
                                    await manager.broadcast(update_message)
                                    updates_found += 1
                                
                            except Exception as e:
                                print(f"Error processing document update: {e}")
                        
                        # 문서 수 변화가 있었다면 전체 상태 업데이트 브로드캐스트
                        if last_document_count is not None and last_document_count != total_documents:
                            # 전체 문서 목록 가져오기 (페이지네이션을 위해)
                            all_docs = collection.find().sort("_id", -1).limit(1000)
                            all_documents = []
                            for doc in all_docs:
                                overall_status, progress = get_overall_status(doc)
                                all_documents.append({
                                    "id": str(doc['_id']),
                                    "status": overall_status,
                                    "progress": progress,
                                    "filename": doc.get('upload', {}).get('originalName') or 
                                              doc.get('originalName', 'Unknown File'),
                                    "uploaded_at": doc.get('upload', {}).get('uploaded_at') or 
                                                  doc.get('uploaded_at')
                                })
                            
                            status_update_message = {
                                "type": "status_update", 
                                "data": {
                                    "documents": all_documents,
                                    "total": total_documents,
                                    "timestamp": current_time.isoformat(),
                                    "change": "document_count_changed",
                                    "previous_count": last_document_count,
                                    "current_count": total_documents
                                }
                            }
                            
                            if websocket.client_state.name == 'CONNECTED':
                                await manager.broadcast(status_update_message)
                                print(f"Broadcasted status update: {last_document_count} -> {total_documents} documents with full document list")
                        
                        if updates_found > 0:
                            print(f"Found and broadcasted {updates_found} document updates")
                        
                        last_document_count = total_documents
                        last_check_time = current_time
                        
                    except Exception as e:
                        print(f"Update task error: {e}")
                        break
            
            # 태스크 시작
            ping_task = asyncio.create_task(ping_task_func())
            update_task = asyncio.create_task(update_task_func())
            
            # 태스크가 완료될 때까지 대기
            await asyncio.gather(ping_task, update_task)
                
        except Exception as e:
            print(f"Error sending initial data: {e}")
            return
            
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"WebSocket error: {e}")
        manager.disconnect(websocket)
    finally:
        # 태스크 정리
        if ping_task and not ping_task.done():
            ping_task.cancel()
        if update_task and not update_task.done():
            update_task.cancel()
        manager.disconnect(websocket)

@app.get("/ws/stats")
async def websocket_stats():
    """WebSocket 연결 통계"""
    return {
        "active_connections": len(manager.active_connections),
        "timestamp": datetime.utcnow().isoformat()
    }


# ===== 문서 삭제 API =====

class DeleteDocumentsRequest(BaseModel):
    """문서 삭제 요청 모델"""
    document_ids: List[str]


class DeleteDocumentsResponse(BaseModel):
    """문서 삭제 응답 모델"""
    success: bool
    message: str
    deleted_count: int
    failed_count: int
    errors: List[Dict[str, str]] = []


@app.delete("/documents", response_model=DeleteDocumentsResponse)
async def delete_documents(request: DeleteDocumentsRequest):
    """
    문서 삭제 (DB + 물리적 파일 + 고객 참조)

    Args:
        request: 삭제할 문서 ID 리스트

    Returns:
        삭제 결과 (성공/실패 개수, 에러 목록)
    """
    import os

    if not request.document_ids:
        raise HTTPException(status_code=400, detail="삭제할 문서 ID가 필요합니다")

    deleted_count = 0
    failed_count = 0
    errors = []

    for doc_id in request.document_ids:
        try:
            # ObjectId 변환
            try:
                obj_id = ObjectId(doc_id)
            except InvalidId:
                errors.append({
                    "document_id": doc_id,
                    "error": "유효하지 않은 문서 ID 형식"
                })
                failed_count += 1
                continue

            # MongoDB에서 문서 조회
            document = collection.find_one({"_id": obj_id})

            if not document:
                errors.append({
                    "document_id": doc_id,
                    "error": "문서를 찾을 수 없습니다"
                })
                failed_count += 1
                continue

            # ========== 고객 참조 정리 추가 ==========
            # 문서 삭제 전에 이 문서를 참조하는 모든 고객의 documents 배열에서 제거
            try:
                customers_collection = db['customers']
                customers_update_result = customers_collection.update_many(
                    {"documents.document_id": obj_id},
                    {
                        "$pull": {"documents": {"document_id": obj_id}},
                        "$set": {"meta.updated_at": datetime.utcnow()}
                    }
                )
                if customers_update_result.modified_count > 0:
                    print(f"✅ 고객 참조 정리: {customers_update_result.modified_count}명의 고객에서 문서 참조 제거")
            except Exception as customer_error:
                print(f"⚠️ 고객 참조 정리 실패: {customer_error}")
                # 고객 참조 정리 실패해도 문서 삭제는 진행
            # ========================================

            # 물리적 파일 경로 추출
            upload_info = document.get('upload', {})
            dest_path = upload_info.get('destPath')

            # 물리적 파일 삭제
            if dest_path and os.path.exists(dest_path):
                try:
                    os.remove(dest_path)
                    print(f"✅ 파일 삭제 성공: {dest_path}")
                except Exception as e:
                    print(f"⚠️ 파일 삭제 실패: {dest_path} - {e}")
                    # 파일 삭제 실패해도 DB는 삭제 진행

            # MongoDB에서 문서 삭제
            result = collection.delete_one({"_id": obj_id})

            if result.deleted_count > 0:
                deleted_count += 1
                print(f"✅ DB 문서 삭제 성공: {doc_id}")

                # WebSocket으로 삭제 알림 브로드캐스트
                await manager.broadcast({
                    "type": "document_deleted",
                    "data": {
                        "id": doc_id,
                        "timestamp": datetime.utcnow().isoformat()
                    }
                })
            else:
                errors.append({
                    "document_id": doc_id,
                    "error": "DB 삭제 실패"
                })
                failed_count += 1

        except Exception as e:
            errors.append({
                "document_id": doc_id,
                "error": str(e)
            })
            failed_count += 1
            print(f"❌ 문서 삭제 중 오류: {doc_id} - {e}")

    # 응답 생성
    if deleted_count > 0:
        message = f"{deleted_count}건 삭제되었습니다"
        if failed_count > 0:
            message += f" ({failed_count}건 실패)"
    else:
        message = "삭제된 문서가 없습니다"

    return DeleteDocumentsResponse(
        success=deleted_count > 0,
        message=message,
        deleted_count=deleted_count,
        failed_count=failed_count,
        errors=errors
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
