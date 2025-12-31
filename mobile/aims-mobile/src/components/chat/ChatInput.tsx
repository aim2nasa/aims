import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, fontSize, borderRadius } from '../../utils/theme';

// 첨부 파일 타입
export interface AttachedFile {
  uri: string;
  name: string;
  size?: number;
  mimeType?: string;
}

interface ChatInputProps {
  onSend: (message: string, files?: AttachedFile[]) => void;
  onVoice?: () => void;
  isLoading?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

export function ChatInput({
  onSend,
  onVoice,
  isLoading = false,
  placeholder = '메시지를 입력하세요...',
  disabled = false,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  // 웹에서 파일 피커 열 때 텍스트가 사라지는 버그 방지용 ref
  const textRef = useRef('');

  // 텍스트 변경 핸들러 (ref도 동시 업데이트)
  const handleTextChange = (value: string) => {
    setText(value);
    textRef.current = value;
  };

  const handleSend = () => {
    // 웹에서 state가 사라질 수 있으므로 ref에서도 확인
    const currentText = text || textRef.current;
    if ((currentText.trim() || attachedFiles.length > 0) && !isLoading && !disabled) {
      console.log('[ChatInput] 전송:', currentText, 'files:', attachedFiles.length);
      onSend(currentText.trim(), attachedFiles.length > 0 ? attachedFiles : undefined);
      setText('');
      textRef.current = '';
      setAttachedFiles([]);
    }
  };

  // 사진 앨범에서 선택
  const pickFromGallery = async () => {
    try {
      // 권한 요청
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('권한 필요', '사진 앨범 접근 권한이 필요합니다.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.8,
        selectionLimit: 5 - attachedFiles.length,
      });

      if (!result.canceled && result.assets) {
        const newFiles: AttachedFile[] = result.assets.map((asset, idx) => ({
          uri: asset.uri,
          name: asset.fileName || `image_${Date.now()}_${idx}.jpg`,
          size: asset.fileSize,
          mimeType: asset.mimeType || 'image/jpeg',
        }));

        const totalFiles = [...attachedFiles, ...newFiles].slice(0, 5);
        setAttachedFiles(totalFiles);
      }
    } catch (error) {
      console.error('Image picker error:', error);
      Alert.alert('오류', '사진을 선택하는 중 오류가 발생했습니다.');
    }
  };

  // 카메라로 촬영
  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('권한 필요', '카메라 접근 권한이 필요합니다.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const newFile: AttachedFile = {
          uri: asset.uri,
          name: asset.fileName || `photo_${Date.now()}.jpg`,
          size: asset.fileSize,
          mimeType: asset.mimeType || 'image/jpeg',
        };

        setAttachedFiles(prev => [...prev, newFile].slice(0, 5));
      }
    } catch (error) {
      console.error('Camera error:', error);
      Alert.alert('오류', '카메라를 사용하는 중 오류가 발생했습니다.');
    }
  };

  // 파일 선택 (PDF 등)
  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        multiple: true,
      });

      if (!result.canceled && result.assets) {
        const newFiles: AttachedFile[] = result.assets.map(asset => ({
          uri: asset.uri,
          name: asset.name,
          size: asset.size,
          mimeType: asset.mimeType,
        }));

        const totalFiles = [...attachedFiles, ...newFiles].slice(0, 5);
        setAttachedFiles(totalFiles);

        if (attachedFiles.length + newFiles.length > 5) {
          Alert.alert('알림', '파일은 최대 5개까지 첨부할 수 있습니다.');
        }
      }
    } catch (error) {
      console.error('File picker error:', error);
      Alert.alert('오류', '파일을 선택하는 중 오류가 발생했습니다.');
    }
  };

  // 첨부 옵션 표시 (모든 플랫폼에서 동일한 UI)
  const handleAttach = () => {
    setShowAttachMenu(true);
  };

  // 첨부 메뉴에서 옵션 선택
  const handleAttachOption = (option: 'gallery' | 'camera' | 'document') => {
    setShowAttachMenu(false);
    setTimeout(() => {
      if (option === 'gallery') pickFromGallery();
      else if (option === 'camera') takePhoto();
      else if (option === 'document') pickDocument();
    }, 100);
  };

  // 첨부 파일 제거
  const removeFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const canSend = (text.trim().length > 0 || attachedFiles.length > 0) && !isLoading && !disabled;

  return (
    <View style={styles.container}>
      {/* 첨부 옵션 모달 */}
      <Modal
        visible={showAttachMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAttachMenu(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowAttachMenu(false)}
        >
          <View style={styles.attachMenu}>
            <Text style={styles.attachMenuTitle}>첨부하기</Text>

            <TouchableOpacity
              style={styles.attachMenuItem}
              onPress={() => handleAttachOption('gallery')}
            >
              <Ionicons name="images" size={22} color={colors.primary} />
              <Text style={styles.attachMenuText}>사진 앨범</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.attachMenuItem}
              onPress={() => handleAttachOption('camera')}
            >
              <Ionicons name="camera" size={22} color={colors.primary} />
              <Text style={styles.attachMenuText}>카메라</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.attachMenuItem}
              onPress={() => handleAttachOption('document')}
            >
              <Ionicons name="document" size={22} color={colors.primary} />
              <Text style={styles.attachMenuText}>파일 선택</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.attachMenuItem, styles.attachMenuCancel]}
              onPress={() => setShowAttachMenu(false)}
            >
              <Text style={styles.attachMenuCancelText}>취소</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* 첨부 파일 미리보기 */}
      {attachedFiles.length > 0 && (
        <View style={styles.attachedFilesContainer}>
          {attachedFiles.map((file, index) => (
            <View key={index} style={styles.attachedFile}>
              <Ionicons
                name={file.mimeType?.startsWith('image/') ? 'image' : 'document'}
                size={16}
                color={colors.primary}
              />
              <Text style={styles.attachedFileName} numberOfLines={1}>
                {file.name}
              </Text>
              <TouchableOpacity onPress={() => removeFile(index)}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <View style={styles.inputWrapper}>
        {/* 첨부 버튼 */}
        <TouchableOpacity
          style={styles.attachButton}
          onPress={handleAttach}
          disabled={disabled || isLoading || attachedFiles.length >= 5}
        >
          <Ionicons
            name="attach"
            size={24}
            color={disabled || attachedFiles.length >= 5 ? colors.textMuted : colors.textSecondary}
          />
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          value={text}
          onChangeText={handleTextChange}
          placeholder={attachedFiles.length > 0 ? '고객명을 입력하고 전송하세요 (예: 홍길동)' : placeholder}
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={2000}
          editable={!disabled}
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />

        {text.length > 0 && (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => setText('')}
            disabled={disabled}
          >
            <Ionicons name="close-circle" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        )}

        {onVoice && (
          <TouchableOpacity
            style={styles.voiceButton}
            onPress={onVoice}
            disabled={disabled || isLoading}
          >
            <Ionicons
              name="mic"
              size={22}
              color={disabled ? colors.textMuted : colors.primary}
            />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.sendButton, canSend && styles.sendButtonActive]}
          onPress={handleSend}
          disabled={!canSend}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Ionicons
              name="arrow-up"
              size={20}
              color={canSend ? colors.white : colors.textMuted}
            />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  // 첨부 파일 미리보기
  attachedFilesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  attachedFile: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
    maxWidth: '48%',
  },
  attachedFileName: {
    flex: 1,
    fontSize: fontSize.xs,
    color: colors.text,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.xxl,
    paddingLeft: spacing.xs,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
    minHeight: 48,
  },
  attachButton: {
    padding: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text,
    maxHeight: 100,
    paddingVertical: spacing.sm,
  },
  clearButton: {
    padding: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceButton: {
    padding: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.backgroundTertiary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.xs,
  },
  sendButtonActive: {
    backgroundColor: colors.primary,
  },
  // 첨부 모달 스타일
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  attachMenu: {
    backgroundColor: colors.backgroundSecondary,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  attachMenuTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.sm,
  },
  attachMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  attachMenuText: {
    fontSize: fontSize.md,
    color: colors.text,
  },
  attachMenuCancel: {
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    justifyContent: 'center',
  },
  attachMenuCancelText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
