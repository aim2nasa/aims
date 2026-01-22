"""
중복 캡처 감지 모듈
perceptual hash를 사용하여 유사 이미지 감지
"""
from pathlib import Path
from typing import List, Optional

import imagehash
from PIL import Image


class DuplicateDetector:
    """이미지 중복 감지기"""

    def __init__(self, threshold: int = 5):
        """
        Args:
            threshold: 해시 차이 임계값 (낮을수록 엄격)
                      - 0: 완전 동일
                      - 5: 약간의 차이 허용 (기본값)
                      - 10: 상당한 차이 허용
        """
        self.threshold = threshold
        self.seen_hashes: List[imagehash.ImageHash] = []
        self.seen_paths: List[str] = []

    def _compute_hash(self, image_path: str) -> Optional[imagehash.ImageHash]:
        """
        이미지의 perceptual hash 계산

        Args:
            image_path: 이미지 파일 경로

        Returns:
            이미지 해시 또는 None
        """
        try:
            img = Image.open(image_path)
            return imagehash.phash(img)
        except Exception as e:
            print(f"[WARN] 해시 계산 실패: {image_path}, {e}")
            return None

    def is_duplicate(self, image_path: str) -> bool:
        """
        이미지가 이미 본 이미지와 중복인지 확인

        Args:
            image_path: 확인할 이미지 경로

        Returns:
            중복이면 True
        """
        current_hash = self._compute_hash(image_path)
        if current_hash is None:
            return False

        for seen_hash in self.seen_hashes:
            if current_hash - seen_hash < self.threshold:
                return True

        # 중복이 아니면 해시 저장
        self.seen_hashes.append(current_hash)
        self.seen_paths.append(image_path)
        return False

    def is_scroll_end(
        self,
        current_path: str,
        previous_path: Optional[str]
    ) -> bool:
        """
        스크롤 끝 도달 감지 (이전 이미지와 거의 동일하면 끝)

        Args:
            current_path: 현재 캡처 이미지 경로
            previous_path: 이전 캡처 이미지 경로

        Returns:
            스크롤 끝이면 True
        """
        if not previous_path:
            return False

        current_hash = self._compute_hash(current_path)
        previous_hash = self._compute_hash(previous_path)

        if current_hash is None or previous_hash is None:
            return False

        # 매우 유사하면 (차이 < 2) 스크롤 끝으로 판단
        # 스크롤이 제대로 되면 diff가 10 이상 나옴
        diff = current_hash - previous_hash
        print(f"[DEBUG] 이미지 해시 차이: {diff} (< 2 이면 스크롤 끝)")
        return diff < 2

    def get_hash_difference(
        self,
        path1: str,
        path2: str
    ) -> Optional[int]:
        """
        두 이미지의 해시 차이 계산

        Args:
            path1: 첫 번째 이미지 경로
            path2: 두 번째 이미지 경로

        Returns:
            해시 차이값 (0 = 동일, 클수록 다름)
        """
        hash1 = self._compute_hash(path1)
        hash2 = self._compute_hash(path2)

        if hash1 is None or hash2 is None:
            return None

        return hash1 - hash2

    def reset(self) -> None:
        """해시 기록 초기화"""
        self.seen_hashes.clear()
        self.seen_paths.clear()

    def get_unique_count(self) -> int:
        """저장된 고유 이미지 수 반환"""
        return len(self.seen_hashes)

    def find_similar(
        self,
        image_path: str,
        max_diff: int = None
    ) -> List[str]:
        """
        주어진 이미지와 유사한 기존 이미지들 찾기

        Args:
            image_path: 비교할 이미지 경로
            max_diff: 최대 허용 차이 (None이면 threshold 사용)

        Returns:
            유사한 이미지 경로 목록
        """
        threshold = max_diff if max_diff is not None else self.threshold
        current_hash = self._compute_hash(image_path)

        if current_hash is None:
            return []

        similar = []
        for i, seen_hash in enumerate(self.seen_hashes):
            if current_hash - seen_hash < threshold:
                similar.append(self.seen_paths[i])

        return similar
