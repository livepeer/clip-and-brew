# AI Image Transform - Quick Start Guide

## 🚀 Getting Started

### Prerequisites
- BrewDream app running
- Supabase project configured
- At least one of these API keys:
  - Livepeer Studio API Key (recommended)
  - OpenAI API Key (fallback)

---

## 📦 Installation & Setup

### 1. Deploy Edge Functions

```bash
# Deploy prompt generation function
supabase functions deploy generate-transformation-prompt

# Deploy image transformation function
supabase functions deploy transform-image
```

### 2. Set Environment Variables

```bash
# Required: At least one of these
supabase secrets set LIVEPEER_STUDIO_API_KEY=lp_xxxxx
supabase secrets set OPENAI_API_KEY=sk-xxxxx

# Verify secrets are set
supabase secrets list
```

### 3. Test the Functions

**Test Prompt Generation:**
```bash
curl -X POST \
  'https://YOUR_PROJECT.supabase.co/functions/v1/generate-transformation-prompt' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"useLLM": false}'
```

Expected response:
```json
{
  "prompt": "psychedelic neon portrait in cosmic galaxy with swirling patterns",
  "method": "template",
  "components": {
    "style": "psychedelic neon",
    "environment": "cosmic galaxy",
    "effect": "with swirling patterns"
  }
}
```

---

## 🎨 Usage

### From the App

1. **Navigate to Capture Page**
   - Go to `/capture` route
   - Set up your camera stream

2. **Access AI Transform**
   - Click "AI Transform" button in the top-right
   - Or navigate directly to `/transform`

3. **Capture/Upload Image**
   - **Option A:** Click "Capture from Video" (if coming from capture page)
   - **Option B:** Click "Upload Image" and select a photo

4. **Generate Prompt**
   - Prompt auto-generates on image load
   - Click 🔄 refresh icon for new styles
   - Or type your own custom prompt

5. **Adjust Settings**
   - **Strength Slider:** 0.3 (subtle) to 0.95 (extreme)
   - **Use AI Toggle:** Enable GPT-based prompts (if configured)

6. **Transform**
   - Click "Transform Image"
   - Wait 10-30 seconds
   - View side-by-side comparison

7. **Share/Download**
   - Click "Download" to save image
   - Click "Share" to use Web Share API

---

## 🧪 Example Transformations

### Template-Based Prompts

**Input:** Portrait photo
**Prompt:** `"cyberpunk neon portrait in rain-soaked alley with glowing particles"`
**Output:** Neon-lit portrait with futuristic cityscape background

**Input:** Selfie
**Prompt:** `"watercolor ink portrait, loose brush in enchanted garden with ethereal mist"`
**Output:** Soft, dreamy watercolor-style portrait with magical forest

**Input:** Group photo
**Prompt:** `"psychedelic kaleidoscope face, fractal patterns in aurora borealis sky with prismatic reflections"`
**Output:** Trippy, colorful transformation with northern lights

### LLM-Generated Prompts (GPT-4o-mini)

**Input:** Portrait
**Prompt:** `"cosmic deity with galaxy skin floating through nebula clouds"`
**Output:** Space-themed portrait with celestial elements

**Input:** Outdoor photo
**Prompt:** `"vaporwave beach sunset with pink grid and palm silhouettes"`
**Output:** 80s retro aesthetic with pastel colors

---

## 🔧 API Configuration

### Livepeer Studio (Recommended)

**Why?**
- Direct image-to-image transformation
- Preserves composition better
- Faster (~10-15 seconds)
- More cost-effective

**Setup:**
1. Get API key from [Livepeer Studio](https://livepeer.studio/)
2. Set secret: `supabase secrets set LIVEPEER_STUDIO_API_KEY=lp_xxxxx`

### OpenAI (Fallback)

**Why?**
- High-quality artistic outputs
- Advanced LLM prompt generation
- Wider style variety

**Setup:**
1. Get API key from [OpenAI Platform](https://platform.openai.com/)
2. Set secret: `supabase secrets set OPENAI_API_KEY=sk-xxxxx`

**Features:**
- **GPT-4o-mini:** Creative prompt generation
- **DALL·E 3:** Image generation (slower, ~20-30s)

---

## 📊 Performance Benchmarks

### Prompt Generation
- **Template-based:** < 1 second
- **LLM (GPT):** 2-3 seconds

### Image Transformation
- **Livepeer AI:** 10-15 seconds
- **OpenAI DALL·E:** 20-30 seconds

### Total Pipeline
- **With Livepeer:** ~15-20 seconds
- **With OpenAI:** ~25-35 seconds

---

## 💰 Cost Estimates

### Per Transformation

| Service | Prompt | Transform | Total |
|---------|--------|-----------|-------|
| Livepeer only | Free (template) | $0.01-0.02 | **$0.01-0.02** |
| Livepeer + GPT | $0.001 | $0.01-0.02 | **$0.011-0.021** |
| OpenAI only | $0.001 | $0.04 | **$0.041** |

### Monthly Estimates (1000 transformations)
- **Livepeer (recommended):** $10-20/month
- **OpenAI fallback:** $40-50/month

---

## 🎯 Best Practices

### For Best Results

1. **Use Good Quality Input**
   - Well-lit photos
   - Clear subject visibility
   - 512x512 or larger

2. **Adjust Strength Appropriately**
   - **0.3-0.5:** Subtle, maintain realism
   - **0.5-0.7:** Balanced, artistic
   - **0.7-0.9:** Creative, trippy
   - **0.9+:** Extreme transformation

3. **Prompt Engineering**
   - Keep prompts descriptive but concise
   - Include style, environment, and effects
   - Use adjectives: "vivid", "glowing", "dreamy"

4. **Enable LLM for Variety**
   - More creative and unique prompts
   - Better context understanding
   - Natural language generation

### For Recognizability

- Keep strength ≤ 0.7 for portraits
- Use prompts that emphasize "portrait" or "person"
- Avoid prompts with heavy abstraction
- Test different values to find sweet spot

---

## 🐛 Troubleshooting

### Issue: "No image generation API keys configured"
**Solution:**
```bash
supabase secrets set LIVEPEER_STUDIO_API_KEY=your_key
# or
supabase secrets set OPENAI_API_KEY=your_key
```

### Issue: "Failed to generate prompt"
**Solution:**
- Check if functions are deployed: `supabase functions list`
- Template mode doesn't require API keys
- LLM mode requires `OPENAI_API_KEY`

### Issue: "Transformation takes too long"
**Solution:**
- Livepeer is 2x faster than DALL·E
- Check API key configuration
- Verify network connection

### Issue: "Person not recognizable"
**Solution:**
- Lower strength slider (try 0.5-0.7)
- Use less abstract prompts
- Ensure good lighting in source image

### Issue: "Prompts are repetitive"
**Solution:**
- Enable "Use AI" toggle for LLM-based generation
- Configure `OPENAI_API_KEY`
- Template mode has 18 styles × 18 environments × 15 effects = 4,860 combinations

### Issue: "CORS errors"
**Solution:**
- Ensure Supabase functions have proper CORS headers
- Check browser console for detailed error
- Verify anon key is correct

---

## 📱 Mobile Optimization

### Tips for Mobile Users

1. **Capture from Video**
   - Best for real-time camera feed
   - Immediate snapshot capture
   - No file upload needed

2. **File Upload**
   - Use camera roll photos
   - Pre-edited images work well
   - Supports all common formats

3. **Share Functionality**
   - Uses native Web Share API on mobile
   - Share to Instagram, Twitter, etc.
   - Fallback: copy link to clipboard

---

## 🔐 Security Notes

- All API keys stored server-side in Supabase secrets
- Never expose keys in client code
- Edge functions handle all API calls
- CORS restricted to app origin
- Images processed server-side

---

## 📈 Next Steps

### Try These Features

1. **Multiple Transformations**
   - Generate 3-5 variations of same image
   - Compare different styles
   - Find your favorite aesthetic

2. **Custom Prompts**
   - Experiment with manual prompts
   - Combine multiple style elements
   - Create signature looks

3. **Share Your Creations**
   - Download and share on social media
   - Use hashtag #BrewDream
   - Tag friends for reactions

### Advanced Usage

1. **Batch Processing** (Coming Soon)
   - Transform multiple images at once
   - Apply same style to collection
   - Create style-consistent galleries

2. **Video Transformation** (Future)
   - Apply styles to video clips
   - Frame-by-frame consistency
   - Export as new video

---

## 📚 Additional Resources

- [Livepeer Studio Docs](https://docs.livepeer.org/)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Main Implementation Doc](./AI_IMAGE_TRANSFORM_IMPLEMENTATION.md)

---

## ✅ Quick Checklist

- [ ] Functions deployed
- [ ] API keys configured
- [ ] Functions tested via curl
- [ ] App accessible at `/transform`
- [ ] Can capture/upload images
- [ ] Prompts generate successfully
- [ ] Images transform correctly
- [ ] Download/share working
- [ ] Mobile responsive

---

## 🎉 You're Ready!

Your AI Image Transformation pipeline is now live. Start creating trippy, surreal transformations while keeping subjects recognizable!

**Happy Brewing! ☕✨**
