# MetLife PDF 자동 다운로드 실행 스크립트
param(
    [string]$EndDate = (Get-Date).ToString("yyyy-MM-dd")
)

chcp 65001 | Out-Null

Write-Host "종료일: $EndDate"
$env:METLIFE_END_DATE = $EndDate

java -jar C:\Sikulix\sikulixide-2.0.5.jar -r D:\aims\tools\MetlifePDF.sikuli
