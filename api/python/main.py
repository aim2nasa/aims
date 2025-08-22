from fastapi import FastAPI, HTTPException, Path
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient
from bson import ObjectId
from bson.errors import InvalidId
from typing import Optional, Dict, Any
from pydantic import BaseModel
from datetime import datetime
import os

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
    """전체 처리 상태와 진행률을 계산"""
    stages = {
        'upload': doc.get('upload') is not None,
        'meta': doc.get('meta') is not None,
        'ocr': doc.get('ocr', {}).get('status') == 'done',
        'embed': doc.get('embed', {}).get('status') == 'done' or doc.get('docembed', {}).get('status') == 'done'
    }
    
    completed_stages = sum(stages.values())
    total_stages = len(stages)
    progress = int((completed_stages / total_stages) * 100)
    
    # OCR나 임베딩이 실패한 경우
    ocr_status = doc.get('ocr', {}).get('status')
    embed_status = doc.get('embed', {}).get('status') or doc.get('docembed', {}).get('status')
    
    if ocr_status == 'error' or embed_status == 'failed':
        return 'error', progress
    elif ocr_status == 'running' or embed_status == 'processing':
        return 'processing', progress
    elif completed_stages == total_stages:
        return 'completed', 100
    elif completed_stages > 0:
        return 'processing', progress
    else:
        return 'pending', 0

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
            'queue': ocr_info.get('queue'),
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
