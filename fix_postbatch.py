with open('src/providers/google-maps/GoogleMapsProvider.ts', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    'log.debug("[post-batch] totalYielded=${totalYielded} lastCardCount=${lastCardCount} cards.length=${cards.length}");',
    'log.debug(`[post-batch] totalYielded=${totalYielded} lastCardCount=${lastCardCount} cards.length=${cards.length}`);'
)
content = content.replace(
    'log.debug("[post-batch] isEndOfResults=$_eorPostBatch");',
    'log.debug(`[post-batch] isEndOfResults=${_eorPostBatch}`);'
)
content = content.replace(
    'if (_eorPostBatch) { log.debug("[post-batch] BREAK terminating loop"); break; }',
    'if (_eorPostBatch) { log.debug(`[post-batch] BREAK terminating loop`); break; }'
)

with open('src/providers/google-maps/GoogleMapsProvider.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done')
