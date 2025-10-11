import { useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Sparkles, Loader2, Download, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { 
  captureSnapshot, 
  generateTransformationPrompt, 
  transformImage,
  type TransformationResult 
} from '@/lib/transformation';

export default function ImageTransform() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  
  // Get video element ref from location state (if passed from Capture page)
  const videoElementRef = useRef<HTMLVideoElement | null>(location.state?.videoElement || null);
  
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [transformedImage, setTransformedImage] = useState<string | null>(null);
  const [currentPrompt, setCurrentPrompt] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTransforming, setIsTransforming] = useState(false);
  const [strength, setStrength] = useState([0.7]);
  const [useLLM, setUseLLM] = useState(false);
  const [transformResult, setTransformResult] = useState<TransformationResult | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Capture snapshot from video element or file upload
  const handleCaptureSnapshot = async () => {
    try {
      if (videoElementRef.current) {
        const { dataUrl } = captureSnapshot(videoElementRef.current);
        setOriginalImage(dataUrl);
        toast({
          title: 'Snapshot captured!',
          description: 'Now generating a creative transformation prompt...',
        });
        
        // Auto-generate initial prompt
        await handleGeneratePrompt();
      } else {
        toast({
          title: 'No video source',
          description: 'Please upload an image or go back to capture',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error capturing snapshot:', error);
      toast({
        title: 'Capture failed',
        description: error instanceof Error ? error.message : 'Failed to capture snapshot',
        variant: 'destructive',
      });
    }
  };

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setOriginalImage(dataUrl);
      toast({
        title: 'Image loaded!',
        description: 'Now generate a transformation prompt',
      });
    };
    reader.readAsDataURL(file);
  };

  // Generate a new creative prompt
  const handleGeneratePrompt = async () => {
    setIsGenerating(true);
    try {
      const promptData = await generateTransformationPrompt(useLLM);
      setCurrentPrompt(promptData.prompt);
      
      toast({
        title: 'Prompt generated!',
        description: `Style: ${promptData.prompt}`,
      });
    } catch (error) {
      console.error('Error generating prompt:', error);
      toast({
        title: 'Generation failed',
        description: error instanceof Error ? error.message : 'Failed to generate prompt',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Transform the image
  const handleTransform = async () => {
    if (!originalImage || !currentPrompt) {
      toast({
        title: 'Missing requirements',
        description: 'Need both an image and a prompt to transform',
        variant: 'destructive',
      });
      return;
    }

    setIsTransforming(true);
    setTransformedImage(null);
    
    try {
      const base64 = originalImage.split(',')[1];
      const result = await transformImage({
        imageBase64: base64,
        prompt: currentPrompt,
        strength: strength[0],
      });
      
      setTransformedImage(result.imageUrl);
      setTransformResult(result);
      setShowComparison(true);
      
      toast({
        title: 'Transformation complete!',
        description: `Created using ${result.method}`,
      });
    } catch (error) {
      console.error('Error transforming image:', error);
      toast({
        title: 'Transformation failed',
        description: error instanceof Error ? error.message : 'Failed to transform image',
        variant: 'destructive',
      });
    } finally {
      setIsTransforming(false);
    }
  };

  // Download transformed image
  const handleDownload = () => {
    if (!transformedImage) return;
    
    const link = document.createElement('a');
    link.href = transformedImage;
    link.download = `brewdream-transform-${Date.now()}.png`;
    link.click();
  };

  // Share functionality
  const handleShare = async () => {
    if (!transformedImage) return;
    
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'BrewDream AI Transformation',
          text: `Check out my AI-transformed image: ${currentPrompt}`,
          url: window.location.href,
        });
      } else {
        // Fallback: copy link to clipboard
        await navigator.clipboard.writeText(window.location.href);
        toast({
          title: 'Link copied!',
          description: 'Share link copied to clipboard',
        });
      }
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-neutral-100 to-neutral-400 bg-clip-text text-transparent">
            AI Image Transform
          </h1>
          <div className="w-20" /> {/* Spacer for centering */}
        </div>

        {/* Controls */}
        <div className="bg-neutral-900 rounded-3xl p-6 border border-neutral-800 space-y-4">
          {/* Image Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-300">Image Source</label>
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                className="flex-1 bg-neutral-950 border-neutral-800 hover:border-neutral-600"
              >
                Upload Image
              </Button>
              {videoElementRef.current && (
                <Button
                  onClick={handleCaptureSnapshot}
                  variant="outline"
                  className="flex-1 bg-neutral-950 border-neutral-800 hover:border-neutral-600"
                >
                  Capture from Video
                </Button>
              )}
            </div>
          </div>

          {/* Prompt Controls */}
          {originalImage && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-300">Transformation Prompt</label>
                <div className="flex gap-2">
                  <Input
                    value={currentPrompt}
                    onChange={(e) => setCurrentPrompt(e.target.value)}
                    placeholder="Describe the transformation style..."
                    className="flex-1 bg-neutral-950 border-neutral-800 focus:border-neutral-600"
                  />
                  <Button
                    onClick={handleGeneratePrompt}
                    disabled={isGenerating}
                    variant="outline"
                    className="bg-neutral-950 border-neutral-800 hover:border-neutral-600"
                  >
                    {isGenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-neutral-500">
                  Click refresh to generate a new random style, or type your own
                </p>
              </div>

              {/* Strength Slider */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-300">
                  Transformation Strength: {strength[0].toFixed(2)}
                </label>
                <Slider
                  value={strength}
                  onValueChange={setStrength}
                  min={0.3}
                  max={0.95}
                  step={0.05}
                  className="w-full accent-neutral-400"
                />
                <p className="text-xs text-neutral-500">
                  Lower = more recognizable, Higher = more creative
                </p>
              </div>

              {/* LLM Toggle */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="useLLM"
                  checked={useLLM}
                  onChange={(e) => setUseLLM(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="useLLM" className="text-sm text-neutral-300">
                  Use AI (GPT) for prompt generation (if configured)
                </label>
              </div>

              {/* Transform Button */}
              <Button
                onClick={handleTransform}
                disabled={!currentPrompt || isTransforming}
                className="w-full h-12 bg-gradient-to-r from-neutral-200 to-neutral-500 text-neutral-900 font-semibold rounded-2xl hover:from-neutral-300 hover:to-neutral-600"
              >
                {isTransforming ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Transforming...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5" />
                    Transform Image
                  </span>
                )}
              </Button>
            </>
          )}
        </div>

        {/* Image Display */}
        {originalImage && (
          <div className="space-y-4">
            {/* Toggle View */}
            {transformedImage && (
              <div className="flex justify-center gap-2">
                <Button
                  onClick={() => setShowComparison(false)}
                  variant={!showComparison ? "default" : "outline"}
                  size="sm"
                  className={!showComparison ? "bg-neutral-700" : "bg-neutral-900 border-neutral-800"}
                >
                  Original
                </Button>
                <Button
                  onClick={() => setShowComparison(true)}
                  variant={showComparison ? "default" : "outline"}
                  size="sm"
                  className={showComparison ? "bg-neutral-700" : "bg-neutral-900 border-neutral-800"}
                >
                  Transformed
                </Button>
              </div>
            )}

            {/* Images */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Original */}
              {(!transformedImage || !showComparison) && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-neutral-400">Original</h3>
                  <div className="aspect-square bg-neutral-900 rounded-2xl overflow-hidden border border-neutral-800">
                    <img
                      src={originalImage}
                      alt="Original"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              )}

              {/* Transformed */}
              {transformedImage && showComparison && (
                <div className="space-y-2 md:col-span-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-neutral-400">
                      Transformed
                      {transformResult && (
                        <span className="ml-2 text-xs text-neutral-600">
                          (via {transformResult.method})
                        </span>
                      )}
                    </h3>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleDownload}
                        size="sm"
                        variant="outline"
                        className="bg-neutral-950 border-neutral-800"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </Button>
                      <Button
                        onClick={handleShare}
                        size="sm"
                        variant="outline"
                        className="bg-neutral-950 border-neutral-800"
                      >
                        <Share2 className="h-4 w-4 mr-2" />
                        Share
                      </Button>
                    </div>
                  </div>
                  <div className="aspect-square md:aspect-auto md:h-[600px] bg-neutral-900 rounded-2xl overflow-hidden border border-neutral-800">
                    <img
                      src={transformedImage}
                      alt="Transformed"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <p className="text-sm text-neutral-500 text-center">
                    Style: {currentPrompt}
                  </p>
                </div>
              )}
            </div>

            {/* Loading State */}
            {isTransforming && (
              <div className="flex flex-col items-center justify-center p-8 space-y-4">
                <Loader2 className="w-12 h-12 animate-spin text-neutral-400" />
                <p className="text-neutral-400">Creating your transformation...</p>
                <p className="text-xs text-neutral-600">This may take 10-30 seconds</p>
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {!originalImage && (
          <div className="flex flex-col items-center justify-center p-12 space-y-4 bg-neutral-900 rounded-3xl border border-neutral-800">
            <Sparkles className="w-16 h-16 text-neutral-600" />
            <h2 className="text-xl font-semibold text-neutral-300">
              Start Your Transformation
            </h2>
            <p className="text-sm text-neutral-500 text-center max-w-md">
              Upload an image or capture from your camera to create stunning AI-powered transformations.
              Each refresh generates a unique, trippy style while keeping you recognizable!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
