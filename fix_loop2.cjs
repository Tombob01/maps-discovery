const fs = require('fs');
const path = 'src/providers/google-maps/GoogleMapsProvider.ts';
const lines = fs.readFileSync(path, 'utf8').split('\n');

// Find the start of the navigate to search + scraping loop section
// We need to replace from "const navResult = await withRetry" down to closing "}"
// of the while loop (before the finally block)

let navResultLine = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('const navResult = await withRetry(')) {
    navResultLine = i;
    break;
  }
}
console.log('navResult at line:', navResultLine + 1);

// Find the end of the while loop (before "} finally {")
let whileEnd = -1;
for (let i = navResultLine; i < lines.length; i++) {
  if (lines[i].includes('} finally {')) {
    whileEnd = i - 1;
    break;
  }
}
console.log('while loop ends at line:', whileEnd + 1);

const newLoop = [
'      const navResult = await withRetry(',
'        () => this.browser.navigateToSearch(page, query.rawText),',
'        this.policy.retry.maxAttempts,',
'        this.policy.retry.backoffBaseMs,',
'        this.policy.retry.backoffCapMs,',
'        `navigate:${query.rawText}`,',
'      );',
'      if (!navResult.ok) throw navResult.error;',
'',
'      // Capture the search URL immediately after navigation.',
'      // Used to detect when extractFromCard navigates away and to restore the page.',
'      const searchUrl = page.url();',
'',
'      // ── Scraping loop ──────────────────────────────────────────────────────',
'      const seenPlaceIds = new Set<string>(resumedIds);',
'      let totalYielded = 0;',
'      let emptyScrolls = 0;',
'      let lastCardCount = 0;',
'',
'      while (totalYielded < maxResults) {',
'        // Check for CAPTCHA before each batch',
'        if (await this.browser.isCaptchaPresent(page)) {',
'          throw ProviderError.fatal(',
'            "CAPTCHA_DETECTED",',
'            PROVIDER_ID,',
'            `CAPTCHA detected during discovery of query: "${query.rawText}"`,',
'          );',
'        }',
'',
'        // Collect all cards currently visible',
'        const cards = await this.adapter.getResultCards(page);',
'        const cardCount = cards.length;',
'',
'        if (cardCount === lastCardCount) {',
'          // No new cards loaded since last scroll',
'          if (await this.browser.isEndOfResults(page)) break;',
'          emptyScrolls++;',
'          if (emptyScrolls >= MAX_EMPTY_SCROLL_ATTEMPTS) break;',
'          // Scroll to load more',
'          await this.browser.scrollResultsSidebar(page);',
'          await humanDelay(SCROLL_SETTLE_MIN_MS, SCROLL_SETTLE_MAX_MS);',
'          continue;',
'        }',
'',
'        emptyScrolls = 0;',
'        const processFromIndex = lastCardCount;',
'        lastCardCount = cardCount;',
'',
'        for (let i = processFromIndex; i < cards.length && totalYielded < maxResults; i++) {',
'          const card = cards[i];',
'          if (card === undefined) continue;',
'',
'          // Apply inter-request delay',
'          if (i > 0) {',
'            const delay =',
'              this.policy.rateLimit.minDelayBetweenRequestsMs +',
'              Math.floor(Math.random() * this.policy.rateLimit.jitterMs);',
'            await humanDelay(delay, delay + this.policy.rateLimit.jitterMs);',
'          }',
'',
'          // Extract raw payload — may navigate away from search results',
'          let payload: GoogleMapsRawPayload | undefined;',
'          try {',
'            payload = await this.adapter.extractFromCard(',
'              page,',
'              card,',
'              query.rawText,',
'              i + 1,',
'            );',
'          } catch {',
'            // Extraction failed — attempt restoration if URL changed, then skip card',
'          }',
'',
'          // Restore search results page if extractFromCard navigated away',
'          const currentUrl = page.url();',
'          if (currentUrl !== searchUrl) {',
'            let restored = false;',
'            try {',
'              await page.goto(searchUrl, { waitUntil: "domcontentloaded" });',
'              await page.waitForSelector(\'div[role="feed"]\', { timeout: 5000 });',
'              restored = true;',
'            } catch {',
'              // Restoration failed — abort this batch gracefully',
'              break;',
'            }',
'            if (restored) {',
'              // Re-scroll to restore feed depth before continuing',
'              await this._restoreFeedDepth(page, lastCardCount);',
'            }',
'          }',
'',
'          // Skip if extraction failed',
'          if (payload === undefined) continue;',
'',
'          // Derive a stable result ID — prefer Place ID, fall back to URL hash',
'          const resultId =',
'            payload.placeId ??',
'            this._syntheticId(payload.listingUrl ?? `position:${i}`);',
'',
'          // Skip duplicates within the same session',
'          if (seenPlaceIds.has(resultId)) continue;',
'          seenPlaceIds.add(resultId);',
'          totalYielded++;',
'',
'          const resumeToken = buildResumeToken(',
'            Array.from(seenPlaceIds),',
'            query.queryHash,',
'          );',
'',
'          const result: ProviderResult = {',
'            providerId: PROVIDER_ID,',
'            providerResultId: resultId,',
'            rawPayload: payload,',
'            sourceUrl: payload.listingUrl ?? null,',
'            collectedAt: new Date(),',
'            runId: query.runId,',
'            queryId: query.id,',
'            resumeToken,',
'          };',
'',
'          yield result;',
'        }',
'',
'        // After processing the current batch, scroll for more',
'        if (await this.browser.isEndOfResults(page)) break;',
'        await this.browser.scrollResultsSidebar(page);',
'        await humanDelay(SCROLL_SETTLE_MIN_MS, SCROLL_SETTLE_MAX_MS);',
'      }',
];

lines.splice(navResultLine, whileEnd - navResultLine + 1, ...newLoop);
console.log('replaced lines', navResultLine + 1, 'to', whileEnd + 1);

fs.writeFileSync(path, lines.join('\n'), 'utf8');
console.log('done, total lines:', lines.length);
