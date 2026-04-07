# ACE 보고서: 문서 일괄등록 루트 폴더 표시 개선

## 배경

사용자가 "한울" 폴더를 드래그앤드롭했을 때:
- 현재: 하위 폴더 2개만 표시, "한울" 자체와 루트 파일 15개+ 유실
- 원인: `groupFilesByFolder()`가 미매칭 루트 폴더를 버리고 2레벨로 재그룹화하면서 루트 파일을 drop

## 결정

- `groupFilesByFolder()` 반환 타입을 `FolderGroupResult`로 변경하여 parentFolderName + rootFiles 정보 보존
- MappingPreview에서 parent folder를 wrapper 노드로 표시
- 루트 파일은 미매칭 표시 (업로드 대상 아님, 맥락 표시용)
