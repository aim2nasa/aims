$env:UPSTAGE_API_KEY = [System.Environment]::GetEnvironmentVariable('UPSTAGE_API_KEY', 'User')
python D:\aims\tools\MetlifePDF.sikuli\test_upstage_ocr.py $args
