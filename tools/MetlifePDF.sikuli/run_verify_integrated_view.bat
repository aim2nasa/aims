@echo off
chcp 65001 >nul
java -Dfile.encoding=UTF-8 -jar C:\SikuliX\sikulixide-2.0.5.jar -r %*
