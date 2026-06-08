// 加密元数据类型定义
export interface EncryptedMetadata {
  name: string;
  type: string;
  size: number;
  hasPassword: boolean;
  fps?: number;
  isImageSequenceToVideo?: boolean;
  audioAttached?: boolean;
  originalAudioName?: string;
  comfyNodeMode?: boolean;
}

// 解密后返回的文件对象
export interface DecryptedFile {
  blob: Blob;
  name: string;
  type: string;
  size: number;
  fps?: number;
  isImageSequenceToVideo?: boolean;
  audioAttached?: boolean;
  originalAudioName?: string;
  comfyNodeMode?: boolean;
}
