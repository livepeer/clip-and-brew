import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Transform an image using Livepeer AI or OpenAI DALL·E
 * Accepts base64 image and prompt, returns transformed image URL
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LIVEPEER_API_KEY = Deno.env.get('LIVEPEER_STUDIO_API_KEY');
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    
    const body = await req.json();
    const { imageBase64, imageUrl, prompt, strength = 0.7 } = body;

    if (!prompt) {
      throw new Error('prompt is required');
    }

    if (!imageBase64 && !imageUrl) {
      throw new Error('Either imageBase64 or imageUrl is required');
    }

    // Try Livepeer AI first if API key is available
    if (LIVEPEER_API_KEY) {
      console.log('Attempting image transformation with Livepeer AI');
      
      try {
        const response = await fetch('https://livepeer.studio/api/beta/generate/image-to-image', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LIVEPEER_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: `${prompt}, highly detailed, vivid colors, person remains recognizable, professional photography`,
            image: imageUrl || `data:image/png;base64,${imageBase64}`,
            model_id: 'SG161222/RealVisXL_V4.0',
            strength: strength,
            guidance_scale: 7.5,
            num_inference_steps: 30,
            seed: Math.floor(Math.random() * 1000000),
          }),
        });

        if (response.ok) {
          const data = await response.json();
          console.log('Livepeer AI transformation successful');
          
          return new Response(JSON.stringify({
            imageUrl: data.images?.[0]?.url || data.url,
            prompt: prompt,
            method: 'livepeer',
            details: data,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else {
          const error = await response.text();
          console.warn('Livepeer AI failed, will try fallback:', error);
        }
      } catch (error) {
        console.warn('Livepeer AI error, trying fallback:', error);
      }
    }

    // Fallback to OpenAI DALL·E 3 Image Edit
    if (OPENAI_API_KEY) {
      console.log('Using OpenAI DALL·E for image transformation');
      
      // DALL·E 3 doesn't support image-to-image directly, so we use DALL·E 2 edit
      // Or we can use DALL·E 3 with a detailed prompt that describes the original
      
      // For now, use DALL·E 3 generation with a prompt that includes style transfer
      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt: `A portrait photograph transformed into: ${prompt}. The person should remain clearly recognizable and the composition should be similar to the original, but with the new artistic style applied. Highly detailed, vivid colors, professional quality.`,
          n: 1,
          size: '1024x1024',
          quality: 'standard',
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('OpenAI DALL·E error:', error);
        throw new Error(`Image transformation failed: ${response.status}`);
      }

      const data = await response.json();
      const imageUrl = data.data[0].url;
      
      console.log('OpenAI DALL·E transformation successful');
      
      return new Response(JSON.stringify({
        imageUrl: imageUrl,
        prompt: prompt,
        method: 'dalle',
        details: data,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // No API keys available
    throw new Error('No image generation API keys configured (LIVEPEER_STUDIO_API_KEY or OPENAI_API_KEY required)');

  } catch (error: any) {
    console.error('Error in transform-image:', error);
    return new Response(JSON.stringify({ 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
