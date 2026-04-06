import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://beefsynch.com",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function searchSelectSires(query: string): Promise<string[]> {
  try {
    const searchUrl = `https://selectsiresbeef.com/?s=${encodeURIComponent(query)}`;
    const resp = await fetch(searchUrl, {
      headers: { "User-Agent": "BeefSynch/1.0" },
    });
    if (!resp.ok) return [];
    const html = await resp.text();

    // Extract bull page URLs from search results
    const urlPattern = /href=\"(https:\/\/selectsiresbeef\.com\/bull\/[^"]+)\"/g;
    const urls = new Set<string>();
    let match;
    while ((match = urlPattern.exec(html)) !== null) {
      urls.add(match[1]);
    }
    return Array.from(urls).slice(0, 3);
  } catch (e) {
    console.error("Search error:", e);
    return [];
  }
}

async function scrapeBullPage(url: string): Promise<string> {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "BeefSynch/1.0" },
    });
    if (!resp.ok) return "";
    const html = await resp.text();

    // Extract text content - remove scripts, styles, and HTML tags
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "");

    // Extract table data (EPDs)
    const tableContent: string[] = [];
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let tableMatch;
    while ((tableMatch = tableRegex.exec(html)) !== null) {
      const rows = tableMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
      for (const row of rows) {
        const cells = (row.match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi) || []).map(
          (c) => c.replace(/<[^>]+>/g, "").trim()
        );
        if (cells.length > 0) tableContent.push(cells.join(" | "));
      }
    }

    // Clean remaining HTML
    text = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    // Combine, keeping it manageable
    const combined = text.substring(0, 4000);
    const tables = tableContent.length > 0 ? "\n\nEPD TABLE DATA:\n" + tableContent.join("\n") : "";

    return `SOURCE URL: ${url}\n\n${combined}${tables}`;
  } catch (e) {
    console.error("Scrape error:", e);
    return "";
  }
}

function extractBullNameFromMessages(messages: Array<{ role: string; content: string }>): string | null {
  // Look at the latest user message for bull name references
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      return messages[i].content;
    }
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth verification
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { messages } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Determine if we need to search for bull data
    const latestUserMsg = extractBullNameFromMessages(messages);
    let bullContext = "";

    if (latestUserMsg) {
      // Extract potential bull name keywords for search
      const searchQuery = latestUserMsg;
      const urls = await searchSelectSires(searchQuery);

      if (urls.length > 0) {
        // Scrape the first matching bull page
        const scrapedPages: string[] = [];
        for (const url of urls.slice(0, 2)) {
          const content = await scrapeBullPage(url);
          if (content) scrapedPages.push(content);
        }
        if (scrapedPages.length > 0) {
          bullContext = "\n\n--- SELECT SIRES BULL DATA ---\n" + scrapedPages.join("\n\n---\n\n") + "\n--- END BULL DATA ---\n";
        }
      }
    }

    const systemPrompt = `You are BeefSynch AI, a knowledgeable cattle breeding assistant specializing in bull genetics, EPDs (Expected Progeny Differences), and pedigrees. You have access to the Select Sires Beef bull catalog.\n\nWhen a user asks about a bull:\n1. Present the bull's key information clearly: name, NAAB code, breed, registration number, birth date, and origin.\n2. Display EPDs in a well-formatted markdown table with the trait abbreviations as headers.\n3. Include the pedigree (sire, dam, grandsires, granddams) in a clear format.\n4. Explain what the EPDs mean in practical terms for cattle producers.\n5. Include the % Rank (percentile ranking) when available to show how the bull compares to breed average.\n6. Include accuracy values when available.\n\nIf no bull data is found from Select Sires, let the user know the bull may not be in the Select Sires catalog and suggest they check the name or try a different search term.\n\nFormat EPDs as a markdown table. Use bold for important values. Keep responses informative but concise.\n\nWhen discussing EPD traits, here are the common abbreviations:\n- CED: Calving Ease Direct, BW: Birth Weight, WW: Weaning Weight, YW: Yearling Weight\n- RADG: Residual Average Daily Gain, DMI: Dry Matter Intake\n- YH: Yearling Height, SC: Scrotal Circumference, DOC: Docility\n- HP: Heifer Pregnancy, CEM: Calving Ease Maternal, Milk: Milk\n- MW: Mature Weight, MH: Mature Height\n- CW: Carcass Weight, Marb: Marbling, RE: Ribeye Area, Fat: Fat Thickness\n- $M: Maternal Weaned Calf Value, $W: Weaned Calf Value, $F: Feedlot Value, $G: Grid Value, $B: Beef Value, $C: Combined Value\n- HS: Hair Shedding, FL: Functional Longevity\n- UDDR: Udder, TEAT: Teat Score\n${bullContext}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return new Response(JSON.stringify({ error: "AI service unavailable" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("bull-chat error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
