const fs = require('fs');
const f = 'tests/unit/providers/google-maps/GoogleMapsProvider.test.ts';
let c = fs.readFileSync(f, 'utf8');
// Remove the duplicate closing }); — the file ends with  });  });  });
// and should end with  });  });
c = c.replace('  });\n  });\n\n});', '  });\n\n});');
fs.writeFileSync(f, c);
console.log('last 5 lines:');
console.log(c.split('\n').slice(-6).join('\n'));
