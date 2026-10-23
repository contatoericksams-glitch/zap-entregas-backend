"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { resolveChannelLinkStagingConfig } = require("./channel-link-staging-config");

const isolatedEnv = () => ({
  NODE_ENV: "staging",
  NAVE_CHANNEL_LINK_STAGING_ENABLED: "true",
  NAVE_CHANNEL_LINK_STAGING_SUPABASE_URL: "https://nave-staging.example",
  NAVE_CHANNEL_LINK_STAGING_PUBLISHABLE_KEY: "staging-publishable",
  NAVE_CHANNEL_LINK_STAGING_SERVICE_ROLE_KEY: "staging-service-role",
  NAVE_CHANNEL_LINK_STAGING_SECRET: "test-only-secret-with-at-least-32-bytes",
  NAVE_CHANNEL_LINK_STAGING_META_PHONE_NUMBER_ID: "staging-phone-id",
  NAVE_CHANNEL_LINK_STAGING_META_ACCESS_TOKEN: "staging-meta-token",
  NAVE_CHANNEL_LINK_STAGING_META_TEMPLATE_NAME: "nave_auth_code",
  NAVE_CHANNEL_LINK_STAGING_META_TEMPLATE_LANGUAGE: "pt_BR",
});

const existing = {
  supabaseUrl: "https://nave-main.example",
  publishableKey: "main-publishable",
  serviceRoleKey: "main-service-role",
  phoneNumberId: "main-phone-id",
  accessToken: "main-meta-token",
};

test("staging channel link stays closed when env flag or staging config is absent", () => {
  assert.equal(resolveChannelLinkStagingConfig({}, existing).ready, false);
  const env = isolatedEnv();
  env.NAVE_CHANNEL_LINK_STAGING_ENABLED = "false";
  assert.equal(resolveChannelLinkStagingConfig(env, existing).ready, false);
});

test("staging channel link opens only with complete credentials isolated from the main service", () => {
  const config = resolveChannelLinkStagingConfig(isolatedEnv(), existing);
  assert.equal(config.ready, true);
  assert.equal(Object.isFrozen(config), true);
});

test("production mode cannot enable the staging link even with the explicit flag", () => {
  const env = isolatedEnv();
  env.NODE_ENV = "production";
  assert.equal(resolveChannelLinkStagingConfig(env, existing).ready, false);
});

test("main Supabase URL, Meta sender, or Meta token cannot be reused", () => {
  for (const [name, value] of [
    ["NAVE_CHANNEL_LINK_STAGING_SUPABASE_URL", existing.supabaseUrl],
    ["NAVE_CHANNEL_LINK_STAGING_PUBLISHABLE_KEY", existing.publishableKey],
    ["NAVE_CHANNEL_LINK_STAGING_SERVICE_ROLE_KEY", existing.serviceRoleKey],
    ["NAVE_CHANNEL_LINK_STAGING_META_PHONE_NUMBER_ID", existing.phoneNumberId],
    ["NAVE_CHANNEL_LINK_STAGING_META_ACCESS_TOKEN", existing.accessToken],
  ]) {
    const env = isolatedEnv();
    env[name] = value;
    assert.equal(resolveChannelLinkStagingConfig(env, existing).ready, false, name);
  }
});

test("short HMAC secret, unsupported graph version, or missing approved template keep the route closed", () => {
  const shortSecret = isolatedEnv();
  shortSecret.NAVE_CHANNEL_LINK_STAGING_SECRET = "too-short";
  assert.equal(resolveChannelLinkStagingConfig(shortSecret, existing).ready, false);
  const graphVersion = isolatedEnv();
  graphVersion.NAVE_CHANNEL_LINK_STAGING_META_GRAPH_VERSION = "latest";
  assert.equal(resolveChannelLinkStagingConfig(graphVersion, existing).ready, false);
  const noTemplate = isolatedEnv();
  delete noTemplate.NAVE_CHANNEL_LINK_STAGING_META_TEMPLATE_NAME;
  assert.equal(resolveChannelLinkStagingConfig(noTemplate, existing).ready, false);
});
