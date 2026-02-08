$env:CLOVA_OCR_API_URL = [System.Environment]::GetEnvironmentVariable('CLOVA_OCR_API_URL', 'User')
$env:CLOVA_OCR_SECRET_KEY = [System.Environment]::GetEnvironmentVariable('CLOVA_OCR_SECRET_KEY', 'User')
python D:\aims\tools\MetlifePDF_v2.sikuli\test_clova_ocr.py $args
