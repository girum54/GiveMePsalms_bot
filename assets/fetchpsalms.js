const fs = require('fs');
const path = require('path');

async function fetch2023PsalmsRaw() {
    const allPsalms = [];
    console.log("Fetching 2023 JPS Tanakh with raw tag isolation (no text truncation)...");

    for (let chapter = 1; chapter <= 150; chapter++) {
        try {
            const versionTitle = encodeURIComponent("THE JPS TANAKH: Gender-Sensitive Edition");
            const url = `https://www.sefaria.org/api/v3/texts/Psalms.${chapter}?version=english|${versionTitle}`;
            
            const response = await fetch(url);
            if (!response.ok) continue;

            const data = await response.json();
            const textVersion = data.versions?.find(v => v.language === 'en');
            const rawText = textVersion ? textVersion.text : [];

            let lines = [];
            
            const extract = (item) => {
                if (typeof item === 'string') {
                    let text = item;

                    // 1. Target and remove Sefaria's inline footnote tags and their contents completely 
                    // (e.g., <small class="footnote">...</small> or <i data-tooltip="...">...</i> or similar embedded XML/HTML footnote structures)
                    text = text.replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, '');
                    text = text.replace(/<i[^>]*class="[^"]*footnote[^"]*"[^>]*>[\s\S]*?<\/i>/gi, '');
                    text = text.replace(/<span[^>]*class="[^"]*footnote[^"]*"[^>]*>[\s\S]*?<\/span>/gi, '');
                    
                    // 2. Remove standard anchor/link or editorial tags while keeping main text intact
                    text = text.replace(/<a\b[^>]*>(.*?)<\/a>/gi, '$1');

                    // 3. Strip remaining HTML tags safely
                    let clean = text.replace(/<[^>]*>?/gm, '');

                    // 4. Fix character encoding artifacts (like smart quotes)
                    clean = clean.replace(/â€™/g, "'")
                                 .replace(/â€œ/g, '"')
                                 .replace(/â€/g, '"')
                                 .replace(/Â/g, ' ')
                                 .trim();

                    if (clean.length > 0) {
                        lines.push(clean);
                    }
                } else if (Array.isArray(item)) {
                    item.forEach(sub => extract(sub));
                }
            };

            extract(rawText);

            allPsalms.push({
                chapter: chapter,
                version: "The_JPS_Tanakh_2023",
                lines: lines
            });

            console.log(`Successfully processed Psalm ${chapter} (${lines.length} lines)`);
            await new Promise(resolve => setTimeout(resolve, 150));

        } catch (error) {
            console.error(`Error processing Psalm ${chapter}:`, error.message);
        }
    }

    const outputPath = path.join(__dirname, 'psalms.json');
    fs.writeFileSync(outputPath, JSON.stringify(allPsalms, null, 2), 'utf-8');
    console.log(`\nDone! Saved uncorrupted 2023 edition lines to ${outputPath}`);
}

fetch2023PsalmsRaw();