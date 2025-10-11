import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Style descriptors for randomization
const STYLES = [
  'psychedelic neon',
  'dreamy vaporwave',
  'surreal melting',
  'cosmic galaxy',
  'glitch art',
  'retro 80s',
  'cyberpunk',
  'watercolor',
  'oil painting',
  'pixel art',
  'holographic',
  'infrared photography',
  'stained glass',
  'ukiyo-e woodblock',
  'synthwave',
  'abstract expressionism',
  'low poly geometric',
  'paper cutout collage',
];

const ENVIRONMENTS = [
  'underwater café',
  'floating in space',
  'tropical jungle',
  'neon cityscape',
  'crystal cave',
  'desert oasis',
  'mountain peak',
  'aurora borealis sky',
  'bamboo forest',
  'coral reef',
  'cyberpunk alley',
  'cloud kingdom',
  'enchanted garden',
  'mars landscape',
  'rainbow dimension',
  'mirror maze',
  'bioluminescent forest',
  'steampunk workshop',
];

const EFFECTS = [
  'with swirling patterns',
  'with liquid chrome textures',
  'with fractal backgrounds',
  'bathed in colorful light',
  'surrounded by geometric shapes',
  'with kaleidoscope effects',
  'with glowing particles',
  'with prismatic reflections',
  'with ethereal mist',
  'with electric energy',
  'with floating objects',
  'with crystalline structures',
  'with flowing ribbons',
  'with starbursts',
  'with iridescent surfaces',
];

/**
 * Generate a creative transformation prompt using LLM or randomized templates
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    const body = await req.json();
    const { useLLM = false } = body;

    // If OpenAI key is available and useLLM is true, use GPT for prompt generation
    if (OPENAI_API_KEY && useLLM) {
      console.log('Using OpenAI GPT for prompt generation');
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are a visual imagination engine. Generate ONE short, creative transformation prompt (max 15 words) that describes how to transform a photo into a trippy, surreal, but still recognizable artistic version. The person should remain clearly identifiable, but the background, style, and colors can shift wildly. Output ONLY the prompt text, nothing else.

Examples:
- "psychedelic neon forest with swirling kaleidoscope patterns"
- "dreamy underwater café bathed in bioluminescent light"
- "vaporwave beach sunset with pink and purple grid"
- "cosmic deity portrait with galaxy skin and star eyes"
- "cyberpunk rain-soaked alley with holographic billboards"`
            },
            {
              role: 'user',
              content: 'Generate a creative, trippy transformation prompt:'
            }
          ],
          temperature: 1.2,
          max_tokens: 50,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('OpenAI API error:', error);
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const generatedPrompt = data.choices[0].message.content.trim();
      
      console.log('Generated prompt:', generatedPrompt);
      
      return new Response(JSON.stringify({ 
        prompt: generatedPrompt,
        method: 'llm'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fallback: Use randomized template-based generation
    console.log('Using template-based prompt generation');
    
    const style = STYLES[Math.floor(Math.random() * STYLES.length)];
    const environment = ENVIRONMENTS[Math.floor(Math.random() * ENVIRONMENTS.length)];
    const effect = EFFECTS[Math.floor(Math.random() * EFFECTS.length)];
    
    // Randomly choose between different prompt structures
    const templates = [
      `${style} portrait in ${environment} ${effect}`,
      `${environment} with ${style} aesthetic ${effect}`,
      `${style} style transformation ${effect}, set in ${environment}`,
      `${environment}, ${style} colors ${effect}`,
    ];
    
    const generatedPrompt = templates[Math.floor(Math.random() * templates.length)];
    
    console.log('Generated prompt:', generatedPrompt);

    return new Response(JSON.stringify({ 
      prompt: generatedPrompt,
      method: 'template',
      components: { style, environment, effect }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in generate-transformation-prompt:', error);
    return new Response(JSON.stringify({ 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
