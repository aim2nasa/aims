import argparse
import json
from docmeta.core import get_file_metadata

def main():
    parser = argparse.ArgumentParser(description="Extract document metadata")
    parser.add_argument('--file', required=True, help='Path to the file')
    args = parser.parse_args()

    meta = get_file_metadata(args.file)
    print(json.dumps(meta, indent=2, ensure_ascii=False))

