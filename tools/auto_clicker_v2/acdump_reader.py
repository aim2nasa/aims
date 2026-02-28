# -*- coding: utf-8 -*-
"""
.acdump 파일 복호화 도구 (개발자용, CPython 3.x)

사용법:
    python acdump_reader.py <파일경로> [--key <64자hex>] [--output-dir <폴더>] [--list]

    --key         AES-256 키 (미지정 시 DEV_PIN_HASH 기본값 사용)
    --output-dir  추출 결과 저장 폴더 (기본: .acdump 파일과 같은 폴더에 _extracted/)
    --list        엔트리 목록만 출력 (추출하지 않음)

예시:
    python acdump_reader.py crash_20260228.acdump
    python acdump_reader.py crash_20260228.acdump --output-dir D:\\tmp\\dump
    python acdump_reader.py crash_20260228.acdump --list
"""

import argparse
import os
import struct
import sys

# AES 복호화용 (cryptography 패키지 또는 fallback)
try:
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    from cryptography.hazmat.primitives import padding as crypto_padding
    _HAS_CRYPTOGRAPHY = True
except ImportError:
    _HAS_CRYPTOGRAPHY = False

_MAGIC = b"ACDUMP01"
_DEFAULT_KEY = "7e66b5dd3d158d14ba3300cad5702ee6d72befaec37890eed25c91687bb649df"

TYPE_NAMES = {
    0x01: "SYSTEM_INFO",
    0x02: "LOG",
    0x03: "IMAGE",
    0x04: "JSON",
}


def _aes_decrypt(key_bytes, iv, ciphertext):
    """AES-256-CBC 복호화 + PKCS7 unpadding."""
    if _HAS_CRYPTOGRAPHY:
        cipher = Cipher(algorithms.AES(key_bytes), modes.CBC(iv))
        decryptor = cipher.decryptor()
        padded = decryptor.update(ciphertext) + decryptor.finalize()
        unpadder = crypto_padding.PKCS7(128).unpadder()
        return unpadder.update(padded) + unpadder.finalize()
    else:
        # Fallback: PyCryptodome
        from Crypto.Cipher import AES
        cipher = AES.new(key_bytes, AES.MODE_CBC, iv)
        padded = cipher.decrypt(ciphertext)
        pad_len = padded[-1]
        return padded[:-pad_len]


def read_entries(filepath, key_hex):
    """
    .acdump 파일에서 모든 엔트리를 복호화하여 반환.

    Yields:
        (entry_type: int, name: str, data: bytes)
    """
    key_bytes = bytes.fromhex(key_hex[:64])

    with open(filepath, "rb") as f:
        # 매직 헤더 확인
        magic = f.read(8)
        if magic != _MAGIC:
            raise ValueError(f"잘못된 파일 형식: 매직 헤더 불일치 (got {magic!r})")

        entry_idx = 0
        while True:
            # [type:1]
            type_byte = f.read(1)
            if not type_byte:
                break  # EOF

            entry_type = type_byte[0]

            # [iv:16]
            iv = f.read(16)
            if len(iv) < 16:
                print(f"[WARN] 엔트리 #{entry_idx}: IV 불완전 ({len(iv)}B) — 파일 끝 (크래시 중 잘림?)")
                break

            # [payload_len:4]
            len_data = f.read(4)
            if len(len_data) < 4:
                print(f"[WARN] 엔트리 #{entry_idx}: 길이 불완전 — 파일 끝")
                break

            payload_len = struct.unpack(">I", len_data)[0]

            # [encrypted_payload:N]
            encrypted = f.read(payload_len)
            if len(encrypted) < payload_len:
                print(f"[WARN] 엔트리 #{entry_idx}: 데이터 불완전 ({len(encrypted)}/{payload_len}B)")
                break

            try:
                decrypted = _aes_decrypt(key_bytes, iv, encrypted)
                # payload: [name_len:2][name:UTF-8][data]
                name_len = struct.unpack(">H", decrypted[:2])[0]
                name = decrypted[2:2 + name_len].decode("utf-8")
                data = decrypted[2 + name_len:]
                yield (entry_type, name, data)
            except Exception as e:
                print(f"[WARN] 엔트리 #{entry_idx}: 복호화 실패 — {e}")

            entry_idx += 1


def extract(filepath, key_hex, output_dir):
    """
    .acdump 파일을 복호화하여 output_dir에 추출.

    LOG 엔트리 → merged_log.txt (하나의 파일에 병합)
    IMAGE 엔트리 → images/{name}
    JSON 엔트리 → json/{name}
    SYSTEM_INFO → system_info.txt
    """
    os.makedirs(output_dir, exist_ok=True)
    img_dir = os.path.join(output_dir, "images")
    json_dir = os.path.join(output_dir, "json")
    os.makedirs(img_dir, exist_ok=True)
    os.makedirs(json_dir, exist_ok=True)

    log_lines = []
    counts = {t: 0 for t in TYPE_NAMES}
    img_counter = 0

    for entry_type, name, data in read_entries(filepath, key_hex):
        type_name = TYPE_NAMES.get(entry_type, f"UNKNOWN({entry_type:#x})")
        counts[entry_type] = counts.get(entry_type, 0) + 1

        if entry_type == 0x01:  # SYSTEM_INFO
            path = os.path.join(output_dir, "system_info.txt")
            with open(path, "w", encoding="utf-8") as f:
                f.write(data.decode("utf-8", errors="replace"))

        elif entry_type == 0x02:  # LOG
            log_lines.append(data.decode("utf-8", errors="replace"))

        elif entry_type == 0x03:  # IMAGE
            img_counter += 1
            safe_name = name.replace("/", "_").replace("\\", "_")
            if not safe_name:
                safe_name = f"image_{img_counter:04d}.png"
            path = os.path.join(img_dir, safe_name)
            with open(path, "wb") as f:
                f.write(data)

        elif entry_type == 0x04:  # JSON
            safe_name = name.replace("/", "_").replace("\\", "_")
            if not safe_name:
                safe_name = f"data_{counts[entry_type]:04d}.json"
            path = os.path.join(json_dir, safe_name)
            with open(path, "w", encoding="utf-8") as f:
                f.write(data.decode("utf-8", errors="replace"))

    # 로그 병합 저장
    if log_lines:
        log_path = os.path.join(output_dir, "merged_log.txt")
        with open(log_path, "w", encoding="utf-8") as f:
            f.write("\n".join(log_lines))

    return counts


def list_entries(filepath, key_hex):
    """엔트리 목록을 출력 (추출 없이)."""
    for idx, (entry_type, name, data) in enumerate(read_entries(filepath, key_hex)):
        type_name = TYPE_NAMES.get(entry_type, f"UNKNOWN({entry_type:#x})")
        if entry_type == 0x03:  # IMAGE
            size_str = f"{len(data):,}B"
        elif entry_type == 0x02:  # LOG
            text = data.decode("utf-8", errors="replace")
            size_str = text[:80].replace("\n", " ")
        else:
            size_str = f"{len(data):,}B"
        print(f"  [{idx:04d}] {type_name:12s} | {name:40s} | {size_str}")


def main():
    parser = argparse.ArgumentParser(description=".acdump 파일 복호화 도구")
    parser.add_argument("filepath", help=".acdump 파일 경로")
    parser.add_argument("--key", default=_DEFAULT_KEY, help="AES-256 키 (64자 hex)")
    parser.add_argument("--output-dir", default=None, help="추출 결과 저장 폴더")
    parser.add_argument("--list", action="store_true", help="엔트리 목록만 출력")
    args = parser.parse_args()

    if not os.path.exists(args.filepath):
        print(f"[ERROR] 파일 없음: {args.filepath}")
        sys.exit(1)

    if not _HAS_CRYPTOGRAPHY:
        try:
            from Crypto.Cipher import AES  # noqa: F401
        except ImportError:
            print("[ERROR] cryptography 또는 pycryptodome 패키지 필요:")
            print("  pip install cryptography")
            sys.exit(1)

    if args.list:
        print(f"=== {args.filepath} ===")
        list_entries(args.filepath, args.key)
    else:
        output_dir = args.output_dir
        if not output_dir:
            base = os.path.splitext(args.filepath)[0]
            output_dir = base + "_extracted"
        print(f"추출 중: {args.filepath} → {output_dir}")
        counts = extract(args.filepath, args.key, output_dir)
        print(f"완료: SYSTEM_INFO={counts.get(0x01, 0)}, "
              f"LOG={counts.get(0x02, 0)}, "
              f"IMAGE={counts.get(0x03, 0)}, "
              f"JSON={counts.get(0x04, 0)}")


if __name__ == "__main__":
    main()
