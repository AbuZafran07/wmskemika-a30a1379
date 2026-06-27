import React, { useState, useRef, useCallback } from 'react';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import type { Crop, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Loader2, ZoomIn, RotateCw, Check, X, FileSignature } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { validateImageFile, formatFileSize } from '@/lib/imageUtils';

interface SignatureCropperProps {
  open: boolean;
  onClose: () => void;
  file: File | null;
  onCropComplete: (blob: Blob) => void;
}

// Signature aspect ratio (width:height = 2.5:1 for landscape signatures)
const SIGNATURE_ASPECT_RATIO = 2.5;
// Output dimensions for signature (max 1000x400)
const OUTPUT_WIDTH = 800;
const OUTPUT_HEIGHT = 320;

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

// Custom getCroppedCanvas for signature (non-square, landscape)
function getSignatureCroppedCanvas(
  image: HTMLImageElement,
  crop: { x: number; y: number; width: number; height: number },
  outputWidth: number,
  outputHeight: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // Set output size (landscape for signature)
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  // Calculate scale factors
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;

  // Draw cropped and resized image
  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    outputWidth,
    outputHeight
  );

  return canvas;
}

// Compress with transparent background support (PNG)
async function compressSignature(
  canvas: HTMLCanvasElement,
  targetSize: number = 500 * 1024 // 500KB
): Promise<Blob> {
  let quality = 0.9;
  let blob: Blob | null = null;

  // Try PNG first for transparency support
  blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png');
  });

  if (blob && blob.size <= targetSize) {
    return blob;
  }

  // If PNG is too large, try WebP with compression
  while (quality > 0.1) {
    blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', quality);
    });

    if (blob && blob.size <= targetSize) {
      break;
    }

    quality -= 0.1;
  }

  // Fallback to lowest quality
  if (!blob) {
    blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', 0.1);
    });
  }

  if (!blob) {
    throw new Error('Failed to compress signature');
  }

  return blob;
}

export function SignatureCropper({
  open,
  onClose,
  file,
  onCropComplete,
}: SignatureCropperProps) {
  const { language } = useLanguage();
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [imgSrc, setImgSrc] = useState('');
  const [scale, setScale] = useState(1);
  const [rotate, setRotate] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

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
    setCrop(centerAspectCrop(width, height, SIGNATURE_ASPECT_RATIO));
  }, []);

  const handleRotate = () => {
    setRotate((prev) => (prev + 90) % 360);
  };

  const handleComplete = async () => {
    if (!imgRef.current || !completedCrop) return;

    setIsProcessing(true);
    try {
      // Create a canvas with the cropped signature
      const canvas = getSignatureCroppedCanvas(
        imgRef.current,
        {
          x: completedCrop.x,
          y: completedCrop.y,
          width: completedCrop.width,
          height: completedCrop.height
        },
        OUTPUT_WIDTH,
        OUTPUT_HEIGHT
      );

      // Compress the signature
      const blob = await compressSignature(canvas);
      
      onCropComplete(blob);
      onClose();
    } catch (error) {
      console.error('Error processing signature:', error);
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
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="w-5 h-5" />
            {language === 'en' ? 'Crop Signature' : 'Potong Tanda Tangan'}
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
                aspect={SIGNATURE_ASPECT_RATIO}
                className="max-h-[300px]"
              >
                <img
                  ref={imgRef}
                  alt="Signature preview"
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
          <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
            <p>
              {language === 'en' 
                ? '• Drag to reposition the crop area'
                : '• Seret untuk memposisikan area potong'}
            </p>
            <p>
              {language === 'en' 
                ? '• Use zoom to adjust image size'
                : '• Gunakan zoom untuk menyesuaikan ukuran gambar'}
            </p>
            <p>
              {language === 'en' 
                ? `• Output: ${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}px (landscape)`
                : `• Hasil: ${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}px (landscape)`}
            </p>
          </div>
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
