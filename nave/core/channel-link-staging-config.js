"use strict";

function resolveChannelLinkStagingConfig(env = process.env, existing = {}) {
  const config = {
    enabled: env.NODE_ENV === "staging" && env.NAVE_CHANNEL_LINK_STAGING_ENABLED === "true",
    url: env.NAVE_CHANNEL_LINK_STAGING_SUPABASE_URL || "",
    publishableKey: env.NAVE_CHANNEL_LINK_STAGING_PUBLISHABLE_KEY || "",
    serviceRoleKey: env.NAVE_CHANNEL_LINK_STAGING_SERVICE_ROLE_KEY || "",
    secret: env.NAVE_CHANNEL_LINK_STAGING_SECRET || "",
    metaPhoneNumberId: env.NAVE_CHANNEL_LINK_STAGING_META_PHONE_NUMBER_ID || "",
    metaAccessToken: env.NAVE_CHANNEL_LINK_STAGING_META_ACCESS_TOKEN || "",
    metaGraphVersion: env.NAVE_CHANNEL_LINK_STAGING_META_GRAPH_VERSION || "v26.0",
    metaTemplateName: env.NAVE_CHANNEL_LINK_STAGING_META_TEMPLATE_NAME || "",
    metaTemplateLanguage: env.NAVE_CHANNEL_LINK_STAGING_META_TEMPLATE_LANGUAGE || "pt_BR",
  };
  const ready = Boolean(
    config.enabled && config.url && config.publishableKey && config.serviceRoleKey &&
    Buffer.byteLength(config.secret) >= 32 && config.metaPhoneNumberId && config.metaAccessToken &&
    /^v[0-9]+\.[0-9]+$/.test(config.metaGraphVersion) &&
    /^[a-z0-9_]{1,512}$/.test(config.metaTemplateName) &&
    /^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(config.metaTemplateLanguage) &&
    config.url !== (existing.supabaseUrl || "") &&
    config.publishableKey !== (existing.publishableKey || "") &&
    config.serviceRoleKey !== (existing.serviceRoleKey || "") &&
    config.metaPhoneNumberId !== (existing.phoneNumberId || "") &&
    config.metaAccessToken !== (existing.accessToken || "")
  );
  return Object.freeze({ ...config, ready });
}

module.exports = { resolveChannelLinkStagingConfig };
