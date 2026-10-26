"use strict";
const { createAssistedApp } = require("./app");
const env = process.env;
const url = env.NAVE_ASSISTED_SUPABASE_URL || "";
if (env.NODE_ENV !== "staging" || env.NAVE_ASSISTED_ENABLED !== "true" || !url || url === env.SUPABASE_URL || /mkeexsryqnaxsnshrfqn|ryghlrngennxfuoteofe/.test(url)) throw new Error("Use an explicitly enabled, isolated staging database. Existing NAVE/WIFLY projects are forbidden.");
const app = createAssistedApp({ url, publishableKey: env.NAVE_ASSISTED_PUBLISHABLE_KEY, serviceKey: env.NAVE_ASSISTED_SERVICE_KEY, origin: env.NAVE_ASSISTED_ORIGIN });
app.listen(Number(env.PORT || 4318), "0.0.0.0", () => console.log("NAVE assisted staging ready; no commercial rides or payments."));
