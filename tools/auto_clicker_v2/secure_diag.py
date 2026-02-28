# -*- coding: utf-8 -*-
"""
PROD 모드 암호화 진단 writer (Jython/javax.crypto)

PROD 실행 시 dev/ 폴더 대신 단일 .acdump 파일에
모든 진단 데이터를 AES-256-CBC로 암호화하여 실시간 append.

바이너리 포맷:
  [HEADER]  "ACDUMP01" (8 bytes)
  [ENTRY]   [type:1][iv:16][payload_len:4][encrypted_payload:N]
  ...

encrypted_payload 복호화 → [name_len:2][name:UTF-8][data:나머지]

사용:
  writer = DiagWriter(filepath, key_hex)
  writer.write_log(u"로그 메시지")
  writer.write_image(u"error_001.png", "/tmp/screenshot.png")
  writer.write_json(u"checkpoint.json", json_string)
  writer.delete()  # 정상 종료 시

복호화: acdump_reader.py 참조
"""

from javax.crypto import Cipher
from javax.crypto.spec import SecretKeySpec, IvParameterSpec
from java.security import SecureRandom
from java.io import DataInputStream, FileOutputStream, FileInputStream, File

import jarray
import struct
import os

# 엔트리 타입 상수
TYPE_SYSTEM_INFO = 0x01
TYPE_LOG = 0x02
TYPE_IMAGE = 0x03
TYPE_JSON = 0x04

_MAGIC = "ACDUMP01"


def _hex_to_signed_bytes(hex_str):
    """64자 hex 문자열 → Jython signed byte array (AES-256 키)"""
    result = []
    for i in range(0, len(hex_str), 2):
        val = int(hex_str[i:i + 2], 16)
        if val > 127:
            val -= 256  # Java signed byte (-128~127)
        result.append(val)
    return jarray.array(result, 'b')


class DiagWriter:
    """단일 .acdump 파일에 암호화 엔트리를 append하는 writer.

    각 엔트리는 독립적으로 AES-256-CBC 암호화되어 있으므로,
    크래시로 파일이 불완전해도 마지막 엔트리 이전까지는 복호화 가능.
    """

    def __init__(self, filepath, key_hex):
        """
        Args:
            filepath: .acdump 파일 경로
            key_hex: AES-256 키 (64자 hex 문자열, 처음 32바이트 사용)
        """
        self._filepath = filepath
        self._key = SecretKeySpec(_hex_to_signed_bytes(key_hex[:64]), "AES")
        self._random = SecureRandom()
        self._closed = False

        # 파일 생성 + 매직 헤더 쓰기
        self._fos = FileOutputStream(filepath, False)
        magic_bytes = jarray.array([ord(c) for c in _MAGIC], 'b')
        self._fos.write(magic_bytes)
        self._fos.flush()

        # Windows 숨김 속성 설정 (탐색기에서 기본 안 보임)
        try:
            os.system('attrib +h "%s"' % filepath)
        except:
            pass

    def write_entry(self, entry_type, name, data):
        """암호화 엔트리 추가.

        파일 포맷: [type:1][iv:16][payload_len:4][encrypted_payload:N]
        payload 내부: [name_len:2][name:UTF-8][data]

        Args:
            entry_type: 엔트리 타입 (TYPE_LOG, TYPE_IMAGE 등)
            name: 엔트리 이름 (unicode 또는 str)
            data: 페이로드 데이터 (unicode, str, 또는 bytes)
        """
        if self._closed:
            return

        try:
            # name → bytes
            if isinstance(name, unicode):
                name_bytes = bytearray(name.encode('utf-8'))
            else:
                name_bytes = bytearray(name)

            # data → bytes
            if isinstance(data, unicode):
                data_bytes = bytearray(data.encode('utf-8'))
            elif isinstance(data, str):
                data_bytes = bytearray(data)
            else:
                data_bytes = bytearray(data)

            # payload = [name_len:2][name][data]
            name_len = struct.pack('>H', len(name_bytes))
            payload = bytearray(name_len) + name_bytes + data_bytes

            # 랜덤 IV 생성 (인스턴스 재사용)
            iv = jarray.zeros(16, 'b')
            self._random.nextBytes(iv)

            # AES-256-CBC 암호화
            cipher = Cipher.getInstance("AES/CBC/PKCS5Padding")
            cipher.init(Cipher.ENCRYPT_MODE, self._key, IvParameterSpec(iv))
            payload_jarr = jarray.array(list(payload), 'b')
            encrypted = cipher.doFinal(payload_jarr)

            # 파일에 쓰기: [type:1][iv:16][len:4][encrypted:N]
            self._fos.write(entry_type)
            self._fos.write(iv)
            enc_len = struct.pack('>I', len(encrypted))
            self._fos.write(jarray.array([ord(c) for c in enc_len], 'b'))
            self._fos.write(encrypted)
            self._fos.flush()
        except Exception as e:
            # 암호화/쓰기 실패해도 실행 중단하지 않음
            try:
                print("[DIAG] write_entry failed: %s" % str(e))
            except:
                pass

    def write_log(self, text):
        """로그 텍스트를 암호화하여 append.

        Args:
            text: 로그 메시지 (unicode 또는 str)
        """
        self.write_entry(TYPE_LOG, u"log", text)

    def write_image(self, name, image_file_path):
        """이미지 파일을 읽어서 암호화 저장.

        SikuliX capture()가 반환한 temp 파일을 읽고 암호화.

        Args:
            name: 원본 파일명 (e.g., "CRASH_FATAL_20260228.png")
            image_file_path: 이미지 파일 경로
        """
        if self._closed:
            return
        try:
            f = File(image_file_path)
            if not f.exists():
                return
            size = int(f.length())
            if size == 0:
                return
            data = jarray.zeros(size, 'b')
            dis = DataInputStream(FileInputStream(f))
            dis.readFully(data)
            dis.close()
            # signed byte array → bytearray
            self.write_entry(TYPE_IMAGE, name, bytes(bytearray(data)))
        except Exception as e:
            try:
                print("[DIAG] write_image failed: %s" % str(e))
            except:
                pass

    def write_json(self, name, json_str):
        """JSON 문자열을 암호화하여 저장.

        Args:
            name: 원본 파일명 (e.g., "checkpoint.json")
            json_str: JSON 문자열
        """
        self.write_entry(TYPE_JSON, name, json_str)

    def close(self):
        """파일 핸들 닫기."""
        if not self._closed and self._fos:
            try:
                self._fos.close()
            except:
                pass
            self._fos = None
            self._closed = True

    def delete(self):
        """정상 종료 시 .acdump 파일 삭제."""
        self.close()
        try:
            os.remove(self._filepath)
        except:
            pass

    @property
    def filepath(self):
        return self._filepath
