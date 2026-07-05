import { buildLexicon, RawLexiconEntry, Lexicon } from "./lexicon";
import { translateShrToEn } from "./shr-to-en";
import { translateEnToShr } from "./en-to-shr";
import type { ThirdPersonGender } from "./grammar";

export interface Env {
    LEXICON_CACHE: KVNamespace;
}

const LEXICON_KV_KEY = "lexicon";
const CACHE_TTL_SECONDS = 60 * 60;

const LEXICON_GITHUB_URL = "https://raw.githubusercontent.com/sdsa-stro/ShaewrakanLexicon/refs/heads/main/lexicon.json";

let MODULE_LEXICON_CACHE: Lexicon | null = null;
let MODULE_LEXICON_ETAG: string | null = null;

async function getLexicon(env: Env): Promise<Lexicon> {
    const kvMeta = await env.LEXICON_CACHE.getWithMetadata<{ storedAt: number }>(
        LEXICON_KV_KEY,
        { type: "text" }
    );

    const storedAt = kvMeta.metadata?.storedAt ?? 0;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const isFresh = nowSeconds - storedAt < CACHE_TTL_SECONDS;
    const etagKey = String(storedAt);

    if (MODULE_LEXICON_CACHE && MODULE_LEXICON_ETAG === etagKey && isFresh) {
        return MODULE_LEXICON_CACHE;
    }

    if (kvMeta.value && isFresh) {
        const raw: RawLexiconEntry[] = JSON.parse(kvMeta.value);
        MODULE_LEXICON_CACHE = buildLexicon(raw);
        MODULE_LEXICON_ETAG = etagKey;
        return MODULE_LEXICON_CACHE;
    }

    let freshJson: string;
    try {
        const response = await fetch(LEXICON_GITHUB_URL);
        if (!response.ok) {
            throw new Error(`GitHub returned ${response.status}`);
        }
        freshJson = await response.text();
    } catch (fetchErr) {
        if (kvMeta.value) {
            console.error("GitHub fetch failed, use stale KV data:", fetchErr);
            const raw: RawLexiconEntry[] = JSON.parse(kvMeta.value);
            MODULE_LEXICON_CACHE = buildLexicon(raw);
            MODULE_LEXICON_ETAG = etagKey;
            return MODULE_LEXICON_CACHE;
        }
        throw new Error("Could not load lexicon: GitHub unavailable and no cached data.");
    }

    const newStoredAt = nowSeconds;
    await env.LEXICON_CACHE.put(LEXICON_KV_KEY, freshJson, {
        expirationTtl: CACHE_TTL_SECONDS * 2,
        metadata: { storedAt: newStoredAt }
    });

    const raw: RawLexiconEntry[] = JSON.parse(freshJson);
    MODULE_LEXICON_CACHE = buildLexicon(raw);
    MODULE_LEXICON_ETAG = String(newStoredAt);
    return MODULE_LEXICON_CACHE;
}

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
};

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS }
    });
}

function errorResponse(message: string, status: number): Response {
    return jsonResponse({ error: message }, status);
}

const VALID_GENDERS = new Set<string>(["masc", "fem", "neutral", "nonliving"]);

async function parseJsonBody(
    request: Request
): Promise<Record<string, unknown> | null> {
    try {
        const text = await request.text();
        if (!text.trim()) return null;
        const parsed = JSON.parse(text);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
        return parsed as Record<string, unknown>;
    } catch {
        return null;
    }
}

async function handleShrToEn(request: Request, env: Env): Promise<Response> {
    const body = await parseJsonBody(request);
    if (!body) return errorResponse("Request body must be a JSON object", 400);

    const text = body["text"];
    if (typeof text !== "string" || !text.trim()) return errorResponse('"text" must be a non-empty string', 400);

    const lexicon = await getLexicon(env);
    const result = translateShrToEn(text.trim(), lexicon);

    return jsonResponse({
        shaewrakin: text.trim(),
        english: result.english,
        words: result.words,
        hasUnknownWords: result.hasUnknownWords,
        wasQuestion: result.wasQuestion
    });
}

async function handleEnToShr(request: Request, env: Env): Promise<Response> {
    const body = await parseJsonBody(request);
    if (!body) return errorResponse("Request body must be a JSON object", 400);

    const text = body["text"];
    if (typeof text !== "string" || !text.trim()) return errorResponse('"text" must be a non-empty string', 400);

    const formalRaw = body["formal"];
    const formal = formalRaw === true || formalRaw === "true";

    const genderRaw = body["gender"];
    let gender: ThirdPersonGender = "neutral";
    if (genderRaw !== undefined && genderRaw !== null) {
        if (typeof genderRaw !== "string" || !VALID_GENDERS.has(genderRaw)) {
            return errorResponse(
                `"gender" must be one of ${[...VALID_GENDERS].join(", ")}`,
                400
            );
        }
        gender = genderRaw as ThirdPersonGender;
    }
    const lexicon = await getLexicon(env);
    const result = translateEnToShr(text.trim(), lexicon, { formal, gender });

    return jsonResponse({
        english: text.trim(),
        shaewrakin: result.shaewrakin,
        words: result.words,
        hasUnresolvedWords: result.hasUnresolvedWords,
        wasQuestion: result.wasQuestion
    });
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        const method = request.method.toUpperCase();

        if (method === "OPTIONS") {
            return new Response(null, { status: 204, headers: CORS_HEADERS });
        }

        if (method !== "POST") {
            return errorResponse("Method not allowed", 405);
        }

        try {
            switch (url.pathname) {
                case "/v1/translate/shr-to-en":
                    return await handleShrToEn(request, env);
                    case "/v1/translate/en-to-shr":
                        return await handleEnToShr(request, env);
                case "/refresh-lexicon":
                    await env.LEXICON_CACHE.delete(LEXICON_KV_KEY);
                    MODULE_LEXICON_CACHE = null;
                    MODULE_LEXICON_ETAG = null;
                    return jsonResponse({ ok: true, message: "Lexicon cache cleared. Will refetch on next translation request." });
                default:
                    return errorResponse(
                        "Not found. Available endpoints: POST /shr-to-en, POST /en-to-shr",
                        404
                    );
            }
        } catch (err) {
            console.error("Unhandled Worker error:", err);
            return errorResponse(
                err instanceof Error ? err.message : "Internal server error",
                500
            );
        }
    }
} satisfies ExportedHandler<Env>;