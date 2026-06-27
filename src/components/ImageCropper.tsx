import React, { useState, useRef, useCallback } from 'react';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import type { Crop, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Loader2, ZoomIn, RotateCw, Check, X } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { 
  compressImage, 
  getCroppedCanvas, 
  formatFileSize,
  validateImageFile,
  createImageFromFile
} from '@/lib/imageUtils';

interface ImageCropperProps {
  open: boolean;
  onClose: () => void;
  file: File | null;
  onCropComplete: (blob: Blob) => void;
  aspectRatio?: number;
  outputSize?: number;
  circularCrop?: boolean;
}

function centerAspectCrop(
  mediaWidth: number,
  mediaHeight: number,
  aspect: number
): Crop {
  return centerCrop(
    makeAspectCrop(
      {
        unit: '%',
        width: 90,
      },
      aspect,
      mediaWidth,
      mediaHeight
    ),
    mediaWidth,
    mediaHeight
  );
}

export function ImageCropper({
  open,
  onClose,
  file,
  onCropComplete,
  aspectRatio = 1,
  outputSize = 256,
  circularCrop = false
}: ImageCropperProps) {
  const { language } = useLanguage();
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [imgSrc, setImgSrc] = useState('');
  const [scale, setScale] = useState(1);
  const [rotate, setRotate] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewSize, setPreviewSize] = useState<string>('');

  // Load image when file changes
  React.useEffect(() => {
    if (file) {
      const validation = validateImageFile(file, language as 'en' | 'id');
      if (!validation.valid) {
        onClose();
        return;
      }

      const reader = new FileReader();
      reader.addEventListener('load', () => {
        setImgSrc(reader.result?.toString() || '');
      });
      reader.readAsDataURL(file);
    } else {
      setImgSrc('');
      setCrop(undefined);
      setScale(1);
      setRotate(0);
    }
  }, [file, language, onClose]);

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    setCrop(centerAspectCrop(width, height, aspectRatio));
  }, [aspectRatio]);

  const handleRotate = () => {
    setRotate((prev) => (prev + 90) % 360);
  };

  const handleComplete = async () => {
    if (!imgRef.current || !completedCrop) return;

    setIsProcessing(true);
    try {
      // Create a canvas with the cropped image
      const canvas = getCroppedCanvas(
        imgRef.current,
        {
          x: completedCrop.x,
          y: completedCrop.y,
          width: completedCrop.width,
          height: completedCrop.height
        },
        outputSize
      );

      // Compress the image
      const blob = await compressImage(canvas);
      setPreviewSize(formatFileSize(blob.size));
      
      onCropComplete(blob);
      onClose();
    } catch (error) {
      console.error('Error processing image:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    setImgSrc('');
    setCrop(undefined);
    setScale(1);
    setRotate(0);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {language === 'en' ? 'Crop Photo' : 'Potong Foto'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Image Cropper */}
          {imgSrc && (
            <div className="flex justify-center bg-muted rounded-lg p-2 overflow-hidden">
              <ReactCrop
                crop={crop}
                onChange={(_, percentCrop) => setCrop(percentCrop)}
                onComplete={(c) => setCompletedCrop(c)}
                aspect={aspectRatio}
                circularCrop={circularCrop}
                className="max-h-[300px]"
              >
                <img
                  ref={imgRef}
                  alt="Crop preview"
                  src={imgSrc}
                  onLoad={onImageLoad}
                  style={{
                    transform: `scale(${scale}) rotate(${rotate}deg)`,
                    maxHeight: '300px',
                    maxWidth: '100%'
                  }}
                />
              </ReactCrop>
            </div>
          )}

          {/* Controls */}
          <div className="space-y-3">
            {/* Zoom */}
            <div className="flex items-center gap-3">
              <ZoomIn className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm min-w-16">
                {language === 'en' ? 'Zoom' : 'Zoom'}
              </span>
              <Slider
                value={[scale]}
                onValueChange={([value]) => setScale(value)}
                min={0.5}
                max={3}
                step={0.1}
                className="flex-1"
              />
              <span className="text-sm text-muted-foreground min-w-12">
                {Math.round(scale * 100)}%
              </span>
            </div>

            {/* Rotate Button */}
            <div className="flex items-center gap-3">
              <RotateCw className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm min-w-16">
                {language === 'en' ? 'Rotate' : 'Putar'}
              </span>
              <Button variant="outline" size="sm" onClick={handleRotate}>
                +90°
              </Button>
              <span className="text-sm text-muted-foreground">
                {rotate}°
              </span>
            </div>
          </div>

          {/* Info */}
          <p className="text-xs text-muted-foreground text-center">
            {language === 'en' 
              ? 'Drag to reposition, use handles to resize. Image will be compressed automatically.'
              : 'Seret untuk memposisikan, gunakan pegangan untuk mengubah ukuran. Gambar akan dikompres otomatis.'}
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
            <X className="w-4 h-4 mr-2" />
            {language === 'en' ? 'Cancel' : 'Batal'}
          </Button>
          <Button onClick={handleComplete} disabled={isProcessing || !completedCrop}>
            {isProcessing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Check className="w-4 h-4 mr-2" />
            )}
            {language === 'en' ? 'Apply' : 'Terapkan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
