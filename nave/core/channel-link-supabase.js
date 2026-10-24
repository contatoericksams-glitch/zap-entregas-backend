"use strict";

// Server-only adapter for the channel-link domain service. It must be created
// with the Supabase service-role client and must never be bundled into a client.
function createChannelLinkSupabaseAdapters({ supabase, deliverCode }) {
  if (!supabase || typeof supabase.from !== "function" || typeof supabase.rpc !== "function") {
    throw new TypeError("Supabase server client required");
  }
  if (typeof deliverCode !== "function") throw new TypeError("WhatsApp delivery adapter required");

  async function rpc(name, args) {
    const { data, error } = await supabase.rpc(name, args);
    if (error) throw new Error(`Supabase ${name} failed: ${error.message || "request failed"}`);
    return data;
  }

  return Object.freeze({
    async findContactByPhone(phoneE164) {
      const { data, error } = await supabase
        .from("nave_wa_contacts")
        .select("id")
        .eq("phone_e164", phoneE164)
        .eq("is_driver", false)
        .maybeSingle();
      if (error) throw new Error(`Supabase contact lookup failed: ${error.message || "request failed"}`);
      return data;
    },

    async createChallenge({ challengeId, userId, contactId, codeDigest, expiresAt, maxAttempts }) {
      return rpc("nave_channel_link_create_challenge", {
        p_challenge_id: challengeId,
        p_user_id: userId,
        p_contact_id: contactId,
        p_code_digest: codeDigest,
        p_expires_at: expiresAt,
        p_max_attempts: maxAttempts,
      });
    },

    async deliverCode(message) {
      return deliverCode(message);
    },

    async invalidateChallenge({ challengeId, userId }) {
      return rpc("nave_channel_link_invalidate_challenge", {
        p_challenge_id: challengeId,
        p_user_id: userId,
      });
    },

    async confirmChallengeAtomic({ challengeId, userId, codeDigest, now }) {
      return rpc("nave_channel_link_confirm_challenge", {
        p_challenge_id: challengeId,
        p_user_id: userId,
        p_code_digest: codeDigest,
        p_now: now,
      });
    },
  });
}

module.exports = { createChannelLinkSupabaseAdapters };
