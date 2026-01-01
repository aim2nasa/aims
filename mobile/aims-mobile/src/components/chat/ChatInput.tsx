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
  onSend: (message: string) => void;
  onFilesSelected?: (files: AttachedFile[]) => void; // 파일 선택 즉시 호출
  onVoice?: () => void;
  isLoading?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

export function ChatInput({
  onSend,
  onFilesSelected,
  onVoice,
  isLoading = false,
  placeholder = '메시지를 입력하세요...',
  disabled = false,
}: ChatInputProps) {
  const [text, setText] = useState('');
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
    if (currentText.trim() && !isLoading && !disabled) {
      console.log('[ChatInput] 전송:', currentText);
      onSend(currentText.trim());
      setText('');
      textRef.current = '';
    }
  };

  // 🔥 파일 선택 완료 시 즉시 부모에게 전달 (aims-uix3 동일)
  const handleFilesReady = (files: AttachedFile[]) => {
    if (files.length > 0 && onFilesSelected) {
      console.log('[ChatInput] 🚀 파일 선택 즉시 업로드 시작:', files.map(f => f.name));
      onFilesSelected(files);
    }
  };

  // 사진 앨범에서 선택
  const pickFromGallery = async () => {
    console.log('[ChatInput] pickFromGallery 시작');

    // 권한 요청 없이 바로 picker 열기 (iOS가 자동 처리)
    // 타임아웃 추가로 hang 방지
    const timeoutPromise = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error('Picker timeout')), 10000)
    );

    const pickerPromise = ImagePicker.launchImageLibraryAsync({
      quality: 0.8,
    });

    try {
      const result = await Promise.race([pickerPromise, timeoutPromise]);

      if (result === null) {
        throw new Error('Picker timeout');
      }

      console.log('[ChatInput] pickFromGallery 결과:', result.canceled ? 'canceled' : `${result.assets?.length} files`);

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const newFile: AttachedFile = {
          uri: asset.uri,
          name: asset.fileName || `image_${Date.now()}.jpg`,
          size: asset.fileSize,
          mimeType: asset.mimeType || 'image/jpeg',
        };
        handleFilesReady([newFile]);
      }
    } catch (error) {
      console.error('[ChatInput] Image picker error:', error);
      const message = error instanceof Error ? error.message : '알 수 없는 오류';
      Alert.alert('오류', `사진 선택 오류: ${message}\n\n설정 > Expo Go > 사진 권한을 확인해주세요.`);
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
        handleFilesReady([newFile]);
      }
    } catch (error) {
      console.error('Camera error:', error);
      Alert.alert('오류', '카메라를 사용하는 중 오류가 발생했습니다.');
    }
  };

  // 파일 선택 (PDF 등)
  const pickDocument = async () => {
    try {
      console.log('[ChatInput] pickDocument 시작');

      // iOS에서 multiple: true가 문제를 일으킬 수 있음
      // copyToCacheDirectory: true로 파일 접근 보장
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*', // iOS 호환성을 위해 모든 파일 허용
        copyToCacheDirectory: true,
        multiple: false, // iOS에서 multiple 지원 불안정
      });

      console.log('[ChatInput] pickDocument 결과:', result.canceled ? 'canceled' : 'selected');

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const newFile: AttachedFile = {
          uri: asset.uri,
          name: asset.name,
          size: asset.size,
          mimeType: asset.mimeType || 'application/octet-stream',
        };
        console.log('[ChatInput] 선택된 파일:', newFile.name);
        handleFilesReady([newFile]);
      }
    } catch (error) {
      console.error('[ChatInput] File picker error:', error);
      Alert.alert('오류', `파일 선택 오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  };

  // 첨부 옵션 표시 (모든 플랫폼에서 동일한 UI)
  const handleAttach = () => {
    setShowAttachMenu(true);
  };

  // 첨부 메뉴에서 옵션 선택
  const handleAttachOption = async (option: 'gallery' | 'camera' | 'document') => {
    console.log('[ChatInput] handleAttachOption 호출:', option);
    setShowAttachMenu(false);

    // iOS에서 Modal 닫힌 후 picker 열기 위해 더 긴 딜레이 필요
    await new Promise(resolve => setTimeout(resolve, 300));

    console.log('[ChatInput] 딜레이 후 picker 호출:', option);
    if (option === 'gallery') {
      await pickFromGallery();
    } else if (option === 'camera') {
      await takePhoto();
    } else if (option === 'document') {
      await pickDocument();
    }
  };

  const canSend = text.trim().length > 0 && !isLoading && !disabled;

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

      {/* 첨부 파일 미리보기는 부모 컴포넌트(pendingFiles)에서 처리 */}

      <View style={styles.inputWrapper}>
        {/* 첨부 버튼 */}
        <TouchableOpacity
          style={styles.attachButton}
          onPress={handleAttach}
          disabled={disabled || isLoading}
        >
          <Ionicons
            name="attach"
            size={24}
            color={disabled ? colors.textMuted : colors.textSecondary}
          />
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          value={text}
          onChangeText={handleTextChange}
          placeholder={placeholder}
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
